/* Redis / BullMQ driver — the production queue for multi-process scale.
 *
 * Selected with QUEUE_DRIVER=bullmq + REDIS_URL. bullmq and ioredis are loaded
 * lazily (dynamic import), so they are NOT required for the default memory driver
 * and don't need to be installed for the rest of the server to run or typecheck.
 * Implements the same JobQueue contract as MemoryQueue.
 *
 * Note: this adapter is the documented production seam; CI exercises the
 * MemoryQueue. Enable it with `npm i bullmq ioredis` and a running Redis. */

import { makeId } from '../ids.ts';
import type {
  EnqueueOptions,
  EnqueueResult,
  Job,
  JobHandler,
  JobQueue,
  QueueStats,
} from './types.ts';

// `any` here is deliberate: bullmq's types aren't available unless installed.
/* eslint-disable @typescript-eslint/no-explicit-any */

export class BullMqQueue implements JobQueue {
  private readonly ready: Promise<{ Queue: any; Worker: any; connection: any }>;
  private readonly queues = new Map<string, any>();
  private readonly counters = { enqueued: 0, completed: 0, failed: 0, retried: 0 };

  constructor(
    private readonly url: string,
    private readonly defaultMaxAttempts = 3,
    private readonly prefix = 'corpus',
  ) {
    this.ready = this.load();
    this.ready.catch((err) => {
      // Surface a clear message; the queue is inert until the deps are present.
      process.stderr.write(`[queue] bullmq driver unavailable: ${String(err)}\n`);
    });
  }

  private async load(): Promise<{ Queue: any; Worker: any; connection: any }> {
    const bullmqName = 'bullmq';
    const ioredisName = 'ioredis';
    const bullmq: any = await import(bullmqName);
    const IORedis: any = (await import(ioredisName)).default;
    const connection = new IORedis(this.url, { maxRetriesPerRequest: null });
    return { Queue: bullmq.Queue, Worker: bullmq.Worker, connection };
  }

  private qname(name: string): string {
    return `${this.prefix}:${name}`;
  }

  process<T>(name: string, handler: JobHandler<T>, concurrency: number): void {
    void this.ready.then(({ Worker, connection }) => {
      const worker = new Worker(
        this.qname(name),
        async (bullJob: any) => {
          const job: Job<T> = {
            id: bullJob.id,
            name,
            data: bullJob.data as T,
            attempts: (bullJob.attemptsMade ?? 0) + 1,
          };
          await handler(job);
        },
        { connection, concurrency: Math.max(1, concurrency) },
      );
      worker.on('completed', () => (this.counters.completed += 1));
      worker.on('failed', () => (this.counters.failed += 1));
    });
  }

  enqueue<T>(name: string, data: T, opts: EnqueueOptions = {}): EnqueueResult {
    const jobId = opts.jobId ?? makeId('job');
    void this.ready.then(({ Queue, connection }) => {
      let q = this.queues.get(name);
      if (!q) {
        q = new Queue(this.qname(name), { connection });
        this.queues.set(name, q);
      }
      // bullmq treats a duplicate jobId as a no-op add (our idempotency).
      void q.add(name, data, {
        jobId,
        delay: opts.delayMs,
        attempts: opts.maxAttempts ?? this.defaultMaxAttempts,
        backoff: { type: 'exponential', delay: 200 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
      this.counters.enqueued += 1;
    });
    return { jobId, deduped: false };
  }

  stats(): QueueStats {
    return { ...this.counters, pending: 0, running: 0 };
  }

  async close(): Promise<void> {
    try {
      const { connection } = await this.ready;
      await Promise.all([...this.queues.values()].map((q) => q.close()));
      await connection.quit();
    } catch {
      /* already unavailable */
    }
  }
}
