## Focused Authorization And Reconnect Abuse Audit

Date: 2026-05-09
Scope: merchant/admin authorization and query-filter edges, realtime room reconnect and move abuse
Method: threat model -> finding discovery -> validation -> attack-path analysis -> focused fixes

### Threat model

- Merchant admin endpoints expose operational order and deposit data behind `authenticateToken`, `requireVerifiedAccount`, `requireAdmin`, and `requireMfaStepUp`.
- Socket.IO room flows trust authenticated session principals, but room joins and moves still cross a user-controlled boundary through `roomId` and reconnect timing.
- Highest-risk assets in this slice were merchant review visibility, private room existence, and authoritative room presence state.

Issue: Invalid merchant order filters widened the admin order desk instead of failing closed.
Impact: A malformed `status` or `type` query expanded the effective filter to `ALL`, which increased visibility beyond the caller's explicit request and made malformed inputs indistinguishable from intentional broad queries.
Best-practice reference: OWASP ASVS V5 input validation requirements, OWASP Input Validation Cheat Sheet, Express production security guidance on validating untrusted input.
Files inspected: `server/routes/admin.routes.ts`, `server/controllers/merchant-admin.controller.ts`, `server/services/merchant-dashboard.service.ts`, `server/middleware/query-sanitization.test.ts`
Files changed: `server/controllers/merchant-admin.controller.ts`, `server/middleware/merchant-dashboard.test.ts`
Fix: Replaced permissive fallback parsing with explicit scalar-query parsing, allow-listed `status` and `type` filters, and bounded page/page-size parsing that returns `400` for malformed values instead of broadening the query.
Tests: Added controller tests for invalid status rejection, structured query-value rejection, and allow-listed normalization with bounded pagination.
Regression risk: Low. Valid query shapes and response payloads are unchanged; only malformed inputs now fail closed.
Verification commands: `npm run test:unit -- server/middleware/merchant-dashboard.test.ts`

Issue: Non-participants could distinguish and materialize private realtime rooms through `joinRoom`.
Impact: The prior flow loaded the match and created cached room state before enforcing participant membership, then returned a distinct conflict response. That leaked room existence and allowed unauthorized state materialization.
Best-practice reference: OWASP ASVS V4 access control requirements, OWASP Authorization Cheat Sheet, Socket.IO security guidance on authorizing room access.
Files inspected: `server/sockets/game.socket.ts`, `server/services/realtime-match.service.ts`, `server/services/game-room.service.ts`, `server/middleware/match-access.test.ts`
Files changed: `server/services/realtime-match.service.ts`, `server/middleware/realtime-match.service.test.ts`
Fix: Added participant verification immediately after loading the match, before any room cache mutation, and aligned the rejection to `MATCH_NOT_FOUND` so non-participants do not get a distinguishable private-room signal.
Tests: Added a regression test proving a non-participant cannot join or cache a private room.
Regression risk: Low to medium. Private-room joins now fail with a not-found response when the caller is not a participant, which is the intended fail-closed behavior and matches existing HTTP-side privacy posture.
Verification commands: `npm run test:unit -- server/middleware/realtime-match.service.test.ts`

Issue: A stale socket disconnect could remove a user's active distributed room membership after reconnect.
Impact: In Redis-backed room state, disconnecting an older socket always removed the user from the room-members set even when a newer socket had already rebound. That could null the current socket binding on the next state write and break presence or reconnect continuity.
Best-practice reference: Socket.IO security guidance on connection state and recovery, OWASP ASVS integrity controls, Redis operational guidance for authoritative state handling.
Files inspected: `server/services/game-room-registry.service.ts`, `server/services/redis.service.ts`, `server/middleware/realtime-match.service.test.ts`
Files changed: `server/services/game-room-registry.service.ts`, `server/services/redis.service.ts`, `server/middleware/realtime-match.service.test.ts`
Fix: Changed distributed detach logic to remove the room-members entry only when the disconnecting socket is still the authoritative socket for that user. Added a repo-standard Redis test seam to validate the distributed path without mutating module exports at runtime.
Tests: Added a regression test that binds an old socket, rebinds a new socket, disconnects the old socket, and verifies membership plus persisted socket state remain intact.
Regression risk: Low. The change only affects stale-disconnect cleanup in distributed mode and preserves existing cleanup for the active socket.
Verification commands: `npm run test:unit -- server/middleware/realtime-match.service.test.ts`

Issue: Malformed realtime room IDs reached move handling and could consume lock and storage work.
Impact: `makeMove` accepted arbitrary room ID strings, so malformed values could still create exclusive-lock work and a database lookup path. This increased abuse surface for reconnect and move spam.
Best-practice reference: OWASP ASVS V5 input validation requirements, OWASP Denial of Service Cheat Sheet, Socket.IO security guidance on validating event payloads.
Files inspected: `server/services/realtime-match.service.ts`, `server/sockets/game.socket.ts`, `server/middleware/realtime-match.service.test.ts`
Files changed: `server/services/realtime-match.service.ts`, `server/middleware/realtime-match.service.test.ts`
Fix: Applied the same supported room ID validation used by join handling before `makeMove` acquires the room lock or touches match storage.
Tests: Added a regression test proving malformed room IDs are rejected before `MatchService.getMatchByRoomId` is called.
Regression risk: Low. Valid room IDs are unchanged; malformed values now fail immediately.
Verification commands: `npm run test:unit -- server/middleware/realtime-match.service.test.ts`

### Attack-path notes

- Merchant query abuse required a valid admin session plus MFA, so the severity was bounded by privilege. The fix still matters because fail-open parsing at a trust boundary is production-hostile and undermines review tooling.
- Private room enumeration and stale reconnect corruption were directly user-reachable from authenticated game clients and could affect confidentiality and availability without elevated roles.

### Remaining notes

- `make-move` rate limiting is still keyed by `userId + roomId` at the socket handler boundary. The service-level room ID gate now prevents malformed IDs from reaching room locks or match storage, which removed the validated production issue from this pass.
