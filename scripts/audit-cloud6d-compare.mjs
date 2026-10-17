// CLOUD-6D — comparação pareada (somente leitura) de execuções do simulador 5.26.
// Uso: node scripts/audit-cloud6d-compare.mjs <dirRuns> <perfil> [saida.json]
//   <dirRuns> contém 6d-<perfil>/ e base-<perfil>/ (saída de sim-progression-economy-v526.mjs).
// Lê o JSON final ou, se a execução foi cortada por tempo, o `out` do último checkpoint.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [dirArg, profile, outArg] = process.argv.slice(2);
const root = resolve(dirArg);
const ATTRS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
const mean = (a) => { const s = a.filter(Number.isFinite); return s.length ? +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2) : null; };

function load(dir) {
  const final = resolve(dir, `${profile}-001.json`);
  if (existsSync(final)) return { out: JSON.parse(readFileSync(final, 'utf8')), source: 'final' };
  const ck = resolve(dir, '.checkpoints', `${profile}-001.json`);
  const text = readFileSync(ck, 'utf8');
  const body = text.slice(0, text.lastIndexOf('\n#sha256:'));
  const p = JSON.parse(body);
  return { out: p.out, source: `checkpoint d${p.day}` };
}
const A = load(resolve(root, `base-${profile}`));
const B = load(resolve(root, `6d-${profile}`));
const lastDay = (o) => o.weekly[o.weekly.length - 1].day;
const common = Math.min(lastDay(A.out), lastDay(B.out));

const at = (o, d) => o.weekly.reduce((b, s) => (Math.abs(s.day - d) < Math.abs(b.day - d) ? s : b), o.weekly[0]);
const dayOf = (o, date) => Math.round((Date.parse(date) - Date.parse(o.startDate)) / 86400000);
const upto = (o, list) => list.filter((x) => dayOf(o, x.date) <= common);

function summarize(o) {
  const w = o.weekly.filter((s) => s.day <= common);
  const ms = upto(o, o.matches), ts = o.tournaments.filter((t) => t.day <= common);
  const byTier = {};
  for (const m of ms) { const k = m.tier; (byTier[k] ||= { n: 0, w: 0 }); byTier[k].n += 1; if (m.won) byTier[k].w += 1; }
  const fatigue = w.map((s) => s.fatigue), energy = w.map((s) => s.energy);
  const lowestRank = (th) => { const h = w.find((s) => Number.isFinite(s.rank) && s.rank <= th); return h ? { day: h.day, age: h.age } : null; };
  return {
    matches: ms.length, wins: ms.filter((m) => m.won).length, tournaments: ts.length,
    titles: ts.filter((t) => t.status === 'champion').length,
    firstRoundExits: ts.filter((t) => t.roundsWon === 0).length,
    prize: ts.reduce((s, t) => s + (t.prize || 0), 0), rankPoints: ts.reduce((s, t) => s + (t.rankPoints || 0), 0),
    forfeits: ts.filter((t) => t.status === 'forfeit').length,
    byTier, meanEnergy: mean(energy), meanFatigue: mean(fatigue), injuredWeeks: w.filter((s) => s.injured).length,
    bestRank: Math.min(...w.map((s) => (Number.isFinite(s.rank) ? s.rank : Infinity))),
    milestones: Object.fromEntries([500, 250, 100, 50, 20, 10, 1].map((t) => [`top${t}`, lowestRank(t)])),
    partners: o.partners.filter((p) => p.day <= common).map((p) => ({ day: p.day, ovr: p.partnerOvr, via: p.via })),
    registrations: o.registrations.filter((r) => r.day <= common).length,
    // proxy de W.O./cancelamento: inscrições do período sem torneio disputado (o simulador só guarda o contador cumulativo `forfeits`)
    registrationsWithoutPlay: o.registrations.filter((r) => r.day <= common).length - ts.length,
    cumulativeForfeitsAtLastDay: o.forfeits,
    bySeason: [0, 1, 2].map((y) => {
      const inY = (d) => d >= y * 365 && d < (y + 1) * 365 && d <= common;
      const mm = ms.filter((m) => inY(dayOf(o, m.date))), tt = ts.filter((t) => inY(t.day));
      if (!mm.length && !tt.length) return null;
      return { season: y + 1, matches: mm.length, wins: mm.filter((m) => m.won).length, tournaments: tt.length, titles: tt.filter((t) => t.status === 'champion').length, firstRoundExits: tt.filter((t) => t.roundsWon === 0).length, prize: tt.reduce((a, t) => a + (t.prize || 0), 0), registrationsWithoutPlay: o.registrations.filter((r) => inY(r.day)).length - tt.length };
    }).filter(Boolean),
    deltaWinLoss: (() => { const b = { '<-10': [0, 0], '-10..-3': [0, 0], '-3..3': [0, 0], '3..10': [0, 0], '>10': [0, 0] }; for (const m of ms) { const d = m.strengthDelta; const k = d < -10 ? '<-10' : d < -3 ? '-10..-3' : d <= 3 ? '-3..3' : d <= 10 ? '3..10' : '>10'; b[k][1] += 1; if (m.won) b[k][0] += 1; } return b; })(),
    meanStrengthDelta: mean(ms.map((m) => m.strengthDelta)),
  };
}
const snaps = [];
const snapDays = []; for (let d = 0; d <= common; d += 90) snapDays.push(d); if (snapDays[snapDays.length - 1] !== common) snapDays.push(common);
for (const d of snapDays) {
  const a = at(A.out, d), b = at(B.out, d);
  const row = (s) => ({ attrs: s.attrs, day: s.day, age: s.age, rank: s.rank, teamRank: s.teamRank, ovr: s.ovr, partnerOvr: s.partnerOvr, attrMean: mean(ATTRS.map((k) => s.attrs?.[k])), attrMax: Math.max(...ATTRS.map((k) => s.attrs?.[k] || 0)), energy: s.energy, fatigue: s.fatigue, coins: s.coins, sponsorMonthly: s.sponsorMonthly, staffMonthly: s.staffMonthly });
  snaps.push({ day: d, base: row(a), s6d: row(b) });
}
const result = { profile, seed: 1, commonDay: common, base: { source: A.source, lastDay: lastDay(A.out), errors: A.out.errors.length, summary: summarize(A.out) }, s6d: { source: B.source, lastDay: lastDay(B.out), errors: B.out.errors.length, summary: summarize(B.out) }, snaps };
if (outArg) writeFileSync(resolve(outArg), JSON.stringify(result, null, 2));
// --export=<dir>: dados brutos compactos (semanal/torneios/partidas) até o dia comum, para versionar.
const exp = process.argv.find((a) => a.startsWith('--export='))?.slice(9);
if (exp) {
  const csv = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => r[c] ?? '').join(','))].join('\n') + '\n';
  for (const [tag, X] of [['baseline-fbb0bc4', A], ['cloud6d-5a8350a', B]]) {
    const o = X.out;
    const wk = o.weekly.filter((s) => s.day <= common).map((s) => ({ ...s, ...Object.fromEntries(ATTRS.map((k) => [k, s.attrs?.[k]])) }));
    writeFileSync(resolve(exp, `weekly-${profile}-${tag}.csv`), csv(wk, ['day', 'date', 'age', 'rank', 'teamRank', 'ovr', 'partnerOvr', 'energy', 'fatigue', 'injured', 'coins', 'reputation', 'sponsorMonthly', 'staffMonthly', 'coachSalary', 'rankPoints', ...ATTRS]));
    writeFileSync(resolve(exp, `tournaments-${profile}-${tag}.csv`), csv(o.tournaments.filter((t) => t.day <= common), ['day', 'date', 'tournamentId', 'tier', 'roundsWon', 'totalRounds', 'status', 'prize', 'rankPoints']));
    writeFileSync(resolve(exp, `matches-${profile}-${tag}.csv`), csv(upto(o, o.matches), ['date', 'tier', 'stage', 'round', 'playerOvr', 'partnerOvr', 'oppStrength', 'strengthDelta', 'won']));
  }
}
console.log(`== ${profile} · dia comum ${common} · base: ${A.source} · 6D: ${B.source}`);
console.log('dia | idade | OVR base→6D | média attr | rank base→6D | dupla rank | parceiro OVR | energia/fadiga 6D | moedas base→6D');
for (const s of snaps) console.log([s.day, s.s6d.age, `${s.base.ovr}→${s.s6d.ovr}`, `${s.base.attrMean}→${s.s6d.attrMean}`, `${s.base.rank}→${s.s6d.rank}`, `${s.base.teamRank}→${s.s6d.teamRank}`, `${s.base.partnerOvr}→${s.s6d.partnerOvr}`, `${s.s6d.energy}/${s.s6d.fatigue}`, `${s.base.coins}→${s.s6d.coins}`].join(' | '));
for (const k of ['base', 's6d']) { const x = result[k].summary; console.log(k, `partidas ${x.matches} (${x.wins}V) torneios ${x.tournaments} títulos ${x.titles} 1ªrod ${x.firstRoundExits} melhor rank ${x.bestRank} sem-jogo(inscr.) ${x.registrationsWithoutPlay} lesões(sem) ${x.injuredWeeks} energia ${x.meanEnergy} fadiga ${x.meanFatigue} prêmio ${x.prize}`); }
