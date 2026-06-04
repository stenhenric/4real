import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANK_TRANSACTION_PAGE_SIZE,
  createInitialTransactionFeedState,
  transactionFeedReducer,
} from '../../../../src/features/bank/transactionPagination.ts';
import {
  createInitialDashboardDraftState,
  dashboardDraftReducer,
} from '../../../../src/pages/dashboardDraftReducer.ts';
import {
  createInitialGamePreviewState,
  gamePreviewReducer,
} from '../../../../src/pages/gamePreviewReducer.ts';
import {
  createInitialMerchantDashboardState,
  merchantDashboardReducer,
} from '../../../../src/components/merchant/merchantDashboardReducer.ts';
import {
  createInitialDepositsState,
  depositsReducer,
} from '../../../../src/pages/merchant/depositsReducer.ts';
import {
  createInitialOrderDeskState,
  orderDeskReducer,
} from '../../../../src/pages/merchant/orderDeskReducer.ts';
import type {
  MatchDTO,
  MerchantDashboardDTO,
  MerchantDepositReplayResultDTO,
  MerchantDepositReviewItemDTO,
  MerchantOrderDeskResponseDTO,
  TransactionDTO,
  TransactionFeedDTO,
} from '../../../../src/types/api.ts';

function transaction(id: string): TransactionDTO {
  return {
    _id: id,
    type: 'DEPOSIT',
    amount: '1.000000',
    status: 'COMPLETED',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function feed(page: number, items: TransactionDTO[]): TransactionFeedDTO {
  return {
    page,
    pageSize: BANK_TRANSACTION_PAGE_SIZE,
    total: items.length,
    items,
  };
}

const match = {
  _id: 'match-1',
  roomId: 'room-1',
  player1Id: 'user-1',
  player2Id: null,
  p1Username: 'Host',
  status: 'waiting',
  wager: '0.000000',
  isPrivate: false,
} as unknown as MatchDTO;

describe('transactionFeedReducer', () => {
  it('loads initial and next transaction pages with dedupe and independent errors', () => {
    let state = transactionFeedReducer(createInitialTransactionFeedState(), { type: 'INITIAL_LOAD_STARTED' });
    assert.equal(state.transactionsLoading, true);

    state = transactionFeedReducer(state, {
      type: 'PAGE_LOADED',
      feed: feed(1, Array.from({ length: BANK_TRANSACTION_PAGE_SIZE }, (_, index) => transaction(`tx-${index}`))),
      replace: true,
    });
    assert.equal(state.transactionsLoading, false);
    assert.equal(state.hasMoreTransactions, true);

    state = transactionFeedReducer(state, { type: 'NEXT_PAGE_STARTED' });
    assert.equal(state.nextTransactionsLoading, true);

    state = transactionFeedReducer(state, {
      type: 'PAGE_LOADED',
      feed: feed(2, [transaction('tx-1'), transaction('tx-new')]),
      replace: false,
    });
    assert.equal(state.nextTransactionsLoading, false);
    assert.equal(state.transactionPage, 2);
    assert.equal(state.transactions.some((item) => item._id === 'tx-new'), true);

    const failed = transactionFeedReducer(state, {
      type: 'PAGE_FAILED',
      replace: false,
      message: 'Could not load more transactions.',
    });
    assert.equal(failed.nextTransactionsError, 'Could not load more transactions.');
    assert.equal(transactionFeedReducer(failed, { type: 'CLEAR_ERROR' }).nextTransactionsError, null);
  });
});

describe('dashboardDraftReducer', () => {
  it('models draft open, type, wager, create failure, and reset', () => {
    let state = dashboardDraftReducer(createInitialDashboardDraftState(), { type: 'DRAFT_OPENED' });
    state = dashboardDraftReducer(state, { type: 'DRAFT_TYPE_SELECTED', draftType: 'paid_public' });
    state = dashboardDraftReducer(state, { type: 'WAGER_CHANGED', wager: '5' });
    state = dashboardDraftReducer(state, { type: 'DRAFT_STEP_CHANGED', draftStep: 2 });
    state = dashboardDraftReducer(state, { type: 'CREATE_STARTED' });
    assert.equal(state.isCreatingMatch, true);
    assert.equal(state.draftType, 'paid_public');

    assert.equal(dashboardDraftReducer(state, { type: 'CREATE_FAILED' }).isCreatingMatch, false);
    assert.deepEqual(dashboardDraftReducer(state, { type: 'DRAFT_RESET' }), createInitialDashboardDraftState());
  });
});

describe('gamePreviewReducer', () => {
  it('models participant, joinable, denied, failure, join success, and reset paths', () => {
    let state = gamePreviewReducer(createInitialGamePreviewState(), { type: 'PREVIEW_REQUESTED' });
    assert.equal(state.previewLoading, true);

    state = gamePreviewReducer(state, { type: 'PREVIEW_LOADED_JOINABLE', matchPreview: match });
    assert.equal(state.matchPreview, match);
    assert.equal(state.roomAccessReady, false);

    const participant = gamePreviewReducer(state, { type: 'PREVIEW_LOADED_AS_PARTICIPANT', matchPreview: match });
    assert.equal(participant.roomAccessReady, true);

    assert.equal(gamePreviewReducer(participant, { type: 'PREVIEW_NOT_JOINABLE', matchPreview: match }).roomAccessReady, false);
    assert.equal(gamePreviewReducer(participant, { type: 'PREVIEW_FAILED' }).matchPreview, null);
    assert.equal(gamePreviewReducer(state, { type: 'JOIN_SUCCEEDED', matchPreview: match }).roomAccessReady, true);
    assert.deepEqual(gamePreviewReducer(state, { type: 'PREVIEW_RESET' }), {
      matchPreview: null,
      previewLoading: false,
      roomAccessReady: false,
    });
  });
});

describe('merchantDashboardReducer', () => {
  it('models initial load, refresh, failure, and abort transitions', () => {
    const dashboard = { generatedAt: '2026-01-01T00:00:00.000Z' } as MerchantDashboardDTO;
    let state = merchantDashboardReducer(createInitialMerchantDashboardState(), { type: 'INITIAL_LOAD_STARTED' });
    assert.equal(state.status, 'loading');

    state = merchantDashboardReducer(state, { type: 'LOAD_SUCCEEDED', dashboard });
    assert.equal(state.dashboard, dashboard);
    assert.equal(state.status, 'ready');

    state = merchantDashboardReducer(state, { type: 'REFRESH_STARTED' });
    assert.equal(state.isRefreshing, true);
    assert.equal(merchantDashboardReducer(state, { type: 'LOAD_ABORTED' }).isRefreshing, false);

    const failed = merchantDashboardReducer(createInitialMerchantDashboardState(), {
      type: 'LOAD_FAILED',
      message: 'Failed to load merchant dashboard.',
    });
    assert.equal(failed.status, 'error');
    assert.equal(failed.error, 'Failed to load merchant dashboard.');
  });
});

describe('depositsReducer', () => {
  it('models filter, load, row action, replay window, and replay result transitions', () => {
    const deposit = { txHash: 'tx-hash' } as MerchantDepositReviewItemDTO;
    const replay = { dryRun: true, scanned: 1 } as unknown as MerchantDepositReplayResultDTO;
    let state = depositsReducer(createInitialDepositsState('2026-01-01T00:00', '2026-01-02T00:00'), {
      type: 'FILTER_CHANGED',
      statusFilter: 'resolved',
    });
    assert.equal(state.statusFilter, 'resolved');

    state = depositsReducer(state, { type: 'LOAD_STARTED' });
    assert.equal(state.loading, true);
    state = depositsReducer(state, { type: 'LOAD_SUCCEEDED', deposits: [deposit] });
    assert.equal(state.loading, false);
    assert.deepEqual(state.deposits, [deposit]);

    state = depositsReducer(state, { type: 'ROW_ACTION_STARTED', rowAction: 'tx-hash' });
    assert.equal(state.rowAction, 'tx-hash');
    state = depositsReducer(state, { type: 'ROW_ACTION_FINISHED' });
    assert.equal(state.rowAction, null);

    state = depositsReducer(state, { type: 'REPLAY_WINDOW_CHANGED', field: 'windowEnd', value: '2026-01-03T00:00' });
    assert.equal(state.windowEnd, '2026-01-03T00:00');
    state = depositsReducer(state, { type: 'REPLAY_STARTED', mode: 'dry-run' });
    assert.equal(state.replayBusy, 'dry-run');
    state = depositsReducer(state, { type: 'REPLAY_SUCCEEDED', result: replay });
    assert.equal(state.replayBusy, null);
    assert.equal(state.replayResult, replay);
  });
});

describe('orderDeskReducer', () => {
  it('models filters resetting page, load transitions, paging, and row actions', () => {
    const deskData = {
      orders: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
    } as unknown as MerchantOrderDeskResponseDTO;

    let state = orderDeskReducer(createInitialOrderDeskState(), { type: 'PAGE_CHANGED', page: 3 });
    assert.equal(state.page, 3);
    state = orderDeskReducer(state, { type: 'TYPE_FILTER_CHANGED', typeFilter: 'BUY' });
    assert.equal(state.page, 1);
    assert.equal(state.typeFilter, 'BUY');
    state = orderDeskReducer(state, { type: 'STATUS_FILTER_CHANGED', statusFilter: 'DONE' });
    assert.equal(state.page, 1);
    assert.equal(state.statusFilter, 'DONE');

    state = orderDeskReducer(state, { type: 'LOAD_STARTED' });
    assert.equal(state.loading, true);
    state = orderDeskReducer(state, { type: 'LOAD_SUCCEEDED', deskData });
    assert.equal(state.loading, false);
    assert.equal(state.deskData, deskData);

    state = orderDeskReducer(state, { type: 'ROW_ACTION_STARTED', rowActionKey: 'order-1' });
    assert.equal(state.rowActions['order-1'], true);
    state = orderDeskReducer(state, { type: 'ROW_ACTION_FINISHED', rowActionKey: 'order-1' });
    assert.equal(state.rowActions['order-1'], undefined);
  });
});
