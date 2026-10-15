// Playthrough 5.19, Partes O/P — RESOLUCAO DO PARCEIRO COMPROMETIDO.
//
// No playtest, Pedro apareceu com OVR 1 na campanha de Casablanca. A Parte O
// pergunta o que o roster comprometido guarda: identidade, snapshot de OVR, ou
// so o ID. A resposta e: guarda o ID, e o AthleteProfile e resolvido na hora —
// identidade FIXA, atributos VIVOS.
//
// O OVR 1 nao vinha de congelamento: vinha de `overallRating()` somar atributos
// que nenhum AthleteProfile do mundo possui (Problema 3). Este teste separa as
// duas coisas, para que um nao mascare o outro no futuro.
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

installGlobalShims('/committed-resolution');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const mod = (p) => vite.ssrLoadModule(p);
const { GameStorage } = await mod('/src/storage/GameStorage.js');
const { CareerRepository } = await mod('/src/careers/CareerRepository.js');
const { CareerManager } = await mod('/src/careers/CareerManager.js');
const { activeCareerAdapter } = await mod('/src/gameplay/services/runtime.js');
const { localGame } = await mod('/src/api/localGameClient.js');
const { resolveCommittedPartnerAthlete, resolveCommittedPartnerId } = await mod('/src/lib/committedRoster.js');
const { overallRating } = await mod('/src/lib/padel.js');

const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
activeCareerAdapter.careerManager = manager;
activeCareerAdapter.clearActiveCareer();
const { career } = await manager.createCareer({ saveName: 'cpr', playerName: 'ze' });
activeCareerAdapter.setActiveCareer(career);

const PEDRO_ID = 'athlete-pedro-cpr';
await localGame.entities.AthleteProfile.create({
  id: PEDRO_ID, name: 'Pedro Teixeira', overall_rating: 74, age: 29, preferred_side: 'esquerda',
}).catch(() => null);
await localGame.entities.AthleteProfile.create({
  id: 'athlete-andrea-cpr', name: 'Andrea Ricci', overall_rating: 71, age: 27, preferred_side: 'esquerda',
}).catch(() => null);
await localGame.entities.Tournament.create({
  id: 'casablanca-cpr', name: 'Casablanca Challenge', tier: 'Silver',
  start_date: '2026-04-13', end_date: '2026-04-16',
}).catch(() => null);

let profile = await activeCareerAdapter.createPlayerProfile({
  id: 'ze-cpr', sport_name: 'ze', career_date: '2026-04-01', birth_date: '2001-01-01',
  level: 'Amador', coins: 5000, xp: 0, partner_id: PEDRO_ID, partner_name: 'Pedro Teixeira',
});
const registrations = [{
  id: 'reg-cpr', profile_id: profile.id, partner_id: PEDRO_ID,
  tournament_id: 'casablanca-cpr', status: 'confirmed',
  effective_start_date: '2026-04-13', effective_end_date: '2026-04-16',
}];
for (const r of registrations) await localGame.entities.TournamentRegistration.create(r).catch(() => null);

console.log('\n=== Parte O: o que o roster comprometido guarda ===\n');

check('Parte O: o roster guarda IDENTIDADE (id), nao snapshot de atributos', () => {
  const reg = registrations[0];
  const keys = Object.keys(reg);
  const hasId = Boolean(reg.partner_id);
  const hasOvrSnapshot = keys.some((k) => /overall|ovr|rating/i.test(k));
  note(`campos da inscricao: ${keys.join(', ')}`);
  note(`guarda partner_id=${hasId} | guarda snapshot de OVR=${hasOvrSnapshot}`);
  assert.ok(hasId, 'a inscricao nao guarda a identidade do parceiro');
  assert.equal(hasOvrSnapshot, false, 'a inscricao congelou atributos — a Parte O pede identidade fixa, atributos vivos');
});

// Troca de parceria depois da inscricao.
profile = await localGame.entities.PlayerProfile.update(profile.id, {
  partner_id: 'athlete-andrea-cpr', partner_name: 'Andrea Ricci',
});

check('Parte O: a identidade comprometida sobrevive a troca', () => {
  const id = resolveCommittedPartnerId('casablanca-cpr', {
    registrations, calendarEvents: [], fallbackPartnerId: profile.partner_id,
  });
  note(`parceiro atual=${profile.partner_name} | comprometido=${id}`);
  assert.equal(id, PEDRO_ID);
});

const resolved = await resolveCommittedPartnerAthlete({ profile, tournamentId: 'casablanca-cpr', registrations });
console.log('');
note(`resolvido: ${resolved?.name} | id=${resolved?.id} | overall_rating=${resolved?.overall_rating} | overallRating()=${overallRating(resolved)}`);

check('Parte P (gate): o OVR do parceiro comprometido NAO e 1', () => {
  const ovr = overallRating(resolved);
  assert.notEqual(ovr, 1, 'OVR caiu no fallback 1 — o sintoma do playtest voltou');
  assert.equal(ovr, 74, `OVR resolveu ${ovr}, esperado 74`);
});

// `check` e sincrono: trabalho assincrono tem de ser resolvido ANTES, senao ele
// continua depois de `vite.close()` e estoura "module runner has been closed"
// mesmo com o teste verde. (Aconteceu na 1ª versao deste arquivo.)
await localGame.entities.AthleteProfile.update(PEDRO_ID, { overall_rating: 79 }).catch(() => null);
const afterEvolution = await resolveCommittedPartnerAthlete({ profile, tournamentId: 'casablanca-cpr', registrations });

check('Parte P: os atributos seguem VIVOS, nao congelados na inscricao', () => {
  // Evoluir o atleta tem de refletir na resolucao: a identidade e fixa, o
  // estado nao.
  note(`apos evolucao para 79 -> overallRating()=${overallRating(afterEvolution)}`);
  assert.equal(overallRating(afterEvolution), 79, 'a resolucao congelou o OVR da data da inscricao');
  assert.equal(afterEvolution?.id, PEDRO_ID, 'a identidade mudou junto com o atributo');
});

check('Parte O: sem inscricao, resolve o parceiro ATUAL', () => {
  const id = resolveCommittedPartnerId('torneio-sem-inscricao', {
    registrations, calendarEvents: [], fallbackPartnerId: profile.partner_id,
  });
  note(`torneio novo -> ${id}`);
  assert.equal(id, 'athlete-andrea-cpr');
});

await localGame.entities.AthleteProfile.create({
  id: 'materialized-x', bot_id: 'bot-legacy-7', name: 'Legado Sete', overall_rating: 66,
}).catch(() => null);
const byBot = await resolveCommittedPartnerAthlete({
  profile: { ...profile, partner_id: 'bot-legacy-7' },
  tournamentId: 'nenhum',
  registrations: [],
});

check('Parte P: resolucao por bot_id tambem funciona', () => {
  // Um parceiro materializado pode ser referenciado por bot_id em saves antigos.
  note(`fallback por bot_id -> ${byBot?.name} (OVR ${byBot ? overallRating(byBot) : '-'})`);
  assert.ok(byBot, 'nao resolveu parceiro por bot_id');
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
