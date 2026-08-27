import type { Position } from 'chessops/chess';
import type { NormalMove } from 'chessops/types';

import { analyzeMoves } from './rules';
import { moveToUci } from './uiModel';

export type BotKind = 'stockfish' | 'philosopher';

export interface BotDifficulty {
  level: number;
  label: string;
  stockfishSkill: number;
  stockfishMoveTime: number;
  philosopherDepth: number;
  philosopherNodes: number;
  philosopherMoveTime: number;
  randomness: number;
}

export interface MoralMove {
  move: NormalMove;
  uci: string;
}

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = [
  {
    level: 1,
    label: '1 · Novice',
    stockfishSkill: 0,
    stockfishMoveTime: 80,
    philosopherDepth: 1,
    philosopherNodes: 30,
    philosopherMoveTime: 100,
    randomness: 450,
  },
  {
    level: 2,
    label: '2 · Learner',
    stockfishSkill: 2,
    stockfishMoveTime: 120,
    philosopherDepth: 1,
    philosopherNodes: 60,
    philosopherMoveTime: 150,
    randomness: 300,
  },
  {
    level: 3,
    label: '3 · Thoughtful',
    stockfishSkill: 5,
    stockfishMoveTime: 180,
    philosopherDepth: 2,
    philosopherNodes: 600,
    philosopherMoveTime: 250,
    randomness: 200,
  },
  {
    level: 4,
    label: '4 · Capable',
    stockfishSkill: 8,
    stockfishMoveTime: 260,
    philosopherDepth: 2,
    philosopherNodes: 700,
    philosopherMoveTime: 400,
    randomness: 120,
  },
  {
    level: 5,
    label: '5 · Strong',
    stockfishSkill: 11,
    stockfishMoveTime: 380,
    philosopherDepth: 2,
    philosopherNodes: 900,
    philosopherMoveTime: 600,
    randomness: 70,
  },
  {
    level: 6,
    label: '6 · Expert',
    stockfishSkill: 14,
    stockfishMoveTime: 550,
    philosopherDepth: 3,
    philosopherNodes: 2500,
    philosopherMoveTime: 900,
    randomness: 35,
  },
  {
    level: 7,
    label: '7 · Master',
    stockfishSkill: 17,
    stockfishMoveTime: 800,
    philosopherDepth: 3,
    philosopherNodes: 3200,
    philosopherMoveTime: 1300,
    randomness: 15,
  },
  {
    level: 8,
    label: '8 · Uncompromising',
    stockfishSkill: 20,
    stockfishMoveTime: 1200,
    philosopherDepth: 3,
    philosopherNodes: 5000,
    philosopherMoveTime: 1800,
    randomness: 0,
  },
];

export const botDifficulty = (level: number): BotDifficulty =>
  BOT_DIFFICULTIES.find(difficulty => difficulty.level === level) ?? BOT_DIFFICULTIES[3];

export const moralMoves = (position: Position): MoralMove[] =>
  analyzeMoves(position)
    .filter(assessment => assessment.legal)
    .map(assessment => ({ move: assessment.move, uci: moveToUci(position, assessment.move) }));

export const botName = (kind: BotKind): string =>
  kind === 'stockfish' ? 'Constrained Stockfish' : 'Philosopher Engine';
