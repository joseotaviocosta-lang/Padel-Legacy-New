// Playthrough 5.26-C — comparação 5.26 (bugada, com shim) × 5.26-B
// (integridade) × 5.26-C (re-auditoria limpa). Mesmo horizonte e composição:
// primeiros 730 dias, seeds 1–5 × 3 perfis. Segunda tabela: 5 temporadas
// (5.26 × 5.26-C, lote principal de 45; a 5.26-B não rodou 5 anos).
// Só leitura dos JSON brutos. Saída: reports/progression-clean-526c/
// comparison-526-vs-526b-vs-526c.{md,json}
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const load = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => /^(casual|normal|optimizer)-\d{3}\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))) : []);
const s526 = load(resolve('reports/progression-economy-526/raw'));
const s526b = load(resolve('reports/progression-integrity-526b/smoke/raw'));
const s526cSmoke = load(resolve('reports/progression-clean-526c/smoke/raw'));
const s526cMain = load(resolve('reports/progression-clean-526c/runs/raw'));
const CLASS = { Bronze: 'Fácil', Silver: 'Fácil', Gold: 'Médio', Platinum: 'Médio', Masters: 'Difícil', Elite: 'Difícil', Crown: 'Difícil', 'Circuit Finals': 'Difícil', 'Legacy Finals': 'Difícil' };
const ORIGINAL = new Set(['babolat', 'siux', 'varlion', 'nox', 'wilson', 'adidas', 'joma', 'bullpadel', 'head']);
const median = (v) => { const s = v.filter((x) => x != null && Number.isFinite(Number(x))).map(Number).sort((a, b) => a - b); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

function metrics(careers, horizon, label, shim) {
  if (!careers.length) return { label, careers: 0 };
  const at = (c, day = horizon) => c.weekly.filter((w) => w.day <= day).at(-1);
  const cut = (c) => at(c)?.date || c.weekly.at(-1).date;
  const matches = careers.flatMap((c) => c.matches.filter((m) => m.date <= cut(c)));
  const win = (cls) => { const g = matches.filter((m) => CLASS[m.tier] === cls); return { n: g.length, winPct: pct(g.filter((m) => m.won).length, g.length) }; };
  const tours = careers.flatMap((c) => c.tournaments.filter((t) => t.day <= horizon));
  const tiers = new Set(careers.flatMap((c) => c.sponsors.filter((s) => s.day <= horizon).map((s) => s.tier)));
  const froze = careers.filter((c) => (c.softLock?.firstDay != null && c.softLock.firstDay <= horizon) || c.advanceFailures?.length).length;
  // Salto na virada 2026→2027: semana anterior × semana seguinte ao 01/01.
  const jump = careers.map((c) => { const b = [...c.weekly].reverse().find((w) => w.date < '2027-01-01'); const a = c.weekly.find((w) => w.date >= '2027-01-01'); return b && a ? (b.rank || 0) - (a.rank || 0) : null; });
  const loops = careers.map((c) => { const n = {}; for (const p of c.partners || []) n[p.partnerId] = (n[p.partnerId] || 0) + 1; return Math.max(0, ...Object.values(n)); });
  const ranked = matches.filter((m) => m.oppTeamRank);
  const years = horizon / 365;
  return {
    label, careers: careers.length, matches: matches.length,
    easy: win('Fácil'), medium: win('Médio'), hard: win('Difícil'), overallWinPct: pct(matches.filter((m) => m.won).length, matches.length),
    freezeCareersPct: pct(froze, careers.length), shimUsed: shim ?? (careers.every((c) => c.shimEver === false) ? 'não' : 'sim'),
    partnerEngineEqualsCardPct: pct(matches.filter((m) => m.engineOvr && m.engineOvr.A[1] === (m.partnerDisplayOvr ?? m.partnerOvr)).length, matches.length),
    rankMedian1y: median(careers.map((c) => at(c, 365)?.rank)), rankMedianEnd: median(careers.map((c) => at(c)?.rank)),
    ovrMedianEnd: median(careers.map((c) => at(c)?.ovr)),
    rankJumpNewYear2027Median: median(jump), rankJumpNewYear2027Max: Math.max(...jump.filter((x) => x != null)),
    titlesPerCareerYear: Math.round((tours.filter((t) => t.status === 'champion').length / (careers.length * years)) * 100) / 100,
    finalsPerCareerYear: Math.round((tours.filter((t) => t.roundsWon >= t.totalRounds - 1).length / (careers.length * years)) * 100) / 100,
    sponsorTiers: ['Bronze', 'Prata', 'Ouro'].filter((t) => tiers.has(t)).join('/'),
    originalSponsorsSigned: careers.flatMap((c) => c.sponsors.filter((s) => s.day <= horizon && ORIGINAL.has(s.sponsor))).length,
    reputationMedianEnd: median(careers.map((c) => at(c)?.reputation || 0)),
    opponentRankedPct: pct(ranked.length, matches.length), upsetsWon: matches.filter((m) => m.upset).length,
    samePartnerMaxSignings: Math.max(0, ...loops), careersWithResignLoopPct: pct(loops.filter((x) => x >= 10).length, careers.length),
    achievementCoinLossMedian: median(careers.map((c) => Object.keys(c.ledger).sort().slice(0, Math.round(horizon / 30.4)).reduce((t, m) => t + (Number(c.ledger[m].expense.reward_overwrite) || 0), 0))),
    saveMBEnd: median(careers.map((c) => at(c)?.saveMB)),
    errorsPerCareer: median(careers.map((c) => (c.errors || []).length)),
  };
}
const same = (list) => list.filter((c) => c.seed >= 1 && c.seed <= 5);
// 5.26-B: os 14 JSON brutos usados no relatório da 5.26-B não foram
// preservados (a pasta smoke/ foi esvaziada para um re-run interrompido; só
// 3 carreiras sobraram). As métricas documentadas em comparison.json (n=14)
// são a fonte; métricas novas desta fase saem das 3 sobreviventes (marcadas †).
const b526 = JSON.parse(readFileSync(resolve('reports/progression-integrity-526b/comparison.json'), 'utf8')).after;
const fromRaw = metrics(same(s526b), 730, '5.26-B', 'não (opt-in)');
const B_DOCUMENTED = new Set(['careers', 'matches', 'easy', 'medium', 'hard', 'overallWinPct', 'freezeCareersPct', 'partnerEngineEqualsCardPct', 'rankMedian1y', 'rankMedianEnd', 'titlesPerCareerYear', 'sponsorTiers', 'reputationMedianEnd', 'achievementCoinLossMedian', 'shimUsed', 'label']);
const m526b = { ...Object.fromEntries(Object.entries(fromRaw).map(([k, v]) => [k, B_DOCUMENTED.has(k) ? v : (v == null ? v : `${typeof v === 'object' ? JSON.stringify(v) : v} †`)])),
  careers: b526.careers, matches: b526.matches, easy: b526.easy, medium: b526.medium, hard: b526.hard, overallWinPct: b526.overallWinPct, freezeCareersPct: b526.freezeCareersPct,
  partnerEngineEqualsCardPct: b526.partnerEngineEqualsCardPct, rankMedian1y: b526.rankMedianAt1y, rankMedianEnd: b526.rankMedianAt2y, titlesPerCareerYear: b526.titlesPerCareerYear,
  sponsorTiers: (b526.sponsorTiers || []).join('/'), reputationMedianEnd: b526.reputationMedianAt2y, achievementCoinLossMedian: b526.achievementCoinLossPerCareer2y };
const t730 = [metrics(same(s526), 730, '5.26 (com shim)', 'sim'), m526b, metrics(same(s526cSmoke), 730, '5.26-C (limpa)')];
const t5y = [metrics(s526, 1826, '5.26 (com shim, 45)', 'sim'), metrics(s526cMain, 1826, `5.26-C (limpa, ${s526cMain.length})`)];
writeFileSync(resolve('reports/progression-clean-526c/comparison-526-vs-526b-vs-526c.json'), JSON.stringify({ horizon730: t730, horizon5y: t5y }, null, 2));

const pc = (v) => (typeof v === 'string' && v.endsWith(' †') ? `${v.slice(0, -2)}% †` : `${v}%`);
const ROWS = [
  ['Carreiras', (m) => m.careers], ['Partidas', (m) => m.matches],
  ['Shim de soft-lock', (m) => m.shimUsed], ['Carreiras que travariam no horizonte', (m) => pc(m.freezeCareersPct)],
  ['Vitória Fácil (Bronze/Silver)', (m) => `${m.easy?.winPct}% (n=${m.easy?.n})`], ['Vitória Médio (Gold/Platinum)', (m) => `${m.medium?.winPct}% (n=${m.medium?.n})`], ['Vitória Difícil (Masters+)', (m) => `${m.hard?.winPct}% (n=${m.hard?.n})`],
  ['Motor = card do parceiro', (m) => pc(m.partnerEngineEqualsCardPct)],
  ['Rank mediano em 1 ano', (m) => m.rankMedian1y], ['Rank mediano no fim do horizonte', (m) => m.rankMedianEnd], ['OVR mediano no fim', (m) => m.ovrMedianEnd],
  ['Salto de rank na virada 2027 (mediana / máx.)', (m) => `${m.rankJumpNewYear2027Median} / ${m.rankJumpNewYear2027Max}`],
  ['Títulos por carreira-ano', (m) => m.titlesPerCareerYear], ['Finais por carreira-ano', (m) => m.finalsPerCareerYear],
  ['Tiers de patrocínio assinados', (m) => m.sponsorTiers || '—'], ['Assinaturas dos 9 patrocinadores originais', (m) => m.originalSponsorsSigned],
  ['Reputação mediana no fim', (m) => m.reputationMedianEnd],
  ['Adversários com rank canônico', (m) => pc(m.opponentRankedPct)], ['Zebras registradas', (m) => m.upsetsWon],
  ['Máx. assinaturas do mesmo parceiro', (m) => m.samePartnerMaxSignings], ['Carreiras com laço de re-contratação', (m) => pc(m.careersWithResignLoopPct)],
  ['Moedas de conquista apagadas (mediana)', (m) => m.achievementCoinLossMedian], ['Save no fim (MB, mediana)', (m) => m.saveMBEnd], ['Erros por carreira (mediana)', (m) => m.errorsPerCareer],
];
const table = (cols, title) => [`### ${title}`, '', `| Métrica | ${cols.map((c) => c.label).join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`, ...ROWS.map(([name, f]) => `| ${name} | ${cols.map((c) => (c.careers ? f(c) ?? '—' : '—')).join(' | ')} |`)].join('\n');
const md = [table(t730, 'Primeiros 730 dias — seeds 1–5 × 3 perfis (mesma composição nos três estados)'), '', '† 5.26-B: valor das 3 carreiras brutas que sobreviveram (seed 1 dos três perfis); as demais linhas da coluna são as métricas documentadas no relatório da 5.26-B (comparison.json, 14 carreiras).', '', table(t5y, '5 temporadas — lote principal')].join('\n');
writeFileSync(resolve('reports/progression-clean-526c/comparison-526-vs-526b-vs-526c.md'), `${md}\n`);
console.log(md);
