import 'dotenv/config';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import path from 'path';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fs from 'fs';

// Load the existing JS database connection
import db from './config/database';

// Load your new TypeScript user routes
import usersRoutes from './users/users.routes';

// Load tournament routes
import tournamentRoutes from './tournament/tournament.routes';

// Load game routes
import gameRoutes from './game/game.routes';

// Create Fastify instance
const app = Fastify({
  logger: true,
});

app.get('/api/__whoami', async () => ({
  entrypoint: 'server.ts',
  ts: true,
  time: Date.now()
}));

app.log.info('[BOOT] Running src/server.ts (TypeScript entrypoint)');

// Register JWT plugin
app.register(jwt, {
  secret: process.env.JWT_SECRET || 'dev-secret-change-me',
});

app.decorate('db', db);

// Add an auth decorator for protected routes
app.decorate('auth', async function (request: any, reply: any) {
  try {
    await request.jwtVerify();

    const decoded = (request as any).user as { id?: number; username?: string };
    const id = Number(decoded?.id);

    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // DB is source of truth: user must exist
    const row = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id) as
      | { id: number; username: string }
      | undefined;

    if (!row) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (row.username === 'AI') {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // IMPORTANT: overwrite request.user with fresh DB username
    (request as any).user = { id: row.id, username: row.username };
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
});


/**
 * ✅ AVATAR/UPLOADS SUPPORT
 * This creates /uploads and serves it at /api/uploads/*
 */
const uploadsRoot = path.join(process.cwd(), 'uploads');
fs.mkdirSync(path.join(uploadsRoot, 'avatars'), { recursive: true });

app.register(multipart, {
  limits: {
    fileSize: 1 * 1024 * 1024, // 1MB
    files: 1,
  },
});

app.register(fastifyStatic, {
  root: path.join(process.cwd(), 'uploads'),
  prefix: '/api/uploads/',
});

// Routes
// Register your user routes with a /api prefix
app.register(usersRoutes, { prefix: '/api' });
// Register tournament routes
app.register(tournamentRoutes, { prefix: '/api' });
// Register game routes
app.register(gameRoutes, { prefix: '/api' });

// Start server
const PORT = Number(process.env.PORT) || 8888; // use different port than server.js
app
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`TS backend running on http://localhost:${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
