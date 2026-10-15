// Playthrough 5.26-B — comparação 5.26 (bugada) × 5.26-B (pós-correção) no
// MESMO horizonte (primeiros 730 dias) e mesmos perfis. Só leitura dos JSON
// brutos das duas auditorias. Saída: reports/progression-integrity-526b/comparison.{json,md}
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const HORIZON = 730;
const load = (dir) => readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.save.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const before = load(resolve('reports/progression-economy-526/raw'));
const after = load(resolve('reports/progression-integrity-526b/smoke/raw'));
const CLASS = { Bronze: 'Fácil', Silver: 'Fácil', Gold: 'Médio', Platinum: 'Médio', Masters: 'Difícil', Elite: 'Difícil', Crown: 'Difícil' };
const median = (v) => { const s = v.filter((x) => x != null && Number.isFinite(Number(x))).map(Number).sort((a, b) => a - b); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const RAR = ['comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico', 'exclusivo'];

function metrics(careers, label) {
  const cutDate = (c) => c.weekly.find((w) => w.day >= HORIZON)?.date || c.weekly.at(-1).date;
  const matches = careers.flatMap((c) => c.matches.filter((m) => m.date <= cutDate(c)));
  const win = (cls) => { const g = matches.filter((m) => CLASS[m.tier] === cls); return { n: g.length, winPct: pct(g.filter((m) => m.won).length, g.length) }; };
  const at = (c) => c.weekly.filter((w) => w.day <= HORIZON).at(-1);
  const months = (c) => Object.keys(c.ledger).sort().slice(0, 24);
  const lost = careers.map((c) => months(c).reduce((t, m) => t + (Number(c.ledger[m].expense.reward_overwrite) || 0), 0));
  const tiers = new Set(careers.flatMap((c) => c.sponsors.filter((s) => s.day <= HORIZON).map((s) => s.tier)));
  const tierOrder = ['Bronze', 'Prata', 'Ouro'];
  const titles = careers.reduce((t, c) => t + c.tournaments.filter((x) => x.day <= HORIZON && x.status === 'champion').length, 0);
  // 5.26 rodou COM o shim: "freeze" = carreiras em que o jogo real teria travado dentro do horizonte.
  const froze = careers.filter((c) => (c.softLock?.firstDay != null && c.softLock.firstDay <= HORIZON) || c.advanceFailures?.length).length;
  const shopBest = (c) => { const w = at(c); if (w?.shopUnlockedRarity) return w.shopUnlockedRarity; const best = (c.purchases || []).filter((p) => p.day <= HORIZON).reduce((b, p) => Math.max(b, RAR.indexOf(p.rarity)), -1); return best >= 0 ? `${RAR[best]} (compra)` : null; };
  return {
    label, careers: careers.length,
    partnerEngineOvrMedian: median(matches.map((m) => m.engineOvr?.A?.[1])),
    partnerCardOvrMedian: median(matches.map((m) => m.partnerDisplayOvr ?? m.partnerOvr)),
    partnerEngineEqualsCardPct: pct(matches.filter((m) => m.engineOvr && m.engineOvr.A[1] === (m.partnerDisplayOvr ?? m.partnerOvr)).length, matches.length),
    easy: win('Fácil'), medium: win('Médio'), hard: win('Difícil'),
    overallWinPct: pct(matches.filter((m) => m.won).length, matches.length), matches: matches.length,
    freezeCareersPct: pct(froze, careers.length),
    achievementCoinLossPerCareer2y: median(lost),
    reputationMedianAt2y: median(careers.map((c) => at(c)?.reputation || 0)),
    ageAt2y: median(careers.map((c) => at(c)?.age ?? null)),
    rankingPositionWrittenPct: pct(careers.filter((c) => c.weekly.some((w) => w.rankingPositionField != null)).length, careers.length),
    sponsorTiers: tierOrder.filter((t) => tiers.has(t)), sponsorMaxTier: tierOrder.filter((t) => tiers.has(t)).at(-1) || null,
    shopBestByCareer: Object.entries(careers.map(shopBest).reduce((a, k) => { a[k] = (a[k] || 0) + 1; return a; }, {})).map(([k, v]) => `${k}: ${v}`).join(', '),
    rankMedianAt2y: median(careers.map((c) => at(c)?.rank)),
    rankMedianAt1y: median(careers.map((c) => c.weekly.filter((w) => w.day <= 365).at(-1)?.rank)),
    titles2y: titles, titlesPerCareerYear: Math.round((titles / (careers.length * 2)) * 100) / 100,
    finalsWonPct: pct(matches.filter((m) => m.round === 'Final' && m.won).length, matches.filter((m) => m.round === 'Final').length),
  };
}

// Mesma composição: 5.26 seeds 1–5 de cada perfil (as mesmas seeds da 5.26-B).
const beforeSame = before.filter((c) => c.seed >= 1 && c.seed <= 5);
const out = { horizonDays: HORIZON, before: metrics(beforeSame, '5.26 bugada (seeds 1–5, 730 dias)'), beforeAll: metrics(before, '5.26 bugada (todas as 45, 730 dias)'), after: metrics(after, '5.26-B pós-correção (seeds 1–5, 730 dias)') };
writeFileSync(resolve('reports/progression-integrity-526b/comparison.json'), JSON.stringify(out, null, 2));
const b = out.before; const a = out.after;
const row = (name, x, y) => `| ${name} | ${x ?? '—'} | ${y ?? '—'} |`;
const md = [
  '| Métrica (primeiros 730 dias, seeds 1–5 × 3 perfis) | 5.26 bugada | 5.26-B pós-fix |', '|---|---|---|',
  row('OVR do parceiro no motor (mediana)', b.partnerEngineOvrMedian, a.partnerEngineOvrMedian),
  row('OVR do parceiro no card (mediana)', b.partnerCardOvrMedian, a.partnerCardOvrMedian),
  row('Partidas com motor = card', `${b.partnerEngineEqualsCardPct}%`, `${a.partnerEngineEqualsCardPct}%`),
  row('Vitória Fácil (Bronze/Silver)', `${b.easy.winPct}% (n=${b.easy.n})`, `${a.easy.winPct}% (n=${a.easy.n})`),
  row('Vitória Médio (Gold/Platinum)', `${b.medium.winPct}% (n=${b.medium.n})`, `${a.medium.winPct}% (n=${a.medium.n})`),
  row('Vitória Difícil (Masters/Elite/Crown)', `${b.hard.winPct}% (n=${b.hard.n})`, `${a.hard.winPct}% (n=${a.hard.n})`),
  row('Carreiras que travariam no horizonte', `${b.freezeCareersPct}%`, `${a.freezeCareersPct}%`),
  row('Moedas de conquista apagadas (mediana/carreira, 2 anos)', b.achievementCoinLossPerCareer2y, a.achievementCoinLossPerCareer2y),
  row('Reputação aos 2 anos (mediana)', b.reputationMedianAt2y, a.reputationMedianAt2y),
  row('Idade aos 2 anos', b.ageAt2y ?? '16 (relógio do PC)', a.ageAt2y),
  row('`ranking_position` gravado', `${b.rankingPositionWrittenPct}%`, `${a.rankingPositionWrittenPct}%`),
  row('Tiers de patrocínio assinados', b.sponsorTiers.join('/'), a.sponsorTiers.join('/')),
  row('Loja: maior raridade liberada', b.shopBestByCareer, a.shopBestByCareer),
  row('Rank mediano em 1 ano', b.rankMedianAt1y, a.rankMedianAt1y),
  row('Rank mediano em 2 anos', b.rankMedianAt2y, a.rankMedianAt2y),
  row('Títulos (total, 15 carreiras × 2 anos)', b.titles2y, a.titles2y),
  row('Finais vencidas', `${b.finalsWonPct}%`, `${a.finalsWonPct}%`),
].join('\n');
writeFileSync(resolve('reports/progression-integrity-526b/comparison.md'), `${md}\n`);
console.log(md);
