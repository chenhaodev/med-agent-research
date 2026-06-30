/* Report generation jobs. POST /reports enqueues a job; the worker pool runs the
 * generator (Brain or fixture), folding each event into the stored report and
 * publishing it to the hub for SSE subscribers. Replaces the old in-memory timer:
 * generation is now queued (bounded concurrency, retries) and delivery is via the
 * pub/sub hub (multi-subscriber, Last-Event-ID reconnection). */

import type { ReportEvent, SynthesisReport } from '../../api/types.ts';
import { config } from './config.ts';
import { store } from './store.ts';
import { hub } from './hub.ts';
import { queue } from './queue/registry.ts';
import type { EnqueueResult, Job } from './queue/types.ts';
import { buildReport } from './pipeline/report.ts';
import { buildEventSequence } from './pipeline/stream.ts';
import { runBrain } from './brain.ts';
import { delay } from './sse.ts';
import { nowIso } from './ids.ts';

const REPORT_JOB = 'report';

/** Fold one event into the stored report, returning the updated copy. */
function applyEvent(report: SynthesisReport, event: ReportEvent): SynthesisReport {
  switch (event.event) {
    case 'status':
      return {
        ...report,
        status: event.data.phase === 'complete' ? 'complete' : 'running',
        updatedAt: nowIso(),
      };
    case 'funnel':
      return { ...report, funnel: { stages: event.data.stages }, updatedAt: nowIso() };
    case 'block':
      return { ...report, blocks: [...report.blocks, event.data.block], updatedAt: nowIso() };
    case 'references':
      return { ...report, references: event.data.added, updatedAt: nowIso() };
    case 'done':
      return { ...event.data.report, updatedAt: nowIso() };
    default:
      return report;
  }
}

/** Apply to the stored report and publish to the hub. Intermediate partials are
 *  ephemeral (cache-only); the durable copy is written at the terminal event.
 *  (The queued shell is persisted at enqueue time — see enqueueReport.) */
function emit(reportId: string, event: ReportEvent): void {
  const current = store.reports.get(reportId);
  if (current) {
    const next = applyEvent(current, event);
    if (event.event === 'done' || event.event === 'error') {
      store.reports.set(reportId, next); // persist the final report
    } else {
      store.reports.cacheOnly(reportId, next); // ephemeral streaming partial
    }
  }
  hub.publish(reportId, event);
}

/** The worker: run generation for one report, emitting its event stream. */
async function processReport(job: Job<{ reportId: string }>): Promise<void> {
  const { reportId } = job.data;
  const shell = store.reports.get(reportId);
  if (!shell) throw new Error(`report ${reportId} not found`);

  // The Brain (Python worker) and the fixture both speak the same event contract.
  if (config.useBrain) {
    await runBrain(reportId, shell.query, (event) => emit(reportId, event));
    return;
  }

  const full = buildReport(reportId, shell.query);
  full.version = shell.version;
  full.cadence = shell.cadence;
  for (const event of buildEventSequence(full)) {
    if (config.streamStepMs > 0) await delay(config.streamStepMs);
    emit(reportId, event);
  }
}

let workerRegistered = false;
/** Register the report worker on the queue. Idempotent; called once at startup. */
export function registerReportWorker(): void {
  if (workerRegistered) return;
  workerRegistered = true;
  queue.process(REPORT_JOB, processReport, config.queueConcurrency);
}

/** Store a queued shell and enqueue its generation job. */
export function enqueueReport(reportId: string, full: SynthesisReport): EnqueueResult {
  const shell: SynthesisReport = {
    ...full,
    status: 'queued',
    blocks: [],
    references: [],
    funnel: { stages: [] },
  };
  store.reports.set(reportId, shell);
  hub.clear(reportId); // fresh event channel for this (re)compute
  return queue.enqueue(REPORT_JOB, { reportId }, { jobId: `${reportId}:v${shell.version}` });
}

/** Re-run generation for an existing report at the next version (weekly recompute). */
export function enqueueRecompute(reportId: string): EnqueueResult | null {
  const existing = store.reports.get(reportId);
  if (!existing) return null;
  const next = buildReport(reportId, existing.query);
  next.version = existing.version + 1;
  next.cadence = existing.cadence;
  return enqueueReport(reportId, next);
}

/** Subscribe to a report's event stream. Replays events after `lastEventId`,
 *  then tails. If the run is unknown but a finished report is stored (e.g. after
 *  a restart), replays a single terminal `done`. `onEvent` receives the event id
 *  so the SSE writer can emit it for reconnection. */
export function subscribeToRun(
  reportId: string,
  onEvent: (event: ReportEvent, id: number) => void,
  onDone: () => void,
  lastEventId = 0,
): () => void {
  if (hub.has(reportId)) {
    return hub.subscribe(reportId, lastEventId, (he) => onEvent(he.event, he.id), onDone);
  }
  const stored = store.reports.get(reportId);
  if (stored && stored.status === 'complete') {
    onEvent({ event: 'done', data: { report: stored } }, lastEventId + 1);
  }
  onDone();
  return () => {};
}
