import { Page } from '../router/Router';
import { PongGame } from '../game/PongGame';
import { renderNav } from '../ui/nav';

export class SinglePlayerPage implements Page {
    private game: PongGame | null = null;
    private matchStartTime: number = 0;
    private timerInterval: number | null = null;
    private settingsOpen: boolean = false;
    private ballSpeed: number = 5;
    private paddleSpeed: number = 6;
    private paddleSize: number = 9; // Scale 5-15, where size * 10 = height in px
    private currentGameId: number | null = null;

    render(): string {
        // Check for match data from tournament
        let player1Name = this.getDisplayUsername();
        let aiName = 'CPU Opponent';
        
        const matchDataStr = sessionStorage.getItem('currentMatch');
        if (matchDataStr) {
            try {
                const matchData = JSON.parse(matchDataStr);
                if (matchData?.isTournament) {
                    player1Name = matchData.player1 || player1Name;
                }
                aiName = 'CPU Opponent';

            } catch (e) {
                console.error('Error parsing match data:', e);
            }
        }


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
                            <div id="aiName">${aiName}</div>
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
                        <p><strong>${aiName}:</strong> Controlled by AI</p>
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
        let player1Name = this.getDisplayUsername();
        let aiName = 'CPU Opponent';
        let matchData: any = null;
        
        const matchDataStr = sessionStorage.getItem('currentMatch');
        if (matchDataStr) {
            try {
                matchData = JSON.parse(matchDataStr);
                if (matchData?.isTournament) {
                    player1Name = matchData.player1 || player1Name;
                }
                aiName = matchData.player2 || 'CPU Opponent';
            } catch (e) {
                console.error('Error parsing match data:', e);
            }
        }

        // Create game end callback
        const onGameEnd = matchData?.isTournament 
            ? async (winner: string, score: number[]) => {
                // Stop the timer
                this.stopTimer();
                
                // Calculate match duration in seconds
                const duration = this.matchStartTime > 0 ? Math.floor((Date.now() - this.matchStartTime) / 1000) : 0;
                
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
                // NEW: if we have a backend game id, record the match
                if (this.currentGameId) {
                    try {
                        await this.recordMatch(this.currentGameId, score[0], score[1]);
                    } catch (e) {
                        console.error('Failed to record match:', e);
                    } finally {
                        this.currentGameId = null;
                    }
                }
            };

        if (canvas) {
            this.game = new PongGame(canvas, player1Name, aiName, onGameEnd, { mode: 'single' });
        }

        if (startBtn) {
            const handleStartClick = async () => {
                if (!this.game) return;
                
                if (startBtn.textContent === 'Start Game') {
                    // Reset timer to 0 before starting
                    this.stopTimer();
                    this.matchStartTime = Date.now(); // Track match start time
                    const timerElement = document.getElementById('matchTimer');
                    if (timerElement) timerElement.textContent = '0:00';
                    this.startTimer(); // Start the timer display
                    // Try to create a DB game only if logged in; NEVER block local gameplay
                    this.currentGameId = null;
                    const token = localStorage.getItem('auth_token');
                    if (!matchData?.isTournament && token) {
                        try {
                            this.currentGameId = await this.createAiGame();
                        } catch (e) {
                            console.error('createAiGame failed, starting locally anyway:', e);
                            this.currentGameId = null;
                        }
                    }
                this.game.start();
                startBtn.textContent = 'Pause';
                } else {
                    this.game.togglePause();
                    startBtn.textContent = this.game.isPaused() ? 'Resume' : 'Pause';
                }
            };
            
            startBtn.addEventListener('click', handleStartClick);
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (this.game) {
                    this.game.reset();
                    this.stopTimer();
                    this.matchStartTime = 0;
                    this.currentGameId = null;
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

    private getDisplayUsername(): string {
        // try the common keys; adjust if your project uses a different one
        const raw =
            localStorage.getItem('current_user') ||
            localStorage.getItem('user') ||
            localStorage.getItem('currentUser');

        if (raw) {
            try {
                const obj = JSON.parse(raw);
                const name = String(obj?.username ?? '').trim();
                if (name) return name;
            } catch {
                // ignore JSON parse errors
            }
        }
        //Otherwise, decode username from JWT (auth_token)
        const token = localStorage.getItem('auth_token');
        if (token) {
            const parts = token.split('.');
            if (parts.length >= 2) {
                // base64url -> base64
                let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                payload += '='.repeat((4 - (payload.length % 4)) % 4);

                try {
                    const decoded = JSON.parse(atob(payload));
                    const name = String(decoded?.username ?? '').trim();
                    if (name) return name;
                } catch {
                    // ignore
                }
            }
        }
        return 'Player 1';
    }

    private async createAiGame(): Promise<number> {
        const token = localStorage.getItem('auth_token');
        if (!token) throw new Error('Missing token');

        const res = await fetch('/api/games/ai', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.gameId) {
            throw new Error(data?.error || 'Failed to create AI game');
        }
        return Number(data.gameId);
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
            body: JSON.stringify({
                gameId,
                player1Score,
                player2Score,
            }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(data?.error || 'Failed to record match');
        }
    }


    private async updateTournamentMatch(matchId: string, winner: string, score: number[], duration: number): Promise<void> {
        try {
            const response = await fetch('/api/tournament/update-match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    matchId,
                    winner,
                    score,
                    duration
                })
            });

            if (!response.ok) {
                const data = await response.json();
                console.error('Failed to update tournament match:', data.error);
            }
        } catch (error) {
            console.error('Error updating tournament match:', error);
        }
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
