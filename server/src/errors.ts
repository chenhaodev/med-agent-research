import type { FastifyReply } from 'fastify';
import type { ApiErrorResponse } from '../../api/types.ts';

/** An error carrying an HTTP status and the stable JSON envelope `{ error }`. */
export class ApiException extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiException';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorResponse {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

export const notFound = (what: string) =>
  new ApiException(404, 'not_found', `${what} not found`);

export const badRequest = (message: string, details?: unknown) =>
  new ApiException(400, 'bad_request', message, details);

export const unauthorized = (message = 'Authentication required') =>
  new ApiException(401, 'unauthorized', message);

/** Translate any thrown value into the JSON error envelope. */
export function sendError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof ApiException) {
    return reply.code(err.statusCode).send(err.toBody());
  }
  const message = err instanceof Error ? err.message : 'Internal error';
  return reply.code(500).send({ error: { code: 'internal', message } } satisfies ApiErrorResponse);
}
