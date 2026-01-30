// frontend/src/services/apiTypes.ts


export type ApiOk = { ok: true };
export type ApiError = { error: string };

export interface PublicUser {
  id: number;
  username: string;
  avatar: string | null;
  online_status: 'online' | 'offline'; // matches what our API returns today
  last_seen: number | null;            // or number if always present
}

export interface PublicUserWithEmail extends PublicUser {
  email: string;
}

export interface AuthResponse {
  token: string;
  user: PublicUserWithEmail;
}

export interface TwoFaRequiredResponse {
  error: 'Two-Factor Authentication required';
  two_fa_required: true;
  temp_token: string;
}

export interface StatsResponse {
  wins: number;
  losses: number;
  total_games: number;
  win_rate: number;
}
