import type { FastifyInstance } from 'fastify';
import { store } from '../store.ts';
import { requireAuth } from '../auth.ts';
import { sendError } from '../errors.ts';

export async function historyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/history', async (req, reply) => {
    try {
      requireAuth(req);
      return [...store.history.values()].sort((a, b) => b.ranAt.localeCompare(a.ranAt));
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
