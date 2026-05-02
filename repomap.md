# Repository Map: 4REAL

## 1️⃣ FULL FILE TREE

```
4realmain/
├── .env.example
├── .gitignore
├── index.html
├── main.ts
├── metadata.json
├── mongodb-security/
│   ├── references/
│   │   ├── atlas-network-security.md
│   │   └── common-attack-scenarios.md
│   └── skill.md
├── package-lock.json
├── package.json
├── public/
│   ├── privacy-policy.html
│   ├── terms-of-use.html
│   ├── tonconnect-icon.svg
│   └── tonconnect-manifest.json
├── scripts/
│   └── start-production.mjs
├── server/
│   ├── app.ts
│   ├── config/
│   │   ├── config.ts
│   │   ├── cookies.ts
│   │   ├── cors.ts
│   │   ├── db.ts
│   │   └── env.ts
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── match.controller.ts
│   │   ├── merchant-admin.controller.ts
│   │   ├── order.controller.ts
│   │   ├── transaction.controller.ts
│   │   └── user.controller.ts
│   ├── http/
│   │   └── frontend.ts
│   ├── lib/
│   │   ├── jetton.ts
│   │   ├── setup-db.ts
│   │   └── ton-client.ts
│   ├── middleware/
│   │   ├── auth.controller.test.ts
│   │   ├── auth.middleware.test.ts
│   │   ├── auth.middleware.ts
│   │   ├── background-jobs.service.test.ts
│   │   ├── csrf.middleware.ts
│   │   ├── deposit-reconciliation.test.ts
│   │   ├── distributed-lock.test.ts
│   │   ├── error.middleware.ts
│   │   ├── frontend-contracts.test.ts
│   │   ├── game-room-registry.test.ts
│   │   ├── idempotency-key.repository.test.ts
│   │   ├── idempotency.service.test.ts
│   │   ├── logging-and-schemas.test.ts
│   │   ├── match-access.test.ts
│   │   ├── match-controller-context.test.ts
│   │   ├── merchant-dashboard.test.ts
│   │   ├── migration-services.test.ts
│   │   ├── order-service.test.ts
│   │   ├── query-sanitization.test.ts
│   │   ├── rate-limit.middleware.ts
│   │   ├── realtime-match.service.test.ts
│   │   ├── request-context.middleware.ts
│   │   ├── security.middleware.test.ts
│   │   ├── static-files.test.ts
│   │   ├── ton-payments.test.ts
│   │   ├── user-balance.repository.test.ts
│   │   └── validate.middleware.ts
│   ├── models/
│   │   ├── Match.ts
│   │   ├── MerchantConfig.ts
│   │   ├── Order.ts
│   │   ├── Transaction.ts
│   │   └── User.ts
│   ├── repositories/
│   │   ├── audit-event.repository.ts
│   │   ├── deposit-memo.repository.ts
│   │   ├── deposit.repository.ts
│   │   ├── distributed-lock.repository.ts
│   │   ├── failed-deposit-ingestion.repository.ts
│   │   ├── idempotency-key.repository.ts
│   │   ├── jetton-wallet-cache.repository.ts
│   │   ├── mongo.repository.ts
│   │   ├── order-proof-relay.repository.ts
│   │   ├── poller-state.repository.ts
│   │   ├── processed-transaction.repository.ts
│   │   ├── unmatched-deposit.repository.ts
│   │   ├── user-balance.repository.ts
│   │   └── withdrawal.repository.ts
│   ├── routes/
│   │   ├── admin.routes.ts
│   │   ├── auth.routes.ts
│   │   ├── index.ts
│   │   ├── matches.routes.ts
│   │   ├── orders.routes.ts
│   │   ├── transactions.routes.ts
│   │   └── users.routes.ts
│   ├── runtime.ts
│   ├── schemas/
│   │   └── external/
│   │       ├── parse-external-response.ts
│   │       ├── telegram-proof.schema.ts
│   │       ├── toncenter-balance.schema.ts
│   │       └── toncenter-transfer.schema.ts
│   ├── scripts/
│   │   └── backfill-balance-atomic.ts
│   ├── seed.ts
│   ├── serializers/
│   │   └── api.ts
│   ├── services/
│   │   ├── audit.service.ts
│   │   ├── auth-identity.service.ts
│   │   ├── auth-token.service.ts
│   │   ├── background-jobs.service.ts
│   │   ├── bullmq-jobs.service.ts
│   │   ├── dependency-resilience.service.ts
│   │   ├── deposit-ingestion.service.ts
│   │   ├── deposit-service.ts
│   │   ├── deposit-tonconnect.service.ts
│   │   ├── distributed-lock.service.ts
│   │   ├── game-room-registry.service.ts
│   │   ├── game-room.service.ts
│   │   ├── hot-wallet-runtime.service.ts
│   │   ├── idempotency.service.ts
│   │   ├── match-payout.service.ts
│   │   ├── match.service.ts
│   │   ├── merchant-config.service.ts
│   │   ├── merchant-dashboard.service.ts
│   │   ├── metrics.service.ts
│   │   ├── order-proof-relay.service.ts
│   │   ├── order.service.ts
│   │   ├── realtime-match.service.ts
│   │   ├── redis.service.ts
│   │   ├── socket-rate-limit.service.ts
│   │   ├── telegram-proof.service.ts
│   │   ├── trace-context.service.ts
│   │   ├── transaction.service.ts
│   │   ├── user.service.ts
│   │   ├── withdrawal-engine.ts
│   │   └── withdrawal-service.ts
│   ├── sockets/
│   │   ├── game.socket.ts
│   │   └── public-match-events.ts
│   ├── types/
│   │   ├── api.ts
│   │   └── compression.d.ts
│   ├── utils/
│   │   ├── async-handler.ts
│   │   ├── get-logged-path.ts
│   │   ├── http-error.ts
│   │   ├── idempotency.ts
│   │   ├── logger.ts
│   │   ├── money.ts
│   │   ├── multipart.ts
│   │   ├── redact.ts
│   │   └── trusted-filter.ts
│   ├── validation/
│   │   └── request-schemas.ts
│   └── workers/
│       ├── deposit-poller.ts
│       ├── failed-deposit-replay-worker.ts
│       └── withdrawal-worker.ts
├── shared/
│   ├── socket-events.ts
│   └── types/
│       └── api.ts
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── AppLayout.tsx
│   │   ├── AppProviders.tsx
│   │   ├── AuthProvider.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── RouteLoading.tsx
│   │   └── ToastProvider.tsx
│   ├── canvas/
│   │   ├── drawConnectFourBoard.ts
│   │   ├── drawRoughRectangle.ts
│   │   └── runVictoryConfetti.ts
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── SketchyButton.tsx
│   │   ├── SketchyContainer.tsx
│   │   └── merchant/
│   │       ├── MerchantLayout.tsx
│   │       └── MerchantPageFallback.tsx
│   ├── features/
│   │   ├── bank/
│   │   │   ├── DepositPanel.tsx
│   │   │   ├── MerchantPanel.tsx
│   │   │   ├── WithdrawPanel.tsx
│   │   │   └── transactionPresentation.ts
│   │   ├── game/
│   │   │   ├── types.ts
│   │   │   └── useGameRoom.ts
│   │   └── merchant/
│   │       └── format.ts
│   ├── hooks/
│   │   ├── useCopyToClipboard.ts
│   │   └── useElementSize.ts
│   ├── index.css
│   ├── main.tsx
│   ├── pages/
│   │   ├── AuthPage.tsx
│   │   ├── BankPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── GamePage.tsx
│   │   ├── NotFoundPage.tsx
│   │   ├── ProfilePage.tsx
│   │   └── merchant/
│   │       ├── AlertsPage.tsx
│   │       ├── DepositsPage.tsx
│   │       ├── LiquidityPage.tsx
│   │       ├── MerchantDashboardPage.tsx
│   │       └── OrderDeskPage.tsx
│   ├── services/
│   │   ├── api/
│   │   │   └── apiClient.ts
│   │   ├── auth.service.ts
│   │   ├── matches.service.ts
│   │   ├── merchant-config.service.ts
│   │   ├── merchant-dashboard.service.ts
│   │   ├── orders.service.ts
│   │   ├── transactions.service.ts
│   │   └── users.service.ts
│   ├── sockets/
│   │   └── gameSocket.ts
│   ├── types/
│   │   └── api.ts
│   ├── utils/
│   │   ├── cn.ts
│   │   ├── idempotency.ts
│   │   └── isAbortError.ts
│   └── vite-env.d.ts
├── toast-guidelines.md
├── tsconfig.json
├── tsconfig.server.json
├── tsconfig.tests.json
└── vite.config.ts
```


## 2️⃣ FILE-BY-FILE INVENTORY

### 4realmain/.env.example

**Type:** config

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for .env.example

**Key responsibilities:**
- Implements logic for .env.example

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/.gitignore

**Type:** config

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for .gitignore

**Key responsibilities:**
- Implements logic for .gitignore

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/index.html

**Type:** shared

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for index.html

**Key responsibilities:**
- Implements logic for index.html

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/main.ts

**Type:** shared

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for main.ts

**Key responsibilities:**
- Implements logic for main.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ./server/utils/logger.ts
  - ./server/runtime.ts
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/metadata.json

**Type:** config

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Configuration file.

**Key responsibilities:**
- Implements logic for metadata.json

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/mongodb-security/references/atlas-network-security.md

**Type:** config

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for atlas-network-security.md

**Key responsibilities:**
- Implements logic for atlas-network-security.md

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/mongodb-security/references/common-attack-scenarios.md

**Type:** config

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for common-attack-scenarios.md

**Key responsibilities:**
- Implements logic for common-attack-scenarios.md

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/mongodb-security/skill.md

**Type:** config

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for skill.md

**Key responsibilities:**
- Implements logic for skill.md

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/package-lock.json

**Type:** config

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Configuration file.

**Key responsibilities:**
- Implements logic for package-lock.json

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/package.json

**Type:** config

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Configuration file.

**Key responsibilities:**
- Implements logic for package.json

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/public/privacy-policy.html

**Type:** asset

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for privacy-policy.html

**Key responsibilities:**
- Implements logic for privacy-policy.html

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/public/terms-of-use.html

**Type:** asset

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for terms-of-use.html

**Key responsibilities:**
- Implements logic for terms-of-use.html

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/public/tonconnect-icon.svg

**Type:** asset

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for tonconnect-icon.svg

**Key responsibilities:**
- Implements logic for tonconnect-icon.svg

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/public/tonconnect-manifest.json

**Type:** asset

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Configuration file.

**Key responsibilities:**
- Implements logic for tonconnect-manifest.json

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/scripts/start-production.mjs

**Type:** script

**Tech stack detected:**
- Language: JavaScript
- Framework: N/A
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for start-production.mjs

**Key responsibilities:**
- Implements logic for start-production.mjs

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/app.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express, mongoose, compression, cors, cookie-parser, helmet
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for app.ts

**Key responsibilities:**
- Implements logic for app.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ./middleware/rate-limit.middleware.ts
  - ./middleware/request-context.middleware.ts
  - ./services/redis.service.ts
  - ./services/hot-wallet-runtime.service.ts
  - ./services/metrics.service.ts
  - ./middleware/error.middleware.ts
  - ./middleware/csrf.middleware.ts
  - ./services/bullmq-jobs.service.ts
  - ./config/env.ts
  - ./http/frontend.ts
- External packages:
  - express
  - mongoose
  - compression
  - cors
  - cookie-parser
  - helmet

**Who depends on this file:**
- server/runtime.ts
- src/components/Navbar.tsx
- src/components/merchant/MerchantLayout.tsx
- src/features/bank/DepositPanel.tsx
- src/features/bank/MerchantPanel.tsx
- src/features/bank/WithdrawPanel.tsx
- src/hooks/useCopyToClipboard.ts
- src/main.tsx
- src/pages/AuthPage.tsx
- src/pages/BankPage.tsx
- ...and 6 more

---

### 4realmain/server/config/config.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for config.ts

**Key responsibilities:**
- Implements logic for config.ts

**Exports / Side Effects:**
- getJwtSecret

**Dependencies used:**
- Internal imports:
  - ./env.ts
- External packages: None

**Who depends on this file:**
- server/app.ts
- server/controllers/merchant-admin.controller.ts
- server/controllers/order.controller.ts
- server/http/frontend.ts
- server/lib/ton-client.ts
- server/middleware/auth.controller.test.ts
- server/middleware/auth.middleware.ts
- server/middleware/background-jobs.service.test.ts
- server/middleware/csrf.middleware.ts
- server/middleware/deposit-reconciliation.test.ts
- ...and 34 more

---

### 4realmain/server/config/cookies.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for cookies.ts

**Key responsibilities:**
- Implements logic for cookies.ts

**Exports / Side Effects:**
- getRefreshCookieOptions
- getAuthCookieOptions
- AUTH_COOKIE_NAME
- getRefreshCookieClearOptions
- getAuthCookieClearOptions
- REFRESH_COOKIE_NAME

**Dependencies used:**
- Internal imports:
  - ./env.ts
- External packages:
  - express

**Who depends on this file:**
- server/middleware/auth.middleware.ts
- server/services/auth-token.service.ts

---

### 4realmain/server/config/cors.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: cors
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for cors.ts

**Key responsibilities:**
- Implements logic for cors.ts

**Exports / Side Effects:**
- getCorsOptions
- isAllowedOrigin
- getSocketCorsOptions

**Dependencies used:**
- Internal imports:
  - ./env.ts
- External packages:
  - cors

**Who depends on this file:**
- server/app.ts
- server/middleware/csrf.middleware.ts
- server/runtime.ts

---

### 4realmain/server/config/db.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for db.ts

**Key responsibilities:**
- Implements logic for db.ts

**Exports / Side Effects:**
- connectDB

**Dependencies used:**
- Internal imports:
  - ../utils/logger.ts
  - ./env.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/runtime.ts
- server/scripts/backfill-balance-atomic.ts
- server/seed.ts

---

### 4realmain/server/config/env.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: dotenv, zod
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for env.ts

**Key responsibilities:**
- Implements logic for env.ts

**Exports / Side Effects:**
- getTrustProxySetting
- AppEnv
- getEnv
- getPublicAppOrigin
- resetEnvCacheForTests

**Dependencies used:**
- Internal imports: None
- External packages:
  - dotenv
  - zod

**Who depends on this file:**
- server/app.ts
- server/config/config.ts
- server/config/cookies.ts
- server/config/cors.ts
- server/config/db.ts
- server/controllers/order.controller.ts
- server/http/frontend.ts
- server/lib/ton-client.ts
- server/middleware/auth.controller.test.ts
- server/middleware/background-jobs.service.test.ts
- ...and 31 more

---

### 4realmain/server/controllers/auth.controller.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express, bcryptjs
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles incoming HTTP requests and responses.

**Key responsibilities:**
- Implements logic for auth.controller.ts
- Validates input and orchestrates services

**Exports / Side Effects:**
- AuthController

**Dependencies used:**
- Internal imports:
  - ../middleware/auth.middleware.ts
  - ../services/user.service.ts
  - ../services/auth-identity.service.ts
  - ../serializers/api.ts
  - ../validation/request-schemas.ts
  - ../utils/http-error.ts
- External packages:
  - express
  - bcryptjs

**Who depends on this file:**
- server/middleware/auth.controller.test.ts
- server/routes/auth.routes.ts

---

### 4realmain/server/controllers/match.controller.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles incoming HTTP requests and responses.

**Key responsibilities:**
- Implements logic for match.controller.ts
- Validates input and orchestrates services

**Exports / Side Effects:**
- MatchController

**Dependencies used:**
- Internal imports:
  - ../sockets/public-match-events.ts
  - ../services/idempotency.service.ts
  - ../middleware/auth.middleware.ts
  - ../serializers/api.ts
  - ../utils/idempotency.ts
  - ../validation/request-schemas.ts
  - ../services/match.service.ts
  - ../utils/http-error.ts
- External packages:
  - express

**Who depends on this file:**
- server/middleware/match-controller-context.test.ts
- server/routes/matches.routes.ts

---

### 4realmain/server/controllers/merchant-admin.controller.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles incoming HTTP requests and responses.

**Key responsibilities:**
- Implements logic for merchant-admin.controller.ts
- Validates input and orchestrates services

**Exports / Side Effects:**
- MerchantAdminController

**Dependencies used:**
- Internal imports:
  - ../middleware/auth.middleware.ts
  - ../services/background-jobs.service.ts
  - ../services/merchant-config.service.ts
  - ../services/merchant-dashboard.service.ts
- External packages:
  - express

**Who depends on this file:**
- server/routes/admin.routes.ts

---

### 4realmain/server/controllers/order.controller.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express, node:crypto, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles incoming HTTP requests and responses.

**Key responsibilities:**
- Implements logic for order.controller.ts
- Validates input and orchestrates services

**Exports / Side Effects:**
- OrderController

**Dependencies used:**
- Internal imports:
  - ../services/idempotency.service.ts
  - ../middleware/auth.middleware.ts
  - ../services/order.service.ts
  - ../services/user.service.ts
  - ../serializers/api.ts
  - ../utils/multipart.ts
  - ../utils/idempotency.ts
  - ../config/env.ts
  - ../utils/logger.ts
  - ../services/order-proof-relay.service.ts
- External packages:
  - express
  - node:crypto
  - mongoose

**Who depends on this file:**
- server/routes/orders.routes.ts

---

### 4realmain/server/controllers/transaction.controller.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express, @ton/ton, uuid
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles incoming HTTP requests and responses.

**Key responsibilities:**
- Implements logic for transaction.controller.ts
- Validates input and orchestrates services

**Exports / Side Effects:**
- getWithdrawalStatusHandler
- generateDepositMemoHandler
- getAllTransactions
- requestWithdrawalHandler
- prepareTonConnectDepositHandler
- getUserTransactions

**Dependencies used:**
- Internal imports:
  - ../repositories/withdrawal.repository.ts
  - ../services/idempotency.service.ts
  - ../middleware/auth.middleware.ts
  - ../services/audit.service.ts
  - ../serializers/api.ts
  - ../services/deposit-service.ts
  - ../utils/idempotency.ts
  - ../services/withdrawal-service.ts
  - ../services/transaction.service.ts
  - ../services/deposit-tonconnect.service.ts
- External packages:
  - express
  - @ton/ton
  - uuid

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/controllers/user.controller.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles incoming HTTP requests and responses.

**Key responsibilities:**
- Implements logic for user.controller.ts
- Validates input and orchestrates services

**Exports / Side Effects:**
- UserController

**Dependencies used:**
- Internal imports:
  - ../services/user.service.ts
  - ../serializers/api.ts
  - ../utils/http-error.ts
- External packages:
  - express

**Who depends on this file:**
- server/routes/users.routes.ts

---

### 4realmain/server/http/frontend.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: node:path, express, vite
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for frontend.ts

**Key responsibilities:**
- Implements logic for frontend.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../utils/logger.ts
  - ../config/env.ts
- External packages:
  - node:path
  - express
  - vite

**Who depends on this file:**
- server/app.ts

---

### 4realmain/server/lib/jetton.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: @ton/ton
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for jetton.ts

**Key responsibilities:**
- Implements logic for jetton.ts

**Exports / Side Effects:**
- normalizeAddress
- USDT_MASTER
- addressesEqual
- extractJettonTransferComment

**Dependencies used:**
- Internal imports:
  - ../repositories/jetton-wallet-cache.repository.ts
  - ./ton-client.ts
- External packages:
  - @ton/ton

**Who depends on this file:**
- server/lib/setup-db.ts
- server/middleware/deposit-reconciliation.test.ts
- server/middleware/ton-payments.test.ts
- server/services/deposit-ingestion.service.ts
- server/services/deposit-tonconnect.service.ts
- server/services/hot-wallet-runtime.service.ts
- server/services/withdrawal-engine.ts

---

### 4realmain/server/lib/setup-db.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for setup-db.ts

**Key responsibilities:**
- Implements logic for setup-db.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../repositories/jetton-wallet-cache.repository.ts
  - ../repositories/withdrawal.repository.ts
  - ../models/Order.ts
  - ../models/Match.ts
  - ../repositories/user-balance.repository.ts
  - ../repositories/poller-state.repository.ts
  - ../repositories/deposit-memo.repository.ts
  - ../repositories/processed-transaction.repository.ts
  - ../repositories/deposit.repository.ts
  - ../models/Transaction.ts
- External packages: None

**Who depends on this file:**
- server/runtime.ts

---

### 4realmain/server/lib/ton-client.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: @ton/ton, @ton/crypto
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for ton-client.ts

**Key responsibilities:**
- Implements logic for ton-client.ts

**Exports / Side Effects:**
- getToncenterBaseUrl
- createTonClient

**Dependencies used:**
- Internal imports:
  - ../config/env.ts
- External packages:
  - @ton/ton
  - @ton/crypto

**Who depends on this file:**
- server/lib/jetton.ts
- server/services/deposit-ingestion.service.ts
- server/services/withdrawal-engine.ts

---

### 4realmain/server/middleware/auth.controller.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles incoming HTTP requests and responses.

**Key responsibilities:**
- Implements logic for auth.controller.test.ts
- Validates input and orchestrates services

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../services/auth-token.service.ts
  - ../services/user.service.ts
  - ../controllers/auth.controller.ts
  - ../config/env.ts
- External packages:
  - node:assert/strict
  - node:test

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/auth.middleware.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert, node:test, jsonwebtoken
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for auth.middleware.test.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../services/user.service.ts
  - ./auth.middleware.ts
- External packages:
  - node:assert
  - node:test
  - jsonwebtoken

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/auth.middleware.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for auth.middleware.ts

**Key responsibilities:**
- Implements logic for auth.middleware.ts

**Exports / Side Effects:**
- AuthenticatedRequest
- requireAdmin
- assertAuthenticated
- AuthRequest
- authenticateToken

**Dependencies used:**
- Internal imports:
  - ../services/trace-context.service.ts
  - ../config/cookies.ts
  - ../types/api.ts
  - ../services/auth-token.service.ts
  - ../utils/http-error.ts
- External packages:
  - express

**Who depends on this file:**
- server/controllers/auth.controller.ts
- server/controllers/match.controller.ts
- server/controllers/merchant-admin.controller.ts
- server/controllers/order.controller.ts
- server/controllers/transaction.controller.ts
- server/middleware/auth.middleware.test.ts
- server/routes/admin.routes.ts
- server/routes/auth.routes.ts
- server/routes/matches.routes.ts
- server/routes/orders.routes.ts
- ...and 1 more

---

### 4realmain/server/middleware/background-jobs.service.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for background-jobs.service.test.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../services/hot-wallet-runtime.service.ts
  - ../repositories/withdrawal.repository.ts
  - ../config/env.ts
  - ../workers/withdrawal-worker.ts
- External packages:
  - node:assert/strict
  - node:test

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/csrf.middleware.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for csrf.middleware.ts

**Key responsibilities:**
- Implements logic for csrf.middleware.ts

**Exports / Side Effects:**
- csrfProtectionMiddleware

**Dependencies used:**
- Internal imports:
  - ../config/cors.ts
  - ../utils/http-error.ts
- External packages:
  - express

**Who depends on this file:**
- server/app.ts
- server/middleware/security.middleware.test.ts

---

### 4realmain/server/middleware/deposit-reconciliation.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test, @ton/ton, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for deposit-reconciliation.test.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../services/hot-wallet-runtime.service.ts
  - ../lib/jetton.ts
  - ../repositories/user-balance.repository.ts
  - ../services/audit.service.ts
  - ../services/user.service.ts
  - ../repositories/deposit-memo.repository.ts
  - ../repositories/deposit.repository.ts
  - ../models/User.ts
  - ../config/env.ts
  - ../repositories/unmatched-deposit.repository.ts
- External packages:
  - node:assert/strict
  - node:test
  - @ton/ton
  - mongoose

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/distributed-lock.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for distributed-lock.test.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages:
  - node:assert/strict
  - node:test

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/error.middleware.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express, mongoose, zod
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for error.middleware.ts

**Key responsibilities:**
- Implements logic for error.middleware.ts

**Exports / Side Effects:**
- notFoundApiHandler
- errorHandler

**Dependencies used:**
- Internal imports:
  - ../../shared/types/api.ts
  - ../utils/logger.ts
  - ../utils/get-logged-path.ts
  - ../utils/http-error.ts
- External packages:
  - express
  - mongoose
  - zod

**Who depends on this file:**
- server/app.ts
- server/middleware/query-sanitization.test.ts

---

### 4realmain/server/middleware/frontend-contracts.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for frontend-contracts.test.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../../src/features/bank/transactionPresentation.ts
  - ../../src/services/matches.service.ts
  - ../../src/services/api/apiClient.ts
- External packages:
  - node:assert/strict
  - node:test

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/game-room-registry.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for game-room-registry.test.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../services/game-room-registry.service.ts
- External packages:
  - node:assert/strict
  - node:test

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/idempotency-key.repository.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for idempotency-key.repository.test.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../repositories/idempotency-key.repository.ts
- External packages:
  - node:assert/strict
  - node:test

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/idempotency.service.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for idempotency.service.test.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../models/Order.ts
  - ../repositories/order-proof-relay.repository.ts
  - ../repositories/idempotency-key.repository.ts
  - ../config/env.ts
  - ../services/order-proof-relay.service.ts
- External packages:
  - node:assert/strict
  - node:test
  - mongoose

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/logging-and-schemas.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test, zod
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for logging-and-schemas.test.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../utils/logger.ts
  - ../schemas/external/parse-external-response.ts
  - ../schemas/external/toncenter-transfer.schema.ts
  - ../schemas/external/toncenter-balance.schema.ts
- External packages:
  - node:assert/strict
  - node:test
  - zod

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/match-access.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for match-access.test.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../services/user.service.ts
  - ../serializers/api.ts
  - ../services/match.service.ts
- External packages:
  - node:assert/strict
  - node:test
  - mongoose

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/match-controller-context.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for match-controller-context.test.ts
- Validates input and orchestrates services

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../services/match.service.ts
  - ../controllers/match.controller.ts
- External packages:
  - node:assert/strict
  - node:test
  - mongoose

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/merchant-dashboard.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test, @ton/ton, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for merchant-dashboard.test.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../services/hot-wallet-runtime.service.ts
  - ../models/Order.ts
  - ../repositories/user-balance.repository.ts
  - ../services/merchant-dashboard.service.ts
  - ../models/MerchantConfig.ts
  - ../models/User.ts
  - ../config/env.ts
- External packages:
  - node:assert/strict
  - node:test
  - @ton/ton
  - mongoose

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/migration-services.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for migration-services.test.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../services/match-payout.service.ts
  - ../services/auth-identity.service.ts
  - ../serializers/api.ts
  - ../models/MerchantConfig.ts
  - ../config/env.ts
  - ../validation/request-schemas.ts
  - ../services/merchant-config.service.ts
- External packages:
  - node:assert/strict
  - node:test
  - mongoose

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/order-service.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for order-service.test.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../models/Order.ts
  - ../services/audit.service.ts
  - ../services/order.service.ts
  - ../services/user.service.ts
  - ../services/transaction.service.ts
- External packages:
  - node:assert/strict
  - node:test
  - mongoose

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/query-sanitization.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for query-sanitization.test.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../models/Match.ts
  - ../services/user.service.ts
  - ./error.middleware.ts
  - ../models/User.ts
  - ../config/env.ts
  - ../utils/logger.ts
  - ../services/match.service.ts
- External packages:
  - node:assert/strict
  - node:test
  - mongoose

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/rate-limit.middleware.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express-rate-limit, rate-limit-redis
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for rate-limit.middleware.ts

**Key responsibilities:**
- Implements logic for rate-limit.middleware.ts

**Exports / Side Effects:**
- createWithdrawalRateLimiter
- createAuthRateLimiter
- createGeneralRateLimiter

**Dependencies used:**
- Internal imports:
  - ../services/redis.service.ts
  - ../config/env.ts
- External packages:
  - express-rate-limit
  - rate-limit-redis

**Who depends on this file:**
- server/app.ts
- server/routes/auth.routes.ts
- server/routes/transactions.routes.ts

---

### 4realmain/server/middleware/realtime-match.service.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for realtime-match.service.test.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../services/user.service.ts
  - ../services/game-room-registry.service.ts
  - ../services/realtime-match.service.ts
  - ../services/match.service.ts
- External packages:
  - node:assert/strict
  - node:test
  - mongoose

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/request-context.middleware.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express, node:crypto
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for request-context.middleware.ts

**Key responsibilities:**
- Implements logic for request-context.middleware.ts

**Exports / Side Effects:**
- requestContextMiddleware

**Dependencies used:**
- Internal imports:
  - ../services/trace-context.service.ts
  - ../services/metrics.service.ts
  - ../utils/logger.ts
  - ../utils/get-logged-path.ts
- External packages:
  - express
  - node:crypto

**Who depends on this file:**
- server/app.ts

---

### 4realmain/server/middleware/security.middleware.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test, zod
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for security.middleware.test.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ./validate.middleware.ts
  - ./csrf.middleware.ts
  - ../config/env.ts
- External packages:
  - node:assert/strict
  - node:test
  - zod

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/static-files.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert, express, node:test, path
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for static-files.test.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages:
  - node:assert
  - express
  - node:test
  - path

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/ton-payments.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test, @ton/ton, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Unit/integration test suite.

**Key responsibilities:**
- Implements logic for ton-payments.test.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../services/deposit-ingestion.service.ts
  - ../services/user.service.ts
  - ../services/withdrawal-engine.ts
  - ../config/env.ts
  - ../services/withdrawal-service.ts
  - ../repositories/withdrawal.repository.ts
  - ../repositories/user-balance.repository.ts
  - ../services/audit.service.ts
  - ../services/deposit-service.ts
  - ../services/transaction.service.ts
- External packages:
  - node:assert/strict
  - node:test
  - @ton/ton
  - mongoose

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/user-balance.repository.test.ts

**Type:** test

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: node:assert/strict, node:test, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for user-balance.repository.test.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../utils/logger.ts
  - ../config/env.ts
  - ../repositories/user-balance.repository.ts
- External packages:
  - node:assert/strict
  - node:test
  - mongoose

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/middleware/validate.middleware.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express, zod
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for validate.middleware.ts

**Key responsibilities:**
- Implements logic for validate.middleware.ts

**Exports / Side Effects:**
- validateBody

**Dependencies used:**
- Internal imports:
  - ../utils/http-error.ts
- External packages:
  - express
  - zod

**Who depends on this file:**
- server/middleware/security.middleware.test.ts
- server/routes/admin.routes.ts
- server/routes/auth.routes.ts
- server/routes/matches.routes.ts
- server/routes/orders.routes.ts
- server/routes/transactions.routes.ts

---

### 4realmain/server/models/Match.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines Mongoose schema and data models.

**Key responsibilities:**
- Implements logic for Match.ts

**Exports / Side Effects:**
- IMatch
- Match

**Dependencies used:**
- Internal imports: None
- External packages:
  - mongoose

**Who depends on this file:**
- server/lib/setup-db.ts
- server/middleware/query-sanitization.test.ts
- server/seed.ts
- server/serializers/api.ts
- server/services/game-room.service.ts
- server/services/match.service.ts

---

### 4realmain/server/models/MerchantConfig.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines Mongoose schema and data models.

**Key responsibilities:**
- Implements logic for MerchantConfig.ts

**Exports / Side Effects:**
- IMerchantConfig
- MerchantConfig

**Dependencies used:**
- Internal imports: None
- External packages:
  - mongoose

**Who depends on this file:**
- server/middleware/merchant-dashboard.test.ts
- server/middleware/migration-services.test.ts
- server/services/merchant-config.service.ts

---

### 4realmain/server/models/Order.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines Mongoose schema and data models.

**Key responsibilities:**
- Implements logic for Order.ts

**Exports / Side Effects:**
- IOrder
- Order
- TelegramOrderProof

**Dependencies used:**
- Internal imports: None
- External packages:
  - mongoose

**Who depends on this file:**
- server/lib/setup-db.ts
- server/middleware/idempotency.service.test.ts
- server/middleware/merchant-dashboard.test.ts
- server/middleware/order-service.test.ts
- server/repositories/order-proof-relay.repository.ts
- server/seed.ts
- server/serializers/api.ts
- server/services/merchant-dashboard.service.ts
- server/services/order-proof-relay.service.ts
- server/services/order.service.ts
- ...and 1 more

---

### 4realmain/server/models/Transaction.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines Mongoose schema and data models.

**Key responsibilities:**
- Implements logic for Transaction.ts

**Exports / Side Effects:**
- LedgerTransactionStatus
- Transaction
- LedgerTransactionType
- ITransaction

**Dependencies used:**
- Internal imports: None
- External packages:
  - mongoose

**Who depends on this file:**
- server/lib/setup-db.ts
- server/serializers/api.ts
- server/services/transaction.service.ts

---

### 4realmain/server/models/User.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines Mongoose schema and data models.

**Key responsibilities:**
- Implements logic for User.ts

**Exports / Side Effects:**
- User
- IUser
- SYSTEM_COMMISSION_ACCOUNT_ID

**Dependencies used:**
- Internal imports: None
- External packages:
  - mongoose

**Who depends on this file:**
- server/lib/setup-db.ts
- server/middleware/deposit-reconciliation.test.ts
- server/middleware/merchant-dashboard.test.ts
- server/middleware/query-sanitization.test.ts
- server/seed.ts
- server/serializers/api.ts
- server/services/deposit-ingestion.service.ts
- server/services/merchant-dashboard.service.ts
- server/services/user.service.ts
- server/workers/withdrawal-worker.ts

---

### 4realmain/server/repositories/audit-event.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for audit-event.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- AuditEventDocument
- AuditEventRepository

**Dependencies used:**
- Internal imports:
  - ./mongo.repository.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/lib/setup-db.ts
- server/services/audit.service.ts

---

### 4realmain/server/repositories/deposit-memo.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for deposit-memo.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- DepositMemoRepository
- DepositMemoDocument

**Dependencies used:**
- Internal imports:
  - ./mongo.repository.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/lib/setup-db.ts
- server/middleware/deposit-reconciliation.test.ts
- server/middleware/ton-payments.test.ts
- server/services/deposit-ingestion.service.ts
- server/services/deposit-service.ts
- server/services/deposit-tonconnect.service.ts

---

### 4realmain/server/repositories/deposit.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for deposit.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- DepositDocument
- DepositRepository

**Dependencies used:**
- Internal imports:
  - ./mongo.repository.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/lib/setup-db.ts
- server/middleware/deposit-reconciliation.test.ts
- server/middleware/ton-payments.test.ts
- server/serializers/api.ts
- server/services/deposit-ingestion.service.ts
- server/services/merchant-dashboard.service.ts
- server/services/transaction.service.ts

---

### 4realmain/server/repositories/distributed-lock.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for distributed-lock.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- DistributedLockDocument
- DistributedLockRepository

**Dependencies used:**
- Internal imports:
  - ./mongo.repository.ts
- External packages: None

**Who depends on this file:**
- server/lib/setup-db.ts
- server/services/distributed-lock.service.ts

---

### 4realmain/server/repositories/failed-deposit-ingestion.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for failed-deposit-ingestion.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- FailedDepositIngestionStatus
- FailedDepositIngestionRepository
- FailedDepositIngestionDocument

**Dependencies used:**
- Internal imports:
  - ./mongo.repository.ts
  - ../services/deposit-ingestion.service.ts
- External packages: None

**Who depends on this file:**
- server/lib/setup-db.ts
- server/workers/deposit-poller.ts
- server/workers/failed-deposit-replay-worker.ts

---

### 4realmain/server/repositories/idempotency-key.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for idempotency-key.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- IdempotencyStatus
- IdempotencyKeyRepository
- IdempotencyKeyDocument

**Dependencies used:**
- Internal imports:
  - ./mongo.repository.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/lib/setup-db.ts
- server/middleware/idempotency-key.repository.test.ts
- server/middleware/idempotency.service.test.ts
- server/services/idempotency.service.ts

---

### 4realmain/server/repositories/jetton-wallet-cache.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for jetton-wallet-cache.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- JettonWalletCacheDocument
- JettonWalletCacheRepository

**Dependencies used:**
- Internal imports:
  - ./mongo.repository.ts
- External packages: None

**Who depends on this file:**
- server/lib/jetton.ts
- server/lib/setup-db.ts

---

### 4realmain/server/repositories/mongo.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for mongo.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- getMongoCollection
- getMongoDb

**Dependencies used:**
- Internal imports:
  - ../services/metrics.service.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/repositories/audit-event.repository.ts
- server/repositories/deposit-memo.repository.ts
- server/repositories/deposit.repository.ts
- server/repositories/distributed-lock.repository.ts
- server/repositories/failed-deposit-ingestion.repository.ts
- server/repositories/idempotency-key.repository.ts
- server/repositories/jetton-wallet-cache.repository.ts
- server/repositories/order-proof-relay.repository.ts
- server/repositories/poller-state.repository.ts
- server/repositories/processed-transaction.repository.ts
- ...and 5 more

---

### 4realmain/server/repositories/order-proof-relay.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for order-proof-relay.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- OrderProofRelayRepository
- OrderProofRelayDocument
- OrderProofRelayPayload
- OrderProofRelayStatus

**Dependencies used:**
- Internal imports:
  - ./mongo.repository.ts
  - ../models/Order.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/lib/setup-db.ts
- server/middleware/idempotency.service.test.ts

---

### 4realmain/server/repositories/poller-state.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for poller-state.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- PollerStateDocument
- PollerStateRepository

**Dependencies used:**
- Internal imports:
  - ./mongo.repository.ts
- External packages: None

**Who depends on this file:**
- server/lib/setup-db.ts
- server/middleware/ton-payments.test.ts
- server/workers/deposit-poller.ts

---

### 4realmain/server/repositories/processed-transaction.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for processed-transaction.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- ProcessedTransactionDocument
- ProcessedTransactionRepository
- ProcessedTransactionType

**Dependencies used:**
- Internal imports:
  - ./mongo.repository.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/lib/setup-db.ts
- server/middleware/deposit-reconciliation.test.ts
- server/middleware/ton-payments.test.ts
- server/services/deposit-ingestion.service.ts
- server/workers/deposit-poller.ts
- server/workers/withdrawal-worker.ts

---

### 4realmain/server/repositories/unmatched-deposit.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for unmatched-deposit.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- UnmatchedDepositRepository
- UnmatchedDepositResolutionAction
- UnmatchedDepositMemoStatus
- UnmatchedDepositDocument

**Dependencies used:**
- Internal imports:
  - ./mongo.repository.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/lib/setup-db.ts
- server/middleware/deposit-reconciliation.test.ts
- server/middleware/ton-payments.test.ts
- server/services/deposit-ingestion.service.ts
- server/services/merchant-dashboard.service.ts

---

### 4realmain/server/repositories/user-balance.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for user-balance.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- UserBalanceDocument
- UserBalanceSumOptions
- UserBalanceRepository

**Dependencies used:**
- Internal imports:
  - ../utils/logger.ts
  - ../utils/money.ts
  - ./mongo.repository.ts
  - ../config/env.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/lib/setup-db.ts
- server/middleware/deposit-reconciliation.test.ts
- server/middleware/merchant-dashboard.test.ts
- server/middleware/ton-payments.test.ts
- server/middleware/user-balance.repository.test.ts
- server/scripts/backfill-balance-atomic.ts
- server/seed.ts
- server/services/deposit-ingestion.service.ts
- server/services/merchant-dashboard.service.ts
- server/services/user.service.ts
- ...and 1 more

---

### 4realmain/server/repositories/withdrawal.repository.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Handles database operations for specific collections.

**Key responsibilities:**
- Implements logic for withdrawal.repository.ts
- Abstracts database queries and mutations

**Exports / Side Effects:**
- WithdrawalRepository
- ACCOUNTED_WITHDRAWAL_STATUSES
- WithdrawalStatus
- WithdrawalDocument

**Dependencies used:**
- Internal imports:
  - ../utils/money.ts
  - ./mongo.repository.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/controllers/transaction.controller.ts
- server/lib/setup-db.ts
- server/middleware/background-jobs.service.test.ts
- server/middleware/ton-payments.test.ts
- server/serializers/api.ts
- server/services/merchant-dashboard.service.ts
- server/services/transaction.service.ts
- server/services/withdrawal-service.ts
- server/workers/withdrawal-worker.ts

---

### 4realmain/server/routes/admin.routes.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines Express API routes.

**Key responsibilities:**
- Implements logic for admin.routes.ts
- Maps HTTP endpoints to controllers

**Exports / Side Effects:**
- router

**Dependencies used:**
- Internal imports:
  - ../middleware/auth.middleware.ts
  - ../controllers/merchant-admin.controller.ts
  - ../middleware/validate.middleware.ts
  - ../utils/async-handler.ts
- External packages:
  - express

**Who depends on this file:**
- server/routes/index.ts

---

### 4realmain/server/routes/auth.routes.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines Express API routes.

**Key responsibilities:**
- Implements logic for auth.routes.ts
- Maps HTTP endpoints to controllers

**Exports / Side Effects:**
- router

**Dependencies used:**
- Internal imports:
  - ../middleware/validate.middleware.ts
  - ../utils/async-handler.ts
  - ../middleware/auth.middleware.ts
  - ../middleware/rate-limit.middleware.ts
  - ../controllers/auth.controller.ts
  - ../validation/request-schemas.ts
- External packages:
  - express

**Who depends on this file:**
- server/routes/index.ts

---

### 4realmain/server/routes/index.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for index.ts

**Key responsibilities:**
- Implements logic for index.ts
- Maps HTTP endpoints to controllers

**Exports / Side Effects:**
- registerApiRoutes

**Dependencies used:**
- Internal imports:
  - ./orders.routes.ts
  - ./matches.routes.ts
  - ./users.routes.ts
  - ./auth.routes.ts
  - ./transactions.routes.ts
  - ./admin.routes.ts
- External packages:
  - express

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/routes/matches.routes.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines Express API routes.

**Key responsibilities:**
- Implements logic for matches.routes.ts
- Maps HTTP endpoints to controllers

**Exports / Side Effects:**
- router

**Dependencies used:**
- Internal imports:
  - ../middleware/validate.middleware.ts
  - ../utils/async-handler.ts
  - ../middleware/auth.middleware.ts
  - ../controllers/match.controller.ts
  - ../validation/request-schemas.ts
- External packages:
  - express

**Who depends on this file:**
- server/routes/index.ts

---

### 4realmain/server/routes/orders.routes.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines Express API routes.

**Key responsibilities:**
- Implements logic for orders.routes.ts
- Maps HTTP endpoints to controllers

**Exports / Side Effects:**
- router

**Dependencies used:**
- Internal imports:
  - ../middleware/validate.middleware.ts
  - ../utils/async-handler.ts
  - ../middleware/auth.middleware.ts
  - ../controllers/order.controller.ts
  - ../validation/request-schemas.ts
- External packages:
  - express

**Who depends on this file:**
- server/routes/index.ts

---

### 4realmain/server/routes/transactions.routes.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines Express API routes.

**Key responsibilities:**
- Implements logic for transactions.routes.ts
- Maps HTTP endpoints to controllers

**Exports / Side Effects:**
- router

**Dependencies used:**
- Internal imports:
  - ../middleware/auth.middleware.ts
  - ../middleware/rate-limit.middleware.ts
  - ../utils/async-handler.ts
  - ../middleware/validate.middleware.ts
- External packages:
  - express

**Who depends on this file:**
- server/routes/index.ts

---

### 4realmain/server/routes/users.routes.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines Express API routes.

**Key responsibilities:**
- Implements logic for users.routes.ts
- Maps HTTP endpoints to controllers

**Exports / Side Effects:**
- router

**Dependencies used:**
- Internal imports:
  - ../utils/async-handler.ts
  - ../controllers/user.controller.ts
- External packages:
  - express

**Who depends on this file:**
- server/routes/index.ts

---

### 4realmain/server/runtime.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: @socket.io/redis-adapter, helmet, socket.io, node:http
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for runtime.ts

**Key responsibilities:**
- Implements logic for runtime.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ./services/redis.service.ts
  - ./services/game-room-registry.service.ts
  - ./services/background-jobs.service.ts
  - ./services/user.service.ts
  - ./sockets/public-match-events.ts
  - ./lib/setup-db.ts
  - ./config/db.ts
  - ./config/env.ts
  - ./sockets/game.socket.ts
  - ./utils/logger.ts
- External packages:
  - @socket.io/redis-adapter
  - helmet
  - socket.io
  - node:http

**Who depends on this file:**
- main.ts
- server/app.ts
- server/middleware/background-jobs.service.test.ts
- server/middleware/deposit-reconciliation.test.ts
- server/middleware/merchant-dashboard.test.ts
- server/middleware/ton-payments.test.ts
- server/services/background-jobs.service.ts
- server/services/deposit-ingestion.service.ts
- server/services/merchant-dashboard.service.ts
- server/workers/deposit-poller.ts
- ...and 1 more

---

### 4realmain/server/schemas/external/parse-external-response.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: zod
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for parse-external-response.ts

**Key responsibilities:**
- Implements logic for parse-external-response.ts

**Exports / Side Effects:**
- ExternalSchemaError
- parseExternalResponse

**Dependencies used:**
- Internal imports:
  - ../../utils/logger.ts
- External packages:
  - zod

**Who depends on this file:**
- server/middleware/logging-and-schemas.test.ts
- server/services/deposit-ingestion.service.ts
- server/services/telegram-proof.service.ts
- server/services/withdrawal-engine.ts

---

### 4realmain/server/schemas/external/telegram-proof.schema.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: zod
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for telegram-proof.schema.ts

**Key responsibilities:**
- Implements logic for telegram-proof.schema.ts

**Exports / Side Effects:**
- telegramSendPhotoResponseSchema

**Dependencies used:**
- Internal imports: None
- External packages:
  - zod

**Who depends on this file:**
- server/services/telegram-proof.service.ts

---

### 4realmain/server/schemas/external/toncenter-balance.schema.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: zod
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for toncenter-balance.schema.ts

**Key responsibilities:**
- Implements logic for toncenter-balance.schema.ts

**Exports / Side Effects:**
- toncenterJettonWalletBalanceSchema

**Dependencies used:**
- Internal imports: None
- External packages:
  - zod

**Who depends on this file:**
- server/middleware/logging-and-schemas.test.ts
- server/services/withdrawal-engine.ts

---

### 4realmain/server/schemas/external/toncenter-transfer.schema.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: zod
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for toncenter-transfer.schema.ts

**Key responsibilities:**
- Implements logic for toncenter-transfer.schema.ts

**Exports / Side Effects:**
- toncenterJettonTransferSchema
- toncenterTransferListSchema

**Dependencies used:**
- Internal imports: None
- External packages:
  - zod

**Who depends on this file:**
- server/middleware/logging-and-schemas.test.ts
- server/services/deposit-ingestion.service.ts
- server/services/withdrawal-engine.ts

---

### 4realmain/server/scripts/backfill-balance-atomic.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for backfill-balance-atomic.ts

**Key responsibilities:**
- Implements logic for backfill-balance-atomic.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../repositories/user-balance.repository.ts
  - ../utils/logger.ts
  - ../repositories/mongo.repository.ts
  - ../utils/money.ts
  - ../config/db.ts
- External packages:
  - mongoose

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/seed.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: dotenv, mongoose, bcryptjs
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for seed.ts

**Key responsibilities:**
- Implements logic for seed.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ./models/User.ts
  - ./models/Match.ts
  - ./repositories/user-balance.repository.ts
  - ./config/db.ts
  - ./utils/logger.ts
  - ./utils/money.ts
  - ./models/Order.ts
- External packages:
  - dotenv
  - mongoose
  - bcryptjs

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/serializers/api.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for api.ts

**Key responsibilities:**
- Implements logic for api.ts

**Exports / Side Effects:**
- serializeAuthUser
- serializeLedgerTransaction
- serializeWithdrawalStatus
- serializeLeaderboardUser
- serializeWithdrawalTransaction
- serializeMatch
- serializeUserProfile
- serializeDepositTransaction
- serializeOrder

**Dependencies used:**
- Internal imports:
  - ../services/match-payout.service.ts
  - ../repositories/withdrawal.repository.ts
  - ../models/Order.ts
  - ../models/Match.ts
  - ../repositories/deposit.repository.ts
  - ../models/Transaction.ts
  - ../models/User.ts
- External packages: None

**Who depends on this file:**
- server/controllers/auth.controller.ts
- server/controllers/match.controller.ts
- server/controllers/order.controller.ts
- server/controllers/transaction.controller.ts
- server/controllers/user.controller.ts
- server/middleware/auth.middleware.ts
- server/middleware/error.middleware.ts
- server/middleware/frontend-contracts.test.ts
- server/middleware/match-access.test.ts
- server/middleware/migration-services.test.ts
- ...and 25 more

---

### 4realmain/server/services/audit.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for audit.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- AuditEventType
- AuditService

**Dependencies used:**
- Internal imports:
  - ./trace-context.service.ts
  - ../repositories/audit-event.repository.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/controllers/transaction.controller.ts
- server/middleware/deposit-reconciliation.test.ts
- server/middleware/order-service.test.ts
- server/middleware/ton-payments.test.ts
- server/services/deposit-ingestion.service.ts
- server/services/match.service.ts
- server/services/merchant-config.service.ts
- server/services/order.service.ts
- server/workers/withdrawal-worker.ts

---

### 4realmain/server/services/auth-identity.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for auth-identity.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- resolveAuthEmail
- buildSyntheticEmail

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- server/controllers/auth.controller.ts
- server/middleware/migration-services.test.ts

---

### 4realmain/server/services/auth-token.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: socket.io, jsonwebtoken
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for auth-token.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- decodeAuthToken
- signAuthToken
- extractSocketToken
- signRefreshToken
- decodeRefreshToken
- extractTokenFromCookieHeader

**Dependencies used:**
- Internal imports:
  - ../config/cookies.ts
  - ./user.service.ts
  - ../types/api.ts
  - ../config/config.ts
  - ../utils/http-error.ts
- External packages:
  - socket.io
  - jsonwebtoken

**Who depends on this file:**
- server/middleware/auth.controller.test.ts
- server/middleware/auth.middleware.ts
- server/sockets/game.socket.ts

---

### 4realmain/server/services/background-jobs.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: node:crypto
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for background-jobs.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- BackgroundJobState
- BackgroundJobController
- setBackgroundJobDependenciesForTests
- JobSnapshot
- resetBackgroundJobDependenciesForTests

**Dependencies used:**
- Internal imports:
  - ./order-proof-relay.service.ts
  - ./bullmq-jobs.service.ts
  - ./metrics.service.ts
  - ./trace-context.service.ts
  - ../workers/failed-deposit-replay-worker.ts
  - ../config/env.ts
  - ./hot-wallet-runtime.service.ts
  - ../workers/deposit-poller.ts
  - ../utils/logger.ts
  - ./match.service.ts
- External packages:
  - node:crypto

**Who depends on this file:**
- server/controllers/merchant-admin.controller.ts
- server/runtime.ts
- server/services/merchant-dashboard.service.ts

---

### 4realmain/server/services/bullmq-jobs.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: bullmq
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for bullmq-jobs.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- BullmqBackgroundJobRuntime

**Dependencies used:**
- Internal imports:
  - ../utils/logger.ts
  - ./redis.service.ts
  - ../config/env.ts
  - ./metrics.service.ts
- External packages:
  - bullmq

**Who depends on this file:**
- server/app.ts
- server/services/background-jobs.service.ts

---

### 4realmain/server/services/dependency-resilience.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for dependency-resilience.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- getDependencyStateSnapshot
- isRetryableDependencyError
- isRetryableHttpStatus
- resetDependencyStateForTests
- createDependencyHttpError

**Dependencies used:**
- Internal imports:
  - ../config/env.ts
  - ../utils/http-error.ts
- External packages: None

**Who depends on this file:**
- server/services/deposit-ingestion.service.ts
- server/services/telegram-proof.service.ts
- server/services/withdrawal-engine.ts

---

### 4realmain/server/services/deposit-ingestion.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for deposit-ingestion.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- JettonTransferEvent
- DepositReplayTransferResult
- DepositReviewItem
- DepositReplayDecision

**Dependencies used:**
- Internal imports:
  - ../schemas/external/parse-external-response.ts
  - ../config/env.ts
  - ./user.service.ts
  - ../repositories/user-balance.repository.ts
  - ../utils/http-error.ts
  - ./dependency-resilience.service.ts
  - ./metrics.service.ts
  - ../repositories/deposit.repository.ts
  - ./audit.service.ts
  - ../models/User.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/middleware/ton-payments.test.ts
- server/repositories/failed-deposit-ingestion.repository.ts
- server/workers/failed-deposit-replay-worker.ts

---

### 4realmain/server/services/deposit-service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: @ton/ton, node:crypto
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for deposit-service.ts

**Key responsibilities:**
- Implements logic for deposit-service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../repositories/deposit-memo.repository.ts
  - ../config/env.ts
  - ../utils/http-error.ts
- External packages:
  - @ton/ton
  - node:crypto

**Who depends on this file:**
- server/controllers/transaction.controller.ts
- server/middleware/ton-payments.test.ts

---

### 4realmain/server/services/deposit-tonconnect.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: @ton/ton
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for deposit-tonconnect.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- PreparedTonConnectDeposit

**Dependencies used:**
- Internal imports:
  - ../repositories/deposit-memo.repository.ts
  - ../config/env.ts
  - ../utils/http-error.ts
  - ../lib/jetton.ts
- External packages:
  - @ton/ton

**Who depends on this file:**
- server/controllers/transaction.controller.ts

---

### 4realmain/server/services/distributed-lock.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: node:crypto
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for distributed-lock.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- DistributedLockService
- setDistributedLockDependenciesForTests
- resetDistributedLockDependenciesForTests
- LockUnavailableError

**Dependencies used:**
- Internal imports:
  - ../utils/logger.ts
  - ../repositories/distributed-lock.repository.ts
- External packages:
  - node:crypto

**Who depends on this file:**
- server/middleware/ton-payments.test.ts
- server/workers/withdrawal-worker.ts

---

### 4realmain/server/services/game-room-registry.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: node:crypto
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for game-room-registry.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- GameRoomRegistry

**Dependencies used:**
- Internal imports:
  - ./redis.service.ts
  - ../config/env.ts
  - ./game-room.service.ts
- External packages:
  - node:crypto

**Who depends on this file:**
- server/middleware/game-room-registry.test.ts
- server/middleware/realtime-match.service.test.ts
- server/runtime.ts
- server/services/realtime-match.service.ts

---

### 4realmain/server/services/game-room.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for game-room.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- RoomState
- RoomPlayer
- createEmptyBoard
- determineCurrentTurn
- buildBoardFromMoves
- checkWin

**Dependencies used:**
- Internal imports:
  - ./user.service.ts
  - ../types/api.ts
  - ../models/Match.ts
  - ./match-payout.service.ts
- External packages: None

**Who depends on this file:**
- server/services/game-room-registry.service.ts
- server/services/realtime-match.service.ts

---

### 4realmain/server/services/hot-wallet-runtime.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: @ton/ton
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for hot-wallet-runtime.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- HotWalletRuntimeState
- setHotWalletRuntimeForTests
- getHotWalletRuntime

**Dependencies used:**
- Internal imports:
  - ../utils/logger.ts
  - ../config/env.ts
  - ../utils/http-error.ts
  - ../lib/jetton.ts
- External packages:
  - @ton/ton

**Who depends on this file:**
- server/app.ts
- server/middleware/background-jobs.service.test.ts
- server/middleware/deposit-reconciliation.test.ts
- server/middleware/merchant-dashboard.test.ts
- server/middleware/ton-payments.test.ts
- server/services/background-jobs.service.ts
- server/services/deposit-ingestion.service.ts
- server/services/merchant-dashboard.service.ts
- server/workers/deposit-poller.ts
- server/workers/withdrawal-worker.ts

---

### 4realmain/server/services/idempotency.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: node:crypto, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for idempotency.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- hashIdempotencyPayload
- IdempotentMutationResponse
- IdempotencyConflictError

**Dependencies used:**
- Internal imports:
  - ../repositories/idempotency-key.repository.ts
  - ../utils/http-error.ts
- External packages:
  - node:crypto
  - mongoose

**Who depends on this file:**
- server/controllers/match.controller.ts
- server/controllers/order.controller.ts
- server/controllers/transaction.controller.ts

---

### 4realmain/server/services/match-payout.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for match-payout.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- calculateMatchPayout
- DRAW_COMMISSION_RATE
- calculateProjectedWinnerAmount
- MATCH_COMMISSION_RATE
- calculateDrawPayout
- DrawPayoutSummary
- MatchPayoutSummary

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- server/middleware/migration-services.test.ts
- server/serializers/api.ts
- server/services/game-room.service.ts
- server/services/match.service.ts

---

### 4realmain/server/services/match.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: node:crypto, mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for match.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- MatchService

**Dependencies used:**
- Internal imports:
  - ../sockets/public-match-events.ts
  - ./transaction.service.ts
  - ../models/Match.ts
  - ./user.service.ts
  - ../types/api.ts
  - ../utils/trusted-filter.ts
  - ./match-payout.service.ts
  - ../config/env.ts
  - ./audit.service.ts
  - ../utils/http-error.ts
- External packages:
  - node:crypto
  - mongoose

**Who depends on this file:**
- server/controllers/match.controller.ts
- server/middleware/match-access.test.ts
- server/middleware/match-controller-context.test.ts
- server/middleware/query-sanitization.test.ts
- server/middleware/realtime-match.service.test.ts
- server/runtime.ts
- server/services/background-jobs.service.ts
- server/services/realtime-match.service.ts
- server/sockets/game.socket.ts

---

### 4realmain/server/services/merchant-config.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for merchant-config.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- MerchantConfig

**Dependencies used:**
- Internal imports:
  - ../models/MerchantConfig.ts
  - ../types/api.ts
  - ./audit.service.ts
  - ../config/env.ts
- External packages: None

**Who depends on this file:**
- server/controllers/merchant-admin.controller.ts
- server/controllers/order.controller.ts
- server/middleware/migration-services.test.ts
- server/services/merchant-dashboard.service.ts
- src/pages/merchant/LiquidityPage.tsx

---

### 4realmain/server/services/merchant-dashboard.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for merchant-dashboard.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- MerchantDashboardService

**Dependencies used:**
- Internal imports:
  - ../repositories/withdrawal.repository.ts
  - ../models/Order.ts
  - ../repositories/user-balance.repository.ts
  - ../repositories/mongo.repository.ts
  - ./merchant-config.service.ts
  - ./background-jobs.service.ts
  - ./withdrawal-engine.ts
  - ../repositories/deposit.repository.ts
  - ../models/User.ts
  - ../config/env.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/controllers/merchant-admin.controller.ts
- server/middleware/merchant-dashboard.test.ts
- src/components/merchant/MerchantLayout.tsx
- src/pages/merchant/OrderDeskPage.tsx

---

### 4realmain/server/services/metrics.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for metrics.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- setUnmatchedDepositsOpen
- recordBackgroundJobRun
- setWalletReserveDeltaUsdt
- recordMongoOperation
- setBullmqQueueDepth
- unregisterMetricsCollector
- resetMetricsForTests
- recordWithdrawalBalanceHoldFailure
- setWalletUsdtBalance
- recordHttpRequest
- ...and 4 more

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- server/app.ts
- server/middleware/request-context.middleware.ts
- server/repositories/mongo.repository.ts
- server/services/background-jobs.service.ts
- server/services/bullmq-jobs.service.ts
- server/services/deposit-ingestion.service.ts
- server/services/withdrawal-service.ts

---

### 4realmain/server/services/order-proof-relay.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for order-proof-relay.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../utils/logger.ts
  - ./telegram-proof.service.ts
  - ../models/Order.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/controllers/order.controller.ts
- server/middleware/idempotency.service.test.ts
- server/services/background-jobs.service.ts

---

### 4realmain/server/services/order.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for order.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- OrderService

**Dependencies used:**
- Internal imports:
  - ./transaction.service.ts
  - ../models/Order.ts
  - ./user.service.ts
  - ./audit.service.ts
  - ../utils/http-error.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/controllers/order.controller.ts
- server/middleware/order-service.test.ts

---

### 4realmain/server/services/realtime-match.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for realtime-match.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- GameOverResult
- JoinRoomResult
- RealtimeMatchService
- MoveMadeResult
- MakeMoveResult

**Dependencies used:**
- Internal imports:
  - ./user.service.ts
  - ./game-room-registry.service.ts
  - ./match.service.ts
  - ./game-room.service.ts
  - ../utils/http-error.ts
- External packages: None

**Who depends on this file:**
- server/middleware/realtime-match.service.test.ts
- server/runtime.ts
- server/sockets/game.socket.ts

---

### 4realmain/server/services/redis.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: ioredis
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for redis.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- getRedisClient

**Dependencies used:**
- Internal imports:
  - ../config/env.ts
- External packages:
  - ioredis

**Who depends on this file:**
- server/app.ts
- server/middleware/rate-limit.middleware.ts
- server/runtime.ts
- server/services/bullmq-jobs.service.ts
- server/services/game-room-registry.service.ts
- server/services/socket-rate-limit.service.ts

---

### 4realmain/server/services/socket-rate-limit.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: node:crypto
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for socket-rate-limit.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ./redis.service.ts
  - ../config/env.ts
- External packages:
  - node:crypto

**Who depends on this file:**
- server/sockets/game.socket.ts

---

### 4realmain/server/services/telegram-proof.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for telegram-proof.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../schemas/external/telegram-proof.schema.ts
  - ../schemas/external/parse-external-response.ts
  - ../models/Order.ts
  - ../config/env.ts
  - ./dependency-resilience.service.ts
  - ../utils/http-error.ts
- External packages: None

**Who depends on this file:**
- server/services/order-proof-relay.service.ts

---

### 4realmain/server/services/trace-context.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: node:async_hooks
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for trace-context.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- assignTraceContext
- runWithTraceContext
- TraceContext
- getTraceContext

**Dependencies used:**
- Internal imports: None
- External packages:
  - node:async_hooks

**Who depends on this file:**
- server/middleware/auth.middleware.ts
- server/middleware/request-context.middleware.ts
- server/services/audit.service.ts
- server/services/background-jobs.service.ts
- server/sockets/game.socket.ts
- server/utils/logger.ts

---

### 4realmain/server/services/transaction.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for transaction.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- TransactionService

**Dependencies used:**
- Internal imports:
  - ../repositories/withdrawal.repository.ts
  - ../serializers/api.ts
  - ../types/api.ts
  - ../repositories/deposit.repository.ts
  - ../models/Transaction.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/controllers/transaction.controller.ts
- server/middleware/order-service.test.ts
- server/middleware/ton-payments.test.ts
- server/services/match.service.ts
- server/services/order.service.ts
- server/services/user.service.ts
- server/workers/withdrawal-worker.ts

---

### 4realmain/server/services/user.service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for user.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- CreateUserInput
- UserService

**Dependencies used:**
- Internal imports:
  - ./transaction.service.ts
  - ../repositories/user-balance.repository.ts
  - ../utils/http-error.ts
  - ../models/User.ts
  - ../utils/money.ts
  - ../utils/trusted-filter.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/controllers/auth.controller.ts
- server/controllers/order.controller.ts
- server/controllers/user.controller.ts
- server/middleware/auth.controller.test.ts
- server/middleware/auth.middleware.test.ts
- server/middleware/deposit-reconciliation.test.ts
- server/middleware/match-access.test.ts
- server/middleware/order-service.test.ts
- server/middleware/query-sanitization.test.ts
- server/middleware/realtime-match.service.test.ts
- ...and 10 more

---

### 4realmain/server/services/withdrawal-engine.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: @ton/ton
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for withdrawal-engine.ts

**Key responsibilities:**
- Implements logic for withdrawal-engine.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- SeqnoTimeoutError
- buildJettonTransferBody

**Dependencies used:**
- Internal imports:
  - ../schemas/external/parse-external-response.ts
  - ../schemas/external/toncenter-balance.schema.ts
  - ../lib/jetton.ts
  - ../lib/ton-client.ts
  - ../config/env.ts
  - ../utils/logger.ts
  - ./dependency-resilience.service.ts
  - ../schemas/external/toncenter-transfer.schema.ts
- External packages:
  - @ton/ton

**Who depends on this file:**
- server/middleware/ton-payments.test.ts
- server/services/merchant-dashboard.service.ts

---

### 4realmain/server/services/withdrawal-service.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for withdrawal-service.ts

**Key responsibilities:**
- Implements logic for withdrawal-service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../repositories/withdrawal.repository.ts
  - ./user.service.ts
  - ./metrics.service.ts
  - ../config/env.ts
  - ../utils/money.ts
  - ../utils/http-error.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/controllers/transaction.controller.ts
- server/middleware/ton-payments.test.ts

---

### 4realmain/server/sockets/game.socket.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: node:crypto, socket.io
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for game.socket.ts

**Key responsibilities:**
- Implements logic for game.socket.ts

**Exports / Side Effects:**
- registerGameSocketHandlers

**Dependencies used:**
- Internal imports:
  - ../services/trace-context.service.ts
  - ../services/socket-rate-limit.service.ts
  - ../services/realtime-match.service.ts
  - ../services/auth-token.service.ts
  - ../config/env.ts
  - ../utils/logger.ts
- External packages:
  - node:crypto
  - socket.io

**Who depends on this file:**
- server/runtime.ts

---

### 4realmain/server/sockets/public-match-events.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: socket.io
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for public-match-events.ts

**Key responsibilities:**
- Implements logic for public-match-events.ts

**Exports / Side Effects:**
- emitPublicMatchUpdatedEvent
- registerPublicMatchEvents

**Dependencies used:**
- Internal imports:
  - ../../shared/socket-events.ts
- External packages:
  - socket.io

**Who depends on this file:**
- server/controllers/match.controller.ts
- server/runtime.ts
- server/services/match.service.ts

---

### 4realmain/server/types/api.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for api.ts

**Key responsibilities:**
- Implements logic for api.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- server/controllers/auth.controller.ts
- server/controllers/match.controller.ts
- server/controllers/order.controller.ts
- server/controllers/transaction.controller.ts
- server/controllers/user.controller.ts
- server/middleware/auth.middleware.ts
- server/middleware/error.middleware.ts
- server/middleware/frontend-contracts.test.ts
- server/middleware/match-access.test.ts
- server/middleware/migration-services.test.ts
- ...and 25 more

---

### 4realmain/server/types/compression.d.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for compression.d.ts

**Key responsibilities:**
- Implements logic for compression.d.ts

**Exports / Side Effects:**
- function
- compression

**Dependencies used:**
- Internal imports: None
- External packages:
  - express

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/server/utils/async-handler.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for async-handler.ts

**Key responsibilities:**
- Implements logic for async-handler.ts

**Exports / Side Effects:**
- asyncHandler

**Dependencies used:**
- Internal imports: None
- External packages:
  - express

**Who depends on this file:**
- server/routes/admin.routes.ts
- server/routes/auth.routes.ts
- server/routes/matches.routes.ts
- server/routes/orders.routes.ts
- server/routes/transactions.routes.ts
- server/routes/users.routes.ts

---

### 4realmain/server/utils/get-logged-path.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for get-logged-path.ts

**Key responsibilities:**
- Implements logic for get-logged-path.ts

**Exports / Side Effects:**
- getLoggedPath

**Dependencies used:**
- Internal imports:
  - ./redact.ts
- External packages: None

**Who depends on this file:**
- server/middleware/error.middleware.ts
- server/middleware/request-context.middleware.ts

---

### 4realmain/server/utils/http-error.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for http-error.ts

**Key responsibilities:**
- Implements logic for http-error.ts

**Exports / Side Effects:**
- AuthError
- ForbiddenError
- internalServerError
- ServiceUnavailableError
- PaymentError
- serviceUnavailable
- AppError
- unauthorized
- InternalServerAppError
- forbidden
- ...and 9 more

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- server/controllers/auth.controller.ts
- server/controllers/match.controller.ts
- server/controllers/order.controller.ts
- server/controllers/transaction.controller.ts
- server/controllers/user.controller.ts
- server/middleware/auth.middleware.ts
- server/middleware/csrf.middleware.ts
- server/middleware/error.middleware.ts
- server/middleware/validate.middleware.ts
- server/services/auth-token.service.ts
- ...and 14 more

---

### 4realmain/server/utils/idempotency.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for idempotency.ts

**Key responsibilities:**
- Implements logic for idempotency.ts

**Exports / Side Effects:**
- getRequiredIdempotencyKey

**Dependencies used:**
- Internal imports:
  - ./http-error.ts
- External packages:
  - express

**Who depends on this file:**
- server/controllers/match.controller.ts
- server/controllers/order.controller.ts
- server/controllers/transaction.controller.ts
- server/lib/setup-db.ts
- server/middleware/idempotency-key.repository.test.ts
- server/middleware/idempotency.service.test.ts
- server/services/idempotency.service.ts
- src/services/matches.service.ts
- src/services/orders.service.ts
- src/services/transactions.service.ts

---

### 4realmain/server/utils/logger.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for logger.ts

**Key responsibilities:**
- Implements logic for logger.ts

**Exports / Side Effects:**
- logger
- LogContext
- Logger

**Dependencies used:**
- Internal imports:
  - ../services/trace-context.service.ts
  - ./redact.ts
- External packages: None

**Who depends on this file:**
- main.ts
- server/config/db.ts
- server/controllers/order.controller.ts
- server/http/frontend.ts
- server/lib/setup-db.ts
- server/middleware/error.middleware.ts
- server/middleware/logging-and-schemas.test.ts
- server/middleware/query-sanitization.test.ts
- server/middleware/request-context.middleware.ts
- server/middleware/ton-payments.test.ts
- ...and 17 more

---

### 4realmain/server/utils/money.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for money.ts

**Key responsibilities:**
- Implements logic for money.ts

**Exports / Side Effects:**
- parseRawAmount
- rawAmountToDisplayString
- decimalLikeToBigInt
- rawToDecimal128Expression
- decimal128FromRaw
- rawAmountToUsdtNumber
- DecimalLike
- usdtNumberToRawAmount

**Dependencies used:**
- Internal imports: None
- External packages:
  - mongoose

**Who depends on this file:**
- server/repositories/user-balance.repository.ts
- server/repositories/withdrawal.repository.ts
- server/scripts/backfill-balance-atomic.ts
- server/seed.ts
- server/services/user.service.ts
- server/services/withdrawal-service.ts

---

### 4realmain/server/utils/multipart.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: express
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for multipart.ts

**Key responsibilities:**
- Implements logic for multipart.ts

**Exports / Side Effects:**
- ParsedMultipartFile
- ParsedMultipartForm

**Dependencies used:**
- Internal imports:
  - ./http-error.ts
- External packages:
  - express

**Who depends on this file:**
- server/controllers/order.controller.ts

---

### 4realmain/server/utils/redact.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for redact.ts

**Key responsibilities:**
- Implements logic for redact.ts

**Exports / Side Effects:**
- sanitizeUrlPath
- redact

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- server/utils/get-logged-path.ts
- server/utils/logger.ts

---

### 4realmain/server/utils/trusted-filter.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for trusted-filter.ts

**Key responsibilities:**
- Implements logic for trusted-filter.ts

**Exports / Side Effects:**
- trustFilter

**Dependencies used:**
- Internal imports: None
- External packages:
  - mongoose

**Who depends on this file:**
- server/services/deposit-ingestion.service.ts
- server/services/match.service.ts
- server/services/merchant-dashboard.service.ts
- server/services/user.service.ts

---

### 4realmain/server/validation/request-schemas.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: @ton/ton, zod
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for request-schemas.ts

**Key responsibilities:**
- Implements logic for request-schemas.ts

**Exports / Side Effects:**
- merchantDepositReplayWindowRequestSchema
- MerchantDepositReplayWindowRequest
- loginRequestSchema
- RegisterRequest
- updateOrderStatusRequestSchema
- CreateOrderRequest
- MerchantDepositReconcileRequest
- updateMerchantConfigRequestSchema
- createOrderRequestSchema
- withdrawRequestSchema
- ...and 10 more

**Dependencies used:**
- Internal imports:
  - ../config/env.ts
- External packages:
  - @ton/ton
  - zod

**Who depends on this file:**
- server/controllers/auth.controller.ts
- server/controllers/match.controller.ts
- server/middleware/migration-services.test.ts
- server/routes/auth.routes.ts
- server/routes/matches.routes.ts
- server/routes/orders.routes.ts

---

### 4realmain/server/workers/deposit-poller.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for deposit-poller.ts

**Key responsibilities:**
- Implements logic for deposit-poller.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ../services/hot-wallet-runtime.service.ts
  - ../repositories/poller-state.repository.ts
  - ../repositories/failed-deposit-ingestion.repository.ts
  - ../utils/logger.ts
  - ../repositories/processed-transaction.repository.ts
- External packages: None

**Who depends on this file:**
- server/middleware/ton-payments.test.ts
- server/services/background-jobs.service.ts

---

### 4realmain/server/workers/failed-deposit-replay-worker.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for failed-deposit-replay-worker.ts

**Key responsibilities:**
- Implements logic for failed-deposit-replay-worker.ts

**Exports / Side Effects:**
- setFailedDepositReplayWorkerDependenciesForTests
- resetFailedDepositReplayWorkerForTests

**Dependencies used:**
- Internal imports:
  - ../utils/logger.ts
  - ../repositories/failed-deposit-ingestion.repository.ts
  - ../services/deposit-ingestion.service.ts
  - ../config/env.ts
- External packages: None

**Who depends on this file:**
- server/services/background-jobs.service.ts

---

### 4realmain/server/workers/withdrawal-worker.ts

**Type:** backend

**Tech stack detected:**
- Language: TypeScript
- Framework: Express.js
- Libraries: mongoose
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for withdrawal-worker.ts

**Key responsibilities:**
- Implements logic for withdrawal-worker.ts

**Exports / Side Effects:**
- setWithdrawalWorkerDependenciesForTests
- resetWithdrawalWorkerStateForTests

**Dependencies used:**
- Internal imports:
  - ../services/hot-wallet-runtime.service.ts
  - ../repositories/withdrawal.repository.ts
  - ../repositories/user-balance.repository.ts
  - ../services/audit.service.ts
  - ../services/user.service.ts
  - ../utils/logger.ts
  - ../models/User.ts
  - ../config/env.ts
  - ../services/distributed-lock.service.ts
  - ../services/transaction.service.ts
- External packages:
  - mongoose

**Who depends on this file:**
- server/middleware/background-jobs.service.test.ts

---

### 4realmain/shared/socket-events.ts

**Type:** shared

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for socket-events.ts

**Key responsibilities:**
- Implements logic for socket-events.ts

**Exports / Side Effects:**
- PUBLIC_MATCHES_UPDATED_EVENT

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- server/sockets/public-match-events.ts
- src/pages/DashboardPage.tsx

---

### 4realmain/shared/types/api.ts

**Type:** shared

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for api.ts

**Key responsibilities:**
- Implements logic for api.ts

**Exports / Side Effects:**
- MatchDTO
- TransactionDTO
- MerchantOverviewDTO
- OrderDTO
- AuthResponseDTO
- JwtUser
- MerchantDepositReconcileRequestDTO
- MerchantDepositReviewItemDTO
- UserProfileDTO
- MerchantRiskLevel
- ...and 33 more

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- server/controllers/auth.controller.ts
- server/controllers/match.controller.ts
- server/controllers/order.controller.ts
- server/controllers/transaction.controller.ts
- server/controllers/user.controller.ts
- server/middleware/auth.middleware.ts
- server/middleware/error.middleware.ts
- server/middleware/frontend-contracts.test.ts
- server/middleware/match-access.test.ts
- server/middleware/migration-services.test.ts
- ...and 25 more

---

### 4realmain/src/app/App.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, react-router-dom
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for App.tsx
- Renders React UI elements

**Exports / Side Effects:**
- App
- function

**Dependencies used:**
- Internal imports:
  - ./AuthProvider
  - ./ProtectedRoute
  - ./AppLayout
  - ./AppProviders
- External packages:
  - react
  - react-router-dom

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/app/AppLayout.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, react-router-dom
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for AppLayout.tsx
- Renders React UI elements

**Exports / Side Effects:**
- AppLayout

**Dependencies used:**
- Internal imports:
  - ../components/Navbar
  - ./AuthProvider
  - ./RouteLoading
- External packages:
  - react
  - react-router-dom

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/app/AppProviders.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, @tonconnect/ui-react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for AppProviders.tsx
- Renders React UI elements

**Exports / Side Effects:**
- AppProviders

**Dependencies used:**
- Internal imports:
  - ./AuthProvider
  - ./ToastProvider
- External packages:
  - react
  - @tonconnect/ui-react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/app/AuthProvider.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for AuthProvider.tsx
- Renders React UI elements

**Exports / Side Effects:**
- AuthProvider
- useAuth

**Dependencies used:**
- Internal imports:
  - ../utils/isAbortError
  - ../services/auth.service
  - ../types/api
- External packages:
  - react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/app/ProtectedRoute.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react-router-dom
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for ProtectedRoute.tsx
- Renders React UI elements

**Exports / Side Effects:**
- ProtectedRoute

**Dependencies used:**
- Internal imports:
  - ./AuthProvider
  - ./RouteLoading
- External packages:
  - react-router-dom

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/app/RouteLoading.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for RouteLoading.tsx
- Renders React UI elements

**Exports / Side Effects:**
- RouteLoading

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/app/ToastProvider.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, lucide-react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for ToastProvider.tsx
- Renders React UI elements

**Exports / Side Effects:**
- ToastType
- ToastProvider
- useToast

**Dependencies used:**
- Internal imports:
  - ../utils/cn
- External packages:
  - react
  - lucide-react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/canvas/drawConnectFourBoard.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: roughjs
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for drawConnectFourBoard.ts

**Key responsibilities:**
- Implements logic for drawConnectFourBoard.ts

**Exports / Side Effects:**
- drawConnectFourBoard

**Dependencies used:**
- Internal imports:
  - ../features/game/types
- External packages:
  - roughjs

**Who depends on this file:**
- src/pages/GamePage.tsx

---

### 4realmain/src/canvas/drawRoughRectangle.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: roughjs
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for drawRoughRectangle.ts

**Key responsibilities:**
- Implements logic for drawRoughRectangle.ts

**Exports / Side Effects:**
- drawRoughRectangle

**Dependencies used:**
- Internal imports: None
- External packages:
  - roughjs

**Who depends on this file:**
- src/components/SketchyButton.tsx
- src/components/SketchyContainer.tsx

---

### 4realmain/src/canvas/runVictoryConfetti.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: canvas-confetti
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for runVictoryConfetti.ts

**Key responsibilities:**
- Implements logic for runVictoryConfetti.ts

**Exports / Side Effects:**
- runVictoryConfetti

**Dependencies used:**
- Internal imports: None
- External packages:
  - canvas-confetti

**Who depends on this file:**
- src/pages/GamePage.tsx

---

### 4realmain/src/components/Navbar.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react-router-dom, lucide-react, @tonconnect/ui-react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for Navbar.tsx
- Renders React UI elements

**Exports / Side Effects:**
- Navbar

**Dependencies used:**
- Internal imports:
  - ../app/AuthProvider
  - ../app/ToastProvider
- External packages:
  - react-router-dom
  - lucide-react
  - @tonconnect/ui-react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/components/SketchyButton.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for SketchyButton.tsx
- Renders React UI elements

**Exports / Side Effects:**
- SketchyButton

**Dependencies used:**
- Internal imports:
  - ../canvas/drawRoughRectangle
  - ../hooks/useElementSize
  - ../utils/cn
- External packages:
  - react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/components/SketchyContainer.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for SketchyContainer.tsx
- Renders React UI elements

**Exports / Side Effects:**
- SketchyContainer

**Dependencies used:**
- Internal imports:
  - ../canvas/drawRoughRectangle
  - ../hooks/useElementSize
  - ../utils/cn
- External packages:
  - react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/components/merchant/MerchantLayout.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, lucide-react, react-router-dom
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for MerchantLayout.tsx
- Renders React UI elements

**Exports / Side Effects:**
- useMerchantOutletContext
- MerchantLayout
- MerchantOutletContext

**Dependencies used:**
- Internal imports:
  - ../../app/RouteLoading
  - ../../features/merchant/format
  - ../../services/merchant-dashboard.service
  - ../../utils/isAbortError
  - ../../app/ToastProvider
  - ../../types/api
  - ../../utils/cn
- External packages:
  - react
  - lucide-react
  - react-router-dom

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/components/merchant/MerchantPageFallback.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: lucide-react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for MerchantPageFallback.tsx
- Renders React UI elements

**Exports / Side Effects:**
- MerchantPageFallback

**Dependencies used:**
- Internal imports:
  - ../SketchyContainer
  - ../SketchyButton
  - ../../utils/cn
  - ./MerchantLayout
- External packages:
  - lucide-react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/features/bank/DepositPanel.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, lucide-react, @tonconnect/ui-react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for DepositPanel.tsx
- Renders React UI elements

**Exports / Side Effects:**
- DepositPanel

**Dependencies used:**
- Internal imports:
  - ../../services/transactions.service
  - ../../hooks/useCopyToClipboard
  - ../../app/ToastProvider
  - ../../components/SketchyContainer
  - ../../components/SketchyButton
  - ../../types/api
- External packages:
  - react
  - lucide-react
  - @tonconnect/ui-react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/features/bank/MerchantPanel.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, lucide-react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for MerchantPanel.tsx
- Renders React UI elements

**Exports / Side Effects:**
- MerchantPanel

**Dependencies used:**
- Internal imports:
  - ../../app/AuthProvider
  - ../../utils/isAbortError
  - ../../app/ToastProvider
  - ../../components/SketchyContainer
  - ../../components/SketchyButton
  - ../../types/api
  - ../../utils/cn
- External packages:
  - react
  - lucide-react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/features/bank/WithdrawPanel.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, lucide-react, @tonconnect/ui-react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for WithdrawPanel.tsx
- Renders React UI elements

**Exports / Side Effects:**
- WithdrawPanel

**Dependencies used:**
- Internal imports:
  - ../../app/AuthProvider
  - ../../services/transactions.service
  - ../../app/ToastProvider
  - ../../components/SketchyContainer
  - ../../components/SketchyButton
- External packages:
  - react
  - lucide-react
  - @tonconnect/ui-react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/features/bank/transactionPresentation.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for transactionPresentation.ts

**Key responsibilities:**
- Implements logic for transactionPresentation.ts

**Exports / Side Effects:**
- isCreditTransaction
- getTransactionAccentClass

**Dependencies used:**
- Internal imports:
  - ../../types/api
- External packages: None

**Who depends on this file:**
- server/middleware/frontend-contracts.test.ts
- src/pages/BankPage.tsx

---

### 4realmain/src/features/game/types.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for types.ts

**Key responsibilities:**
- Implements logic for types.ts

**Exports / Side Effects:**
- WinningLine
- RoomPlayer
- RoomState
- GameOverState
- BoardCell

**Dependencies used:**
- Internal imports:
  - ../../types/api
- External packages: None

**Who depends on this file:**
- server/middleware/auth.middleware.ts
- server/middleware/error.middleware.ts
- server/services/auth-token.service.ts
- server/services/game-room.service.ts
- server/services/match.service.ts
- server/services/merchant-config.service.ts
- server/services/transaction.service.ts
- src/app/AuthProvider.tsx
- src/canvas/drawConnectFourBoard.ts
- src/components/merchant/MerchantLayout.tsx
- ...and 16 more

---

### 4realmain/src/features/game/useGameRoom.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, socket.io-client
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for useGameRoom.ts

**Key responsibilities:**
- Implements logic for useGameRoom.ts

**Exports / Side Effects:**
- useGameRoom

**Dependencies used:**
- Internal imports:
  - ../../sockets/gameSocket
  - ./types
- External packages:
  - react
  - socket.io-client

**Who depends on this file:**
- src/pages/GamePage.tsx

---

### 4realmain/src/features/merchant/format.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for format.ts

**Key responsibilities:**
- Implements logic for format.ts

**Exports / Side Effects:**
- formatDateTime
- formatMoney
- formatCompactNumber
- formatRelativeMinutes

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- src/components/merchant/MerchantLayout.tsx
- src/pages/merchant/AlertsPage.tsx
- src/pages/merchant/DepositsPage.tsx
- src/pages/merchant/LiquidityPage.tsx
- src/pages/merchant/MerchantDashboardPage.tsx
- src/pages/merchant/OrderDeskPage.tsx

---

### 4realmain/src/hooks/useCopyToClipboard.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for useCopyToClipboard.ts

**Key responsibilities:**
- Implements logic for useCopyToClipboard.ts

**Exports / Side Effects:**
- useCopyToClipboard

**Dependencies used:**
- Internal imports:
  - ../app/ToastProvider
- External packages:
  - react

**Who depends on this file:**
- src/features/bank/DepositPanel.tsx
- src/pages/GamePage.tsx

---

### 4realmain/src/hooks/useElementSize.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for useElementSize.ts

**Key responsibilities:**
- Implements logic for useElementSize.ts

**Exports / Side Effects:**
- useElementSize

**Dependencies used:**
- Internal imports: None
- External packages:
  - react

**Who depends on this file:**
- src/components/SketchyButton.tsx
- src/components/SketchyContainer.tsx

---

### 4realmain/src/index.css

**Type:** frontend

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for index.css

**Key responsibilities:**
- Implements logic for index.css

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- src/main.tsx

---

### 4realmain/src/main.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, react-dom/client
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for main.tsx
- Renders React UI elements

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports:
  - ./index.css
  - ./app/App.tsx
- External packages:
  - react
  - react-dom/client

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/pages/AuthPage.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for AuthPage.tsx
- Renders React UI elements

**Exports / Side Effects:**
- AuthPage

**Dependencies used:**
- Internal imports:
  - ../app/AuthProvider
  - ../services/auth.service
  - ../components/SketchyContainer
  - ../app/ToastProvider
  - ../components/SketchyButton
- External packages:
  - react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/pages/BankPage.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, lucide-react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for BankPage.tsx
- Renders React UI elements

**Exports / Side Effects:**
- BankPage

**Dependencies used:**
- Internal imports:
  - ../types/api
  - ../app/RouteLoading
  - ../features/bank/transactionPresentation
  - ../utils/isAbortError
  - ../services/transactions.service
  - ../components/SketchyContainer
  - ../app/ToastProvider
  - ../components/SketchyButton
- External packages:
  - react
  - lucide-react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/pages/DashboardPage.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, react-router-dom, lucide-react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for DashboardPage.tsx
- Renders React UI elements

**Exports / Side Effects:**
- DashboardPage

**Dependencies used:**
- Internal imports:
  - ../types/api
  - ../services/users.service
  - ../sockets/gameSocket
  - ../utils/isAbortError
  - ../../shared/socket-events
  - ../app/AuthProvider
  - ../app/ToastProvider
  - ../components/SketchyButton
  - ../services/matches.service
- External packages:
  - react
  - react-router-dom
  - lucide-react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/pages/GamePage.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, react-router-dom, lucide-react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for GamePage.tsx
- Renders React UI elements

**Exports / Side Effects:**
- GamePage

**Dependencies used:**
- Internal imports:
  - ../types/api
  - ../canvas/drawConnectFourBoard
  - ../hooks/useCopyToClipboard
  - ../utils/cn
  - ../features/game/useGameRoom
  - ../app/AuthProvider
  - ../components/SketchyContainer
  - ../app/ToastProvider
  - ../canvas/runVictoryConfetti
  - ../components/SketchyButton
- External packages:
  - react
  - react-router-dom
  - lucide-react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/pages/NotFoundPage.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react-router-dom
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for NotFoundPage.tsx
- Renders React UI elements

**Exports / Side Effects:**
- NotFoundPage

**Dependencies used:**
- Internal imports:
  - ../components/SketchyButton
  - ../components/SketchyContainer
- External packages:
  - react-router-dom

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/pages/ProfilePage.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, react-router-dom, lucide-react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for ProfilePage.tsx
- Renders React UI elements

**Exports / Side Effects:**
- ProfilePage

**Dependencies used:**
- Internal imports:
  - ../types/api
  - ../services/users.service
  - ../utils/isAbortError
  - ../utils/cn
  - ../app/AuthProvider
  - ../app/ToastProvider
  - ../components/SketchyButton
  - ../services/matches.service
- External packages:
  - react
  - react-router-dom
  - lucide-react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/pages/merchant/AlertsPage.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: lucide-react, react-router-dom
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for AlertsPage.tsx
- Renders React UI elements

**Exports / Side Effects:**
- function
- AlertsPage

**Dependencies used:**
- Internal imports:
  - ../../components/merchant/MerchantLayout
  - ../../features/merchant/format
  - ../../components/merchant/MerchantPageFallback
  - ../../components/SketchyContainer
- External packages:
  - lucide-react
  - react-router-dom

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/pages/merchant/DepositsPage.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, lucide-react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for DepositsPage.tsx
- Renders React UI elements

**Exports / Side Effects:**
- DepositsPage
- function

**Dependencies used:**
- Internal imports:
  - ../../features/merchant/format
  - ../../components/merchant/MerchantPageFallback
  - ../../utils/cn
  - ../../utils/isAbortError
  - ../../app/ToastProvider
  - ../../components/SketchyContainer
  - ../../components/SketchyButton
  - ../../components/merchant/MerchantLayout
- External packages:
  - react
  - lucide-react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/pages/merchant/LiquidityPage.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, lucide-react
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for LiquidityPage.tsx
- Renders React UI elements

**Exports / Side Effects:**
- function
- LiquidityPage

**Dependencies used:**
- Internal imports:
  - ../../features/merchant/format
  - ../../components/merchant/MerchantPageFallback
  - ../../app/ToastProvider
  - ../../components/SketchyContainer
  - ../../services/merchant-config.service
  - ../../components/SketchyButton
  - ../../types/api
  - ../../components/merchant/MerchantLayout
- External packages:
  - react
  - lucide-react

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/pages/merchant/MerchantDashboardPage.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: lucide-react, react-router-dom
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for MerchantDashboardPage.tsx
- Renders React UI elements

**Exports / Side Effects:**
- function
- MerchantDashboardPage

**Dependencies used:**
- Internal imports:
  - ../../components/merchant/MerchantLayout
  - ../../features/merchant/format
  - ../../components/merchant/MerchantPageFallback
  - ../../components/SketchyContainer
- External packages:
  - lucide-react
  - react-router-dom

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/pages/merchant/OrderDeskPage.tsx

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: react, lucide-react, react-router-dom
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
React UI component or page layout.

**Key responsibilities:**
- Implements logic for OrderDeskPage.tsx
- Renders React UI elements

**Exports / Side Effects:**
- OrderDeskPage
- function

**Dependencies used:**
- Internal imports:
  - ../../features/merchant/format
  - ../../utils/cn
  - ../../services/merchant-dashboard.service
  - ../../utils/isAbortError
  - ../../app/ToastProvider
  - ../../components/SketchyContainer
  - ../../components/SketchyButton
  - ../../types/api
  - ../../services/orders.service
  - ../../components/merchant/MerchantLayout
- External packages:
  - react
  - lucide-react
  - react-router-dom

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/src/services/api/apiClient.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for apiClient.ts

**Key responsibilities:**
- Implements logic for apiClient.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- ApiClientError
- request

**Dependencies used:**
- Internal imports:
  - ../../types/api
- External packages: None

**Who depends on this file:**
- server/middleware/frontend-contracts.test.ts
- src/services/auth.service.ts
- src/services/matches.service.ts
- src/services/merchant-config.service.ts
- src/services/merchant-dashboard.service.ts
- src/services/orders.service.ts
- src/services/transactions.service.ts
- src/services/users.service.ts

---

### 4realmain/src/services/auth.service.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for auth.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- login
- register
- refreshSession
- getCurrentUser
- logout

**Dependencies used:**
- Internal imports:
  - ../types/api
  - ./api/apiClient
- External packages: None

**Who depends on this file:**
- src/app/AuthProvider.tsx
- src/pages/AuthPage.tsx

---

### 4realmain/src/services/matches.service.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for matches.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- createMatch
- getUserMatches
- resignMatch
- getActiveMatches
- getMatch
- joinMatch

**Dependencies used:**
- Internal imports:
  - ../utils/idempotency.ts
  - ../types/api.ts
  - ./api/apiClient.ts
- External packages: None

**Who depends on this file:**
- server/middleware/frontend-contracts.test.ts
- src/pages/DashboardPage.tsx
- src/pages/GamePage.tsx
- src/pages/ProfilePage.tsx

---

### 4realmain/src/services/merchant-config.service.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for merchant-config.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- updateMerchantAdminConfig
- getMerchantAdminConfig

**Dependencies used:**
- Internal imports:
  - ../types/api
  - ./api/apiClient
- External packages: None

**Who depends on this file:**
- server/controllers/merchant-admin.controller.ts
- server/controllers/order.controller.ts
- server/middleware/migration-services.test.ts
- server/services/merchant-dashboard.service.ts
- src/pages/merchant/LiquidityPage.tsx

---

### 4realmain/src/services/merchant-dashboard.service.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for merchant-dashboard.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- getMerchantOrders
- getMerchantDeposits
- getMerchantDashboard
- replayMerchantDeposits
- reconcileMerchantDeposit

**Dependencies used:**
- Internal imports:
  - ./api/apiClient
- External packages: None

**Who depends on this file:**
- server/controllers/merchant-admin.controller.ts
- server/middleware/merchant-dashboard.test.ts
- src/components/merchant/MerchantLayout.tsx
- src/pages/merchant/OrderDeskPage.tsx

---

### 4realmain/src/services/orders.service.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for orders.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- getMerchantConfig
- updateOrderStatus
- getOrders
- createOrder

**Dependencies used:**
- Internal imports:
  - ../types/api
  - ./api/apiClient
  - ../utils/idempotency
- External packages: None

**Who depends on this file:**
- src/pages/merchant/OrderDeskPage.tsx

---

### 4realmain/src/services/transactions.service.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for transactions.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- createDepositMemo
- prepareTonConnectDeposit
- createWithdrawal
- getTransactions

**Dependencies used:**
- Internal imports:
  - ./api/apiClient
  - ../utils/idempotency
- External packages: None

**Who depends on this file:**
- src/features/bank/DepositPanel.tsx
- src/features/bank/WithdrawPanel.tsx
- src/pages/BankPage.tsx

---

### 4realmain/src/services/users.service.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Encapsulates business logic.

**Key responsibilities:**
- Implements logic for users.service.ts
- Performs business operations and logic validation

**Exports / Side Effects:**
- getLeaderboard
- getUserProfile

**Dependencies used:**
- Internal imports:
  - ../types/api
  - ./api/apiClient
- External packages: None

**Who depends on this file:**
- src/pages/DashboardPage.tsx
- src/pages/ProfilePage.tsx

---

### 4realmain/src/sockets/gameSocket.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: socket.io-client
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for gameSocket.ts

**Key responsibilities:**
- Implements logic for gameSocket.ts

**Exports / Side Effects:**
- createGameSocket

**Dependencies used:**
- Internal imports: None
- External packages:
  - socket.io-client

**Who depends on this file:**
- src/features/game/useGameRoom.ts
- src/pages/DashboardPage.tsx

---

### 4realmain/src/types/api.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for api.ts

**Key responsibilities:**
- Implements logic for api.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- server/controllers/auth.controller.ts
- server/controllers/match.controller.ts
- server/controllers/order.controller.ts
- server/controllers/transaction.controller.ts
- server/controllers/user.controller.ts
- server/middleware/auth.middleware.ts
- server/middleware/error.middleware.ts
- server/middleware/frontend-contracts.test.ts
- server/middleware/match-access.test.ts
- server/middleware/migration-services.test.ts
- ...and 25 more

---

### 4realmain/src/utils/cn.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: clsx, tailwind-merge
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for cn.ts

**Key responsibilities:**
- Implements logic for cn.ts

**Exports / Side Effects:**
- cn

**Dependencies used:**
- Internal imports: None
- External packages:
  - clsx
  - tailwind-merge

**Who depends on this file:**
- src/app/ToastProvider.tsx
- src/components/SketchyButton.tsx
- src/components/SketchyContainer.tsx
- src/components/merchant/MerchantLayout.tsx
- src/components/merchant/MerchantPageFallback.tsx
- src/features/bank/MerchantPanel.tsx
- src/pages/GamePage.tsx
- src/pages/ProfilePage.tsx
- src/pages/merchant/DepositsPage.tsx
- src/pages/merchant/OrderDeskPage.tsx

---

### 4realmain/src/utils/idempotency.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for idempotency.ts

**Key responsibilities:**
- Implements logic for idempotency.ts

**Exports / Side Effects:**
- createIdempotencyKey

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- server/controllers/match.controller.ts
- server/controllers/order.controller.ts
- server/controllers/transaction.controller.ts
- server/lib/setup-db.ts
- server/middleware/idempotency-key.repository.test.ts
- server/middleware/idempotency.service.test.ts
- server/services/idempotency.service.ts
- src/services/matches.service.ts
- src/services/orders.service.ts
- src/services/transactions.service.ts

---

### 4realmain/src/utils/isAbortError.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for isAbortError.ts

**Key responsibilities:**
- Implements logic for isAbortError.ts

**Exports / Side Effects:**
- isAbortError

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- src/app/AuthProvider.tsx
- src/components/merchant/MerchantLayout.tsx
- src/features/bank/MerchantPanel.tsx
- src/pages/BankPage.tsx
- src/pages/DashboardPage.tsx
- src/pages/ProfilePage.tsx
- src/pages/merchant/DepositsPage.tsx
- src/pages/merchant/OrderDeskPage.tsx

---

### 4realmain/src/vite-env.d.ts

**Type:** frontend

**Tech stack detected:**
- Language: TypeScript
- Framework: React, Vite
- Libraries: None detected
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for vite-env.d.ts

**Key responsibilities:**
- Implements logic for vite-env.d.ts

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/toast-guidelines.md

**Type:** config

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for toast-guidelines.md

**Key responsibilities:**
- Implements logic for toast-guidelines.md

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/tsconfig.json

**Type:** config

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Configuration file.

**Key responsibilities:**
- Implements logic for tsconfig.json

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/tsconfig.server.json

**Type:** config

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Configuration file.

**Key responsibilities:**
- Implements logic for tsconfig.server.json

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/tsconfig.tests.json

**Type:** config

**Tech stack detected:**
- Language: N/A
- Framework: N/A
- Libraries: None detected
- Runtime: N/A
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Configuration file.

**Key responsibilities:**
- Implements logic for tsconfig.tests.json

**Exports / Side Effects:**
- No explicit exports detected or side-effect only file.

**Dependencies used:**
- Internal imports: None
- External packages: None

**Who depends on this file:**
- No explicit internal dependents found.

---

### 4realmain/vite.config.ts

**Type:** shared

**Tech stack detected:**
- Language: TypeScript
- Framework: N/A
- Libraries: @vitejs/plugin-react, @tailwindcss/vite, vite, path
- Runtime: Node.js
- Build tools: Vite / tsc (if applicable)

**Purpose:**
Defines logic or configuration for vite.config.ts

**Key responsibilities:**
- Implements logic for vite.config.ts

**Exports / Side Effects:**
- defineConfig

**Dependencies used:**
- Internal imports: None
- External packages:
  - @vitejs/plugin-react
  - @tailwindcss/vite
  - vite
  - path

**Who depends on this file:**
- No explicit internal dependents found.

---


## 3️⃣ TECHNOLOGY STACK SUMMARY

### Frontend
- **Frameworks:** React (v19)
- **UI Libraries:** Tailwind CSS, roughjs, canvas-confetti, lucide-react, @tonconnect/ui-react
- **State Management / Routing:** react-router-dom, context API
- **Styling:** Tailwind CSS, custom Sketchy styling (roughjs)
- **Build Tools:** Vite, TypeScript

### Backend
- **Runtime:** Node.js (v18+)
- **Frameworks:** Express.js
- **ORMs:** Mongoose (MongoDB ODM)
- **Queues:** BullMQ
- **Auth:** JWT (jsonwebtoken), bcryptjs
- **Validation:** Zod
- **Real-time:** Socket.io

### Database & Storage
- **Databases:** MongoDB, Redis
- **ODM/ORM:** Mongoose, ioredis
- **Schema Locations:** `server/models/` and `server/schemas/`

### DevOps & Tooling
- **CI/CD:** Scripts (`npm run build`, `npm run start`)
- **Testing:** Node.js native test runner (`node:test`, `tsx`)
- **Linting/Type checking:** tsc

### Infrastructure & Integrations
- **Cloud:** Render (deployment environment)
- **Blockchain:** TON (The Open Network) via `@ton/ton`, Toncenter API
- **Web3:** TON Connect `@tonconnect/ui-react`

## 4️⃣ END-TO-END CONNECTION MAP 🔗

### User Flow
Browser → Frontend (React/Vite) → API (Express.js) → Services → Database (MongoDB/Redis) → Response → UI

```text
[User]
   ↓ (Browser interaction)
[React Frontend (src/)]
   ↓ (Fetch API / Socket.io)
[Express API Routes (server/routes/)]
   ↓
[Controllers (server/controllers/)]
   ↓
[Services (server/services/)]
   ↓
[Repositories (server/repositories/)]
   ↓
[MongoDB / Redis]
```

### Major Flows:

**1. Authentication:**
`src/pages/AuthPage.tsx` → `server/routes/auth.routes.ts` → `server/controllers/auth.controller.ts` → `server/services/auth-token.service.ts` / `server/services/user.service.ts` → `server/models/User.ts` (MongoDB)

**2. Real-Time Game/Lobby Matchmaking:**
`src/pages/GamePage.tsx` → `src/sockets/gameSocket.ts` → `server/sockets/game.socket.ts` / `server/sockets/public-match-events.ts` → `server/services/game-room.service.ts` / `server/services/realtime-match.service.ts` → `server/models/Match.ts` (MongoDB) / Redis (socket.io adapter)

**3. Deposit Poller Background Job:**
`server/workers/deposit-poller.ts` → `server/services/deposit-ingestion.service.ts` → Toncenter API → `server/repositories/deposit.repository.ts` / `server/services/deposit-service.ts` → `server/models/Transaction.ts` (MongoDB)

## 5️⃣ DEPENDENCY GRAPH (FILE CONNECTION MAP)

```text
src/main.tsx
  → imports src/app/App.tsx
  → imports src/index.css

src/app/App.tsx
  → imports src/app/AppProviders.tsx
  → imports src/app/AppLayout.tsx
  → imports src/pages/*

server/app.ts
  → imports server/config/*
  → imports server/middleware/*
  → imports server/routes/index.ts

server/routes/index.ts
  → imports server/routes/auth.routes.ts
  → imports server/routes/users.routes.ts
  → imports server/routes/matches.routes.ts

server/routes/matches.routes.ts
  → imports server/controllers/match.controller.ts

server/controllers/match.controller.ts
  → imports server/services/match.service.ts
  → imports server/services/realtime-match.service.ts

server/services/match.service.ts
  → imports server/models/Match.ts
  → imports server/repositories/user-balance.repository.ts

server/workers/deposit-poller.ts
  → imports server/services/deposit-ingestion.service.ts
  → imports server/services/distributed-lock.service.ts
```

*Highlighting Core Modules:*
- **Realtime / Matchmaking:** `server/sockets/game.socket.ts` acts as the entrypoint for web sockets, backed by `realtime-match.service.ts` and `redis.service.ts`.
- **Blockchain Integrations:** `server/workers/deposit-poller.ts` and `server/services/withdrawal-engine.ts` handle crypto transactions decoupled from direct user API requests.
- **Data Access Layer:** `server/repositories/*` handles atomic updates and bulk writes, preventing N+1 issues and keeping controllers lean.
