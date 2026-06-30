import { describe, it, expect } from 'vitest';
import { ReportHub } from '../src/hub.ts';
import type { ReportEvent } from '../../api/types.ts';

const status = (progress: number): ReportEvent => ({
  event: 'status',
  data: { phase: 'screening', progress, message: 'm' },
});
const done = (): ReportEvent => ({ event: 'done', data: { report: { id: 'rep' } as never } });

describe('ReportHub', () => {
  it('assigns monotonic ids and delivers to live subscribers', () => {
    const hub = new ReportHub();
    const got: number[] = [];
    hub.subscribe('rep', 0, (he) => got.push(he.id), () => {});
    expect(hub.publish('rep', status(0.1)).id).toBe(1);
    expect(hub.publish('rep', status(0.2)).id).toBe(2);
    expect(got).toEqual([1, 2]);
  });

  it('replays only events after lastEventId on (re)subscribe', () => {
    const hub = new ReportHub();
    hub.publish('rep', status(0.1)); // id 1
    hub.publish('rep', status(0.2)); // id 2
    hub.publish('rep', status(0.3)); // id 3

    const replayed: number[] = [];
    hub.subscribe('rep', 1, (he) => replayed.push(he.id), () => {});
    expect(replayed).toEqual([2, 3]); // missed events only
  });

  it('fans out to multiple subscribers', () => {
    const hub = new ReportHub();
    const a: number[] = [];
    const b: number[] = [];
    hub.subscribe('rep', 0, (he) => a.push(he.id), () => {});
    hub.subscribe('rep', 0, (he) => b.push(he.id), () => {});
    hub.publish('rep', status(0.5));
    expect(a).toEqual([1]);
    expect(b).toEqual([1]);
  });

  it('calls onDone after a terminal event and on late subscribe', () => {
    const hub = new ReportHub();
    let liveDone = false;
    hub.subscribe('rep', 0, () => {}, () => {
      liveDone = true;
    });
    hub.publish('rep', status(0.9)); // id 1
    hub.publish('rep', done()); // id 2 -> terminal
    expect(liveDone).toBe(true);
    expect(hub.isDone('rep')).toBe(true);

    // A subscriber arriving after completion replays the full log and finishes.
    const replayed: number[] = [];
    let lateDone = false;
    const unsub = hub.subscribe('rep', 0, (he) => replayed.push(he.id), () => {
      lateDone = true;
    });
    expect(replayed).toEqual([1, 2]);
    expect(lateDone).toBe(true);
    unsub(); // no-op for a finished channel
  });

  it('unsubscribe stops further delivery', () => {
    const hub = new ReportHub();
    const got: number[] = [];
    const unsub = hub.subscribe('rep', 0, (he) => got.push(he.id), () => {});
    hub.publish('rep', status(0.1));
    unsub();
    hub.publish('rep', status(0.2));
    expect(got).toEqual([1]);
  });
});
