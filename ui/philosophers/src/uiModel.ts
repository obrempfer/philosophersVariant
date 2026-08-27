import type { Dests, Key } from '@lichess-org/chessground/types';
import type { Position } from 'chessops/chess';
import type { NormalMove } from 'chessops/types';
import { kingCastlesTo, makeSquare, parseSquare, squareRank } from 'chessops/util';

import { type AttemptResult, PhilosophersGame } from './game';
import { analyzeMoves } from './rules';

export type PlayMode = 'strict' | 'strikes';

const displayDestination = (position: Position, move: NormalMove): Key => {
  if (position.board.king.has(move.from) && position.board[position.turn].has(move.to)) {
    const side = move.to > move.from ? 'h' : 'a';
    return makeSquare(kingCastlesTo(position.turn, side));
  }
  return makeSquare(move.to);
};

export const destinationsForMode = (position: Position, mode: PlayMode): Dests => {
  const destinations = new Map<Key, Set<Key>>();
  for (const assessment of analyzeMoves(position)) {
    if (mode === 'strict' && !assessment.legal) continue;
    const from = makeSquare(assessment.move.from);
    const to = displayDestination(position, assessment.move);
    const existing = destinations.get(from) ?? new Set<Key>();
    existing.add(to);
    destinations.set(from, existing);
  }
  return new Map(Array.from(destinations, ([from, squares]) => [from, Array.from(squares)]));
};

export const attemptBoardMove = (game: PhilosophersGame, from: Key, to: Key): AttemptResult => {
  const fromSquare = parseSquare(from);
  const toSquare = parseSquare(to);
  if (fromSquare === undefined || toSquare === undefined) {
    throw new Error(`Invalid board move: ${from}${to}`);
  }
  const piece = game.position.board.get(fromSquare);
  const promotes = piece?.role === 'pawn' && (squareRank(toSquare) === 0 || squareRank(toSquare) === 7);
  return game.attemptText(`${from}${to}${promotes ? 'q' : ''}`);
};
