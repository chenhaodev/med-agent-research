/* Corpus mock server entrypoint. Fastify + CORS, all routes mounted under
 * `/api/v1`. In-memory stores, fixture-backed data, simulated SSE pipeline.
 * Run with `npm run mock` (default :8787). */

import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.ts';
import { facetsRoutes } from './routes/facets.ts';
import { papersRoutes } from './routes/papers.ts';
import { reportsRoutes } from './routes/reports.ts';
import { savedSearchesRoutes } from './routes/savedSearches.ts';
import { historyRoutes } from './routes/history.ts';
import { collectionsRoutes } from './routes/collections.ts';
import { authRoutes } from './routes/auth.ts';
import { registerReportWorker } from './jobs.ts';
import { scheduler } from './scheduler.ts';
import type { ApiErrorResponse } from '../../api/types.ts';

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, exposedHeaders: ['*'] });

  // Uniform JSON error envelope for anything that escapes a route handler.
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = (err.statusCode && err.statusCode >= 400 ? err.statusCode : 500) as number;
    const body: ApiErrorResponse = {
      error: { code: status === 500 ? 'internal' : 'error', message: err.message },
    };
    reply.code(status).send(body);
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: { code: 'not_found', message: 'Route not found' } } satisfies ApiErrorResponse);
  });

  app.get('/health', async () => ({ status: 'ok', version: 'v1' }));

  const routes = [
    facetsRoutes,
    papersRoutes,
    reportsRoutes,
    savedSearchesRoutes,
    historyRoutes,
    collectionsRoutes,
    authRoutes,
  ];
  for (const route of routes) {
    await app.register(route, { prefix: config.basePath });
  }

  // Start the report worker pool, and (opt-in) the weekly recompute scheduler.
  registerReportWorker();
  if (config.enableScheduler) scheduler.start();

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(
      `Corpus mock server on http://localhost:${config.port}${config.basePath} ` +
        `(live PubMed: ${config.useLivePubmed ? 'on' : 'off'})`,
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
