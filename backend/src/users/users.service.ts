// src/users/users.service.ts
import type { Database, Statement } from 'better-sqlite3';
import * as bcrypt from 'bcrypt';
import db from '../config/database';
import speakeasy from 'speakeasy';

// Prevent the page from showing the AI user profile
const AI_USERNAME = 'AI';
const AI_AVATAR_MARKER = 'ai_player';

function isAiUserRow(u: Pick<UserRow, 'username' | 'avatar'>): boolean {
  if (u.username?.toLowerCase() === AI_USERNAME.toLowerCase()) return true;
  if (u.avatar && u.avatar.includes(AI_AVATAR_MARKER)) return true;
  return false;
}
////

export type OnlineStatus = 'online' | 'offline';

export interface UserRow {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
  display_name: string | null;
  avatar: string | null;
  is_online: number | boolean; // 0 or 1 from SQLite
  two_fa_enabled: number;
  two_fa_secret: string | null;
  last_seen: number | null; // we store Date.now(), SQLite doesn’t care
  created_at: string;       // TIMESTAMP text, we don’t really use it yet

  // Claudio's territory.
  google_id?: string | null;
  two_fa?: number;
  two_fa_code?: string | null;
}

// without email
export interface PublicUser {
  id: number;
  username: string;
  avatar: string | null;
  online_status: OnlineStatus;
  last_seen: number | null;
}

// email is added as an extension
export interface PublicUserWithEmail extends PublicUser {
  email: string | null;
  two_fa: boolean;
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
}

export type FriendRequestsPayload = {
  incoming: PublicUser[];
  outgoing: PublicUser[];
};


// helper to convert DB user to public shape / overloaded to include email
export function toPublicUser(user: UserRow): PublicUser;
export function toPublicUser(user: UserRow, includeEmail: true): PublicUserWithEmail;
export function toPublicUser(user: UserRow, includeEmail?: boolean) {
  const base: PublicUser = {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    online_status: user.is_online ? 'online' : 'offline',
    last_seen: user.last_seen
  };

  if (includeEmail) {
    const withEmail: PublicUserWithEmail = {
      ...base,
      email: user.email,
      two_fa: Boolean(user.two_fa_enabled)
    };
    return withEmail;
  }
  return base;
}

class UsersService {
  private db: Database;

  private stmtCreateProfileRow: Statement;

  private stmtCreateUser: Statement;
  private stmtGetByEmail: Statement;
  private stmtGetByEmailExcludingId: Statement;
  private stmtGetByUsername: Statement;
  private stmtUsernameTakenByOtherUser: Statement;
  private stmtGetById: Statement;
  //private stmtUpdateProfile: Statement;
  private stmtUpdateUsername: Statement;
  private stmtUpdateEmail: Statement;
  private stmtUpdateAvatar: Statement;
  private stmtUpdateStatus: Statement;

  private stmtGetByGoogleId: Statement; // for Google Authentication
  // private stmtCreateGoogleUser: Statement;
  // private stmtSaveTwoFactorSecret: Statement;
  // private stmtEnableTwoFactor: Statement;
  // private stmtDisableTwoFactor: Statement;

  private stmtCreateFriendRequest: Statement;
  private stmtGetFriendRequest: Statement;
  private stmtUpdateFriendStatus: Statement;
  private stmtDeleteFriendship: Statement;
  private stmtListFriends: Statement;
  private stmtTouchLastSeen: Statement;

  private stmtListIncomingFriendRequests: Statement;
  private stmtListOutgoingFriendRequests: Statement;
  private stmtDeletePendingFriendRequest: Statement;

  private stmtListUsersPublic: Statement;

  private stmtGetProfileStats: Statement;

  constructor(database: Database) {
    this.db = database;

    // NOTE: column names adapted to schema.sql
    this.stmtCreateProfileRow = this.db.prepare(
      'INSERT INTO user_profiles (user_id) VALUES (?)'
    );
    this.stmtCreateUser = this.db.prepare(
      'INSERT INTO users (username, email, password_hash, avatar, last_seen) VALUES (?, ?, ?, ?, ?)'
    );
    this.stmtUsernameTakenByOtherUser = this.db.prepare(`
      SELECT 1
      FROM users
      WHERE username = ?
        AND id != ?
      LIMIT 1
    `);
    this.stmtGetByEmail = this.db.prepare(
      'SELECT * FROM users WHERE email = ?'
    );
    this.stmtGetByEmailExcludingId = this.db.prepare(
      'SELECT id FROM users WHERE email = ? AND id != ?'
    );
    this.stmtGetByUsername = this.db.prepare(
      'SELECT * FROM users WHERE username = ?'
    );
    this.stmtGetById = this.db.prepare(
      'SELECT * FROM users WHERE id = ?'
    );
    // this.stmtUpdateProfile = this.db.prepare(
    //   'UPDATE users SET username = ?, email = ? WHERE id = ?' // replaced by updateUsername and updateEmail:
    // );
    this.stmtUpdateUsername = this.db.prepare(
      'UPDATE users SET username = ? WHERE id = ?'
    );
    this.stmtUpdateEmail = this.db.prepare(
      'UPDATE users SET email = ? WHERE id = ?'
    );

    this.stmtUpdateAvatar = this.db.prepare(
      'UPDATE users SET avatar = ? WHERE id = ?'
    );
    this.stmtUpdateStatus = this.db.prepare(
      'UPDATE users SET is_online = ?, last_seen = ? WHERE id = ?'
    );
    this.stmtGetByGoogleId = this.db.prepare( // for Google Authentication
      'SELECT * FROM users WHERE google_id = ?'
    );
    // this.stmtCreateGoogleUser = this.db.prepare(
    //   'INSERT INTO users (google_id, username, email, password_hash, avatar, last_seen, is_online) VALUES (?, ?, ?, ?, ?, ?, ?)'
    // );
    // this.stmtSaveTwoFactorSecret = this.db.prepare(
    //   'UPDATE users SET two_fa_code = ? WHERE id = ?'
    // );
    // this.stmtEnableTwoFactor = this.db.prepare(
    //   'UPDATE users SET two_fa = 1 WHERE id = ?'
    // );
    // this.stmtDisableTwoFactor = this.db.prepare(
    //   'UPDATE users SET two_fa = 0, two_fa_code = NULL WHERE id = ?'
    //);
    this.stmtCreateFriendRequest = this.db.prepare(
      'INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)'
    );
    this.stmtGetFriendRequest = this.db.prepare(
      "SELECT status FROM friendships WHERE user_id = ? AND friend_id = ?"
    );
    this.stmtUpdateFriendStatus = this.db.prepare(
      'UPDATE friendships SET status = ? WHERE user_id = ? AND friend_id = ?'
    );
    this.stmtDeleteFriendship = this.db.prepare(
      'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
    );
    this.stmtListFriends = this.db.prepare(`
      SELECT u.id, u.username, u.email, u.avatar, u.is_online, u.last_seen
      FROM friendships f
      JOIN users u ON (
        (f.user_id = ? AND u.id = f.friend_id)
        OR
        (f.friend_id = ? AND u.id = f.user_id)
      )
      WHERE f.status = 'accepted'
    `);

    this.stmtTouchLastSeen = this.db.prepare(
      'UPDATE users SET last_seen = ? WHERE id = ?'
    );

    this.stmtListIncomingFriendRequests = this.db.prepare(`
    SELECT u.id, u.username, u.avatar, u.is_online, u.last_seen
    FROM friendships f
    JOIN users u ON u.id = f.user_id
    WHERE f.friend_id = ?
      AND f.status = 'pending'
    ORDER BY f.id DESC
  `);

    this.stmtListOutgoingFriendRequests = this.db.prepare(`
      SELECT u.id, u.username, u.avatar, u.is_online, u.last_seen
      FROM friendships f
      JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = ?
        AND f.status = 'pending'
      ORDER BY f.id DESC
    `);

    this.stmtDeletePendingFriendRequest = this.db.prepare(`
      DELETE FROM friendships
      WHERE user_id = ?
        AND friend_id = ?
        AND status = 'pending'
    `);

    // To access the entire list of users
    this.stmtListUsersPublic = this.db.prepare(`
      SELECT id, username, email, avatar, is_online, last_seen
      FROM users
      ORDER BY username COLLATE NOCASE
    `);

    // Profile STATS
    this.stmtGetProfileStats = this.db.prepare(
      'SELECT wins, losses, total_games FROM user_profiles WHERE user_id = ?'
    );
  }

  async createUser(input: CreateUserInput): Promise<PublicUserWithEmail> {
    const hash = await bcrypt.hash(input.password, 10);
    const now = Date.now();

    const tx = this.db.transaction(() => {
      const info = this.stmtCreateUser.run(
        input.username,
        input.email,
        hash,
        null,
        now
      );
      const id = Number(info.lastInsertRowid);

      this.stmtCreateProfileRow.run(id);
      return id;
    });

    const id = tx();
    const user = this.getById(id)!;
    return toPublicUser(user, true);
  }

  getByEmail(email: string): UserRow | undefined {
    return this.stmtGetByEmail.get(email) as UserRow | undefined;
  }

  getByUsername(username: string): UserRow | undefined {
    return this.stmtGetByUsername.get(username) as UserRow | undefined;
  }

  emailTakenByOtherUser(email: string, myId: number): boolean {
    const row = this.stmtGetByEmailExcludingId.get(email, myId) as { id: number } | undefined;
    return !!row;
  }

  usernameTakenByOtherUser(username: string, myUserId: number): boolean {
    const row = this.stmtUsernameTakenByOtherUser.get(username, myUserId) as { id: number } | undefined;
    return !!row;
  }

  getById(id: number): UserRow | undefined {
    return this.stmtGetById.get(id) as UserRow | undefined;
  }

  async checkPassword(user: UserRow, plainPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, user.password_hash);
  }

  // for Google Authentication
  getByGoogleId(googleId: string): UserRow | undefined {
    return this.stmtGetByGoogleId.get(googleId) as UserRow | undefined;
  }

  async createGoogleUser(
    googleId: string,
    username: string,
    email: string | null,
    avatar: string | null
  ): Promise<PublicUser> {
    const randomPassword = (await bcrypt.hash(Date.now().toString(), 10)).substring(0, 30);
    const now = Date.now();
    const stmtCreateGoogleUser = this.db.prepare(
        'INSERT INTO users (google_id, username, email, password_hash, avatar, last_seen, is_online) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    // 'online' should probably be integer (0|1) instead.         <- Attention!
    const info = stmtCreateGoogleUser.run(
      googleId,
      username,
      email,
      randomPassword,
      avatar,
      now,
      0
    );
    const id = info.lastInsertRowid as number;
    const user = this.getById(id)!;
    return toPublicUser(user, true);
  }

  updateProfile(id: number, username?: string, email?: string): void {
    const tx = this.db.transaction(() => {
      if (username !== undefined) {
        this.stmtUpdateUsername.run(username, id);
      }
      if (email !== undefined) {
        this.stmtUpdateEmail.run(email, id);
      }
    });
    tx();
  }

  updateAvatar(id: number, avatarPath: string): void {
    this.stmtUpdateAvatar.run(avatarPath, id);
  }

  updateStatus(id: number, status: OnlineStatus): void {
    const isOnline = status === 'online' ? 1 : 0;
    this.stmtUpdateStatus.run(isOnline, Date.now(), id);
  }

  // Unique display name
  normalizeDisplayName(raw: unknown): string | null {
    if (raw === undefined) return null;
    if (raw === null) return null;

    const s = String(raw).trim();

    // Optional but recommended: collapse multiple spaces
    const collapsed = s.replace(/\s+/g, ' ');

    return collapsed.length ? collapsed : null;
  }

  isDisplayNameUniqueError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    // better-sqlite3 typically throws: "UNIQUE constraint failed: users.display_name"
    return msg.includes('UNIQUE constraint failed') && msg.includes('users.display_name');
  }


  // FRIENDS
  createFriendRequest(fromId: number, toId: number): void {
    // status defaults to 'pending', but we can set explicitly
    this.stmtCreateFriendRequest.run(fromId, toId, 'pending');
  }

  getFriendRequestStatus(fromId: number, toId: number): string | null {
    const row = this.stmtGetFriendRequest.get(fromId, toId) as { status: string } | undefined;
    return row ? row.status : null;
  }

  acceptFriendRequest(fromId: number, toId: number): boolean {
    const info = this.stmtUpdateFriendStatus.run('accepted', fromId, toId);
    return info.changes > 0;
  }

  deleteFriendship(a: number, b: number): void {
    this.stmtDeleteFriendship.run(a, b, b, a);
  }

  listFriends(userId: number): PublicUser[] {
    const rows = this.stmtListFriends.all(userId, userId) as UserRow[];
    return rows.map((u) => toPublicUser(u));
  }

  touchLastSeen(id: number): void {
    this.stmtTouchLastSeen.run(Date.now(), id);
  }

  listFriendRequests(userId: number): FriendRequestsPayload {
    const incomingRows = this.stmtListIncomingFriendRequests.all(userId) as UserRow[];
    const outgoingRows = this.stmtListOutgoingFriendRequests.all(userId) as UserRow[];

    return {
      incoming: incomingRows.map((u) => toPublicUser(u)),
      outgoing: outgoingRows.map((u) => toPublicUser(u)),
    };
  }

  // Decline incoming OR cancel outgoing (same row shape: requester -> recipient)
  deletePendingFriendRequest(fromId: number, toId: number): boolean {
    const info = this.stmtDeletePendingFriendRequest.run(fromId, toId);
    return info.changes > 0;
  }

   listUsersPublic(): PublicUser[] {
    const rows = this.stmtListUsersPublic.all() as UserRow[];
    const filtered = rows.filter((u) => !isAiUserRow(u)); // Not showing the AI profile
    return filtered.map((u) => toPublicUser(u)); // IMPORTANT: no includeEmail here
  }


  getUserStats(userId: number) {
    const row = this.stmtGetProfileStats.get(userId) as
      | { wins: number; losses: number; total_games: number }
      | undefined;

    if (!row) {
      return { wins: 0, losses: 0, total_games: 0 };
    }

    const win_rate = row.total_games > 0 ? row.wins / row.total_games : 0;
    return { ...row, win_rate};
  }

  // 2FA Methods
  saveTwoFactorSecret(id: number, secret: string): void {
    this.db.prepare('UPDATE users SET two_fa_secret = ? WHERE id = ?').run(secret, id);
  }

  enableTwoFactor(id: number): void {
    this.db.prepare('UPDATE users SET two_fa_enabled = 1 WHERE id = ?').run(id);
  }

  disableTwoFactor(id: number): void {
    this.db.prepare('UPDATE users SET two_fa_enabled = 0, two_fa_secret = NULL WHERE id = ?').run(id);
  }

  generateTwoFactorSecret(username: string): { base32: string; otpauthUrl: string } {
    const secret = speakeasy.generateSecret({
      name: `ft_transcendence (${username})`,
    });
    return {
      base32: secret.base32,
      otpauthUrl: secret.otpauth_url!,
    };
  }

  verifyTwoFactorCode(secret: string | null, token: string): boolean {
    if (!secret) return false;

    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 1, // Allow a slight time drift (1 code before or after current)
    });
  }

}

// Export a singleton service using the shared db.js
const usersService = new UsersService(db as Database);


export default usersService;

