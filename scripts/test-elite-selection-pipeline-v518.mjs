// Playthrough 5.18-F, Partes J/K/L/N/O — ATRIBUIÇÃO DAS LACUNAS DE ABERTURA.
//
// A 5.18-E provou o que as 6 lacunas NÃO são (não é parceria stale, não é
// lesão, não é aposentadoria, não é survivor bias) e parou aí. Esta é a peça
// que faltava: para cada semana ociosa, em qual ETAPA do pipeline competitivo
// a dupla parou.
//
// Gate central (Parte K): 0 semana sem estágio identificado. Um `stage: null`
// significa que a instrumentação não cobre o caminho real — é falha de
// medição, não do jogo, e precisa aparecer como vermelho.
import assert from 'node:assert/strict';
import {
  runPipelineInstrumentedRun, findGaps, stageHistogram, PIPELINE_STAGES,
} from './lib/selectionPipelineHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const run = await runPipelineInstrumentedRun({ label: 'elite-pipeline', years: 1, cohortSize: 20 });

// Reagrupa por dupla observada.
const byKey = new Map();
for (const snap of run.weekly) {
  for (const row of snap.rows) {
    if (!byKey.has(row.key)) byKey.set(row.key, []);
    byKey.get(row.key).push(row);
  }
}
const nameOf = (key) => run.cohort.find((c) => c.key === key)?.name || key;
const initialRankOf = (key) => run.cohort.find((c) => c.key === key)?.initialRank ?? null;

console.log(`\n=== Run: ${run.weekly.length} semanas instrumentadas, ${byKey.size} duplas observadas ===\n`);

// ---------------------------------------------------------------- Parte K
const allRows = [...byKey.values()].flat();
// `exists` fora do filtro DE PROPÓSITO: uma dupla mutuamente declarada que
// não está no pool canônico é o caso mais grave, não um caso a descartar.
const idleRows = allRows.filter((r) => !r.played && r.mutual);

// --- Parte Q — duplas mútuas fora do pool canônico -------------------------
const ghostWeeks = allRows.filter((r) => r.mutual && !r.exists);
console.log(`=== Parte Q — semanas com dupla mútua FORA do pool canônico: ${ghostWeeks.length} ===`);
if (ghostWeeks.length) {
  const byPair = new Map();
  for (const r of ghostWeeks) byPair.set(r.key, (byPair.get(r.key) || 0) + 1);
  for (const [key, n] of [...byPair].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    const sample = ghostWeeks.find((r) => r.key === key);
    console.log(`  ${nameOf(key)}: ${n} semanas | membro A preso em: ${sample.shadow_pair_a?.name || '(nenhuma)'} | membro B preso em: ${sample.shadow_pair_b?.name || '(nenhuma)'}`);
  }
}
console.log('');
const globalHist = stageHistogram(idleRows);
console.log('Histograma global de etapas (semanas ociosas com dupla existente):');
for (const [stage, n] of Object.entries(globalHist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${stage.padEnd(24)} ${n}`);
}
console.log('');

check('Parte Q: nenhuma dupla mútua fica fora do pool de candidatos', () => {
  note(`semanas com dupla recíproca ausente do pool canônico: ${ghostWeeks.length}`);
  assert.equal(ghostWeeks.length, 0, `${ghostWeeks.length} semanas com dupla mútua invisível ao sorteio`);
});

check('Parte K: nenhuma semana ociosa sem estágio identificado', () => {
  const unstaged = idleRows.filter((r) => !r.stage);
  note(`semanas ociosas classificadas=${idleRows.length} sem estágio=${unstaged.length}`);
  assert.equal(unstaged.length, 0, `${unstaged.length} semanas sem estágio`);
});

check('Parte E: chooseTournament nunca devolve decisão sem motivo', () => {
  const mute = allRows.filter((r) => r.choose_decision && r.choose_decision !== 'play' && !r.choose_reason);
  note(`decisões não-play observadas=${allRows.filter((r) => r.choose_decision === 'rest').length}`);
  assert.equal(mute.length, 0, `${mute.length} decisões sem reason`);
});

// ---------------------------------------------------------------- Parte J
const gapsByKey = new Map();
for (const [key, rows] of byKey) {
  const gaps = findGaps(rows).filter((g) => g.length >= 12);
  if (gaps.length) gapsByKey.set(key, gaps);
}

const extremeGaps = [];
for (const [key, gaps] of gapsByKey) {
  for (const g of gaps) if (g.length >= 20) extremeGaps.push({ key, gap: g });
}
extremeGaps.sort((a, b) => b.gap.length - a.gap.length);

// A DISTRIBUIÇÃO INTEIRA, sempre — não só o que cruza o limiar. Sem isto,
// "0 lacunas >=20" é indistinguível de "a instrumentação não viu nada", e um
// gate que passa por ausência de caso se disfarça de prova.
const allGaps = [];
for (const [key, rows] of byKey) for (const g of findGaps(rows)) allGaps.push({ key, gap: g });
allGaps.sort((a, b) => b.gap.length - a.gap.length);
const lens = allGaps.map((x) => x.gap.length);
console.log('=== Distribuição de lacunas (todas, com dupla existente e recíproca) ===');
console.log(`  n=${allGaps.length} | máx=${lens[0] ?? 0} | >=8: ${lens.filter((l) => l >= 8).length} | >=12: ${lens.filter((l) => l >= 12).length} | >=20: ${lens.filter((l) => l >= 20).length} | >=26: ${lens.filter((l) => l >= 26).length}`);
for (const { key, gap } of allGaps.slice(0, 5)) {
  const hist = stageHistogram(gap.weeks);
  const dom = Object.entries(hist).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
  const ranks = gap.weeks.map((w) => w.team_rank).filter(Boolean);
  console.log(`  ${nameOf(key)}: ${gap.length} sem (${gap.start} -> ${gap.end}) TeamRank ${ranks.length ? `${Math.min(...ranks)}-${Math.max(...ranks)}` : '—'} | ${dom[0]}=${dom[1]}`);
}
console.log('');

console.log(`=== Lacunas >=20 semanas com dupla existente: ${extremeGaps.length} ===\n`);
for (const { key, gap } of extremeGaps) {
  const hist = stageHistogram(gap.weeks);
  const ranks = gap.weeks.map((w) => w.team_rank).filter(Boolean);
  const entryRanks = gap.weeks.map((w) => w.pair_entry_rank);
  const top10 = gap.weeks.filter((w) => w.team_rank && w.team_rank <= 10).length;
  console.log(`#${initialRankOf(key)} ${nameOf(key)}`);
  console.log(`  lacuna: ${gap.length} semanas (${gap.start} -> ${gap.end})`);
  console.log(`  TeamRank min/max: ${Math.min(...ranks)}/${Math.max(...ranks)} | Top10 em ${top10}/${gap.length}`);
  console.log(`  pairEntryRank (rank INDIVIDUAL médio) min/max: ${Math.min(...entryRanks)}/${Math.max(...entryRanks)}`);
  console.log(`  etapas: ${Object.entries(hist).map(([s, n]) => `${s}=${n}`).join(' ')}`);
  const sample = gap.weeks.find((w) => w.events_this_week > 0) || gap.weeks[0];
  console.log(`  amostra ${sample.date}: eventos=${sample.events_this_week} elegíveis=${sample.eligible_events} decisão=${sample.choose_decision} escolhido=${sample.selected_tier || '—'} campo=${sample.capacity_size ?? '—'}/${sample.draw_size ?? '—'}`);
  if (sample.ineligible_reasons?.length) console.log(`  motivos de inelegibilidade: ${sample.ineligible_reasons.slice(0, 3).join(' | ')}`);
  console.log('');
}

check('Parte J: toda lacuna >=20 semanas tem histograma de etapas completo', () => {
  const broken = extremeGaps.filter(({ gap }) => gap.weeks.some((w) => !w.stage));
  note(`lacunas >=20 semanas=${extremeGaps.length}`);
  assert.equal(broken.length, 0, `${broken.length} lacunas com semana não classificada`);
});

// ---------------------------------------------------------------- Parte N
// A autoridade de admissão. O ponto a provar: `pairEntryRank` lê o rank
// INDIVIDUAL dos dois atletas, nunca o TeamRanking da dupla. Se os dois
// divergirem sistematicamente, a dupla é admitida por uma autoridade que não
// é a que o jogo exibe como ranking da dupla.
const bothKnown = allRows.filter((r) => r.exists && r.team_rank && r.pair_entry_rank > 0);
const divergent = bothKnown.filter((r) => Math.abs(r.team_rank - r.pair_entry_rank) > 50);
console.log('=== Parte N — autoridade de admissão ===');
note(`semanas com TeamRank e pairEntryRank conhecidos: ${bothKnown.length}`);
note(`divergência >50 posições entre TeamRank e pairEntryRank: ${divergent.length} (${bothKnown.length ? Math.round((divergent.length / bothKnown.length) * 100) : 0}%)`);
const noEntryRank = allRows.filter((r) => r.exists && r.pair_entry_rank === 0);
note(`semanas com pairEntryRank=0 (nenhum membro com rank individual): ${noEntryRank.length}`);
if (bothKnown.length) {
  const sample = bothKnown[0];
  note(`amostra: TeamRank=${sample.team_rank} pairEntryRank=${sample.pair_entry_rank} (indiv ${sample.individual_rank_a}/${sample.individual_rank_b})`);
}

check('Parte N: a autoridade de admissão está documentada e observável', () => {
  assert.ok(bothKnown.length > 0, 'nenhuma semana com as duas autoridades observáveis — instrumentação cega');
});

// ---------------------------------------------------------------- Parte L
console.log('\n=== Parte L — as duas duplas Top10 do gap ===');
const top10Gaps = extremeGaps.filter(({ gap }) => gap.weeks.some((w) => w.team_rank && w.team_rank <= 10));
if (!top10Gaps.length) {
  note('nenhuma dupla Top10 com lacuna >=20 semanas nesta run');
} else {
  for (const { key, gap } of top10Gaps) {
    const hist = stageHistogram(gap.weeks);
    const dominant = Object.entries(hist).sort((a, b) => b[1] - a[1])[0];
    console.log(`  ${nameOf(key)}: ${gap.length} semanas | etapa dominante ${dominant[0]} (${dominant[1]}/${gap.length})`);
    const weeksWithEvents = gap.weeks.filter((w) => w.events_this_week > 0);
    console.log(`    semanas com evento no calendário: ${weeksWithEvents.length}/${gap.length}`);
    console.log(`    semanas elegível a >=1 evento: ${gap.weeks.filter((w) => w.eligible_events > 0).length}`);
    console.log(`    semanas que escolheram jogar: ${gap.weeks.filter((w) => w.choose_decision === 'play').length}`);
    console.log(`    semanas atribuídas a um torneio: ${gap.weeks.filter((w) => w.selected_event).length}`);
  }
}

// ---------------------------------------------------------------- Parte P
// Gate substantivo: uma Top10 ativa, saudável, elegível e com evento na
// semana não pode ficar >=20 semanas parada sem que a etapa dominante seja
// uma causa esportivamente plausível. CHOOSE_NONE e CUT_BY_CAPACITY são
// plausíveis (decisão e concorrência); NOT_IN_CANDIDATE_POOL e INELIGIBLE
// para quem é Top10 não são.
check('Parte P/Q: nenhuma Top10 fica fora do candidate pool ou inelegível durante a lacuna', () => {
  const offenders = [];
  for (const { key, gap } of top10Gaps) {
    const bad = gap.weeks.filter((w) => (
      w.team_rank && w.team_rank <= 10 && w.events_this_week > 0
      && (w.stage === PIPELINE_STAGES.NOT_IN_CANDIDATE_POOL || w.stage === PIPELINE_STAGES.INELIGIBLE)
    ));
    if (bad.length) offenders.push(`${nameOf(key)}: ${bad.length} semanas (${bad[0].stage})`);
  }
  note(`duplas Top10 com lacuna >=20 semanas: ${top10Gaps.length}`);
  assert.equal(offenders.length, 0, offenders.join(' | '));
});

// ---------------------------------------------------------------- Parte T
check('Parte T: nenhuma Top10 ativa/saudável/elegível com lacuna >=20 semanas', () => {
  const offenders = top10Gaps.map(({ key, gap }) => {
    const hist = stageHistogram(gap.weeks);
    const dominant = Object.entries(hist).sort((a, b) => b[1] - a[1])[0];
    return `${nameOf(key)} (${gap.length}sem, ${dominant[0]})`;
  });
  assert.equal(offenders.length, 0, offenders.join(' | '));
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
