import { FastifyPluginAsync } from 'fastify';

// In-Memory Tournament State
let currentTournament: any = null;

// Helper function to generate tournament matches (from server.js) // we need to use only server.ts
function generateMatches(players: any[]) {
  const matches = [];
  const shuffled = [...players].sort(() => Math.random() - 0.5);

  // Generate all matches (round-robin style)
  for (let i = 0; i < shuffled.length; i++) {
    for (let j = i + 1; j < shuffled.length; j++) {
      matches.push({
        id: `match-${i}-${j}-${Date.now()}`,
        player1: shuffled[i],
        player2: shuffled[j],
        winner: null,
        score: [],
        duration: 0
      });
    }
  }

  return matches;
}

// Helper function to calculate tournament winner (from server.js) // we need to use only server.ts
function calculateTournamentWinner(tournament: any) {
  const playerStats: any = {};

  // Initialize stats for all players
  tournament.players.forEach((player: any) => {
    playerStats[player.alias] = {
      wins: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      totalTime: 0
    };
  });

  // Calculate stats from all matches
  tournament.matches.forEach((match: any) => {
    if (!match.winner || !match.score || match.score.length !== 2) return;

    const player1 = match.player1.alias;
    const player2 = match.player2.alias;
    const [score1, score2] = match.score;

    // Record points
    playerStats[player1].pointsFor += score1;
    playerStats[player1].pointsAgainst += score2;
    playerStats[player2].pointsFor += score2;
    playerStats[player2].pointsAgainst += score1;

    // Record wins
    if (match.winner === player1) {
      playerStats[player1].wins++;
    } else if (match.winner === player2) {
      playerStats[player2].wins++;
    }

    // Record time (both players get the same match duration)
    playerStats[player1].totalTime += match.duration || 0;
    playerStats[player2].totalTime += match.duration || 0;
  });

  // Sort players
  const rankedPlayers = Object.entries(playerStats)
    .map(([alias, stats]: [string, any]) => ({
      alias,
      wins: stats.wins,
      pointDiff: stats.pointsFor - stats.pointsAgainst,
      totalTime: stats.totalTime
    }))
    .sort((a, b) => {
      // First: Most wins
      if (b.wins !== a.wins) return b.wins - a.wins;

      // Second: Best point differential
      if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;

      // Third: Least time (faster is better)
      return a.totalTime - b.totalTime;
    });

  // Check for a complete tie
  if (rankedPlayers.length >= 2) {
    const first = rankedPlayers[0];
    const second = rankedPlayers[1];

    if (first.wins === second.wins &&
        first.pointDiff === second.pointDiff &&
        first.totalTime === second.totalTime) {
      // Perfect tie - return both players as draw
      return `${first.alias} & ${second.alias} (Draw)`;
    }
  }

  return rankedPlayers[0].alias;
}

const tournamentRoutes: FastifyPluginAsync = async (fastify, opts) => {

    fastify.get('/tournament/current', async (request, reply) => {
        if (!currentTournament) {
            return { active: false };
        }
        return currentTournament;
    });

    fastify.post('/tournament/create', async (request, reply) => {
        const body = request.body as { playerCount?: number };
        const { playerCount } = body;

        if (!playerCount || playerCount < 2 || playerCount > 8) {
            return reply.code(400).send({ error: 'Player count must be between 2 and 8' });
        }

        const res = (fastify as any).db.prepare(
          `INSERT INTO tournaments (name, status, max_players, started_at)
          VALUES (?, 'pending', ?, NULL)`
        ).run(`Tournament ${Date.now()}`, playerCount);
        const tournamentId = Number(res.lastInsertRowid);
        currentTournament = {
            id: tournamentId,
            active: true,
            playerCount: playerCount,
            players: [],
            matches: [],
            currentMatchIndex: 0,
            winner: null
        };

        return currentTournament;
    });

    fastify.post('/tournament/register', { preValidation: [fastify.auth] }, async (request, reply) => {
        const userId = (request as any).user.id as number;
        const username = (request as any).user.username as string;

        const body = request.body as { alias?: string };
        const alias = (body.alias?.trim() || username).trim();

        if (!currentTournament) {
          return reply.code(400).send({ error: 'No active tournament' });
        }

        const sqlite = (fastify as any).db;

        // 1) block duplicate user registering twice (DB source of truth)
        const exists = sqlite.prepare(
          `SELECT 1 FROM tournament_participants WHERE tournament_id = ? AND user_id = ?`
        ).get(currentTournament.id, userId);

        if (exists) {
          return reply.code(400).send({ error: 'Already registered' });
        }

        // 2) block duplicate alias (check DB + in-memory to be safe)
        const aliasTakenDb = sqlite.prepare(
          `SELECT 1 FROM tournament_participants WHERE tournament_id = ? AND participant_alias = ?`
        ).get(currentTournament.id, alias);

        const aliasTakenMem = currentTournament.players?.some((p: any) => p.alias === alias);

        if (aliasTakenDb || aliasTakenMem) {
          return reply.code(400).send({ error: 'Alias already taken' });
        }

        // 3) persist
        sqlite.prepare(
          `INSERT INTO tournament_participants (tournament_id, user_id, participant_alias)
          VALUES (?, ?, ?)`
        ).run(currentTournament.id, userId, alias);

        // 4) update in-memory state (only after DB succeeded)
        currentTournament.players.push({ id: String(userId), alias });

        return currentTournament;
      }
    );

    fastify.post('/tournament/register-guest', async (request, reply) => {
      const body = request.body as { alias?: string };
      const alias = (body.alias?.trim() || '').trim();

      if (!currentTournament) {
        return reply.code(400).send({ error: 'No active tournament' });
      }
      if (!alias) {
        return reply.code(400).send({ error: 'Missing alias' });
      }

      const sqlite = (fastify as any).db;

      // tournament full?
      if (currentTournament.players.length >= currentTournament.playerCount) {
        return reply.code(400).send({ error: 'Tournament is full' });
      }

      // alias unique (DB + memory)
      const aliasTakenDb = sqlite.prepare(
        `SELECT 1 FROM tournament_participants WHERE tournament_id = ? AND participant_alias = ?`
      ).get(currentTournament.id, alias);

      const aliasTakenMem = currentTournament.players?.some((p: any) => p.alias === alias);

      if (aliasTakenDb || aliasTakenMem) {
        return reply.code(400).send({ error: 'Alias already taken' });
      }

      // persist guest (user_id NULL)
      sqlite.prepare(
        `INSERT INTO tournament_participants (tournament_id, user_id, participant_alias)
        VALUES (?, NULL, ?)`
      ).run(currentTournament.id, alias);

      // add to in-memory players (unique id for guest)
      currentTournament.players.push({ id: `guest-${Date.now()}-${Math.random()}`, alias });

      // generate matches once full (same logic you already have)
      if (currentTournament.players.length === currentTournament.playerCount) {
        currentTournament.matches = generateMatches(currentTournament.players);
      }

      return currentTournament;
    });

    fastify.post('/tournament/update-match', async (request, reply) => {
        const body = request.body as { matchId?: string; winner?: string; score?: number[]; duration?: number };
        const { matchId, winner, score, duration } = body;

        if (!currentTournament) {
            return reply.code(400).send({ error: 'No active tournament' });
        }

        const match = currentTournament.matches.find((m: any) => m.id === matchId);
        if (!match) {
            return reply.code(404).send({ error: 'Match not found' });
        }

        match.winner = winner;
        match.score = score;
        match.duration = duration;

        // Move to next match
        currentTournament.currentMatchIndex++;

        // Check if tournament is complete
        if (currentTournament.currentMatchIndex >= currentTournament.matches.length) {
            currentTournament.winner = calculateTournamentWinner(currentTournament);
        }

        return currentTournament;
    });

    fastify.post('/tournament/reset', async (request, reply) => {
        try {
            currentTournament = null;
            return reply.send({ success: true });
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to reset tournament' });
        }
    });
};

export default tournamentRoutes;
