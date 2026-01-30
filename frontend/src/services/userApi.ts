// frontend/src/services/userApi.ts

/*
Wrap existing apiCall into functions like getMe(), login(), register(), getFriends(), getStats(id).
*/
import { apiCall } from './ApiConfig';
import type { PublicUserWithEmail } from './apiTypes';

async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export const userApi = {
  async me(): Promise<PublicUserWithEmail> {
    const res = await apiCall('/me');
    const data = await readJson(res);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data as PublicUserWithEmail;
  },
};

