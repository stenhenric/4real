# Security Page UX Design

## Goal

Improve the authenticated security settings page so it matches the app's existing scrapbook-style design language, uses clearer user-facing copy, and makes MFA setup easier to understand without turning the page into a multi-step wizard or a full-width settings dashboard.

## Current Context

The security route lives at `src/pages/auth/SecuritySettingsPage.tsx` and is rendered inside the authenticated app layout at `/auth/security`. It already supports:

- session listing through `getSessions`
- individual and bulk session revocation
- TOTP MFA setup through `startTotpSetup` and `verifyTotpSetup`
- MFA disable through `disableMfa`
- recovery code regeneration through `regenerateRecoveryCodes`

The page currently uses `AuthShell`, `AuthField`, `AuthTextarea`, `AuthNotice`, and `SketchyButton`, but the overall composition feels flatter than the rest of the app. The current UX issues are:

- page-level copy sounds abstract and product-marketing oriented instead of like account settings
- MFA setup feels mechanically correct but not guided
- the status tiles and later sections compete with the primary action instead of reinforcing it
- some secondary actions use generic pill styling instead of the app's established sketchy controls

Relevant design patterns already exist in:

- `src/features/auth/AuthShell.tsx` for compact auth-card framing
- `src/components/SketchyButton.tsx` for primary and secondary actions
- `src/index.css` for scrapbook tokens such as `rough-border`, `tape`, `highlighter`, `bg-paper`, `ink-blue`, and `ink-red`
- `src/pages/auth/LoginPage.tsx` for compact, direct auth-page copy and clear action emphasis

## Architecture

Keep the security page within the existing compact auth-shell architecture. The redesign is a composition and copy change, not a route, API, or data-model change.

The page continues to use:

- `AuthShell` as the outer card and page frame
- existing auth service methods for MFA and session actions
- `SketchyButton` for all user actions that currently mix sketchy and plain button styles
- existing `AuthField`, `AuthTextarea`, and `AuthNotice` primitives for form inputs and notices

No new page-level route structure or data-flow abstraction is required. If the file becomes hard to scan during implementation, extract only small presentational subcomponents that stay colocated with `SecuritySettingsPage.tsx`.

## Layout And Hierarchy

The page stays compact and card-based. It should not be rebuilt as a full settings dashboard.

### Shell Copy

Replace the current control-center wording with calmer settings language:

- eyebrow: `Security Settings`
- title: `Protect your account.`
- description: `Manage sign-in protection, recovery options, and active devices.`

This keeps the page aligned with the rest of the auth surface while sounding more task-oriented.

### Section Order

The page order becomes:

1. MFA notices related to forced setup or recent verification
2. `Multi-factor authentication`
3. `Recovery codes`
4. `Active devices`

This makes MFA the dominant task and moves session management into a clearly secondary role.

### Status Summary

Retain only lightweight status context near the top of the card. The current four equal-weight tiles should be reduced in visual dominance so they do not compete with MFA setup. They remain informational and compact:

- email status
- password status
- MFA status
- current device state

These may stay as a short summary row, but they should use softer styling and smaller visual weight than the primary MFA workspace.

## MFA Experience

### Disabled State

When MFA is disabled, the page should present one dominant `Multi-factor authentication` section. This section remains a single card that shows the full setup workspace at once, but it is organized into clearly labeled groups so the user understands the flow without reading dense paragraphs.

The content groups are:

1. `Why this matters`
   Add an authenticator app to protect sign-ins, withdrawals, and account changes.
2. `Set up your authenticator`
   Scan this secret with Google Authenticator, 1Password, Authy, or another TOTP app.
3. `Confirm setup`
   Enter the current 6-digit code from your authenticator app to finish setup.
4. `What happens next`
   After setup, you will get one-time recovery codes to store offline.

The secret and OTP Auth URL remain available because they are part of the current backend response, but they should be treated as supporting utilities rather than the headline content. Copy buttons remain available for both values.

### Auto-Start Setup

If the user arrives with `?setup=1`, the page should automatically call `startTotpSetup()` on load instead of asking the user to click another setup button. This removes unnecessary friction in the forced-setup path already implied by the route state.

If the auto-start request fails:

- show a clear error notice
- leave the setup action visible
- allow the user to retry manually

### Successful Verification

After `verifyTotpSetup()` succeeds:

- switch the page into the enabled-MFA state immediately
- clear the temporary setup workspace
- show a success notice
- reveal the returned recovery codes as the next-priority content

## Enabled-MFA Experience

When MFA is enabled, the page shifts from setup to maintenance.

Recommended wording:

- status badge: `MFA is on`
- support line: `Your account uses an authenticator code for sensitive actions.`

The management layout contains:

- a compact MFA status section
- the recovery codes section
- a lower-priority `Turn off MFA` section

The disable copy should be direct:

- title: `Turn off MFA`
- guidance: `You’ll need a current authenticator code or a recovery code to remove this protection.`

Recovery code regeneration remains available, but it should be visually secondary to the currently visible codes.

## Recovery Codes

Recovery codes remain their own section below MFA rather than being buried inside setup copy.

Recommended copy:

- title: `Recovery codes`
- description: `Use these if you lose access to your authenticator app. Store them offline.`

Behavior remains unchanged:

- show codes after first-time setup success
- show codes after regeneration
- allow copy-all
- keep the message that each code can only be used once

This section should be visually important, but still subordinate to the primary MFA section when MFA is not yet enabled.

## Active Devices

Rename `Device sessions` to `Active devices`.

Recommended description:

`Review where your account is signed in and remove devices you no longer use.`

Behavior remains unchanged:

- load sessions on page entry
- allow revoking one device
- allow revoking all other devices
- distinguish the current device from other tracked devices

The main UX change here is simpler wording and lower visual priority than the MFA section.

## Visual System

The redesign must reuse existing repo patterns rather than introducing a new page-specific theme.

Required visual constraints:

- keep `AuthShell` as the outer frame
- keep the scrapbook look through existing `rough-border`, `tape`, and `highlighter` motifs
- use `SketchyButton` for primary and secondary actions where possible
- use existing paper and ink color tokens from `src/index.css`
- stay within the compact auth-card width, with at most a modest increase from the current `max-w-lg` shell to a wider but still single-card layout

The page should feel like an extension of the current auth surface, with slightly stronger internal hierarchy, not like a dashboard transplanted into the auth route.

## Error Handling

Keep the current backend semantics and improve only presentation.

- setup start failures show a specific error notice and preserve the retry action
- setup verification failures keep the current setup inputs intact and show an error notice
- recovery regeneration failures remain non-destructive and surfaced through notice/toast behavior
- disable failures keep entered values so the user can correct and retry
- session load or revoke failures remain isolated to the sessions section

High-risk redirects such as step-up verification continue to use existing behavior.

## Testing

Verify the redesign through existing frontend test patterns and manual validation where automated coverage is not already present.

Key scenarios:

- default render when MFA is disabled
- `?setup=1` auto-starts MFA setup on page load
- manual setup start succeeds and reveals secret plus OTP Auth URL
- verification success transitions into enabled state and shows recovery codes
- verification failure preserves setup context and shows an error
- enabled-MFA state renders maintenance copy correctly
- recovery code regeneration updates visible codes
- disable MFA works with authenticator code or recovery code
- sessions load correctly
- revoke single session works
- revoke other sessions works

## Out Of Scope

- QR-code generation or any new MFA transport beyond the current secret and OTP Auth URL
- new backend endpoints or response fields
- moving the page out of the compact auth-shell layout
- full settings-dashboard navigation
- changes to the MFA challenge route beyond keeping language consistent where appropriate
