// CLOUD-7B2C — compactação INCREMENTAL experimental (desligada por padrão): cada torneio liquidado é empacotado uma
// única vez e permanece empacotado em memória/arquivo; leitores veem o formato de sempre por getters preguiçosos.
//   A. Equivalência e idempotência (125 torneios finalizados reais).   B. Sem compactação prematura.
//   C. Escritas sobre linhas empacotadas.   D. Persistência/compatibilidade (save antigo, compacto, recarga).
//   E. Falhas e concorrência.               F. Continuidade com carreira real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createServer } from 'vite';
import { isTournamentSettled, packTournament } from '../src/careers/tournamentHistoryCodec.js';
import {
  compactSettledRows, getIncrementalStats, lazyTournamentView, resetIncrementalStats, writableRow, isIncrementalCompactionEnabled,
} from '../src/careers/incrementalHistory.js';

const FIXTURE = 'reports/cloud-phase-7b2b-historical-compaction/fixtures/tournaments-day365-pre7b2b.json.gz';
const CAREER_FIXTURE = 'reports/cloud-phase-7b1-save-pipeline/fixtures/career-day30-pre7b1.json.gz';
const tournaments = JSON.parse(zlib.gunzipSync(fs.readFileSync(FIXTURE)).toString('utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const json = JSON.stringify;
let passed = 0;
const ok = (label, condition) => { assert.ok(condition, `FALHOU: ${label}`); passed += 1; console.log(`PASS — ${label}`); };
globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

const settled = tournaments.filter(isTournamentSettled);
ok('padrão de produção: compactação incremental desligada', !globalThis.__PADEL_INCREMENTAL_COMPACTION__ ? isIncrementalCompactionEnabled() === false : true);

// ═══ A. Equivalência e idempotência ═══
{
  const rows = clone(tournaments);
  resetIncrementalStats();
  const first = compactSettledRows(rows);
  ok(`A. a varredura empacota exatamente os ${settled.length} torneios liquidados`, first === settled.length && rows.filter((r) => r.history_pack).length === settled.length);
  const afterFirst = getIncrementalStats();
  ok('A. cada torneio foi empacotado uma única vez', afterFirst.packs === settled.length);
  const second = compactSettledRows(rows);
  ok('A. nova varredura não reprocessa nada (0 empacotamentos, sem recompactação)', second === 0 && getIncrementalStats().packs === settled.length);
  const snapshotRows = rows.slice();
  compactSettledRows(rows); compactSettledRows(rows);
  ok('A. varreduras repetidas não trocam nenhum objeto empacotado', rows.every((r, i) => r === snapshotRows[i]));
  const views = rows.map((r) => (r.history_pack ? lazyTournamentView(r) : { ...r }));
  const before = getIncrementalStats().materializations;
  views.forEach((v) => { void v.id; void v.status; void v.champion; void v.name; });
  ok('A. ler só campos escalares não expande nada', getIncrementalStats().materializations === before);
  ok('A. a visão expandida é idêntica ao torneio original (chaves, ordem, valores)', views.every((v, i) => json(v) === json(tournaments[i])));
  ok('A. spread da visão devolve o torneio completo e idêntico', views.every((v, i) => json({ ...v }) === json(tournaments[i])));
  const reads = getIncrementalStats();
  ok(`A. expansões contadas por visão (${reads.materializations} para ${settled.length} torneios, 2 leituras completas)`, reads.materializations >= settled.length);
  const viewOne = lazyTournamentView(rows.find((r) => r.history_pack));
  const placementsA = viewOne.placements; const placementsB = viewOne.placements;
  ok('A. getter é estável dentro da mesma visão (mesmo array, sem reexpandir)', placementsA === placementsB);
  viewOne.champion = 'X'; viewOne.placements = []; 
  ok('A. campos da visão são graváveis sem afetar a linha armazenada', rows.find((r) => r.id === viewOne.id).champion !== 'X' && json(lazyTournamentView(rows.find((r) => r.id === viewOne.id)).placements) !== '[]');
  const champions = (list) => list.filter((t) => t.champion).map((t) => [t.id, t.champion, t.runner_up, json(t.placements), json(t.bracket_history), t.prize_coins, t.rank_points].join('|'));
  ok('A. campeões, vices, colocações, chaves e premiações idênticos via camada de leitura', json(champions(rows.map((r) => (r.history_pack ? lazyTournamentView(r) : r)))) === json(champions(tournaments)));
  const packedBytes = json(rows).length; const rawBytes = json(tournaments).length;
  ok(`A. o estado empacotado em memória é menor (${rawBytes} -> ${packedBytes})`, packedBytes < rawBytes * 0.95);
}

// ═══ B. Sem compactação prematura ═══
{
  const base = clone(settled[0]);
  const cases = {
    'status não finalizado': (t) => { t.status = 'chaveamento'; }, 'inscrições abertas': (t) => { t.status = 'inscricoes'; },
    'sem world_tour_resolved': (t) => { t.world_tour_resolved = false; }, 'sem liquidação canônica': (t) => { delete t.canonical_settlement_id; },
    'sem campeão': (t) => { t.champion = null; }, 'partida pendente': (t) => { t.bracket_history.at(-1).matches[0].status = 'scheduled'; },
    'partida sem vencedor': (t) => { delete t.bracket_history[0].matches[0].winner; }, 'sem chave': (t) => { t.bracket_history = []; },
  };
  for (const [label, mutate] of Object.entries(cases)) { const t = clone(base); mutate(t); const rows = [t]; ok(`B. ${label}: a varredura não compacta`, compactSettledRows(rows) === 0 && rows[0] === t); }
  const rows = clone(tournaments).filter((t) => t.status !== 'finalizado');
  ok('B. torneios abertos nunca são empacotados', compactSettledRows(rows) === 0);
  const inconsistent = clone(base); inconsistent.bracket_history[0].matches[0].winner = 'Dupla inexistente';
  const rowsX = [inconsistent];
  compactSettledRows(rowsX);
  ok('B. torneio com inconsistência é empacotado só se o round-trip provar equivalência exata', json(lazyTournamentView(rowsX[0])) === json(inconsistent));
}

// ═══ C. Escritas sobre linhas empacotadas ═══
{
  const rows = clone(tournaments); compactSettledRows(rows);
  const packedRow = rows.find((r) => r.history_pack);
  resetIncrementalStats();
  ok('C. patch escalar mantém a linha empacotada (sem expansão)', writableRow(packedRow, { description: 'x' }) === packedRow && getIncrementalStats().writeExpansions === 0);
  const expanded = writableRow(packedRow, { placements: [] });
  ok('C. patch em campo pesado expande a linha antes de mesclar', expanded !== packedRow && !expanded.history_pack && Array.isArray(expanded.bracket_history) && getIncrementalStats().writeExpansions === 1);
  ok('C. a linha expandida é idêntica ao original', json(expanded) === json(tournaments.find((t) => t.id === packedRow.id)));
}

// ═══ D/E/F. Repositório e carreira real ═══
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const stats = async () => (await vite.ssrLoadModule('/src/careers/incrementalHistory.js'));
  function memoryBackend(hooks = {}) {
    const files = new Map();
    return {
      files, hooks,
      isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
      async writeText(p, c) { if (hooks.failWrite?.(p)) { throw Object.assign(new Error('falha de escrita simulada'), { code: 'SIMULATED_WRITE_FAILURE' }); } files.set(p, String(c)); },
      async readText(p) { if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } const s = files.get(p); return hooks.corruptRead?.(p) ? `${s}x` : s; },
      async exists(p) { return files.has(p) || [...files.keys()].some((k) => k.startsWith(`${p}/`)); }, async remove(p) { return files.delete(p); },
      async copy(a, b) { files.set(b, files.get(a)); return b; },
      async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; },
      async list(dir) { const prefix = `${String(dir).replace(/\/$/, '')}/`; return [...files.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).map((k) => ({ name: k.slice(prefix.length), isDirectory: false })); }, async stat(p) { return { size: files.get(p)?.length || 0 }; },
      getDataDirectoryDescription: () => 'memória',
    };
  }
  const fixtureCareer = JSON.parse(zlib.gunzipSync(fs.readFileSync(CAREER_FIXTURE)).toString('utf8'));
  const quiet = async (fn) => { const w = console.warn; const d = console.debug; console.warn = () => {}; console.debug = () => {}; try { return await fn(); } finally { console.warn = w; console.debug = d; } };
  const withFlag = async (value, fn) => { const prev = globalThis.__PADEL_INCREMENTAL_COMPACTION__; if (value) globalThis.__PADEL_INCREMENTAL_COMPACTION__ = true; else delete globalThis.__PADEL_INCREMENTAL_COMPACTION__; try { return await fn(); } finally { if (prev === undefined) delete globalThis.__PADEL_INCREMENTAL_COMPACTION__; else globalThis.__PADEL_INCREMENTAL_COMPACTION__ = prev; } };

  async function boot(hooks = {}, { injectTournaments = true } = {}) {
    const backend = memoryBackend(hooks);
    const manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
    const { career } = await manager.createCareer({ playerName: 'Cloud 7B2C' });
    const external = clone(fixtureCareer);
    external.career_id = career.career_id;
    if (injectTournaments) external.entities.Tournament = clone(tournaments);
    activeCareerAdapter.activePersistenceTransaction = null;
    activeCareerAdapter.writeChain = Promise.resolve();
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    await quiet(() => manager.saveCareer(career.career_id, external));
    activeCareerAdapter.clearActiveCareer();
    activeCareerAdapter.setActiveCareer(await manager.loadCareer(career.career_id));
    return { backend, manager, careerId: career.career_id, profileId: external.player.id, file: () => backend.files.get(`careers/${career.career_id}.json`) };
  }
  const advance = async (rt, n) => { let p = await localGame.entities.PlayerProfile.get(rt.profileId); for (let i = 0; i < n; i += 1) { await quiet(() => advanceCareerDayOnce(p)); await waitForCareerDaySecondaryWork(); p = await localGame.entities.PlayerProfile.get(rt.profileId); } return p; };
  const reload = async (rt) => { activeCareerAdapter.clearActiveCareer(); const c = await rt.manager.loadCareer(rt.careerId); activeCareerAdapter.setActiveCareer(c); return c; };
  const stable = (rows) => json(rows.map((r) => ({ ...r })));

  // D. Persistência / compatibilidade
  await withFlag(true, async () => {
    const { resetIncrementalStats: reset, getIncrementalStats: get } = await stats();
    const rt = await boot();
    const oldFile = rt.file();
    ok('D. save antigo (torneios expandidos) carrega com a chave ligada e histórico completo', (await localGame.entities.Tournament.filter({})).length === tournaments.length);
    reset();
    await localGame.entities.Post.create({ author_name: 'T', content: 'dispara escrita' });
    const afterWrite = rt.file();
    ok('D. a primeira escrita executa a compactação inicial (uma vez por torneio liquidado)', get().packs === settled.length && (afterWrite.match(/"history_pack"/g) || []).length === settled.length);
    ok(`D. o arquivo fica menor (${oldFile.length} -> ${afterWrite.length})`, afterWrite.length < oldFile.length);
    reset();
    await localGame.entities.Post.create({ author_name: 'T', content: 'segunda escrita' });
    ok('D. escritas seguintes não reempacotam nada', get().packs === 0 && get().writeExpansions === 0);
    await reload(rt);
    ok('D. recarregar mantém os torneios empacotados em memória (sem expansão na carga)', get().materializations === 0 && (rt.file().match(/"history_pack"/g) || []).length === settled.length);
    const viaRepo = await localGame.entities.Tournament.filter({});
    ok('D. histórico lido pela camada de entidades == fixture original', stable(viaRepo) === json(tournaments.map((t) => ({ ...t }))));
    ok('D. consultar só escalares não expande', (() => { const before = get().materializations; viaRepo.forEach((t) => { void t.status; void t.name; }); return get().materializations === before; })());
    const exported = await rt.manager.exportCareer(rt.careerId);
    ok('D. exportação sai expandida (sem history_pack)', !json(exported.entities.Tournament).includes('history_pack') && json(exported.entities.Tournament) === json(tournaments));
    const beforeBytes = rt.file().length;
    await localGame.entities.Post.create({ author_name: 'T', content: 'terceira' });
    ok('D. salvar/recarregar repetidamente não faz o arquivo crescer além do conteúdo novo', rt.file().length - beforeBytes < 400);
  });
  await withFlag(false, async () => {
    const rt = await boot();
    await localGame.entities.Post.create({ author_name: 'T', content: 'x' });
    ok('D. com a chave desligada nada é compactado e o arquivo mantém o formato anterior', !rt.file().includes('history_pack'));
  });

  // E. Falhas e concorrência
  await withFlag(true, async () => {
    const hooks = {};
    const rt = await boot(hooks);
    await localGame.entities.Post.create({ author_name: 'T', content: 'compacta' });
    const good = rt.file();
    const stateGood = json(await activeCareerAdapter.getActiveCareer({ cloneResult: false }));
    hooks.failWrite = (p) => p.startsWith('temp/');
    await assert.rejects(quiet(() => localGame.entities.Post.create({ author_name: 'T', content: 'falha' })), /falha de escrita simulada/);
    hooks.failWrite = null;
    ok('E. falha de escrita preserva o último save válido (empacotado)', rt.file() === good);
    ok('E. falha de escrita preserva o estado ativo', json(await activeCareerAdapter.getActiveCareer({ cloneResult: false })) === stateGood);
    hooks.corruptRead = (p) => p.startsWith('temp/');
    await assert.rejects(quiet(() => localGame.entities.Post.create({ author_name: 'T', content: 'corrompe' })), (e) => e?.code === 'TEMP_WRITE_MISMATCH');
    hooks.corruptRead = null;
    ok('E. verificação do temporário divergente preserva o último save válido', rt.file() === good);
    await assert.rejects(activeCareerAdapter.withPersistenceTransaction('t-throw', async () => {
      await localGame.entities.Post.create({ author_name: 'T', content: 'tx' });
      throw new Error('interrupção simulada');
    }), /interrupção simulada/);
    ok('E. interrupção no meio da transação (rollback) preserva arquivo e estado', rt.file() === good && json(await activeCareerAdapter.getActiveCareer({ cloneResult: false })) === stateGood);

    // dado compactado corrompido: falha fechada (nunca undefined silencioso)
    const parsed = JSON.parse(rt.file());
    const victim = parsed.entities.Tournament.find((t) => t.history_pack);
    victim.history_pack.blob = victim.history_pack.blob.slice(0, 40);
    rt.backend.files.set(`careers/${rt.careerId}.json`, `${json(parsed)}\n`);
    await reload(rt);
    const rows = await localGame.entities.Tournament.filter({});
    const bad = rows.find((r) => r.id === victim.id);
    ok('E. blob corrompido: ler campo pesado falha fechado', (() => { try { void bad.bracket_history; return false; } catch (e) { return /corrompido|ilegível/.test(e.message); } })());
    const healthy = rows.find((r) => r.id !== victim.id && r.status === 'finalizado' && r.champion && r.placements);
    ok('E. outro torneio compactado continua legível', healthy && Array.isArray(healthy.bracket_history));
  });
  await withFlag(true, async () => {
    const rt = await boot();
    await localGame.entities.Post.create({ author_name: 'T', content: 'compacta' });
    const target = (await localGame.entities.Tournament.filter({ status: 'finalizado' })).find((t) => t.champion && t.placements);
    const original = clone(target);
    const [a, b] = await Promise.all([
      localGame.entities.Tournament.update(target.id, { description: 'A' }),
      localGame.entities.Tournament.update(target.id, { description: 'B' }),
    ]);
    const after = (await localGame.entities.Tournament.filter({ id: target.id }))[0];
    ok('E. duas atualizações concorrentes sobre torneio empacotado não corrompem o histórico', ['A', 'B'].includes(after.description) && json(after.bracket_history) === json(original.bracket_history) && json(after.placements) === json(original.placements));
    ok('E. o retorno de update() de linha empacotada traz o torneio completo', Array.isArray(a.bracket_history) && Array.isArray(b.placements));
    const patched = await localGame.entities.Tournament.update(target.id, { placements: original.placements });
    const { getIncrementalStats: get } = await stats();
    ok('E. patch em campo pesado de torneio empacotado funciona e a linha volta a ficar empacotada', json(patched.placements) === json(original.placements) && (rt.file().match(new RegExp(target.id)) || []).length >= 1 && get().writeExpansions >= 1);
    const again = (await localGame.entities.Tournament.filter({ id: target.id }))[0];
    ok('E. depois do patch pesado o torneio é idêntico ao original', json({ ...again, description: original.description, updated_date: original.updated_date }) === json({ ...original }));
  });

  // F. Continuidade com carreira real (fixture 7B1) e a chave ligada
  await withFlag(true, async () => {
    let seed = 777;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    const rt = await boot({}, { injectTournaments: false });
    const before = (await localGame.entities.Tournament.filter({})).filter((t) => t.status === 'finalizado').length;
    const profile = await advance(rt, 40);
    ok('F. carreira real avança 40 dias com a compactação incremental', profile.career_date > fixtureCareer.player.career_date);
    const finished = (await localGame.entities.Tournament.filter({})).filter((t) => t.status === 'finalizado');
    const packed = (rt.file().match(/"history_pack"/g) || []).length;
    ok(`F. torneios finalizados no período foram empacotados no arquivo (${packed} de ${finished.length})`, finished.length > before && packed >= finished.filter((t) => t.champion && Array.isArray(t.bracket_history) && t.world_tour_resolved).length - 1);
    ok('F. nenhum torneio não finalizado foi empacotado', !JSON.parse(rt.file()).entities.Tournament.some((t) => t.history_pack && t.status !== 'finalizado'));
    const r1 = await reload(rt);
    const p2 = await localGame.entities.PlayerProfile.get(rt.profileId);
    ok('F. recarregar preserva a data e os torneios', p2.career_date === profile.career_date && r1.entities.Tournament.length >= finished.length);
    ok('F. todos os torneios finalizados seguem completos pela camada de leitura', (await localGame.entities.Tournament.filter({ status: 'finalizado' })).every((t) => !t.world_tour_resolved || (Array.isArray(t.bracket_history) && t.bracket_history.length > 0)));
    const next = await advance(rt, 3);
    ok('F. continua avançando após recarregar', next.career_date > p2.career_date);
  });
} finally {
  await vite.close();
}
console.log(`\nCLOUD-7B2C incremental compaction: ${passed} verificações aprovadas.`);
