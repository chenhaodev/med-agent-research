/* Report generation runner. On POST /reports a run is started: it steps through
 * the SSE event sequence on a timer, applying each event to the stored report
 * (so a concurrent GET sees partial state) and broadcasting to subscribers.
 * Each run buffers its events so a late SSE subscriber replays from the start
 * then tails the rest. */

import type { ReportEvent, SynthesisReport } from '../../api/types.ts';
import { config } from './config.ts';
import { store } from './store.ts';
import { buildReport } from './pipeline/report.ts';
import { buildEventSequence } from './pipeline/stream.ts';
import { nowIso } from './ids.ts';

type Subscriber = (event: ReportEvent) => void;

interface ReportRun {
  reportId: string;
  buffer: ReportEvent[];
  done: boolean;
  subscribers: Set<Subscriber>;
}

const runs = new Map<string, ReportRun>();

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

function emit(run: ReportRun, event: ReportEvent): void {
  run.buffer.push(event);
  const current = store.reports.get(run.reportId);
  if (current) store.reports.set(run.reportId, applyEvent(current, event));
  for (const sub of run.subscribers) sub(event);
}

/** Build the report, store a partial shell, and start streaming its events. */
export function startReportRun(reportId: string, report: SynthesisReport): void {
  const full = report;
  const shell: SynthesisReport = {
    ...full,
    status: 'queued',
    blocks: [],
    references: [],
    funnel: { stages: [] },
  };
  store.reports.set(reportId, shell);

  const run: ReportRun = { reportId, buffer: [], done: false, subscribers: new Set() };
  runs.set(reportId, run);

  const sequence = buildEventSequence(full);
  let i = 0;
  const step = () => {
    if (i >= sequence.length) {
      run.done = true;
      return;
    }
    emit(run, sequence[i++]);
    setTimeout(step, config.streamStepMs);
  };
  setTimeout(step, config.streamStepMs);
}

/** Subscribe to a run: replays buffered events, then tails live ones. Returns an
 *  unsubscribe fn. If the run is unknown (e.g. server restarted), rebuilds a
 *  one-shot sequence from the stored report so the stream still completes. */
export function subscribeToRun(
  reportId: string,
  onEvent: Subscriber,
  onDone: () => void,
): () => void {
  const run = runs.get(reportId);

  if (!run) {
    const stored = store.reports.get(reportId);
    if (stored) {
      for (const event of buildEventSequence(buildReport(reportId, stored.query))) onEvent(event);
    }
    onDone();
    return () => {};
  }

  for (const event of run.buffer) onEvent(event);
  if (run.done) {
    onDone();
    return () => {};
  }

  const wrapped: Subscriber = (event) => {
    onEvent(event);
    if (event.event === 'done' || event.event === 'error') onDone();
  };
  run.subscribers.add(wrapped);
  return () => run.subscribers.delete(wrapped);
}
