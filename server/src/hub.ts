/* Report event hub — pub/sub between the job worker and SSE subscribers.
 *
 * Each report has an append-only event log with monotonically increasing ids.
 * Multiple subscribers can attach; a reconnecting client passes Last-Event-ID and
 * the hub replays only the events it missed, then tails live ones. This decouples
 * generation (one worker) from delivery (N browsers, reconnecting freely). */

import type { ReportEvent } from '../../api/types.ts';

export interface HubEvent {
  /** Monotonic, 1-based id within a report; sent as the SSE `id:` field. */
  id: number;
  event: ReportEvent;
}

type Listener = (e: HubEvent) => void;

interface Channel {
  log: HubEvent[];
  seq: number;
  done: boolean;
  listeners: Set<Listener>;
}

function isTerminal(event: ReportEvent): boolean {
  return event.event === 'done' || event.event === 'error';
}

export class ReportHub {
  private readonly channels = new Map<string, Channel>();

  private channel(reportId: string): Channel {
    let c = this.channels.get(reportId);
    if (!c) {
      c = { log: [], seq: 0, done: false, listeners: new Set() };
      this.channels.set(reportId, c);
    }
    return c;
  }

  has(reportId: string): boolean {
    return this.channels.has(reportId);
  }

  isDone(reportId: string): boolean {
    return this.channels.get(reportId)?.done ?? false;
  }

  /** Append an event, assign it the next id, and notify live subscribers. */
  publish(reportId: string, event: ReportEvent): HubEvent {
    const c = this.channel(reportId);
    const he: HubEvent = { id: (c.seq += 1), event };
    c.log.push(he);
    if (isTerminal(event)) c.done = true;
    for (const listener of c.listeners) listener(he);
    return he;
  }

  /** Subscribe, replaying every event with id > lastEventId, then tailing live
   *  ones. `onDone` fires after a terminal event (done/error). Returns unsubscribe. */
  subscribe(
    reportId: string,
    lastEventId: number,
    onEvent: Listener,
    onDone: () => void,
  ): () => void {
    const c = this.channel(reportId);

    for (const he of c.log) {
      if (he.id > lastEventId) onEvent(he);
    }
    if (c.done) {
      onDone();
      return () => {};
    }

    const wrapped: Listener = (he) => {
      onEvent(he);
      if (isTerminal(he.event)) onDone();
    };
    c.listeners.add(wrapped);
    return () => c.listeners.delete(wrapped);
  }

  /** Drop a channel's log + listeners (e.g. on report delete). */
  clear(reportId: string): void {
    this.channels.delete(reportId);
  }
}

/** Process-wide hub singleton (like `store`). */
export const hub = new ReportHub();
