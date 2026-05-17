# Manual Profiling Checklist

This pass did not use Chrome DevTools MCP and did not collect browser metrics. Run these steps manually after deploying the reviewed build to local or staging.

## Route Table

| Route | LCP | CLS | INP/Long task | Slowest API | Duplicate requests | Console errors | Notes |
|---|---:|---:|---:|---|---|---|---|
| `/` unauthenticated landing page | | | | | | | |
| `/auth/login` login page | | | | | | | |
| `/auth/register` register page | | | | | | | |
| `/play` authenticated dashboard/play route | | | | | | | |
| `/bank` bank page | | | | | | | |
| `/merchant` merchant dashboard | | | | | | | |
| `/merchant/orders` merchant order desk | | | | | | | |
| `/game/:roomId` game room route | | | | | | | |
| `/profile/:username` profile page | | | | | | | |

## Chrome DevTools Performance Recording

1. Open Chrome with a clean profile or Incognito.
2. Open DevTools > Performance.
3. Enable screenshots and Web Vitals lanes if available.
4. Test once with normal network and once with throttling.
5. Record page load for each route above.
6. Record interactions:
   - `/play`: switch Lobby/Leaderboard tabs, create match modal, join flow.
   - `/bank`: switch deposit/withdraw/merchant panels.
   - `/bank`: connect wallet, generate deposit memo, and start a TonConnect deposit transaction in a test wallet.
   - `/merchant`: manual refresh.
   - `/merchant/orders`: filter by status/type and paginate.
   - `/game/:roomId`: make multiple moves.
7. Save trace files with route/date/build SHA in the filename.
8. Record LCP, CLS, INP/long task notes in the table.

## Chrome DevTools Network Tab

1. Enable "Disable cache".
2. Reload each route.
3. Sort by size and duration.
4. Identify largest JS/CSS/image/font assets.
5. Check duplicate API calls on mount.
6. Check request waterfalls after auth refresh/session checks.
7. Check failed requests and preflight volume.
8. Verify `/play` default lobby no longer fetches leaderboard until the leaderboard tab is opened.
9. Verify merchant dashboard does not start multiple overlapping `/api/merchant/dashboard` calls during manual refresh and polling.
10. Verify `/tonconnect-manifest.json`, `/tonconnect-icon.svg`, terms, and privacy URLs return quickly from the public Render origin.
11. Verify wallet connect failures/declines are visible as wallet events or UI errors, not silent hangs.

## Lighthouse

1. Run Lighthouse in Chrome DevTools for `/`, `/auth/login`, `/play`, `/bank`, and `/merchant`.
2. Use mobile mode first, then desktop.
3. Save reports as HTML/JSON.
4. Record only actual Lighthouse metrics; do not infer improvements from code changes.

## React Profiler

1. Install React DevTools.
2. Open Profiler.
3. Profile `/play` initial render and tab switch to leaderboard.
4. Profile `/merchant` initial render and manual refresh.
5. Profile `/merchant/orders` filter changes.
6. Profile `/game/:roomId` move interactions.
7. Look for repeated commits caused by provider/context changes, roughjs components, Socket.IO updates, and dashboard refreshes.

## Web Vitals Extension

1. Install the Web Vitals extension.
2. Open each route and interact as a real user.
3. Record measured LCP, CLS, and INP.
4. Compare cold cache and warm cache.

## Cache and Device Conditions

- Test cache disabled and cache enabled.
- Test fast network, slow 4G, and offline recovery where applicable.
- Test desktop and mobile viewport.
- Test a low-end device profile in Chrome Performance throttling.
- Test logged-out, logged-in player, and admin/merchant sessions.
