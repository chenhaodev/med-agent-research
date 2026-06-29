import type { FastifyInstance } from 'fastify';
import { facetsFixture } from '../fixtures.ts';

/** GET /facets — catalogs that drive the filter drawer. */
export async function facetsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/facets', async () => facetsFixture);
}
