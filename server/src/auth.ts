/* Bearer-token auth. The mock issues and accepts a single static token; all
 * user-scoped routes call `requireAuth`. Public routes (facets, papers, auth
 * login) skip it. */

import type { FastifyRequest } from 'fastify';
import type { User } from '../../api/types.ts';
import { config } from './config.ts';
import { defaultUser } from './store.ts';
import { unauthorized } from './errors.ts';

export function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export function requireAuth(req: FastifyRequest): User {
  const token = bearerToken(req);
  if (token !== config.staticToken) throw unauthorized();
  return defaultUser;
}
