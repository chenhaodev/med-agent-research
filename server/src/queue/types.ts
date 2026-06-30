/* Job queue contract. The gateway enqueues report-generation jobs; a worker pool
 * processes them with bounded concurrency. The in-memory driver is the default
 * (offline, tested); a Redis/BullMQ driver implements the same interface for
 * multi-process scale. Adding a driver = implement JobQueue, register it. */

export interface Job<T = unknown> {
  readonly id: string;
  readonly name: string;
  readonly data: T;
  /** 1 on first run, incremented on each retry. */
  readonly attempts: number;
}

export type JobHandler<T = unknown> = (job: Job<T>) => Promise<void>;

export interface EnqueueOptions {
  /** Stable id for idempotency: enqueuing the same jobId again is a no-op. */
  jobId?: string;
  /** Delay before the job becomes runnable. */
  delayMs?: number;
  /** Total attempts before the job is marked failed (default from config). */
  maxAttempts?: number;
}

export interface EnqueueResult {
  jobId: string;
  /** True when an existing job with the same jobId was found (idempotent replay). */
  deduped: boolean;
}

export interface QueueStats {
  enqueued: number;
  completed: number;
  failed: number;
  retried: number;
  pending: number;
  running: number;
}

export interface JobQueue {
  /** Register a handler + per-name concurrency. Call once at startup. */
  process<T>(name: string, handler: JobHandler<T>, concurrency: number): void;
  /** Enqueue a job; returns its id and whether it was deduped. */
  enqueue<T>(name: string, data: T, opts?: EnqueueOptions): EnqueueResult;
  stats(): QueueStats;
  close(): Promise<void>;
}
