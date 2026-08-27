import type StockfishWeb from '@lichess-org/stockfish-web';

export type StockfishStatus = 'idle' | 'loading' | 'ready' | 'thinking' | 'error';

export interface StockfishRequest {
  fen: string;
  moves: string[];
  moveTime: number;
  skill: number;
}

interface StockfishFactoryOptions {
  wasmMemory: WebAssembly.Memory;
  locateFile(path: string): string;
  mainScriptUrlOrBlob: string;
}

type StockfishFactory = (options: StockfishFactoryOptions) => Promise<StockfishWeb>;

interface LineWaiter {
  accept(line: string): boolean;
  resolve(line: string): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

export class StockfishClient {
  private module?: StockfishWeb;
  private loading?: Promise<void>;
  private queue: Promise<void> = Promise.resolve();
  private readonly waiters = new Set<LineWaiter>();
  private searching = false;

  constructor(private readonly onStatus: (status: StockfishStatus, detail?: string) => void) {}

  bestMove(request: StockfishRequest): Promise<string> {
    if (request.moves.length === 0) return Promise.reject(new Error('Stockfish has no moral move'));
    if (request.moves.length === 1) return Promise.resolve(request.moves[0]);

    const result = this.queue.then(() => this.runSearch(request));
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  stop(): void {
    if (this.searching) this.module?.uci('stop');
  }

  destroy(): void {
    this.stop();
    this.module?.uci('quit');
    this.module = undefined;
    this.failWaiters(new Error('Stockfish was stopped'));
  }

  private async runSearch(request: StockfishRequest): Promise<string> {
    await this.load();
    const module = this.module!;
    module.uci(`setoption name Skill Level value ${request.skill}`);
    module.uci('setoption name MultiPV value 1');
    const ready = this.waitFor(line => line === 'readyok');
    module.uci('isready');
    await ready;

    module.uci(`position fen ${request.fen}`);
    const bestMove = this.waitFor(line => line.startsWith('bestmove '), request.moveTime + 15_000);
    this.searching = true;
    this.onStatus('thinking');
    module.uci(`go movetime ${request.moveTime} searchmoves ${request.moves.join(' ')}`);
    try {
      const response = await bestMove;
      const move = response.split(/\s+/)[1];
      if (!move || move === '(none)') throw new Error('Stockfish returned no move');
      this.onStatus('ready');
      return move;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.onStatus('error', failure.message);
      throw failure;
    } finally {
      this.searching = false;
    }
  }

  private load(): Promise<void> {
    this.loading ??= this.boot();
    return this.loading;
  }

  private async boot(): Promise<void> {
    this.onStatus('loading');
    try {
      if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
        throw new Error('Stockfish requires a cross-origin-isolated page with shared memory enabled');
      }

      const scriptUrl = new URL('./engine/fsf_14.js', document.baseURI).href;
      const imported = (await import(scriptUrl)) as { default: StockfishFactory };
      const module = await imported.default({
        wasmMemory: new WebAssembly.Memory({ shared: true, initial: 1024, maximum: 32_767 }),
        locateFile: path => new URL(`./engine/${path}`, document.baseURI).href,
        mainScriptUrlOrBlob: scriptUrl,
      });
      module.listen = data => this.receive(data);
      module.onError = message => this.handleError(new Error(message));
      this.module = module;

      const initialized = this.waitFor(line => line === 'uciok');
      module.uci('uci');
      await initialized;
      module.uci('setoption name UCI_Variant value chess');
      module.uci('setoption name Threads value 1');
      module.uci('setoption name Hash value 16');
      const ready = this.waitFor(line => line === 'readyok');
      module.uci('isready');
      await ready;
      this.onStatus('ready');
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.handleError(failure);
      throw failure;
    }
  }

  private waitFor(accept: (line: string) => boolean, timeoutMs = 15_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const waiter: LineWaiter = {
        accept,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error('Stockfish did not respond in time'));
        }, timeoutMs),
      };
      this.waiters.add(waiter);
    });
  }

  private receive(data: string): void {
    for (const line of data.split(/\r?\n/).map(part => part.trim())) {
      if (!line) continue;
      for (const waiter of this.waiters) {
        if (!waiter.accept(line)) continue;
        clearTimeout(waiter.timeout);
        this.waiters.delete(waiter);
        waiter.resolve(line);
        break;
      }
    }
  }

  private handleError(error: Error): void {
    this.onStatus('error', error.message);
    this.failWaiters(error);
  }

  private failWaiters(error: Error): void {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    this.waiters.clear();
  }
}
