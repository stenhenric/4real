# Tests and Commands

Generated: 2026-05-16

| Command | Result | Duration | Important output / notes |
|---|---|---:|---|
| `Get-ChildItem -Force` | Passed | ~3s | Repository inventory collected. |
| `rg --files ...` | Passed | ~3s | Found prior reports, package manifest, route/model/test files. |
| `git status --short` | Passed | ~3s | Worktree already dirty with many modified and untracked files before this pass. |
| `node -v; npm -v` | Passed | ~5s | Node `v24.15.0`, npm `11.14.0`. |
| `Get-Content -Raw package.json` | Passed | ~3s | npm scripts and dependencies recorded. |
| Prior report reads | Passed | ~4s | Read existing auth/session and performance reports. |

## Baseline And Verification Commands

| Command | Result | Duration | Important output / notes |
|---|---|---:|---|
| `npm pkg get scripts` | Passed | ~2.2s | Scripts include `dev`, `build`, `lint`, `test:unit`, `test:integration`, `test:e2e`, `test:all`. |
| `npm audit --omit=dev --json` | Passed | ~4s | `0` production vulnerabilities. |
| `npx tsc --project tsconfig.json --noEmit` | Passed | ~170.19s | Frontend TypeScript clean. |
| `npx tsc --project tsconfig.server.json --noEmit` | Passed | ~78.06s | Server TypeScript clean. |
| `npm run lint` | Passed | ~202.32s baseline; ~307.93s final | Lint passed before and after fixes. |
| `npm run test:unit` | Failed baseline | ~56.37s | 133/134 passed. Failing contract: raw `<button>` offenders in `src/components/merchant/MerchantLayout.tsx` and `src/components/Navbar.tsx`. |
| `npx vitest run server/middleware/frontend-contracts.test.ts` | Passed after FIX-001 | ~2.32s | 17/17 passed after replacing raw buttons. |
| `npm run test:unit` | Passed after FIX-001 | ~68.88s | 134/134 passed. |
| `npm run test:integration` | Passed after FIX-001 | ~96.74s | 194/194 passed. |
| `npm run build` | Passed after FIX-001 | ~115.42s | Vite build completed; largest gzip chunks included TonConnect ~129 kB and React vendor ~129 kB. |
| `git diff --check` | Passed | ~2.21s | No whitespace errors; CRLF warnings only. |
| `npx vitest run server/middleware/frontend-contracts.test.ts` | Failed as expected before FIX-002 | ~2s | Red test failed with missing `src/features/auth/refresh-error.ts`. |
| `npx vitest run server/middleware/frontend-contracts.test.ts` | Passed after FIX-002 | ~4.69s | 18/18 passed. |
| `npm run test:unit` | Passed final | ~59.24s | 135/135 passed. |
| `npm run lint` | Passed final | ~307.93s | No lint errors. |
| `npm run build` | Passed final | ~194.78s | 1829 modules transformed; build passed. |
| `npm run test:integration` | Passed final | ~82.68s | 195/195 passed. |

## Development Server And HTTP Checks

| Command | Result | Duration | Important output / notes |
|---|---|---:|---|
| Port/process check for `3000` | Passed | ~3s | Existing Node dev server was already listening on port `3000` as PID `1384`; it was reused and not stopped. |
| `GET http://localhost:3000/api/health` | Passed | <1s | Returned `200` with build metadata. |
| `GET http://localhost:3000/api/health/live` | Passed | <1s | Returned `200`. |
| `GET http://localhost:3000/api/health/ready` with 30s timeout | Failed | 30s | First readiness request timed out. |
| `GET http://localhost:3000/api/health/ready` with 75s timeout | Passed | ~3.96s | Returned `200` with database, Redis, hot wallet runtime, and mandatory background jobs up. |
| `GET http://localhost:3000/tonconnect-manifest.json` | Passed | <1s | Public manifest returned `200`. |

## Browser / E2E Checks

| Command | Result | Duration | Important output / notes |
|---|---|---:|---|
| In-app Browser via Browser plugin | Blocked | <1s | Tool reported: `No active Codex browser pane available`. Fallback used Playwright and HTTP checks. |
| `npm run test:e2e` | Failed | ~986.59s | 23/24 passed. WebKit merchant admin E2E timed out. |
| `npx playwright test tests/e2e/merchant.spec.ts --project=webkit` | Failed | ~168.996s | Same merchant E2E timed out. |
| `npx playwright test tests/e2e/merchant.spec.ts --project=webkit --timeout=120000` | Failed | ~186.89s | Failed waiting 10s for `Treasury Overview` after `/merchant`. |
| Manual WebKit merchant admin harness script | Passed | ~12s route render | Admin `/merchant` showed `Treasury Overview`, pending order count, and submitted BUY order. This narrows the failed check to Playwright timing/route slowness rather than an obvious API authorization failure. |
| WebKit admin navigation timing probe | Passed | ~18.6s command | Clean admin navigation showed heading visible in ~6.1s; duplicate auth/dashboard request events observed. |
| Cross-browser admin navigation timing probe | Passed | ~35.2s command | Heading visible: Chromium ~2.8s, Firefox ~5.4s, WebKit ~1.8s in isolated navigation. |
| Full WebKit merchant flow timing probe | Passed | ~18.1s command | Customer submit plus admin review path completed; admin heading visible in ~2.4s. |
| `npx playwright test tests/e2e/merchant.spec.ts --project=webkit --reporter=line` | Passed before test sync change | ~127.6s | Targeted merchant WebKit passed once rerun sequentially. |
| `npm run test:e2e -- --reporter=line` | Failed before test sync change | ~837s | 22/24 passed. WebKit auth timed out after second login; WebKit merchant raced proof/order submission and showed `Transaction failed. Please try again.` |
| `npx playwright test tests/e2e/auth.spec.ts --project=webkit --reporter=line` | Passed after FIX-003 | ~168.3s | Targeted WebKit auth passed. |
| `npx playwright test tests/e2e/merchant.spec.ts --project=webkit --reporter=line` | Passed after FIX-003 | ~127.5s | Targeted WebKit merchant passed sequentially. |
| `npm run test:e2e -- --reporter=line` | Passed final | ~797.1s | Build passed, then Playwright passed 24/24 across Chromium, Firefox, and WebKit. |
| `git diff --check` | Passed final | ~3.6s | No whitespace errors; CRLF warnings only. |

## Failed Checks

- Earlier `npm run test:e2e` runs failed on WebKit timing/race issues. After `FIX-003`, final `npm run test:e2e -- --reporter=line` passed 24/24.
- First 30s readiness request timed out, but a retry succeeded in about 3.96s. This is an operational latency observation, not a final failing check.
