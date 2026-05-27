# TON Streaming + Fee Instrumentation Upgrade Report

## Files Changed

- `server/services/ton-streaming.service.ts`
- `server/services/background-jobs.service.ts`
- `server/services/deposit-tonconnect.service.ts`
- `server/services/withdrawal-engine.ts`
- `server/config/env.ts`
- `.env.example`
- `tests/unit/server/services/ton-streaming.service.test.ts`
- `tests/unit/server/config/env.test.ts`
- `package.json`

## Current Polling Behavior Found

- Deposits were polled every 15 seconds through `pollDeposits()` in `server/workers/deposit-poller.ts`, scheduled by `server/services/background-jobs.service.ts`.
- Withdrawal confirmations were polled every 20 seconds through `confirmSentWithdrawals()` in `server/workers/withdrawal-worker.ts`, also scheduled by `background-jobs.service.ts`.
- Deposit crediting already runs through `ingestIncomingTransfer()`, which verifies Jetton master, aborted state, memo state, duplicate processed hashes, and then credits through `UserBalanceRepository.creditDeposit()`.
- Withdrawal completion already runs through `findWithdrawalTransferOnChain()` plus `WithdrawalRepository.markConfirmed()`, `ProcessedTransactionRepository.create(type='withdrawal_confirm')`, and `UserBalanceRepository.recordWithdrawalConfirmed()`.

## New Streaming Architecture

- Added `TonStreamingClient`, a WebSocket Streaming API v2 client.
- Added `createTonFinalityWatcher()`, which subscribes to the hot wallet and hot Jetton wallet for:
  - `transactions`
  - `actions`
  - `trace_invalidated`
  - `jettons_change`
- Streaming is feature-flagged with `TON_STREAMING_ENABLED=false` by default.
- When enabled, stream `finalized` events trigger the existing deposit and withdrawal reconciliation paths immediately.
- `pending` and `confirmed` events are logged and instrumented only; they do not settle money.

## Fallback / Recovery Behavior

- API v3 polling remains enabled by default with `TON_API_V3_FALLBACK_ENABLED=true`.
- With streaming disabled, existing polling intervals remain unchanged: deposits 15s, withdrawal confirmations 20s.
- With streaming enabled, fallback polling uses `TON_STREAMING_FALLBACK_POLL_AFTER_MS` to reduce unnecessary load while keeping recovery active.
- `trace_invalidated` triggers API v3 fallback reconciliation.
- Non-finalized events schedule fallback reconciliation after the configured timeout.

## Deposit Status Flow

- `pending`: log and collect fee telemetry only.
- `confirmed`: log and collect fee telemetry only.
- `finalized`: run `pollDeposits()`, which uses the existing API v3 transfer lookup and `ingestIncomingTransfer()` validation before crediting.
- `trace_invalidated`: do not credit; run fallback reconciliation.

## Withdrawal Status Flow

- Broadcast and `sent` status still come from the existing withdrawal worker.
- `pending`: log and collect fee telemetry only.
- `confirmed`: log and collect fee telemetry only.
- `finalized`: run `confirmSentWithdrawals()`, which verifies withdrawal id comment, amount, recipient, and Jetton transfer before completing.
- `trace_invalidated`: mark no completion from stream; run fallback reconciliation.

## Finality Handling Rules

- Only `finalized` can trigger settled-money reconciliation.
- Duplicate finalized stream events are suppressed by a stream event key.
- Unknown Jetton assets in action events are ignored.
- Stream payloads do not directly mutate balances; they trigger the existing verified reconciliation engine.

## Fee Constants Found

- `0.05 TON` in `deposit-tonconnect.service.ts` as the TonConnect message attached amount.
- `0.000000001 TON` in `deposit-tonconnect.service.ts` as the Jetton forward amount.
- `0.05 TON` in `withdrawal-engine.ts` as the Jetton transfer forward amount.
- `0.07 TON` in `withdrawal-engine.ts` as the hot-wallet internal send attached amount.

## Configurable Fee / Buffer Values

- `TON_JETTON_TRANSFER_ATTACHED_AMOUNT=0.05`
- `TON_JETTON_FORWARD_AMOUNT=0.000000001`
- `TON_JETTON_EXCESS_BUFFER=0.07`
- `TON_MIN_TREASURY_GAS_BUFFER=1`
- `TON_WITHDRAW_FEE_MODE=platform_pays`
- `TON_WITHDRAWAL_SERVICE_FEE=0`

These defaults preserve existing behavior.

## Why Buffers Were Not Reduced

TON reports roughly `$0.0005` average transaction fee and `0.6s` finality, but the project constants are attached execution/forwarding buffers for Jetton transfer traces. They are not equivalent to final burned transaction fees. Some TON may be refunded through excess handling depending on the Jetton wallet flow. The change records observed fee telemetry first so buffers can be lowered later using real trace data.

## Fee Instrumentation

- `collectTonFeeTelemetry()` separates:
  - attached amount
  - forward amount
  - excess buffer
  - actual total fee
  - compute fee
  - action fee
  - forward fee
  - import fee
- Fee telemetry is emitted through structured logs as `ton_fee.telemetry`.
- No DB schema migration was added because the current repository does not have a dedicated fee-observation collection. This avoids risky financial schema churn in the same rollout.

## Tests Added

- Streaming WebSocket subscription payload.
- Stream notification dispatch and control-message ignoring.
- No settlement on `pending`.
- No settlement on `confirmed`.
- Exactly-once reconciliation on duplicate `finalized`.
- `trace_invalidated` fallback handling.
- Unknown Jetton asset ignoring.
- Fee telemetry keeps attached buffer separate from actual fees.
- Env default and override coverage for streaming and fee buffer config.

## Risks Remaining

- Production WebSocket authentication now uses the TON Center `api_key` query style; still verify it against the selected provider plan during testnet rollout.
- Stream action payload shape may vary by provider; the implementation intentionally falls back to API v3 verification for financial correctness.
- Fee telemetry is logged, not persisted in a queryable DB collection.
- Streaming startup is behind a disabled default flag and should be rolled out on testnet first.

## Manual Test Checklist

- [ ] Start app with `TON_STREAMING_ENABLED=false`; verify old fallback polling still works.
- [ ] Start app with `TON_STREAMING_ENABLED=true`; verify streaming subscription connects.
- [ ] Submit testnet Jetton deposit.
- [ ] Confirm status progresses through stream events.
- [ ] Verify balance is credited only after `finalized`.
- [ ] Submit testnet withdrawal.
- [ ] Verify withdrawal is marked completed only after `finalized`.
- [ ] Simulate stream disconnect.
- [ ] Verify API v3 fallback resolves pending records.
- [ ] Simulate duplicate finalized event.
- [x] Verify no duplicate credit/completion occurs in unit tests.
- [x] Simulate `trace_invalidated`.
- [x] Verify recovery polling callback runs.
- [x] Verify fee logs separate attached TON from actual burned fees in unit tests.
- [x] Verify env config values override defaults in unit tests.

## Production Rollout Checklist

1. Deploy with `TON_STREAMING_ENABLED=false`.
2. Confirm fallback polling still works.
3. Enable streaming on testnet.
4. Run deposit and withdrawal testnet traces.
5. Compare streamed finality against API v3 results.
6. Enable streaming in production with `TON_API_V3_FALLBACK_ENABLED=true`.
7. Monitor duplicate stream events, missed events, finality latency, and actual fees.
8. Only after enough trace data, lower Jetton attached buffer values if safe.

## TON Docs Used

- https://docs.ton.org/overview/subsecond
- https://docs.ton.org/applications/api/toncenter/streaming
- https://docs.ton.org/applications/api/toncenter/streaming/overview
- https://docs.ton.org/applications/api/toncenter/streaming/reference
- https://docs.ton.org/applications/api/toncenter/streaming/sse
- https://docs.ton.org/applications/api/toncenter/streaming/wss
- https://ton.org
