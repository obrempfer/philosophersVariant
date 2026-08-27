interface SearchResponse {
  id: number;
  uci?: string;
  depth?: number;
  nodes?: number;
  error?: string;
}

export interface PhilosopherResult {
  uci: string;
  depth: number;
  nodes: number;
}

interface PendingSearch {
  resolve(result: PhilosopherResult): void;
  reject(error: Error): void;
}

export class PhilosopherClient {
  private worker?: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, PendingSearch>();

  choose(fen: string, level: number): Promise<PhilosopherResult> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, fen, level });
    });
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const pending of this.pending.values()) pending.reject(new Error('Philosopher search cancelled'));
    this.pending.clear();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./philosopherWorker.js', document.baseURI), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<SearchResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.error) pending.reject(new Error(response.error));
      else if (!response.uci) pending.reject(new Error('Philosopher Engine returned no move'));
      else pending.resolve({ uci: response.uci, depth: response.depth ?? 0, nodes: response.nodes ?? 0 });
    });
    worker.addEventListener('error', event => {
      const error = new Error(event.message || 'Philosopher Engine worker failed');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      worker.terminate();
      this.worker = undefined;
    });
    this.worker = worker;
    return worker;
  }
}
