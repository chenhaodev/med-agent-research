/* Weekly recompute scheduler — keeps `cadence: weekly` reports fresh.
 *
 * On each tick it finds completed weekly reports older than the cadence and
 * re-enqueues them at the next version. Re-enqueuing flips the report to
 * `queued`, so it won't be picked again until it completes — no double-trigger.
 * The pure `dueReports` selector is unit-tested; the timer is opt-in. */

import type { SynthesisReport } from '../../api/types.ts';
import { config } from './config.ts';
import { store } from './store.ts';
import { enqueueRecompute } from './jobs.ts';

export function dueReports(
  reports: Iterable<SynthesisReport>,
  now: number,
  weeklyMs: number,
): SynthesisReport[] {
  return [...reports].filter(
    (r) =>
      r.cadence === 'weekly' &&
      r.status === 'complete' &&
      now - Date.parse(r.updatedAt) >= weeklyMs,
  );
}

export class Scheduler {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly weeklyMs: number = config.weeklyCadenceMs,
    private readonly tickMs: number = config.schedulerTickMs,
    private readonly recompute: (reportId: string) => void = (id) => {
      enqueueRecompute(id);
    },
    private readonly reportsSource: () => Iterable<SynthesisReport> = () =>
      store.reports.values(),
  ) {}

  /** Trigger recompute for every due report; returns how many fired. */
  tick(now = Date.now()): number {
    const due = dueReports(this.reportsSource(), now, this.weeklyMs);
    for (const report of due) this.recompute(report.id);
    return due.length;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

export const scheduler = new Scheduler();
