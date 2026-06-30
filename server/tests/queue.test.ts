import { describe, it, expect } from 'vitest';
import { MemoryQueue } from '../src/queue/memoryQueue.ts';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function until(pred: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('until() timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('MemoryQueue', () => {
  it('runs all jobs and reports completion', async () => {
    const q = new MemoryQueue();
    let done = 0;
    q.process('t', async () => {
      done += 1;
    }, 2);
    for (let i = 0; i < 5; i += 1) q.enqueue('t', { i });
    await until(() => done === 5);
    expect(q.stats().completed).toBe(5);
    expect(q.stats().pending).toBe(0);
  });

  it('respects the per-name concurrency cap', async () => {
    const q = new MemoryQueue();
    const gate = deferred();
    let running = 0;
    let peak = 0;
    q.process('t', async () => {
      running += 1;
      peak = Math.max(peak, running);
      await gate.promise;
      running -= 1;
    }, 2);
    for (let i = 0; i < 6; i += 1) q.enqueue('t', { i });
    await until(() => running === 2); // two start, four queued
    expect(q.stats().running).toBe(2);
    expect(q.stats().pending).toBe(4);
    gate.resolve();
    await until(() => q.stats().completed === 6);
    expect(peak).toBe(2); // never exceeded the cap
  });

  it('dedups by jobId (idempotency)', async () => {
    const q = new MemoryQueue();
    let runs = 0;
    q.process('t', async () => {
      runs += 1;
    }, 1);
    const first = q.enqueue('t', {}, { jobId: 'same' });
    const second = q.enqueue('t', {}, { jobId: 'same' });
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    await until(() => q.stats().completed === 1);
    expect(runs).toBe(1);
  });

  it('retries a failing job with backoff, then succeeds', async () => {
    const q = new MemoryQueue({ baseBackoffMs: 5, defaultMaxAttempts: 3 });
    let attempts = 0;
    q.process('t', async (job) => {
      attempts = job.attempts;
      if (job.attempts < 3) throw new Error('transient');
    }, 1);
    q.enqueue('t', {});
    await until(() => q.stats().completed === 1, 2000);
    expect(attempts).toBe(3);
    expect(q.stats().retried).toBe(2);
    expect(q.stats().failed).toBe(0);
  });

  it('marks a job failed after exhausting attempts', async () => {
    const q = new MemoryQueue({ baseBackoffMs: 2, defaultMaxAttempts: 2 });
    q.process('t', async () => {
      throw new Error('always');
    }, 1);
    q.enqueue('t', {});
    await until(() => q.stats().failed === 1, 2000);
    expect(q.stats().completed).toBe(0);
  });

  it('honors delayMs before a job becomes runnable', async () => {
    const q = new MemoryQueue();
    let ran = false;
    q.process('t', async () => {
      ran = true;
    }, 1);
    q.enqueue('t', {}, { delayMs: 60 });
    expect(ran).toBe(false);
    await until(() => ran, 1000);
    expect(ran).toBe(true);
  });
});
