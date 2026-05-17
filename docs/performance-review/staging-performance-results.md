# Staging Performance Results

Measured on 2026-05-16 against `https://www.fourreal.xyz` and MongoDB database `4real`.

## Measurement Limits

- Render log access was not available locally: no Render CLI/API token was present. Route timings below are end-to-end HTTP timings from this workstation, not Render log p50/p95.
- MongoDB and Redis were measured over WAN from this workstation, so network latency is included.
- A temporary verified admin session was created directly in the test database/Redis for authenticated route profiling, then the session was deleted. Application auth, MFA, session, admin, Turnstile, TON, and money-flow code was not weakened.
- Headless Chromium did not transition background pages to `document.visibilityState === "hidden"`, so hidden-tab merchant polling could not be conclusively verified.

## MongoDB Explain Results

Initial staging state before DB index creation:

- `orders` lacked `createdAt_-1`, `type_1_createdAt_-1`, and `status_1_type_1_createdAt_-1`.
- `transactions` lacked `createdAt_-1__id_-1`.
- `withdrawals` lacked `status_1_startedAt_1`.
- `failed_deposit_ingestions` lacked the new equality-first indexes.
- Existing data was small: 2 orders, 6 transactions, 0 withdrawals, 0 failed deposit ingestion rows.

Because this is a test database, the expected indexes were created, then explains were rerun.

| Query | Winning index after creation | Docs | Keys | Returned | Time | In-memory sort | Expected matched |
|---|---|---:|---:|---:|---:|---|---|
| `orders.find({}).sort({ createdAt: -1 }).limit(25)` | `createdAt_-1` | 2 | 2 | 2 | 1 ms | No | Yes |
| `orders.find({ type: "BUY" }).sort({ createdAt: -1 }).limit(25)` | `type_1_createdAt_-1` | 2 | 2 | 2 | 1 ms | No | Yes |
| `orders.find({ status: "PENDING" }).sort({ createdAt: -1 }).limit(25)` | `status_1_createdAt_-1` | 0 | 0 | 0 | 1 ms | No | Yes |
| `orders.find({ status: "PENDING", type: "SELL" }).sort({ createdAt: -1 }).limit(25)` | `status_1_type_1_createdAt_-1` | 0 | 0 | 0 | 0 ms | No | Yes |
| `transactions.find({}).sort({ createdAt: -1, _id: -1 }).limit(50)` | `createdAt_-1__id_-1` | 6 | 6 | 6 | 1 ms | No | Yes |
| `withdrawals.find({ status: "processing", startedAt: { $lte: ISODate(...) } })` | `status_1_startedAt_1` | 0 | 0 | 0 | 0 ms | No | Yes |
| exact `faileddepositingestions...transaction_now` command | none, `EOF` | 0 | 0 | 0 | 0 ms | No | No |
| exact `faileddepositingestions...nextRetryAt` command | none, `EOF` | 0 | 0 | 0 | 0 ms | No | No |
| actual `failed_deposit_ingestions...transaction_now` collection | `status_1_resolvedAt_1_transferData.transaction_now_1` | 0 | 0 | 0 | 0 ms | No | Yes |
| actual `failed_deposit_ingestions...nextRetryAt` collection | `status_1_resolvedAt_1_nextRetryAt_1_failedAt_1` | 0 | 0 | 0 | 0 ms | No | No |

Findings:

- The order, transaction, and withdrawal indexes now verify cleanly after creation.
- The exact failed-deposit commands in `database-performance.md` use `faileddepositingestions`, but the repository uses `failed_deposit_ingestions`. The exact commands therefore do not verify the real collection.
- The actual retry-due query still prefers the older `status_1_resolvedAt_1_nextRetryAt_1_failedAt_1` index over the new `status_1_resolvedAt_1_failedAt_1_nextRetryAt_1_retryCount_1`. This is measurable evidence that the new retry index does not match the current query as well as expected when there is no `failedAt` equality predicate.

## Route Timing

Authenticated admin HTTP timings, 5 samples each:

| Route | Status | p50 | p95 / slowest | Notes |
|---|---:|---:|---:|---|
| `/api/matches/active` | 200 | 537 ms | 1973 ms | Returned `[]`; one slow sample. |
| `/api/transactions` | 200 | 950 ms | 1025 ms | Returned empty page for temp user. |
| `/api/admin/merchant/dashboard` | 200 | 662 ms | 1534 ms | Provider-heavy admin path; cold/fill cost still visible. |
| `/api/admin/merchant/orders` | 200 | 836 ms | 1262 ms | Returned pending order page. |
| `/api/health/ready` | 200 | 408 ms | 970 ms | Ready with database/Redis up and BullMQ disabled. |

Unauthenticated/public timings from earlier samples:

- `/tonconnect-manifest.json`: 200, p50 359 ms, p95 521 ms.
- `/tonconnect-icon.svg`: 200, p50 385 ms, p95 778 ms.
- Invalid Turnstile register/login-password requests failed closed with `TURNSTILE_FAILED`, generally 399-1171 ms. A provider-stall timeout was not directly simulated.

Redis direct latency from this workstation:

- `PING` count 20: p50 429 ms, p95 3414 ms, max 3414 ms.
- Scratch `SET`: 430 ms.
- Scratch `GET`: 368 ms.
- Cache behavior was observed indirectly through route responses, but the app does not expose per-cache hit/miss headers.

## Browser Profiling

Headless Chromium desktop viewport, cold cache. Authenticated routes used the temporary admin session.

| Route | Final path | LCP | CLS | Long tasks | Slowest visible API | Duplicate requests | Largest assets / notes |
|---|---|---:|---:|---:|---|---|---|
| `/` | `/` | 4780 ms | 0.0167 | 7 | `/api/auth/me` 200 | None | `cabin-sketch-700.woff2` 140 KB, `tonconnect` 124 KB, `cabin-sketch-400.woff2` 81 KB. |
| `/auth/login` while authenticated | `/play` | 5804 ms | 0.0029 | 2 | `/api/auth/me`, `/api/matches/active`, `/api/users/leaderboard` | None | Redirected to `/play`; not a logged-out login profile. |
| `/play` | `/play` | 8840 ms | 0.0448 | 3 | `/api/auth/me`, `/api/matches/active`, `/api/users/leaderboard` | None | Initial load fetched leaderboard before tab click. |
| `/bank` | `/bank` | 4336 ms | 0.0434 | 4 | `/api/transactions` | None | Deposit panel showed wallet-connect-required text; no wallet app connection completed. |
| `/merchant` | `/merchant` | 6388 ms | 0.0448 | 4 | `/api/admin/merchant/dashboard` | Dashboard count 2 after manual refresh | Rapid refresh clicks produced only one additional dashboard request. |
| `/merchant/orders` | `/merchant/orders` | 9504 ms | 0.0430 | 4 | dashboard + orders | None | Font loads dominated; orders API succeeded. |
| `/game/c3448c` | `/play` | 9992 ms | 0.0425 | 3 | match lookup, then active/leaderboard after redirect | None | Completed room redirected to `/play`. |

Logged-out `/auth/login` from the unauthenticated pass:

- Final path `/auth/login`.
- LCP 6156 ms, CLS 0.0036, 4 long tasks, longest task 83 ms.
- Console showed expected 401 for `/api/auth/me`.

Largest recurring assets:

- `/fonts/cabin-sketch-700.woff2`: 140 KB, often 0.8-6.4 s transfer duration.
- `/assets/tonconnect-DKoNsMF4.js`: 124 KB, loaded even on routes that did not use wallet actions.
- `/fonts/cabin-sketch-400.woff2`: 81 KB.
- `/assets/react-vendor-8DBoUhyy.js`: 75 KB.

## Specific Fix Verification

- `/play` leaderboard lazy-load: Failed on staging. The initial `/play` load made 1 `/api/users/leaderboard` request before the leaderboard tab was clicked; after clicking the tab the count stayed 1.
- Merchant dashboard request coalescing: Passed for rapid manual clicks. `/merchant` made 1 initial dashboard request and only 1 additional request after 5 rapid refresh clicks.
- Hidden-tab merchant polling pause: Not verified. In headless Chromium, the page remained `visibilityState: "visible"` after opening a second page, so the hidden-tab branch did not run.
- TON Connect manifest: Public and fast enough from the tested origin, p50 359 ms and p95 521 ms.
- Wallet connect flow: Partial only. The bank deposit UI exposed the wallet-connect-required state without console errors, but no wallet app was available in headless Chromium to complete connect/decline behavior.
- Turnstile failure behavior: Invalid tokens failed closed with `TURNSTILE_FAILED` instead of hanging. Provider-stall timeout was not directly measurable without controlling Cloudflare response latency.

## Measured Wins

- After creating the expected test DB indexes, order desk and admin transaction chronology queries no longer used blocking in-memory sorts.
- Merchant manual refresh coalescing prevented request fan-out under rapid clicks.
- Public TON Connect manifest and icon returned 200 from the public origin.
- Readiness stayed 200 with database and Redis up.

## Remaining Bottlenecks

- Staging frontend still eagerly fetched leaderboard on `/play`; another deploy/code pass is needed for this fix.
- Staging DB did not initially have the new indexes; deploy/startup index creation needs verification before production.
- Failed-deposit retry index order does not match the actual retry query winner.
- LCP remains high on several routes, especially `/play`, `/merchant/orders`, and redirected `/game`.
- Font transfers and the globally loaded TonConnect chunk are visible frontend costs.
- Redis WAN p95 was high from this workstation; in-Render internal latency still needs Render-side logs/metrics.
- Render logs were not available, so dependency timeout/error rates could not be confirmed from app logs.

## Production Readiness Recommendation

Not ready to call the performance fixes verified in production terms yet.

Recommended next fixes from the original staging pass, before the local follow-up changes below:

1. Deploy or correct the `/play` leaderboard lazy-load fix in staging and remeasure.
2. Ensure staging/production startup creates the new MongoDB indexes, or run an explicit index migration.
3. Correct `database-performance.md` failed-deposit collection names to `failed_deposit_ingestions`.
4. Revisit the failed-deposit retry index order for the actual `nextRetryAt` query.
5. Add Render-accessible route/dependency timing logs or metrics before production sign-off.
6. Consider deferring TonConnect provider/chunk from routes that do not need wallet UI, after verifying wallet behavior.

## Post-Fix Local Re-Verification 2026-05-16

These checks were run locally after the staging-measured follow-up fixes. Staging was not redeployed from this workspace, so the live staging tables above remain the latest production-origin measurements until a deploy and repeat `explain`/browser pass is completed.

Local browser/network verification:

- `/play` route smoke passed in Chromium, Firefox, and WebKit.
- Initial `/play` requested `/api/matches/active`.
- Initial `/play` made zero `/api/users/leaderboard` requests before the leaderboard tab was opened.
- After clicking the leaderboard tab, exactly one `/api/users/leaderboard` request was observed.
- `/play` made zero `/assets/tonconnect*.js` requests.
- Navigating to `/bank` requested the TonConnect chunk, preserving route-scoped wallet loading.
- `/merchant/orders` route smoke passed in the mobile merchant shell.

Local build/asset verification:

- `npm run build` passed.
- Latest build still emits a TonConnect chunk, but it is route-scoped: `dist/assets/tonconnect-Bzu3GTk3.js`, 431.57 kB raw / 129.36 kB gzip.
- The entry chunk is `dist/assets/index-BSsmf23s.js`, 87.26 kB raw / 22.95 kB gzip.
- `index.html` now preloads only `/fonts/cabin-sketch-700.woff2`; `src/index.css` retains `font-display: swap`.

Database/index verification changes:

- Startup now verifies required index names after `createIndexes()` and logs `database.indexes_verified`.
- Manual staging command added: `npm run db:verify-indexes`.
- Failed-deposit docs and tests now use real collection `failed_deposit_ingestions`.
- The redundant failedAt-first retry index recommendation was removed; the retained retry index matches the actual winning plan order: `status_1_resolvedAt_1_nextRetryAt_1_failedAt_1`.

Render-side observability changes:

- Redis ping duration is recorded as `redis_operation_duration_ms`.
- MongoDB repository operations continue to record `mongodb_operation_duration_ms`.
- Turnstile, Toncenter, and wallet RPC operations now record `external_provider_duration_ms`.
- Readiness dependency checks record `readiness_dependency_duration_ms`.
- Non-production `/api/health/ready` responses include `dependencyTimingsMs`; production responses stay redacted.
- Route p95 can be computed from existing structured `request.completed` logs or the `http_request_duration_ms` metric.

Post-fix verification commands:

- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/frontend-contracts.test.ts`: passed, 20/20.
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/repository-indexes.test.ts`: passed, 4/4.
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/logging-and-schemas.test.ts`: passed, 9/9.
- `npx tsc --project tsconfig.server.json --noEmit`: passed.
- `npx tsc --project tsconfig.json --noEmit`: passed on retry.
- `npm run build`: passed.
- `npm run test:unit`: passed, 138/138.
- `npm run test:integration`: passed, 201/201.
- `npx playwright test tests/e2e/page-smoke.spec.ts`: passed, 15/15.

Staging measurements still required after deploy:

1. Run `npm run db:verify-indexes` in the staging environment and confirm `database.indexes_verified`.
2. Repeat MongoDB explains for `orders`, `transactions`, `withdrawals`, and `failed_deposit_ingestions`.
3. Repeat browser LCP measurements for `/play`, `/merchant/orders`, and redirected `/game`.
4. Confirm `/play` on staging has zero initial leaderboard requests and one after tab click.
5. Confirm `/play` and `/merchant/orders` do not load `/assets/tonconnect*.js`; `/bank` should load it.
6. Review Render logs/metrics for Redis, MongoDB, external provider, readiness dependency, and route p95 timing.
