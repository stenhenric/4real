import type { RoomState } from './game-room.service.ts';

interface CachedRoom {
  state: RoomState;
  lastTouchedAt: number;
}

interface GameRoomRegistryOptions {
  waitingRoomTtlMs: number;
  activeRoomTtlMs: number;
  completedRoomTtlMs: number;
  cleanupIntervalMs: number;
}

export class GameRoomRegistry {
  private readonly rooms = new Map<string, CachedRoom>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private cleanupHandle: NodeJS.Timeout | null = null;

  constructor(private readonly options: GameRoomRegistryOptions) {}

  start(): void {
    if (this.cleanupHandle) {
      return;
    }

    this.cleanupHandle = setInterval(() => {
      this.cleanupInactiveRooms();
    }, this.options.cleanupIntervalMs);
    this.cleanupHandle.unref?.();
  }

  stop(): void {
    if (!this.cleanupHandle) {
      return;
    }

    clearInterval(this.cleanupHandle);
    this.cleanupHandle = null;
  }

  get(roomId: string): RoomState | null {
    const cached = this.rooms.get(roomId);
    if (!cached) {
      return null;
    }

    return cached.state;
  }

  set(roomId: string, state: RoomState): RoomState {
    this.rooms.set(roomId, { state, lastTouchedAt: Date.now() });
    return state;
  }

  touch(roomId: string): void {
    const cached = this.rooms.get(roomId);
    if (!cached) {
      return;
    }

    cached.lastTouchedAt = Date.now();
  }

  delete(roomId: string): void {
    this.rooms.delete(roomId);
    this.queues.delete(roomId);
  }

  detachSocket(socketId: string): void {
    for (const [roomId, cached] of this.rooms.entries()) {
      let changed = false;

      for (const player of cached.state.players) {
        if (player.socketId === socketId) {
          player.socketId = null;
          changed = true;
        }
      }

      if (changed) {
        this.touch(roomId);
      }
    }
  }

  async runExclusive<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(roomId) ?? Promise.resolve();
    const nextTask = previous.catch(() => undefined).then(task);
    const queueTail = nextTask.finally(() => {
      if (this.queues.get(roomId) === queueTail) {
        this.queues.delete(roomId);
      }
    });

    this.queues.set(roomId, queueTail);
    return nextTask;
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
        this.delete(roomId);
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
}
