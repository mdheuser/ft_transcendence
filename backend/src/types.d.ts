// src/types.d.ts
import 'fastify';
import type Database from 'better-sqlite3';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database.Database; // instance type
    auth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user?: {
      id: number;
      username: string;
    };
  }
}
