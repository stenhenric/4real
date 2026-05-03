import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import cookieParser from 'cookie-parser';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4317);
const distPath = path.join(process.cwd(), 'dist');
const indexPath = path.join(distPath, 'index.html');

const authCookieName = '4real-at';
const refreshCookieName = '4real-rt';
const deviceCookieName = '4real-did';
const publicMatchesUpdatedEvent = 'public-matches-updated';
const defaultPassword = 'CorrectHorseBatteryStaple!';
const commissionRate = 0.1;

if (!fs.existsSync(indexPath)) {
  console.error('Missing dist/index.html. Run `npm run build` before Playwright.');
  process.exit(1);
}

function isoNow() {
  return new Date().toISOString();
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  };
}

function createBoard() {
  return Array.from({ length: 6 }, () => Array(7).fill(null));
}

function formatDecimal(value, fractionDigits) {
  return Number(value).toFixed(fractionDigits);
}

function formatUsdt(value) {
  return formatDecimal(value, 6);
}

function formatRate(value) {
  return formatDecimal(value, 6);
}

function formatFiat(value) {
  return formatDecimal(value, 2);
}

function formatTon(value) {
  return formatDecimal(value, 6);
}

function calculateProjectedWinnerAmount(wager) {
  return formatUsdt(wager * 2 * (1 - commissionRate));
}

function createBaseUsers() {
  return [
    {
      id: 'user-player-one',
      email: 'player1@example.com',
      password: defaultPassword,
      username: 'player-one',
      balance: 42.5,
      elo: 1210,
      isAdmin: false,
      emailVerified: true,
      mfaEnabled: true,
      stats: { wins: 8, losses: 3, draws: 1 },
    },
    {
      id: 'user-player-two',
      email: 'player2@example.com',
      password: defaultPassword,
      username: 'player-two',
      balance: 18,
      elo: 1095,
      isAdmin: false,
      emailVerified: true,
      mfaEnabled: true,
      stats: { wins: 4, losses: 5, draws: 2 },
    },
    {
      id: 'user-admin',
      email: 'admin@example.com',
      password: defaultPassword,
      username: 'admin-ops',
      balance: 250,
      elo: 1500,
      isAdmin: true,
      emailVerified: true,
      mfaEnabled: true,
      stats: { wins: 20, losses: 1, draws: 0 },
    },
  ];
}

function createBaseTransactions(users) {
  return new Map(users.map((user) => [user.id, [
    {
      _id: `txn-${user.id}-deposit`,
      type: 'DEPOSIT',
      amount: 25,
      status: 'COMPLETED',
      createdAt: '2026-05-01T08:00:00.000Z',
    },
    {
      _id: `txn-${user.id}-match`,
      type: 'MATCH_WIN',
      amount: 5.5,
      status: 'COMPLETED',
      createdAt: '2026-05-02T08:00:00.000Z',
    },
  ]]));
}

function createBaseMatches() {
  return [{
    id: 'match-archive-1',
    roomId: 'archive-room-1',
    player1Id: 'user-player-one',
    player2Id: 'user-player-two',
    p1Username: 'player-one',
    p2Username: 'player-two',
    status: 'completed',
    wager: 2.5,
    isPrivate: false,
    inviteToken: null,
    moveHistory: [
      { userId: 'user-player-one', col: 0, row: 5 },
      { userId: 'user-player-two', col: 1, row: 5 },
      { userId: 'user-player-one', col: 0, row: 4 },
      { userId: 'user-player-two', col: 1, row: 4 },
      { userId: 'user-player-one', col: 0, row: 3 },
      { userId: 'user-player-two', col: 1, row: 3 },
      { userId: 'user-player-one', col: 0, row: 2 },
    ],
    board: createBoard(),
    currentTurn: null,
    winnerId: 'user-player-one',
    createdAt: '2026-05-01T09:00:00.000Z',
    lastActivityAt: '2026-05-01T09:12:00.000Z',
  }];
}

function createBaseDepositReviews() {
  return [
    {
      txHash: 'tx-open-001',
      amountRaw: '12500000',
      amountUsdt: '12.500000',
      comment: 'memo-user-player-one',
      senderJettonWallet: 'EQ-OPEN-JETTON',
      senderOwnerAddress: 'EQ-OPEN-SENDER',
      txTime: '2026-05-02T07:20:00.000Z',
      recordedAt: '2026-05-02T07:25:00.000Z',
      memoStatus: 'active',
      candidateUserId: 'user-player-one',
      candidateUsername: 'player-one',
      resolutionStatus: 'open',
      resolvedAt: undefined,
      resolvedBy: null,
      resolutionNote: null,
      resolvedUserId: null,
    },
    {
      txHash: 'tx-resolved-002',
      amountRaw: '8000000',
      amountUsdt: '8.000000',
      comment: 'unknown-memo',
      senderJettonWallet: 'EQ-RESOLVED-JETTON',
      senderOwnerAddress: 'EQ-RESOLVED-SENDER',
      txTime: '2026-05-01T06:10:00.000Z',
      recordedAt: '2026-05-01T06:11:00.000Z',
      memoStatus: 'missing',
      candidateUserId: null,
      candidateUsername: null,
      resolutionStatus: 'credited',
      resolvedAt: '2026-05-01T06:20:00.000Z',
      resolvedBy: 'user-admin',
      resolutionNote: 'Manual ledger credit',
      resolvedUserId: 'user-player-two',
    },
  ];
}

function createBaseState() {
  const users = createBaseUsers();

  return {
    users,
    transactions: createBaseTransactions(users),
    merchantConfig: {
      mpesaNumber: '900800700',
      walletAddress: 'EQ-DEMO-WALLET',
      instructions: 'Send the exact amount and upload proof for review.',
      fiatCurrency: 'KES',
      buyRateKesPerUsdt: 132.5,
      sellRateKesPerUsdt: 128.75,
    },
    orders: [],
    depositReviews: createBaseDepositReviews(),
    sessionsByAccessToken: new Map(),
    sessionsByRefreshToken: new Map(),
    verificationTokens: new Map(),
    magicLinkTokens: new Map(),
    suspiciousLoginTokens: new Map(),
    passwordResetTokens: new Map(),
    proofsById: new Map(),
    matches: createBaseMatches(),
    nextMatchNumber: 2,
    nextOrderNumber: 1,
    nextProofNumber: 1,
  };
}

let state = createBaseState();
let io;

function findUserById(userId) {
  return state.users.find((user) => user.id === userId) ?? null;
}

function findUserByEmail(email) {
  return state.users.find((user) => user.email.toLowerCase() === email.trim().toLowerCase()) ?? null;
}

function buildUserDto(user) {
  return {
    id: user.id,
    username: user.username ?? '',
    email: user.email,
    balance: formatUsdt(user.balance),
    elo: user.elo,
    isAdmin: user.isAdmin,
    stats: user.stats,
    ...(user.emailVerified ? { emailVerifiedAt: '2026-05-01T00:00:00.000Z' } : {}),
    hasPassword: true,
    mfaEnabled: user.mfaEnabled,
  };
}

function buildSessionDto(session) {
  return {
    id: session.sessionId,
    deviceId: session.deviceId,
    current: true,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    idleExpiresAt: session.idleExpiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
  };
}

function buildAuthResponse(user, session) {
  return {
    status: user.username ? 'authenticated' : 'profile_incomplete',
    user: buildUserDto(user),
    session: buildSessionDto(session),
    ...(user.username ? {} : { nextStep: 'complete_profile' }),
  };
}

function setSessionCookies(res, session) {
  res.cookie(authCookieName, session.accessToken, cookieOptions());
  res.cookie(refreshCookieName, session.refreshToken, cookieOptions());
  res.cookie(deviceCookieName, session.deviceId, cookieOptions());
}

function clearSessionCookies(res) {
  res.clearCookie(authCookieName, cookieOptions());
  res.clearCookie(refreshCookieName, cookieOptions());
  res.clearCookie(deviceCookieName, cookieOptions());
}

function createSession(user, req) {
  const accessToken = crypto.randomUUID();
  const refreshToken = crypto.randomUUID();
  const session = {
    sessionId: crypto.randomUUID(),
    userId: user.id,
    deviceId: req.cookies?.[deviceCookieName] || crypto.randomUUID(),
    accessToken,
    refreshToken,
    userAgent: req.get('user-agent') ?? null,
    ipAddress: req.ip ?? null,
    createdAt: isoNow(),
    lastSeenAt: isoNow(),
    idleExpiresAt: '2026-06-01T00:00:00.000Z',
    absoluteExpiresAt: '2026-08-01T00:00:00.000Z',
  };

  state.sessionsByAccessToken.set(accessToken, session);
  state.sessionsByRefreshToken.set(refreshToken, session);
  return session;
}

function getSessionFromRequest(req) {
  const accessToken = req.cookies?.[authCookieName];
  if (!accessToken) {
    return null;
  }

  const session = state.sessionsByAccessToken.get(accessToken) ?? null;
  if (session) {
    session.lastSeenAt = isoNow();
  }

  return session;
}

function sendApiError(res, status, code, message, details) {
  return res.status(status).json({
    status,
    code,
    message,
    detail: message,
    ...(details ? { details } : {}),
  });
}

function serializeMerchantConfig(config = state.merchantConfig) {
  return {
    ...config,
    buyRateKesPerUsdt: formatRate(config.buyRateKesPerUsdt),
    sellRateKesPerUsdt: formatRate(config.sellRateKesPerUsdt),
  };
}

function serializeTransaction(transaction) {
  return {
    ...transaction,
    amount: formatUsdt(transaction.amount),
  };
}

function serializeDepositReview(deposit) {
  return {
    ...deposit,
    amountUsdt: formatUsdt(deposit.amountUsdt),
  };
}

function requireAuth(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Access token required');
    return;
  }

  const user = findUserById(session.userId);
  if (!user) {
    sendApiError(res, 401, 'SESSION_EXPIRED', 'Session expired');
    return;
  }

  req.session = session;
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    sendApiError(res, 403, 'ADMIN_ACCESS_REQUIRED', 'Admin access required');
    return;
  }

  next();
}

function createTransaction(userId, partial) {
  const transaction = {
    _id: `txn-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: isoNow(),
    ...partial,
  };

  state.transactions.set(userId, [transaction, ...(state.transactions.get(userId) ?? [])]);
  return transaction;
}

function normalizeOrderUser(order) {
  const user = findUserById(order.userId);
  return {
    id: order.userId,
    username: user?.username ?? 'unknown-user',
  };
}

function serializeOrder(order) {
  return {
    _id: order._id,
    userId: normalizeOrderUser(order),
    type: order.type,
    amount: formatUsdt(order.amount),
    status: order.status,
    ...(order.proof ? { proof: order.proof } : {}),
    ...(order.transactionCode ? { transactionCode: order.transactionCode } : {}),
    ...(order.fiatCurrency ? { fiatCurrency: order.fiatCurrency } : {}),
    ...(order.exchangeRate ? { exchangeRate: formatRate(order.exchangeRate) } : {}),
    ...(order.fiatTotal ? { fiatTotal: formatFiat(order.fiatTotal) } : {}),
    createdAt: order.createdAt,
  };
}

function serializeMerchantDeskItem(order) {
  return {
    id: order._id,
    user: normalizeOrderUser(order),
    type: order.type,
    amount: formatUsdt(order.amount),
    status: order.status,
    createdAt: order.createdAt,
    waitMinutes: order.status === 'PENDING' ? 18 : 2,
    ...(order.proof ? { proof: order.proof } : {}),
    ...(order.transactionCode ? { transactionCode: order.transactionCode } : {}),
    ...(order.fiatCurrency ? { fiatCurrency: order.fiatCurrency } : {}),
    ...(order.exchangeRate ? { exchangeRate: formatRate(order.exchangeRate) } : {}),
    ...(order.fiatTotal ? { fiatTotal: formatFiat(order.fiatTotal) } : {}),
    riskLevel: order.status === 'PENDING' ? 'high' : 'low',
    riskFlags: order.status === 'PENDING' ? ['Pending proof review', 'Fresh submission'] : [],
  };
}

function createMerchantDashboard() {
  const pendingOrders = state.orders.filter((order) => order.status === 'PENDING');
  const completedOrders = state.orders.filter((order) => order.status === 'DONE');
  const unresolvedDeposits = state.depositReviews.filter((deposit) => deposit.resolutionStatus === 'open');

  return {
    generatedAt: isoNow(),
    overview: {
      pendingOrderCount: pendingOrders.length,
      highRiskPendingOrderCount: pendingOrders.length,
      pendingBuyVolumeUsdt: formatUsdt(pendingOrders.filter((order) => order.type === 'BUY').reduce((sum, order) => sum + order.amount, 0)),
      pendingSellVolumeUsdt: formatUsdt(pendingOrders.filter((order) => order.type === 'SELL').reduce((sum, order) => sum + order.amount, 0)),
      completedVolume24hUsdt: formatUsdt(completedOrders.reduce((sum, order) => sum + order.amount, 0)),
      completedTrades24h: completedOrders.length,
      oldestPendingMinutes: pendingOrders.length > 0 ? 18 : null,
      volumeSeries: [
        { bucketStart: '2026-05-02T00:00:00.000Z', bucketLabel: '00:00', completedVolumeUsdt: formatUsdt(4), completedCount: 1 },
        { bucketStart: '2026-05-02T04:00:00.000Z', bucketLabel: '04:00', completedVolumeUsdt: formatUsdt(9), completedCount: 2 },
        { bucketStart: '2026-05-02T08:00:00.000Z', bucketLabel: '08:00', completedVolumeUsdt: formatUsdt(3), completedCount: 1 },
        { bucketStart: '2026-05-02T12:00:00.000Z', bucketLabel: '12:00', completedVolumeUsdt: formatUsdt(6), completedCount: 1 },
      ],
    },
    actionQueue: pendingOrders.map(serializeMerchantDeskItem),
    liquidity: {
      hotWalletAddress: 'EQ-DEMO-WALLET',
      hotJettonWallet: 'EQ-DEMO-JETTON-WALLET',
      merchantConfig: serializeMerchantConfig(),
      tonBalanceTon: formatTon(12.75),
      onChainUsdtBalanceUsdt: formatUsdt(255.5),
      ledgerUsdtBalanceUsdt: formatUsdt(230),
      usdtDeltaUsdt: formatUsdt(25.5),
      depositFlow24hUsdt: formatUsdt(85),
      withdrawalFlow24hUsdt: formatUsdt(20),
      queuedWithdrawalCount: 1,
      processingWithdrawalCount: 0,
      stuckWithdrawalCount: 0,
      failedWithdrawalCount: 0,
      unresolvedDepositCount: unresolvedDeposits.length,
      systemCommissionUsdt: formatUsdt(11.5),
      jobs: [
        {
          key: 'depositPoller',
          label: 'Deposit Poller',
          enabled: true,
          state: 'healthy',
          lastStartedAt: isoNow(),
          lastSucceededAt: isoNow(),
        },
        {
          key: 'staleMatchExpiry',
          label: 'Stale Match Expiry',
          enabled: true,
          state: 'healthy',
          lastStartedAt: isoNow(),
          lastSucceededAt: isoNow(),
        },
      ],
    },
    alerts: [
      {
        id: 'alert-liquidity',
        severity: pendingOrders.length > 0 ? 'warning' : 'info',
        category: 'liquidity',
        title: pendingOrders.length > 0 ? 'Review settlement reserve' : 'Treasury stable',
        description: pendingOrders.length > 0
          ? 'Customer liabilities are close to the on-chain reserve threshold.'
          : 'No pending merchant actions are waiting for manual intervention.',
        createdAt: '2026-05-02T12:00:00.000Z',
        targetPath: '/merchant/liquidity',
        metric: 'reserve_delta',
      },
      ...(unresolvedDeposits.length > 0
        ? [{
            id: 'alert-deposits',
            severity: 'critical',
            category: 'deposits',
            title: 'Unmatched deposit review required',
            description: 'At least one deposit is waiting for manual reconciliation.',
            createdAt: '2026-05-02T12:05:00.000Z',
            targetPath: '/merchant/deposits',
            metric: 'unresolved_deposits',
          }]
        : []),
    ],
  };
}

function serializeMatch(match) {
  return {
    _id: match.id,
    roomId: match.roomId,
    p1Username: match.p1Username,
    ...(match.p2Username ? { p2Username: match.p2Username } : {}),
    player1Id: match.player1Id,
    ...(match.player2Id ? { player2Id: match.player2Id } : {}),
    status: match.status,
    ...(match.winnerId ? { winnerId: match.winnerId } : {}),
    wager: formatUsdt(match.wager),
    isPrivate: match.isPrivate,
    moveHistory: match.moveHistory,
    projectedWinnerAmount: calculateProjectedWinnerAmount(match.wager),
    commissionRate: formatRate(commissionRate),
    createdAt: match.createdAt,
    lastActivityAt: match.lastActivityAt,
    ...(match.inviteToken ? { inviteUrl: `/game/${match.roomId}?invite=${encodeURIComponent(match.inviteToken)}` } : {}),
  };
}

function buildRoomState(match) {
  const players = [match.player1Id, match.player2Id]
    .filter(Boolean)
    .map((userId, index) => {
      const user = findUserById(userId);
      return {
        userId,
        username: user?.username ?? (index === 0 ? match.p1Username : match.p2Username ?? 'Player'),
        socketId: null,
        elo: user?.elo ?? 1000,
      };
    });

  return {
    roomId: match.roomId,
    players,
    board: match.board,
    currentTurn: match.currentTurn,
    status: match.status,
    moves: match.moveHistory,
    wager: formatUsdt(match.wager),
    ...(match.winnerId ? { winnerId: match.winnerId } : {}),
    projectedWinnerAmount: calculateProjectedWinnerAmount(match.wager),
    commissionRate: formatRate(commissionRate),
  };
}

function findMatch(roomId) {
  return state.matches.find((match) => match.roomId === roomId) ?? null;
}

function emitPublicMatchesUpdated() {
  io?.emit(publicMatchesUpdatedEvent);
}

function createMatchForUser(user, payload) {
  const roomId = `room-${state.nextMatchNumber}`;
  const match = {
    id: `match-${state.nextMatchNumber}`,
    roomId,
    player1Id: user.id,
    player2Id: null,
    p1Username: user.username,
    p2Username: null,
    status: 'waiting',
    wager: Number(payload.wager ?? 0),
    isPrivate: Boolean(payload.isPrivate),
    inviteToken: payload.isPrivate ? `invite-${roomId}` : null,
    moveHistory: [],
    board: createBoard(),
    currentTurn: null,
    winnerId: null,
    createdAt: isoNow(),
    lastActivityAt: isoNow(),
  };

  state.nextMatchNumber += 1;
  state.matches.unshift(match);
  emitPublicMatchesUpdated();
  return match;
}

function getDiscForUser(match, userId) {
  return match.player1Id === userId ? 'R' : 'B';
}

function detectWinningLine(board, row, col, disc) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [rowDelta, colDelta] of directions) {
    const line = [[row, col]];

    for (const direction of [-1, 1]) {
      let nextRow = row + (rowDelta * direction);
      let nextCol = col + (colDelta * direction);

      while (
        nextRow >= 0 && nextRow < 6
        && nextCol >= 0 && nextCol < 7
        && board[nextRow]?.[nextCol] === disc
      ) {
        line.push([nextRow, nextCol]);
        nextRow += rowDelta * direction;
        nextCol += colDelta * direction;
      }
    }

    if (line.length >= 4) {
      return line;
    }
  }

  return null;
}

async function readRequestBuffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function parseMultipartForm(req) {
  const contentType = req.get('content-type') ?? '';
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundaryMatch) {
    return { fields: {}, files: {} };
  }

  const boundary = boundaryMatch[1] ?? boundaryMatch[2];
  const body = await readRequestBuffer(req);
  const parts = body.toString('binary').split(`--${boundary}`);
  const fields = {};
  const files = {};

  for (const rawPart of parts) {
    const trimmed = rawPart.replace(/^\r\n/, '').replace(/\r\n$/, '');
    if (!trimmed || trimmed === '--') {
      continue;
    }

    const separatorIndex = trimmed.indexOf('\r\n\r\n');
    if (separatorIndex === -1) {
      continue;
    }

    const rawHeaders = trimmed.slice(0, separatorIndex);
    let rawValue = trimmed.slice(separatorIndex + 4);
    if (rawValue.endsWith('\r\n')) {
      rawValue = rawValue.slice(0, -2);
    }

    const name = /name="([^"]+)"/i.exec(rawHeaders)?.[1];
    if (!name) {
      continue;
    }

    const filename = /filename="([^"]*)"/i.exec(rawHeaders)?.[1];
    if (filename) {
      const mimeType = /content-type:\s*([^\r\n]+)/i.exec(rawHeaders)?.[1] ?? 'application/octet-stream';
      files[name] = {
        filename,
        mimeType,
        buffer: Buffer.from(rawValue, 'binary'),
      };
      continue;
    }

    fields[name] = rawValue;
  }

  return { fields, files };
}

function applyOrderStatusSideEffects(order, nextStatus) {
  if (order.ledgerApplied || nextStatus !== 'DONE') {
    return;
  }

  const user = findUserById(order.userId);
  if (!user) {
    return;
  }

  if (order.type === 'BUY') {
    user.balance = Number((user.balance + order.amount).toFixed(2));
    createTransaction(user.id, {
      type: 'BUY_P2P',
      amount: order.amount,
      status: 'DONE',
      referenceId: order._id,
    });
  } else {
    user.balance = Number((user.balance - order.amount).toFixed(2));
    createTransaction(user.id, {
      type: 'SELL_P2P',
      amount: -order.amount,
      status: 'DONE',
      referenceId: order._id,
    });
  }

  order.ledgerApplied = true;
}

function createApp() {
  const app = express();

  app.use(cookieParser());
  app.use(express.json());

  app.post('/__e2e__/reset', (_req, res) => {
    state = createBaseState();
    res.json({ ok: true });
  });

  app.post('/__e2e__/session', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const user = findUserByEmail(email);
    if (!user) {
      sendApiError(res, 404, 'USER_NOT_FOUND', 'User not found');
      return;
    }

    const session = createSession(user, req);
    setSessionCookies(res, session);
    res.json({
      ...buildAuthResponse(user, session),
      cookies: {
        [authCookieName]: session.accessToken,
        [refreshCookieName]: session.refreshToken,
        [deviceCookieName]: session.deviceId,
      },
    });
  });

  app.get('/__e2e__/proofs/:proofId', (req, res) => {
    const proof = state.proofsById.get(String(req.params.proofId));
    if (!proof) {
      res.status(404).send('Proof not found');
      return;
    }

    res.type(proof.mimeType).send(proof.buffer);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/health/ready', (_req, res) => {
    res.json({ status: 'ready' });
  });

  app.post('/api/auth/register', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');

    if (!email || !username || password.length < 12) {
      sendApiError(res, 400, 'INVALID_REQUEST_PAYLOAD', 'Invalid registration payload');
      return;
    }

    if (findUserByEmail(email)) {
      sendApiError(res, 409, 'EMAIL_ALREADY_EXISTS', 'Email already exists');
      return;
    }

    const user = {
      id: `user-${crypto.randomUUID()}`,
      email,
      username,
      password,
      balance: 0,
      elo: 1000,
      isAdmin: false,
      emailVerified: false,
      mfaEnabled: false,
      stats: { wins: 0, losses: 0, draws: 0 },
    };

    state.users.push(user);
    const token = `verify-${crypto.randomUUID()}`;
    state.verificationTokens.set(token, user.id);

    res.status(202).json({
      status: 'pending_email_verification',
      email,
      message: 'Verify your email to continue.',
      redirectTo: `/auth/verify-email?email=${encodeURIComponent(email)}`,
      previewUrl: `/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
    });
  });

  app.post('/api/auth/email/verify/resend', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const user = findUserByEmail(email);
    const token = `verify-${crypto.randomUUID()}`;

    if (user) {
      state.verificationTokens.set(token, user.id);
    }

    res.json({
      status: 'email_verification_sent',
      message: 'Verification email queued.',
      redirectTo: `/auth/verify-email?email=${encodeURIComponent(email)}`,
      ...(user ? { previewUrl: `/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}` } : {}),
    });
  });

  app.post('/api/auth/email/verify/consume', (req, res) => {
    const token = String(req.body?.token ?? '').trim();
    const userId = state.verificationTokens.get(token);
    const user = userId ? findUserById(userId) : null;

    if (!user) {
      sendApiError(res, 401, 'INVALID_OR_EXPIRED_LINK', 'This link is invalid or has expired');
      return;
    }

    user.emailVerified = true;
    state.verificationTokens.delete(token);
    const session = createSession(user, req);
    setSessionCookies(res, session);
    res.json(buildAuthResponse(user, session));
  });

  app.post('/api/auth/login/password', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const user = findUserByEmail(email);

    if (!user || user.password !== password) {
      sendApiError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      return;
    }

    if (!user.emailVerified) {
      const token = `verify-${crypto.randomUUID()}`;
      state.verificationTokens.set(token, user.id);
      res.status(202).json({
        status: 'pending_email_verification',
        email: user.email,
        message: 'Verify your email to continue.',
        redirectTo: `/auth/verify-email?email=${encodeURIComponent(user.email)}`,
        previewUrl: `/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`,
      });
      return;
    }

    const session = createSession(user, req);
    setSessionCookies(res, session);
    res.json(buildAuthResponse(user, session));
  });

  app.post('/api/auth/login/magic-link/request', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const user = findUserByEmail(email);

    if (user?.emailVerified) {
      const token = `magic-${crypto.randomUUID()}`;
      state.magicLinkTokens.set(token, user.id);
      res.status(202).json({
        status: 'pending_email_verification',
        message: 'If that email is registered, a sign-in link is on the way.',
        redirectTo: `/auth/magic-link?email=${encodeURIComponent(email)}`,
        previewUrl: `/auth/magic-link?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
      });
      return;
    }

    res.status(202).json({
      status: 'pending_email_verification',
      message: 'If that email is registered, a sign-in link is on the way.',
      redirectTo: `/auth/magic-link?email=${encodeURIComponent(email)}`,
    });
  });

  app.post('/api/auth/login/magic-link/consume', (req, res) => {
    const token = String(req.body?.token ?? '').trim();
    const userId = state.magicLinkTokens.get(token);
    const user = userId ? findUserById(userId) : null;

    if (!user) {
      sendApiError(res, 401, 'INVALID_OR_EXPIRED_LINK', 'This link is invalid or has expired');
      return;
    }

    state.magicLinkTokens.delete(token);
    const session = createSession(user, req);
    setSessionCookies(res, session);
    res.json(buildAuthResponse(user, session));
  });

  app.post('/api/auth/login/suspicious/consume', (req, res) => {
    const token = String(req.body?.token ?? '').trim();
    const userId = state.suspiciousLoginTokens.get(token);
    const user = userId ? findUserById(userId) : null;

    if (!user) {
      sendApiError(res, 401, 'INVALID_OR_EXPIRED_LINK', 'This link is invalid or has expired');
      return;
    }

    state.suspiciousLoginTokens.delete(token);
    const session = createSession(user, req);
    setSessionCookies(res, session);
    res.json(buildAuthResponse(user, session));
  });

  app.post('/api/auth/password/forgot', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const user = findUserByEmail(email);

    if (user) {
      const token = `reset-${crypto.randomUUID()}`;
      state.passwordResetTokens.set(token, user.id);
      res.status(202).json({
        status: 'pending_email_verification',
        message: 'If the account exists, a reset link is on the way.',
        previewUrl: `/auth/reset-password?token=${encodeURIComponent(token)}`,
      });
      return;
    }

    res.status(202).json({
      status: 'pending_email_verification',
      message: 'If the account exists, a reset link is on the way.',
    });
  });

  app.post('/api/auth/password/reset', (req, res) => {
    const token = String(req.body?.token ?? '').trim();
    const password = String(req.body?.password ?? '');
    const userId = state.passwordResetTokens.get(token);
    const user = userId ? findUserById(userId) : null;

    if (!user || password.length < 12) {
      sendApiError(res, 400, 'INVALID_OR_EXPIRED_LINK', 'That reset link is invalid or expired');
      return;
    }

    user.password = password;
    state.passwordResetTokens.delete(token);
    res.json({
      status: 'pending_email_verification',
      message: 'Password updated.',
    });
  });

  app.post('/api/auth/refresh', (req, res) => {
    const refreshToken = req.cookies?.[refreshCookieName];
    const session = refreshToken ? state.sessionsByRefreshToken.get(refreshToken) ?? null : null;
    if (!session) {
      sendApiError(res, 401, 'UNAUTHENTICATED', 'Refresh token required');
      return;
    }

    const user = findUserById(session.userId);
    if (!user) {
      sendApiError(res, 401, 'SESSION_EXPIRED', 'Session expired');
      return;
    }

    setSessionCookies(res, session);
    res.json(buildAuthResponse(user, session));
  });

  app.get('/api/auth/me', (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      sendApiError(res, 401, 'UNAUTHENTICATED', 'Access token required');
      return;
    }

    const user = findUserById(session.userId);
    if (!user) {
      sendApiError(res, 401, 'SESSION_EXPIRED', 'Session expired');
      return;
    }

    res.json(buildAuthResponse(user, session));
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    state.sessionsByAccessToken.delete(req.session.accessToken);
    state.sessionsByRefreshToken.delete(req.session.refreshToken);
    clearSessionCookies(res);
    res.status(204).send();
  });

  app.post('/api/auth/profile/complete', requireAuth, (req, res) => {
    req.user.username = String(req.body?.username ?? '').trim();
    res.json(buildAuthResponse(req.user, req.session));
  });

  app.get('/api/users/leaderboard', (_req, res) => {
    res.json(
      state.users
        .filter((user) => user.username)
        .sort((left, right) => right.elo - left.elo)
        .map((user) => ({
          id: user.id,
          username: user.username,
          elo: user.elo,
        })),
    );
  });

  app.get('/api/users/:userId', (req, res) => {
    const user = findUserById(String(req.params.userId));
    if (!user) {
      sendApiError(res, 404, 'USER_NOT_FOUND', 'User not found');
      return;
    }

    res.json({
      id: user.id,
      username: user.username,
      elo: user.elo,
      stats: user.stats,
    });
  });

  app.get('/api/matches/active', requireAuth, (_req, res) => {
    res.json(
      state.matches
        .filter((match) => !match.isPrivate && match.status !== 'completed')
        .map((match) => serializeMatch(match)),
    );
  });

  app.post('/api/matches', requireAuth, (req, res) => {
    const match = createMatchForUser(req.user, req.body ?? {});
    res.status(201).json(serializeMatch(match));
  });

  app.get('/api/matches/user/:userId', requireAuth, (req, res) => {
    const userId = String(req.params.userId);
    res.json(
      state.matches
        .filter((match) => match.player1Id === userId || match.player2Id === userId)
        .map((match) => serializeMatch(match)),
    );
  });

  app.get('/api/matches/:roomId', requireAuth, (req, res) => {
    const match = findMatch(String(req.params.roomId));
    if (!match) {
      sendApiError(res, 404, 'MATCH_NOT_FOUND', 'Match not found');
      return;
    }

    const inviteToken = typeof req.query?.invite === 'string' ? req.query.invite : null;
    const isParticipant = match.player1Id === req.user.id || match.player2Id === req.user.id;
    const hasInvite = !match.isPrivate || (inviteToken && inviteToken === match.inviteToken);

    if (!isParticipant && !hasInvite) {
      sendApiError(res, 404, 'MATCH_NOT_FOUND', 'Match not found');
      return;
    }

    res.json(serializeMatch(match));
  });

  app.post('/api/matches/:roomId/join', requireAuth, (req, res) => {
    const match = findMatch(String(req.params.roomId));
    if (!match || match.status !== 'waiting' || match.player1Id === req.user.id) {
      sendApiError(res, 404, 'MATCH_NOT_FOUND', 'Match not found');
      return;
    }

    if (match.isPrivate && req.get('x-match-invite') !== match.inviteToken) {
      sendApiError(res, 404, 'MATCH_NOT_FOUND', 'Match not found');
      return;
    }

    match.player2Id = req.user.id;
    match.p2Username = req.user.username;
    match.status = 'active';
    match.currentTurn = match.player1Id;
    match.lastActivityAt = isoNow();
    emitPublicMatchesUpdated();
    res.json(serializeMatch(match));
  });

  app.post('/api/matches/:roomId/resign', requireAuth, (req, res) => {
    const match = findMatch(String(req.params.roomId));
    if (!match) {
      sendApiError(res, 404, 'MATCH_NOT_FOUND', 'Match not found');
      return;
    }

    const winnerId = match.player1Id === req.user.id ? match.player2Id : match.player1Id;
    match.status = 'completed';
    match.winnerId = winnerId ?? 'draw';
    match.currentTurn = null;
    match.lastActivityAt = isoNow();
    emitPublicMatchesUpdated();
    res.json(serializeMatch(match));
  });

  app.get('/api/transactions', requireAuth, (req, res) => {
    const items = (state.transactions.get(req.user.id) ?? []).map((transaction) => serializeTransaction(transaction));
    res.json({
      items,
      page: 1,
      pageSize: items.length || 25,
      total: items.length,
    });
  });

  app.post('/api/transactions/deposit/memo', requireAuth, (req, res) => {
    res.json({
      memo: `memo-${req.user.id}`,
      address: 'EQ-DEMO-WALLET',
      instructions: 'Send USDT on TON to the displayed wallet address with this memo.',
      expiresIn: '15 minutes',
    });
  });

  app.post('/api/transactions/deposit/prepare', requireAuth, (req, res) => {
    const amountUsdt = Number(req.body?.amountUsdt ?? 0);
    res.json({
      memo: String(req.body?.memo ?? `memo-${req.user.id}`),
      address: 'EQ-DEMO-WALLET',
      amountUsdt: formatUsdt(amountUsdt),
      amountRaw: String(Math.round(amountUsdt * 1_000_000)),
      userJettonWalletAddress: 'EQ-DEMO-USER-JETTON',
      transaction: {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{
          address: 'EQ-DEMO-WALLET',
          amount: '1',
          payload: 'BASE64_PAYLOAD',
        }],
      },
    });
  });

  app.post('/api/transactions/withdraw', requireAuth, (req, res) => {
    const amountUsdt = Number(req.body?.amountUsdt ?? 0);
    const toAddress = String(req.body?.toAddress ?? '').trim();

    if (!Number.isFinite(amountUsdt) || amountUsdt <= 0 || !toAddress) {
      sendApiError(res, 400, 'INVALID_WITHDRAWAL_REQUEST', 'Withdrawal payload is invalid');
      return;
    }

    req.user.balance = Number((req.user.balance - Math.abs(amountUsdt)).toFixed(2));
    createTransaction(req.user.id, {
      type: 'WITHDRAW',
      amount: -Math.abs(amountUsdt),
      status: 'queued',
    });

    res.status(202).json({
      success: true,
      message: 'Withdrawal queued successfully',
      status: 'queued',
      withdrawalId: `wd-${Date.now()}`,
      statusUrl: '/api/transactions/withdrawals/mock-withdrawal',
    });
  });

  app.get('/api/orders/config', requireAuth, (_req, res) => {
    res.json(serializeMerchantConfig());
  });

  app.get('/api/orders', requireAuth, (req, res) => {
    res.json(
      state.orders
        .filter((order) => req.user.isAdmin || order.userId === req.user.id)
        .map((order) => serializeOrder(order)),
    );
  });

  app.post('/api/orders', requireAuth, async (req, res) => {
    const { fields, files } = await parseMultipartForm(req);
    const type = String(fields.type ?? '').toUpperCase();
    const amount = Number(fields.amount ?? 0);

    if (!['BUY', 'SELL'].includes(type) || !Number.isFinite(amount) || amount <= 0) {
      sendApiError(res, 400, 'INVALID_ORDER_PAYLOAD', 'Order payload is invalid');
      return;
    }

    const order = {
      _id: `order-${state.nextOrderNumber}`,
      userId: req.user.id,
      type,
      amount: Number(amount.toFixed(2)),
      status: 'PENDING',
      transactionCode: null,
      proof: null,
      fiatCurrency: state.merchantConfig.fiatCurrency,
      exchangeRate: type === 'BUY' ? state.merchantConfig.buyRateKesPerUsdt : state.merchantConfig.sellRateKesPerUsdt,
      fiatTotal: Number((amount * (type === 'BUY' ? state.merchantConfig.buyRateKesPerUsdt : state.merchantConfig.sellRateKesPerUsdt)).toFixed(2)),
      createdAt: isoNow(),
      ledgerApplied: false,
    };

    state.nextOrderNumber += 1;

    if (type === 'BUY') {
      const transactionCode = String(fields.transactionCode ?? '').trim().toUpperCase();
      const proofFile = files.proofImage;
      if (!transactionCode || !proofFile) {
        sendApiError(res, 400, 'BUY_PROOF_REQUIRED', 'Payment proof is required for buy orders');
        return;
      }

      const proofId = `proof-${state.nextProofNumber}`;
      state.nextProofNumber += 1;
      state.proofsById.set(proofId, proofFile);
      order.transactionCode = transactionCode;
      order.proof = {
        provider: 'telegram',
        url: `/__e2e__/proofs/${proofId}`,
        messageId: proofId,
        chatId: '-100-playwright',
      };
    }

    state.orders.unshift(order);
    res.status(201).json(serializeOrder(order));
  });

  app.patch('/api/orders/:orderId', requireAuth, requireAdmin, (req, res) => {
    const order = state.orders.find((entry) => entry._id === String(req.params.orderId));
    if (!order) {
      sendApiError(res, 404, 'ORDER_NOT_FOUND', 'Order not found');
      return;
    }

    const nextStatus = String(req.body?.status ?? order.status).toUpperCase();
    if (!['PENDING', 'DONE', 'REJECTED'].includes(nextStatus)) {
      sendApiError(res, 400, 'INVALID_ORDER_STATUS', 'Order status is invalid');
      return;
    }

    order.status = nextStatus;
    applyOrderStatusSideEffects(order, nextStatus);
    res.json(serializeOrder(order));
  });

  app.get('/api/admin/merchant/dashboard', requireAuth, requireAdmin, (_req, res) => {
    res.json(createMerchantDashboard());
  });

  app.get('/api/admin/merchant/orders', requireAuth, requireAdmin, (req, res) => {
    const status = String(req.query?.status ?? 'ALL').toUpperCase();
    const type = String(req.query?.type ?? 'ALL').toUpperCase();
    const page = Number(req.query?.page ?? 1);
    const pageSize = Number(req.query?.pageSize ?? 25);
    const filtered = state.orders
      .filter((order) => status === 'ALL' || order.status === status)
      .filter((order) => type === 'ALL' || order.type === type);

    const items = filtered.map((order) => serializeMerchantDeskItem(order));
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

    res.json({
      filters: {
        type,
        status,
        page,
        pageSize,
      },
      pagination: {
        page,
        pageSize,
        total: items.length,
        totalPages,
      },
      orders: items.slice((page - 1) * pageSize, page * pageSize),
    });
  });

  app.get('/api/admin/merchant/config', requireAuth, requireAdmin, (_req, res) => {
    res.json(serializeMerchantConfig());
  });

  app.patch('/api/admin/merchant/config', requireAuth, requireAdmin, (req, res) => {
    state.merchantConfig = {
      ...state.merchantConfig,
      ...(typeof req.body?.mpesaNumber === 'string' ? { mpesaNumber: req.body.mpesaNumber.trim() } : {}),
      ...(typeof req.body?.walletAddress === 'string' ? { walletAddress: req.body.walletAddress.trim() } : {}),
      ...(typeof req.body?.instructions === 'string' ? { instructions: req.body.instructions.trim() } : {}),
      ...(typeof req.body?.buyRateKesPerUsdt !== 'undefined' ? { buyRateKesPerUsdt: Number(req.body.buyRateKesPerUsdt) } : {}),
      ...(typeof req.body?.sellRateKesPerUsdt !== 'undefined' ? { sellRateKesPerUsdt: Number(req.body.sellRateKesPerUsdt) } : {}),
    };

    res.json(serializeMerchantConfig());
  });

  app.get('/api/admin/merchant/deposits', requireAuth, requireAdmin, (req, res) => {
    const status = String(req.query?.status ?? 'open').toLowerCase();
    const limit = Number(req.query?.limit ?? 100);
    const items = state.depositReviews
      .filter((deposit) => (
        status === 'resolved'
          ? deposit.resolutionStatus !== 'open'
          : deposit.resolutionStatus === 'open'
      ))
      .slice(0, Number.isFinite(limit) ? limit : 100)
      .map((deposit) => serializeDepositReview(deposit));

    res.json(items);
  });

  app.post('/api/admin/merchant/deposits/replay-window', requireAuth, requireAdmin, (req, res) => {
    const sinceUnixTime = Number(req.body?.sinceUnixTime ?? Math.floor(Date.now() / 1000) - 3600);
    const untilUnixTime = Number(req.body?.untilUnixTime ?? Math.floor(Date.now() / 1000));
    const dryRun = Boolean(req.body?.dryRun);
    const transfers = state.depositReviews
      .map((deposit) => ({
        ...serializeDepositReview(deposit),
        decision: deposit.resolutionStatus === 'open' ? 'credit' : 'already_processed',
      }));

    res.json({
      dryRun,
      sinceUnixTime,
      untilUnixTime,
      transfers,
    });
  });

  app.post('/api/admin/merchant/deposits/:txHash/reconcile', requireAuth, requireAdmin, (req, res) => {
    const deposit = state.depositReviews.find((entry) => entry.txHash === String(req.params.txHash));
    if (!deposit) {
      sendApiError(res, 404, 'DEPOSIT_REVIEW_NOT_FOUND', 'Deposit review not found');
      return;
    }

    const action = String(req.body?.action ?? '').toLowerCase();
    if (!['credit', 'dismiss'].includes(action)) {
      sendApiError(res, 400, 'INVALID_DEPOSIT_ACTION', 'Deposit action is invalid');
      return;
    }

    deposit.resolutionStatus = action === 'credit' ? 'credited' : 'dismissed';
    deposit.resolvedAt = isoNow();
    deposit.resolvedBy = req.user.id;
    deposit.resolutionNote = typeof req.body?.note === 'string' && req.body.note.trim()
      ? req.body.note.trim()
      : null;
    deposit.resolvedUserId = action === 'credit'
      ? String(req.body?.userId ?? deposit.candidateUserId ?? '').trim() || null
      : null;

    if (action === 'credit' && deposit.resolvedUserId) {
      const creditedUser = findUserById(deposit.resolvedUserId);
      if (creditedUser) {
        creditedUser.balance = Number((creditedUser.balance + Number(deposit.amountUsdt)).toFixed(6));
      }
    }

    res.json(serializeDepositReview(deposit));
  });

  app.use('/assets', express.static(path.join(distPath, 'assets'), { fallthrough: false }));
  app.use(express.static(distPath, { index: false }));
  app.get('*', (_req, res) => {
    res.sendFile(indexPath);
  });

  return app;
}

const app = createApp();
const server = http.createServer(app);
io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    credentials: true,
  },
});

io.use((socket, next) => {
  const cookieHeader = socket.handshake.headers.cookie ?? '';
  const tokenPair = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${authCookieName}=`));
  const token = tokenPair ? decodeURIComponent(tokenPair.slice(authCookieName.length + 1)) : null;
  const session = token ? state.sessionsByAccessToken.get(token) ?? null : null;
  const user = session ? findUserById(session.userId) : null;

  if (!session || !user) {
    next(new Error('Authentication required'));
    return;
  }

  socket.data.userId = user.id;
  next();
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId }) => {
    const match = findMatch(String(roomId));
    if (!match) {
      socket.emit('error', { code: 'MATCH_NOT_FOUND', message: 'Match not found' });
      return;
    }

    const isParticipant = match.player1Id === socket.data.userId || match.player2Id === socket.data.userId;
    if (!isParticipant) {
      socket.emit('error', { code: 'MATCH_FORBIDDEN', message: 'Unauthorized access' });
      return;
    }

    socket.join(match.roomId);
    const room = buildRoomState(match);
    io.to(match.roomId).emit('room-sync', room);
    if (match.status === 'active') {
      io.to(match.roomId).emit('game-started', room);
    }
  });

  socket.on('make-move', ({ roomId, col }) => {
    const match = findMatch(String(roomId));
    if (!match || match.status !== 'active' || match.currentTurn !== socket.data.userId) {
      return;
    }

    const numericColumn = Number(col);
    if (!Number.isInteger(numericColumn) || numericColumn < 0 || numericColumn > 6) {
      return;
    }

    let placedRow = -1;
    for (let row = 5; row >= 0; row -= 1) {
      if (match.board[row]?.[numericColumn] === null) {
        match.board[row][numericColumn] = getDiscForUser(match, socket.data.userId);
        placedRow = row;
        break;
      }
    }

    if (placedRow < 0) {
      return;
    }

    match.moveHistory.push({
      userId: socket.data.userId,
      col: numericColumn,
      row: placedRow,
    });
    match.lastActivityAt = isoNow();

    const winningLine = detectWinningLine(match.board, placedRow, numericColumn, match.board[placedRow][numericColumn]);
    if (winningLine) {
      match.status = 'completed';
      match.winnerId = socket.data.userId;
      match.currentTurn = null;
      emitPublicMatchesUpdated();
      io.to(match.roomId).emit('game-over', {
        room: buildRoomState(match),
        winnerId: socket.data.userId,
        winningLine,
      });
      return;
    }

    const nextTurn = socket.data.userId === match.player1Id ? match.player2Id : match.player1Id;
    match.currentTurn = nextTurn ?? null;
    io.to(match.roomId).emit('move-made', buildRoomState(match));
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Playwright harness listening on http://127.0.0.1:${port}`);
});
