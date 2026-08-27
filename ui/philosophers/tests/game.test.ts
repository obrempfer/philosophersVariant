import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PhilosophersGame } from '../src/game';

const position = (fen: string): Chess => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();

test('rejected moves add a strike while leaving the position and turn unchanged', () => {
  const game = new PhilosophersGame(position('4k3/8/8/3r4/3N4/8/8/4K3 w - - 0 1'));
  const before = makeFen(game.position.toSetup());
  const result = game.attemptText('Ke2');

  assert.equal(result.accepted, false);
  assert.equal(result.strikes, 1);
  assert.equal(result.reason, 'complete-rescue-required');
  assert.equal(makeFen(game.position.toSetup()), before);
  assert.equal(game.position.turn, 'white');
});

test('a third rejected move loses by strikeout', () => {
  const game = new PhilosophersGame(position('4k3/8/8/3r4/3N4/8/8/4K3 w - - 0 1'));

  game.attemptText('Ke2');
  game.attemptText('Ke2');
  const result = game.attemptText('Ke2');

  assert.equal(result.accepted, false);
  assert.equal(result.strikes, 3);
  assert.deepEqual(result.outcome, { winner: 'black', reason: 'strikeout' });
});

test('accepted moves change the board and pass the turn', () => {
  const game = new PhilosophersGame();
  const result = game.attemptText('e4');

  assert.equal(result.accepted, true);
  assert.equal(result.san, 'e4');
  assert.equal(game.position.turn, 'black');
  assert.equal(game.strikes.white, 0);
});

test('a player must answer a newly created danger when complete rescue is possible', () => {
  const game = new PhilosophersGame();

  assert.equal(game.attemptText('e4').accepted, true);
  assert.equal(game.attemptText('e5').accepted, true);
  assert.equal(game.attemptText('Nf3').accepted, true);

  const ignoredDanger = game.attemptText('a6');
  assert.equal(ignoredDanger.accepted, false);
  assert.equal(ignoredDanger.reason, 'complete-rescue-required');
  assert.equal(game.position.turn, 'black');

  const defendedPawn = game.attemptText('Nc6');
  assert.equal(defendedPawn.accepted, true);
  assert.equal(game.position.turn, 'white');
});
