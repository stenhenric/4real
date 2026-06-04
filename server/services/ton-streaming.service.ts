import { getEnv } from '../config/env.ts';
import { USDT_MASTER, addressesEqual } from '../lib/jetton.ts';
import { logger } from '../utils/logger.ts';

export type TonStreamingFinality = 'pending' | 'confirmed' | 'finalized';
export type TonStreamingEventType =
  | 'transactions'
  | 'actions'
  | 'trace'
  | 'account_state_change'
  | 'jettons_change'
  | 'trace_invalidated';

export interface TonStreamingEvent {
  type: TonStreamingEventType;
  finality?: TonStreamingFinality;
  trace_external_hash_norm?: string;
  transactions?: unknown[] | Record<string, unknown>;
  actions?: unknown[];
  account?: string;
  jetton?: {
    address?: string;
    owner?: string;
    jetton?: string;
    last_transaction_lt?: string;
  };
  [key: string]: unknown;
}

interface TonStreamingSubscription {
  addresses: string[];
  types: TonStreamingEventType[];
  traceExternalHashNorms?: string[];
  actionTypes?: string[];
}

interface WebSocketCloseEventLike {
  code?: number;
  reason?: string;
  wasClean?: boolean;
}

type WebSocketLike = {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event?: WebSocketCloseEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send: (payload: string) => void;
  close: () => void;
};

type WebSocketCtor = new (url: string, protocols?: string[]) => WebSocketLike;

export interface TonStreamingClientOptions {
  endpoint: string;
  apiKey?: string;
  minFinality: TonStreamingFinality;
  reconnectMinMs: number;
  reconnectMaxMs: number;
  WebSocketCtor?: WebSocketCtor;
}

export interface TonStreamingClientLike {
  onEvent: (handler: (event: TonStreamingEvent) => void | Promise<void>) => void;
  subscribe: (subscription: TonStreamingSubscription) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

const OPEN_READY_STATE = 1;
const STREAMING_PING_INTERVAL_MS = 15_000;

export class TonStreamingClient implements TonStreamingClientLike {
  private readonly options: TonStreamingClientOptions;
  private socket: WebSocketLike | null = null;
  private stopped = true;
  private reconnectDelayMs: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private subscription: TonStreamingSubscription | null = null;
  private subscriptionCounter = 0;
  private reconnectAttempts = 0;
  private eventHandlers: Array<(event: TonStreamingEvent) => void | Promise<void>> = [];

  constructor(options: TonStreamingClientOptions) {
    this.options = options;
    this.reconnectDelayMs = options.reconnectMinMs;
  }

  onEvent(handler: (event: TonStreamingEvent) => void | Promise<void>): void {
    this.eventHandlers.push(handler);
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  subscribe(subscription: TonStreamingSubscription): void {
    this.subscription = subscription;
    this.sendSubscriptionIfReady();
  }

  private connect(): void {
    const Ctor = this.options.WebSocketCtor ?? (globalThis as unknown as { WebSocket?: WebSocketCtor }).WebSocket;
    if (!Ctor) {
      throw new Error('WebSocket is not available in this runtime');
    }

    const socket = new Ctor(this.getAuthenticatedEndpoint());
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectDelayMs = this.options.reconnectMinMs;
      this.reconnectAttempts = 0;
      this.startPing();
      this.sendSubscriptionIfReady();
      logger.info('ton_streaming.connected', {
        endpoint: this.options.endpoint,
        subscriptionContext: this.subscription,
      });
    };
    socket.onmessage = (message) => {
      this.handleMessage(message.data);
    };
    socket.onerror = (event) => {
      logger.warn('ton_streaming.error', {
        event: String(event),
        endpoint: this.options.endpoint,
        reconnectAttempts: this.reconnectAttempts,
      });
    };
    socket.onclose = (event) => {
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      logger.warn('ton_streaming.close', {
        code: event?.code,
        reason: event?.reason,
        wasClean: event?.wasClean,
        reconnectAttempts: this.reconnectAttempts,
        endpoint: this.options.endpoint,
        subscriptionContext: this.subscription,
      });
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    };
  }

  private getAuthenticatedEndpoint(): string {
    if (!this.options.apiKey) {
      return this.options.endpoint;
    }

    const endpoint = new URL(this.options.endpoint);
    if (!endpoint.searchParams.has('api_key')) {
      endpoint.searchParams.set('api_key', this.options.apiKey);
    }
    return endpoint.toString();
  }

  private startPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === OPEN_READY_STATE) {
        this.socket.send(JSON.stringify({ operation: 'ping', id: `ping-${Date.now()}` }));
      }
    }, STREAMING_PING_INTERVAL_MS);
    this.pingTimer.unref?.();
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    const delayMs = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.options.reconnectMaxMs, this.reconnectDelayMs * 2);
    logger.warn('ton_streaming.reconnect_scheduled', {
      delayMs,
      reconnectAttempts: this.reconnectAttempts,
      endpoint: this.options.endpoint,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
    this.reconnectTimer.unref?.();
  }

  private sendSubscriptionIfReady(): void {
    if (!this.subscription || this.socket?.readyState !== OPEN_READY_STATE) {
      return;
    }

    this.subscriptionCounter += 1;
    this.socket.send(JSON.stringify({
      operation: 'subscribe',
      types: this.subscription.types,
      addresses: this.subscription.addresses,
      ...(this.subscription.traceExternalHashNorms ? {
        trace_external_hash_norms: this.subscription.traceExternalHashNorms,
      } : {}),
      min_finality: this.options.minFinality,
      include_address_book: true,
      include_metadata: true,
      ...(this.subscription.actionTypes ? { action_types: this.subscription.actionTypes } : {}),
      id: `subscribe-${this.subscriptionCounter}`,
    }));
  }

  private handleMessage(payload: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch (error) {
      logger.warn('ton_streaming.invalid_json', {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (!isTonStreamingEvent(parsed)) {
      return;
    }

    for (const handler of this.eventHandlers) {
      void Promise.resolve(handler(parsed)).catch((error) => {
        logger.warn('ton_streaming.handler_failed', {
          type: parsed.type,
          finality: parsed.finality,
          traceExternalHashNorm: parsed.trace_external_hash_norm,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }
}

export interface TonFeeTelemetry {
  flow: 'deposit' | 'withdrawal' | 'unknown';
  finality?: TonStreamingFinality;
  traceExternalHashNorm?: string;
  attachedAmountNano?: string;
  forwardAmountNano?: string;
  excessBufferNano?: string;
  actualFeeNano: string;
  computeFeeNano: string;
  actionFeeNano: string;
  forwardFeeNano: string;
  importFeeNano: string;
}

export function collectTonFeeTelemetry({
  flow,
  event,
  attachedAmountNano,
  forwardAmountNano,
  excessBufferNano,
}: {
  flow: TonFeeTelemetry['flow'];
  event: TonStreamingEvent;
  attachedAmountNano?: string;
  forwardAmountNano?: string;
  excessBufferNano?: string;
}): TonFeeTelemetry {
  const transactions = normalizeTransactions(event.transactions);
  let actualFeeNano = 0n;
  let computeFeeNano = 0n;
  let actionFeeNano = 0n;
  let forwardFeeNano = 0n;
  let importFeeNano = 0n;

  for (const transaction of transactions) {
    const transactionTotalFee = readOptionalBigInt(transaction, ['total_fees', 'total_fee', 'fee']);
    const description = readObject(transaction.description) ?? {};
    const compute = readObject(description.compute_ph) ?? readObject(description.computePhase);
    const action = readObject(description.action) ?? readObject(description.action_phase);
    const descriptionTotalFee = readOptionalBigInt(description, ['total_fees', 'total_fee']);
    actualFeeNano += transactionTotalFee ?? descriptionTotalFee ?? 0n;
    computeFeeNano += readBigInt(compute, ['gas_fees', 'gas_fee', 'compute_fee']);
    actionFeeNano += readBigInt(action, ['total_action_fees', 'action_fee']);
    forwardFeeNano += readBigInt(action, ['total_fwd_fees', 'fwd_fee', 'forward_fee']);
    const inMsg = readObject(transaction.in_msg) ?? readObject(transaction.inMessage);
    importFeeNano += readBigInt(inMsg, ['import_fee']);
    forwardFeeNano += readBigInt(inMsg, ['fwd_fee', 'forward_fee']);
    const outMsgs = Array.isArray(transaction.out_msgs) ? transaction.out_msgs : [];
    for (const outMsg of outMsgs) {
      forwardFeeNano += readBigInt(readObject(outMsg), ['fwd_fee', 'forward_fee']);
    }
  }

  return {
    flow,
    ...(event.finality !== undefined ? { finality: event.finality } : {}),
    ...(event.trace_external_hash_norm !== undefined ? { traceExternalHashNorm: event.trace_external_hash_norm } : {}),
    ...(attachedAmountNano !== undefined ? { attachedAmountNano } : {}),
    ...(forwardAmountNano !== undefined ? { forwardAmountNano } : {}),
    ...(excessBufferNano !== undefined ? { excessBufferNano } : {}),
    actualFeeNano: actualFeeNano.toString(),
    computeFeeNano: computeFeeNano.toString(),
    actionFeeNano: actionFeeNano.toString(),
    forwardFeeNano: forwardFeeNano.toString(),
    importFeeNano: importFeeNano.toString(),
  };
}

export interface TonFinalityWatcher {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  handleEvent: (event: TonStreamingEvent) => Promise<void>;
  isFallbackActive: () => boolean;
}

export function createTonFinalityWatcher({
  addresses,
  client,
  fallbackEnabled,
  finalityTimeoutMs,
  expectedJettonMaster = USDT_MASTER,
  onDepositReconcile,
  onWithdrawalReconcile,
  onFallbackReconcile,
  onFeeTelemetry,
}: {
  addresses: string[];
  client: TonStreamingClientLike;
  fallbackEnabled: boolean;
  finalityTimeoutMs: number;
  expectedJettonMaster?: string;
  onDepositReconcile: (reason: string, event: TonStreamingEvent) => Promise<void>;
  onWithdrawalReconcile: (reason: string, event: TonStreamingEvent) => Promise<void>;
  onFallbackReconcile: (reason: string, event: TonStreamingEvent) => Promise<void>;
  onFeeTelemetry: (telemetry: TonFeeTelemetry) => void;
}): TonFinalityWatcher {
  const handledFinalized = new Set<string>();
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const handleEvent = async (event: TonStreamingEvent): Promise<void> => {
    const receivedAt = Date.now();
    if (!isRelevantAssetEvent(event, expectedJettonMaster)) {
      logger.info('ton_streaming.event_ignored', {
        type: event.type,
        finality: event.finality,
        traceExternalHashNorm: event.trace_external_hash_norm,
        reason: 'unexpected_jetton_master',
      });
      return;
    }

    const eventKey = streamingEventKey(event);
    if (event.finality === 'finalized' && handledFinalized.has(eventKey)) {
      return;
    }

    if (event.type !== 'trace_invalidated') {
      onFeeTelemetry(collectTonFeeTelemetry({
        flow: 'unknown',
        event,
      }));
    }

    logger.info('ton_streaming.finality_event', {
      type: event.type,
      finality: event.finality,
      traceExternalHashNorm: event.trace_external_hash_norm,
      latencyMs: eventTimestampMs(event) === null ? null : receivedAt - eventTimestampMs(event)!,
    });

    if (event.type === 'trace_invalidated') {
      if (fallbackEnabled) {
        await onFallbackReconcile('trace_invalidated', event);
      }
      return;
    }

    if (event.finality !== 'finalized') {
      scheduleFallback(event);
      return;
    }

    handledFinalized.add(eventKey);

    await onDepositReconcile('stream_finalized', event);
    await onWithdrawalReconcile('stream_finalized', event);
  };

  client.onEvent(handleEvent);

  return {
    start: async () => {
      await client.start();
      client.subscribe({
        addresses,
        types: ['transactions', 'actions', 'trace_invalidated', 'jettons_change'],
        actionTypes: ['jetton_transfer', 'ton_transfer'],
      });
    },
    stop: async () => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      await client.stop();
    },
    handleEvent,
    isFallbackActive: () => fallbackTimer !== null,
  };

  function scheduleFallback(event: TonStreamingEvent): void {
    if (!fallbackEnabled || fallbackTimer) {
      return;
    }
    logger.info('ton_streaming.fallback_scheduled', {
      traceExternalHashNorm: event.trace_external_hash_norm,
      finalityTimeoutMs,
      fallbackActive: true,
    });
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      logger.warn('ton_streaming.fallback_triggered', {
        traceExternalHashNorm: event.trace_external_hash_norm,
      });
      void onFallbackReconcile('stream_finality_timeout', event);
    }, finalityTimeoutMs);
    fallbackTimer.unref?.();
  }
}

export function createConfiguredTonStreamingClient(): TonStreamingClient {
  const env = getEnv();
  const endpoint = env.NETWORK === 'testnet'
    ? env.TON_STREAMING_TESTNET_WS
    : env.TON_STREAMING_MAINNET_WS;

  const apiKey = env.TON_STREAMING_API_KEY || env.TONCENTER_API_KEY;
  return new TonStreamingClient({
    endpoint,
    ...(apiKey ? { apiKey } : {}),
    minFinality: env.TON_STREAMING_MIN_FINALITY,
    reconnectMinMs: env.TON_STREAMING_RECONNECT_MIN_MS,
    reconnectMaxMs: env.TON_STREAMING_RECONNECT_MAX_MS,
  });
}

function isTonStreamingEvent(value: unknown): value is TonStreamingEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  return type === 'transactions'
    || type === 'actions'
    || type === 'trace'
    || type === 'account_state_change'
    || type === 'jettons_change'
    || type === 'trace_invalidated';
}

function normalizeTransactions(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const objectEntry = readObject(entry);
      return objectEntry ? [objectEntry] : [];
    });
  }
  const objectValue = readObject(value);
  if (!objectValue) {
    return [];
  }
  return Object.values(objectValue).flatMap((entry) => {
    const objectEntry = readObject(entry);
    return objectEntry ? [objectEntry] : [];
  });
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function readBigInt(source: Record<string, unknown> | null, keys: string[]): bigint {
  return readOptionalBigInt(source, keys) ?? 0n;
}

function readOptionalBigInt(source: Record<string, unknown> | null, keys: string[]): bigint | null {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      return BigInt(value);
    }
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return BigInt(Math.trunc(value));
    }
    if (typeof value === 'bigint' && value >= 0n) {
      return value;
    }
  }

  return null;
}

function eventTimestampMs(event: TonStreamingEvent): number | null {
  const candidates = [
    event.trace_end_utime,
    event.end_utime,
    event.now,
    event.transaction_now,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate * 1000;
    }
  }
  return null;
}

function streamingEventKey(event: TonStreamingEvent): string {
  return [
    event.type,
    event.finality ?? 'none',
    event.trace_external_hash_norm ?? event.account ?? event.jetton?.last_transaction_lt ?? JSON.stringify(event).slice(0, 256),
  ].join(':');
}

function isRelevantAssetEvent(event: TonStreamingEvent, expectedJettonMaster: string): boolean {
  if (event.type === 'jettons_change' && event.jetton?.jetton) {
    return addressesEqualSafe(event.jetton.jetton, expectedJettonMaster);
  }

  if (event.type === 'actions' && Array.isArray(event.actions)) {
    const jettonMasters = event.actions.flatMap((rawAction) => {
      const action = readObject(rawAction);
      const value = action?.jetton_master ?? action?.jetton ?? readObject(action?.details)?.jetton_master;
      return typeof value === 'string' && value.length > 0 ? [value] : [];
    });

    return jettonMasters.length === 0 || jettonMasters.some((jettonMaster) => addressesEqualSafe(jettonMaster, expectedJettonMaster));
  }

  return true;
}

function addressesEqualSafe(left: string, right: string): boolean {
  try {
    return addressesEqual(left, right);
  } catch {
    return left === right;
  }
}
