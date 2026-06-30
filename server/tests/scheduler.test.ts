import { describe, it, expect } from 'vitest';
import { Scheduler, dueReports } from '../src/scheduler.ts';
import type { SynthesisReport } from '../../api/types.ts';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-06-30T00:00:00.000Z');

function report(over: Partial<SynthesisReport>): SynthesisReport {
  return {
    id: 'rep',
    query: { question: 'q', mode: 'keyword', filters: {} },
    status: 'complete',
    version: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    cadence: 'weekly',
    topic: 'q',
    readingTimeMin: 6,
    consensus: { label: 'x', strength: 'moderate' },
    metrics: { contributingStudies: 1, corpusSize: 1 },
    funnel: { stages: [] },
    blocks: [],
    references: [],
    ...over,
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

describe('dueReports', () => {
  it('selects weekly + complete reports past the cadence', () => {
    const old = report({ id: 'old', updatedAt: iso(NOW - WEEK - 1) });
    const due = dueReports([old], NOW, WEEK);
    expect(due.map((r) => r.id)).toEqual(['old']);
  });

  it('excludes fresh, non-weekly, or still-running reports', () => {
    const fresh = report({ id: 'fresh', updatedAt: iso(NOW - 1000) });
    const manual = report({ id: 'manual', cadence: 'manual', updatedAt: iso(NOW - WEEK - 1) });
    const running = report({ id: 'running', status: 'running', updatedAt: iso(NOW - WEEK - 1) });
    const queued = report({ id: 'queued', status: 'queued', updatedAt: iso(NOW - WEEK - 1) });
    const due = dueReports([fresh, manual, running, queued], NOW, WEEK);
    expect(due).toEqual([]);
  });
});

describe('Scheduler.tick', () => {
  it('triggers recompute for each due report and returns the count', () => {
    const reports = [
      report({ id: 'a', updatedAt: iso(NOW - WEEK - 1) }),
      report({ id: 'b', updatedAt: iso(NOW - WEEK - 1) }),
      report({ id: 'fresh', updatedAt: iso(NOW - 1000) }),
    ];
    const triggered: string[] = [];
    const scheduler = new Scheduler(WEEK, 1000, (id) => triggered.push(id), () => reports);
    const count = scheduler.tick(NOW);
    expect(count).toBe(2);
    expect(triggered.sort()).toEqual(['a', 'b']);
  });

  it('does not retrigger a report once it is re-queued', () => {
    // After recompute flips status to "queued", the next tick skips it.
    const r = report({ id: 'a', updatedAt: iso(NOW - WEEK - 1) });
    const triggered: string[] = [];
    const scheduler = new Scheduler(WEEK, 1000, (id) => {
      triggered.push(id);
      r.status = 'queued'; // simulate enqueueReport flipping the shell
    }, () => [r]);
    scheduler.tick(NOW);
    scheduler.tick(NOW);
    expect(triggered).toEqual(['a']); // only once
  });
});
