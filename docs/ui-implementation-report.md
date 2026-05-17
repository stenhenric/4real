# UI Implementation Report

## 1. Summary

Implemented a focused UI refactor based on `ui-audit-report.md`, keeping the landing page, `/play`, and lobby-style screens as the source of truth.

The highest-impact fix was replacing the `SketchyButton` canvas outline with the shared rough-border treatment plus CSS fills, which removes the stroke-through-label defect across compact, icon, disabled, hover, and filled buttons. The pass also added shared design tokens, reusable UI primitives, responsive mini match cards, mobile merchant review cards, semantic notice roles, and safer authenticated mobile bottom padding.

No backend files, service contracts, auth business logic, payment logic, deposit/withdrawal logic, merchant settlement logic, database logic, game rules, socket behavior, TonConnect provider behavior, protected-route behavior, or state-management logic were intentionally changed.

## 2. Files Changed

- `src/components/SketchyButton.tsx`
  - What changed: Preserved existing props and added optional `variant`/`size`; replaced canvas-drawn button outline with CSS rough-border and CSS fill/hover backgrounds.
  - Why: Fixes audit Section 5 and 9 finding where rough strokes crossed labels.
  - Risk level: Medium.
  - Tested: TypeScript gates, `npm test`, Playwright screenshots for landing and `/play` mobile.

- `src/canvas/drawRoughRectangle.ts`
  - What changed: Made `fill` optional so rough rectangles can draw outlines without internal fill strokes.
  - Why: Supports safer stroke-only rough drawing.
  - Risk level: Low.
  - Tested: TypeScript gates, `npm test`.

- `src/index.css`
  - What changed: Added paper, note, semantic status, board, and disc tokens; added `sketch-card`, `mobile-bottom-safe`, and reduced-motion fallback.
  - Why: Addresses audit Section 6, 8, and 9 token/responsiveness/motion findings.
  - Risk level: Low.
  - Tested: TypeScript gates, screenshots.

- `src/components/SketchyContainer.tsx`
  - What changed: Default stroke now uses `var(--color-ink-black)`.
  - Why: Aligns shared container with theme tokens.
  - Risk level: Low.
  - Tested: TypeScript gates, screenshots.

- `src/components/ui/StatusBadge.tsx`
  - What changed: New semantic badge helper.
  - Why: Replaces repeated local status chip palettes.
  - Risk level: Low.
  - Tested: TypeScript gates, merchant/order screenshots.

- `src/components/ui/EmptyState.tsx`
  - What changed: New rough empty-state component.
  - Why: Consolidates dashed generic empty states.
  - Risk level: Low.
  - Tested: TypeScript gates, `/play`, `/bank`, profile, and merchant screenshots.

- `src/components/ui/SketchCard.tsx`
  - What changed: New small rough-card primitive.
  - Why: Provides a shared card pattern for follow-up refactors.
  - Risk level: Low.
  - Tested: TypeScript gates.

- `src/components/ui/ReadonlyField.tsx`, `src/components/ui/CopyField.tsx`
  - What changed: New read-only/copy field primitives.
  - Why: Consolidates copy-field drift in bank deposit flows.
  - Risk level: Low.
  - Tested: TypeScript gates, bank screenshot.

- `src/components/ui/MiniMatchCard.tsx`
  - What changed: New responsive mini match card and mini-board preview.
  - Why: Fixes `/profile/:userId` mini-board overflow.
  - Risk level: Medium.
  - Tested: TypeScript gates, profile mobile screenshot.

- `src/app/AppLayout.tsx`
  - What changed: Uses `mobile-bottom-safe` for authenticated content.
  - Why: Reduces mobile bottom-nav overlap across protected pages.
  - Risk level: Low.
  - Tested: Mobile screenshots.

- `src/app/ToastProvider.tsx`
  - What changed: Toast colors now use semantic tokens.
  - Why: Aligns notice/toast palette with the design system.
  - Risk level: Low.
  - Tested: TypeScript gates, `npm test`.

- `src/features/auth/AuthShell.tsx`, `src/features/auth/components/AuthInput.tsx`
  - What changed: `AuthField` now delegates to `AuthInput`; labels have stronger opacity; `AuthNotice` uses semantic tokens and `role="alert"`/`role="status"`.
  - Why: Addresses duplicate auth input and notice accessibility findings.
  - Risk level: Medium.
  - Tested: TypeScript gates, auth/security screenshot.

- `src/pages/auth/SecuritySettingsPage.tsx`
  - What changed: Replaced rounded SaaS panels and local badges with rough cards and `StatusBadge` patterns.
  - Why: Aligns `/auth/security` with the notebook/sketch language.
  - Risk level: Medium.
  - Tested: TypeScript gates, auth/security screenshot, `npm test`.

- `src/pages/DashboardPage.tsx`
  - What changed: Mobile tab rail scrolls horizontally; draft options/actions are real buttons/radio-style controls; empty states and paid-match colors use shared patterns/tokens.
  - Why: Fixes `/play` semantics, responsiveness, and color drift.
  - Risk level: Medium.
  - Tested: TypeScript gates, `/play` desktop/mobile screenshots, `npm test`.

- `src/pages/ProfilePage.tsx`
  - What changed: Uses `MiniMatchCard`, `EmptyState`, safe bottom spacing, and decorative emoji `aria-hidden`.
  - Why: Fixes mini-board overflow and decorative accessibility issue.
  - Risk level: Medium.
  - Tested: TypeScript gates, profile mobile screenshot.

- `src/pages/BankPage.tsx`
  - What changed: Action cards use rough icon panels and tokens; transaction statuses use `StatusBadge`; empty state uses `EmptyState`.
  - Why: Aligns `/bank` cards and status colors with the shared visual language.
  - Risk level: Medium.
  - Tested: TypeScript gates, bank mobile screenshot.

- `src/features/bank/DepositPanel.tsx`, `src/features/bank/WithdrawPanel.tsx`, `src/features/bank/MerchantPanel.tsx`
  - What changed: Tokenized semantic panels and icons; deposit copy fields use `CopyField`; merchant ledger uses `StatusBadge`/`EmptyState`; decorative warning icon marked hidden.
  - Why: Reduces one-off bank UI and copy-field drift without changing submissions.
  - Risk level: Medium.
  - Tested: TypeScript gates, bank screenshot, `npm test`.

- `src/pages/merchant/OrderDeskPage.tsx`
  - What changed: Added mobile stacked review cards below `md`; desktop table remains intact; statuses/risk use `StatusBadge`.
  - Why: Fixes mobile table usability and status chip drift.
  - Risk level: High.
  - Tested: TypeScript gates, merchant orders mobile screenshot, `npm test`.

- `src/pages/merchant/DepositsPage.tsx`
  - What changed: Added mobile stacked deposit review cards with persistent labels; desktop table remains intact; desktop action inputs now have `aria-label`.
  - Why: Fixes mobile table usability and placeholder-only action input accessibility.
  - Risk level: High.
  - Tested: TypeScript gates, merchant deposits mobile screenshot, `npm test`.

- `src/canvas/drawConnectFourBoard.ts`, `src/pages/GamePage.tsx`
  - What changed: Board/disc colors use tokens; game canvas has an explicit focus ring.
  - Why: Addresses board token drift and canvas focus visibility.
  - Risk level: Medium.
  - Tested: TypeScript gates, `npm test`.

## 3. Design System Changes

- New tokens: `paper-base`, `paper-soft`, `paper-rule`, `note-yellow`, `note-yellow-border`, `note-blue`, success/warning/danger/info background/text/border, `game-board-line`, `disc-red`, and `disc-blue`.
- Updated shared components: `SketchyButton`, `SketchyContainer`, `AuthInput`, `AuthNotice`.
- New shared components: `StatusBadge`, `EmptyState`, `SketchCard`, `ReadonlyField`, `CopyField`, `MiniMatchCard`.
- Removed duplicate patterns: AuthField now routes through `AuthInput`; bank deposit copy fields use `CopyField`; merchant status chips use `StatusBadge`.
- Remaining gaps: Legal article pattern, full merchant overview/liquidity/alerts card consolidation, deeper game mobile QA, and broader nav unification remain follow-up work.

## 4. Page Fixes

- `/`
  - Problems fixed: Shared CTA button label collision through `SketchyButton`.
  - Screenshots: `ui-implementation-screenshots/landing-desktop.png`, `ui-implementation-screenshots/landing-mobile.png`.

- `/play`, `/leaderboard`
  - Problems fixed: Button collision, mobile tab wrapping, draft option semantics, empty-state consistency, paid-match color drift.
  - Components/tokens reused: `SketchyButton`, `EmptyState`, note/status tokens.
  - Screenshots: `ui-implementation-screenshots/play-desktop.png`, `ui-implementation-screenshots/play-mobile.png`.

- `/bank`
  - Problems fixed: Action-card color drift, transaction badge colors, empty-state styling, mobile bottom spacing.
  - Components/tokens reused: `StatusBadge`, `EmptyState`, semantic tokens.
  - Screenshot: `ui-implementation-screenshots/bank-mobile.png`.

- `/profile/:userId`
  - Problems fixed: Mini-board overflow, match card layout, decorative emoji accessibility, mobile bottom spacing.
  - Components/tokens reused: `MiniMatchCard`, `EmptyState`.
  - Screenshot: `ui-implementation-screenshots/profile-mobile.png`.

- `/auth/login`, `/auth/register`, `/auth/security`
  - Problems fixed: Shared button readability, notice roles, AuthField/AuthInput duplication, security page rounded panel drift.
  - Components/tokens reused: `AuthInput`, `AuthNotice`, `StatusBadge`.
  - Screenshots: `ui-implementation-screenshots/auth-login-desktop.png`, `ui-implementation-screenshots/auth-register-mobile.png`, `ui-implementation-screenshots/auth-security-desktop.png`.

- `/merchant/orders`
  - Problems fixed: Mobile table replaced with stacked review cards; status/risk chips tokenized.
  - Components/tokens reused: `StatusBadge`, `EmptyState`.
  - Screenshot: `ui-implementation-screenshots/merchant-orders-mobile.png`.

- `/merchant/deposits`
  - Problems fixed: Mobile table replaced with stacked review cards; action inputs gained persistent mobile labels and desktop `aria-label`s.
  - Components/tokens reused: `StatusBadge`, `EmptyState`.
  - Screenshot: `ui-implementation-screenshots/merchant-deposits-mobile.png`.

## 5. Accessibility Fixes

- `src/pages/DashboardPage.tsx`: Draft match choices are real button/radio controls with `aria-checked`; next/back actions are semantic buttons.
- `src/features/auth/AuthShell.tsx`: `AuthNotice` now uses `role="alert"` for warning/danger and `role="status"` for info/success.
- `src/pages/merchant/DepositsPage.tsx`: Mobile reconciliation inputs have visible labels; desktop reconciliation inputs have `aria-label`.
- `src/pages/ProfilePage.tsx`, `src/features/bank/DepositPanel.tsx`, `src/features/bank/MerchantPanel.tsx`: Decorative emoji/icons marked with `aria-hidden`.
- `src/pages/GamePage.tsx`: Canvas now has a visible focus outline.
- `src/index.css`: Added reduced-motion fallback.

## 6. Responsive Fixes

- `src/app/AppLayout.tsx`: Authenticated pages use `mobile-bottom-safe`.
- `src/pages/DashboardPage.tsx`: Mobile tab rail is horizontal-scroll instead of wrapped rows.
- `src/pages/ProfilePage.tsx`, `src/components/ui/MiniMatchCard.tsx`: Mini-board uses responsive grid, max width, and aspect ratio.
- `src/pages/merchant/OrderDeskPage.tsx`: Mobile order cards replace clipped table below `md`.
- `src/pages/merchant/DepositsPage.tsx`: Mobile deposit review cards replace clipped table below `md`.

## 7. Testing Results

- Frontend typecheck: `npx tsc --noEmit --pretty false` passed.
- Server typecheck: `npx tsc --project tsconfig.server.json --noEmit --pretty false` passed.
- Lint script: `npm run lint` passed once after the first full UI pass. After the final button implementation, `npm run lint` timed out without compiler output, so the two commands it wraps were run separately and both passed.
- Test suite: `npm test` passed with 215 tests.
- Local app: `npm run dev` attempted, but the started process logged `querySrv ECONNREFUSED _mongodb._tcp.4real.di0wb4t.mongodb.net`. Existing local Vite server at `http://localhost:5173` was available and used for frontend visual QA.
- Manual visual checks: Playwright rendered routes with mocked API responses for `/`, `/play`, `/bank`, `/profile/u1`, `/auth/security`, `/merchant/orders`, and `/merchant/deposits`.
- Known limitations: `/game/:roomId` was not visually verified with a live socket room; screenshots used mocked API responses and do not prove backend auth/payment/socket behavior.

## 8. Remaining Work

- Legal pages still need a readable long-form article pattern.
- Merchant overview, liquidity, and alerts pages still need deeper shared ops-card consolidation.
- `/game/:roomId` needs active/waiting/completed mobile QA with live or fixture-backed socket state.
- Public profile caching/routing and `/lobby` alias were not changed because they are outside this UI-only pass.
- `MobileReviewCard` and `AdminTableShell` could be extracted later if merchant mobile card patterns spread further.

## 9. Regression Risks

- `SketchyButton` changed globally; manually scan CTAs, icon buttons, disabled buttons, and compact table action buttons before merging.
- Merchant order/deposit mobile cards duplicate desktop row rendering; verify future DTO changes update both views.
- Auth field consolidation routes old `AuthField` through `AuthInput`; verify reset, MFA, and complete-profile forms in browser.
- `mobile-bottom-safe` changes authenticated page spacing; verify on iOS/Android viewport sizes.
- Game canvas color/focus changes are presentation-only, but active game rendering should still be checked with real room data.
