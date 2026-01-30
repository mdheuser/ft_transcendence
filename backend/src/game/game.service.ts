// game.service.ts
import type { Database } from 'better-sqlite3';

export type MatchHistoryRow = {
  id: number;
  game_id: number;
  player1_id: number;
  player2_id: number;
  player1_score: number;
  player2_score: number;
  winner_id: number;
  match_date: string;
  mode: 'ai' | 'quick' | 'tournament';
};

export type RecordMatchRequest = {
  gameId: number;
  player1Score: number;
  player2Score: number;
};

export type RecordMatchResult = {
  match: MatchHistoryRow;
  duplicated: boolean;
};

export function makeGameService(db: Database) {
  function getMatchHistoryByGameId(gameId: number): MatchHistoryRow | null {
    const row = db.prepare(`SELECT * FROM match_history WHERE game_id = ?`).get(gameId) as MatchHistoryRow | undefined;
    return row ?? null;
  }

  function toMode(gameType: unknown): MatchHistoryRow['mode'] {
    const t = String(gameType ?? '').toLowerCase();

    if (t.includes('tour')) return 'tournament';
    if (t.includes('ai') || t.includes('single')) return 'ai';

    return 'quick';
  }

  function recordMatchResultIdempotent(
    authUserId: number,
    x: RecordMatchRequest
  ): RecordMatchResult {
    // Everything below should be in ONE transaction
    const tx = db.transaction((): RecordMatchResult => {
      // Determine players from DB (source of truth)
      const players = db
        .prepare(`SELECT user_id FROM game_players WHERE game_id = ? ORDER BY id ASC`)
        .all(x.gameId) as Array<{ user_id: number | null }>;

      if (!players || players.length !== 2 || !players[0].user_id || !players[1].user_id) {
        const err: any = new Error('Game does not have two players');
        err.statusCode = 400;
        throw err;
      }

      const player1Id = Number(players[0].user_id);
      const player2Id = Number(players[1].user_id);

      if (authUserId !== player1Id && authUserId !== player2Id) {
        const err: any = new Error('Forbidden');
        err.statusCode = 403;
        throw err;
      }

      if (x.player1Score === x.player2Score) {
        const err: any = new Error('Tie games are not supported');
        err.statusCode = 400;
        throw err;
      }

      const winnerId = x.player1Score > x.player2Score ? player1Id : player2Id;
      const gameRow = db
        .prepare(`SELECT game_type FROM games WHERE id = ?`)
        .get(x.gameId) as { game_type?: string | null } | undefined;

      const mode = toMode(gameRow?.game_type);

      // Check existing inside TX (prevents race issues)
      const existing = getMatchHistoryByGameId(x.gameId);
      if (existing) {
        const same =
          existing.player1_id === player1Id &&
          existing.player2_id === player2Id &&
          existing.player1_score === x.player1Score &&
          existing.player2_score === x.player2Score &&
          existing.winner_id === winnerId;
          existing.mode === mode;

        if (!same) {
          const err: any = new Error('Match already recorded');
          err.statusCode = 409;
          throw err;
        }

        return { match: existing, duplicated: true };
      }

      // Update game state + player scores + insert match_history atomically
      db.prepare(
        `UPDATE games
         SET status = 'finished',
             winner_id = ?,
             ended_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(winnerId, x.gameId);

      db.prepare(`UPDATE game_players SET score = ? WHERE game_id = ? AND user_id = ?`)
        .run(x.player1Score, x.gameId, player1Id);

      db.prepare(`UPDATE game_players SET score = ? WHERE game_id = ? AND user_id = ?`)
        .run(x.player2Score, x.gameId, player2Id);

      db.prepare(
        `INSERT INTO match_history (
           game_id, player1_id, player2_id, player1_score, player2_score, winner_id, mode
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(x.gameId, player1Id, player2Id, x.player1Score, x.player2Score, winnerId, mode);

      const row = getMatchHistoryByGameId(x.gameId);
      if (!row) {
        const err: any = new Error('Failed to record match_history');
        err.statusCode = 500;
        throw err;
      }

      return { match: row, duplicated: false };
    });

    return tx();
  }

  return {
    getMatchHistoryByGameId,
    recordMatchResultIdempotent,
  };
}
