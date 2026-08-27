import { normalizeMove, type Position } from 'chessops/chess';
import { makeSan } from 'chessops/san';
import {
  isNormal,
  type Color,
  type Move,
  type NormalMove,
  type Piece,
  type Role,
  type Square,
  type SquareName,
} from 'chessops/types';
import { makeSquare, moveEquals, opposite, squareRank } from 'chessops/util';

export interface PieceDanger {
  square: Square;
  squareName: SquareName;
  piece: Piece;
  supporters: SquareName[];
  attackers: SquareName[];
  supporterCount: number;
  attackerCount: number;
}

export type MoralPolicy = 'complete-safety' | 'non-worsening' | 'least-harm';

export type MoveReason =
  | 'legal-complete-safety'
  | 'legal-non-worsening'
  | 'legal-least-harm'
  | 'standard-illegal'
  | 'complete-rescue-required'
  | 'avoidable-additional-danger'
  | 'not-least-harm';

export interface DangerThreshold {
  ceiling: number;
  policy: MoralPolicy;
}

export interface MoveAssessment {
  move: NormalMove;
  san?: string;
  legal: boolean;
  reason: MoveReason;
  policy?: MoralPolicy;
  beforeDanger: PieceDanger[];
  afterDanger: PieceDanger[];
}

const promotionRoles: Role[] = ['queen', 'rook', 'bishop', 'knight'];

const squareNames = (squares: Iterable<Square>): SquareName[] => Array.from(squares, makeSquare);

/**
 * Returns every piece belonging to `color` that is presently out-controlled.
 *
 * Version 1 deliberately uses the geometric attack map from chessops. The
 * occupying piece never appears among the attackers of its own square, so it
 * is naturally excluded from its supporter count.
 */
export const dangerReport = (position: Position, color: Color): PieceDanger[] => {
  const danger: PieceDanger[] = [];
  const occupied = position.board.occupied;

  for (const square of position.board[color]) {
    const supporters = position.kingAttackers(square, color, occupied);
    const attackers = position.kingAttackers(square, opposite(color), occupied);
    if (attackers.size() > supporters.size()) {
      danger.push({
        square,
        squareName: makeSquare(square),
        piece: position.board.get(square)!,
        supporters: squareNames(supporters),
        attackers: squareNames(attackers),
        supporterCount: supporters.size(),
        attackerCount: attackers.size(),
      });
    }
  }

  return danger;
};

/** Generate all ordinary chess moves, including all promotion choices. */
export const standardLegalMoves = (position: Position): NormalMove[] => {
  const moves: NormalMove[] = [];
  const ctx = position.ctx();

  for (const [from, destinations] of position.allDests(ctx)) {
    const promotes =
      position.board.pawn.has(from) && squareRank(from) === (position.turn === 'white' ? 6 : 1);
    for (const to of destinations) {
      if (promotes) {
        for (const promotion of promotionRoles) moves.push({ from, to, promotion });
      } else moves.push({ from, to });
    }
  }

  return moves;
};

/**
 * Selects the maximum danger score allowed by the least-avoidable-harm rule.
 */
export const dangerThreshold = (currentDanger: number, resultingDanger: number[]): DangerThreshold => {
  if (resultingDanger.length === 0) return { ceiling: 0, policy: 'complete-safety' };
  if (resultingDanger.includes(0)) return { ceiling: 0, policy: 'complete-safety' };
  if (resultingDanger.some(score => score <= currentDanger)) {
    return { ceiling: currentDanger, policy: 'non-worsening' };
  }
  return { ceiling: Math.min(...resultingDanger), policy: 'least-harm' };
};

const legalReason = (policy: MoralPolicy): MoveReason => {
  switch (policy) {
    case 'complete-safety':
      return 'legal-complete-safety';
    case 'non-worsening':
      return 'legal-non-worsening';
    case 'least-harm':
      return 'legal-least-harm';
  }
  throw new Error(`Unknown moral policy: ${policy}`);
};

const illegalReason = (policy: MoralPolicy): MoveReason => {
  switch (policy) {
    case 'complete-safety':
      return 'complete-rescue-required';
    case 'non-worsening':
      return 'avoidable-additional-danger';
    case 'least-harm':
      return 'not-least-harm';
  }
  throw new Error(`Unknown moral policy: ${policy}`);
};

export const analyzeMoves = (position: Position): MoveAssessment[] => {
  const mover = position.turn;
  const beforeDanger = dangerReport(position, mover);
  const simulations = standardLegalMoves(position).map(move => {
    const after = position.clone();
    after.play(move);
    return {
      move,
      san: makeSan(position, move),
      afterDanger: dangerReport(after, mover),
    };
  });
  if (simulations.length === 0) return [];

  const threshold = dangerThreshold(
    beforeDanger.length,
    simulations.map(simulation => simulation.afterDanger.length),
  );

  return simulations.map(simulation => {
    const legal = simulation.afterDanger.length <= threshold.ceiling;
    return {
      ...simulation,
      legal,
      reason: legal ? legalReason(threshold.policy) : illegalReason(threshold.policy),
      policy: threshold.policy,
      beforeDanger,
    };
  });
};

export const assessMove = (position: Position, requestedMove: Move): MoveAssessment => {
  const beforeDanger = dangerReport(position, position.turn);
  if (!isNormal(requestedMove) || !position.isLegal(requestedMove)) {
    return {
      move: isNormal(requestedMove) ? requestedMove : { from: -1, to: requestedMove.to },
      legal: false,
      reason: 'standard-illegal',
      beforeDanger,
      afterDanger: beforeDanger,
    };
  }

  const normalized = normalizeMove(position, requestedMove);
  if (!isNormal(normalized)) throw new Error('Standard chess unexpectedly normalized a move into a drop');
  const assessment = analyzeMoves(position).find(candidate => moveEquals(candidate.move, normalized));
  if (!assessment)
    throw new Error(`Legal move ${makeSquare(normalized.from)}${makeSquare(normalized.to)} was not analyzed`);
  return assessment;
};
