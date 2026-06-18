import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANK_TRANSACTION_PAGE_SIZE,
  getHasMoreTransactions,
  mergeTransactionPages,
} from '../../../../../src/features/bank/transactionPagination.ts';
import type { TransactionDTO, TransactionFeedDTO } from '../../../../../src/types/api.ts';

function transaction(id: string, createdAt = '2026-01-01T00:00:00.000Z'): TransactionDTO {
  return {
    _id: id,
    type: 'DEPOSIT',
    amount: '1.00',
    status: 'COMPLETED',
    createdAt,
  };
}

describe('transaction pagination helpers', () => {
  it('keeps page 1 results in server order', () => {
    assert.deepEqual(mergeTransactionPages([], [transaction('tx-2'), transaction('tx-1')]), [
      transaction('tx-2'),
      transaction('tx-1'),
    ]);
  });

  it('appends page 2 without erasing page 1', () => {
    assert.deepEqual(
      mergeTransactionPages([transaction('tx-1')], [transaction('tx-2')]),
      [transaction('tx-1'), transaction('tx-2')],
    );
  });

  it('does not render duplicate transactions twice', () => {
    assert.deepEqual(
      mergeTransactionPages([transaction('tx-1'), transaction('tx-2')], [transaction('tx-2'), transaction('tx-3')]),
      [transaction('tx-1'), transaction('tx-2'), transaction('tx-3')],
    );
  });

  it('uses total count to decide whether load-more should remain available', () => {
    const fullLastPage: TransactionFeedDTO = {
      items: Array.from({ length: BANK_TRANSACTION_PAGE_SIZE }, (_, index) => transaction(`tx-${index}`)),
      page: 1,
      pageSize: BANK_TRANSACTION_PAGE_SIZE,
      total: BANK_TRANSACTION_PAGE_SIZE,
    };
    const fullPageWithMore: TransactionFeedDTO = {
      ...fullLastPage,
      total: BANK_TRANSACTION_PAGE_SIZE + 1,
    };

    assert.equal(getHasMoreTransactions(fullLastPage), false);
    assert.equal(getHasMoreTransactions(fullPageWithMore), true);
  });
});
