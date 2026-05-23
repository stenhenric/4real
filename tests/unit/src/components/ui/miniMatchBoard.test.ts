import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMiniMatchBoardCells, getMiniMatchDiscClass } from '../../../../../src/components/ui/miniMatchBoard.ts';
import type { MatchMoveDTO } from '../../../../../src/types/api.ts';

describe('mini match board helpers', () => {
  it('places known move coordinates in the expected cells', () => {
    const moves: MatchMoveDTO[] = [
      { userId: 'p1', row: 5, col: 3 },
      { userId: 'p2', row: 4, col: 3 },
    ];

    const cells = buildMiniMatchBoardCells(moves, 'p1', 'p2');

    assert.equal(cells[5 * 7 + 3]?.owner, 'player1');
    assert.equal(cells[4 * 7 + 3]?.owner, 'player2');
  });

  it('ignores invalid or missing move coordinates without crashing', () => {
    const moves = [
      { userId: 'p1', row: 5, col: 6 },
      { userId: 'p2', row: 6, col: 0 },
      { userId: 'p2', row: 0, col: -1 },
    ] as MatchMoveDTO[];

    const cells = buildMiniMatchBoardCells(moves, 'p1', 'p2');

    assert.equal(cells.filter(cell => cell.owner !== null).length, 1);
    assert.equal(cells[5 * 7 + 6]?.owner, 'player1');
  });

  it('maps player indicators from move user ids', () => {
    assert.equal(getMiniMatchDiscClass('player1'), 'disc-red border-0');
    assert.equal(getMiniMatchDiscClass('player2'), 'disc-blue border-0');
    assert.equal(getMiniMatchDiscClass(null), undefined);
  });
});
