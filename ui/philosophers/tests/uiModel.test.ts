import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PhilosophersGame } from '../src/game';
import { attemptBoardMove, destinationsForMode } from '../src/uiModel';

const position = (fen: string): Chess => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();

test('strict mode hides a moral violation while three-strike mode leaves it selectable', () => {
  const pos = position('4k3/8/8/3r4/3N4/8/8/4K3 w - - 0 1');
  const strict = destinationsForMode(pos, 'strict');
  const strikes = destinationsForMode(pos, 'strikes');

  assert.equal(strict.get('e1')?.includes('e2') ?? false, false);
  assert.equal(strikes.get('e1')?.includes('e2') ?? false, true);
  assert.equal(strict.get('d4')?.includes('f3') ?? false, true);
});

test('a moral violation selected in three-strike mode snaps back through the existing game rejection', () => {
  const game = new PhilosophersGame(position('4k3/8/8/3r4/3N4/8/8/4K3 w - - 0 1'));
  const result = attemptBoardMove(game, 'e1', 'e2');

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'complete-rescue-required');
  assert.equal(result.strikes, 1);
  assert.equal(game.position.turn, 'white');
  assert.equal(game.position.board.kingOf('white'), 4);
});

test('strict destinations change when an opening move creates a duty to rescue', () => {
  const game = new PhilosophersGame();
  game.attemptText('e4');
  game.attemptText('e5');
  game.attemptText('Nf3');

  const strict = destinationsForMode(game.position, 'strict');
  const strikes = destinationsForMode(game.position, 'strikes');
  assert.equal(strict.get('a7')?.includes('a6') ?? false, false);
  assert.equal(strikes.get('a7')?.includes('a6') ?? false, true);
  assert.equal(strict.get('b8')?.includes('c6') ?? false, true);
});

test('strict mode blocks Qxa3 when bxa3 reveals the c1 bishop', () => {
  const game = new PhilosophersGame(
    position('r3k2r/pbppbpp1/1p6/2qPp2p/P2nP1n1/R1NB1N1P/1PPQ1PP1/2B1KR2 b kq - 1 12'),
  );
  const strict = destinationsForMode(game.position, 'strict');
  const strikes = destinationsForMode(game.position, 'strikes');

  assert.equal(strict.get('c5')?.includes('a3') ?? false, false);
  assert.equal(strikes.get('c5')?.includes('a3') ?? false, true);
  const result = attemptBoardMove(game, 'c5', 'a3');
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'complete-rescue-required');
  assert.equal(game.strikes.black, 1);
  assert.equal(game.position.board.get(34)?.role, 'queen');
});

test('castling uses the king destination expected by the board UI', () => {
  const game = new PhilosophersGame(position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'));
  const destinations = destinationsForMode(game.position, 'strikes');

  assert.equal(destinations.get('e1')?.includes('g1') ?? false, true);
  assert.equal(destinations.get('e1')?.includes('h1') ?? false, false);
  assert.equal(attemptBoardMove(game, 'e1', 'g1').accepted, true);
  assert.equal(game.position.board.kingOf('white'), 6);
});

test('board promotion defaults to a queen', () => {
  const game = new PhilosophersGame(position('7k/P7/8/8/8/8/8/7K w - - 0 1'));
  const result = attemptBoardMove(game, 'a7', 'a8');

  assert.equal(result.accepted, true);
  assert.equal(game.position.board.get(56)?.role, 'queen');
});
