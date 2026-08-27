import { Chess, normalizeMove } from 'chessops/chess';
import { makeSan, parseSan } from 'chessops/san';
import { type ByColor, type Color, type Move, type Outcome } from 'chessops/types';
import { opposite, parseUci } from 'chessops/util';

import { assessMove, type MoveAssessment, type MoveReason } from './rules';

export type OutcomeReason = 'strikeout' | 'checkmate' | 'stalemate' | 'insufficient-material';

export interface PhilosophersOutcome extends Outcome {
  reason: OutcomeReason;
}

export interface AttemptResult {
  accepted: boolean;
  mover: Color;
  strikes: number;
  reason: MoveReason | 'game-over';
  san?: string;
  assessment?: MoveAssessment;
  outcome?: PhilosophersOutcome;
}

export const parseMoveText = (position: Chess, text: string): Move | undefined => {
  const input = text.trim();
  const uci = parseUci(input);
  if (uci && position.isLegal(uci)) return normalizeMove(position, uci);
  return parseSan(position, input);
};

export class PhilosophersGame {
  readonly position: Chess;
  readonly strikes: ByColor<number> = { white: 0, black: 0 };
  readonly strikeLimit: number;
  outcome: PhilosophersOutcome | undefined;

  constructor(position: Chess = Chess.default(), strikeLimit = 3) {
    this.position = position.clone();
    this.strikeLimit = strikeLimit;
  }

  attemptText(text: string): AttemptResult {
    const move = parseMoveText(this.position, text);
    if (!move) return this.reject('standard-illegal');
    return this.attempt(move);
  }

  attempt(move: Move): AttemptResult {
    if (this.outcome) {
      return {
        accepted: false,
        mover: this.position.turn,
        strikes: this.strikes[this.position.turn],
        reason: 'game-over',
        outcome: this.outcome,
      };
    }

    const assessment = assessMove(this.position, move);
    if (!assessment.legal) return this.reject(assessment.reason, assessment);

    const mover = this.position.turn;
    const san = makeSan(this.position, assessment.move);
    this.position.play(assessment.move);
    this.outcome = this.standardOutcome();
    return {
      accepted: true,
      mover,
      strikes: this.strikes[mover],
      reason: assessment.reason,
      san,
      assessment,
      outcome: this.outcome,
    };
  }

  private reject(reason: MoveReason, assessment?: MoveAssessment): AttemptResult {
    const mover = this.position.turn;
    this.strikes[mover]++;
    if (this.strikes[mover] >= this.strikeLimit)
      this.outcome = { winner: opposite(mover), reason: 'strikeout' };
    return {
      accepted: false,
      mover,
      strikes: this.strikes[mover],
      reason,
      assessment,
      outcome: this.outcome,
    };
  }

  private standardOutcome(): PhilosophersOutcome | undefined {
    const outcome = this.position.outcome();
    if (!outcome) return undefined;
    if (this.position.isCheckmate()) return { ...outcome, reason: 'checkmate' };
    if (this.position.isStalemate()) return { ...outcome, reason: 'stalemate' };
    return { ...outcome, reason: 'insufficient-material' };
  }
}
