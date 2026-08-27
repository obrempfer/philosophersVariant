import { board as renderBoard } from 'chessops/debug';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { PhilosophersGame } from './game';
import { analyzeMoves, dangerReport, type PieceDanger } from './rules';

const explainDanger = (danger: PieceDanger): string =>
  `${danger.squareName}: safe capture sequence ${danger.captureSequence.map(from => `${from}x${danger.squareName}`).join(', ')}`;

const printPosition = (game: PhilosophersGame): void => {
  console.log(`\n${renderBoard(game.position.board)}`);
  console.log(
    `${game.position.turn} to move | strikes: White ${game.strikes.white}/${game.strikeLimit}, Black ${game.strikes.black}/${game.strikeLimit}`,
  );
  const danger = dangerReport(game.position, game.position.turn);
  console.log(
    danger.length ? `Current danger: ${danger.map(explainDanger).join('; ')}` : 'Current danger: none',
  );
};

const game = new PhilosophersGame();
const input = createInterface({ input: stdin, output: stdout });
const lines = input[Symbol.asyncIterator]();

console.log("Philosophers' Chess v1");
console.log("Enter SAN (e4, Nf3, O-O) or UCI (e2e4). Commands: 'moves', 'help', 'quit'.");

while (!game.outcome) {
  printPosition(game);
  stdout.write('> ');
  const line = await lines.next();
  if (line.done) break;
  const text = line.value.trim();
  if (!text) continue;
  if (text === 'quit' || text === 'exit') break;
  if (text === 'help') {
    console.log(
      'Choose the best attainable immediate safety. A non-capturing counter-threat is also legal when the opponent has no permitted capturing reply.',
    );
    continue;
  }
  if (text === 'moves') {
    const moves = analyzeMoves(game.position)
      .filter(move => move.legal)
      .map(move => move.san);
    console.log(moves.join(' '));
    continue;
  }

  const result = game.attemptText(text);
  if (result.accepted)
    console.log(
      result.reason === 'legal-actionable-safety'
        ? `Accepted as a moral intermezzo: ${result.san}`
        : `Accepted: ${result.san}`,
    );
  else {
    console.log(
      `Rejected (${result.reason}). Strike ${result.strikes}/${game.strikeLimit} for ${result.mover}.`,
    );
    const resultingDanger = result.assessment?.afterDanger;
    if (resultingDanger?.length)
      console.log(`That move would leave: ${resultingDanger.map(explainDanger).join('; ')}`);
    const actionableDanger = result.assessment?.actionableDanger;
    if (result.reason === 'actionable-safety-required' && actionableDanger?.length)
      console.log(`Permitted replies could capture: ${actionableDanger.join(', ')}`);
  }
}

if (game.outcome) {
  const winner = game.outcome.winner ? `${game.outcome.winner} wins` : 'draw';
  console.log(`Game over: ${winner} by ${game.outcome.reason}.`);
}
input.close();
