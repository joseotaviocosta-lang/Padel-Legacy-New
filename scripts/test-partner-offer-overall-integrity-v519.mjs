// Playthrough 5.19, Partes H/I/J/K — INTEGRIDADE DO OVR DAS PROPOSTAS.
//
// O playtest: após a saída de Pedro, as quatro novas propostas apareceram com
// OVR 1 (Alfonso Fernandes, Franco Acosta, Marco Villa, Diogo Rocha).
//
// Causa medida (Parte I): não era a UI, nem o mercado, nem materialização
// incompleta. Era `overallRating()` em src/lib/padel.js. Existem DUAS fontes
// de overall no jogo:
//   - PlayerProfile guarda ATRIBUTOS (serve, forehand, ...) e nenhum
//     `overall_rating` — o overall é derivado, e precisa continuar sendo;
//   - AthleteProfile (o mundo todo) guarda `overall_rating` e NENHUM atributo.
//     Medido: Arturo Coello, #1 do mundo com `overall_rating: 96`, tem 0 de 11
//     atributos.
// A função somava só atributos: para todo atleta do mundo dava 0, e o piso
// `Math.max(1, ...)` convertia em 1 — plausível o bastante para não parecer
// erro.
//
// Gate duro: OVR=1 por fallback quebrado = 0. Um atleta legitimamente OVR 1
// seria aceito, mas teria de ter `overall_rating` igualmente baixo.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installGlobalShims } from './lib/drawAdmissionHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'm'; }
  async ensureDirectory(p) { this.directories.add(p); }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('m'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); }
  async copy(s, d) { this.files.set(d, this.files.get(s)); }
  async list() { return []; }
  async stat() { return { size: 0 }; }
}

installGlobalShims('/offer-ovr');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const mod = (p) => vite.ssrLoadModule(p);
const { GameStorage } = await mod('/src/storage/GameStorage.js');
const { CareerRepository } = await mod('/src/careers/CareerRepository.js');
const { CareerManager } = await mod('/src/careers/CareerManager.js');
const { activeCareerAdapter } = await mod('/src/gameplay/services/runtime.js');
const { localGame } = await mod('/src/api/localGameClient.js');
const { ensureWorldSeed2025 } = await mod('/src/lib/saveFoundation.js');
const { overallRating, ATTRIBUTE_KEYS } = await mod('/src/lib/padel.js');
const { buildInitialPartnerOffers } = await mod('/src/lib/partnerOfferRules.js');

const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
activeCareerAdapter.careerManager = manager;
activeCareerAdapter.clearActiveCareer();
const { career } = await manager.createCareer({ saveName: 'ovr', playerName: 'ovr' });
activeCareerAdapter.setActiveCareer(career);
// O perfil do jogador REAL nasce com atributos (padel.js:ensureMyProfile). A
// 1ª versão deste teste criou o perfil sem eles e acusou "o jogador perdeu os
// atributos" — era a fixture incompleta, não o produto. Os valores abaixo
// espelham os defaults de criação de carreira.
const basePlayer = await activeCareerAdapter.createPlayerProfile({
  id: 'ovr-player', sport_name: 'Teste', career_date: '2026-03-01', birth_date: '2001-01-01',
  level: 'Amador', coins: 5000, xp: 0, court_side: 'direita',
  serve: 42, forehand: 45, backhand: 40, volley: 38, bandeja: 41, smash: 36,
  defense: 44, agility: 47, strategy: 39, emotional_control: 43,
});
await ensureWorldSeed2025();
const athletes = await localGame.entities.AthleteProfile.list('-overall_rating', 5000);

// --------------------------------------------------------------- Parte H
console.log(`\n=== Parte H: origem dos candidatos (${athletes.length} atletas no mundo) ===\n`);
const withAttributes = athletes.filter((a) => ATTRIBUTE_KEYS.some((k) => Number.isFinite(Number(a[k]))));
const withDeclared = athletes.filter((a) => Number(a.overall_rating ?? a.overall) > 0);
note(`atletas com ATRIBUTOS individuais: ${withAttributes.length}/${athletes.length}`);
note(`atletas com overall_rating declarado: ${withDeclared.length}/${athletes.length}`);
const sample = athletes[0];
console.log(`  amostra: ${sample.name} | overall_rating=${sample.overall_rating} | atributos=${ATTRIBUTE_KEYS.filter((k) => Number.isFinite(Number(sample[k]))).length} | overallRating()=${overallRating(sample)}`);
console.log('');

check('Parte H: o mundo guarda overall declarado, nao atributos', () => {
  assert.ok(withDeclared.length > 0, 'nenhum atleta com overall declarado');
  note(`fonte de OVR do mundo: campo declarado (atributos presentes em ${withAttributes.length})`);
});

check('Parte I: o jogador continua derivando OVR dos atributos', () => {
  // Regressão crítica: o perfil do jogador NÃO guarda overall_rating, então se
  // a função passasse a preferir o declarado, o treino deixaria de refletir.
  const attrs = ATTRIBUTE_KEYS.filter((k) => Number.isFinite(Number(basePlayer[k])));
  const derived = overallRating(basePlayer);
  note(`jogador: atributos=${attrs.length} | overall_rating=${basePlayer.overall_rating ?? '(ausente)'} | OVR=${derived}`);
  assert.ok(attrs.length > 0, 'o jogador perdeu os atributos');
  assert.ok(derived > 0, 'OVR do jogador zerou');
  // Subir um atributo tem de subir o OVR.
  const stronger = { ...basePlayer, [attrs[0]]: Number(basePlayer[attrs[0]]) + 40 };
  note(`+40 em ${attrs[0]} -> OVR ${overallRating(stronger)} (era ${derived})`);
  assert.ok(overallRating(stronger) > derived, 'treino deixou de refletir no OVR');
});

check('Parte I: atleta do mundo resolve para o overall declarado', () => {
  const top = athletes[0];
  note(`${top.name}: declarado=${top.overall_rating} | overallRating()=${overallRating(top)}`);
  assert.equal(overallRating(top), Math.round(Number(top.overall_rating)));
});

check('Parte I: entidade sem NENHUMA fonte devolve 0, nao 1', () => {
  // "Desconhecido" tem de ser distinguivel de "muito ruim" — era exatamente
  // essa confusao que o piso 1 produzia. MUDANCA DE COMPORTAMENTO registrada:
  // antes, um registro sem nenhuma fonte devolvia 1; agora devolve 0. Isso só
  // alcança registros degenerados (sem atributos E sem overall declarado), que
  // nenhum caminho de criação real produz.
  note(`objeto vazio -> ${overallRating({})} (antes da correcao: 1)`);
  assert.equal(overallRating({}), 0);
  assert.equal(overallRating(null), 0);
});

check('Parte I: atributo zero EXPLICITO continua contando na media', () => {
  // Ausente é desconhecido; zero declarado é informação. A média divide pelos
  // presentes, então um zero explícito tem de derrubar o overall.
  const withZero = { serve: 0, forehand: 80 };
  const withoutZero = { forehand: 80 };
  note(`{serve:0, forehand:80} -> ${overallRating(withZero)} | {forehand:80} -> ${overallRating(withoutZero)}`);
  assert.ok(overallRating(withZero) < overallRating(withoutZero), 'zero explicito deixou de contar');
});

// --------------------------------------------------------------- Parte K
console.log('=== Parte K: distribuicao de OVR das propostas por faixa do jogador ===\n');
const RANKS = [
  ['#1000+ (sem ranking)', 1200],
  ['#500', 500],
  ['#250', 250],
  ['#100', 100],
  ['Top20', 15],
];
const rows = [];
const allCandidates = [];
for (const [label, rank] of RANKS) {
  const player = { ...basePlayer, ranking_position: rank, world_ranking: rank };
  // Mesmo pool e mesma autoridade que o mercado pos-separacao usa.
  const playerRank = rank;
  const pool = [...athletes]
    .filter((a) => !a.ai_partner_id && a.career_status !== 'aposentado' && !a.retired)
    .sort((a, b) => Math.abs((Number(a.ranking_position) || 9999) - playerRank) - Math.abs((Number(b.ranking_position) || 9999) - playerRank))
    .slice(0, 60);
  const offers = buildInitialPartnerOffers(player, pool, 12) || [];
  const candidates = offers.map((o) => o.candidate_snapshot).filter(Boolean);
  allCandidates.push(...candidates.map((c) => ({ label, candidate: c })));
  const ovrs = candidates.map((c) => overallRating(c)).filter((v) => Number.isFinite(v));
  ovrs.sort((a, b) => a - b);
  const median = ovrs.length ? ovrs[Math.floor(ovrs.length / 2)] : null;
  rows.push({
    label, n: candidates.length,
    min: ovrs[0] ?? null, median, max: ovrs[ovrs.length - 1] ?? null,
    ones: ovrs.filter((v) => v === 1).length,
  });
}
console.log(`${'jogador'.padEnd(24)}${'n'.padEnd(5)}${'min'.padEnd(6)}${'mediana'.padEnd(9)}${'max'.padEnd(6)}OVR=1`);
for (const r of rows) {
  console.log(`${r.label.padEnd(24)}${String(r.n).padEnd(5)}${String(r.min ?? '-').padEnd(6)}${String(r.median ?? '-').padEnd(9)}${String(r.max ?? '-').padEnd(6)}${r.ones}`);
}
console.log('');

check('Parte K: houve propostas suficientes para medir', () => {
  const total = rows.reduce((s, r) => s + r.n, 0);
  note(`propostas auditadas: ${total} em ${rows.length} faixas`);
  assert.ok(total >= 20, `apenas ${total} propostas geradas`);
});

check('Parte K (gate duro): OVR=1 por fallback quebrado = 0', () => {
  // Um OVR 1 só é legítimo se o atleta declarar overall baixo de verdade.
  const broken = allCandidates.filter(({ candidate }) => {
    if (overallRating(candidate) !== 1) return false;
    const declared = Number(candidate.overall_rating ?? candidate.overall);
    return !Number.isFinite(declared) || declared > 1;
  });
  const totalOnes = rows.reduce((s, r) => s + r.ones, 0);
  note(`candidatos com OVR=1: ${totalOnes} | destes, por fallback quebrado: ${broken.length}`);
  for (const b of broken.slice(0, 5)) note(`  ${b.candidate.name}: OVR=1 mas declarado=${b.candidate.overall_rating}`);
  assert.equal(broken.length, 0);
});

check('Parte K: todo candidato tem OVR coerente com o declarado', () => {
  const mismatched = allCandidates.filter(({ candidate }) => {
    const declared = Number(candidate.overall_rating ?? candidate.overall);
    if (!Number.isFinite(declared) || declared <= 0) return false;
    return Math.abs(overallRating(candidate) - declared) > 2;
  });
  note(`candidatos com OVR divergente do declarado (>2): ${mismatched.length}/${allCandidates.length}`);
  for (const m of mismatched.slice(0, 5)) note(`  ${m.candidate.name}: OVR=${overallRating(m.candidate)} declarado=${m.candidate.overall_rating}`);
  assert.equal(mismatched.length, 0);
});

check('Parte J: candidatos apontam para AthleteProfile vivo, com dados coerentes', () => {
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const orphans = allCandidates.filter(({ candidate }) => candidate.id && !byId.has(candidate.id));
  const missingAge = allCandidates.filter(({ candidate }) => !(Number(candidate.age) > 0));
  const missingSide = allCandidates.filter(({ candidate }) => !candidate.preferred_side && !candidate.position && !candidate.court_side);
  note(`candidatos=${allCandidates.length} | sem AthleteProfile=${orphans.length} | sem idade=${missingAge.length} | sem lado=${missingSide.length}`);
  assert.equal(orphans.length, 0, 'candidato nao resolve para AthleteProfile persistente');
  assert.equal(missingAge.length, 0, 'candidato sem idade');
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
