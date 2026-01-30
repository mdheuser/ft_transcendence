import { Page } from '../router/Router';
import { renderNav } from '../ui/nav';

export class MatchPage implements Page {
    render(): string {
    return `
        <div class="header">
        <h1>🏓 Match</h1>
        ${renderNav()}
        </div>

        <div class="max-w-6xl mx-auto p-4">
        <div class="tournament-form">
            <div id="matchPanel">Loading match…</div>
        </div>
        </div>
    `;
    }

    mount(): void {
        void this.loadMatch();
    }

    private escapeHtml(s: string): string {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        }

        private renderScoreBars(p1Name: string, p2Name: string, s1: number, s2: number): string {
        const max = Math.max(1, s1, s2);
        const w1 = Math.round((s1 / max) * 100);
        const w2 = Math.round((s2 / max) * 100);

        return `
            <div class="space-y-3">
            <div>
                <div class="flex justify-between text-xs opacity-80">
                <span class="truncate">${this.escapeHtml(p1Name)}</span>
                <span class="font-mono">${s1}</span>
                </div>
                <div class="h-3 rounded bg-slate-800 overflow-hidden">
                <div class="h-3 bg-sky-500" style="width:${w1}%"></div>
                </div>
            </div>

            <div>
                <div class="flex justify-between text-xs opacity-80">
                <span class="truncate">${this.escapeHtml(p2Name)}</span>
                <span class="font-mono">${s2}</span>
                </div>
                <div class="h-3 rounded bg-slate-800 overflow-hidden">
                <div class="h-3 bg-violet-500" style="width:${w2}%"></div>
                </div>
            </div>
            </div>
        `;
    }

    private async loadMatch(): Promise<void> {
        const panel = document.getElementById('matchPanel');
        if (!panel) return;

        const token = localStorage.getItem('auth_token');
        if (!token) {
            panel.textContent = 'Not logged in.';
            return;
        }

        const matchId = sessionStorage.getItem('selectedMatchId');
        if (!matchId) {
            panel.textContent = 'No match selected.';
            return;
        }

        const res = await fetch(`/api/matches/${matchId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
            panel.textContent = data?.error ?? 'Failed to load match.';
            return;
        }

        const defaultAvatar = '/api/uploads/avatars/default-avatar.png';

        const p1 = data?.player1 ?? {};
        const p2 = data?.player2 ?? {};

        const p1Name = String(p1?.username ?? 'Player 1');
        const p2Name = String(p2?.username ?? 'Player 2');

        const p1Avatar = String(p1?.avatar ?? defaultAvatar);
        const p2Avatar = String(p2?.avatar ?? defaultAvatar);

        const scoreArr = Array.isArray(data?.score) ? data.score : [];
        const s1 = Number(scoreArr[0] ?? 0);
        const s2 = Number(scoreArr[1] ?? 0);

        const rawDate = data?.match_date;
        const d = new Date(rawDate);
        //const dateLabel = isNaN(d.getTime()) ? String(rawDate ?? '') : d.toLocaleDateString();
        const dateLabel = isNaN(d.getTime())
            ? String(rawDate ?? '')
            : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });


        const winnerId = data?.winner_id;
        let winnerName = '—';
        if (winnerId != null) {
        if (Number(winnerId) === Number(p1?.id)) winnerName = p1Name;
        else if (Number(winnerId) === Number(p2?.id)) winnerName = p2Name;
        }

        panel.innerHTML = `
        <div class="space-y-5">

            <div class="flex items-center justify-between gap-4 flex-wrap">
            <div class="flex items-center gap-3 min-w-0">
                <img
                src="${p1Avatar}"
                alt="Player 1 avatar"
                class="w-16 h-16 rounded-full object-cover border"
                style="border-color: rgba(0, 255, 136, 0.2);"
                onerror="this.onerror=null;this.src='${defaultAvatar}';"
                />
                <div class="min-w-0">
                <div class="font-bold truncate">${this.escapeHtml(p1Name)}</div>
                <div class="text-sm opacity-70">Player 1</div>
                </div>
            </div>

            <div class="text-3xl font-extrabold font-mono">
                ${s1} - ${s2}
            </div>

            <div class="flex items-center gap-3 min-w-0">
                <div class="text-right min-w-0">
                <div class="font-bold truncate">${this.escapeHtml(p2Name)}</div>
                <div class="text-sm opacity-70">Player 2</div>
                </div>
                <img
                src="${p2Avatar}"
                alt="Player 2 avatar"
                class="w-16 h-16 rounded-full object-cover border"
                style="border-color: rgba(0, 255, 136, 0.2);"
                onerror="this.onerror=null;this.src='${defaultAvatar}';"
                />
            </div>
            </div>

            <hr style="border-color: rgba(0, 255, 136, 0.2);" />

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="rounded-2xl border border-slate-700 p-4">
                <div class="text-xs text-slate-400">Date</div>
                <div class="text-sm font-semibold">${this.escapeHtml(dateLabel)}</div>
            </div>
            <div class="rounded-2xl border border-slate-700 p-4">
                <div class="text-xs text-slate-400">Mode</div>
                <div class="text-sm font-semibold">${this.escapeHtml(String(data?.mode ?? 'quick'))}</div>
            </div>
            <div class="rounded-2xl border border-slate-700 p-4">
                <div class="text-xs text-slate-400">Winner</div>
                <div class="text-sm font-semibold">${this.escapeHtml(winnerName)}</div>
            </div>
            <div class="rounded-2xl border border-slate-700 p-4">
                <div class="text-xs text-slate-400">Match ID</div>
                <div class="text-sm font-semibold font-mono">${this.escapeHtml(String(data?.id ?? matchId))}</div>
            </div>
            </div>

            <div class="rounded-2xl border border-slate-700 p-4">
            <div class="flex items-center justify-between">
                <div class="font-semibold">Score graph</div>
                <div class="text-xs text-slate-400">bar length = score</div>
            </div>
            <div class="mt-3">
                ${this.renderScoreBars(p1Name, p2Name, s1, s2)}
            </div>
            </div>

            <div class="pt-2">
            <a href="/profile" data-link="/profile" class="btn btn-secondary">Back to Profile</a>
            </div>
        </div>
        `;
    }
}
