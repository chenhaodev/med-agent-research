/* Turns a finished report into the ordered SSE event sequence that simulates
 * the synthesis pipeline. The `block` stream is the source of truth for report
 * content; the `funnel` and `meter` events are early preview signals for the
 * progress UI (the same data also appears as blocks, in order). */

import type { ConsensusMeterBlock, ReportEvent, SynthesisReport } from '../../../api/types.ts';

export function buildEventSequence(report: SynthesisReport): ReportEvent[] {
  const events: ReportEvent[] = [];

  const meterBlock = report.blocks.find(
    (b): b is ConsensusMeterBlock => b.type === 'consensusMeter',
  );

  events.push({
    event: 'status',
    data: { phase: 'retrieving', progress: 0.05, message: 'Retrieving candidate records' },
  });
  events.push({ event: 'funnel', data: { stages: report.funnel.stages } });

  events.push({
    event: 'status',
    data: { phase: 'screening', progress: 0.18, message: 'Screening for relevance' },
  });
  if (meterBlock) {
    events.push({
      event: 'meter',
      data: {
        question: meterBlock.question,
        n: meterBlock.n,
        buckets: meterBlock.buckets.map((b) => ({ stance: b.stance, count: b.count })),
      },
    });
  }

  events.push({
    event: 'status',
    data: { phase: 'extracting', progress: 0.3, message: 'Extracting findings' },
  });

  const n = report.blocks.length;
  report.blocks.forEach((block, i) => {
    events.push({ event: 'block', data: { block } });
    // interleave a synthesizing tick partway through the block stream
    if (i === Math.floor(n / 2)) {
      events.push({
        event: 'status',
        data: { phase: 'grading', progress: 0.6, message: 'Grading evidence strength' },
      });
    }
  });

  events.push({
    event: 'status',
    data: { phase: 'synthesizing', progress: 0.92, message: 'Composing synthesis' },
  });
  events.push({ event: 'references', data: { added: report.references } });

  events.push({
    event: 'status',
    data: { phase: 'complete', progress: 1, message: 'Report complete' },
  });
  events.push({ event: 'done', data: { report } });

  return events;
}
