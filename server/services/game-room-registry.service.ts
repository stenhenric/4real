import { randomUUID } from 'node:crypto';

import { getEnv } from '../config/env.ts';
import { getRedisClient } from './redis.service.ts';
import type { RoomState } from './game-room.service.ts';

interface CachedRoom {
  state: RoomState;
  lastTouchedAt: number;
}

interface SocketBinding {
  roomId: string;
  userId: string;
}

interface GameRoomRegistryOptions {
  waitingRoomTtlMs: number;
  activeRoomTtlMs: number;
  completedRoomTtlMs: number;
  cleanupIntervalMs: number;
}

const ROOM_LOCK_TTL_MS = 5_000;
const ROOM_LOCK_RETRY_DELAY_MS = 50;
const ROOM_LOCK_MAX_ATTEMPTS = 100;

function cloneRoomState(state: RoomState): RoomState {
  return structuredClone(state);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function unrefTimerIfSupported(handle: NodeJS.Timeout): void {
  handle.unref?.();
}

export class GameRoomRegistry {
  private readonly rooms = new Map<string, CachedRoom>();
  private readonly queues = new Map<string, Promise<void>>();
  private cleanupHandle: NodeJS.Timeout | null = null;
  private readonly options: GameRoomRegistryOptions;
  private readonly distributedMode: boolean;

  constructor(options: GameRoomRegistryOptions) {
    const env = getEnv();
    this.options = options;
    this.distributedMode = Boolean(env.FEATURE_REDIS_SOCKET_ADAPTER && env.REDIS_URL);
  }

  start(): void {
    if (this.distributedMode || this.cleanupHandle) {
      return;
    }

    this.cleanupHandle = setInterval(() => {
      this.cleanupInactiveRooms();
    }, this.options.cleanupIntervalMs);
    unrefTimerIfSupported(this.cleanupHandle);
  }

  stop(): void {
    if (!this.cleanupHandle) {
      return;
    }

    clearInterval(this.cleanupHandle);
    this.cleanupHandle = null;
  }

  async get(roomId: string): Promise<RoomState | null> {
    if (this.distributedMode) {
      const raw = await getRedisClient().get(this.getRoomStateKey(roomId));
      return raw ? JSON.parse(raw) as RoomState : null;
    }

    const cached = this.rooms.get(roomId);
    if (!cached) {
      return null;
    }

    return cloneRoomState(cached.state);
  }

  async set(roomId: string, state: RoomState): Promise<RoomState> {
    const nextState = cloneRoomState(state);
    if (this.distributedMode) {
      const ttlMs = this.getTtlForStatus(nextState.status);
      const redis = getRedisClient();
      const socketBindings = await this.readSocketBindings(nextState);
      const persistedState = {
        ...nextState,
        players: nextState.players.map((player) => ({
          ...player,
          socketId: socketBindings.get(player.userId) ?? player.socketId,
        })),
      } satisfies RoomState;

      await redis
        .multi()
        .set(this.getRoomStateKey(roomId), JSON.stringify(persistedState), 'PX', ttlMs)
        .pexpire(this.getRoomMembersKey(roomId), ttlMs)
        .exec();
      return cloneRoomState(persistedState);
    }

    this.rooms.set(roomId, { state: nextState, lastTouchedAt: Date.now() });
    return cloneRoomState(nextState);
  }

  async touch(roomId: string, status?: RoomState['status']): Promise<void> {
    if (this.distributedMode) {
      const ttlMs = this.getTtlForStatus(status ?? 'active');
      await getRedisClient()
        .multi()
        .pexpire(this.getRoomStateKey(roomId), ttlMs)
        .pexpire(this.getRoomMembersKey(roomId), ttlMs)
        .exec();
      return;
    }

    const cached = this.rooms.get(roomId);
    if (!cached) {
      return;
    }

    cached.lastTouchedAt = Date.now();
  }

  async delete(roomId: string): Promise<void> {
    if (this.distributedMode) {
      await getRedisClient().del(this.getRoomStateKey(roomId), this.getRoomMembersKey(roomId), this.getRoomLockKey(roomId));
      return;
    }

    this.rooms.delete(roomId);
    this.queues.delete(roomId);
  }

  async bindSocket(roomId: string, userId: string, socketId: string, status: RoomState['status']): Promise<void> {
    if (!this.distributedMode) {
      return;
    }

    const ttlMs = this.getTtlForStatus(status);
    const redis = getRedisClient();
    await redis
      .multi()
      .sadd(this.getRoomMembersKey(roomId), userId)
      .pexpire(this.getRoomMembersKey(roomId), ttlMs)
      .set(this.getSocketBindingKey(socketId), JSON.stringify({ roomId, userId } satisfies SocketBinding), 'PX', ttlMs)
      .exec();
  }

  async refreshSocketPresence(socketId: string): Promise<void> {
    if (!this.distributedMode) {
      return;
    }

    const binding = await this.getSocketBinding(socketId);
    if (!binding) {
      return;
    }

    const room = await this.get(binding.roomId);
    const ttlMs = this.getTtlForStatus(room?.status ?? 'active');
    await getRedisClient()
      .multi()
      .pexpire(this.getRoomStateKey(binding.roomId), ttlMs)
      .pexpire(this.getRoomMembersKey(binding.roomId), ttlMs)
      .pexpire(this.getSocketBindingKey(socketId), ttlMs)
      .exec();
  }

  async detachSocket(socketId: string): Promise<void> {
    if (this.distributedMode) {
      const binding = await this.getSocketBinding(socketId);
      if (!binding) {
        return;
      }

      await this.runExclusive(binding.roomId, async () => {
        const room = await this.get(binding.roomId);
        if (!room) {
          await getRedisClient().del(this.getSocketBindingKey(socketId));
          return;
        }

        const nextRoom = {
          ...room,
          players: room.players.map((player) => (
            player.socketId === socketId
              ? { ...player, socketId: null }
              : player
          )),
        } satisfies RoomState;

        await this.set(binding.roomId, nextRoom);
        await getRedisClient()
          .multi()
          .srem(this.getRoomMembersKey(binding.roomId), binding.userId)
          .del(this.getSocketBindingKey(socketId))
          .exec();
      });
      return;
    }

    for (const [roomId, cached] of this.rooms.entries()) {
      const nextRoom = {
        ...cached.state,
        players: cached.state.players.map((player) => (
          player.socketId === socketId
            ? { ...player, socketId: null }
            : player
        )),
      } satisfies RoomState;
      const changed = nextRoom.players.some((player, index) => player.socketId !== cached.state.players[index]?.socketId);
      if (!changed) {
        continue;
      }

      this.rooms.set(roomId, {
        state: nextRoom,
        lastTouchedAt: Date.now(),
      });
    }
  }

  async runExclusive<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    if (this.distributedMode) {
      return this.runDistributedExclusive(roomId, task);
    }

    const previous = this.queues.get(roomId) ?? Promise.resolve();
    const nextTask = previous.then(task);
    const queueTail = nextTask.then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      if (this.queues.get(roomId) === queueTail) {
        this.queues.delete(roomId);
      }
    });

    this.queues.set(roomId, queueTail);
    return nextTask;
  }

  private async runDistributedExclusive<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    const redis = getRedisClient();
    const lockKey = this.getRoomLockKey(roomId);
    const lockValue = `${process.pid}:${randomUUID()}`;

    for (let attempt = 0; attempt < ROOM_LOCK_MAX_ATTEMPTS; attempt += 1) {
      const acquired = await redis.set(lockKey, lockValue, 'PX', ROOM_LOCK_TTL_MS, 'NX');
      if (acquired === 'OK') {
        try {
          return await task();
        } finally {
          await redis.eval(
            'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
            1,
            lockKey,
            lockValue,
          );
        }
      }

      await sleep(ROOM_LOCK_RETRY_DELAY_MS);
    }

    throw new Error(`Timed out waiting for room lock ${roomId}`);
  }

  private async readSocketBindings(state: RoomState): Promise<Map<string, string | null>> {
    if (!this.distributedMode || state.players.length === 0) {
      return new Map();
    }

    const redis = getRedisClient();
    const bindings = new Map<string, string | null>();
    await Promise.all(state.players.map(async (player) => {
      const members = await redis.sismember(this.getRoomMembersKey(state.roomId), player.userId);
      bindings.set(player.userId, members === 1 ? player.socketId : null);
    }));
    return bindings;
  }

  private async getSocketBinding(socketId: string): Promise<SocketBinding | null> {
    const raw = await getRedisClient().get(this.getSocketBindingKey(socketId));
    return raw ? JSON.parse(raw) as SocketBinding : null;
  }

  private cleanupInactiveRooms(): void {
    const now = Date.now();

    for (const [roomId, cached] of this.rooms.entries()) {
      const hasConnectedPlayers = cached.state.players.some((player) => player.socketId !== null);
      if (hasConnectedPlayers) {
        continue;
      }

      const ageMs = now - cached.lastTouchedAt;
      const ttlMs = this.getTtlForStatus(cached.state.status);

      if (ageMs >= ttlMs) {
        this.rooms.delete(roomId);
        this.queues.delete(roomId);
      }
    }
  }

  private getTtlForStatus(status: RoomState['status']): number {
    if (status === 'waiting') {
      return this.options.waitingRoomTtlMs;
    }

    if (status === 'completed') {
      return this.options.completedRoomTtlMs;
    }

    return this.options.activeRoomTtlMs;
  }

  private getRoomStateKey(roomId: string): string {
    return `room-state:${roomId}`;
  }

  private getRoomMembersKey(roomId: string): string {
    return `room:${roomId}:members`;
  }

  private getSocketBindingKey(socketId: string): string {
    return `room-socket:${socketId}`;
  }

  private getRoomLockKey(roomId: string): string {
    return `room-lock:${roomId}`;
  }
}
