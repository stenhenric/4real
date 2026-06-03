import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { getOrders } from '../../../../src/services/orders.service.ts';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('getOrders treats unexpected non-array payloads as an empty history', async (t) => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => jsonResponse(200, {
    message: 'not an order list',
  }));

  t.after(() => fetchMock.mock.restore());

  assert.deepEqual(await getOrders(), []);
});
