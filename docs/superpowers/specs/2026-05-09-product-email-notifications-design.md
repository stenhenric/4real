# Product Email Notifications Design

## Goal

Add product email templates for merchant, order, deposit, and withdrawal scenarios, then wire them into successful product flows so users and merchant admins receive automatic status notifications.

## Current Context

The backend already sends Gmail API email through `server/services/email/gmailService.ts`. Auth emails are routed through `server/services/auth-email.service.ts`, while product flows currently have no dedicated notification layer.

Relevant product state transitions:

- Orders are created in `server/controllers/order.controller.ts` and finalized by `OrderService.updateOrderStatus`.
- Deposits are credited, rejected, or marked unmatched in `server/services/deposit-ingestion.service.ts`; unmatched deposits can later be credited or dismissed through merchant reconciliation.
- Withdrawals are queued in `server/controllers/transaction.controller.ts` and move through `queued`, `processing`, `sent`, `confirmed`, `stuck`, and `failed` in `server/workers/withdrawal-worker.ts`.
- Merchant/admin users are represented by `User.isAdmin`. There is no separate merchant notification address in configuration.

## Architecture

Create a dedicated product notification service that owns product template selection, recipient lookup, and best-effort delivery. This keeps the Gmail transport focused on MIME construction and provider delivery while keeping controllers and workers focused on state transitions.

New unit boundaries:

- `server/services/email/productEmailTemplates.ts`: pure template builders. Each builder returns a subject, text body, and HTML body. It performs escaping through shared helpers and has no database or transport dependency.
- `server/services/product-email-notification.service.ts`: orchestration layer. It loads user/admin recipients, calls the correct template builder, sends through Gmail notification delivery, and logs failures without throwing into the product flow.
- Existing controllers/services/workers: call the notification service after successful mutations and outside committed transaction blocks.

## Recipient Rules

User-facing notifications go to the affected user's verified email address. If the user cannot be found or the email is not verified, the notification is skipped and logged at debug or warn level without failing the product action.

Merchant-facing notifications go to verified admin users, excluding `SYSTEM_COMMISSION_ACCOUNT_ID`. The initial version does not add an env-configured merchant email because the app already models merchant operators as admin users.

## Scenarios

Order templates:

- `order_created_user`: sent to the user after a non-replayed order creation.
- `order_created_merchant`: sent to merchant admins after a non-replayed order creation.
- `order_approved_user`: sent to the user when an order moves from `PENDING` to `DONE`.
- `order_rejected_user`: sent to the user when an order moves from `PENDING` to `REJECTED`.

Deposit templates:

- `deposit_confirmed_user`: sent to the user when an active-memo deposit is credited automatically.
- `deposit_unmatched_merchant`: sent to merchant admins when an incoming transfer is recorded as unmatched.
- `deposit_reconciled_user`: sent to the credited user when an unmatched deposit is manually credited.
- `deposit_dismissed_merchant`: sent to merchant admins when an unmatched deposit is dismissed.
- `deposit_rejected_merchant`: sent to merchant admins when an incoming transfer is rejected by ingestion.

Withdrawal templates:

- `withdrawal_queued_user`: sent after a non-replayed withdrawal request is queued.
- `withdrawal_sent_user`: sent after the worker records a withdrawal as sent.
- `withdrawal_confirmed_user`: sent after on-chain confirmation is recorded.
- `withdrawal_stuck_user`: sent when a withdrawal is marked stuck.
- `withdrawal_failed_user`: sent when a withdrawal exhausts retries and is refunded.
- `withdrawal_stuck_merchant`: sent to merchant admins when a withdrawal needs review.
- `withdrawal_failed_merchant`: sent to merchant admins when a withdrawal fails permanently.

Merchant alert template:

- `merchant_alert`: reusable template for operational, liquidity, deposit, order, and withdrawal alert emails. This first pass exposes the builder and notification method; scheduled batch alerting is left out to avoid repeated emails every dashboard refresh.

## Delivery Semantics

Product notification delivery is best-effort. A product state transition must not be rolled back because Gmail is unavailable or a recipient lookup fails.

The notification service catches delivery errors and logs:

- scenario key
- recipient class, such as `user` or `merchant_admin`
- recipient domain only, not full recipient address
- resource id
- error message

Idempotent product endpoints send emails only when `executeIdempotentMutationV2` reports `replayed === false`. Worker transitions send only after the repository state update succeeds.

## Data Flow

Order creation:

1. `OrderController.createOrder` creates the order through the idempotency wrapper.
2. If the result is not replayed, it invalidates merchant dashboard cache.
3. It calls product email notification methods for the user and merchant admins.
4. The HTTP response is returned even if email delivery fails.

Order status update:

1. `OrderService.updateOrderStatus` completes the state transition and returns the order.
2. `OrderController.updateOrder` calls the matching user notification only for `DONE` or `REJECTED`.

Deposit ingestion:

1. `ingestIncomingTransferWithContext` applies the deposit decision.
2. After transaction work and audit recording, it calls the matching user or merchant notification.
3. Already-processed and already-open unmatched decisions do not send new emails.

Deposit reconciliation:

1. `reconcileMerchantDeposit` resolves an unmatched deposit.
2. A credited resolution emails the credited user.
3. A dismissed resolution emails merchant admins.

Withdrawal request and worker transitions:

1. `requestWithdrawalHandler` queues a withdrawal inside the idempotency wrapper.
2. If the result is not replayed, it sends `withdrawal_queued_user`.
3. `runWithdrawalWorker`, `confirmSentWithdrawals`, and `recoverStuckWithdrawals` call notification methods after successful `sent`, `confirmed`, `stuck`, or `failed` updates.

## Error Handling

Notification errors are isolated from business errors. The notification service catches and logs failures from recipient lookup, template rendering, and Gmail delivery.

Template builders must escape interpolated HTML values. Text bodies include the same factual fields as HTML bodies. Transaction hashes and wallet addresses may be shortened for display, but full values may appear in fallback URLs or plain text only when already part of user-facing product pages.

## Testing

Use Node's built-in test runner and the existing test setup.

Template tests:

- Assert each template returns a scenario-specific subject.
- Assert text and HTML include the key amount, status, and resource id fields.
- Assert HTML escaping protects user-supplied values such as usernames, notes, transaction codes, and wallet addresses.

Service tests:

- Mock Gmail delivery and recipient lookup.
- Verify user notifications skip unverified users.
- Verify merchant notifications target verified admins and exclude the system commission account.
- Verify delivery failures are swallowed and logged.

Flow tests:

- Order creation requests user and merchant notifications only when the idempotency result is not replayed.
- Order approval/rejection requests the correct user notification after status changes.
- Deposit credit/unmatched/reject/reconcile/dismiss paths request the expected notifications.
- Withdrawal queue/sent/confirmed/stuck/failed paths request the expected notifications after repository updates.

## Out Of Scope

- Durable retry/outbox storage for email jobs.
- Per-user notification preferences.
- Admin UI for email history.
- Scheduled merchant alert batching.
- A new env-configured merchant email address.
