import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key, SquareClasses } from '@lichess-org/chessground/types';
import { makeBoardFen } from 'chessops/fen';

import { PhilosophersGame } from './game';
import { analyzeMoves, dangerReport, type PieceDanger } from './rules';

import './styles.css';
import { attemptBoardMove, destinationsForMode, type PlayMode } from './uiModel';

const element = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing UI element: ${selector}`);
  return found;
};

const boardElement = element<HTMLDivElement>('#board');
const modeSelect = element<HTMLSelectElement>('#mode');
const modeTitle = element<HTMLElement>('#mode-title');
const modeCopy = element<HTMLElement>('#mode-copy');
const message = element<HTMLElement>('#message');
const strikesPanel = element<HTMLElement>('#strikes-panel');
const whiteStrikes = element<HTMLElement>('#white-strikes');
const blackStrikes = element<HTMLElement>('#black-strikes');
const dangerCount = element<HTMLElement>('#danger-count');
const dangerList = element<HTMLElement>('#danger-list');
const moveList = element<HTMLOListElement>('#move-list');
const turnLabel = element<HTMLElement>('#turn-label');
const turnMarker = element<HTMLElement>('#turn-marker');
const legalCount = element<HTMLElement>('#legal-count');

let game = new PhilosophersGame();
let mode: PlayMode = 'strict';
let lastMove: Key[] | undefined;
const history: string[] = [];

const ground: Api = Chessground(boardElement, {
  animation: { enabled: true, duration: 180 },
  coordinates: true,
  draggable: { enabled: true, showGhost: true },
  movable: {
    color: 'white',
    dests: destinationsForMode(game.position, mode),
    events: { after: (from, to) => handleMove(from, to) },
    free: false,
    rookCastle: false,
    showDests: true,
  },
  premovable: { enabled: false },
  selectable: { enabled: true },
});

const dangerClasses = (danger: PieceDanger[]): SquareClasses =>
  new Map(danger.map(piece => [piece.squareName, 'danger-square']));

const strikeDots = (strikes: number): string =>
  Array.from({ length: game.strikeLimit }, (_, index) => (index < strikes ? '×' : '●')).join(' ');

const setMessage = (text: string, tone: 'neutral' | 'success' | 'error' = 'neutral'): void => {
  message.textContent = text;
  message.className = `message ${tone}`;
};

const renderDanger = (danger: PieceDanger[]): void => {
  dangerCount.textContent = String(danger.length);
  dangerList.replaceChildren();
  if (danger.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Every piece is presently protected.';
    dangerList.append(empty);
    return;
  }

  for (const item of danger) {
    const row = document.createElement('div');
    row.className = 'danger-item';
    const title = document.createElement('strong');
    title.textContent = `${item.piece.role} on ${item.squareName}`;
    const detail = document.createElement('span');
    detail.textContent = `${item.attackerCount} attacker${item.attackerCount === 1 ? '' : 's'} against ${item.supporterCount} supporter${item.supporterCount === 1 ? '' : 's'}`;
    row.append(title, detail);
    dangerList.append(row);
  }
};

const renderHistory = (): void => {
  moveList.replaceChildren();
  for (const san of history) {
    const item = document.createElement('li');
    const move = document.createElement('strong');
    move.textContent = san;
    item.append(move);
    moveList.append(item);
  }
};

const render = (): void => {
  const danger = dangerReport(game.position, game.position.turn);
  const moves = analyzeMoves(game.position);
  const allowedMoves = moves.filter(move => move.legal);
  const destinations = destinationsForMode(game.position, mode);
  const modeIsStrict = mode === 'strict';

  ground.set({
    check: game.position.isCheck() ? game.position.turn : false,
    fen: makeBoardFen(game.position.board),
    highlight: { custom: dangerClasses(danger), lastMove: true },
    lastMove,
    movable: {
      color: game.outcome ? undefined : game.position.turn,
      dests: game.outcome ? new Map() : destinations,
    },
    turnColor: game.position.turn,
  });

  turnLabel.textContent = game.outcome
    ? game.outcome.winner
      ? `${game.outcome.winner} wins`
      : 'Draw'
    : `${game.position.turn[0].toUpperCase()}${game.position.turn.slice(1)} to move`;
  turnMarker.classList.toggle('black', game.position.turn === 'black');
  legalCount.textContent = `${allowedMoves.length} moral move${allowedMoves.length === 1 ? '' : 's'}`;

  modeTitle.textContent = modeIsStrict ? 'Strict movement' : 'Three strikes';
  modeCopy.textContent = modeIsStrict
    ? 'The board only offers destinations that satisfy the moral rules. Illegal orders cannot be given.'
    : 'Ordinary chess destinations remain available. A moral violation is rejected and earns a strike.';
  strikesPanel.hidden = modeIsStrict;
  whiteStrikes.textContent = strikeDots(game.strikes.white);
  blackStrikes.textContent = strikeDots(game.strikes.black);
  renderDanger(danger);
  renderHistory();
};

function handleMove(from: Key, to: Key): void {
  const result = attemptBoardMove(game, from, to);
  if (result.accepted) {
    lastMove = [from, to];
    if (result.san) history.push(result.san);
    setMessage(`Order accepted: ${result.san}.`, 'success');
  } else if (result.outcome?.reason === 'strikeout') {
    setMessage(`${result.mover} receives a third strike and loses command.`, 'error');
  } else {
    setMessage(
      `Order refused: ${result.reason.replaceAll('-', ' ')}. Strike ${result.strikes}/${game.strikeLimit}.`,
      'error',
    );
  }
  render();
}

modeSelect.addEventListener('change', () => {
  mode = modeSelect.value as PlayMode;
  setMessage(
    mode === 'strict'
      ? 'Strict movement enabled. Only morally legal destinations are shown.'
      : 'Three-strike mode enabled. Moral violations may be attempted but will be refused.',
  );
  render();
});

element<HTMLButtonElement>('#reset').addEventListener('click', () => {
  game = new PhilosophersGame();
  lastMove = undefined;
  history.length = 0;
  setMessage('A new game begins. White has command.', 'neutral');
  render();
});

element<HTMLButtonElement>('#flip').addEventListener('click', () => ground.toggleOrientation());

render();
