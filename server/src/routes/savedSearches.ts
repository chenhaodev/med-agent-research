import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ResearchQuery, SavedSearch } from '../../../api/types.ts';
import { store } from '../store.ts';
import { makeId, nowIso } from '../ids.ts';
import { requireAuth } from '../auth.ts';
import { badRequest, notFound, sendError } from '../errors.ts';

export async function savedSearchesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/saved-searches', async (req, reply) => {
    try {
      requireAuth(req);
      return [...store.savedSearches.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/saved-searches', async (req: FastifyRequest, reply) => {
    try {
      requireAuth(req);
      const body = (req.body ?? {}) as { name?: string; query?: ResearchQuery };
      if (!body.name || !body.query) throw badRequest('name and query are required');
      const saved: SavedSearch = {
        id: makeId('saved'),
        name: body.name,
        query: body.query,
        createdAt: nowIso(),
      };
      store.savedSearches.set(saved.id, saved);
      return reply.code(201).send(saved);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/saved-searches/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      requireAuth(req);
      if (!store.savedSearches.has(req.params.id)) throw notFound('Saved search');
      store.savedSearches.delete(req.params.id);
      return reply.code(204).send();
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
