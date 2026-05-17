# UI Audit Report

## 1. Executive Summary

The app has a clear and memorable main visual direction: a hand-drawn notebook/game-table style built around Cabin Sketch, lined paper, rough borders, tape, sticky notes, highlighter marks, and simple blue/red/yellow game accents. The best-looking pages are the landing page, `/play` lobby, `/leaderboard`, the auth shell pages, and several merchant overview cards. These pages feel specific to 4real instead of generic SaaS UI.

The weakest-looking areas are not off-brand in concept, but they lose polish through shared component rendering problems, oversized rounded utility panels, dense admin tables, and mobile overlap. The most visible issue is the rough canvas stroke in `SketchyButton`: many button labels are visually crossed by the drawn border, making primary CTAs look broken on landing, auth, bank, lobby, merchant, and mobile screenshots. The next biggest issues are inconsistent radius language (`rough-border` mixed with `rounded-3xl`, `rounded-[28px]`, and pill controls), too many hardcoded semantic colors, and mobile screens where fixed bottom navigation obscures content.

Overall UI readiness: Medium. The brand direction is strong enough for production, but the app needs a focused component-system pass before it will feel consistently polished across all routes.

## 2. Reference Design Standard

The reference design language is defined by the landing page and `/play` lobby. There is no standalone `/lobby` route in `src/app/App.tsx`; `/play` renders `DashboardPage` with the `lobby` tab and should be treated as the lobby benchmark.

- Colors: paper base `#F2EFE9`, ink black `#1A1A1A`, ink blue `#1A365D`, ink red `#9B2C2C`, marker yellow/highlighter `#fff9c4` or `rgba(255,255,0,0.4)`, plus restrained game red/blue disc colors.
- Typography: Cabin Sketch is used globally through `src/index.css`; headings are bold, italic, tight, and often paired with a highlighter stroke. Body copy is also Cabin Sketch, usually bold with low-opacity supporting text.
- Components: `SketchyButton`, `SketchyContainer`, `.rough-border`, `.sticky-note`, `.tape`, and `.highlighter` create the core system.
- Layout style: centered max-width content, white rough cards on lined paper, deliberate gaps, playful rotation/tape details, and clear two-column game/lobby surfaces.
- Button style: hand-drawn rough outline, transparent or marker-yellow fill, hover lift, simple icon plus label.
- Card style: rough black outline, white or sticky-note fill, shadow, tape accent for hero/feature/lobby surfaces.
- Background style: paper texture with subtle ruled lines and dot texture.
- Navigation style: top notebook bar for authenticated pages and marketing header only on landing. Mobile uses a bottom nav.
- Motion/interaction style: modest hover lift, active scale, fade/slide entry, animated landing board, lobby draft reveal.
- General aesthetic: playful, handmade, game-native, and notebook-like. Pages that introduce generic rounded SaaS panels or standard pill-heavy dashboards drift away from this standard.

## 3. Route/Page Inventory

| Route/path | Source file | Score | Match | Main issue | Screenshot path |
|---|---|---:|---|---|---|
| `/` | `src/pages/LandingPage.tsx` | 8 | Yes | Strong reference, but CTA button text is crossed by rough button stroke. | `ui-audit-screenshots/landing-desktop.png`, `ui-audit-screenshots/landing-mobile.png` |
| `/privacy` | `src/pages/PrivacyPolicyPage.tsx` | 7 | Yes | Matches card style, but long legal text is heavy in Cabin Sketch and needs better reading hierarchy. | `ui-audit-screenshots/privacy-desktop.png` |
| `/terms` | `src/pages/TermsOfUsePage.tsx` | 7 | Yes | Same legal readability issue as privacy. | `ui-audit-screenshots/terms-desktop.png` |
| `/auth` | `src/app/App.tsx` | N/A | Partial | Redirect-only route; visual state depends on auth. | Source-only |
| `/auth/login` | `src/pages/auth/LoginPage.tsx` | 7 | Yes | AuthShell matches brand; buttons are visually struck through. | `ui-audit-screenshots/login-desktop.png`, `ui-audit-screenshots/login-mobile.png` |
| `/auth/register` | `src/pages/auth/RegisterPage.tsx` | 7 | Yes | Strong shell, but password visibility button and CTA stroke interfere with legibility. | `ui-audit-screenshots/register-desktop.png`, `ui-audit-screenshots/register-mobile.png` |
| `/auth/forgot-password` | `src/pages/auth/ForgotPasswordPage.tsx` | 7 | Yes | Consistent shell; older `AuthField` implementation duplicates newer `AuthInput`. | `ui-audit-screenshots/forgot-password-desktop.png` |
| `/auth/reset-password` | `src/pages/auth/ResetPasswordPage.tsx` | 7 | Yes | Consistent shell; missing-token state is clear but could be more visually distinct. | `ui-audit-screenshots/reset-password-missing-token-desktop.png` |
| `/auth/verify-email` | `src/pages/auth/VerifyEmailPage.tsx` | 7 | Yes | Consistent shell; notice pattern works. | `ui-audit-screenshots/verify-email-desktop.png` |
| `/auth/magic-link` | `src/pages/auth/MagicLinkPage.tsx` | 7 | Yes | Consistent shell; simple state only. | `ui-audit-screenshots/magic-link-desktop.png` |
| `/auth/approve-login` | `src/pages/auth/ApproveLoginPage.tsx` | 7 | Yes | Consistent shell; simple state only. | `ui-audit-screenshots/approve-login-desktop.png` |
| `/auth/verified` | `src/pages/auth/VerifiedPage.tsx` | 6 | Partial | Secondary link uses generic rounded button instead of sketchy button. | `ui-audit-screenshots/verified-desktop.png` |
| `/auth/mfa` | `src/pages/auth/MfaChallengePage.tsx` | 7 | Yes | Consistent shell; duplicated `AuthField` input style. | `ui-audit-screenshots/mfa-challenge-desktop.png` |
| `/auth/complete-profile` | `src/pages/auth/CompleteProfilePage.tsx` | 7 | Yes | Source matches AuthShell; could not visually test because harness had no incomplete-profile session. | Source-only |
| `/auth/security` | `src/pages/auth/SecuritySettingsPage.tsx` | 5 | Partial | Drifts into rounded SaaS cards and dense security panels; many one-off radii/colors. | `ui-audit-screenshots/security-settings-desktop.png` |
| `/play` | `src/pages/DashboardPage.tsx` | 8 | Yes | Good benchmark, but button rendering and mobile tab layout need polish. | `ui-audit-screenshots/play-lobby-desktop.png`, `ui-audit-screenshots/play-lobby-mobile.png` |
| `/leaderboard` | `src/pages/DashboardPage.tsx` | 8 | Yes | Strong sticky-note style; route name works though it is a dashboard tab. | `ui-audit-screenshots/leaderboard-route-desktop.png` |
| `/bank` | `src/pages/BankPage.tsx` | 6 | Partial | Brand is present, but card/button geometry is inconsistent and mobile bottom nav overlaps content. | `ui-audit-screenshots/bank-portal-desktop.png`, `ui-audit-screenshots/bank-portal-mobile.png` |
| Bank deposit panel | `src/features/bank/DepositPanel.tsx` | 6 | Partial | Uses rough shell but generic rounded inputs, status panels, and hardcoded blues/greens. | `ui-audit-screenshots/bank-deposit-panel-desktop.png` |
| Bank withdraw panel | `src/features/bank/WithdrawPanel.tsx` | 6 | Partial | Consistent enough, but quick-fill and form controls use one-off styles. | `ui-audit-screenshots/bank-withdraw-panel-desktop.png` |
| Bank merchant panel | `src/features/bank/MerchantPanel.tsx` | 5 | Partial | Visually ambitious but dense; giant ledger pane and mixed cards reduce clarity. | `ui-audit-screenshots/bank-merchant-panel-desktop.png` |
| `/game/:roomId` | `src/pages/GamePage.tsx` | 6 | Partial | Strong game layout, but completed archive board appears empty and side cards/buttons are cramped. | `ui-audit-screenshots/game-completed-desktop.png` |
| `/profile/:userId` | `src/pages/ProfilePage.tsx` | 5 | Partial | Brand fit is good, but mini-board overflows horizontally on desktop/mobile. | `ui-audit-screenshots/profile-desktop.png`, `ui-audit-screenshots/profile-mobile.png` |
| `/merchant` | `src/pages/merchant/MerchantDashboardPage.tsx` | 6 | Partial | Good operator direction, but rounded SaaS controls and chart framing diverge from landing/lobby. | `ui-audit-screenshots/merchant-overview-desktop.png`, `ui-audit-screenshots/merchant-overview-mobile.png` |
| `/merchant/orders` | `src/pages/merchant/OrderDeskPage.tsx` | 5 | Partial | Dense table and pill filters are visually inconsistent; mobile table is partially hidden by bottom nav. | `ui-audit-screenshots/merchant-orders-desktop.png`, `ui-audit-screenshots/merchant-orders-mobile.png` |
| `/merchant/deposits` | `src/pages/merchant/DepositsPage.tsx` | 5 | Partial | Admin table is functional but generic and horizontally heavy. | `ui-audit-screenshots/merchant-deposits-desktop.png`, `ui-audit-screenshots/merchant-deposits-mobile.png` |
| `/merchant/liquidity` | `src/pages/merchant/LiquidityPage.tsx` | 6 | Partial | Strong content, but form cards use many one-off rough/rounded hybrids. | `ui-audit-screenshots/merchant-liquidity-desktop.png` |
| `/merchant/alerts` | `src/pages/merchant/AlertsPage.tsx` | 6 | Partial | Clear hierarchy; alert cards use rounded utility style more than sketchy cards. | `ui-audit-screenshots/merchant-alerts-desktop.png` |
| `/merchant/*` | `src/app/App.tsx` | N/A | N/A | Redirects to `/merchant`; source-only. | Source-only |
| `*` not found | `src/pages/NotFoundPage.tsx` | 6 | Partial | Good concept, but CTA button stroke crosses text; `/lobby` currently lands here. | `ui-audit-screenshots/not-found-desktop.png`, `ui-audit-screenshots/lobby-route-404-desktop.png` |

## 4. Page-by-Page Findings

### Page: Landing page

- Route: `/`
- Source file: `src/pages/LandingPage.tsx`
- Visual match with landing/play/lobby: Yes; this is the primary reference.
- Score: 8
- Screenshot path: `ui-audit-screenshots/landing-desktop.png`, `ui-audit-screenshots/landing-mobile.png`
- Main problems: Primary CTA buttons render with rough strokes crossing the label; some mobile CTAs are small and low contrast.
- Inconsistent components: Inline SVG chart and several hardcoded card fills are one-off but acceptable for hero art.
- Inconsistent colors: `bg-[#E8F0FB]`, inline SVG `#1A365D`, `rgba(26,54,93,0.10)`, CTA stripe inline gradient.
- Typography issues: Good overall; the entire app font makes long body copy less readable but fits the brand.
- Layout/responsiveness issues: Mobile stacks well, but header CTA is cramped.
- Accessibility issues: Animated board lacks reduced-motion handling; icon SVGs are decorative and mostly hidden correctly.
- Recommended improvements: Fix `SketchyButton`, tokenise the blue note and CTA stripe colors, add reduced-motion fallback for the board animation.
- Existing components/design patterns to reuse: This page should remain the source for `rough-border`, sticky note, tape, highlighter, feature cards, and CTA bands.
- Priority: High for shared button fix; Low for page-specific polish.

### Page: Privacy policy

- Route: `/privacy`
- Source file: `src/pages/PrivacyPolicyPage.tsx`
- Visual match with landing/play/lobby: Yes.
- Score: 7
- Screenshot path: `ui-audit-screenshots/privacy-desktop.png`
- Main problems: Long-form legal content is hard to scan in all-bold Cabin Sketch.
- Inconsistent components: None significant.
- Inconsistent colors: None significant beyond inherited paper/card colors.
- Typography issues: Body text should use a legal/content variant with less weight and more line height while keeping brand headings.
- Layout/responsiveness issues: Desktop width is good; mobile was source-inspected but not separately screenshotted.
- Accessibility issues: Long text in decorative font may reduce readability.
- Recommended improvements: Add a reusable `LegalPage` or content article pattern with lighter body weight, clearer section spacing, and same rough card shell.
- Existing components/design patterns to reuse: AuthShell-style eyebrow/title/highlighter could make legal pages feel more connected.
- Priority: Low

### Page: Terms of use

- Route: `/terms`
- Source file: `src/pages/TermsOfUsePage.tsx`
- Visual match with landing/play/lobby: Yes.
- Score: 7
- Screenshot path: `ui-audit-screenshots/terms-desktop.png`
- Main problems: Same legal readability issue as privacy.
- Inconsistent components: None significant.
- Inconsistent colors: None significant.
- Typography issues: All-bold text harms long-form reading.
- Layout/responsiveness issues: Same as privacy.
- Accessibility issues: Decorative font and weight reduce readability for dense legal copy.
- Recommended improvements: Share the legal/content article pattern recommended for privacy.
- Existing components/design patterns to reuse: `rough-border`, tape, highlighter heading.
- Priority: Low

### Page: Auth index

- Route: `/auth`
- Source file: `src/app/App.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: N/A
- Screenshot path: Source-only
- Main problems: Redirect-only route; no unique UI to audit.
- Inconsistent components: None.
- Inconsistent colors: None.
- Typography issues: None.
- Layout/responsiveness issues: None.
- Accessibility issues: None.
- Recommended improvements: None unless adding an auth chooser later.
- Existing components/design patterns to reuse: `AuthShell` if a visible auth index is added.
- Priority: Low

### Page: Auth pages

- Route: `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/magic-link`, `/auth/approve-login`, `/auth/mfa`, `/auth/complete-profile`
- Source file: `src/pages/auth/*.tsx`, `src/features/auth/AuthShell.tsx`, `src/features/auth/components/AuthInput.tsx`
- Visual match with landing/play/lobby: Yes for most pages.
- Score: 7 average
- Screenshot path: `ui-audit-screenshots/login-desktop.png`, `register-desktop.png`, `forgot-password-desktop.png`, `reset-password-missing-token-desktop.png`, `verify-email-desktop.png`, `magic-link-desktop.png`, `approve-login-desktop.png`, `mfa-challenge-desktop.png`, plus mobile login/register screenshots.
- Main problems: Buttons are frequently crossed by canvas strokes; `AuthField` and `AuthInput` duplicate the input system; Google button uses multi-color Google SVG that is acceptable but visually louder than the app palette.
- Inconsistent components: `ForgotPasswordPage`, `ResetPasswordPage`, `VerifyEmailPage`, `MfaChallengePage`, and `CompleteProfilePage` use `AuthField`; login/register use newer `AuthInput`.
- Inconsistent colors: Notice colors use green/yellow/red/blue utility palettes rather than a documented semantic token set.
- Typography issues: Auth headings are strong; small uppercase labels can become faint on mobile.
- Layout/responsiveness issues: Register mobile is readable, but button stroke/label collisions are prominent.
- Accessibility issues: Inputs are labeled; password toggle has an accessible label. Notices should use `role="status"` or `role="alert"` where appropriate.
- Recommended improvements: Consolidate `AuthField` into `AuthInput`, fix `SketchyButton`, create semantic `AuthNotice` tokens, and review tiny label contrast.
- Existing components/design patterns to reuse: Keep `AuthShell` as the shared pattern.
- Priority: High

### Page: Verified success

- Route: `/auth/verified`
- Source file: `src/pages/auth/VerifiedPage.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 6
- Screenshot path: `ui-audit-screenshots/verified-desktop.png`
- Main problems: Secondary "Review security settings" link uses a generic rounded pill style rather than `SketchyButton` or a shared text-link pattern.
- Inconsistent components: Mixed `SketchyButton` plus raw rounded link.
- Inconsistent colors: Uses `border-black/12`, which is not a standard theme token.
- Typography issues: Good.
- Layout/responsiveness issues: Good.
- Accessibility issues: Link is semantic.
- Recommended improvements: Use a secondary sketchy button or shared auth secondary action component.
- Existing components/design patterns to reuse: `SketchyButton` secondary variant.
- Priority: Medium

### Page: Security settings

- Route: `/auth/security`
- Source file: `src/pages/auth/SecuritySettingsPage.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 5
- Screenshot path: `ui-audit-screenshots/security-settings-desktop.png`
- Main problems: The page drifts into rounded SaaS panels (`rounded-[28px]`, `rounded-[24px]`, pill badges) inside an AuthShell. It looks more polished than generic UI, but less like the landing/lobby notebook cards.
- Inconsistent components: Summary cards, setup steps, recovery code tiles, device cards, and badges are local one-offs.
- Inconsistent colors: `bg-[#fff9c4]`, `bg-[#FBFAF7]`, red/green utility panels, custom rounded radii.
- Typography issues: Uses `font-black` in several places, which is stronger and cleaner than the reference's italic sketch heading rhythm.
- Layout/responsiveness issues: Desktop layout is serviceable; long session rows need mobile confirmation.
- Accessibility issues: Secret/OTP fields are labeled. Destructive MFA actions need stronger danger hierarchy and possibly `aria-describedby` tying warnings to forms.
- Recommended improvements: Extract `SecuritySummaryCard`, `SecurityStepCard`, and `DeviceSessionCard`, but style them with rough-border/tape/highlighter language. Reduce pill-heavy styling.
- Existing components/design patterns to reuse: `SketchyContainer`, `AuthNotice`, `AuthInput`.
- Priority: Medium

### Page: Play lobby

- Route: `/play`
- Source file: `src/pages/DashboardPage.tsx`
- Visual match with landing/play/lobby: Yes.
- Score: 8
- Screenshot path: `ui-audit-screenshots/play-lobby-desktop.png`, `ui-audit-screenshots/play-new-draft-desktop.png`, `ui-audit-screenshots/play-lobby-mobile.png`
- Main problems: Benchmark page is strong, but tab buttons and New Draft button are visually crossed by rough strokes. Empty-state boxes use `rounded-xl` dashed borders that feel less handmade.
- Inconsistent components: Match type options wrap `SketchyButton` inside clickable `div`s with `pointer-events-none`; this weakens semantics and keyboard behavior.
- Inconsistent colors: Paid public uses amber utility classes outside the core ink-red/blue/yellow system.
- Typography issues: Strong and on-brand.
- Layout/responsiveness issues: Mobile tabs wrap into two rows and are hard to scan; bottom nav reduces available height.
- Accessibility issues: Clickable `div` wrappers for match type and draft next/back actions are not semantic buttons.
- Recommended improvements: Fix `SketchyButton`, make draft options real buttons/radio cards, tokenise paid-match amber, and create a responsive tab rail.
- Existing components/design patterns to reuse: This page defines the lobby card, tab, empty-state, and sticky-note patterns.
- Priority: High

### Page: Leaderboard

- Route: `/leaderboard`
- Source file: `src/pages/DashboardPage.tsx`
- Visual match with landing/play/lobby: Yes.
- Score: 8
- Screenshot path: `ui-audit-screenshots/leaderboard-route-desktop.png`, `ui-audit-screenshots/play-leaderboard-tab-desktop.png`
- Main problems: Empty/loading state for failed leaderboard is not visually distinct beyond toast.
- Inconsistent components: Uses dashboard tab content instead of a dedicated page wrapper; acceptable.
- Inconsistent colors: Trophy yellow utility color.
- Typography issues: Good.
- Layout/responsiveness issues: Good at desktop; mobile not separately captured for leaderboard tab.
- Accessibility issues: Links to profiles are semantic.
- Recommended improvements: Add branded loading/empty/error states inside the sticky note.
- Existing components/design patterns to reuse: Sticky note leaderboard from landing Top Sketchers.
- Priority: Low

### Page: Bank portal

- Route: `/bank`
- Source file: `src/pages/BankPage.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 6
- Screenshot path: `ui-audit-screenshots/bank-portal-desktop.png`, `ui-audit-screenshots/bank-portal-mobile.png`
- Main problems: Portal cards use `SketchyContainer`, but the big inner icon circles and generic green/red/yellow cards feel less like the game/lobby system. Button labels are crossed. Mobile bottom nav overlaps the withdraw card area.
- Inconsistent components: Three local action cards should become a reusable `BankActionCard`.
- Inconsistent colors: `bg-green-100`, `bg-red-100`, `bg-yellow-100`, `text-yellow-700`, and merchant card border are utility colors rather than tokens.
- Typography issues: Good headings; transaction history heading stacks awkwardly on mobile.
- Layout/responsiveness issues: Mobile bottom nav overlays content; page needs larger bottom padding or scroll margin.
- Accessibility issues: Action buttons are semantic, but icon-only color meaning should have text support, which it does.
- Recommended improvements: Standardize action cards with rough border, tape, and branded accent token variants. Add mobile bottom spacing.
- Existing components/design patterns to reuse: Landing feature cards and `/play` lobby section card.
- Priority: High

### Page: Bank deposit panel

- Route: `/bank` internal deposit view
- Source file: `src/features/bank/DepositPanel.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 6
- Screenshot path: `ui-audit-screenshots/bank-deposit-panel-desktop.png`
- Main problems: Good sketch shell, but details use generic rounded inputs and hardcoded blue/green fills.
- Inconsistent components: Copy input groups are local one-offs.
- Inconsistent colors: `fill="#1a1a1a"`, `fill="#15803d"`, `stroke="#166534"`, `fill="#2962ff"`, `bg-gray-300`.
- Typography issues: Good.
- Layout/responsiveness issues: Not mobile-captured separately.
- Accessibility issues: Readonly inputs are labeled; TonConnect button disabled text is clear.
- Recommended improvements: Extract a `CopyField` component and use semantic button tokens.
- Existing components/design patterns to reuse: `AuthInput` field styling and `SketchyButton`.
- Priority: Medium

### Page: Bank withdraw panel

- Route: `/bank` internal withdraw view
- Source file: `src/features/bank/WithdrawPanel.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 6
- Screenshot path: `ui-audit-screenshots/bank-withdraw-panel-desktop.png`
- Main problems: Form is simple, but quick-fill and balance panels are generic rounded boxes.
- Inconsistent components: Quick-fill max action is a local mini button.
- Inconsistent colors: `bg-blue-600`, `fill="#2962ff"`, red utility icon color.
- Typography issues: Good.
- Layout/responsiveness issues: Not mobile-captured separately.
- Accessibility issues: Inputs are labeled.
- Recommended improvements: Use a shared form field and small action button variant.
- Existing components/design patterns to reuse: `AuthInput`, `SketchyButton` compact variant.
- Priority: Medium

### Page: Bank merchant panel

- Route: `/bank` internal merchant view
- Source file: `src/features/bank/MerchantPanel.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 5
- Screenshot path: `ui-audit-screenshots/bank-merchant-panel-desktop.png`
- Main problems: The surface is dense and visually fragmented: sticky-note instructions, upload card, tab card, large ledger card, rounded panels, and many semantic color blocks compete.
- Inconsistent components: Merchant instruction cards, proof dropzone, trade tabs, payment summary, order ledger rows, admin action buttons are all local.
- Inconsistent colors: Yellow/green/blue/red utility panels, hardcoded button fills/strokes, `rounded-3xl`.
- Typography issues: Heading style is on-brand, but dense form copy is hard to scan in the decorative font.
- Layout/responsiveness issues: Desktop ledger column is very tall and sparse when empty; source suggests mobile stacking but not separately screenshotted.
- Accessibility issues: File upload label is semantic. Trade tabs use ARIA tab roles.
- Recommended improvements: Split merchant trade into clearer reusable panels: instruction note, proof dropzone, trade form, and ledger list. Use rough card shape consistently and reduce nested card stacking.
- Existing components/design patterns to reuse: Lobby draft card and bank action cards.
- Priority: High

### Page: Game room

- Route: `/game/:roomId`
- Source file: `src/pages/GamePage.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 6
- Screenshot path: `ui-audit-screenshots/game-completed-desktop.png`
- Main problems: The overall game-table layout is strong, but the completed archived board rendered empty in the visual test while the match log had moves. Side panels and buttons are cramped.
- Inconsistent components: Pot card uses solid blue card, match log uses yellow sketch container, verdict uses green sketch container. This is acceptable but should be tokenized.
- Inconsistent colors: `bg-[#ef4444]`, `bg-[#3b82f6]`, `fill="#dcfce7"`, yellow utility wager badges.
- Typography issues: Good.
- Layout/responsiveness issues: Desktop is acceptable; mobile game state was not captured.
- Accessibility issues: Canvas has keyboard handlers and label/help text, which is good. Game board canvas still needs visible focus styling checked.
- Recommended improvements: Ensure archived/completed boards render historical disc state, tokenise game colors, and add a mobile game-specific screenshot QA pass.
- Existing components/design patterns to reuse: Landing board preview and lobby match cards.
- Priority: Medium

### Page: Profile

- Route: `/profile/:userId`
- Source file: `src/pages/ProfilePage.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 5
- Screenshot path: `ui-audit-screenshots/profile-desktop.png`, `ui-audit-screenshots/profile-mobile.png`
- Main problems: Profile identity card is on-brand, but the mini-board visualization overflows horizontally outside the match card on desktop and mobile.
- Inconsistent components: Achievement cards and mini-board are local one-offs.
- Inconsistent colors: Inline SVG black, trophy emoji, red/orange icon utility colors.
- Typography issues: Player names wrap awkwardly in mini-sketch cards on mobile.
- Layout/responsiveness issues: Mini-board grid is fixed too wide and overflows the card. Mobile bottom nav overlays the portfolio section.
- Accessibility issues: Trophy/clip emoji decorations are not hidden from assistive tech.
- Recommended improvements: Build a responsive `MiniMatchCard` with constrained board dimensions, hide decorative emoji/icons with `aria-hidden`, and add mobile bottom padding.
- Existing components/design patterns to reuse: Game board drawing style and lobby card spacing.
- Priority: High

### Page: Merchant overview

- Route: `/merchant`
- Source file: `src/pages/merchant/MerchantDashboardPage.tsx`, `src/components/merchant/MerchantLayout.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 6
- Screenshot path: `ui-audit-screenshots/merchant-overview-desktop.png`, `ui-audit-screenshots/merchant-overview-mobile.png`
- Main problems: Admin shell is usable and branded, but it leans into clean rounded SaaS controls inside rough cards. The chart has too much empty vertical space and its outer frame looks oversized.
- Inconsistent components: Metric cards use `SketchyContainer`, but nav pills, status pills, charts, queue cards, and alert cards are local patterns.
- Inconsistent colors: Utility red/yellow/green/blue status chips; repeated hardcoded bar gradient.
- Typography issues: Good headings; admin dense copy may benefit from a more legible body style.
- Layout/responsiveness issues: Mobile merchant header consumes much of the viewport before page content; horizontal nav pills are acceptable but cramped.
- Accessibility issues: Nav labels exist; refresh button has label.
- Recommended improvements: Create merchant design primitives (`MerchantMetricCard`, `MerchantStatusBadge`, `MerchantTableShell`) that still use rough-border/tape cues.
- Existing components/design patterns to reuse: `SketchyContainer` metric cards and landing feature-card hierarchy.
- Priority: Medium

### Page: Merchant order desk

- Route: `/merchant/orders`
- Source file: `src/pages/merchant/OrderDeskPage.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 5
- Screenshot path: `ui-audit-screenshots/merchant-orders-desktop.png`, `ui-audit-screenshots/merchant-orders-mobile.png`
- Main problems: Table-heavy admin UI is functional but visually weaker than the reference pages. On mobile, the table area is clipped/obscured by bottom nav and the filter buttons wrap into a cluttered grid.
- Inconsistent components: Filter buttons, table shell, pagination, status chips, risk chips are all local.
- Inconsistent colors: `fill="#dbeafe"`, utility status colors.
- Typography issues: All-caps table headers with large tracking are hard to read in dense tables.
- Layout/responsiveness issues: Mobile table needs a card/list alternative instead of horizontal table plus bottom nav overlap.
- Accessibility issues: Table semantics are good; action buttons need clear disabled/loading status text.
- Recommended improvements: Create responsive admin list cards for mobile and a branded `DataTable` shell for desktop.
- Existing components/design patterns to reuse: Merchant metric cards and rough-bordered section shell.
- Priority: High

### Page: Merchant deposits

- Route: `/merchant/deposits`
- Source file: `src/pages/merchant/DepositsPage.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 5
- Screenshot path: `ui-audit-screenshots/merchant-deposits-desktop.png`, `ui-audit-screenshots/merchant-deposits-mobile.png`
- Main problems: Deposit replay and review table are dense and generic compared with the lobby/landing visual language.
- Inconsistent components: Replay window form, deposit table rows, reconciliation inputs, and action buttons are local.
- Inconsistent colors: `fill="#dbeafe"`, yellow status chips, red/green action utilities.
- Typography issues: Hashes and timestamps in Cabin Sketch are hard to parse.
- Layout/responsiveness issues: Mobile table is too wide and should become stacked review cards.
- Accessibility issues: Datetime inputs are nested in labels; reconciliation text inputs need visible labels, not only placeholders.
- Recommended improvements: Convert mobile rows to review cards, add shared admin form field styling, and tokenise status chips.
- Existing components/design patterns to reuse: `AuthInput`/form field style and merchant shell.
- Priority: High

### Page: Merchant liquidity

- Route: `/merchant/liquidity`
- Source file: `src/pages/merchant/LiquidityPage.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 6
- Screenshot path: `ui-audit-screenshots/merchant-liquidity-desktop.png`
- Main problems: Content hierarchy is clear, but many subcards use `rounded-3xl` and rough-border mixes inconsistently.
- Inconsistent components: Wallet address cards, flow summary cards, worker rows, and settlement config inputs are local.
- Inconsistent colors: Green/red utility flow cards, `border-ink-blue border-2` on one metric card, generic form background.
- Typography issues: Long wallet addresses in Cabin Sketch are difficult to verify.
- Layout/responsiveness issues: Desktop works; mobile not separately captured.
- Accessibility issues: Inputs are labeled.
- Recommended improvements: Use a shared `OpsField`, `OpsStatusRow`, and rough section card; use a mono/system fallback for wallet addresses only if brand permits.
- Existing components/design patterns to reuse: Merchant metric cards and `AuthField` label rhythm.
- Priority: Medium

### Page: Merchant alerts

- Route: `/merchant/alerts`
- Source file: `src/pages/merchant/AlertsPage.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 6
- Screenshot path: `ui-audit-screenshots/merchant-alerts-desktop.png`
- Main problems: Alert feed is clear, but rounded alert cards and pills feel closer to generic admin UI than sketch notebook cards.
- Inconsistent components: Alert severity chip and alert item are local.
- Inconsistent colors: Utility severity palettes.
- Typography issues: Good.
- Layout/responsiveness issues: Desktop good.
- Accessibility issues: Target links are semantic.
- Recommended improvements: Create shared alert card/chip tokens and apply rough border or sticky-note variants by severity.
- Existing components/design patterns to reuse: `AuthNotice` semantic tones and landing feature card structure.
- Priority: Medium

### Page: Not found and requested `/lobby`

- Route: `*`, requested `/lobby`
- Source file: `src/pages/NotFoundPage.tsx`, `src/app/App.tsx`
- Visual match with landing/play/lobby: Partial.
- Score: 6
- Screenshot path: `ui-audit-screenshots/not-found-desktop.png`, `ui-audit-screenshots/lobby-route-404-desktop.png`
- Main problems: `/lobby` is not defined and renders 404. NotFound card is branded, but CTA button text is crossed.
- Inconsistent components: None beyond `SketchyButton` issue.
- Inconsistent colors: None significant.
- Typography issues: Good.
- Layout/responsiveness issues: Good.
- Accessibility issues: Button is semantic.
- Recommended improvements: Either add `/lobby` as an alias redirect to `/play` later or update navigation/docs to consistently call `/play` the lobby. Fix shared button rendering.
- Existing components/design patterns to reuse: `SketchyContainer`.
- Priority: Medium

## 5. Component Consistency Problems

| Component type | Files affected | Current problem | Recommended shared component or design token | Priority | Risk level if changed later |
|---|---|---|---|---|---|
| Sketchy buttons | `src/components/SketchyButton.tsx`, most pages | Canvas stroke crosses text labels and makes CTAs look broken. | Fix `SketchyButton` drawing/insets/layering once; add variants for primary, secondary, danger, compact, icon. | High | Medium |
| Auth inputs | `src/features/auth/AuthShell.tsx`, `src/features/auth/components/AuthInput.tsx`, auth pages | `AuthField` and `AuthInput` duplicate similar label/input/error behavior. | Consolidate into `AuthInput` and `AuthTextarea` with consistent error/success/hint slots. | High | Medium |
| Cards/containers | `BankPage`, `MerchantPanel`, `SecuritySettingsPage`, merchant pages | Rough cards, sticky notes, rounded SaaS panels, and plain bordered boxes mix freely. | Define `SketchCard` variants: `paper`, `note`, `ops`, `danger`, `empty`. | High | Medium |
| Status badges/chips | `MerchantLayout`, merchant pages, `SecuritySettingsPage`, `BankPage` | Many local `rounded-full` chip styles and utility colors. | Shared `StatusBadge` with semantic tokens: success, warning, danger, info, neutral. | Medium | Low |
| Tables/admin lists | `OrderDeskPage`, `DepositsPage` | Desktop tables are dense; mobile relies on clipped horizontal tables. | Shared `DataTable` plus `MobileReviewCard` pattern. | High | High |
| Empty states | `/play`, bank history, merchant pages, profile | Empty states use dashed rounded boxes with inconsistent copy/weight. | Shared `EmptyState` using rough-border/dashed sketch treatment and optional action. | Medium | Low |
| Navigation | `Navbar`, `PublicLayout`, `MerchantLayout` | Top nav, public nav, mobile bottom nav, merchant nav each use custom link styles. | Shared nav item styles/tokens for active, hover, icon+label, bottom nav. | Medium | Medium |
| Copy fields | `DepositPanel`, `SecuritySettingsPage`, `LiquidityPage` | Repeated read-only/copy field styles. | Shared `CopyField` and `ReadonlyField` components. | Medium | Low |
| Mini match cards | `ProfilePage` | Mini-board overflows and uses fixed visual dimensions. | Extract responsive `MiniMatchCard`/`MiniBoardPreview`. | High | Medium |
| Notices/toasts | `AuthNotice`, `ToastProvider`, merchant errors | Semantic colors are duplicated and hardcoded. | Shared semantic color tokens and `Notice` component variants. | Medium | Low |

## 6. Color and Theme Problems

| File | Current color/class/style | Problem | Recommended replacement | Theme token? | Priority |
|---|---|---|---|---|---|
| `src/index.css` | `#fff9c4`, `#fbc02d` in `.sticky-note` | Sticky-note color is central but not fully tokenized. | `--color-note-yellow`, `--color-note-yellow-border`. | Yes | High |
| `src/index.css` | `#D1D5DB` paper line color | Hardcoded paper rule color. | `--color-paper-rule`. | Yes | Medium |
| `src/components/Navbar.tsx` | `border-[#1a1a1a]` | Duplicates `ink-black`. | `border-ink-black`. | Existing | Medium |
| `src/components/SketchyButton.tsx` | `stroke = '#1a1a1a'`, `activeColor = '#e5e7eb'` | Component defaults bypass theme. | Use CSS vars or named variant tokens. | Yes | High |
| `src/components/SketchyContainer.tsx` | `stroke = '#1a1a1a'` | Bypasses theme. | Use `var(--color-ink-black)`. | Existing | Medium |
| `src/app/ToastProvider.tsx` | `bg-[#dcfce7]`, `bg-[#fee2e2]`, `bg-[#fef3c7]`, `bg-[#e0f2fe]` | Hardcoded semantic palette separate from AuthNotice/merchant. | `--color-success-bg`, `--color-danger-bg`, `--color-warning-bg`, `--color-info-bg`. | Yes | Medium |
| `src/canvas/drawConnectFourBoard.ts` | `#4338ca`, `#ef4444`, `#3b82f6` | Board blue differs from ink blue and is not tokenized. | `--color-board-line`, `--color-disc-red`, `--color-disc-blue`. | Yes | High |
| `src/pages/GamePage.tsx` | `bg-[#ef4444]`, `bg-[#3b82f6]` | Duplicates disc colors outside canvas. | `bg-disc-red`, `bg-disc-blue`. | Yes | High |
| `src/pages/LandingPage.tsx` | `bg-[#E8F0FB]` | Hero note blue not tokenized. | `--color-note-blue`. | Yes | Medium |
| `src/pages/LandingPage.tsx` | Inline repeating gradient in CTA | One-off stripe style. | Shared `cta-stripe` utility/class. | Yes | Low |
| `src/pages/auth/SecuritySettingsPage.tsx` | `bg-[#fff9c4]`, `bg-[#FBFAF7]` | Hardcoded note/off-paper fills. | `bg-note-yellow`, `bg-paper-soft`. | Yes | Medium |
| `src/features/bank/DepositPanel.tsx` | `fill="#15803d"`, `stroke="#166534"`, `fill="#2962ff"` | Hardcoded button fills. | Semantic button variants. | Yes | Medium |
| `src/features/bank/WithdrawPanel.tsx` | `bg-blue-600`, `fill="#2962ff"` | Blue does not match ink blue. | `bg-ink-blue`, `fill=var(--color-ink-blue)`. | Existing | Medium |
| `src/features/bank/MerchantPanel.tsx` | Green/red/yellow/blue utility panels | Too many competing accents. | Limit to semantic tokens with subdued paper fills. | Yes | High |
| `src/pages/merchant/*` | `fill="#dbeafe"`, utility status chip palettes | Admin pages use generic Tailwind palette. | Shared `StatusBadge` semantic tokens. | Yes | Medium |

## 7. Typography Problems

| Page/component | File | Current problem | Recommended fix | Priority |
|---|---|---|---|---|
| Legal pages | `PrivacyPolicyPage.tsx`, `TermsOfUsePage.tsx` | Long body copy is all-bold Cabin Sketch, reducing readability. | Use a lighter content text style while keeping brand headings. | Medium |
| Admin tables | `OrderDeskPage.tsx`, `DepositsPage.tsx` | High-tracking uppercase table headers are hard to scan. | Use tighter tracking and slightly heavier contrast only for column labels. | Medium |
| Security settings | `SecuritySettingsPage.tsx` | `font-black` rounded panels feel different from italic sketch hierarchy. | Use `font-bold italic` headings and shared section headers. | Low |
| Profile mini cards | `ProfilePage.tsx` | Player names wrap awkwardly and crowd mini-board preview. | Add responsive text constraints and smaller compact card labels. | High |
| Bank mobile | `BankPage.tsx` | Transaction heading wraps into many lines. | Use responsive heading size and max-width. | Medium |
| Auth small labels | `AuthShell.tsx`, `AuthInput.tsx` | Very small uppercase labels can be faint on mobile. | Increase opacity or size slightly for form labels. | Medium |

## 8. Responsiveness Problems

| Page | Breakpoint | Problem | Recommended fix | Priority |
|---|---|---|---|---|
| `/play` | Mobile 390px | Dashboard tab rail wraps into two rows and consumes vertical space. | Use horizontal scroll tab rail or compact icon+label segmented control. | Medium |
| `/bank` | Mobile 390px | Fixed bottom nav overlaps the withdraw card area and reduces readable viewport. | Add app-level bottom padding/safe-area for authenticated content. | High |
| `/profile/:userId` | Desktop and mobile | Mini-board preview overflows out of card. | Constrain board width with `max-width`, `aspect-ratio`, and responsive grid. | High |
| `/merchant/orders` | Mobile 390px | Table area is clipped and bottom nav overlays content. | Replace mobile table with stacked order cards and add bottom padding. | High |
| `/merchant/deposits` | Mobile 390px | Dense table cannot fit comfortably. | Use stacked deposit review cards with labeled fields. | High |
| `/merchant` | Mobile 390px | Merchant sticky header plus nav/pocket snapshot pushes content down. | Collapse snapshot behind disclosure or move it below route heading. | Medium |
| `/game/:roomId` | Mobile source-only | Game board/sidebar likely need dedicated mobile QA. | Capture active/waiting/completed game states on mobile and constrain side panels below board. | Medium |
| Auth pages | Mobile 390px | Buttons and password toggle are visually cramped due shared button issue. | Fix `SketchyButton` and compact icon button variant. | High |

## 9. Accessibility Problems

| Page/component | Problem | Impact | Recommended fix | Priority |
|---|---|---|---|---|
| `SketchyButton` | Rough stroke crosses labels visually. | Reduces readability for all users and may look disabled/broken. | Adjust canvas drawing bounds/layering and add visual regression screenshots. | High |
| `/play` draft options | Clickable `div`s wrap pointer-disabled buttons. | Keyboard users cannot reliably select options. | Use real buttons or radio group cards with `aria-pressed`/`role=radio`. | High |
| Profile decorations | Emoji paperclip/trophy icons are not marked decorative. | Screen readers may announce irrelevant symbols. | Add `aria-hidden="true"` to decorative emoji/icons. | Low |
| Auth notices/toasts | Notices do not consistently expose alert/status roles. | Assistive tech may miss errors/success messages. | Add `role="alert"` for errors/warnings and `role="status"` for info/success. | Medium |
| Merchant deposit reconciliation inputs | Action inputs rely on placeholders. | Placeholder is not a persistent accessible label. | Add visible labels or `aria-label` for target user and note fields. | High |
| Game canvas | Canvas has good label/help, but visible focus state was not confirmed. | Keyboard players may not know the board is focused. | Add explicit focus ring/class on canvas. | Medium |
| Icon-only navbar links | Some are labeled, but bottom logout button uses icon+text with crossed text. | Mostly acceptable, but visual issue remains. | Keep labels and fix compact button rendering. | Medium |
| Legal text | Decorative font for dense copy. | Reading fatigue and potential dyslexia/low-vision difficulty. | Use readable body style. | Low |
| Motion | Landing board and bounce animations lack reduced-motion handling. | Motion-sensitive users may be affected. | Add `prefers-reduced-motion` fallbacks. | Medium |

## 10. UI Enhancement Opportunities

### High Impact

- Affected page/component: `SketchyButton` across the app
  - Why it improves the product: Fixes the most visible polish defect and improves CTA readability everywhere.
  - Suggested direction: Rework canvas bounds/layering, define variants, and screenshot-test normal/hover/disabled states.
  - Risk level: Medium

- Affected page/component: `/profile/:userId` mini match cards
  - Why it improves the product: Removes obvious overflow on a public identity page.
  - Suggested direction: Extract responsive `MiniMatchCard` with fixed board aspect ratio and constrained content columns.
  - Risk level: Medium

- Affected page/component: Merchant order/deposit mobile screens
  - Why it improves the product: Admin workflows become usable on narrow screens instead of clipped tables.
  - Suggested direction: Add mobile card views below `md` and preserve desktop tables above `md`.
  - Risk level: High

- Affected page/component: Bank portal and merchant trade panel
  - Why it improves the product: Aligns money flows with the same visual confidence as the lobby.
  - Suggested direction: Standardize action cards, form fields, status panels, and bottom padding.
  - Risk level: Medium

### Medium Impact

- Affected page/component: Auth input system
  - Why it improves the product: Reduces duplicated styles and future drift.
  - Suggested direction: Replace `AuthField` usages with `AuthInput`/`AuthTextarea` variants.
  - Risk level: Medium

- Affected page/component: Merchant shell
  - Why it improves the product: Keeps admin views professional while preserving 4real brand.
  - Suggested direction: Shared merchant metric card, status badge, table shell, and mobile nav treatment.
  - Risk level: Medium

- Affected page/component: Color tokens
  - Why it improves the product: Prevents random Tailwind utility palettes from diluting the brand.
  - Suggested direction: Add note, board, semantic status, and paper-soft tokens in `src/index.css`.
  - Risk level: Low

- Affected page/component: `/lobby`
  - Why it improves the product: User/docs terminology matches app routing.
  - Suggested direction: Add a redirect alias from `/lobby` to `/play` later, or standardize copy around `/play`.
  - Risk level: Low

### Nice-to-have

- Affected page/component: Legal pages
  - Why it improves the product: Improves readability without changing visual identity.
  - Suggested direction: Shared article layout with lighter body text.
  - Risk level: Low

- Affected page/component: Landing animation and lobby transitions
  - Why it improves the product: More accessible and polished motion.
  - Suggested direction: Add reduced-motion CSS and keep existing animation for default users.
  - Risk level: Low

- Affected page/component: Empty/loading states
  - Why it improves the product: Makes sparse states feel intentional.
  - Suggested direction: Shared `EmptyState` and `LoadingState` with rough dashed card and optional action.
  - Risk level: Low

## 11. Recommended Implementation Plan

### Phase 1: Design Tokens and Shared Components

- What to standardize: Button variants, card variants, semantic status colors, note colors, board colors, form fields, copy fields, badges, empty states.
- Files likely affected: `src/index.css`, `src/components/SketchyButton.tsx`, `src/components/SketchyContainer.tsx`, `src/features/auth/components/AuthInput.tsx`, `src/features/auth/AuthShell.tsx`, `src/app/ToastProvider.tsx`.
- Expected benefit: Fixes the largest cross-app visual defect and reduces one-off styling.
- Risk level: Medium

### Phase 2: Align Weak Pages With Reference Design

- Pages to prioritize: `/profile/:userId`, `/bank`, bank merchant/deposit/withdraw panels, `/merchant/orders`, `/merchant/deposits`, `/auth/security`.
- Suggested direction: Reuse rough card, sticky-note, highlighter, and shared form/table/list components. Convert mobile merchant tables into cards.
- Expected benefit: Brings weakest production surfaces closer to landing/play quality.
- Risk level: Medium to High for admin table responsiveness.

### Phase 3: Polish States, Motion, Responsiveness, and Accessibility

- States to improve: Lobby empty/error/loading, leaderboard loading/error, bank empty transaction history, merchant empty queues, game waiting/active/completed, auth errors.
- Motion/focus/hover improvements: Reduced-motion support, visible canvas focus, consistent hover lift, non-overlapping button hover states.
- Accessibility improvements: Real buttons/radio cards for lobby draft choices, notice alert/status roles, persistent labels for merchant reconciliation inputs, decorative icon `aria-hidden`.
- Expected benefit: Better perceived quality and safer keyboard/screen-reader behavior.
- Risk level: Medium

### Phase 4: Final Visual QA

- Final checks to run: Build app, run e2e harness, retake all screenshots in `ui-audit-screenshots/`, compare desktop/mobile for landing, `/play`, `/bank`, `/profile`, game, auth, and merchant routes.
- Screenshots to retake: All screenshots from this audit, plus active game and waiting game mobile states.
- Regression risks to watch: Auth redirects, TonConnect lazy loading, merchant admin auth, socket game rendering, bottom nav spacing, and canvas sizing.

## 12. Files That Need UI Refactoring Later

| File path | Related route/component | Reason | Priority | Risk level |
|---|---|---|---|---|
| `src/components/SketchyButton.tsx` | All buttons | Label/stroke collision across screenshots. | High | Medium |
| `src/index.css` | Theme/tokens | Missing note, semantic status, paper-rule, and board tokens. | High | Low |
| `src/app/ToastProvider.tsx` | Toasts | Hardcoded semantic colors and local rough card style. | Medium | Low |
| `src/features/auth/AuthShell.tsx` | Auth shell and old fields | Contains `AuthField` duplication and notice colors. | High | Medium |
| `src/features/auth/components/AuthInput.tsx` | Auth input | Should become the single source for auth/form fields. | High | Medium |
| `src/pages/auth/SecuritySettingsPage.tsx` | `/auth/security` | Rounded SaaS subcards and local status/step components. | Medium | Medium |
| `src/pages/DashboardPage.tsx` | `/play`, `/leaderboard` | Draft option semantics, tab mobile layout, color token cleanup. | High | Medium |
| `src/pages/BankPage.tsx` | `/bank` | Action cards and mobile bottom spacing. | High | Medium |
| `src/features/bank/DepositPanel.tsx` | Bank deposit | Copy fields and hardcoded button colors. | Medium | Low |
| `src/features/bank/WithdrawPanel.tsx` | Bank withdraw | Quick-fill and form styles. | Medium | Low |
| `src/features/bank/MerchantPanel.tsx` | Bank merchant | Dense one-off trade/proof/ledger UI. | High | Medium |
| `src/pages/GamePage.tsx` | `/game/:roomId` | Board state rendering QA, tokenized disc colors, mobile game layout. | Medium | High |
| `src/pages/ProfilePage.tsx` | `/profile/:userId` | Mini-board overflow and local achievement cards. | High | Medium |
| `src/components/merchant/MerchantLayout.tsx` | Merchant shell | Local nav/status/snapshot patterns. | Medium | Medium |
| `src/pages/merchant/MerchantDashboardPage.tsx` | `/merchant` | Chart/card polish and tokens. | Medium | Medium |
| `src/pages/merchant/OrderDeskPage.tsx` | `/merchant/orders` | Responsive table/card system. | High | High |
| `src/pages/merchant/DepositsPage.tsx` | `/merchant/deposits` | Responsive review cards and labeled action inputs. | High | High |
| `src/pages/merchant/LiquidityPage.tsx` | `/merchant/liquidity` | Shared ops fields/cards. | Medium | Medium |
| `src/pages/merchant/AlertsPage.tsx` | `/merchant/alerts` | Shared alert card and semantic severity tokens. | Medium | Low |
| `src/pages/PrivacyPolicyPage.tsx` | `/privacy` | Shared legal article style. | Low | Low |
| `src/pages/TermsOfUsePage.tsx` | `/terms` | Shared legal article style. | Low | Low |
| `src/pages/NotFoundPage.tsx` | 404 | CTA inherits button rendering issue. | Medium | Low |

## 13. Do-Not-Touch Areas

- Auth business logic in `src/app/AuthProvider.tsx`, `src/services/auth.service.ts`, auth routing helpers, and backend auth controllers.
- API client behavior in `src/services/api/apiClient.ts`.
- Payment, deposit, withdrawal, order, merchant, and wallet API calls in `src/services/*.ts`.
- Backend routes/controllers/services/models under `server/`.
- Database setup and migrations.
- Game socket behavior in `src/sockets/gameSocket.ts` and backend socket/game-room services.
- Core game rules and settlement behavior.
- TonConnect provider behavior in `src/app/TonConnectRouteProvider.tsx`.
- State-management behavior and protected-route redirects unless a later UI task explicitly includes route aliasing.

## 14. Final Recommendation

Fix `SketchyButton` first because it affects the whole product and makes otherwise strong pages look broken. Then align the highest-visibility weak pages: `/profile/:userId` for the mini-board overflow, `/bank` and `MerchantPanel` for money-flow polish, and merchant order/deposit mobile screens for admin usability. After that, consolidate auth/form components and introduce semantic design tokens so future pages reuse the landing/play/lobby language instead of adding more one-off Tailwind styles.
