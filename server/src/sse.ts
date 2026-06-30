/* Minimal Server-Sent Events writer over Fastify's raw response. Each frame is
 * `event: <name>` + `data: <json>` + blank line. A heartbeat comment keeps
 * intermediaries from closing the idle connection. */

import type { FastifyReply } from 'fastify';
import type { ReportEvent } from '../../api/types.ts';

export interface SseChannel {
  /** `id` becomes the SSE `id:` field, which the browser echoes as Last-Event-ID. */
  send(event: ReportEvent, id?: number): void;
  comment(text: string): void;
  close(): void;
  readonly closed: boolean;
}

export function openSse(reply: FastifyReply): SseChannel {
  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });
  raw.write(': open\n\n');

  let closed = false;
  raw.on('close', () => {
    closed = true;
  });

  return {
    get closed() {
      return closed;
    },
    send(event: ReportEvent, id?: number) {
      if (closed) return;
      if (id !== undefined) raw.write(`id: ${id}\n`);
      raw.write(`event: ${event.event}\n`);
      raw.write(`data: ${JSON.stringify(event.data)}\n\n`);
    },
    comment(text: string) {
      if (!closed) raw.write(`: ${text}\n\n`);
    },
    close() {
      if (!closed) {
        closed = true;
        raw.end();
      }
    },
  };
}

export const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
