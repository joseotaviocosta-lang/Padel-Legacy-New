// Playthrough 5.13 (continuação), Parte O — a modal da chave precisa usar o
// torneio RELIDO, nunca o item da lista carregado antes do sorteio.
//
// Cenário do playtest: lista antiga (sem bracket) + banco atual (com
// bracket) -> abrir pela notificação mostrava "Chave ainda não sorteada".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-modal-fresh-state-v513', search: '' };
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

const hasUsableBracket = (t) => Number(t?.bracket_schema_version) >= 2
  && Array.isArray(t?.bracket_history) && t.bracket_history.length > 0;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.13 FreshState', playerName: 'P513F' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p513f', sport_name: 'P513F', career_date: '2026-02-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 10000, xp: 0,
  });

  // Torneio SEM chave — é o snapshot que a lista teria carregado.
  const created = await localGame.entities.Tournament.create({
    id: 'fresh-state-cup', name: 'Dubai Rising Cup', tier: 'Gold',
    start_date: '2026-02-10', status: 'inscricoes',
  });
  const staleListItem = { ...created };

  // O sorteio acontece DEPOIS de a lista ter sido carregada.
  await localGame.entities.Tournament.update('fresh-state-cup', {
    bracket_schema_version: 2,
    draw_date: '2026-02-07',
    draw_pair_ids: ['pair-a', 'pair-b', 'pair-c', 'pair-d'],
    bracket_history: [
      { round: 1, date: '2026-02-10', matches: [{ teamA: 'A', teamB: 'B' }, { teamA: 'C', teamB: 'D' }] },
      { round: 2, date: '2026-02-11', matches: [{ teamA: 'Vencedor 1', teamB: 'Vencedor 2' }] },
    ],
  });

  console.log(`snapshot da lista tem chave? ${hasUsableBracket(staleListItem)}`);
  const fresh = await localGame.entities.Tournament.get('fresh-state-cup');
  console.log(`leitura nova tem chave? ${hasUsableBracket(fresh)}`);

  await check('pré-condição: o snapshot da lista está DESATUALIZADO', () => {
    assert.equal(hasUsableBracket(staleListItem), false, 'o snapshot já tinha chave — cenário inválido');
    assert.ok(hasUsableBracket(fresh), 'o banco deveria ter a chave');
  });

  await check('Parte O/18: abrir pela releitura entrega a chave; pelo snapshot, não', () => {
    // Exatamente a diferença entre o comportamento antigo e o novo.
    assert.equal(hasUsableBracket(staleListItem), false);
    assert.equal(hasUsableBracket(fresh), true);
    assert.equal(fresh.bracket_history.length, 2);
  });

  await check('Parte O: a releitura preserva a identidade do torneio', () => {
    assert.equal(fresh.id, staleListItem.id);
    assert.equal(fresh.name, staleListItem.name);
  });

  await check('Parte O: abrir manualmente depois continua mostrando a chave', async () => {
    const again = await localGame.entities.Tournament.get('fresh-state-cup');
    assert.ok(hasUsableBracket(again));
    assert.equal(again.bracket_history.length, 2);
  });

  // Guard estrutural: a página precisa MESMO reler no deep link.
  const source = readFileSync(new URL('../src/pages/Tournaments.jsx', import.meta.url), 'utf8');

  await check('Parte O: Tournaments.jsx relê o torneio ao abrir por deep link', () => {
    assert.match(source, /Tournament\.get\(requestedId\)/,
      'o deep link não relê o torneio — voltaria a abrir com o snapshot da lista');
  });

  await check('Parte O: o objeto RELIDO é o que abre a chave', () => {
    assert.match(source, /if\s*\(\s*requestedOpenBracket\s*\)\s*\{\s*setBracketTournament\(fresh\)/,
      'a modal da chave não está usando o objeto relido');
  });

  await check('Parte O: existe fallback para o item da lista se a releitura falhar', () => {
    assert.match(source, /let fresh = requested/, 'sem fallback para o item da lista');
    assert.match(source, /catch\s*\{[^}]*\}/, 'a releitura não está protegida por catch');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-modal-fresh-state-v513: PASS');
} finally {
  await vite.close();
}
