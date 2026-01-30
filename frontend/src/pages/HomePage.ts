import { Page } from '../router/Router';
import { PongGame } from '../game/PongGame';
import { userApi } from '../services/userApi';
import { apiCall } from '../services/ApiConfig';
import type { PublicUserWithEmail } from '../services/apiTypes';
import { renderNav } from '../ui/nav';

export class HomePage implements Page {
    private currentUser: PublicUserWithEmail | null = null;
    private appElement: HTMLElement | null = null;

    private async fetchUser(): Promise<void> {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        this.currentUser = null;
        return;
    }

    try {
        const me = await userApi.me();
        this.currentUser = me;
    } catch (error) {
        // If /me fails (often 401), treat token as invalid
        localStorage.removeItem('auth_token');
        this.currentUser = null;
        console.error('Error fetching user profile:', error);
      }
    }

    render(): string {
        // Determine which authentication link to display (Login vs Logout)
          const authLink = this.currentUser
            ? `<a href="/profile" data-link="/profile" class="btn-secondary">Profile (${this.currentUser.username})</a>`
            : `
                <a href="/profile" data-link="/profile" class="btn-secondary">Login / Register</a>
                <a href="/api/auth/google" id="googleSignInBtn" class="btn">Sign in with Google</a>
            `;
        return `
            <div class="header">
                <h1>🏓 ft_transcendence</h1>
                <p>The Ultimate Pong Experience</p>
                ${renderNav()}
            </div>
            <div class="container">
                <div style="text-align: center; margin-top: 100px;">
                    <h2>Welcome to the Pong Championship!</h2>
                    ${this.currentUser ? `<h3>Welcome back, ${this.currentUser.username}!</h3>` : ''}
                    <p style="margin: 20px 0;">Challenge your friends in epic 1v1 battles</p>

                    <div style="margin-top: 50px;">
                        <button class="btn" id="singleBtn">Single Player</button>
                        <button class="btn" id="quickPlayBtn">Quick Play (2 Players)</button>
                        <button class="btn btn-secondary" id="tournamentBtn">Start Tournament</button>
                    </div>

                    <div class="controls-info" style="max-width: 600px; margin: 50px auto;">
                        <h3>How to Play</h3>
                        <p><strong>Player 1:</strong> W (up) / S (down)</p>
                        <p><strong>Player 2:</strong> O (up) / L (down)</p>
                        <p style="margin-top: 15px;">First to ${PongGame.WINNING_SCORE} points wins!</p>
                    </div>
                </div>
            </div>
        `;
    }

    mount(): void {
        this.appElement = document.getElementById('app');

        // 1. Fetch user data
        this.fetchUser().then(() => {
            if (this.appElement) {
                // 2. Re-render the content with the updated state
                this.appElement.innerHTML = this.render();
                // 3. Re-attach event listeners to the new DOM elements
                this.attachEventListeners();
            }
        });

        // Attach listeners for the first render while waiting for the fetch
        this.attachEventListeners();
    }

    private attachEventListeners(): void {
        const singleBtn = document.getElementById('singleBtn');
        const quickPlayBtn = document.getElementById('quickPlayBtn');
        const tournamentBtn = document.getElementById('tournamentBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const googleSignInBtn = document.getElementById('googleSignInBtn');

        if (singleBtn) {
            singleBtn.addEventListener('click', () => {
                window.history.pushState({}, '', '/single');
                window.dispatchEvent(new PopStateEvent('popstate'));
            });
        }
        if (quickPlayBtn) {
            quickPlayBtn.addEventListener('click', () => {
                window.history.pushState({}, '', '/game');
                window.dispatchEvent(new PopStateEvent('popstate'));
            });
        }

        if (tournamentBtn) {
            tournamentBtn.addEventListener('click', () => {
                window.history.pushState({}, '', '/tournament');
                window.dispatchEvent(new PopStateEvent('popstate'));
            });
        }

        // Handle Logout
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                // The logout endpoint updates the 'online' status in the database
                await apiCall('/logout', { method: 'POST' });

                localStorage.removeItem('auth_token');
                this.currentUser = null;

                // SYNCHRONOUSLY update the URL
                window.history.pushState({}, '', window.location.pathname + window.location.search);

                // SYNCHRONOUSLY force the DOM to update to the logged-out state
                if (this.appElement) {
                    this.appElement.innerHTML = this.render();

                    // Re-attach handlers to the new buttons
                    this.attachEventListeners();
                }
            });
        }

        if (googleSignInBtn) {
             googleSignInBtn.addEventListener('click', (e) => {
                 e.preventDefault();
                 window.location.href = (e.target as HTMLAnchorElement).href;
             });
        }
    }
    unmount(): void {
    }
}
