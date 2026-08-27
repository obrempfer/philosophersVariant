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
  ROLES,
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
  captureSequence: SquareName[];
}

export type MoralPolicy = 'complete-safety' | 'non-worsening' | 'least-harm';

export type MoveReason =
  | 'legal-complete-safety'
  | 'legal-non-worsening'
  | 'legal-least-harm'
  | 'legal-actionable-safety'
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
  actionableDanger: SquareName[];
  forcingRescue: boolean;
}

const promotionRoles: Role[] = ['queen', 'rook', 'bishop', 'knight'];

const squareNames = (squares: Iterable<Square>): SquareName[] => Array.from(squares, makeSquare);

interface CaptureSearch {
  safe: boolean;
  line: Square[];
}

const exchangeKey = (position: Position, square: Square, attacker: Color): string => {
  const board = position.board;
  const sets = [board.white, board.black, ...ROLES.map(role => board[role])];
  return `${square}:${attacker}:${sets.map(set => `${set.lo},${set.hi}`).join(':')}`;
};

/**
 * Looks for a capture whose new occupant cannot itself be captured safely.
 *
 * Each recursive step removes one piece, so the search always terminates. The
 * board is updated between steps, which reveals x-ray attackers opened by an
 * exchange (for example b2xa3 uncovering a bishop on c1).
 */
const safeCapture = (
  position: Position,
  square: Square,
  attacker: Color,
  memo: Map<string, CaptureSearch>,
): CaptureSearch => {
  const key = exchangeKey(position, square, attacker);
  const cached = memo.get(key);
  if (cached) return cached;

  const occupant = position.board.get(square);
  if (!occupant || occupant.color === attacker) return { safe: false, line: [] };

  let illustrativeRefutation: Square[] = [];
  const attackers = position.kingAttackers(square, attacker, position.board.occupied);
  for (const from of attackers) {
    const after = position.clone();
    const capturingPiece = after.board.take(from);
    if (!capturingPiece) continue;
    after.board.set(square, capturingPiece);

    const response = safeCapture(after, square, occupant.color, memo);
    const line = [from, ...response.line];
    if (!response.safe) {
      const result = { safe: true, line };
      memo.set(key, result);
      return result;
    }
    if (line.length > illustrativeRefutation.length) illustrativeRefutation = line;
  }

  const result = { safe: false, line: illustrativeRefutation };
  memo.set(key, result);
  return result;
};

/**
 * Returns every piece belonging to `color` that the opponent can capture
 * without exposing the capturing piece to a safe recapture.
 *
 * The exchange search deliberately uses the geometric attack map from
 * chessops, including attacks by pinned pieces. Immediate attackers and
 * supporters are retained in the report as useful context, but the recursive
 * safe-capture result determines danger.
 */
export const dangerReport = (position: Position, color: Color): PieceDanger[] => {
  const danger: PieceDanger[] = [];
  const occupied = position.board.occupied;
  const memo = new Map<string, CaptureSearch>();

  for (const square of position.board[color]) {
    const supporters = position.kingAttackers(square, color, occupied);
    const attackers = position.kingAttackers(square, opposite(color), occupied);
    const capture = safeCapture(position, square, opposite(color), memo);
    if (capture.safe) {
      danger.push({
        square,
        squareName: makeSquare(square),
        piece: position.board.get(square)!,
        supporters: squareNames(supporters),
        attackers: squareNames(attackers),
        supporterCount: supporters.size(),
        attackerCount: attackers.size(),
        captureSequence: squareNames(capture.line),
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
 * Selects the best attainable danger score under the least-avoidable-harm rule.
 */
export const dangerThreshold = (currentDanger: number, resultingDanger: number[]): DangerThreshold => {
  if (resultingDanger.length === 0) return { ceiling: 0, policy: 'complete-safety' };
  const minimum = Math.min(...resultingDanger);
  if (minimum === 0) return { ceiling: 0, policy: 'complete-safety' };
  if (minimum <= currentDanger) return { ceiling: minimum, policy: 'non-worsening' };
  return { ceiling: minimum, policy: 'least-harm' };
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

interface ImmediateReplySet {
  actionableDanger: SquareName[];
  forcingRescue: boolean;
}

const moveCaptures = (before: Position, after: Position, victim: Color): boolean =>
  after.board[victim].size() < before.board[victim].size();

/**
 * Finds friendly pieces that the opponent can take with a best-immediate-rescue
 * reply. These replies deliberately use geometric danger rather than calling
 * `analyzeMoves`, which gives the actionable-safety rule a finite one-ply base.
 *
 * Actionable-safety exceptions are restricted to non-captures below. Therefore
 * every morally legal capturing reply is present in this immediate reply set,
 * while non-capturing counter-threats can still form longer forcing sequences.
 */
const immediateReplySet = (position: Position, protectedColor: Color): ImmediateReplySet => {
  const opponent = position.turn;
  const opponentDanger = dangerReport(position, opponent);
  const replies = standardLegalMoves(position).map(move => {
    const after = position.clone();
    after.play(move);
    return { after, danger: dangerReport(after, opponent).length };
  });

  if (replies.length === 0) return { actionableDanger: [], forcingRescue: false };

  const minimum = Math.min(...replies.map(reply => reply.danger));
  const capturedSquares = new Set<Square>();
  for (const reply of replies) {
    if (reply.danger !== minimum) continue;
    for (const square of position.board[protectedColor]) {
      if (!reply.after.board[protectedColor].has(square)) capturedSquares.add(square);
    }
  }

  return {
    actionableDanger: Array.from(capturedSquares, makeSquare),
    forcingRescue: minimum < opponentDanger.length,
  };
};

export const analyzeMoves = (position: Position): MoveAssessment[] => {
  const mover = position.turn;
  const beforeDanger = dangerReport(position, mover);
  const simulations = standardLegalMoves(position).map(move => {
    const after = position.clone();
    after.play(move);
    return {
      after,
      captures: moveCaptures(position, after, opposite(mover)),
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
    const immediateSafety = simulation.afterDanger.length <= threshold.ceiling;
    const actionable =
      immediateSafety || simulation.captures
        ? {
            actionableDanger: simulation.afterDanger.map(danger => danger.squareName),
            forcingRescue: false,
          }
        : immediateReplySet(simulation.after, mover);
    const actionableSafety =
      !immediateSafety &&
      !simulation.captures &&
      actionable.forcingRescue &&
      actionable.actionableDanger.length <= threshold.ceiling;
    const legal = immediateSafety || actionableSafety;
    return {
      move: simulation.move,
      san: simulation.san,
      afterDanger: simulation.afterDanger,
      actionableDanger: actionable.actionableDanger,
      forcingRescue: actionable.forcingRescue,
      legal,
      reason: actionableSafety
        ? 'legal-actionable-safety'
        : legal
          ? legalReason(threshold.policy)
          : illegalReason(threshold.policy),
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
      actionableDanger: beforeDanger.map(danger => danger.squareName),
      forcingRescue: false,
    };
  }

  const normalized = normalizeMove(position, requestedMove);
  if (!isNormal(normalized)) throw new Error('Standard chess unexpectedly normalized a move into a drop');
  const assessment = analyzeMoves(position).find(candidate => moveEquals(candidate.move, normalized));
  if (!assessment)
    throw new Error(`Legal move ${makeSquare(normalized.from)}${makeSquare(normalized.to)} was not analyzed`);
  return assessment;
};
