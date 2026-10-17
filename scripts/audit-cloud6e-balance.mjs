// CLOUD-6E — isolamento de OVR do jogador, OVR do parceiro e força dos adversários
// no MOTOR REAL (createMatch/playPoint). Somente leitura: nenhum arquivo de src/ é alterado.
// Uso: node scripts/audit-cloud6e-balance.mjs [--n=400] [--out=<dir>] [--only=main,controls,start]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createMatch, playPoint } from '../src/engine/match/MatchEngine.js';
import { createBalanceAthlete } from '../src/engine/match/BalanceSimulator.js';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const N = Number(arg('n', 400));
const OUT = arg('out', 'reports/cloud-phase-6e-competitive-balance-isolation/data');
const ONLY = String(arg('only', 'main,controls,start,realistic,calibration')).split(',');
mkdirSync(OUT, { recursive: true });

// Constantes de controle (iguais ao BalanceSimulator/MatchBalance): energia 100, moral 72, entrosamento 76,
// tática 'equilibrado' nos dois lados, jogador na direita e parceiro na esquerda; adversários esq/dir fixos.
const ATTRS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
const flat = (id, name, lvl, side, extras = {}) => createBalanceAthlete(id, name, lvl, 'Equilibrado', side, extras);
const uneven = (id, name, deltas, side, extras = {}) => ({ ...flat(id, name, 50, side, extras), ...Object.fromEntries(ATTRS.map((k, i) => [k, Math.max(1, Math.min(100, deltas[i]))])) });

function play(teamA, teamB, seed) {
  let s = createMatch(teamA, teamB, { seed });
  let guard = 0;
  while (!s.finished && guard++ < 3000) s = playPoint(s);
  if (!s.finished) throw new Error(`partida ${seed} não terminou`);
  let pa = 0, pb = 0;
  for (const e of s.pointEvents) (e.winnerTeamId === 'A' ? pa++ : pb++);
  // games dos sets 1–2 (o 3º set é super tiebreak a 10 pontos e fica de fora do saldo de games)
  const g = s.setScores.slice(0, 2).reduce((t, x) => t + x.gamesA - x.gamesB, 0);
  return { win: s.winner === 'A', setsA: s.setsA, setsB: s.setsB, gameDiff: g, pa, pb, three: s.setScores.length === 3 };
}
const ci95 = (p, n) => 1.96 * Math.sqrt(Math.max(p * (1 - p), 1e-9) / n);
function cell(label, mkA, mkB, n = N) {
  let w = 0, sd = 0, gd = 0, pa = 0, pb = 0, three = 0;
  for (let i = 0; i < n; i++) {
    const r = play(mkA(), mkB(), `6e:${i}`); // semente depende só do índice (números aleatórios comuns entre células)
    if (r.win) w++; sd += r.setsA - r.setsB; gd += r.gameDiff; pa += r.pa; pb += r.pb; if (r.three) three++;
  }
  const p = w / n;
  return { label, n, wins: w, winRate: +(100 * p).toFixed(1), ci95: +(100 * ci95(p, n)).toFixed(1), meanSetDiff: +(sd / n).toFixed(2), meanGameDiff12: +(gd / n).toFixed(2), pointWinPct: +(100 * pa / (pa + pb)).toFixed(1), decidingSetPct: +(100 * three / n).toFixed(0) };
}
const team = (p, q, ex = {}) => () => [flat('pl', 'Jogador', p, 'right', ex), flat('pt', 'Parceiro', q, 'left')];
const opps = (o) => () => [flat('o1', 'AdvE', o, 'left'), flat('o2', 'AdvD', o, 'right')];

const result = { meta: { n: N, seeds: '6e:0..n-1 (mesmos índices em todas as células)', engine: 'src/engine/match/MatchEngine.js (createMatch/playPoint)' } };
const t0 = Date.now();

// Faixas de adversário: medianas observadas por tier nas partidas reais da 6D (data/matches-*-cloud6d.csv).
// Iniciante = Bronze (~35, 32–41); Intermediário = Silver (~48, 39–54); Avançado = Gold/Platinum baixo (~65, exploratório);
// Elite = Gold/Platinum/Masters mediano (~80, 71–86).
const BANDS = { iniciante: 35, intermediario: 48, avancado_65: 65, elite: 80 };
const PL = [45, 55, 65, 75], PT = [45, 60, 75, 90];

if (ONLY.includes('main')) {
  result.main = [];
  for (const [bn, o] of Object.entries(BANDS)) for (const p of PL) for (const q of PT) {
    const c = cell(`P${p}/Q${q} vs ${bn}(${o})`, team(p, q), opps(o)); Object.assign(c, { player: p, partner: q, band: bn, opp: o }); result.main.push(c);
  }
  console.error(`main ok ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

if (ONLY.includes('start')) {
  // Início de carreira real (OVR 22 -> ~30-38), parceiro inicial fraco (15) ou mediano (35/60), contra Bronze/Silver.
  result.start = [];
  for (const [bn, o] of [['iniciante', 35], ['intermediario', 48]]) for (const p of [22, 30, 38]) for (const q of [15, 35, 60]) {
    const c = cell(`P${p}/Q${q} vs ${bn}(${o})`, team(p, q), opps(o)); Object.assign(c, { player: p, partner: q, band: bn, opp: o }); result.start.push(c);
  }
  console.error(`start ok ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

if (ONLY.includes('controls')) {
  const C = (label, a, b) => cell(label, a, b);
  const k = {};
  // (1) mesma média de dupla (60): jogador vs parceiro importam igual?
  k.sameAverage = [];
  for (const o of [48, 80]) for (const [p, q] of [[45, 75], [75, 45], [60, 60], [55, 65], [65, 55]]) k.sameAverage.push(Object.assign(C(`P${p}/Q${q} vs ${o}`, team(p, q), opps(o)), { player: p, partner: q, opp: o }));
  // (2) lado: jogador à esquerda vs direita
  k.side = [];
  for (const [p, q, o] of [[55, 60, 48], [65, 75, 80]]) {
    k.side.push(Object.assign(C(`P${p}(dir)/Q${q}(esq) vs ${o}`, team(p, q), opps(o)), { sidePlayer: 'right' }));
    k.side.push(Object.assign(C(`P${p}(esq)/Q${q}(dir) vs ${o}`, () => [flat('pl', 'Jogador', p, 'left'), flat('pt', 'Parceiro', q, 'right')], opps(o)), { sidePlayer: 'left' }));
  }
  // (3) energia inicial do jogador (produção: ~75-91 médio nas carreiras da 6D; adversário/parceiro 100)
  k.energy = [];
  for (const e of [100, 90, 75, 60]) k.energy.push(Object.assign(C(`P55/Q60 energia jogador ${e} vs 48`, team(55, 60, { energy: e }), opps(48)), { energy: e }));
  // (4) bônus de contexto que a UI aplica ao jogador (_chemistryBonus/_coachMatchBonus/_partnerBondBonus) — afetam atributos?
  k.contextBonus = [];
  for (const [lab, ex] of [['sem bônus', {}], ['+chem 5 +coach 3 +bond 2.5', { _chemistryBonus: 5, _coachMatchBonus: 3, _partnerBondBonus: 2.5 }]])
    k.contextBonus.push(Object.assign(C(`P55/Q60 ${lab} vs 48`, team(55, 60, ex), opps(48)), { bonus: lab }));
  // (5) atributos desiguais, mesma média 55 (perfil da 6D: serve alto, backhand baixo): flat vs desigual
  const U1 = [74, 48, 31, 71, 58, 80, 49, 70, 43, 26]; // média 55
  const U2 = [45, 71, 49, 76, 52, 69, 60, 71, 84, 74]; // média ~65 (otimizador 6D)
  k.uneven = [];
  for (const o of [35, 48]) {
    k.uneven.push(Object.assign(C(`jogador plano 55 / parceiro 60 vs ${o}`, team(55, 60), opps(o)), { profile: 'flat55', opp: o }));
    k.uneven.push(Object.assign(C(`jogador desigual(avg ${(U1.reduce((a, b) => a + b) / 10).toFixed(0)}) / parceiro 60 vs ${o}`, () => [uneven('pl', 'Jogador', U1, 'right'), flat('pt', 'Parceiro', 60, 'left')], opps(o)), { profile: 'uneven_normal6d', opp: o }));
  }
  k.uneven.push(Object.assign(C('jogador plano 65 / parceiro 60 vs 48', team(65, 60), opps(48)), { profile: 'flat65', opp: 48 }));
  k.uneven.push(Object.assign(C(`jogador desigual(avg ${(U2.reduce((a, b) => a + b) / 10).toFixed(0)}) / parceiro 60 vs 48`, () => [uneven('pl', 'Jogador', U2, 'right'), flat('pt', 'Parceiro', 60, 'left')], opps(48)), { profile: 'uneven_optimizer6d', opp: 48 }));
  // (6) espalhamento dentro da dupla adversária (mesma média 48, 38/58) vs plano
  k.oppSpread = [Object.assign(C('P55/Q60 vs 48/48', team(55, 60), opps(48)), { opp: '48/48' }),
    Object.assign(C('P55/Q60 vs 38/58', team(55, 60), () => [flat('o1', 'AdvE', 38, 'left'), flat('o2', 'AdvD', 58, 'right')]), { opp: '38/58' })];
  // (7) sanidade espelho (OVR iguais): ~50%
  k.mirror = [Object.assign(C('espelho 55/55 vs 55/55', team(55, 55), opps(55)), {})];
  result.controls = k;
  console.error(`controls ok ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

if (ONLY.includes('realistic')) {
  // Atributos REAIS (snapshots semanais da 6D, código 5a8350a) do jogador em dias-chave, parceiro plano com o OVR registrado,
  // contra Bronze(35)/Silver(48); comparado com o jogador "plano" de mesma média. Isola o efeito da forma dos atributos.
  const dir = 'reports/cloud-phase-6d-career-progression-validation/data';
  result.realistic = [];
  for (const prof of ['normal', 'optimizer']) {
    const lines = readFileSync(`${dir}/weekly-${prof}-cloud6d-5a8350a.csv`, 'utf8').trim().split('\n');
    const head = lines[0].split(',');
    for (const day of [90, 180, 270, 360, 540]) {
      const rows = lines.slice(1).map((l) => l.split(',')); // snapshot semanal mais próximo do dia pedido
      const near = rows.reduce((b, c) => (Math.abs(Number(c[0]) - day) < Math.abs(Number(b[0]) - day) ? c : b), rows[0]);
      const row = Object.fromEntries(near.map((v, i) => [head[i], v]));
      if (!row.day) continue;
      const attrs = ATTRS.map((k) => Number(row[k]));
      const avg = attrs.reduce((a, b) => a + b, 0) / 10, q = Number(row.partnerOvr);
      for (const o of [35, 48]) {
        const real = cell(`${prof} d${day} real(avg ${avg.toFixed(1)}, min ${Math.min(...attrs)}, max ${Math.max(...attrs)}) / parceiro ${q} vs ${o}`, () => [uneven('pl', 'Jogador', attrs, 'right'), flat('pt', 'Parceiro', q, 'left')], opps(o));
        const fl = cell(`${prof} d${day} PLANO ${Math.round(avg)} / parceiro ${q} vs ${o}`, team(Math.round(avg), q), opps(o));
        result.realistic.push(Object.assign(real, { profile: prof, day, shape: 'real', avgAttr: +avg.toFixed(1), partner: q, opp: o, minAttr: Math.min(...attrs), maxAttr: Math.max(...attrs) }), Object.assign(fl, { profile: prof, day, shape: 'flat', avgAttr: +avg.toFixed(1), partner: q, opp: o }));
      }
    }
  }
  console.error(`realistic ok ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

if (ONLY.includes('calibration')) {
  // Calibração: para cada partida real da 6D (4 CSVs), simula a mesma configuração com atributos PLANOS
  // (jogador=playerOvr, parceiro=partnerOvr, ambos adversários=oppStrength) e compara vitórias esperadas x observadas por tier.
  const dir = 'reports/cloud-phase-6d-career-progression-validation/data';
  const NC = Number(arg('nc', 40));
  result.calibration = [];
  for (const f of ['normal-cloud6d-5a8350a', 'optimizer-cloud6d-5a8350a', 'normal-baseline-fbb0bc4', 'optimizer-baseline-fbb0bc4']) {
    const [h, ...rows] = readFileSync(`${dir}/matches-${f}.csv`, 'utf8').trim().split('\n').map((l) => l.split(','));
    const agg = {};
    for (const r of rows) {
      const m = Object.fromEntries(r.map((v, i) => [h[i], v]));
      if (!m.oppStrength) continue;
      const c = cell('cal', team(Number(m.playerOvr), Number(m.partnerOvr)), opps(Math.round(Number(m.oppStrength))), NC);
      const a = (agg[m.tier] ||= { n: 0, observedWins: 0, expectedWins: 0 });
      a.n++; a.observedWins += m.won === 'true' ? 1 : 0; a.expectedWins += c.wins / NC;
    }
    for (const a of Object.values(agg)) a.expectedWins = +a.expectedWins.toFixed(1);
    result.calibration.push({ file: f, nPerMatch: NC, byTier: agg });
  }
  console.error(`calibration ok ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

result.meta.elapsedSec = +((Date.now() - t0) / 1000).toFixed(0);
writeFileSync(`${OUT}/scenario-results-n${N}.json`, JSON.stringify(result, null, 1));
console.log(`escrito ${OUT}/scenario-results-n${N}.json em ${result.meta.elapsedSec}s`);
