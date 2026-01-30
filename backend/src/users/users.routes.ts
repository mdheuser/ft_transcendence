// src/users/users.routes.ts
import { FastifyPluginAsync } from 'fastify';
import usersService, { toPublicUser } from './users.service';
import friendsService from '../friends/friends.service';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import db from '../config/database';

const usersRoutes: FastifyPluginAsync = async (fastify, opts) => {
  const sqlite = (fastify as any).db ?? db;
  // helper to sign JWT
  function signUser(id: number, username: string): string {
    // @ts-expect-error fastify.jwt comes from @fastify/jwt
    return fastify.jwt.sign({ id, username });
  }

  function signTempUser(id: number, username: string): string {
    return fastify.jwt.sign({ id, username, scope: '2fa_pending' }, { expiresIn: '5m' });
  }

  // ---------- AUTH ----------

  fastify.get('/auth/google', async (request, reply) => {
    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      scope: 'email profile',
      access_type: 'offline',
      state: 'some_random_state_for_security'
    });

    return reply.redirect(`${rootUrl}?${params.toString()}`);
  });

  fastify.get('/auth/google/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    if (!code) {
      return reply.code(400).send({ error: 'Missing authorization code' });
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
          grant_type: 'authorization_code'
        })
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        fastify.log.error('Google token exchange error:', tokenData.error_description);
        return reply.code(401).send({ error: 'Google authentication failed' });
      }

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      const profile = await profileRes.json();

      const googleId = profile.id;
      const email = profile.email || null;
      const username = profile.name || profile.given_name || `user-${googleId.substring(0, 8)}`;
      const avatar = profile.picture || null;

      let user = usersService.getByGoogleId(googleId);

      if (!user) {
        user = await usersService.createGoogleUser(googleId, username, email, avatar);
      } else {
        usersService.updateStatus(user.id, 'online'); // integer? <-- Attention!
      }

      // check for Google Login
      if (user.two_fa_enabled) {
        const tempToken = signTempUser(user.id, user.username);
        return reply.redirect('/#2fa_required=' + tempToken);
      }

      const token = signUser(user.id, user.username);

      return reply.redirect('/#token=' + token);

    } catch (error) {
      fastify.log.error('Google Auth Error:', error);
      return reply.code(500).send({ error: 'Internal server error during authentication' });
    }
  });

  fastify.post('/register', async (request, reply) => {
    const body = request.body as { username?: string; email?: string; password?: string };

    const username = body.username?.trim();
    const email = body.email?.trim();
    const password = body.password;

    if (!username || !email || !password) {
      return reply.code(400).send({ error: 'Missing fields' });
    }

    // NEW: username uniqueness
    if (usersService.getByUsername(username)) {
      return reply.code(400).send({ error: 'Username already in use' });
    }

    if (usersService.getByEmail(email)) {
      return reply.code(400).send({ error: 'Email already in use' });
    }

    try {
      const newUser = await usersService.createUser({ username, email, password });
      usersService.updateStatus(newUser.id, 'online');

      const token = signUser(newUser.id, newUser.username);
      return reply.send({ token, user: newUser });
    } catch (e: any) {
      // Safety net for races / DB constraint errors
      if (String(e?.message || '').includes('UNIQUE')) {
        return reply.code(400).send({ error: 'Username already in use' });
      }
      throw e;
    }
  });

  fastify.post('/login', async (request, reply) => {
      const body = request.body as {
          email?: string;
          password?: string;
          two_fa_token?: string
      };
      const { email, password, two_fa_token } = body;
      let user: any;
      let tempToken: string | undefined;

      // 2FA Finalization Step (Identified by two_fa_token in body)
      if (two_fa_token) {
        try {
          const decoded = await request.jwtVerify();
          const userId = (decoded as any).id as number;
          user = usersService.getById(userId);

        } catch (err) {
          // If JWT fails or user not found, authentication failed
          return reply.code(401).send({ error: 'Session expired or Invalid token for 2FA' });
        }

        if (!user) {
            return reply.code(404).send({ error: 'User not found' });
        }

        // Check if 2FA code is valid
      // Check if 2FA code is valid
        const isTokenValid = usersService.verifyTwoFactorCode(user.two_fa_secret, two_fa_token);
        if (!isTokenValid) {
          return reply.code(401).send({ error: 'Invalid 2FA code' });
        }
      } else {
      // Initial Password/Email Login Step
          if (!email || !password) {
              return reply.code(400).send({ error: 'Missing email or password' });
          }

          user = usersService.getByEmail(email);
          if (!user) {
              return reply.code(401).send({ error: 'Invalid credentials' });
          }

          const ok = await usersService.checkPassword(user, password);
          if (!ok) {
              return reply.code(401).send({ error: 'Invalid credentials' });
          }

          // If 2FA is required, stop here and issue a temporary token
        if (user.two_fa_enabled) {
          tempToken = signTempUser(user.id, user.username);
          return reply.code(401).send({
            error: 'Two-Factor Authentication required',
            two_fa_required: true,
            temp_token: tempToken
          });
        }
      }

      // final login
      usersService.updateStatus(user.id, 'online');
      const token = signUser(user.id, user.username);

      return reply.send({
        token,
        user: toPublicUser(user, true)
      });
  });

  fastify.post(
    '/logout',
    // @ts-expect-error auth decorator is added in server.js
    { preValidation: [fastify.auth] }, // fastify.auth means Fastify will run 'await request.jwtVerify();'
    async (request, reply) => {
      const userId = (request as any).user.id as number;
      usersService.updateStatus(userId, 'offline');
      return reply.send({ ok: true });
    }
  );

  fastify.get(
    '/me',
    // @ts-expect-error auth decorator
    { preValidation: [fastify.auth] },
    async (request, reply) => {
      const userId = (request as any).user.id as number;
      const user = usersService.getById(userId);
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }
      return reply.send(toPublicUser(user, true));
    }
  );

  // ---------- PROFILE ----------

  fastify.patch('/users/me', { preValidation: [fastify.auth] }, async (request, reply) => {
    const userId = (request as any).user.id as number;
    const body = request.body as { username?: string; email?: string };

    const username = body.username?.trim() || undefined; // undefined means "no update requested"
    const email = body.email?.trim() || undefined;

    if (!username && !email) {
      return reply.code(400).send({ error: 'No fields to update' });
    }

    if (username && usersService.usernameTakenByOtherUser(username, userId)) {
      return reply.code(400).send({ error: 'Username already in use' });
    }

    if (email && usersService.emailTakenByOtherUser(email, userId)) {
      return reply.code(400).send({ error: 'Email already in use' });
    }

    try {
      usersService.updateProfile(userId, username, email); // allow passing undefined
      return reply.send({ ok: true });
    } catch (e: any) {
      // fallback in case DB unique constraint triggers
      if (String(e?.message || '').includes('UNIQUE')) {
        return reply.code(400).send({ error: 'Username or email already in use' });
      }
      throw e;
    }
  });

  fastify.post(
    '/users/me/avatar',
    { preValidation: [fastify.auth as any] },
    async (request, reply) => {
      const file = await (request as any).file(); // field name must be "avatar"

      if (!file) {
        return reply.code(400).send({ error: 'Missing file' });
      }

      const allowed: Record<string, string> = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp',
      };

      const ext = allowed[file.mimetype];
      if (!ext) {
        return reply.code(400).send({ error: 'Invalid file type' });
      }

      const userId = (request as any).user.id as number;

      const avatarsDir = path.join(process.cwd(), 'uploads', 'avatars');
      fs.mkdirSync(avatarsDir, { recursive: true });

      const filename = `${userId}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      const destPath = path.join(avatarsDir, filename);

      await pipeline(file.file, fs.createWriteStream(destPath));

      const avatarUrl = `/api/uploads/avatars/${filename}`;
      usersService.updateAvatar(userId, avatarUrl);

      const updated = usersService.getById(userId);
      if (!updated) return reply.code(404).send({ error: 'User not found' });

      return reply.send(toPublicUser(updated, true));
    }
  );

  fastify.patch(
    '/users/me/avatar',
    // @ts-expect-error auth decorator
    { preValidation: [fastify.auth] },
    async (request, reply) => {
      const body = request.body as { avatarUrl?: string };
      const { avatarUrl } = body;

      if (!avatarUrl) {
        return reply.code(400).send({ error: 'Missing avatarUrl' });
      }

      const userId = (request as any).user.id as number;
      usersService.updateAvatar(userId, avatarUrl);
      return reply.send({ ok: true });
    }
  );

  fastify.get('/users', async (request, reply) => {
    const list = usersService.listUsersPublic();
    return reply.send(list);
  });

  fastify.get('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = Number(id);

    const user = usersService.getById(userId);
    if (!user) return reply.code(404).send({ error: 'User not found' });

    return reply.send(toPublicUser(user));
  });

  // ---------- USER STATS & HISTORY ----------

  // endpoints for frontend (STATS)
  fastify.get('/me/stats', { preValidation: [fastify.auth] }, async (request, reply) => {
    const userId = (request as any).user.id as number;

    const row = sqlite.prepare(`
      SELECT
        COUNT(*) AS games_played,
        SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) AS wins
      FROM match_history
      WHERE player1_id = ? OR player2_id = ?
    `).get(userId, userId, userId) as any;

    const games_played = Number(row?.games_played ?? 0);
    const wins = Number(row?.wins ?? 0);
    const losses = games_played - wins;
    const win_rate = games_played > 0 ? wins / games_played : 0;

    return reply.send({ user_id: userId, games_played, wins, losses, total_games: games_played, win_rate });
  });

  fastify.get('/me/history', { preValidation: [fastify.auth] }, async (request, reply) => {
    const userId = (request as any).user.id as number;

    const rows = sqlite.prepare(`
      SELECT
        mh.id,
        mh.game_id,
        mh.match_date,
        mh.mode,

        CASE WHEN mh.player1_id = ? THEN mh.player2_id ELSE mh.player1_id END AS opponent_id,
        CASE WHEN mh.player1_id = ? THEN u2.username ELSE u1.username END AS opponent_username,
        CASE WHEN mh.player1_id = ? THEN u2.avatar   ELSE u1.avatar   END AS opponent_avatar,

        CASE WHEN mh.player1_id = ? THEN mh.player1_score ELSE mh.player2_score END AS my_score,
        CASE WHEN mh.player1_id = ? THEN mh.player2_score ELSE mh.player1_score END AS opponent_score,

        CASE WHEN mh.winner_id = ? THEN 1 ELSE 0 END AS did_win
      FROM match_history mh
      JOIN users u1 ON u1.id = mh.player1_id
      JOIN users u2 ON u2.id = mh.player2_id
      WHERE mh.player1_id = ? OR mh.player2_id = ?
      ORDER BY mh.match_date DESC
      LIMIT 50
    `).all(userId, userId, userId, userId, userId, userId, userId, userId);

    return reply.send(rows);
  });


  fastify.get('/users/:id/stats', async (request, reply) => {
    const { id } = request.params as { id: string };
    const targetUserId = Number(id);

    const user = usersService.getById(targetUserId);
    if (!user) return reply.code(404).send({ error: 'User not found' });

    const row = sqlite.prepare(`
      SELECT
        COUNT(*) AS games_played,
        SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) AS wins
      FROM match_history
      WHERE player1_id = ? OR player2_id = ?
    `).get(targetUserId, targetUserId, targetUserId) as any;

    const games_played = Number(row?.games_played ?? 0);
    const wins = Number(row?.wins ?? 0);
    const losses = games_played - wins;
    const win_rate = games_played > 0 ? wins / games_played : 0;

    return reply.send({ user_id: targetUserId, games_played, wins, losses, total_games: games_played, win_rate });
  });

  fastify.get('/users/:id/history', async (request, reply) => {
    const { id } = request.params as { id: string };
    const targetUserId = Number(id);

    const user = usersService.getById(targetUserId);
    if (!user) return reply.code(404).send({ error: 'User not found' });

    const rows = sqlite.prepare(`
      SELECT
        mh.id,
        mh.game_id,
        mh.match_date,

        CASE WHEN mh.player1_id = ? THEN mh.player2_id ELSE mh.player1_id END AS opponent_id,
        CASE WHEN mh.player1_id = ? THEN u2.username ELSE u1.username END AS opponent_username,
        CASE WHEN mh.player1_id = ? THEN u2.avatar   ELSE u1.avatar   END AS opponent_avatar,

        CASE WHEN mh.player1_id = ? THEN mh.player1_score ELSE mh.player2_score END AS my_score,
        CASE WHEN mh.player1_id = ? THEN mh.player2_score ELSE mh.player1_score END AS opponent_score,

        CASE WHEN mh.winner_id = ? THEN 1 ELSE 0 END AS did_win
      FROM match_history mh
      JOIN users u1 ON u1.id = mh.player1_id
      JOIN users u2 ON u2.id = mh.player2_id
      WHERE mh.player1_id = ? OR mh.player2_id = ?
      ORDER BY mh.match_date DESC
      LIMIT 50
    `).all(targetUserId, targetUserId, targetUserId, targetUserId, targetUserId, targetUserId, targetUserId, targetUserId);

    return reply.send(rows);
  });

  // ----------- FRIENDSHIPS

  // List friendship requests
  fastify.get('/friends/requests', { preValidation: [fastify.auth] }, async (request, reply) => {
    const me = (request as any).user.id as number;
    return usersService.listFriendRequests(me);
  });

  // Incoming only
  fastify.get('/friends/requests/incoming', { preValidation: [fastify.auth] }, async (request, reply) => {
    const me = (request as any).user.id as number;
    return reply.send(usersService.listFriendRequests(me).incoming);
  });

  // Outgoing only
  fastify.get('/friends/requests/outgoing', { preValidation: [fastify.auth] }, async (request, reply) => {
    const me = (request as any).user.id as number;
    return reply.send(usersService.listFriendRequests(me).outgoing);
  });

  // Decline an incoming request (requester id is param)
  fastify.post('/friends/:id/decline', { preValidation: [fastify.auth] }, async (request, reply) => {
    const me = (request as any).user.id as number;
    const fromId = Number((request.params as any).id);

    if (!Number.isFinite(fromId)) return reply.code(400).send({ error: 'Invalid user id' });

    const ok = usersService.deletePendingFriendRequest(fromId, me);
    if (!ok) return reply.code(404).send({ error: 'Friend request not found' });

    return { ok: true };
  });

  // Cancel an outgoing request (target id is param)
  fastify.post('/friends/:id/cancel', { preValidation: [fastify.auth] }, async (request, reply) => {
    const me = (request as any).user.id as number;
    const toId = Number((request.params as any).id);

    if (!Number.isFinite(toId)) return reply.code(400).send({ error: 'Invalid user id' });

    const ok = usersService.deletePendingFriendRequest(me, toId);
    if (!ok) return reply.code(404).send({ error: 'Outgoing request not found' });

    return { ok: true };
  });


  // ---------- 2FA ROUTES

  // Generate the secret key and QR code URL
  fastify.get(
    '/2fa/generate',
    // @ts-expect-error auth decorator
    { preValidation: [fastify.auth] },
    async (request, reply) => {
      const userId = (request as any).user.id as number;
      const user = usersService.getById(userId);

      if (!user) return reply.code(404).send({ error: 'User not found' });
      if (user.two_fa_enabled) return reply.code(400).send({ error: '2FA is already enabled' });

      const { base32, otpauthUrl } = usersService.generateTwoFactorSecret(user.username);

      // Temporarily save the secret until the user verifies it
      usersService.saveTwoFactorSecret(user.id, base32);

      // Return the secret key and a URL to generate the QR code
      return reply.send({ secret: base32, otpauthUrl });
    }
  );

  // Verify the code and enable 2FA permanently
  fastify.post(
    '/2fa/enable',
    // @ts-expect-error auth decorator
    { preValidation: [fastify.auth] },
    async (request, reply) => {
      const body = request.body as { token: string };
      const { token } = body;
      const userId = (request as any).user.id as number;
      const user = usersService.getById(userId);

      if (!user) return reply.code(404).send({ error: 'User not found' });
      if (!user.two_fa_secret) return reply.code(400).send({ error: '2FA setup not initiated' });

      const isTokenValid = usersService.verifyTwoFactorCode(user.two_fa_secret, token);

      if (isTokenValid) {
        usersService.enableTwoFactor(userId);
        return reply.send({ ok: true, message: '2FA enabled successfully!' });
      } else {
        return reply.code(401).send({ error: 'Invalid verification code' });
      }
    }
  );

  // Disable 2FA
  fastify.post(
    '/2fa/disable',
    // @ts-expect-error auth decorator
    { preValidation: [fastify.auth] },
    async (request, reply) => {
      const userId = (request as any).user.id as number;
      usersService.disableTwoFactor(userId);
      return reply.send({ ok: true, message: '2FA disabled successfully.' });
    }
  );

  // ---------- FRIENDS ----------

  fastify.post('/friends/:id/add', { preValidation: [fastify.auth] }, async (request, reply) => {
    const toId = Number((request.params as any).id);
    const fromId = (request as any).user.id as number;

    const result = friendsService.request(fromId, toId);
    if (!result.ok) {
      const code =
        result.error === 'Invalid user id' ? 400 :
        result.error === 'Cannot friend yourself' ? 400 :
        result.error === 'User not found' ? 404 :
        400;

      return reply.code(code).send({ error: result.error });
    }
    return reply.send({ ok: true });
  });

  fastify.post('/friends/:id/accept', { preValidation: [fastify.auth] }, async (request, reply) => {
    const fromId = Number((request.params as any).id);
    const toId = (request as any).user.id as number;

    const res = friendsService.accept(fromId, toId);
    if (!res.ok) {
      const code = res.error === 'Friend request not found' ? 404 : 400;
      return reply.code(code).send({ error: res.error });
    }
    return reply.send({ ok: true });
  });

  fastify.get('/friends', { preValidation: [fastify.auth] }, async (request, reply) => {
    const myId = (request as any).user.id as number;
    return reply.send(friendsService.listFriends(myId));
  });

  fastify.delete('/friends/:id', { preValidation: [fastify.auth] }, async (request, reply) => {
    const myId = (request as any).user.id as number;
    const otherId = Number((request.params as any).id);
    friendsService.remove(myId, otherId);
    return reply.send({ ok: true });
  });

  fastify.addHook('preHandler', async (request) => {
    const u = (request as any).user;
    if (u?.id) {
      usersService.touchLastSeen(u.id);
    }
  });
};

export default usersRoutes;
