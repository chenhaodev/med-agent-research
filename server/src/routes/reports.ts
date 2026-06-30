import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CreateReportRequest, CreateReportResponse, ResearchQuery } from '../../../api/types.ts';
import { config } from '../config.ts';
import { store } from '../store.ts';
import { makeId } from '../ids.ts';
import { buildReport } from '../pipeline/report.ts';
import { enqueueReport, subscribeToRun } from '../jobs.ts';
import { openSse } from '../sse.ts';
import { badRequest, notFound, sendError } from '../errors.ts';

function validateQuery(query: unknown): ResearchQuery {
  if (!query || typeof query !== 'object') throw badRequest('Missing query');
  const q = query as Partial<ResearchQuery>;
  if (typeof q.question !== 'string') throw badRequest('query.question must be a string');
  if (typeof q.mode !== 'string') throw badRequest('query.mode is required');
  if (!q.filters || typeof q.filters !== 'object') throw badRequest('query.filters is required');
  return q as ResearchQuery;
}

export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  // ---- Create an async synthesis job ----
  app.post('/reports', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = (req.body ?? {}) as CreateReportRequest;
      const query = validateQuery(body.query);
      const idempotencyKey =
        body.idempotencyKey ?? (req.headers['idempotency-key'] as string | undefined);

      // Idempotent replay: same key returns the same report.
      if (idempotencyKey && store.idempotency.has(idempotencyKey)) {
        const reportId = store.idempotency.get(idempotencyKey)!;
        const job = [...store.jobs.values()].find((j) => j.reportId === reportId);
        return reply.code(202).send(jobResponse(reportId, job?.jobId ?? makeId('job')));
      }

      const reportId = makeId('rep');
      const full = buildReport(reportId, query);
      const { jobId } = enqueueReport(reportId, full);

      store.jobs.set(jobId, { jobId, reportId, idempotencyKey });
      if (idempotencyKey) store.idempotency.set(idempotencyKey, reportId);
      store.recordHistory({ query, reportId });

      return reply.code(202).send(jobResponse(reportId, jobId));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ---- History of generated reports (newest first) ----
  app.get('/reports', async () => {
    const items = [...store.reports.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { items, total: items.length };
  });

  // ---- Fetch a report (partial while generating) ----
  app.get('/reports/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const report = store.reports.get(req.params.id);
      if (!report) throw notFound('Report');
      return report;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ---- Delete a report ----
  app.delete('/reports/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      if (!store.reports.has(req.params.id)) throw notFound('Report');
      store.reports.delete(req.params.id);
      return reply.code(204).send();
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ---- Stream generation as Server-Sent Events ----
  app.get('/reports/:id/events', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    if (!store.reports.has(req.params.id)) {
      return sendError(reply, notFound('Report'));
    }
    // Take over the socket; Fastify must not try to send its own response.
    reply.hijack();
    const channel = openSse(reply);
    const heartbeat = setInterval(() => channel.comment('ping'), 15000);

    // On reconnect the browser sends the last id it saw; only missed events replay.
    const header = req.headers['last-event-id'];
    const fromQuery = (req.query as Record<string, unknown>)?.lastEventId;
    const lastEventId = Number(
      (Array.isArray(header) ? header[0] : header) ?? fromQuery ?? 0,
    );

    const unsubscribe = subscribeToRun(
      req.params.id,
      (event, id) => channel.send(event, id),
      () => {
        clearInterval(heartbeat);
        channel.close();
      },
      Number.isFinite(lastEventId) ? lastEventId : 0,
    );

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}

function jobResponse(reportId: string, jobId: string): CreateReportResponse {
  return {
    reportId,
    jobId,
    status: 'queued',
    statusUrl: `${config.basePath}/reports/${reportId}`,
    eventsUrl: `${config.basePath}/reports/${reportId}/events`,
  };
}
