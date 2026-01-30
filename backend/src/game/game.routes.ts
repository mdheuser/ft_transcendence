// game.routes.ts
import db from '../config/database';
import type { FastifyInstance } from 'fastify';
import { makeGameService } from './game.service';

export default async function gameRoutes(fastify: FastifyInstance) {
  const sqlite = (fastify as any).db ?? db;
  const svc = makeGameService(sqlite);

  fastify.post('/matches', { preHandler: fastify.auth }, async (request: any, reply) => {
    const body = request.body || {};
    const gameId = Number(body.gameId);
    const p1Score = Number(body.player1Score);
    const p2Score = Number(body.player2Score);

    if (!Number.isInteger(gameId) || gameId <= 0) {
      return reply.code(400).send({ error: 'Invalid gameId' });
    }
    if (!Number.isInteger(p1Score) || !Number.isInteger(p2Score) || p1Score < 0 || p2Score < 0) {
      return reply.code(400).send({ error: 'Invalid score' });
    }

    const authUserId = Number(request.user?.id);
    if (!Number.isInteger(authUserId) || authUserId <= 0) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    try {
      const result = svc.recordMatchResultIdempotent(authUserId, {
        gameId,
        player1Score: p1Score,
        player2Score: p2Score,
      });

      return reply.code(200).send(result);
    } catch (e: any) {
      const status = Number(e?.statusCode) || 500;
      const msg = status === 500 ? 'Internal Server Error' : String(e?.message || 'Error');
      return reply.code(status).send({ error: msg });
    }
  });

  fastify.post('/games/ai', { preValidation: [fastify.auth] }, async (request, reply) => {
    const userId = (request as any).user.id as number;

    const ai = sqlite.prepare(`SELECT id FROM users WHERE username = 'AI'`).get() as any;
    if (!ai?.id) return reply.code(500).send({ error: 'AI user missing' });

    const game = sqlite.prepare(`INSERT INTO games (game_type, status, started_at) VALUES ('ai', 'playing', CURRENT_TIMESTAMP)`).run();
    const gameId = Number(game.lastInsertRowid);

    const me = sqlite.prepare(`SELECT username FROM users WHERE id = ?`).get(userId) as any;

    // Important: insert order matters because your service maps “player1Score” to the first row (ORDER BY id ASC)
    sqlite.prepare(`INSERT INTO game_players (game_id, user_id, player_alias) VALUES (?, ?, ?)`).run(gameId, userId, me?.username ?? 'Player 1');
    sqlite.prepare(`INSERT INTO game_players (game_id, user_id, player_alias) VALUES (?, ?, ?)`).run(gameId, ai.id, 'AI');

    return reply.send({ gameId });
  });

  fastify.get('/matches/:id', { preValidation: [fastify.auth] }, async (request, reply) => {
    const userId = (request as any).user.id as number;
    const matchId = Number((request.params as any).id);

    if (!Number.isFinite(matchId)) {
      return reply.code(400).send({ error: 'Invalid match id' });
    }

    // use your sqlite handle (whatever you use elsewhere)
    //const sqlite = (fastify as any).db; // or fallback if you use one

    const row = sqlite.prepare(`
      SELECT
        mh.id,
        mh.game_id,
        mh.player1_id,
        mh.player2_id,
        mh.player1_score,
        mh.player2_score,
        mh.winner_id,
        mh.match_date,
        mh.mode,

        u1.username AS player1_username,
        u1.avatar   AS player1_avatar,
        u2.username AS player2_username,
        u2.avatar   AS player2_avatar
      FROM match_history mh
      JOIN users u1 ON u1.id = mh.player1_id
      JOIN users u2 ON u2.id = mh.player2_id
      WHERE mh.id = ?
    `).get(matchId) as any;

    if (!row) return reply.code(404).send({ error: 'Match not found' });

    // only participants can view
    if (row.player1_id !== userId && row.player2_id !== userId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    return reply.send({
      id: row.id,
      game_id: row.game_id,
      match_date: row.match_date,
      mode: row.mode,
      player1: { id: row.player1_id, username: row.player1_username, avatar: row.player1_avatar },
      player2: { id: row.player2_id, username: row.player2_username, avatar: row.player2_avatar },
      score: [row.player1_score, row.player2_score],
      winner_id: row.winner_id,
    });
  });

  fastify.post('/games/pvp', { preValidation: [fastify.auth] }, async (request, reply) => {
    const player1Id = (request as any).user.id as number;
    const body = request.body as { player2Id?: number };

    const player2Id = Number(body.player2Id);
    if (!Number.isInteger(player2Id) || player2Id <= 0) {
      return reply.code(400).send({ error: 'Invalid player2Id' });
    }
    if (player2Id === player1Id) {
      return reply.code(400).send({ error: 'Cannot play against yourself' });
    }

    const db = fastify.db;

    const p1 = db.prepare('SELECT id, username FROM users WHERE id = ?').get(player1Id) as any;
    const p2 = db.prepare('SELECT id, username FROM users WHERE id = ?').get(player2Id) as any;
    if (!p2) return reply.code(404).send({ error: 'Player2 not found' });

    const insGame = db
      .prepare("INSERT INTO games (game_type, status, started_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
      .run('pvp', 'in_progress');
    const gameId = Number(insGame.lastInsertRowid);

    const insPlayer = db.prepare(
      'INSERT INTO game_players (game_id, user_id, player_alias) VALUES (?, ?, ?)'
    );
    insPlayer.run(gameId, p1.id, p1.username);
    insPlayer.run(gameId, p2.id, p2.username);

    return reply.send({ gameId });
  });
}
