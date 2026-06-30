/* Brain bridge — runs the Python synthesis worker and relays its events.
 *
 * Retrieves a candidate corpus via the provider aggregator, spawns the worker
 * (synthesis/run.py) with the job spec on stdin, and parses its newline-delimited
 * JSON output back into ReportEvents. The worker speaks the same event contract
 * as the fixture pipeline, so the gateway relays its events over SSE unchanged. */

import { spawn } from 'node:child_process';
import type { ReportEvent, ResearchQuery } from '../../api/types.ts';
import { config } from './config.ts';
import { aggregator } from './providers/aggregator.ts';
import { nowIso } from './ids.ts';

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Generate a report via the worker, calling `emit` for each ReportEvent.
 *  Always emits a terminal event (done or error). */
export async function runBrain(
  reportId: string,
  query: ResearchQuery,
  emit: (event: ReportEvent) => void,
): Promise<void> {
  let candidates;
  try {
    candidates = await aggregator.search(query, { limit: config.brainCandidates });
  } catch (err) {
    emit({ event: 'error', data: { code: 'retrieval_failed', message: message(err) } });
    return;
  }

  const job = {
    reportId,
    query,
    papers: candidates.items,
    corpusSize: candidates.total ?? candidates.items.length,
    maxTokens: config.brainMaxTokens,
    now: nowIso(),
  };

  await new Promise<void>((resolve) => {
    const child = spawn(config.brainCmd[0], config.brainCmd.slice(1), {
      cwd: config.repoRoot,
      env: process.env,
    });

    let buffer = '';
    let stderr = '';
    let sawTerminal = false;

    const handleLine = (line: string): void => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let event: ReportEvent;
      try {
        event = JSON.parse(trimmed) as ReportEvent;
      } catch {
        return; // ignore non-JSON noise (e.g. stray prints)
      }
      if (event.event === 'done' || event.event === 'error') sawTerminal = true;
      emit(event);
    };

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      if (!sawTerminal) {
        emit({ event: 'error', data: { code: 'brain_spawn_failed', message: message(err) } });
        sawTerminal = true;
      }
      resolve();
    });
    child.on('close', (code) => {
      if (buffer.trim()) handleLine(buffer);
      if (!sawTerminal) {
        const tail = stderr ? `: ${stderr.slice(0, 400)}` : '';
        emit({ event: 'error', data: { code: 'brain_no_output', message: `worker exited ${code}${tail}` } });
      }
      resolve();
    });

    child.stdin.write(JSON.stringify(job));
    child.stdin.end();
  });
}
