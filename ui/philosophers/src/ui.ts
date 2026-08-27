import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key, SquareClasses } from '@lichess-org/chessground/types';
import { makeBoardFen, makeFen } from 'chessops/fen';
import type { Color } from 'chessops/types';

import { botDifficulty, botName, moralMoves, type BotKind } from './bot';
import { PhilosophersGame } from './game';
import { PhilosopherClient } from './philosopherClient';
import { analyzeMoves, dangerReport, type PieceDanger } from './rules';
import { StockfishClient, type StockfishStatus } from './stockfish';

import './styles.css';
import { attemptBoardMove, destinationsForMode, moveToBoardKeys, type PlayMode } from './uiModel';

const element = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing UI element: ${selector}`);
  return found;
};

const boardElement = element<HTMLDivElement>('#board');
const modeSelect = element<HTMLSelectElement>('#mode');
const opponentSelect = element<HTMLSelectElement>('#opponent');
const humanColorSelect = element<HTMLSelectElement>('#human-color');
const botLevelSelect = element<HTMLSelectElement>('#bot-level');
const botStatus = element<HTMLElement>('#bot-status');
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
let botKind: BotKind | undefined;
let humanColor: Color = 'white';
let botThinking = false;
let botGeneration = 0;
let stockfishStatus: StockfishStatus = 'idle';
let stockfishDetail: string | undefined;
let lastMove: Key[] | undefined;
const history: string[] = [];
const philosopher = new PhilosopherClient();
const stockfish = new StockfishClient((status, detail) => {
  stockfishStatus = status;
  stockfishDetail = detail;
  renderBotStatus();
});

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

const isHumanTurn = (): boolean =>
  !game.outcome && !botThinking && (!botKind || game.position.turn === humanColor);

function renderBotStatus(): void {
  humanColorSelect.disabled = !botKind;
  botLevelSelect.disabled = !botKind;
  if (!botKind) {
    botStatus.textContent = 'Local two-player';
    return;
  }
  if (botThinking) {
    botStatus.textContent = `${botName(botKind)} · thinking`;
    return;
  }
  if (botKind === 'philosopher') {
    botStatus.textContent = 'Philosopher Engine · ready';
    return;
  }
  const labels: Record<StockfishStatus, string> = {
    error: stockfishDetail ?? 'error',
    idle: 'loads on first move',
    loading: 'loading engine',
    ready: 'ready',
    thinking: 'thinking',
  };
  botStatus.textContent = `Constrained Stockfish · ${labels[stockfishStatus]}`;
}

const describeExposure = (danger: PieceDanger[]): string =>
  danger
    .map(item => {
      const sequence = item.captureSequence.map(from => `${from}×${item.squareName}`).join(' → ');
      return `${item.piece.role} on ${item.squareName} would face ${sequence}`;
    })
    .join('; ');

const renderDanger = (danger: PieceDanger[]): void => {
  dangerCount.textContent = String(danger.length);
  dangerList.replaceChildren();
  if (danger.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No piece is geometrically exposed.';
    dangerList.append(empty);
    return;
  }

  for (const item of danger) {
    const row = document.createElement('div');
    row.className = 'danger-item';
    const title = document.createElement('strong');
    title.textContent = `${item.piece.role} on ${item.squareName}`;
    const detail = document.createElement('span');
    const exchange = item.captureSequence.map(from => `${from}×${item.squareName}`).join(', ');
    detail.textContent = `Safe capture: ${exchange}. ${item.attackerCount} immediate attacker${item.attackerCount === 1 ? '' : 's'}, ${item.supporterCount} immediate defender${item.supporterCount === 1 ? '' : 's'}.`;
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
  const humanMayMove = isHumanTurn();

  ground.set({
    check: game.position.isCheck() ? game.position.turn : false,
    fen: makeBoardFen(game.position.board),
    highlight: { custom: dangerClasses(danger), lastMove: true },
    lastMove,
    movable: {
      color: humanMayMove ? game.position.turn : undefined,
      dests: humanMayMove ? destinations : new Map(),
    },
    turnColor: game.position.turn,
  });

  turnLabel.textContent =
    botThinking && botKind
      ? `${botName(botKind)} is thinking…`
      : game.outcome
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
  renderBotStatus();
  renderDanger(danger);
  renderHistory();
};

const cancelBotSearch = (): void => {
  botGeneration++;
  botThinking = false;
  stockfish.stop();
  philosopher.stop();
};

const maybePlayBot = async (): Promise<void> => {
  if (!botKind || botThinking || game.outcome || game.position.turn === humanColor) return;

  const generation = ++botGeneration;
  const activeBot = botKind;
  const difficulty = botDifficulty(Number(botLevelSelect.value));
  const position = game.position.clone();
  botThinking = true;
  setMessage(`${botName(activeBot)} is considering its duty of care…`);
  render();

  try {
    await new Promise(resolve => setTimeout(resolve, 180));
    let uci: string;
    let searchDetail = `level ${difficulty.level}`;
    if (activeBot === 'stockfish') {
      const moves = moralMoves(position).map(candidate => candidate.uci);
      uci = await stockfish.bestMove({
        fen: makeFen(position.toSetup()),
        moves,
        moveTime: difficulty.stockfishMoveTime,
        skill: difficulty.stockfishSkill,
      });
    } else {
      const choice = await philosopher.choose(makeFen(position.toSetup()), difficulty.level);
      uci = choice.uci;
      searchDetail = `depth ${choice.depth || 1}, ${choice.nodes} nodes`;
    }

    if (generation !== botGeneration || game.outcome) return;
    const result = game.attemptText(uci);
    if (!result.accepted || !result.assessment || !result.san) {
      throw new Error(`${botName(activeBot)} selected a prohibited move: ${uci}`);
    }

    lastMove = moveToBoardKeys(position, result.assessment.move);
    history.push(result.san);
    botThinking = false;
    setMessage(`${botName(activeBot)} plays ${result.san} (${searchDetail}).`, 'success');
    render();
  } catch (error) {
    if (generation !== botGeneration) return;
    botThinking = false;
    const detail = error instanceof Error ? error.message : String(error);
    setMessage(`Bot error: ${detail}`, 'error');
    render();
  }
};

function handleMove(from: Key, to: Key): void {
  if (!isHumanTurn()) return;
  const result = attemptBoardMove(game, from, to);
  if (result.accepted) {
    lastMove = [from, to];
    if (result.san) history.push(result.san);
    setMessage(
      result.reason === 'legal-actionable-safety'
        ? `Moral intermezzo accepted: ${result.san}. The opponent has no permitted capture before answering the new duty.`
        : `Order accepted: ${result.san}.`,
      'success',
    );
  } else if (result.outcome?.reason === 'strikeout') {
    setMessage(`${result.mover} receives a third strike and loses command.`, 'error');
  } else {
    const exposure = result.assessment?.afterDanger;
    const actionable = result.assessment?.actionableDanger;
    const detail =
      result.reason === 'actionable-safety-required' && actionable?.length
        ? ` Permitted replies can capture ${actionable.join(' and ')}.`
        : exposure?.length
          ? ` ${describeExposure(exposure)}.`
          : '';
    setMessage(
      `Order refused: ${result.reason.replaceAll('-', ' ')}.${detail} Strike ${result.strikes}/${game.strikeLimit}.`,
      'error',
    );
  }
  render();
  if (result.accepted) void maybePlayBot();
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

const configureOpponent = (): void => {
  cancelBotSearch();
  botKind = opponentSelect.value === 'human' ? undefined : (opponentSelect.value as BotKind);
  humanColor = humanColorSelect.value as Color;
  ground.set({ orientation: botKind ? humanColor : 'white' });
  setMessage(
    botKind
      ? `${botName(botKind)} joins as ${humanColor === 'white' ? 'Black' : 'White'}.`
      : 'Local two-player game enabled.',
  );
  render();
  void maybePlayBot();
};

opponentSelect.addEventListener('change', configureOpponent);
humanColorSelect.addEventListener('change', configureOpponent);
botLevelSelect.addEventListener('change', () => {
  cancelBotSearch();
  const difficulty = botDifficulty(Number(botLevelSelect.value));
  setMessage(`${botName(botKind ?? 'stockfish')} set to ${difficulty.label}.`);
  render();
  void maybePlayBot();
});

element<HTMLButtonElement>('#reset').addEventListener('click', () => {
  cancelBotSearch();
  game = new PhilosophersGame();
  lastMove = undefined;
  history.length = 0;
  ground.set({ orientation: botKind ? humanColor : 'white' });
  setMessage('A new game begins. White has command.', 'neutral');
  render();
  void maybePlayBot();
});

element<HTMLButtonElement>('#flip').addEventListener('click', () => ground.toggleOrientation());

window.addEventListener('beforeunload', () => {
  stockfish.destroy();
  philosopher.stop();
});

render();
