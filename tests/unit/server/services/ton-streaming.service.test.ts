import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import {
  TonStreamingClient,
  createTonFinalityWatcher,
  collectTonFeeTelemetry,
  type TonStreamingEvent,
} from '../../../../server/services/ton-streaming.service.ts';
import { logger } from '../../../../server/utils/logger.ts';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;

  readonly sent: string[] = [];
  readonly url: string;
  readonly protocols?: string[];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(url: string, protocols?: string[]) {
    this.url = url;
    this.protocols = protocols;
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

test('TonStreamingClient connects and subscribes with the expected WebSocket payload', async () => {
  FakeWebSocket.instances = [];
  const client = new TonStreamingClient({
    endpoint: 'wss://testnet.toncenter.com/api/streaming/v2/ws',
    apiKey: 'stream-key',
    minFinality: 'pending',
    reconnectMinMs: 1_000,
    reconnectMaxMs: 30_000,
    WebSocketCtor: FakeWebSocket,
  });

  await client.start();
  const socket = FakeWebSocket.instances[0];
  assert.ok(socket);
  assert.equal(socket.url, 'wss://testnet.toncenter.com/api/streaming/v2/ws?api_key=stream-key');
  assert.equal(socket.protocols, undefined);

  client.subscribe({
    addresses: ['EQ-HOT-WALLET', 'EQ-HOT-JETTON'],
    types: ['transactions', 'actions', 'trace_invalidated', 'jettons_change'],
    actionTypes: ['jetton_transfer', 'ton_transfer'],
  });
  socket.readyState = FakeWebSocket.OPEN;
  socket.onopen?.();

  assert.equal(socket.sent.length, 1);
  assert.deepEqual(JSON.parse(socket.sent[0]), {
    operation: 'subscribe',
    types: ['transactions', 'actions', 'trace_invalidated', 'jettons_change'],
    addresses: ['EQ-HOT-WALLET', 'EQ-HOT-JETTON'],
    min_finality: 'pending',
    include_address_book: true,
    include_metadata: true,
    action_types: ['jetton_transfer', 'ton_transfer'],
    id: 'subscribe-1',
  });
});

test('TonStreamingClient dispatches stream notifications and ignores control responses', async () => {
  FakeWebSocket.instances = [];
  const events: TonStreamingEvent[] = [];
  const client = new TonStreamingClient({
    endpoint: 'wss://testnet.toncenter.com/api/streaming/v2/ws',
    minFinality: 'pending',
    reconnectMinMs: 1_000,
    reconnectMaxMs: 30_000,
    WebSocketCtor: FakeWebSocket,
  });
  client.onEvent((event) => {
    events.push(event);
  });

  await client.start();
  const socket = FakeWebSocket.instances[0];
  assert.ok(socket);

  socket.onmessage?.({ data: JSON.stringify({ id: 'subscribe-1', status: 'subscribed' }) });
  socket.onmessage?.({ data: JSON.stringify({ type: 'transactions', finality: 'pending', trace_external_hash_norm: 'trace-1' }) });
  socket.onmessage?.({ data: JSON.stringify({ type: 'trace_invalidated', trace_external_hash_norm: 'trace-1' }) });

  assert.deepEqual(events.map((event) => event.type), ['transactions', 'trace_invalidated']);
});

test('TonStreamingClient logs handler rejections instead of detaching them', async (t) => {
  FakeWebSocket.instances = [];
  const warnMock = mock.method(logger, 'warn', () => {});
  t.after(() => warnMock.mock.restore());

  const client = new TonStreamingClient({
    endpoint: 'wss://testnet.toncenter.com/api/streaming/v2/ws',
    minFinality: 'pending',
    reconnectMinMs: 1_000,
    reconnectMaxMs: 30_000,
    WebSocketCtor: FakeWebSocket,
  });
  client.onEvent(async () => {
    throw new Error('handler failed');
  });

  await client.start();
  const socket = FakeWebSocket.instances[0];
  assert.ok(socket);
  socket.onmessage?.({ data: JSON.stringify({ type: 'transactions', finality: 'pending', trace_external_hash_norm: 'trace-error' }) });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(warnMock.mock.callCount(), 1);
  assert.equal(warnMock.mock.calls[0].arguments[0], 'ton_streaming.handler_failed');
});

test('createTonFinalityWatcher never settles money on pending or confirmed events', async () => {
  const calls: string[] = [];
  const watcher = createTonFinalityWatcher({
    addresses: ['EQ-HOT-WALLET'],
    client: createManualClient(),
    fallbackEnabled: true,
    finalityTimeoutMs: 30_000,
    onDepositReconcile: async () => { calls.push('deposit'); },
    onWithdrawalReconcile: async () => { calls.push('withdrawal'); },
    onFallbackReconcile: async () => { calls.push('fallback'); },
    onFeeTelemetry: () => calls.push('fee'),
  });

  await watcher.start();
  await watcher.handleEvent({ type: 'transactions', finality: 'pending', trace_external_hash_norm: 'trace-1' });
  await watcher.handleEvent({ type: 'actions', finality: 'confirmed', trace_external_hash_norm: 'trace-1' });

  assert.deepEqual(calls, ['fee', 'fee']);
});

test('createTonFinalityWatcher uses the finality timeout for non-finalized fallback', async (t) => {
  let capturedDelayMs: number | undefined;
  const setTimeoutMock = mock.method(globalThis, 'setTimeout', ((callback: () => void, delayMs?: number) => {
    capturedDelayMs = delayMs;
    return { unref() {} };
  }) as any);
  t.after(() => setTimeoutMock.mock.restore());

  const watcher = createTonFinalityWatcher({
    addresses: ['EQ-HOT-WALLET'],
    client: createManualClient(),
    fallbackEnabled: true,
    finalityTimeoutMs: 120_000,
    onDepositReconcile: async () => {},
    onWithdrawalReconcile: async () => {},
    onFallbackReconcile: async () => {},
    onFeeTelemetry: () => {},
  });

  await watcher.start();
  await watcher.handleEvent({ type: 'transactions', finality: 'pending', trace_external_hash_norm: 'trace-timeout' });

  assert.equal(capturedDelayMs, 120_000);
});

test('createTonFinalityWatcher reconciles once on duplicate finalized events', async () => {
  const calls: string[] = [];
  const watcher = createTonFinalityWatcher({
    addresses: ['EQ-HOT-WALLET'],
    client: createManualClient(),
    fallbackEnabled: true,
    finalityTimeoutMs: 30_000,
    onDepositReconcile: async () => { calls.push('deposit'); },
    onWithdrawalReconcile: async () => { calls.push('withdrawal'); },
    onFallbackReconcile: async () => { calls.push('fallback'); },
    onFeeTelemetry: () => calls.push('fee'),
  });

  await watcher.start();
  const event: TonStreamingEvent = {
    type: 'transactions',
    finality: 'finalized',
    trace_external_hash_norm: 'trace-final',
    transactions: [{ hash: 'tx-1', total_fees: '1000' }],
  };
  await watcher.handleEvent(event);
  await watcher.handleEvent(event);

  assert.deepEqual(calls, ['fee', 'deposit', 'withdrawal']);
});

test('createTonFinalityWatcher routes invalidated traces to API v3 fallback recovery', async () => {
  const calls: string[] = [];
  const watcher = createTonFinalityWatcher({
    addresses: ['EQ-HOT-WALLET'],
    client: createManualClient(),
    fallbackEnabled: true,
    finalityTimeoutMs: 30_000,
    onDepositReconcile: async () => { calls.push('deposit'); },
    onWithdrawalReconcile: async () => { calls.push('withdrawal'); },
    onFallbackReconcile: async () => { calls.push('fallback'); },
    onFeeTelemetry: () => calls.push('fee'),
  });

  await watcher.start();
  await watcher.handleEvent({ type: 'trace_invalidated', trace_external_hash_norm: 'trace-invalid' });

  assert.deepEqual(calls, ['fallback']);
});

test('createTonFinalityWatcher ignores finalized events for an unknown jetton asset', async () => {
  const calls: string[] = [];
  const watcher = createTonFinalityWatcher({
    addresses: ['EQ-HOT-WALLET'],
    expectedJettonMaster: '0:USDT',
    client: createManualClient(),
    fallbackEnabled: true,
    finalityTimeoutMs: 30_000,
    onDepositReconcile: async () => { calls.push('deposit'); },
    onWithdrawalReconcile: async () => { calls.push('withdrawal'); },
    onFallbackReconcile: async () => { calls.push('fallback'); },
    onFeeTelemetry: () => calls.push('fee'),
  });

  await watcher.start();
  await watcher.handleEvent({
    type: 'actions',
    finality: 'finalized',
    trace_external_hash_norm: 'trace-wrong-asset',
    actions: [{ type: 'jetton_transfer', jetton_master: '0:BOGUS' }],
  });

  assert.deepEqual(calls, []);
});

test('collectTonFeeTelemetry keeps attached amounts separate from actual chain fees', () => {
  const telemetry = collectTonFeeTelemetry({
    flow: 'withdrawal',
    attachedAmountNano: '70000000',
    forwardAmountNano: '50000000',
    event: {
      type: 'transactions',
      finality: 'finalized',
      trace_external_hash_norm: 'trace-fee',
      transactions: [
        {
          total_fees: '1234',
          description: {
            compute_ph: { gas_fees: '300' },
            action: { total_action_fees: '200', total_fwd_fees: '500' },
          },
          in_msg: { fwd_fee: '20', import_fee: '10' },
        },
      ],
    },
  });

  assert.equal(telemetry.attachedAmountNano, '70000000');
  assert.equal(telemetry.forwardAmountNano, '50000000');
  assert.equal(telemetry.actualFeeNano, '1234');
  assert.equal(telemetry.computeFeeNano, '300');
  assert.equal(telemetry.actionFeeNano, '200');
  assert.equal(telemetry.forwardFeeNano, '520');
  assert.equal(telemetry.importFeeNano, '10');
});

test('collectTonFeeTelemetry does not double-count transaction and description total fee aliases', () => {
  const telemetry = collectTonFeeTelemetry({
    flow: 'deposit',
    event: {
      type: 'transactions',
      finality: 'finalized',
      trace_external_hash_norm: 'trace-fee-alias',
      transactions: [
        {
          total_fees: '1234',
          description: {
            total_fees: '1234',
          },
        },
      ],
    },
  });

  assert.equal(telemetry.actualFeeNano, '1234');
});

function createManualClient() {
  let handler: ((event: TonStreamingEvent) => void | Promise<void>) | null = null;
  return {
    onEvent(nextHandler: (event: TonStreamingEvent) => void | Promise<void>) {
      handler = nextHandler;
    },
    subscribe() {},
    async start() {},
    async stop() {},
    async emit(event: TonStreamingEvent) {
      await handler?.(event);
    },
  };
}
