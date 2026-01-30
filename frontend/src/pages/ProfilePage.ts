import { Page } from '../router/Router';
import { apiCall } from '../services/ApiConfig';

import * as QRCode from 'qrcode'; // Assuming qrcode library is installed or proxied
import {
  listUsers,
  listFriends,
  getFriendRequests,
  addFriend,
  acceptFriend,
  declineFriend,
  cancelOutgoing,
  removeFriend,
  type PublicUser,
  type FriendRequestsPayload,
} from '../services/friendsApi';
import { renderNav } from '../ui/nav';

type OnlineStatus = 'online' | 'offline';

interface UserProfile {
    id: number;
    username: string;
    email: string | null;
    avatar: string | null;
    online_status: OnlineStatus;
    last_seen: number | null;
    two_fa: boolean;
}

export class ProfilePage implements Page {
    private currentUser: UserProfile | null = null;
    private appElement: HTMLElement | null = null;
    private secretBase32: string | null = null;
    private is2faPending: boolean = false;
    //private rootEl: HTMLElement | null = null;
    private friendsPanelEl: HTMLElement | null = null;
    private isActive = false;
    private pollId: number | null = null;
    private refreshInFlight = false;
    private friendsPanelBound = false;
    private lastFriendsFingerprint = '';

    private friendsState: {
        users: PublicUser[];
        friends: PublicUser[];
        requests: FriendRequestsPayload;
        loading: boolean;
        error: string | null;
    } = {
        users: [],
        friends: [],
        requests: { incoming: [], outgoing: [] },
        loading: false,
        error: null,
    };
    private onFriendsClickBound = (e: Event) => this.onFriendsClick(e);

    private startFriendsPolling(): void {
        if (this.pollId !== null) return;
        this.pollId = window.setInterval(() => {
            if (!this.isActive) return;
            void this.refreshFriendsState();
        }, 4000);
    }

    private stopFriendsPolling(): void {
        if (this.pollId !== null) {
            clearInterval(this.pollId);
            this.pollId = null;
        }
    }


    private computeFriendsFingerprint(): string {
        const users    = (this.friendsState.users ?? []).map(u => u.id).sort((a, b) => a - b);
        const incoming = (this.friendsState.requests?.incoming ?? []).map(u => u.id).sort((a, b) => a - b);
        const outgoing = (this.friendsState.requests?.outgoing ?? []).map(u => u.id).sort((a, b) => a - b);
        const friends  = (this.friendsState.friends ?? []).map(u => u.id).sort((a, b) => a - b);

        return JSON.stringify({ users, incoming, outgoing, friends });
    }

    private async onFriendsClick(e: Event): Promise<void> {
        const btn = (e.target as HTMLElement).closest('button[data-action][data-id]') as HTMLButtonElement | null;
        if (!btn) return;

        const action = btn.dataset.action;
        const idStr = btn.dataset.id;
        if (!action || !idStr) return;

        const userId = Number(idStr);
        if (!Number.isFinite(userId)) return;

        await this.handleFriendAction(action, userId);
    }

    constructor() {
        // Check URL parameters for pending 2FA login status
        const urlParams = new URLSearchParams(window.location.search);
        this.is2faPending = urlParams.get('2fa') === 'required';
    }

    private async handleAddFriend(userId: number) {
        await addFriend(userId);
        await this.refreshFriendsState();
    }

    private async handleAcceptFriend(userId: number) {
        await acceptFriend(userId);
        await this.refreshFriendsState();
    }

    private async handleDeclineFriend(userId: number) {
        await declineFriend(userId);
        await this.refreshFriendsState();
    }

    private async handleCancelOutgoing(userId: number) {
        await cancelOutgoing(userId);
        await this.refreshFriendsState();
    }

    private async handleRemoveFriend(userId: number) {
        await removeFriend(userId);
        await this.refreshFriendsState();
    }

    private async fetchUser(): Promise<void> {
        if (this.is2faPending) return;

        try {
            const response = await apiCall('/me');
            if (!this.isActive) return;

            if (!response.ok) {
                if (response.status === 401) localStorage.removeItem('auth_token');
                this.currentUser = null;
                return;
            }

            const data = (await response.json()) as UserProfile;
            if (!this.isActive) return;

            this.currentUser = data;
        } catch (e) {
            console.error('Error fetching user:', e);
            this.currentUser = null;
        }
    }

    private async refreshFriendsState(): Promise<void> {
        if (this.refreshInFlight) return;
        this.refreshInFlight = true;

        try {
            const [users, friends, requests] = await Promise.all([
            listUsers(),
            listFriends(),
            getFriendRequests(),
            ]);

            if (!this.isActive) return;

            this.friendsState.users = users;
            this.friendsState.friends = friends;
            this.friendsState.requests = requests;
            this.friendsState.error = null;

            const fp = this.computeFriendsFingerprint();
            if (fp !== this.lastFriendsFingerprint) {
            this.lastFriendsFingerprint = fp;
            this.drawFriendsUI();
            }
        } catch (e: any) {
            if (!this.isActive) return;
            this.friendsState.error = e?.message ?? 'Failed to refresh friends';
            this.drawFriendsUI();
        } finally {
            this.refreshInFlight = false;
        }
    }

    private renderLogin(): string {
        return `
            <div class="header">
            <h1>🔐 Sign in / Register</h1>
            ${renderNav()}
            </div>

            <div class="container" style="max-width: 420px; margin-top: 40px;">
            <div class="tournament-form">
                <h2>Email & Password</h2>
                
                <div class="form-group">
                <input type="email" id="loginEmail" placeholder="Email" />
                </div>

                <div class="form-group">
                <input type="password" id="loginPassword" placeholder="Password" />
                </div>

                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 10px;">
                <button class="btn" id="loginBtn">Login</button>
                <button class="btn btn-secondary" id="registerBtn">Register</button>
                </div>
            </div>

            <div id="message" class="error" style="display: none; margin-top: 20px;"></div>
            </div>
        `;
    }

    render(): string {
        if (this.is2faPending) {
            return this.render2faPrompt();
        }

        if (!this.currentUser) {
            // Render a loading state or a redirection message
            //return '<div>Loading profile...</div>';
            return this.renderLogin();
        }

        const avatarSrc = this.currentUser.avatar ?? '/api/uploads/avatars/default-avatar.png';

        const twoFaStatus = this.currentUser.two_fa
            ? `<span style="color: #2ecc71;">Enabled</span>`
            : `<span style="color: #e74c3c;">Disabled</span>`;

        const twoFaAction = this.currentUser.two_fa
            ? `<button class="btn btn-secondary" id="disable2faBtn">Disable 2FA</button>`
            : `<button class="btn" id="setup2faBtn">Set up 2FA</button>`;

        const setupForm = this.secretBase32
            ? this.render2faSetupForm()
            : '';

        return `
            <div class="header">
                <h1>Profile Settings</h1>
                ${renderNav()}
            </div>
            <div class="max-w-5xl mx-auto p-4">
                <div class="tournament-form">
                    <div style="display: flex; align-items: center; gap: 15px; margin: 15px 0;">
                        <img
                            src="${avatarSrc}"
                            alt="Avatar"
                            style="width: 120px; height: 120px; border-radius: 9999px; object-fit: cover; border: 1px solid rgba(0, 255, 136, 0.2);"
                            onerror="this.onerror=null;this.src='/api/uploads/avatars/default-avatar.png';"
                        />
                    </div>

                    <div style="margin: 10px 0 20px;">
                        <input type="file" id="avatarFile" accept="image/png,image/jpeg,image/webp" />
                        <button class="btn" id="uploadAvatarBtn" style="margin-left: 10px;">Upload</button>
                    </div>
                    <p style="opacity:0.70; margin-top: 10px;">Display name (unique):</p>

                    <div style="margin: 10px 0 20px;">
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input
                        type="text"
                        id="editUsername"
                        value="${this.currentUser.username}"
                        placeholder="Choose a unique display name"
                        style="flex:1; background-color:#000; color:#fff; border:1px solid #333; padding:8px 10px;"
                        />
                        <button class="btn" id="saveUsernameBtn">Save</button>
                    </div>

                    <p><strong>Email:</strong> ${this.currentUser.email}</p>
                    <hr style="margin: 20px 0; border-color: rgba(0, 255, 136, 0.2);" />

                    <h2>Two-Factor Authentication</h2>
                    <p>Status: ${twoFaStatus}</p>
                    <div style="margin-top: 15px;">
                        ${twoFaAction}
                    </div>

                    ${setupForm}
                    <hr style="margin: 20px 0; border-color: rgba(0, 255, 136, 0.2);" />

                    <h2 class="text-xl font-semibold mt-6">Dashboard</h2>
                    <div id="statsPanel" class="mt-3 opacity-80">Loading…</div>

                    <hr style="margin: 20px 0; border-color: rgba(0, 255, 136, 0.2);" />

                    <h2 class="text-xl font-semibold mt-6">Recent Matches</h2>
                    <div id="historyPanel" style="opacity: 0.85;">Loading match history...</div>

                    <hr style="margin: 20px 0; border-color: rgba(0, 255, 136, 0.2);" />
                    
                    <h2 class="text-xl font-semibold mt-6">Friendships</h2>

                    <section id="friends-panel" style="border:0px solid red; margin-top:16px;">
                    FRIENDS PANEL PLACEHOLDER
                    </section>

                    <hr style="margin: 20px 0; border-color: rgba(0, 255, 136, 0.2);" />
                    <button class="btn" id="logoutBtn" style="background: #e74c3c; border-color: #c0392b;">Logout</button>

                </div>
                <div id="message" class="error" style="display: none; margin-top: 20px;"></div>
            </div>
        `;
    }

    render2faPrompt(): string {
        return `
            <div class="header">
                <h1>🔒 Two-Factor Authentication</h1>
                <nav class="nav">
                    <a href="/" data-link="/">Home</a>
                </nav>
            </div>
            <div class="container" style="max-width: 400px; text-align: center; margin-top: 50px;">
                <div class="tournament-form">
                    <h2>Verification Required</h2>
                    <p>Please enter the 6-digit code from your authenticator app to log in.</p>

                    <div class="form-group" style="max-width: 250px; margin: 20px auto;">
                        <input type="text" id="2faLoginCodeInput" placeholder="6-digit code" maxlength="6" />
                    </div>
                    <button class="btn" id="submit2faLoginBtn">Verify & Log In</button>
                </div>
                <div id="message" class="error" style="display: none; margin-top: 20px;"></div>
            </div>
        `;
    }

    render2faSetupForm(): string {
        return `
            <div id="twoFaSetupContainer" style="margin-top: 20px; text-align: center;">
                <h3>1. Scan QR Code</h3>
                <canvas id="qrCodeCanvas" style="border: 2px solid #00ff88; margin: 15px auto; display: block;"></canvas>
                <p>Or manually enter this secret key: <strong>${this.secretBase32}</strong></p>

                <h3 style="margin-top: 20px;">2. Enter Verification Code</h3>
                <div class="form-group" style="max-width: 300px; margin: 10px auto;">
                    <input type="text" id="2faCodeInput" placeholder="6-digit code" maxlength="6" />
                </div>
                <button class="btn" id="verify2faBtn">Verify & Enable</button>
            </div>
        `;
    }

    mount(root?: HTMLElement): void {
        this.isActive = true;
        this.stopFriendsPolling();
        this.appElement = root ?? document.getElementById('app');
        if (!this.appElement) return;

        this.fetchUser()
            .then(async () => {
            if (!this.isActive || !this.appElement) return;

            this.appElement.innerHTML = this.render();

            this.attachEventListeners();
            this.drawQrCode();

            if (!this.currentUser || this.is2faPending) return;
            this.initFriendsPanel(this.appElement);

            await this.refreshFriendsState(); 

            // This makes the other browser update without reload:
            this.startFriendsPolling();
            void this.loadStatsAndHistory();
        })
        .catch((err) => {
            console.error('[ProfilePage] mount error:', err);
        });
    }

    private escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    private rowHtml(left: string, right: string): string {
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.08);">
            <div>${left}</div>
            <div style="display:flex; gap:8px;">${right}</div>
            </div>
        `;
    }

    private drawFriendsUI(): void {
        if (!this.friendsPanelEl) return;

        if (this.friendsState.loading) {
            this.friendsPanelEl.innerHTML = `<h2>Friends</h2><div>Loading...</div>`;
            return;
        }

        if (this.friendsState.error) {
            this.friendsPanelEl.innerHTML = `<h2>Friends</h2><div class="error">${this.escapeHtml(this.friendsState.error)}</div>`;
            return;
        }

        const incoming = this.friendsState.requests.incoming ?? [];
        const outgoing = this.friendsState.requests.outgoing ?? [];
        const friends = this.friendsState.friends ?? [];
        const users = this.friendsState.users ?? [];

        const incomingIds = new Set(incoming.map(u => u.id));
        const outgoingIds = new Set(outgoing.map(u => u.id));
        const friendIds = new Set(friends.map(u => u.id));

        const incomingHtml = incoming.map(u => {
            const name = this.escapeHtml(u.username);
            const buttons = `
            <button class="btn btn-secondary" data-action="accept" data-id="${u.id}">Accept</button>
            <button class="btn btn-secondary" data-action="decline" data-id="${u.id}">Decline</button>
            `;
            return this.rowHtml(name, buttons);
        }).join('');

        const outgoingHtml = outgoing.map(u => {
            const name = this.escapeHtml(u.username);
            const buttons = `
            <button class="btn btn-secondary" disabled>Pending</button>
            <button class="btn btn-secondary" data-action="cancel" data-id="${u.id}">Cancel</button>
            `;
            return this.rowHtml(name, buttons);
        }).join('');

        const friendsHtml = friends.map((u) => {
            const name = this.escapeHtml(u.username);

            const isOnline = u.online_status === 'online';
            const dotClass = isOnline ? 'bg-emerald-500' : 'bg-slate-400';
            const statusLabel = isOnline ? 'Online' : 'Offline';

            // LEFT CELL (name + dot + status)
            const leftHtml = `
                <div class="flex items-center gap-2">
                <span class="inline-block h-2 w-2 rounded-full ${dotClass}" aria-hidden="true"></span>
                <span class="font-medium text-slate-200">${name}</span>
                <span class="text-sm text-slate-500">${statusLabel}</span>
                </div>
            `;

            // RIGHT CELL (actions)
            const buttons = `
                <button
                class="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-900 hover:bg-slate-300 active:bg-slate-400 transition"
                data-action="remove"
                data-id="${u.id}"
                >
                Remove
                </button>
            `;

            return this.rowHtml(leftHtml, buttons);
        }).join('');


        const usersHtml = users
        .filter(u => !this.currentUser || u.id !== this.currentUser.id) // hide self
        .map(u => {
        const name = this.escapeHtml(u.username);

        let buttons = '';
        if (friendIds.has(u.id)) {
            buttons = `<button class="btn btn-secondary" disabled>Friends</button>`;
        } else if (incomingIds.has(u.id)) {
            buttons = `<button class="btn btn-secondary" data-action="accept" data-id="${u.id}">Accept</button>
                    <button class="btn btn-secondary" data-action="decline" data-id="${u.id}">Decline</button>`;
        } else if (outgoingIds.has(u.id)) {
            buttons = `<button class="btn btn-secondary" disabled>Pending</button>
                    <button class="btn btn-secondary" data-action="cancel" data-id="${u.id}">Cancel</button>`;
        } else {
            buttons = `<button class="btn btn-secondary" data-action="add" data-id="${u.id}">Add</button>`;
        }

        return this.rowHtml(name, buttons);
        })
        .join('');

        this.friendsPanelEl.innerHTML = `
            <h3 class="mt-5 tracking-wide">Incoming requests:</h3>
            ${incomingHtml || `<div class="opacity-70">(0)</div>`}

            <h3 class="mt-5 tracking-wide">Outgoing requests:</h3>
            ${outgoingHtml || `<div class="opacity-70">(0)</div>`}

            <h3 class="mt-5 tracking-wide">Friends:</h3>
            ${friendsHtml || `<div class="opacity-70">(0)</div>`}

            <h3 class="mt-5 tracking-wide">Discover users:</h3>
            ${usersHtml || `<div class="opacity-70">(0)</div>`}
        `;
    }

    private async refreshFriendsUI(): Promise<void> {
        if (!this.currentUser) return;

        this.friendsState.loading = true;
        this.friendsState.error = null;

        try {
            const [users, friends, requests] = await Promise.all([
            listUsers(),
            listFriends(),
            getFriendRequests(),
            ]);

            if (!this.isActive) return;

            // Filter out myself from the “all users” list
            const myId = this.currentUser.id;
            this.friendsState.users = users.filter(u => u.id !== myId);
            this.friendsState.friends = friends;
            this.friendsState.requests = requests;
        } catch (err) {
            if (!this.isActive) return;
            this.friendsState.error =
            err instanceof Error ? err.message : 'Failed to load friends';
        } finally {
            if (!this.isActive) return;
            this.friendsState.loading = false;
            this.drawFriendsUI(); // <-- THIS is what makes it appear
        }
    }

    private initFriendsPanel(root: HTMLElement): void {
        this.friendsPanelEl = root.querySelector('#friends-panel') as HTMLElement | null;
        if (!this.friendsPanelEl) return;

        if (this.friendsPanelBound) return;
        this.friendsPanelBound = true;

        this.friendsPanelEl.addEventListener('click', this.onFriendsClickBound);
    }

    private async handleFriendAction(action: string, userId: number): Promise<void> {
        try {
            if (action === 'add') await addFriend(userId);
            else if (action === 'accept') await acceptFriend(userId);
            else if (action === 'decline') await declineFriend(userId);
            else if (action === 'cancel') await cancelOutgoing(userId);
            else if (action === 'remove') await removeFriend(userId);
            else return;

            await this.refreshFriendsState();
        } catch (e: any) {
            this.friendsState.error = e?.message ?? 'Friend action failed';
            this.drawFriendsUI();
        }
    }

    private drawQrCode(): void {
        const canvas = document.getElementById('qrCodeCanvas') as HTMLCanvasElement;
        if (canvas && this.secretBase32) {
            // Re-generate the otpauthUrl using the username and secret
            // NOTE: We assume the structure matches what the backend generates
            // for the current user's username.
            const otpauthUrl = `otpauth://totp/ft_transcendence%20(${this.currentUser?.username})?secret=${this.secretBase32}`;

            // Use the assumed qrcode library to draw the code
            QRCode.toCanvas(canvas, otpauthUrl, (error) => {
                if (error) console.error('QR Code generation failed:', error);
            });
        }
    }

    private attachEventListeners(): void {
        const setup2faBtn = document.getElementById('setup2faBtn');
        const disable2faBtn = document.getElementById('disable2faBtn');
        const verify2faBtn = document.getElementById('verify2faBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const submit2faLoginBtn = document.getElementById('submit2faLoginBtn');
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');
        const googleSignInBtn = document.getElementById('googleSignInBtn');
        const uploadBtn = document.getElementById('uploadAvatarBtn');
        const fileInput = document.getElementById('avatarFile') as HTMLInputElement | null;
        const messageEl = document.getElementById('message');
        const saveBtn = document.getElementById('saveUsernameBtn');
            saveBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                void this.handleSaveUsername();
        });
        
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.handleLogin());
        }
        
        if (registerBtn) { 
            registerBtn.addEventListener('click', () => this.handleRegister());
        }

        if (googleSignInBtn) {
            googleSignInBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = (e.target as HTMLAnchorElement).href;
            });
        }

        if (submit2faLoginBtn) {
            submit2faLoginBtn.addEventListener('click', () => this.handle2faLoginSubmit());
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        if (setup2faBtn) {
            setup2faBtn.addEventListener('click', () => this.handleSetup2fa());
        }

        if (disable2faBtn) {
            disable2faBtn.addEventListener('click', () => this.handleDisable2fa());
        }

        if (verify2faBtn) {
            verify2faBtn.addEventListener('click', () => this.handleVerify2fa());
        }


        if (uploadBtn) {
            uploadBtn.addEventListener('click', async () => {
                const file = fileInput?.files?.[0];
                if (!file) {
                    this.showMessage('Please choose an image file first.', 'error');
                    return;
                }

                const token = localStorage.getItem('auth_token');
                if (!token) {
                    this.showMessage('Missing token. Please log in again.', 'error');
                    return;
                }

                const form = new FormData();
                form.append('avatar', file);

                const res = await fetch('/api/users/me/avatar', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    body: form,
                });

                const data = await res.json().catch(() => ({}));

                if (!res.ok) {
                    this.showMessage(data?.error || 'Avatar upload failed.', 'error');
                    return;
                }
                // simplest: refresh so render() re-fetches /me and shows new avatar
                window.location.reload();
            });
        }
    }

    private async handle2faLoginSubmit(): Promise<void> {
        const tempToken = sessionStorage.getItem('temp_2fa_token');
        if (!tempToken) {
             this.showMessage('Session expired. Please try logging in again.', 'error');
             window.history.pushState({}, '', '/');
             window.dispatchEvent(new PopStateEvent('popstate'));
             return;
        }

        const tokenInput = document.getElementById('2faLoginCodeInput') as HTMLInputElement;
        const twoFaToken = tokenInput ? tokenInput.value.trim() : '';

        if (!twoFaToken || twoFaToken.length !== 6) {
            this.showMessage('Please enter a valid 6-digit code.', 'error');
            return;
        }

        // Send the 2FA code using the temporary token for authorization
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tempToken}` // Use the temporary token
                },
                body: JSON.stringify({
                    two_fa_token: twoFaToken // The 6-digit code being verified
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Backend issued the FINAL permanent token
                sessionStorage.removeItem('temp_2fa_token'); // Clear temp token
                localStorage.setItem('auth_token', data.token); // Store permanent token

                const meRes = await apiCall('/me');
                if (meRes.ok) {
                    const me = await meRes.json();
                    localStorage.setItem('current_user', JSON.stringify(me));
                }

                // Redirect home and refresh state
                window.history.pushState({}, '', '/');
                window.dispatchEvent(new PopStateEvent('popstate'));
            } else {
                this.showMessage(data.error || 'Invalid 2FA code. Please try again.', 'error');
            }
        } catch (e) {
            this.showMessage('Network error during 2FA login.', 'error');
        }
    }

    private async handleLogin(): Promise<void> {
        const emailEl = document.getElementById('loginEmail') as HTMLInputElement | null;
        const passEl = document.getElementById('loginPassword') as HTMLInputElement | null;

        const email = emailEl?.value.trim() ?? '';
        const password = passEl?.value ?? '';

        if (!email || !password) {
            this.showMessage('Please enter email and password.', 'error');
            return;
        }

        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
            this.showMessage(data?.error ?? 'Login failed.', 'error');
            return;
        }

        if (!data?.token) {
            this.showMessage('Login succeeded but no token returned.', 'error');
            return;
        }

        localStorage.setItem('auth_token', data.token);
        if (data?.user) {
            localStorage.setItem('current_user', JSON.stringify(data.user));
        }
        window.history.pushState({}, '', '/profile');
        window.dispatchEvent(new PopStateEvent('popstate'));
    }

    private async handleRegister(): Promise<void> {
        const emailEl = document.getElementById('loginEmail') as HTMLInputElement | null;
        const passEl = document.getElementById('loginPassword') as HTMLInputElement | null;

        const email = emailEl?.value.trim() ?? '';
        const password = passEl?.value ?? '';

        if (!email || !password) {
            this.showMessage('Please enter email and password.', 'error');
            return;
        }

        // simple username default: take local part of email
        const username = email.split('@')[0] || 'user';

        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
            this.showMessage(data?.error ?? 'Register failed.', 'error');
            return;
        }

        if (!data?.token) {
            this.showMessage('Register succeeded but no token returned.', 'error');
            return;
        }

        localStorage.setItem('auth_token', data.token);
        window.history.pushState({}, '', '/profile');
        window.dispatchEvent(new PopStateEvent('popstate'));
    }


    private async handleLogout(): Promise<void> {
        await apiCall('/logout', { method: 'POST' });
        localStorage.removeItem('auth_token');
        localStorage.removeItem('current_user');
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
    }

    private async handleSetup2fa(): Promise<void> {
        try {
            this.showMessage('Generating 2FA secret...', 'success');
            const response = await apiCall('/2fa/generate');
            const data = await response.json();

            if (response.ok) {
                this.secretBase32 = data.secret;
                this.refreshPage();
                this.showMessage('Secret generated. Scan the code to enable 2FA.', 'success');
            } else {
                this.showMessage(data.error || 'Failed to generate 2FA secret.', 'error');
            }
        } catch (e) {
            this.showMessage('Network error during 2FA setup.', 'error');
        }
    }

    private async handleVerify2fa(): Promise<void> {
        const tokenInput = document.getElementById('2faCodeInput') as HTMLInputElement;
        const token = tokenInput ? tokenInput.value.trim() : '';

        if (!token || token.length !== 6) {
            this.showMessage('Please enter a valid 6-digit code.', 'error');
            return;
        }

        try {
            const response = await apiCall('/2fa/enable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            const data = await response.json();

            if (response.ok) {
                this.showMessage(data.message, 'success');
                this.secretBase32 = null; // Clear setup form
                this.currentUser!.two_fa = true; // Optimistic update
                this.refreshPage();
            } else {
                this.showMessage(data.error || 'Invalid 2FA code.', 'error');
            }
        } catch (e) {
            this.showMessage('Network error during 2FA verification.', 'error');
        }
    }

    private async handleDisable2fa(): Promise<void> {
        if (!confirm("Are you sure you want to disable Two-Factor Authentication?")) {
            return;
        }
        try {
            const response = await apiCall('/2fa/disable', { method: 'POST' });
            const data = await response.json();

            if (response.ok) {
                this.showMessage(data.message, 'success');
                this.currentUser!.two_fa = false; // Optimistic update
                this.refreshPage();
            } else {
                this.showMessage(data.error || 'Failed to disable 2FA.', 'error');
            }
        } catch (e) {
            this.showMessage('Network error during 2FA disable.', 'error');
        }
    }

    private async handleSaveUsername(): Promise<void> {
        const input = document.getElementById('editUsername') as HTMLInputElement | null;
        if (!input) return;

        const newName = input.value.trim().replace(/\s+/g, ' ');
        if (!newName) {
            this.showMessage('Display name cannot be empty.', 'error');
            return;
        }

        try {
            const res = await apiCall('/users/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: newName }),
            });

            let body: any = null;
            const ct = res.headers.get('content-type') ?? '';
            if (ct.includes('application/json')) {
            body = await res.json();
            } else {
            const text = await res.text();
            body = text ? { message: text } : null;
            }

            if (!res.ok) {
            const msg =
                body?.error ||
                body?.message ||
                `Update failed (HTTP ${res.status})`;
            this.showMessage(msg, 'error');
            return;
            }

            // success: update local state
            if (this.currentUser) this.currentUser.username = newName;
            try {
                const meStr = localStorage.getItem('current_user');
                const me = meStr ? JSON.parse(meStr) : {};
                me.username = newName;
                localStorage.setItem('current_user', JSON.stringify(me));
            } catch {
                localStorage.setItem('current_user', JSON.stringify({ username: newName }));
            }


            // if your QR is based on username or profile state, refresh it
            this.drawQrCode();

            this.showMessage('Display name updated.', 'success');
        } catch (err: any) {
            this.showMessage(err?.message ?? 'Update failed.', 'error');
        }
    }


    private renderDashboardFromStatsAndMatches(statsData: any, matches: any[]): string {
        // Prefer backend stats (fast), but be robust if it fails.
        const games = Number(statsData?.games_played ?? matches.length ?? 0);
        const winsFromApi = statsData?.wins;
        const wins = Number(winsFromApi ?? matches.filter(m => Number(m.did_win ?? 0) === 1).length);

        const lossesFromApi = statsData?.losses;
        const losses = Number(lossesFromApi ?? Math.max(0, games - wins));

        // Your backend seems to return win_rate as 0..1
        const winRateRaw = statsData?.win_rate;
        const winRatePct =
            typeof winRateRaw === 'number'
                ? Math.round(winRateRaw * 100)
                : (games > 0 ? Math.round((wins / games) * 100) : 0);

        // Last 10 bars (height = abs(score diff), green win / red loss)
        const sorted = [...matches].sort((a, b) => {
            const da = new Date(a.match_date).getTime();
            const db = new Date(b.match_date).getTime();
            return (db || 0) - (da || 0);
        });

        const last10 = sorted.slice(0, 10).map((m) => {
            const myScore = Number(m.my_score ?? 0);
            const oppScore = Number(m.opponent_score ?? 0);
            const diff = myScore - oppScore;
            const isWin = Number(m.did_win ?? 0) === 1;
            return { diff, isWin };
        });

        const maxAbs = Math.max(1, ...last10.map(x => Math.abs(x.diff)));

        const barsHtml = `
            <div class="flex items-end gap-1 h-12">
                ${last10.map((x) => {
                    const h = Math.max(10, Math.round((Math.abs(x.diff) / maxAbs) * 48));
                    const color = x.isWin ? "bg-emerald-500" : "bg-rose-500";
                    return `<div class="w-3 rounded ${color}" style="height:${h}px"></div>`;
                }).join("")}
            </div>
        `;

        return `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="rounded-2xl border border-slate-700 p-4">
                    <div class="text-sm text-slate-400">Games</div>
                    <div class="text-2xl font-bold">${games}</div>
                </div>
                <div class="rounded-2xl border border-slate-700 p-4">
                    <div class="text-sm text-slate-400">Wins</div>
                    <div class="text-2xl font-bold">${wins}</div>
                </div>
                <div class="rounded-2xl border border-slate-700 p-4">
                    <div class="text-sm text-slate-400">Losses</div>
                    <div class="text-2xl font-bold">${losses}</div>
                </div>
                <div class="rounded-2xl border border-slate-700 p-4">
                    <div class="text-sm text-slate-400">Win rate</div>
                    <div class="text-2xl font-bold">${winRatePct}%</div>
                </div>
            </div>

            <div class="mt-4 rounded-2xl border border-slate-700 p-4">
                <div class="flex items-center justify-between">
                    <div class="font-semibold">Last 10</div>
                    <div class="text-xs text-slate-400">bar height = score diff</div>
                </div>
                <div class="mt-3">${barsHtml}</div>
            </div>
        `;
    }

    private async loadStatsAndHistory(): Promise<void> {
        const statsEl = document.getElementById('statsPanel');
        const historyEl = document.getElementById('historyPanel');

        if (!statsEl || !historyEl) {
            return;
        }

        const token = localStorage.getItem('auth_token');
        if (!token) {
            statsEl.textContent = 'Not logged in.';
            historyEl.textContent = 'Not logged in.';
            return;
        }

        try {
            const [statsRes, historyRes] = await Promise.all([
                fetch('/api/me/stats', {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch('/api/me/history', {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);

            const statsData = await statsRes.json().catch(() => null);
            const historyData = await historyRes.json().catch(() => null);
            console.log('[history] raw:', historyData);
            if (!statsRes.ok) {
            }

            if (!historyRes.ok) {
                historyEl.textContent = historyData?.error ?? 'Failed to load history.';
                return;
            }

            const matches: any[] = Array.isArray(historyData) ? historyData : [];
             // Render the Tailwind dashboard using both stats + match history
            if (statsRes.ok) {
                statsEl.innerHTML = this.renderDashboardFromStatsAndMatches(statsData, matches);
            } else {
                // still try to render from matches even if stats endpoint failed
                statsEl.innerHTML = this.renderDashboardFromStatsAndMatches(null, matches);
            }

            const defaultAvatar = '/api/uploads/avatars/default-avatar.png';

            if (matches.length === 0) {
                historyEl.innerHTML = `<div>No matches yet.</div>`;
                return;
            }

            console.log('[history] first match:', matches[0]);

            const rowsHtml = matches.slice(0, 10).map((m) => {
                const oppName = String(m.opponent_username ?? 'Unknown');
                const oppAvatar = String(m.opponent_avatar ?? defaultAvatar);

                const myScore = Number(m.my_score ?? 0);
                const oppScore = Number(m.opponent_score ?? 0);
                const didWin = Number(m.did_win ?? 0) === 1;

                const rawDate = m.match_date;
                const d = new Date(rawDate);
  
                const dateLabel = isNaN(d.getTime())
                    ? String(rawDate ?? '')
                    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });


                const resultColor = didWin ? '#2ecc71' : '#e74c3c';
                const resultText = didWin ? 'WIN' : 'LOSS';

                return `
                    <div data-match-id="${m.id}" style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
                        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                            <img
                                src="${oppAvatar}"
                                alt="Opponent avatar"
                                style="width:32px; height:32px; border-radius:9999px; object-fit:cover; border:1px solid rgba(0,255,136,0.2);"
                                onerror="this.onerror=null;this.src='${defaultAvatar}';"
                            />
                            <div style="min-width:0;">
                                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:220px;">
                                    <strong>${oppName}</strong>
                                </div>
                                <div style="font-size: 0.85rem; opacity: 0.75;">${dateLabel}</div>
                            </div>
                        </div>

                        <div style="display:flex; align-items:center; gap:12px; flex-shrink:0;">
                            <div style="font-family: monospace; font-size: 1rem;">
                                ${myScore} - ${oppScore}
                            </div>
                            <div style="color:${resultColor}; font-weight:700;">
                                ${resultText}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            historyEl.innerHTML = `<div>${rowsHtml}</div>`;
            historyEl.onclick = (e) => {
                const target = e.target as HTMLElement;
                const row = target.closest('[data-match-id]') as HTMLElement | null;
                if (!row) return;

                const id = row.getAttribute('data-match-id');
                if (!id) return;

                sessionStorage.setItem('selectedMatchId', id);
                window.history.pushState({}, '', '/match');
                window.dispatchEvent(new PopStateEvent('popstate'));
            };

        } catch (err) {
            statsEl.textContent = 'Error loading stats.';
            historyEl.textContent = 'Error loading history.';
        }
    }


    private showMessage(message: string, type: 'success' | 'error'): void {
        const msgEl = document.getElementById('message');
        if (msgEl) {
            msgEl.textContent = message;
            msgEl.className = type;
            msgEl.style.display = 'block';
            setTimeout(() => {
                msgEl.style.display = 'none';
            }, 5000);
        }
    }

    private refreshPage(): void {
        if (!this.appElement) return;

        // Re-render the page to reflect updated state (2FA, avatar, etc.)
        this.appElement.innerHTML = this.render();

        // Rebind DOM listeners for the new nodes
        this.attachEventListeners();
        this.drawQrCode();

        // Friends panel: after re-render, it's a new element => must rebind
        this.friendsPanelEl = null;
        this.friendsPanelBound = false;

        if (this.currentUser && !this.is2faPending) {
            this.initFriendsPanel(this.appElement);
            void this.refreshFriendsState();
            void this.loadStatsAndHistory();
        }
    }


    unmount(): void {
        this.isActive = false;
        if (this.friendsPanelEl) {
            this.friendsPanelEl.removeEventListener('click', this.onFriendsClickBound);
        }
        this.stopFriendsPolling();
        this.friendsPanelEl = null;
        this.appElement = null;
    }
}
