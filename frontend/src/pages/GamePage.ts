import { Page } from '../router/Router';
import { PongGame } from '../game/PongGame';
import { renderNav } from '../ui/nav';

export class GamePage implements Page {
    private game: PongGame | null = null;
    private matchStartTime: number = 0;
    private timerInterval: number | null = null;
    private settingsOpen: boolean = false;
    private ballSpeed: number = 5;
    private paddleSpeed: number = 6;
    private paddleSize: number = 9; // Scale 5-15, where size * 10 = height in px
    private matchPosted: boolean = false;
    private currentGameId: number | null = null;
    private player2Id: number | null = null;
    private player2Name: string = 'Player 2';

    private escapeHtml(s: string): string {
        return s.replace(/[&<>"']/g, (c) => (
            c === '&' ? '&amp;' :
            c === '<' ? '&lt;' :
            c === '>' ? '&gt;' :
            c === '"' ? '&quot;' : '&#39;'
        ));
    }
    
    render(): string {
        let player1Name = 'Player 1';
        let player2Name = 'Player 2';

        // 1) Tournament match names (from sessionStorage)
        const matchDataStr = sessionStorage.getItem('currentMatch');
        if (matchDataStr) {
            try {
                const matchData = JSON.parse(matchDataStr);
                player1Name = matchData.player1 || player1Name;
                player2Name = matchData.player2 || player2Name;
            } catch (e) {
            console.error('Error parsing match data:', e);
            }
        } else {
            const myName = this.getMyUsername();
            if (myName) player1Name = myName;

            const p2Name = sessionStorage.getItem('pvp_player2_name');
            if (p2Name) player2Name = p2Name;
        }

        // Always escape before injecting into HTML
        player1Name = this.escapeHtml(player1Name);
        player2Name = this.escapeHtml(player2Name);

        return `
            <div class="header">
                <h1>🏓 Pong Game</h1>
                ${renderNav()}
            </div>
            <div class="container">
                <div class="game-container">
                    <div class="score-board">
                        <div class="player-score">
                            <div id="player1Name">${player1Name}</div>
                            <div id="score1">0</div>
                        </div>
                        <div class="player-score">
                            <div id="player2Name">${player2Name}</div>
                            <div id="score2">0</div>
                        </div>
                    </div>
                    
                    <canvas id="pongCanvas" width="900" height="500"></canvas>
                    
                    <div style="width: 900px; position: relative;">
                        <div style="position: absolute; left: 0; top: 50%; transform: translateY(-50%);">
                            <button id="settingsBtn" style="background: none; border: none; cursor: pointer; font-size: 24px; color: #00ff88; transition: transform 0.2s;" title="Settings">
                                ⚙️
                            </button>
                        </div>
                        <div style="text-align: center;">
                            <button class="btn" id="startBtn">Start Game</button>
                            <button class="btn btn-secondary" id="resetBtn">Reset</button>
                        </div>
                        <div style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); font-size: 14px; color: #bbb;">
                            Time: <span id="matchTimer" style="font-weight: bold;">0:00</span>
                        </div>
                    </div>
                    
                    <!-- Settings Panel -->
                    <div id="settingsPanel" style="display: none; background: rgba(0, 0, 0, 0.9); border: 2px solid #00ff88; border-radius: 10px; padding: 20px; margin-top: 20px; max-width: 400px;">
                        <h3 style="color: #00ff88; margin-top: 0;">⚙️ Game Settings</h3>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; color: #e0e0e0; margin-bottom: 5px;">Ball Speed: <span id="ballSpeedValue">5</span></label>
                            <input type="range" id="ballSpeedSlider" min="3" max="10" value="5" step="0.5" style="width: 100%;" />
                            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #888;">
                                <span>Slow</span>
                                <span>Fast</span>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; color: #e0e0e0; margin-bottom: 5px;">Paddle Speed: <span id="paddleSpeedValue">6</span></label>
                            <input type="range" id="paddleSpeedSlider" min="3" max="12" value="6" step="1" style="width: 100%;" />
                            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #888;">
                                <span>Slow</span>
                                <span>Fast</span>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; color: #e0e0e0; margin-bottom: 5px;">Paddle Size: <span id="paddleSizeValue">9</span></label>
                            <input type="range" id="paddleSizeSlider" min="5" max="15" value="9" step="1" style="width: 100%;" />
                            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #888;">
                                <span>Small</span>
                                <span>Large</span>
                            </div>
                        </div>
                        
                        <div style="text-align: center;">
                            <button class="btn" id="applySettingsBtn">Apply & Resume</button>
                        </div>
                    </div>

                    <div class="controls-info">
                        <h3>Controls</h3>
                        <p><strong>${player1Name}:</strong> W (up) / S (down)</p>
                        <p><strong>${player2Name}:</strong> O (up) / L (down)</p>
                        <p style="margin-top: 10px;"><em>First to ${PongGame.WINNING_SCORE} points wins!</em></p>
                    </div>
                </div>
            </div>
        `;
    }

    mount(): void {
        const canvas = document.getElementById('pongCanvas') as HTMLCanvasElement;
        const startBtn = document.getElementById('startBtn');
        const resetBtn = document.getElementById('resetBtn');
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsPanel = document.getElementById('settingsPanel');
        const applySettingsBtn = document.getElementById('applySettingsBtn');
        const ballSpeedSlider = document.getElementById('ballSpeedSlider') as HTMLInputElement;
        const ballSpeedValue = document.getElementById('ballSpeedValue');
        const paddleSpeedSlider = document.getElementById('paddleSpeedSlider') as HTMLInputElement;
        const paddleSpeedValue = document.getElementById('paddleSpeedValue');
        const paddleSizeSlider = document.getElementById('paddleSizeSlider') as HTMLInputElement;
        const paddleSizeValue = document.getElementById('paddleSizeValue');

        // Get player names from session storage if available
        let player1Name = 'Player 1';
        let player2Name = 'Player 2';
        let matchData: any = null;
        
        const matchDataStr = sessionStorage.getItem('currentMatch');
        if (matchDataStr) {
            try {
                matchData = JSON.parse(matchDataStr);
                player1Name = matchData.player1 || 'Player 1';
                player2Name = matchData.player2 || 'Player 2';
            } catch (e) {
                console.error('Error parsing match data:', e);
            }
        }
        // If this is NOT a tournament match, override placeholders with real usernames (if we have them)
        if (!matchData?.isTournament) {
            const p1 = this.getMyUsername();
            if (p1) player1Name = p1;

            const p2Stored = sessionStorage.getItem('pvp_player2_name');
            if (p2Stored) player2Name = p2Stored;

            // Update DOM (because render already printed placeholders)
            this.setPlayerNameDom('player1Name', player1Name);
            this.setPlayerNameDom('player2Name', player2Name);
        }

        // Create game end callback
        const onGameEnd = matchData?.isTournament
            ? async (winner: string, score: number[]) => {
                // Stop the timer
                this.stopTimer();

                // Calculate match duration in seconds
                const duration = this.matchStartTime > 0
                    ? Math.floor((Date.now() - this.matchStartTime) / 1000)
                    : 0;

                // Post results once (avoid duplicates)
                if (!this.matchPosted) {
                    this.matchPosted = true;

                    // persist match results for stats dashboard
                    const gameId = Number(matchData?.gameId);
                    const token = localStorage.getItem('auth_token');

                    if (Number.isInteger(gameId) && gameId > 0 && token) {
                    const res = await fetch('/api/matches', {
                        method: 'POST',
                        headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                        gameId,
                        player1Score: score[0],
                        player2Score: score[1],
                        }),
                    });

                    if (!res.ok) {
                        const data = await res.json().catch(() => null);
                        console.error('Failed to record match:', data?.error ?? res.statusText);
                    }
                    } else {
                    console.error('Missing token or valid gameId; match will not be persisted.');
                    }
                }

                // Tournament match - update backend and navigate back
                await this.updateTournamentMatch(matchData.matchId, winner, score, duration);

                // Wait a bit before navigating back
                setTimeout(() => {
                    sessionStorage.removeItem('currentMatch');
                    window.history.pushState({}, '', '/tournament');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                }, 3000);
                }
            : async (winner: string, score: number[]) => {
                // Quick play - stop timer and hide pause button
                this.stopTimer();
                if (startBtn) {
                    startBtn.style.display = 'none';
                }

                // NEW: persist quick play too (once)
                if (!this.matchPosted) {
                    this.matchPosted = true;

                    // For quick play, you need some real gameId.
                    // If you don't have it yet, this will log and nothing will persist.
                    const gameId = this.currentGameId; // <-- you must set this when the PvP match is created
                    if (Number.isInteger(gameId) && (gameId as number) > 0) {
                    try {
                        await this.recordMatch(gameId as number, score[0], score[1]);
                    } catch (e) {
                        console.error('Failed to record match:', e);
                    }
                    } else {
                    console.error('Quick play has no gameId; match will not be persisted.');
                    }
                }
                };

            if (canvas) {
            this.game = new PongGame(canvas, player1Name, player2Name, onGameEnd, { mode: 'pvp' });
        }

        if (startBtn) {
            const handleStartClick = async () => {
                if (!this.game) return;

                if (startBtn.textContent === 'Start Game') {
                this.matchPosted = false;
                this.currentGameId = null; // important: new match, new id

                // Only for non-tournament quick play:
                if (!matchData?.isTournament) {
                    await this.promptLoginPlayer2();
                    await this.createQuickPlayGame();
                }

                this.stopTimer();
                this.matchStartTime = Date.now();
                const timerElement = document.getElementById('matchTimer');
                if (timerElement) timerElement.textContent = '0:00';
                this.startTimer();

                this.game.start();
                startBtn.textContent = 'Pause';
                } else {
                this.game.togglePause();
                startBtn.textContent = this.game.isPaused() ? 'Resume' : 'Pause';
                }
            };

            startBtn.addEventListener('click', () => {
                handleStartClick().catch((e) => console.error(e));
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (this.game) {
                    this.game.reset();
                    this.stopTimer();
                    this.matchStartTime = 0;
                    this.matchPosted = false; // Reset match posted flag
                    const timerElement = document.getElementById('matchTimer');
                    if (timerElement) timerElement.textContent = '0:00';
                    if (startBtn) {
                        startBtn.style.display = 'inline-block';
                        startBtn.textContent = 'Start Game';
                    }
                }
            });
        }

        // Settings button - toggle settings panel and pause game
        if (settingsBtn && settingsPanel) {
            settingsBtn.addEventListener('click', () => {
                this.settingsOpen = !this.settingsOpen;
                settingsPanel.style.display = this.settingsOpen ? 'block' : 'none';
                
                // Pause game when settings open (only if game is actually running)
                if (this.settingsOpen && this.game && this.game.isRunning() && !this.game.isPaused()) {
                    this.game.togglePause();
                    if (startBtn) startBtn.textContent = 'Resume';
                }
            });
        }

        // Ball speed slider
        if (ballSpeedSlider && ballSpeedValue) {
            ballSpeedSlider.addEventListener('input', () => {
                this.ballSpeed = parseFloat(ballSpeedSlider.value);
                ballSpeedValue.textContent = this.ballSpeed.toString();
            });
        }

        // Paddle speed slider
        if (paddleSpeedSlider && paddleSpeedValue) {
            paddleSpeedSlider.addEventListener('input', () => {
                this.paddleSpeed = parseFloat(paddleSpeedSlider.value);
                paddleSpeedValue.textContent = this.paddleSpeed.toString();
            });
        }

        // Paddle size slider
        if (paddleSizeSlider && paddleSizeValue) {
            paddleSizeSlider.addEventListener('input', () => {
                this.paddleSize = parseInt(paddleSizeSlider.value);
                paddleSizeValue.textContent = this.paddleSize.toString();
            });
        }

        // Apply settings button
        if (applySettingsBtn && settingsPanel) {
            applySettingsBtn.addEventListener('click', () => {
                // Apply settings to game
                if (this.game) {
                    this.game.updateSettings({
                        ballSpeed: this.ballSpeed,
                        paddleSpeed: this.paddleSpeed,
                        paddleHeight: this.paddleSize * 10 // Convert scale to pixels
                    });
                }
                
                // Close settings panel
                this.settingsOpen = false;
                settingsPanel.style.display = 'none';
                
                // Resume game if it was paused
                if (this.game && this.game.isPaused()) {
                    this.game.togglePause();
                    if (startBtn) startBtn.textContent = 'Pause';
                }
            });
        }
    }

    private getUsernameFromToken(): string | null {
        const token = localStorage.getItem('auth_token');
        if (!token) return null;

        const parts = token.split('.');
        if (parts.length !== 3) return null;

        try {
            // base64url -> base64
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const json = atob(b64);
            const payload = JSON.parse(json);
            return typeof payload?.username === 'string' ? payload.username : null;
        } catch {
            return null;
        }
    }

    private setPlayerNameDom(id: string, name: string) {
        const el = document.getElementById(id);
        if (el) el.textContent = name;
    }

    private promptPassword(title = 'Player 2 password:'): Promise<string | null> {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.inset = '0';
            overlay.style.background = 'rgba(0,0,0,0.5)';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.zIndex = '9999';

            const box = document.createElement('div');
            box.style.background = '#fff';
            box.style.padding = '16px';
            box.style.borderRadius = '8px';
            box.style.width = '320px';
            box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';

            const label = document.createElement('div');
            label.textContent = title;
            label.style.marginBottom = '8px';

            const input = document.createElement('input');
            input.type = 'password';
            input.autocomplete = 'current-password';
            input.style.width = '100%';
            input.style.boxSizing = 'border-box';
            input.style.padding = '8px';

            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '8px';
            row.style.marginTop = '12px';
            row.style.justifyContent = 'flex-end';

            const cancel = document.createElement('button');
            cancel.textContent = 'Cancel';

            const ok = document.createElement('button');
            ok.textContent = 'OK';

            const cleanup = () => overlay.remove();

            const submit = () => {
                const val = input.value;
                cleanup();
                resolve(val || null);
            };

            cancel.addEventListener('click', () => {
                cleanup();
                resolve(null);
            });

            ok.addEventListener('click', submit);

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup();
                    resolve(null);
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(null);
                }
            });

            row.append(cancel, ok);
            box.append(label, input, row);
            overlay.append(box);
            document.body.append(overlay);

            input.focus();
        });
    }

    private async promptLoginPlayer2(): Promise<void> {
        if (this.player2Id) return;

        const email = window.prompt('Player 2 email:');
        if (!email) throw new Error('Player 2 email required');

        const password = await this.promptPassword('Player 2 password:');
        if (!password) throw new Error('Player 2 password required');

        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'Player 2 login failed');

        this.player2Id = data?.user?.id ?? null;
        this.player2Name = data?.user?.username ?? 'Player 2';

        const el = document.getElementById('player2Name');
        if (el) el.textContent = this.player2Name;
        }

        private async createQuickPlayGame(): Promise<void> {
        if (this.currentGameId) return;

        const token = localStorage.getItem('auth_token');
        if (!token) throw new Error('Missing token');

        if (!this.player2Id) throw new Error('Missing player2Id');

        const res = await fetch('/api/games/pvp', {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ player2Id: this.player2Id }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'Failed to create PvP game');

        this.currentGameId = Number(data.gameId);
    }

    private setPlayerNamesDom(p1: string, p2: string) {
        const el1 = document.getElementById('player1Name');
        const el2 = document.getElementById('player2Name');
        if (el1) el1.textContent = p1;
        if (el2) el2.textContent = p2;
    }

    private getMyUsername(): string | null {
        const meStr = localStorage.getItem('current_user');
        if (meStr) {
            try {
            const me = JSON.parse(meStr);
            if (typeof me?.username === 'string' && me.username.trim()) return me.username;
            } catch {}
        }
        return this.getUsernameFromToken(); // fallback only
    }

    private async updateTournamentMatch(matchId: string, winner: string, score: number[], duration: number): Promise<void> {
        try {
            const token = localStorage.getItem('auth_token');

            const response = await fetch('/api/tournament/update-match', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    matchId,
                    winner,
                    score,
                    duration
                })
            });

        if (!response.ok) {
            const raw = await response.text(); // prevents JSON parse crash on HTML
            console.error('Failed to update tournament match:', response.status, raw.slice(0, 200));
        }
        } catch (error) {
            console.error('Error updating tournament match:', error);
        }
    }

    private async recordMatch(gameId: number, player1Score: number, player2Score: number): Promise<void> {
        const token = localStorage.getItem('auth_token');
        if (!token) throw new Error('Missing token');

        const res = await fetch('/api/matches', {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ gameId, player1Score, player2Score }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'Failed to record match');
    }

    private startTimer(): void {
        const timerElement = document.getElementById('matchTimer');
        if (!timerElement) return;

        // Clear any existing interval
        if (this.timerInterval !== null) {
            clearInterval(this.timerInterval);
        }

        // Update timer every second
        this.timerInterval = window.setInterval(() => {
            if (this.matchStartTime > 0) {
                const elapsedSeconds = Math.floor((Date.now() - this.matchStartTime) / 1000);
                const minutes = Math.floor(elapsedSeconds / 60);
                const seconds = elapsedSeconds % 60;
                timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    private stopTimer(): void {
        if (this.timerInterval !== null) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    unmount(): void {
        if (this.timerInterval !== null) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.game) {
            this.game.destroy();
            this.game = null;
        }
    }
}
