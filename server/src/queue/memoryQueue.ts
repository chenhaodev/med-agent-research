/* In-memory job queue + bounded worker pool.
 *
 * A real queue, just not distributed: per-name concurrency, exponential-backoff
 * retries, and idempotent jobIds. The default driver — keeps the server runnable
 * and tested with no external infra. Swap in the Redis driver for multi-process. */

import { makeId } from '../ids.ts';
import type {
  EnqueueOptions,
  EnqueueResult,
  Job,
  JobHandler,
  JobQueue,
  QueueStats,
} from './types.ts';

interface Registration {
  handler: JobHandler<unknown>;
  concurrency: number;
  running: number;
}

interface InternalJob extends Job<unknown> {
  attempts: number;
  maxAttempts: number;
}

export interface MemoryQueueOptions {
  defaultMaxAttempts?: number;
  /** Base backoff (ms); attempt N waits baseBackoffMs * N. */
  baseBackoffMs?: number;
}

export class MemoryQueue implements JobQueue {
  private readonly registrations = new Map<string, Registration>();
  private readonly pending: InternalJob[] = [];
  private readonly seen = new Set<string>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private closed = false;
  private readonly counters = { enqueued: 0, completed: 0, failed: 0, retried: 0 };
  private readonly defaultMaxAttempts: number;
  private readonly baseBackoffMs: number;

  constructor(opts: MemoryQueueOptions = {}) {
    this.defaultMaxAttempts = opts.defaultMaxAttempts ?? 3;
    this.baseBackoffMs = opts.baseBackoffMs ?? 200;
  }

  process<T>(name: string, handler: JobHandler<T>, concurrency: number): void {
    this.registrations.set(name, {
      handler: handler as JobHandler<unknown>,
      concurrency: Math.max(1, concurrency),
      running: 0,
    });
    this.pump();
  }

  enqueue<T>(name: string, data: T, opts: EnqueueOptions = {}): EnqueueResult {
    const jobId = opts.jobId ?? makeId('job');
    if (this.seen.has(jobId)) return { jobId, deduped: true };
    this.seen.add(jobId);

    const job: InternalJob = {
      id: jobId,
      name,
      data,
      attempts: 0,
      maxAttempts: opts.maxAttempts ?? this.defaultMaxAttempts,
    };
    this.schedule(job, opts.delayMs);
    return { jobId, deduped: false };
  }

  stats(): QueueStats {
    let running = 0;
    for (const reg of this.registrations.values()) running += reg.running;
    return { ...this.counters, pending: this.pending.length, running };
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private schedule(job: InternalJob, delayMs?: number): void {
    const push = () => {
      if (this.closed) return;
      this.pending.push(job);
      this.counters.enqueued += 1;
      this.pump();
    };
    if (delayMs && delayMs > 0) {
      const t = setTimeout(() => {
        this.timers.delete(t);
        push();
      }, delayMs);
      if (typeof t.unref === 'function') t.unref();
      this.timers.add(t);
    } else {
      push();
    }
  }

  /** Dispatch pending jobs to free workers, respecting per-name concurrency. */
  private pump(): void {
    if (this.closed) return;
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (let i = 0; i < this.pending.length; i += 1) {
        const job = this.pending[i];
        const reg = this.registrations.get(job.name);
        if (!reg || reg.running >= reg.concurrency) continue;
        this.pending.splice(i, 1);
        this.run(reg, job);
        progressed = true;
        break; // restart scan; indices shifted
      }
    }
  }

  private run(reg: Registration, job: InternalJob): void {
    reg.running += 1;
    const attempt: InternalJob = { ...job, attempts: job.attempts + 1 };
    Promise.resolve()
      .then(() => reg.handler(attempt))
      .then(() => {
        this.counters.completed += 1;
      })
      .catch(() => {
        if (attempt.attempts < attempt.maxAttempts) {
          this.counters.retried += 1;
          this.schedule(attempt, this.baseBackoffMs * attempt.attempts);
        } else {
          this.counters.failed += 1;
        }
      })
      .finally(() => {
        reg.running -= 1;
        this.pump();
      });
  }
}
