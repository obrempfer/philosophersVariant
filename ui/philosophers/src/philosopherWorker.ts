import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';

import { botDifficulty } from './bot';
import { choosePhilosopherMove } from './philosopher';
import { moveToUci } from './uiModel';

interface SearchRequest {
  id: number;
  fen: string;
  level: number;
}

interface SearchResponse {
  id: number;
  uci?: string;
  depth?: number;
  nodes?: number;
  error?: string;
}

self.addEventListener('message', (event: MessageEvent<SearchRequest>) => {
  const { id, fen, level } = event.data;
  try {
    const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
    const choice = choosePhilosopherMove(position, botDifficulty(level));
    const response: SearchResponse = {
      id,
      uci: moveToUci(position, choice.move),
      depth: choice.depth,
      nodes: choice.nodes,
    };
    self.postMessage(response);
  } catch (error) {
    const response: SearchResponse = { id, error: error instanceof Error ? error.message : String(error) };
    self.postMessage(response);
  }
});
