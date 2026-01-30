export type Match = {
  id: number;
  createdAt: string;          // ISO string
  player1Id: number;
  player2Id: number;
  player1Name: string;
  player2Name: string;
  player1Score: number;
  player2Score: number;
  winnerId: number | null;    // null if draw/unknown
  mode?: string;              // optional: "ai", "local", "tournament"
};

export type UserStats = {
  total: number;
  wins: number;
  losses: number;
  winRate: number;            // 0..100
  last10: Array<{ isWin: boolean; diff: number }>;
};

export function computeUserStats(meId: number, matches: Match[]): UserStats {
  const total = matches.length;

  let wins = 0;
  let losses = 0;

  // Sort newest first (defensive)
  const sorted = [...matches].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  for (const m of sorted) {
    const isMeP1 = m.player1Id === meId;
    const myScore = isMeP1 ? m.player1Score : m.player2Score;
    const oppScore = isMeP1 ? m.player2Score : m.player1Score;

    if (myScore === oppScore) continue; // ignore draws if they exist
    if (myScore > oppScore) wins++;
    else losses++;
  }

  const denom = wins + losses;
  const winRate = denom === 0 ? 0 : Math.round((wins / denom) * 100);

  const last10 = sorted.slice(0, 10).map((m) => {
    const isMeP1 = m.player1Id === meId;
    const myScore = isMeP1 ? m.player1Score : m.player2Score;
    const oppScore = isMeP1 ? m.player2Score : m.player1Score;
    const diff = myScore - oppScore;
    return { isWin: diff > 0, diff };
  });

  return { total, wins, losses, winRate, last10 };
}

export function renderLast10Bars(last10: Array<{ isWin: boolean; diff: number }>): string {
  // Height based on abs(diff), clamped to keep it readable.
  const maxAbs = Math.max(1, ...last10.map(x => Math.abs(x.diff)));
  return `
    <div class="flex items-end gap-1 h-12">
      ${last10.map((x) => {
        const h = Math.max(10, Math.round((Math.abs(x.diff) / maxAbs) * 48)); // 10..48px
        const color = x.isWin ? "bg-emerald-500" : "bg-rose-500";
        return `<div class="w-3 rounded ${color}" style="height:${h}px"></div>`;
      }).join("")}
    </div>
  `;
}
