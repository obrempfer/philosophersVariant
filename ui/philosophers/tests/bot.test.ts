import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BOT_DIFFICULTIES, botDifficulty, moralMoves } from '../src/bot';
import { choosePhilosopherMove } from '../src/philosopher';
import { assessMove } from '../src/rules';
import { StockfishClient } from '../src/stockfish';
import { moveToUci } from '../src/uiModel';

const position = (fen: string): Chess => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();

test('eight bot levels increase Stockfish skill and Philosopher search limits', () => {
  assert.deepEqual(
    BOT_DIFFICULTIES.map(difficulty => difficulty.level),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  for (let index = 1; index < BOT_DIFFICULTIES.length; index++) {
    assert.ok(BOT_DIFFICULTIES[index].stockfishSkill > BOT_DIFFICULTIES[index - 1].stockfishSkill);
    assert.ok(BOT_DIFFICULTIES[index].philosopherNodes > BOT_DIFFICULTIES[index - 1].philosopherNodes);
    assert.ok(BOT_DIFFICULTIES[index].randomness <= BOT_DIFFICULTIES[index - 1].randomness);
  }
});

test('the constrained engine list excludes Qxa3 in the discovered-bishop position', () => {
  const pos = position('r3k2r/pbppbpp1/1p6/2qPp2p/P2nP1n1/R1NB1N1P/1PPQ1PP1/2B1KR2 b kq - 1 12');
  const moves = moralMoves(pos).map(candidate => candidate.uci);

  assert.equal(moves.includes('c5a3'), false);
  assert.ok(moves.length > 0);
});

test('both engines receive moral intermezzi in their legal move list', () => {
  const pos = position('r3B1kr/npp1n1bp/p3bqp1/3pp3/P1NPPpP1/2PQBP1P/1P2NR2/R5K1 w - - 3 19');
  const moves = new Set(moralMoves(pos).map(candidate => candidate.uci));

  assert.equal(moves.has('d3d2'), true);
  assert.equal(moves.has('a1b1'), false);
});

test('the Philosopher Engine returns a moral move after searching both sides under the variant rules', () => {
  const pos = position('r3k2r/pbppbpp1/1p6/2qPp2p/P2nP1n1/R1NB1N1P/1PPQ1PP1/2B1KR2 b kq - 1 12');
  const choice = choosePhilosopherMove(pos, botDifficulty(6), { random: () => 0 });
  const uci = moveToUci(pos, choice.move);
  const move = parseUci(uci);

  assert.notEqual(uci, 'c5a3');
  assert.ok(move);
  assert.equal(assessMove(pos, move).legal, true);
  assert.ok(choice.depth >= 1);
  assert.ok(choice.nodes > 0);
});

test('Stockfish does not load when the moral rules leave exactly one move', async () => {
  const statuses: string[] = [];
  const stockfish = new StockfishClient(status => statuses.push(status));

  assert.equal(await stockfish.bestMove({ fen: 'unused', moves: ['e2e4'], moveTime: 50, skill: 0 }), 'e2e4');
  assert.deepEqual(statuses, []);
});
