/* Queue driver selection. Default: the in-memory worker pool. Set
 * QUEUE_DRIVER=bullmq (+ REDIS_URL) for the distributed Redis driver. */

import { config } from '../config.ts';
import { BullMqQueue } from './bullmqQueue.ts';
import { MemoryQueue } from './memoryQueue.ts';
import type { JobQueue } from './types.ts';

export function makeQueue(): JobQueue {
  if (config.queueDriver === 'bullmq') {
    return new BullMqQueue(config.redisUrl, config.queueDefaultMaxAttempts);
  }
  return new MemoryQueue({ defaultMaxAttempts: config.queueDefaultMaxAttempts });
}

/** Process-wide queue singleton (like `store`). */
export const queue: JobQueue = makeQueue();
