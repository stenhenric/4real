# Clawpatch Fix Report

## 1. Summary of Files Changed

- `shared/types/api.ts`: allowed authenticated auth responses to explicitly carry `session: null`.
- `src/app/AuthProvider.tsx`, `src/app/auth-state.ts`: preserved the current session when an authenticated response omits `session`, while still clearing explicit `session: null`.
- `src/pages/auth/VerifiedPage.tsx`, `src/pages/auth/verified-page-state.ts`: redirected anonymous `/auth/verified` visits to login and kept authenticated/profile-incomplete users on the success flow.
- `src/features/auth/AuthTurnstile.tsx`, `src/features/auth/turnstile-widget-state.ts`: added fail-closed visible Turnstile recovery UI and retry/remount state.
- `src/pages/BankPage.tsx`, `src/features/bank/transactionPagination.ts`: added transaction history load-more support, duplicate suppression, stale-response protection, and next-page error handling.
- `src/components/SketchyContainer.tsx`, `src/components/SketchyButton.tsx`, `src/canvas/resolveCanvasColor.ts`: resolved CSS custom properties before using colors in canvas/border drawing paths.
- `src/components/ui/MiniMatchCard.tsx`, `src/components/ui/miniMatchBoard.ts`: rendered mini board previews from actual `row`/`col` move coordinates and player ids.
- `package.json`: added the new regression tests to `npm run test:unit`.
- `tests/unit/**`: added focused regression tests for all remediated findings plus production-entrypoint smoke coverage.

## 2. Clawpatch Findings Fixed

1. `AuthProvider.applyAuthState` session preservation for MFA responses.
   - Fixed by distinguishing omitted `session` from explicit `session: null`.

2. `/auth/verified` anonymous success bug.
   - Fixed by showing the success UI only after auth loading completes with `userData`; anonymous users are redirected to `/auth/login`.

3. Turnstile load/widget errors need visible recovery UI while remaining fail-closed.
   - Fixed by showing inline error text, a retry button, and remount state while keeping token state invalid until Turnstile succeeds.

4. `/bank` transaction history needs pagination or load-more support.
   - Fixed with page-size based load-more behavior, append semantics, duplicate suppression, stale request guards, and non-destructive next-page failures.

5. `SketchyContainer` should resolve CSS custom properties before passing colors to canvas/RoughJS.
   - Fixed with a shared `resolveCanvasColor` helper and concrete fallback handling outside browser-like environments.

6. `MiniMatchCard` mini board preview should use actual move coordinates.
   - Fixed by building a 6x7 preview from `moveHistory.row`, `moveHistory.col`, and `userId`.

7. `scripts/start-production.mjs` production helper review.
   - Reviewed references. `package.json` uses `node ./dist/server/main.js`, and `scripts/start-production.mjs` already imports `../dist/server/main.js`. No production startup code change was needed; smoke tests now guard this.

## 3. Findings Intentionally Not Touched

- Findings marked `False Positive` in `clawpatch-report.md` were not modified.
- Broad report items outside the ordered remediation list were not changed.
- `scripts/start-production.mjs` was not edited because the repository already starts built output from both `package.json` and the helper script. The only change for this item is a smoke test.

## 4. Tests Added or Updated

- `tests/unit/src/app/auth-state.test.ts`
- `tests/unit/src/pages/auth/verified-page-state.test.ts`
- `tests/unit/src/features/auth/turnstile-widget-state.test.ts`
- `tests/unit/src/features/bank/transactionPagination.test.ts`
- `tests/unit/src/components/resolveCanvasColor.test.ts`
- `tests/unit/src/components/ui/miniMatchBoard.test.ts`
- `tests/unit/scripts/start-production.test.ts`
- `package.json` `test:unit` script now includes these tests.

## 5. Commands Run and Results

- Initial focused regression run: failed as expected before helper implementations existed.
- `npm run test:unit`: passed, 98 tests.
- `npm run test`: passed after fixes, including test typecheck, 98 unit tests, and 263 integration tests.
- `npm run build`: passed after fixing exact optional `signal` handling in the bank transaction request.

Intermediate failures were fixed before completion:

- Test typecheck rejected a too-narrow `getComputedStyle` mock cast.
- Integration contract test rejected a raw Turnstile retry `<button>`; the retry now uses `SketchyButton`.
- Build rejected `signal: undefined` under `exactOptionalPropertyTypes`; the request now omits `signal` when absent.

## 6. Unresolved Risks

- `/bank` load-more availability uses the returned page size as the primary signal because the backend unified feed `total` is based on the bounded records fetched for the requested page. This avoids hiding additional pages, but a user may see one extra load-more opportunity when the history length is exactly on a page boundary.
- Turnstile recovery is covered through state/helper tests and the existing script retry test. Full browser rendering of Cloudflare Turnstile still requires manual or e2e validation with a real site key.

## 7. Manual Deployment Checks Needed

- Confirm the deployment platform uses `npm run build` followed by `npm start` or an equivalent command that runs `dist/server/main.js`.
- If any external platform configuration outside this repository references `scripts/start-production.mjs`, it is still safe because that helper imports `../dist/server/main.js`.
- Verify Turnstile retry UI in a deployed/staging browser with the real Cloudflare script and site key.
