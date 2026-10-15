// Playthrough 5.4, TESTE 1/Parte C — gate central da fase. Prova, com uma
// simulação REAL (não hardcoded, não mockada), que duplas de elite REAIS
// do catálogo (Coello/Tapia, Galán/Chingotto, Lebrón/Augsburger, Stupa/
// Yanguas, Nieto/Di Nenno) participam do circuito ao longo de uma
// temporada — direto respondendo a preocupação do briefing desta fase
// ("0 participações... potencialmente um bug estrutural grave").
//
// Achado-chave (Parte A/B, documentado em tierRebalanceHarness.mjs): o
// "0 participações" da Playthrough 5.3 era um bug de MEDIÇÃO, não do
// motor do jogo. `Tournament.draw_pair_ids` pode conter (1) um ID real
// de `Partnership` OU (2) um ID sintético `profile-pair:{idA}:{idB}`
// (WorldTourLifecycle.js:buildCanonicalPairs, caminho de fallback pra
// atletas com `ai_partner_id` mas sem linha `Partnership` formal —
// exatamente o caso dos atletas reais seedados). O teste anterior
// (test-elite-pair-tier-distribution.mjs, Playthrough 5.3) resolvia
// membros só via `Partnership`, então nunca via essas duplas jogarem.
//
// Este teste NÃO confia em igualdade de `pairId` (que pode mudar de
// formato ao longo da temporada, se uma Partnership formal se formar
// no meio do caminho) — em vez disso resolve os IDs de atleta membros
// de cada `draw_pair_ids` (via `canonicalPairAthleteIds`, que já trata
// os dois formatos) e verifica se os DOIS atletas de uma dupla-alvo
// apareceram JUNTOS no mesmo par em algum torneio resolvido.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, canonicalPairAthleteIds } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_ELITE_PARTICIPATION_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'elite-part-auth', trackWeeklyDraws: false });

const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));

// Duplas-alvo nomeadas explicitamente no briefing da fase — cada uma
// identificada por DOIS regexes de nome (não um regex único que casaria
// com qualquer atleta de sobrenome parecido), pra garantir que estamos
// medindo a dupla certa, não um atleta avulso.
const TARGET_PAIRS = [
  { label: 'Coello/Tapia', mustPass: true, nameRegexes: [/coello/i, /tapia/i] },
  { label: 'Galán/Chingotto', mustPass: true, nameRegexes: [/gal[aá]n/i, /chingotto/i] },
  { label: 'Lebrón/Augsburger', mustPass: false, nameRegexes: [/lebr[oó]n/i, /augsburger/i] },
  { label: 'Stupa/Yanguas', mustPass: false, nameRegexes: [/stupa/i, /yanguas/i] },
  { label: 'Nieto/Di Nenno', mustPass: false, nameRegexes: [/nieto/i, /di\s*nenno/i] },
];

const resolvedTournaments = sim.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);

function findAthlete(regex) {
  return sim.athletes.find((a) => regex.test(a.name || ''));
}

console.log(`=== simulação: ${years} temporada(s), ${sim.athletes.length} atletas, ${sim.partnerships.length} partnerships, ${resolvedTournaments.length} torneios resolvidos ===\n`);

const report = [];
for (const target of TARGET_PAIRS) {
  const [athleteA, athleteB] = target.nameRegexes.map(findAthlete);
  if (!athleteA || !athleteB) {
    console.log(`(${target.label}: um ou ambos os atletas não encontrados no catálogo desta seed — pulando, sem hardcode de fallback)`);
    report.push({ ...target, found: false });
    continue;
  }
  const idA = athleteA.id; const idB = athleteB.id;
  const appearances = [];
  for (const tournament of resolvedTournaments) {
    for (const pairId of tournament.draw_pair_ids) {
      const memberIds = canonicalPairAthleteIds(pairId, partnershipById);
      if (memberIds.includes(idA) && memberIds.includes(idB)) {
        appearances.push({ tournamentId: tournament.id, tier: tournament.tier, drawDate: tournament.draw_date, pairId });
      }
    }
  }
  const byTier = {};
  for (const app of appearances) byTier[app.tier] = (byTier[app.tier] || 0) + 1;
  console.log(`${target.label} (rank ${athleteA.ranking_position}/${athleteB.ranking_position}, OVR ${athleteA.overall_rating}/${athleteB.overall_rating}): ${appearances.length} participações — ` + (Object.keys(byTier).length ? Object.entries(byTier).map(([t, c]) => `${t}=${c}`).join(' ') : 'nenhuma'));
  report.push({ ...target, found: true, athleteA: athleteA.name, athleteB: athleteB.name, appearances: appearances.length, byTier });
}

console.log('\n=== resultado por dupla-alvo ===');
for (const r of report) {
  if (!r.found) { console.log(`${r.label}: NÃO ENCONTRADA no catálogo desta seed`); continue; }
  console.log(`${r.label}: ${r.appearances} participações na temporada`);
}

for (const r of report.filter((r) => r.mustPass)) {
  check(`${r.label} encontrada no catálogo desta seed`, () => {
    assert.ok(r.found, `${r.label} não foi encontrada — catálogo real pode estar ausente nesta seed`);
  });
  check(`${r.label} tem participação REAL não-zero na temporada (não hardcoded)`, () => {
    assert.ok(r.found && r.appearances > 0, `${r.label}: ${r.found ? r.appearances : 'n/a'} participações — esperado > 0`);
  });
}

// Duplas não-obrigatórias (mustPass:false) são só reportadas — Parte E
// desta fase proíbe hard bans, então a AUSÊNCIA delas numa amostra de 1
// temporada não é necessariamente um bug (pode ser variância normal de
// seed), mas presença delas reforça a evidência.
const optionalWithParticipation = report.filter((r) => !r.mustPass && r.found && r.appearances > 0).length;
const optionalFound = report.filter((r) => !r.mustPass && r.found).length;
console.log(`\n(duplas opcionais encontradas no catálogo: ${optionalFound}/3; com participação real: ${optionalWithParticipation}/${optionalFound || 3})`);

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-elite-pair-participation-authority: PASS');
