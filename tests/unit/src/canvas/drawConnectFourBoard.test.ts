import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONNECT_FOUR_COLUMNS,
  CONNECT_FOUR_ROWS,
  getConnectFourBoardLayout,
  getConnectFourHighlightRect,
} from '../../../../src/canvas/drawConnectFourBoard.ts';

describe('drawConnectFourBoard geometry', () => {
  it('keeps the default match board geometry aligned to full-width click columns', () => {
    const layout = getConnectFourBoardLayout(560, 480);

    assert.equal(layout.inset, 0);
    assert.equal(layout.boardWidth, 560);
    assert.equal(layout.boardHeight, 480);
    assert.equal(layout.cellWidth, 560 / CONNECT_FOUR_COLUMNS);
    assert.equal(layout.cellHeight, 480 / CONNECT_FOUR_ROWS);
  });

  it('applies the landing preview inset only when requested', () => {
    const layout = getConnectFourBoardLayout(560, 480, { inset: 'auto' });

    assert.equal(layout.inset, Math.max(6, 480 * 0.035));
    assert.ok(layout.boardWidth < 560);
    assert.ok(layout.boardHeight < 480);
  });

  it('does not produce negative highlight rectangles on tiny inset boards', () => {
    const layout = getConnectFourBoardLayout(8, 8, { inset: 'auto' });
    const rect = getConnectFourHighlightRect(0, 0, layout);

    assert.ok(Number.isFinite(rect.x));
    assert.ok(Number.isFinite(rect.y));
    assert.ok(rect.width >= 0);
    assert.ok(rect.height >= 0);
  });
});
