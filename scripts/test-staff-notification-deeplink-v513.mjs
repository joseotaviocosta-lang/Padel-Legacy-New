// Playthrough 5.13 (continuação), Partes A–G — a notificação da comissão
// técnica precisa abrir o RELATÓRIO que a motivou, não a landing genérica.
//
// Antes: destination = { type:'STAFF', route:'/staff' }, sem identificador.
// O conteúdo já existia (metadata.recommendations/synergy/moral/
// proposed_plan) e ficava inacessível pelo clique.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-staff-notification-deeplink-v513', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(p) { this.directories.add(p); }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); }
  async copy(s, d) { this.files.set(d, this.files.get(s)); }
  async list(dir = '.') { const p = dir === '.' ? '' : `${dir}/`; return [...this.files.keys()].filter((k) => k.startsWith(p)).map((k) => ({ name: k.slice(p.length), isDirectory: false })); }
  async stat() { return { size: 0 }; }
}

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { upsertCareerMessage, buildStableMessageId } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');
  const { resolveNotificationDestination } = await vite.ssrLoadModule('/src/lib/notificationDestinations.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.13 StaffLink', playerName: 'P513S' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p513s', sport_name: 'P513S', career_date: '2026-03-10', birth_date: '2001-01-01',
    level: 'Amador', coins: 10000, xp: 0,
  });

  // 1) Relatório semanal da comissão, com o MESMO formato de produção.
  const contextKey = 'staff-weekly-report:2026-W10';
  const created = await upsertCareerMessage('p513s', contextKey, {
    sender_name: 'Bruno Salvatierra', sender_type: 'sistema',
    subject: 'Reunião da comissão', title: 'Reunião da comissão',
    body: 'A comissão revisou a semana.', content: 'A comissão revisou a semana.',
    message_type: 'staff_report', notification_type: 'STAFF',
    destination: { type: 'STAFF', route: '/staff' },
    career_date: '2026-03-10',
    metadata: {
      recommendations: ['Priorizar recuperação', 'Reduzir carga de saque'],
      synergy: 72, moral: 58, proposed_plan: 'recuperacao',
      staff_id: 'staff-bruno', staff_member_name: 'Bruno Salvatierra',
    },
  });

  console.log(`mensagem criada: ${created?.id}`);
  console.log(`context_key persistido: ${created?.metadata?.context_key}`);

  await check('Parte B/1: a mensagem já carrega uma identidade ESTÁVEL (context_key)', () => {
    assert.equal(created.metadata.context_key, contextKey);
    assert.equal(created.id, buildStableMessageId('p513s', contextKey),
      'o id da mensagem deveria derivar da chave de contexto');
  });

  const destination = resolveNotificationDestination(created);
  console.log(`rota resolvida: ${destination.route}`);

  await check('Parte C/2: o destino deixou de ser /staff genérico e carrega o relatório', () => {
    assert.match(destination.route, /^\/staff\?/, `rota=${destination.route}`);
    assert.match(destination.route, new RegExp(`report=${encodeURIComponent(contextKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      `rota não contém o identificador do relatório: ${destination.route}`);
  });

  await check('Parte E: o destino também aponta o profissional relacionado', () => {
    assert.match(destination.route, /staff=staff-bruno/, `rota=${destination.route}`);
  });

  // 2) A página consegue RESOLVER o relatório a partir do identificador.
  const resolveReport = async (profileId, reportKey) => {
    let found = await localGame.entities.CareerMessage
      .get(buildStableMessageId(profileId, reportKey)).catch(() => null);
    if (!found) {
      const all = await localGame.entities.CareerMessage.filter({ profile_id: profileId }).catch(() => []);
      found = (all || []).find((m) => m?.metadata?.context_key === reportKey) || null;
    }
    return found;
  };

  await check('Parte D/3-4: o identificador da rota encontra o relatório correto', async () => {
    const params = new URLSearchParams(destination.route.split('?')[1] || '');
    const reportKey = params.get('report');
    assert.ok(reportKey, 'rota sem parâmetro report');
    const found = await resolveReport('p513s', reportKey);
    assert.ok(found, 'o relatório não foi encontrado pelo identificador da rota');
    assert.equal(found.id, created.id);
    assert.equal(found.subject, 'Reunião da comissão');
  });

  await check('Parte E/5: o conteúdo exibido traz recomendação, sinergia, moral e plano', async () => {
    const found = await resolveReport('p513s', contextKey);
    assert.deepEqual(found.metadata.recommendations, ['Priorizar recuperação', 'Reduzir carga de saque']);
    assert.equal(Number(found.metadata.synergy), 72);
    assert.equal(Number(found.metadata.moral), 58);
    assert.equal(found.metadata.proposed_plan, 'recuperacao');
    assert.equal(found.career_date, '2026-03-10');
  });

  await check('Parte G: identificador INVÁLIDO não resolve nada (e não explode)', async () => {
    const found = await resolveReport('p513s', 'staff-weekly-report:2099-W99');
    assert.equal(found, null, 'um identificador inexistente não pode devolver relatório');
  });

  await check('Parte F: notificação LEGACY sem context_key continua abrindo /staff', () => {
    const legacy = {
      id: 'legacy-staff-1', profile_id: 'p513s',
      subject: 'Evolução da comissão', message_type: 'staff_monthly_report',
      notification_type: 'STAFF', destination: { type: 'STAFF', route: '/staff' },
      metadata: {},
    };
    const legacyDestination = resolveNotificationDestination(legacy);
    console.log(`   [registro] rota legacy: ${legacyDestination.route}`);
    assert.match(legacyDestination.route, /^\/staff/, `rota legacy quebrada: ${legacyDestination.route}`);
    assert.ok(!/report=/.test(legacyDestination.route), 'rota legacy não deveria inventar um report');
  });

  await check('Parte D: a página de Comissão Técnica consome o parâmetro', () => {
    const source = readFileSync(new URL('../src/pages/Staff.jsx', import.meta.url), 'utf8');
    assert.match(source, /searchParams\.get\(\s*['"]report['"]\s*\)/, 'Staff.jsx não lê ?report');
    assert.match(source, /StaffReportHighlight/, 'Staff.jsx não renderiza o relatório destacado');
    assert.match(source, /scrollIntoView/, 'Staff.jsx não leva o jogador até o relatório');
  });

  await check('Parte A: os três geradores de staff continuam emitindo notificação STAFF', () => {
    const source = readFileSync(new URL('../src/game-core/staffLifecycle.js', import.meta.url), 'utf8');
    const occurrences = (source.match(/notification_type:\s*'STAFF'/g) || []).length;
    console.log(`   [registro] geradores com notification_type STAFF: ${occurrences}`);
    assert.ok(occurrences >= 3, `só ${occurrences} geradores`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-staff-notification-deeplink-v513: PASS');
} finally {
  await vite.close();
}
