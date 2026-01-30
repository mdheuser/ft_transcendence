import usersService from '../users/users.service';
import type { PublicUser, FriendRequestsPayload } from '../users/users.service';

type FriendRequestResult =
  | { ok: true; action: 'created' | 'accepted' }
  | {
      ok: false;
      error:
        | 'Invalid user id'
        | 'Cannot friend yourself'
        | 'User not found'
        | 'Already friends'
        | 'Friend request already exists';
    };

class FriendsService {
  request(fromId: number, toId: number): FriendRequestResult {
    if (!Number.isFinite(toId)) return { ok: false, error: 'Invalid user id' };
    if (fromId === toId) return { ok: false, error: 'Cannot friend yourself' };

    const target = usersService.getById(toId);
    if (!target) return { ok: false, error: 'User not found' };

    // Hide AI completely so it cannot be friended
    if (target.username === 'AI') {
      return { ok: false as const, error: 'User not found' as const };
    }
    
    const existing = usersService.getFriendRequestStatus(fromId, toId);
    if (existing) {
      if (existing === 'accepted') return { ok: false, error: 'Already friends' };
      return { ok: false, error: 'Friend request already exists' };
    }

    const reverse = usersService.getFriendRequestStatus(toId, fromId);
    if (reverse === 'pending') {
      usersService.acceptFriendRequest(toId, fromId);
      return { ok: true, action: 'accepted' };
    }
    if (reverse === 'accepted') {
      return { ok: false, error: 'Already friends' };
    }

    try {
      usersService.createFriendRequest(fromId, toId);
      return { ok: true, action: 'created' };
    } catch {
      return { ok: false, error: 'Friend request already exists' };
    }
  }

  accept(fromId: number, toId: number): { ok: boolean; error?: string } {
    const status = usersService.getFriendRequestStatus(fromId, toId);
    if (!status) return { ok: false, error: 'Friend request not found' };
    if (status !== 'pending') return { ok: false, error: 'Friend request not pending' };

    const ok = usersService.acceptFriendRequest(fromId, toId);
    return ok ? { ok: true } : { ok: false, error: 'Friend request not found' };
  }

  remove(myId: number, otherId: number): void {
    usersService.deleteFriendship(myId, otherId);
  }

  listFriends(userId: number): PublicUser[] {
    return usersService.listFriends(userId);
  }

  listRequests(userId: number): FriendRequestsPayload {
    return usersService.listFriendRequests(userId);
  }

  decline(fromId: number, toId: number): boolean {
    return usersService.deletePendingFriendRequest(fromId, toId);
  }

  cancel(fromId: number, toId: number): boolean {
    return usersService.deletePendingFriendRequest(fromId, toId);
  }
}

export default new FriendsService();
