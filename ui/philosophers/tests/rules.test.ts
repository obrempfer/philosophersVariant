import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeUci, parseUci } from 'chessops/util';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyzeMoves, assessMove, dangerReport, dangerThreshold, type MoveAssessment } from '../src/rules';

const position = (fen: string): Chess => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();

const assessment = (fen: string, uci: string): MoveAssessment => {
  const pos = position(fen);
  const move = parseUci(uci);
  assert.ok(move, `invalid test UCI: ${uci}`);
  return assessMove(pos, move);
};

test('an attacked piece with no safe recapture is endangered', () => {
  const pos = position('4k3/8/8/3r4/3N4/8/8/4K3 w - - 0 1');
  const danger = dangerReport(pos, 'white');

  assert.equal(danger.length, 1);
  assert.equal(danger[0].squareName, 'd4');
  assert.equal(danger[0].supporterCount, 0);
  assert.equal(danger[0].attackerCount, 1);
});

test('complete rescue is mandatory when it is achievable', () => {
  const fen = '4k3/8/8/3r4/3N4/8/8/4K3 w - - 0 1';

  assert.equal(assessment(fen, 'e1e2').legal, false);
  assert.equal(assessment(fen, 'e1e2').reason, 'complete-rescue-required');
  assert.equal(assessment(fen, 'd4f3').legal, true);
});

test('moving a defender away is illegal when it creates avoidable danger', () => {
  const fen = '3rk3/8/8/8/3P4/8/8/3RK3 w - - 0 1';
  const result = assessment(fen, 'd1a1');

  assert.equal(result.legal, false);
  assert.equal(result.reason, 'complete-rescue-required');
  assert.deepEqual(
    result.afterDanger.map(danger => danger.squareName),
    ['d4'],
  );
});

test('capturing two defenders with only two attackers is a sacrifice', () => {
  const fen = '3rk3/6b1/8/8/3p4/8/8/3RK1B1 w - - 0 1';
  const result = assessment(fen, 'd1d4');

  assert.equal(result.legal, false);
  assert.equal(result.afterDanger.length, 1);
  assert.equal(result.afterDanger[0].squareName, 'd4');
  assert.equal(result.afterDanger[0].supporterCount, 1);
  assert.equal(result.afterDanger[0].attackerCount, 2);
});

test('a third attacker makes the same capture safe', () => {
  const fen = '3rk3/6b1/8/8/3p4/8/8/B2RK1B1 w - - 0 1';
  const result = assessment(fen, 'd1d4');

  assert.equal(result.legal, true);
  assert.equal(result.afterDanger.length, 0);
});

test('discovered protection during an exchange makes Qxa3 a sacrifice', () => {
  const fen = 'r3k2r/pbppbpp1/1p6/2qPp2p/P2nP1n1/R1NB1N1P/1PPQ1PP1/2B1KR2 b kq - 1 12';
  const result = assessment(fen, 'c5a3');

  assert.equal(result.legal, false);
  assert.equal(result.reason, 'complete-rescue-required');
  assert.deepEqual(
    result.afterDanger.map(danger => danger.squareName),
    ['a3'],
  );
  assert.deepEqual(result.afterDanger[0].captureSequence, ['b2', 'e7', 'c1']);
});

test('an unsaveable piece creates no obligation but avoidable additional danger remains illegal', () => {
  const fen = 'r6k/8/8/1n4b1/1n6/8/B7/KN6 w - - 0 1';
  const pos = position(fen);
  const moves = analyzeMoves(pos);

  assert.equal(
    moves.some(move => move.afterDanger.length === 0),
    false,
  );
  assert.equal(assessment(fen, 'a1b2').legal, true);
  assert.equal(assessment(fen, 'b1d2').legal, false);
  assert.equal(assessment(fen, 'b1d2').reason, 'avoidable-additional-danger');
});

test('an otherwise sacrificial move is legal when it rescues a piece without increasing total danger', () => {
  const fen = 'r6k/8/8/1n4b1/1n6/8/B7/KN6 w - - 0 1';
  const result = assessment(fen, 'b1a3');

  assert.equal(result.legal, true);
  assert.deepEqual(
    result.beforeDanger.map(danger => danger.squareName),
    ['a2'],
  );
  assert.deepEqual(
    result.afterDanger.map(danger => danger.squareName),
    ['a3'],
  );
});

test('danger threshold follows least avoidable harm priorities', () => {
  assert.deepEqual(dangerThreshold(1, [0, 1, 2]), { ceiling: 0, policy: 'complete-safety' });
  assert.deepEqual(dangerThreshold(2, [1, 2, 3]), { ceiling: 1, policy: 'non-worsening' });
  assert.deepEqual(dangerThreshold(1, [1, 2]), { ceiling: 1, policy: 'non-worsening' });
  assert.deepEqual(dangerThreshold(0, [1, 2, 2]), { ceiling: 1, policy: 'least-harm' });
});

test('a non-capturing counter-threat provides actionable safety during a forced rescue', () => {
  const fen = 'n7/7k/8/3r4/3N4/8/8/KR6 w - - 0 1';
  const result = assessment(fen, 'b1b8');

  assert.equal(result.legal, true);
  assert.equal(result.reason, 'legal-actionable-safety');
  assert.equal(result.forcingRescue, true);
  assert.deepEqual(
    result.afterDanger.map(danger => danger.squareName),
    ['d4'],
  );
  assert.deepEqual(result.actionableDanger, []);
});

test('a counter-threat fails when a best rescue reply can capture the exposed piece', () => {
  const fen = '7k/8/8/3r4/3N4/8/2B5/K7 w - - 0 1';
  const result = assessment(fen, 'c2b3');

  assert.equal(result.legal, false);
  assert.equal(result.forcingRescue, true);
  assert.deepEqual(result.actionableDanger, ['d4']);
});

test('a capture cannot defer its own rescue duty through actionable safety', () => {
  const fen = 'nb6/7k/8/3r4/3N4/8/8/KR6 w - - 0 1';
  const result = assessment(fen, 'b1b8');

  assert.equal(result.san, 'Rxb8');
  assert.equal(result.legal, false);
  assert.equal(result.reason, 'complete-rescue-required');
});

test('the two-threat game position permits Qd2 as a moral intermezzo', () => {
  const fen = 'r3B1kr/npp1n1bp/p3bqp1/3pp3/P1NPPpP1/2PQBP1P/1P2NR2/R5K1 w - - 3 19';
  const directRescue = assessment(fen, 'b2b3');
  const ignoresBoth = assessment(fen, 'a1b1');
  const intermezzo = assessment(fen, 'd3d2');

  assert.equal(directRescue.legal, true);
  assert.deepEqual(
    directRescue.afterDanger.map(danger => danger.squareName),
    ['e8'],
  );
  assert.equal(ignoresBoth.legal, false);
  assert.equal(intermezzo.legal, true);
  assert.equal(intermezzo.reason, 'legal-actionable-safety');
  assert.equal(intermezzo.forcingRescue, true);
  assert.deepEqual(
    intermezzo.afterDanger.map(danger => danger.squareName),
    ['c4', 'e8'],
  );
  assert.deepEqual(intermezzo.actionableDanger, []);
});

test('the initial position offers ordinary safe opening moves', () => {
  const moves = analyzeMoves(Chess.default()).filter(move => move.legal);
  const uciMoves = new Set(moves.map(move => makeUci(move.move)));

  assert.ok(uciMoves.has('e2e4'));
  assert.ok(uciMoves.has('g1f3'));
  assert.ok(moves.every(move => move.afterDanger.length === 0));
});
