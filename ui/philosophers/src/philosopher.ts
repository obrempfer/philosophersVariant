import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import type { Color, NormalMove, Role } from 'chessops/types';
import { opposite, squareFile, squareRank } from 'chessops/util';

import { moralMoves, type BotDifficulty } from './bot';
import { dangerReport } from './rules';

const mateScore = 1_000_000;
const pieceValues: Record<Role, number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 0,
};

const positionalValue = (role: Role, square: number, color: Color): number => {
  const file = squareFile(square);
  const rank = squareRank(square);
  const forwardRank = color === 'white' ? rank : 7 - rank;
  const centrality = 7 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5));
  switch (role) {
    case 'pawn':
      return forwardRank * 6 + (file === 3 || file === 4 ? 8 : 0);
    case 'knight':
      return centrality * 12;
    case 'bishop':
      return centrality * 5;
    case 'rook':
      return forwardRank * 2;
    case 'queen':
      return centrality * 2;
    case 'king':
      return -centrality * 2;
  }
  return 0;
};

interface SearchContext {
  deadline: number;
  maxNodes: number;
  nodes: number;
  perspective: Color;
  table: Map<string, number>;
}

interface ScoredMove {
  move: NormalMove;
  score: number;
}

export interface PhilosopherChoice {
  move: NormalMove;
  score: number;
  depth: number;
  nodes: number;
}

export interface PhilosopherOptions {
  now?: () => number;
  random?: () => number;
}

class SearchInterrupted extends Error {}

const evaluate = (position: Position, perspective: Color): number => {
  let score = 0;
  for (const [square, piece] of position.board) {
    const value = pieceValues[piece.role] + positionalValue(piece.role, square, piece.color);
    score += piece.color === perspective ? value : -value;
  }

  const ownDanger = dangerReport(position, perspective).length;
  const enemyDanger = dangerReport(position, opposite(perspective)).length;
  score += (enemyDanger - ownDanger) * 180;

  if (position.isCheck()) score += position.turn === perspective ? -45 : 45;
  return score;
};

const terminalScore = (position: Position, perspective: Color, depth: number): number | undefined => {
  const outcome = position.outcome();
  if (!outcome) return undefined;
  if (!outcome.winner) return 0;
  return outcome.winner === perspective ? mateScore + depth : -mateScore - depth;
};

const assertBudget = (context: SearchContext, now: () => number): void => {
  if (context.nodes >= context.maxNodes || now() >= context.deadline) throw new SearchInterrupted();
  context.nodes++;
};

const orderedMoves = (position: Position): NormalMove[] =>
  moralMoves(position)
    .map(({ move }) => move)
    .sort((left, right) => {
      const leftTarget = position.board.get(left.to);
      const rightTarget = position.board.get(right.to);
      const leftCapture = leftTarget && leftTarget.color !== position.turn ? pieceValues[leftTarget.role] : 0;
      const rightCapture =
        rightTarget && rightTarget.color !== position.turn ? pieceValues[rightTarget.role] : 0;
      return (
        rightCapture +
        (right.promotion ? pieceValues[right.promotion] : 0) -
        leftCapture -
        (left.promotion ? pieceValues[left.promotion] : 0)
      );
    });

const search = (
  position: Position,
  depth: number,
  alpha: number,
  beta: number,
  context: SearchContext,
  now: () => number,
): number => {
  assertBudget(context, now);
  const terminal = terminalScore(position, context.perspective, depth);
  if (terminal !== undefined) return terminal;
  if (depth === 0) return evaluate(position, context.perspective);

  const key = `${depth}:${makeFen(position.toSetup())}`;
  const cached = context.table.get(key);
  if (cached !== undefined) return cached;

  const maximizing = position.turn === context.perspective;
  let best = maximizing ? -Infinity : Infinity;
  let completed = true;
  const moves = orderedMoves(position);
  for (const move of moves) {
    const after = position.clone();
    after.play(move);
    const score = search(after, depth - 1, alpha, beta, context, now);
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) {
      completed = false;
      break;
    }
  }

  if (completed) context.table.set(key, best);
  return best;
};

const searchRoot = (
  position: Position,
  depth: number,
  context: SearchContext,
  now: () => number,
): ScoredMove[] => {
  const scored: ScoredMove[] = [];
  for (const move of orderedMoves(position)) {
    const after = position.clone();
    after.play(move);
    scored.push({ move, score: search(after, depth - 1, -Infinity, Infinity, context, now) });
  }
  return scored.sort((left, right) => right.score - left.score);
};

export const choosePhilosopherMove = (
  position: Position,
  difficulty: BotDifficulty,
  options: PhilosopherOptions = {},
): PhilosopherChoice => {
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? Math.random;
  const context: SearchContext = {
    deadline: now() + difficulty.philosopherMoveTime,
    maxNodes: difficulty.philosopherNodes,
    nodes: 0,
    perspective: position.turn,
    table: new Map(),
  };

  let completedDepth = 0;
  let scored: ScoredMove[] = [];
  for (let depth = 1; depth <= difficulty.philosopherDepth; depth++) {
    try {
      const iteration = searchRoot(position, depth, context, now);
      if (iteration.length === 0) throw new Error('The Philosopher Engine has no moral move');
      scored = iteration;
      completedDepth = depth;
    } catch (error) {
      if (!(error instanceof SearchInterrupted)) throw error;
      break;
    }
  }

  if (scored.length === 0) {
    scored = orderedMoves(position).map(move => {
      const after = position.clone();
      after.play(move);
      return { move, score: evaluate(after, context.perspective) };
    });
    scored.sort((left, right) => right.score - left.score);
  }
  if (scored.length === 0) throw new Error('The Philosopher Engine has no moral move');

  const bestScore = scored[0].score;
  const candidates = scored.filter(candidate => candidate.score >= bestScore - difficulty.randomness);
  const selected = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  return { ...selected, depth: completedDepth, nodes: context.nodes };
};
