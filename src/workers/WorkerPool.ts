import type { TileRequestPayload, TileResponsePayload, WorkerJob } from './types';
import { isPerformanceModeActive } from '@/state/performanceMode';
import { useUiStore } from '@/state/uiStore';

export class WorkerPoolManager {
  private workers: Worker[] = [];
  private activeJobs = new Map<Worker, WorkerJob>();
  private jobQueue: WorkerJob[] = [];
  private poolSize: number;
  private isInitialized = false;

  constructor() {
    // Performance Mode: fewer workers = less memory/CPU contention on low-power devices
    const perfCap = useUiStore.getState().performanceMode ? 2 : 8;
    // Performance Mode (older iPads / low-memory devices): 2 workers max to
    // avoid thread-spawn overhead and memory pressure during the startup burst.
    this.poolSize = isPerformanceModeActive() ? 2 : typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? Math.max(2, Math.min(perfCap, navigator.hardwareConcurrency))
      : 2;
  }

  /**
   * Initializes Web Worker threads asynchronously using Vite worker import semantics.
   */
  public init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    for (let i = 0; i < this.poolSize; i++) {
      try {
        const worker = new Worker(
          new URL('./proceduralTileWorker.ts', import.meta.url),
          { type: 'module' }
        );

        worker.onmessage = (e: MessageEvent<TileResponsePayload>) => {
          this.handleWorkerResponse(worker, e.data);
        };

        worker.onerror = (err) => {
          console.error('[WorkerPool] Web Worker runtime error:', err);
          this.handleWorkerError(worker, new Error(err.message || 'Worker execution failed'));
        };

        this.workers.push(worker);
      } catch (err) {
        console.warn(`[WorkerPool] Could not spawn Web Worker ${i + 1}:`, err);
      }
    }

    console.log(`[WorkerPool] Initialized pool with ${this.workers.length} worker threads.`);
  }

  /**
   * Dispatches a 3D Tile generation request to an available worker thread.
   */
  public dispatchTileRequest(payload: TileRequestPayload): Promise<TileResponsePayload> {
    if (!this.isInitialized) {
      this.init();
    }

    return new Promise<TileResponsePayload>((resolve, reject) => {
      const job: WorkerJob = {
        id: payload.tileId,
        payload,
        resolve,
        reject,
      };

      const idleWorker = this.findIdleWorker();
      if (idleWorker) {
        this.runJobOnWorker(idleWorker, job);
      } else {
        this.jobQueue.push(job);
      }
    });
  }

  private findIdleWorker(): Worker | null {
    for (const worker of this.workers) {
      if (!this.activeJobs.has(worker)) {
        return worker;
      }
    }
    return null;
  }

  private runJobOnWorker(worker: Worker, job: WorkerJob): void {
    this.activeJobs.set(worker, job);
    worker.postMessage(job.payload);
  }

  private handleWorkerResponse(worker: Worker, response: TileResponsePayload): void {
    const activeJob = this.activeJobs.get(worker);
    this.activeJobs.delete(worker);

    if (activeJob) {
      if (response.success) {
        activeJob.resolve(response);
      } else {
        activeJob.reject(new Error(response.error || 'Tile generation failed'));
      }
    }

    this.processNextJob(worker);
  }

  private handleWorkerError(worker: Worker, error: Error): void {
    const activeJob = this.activeJobs.get(worker);
    this.activeJobs.delete(worker);

    if (activeJob) {
      activeJob.reject(error);
    }

    this.processNextJob(worker);
  }

  private processNextJob(worker: Worker): void {
    if (this.jobQueue.length > 0) {
      const nextJob = this.jobQueue.shift()!;
      this.runJobOnWorker(worker, nextJob);
    }
  }

  public destroy(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.activeJobs.clear();
    this.jobQueue = [];
    this.isInitialized = false;
  }
}

export const workerPool = new WorkerPoolManager();
