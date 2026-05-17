# Commands Run

All commands ran from `C:\Users\Sten.DESKTOP-JT1I9N4\OneDrive\Desktop\4realmain` unless noted.

| Command | Result | Duration | Important output / notes |
|---|---|---:|---|
| `Get-ChildItem -Force` | Passed | not recorded | Repository inventory. |
| `Get-Content -Raw package.json` | Passed | not recorded | Identified npm scripts and dependencies. |
| `git status --short --branch` | Passed | not recorded | Worktree was already dirty with many modified files before this performance pass. |
| `Get-Content -Raw reviewcodebase.md` | Passed | not recorded | Prior production-readiness constraints read. |
| `Get-Content -Raw auth-session-review.md` | Passed | not recorded | Prior auth/session constraints read. |
| `if (Test-Path performance-review) ...` | Passed | not recorded | No existing `performance-review` directory before this pass. |
| `rg --files ...` and targeted `rg` searches | Passed | not recorded | Mapped frontend, backend, routes, models, Redis, integrations. |
| `node -v` | Passed | ~12.8s | `v24.15.0` |
| `npm -v` | Passed | ~21.4s | `11.14.0` |
| `npm pkg get scripts` | Passed | ~20.8s | Listed scripts including `build`, `lint`, `test:unit`, `test:integration`, `test:e2e`. |
| `npm audit --omit=dev --json` | Passed | ~25.6s | `0` production vulnerabilities reported. |
| `npm run lint` | Timed out | 304s | No output before timeout; treated as tooling/runtime limitation. |
| `npx tsc --noEmit` | Timed out | 304s | No complete output; direct project checks used instead. |
| `npx tsc --project tsconfig.server.json --noEmit` | Passed | ~253.5s first run, ~160.7s later | Server TypeScript passed. |
| `npx tsc --project tsconfig.json --noEmit` | Passed | ~122.9s | Frontend TypeScript passed. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/merchant-dashboard.test.ts server/middleware/transaction-controller.test.ts server/middleware/repository-indexes.test.ts server/middleware/auth-security.test.ts server/middleware/frontend-contracts.test.ts` | Failed as expected before fixes | ~not recorded | Red phase: 53 tests, 46 pass, 7 fail. Failures matched missing Turnstile timeout, eager leaderboard fetch, merchant polling/context guard, and missing indexes. |
| Same targeted command after fixes | Passed | ~32.8s | 53/53 passed. |
| `npm run build` | Passed | ~206s | Vite build and server tsc passed. Key chunks: TonConnect 129.37 kB gzip, React vendor 129.34 kB gzip, index 22.97 kB gzip, canvas 13.44 kB gzip, socket 15.51 kB gzip. |
| `npm run test:unit` | Passed | ~61.7s | 132/132 tests passed. |
| `git diff --check` | Passed | ~2.1s | CRLF warnings only; no whitespace errors. |
| `npm run test:integration` | Passed | ~77.8s | 189/189 tests passed. |
| `npm run test:e2e` | Failed | ~805.3s | Build passed, 12/21 E2E passed. Merchant routes stuck on loading after first coalescing fix; this exposed an aborted initial dashboard request edge case. |
| `Get-Content -Raw test-results\...\error-context.md` | Passed | ~6.7s | Confirmed missing merchant headings due dashboard loading fallback. |
| `view_image test-results\...\test-failed-*.png` | Passed | not recorded | Screenshots showed merchant shell stuck on `Loading treasury ops...`. |
| `Get-Content -Raw src\components\merchant\MerchantLayout.tsx` | Passed | ~2.7s | Inspected coalescing logic. |
| `Get-Content -Raw src\pages\merchant\MerchantDashboardPage.tsx` | Passed | ~2.7s | Confirmed dashboard fallback behavior while shared dashboard data is absent. |
| `Get-Content -Raw src\services\merchant.service.ts` | Failed | ~3.3s | File does not exist; actual service files are split by domain, including `merchant-dashboard.service`. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/frontend-contracts.test.ts` | Passed | ~10.9s | 17/17 passed after aborted-request fix. |
| `npm run test:e2e` | Passed | ~725.9s | Build passed and Playwright passed 21/21 across Chromium, Firefox, WebKit. |
| `git diff --stat` | Passed | ~3.5s | Confirmed broad dirty tree; many changes pre-existed this pass. |
| Targeted `git diff -- ...` | Passed | ~2.9s | Reviewed scoped performance diffs and noted unrelated pre-existing edits in some files. |
| `New-Item -ItemType Directory -Force performance-review \| Out-Null` | Passed | ~1.2s | Created report directory. |
| `Get-ChildItem performance-review \| Select-Object Name,Length` | Passed | ~4.2s | Verified all nine required report files exist. |
| Final `git diff --check` | Passed | ~4.6s | CRLF warnings only; no whitespace errors. |
| `git status --short performance-review ...` | Passed | ~3.7s | Confirmed report directory and scoped performance files are modified/untracked. |
| `Get-ChildItem performance-review \| Measure-Object \| Select-Object -ExpandProperty Count` | Passed | ~5.9s | Counted 9 report files. |
| Final repeat `git diff --check` | Passed | ~8.3s | CRLF warnings only; no whitespace errors. |
| Opened `https://github.com/ton-blockchain/ton-connect/blob/main/requests-responses.md` | Passed | not a shell command | Reviewed TON Connect manifest, `ton_proof`, wallet event/request, and `sendTransaction` guidance for report updates. |

Build artifacts from final E2E build:

- `dist/assets/tonconnect-DVfdnMB4.js`: 431.58 kB raw, 129.37 kB gzip
- `dist/assets/react-vendor-CXlRCVJL.js`: 424.68 kB raw, 129.34 kB gzip
- `dist/assets/index-BKBoSonG.js`: 87.77 kB raw, 22.97 kB gzip
- `dist/assets/canvas-Pp9lFNoN.js`: 38.51 kB raw, 13.44 kB gzip
- `dist/assets/socket-Baqj61N_.js`: 47.93 kB raw, 15.51 kB gzip
- `dist/assets/DashboardPage-DHrXdCag.js`: 33.03 kB raw, 5.00 kB gzip
- `dist/assets/MerchantLayout-DpIJ8utM.js`: 21.74 kB raw, 4.29 kB gzip

## Post-Staging Follow-up Commands 2026-05-16

| Command | Result | Duration | Important output / notes |
|---|---|---:|---|
| `Get-Content performance-review\staging-performance-results.md` and related reports | Passed | not recorded | Read latest staging findings without redoing the full audit. |
| `rg -n "leaderboard|users/leaderboard|Leaderboard" src server tests -S` | Passed | ~5.5s | Confirmed only `DashboardPage`, `/leaderboard`, and user route use leaderboard. |
| `rg -n "ensureIndexes|autoIndex|syncIndexes|createIndex|createIndexes|mongoose\.connect|index\(" server package.json render.yaml -S` | Passed with missing `render.yaml` warning | ~5.2s | Found startup `setupIndexes()` and model/repository declarations; `render.yaml` is absent. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/repository-indexes.test.ts` | Failed as expected before implementation | ~5.2s | Red phase: missing `REQUIRED_DATABASE_INDEXES` export. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/frontend-contracts.test.ts` | Failed as expected before implementation | ~5.0s | Red phase: missing font preload and TonConnect still in global shell. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/logging-and-schemas.test.ts server/middleware/app-health.test.ts` | Failed/timed out before implementation | ~124.5s | Red phase: missing dependency metric exports and readiness timing details. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/repository-indexes.test.ts` | Passed | ~34.1s | 4/4 passed after index verification and failed-deposit index correction. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/frontend-contracts.test.ts` | Passed | ~57.1s | 20/20 passed after font preload and TonConnect route scoping. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/logging-and-schemas.test.ts` | Passed | ~31.7s | 9/9 passed after dependency metrics label correction. |
| `npx tsc --project tsconfig.server.json --noEmit` | Passed | ~297.5s | Server TypeScript passed. |
| `npx tsc --project tsconfig.json --noEmit` | Timed out then passed on retry | ~304s timeout, ~111.9s retry | First frontend check timed out with no output; retry completed successfully. |
| `npm run build` | Passed | ~143s | Vite and server compile passed. Key chunks: `tonconnect-Bzu3GTk3.js` 129.36 kB gzip, `index-BSsmf23s.js` 22.95 kB gzip. |
| `npx playwright test tests/e2e/page-smoke.spec.ts -g "play lobby" --project=chromium` | Passed | ~119.1s | Focused Chromium network checks passed. |
| `npx playwright test tests/e2e/page-smoke.spec.ts` | Failed before test fix | ~437.2s | Harness bug: `APP_URL` was not imported in new request listeners. |
| `npx playwright test tests/e2e/page-smoke.spec.ts` | Failed before assertion refinement | ~333.8s | 14/15 passed; Firefox counted `/tonconnect-icon.svg` as TonConnect asset. Assertion narrowed to JS chunk. |
| `npx playwright test tests/e2e/page-smoke.spec.ts -g "play lobby does not load TonConnect"` | Passed | ~185s | TonConnect JS chunk route-scope check passed in Chromium, Firefox, and WebKit. |
| `npx playwright test tests/e2e/page-smoke.spec.ts -g "play lobby fetches leaderboard" --project=webkit` | Passed | ~109.4s | WebKit passed after switching API capture to `page.route`. |
| `npx playwright test tests/e2e/page-smoke.spec.ts` | Passed | ~304.4s | Final full page-smoke passed 15/15 across Chromium, Firefox, and WebKit. |
| `npm run test:unit` | Passed | ~51.6s | 138/138 tests passed. |
| `npm run test:integration` | Passed | ~67.3s | 201/201 tests passed. |
| `git status --short` | Passed | ~2.5s | Worktree remains broadly dirty with many pre-existing unrelated changes; not reverted. |
