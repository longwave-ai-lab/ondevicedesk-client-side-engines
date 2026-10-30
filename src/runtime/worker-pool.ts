export interface WorkerTask<TInput, TOutput> {
  id: string;
  data: TInput;
  transferables?: Transferable[];
  resolve: (value: TOutput) => void;
  reject: (reason?: unknown) => void;
}

export interface WorkerPoolOptions {
  maxWorkers?: number;
  workerFactory?: (url: string) => Worker;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private busy: boolean[] = [];
  private queue: Array<WorkerTask<any, any>> = [];
  private workerScriptUrl: string;
  private maxWorkers: number;
  private workerFactory?: (url: string) => Worker;
  private _isDestroyed: boolean = false;

  constructor(workerScriptUrl: string, optionsOrMaxWorkers?: number | WorkerPoolOptions) {
    this.workerScriptUrl = workerScriptUrl;

    let maxWorkers: number | undefined;
    if (typeof optionsOrMaxWorkers === 'number') {
      maxWorkers = optionsOrMaxWorkers;
    } else if (optionsOrMaxWorkers && typeof optionsOrMaxWorkers === 'object') {
      maxWorkers = optionsOrMaxWorkers.maxWorkers;
      this.workerFactory = optionsOrMaxWorkers.workerFactory;
    }

    const defaultWorkers = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? Math.min(navigator.hardwareConcurrency, 4)
      : 2;

    this.maxWorkers = maxWorkers && maxWorkers > 0 ? maxWorkers : defaultWorkers;
  }

  public get size(): number {
    return this.workers.length;
  }

  public get maxWorkersCount(): number {
    return this.maxWorkers;
  }

  public get activeWorkersCount(): number {
    return this.busy.filter(Boolean).length;
  }

  public get queueLength(): number {
    return this.queue.length;
  }

  public get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  private initWorker(): number {
    if (this._isDestroyed) {
      throw new Error('WorkerPool is destroyed');
    }

    let worker: Worker;
    if (this.workerFactory) {
      worker = this.workerFactory(this.workerScriptUrl);
    } else {
      if (typeof Worker === 'undefined') {
        throw new Error('Web Workers are not supported in this environment');
      }
      worker = new Worker(this.workerScriptUrl, { type: 'module' });
    }

    const workerIndex = this.workers.length;
    this.workers.push(worker);
    this.busy.push(false);
    return workerIndex;
  }

  public async exec<TInput, TOutput>(data: TInput, transferables?: Transferable[]): Promise<TOutput> {
    if (this._isDestroyed) {
      return Promise.reject(new Error('WorkerPool has been destroyed'));
    }

    return new Promise<TOutput>((resolve, reject) => {
      const task: WorkerTask<TInput, TOutput> = {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        data,
        transferables,
        resolve,
        reject,
      };

      this.dispatch(task);
    });
  }

  private dispatch<TInput, TOutput>(task: WorkerTask<TInput, TOutput>): void {
    if (this._isDestroyed) {
      task.reject(new Error('WorkerPool has been destroyed'));
      return;
    }

    let workerIdx = this.busy.findIndex((b) => !b);

    if (workerIdx === -1 && this.workers.length < this.maxWorkers) {
      try {
        workerIdx = this.initWorker();
      } catch (err) {
        task.reject(err);
        return;
      }
    }

    if (workerIdx !== -1) {
      this.busy[workerIdx] = true;
      const worker = this.workers[workerIdx];

      const handler = (e: MessageEvent) => {
        if (e.data?.id === task.id) {
          worker.removeEventListener('message', handler);
          worker.removeEventListener('error', errHandler);
          this.busy[workerIdx] = false;
          if (e.data.error) {
            task.reject(new Error(typeof e.data.error === 'string' ? e.data.error : e.data.error.message || 'Worker error'));
          } else {
            const result = e.data.result !== undefined ? e.data.result : (e.data.data !== undefined ? e.data.data : e.data);
            task.resolve(result);
          }
          this.processNext();
        }
      };

      const errHandler = (err: ErrorEvent | any) => {
        worker.removeEventListener('message', handler);
        worker.removeEventListener('error', errHandler);
        this.busy[workerIdx] = false;
        task.reject(err instanceof Error ? err : new Error(err?.message || 'Worker execution error'));
        this.processNext();
      };

      worker.addEventListener('message', handler);
      worker.addEventListener('error', errHandler);

      const msg = typeof task.data === 'object' && task.data !== null && !(task.data instanceof ArrayBuffer) && !ArrayBuffer.isView(task.data)
        ? { id: task.id, ...task.data, payload: task.data }
        : { id: task.id, data: task.data, payload: task.data };

      if (task.transferables && task.transferables.length > 0) {
        worker.postMessage(msg, task.transferables);
      } else {
        worker.postMessage(msg);
      }
    } else {
      this.queue.push(task);
    }
  }

  private processNext(): void {
    if (this._isDestroyed) return;

    if (this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        this.dispatch(nextTask);
      }
    }
  }

  public destroy(): void {
    this._isDestroyed = true;

    for (const worker of this.workers) {
      try {
        worker.terminate();
      } catch {
        // Ignore termination errors on clean teardown
      }
    }

    // Cancel all remaining queued tasks with an explicit rejection
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        task.reject(new Error('WorkerPool was destroyed before task could be executed'));
      }
    }

    this.workers = [];
    this.busy = [];
    this.queue = [];
  }
}
