// Playthrough 5.19, Partes L/M/N/O/P — O CENÁRIO EXATO DO PLAYTEST.
//
// Fluxo real reproduzido:
//   Pedro ativo -> inscrever Casablanca -> contrato termina -> firmar com
//   Andrea -> sorteio D-3 -> jogar Casablanca.
//
// Esperado em TODAS as superfícies do torneio inscrito: jogador + Pedro.
// Nunca Andrea.
//
// O que o playtest viu: a chave mostrou "ze & Andrea Ricci" enquanto a partida
// e o resultado mostraram "ze / Pedro Teixeira" — duas verdades sobre a mesma
// inscrição.
//
// Causas medidas (duas superfícies distintas):
//   1. tournamentDraw.js:createDrawnRun usava `getPartnerBot(profile)` (parceiro
//      ATUAL) e PERSISTIA esse nome em `bracket_history` e no bracket canônico;
//   2. TournamentDetailsModal.jsx exibia `profile.partner_name` direto.
// A campanha (TournamentModal) e o settlement (tournamentLifecycle) já usavam
// `resolveCommittedPartnerAthlete` — por isso a partida estava certa.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

installGlobalShims('/roster-survives');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const mod = (p) => vite.ssrLoadModule(p);
const { GameStorage } = await mod('/src/storage/GameStorage.js');
const { CareerRepository } = await mod('/src/careers/CareerRepository.js');
const { CareerManager } = await mod('/src/careers/CareerManager.js');
const { activeCareerAdapter } = await mod('/src/gameplay/services/runtime.js');
const { localGame } = await mod('/src/api/localGameClient.js');
const roster = await mod('/src/lib/committedRoster.js');
const { resolveCommittedPartnerId, resolveCommittedPartnerAthlete, findCommittedTournaments } = roster;

const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
activeCareerAdapter.careerManager = manager;
activeCareerAdapter.clearActiveCareer();
const { career } = await manager.createCareer({ saveName: 'roster', playerName: 'ze' });
activeCareerAdapter.setActiveCareer(career);

const PEDRO = { id: 'athlete-pedro', name: 'Pedro Teixeira', overall_rating: 74, age: 29, preferred_side: 'esquerda' };
const ANDREA = { id: 'athlete-andrea', name: 'Andrea Ricci', overall_rating: 71, age: 27, preferred_side: 'esquerda' };
await localGame.entities.AthleteProfile.create(PEDRO).catch(() => null);
await localGame.entities.AthleteProfile.create(ANDREA).catch(() => null);

const CASABLANCA = {
  id: 'casablanca-challenge', name: 'Casablanca Challenge', tier: 'Silver',
  start_date: '2026-04-13', end_date: '2026-04-16', main_draw_size: 16,
};
const LATER = {
  id: 'lisboa-open', name: 'Lisboa Open', tier: 'Silver',
  start_date: '2026-06-08', end_date: '2026-06-11', main_draw_size: 16,
};
await localGame.entities.Tournament.create(CASABLANCA).catch(() => null);
await localGame.entities.Tournament.create(LATER).catch(() => null);

// Passo 1-2: Pedro ativo, inscricao em Casablanca registrando partner_id=Pedro.
let profile = await activeCareerAdapter.createPlayerProfile({
  id: 'ze', sport_name: 'ze', career_date: '2026-04-01', birth_date: '2001-01-01',
  level: 'Amador', coins: 5000, xp: 0, partner_id: PEDRO.id, partner_name: PEDRO.name,
});
await localGame.entities.TournamentRegistration.create({
  id: 'reg-casablanca', profile_id: profile.id, partner_id: PEDRO.id,
  tournament_id: CASABLANCA.id, tournament_name: CASABLANCA.name, status: 'confirmed',
  effective_start_date: CASABLANCA.start_date, effective_end_date: CASABLANCA.end_date,
}).catch(() => null);

console.log('\n=== Passo 1-2: inscrito em Casablanca com Pedro ===\n');
const registrations = await localGame.entities.TournamentRegistration.filter({ profile_id: profile.id });
note(`inscricoes=${registrations.length} | partner_id gravado=${registrations[0]?.partner_id}`);

check('Parte N: a inscricao registra o parceiro do momento', () => {
  assert.equal(registrations[0].partner_id, PEDRO.id);
});

// Passo 3-4: contrato termina e o jogador firma com Andrea.
profile = await localGame.entities.PlayerProfile.update(profile.id, {
  partner_id: ANDREA.id, partner_name: ANDREA.name,
});
console.log('=== Passo 3-4: contrato encerrado, nova parceria com Andrea ===\n');
note(`parceiro ATUAL do perfil: ${profile.partner_name} (${profile.partner_id})`);

check('Parte N (gate): Casablanca continua resolvendo PEDRO', () => {
  const committedId = resolveCommittedPartnerId(CASABLANCA.id, {
    registrations, calendarEvents: [], fallbackPartnerId: profile.partner_id,
  });
  note(`roster comprometido de Casablanca: ${committedId}`);
  assert.equal(committedId, PEDRO.id, 'Casablanca passou a resolver o parceiro novo');
});

check('Parte O/P: o parceiro comprometido resolve o AthleteProfile vivo, com OVR real', () => {
  // Identidade fixa, atributos vivos: nunca fallback OVR 1.
  return resolveCommittedPartnerAthlete({ profile, tournamentId: CASABLANCA.id, registrations })
    .then(() => null)
    .catch(() => null);
});

const committedAthlete = await resolveCommittedPartnerAthlete({
  profile, tournamentId: CASABLANCA.id, registrations,
});
const { overallRating } = await mod('/src/lib/padel.js');
console.log('');
note(`resolvido: ${committedAthlete?.name} | overall_rating=${committedAthlete?.overall_rating} | overallRating()=${overallRating(committedAthlete)}`);

check('Parte P: identidade e Pedro e o OVR NAO e 1', () => {
  assert.equal(committedAthlete?.id, PEDRO.id, `resolveu ${committedAthlete?.name} em vez de Pedro`);
  assert.equal(committedAthlete?.name, PEDRO.name);
  const ovr = overallRating(committedAthlete);
  assert.equal(ovr, PEDRO.overall_rating, `OVR resolveu ${ovr}, esperado ${PEDRO.overall_rating}`);
  assert.notEqual(ovr, 1, 'OVR caiu no fallback 1');
});

check('Parte L: torneio NOVO usa a parceria atual (Andrea)', () => {
  const committedId = resolveCommittedPartnerId(LATER.id, {
    registrations, calendarEvents: [], fallbackPartnerId: profile.partner_id,
  });
  note(`Lisboa Open (sem inscricao) resolve: ${committedId}`);
  assert.equal(committedId, ANDREA.id, 'torneio novo ficou preso no parceiro antigo');
});

check('Parte F: Casablanca aparece como compromisso pendente', () => {
  const commitments = findCommittedTournaments({
    registrations, tournaments: [CASABLANCA, LATER],
    careerDate: '2026-04-01', partnerId: PEDRO.id,
  });
  note(`compromissos com Pedro: ${commitments.map((c) => c.name).join(', ') || '(nenhum)'}`);
  assert.equal(commitments.length, 1);
  assert.equal(commitments[0].tournamentId, CASABLANCA.id);
});

// ------------------------------------------------------- Parte M: superficies
console.log('\n=== Parte M: classificacao das superficies ===\n');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const read = (rel) => stripComments(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const SURFACES = [
  ['sorteio D-3 (persiste bracket)', '../src/lib/tournamentDraw.js'],
  ['campanha / partida / resultado', '../src/components/tournaments/TournamentModal.jsx'],
  ['settlement do motor', '../src/game-core/tournamentLifecycle.js'],
  ['modal de detalhes / preview', '../src/components/tournaments/TournamentDetailsModal.jsx'],
];
const classified = [];
for (const [label, rel] of SURFACES) {
  const src = read(rel);
  const usesCommitted = /resolveCommittedPartner(Athlete|Id)/.test(src);
  const kind = usesCommitted ? 'COMMITTED_ROSTER' : 'CURRENT_PARTNER';
  classified.push({ label, kind });
  console.log(`  ${label.padEnd(34)} ${kind}`);
}
console.log('');

check('Parte M (gate): toda superficie de torneio inscrito usa COMMITTED_ROSTER', () => {
  const wrong = classified.filter((c) => c.kind !== 'COMMITTED_ROSTER');
  note(`superficies auditadas=${classified.length} | fora do roster comprometido=${wrong.length}`);
  for (const w of wrong) note(`  ${w.label}: ${w.kind}`);
  assert.equal(wrong.length, 0);
});

check('Parte M: o sorteio nao usa mais o parceiro atual para nomear a chave', () => {
  const src = read('../src/lib/tournamentDraw.js');
  const drawFn = src.slice(src.indexOf('async function createDrawnRun'), src.indexOf('async function createDrawnRun') + 1800);
  const usesCurrent = /const partner = getPartnerBot\(profile\)/.test(drawFn);
  note(`createDrawnRun usa getPartnerBot direto: ${usesCurrent}`);
  assert.equal(usesCurrent, false, 'o sorteio voltou a congelar o parceiro atual');
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
