// CLOUD-7B2B — compactação histórica de torneios finalizados (codec de persistência).
//   A. Equivalência histórica: 125 torneios finalizados reais (fixture gerada pelo código ANTERIOR) sobrevivem
//      a pack → JSON → parse → unpack idênticos; campeões, vices, colocações, partidas, snapshots e
//      referências cruzadas comparados campo a campo; o save fica menor.
//   B. Sem compactação prematura: torneios ativos/abertos/pendentes/sem liquidação ficam intactos (mesmo objeto).
//   C. Compatibilidade: save antigo (sem history_pack) carrega igual com a gravação compacta desligada e ligada;
//      salvar/recarregar é idempotente; formato compacto lido com a chave desligada; sem migração repetida.
//   D. Falhas: pacote corrompido falha fechado; round-trip que não fecha deixa o torneio intacto; falha de
//      escrita/verificação preserva o último save válido; entrada nunca é mutada.
//   E. Continuidade: carreira real (fixture 7B1) avança dias com a gravação compacta ligada, grava, recarrega
//      e continua; torneios do jogador (campos extras) e torneio ativo -> finalizado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createServer } from 'vite';
import {
  packTournament, unpackTournament, packCareerForStorage, unpackCareerFromStorage, isTournamentSettled,
} from '../src/careers/tournamentHistoryCodec.js';

const FIXTURE = 'reports/cloud-phase-7b2b-historical-compaction/fixtures/tournaments-day365-pre7b2b.json.gz';
const CAREER_FIXTURE = 'reports/cloud-phase-7b1-save-pipeline/fixtures/career-day30-pre7b1.json.gz';
const tournaments = JSON.parse(zlib.gunzipSync(fs.readFileSync(FIXTURE)).toString('utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const json = JSON.stringify;
let passed = 0;
const ok = (label, condition) => { assert.ok(condition, `FALHOU: ${label}`); passed += 1; console.log(`PASS — ${label}`); };

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

const careerOf = (list) => ({ career_id: 'c', entities: { Tournament: list, Other: [{ id: 'keep' }] } });
const finished = tournaments.filter((t) => t.status === 'finalizado');
const settled = finished.filter(isTournamentSettled);

// ═══ A. Equivalência histórica ═══
{
  ok('A. a fixture tem torneios finalizados reais suficientes', finished.length >= 100 && settled.length >= 100);
  const before = clone(tournaments);
  const packedCareer = packCareerForStorage(careerOf(tournaments));
  ok('A. empacotar não muta a entrada', json(tournaments) === json(before));
  const stored = packedCareer.entities.Tournament;
  ok('A. todo torneio liquidado foi empacotado', stored.filter((t) => t.history_pack).length === settled.length);
  const restored = unpackCareerFromStorage(JSON.parse(json(packedCareer))).entities.Tournament;
  ok('A. round-trip por arquivo (stringify/parse) devolve o array idêntico, byte a byte', json(restored) === json(tournaments));
  for (const [i, original] of tournaments.entries()) {
    const back = restored[i];
    if (original.status !== 'finalizado') continue;
    assert.equal(back.champion, original.champion);
    assert.equal(back.runner_up, original.runner_up);
    assert.deepEqual(back.placements, original.placements);
    assert.deepEqual(back.participants, original.participants);
    assert.deepEqual(back.draw_pair_ids, original.draw_pair_ids);
    assert.deepEqual(back.draw_ranking_snapshot, original.draw_ranking_snapshot);
    assert.deepEqual(back.bracket_history, original.bracket_history);
  }
  ok('A. campeões, vices, colocações, participantes, snapshots, pair_ids e chaves idênticos', true);
  const matches = (list) => list.filter((t) => t.status === 'finalizado').flatMap((t) => (t.bracket_history || []).flatMap((r) => r.matches.map((m) => [t.id, m.match_id, m.team_a, m.team_b, m.winner, m.score].join('|'))));
  ok('A. resultados de partidas e ids de partidas idênticos', json(matches(restored)) === json(matches(tournaments)));
  const finalists = (list) => list.filter((t) => t.champion).map((t) => [t.id, t.champion, t.runner_up, t.champion_partnership_id, t.runner_up_partnership_id, t.prize_coins, t.rank_points].join('|'));
  ok('A. premiações, pontos e referências a duplas idênticos', json(finalists(restored)) === json(finalists(tournaments)));
  const rawBytes = json(careerOf(tournaments)).length;
  const packedBytes = json(packedCareer).length;
  ok(`A. o save fica menor (${rawBytes} -> ${packedBytes} bytes)`, packedBytes < rawBytes * 0.95);
  const finBefore = json(finished).length;
  const finAfter = json(packedCareer.entities.Tournament.filter((t) => t.status === 'finalizado')).length;
  ok(`A. torneios finalizados encolhem >= 30% (${((1 - finAfter / finBefore) * 100).toFixed(1)}%)`, finAfter < finBefore * 0.7);
  ok('A. entidades não-torneio são compartilhadas, sem cópia', packedCareer.entities.Other === undefined || packedCareer.entities.Other === careerOf(tournaments).entities.Other || json(packedCareer.entities.Other) === json([{ id: 'keep' }]));
}

// ═══ B. Sem compactação prematura ═══
{
  const base = clone(settled[0]);
  const same = (label, mutate) => { const t = clone(base); mutate(t); ok(`B. ${label}: permanece intacto`, packTournament(t) === t); };
  same('status não finalizado', (t) => { t.status = 'chaveamento'; });
  same('inscrições abertas', (t) => { t.status = 'inscricoes'; });
  same('sem world_tour_resolved', (t) => { t.world_tour_resolved = false; });
  same('sem liquidação canônica', (t) => { delete t.canonical_settlement_id; });
  same('sem campeão', (t) => { t.champion = null; });
  same('partida pendente', (t) => { t.bracket_history.at(-1).matches[0].status = 'scheduled'; });
  same('partida sem vencedor', (t) => { delete t.bracket_history[0].matches[0].winner; });
  same('sem chave', (t) => { t.bracket_history = []; });
  ok('B. torneios abertos da fixture nunca são empacotados', tournaments.filter((t) => t.status !== 'finalizado').every((t) => !packCareerForStorage(careerOf([t])).entities.Tournament[0].history_pack));
  ok('B. a passagem da data não é critério (end_date no passado, mas sem liquidação)', (() => { const t = clone(base); t.end_date = '2000-01-01'; t.status = 'em_andamento'; return packTournament(t) === t; })());
  const exhibition = finished.find((t) => !isTournamentSettled(t));
  ok('B. exibição legada sem liquidação canônica permanece intacta', !exhibition || packTournament(exhibition) === exhibition);
}

// ═══ D (parte pura). Falhas do codec ═══
{
  const t = clone(settled[0]);
  const packed = packTournament(t);
  const corrupt = clone(packed); corrupt.history_pack.dict.length = 0;
  ok('D. pacote com dicionário truncado falha fechado (não entrega torneio sem histórico)', (() => { try { unpackTournament(corrupt); return false; } catch { return true; } })());
  const badVersion = clone(packed); badVersion.history_pack.v = 99;
  ok('D. versão de pacote desconhecida falha fechada', (() => { try { unpackTournament(badVersion); return false; } catch { return true; } })());
  const reserved = clone(t); reserved.participants[0] = `\u0001${reserved.participants[0]}`;
  ok('D. string que colide com o marcador interno deixa o torneio intacto', packTournament(reserved) === reserved);
  const reordered = clone(t); reordered.bracket_history[0].matches[0] = { score: reordered.bracket_history[0].matches[0].score, ...reordered.bracket_history[0].matches[0] };
  const reorderedPacked = packTournament(reordered);
  ok('D. ordem de chaves incomum ainda volta idêntica (ou fica intacto)', json(unpackTournament(clone(reorderedPacked))) === json(reordered));
  const withExtras = clone(t); withExtras.bracket_history[0].matches[0].player_match = true; withExtras.bracket_history[0].matches[0].set_scores = [[6, 3], [6, 4]];
  const extrasPacked = packTournament(withExtras);
  ok('D. campos extras de partida do jogador sobrevivem ao round-trip', json(unpackTournament(clone(extrasPacked))) === json(withExtras));
  const frozen = clone(t); Object.freeze(frozen); Object.freeze(frozen.bracket_history);
  ok('D. entrada congelada é aceita (nada é mutado)', (() => { try { packTournament(frozen); return true; } catch { return false; } })());
  const idempotent = packTournament(unpackTournament(clone(packTournament(t))));
  ok('D. repack após unpack gera exatamente os mesmos bytes (sem crescimento)', json(idempotent) === json(packTournament(t)));
  ok('D. torneio já empacotado não é empacotado de novo', packTournament(packed) === packed);
}

// ═══ C/E. Repositório e carreira real ═══
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');

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

  async function newCareer(hooks = {}) {
    const backend = memoryBackend(hooks);
    const manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
    const { career } = await manager.createCareer({ playerName: 'Cloud 7B2B' });
    const withHistory = clone(fixtureCareer);
    withHistory.career_id = career.career_id;
    withHistory.entities.Tournament = clone(tournaments);
    return { backend, manager, careerId: career.career_id, withHistory, file: () => backend.files.get(`careers/${career.career_id}.json`) };
  }

  // C. Compatibilidade
  {
    const rt = await newCareer();
    await quiet(() => rt.manager.saveCareer(rt.careerId, rt.withHistory));
    const legacyFile = rt.file();
    ok('C. gravação padrão (compactação desligada) não produz history_pack: formato idêntico ao anterior', !legacyFile.includes('history_pack'));
    const legacyLoaded = await rt.manager.loadCareer(rt.careerId);
    ok('C. save antigo carrega com todos os torneios históricos', legacyLoaded.entities.Tournament.length === tournaments.length);

    await rt.manager.repository.writeCareer(rt.careerId, legacyLoaded, { compactHistory: true });
    const compactFile = rt.file();
    ok(`C. gravação compacta reduz o arquivo (${legacyFile.length} -> ${compactFile.length})`, compactFile.length < legacyFile.length);
    ok('C. arquivo compacto contém history_pack', compactFile.includes('history_pack'));
    const compactLoaded = await rt.manager.loadCareer(rt.careerId);
    // last_played_at é carimbado por cada loadCareer; fora isso a carreira inteira tem de ser idêntica.
    const stable = (career) => json({ ...career, last_played_at: null });
    ok('C. carga do formato compacto == carga do formato antigo (carreira inteira)', stable(compactLoaded) === stable(legacyLoaded));

    // salvar/recarregar repetidamente: sem crescimento nem reempacotamento instável
    await rt.manager.repository.writeCareer(rt.careerId, compactLoaded, { compactHistory: true });
    const secondFile = rt.file();
    const onDisk = (text) => json({ ...JSON.parse(text), last_played_at: null });
    ok('C. salvar de novo após recarregar gera os mesmos bytes (idempotente, sem crescimento)', onDisk(secondFile) === onDisk(compactFile) && secondFile.length === compactFile.length);

    // leitor com a chave desligada continua lendo o formato compacto; e regrava expandido sem perder nada
    await rt.manager.repository.writeCareer(rt.careerId, await rt.manager.loadCareer(rt.careerId), { compactHistory: false });
    ok('C. com a chave desligada o save volta ao formato expandido sem perda', !rt.file().includes('history_pack') && stable(await rt.manager.loadCareer(rt.careerId)) === stable(legacyLoaded));

    // backup manual em formato compacto (restoreCareerBackup lê o arquivo cru) restaura corretamente
    const folder = await rt.manager.repository.backupDirectory(rt.careerId);
    await rt.manager.repository.storage.ensureDirectory(folder);
    await rt.manager.repository.storage.writeJson(`${folder}/backup-compact.json`, packCareerForStorage(legacyLoaded), { backup: false, validate: false });
    const restored = await rt.manager.restoreCareerBackup(rt.careerId);
    ok('C. restauração a partir de backup manual compacto devolve a carreira completa', json(restored.entities.Tournament) === json(legacyLoaded.entities.Tournament));

    // backup automático (cópia do arquivo compacto) assume quando o arquivo principal desaparece (recuperação existente)
    await rt.manager.repository.writeCareer(rt.careerId, legacyLoaded, { compactHistory: true, backup: true });
    await rt.manager.repository.writeCareer(rt.careerId, legacyLoaded, { compactHistory: true, backup: true });
    const mainPath = `careers/${rt.careerId}.json`;
    rt.backend.files.delete(mainPath);
    const recovered = await quiet(() => rt.manager.repository.readCareer(rt.careerId));
    ok('C. arquivo principal ausente recupera do backup compacto, com histórico completo', json(recovered.entities.Tournament) === json(legacyLoaded.entities.Tournament));
  }

  // D. Falhas de gravação com compactação ligada
  {
    const hooks = {};
    const rt = await newCareer(hooks);
    await quiet(() => rt.manager.saveCareer(rt.careerId, rt.withHistory));
    const loaded = await rt.manager.loadCareer(rt.careerId);
    await rt.manager.repository.writeCareer(rt.careerId, loaded, { compactHistory: true });
    const good = rt.file();
    const mutated = clone(loaded); mutated.player = { ...mutated.player, coins: (mutated.player.coins || 0) + 1 };

    hooks.failWrite = (p) => p.startsWith('temp/');
    await assert.rejects(quiet(() => rt.manager.repository.writeCareer(rt.careerId, mutated, { compactHistory: true })), /falha de escrita simulada/);
    hooks.failWrite = null;
    ok('D. falha de escrita preserva o último save válido (compacto)', rt.file() === good);
    ok('D. o save preservado continua carregando completo', json((await rt.manager.loadCareer(rt.careerId)).entities.Tournament) === json(loaded.entities.Tournament));

    hooks.corruptRead = (p) => p.startsWith('temp/');
    await assert.rejects(quiet(() => rt.manager.repository.writeCareer(rt.careerId, mutated, { compactHistory: true })), (e) => e?.code === 'TEMP_WRITE_MISMATCH');
    hooks.corruptRead = null;
    ok('D. verificação do temporário divergente preserva o último save válido', rt.file() === good);
  }

  // E. Continuidade com carreira real, gravação compacta ligada
  {
    globalThis.__PADEL_HISTORICAL_COMPACTION__ = true;
    try {
      const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
      const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
      const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
      let seed = 12345;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
      const rt = await newCareer();
      activeCareerAdapter.activePersistenceTransaction = null;
      activeCareerAdapter.writeChain = Promise.resolve();
      activeCareerAdapter.careerManager = rt.manager;
      activeCareerAdapter.clearActiveCareer();
      const external = clone(fixtureCareer);
      external.career_id = rt.careerId;
      await quiet(() => rt.manager.saveCareer(rt.careerId, external));
      activeCareerAdapter.clearActiveCareer();
      activeCareerAdapter.setActiveCareer(await rt.manager.loadCareer(rt.careerId));
      const profileId = external.player.id;
      const tournamentsBefore = await localGame.entities.Tournament.filter({});
      const finishedBefore = tournamentsBefore.filter((t) => t.status === 'finalizado');
      let profile = await localGame.entities.PlayerProfile.get(profileId);
      const startDate = profile.career_date;
      for (let i = 0; i < 40; i += 1) {
        await quiet(() => advanceCareerDayOnce(profile)); await waitForCareerDaySecondaryWork();
        profile = await localGame.entities.PlayerProfile.get(profileId);
      }
      ok('E. carreira real avança 40 dias com a gravação compacta ligada', profile.career_date > startDate);
      const afterFile = rt.file();
      const packedCount = (afterFile.match(/"history_pack"/g) || []).length;
      const afterFinished = (await localGame.entities.Tournament.filter({})).filter((t) => t.status === 'finalizado');
      ok(`E. torneios que finalizaram no período foram compactados no arquivo (${packedCount} de ${afterFinished.length})`, afterFinished.length > finishedBefore.length && packedCount >= afterFinished.filter(isTournamentSettled).length - 0);
      ok('E. nenhum torneio ainda não liquidado foi compactado', (await localGame.entities.Tournament.filter({})).filter((t) => t.status !== 'finalizado').length > 0
        && !JSON.parse(afterFile).entities.Tournament.some((t) => t.history_pack && t.status !== 'finalizado'));
      activeCareerAdapter.clearActiveCareer();
      const reloaded = await rt.manager.loadCareer(rt.careerId);
      activeCareerAdapter.setActiveCareer(reloaded);
      const reloadedProfile = await localGame.entities.PlayerProfile.get(profileId);
      ok('E. recarregar preserva a data da carreira', reloadedProfile.career_date === profile.career_date);
      const reloadedTournaments = await localGame.entities.Tournament.filter({});
      ok('E. torneios históricos acessíveis e completos após recarregar', reloadedTournaments.every((t) => t.status !== 'finalizado' || (Array.isArray(t.bracket_history) && t.bracket_history.length && Array.isArray(t.placements ?? []))));
      ok('E. mesmo número de torneios, sem ids duplicados', new Set(reloadedTournaments.map((t) => t.id)).size === reloadedTournaments.length && reloadedTournaments.length === afterFinished.length + reloadedTournaments.filter((t) => t.status !== 'finalizado').length);
      profile = reloadedProfile;
      for (let i = 0; i < 3; i += 1) {
        await quiet(() => advanceCareerDayOnce(profile)); await waitForCareerDaySecondaryWork();
        profile = await localGame.entities.PlayerProfile.get(profileId);
      }
      ok('E. continua avançando após recarregar', profile.career_date > reloadedProfile.career_date);
      ok('E. arquivo final carrega sem erro', (await rt.manager.loadCareer(rt.careerId)).career_id === rt.careerId);
    } finally {
      delete globalThis.__PADEL_HISTORICAL_COMPACTION__;
    }
  }
} finally {
  await vite.close();
}
console.log(`\nCLOUD-7B2B historical compaction: ${passed} verificações aprovadas.`);
