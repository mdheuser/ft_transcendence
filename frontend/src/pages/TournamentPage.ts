import { Page } from '../router/Router';
import { renderNav } from '../ui/nav';

interface Player {
    id: string;
    alias: string;
}

interface Match {
    id: string;
    player1: Player;
    player2: Player;
    winner: string | null;
    score: number[];
    duration: number;
}

interface Tournament {
    id: string;
    active: boolean;
    playerCount: number;
    players: Player[];
    matches: Match[];
    currentMatchIndex: number;
    winner: string | null;
}

export class TournamentPage implements Page {
    private tournament: Tournament | null = null;

    render(): string {
        return `
            <div class="header">
                <h1>🏆 Tournament Mode</h1>
            ${renderNav()}
            </div>
            <div class="container">
                <div class="tournament-form">
                    <div id="tournamentSetup">
                        <h2>Create Tournament</h2>
                        <div class="form-group">
                            <label for="playerCount">Number of Players:</label>
                            <input type="number" id="playerCount" min="2" max="8" value="4" />
                        </div>
                        <button class="btn" id="createTournamentBtn">Create Tournament</button>
                    </div>

                    <div id="tournamentRegistration" style="display: none;">
                        <h2>Player Registration</h2>
                        <div class="form-group">
                            <label for="playerAlias">Enter Your Alias:</label>
                            <input type="text" id="playerAlias" placeholder="Player Name" maxlength="20" />



                        </div>
                        <button class="btn" id="registerPlayerBtn">Register</button>
                        <button class="btn btn-secondary" id="registerGuestBtn">Add Guest</button>
                        <div class="players-list" id="playersList">
                            <h3>Registered Players</h3>
                            <ul id="playersUl"></ul>
                        </div>
                    </div>

                    <div id="tournamentBracket" style="display: none;">
                        <h2>Tournament Bracket</h2>
                        <div id="matchesList"></div>
                        <div class="match-info" id="currentMatchInfo"></div>
                        <div style="display: flex; gap: 10px; justify-content: center;">
                            <button class="btn" id="playMatchBtn" style="display: none;">Play Match</button>
                            <button class="btn" id="newTournamentBtn" style="display: none;">New Tournament</button>
                            <button class="btn btn-secondary" id="resetTournamentBtn" style="display: none;">Reset</button>
                        </div>
                    </div>

                    <div id="tournamentError" class="error" style="display: none;"></div>
                </div>
            </div>
        `;
    }

    mount(): void {
        this.setupEventListeners();
        this.checkCurrentTournament();
    }

    private setupEventListeners(): void {
        const createBtn = document.getElementById('createTournamentBtn');
        const registerBtn = document.getElementById('registerPlayerBtn');
        const playMatchBtn = document.getElementById('playMatchBtn');
        const newTournamentBtn = document.getElementById('newTournamentBtn');
        const resetTournamentBtn = document.getElementById('resetTournamentBtn');
        const registerGuestBtn = document.getElementById('registerGuestBtn');

        if (createBtn) {
            createBtn.addEventListener('click', () => this.createTournament());
        }

        if (registerBtn) {
            registerBtn.addEventListener('click', () => this.registerPlayer());
        }

        if (playMatchBtn) {
            playMatchBtn.addEventListener('click', () => this.playCurrentMatch());
        }

        if (newTournamentBtn) {
            newTournamentBtn.addEventListener('click', () => this.startNewTournament());
        }

        if (resetTournamentBtn) {
            resetTournamentBtn.addEventListener('click', () => this.resetTournament());
        }
        
        if (registerGuestBtn) {
            registerGuestBtn.addEventListener('click', () => this.registerGuest());
        }
    }

    private async checkCurrentTournament(): Promise<void> {
        try {
            const response = await fetch('/api/tournament/current');
            const data = await response.json();
            
            if (data.active) {
                this.tournament = data;
                this.updateUI();
            }
        } catch (error) {
            console.error('Error checking tournament:', error);
        }
    }

    private getDefaultTournamentAlias(): string {
        // prefer stored current user object if you have it
        const raw =
            localStorage.getItem('current_user') ||
            localStorage.getItem('user') ||
            localStorage.getItem('currentUser');

        if (raw) {
            try {
            const obj = JSON.parse(raw);
            const name = String(obj?.username ?? '').trim();
            if (name) return name;
            } catch {}
        }

        // fallback: decode username from JWT payload (auth_token)
        const token = localStorage.getItem('auth_token');
        if (token) {
            const parts = token.split('.');
            if (parts.length >= 2) {
                let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                payload += '='.repeat((4 - (payload.length % 4)) % 4);
                try {
                    const decoded = JSON.parse(atob(payload));
                    const name = String(decoded?.username ?? '').trim();
                    if (name) return name;
                } catch {}
            }
        }
        return '';
    }

    private async createTournament(): Promise<void> {
        const playerCountInput = document.getElementById('playerCount') as HTMLInputElement;
        const playerCount = parseInt(playerCountInput.value);

        if (playerCount < 2) {
            this.showError('Tournament must have at least 2 players');
            return;
        }

        try {
            const response = await fetch('/api/tournament/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerCount })
            });

            const data = await response.json();
            
            if (response.ok) {
                this.tournament = data;
                this.updateUI();
            } else {
                this.showError(data.error || 'Failed to create tournament');
            }
        } catch (error) {
            this.showError('Network error: ' + error);
        }
    }

    private async registerPlayer(): Promise<void> {
        const aliasInput = document.getElementById('playerAlias') as HTMLInputElement | null;
        const alias = (aliasInput?.value ?? '').trim();

        if (!alias) {
            this.showError('Pick a unique display name to participate in tournaments.');
            return;
        }

        const token = localStorage.getItem('auth_token');
        if (!token) {
            this.showError('You must be logged in to register for a tournament.');
            return;
        }

        try {
            const response = await fetch('/api/tournament/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ alias }),
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
                this.showError(data?.error || 'Failed to register player');
                return;
            }

            this.tournament = data;
            this.updateUI();
        } catch (error) {
            this.showError('Network error: ' + error);
        }
    }

    private async registerGuest(): Promise<void> {
        const aliasInput = document.getElementById('playerAlias') as HTMLInputElement | null;
        const alias = (aliasInput?.value ?? '').trim();

        if (!alias) {
            this.showError('Please enter an alias');
            return;
        }

        try {
            const response = await fetch('/api/tournament/register-guest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alias }),
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
            this.showError(data?.error || 'Failed to register guest');
            return;
            }

            this.tournament = data;
            if (aliasInput) aliasInput.value = ''; // so you can type the next guest quickly
            this.updateUI();
        } catch (error) {
            this.showError('Network error: ' + error);
        }
    }

    
    private updateUI(): void {
        if (!this.tournament) return;

        const setupDiv = document.getElementById('tournamentSetup');
        const registrationDiv = document.getElementById('tournamentRegistration');
        const bracketDiv = document.getElementById('tournamentBracket');
        const resetBtn = document.getElementById('resetTournamentBtn');
        const aliasInput = document.getElementById('playerAlias') as HTMLInputElement | null;

        if (setupDiv) setupDiv.style.display = 'none';
        
        // Show reset button when tournament is active
        if (resetBtn) resetBtn.style.display = 'block';

        // Show registration if not all players registered
        if (this.tournament.players.length < this.tournament.playerCount) {
            if (registrationDiv) registrationDiv.style.display = 'block';
            if (bracketDiv) bracketDiv.style.display = 'none';

            // NEW: prefill alias with username (still editable)
            if (aliasInput && !aliasInput.value.trim()) {
                aliasInput.value = this.getDefaultTournamentAlias();
            }
            this.updatePlayersList();
        } else {
            // Show bracket when all players registered
            if (registrationDiv) registrationDiv.style.display = 'none';
            if (bracketDiv) bracketDiv.style.display = 'block';
            this.updateBracket();
        }
    }

    private updatePlayersList(): void {
        const playersUl = document.getElementById('playersUl');
        if (!playersUl || !this.tournament) return;

        playersUl.innerHTML = this.tournament.players
            .map(p => `<li>${this.escapeHtml(p.alias)}</li>`)
            .join('');
        const remaining = this.tournament.playerCount - this.tournament.players.length;
        playersUl.insertAdjacentHTML(
        'afterend',
        `<div style="margin-top:10px; opacity:0.8;">Waiting for ${remaining} more player(s)…</div>`
        );
    }

    private updateBracket(): void {
        if (!this.tournament) return;

        const matchesList = document.getElementById('matchesList');
        const currentMatchInfo = document.getElementById('currentMatchInfo');
        const playMatchBtn = document.getElementById('playMatchBtn');
        const newTournamentBtn = document.getElementById('newTournamentBtn');

        if (matchesList) {
            matchesList.innerHTML = '<h3>Matches</h3>' + 
                this.tournament.matches.map((match, index) => {
                    let resultText = '';
                    if (match.winner) {
                        const score = match.score && Array.isArray(match.score) ? `(${match.score[0]}-${match.score[1]})` : '';
                        const duration = match.duration ? this.formatTime(match.duration) : '';
                        resultText = `<br><div style="display: flex; justify-content: space-between; align-items: center;"><em>Winner: ${this.escapeHtml(match.winner)} ${score}</em><em style="color: #bbb;">${duration}</em></div>`;
                    }
                    return `
                        <div style="padding: 10px; margin: 5px 0; background: rgba(255,255,255,0.1); border-radius: 5px;">
                            <strong>Match ${index + 1}:</strong> 
                            ${this.escapeHtml(match.player1.alias)} vs ${this.escapeHtml(match.player2.alias)}
                            ${resultText}
                        </div>
                    `;
                }).join('');
        }

        const currentMatch = this.tournament.matches[this.tournament.currentMatchIndex];
        const resetTournamentBtn = document.getElementById('resetTournamentBtn');
        
        if (currentMatch && !currentMatch.winner && currentMatchInfo && playMatchBtn && newTournamentBtn) {
            currentMatchInfo.innerHTML = `
                <h2>Next Match</h2>
                <p>${this.escapeHtml(currentMatch.player1.alias)} vs ${this.escapeHtml(currentMatch.player2.alias)}</p>
            `;
            playMatchBtn.style.display = 'block';
            newTournamentBtn.style.display = 'none';
            if (resetTournamentBtn) resetTournamentBtn.style.display = 'block';
        } else if (currentMatchInfo && playMatchBtn && newTournamentBtn) {
            currentMatchInfo.innerHTML = '<h2>🏆 Tournament Complete! 🏆</h2>';
            if (this.tournament.winner) {
                currentMatchInfo.innerHTML += `<p style="font-size: 24px; color: #f1c40f;">Winner: ${this.escapeHtml(this.tournament.winner)}</p>`;
            }
            playMatchBtn.style.display = 'none';
            newTournamentBtn.style.display = 'block';
            if (resetTournamentBtn) resetTournamentBtn.style.display = 'none';
        }
    }

    private playCurrentMatch(): void {
        if (!this.tournament) return;
        
        const currentMatch = this.tournament.matches[this.tournament.currentMatchIndex];
        if (!currentMatch) return;

        // Store match data in sessionStorage
        sessionStorage.setItem('currentMatch', JSON.stringify({
            player1: currentMatch.player1.alias,
            player2: currentMatch.player2.alias,
            matchId: currentMatch.id,
            gameId:  currentMatch.id,  // NEW
            isTournament: true
        }));

        // Navigate to game page
        window.history.pushState({}, '', '/game');
        window.dispatchEvent(new PopStateEvent('popstate'));
    }

    private showError(message: string): void {
        const errorDiv = document.getElementById('tournamentError');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 5000);
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    private startNewTournament(): void {
        // Reset tournament state
        this.tournament = null;
        
        // Show the setup form again
        const setupDiv = document.getElementById('tournamentSetup');
        const registrationDiv = document.getElementById('tournamentRegistration');
        const bracketDiv = document.getElementById('tournamentBracket');
        const resetBtn = document.getElementById('resetTournamentBtn');
        
        if (setupDiv) setupDiv.style.display = 'block';
        if (registrationDiv) registrationDiv.style.display = 'none';
        if (bracketDiv) bracketDiv.style.display = 'none';
        if (resetBtn) resetBtn.style.display = 'none';
        
        // Clear the player count input
        const playerCountInput = document.getElementById('playerCount') as HTMLInputElement;
        if (playerCountInput) playerCountInput.value = '4';
    }

    private async resetTournament(): Promise<void> {
        if (!confirm('Are you sure you want to reset the tournament? This will delete all progress.')) {
            return;
        }

        try {
            const response = await fetch('/api/tournament/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            if (response.ok) {
                this.startNewTournament();
            } else {
                const data = await response.json();
                this.showError(data.error || 'Failed to reset tournament');
            }
        } catch (error) {
            this.showError('Network error: ' + error);
        }
    }

    private formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `(${mins}:${secs.toString().padStart(2, '0')})`;
    }
}
