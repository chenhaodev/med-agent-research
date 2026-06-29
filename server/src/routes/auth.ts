import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { LoginRequest, LoginResponse } from '../../../api/types.ts';
import { config } from '../config.ts';
import { defaultUser } from '../store.ts';
import { requireAuth } from '../auth.ts';
import { badRequest, sendError } from '../errors.ts';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Mock login: any email/password yields the static token + default user.
  app.post('/auth/login', async (req: FastifyRequest, reply) => {
    try {
      const body = (req.body ?? {}) as Partial<LoginRequest>;
      if (!body.email || !body.password) throw badRequest('email and password are required');
      return { token: config.staticToken, user: defaultUser } satisfies LoginResponse;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/auth/logout', async (req, reply) => {
    try {
      requireAuth(req);
      return reply.code(204).send();
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/me', async (req, reply) => {
    try {
      return requireAuth(req);
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
