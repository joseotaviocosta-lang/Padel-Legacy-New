// CLOUD-6A — análise (somente leitura) dos JSONs brutos do simulador 5.26.
// Não toca em código de jogo. Uso:
//   node scripts/audit-cloud6a-analyze.mjs <dirComRawJson> [saida.json]
// Entrada: arquivos <perfil>-<seed>.json gerados por sim-progression-economy-v526.mjs.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] || '.');
const outFile = process.argv[3] ? resolve(process.argv[3]) : null;
const mean = (a) => { const s = a.filter(Number.isFinite); return s.length ? +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2) : null; };
const ATTRS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
const THRESHOLDS = [500, 250, 100, 50, 20, 10, 1];

const files = readdirSync(dir).filter((f) => /^[a-z]+-\d+\.json$/.test(f)).sort();
const results = [];
for (const f of files) {
  const j = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
  const w = j.weekly || [];
  const milestones = {};
  for (const t of THRESHOLDS) {
    const hit = w.find((s) => Number.isFinite(s.rank) && s.rank <= t);
    const teamHit = w.find((s) => Number.isFinite(s.teamRank) && s.teamRank <= t);
    milestones[`top${t}`] = hit ? { day: hit.day, age: hit.age, season: Math.floor(hit.day / 365) + 1 } : null;
    milestones[`team_top${t}`] = teamHit ? { day: teamHit.day, age: teamHit.age, season: Math.floor(teamHit.day / 365) + 1 } : null;
  }
  const bestRank = Math.min(...w.map((s) => (Number.isFinite(s.rank) ? s.rank : Infinity)));
  const yearEnd = [];
  const lastDay = w.length ? w[w.length - 1].day : 0;
  for (let y = 0; y * 365 <= lastDay + 7; y += 1) {
    const s = w.reduce((best, cur) => (Math.abs(cur.day - y * 365) < Math.abs(best.day - y * 365) ? cur : best), w[0]);
    yearEnd.push({ year: y, day: s.day, age: s.age, rank: s.rank, teamRank: s.teamRank, ovr: s.ovr, partnerOvr: s.partnerOvr, attrs: s.attrs, coins: s.coins, energy: s.energy, fatigue: s.fatigue, careerLevel: s.careerLevel, reputation: s.reputation, sponsorMonthly: s.sponsorMonthly, staffMonthly: s.staffMonthly, coachSalary: s.coachSalary });
  }
  const seasonOf = (d) => Math.floor((new Date(d) - new Date(j.startDate)) / 86400000 / 365) + 1;
  const bySeason = {};
  const slot = (k) => (bySeason[k] ||= { matches: 0, wins: 0, tournaments: 0, titles: 0, finalsLost: 0, firstRoundExits: 0, rankPoints: 0, prize: 0, tiers: {}, restDaysApprox: null });
  for (const m of j.matches || []) { const s = slot(seasonOf(m.date)); s.matches += 1; if (m.won) s.wins += 1; }
  for (const t of j.tournaments || []) {
    const s = slot(seasonOf(t.date));
    s.tournaments += 1; s.rankPoints += t.rankPoints || 0; s.prize += t.prize || 0;
    s.tiers[t.tier] = (s.tiers[t.tier] || 0) + 1;
    if (t.status === 'champion') s.titles += 1;
    else if (t.status === 'eliminated' && t.totalRounds > 0 && t.roundsWon === t.totalRounds - 1) s.finalsLost += 1;
    if (t.roundsWon === 0) s.firstRoundExits += 1;
  }
  // fadiga/energia médias por temporada (semanal)
  const fat = {};
  for (const s of w) { const k = Math.floor(s.day / 365) + 1; (fat[k] ||= { e: [], f: [] }); fat[k].e.push(s.energy); fat[k].f.push(s.fatigue); }
  const fatigueBySeason = Object.fromEntries(Object.entries(fat).map(([k, v]) => [k, { energy: mean(v.e), fatigue: mean(v.f) }]));
  const att = (s) => ATTRS.map((a) => s?.attrs?.[a]).filter(Number.isFinite);
  results.push({
    file: f, profile: j.profile, seed: j.seed, difficulty: j.difficulty, archetype: j.archetype, days: j.days, ms: j.ms,
    startAge: w[0]?.age, finalAge: w[w.length - 1]?.age, bestRank,
    milestones, yearEnd, bySeason, fatigueBySeason,
    final: { rank: w[w.length - 1]?.rank, ovr: w[w.length - 1]?.ovr, coins: j.finalCoins },
    errors: (j.errors || []).length, softLockFirst: j.softLock?.firstDate ?? null,
    partnerLogRows: (j.partnerLog || []).length, exits: (j.exitEvents || []).length, forfeits: j.forfeits,
    attrSpread: yearEnd.map((y) => ({ year: y.year, min: Math.min(...att(y)), max: Math.max(...att(y)), mean: mean(att(y)) })),
  });
}
if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`\n== ${r.file} (${r.difficulty}, ${r.archetype}, ${r.days}d, ${Math.round(r.ms / 60000)} min) idade ${r.startAge}->${r.finalAge} · melhor rank ${r.bestRank}`);
  console.log('marcos:', THRESHOLDS.map((t) => `Top${t}=${r.milestones[`top${t}`] ? `d${r.milestones[`top${t}`].day}/${r.milestones[`top${t}`].age}a` : '—'}`).join(' '));
  for (const y of r.yearEnd) console.log(`ano ${y.year} idade ${y.age} rank ${y.rank} dupla ${y.teamRank} OVR ${y.ovr} parceiro ${y.partnerOvr} moedas ${y.coins} en ${y.energy} fad ${y.fatigue}`);
  for (const [k, v] of Object.entries(r.bySeason)) console.log(`temp ${k}: ${v.matches} partidas (${v.wins} v) · ${v.tournaments} torneios · títulos ${v.titles} · finais perdidas ${v.finalsLost} · 1ª rodada ${v.firstRoundExits} · prêmio ${v.prize} · tiers ${JSON.stringify(v.tiers)}`);
}
