import { apiCall } from './ApiConfig';

export type PublicUser = {
  id: number;
  username: string;
  avatar: string | null;
  online_status: 'online' | 'offline';
  last_seen: number | null;
};

export type FriendRequestsPayload = {
  incoming: PublicUser[];
  outgoing: PublicUser[];
};

async function readJsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function listFriends(): Promise<PublicUser[]> {
  const res = await apiCall('/friends');
  return (await readJsonOrThrow(res)) as PublicUser[];
}

export async function getFriendRequests(): Promise<FriendRequestsPayload> {
  const res = await apiCall('/friends/requests');
  return (await readJsonOrThrow(res)) as FriendRequestsPayload;
}

export async function listUsers(): Promise<PublicUser[]> {
  const res = await apiCall('/users');
  return (await readJsonOrThrow(res)) as PublicUser[];
}

export async function addFriend(id: number): Promise<{ ok: true }> {
  const res = await apiCall(`/friends/${id}/add`, { method: 'POST' });
  return (await readJsonOrThrow(res)) as { ok: true };
}

export async function acceptFriend(id: number): Promise<{ ok: true }> {
  const res = await apiCall(`/friends/${id}/accept`, { method: 'POST' });
  return (await readJsonOrThrow(res)) as { ok: true };
}

export async function removeFriend(id: number): Promise<{ ok: true }> {
  const res = await apiCall(`/friends/${id}`, { method: 'DELETE' });
  return (await readJsonOrThrow(res)) as { ok: true };
}

export type OkResponse = { ok: boolean; status?: 'pending' | 'accepted' };

export async function declineFriend(id: number): Promise<OkResponse> {
  const res = await apiCall(`/friends/${id}/decline`, { method: 'POST' });
  return (await readJsonOrThrow(res)) as OkResponse;
}

export async function cancelOutgoing(id: number): Promise<OkResponse> {
  const res = await apiCall(`/friends/${id}/cancel`, { method: 'POST' });
  return (await readJsonOrThrow(res)) as OkResponse;
}

