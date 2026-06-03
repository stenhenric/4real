# Exhaustive Page State Colour Fixes

Date: 2026-06-03

## Source

- Requested source: `reports/exhaustive-page-state-colour-audit.md`.
- Local result: that file was not present in the workspace during implementation.
- Applied source of truth: `reports/frontend-color-design-system-audit.md`, which contained the previous exhaustive page/state color audit and the `test-results/color-audit/` harness notes.

## Summary

Implemented the frontend color/design-system fixes as a presentation-only pass. The changes preserve the current sketch-paper/notebook identity, use existing theme tokens and primitives, and avoid backend, auth, payment, MFA, merchant, and game business-logic changes.

Primary outcomes:

- Added reusable state and legal-page surfaces instead of plain centered text.
- Reworked terms, privacy, 404, loading, profile missing/loading, and game access/loading states with token-backed paper, note, and status treatments.
- Replaced duplicated merchant/admin severity chips with `StatusBadge` and existing status tones.
- Tokenized bank, transaction, game, auth, public, and dashboard accent colors.
- Kept game disc colors as game-specific tokens.
- Added one central neutral token, `--color-surface`, because repeated white surface fills existed and no neutral surface token covered them.

## Files Changed

- `src/index.css`
- `src/app/PublicLayout.tsx`
- `src/app/RouteLoading.tsx`
- `src/canvas/drawConnectFourBoard.ts`
- `src/canvas/runVictoryConfetti.ts`
- `src/components/Navbar.tsx`
- `src/components/SketchyButton.tsx`
- `src/components/SketchyContainer.tsx`
- `src/components/merchant/MerchantLayout.tsx`
- `src/components/merchant/MerchantPageFallback.tsx`
- `src/components/ui/LegalPageShell.tsx`
- `src/components/ui/StatePanel.tsx`
- `src/components/ui/StatusBadge.tsx`
- `src/features/auth/AuthShell.tsx`
- `src/features/auth/AuthTurnstile.tsx`
- `src/features/auth/GoogleAuthButton.tsx`
- `src/features/auth/components/PasswordStrengthMeter.tsx`
- `src/features/bank/DepositPanel.tsx`
- `src/features/bank/MerchantPanel.tsx`
- `src/features/bank/transactionPresentation.ts`
- `src/pages/BankPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/GamePage.tsx`
- `src/pages/LandingPage.tsx`
- `src/pages/NotFoundPage.tsx`
- `src/pages/PrivacyPolicyPage.tsx`
- `src/pages/ProfilePage.tsx`
- `src/pages/TermsOfUsePage.tsx`
- `src/pages/auth/LoginPage.tsx`
- `src/pages/auth/RegisterPage.tsx`
- `src/pages/auth/SecuritySettingsPage.tsx`
- `src/pages/auth/WithdrawalMfaPage.tsx`
- `src/pages/merchant/AlertsPage.tsx`
- `src/pages/merchant/DepositsPage.tsx`
- `src/pages/merchant/LiquidityPage.tsx`
- `src/pages/merchant/MerchantDashboardPage.tsx`
- `src/pages/merchant/OrderDeskPage.tsx`
- `tests/integration/server/middleware/frontend-contracts.test.ts`
- `reports/exhaustive-page-state-colour-fixes.md`

## Tokens And Primitives Used

- CSS/Tailwind theme tokens: `--color-surface`, `--color-paper-soft`, `--color-note-yellow`, `--color-note-blue`, `--color-marker-yellow`, `--color-ink-black`, `--color-ink-blue`, `--color-success-*`, `--color-warning-*`, `--color-danger-*`, `--color-info-*`, `--color-game-board-line`, `--color-disc-red`, `--color-disc-blue`.
- Components/primitives: `SketchyButton` variants, `SketchyContainer`, `StatusBadge`, new `StatePanel`, new `LegalPageShell`.
- Existing icon style: Lucide icons only; no generated icons or image assets.

## Hardcoded Colors Removed

- Replaced `#fff9c4` button/CTA fills with `variant="primary"`, `var(--color-note-yellow)`, or `bg-note-yellow`.
- Replaced raw white surface fills with `--color-surface` or `bg-surface`.
- Replaced raw merchant red/yellow/green/blue severity chips with `StatusBadge` or success/warning/danger/info tokens.
- Replaced bank transaction classes `bg-green-600` and `bg-red-600` with token-backed success/danger border classes.
- Replaced bank/admin warning and proof-link colors with warning/info/success/danger tokens.
- Replaced game waiting/wager/result accents with warning/success tokens while keeping disc colors tokenized separately.
- Replaced landing SVG and chart accents with `var(--color-ink-black)`, `var(--color-ink-blue)`, `bg-note-blue`, and `bg-success-border`.
- Replaced canvas victory/confetti and winning marker colors with theme-token lookups.

## Remaining Hardcoded Colors With Justification

- `src/index.css`: central theme token definitions intentionally contain concrete color values; these are the design-system source.
- `src/features/auth/GoogleAuthButton.tsx`: Google logo path fills remain Google brand colors and are not app severity/status colors.
- `tests/unit/src/components/resolveCanvasColor.test.ts`: explicit color literals are test fixtures for the color resolver.
- `tests/unit/server/services/email/*` and product email notification tests: assert branded email HTML token output and are not frontend screen styling.
- `src/app/PublicLayout.tsx`: `/#features` is a URL hash anchor, not a color.

## Screenshots And Visual Routes

Generated 30 screenshots under `test-results/color-audit/` and wrote `test-results/color-audit/implementation-visual-summary.json`.

Routes/states inspected:

- Desktop public/auth: landing, terms, privacy, 404, login, register, forgot password, verify email missing, verify email expired.
- Desktop player: lobby, community, bank portal, deposit, withdrawal, profile, security overview.
- Desktop game: waiting, missing-room/access-denied path, private-room no-access path.
- Desktop merchant/admin: dashboard, orders, deposits, liquidity, alerts.
- Mobile: landing, login, register, bank, security, merchant shell.

Final visual harness result:

- Screenshots: 30.
- Unexpected console failures: 0.
- Horizontal overflow failures: 0.

Note: intentionally missing/private game probes produce expected API 404 console messages before the app renders the no-access state and returns toward the lobby. The final visual pass excluded only those expected probe errors from failure accounting.

## Scans Run

- Raw color scan:
  - `rg -n "#[0-9A-Fa-f]{3,8}|rgba\(|hsla?\(|bg-green|bg-red|bg-yellow|bg-blue|bg-gray|text-green|text-red|text-yellow|text-blue|border-green|border-red|border-yellow|border-blue|border-\[|bg-\[#|text-\[#" src tests -g "!src/index.css"`
  - Result: remaining hits only in justified test fixtures, Google logo brand fills, and URL anchors.
- Targeted implementation-area scan:
  - `rg -n "#dbeafe|#ffffff|#fff9c4|bg-red|bg-yellow|bg-green|bg-blue|text-yellow|text-green|border-red|border-yellow|border-green" src\components\merchant src\pages\merchant src\features\bank src\pages\BankPage.tsx src\pages\GamePage.tsx src\features\auth src\pages\auth src\pages\LandingPage.tsx src\pages\DashboardPage.tsx src\components\Navbar.tsx src\app\PublicLayout.tsx`
  - Result: no matches.
- Plain state text scan:
  - `rg -n "text-center[^\n]*(Loading|loading|not found|Not found|No access|Unavailable|unavailable)|Loading\.\.\.|Loading…|Not found|No access|Access denied|Unavailable" src\app src\pages src\features src\components`
  - Result: only inline field/status copy, merchant formatter fallbacks, and tokenized `StatePanel` states remained.
- Diff check:
  - `git diff --check`
  - Result: exit 0; only CRLF normalization warnings from the existing mixed-line-ending working tree.

## Tests And Checks

- `npm run typecheck`
  - First run found `TS2322` in `MerchantLayout` status tone typing.
  - Fixed with an explicit `{ label: string; tone: StatusTone }` return type.
  - Final result: passed.
- `npm run lint`
  - Result: passed. This script runs `npm run typecheck`.
- `npm run build`
  - Result: passed. Vite build completed successfully in 51.59s.
- `npm run test:unit`
  - Result: passed. 153 tests, 0 failures.
- `npm run test:integration`
  - Result: passed. 293 tests, 0 failures.
- `npm run test:e2e`
  - Result: timed out after 604167 ms before producing a final Playwright result. The project command runs build plus Chromium, Firefox, and WebKit serially.
- `npx playwright test --project=chromium --reporter=list`
  - Result: passed. 22 tests, 0 failures, 3.4m.
- Visual harness:
  - Used `tests/e2e/harness/server.mjs` at `http://127.0.0.1:4317`.
  - Result: 30 screenshots, 0 unexpected console failures, 0 horizontal overflow failures.

## Failures Or Skipped Checks

- The full three-browser `npm run test:e2e` command did not complete within the 10-minute shell timeout. Chromium E2E was run directly and passed.
- No image generation, generated mockups, generated icons, GPT image tools, or `gpt-image-2` were used.

## Rollback Notes

To roll back this implementation pass, revert the files listed above and remove the generated visual QA artifacts under `test-results/color-audit/implementation-visual-summary.json` and the new screenshots from this run. No backend files or business logic were intentionally modified by this pass.
