// Playthrough 4.5A — Race do mundo zerado no app real (Coello/Tapia/Galán/
// Chingotto continuam com 0 enquanto o headless funciona).
//
// Causa raiz encontrada por leitura de código + reprodução headless fiel à
// falha real (não hipótese): `verifySaveFoundation()` (src/lib/saveFoundation.js)
// só confere que o AthleteProfile de cada atleta real EXISTE — nunca que o
// PAREAMENTO (`ai_partner_id`, seção de seedPairs de ensureWorldSeed2025)
// terminou. `SaveFoundationBootstrap.jsx` só chama `ensureWorldSeed2025()`
// (idempotente) quando `verifySaveFoundation().ok === false`; uma semeadura
// interrompida DEPOIS de criar os perfis mas ANTES de parear (fire-and-forget
// num useEffect não aguardado — app em segundo plano/finalizado no Android,
// navegação, StrictMode remontando o efeito) fica com `ok:true` para sempre,
// e o reparo nunca é tentado de novo. buildCanonicalPairs (WorldTourLifecycle.js)
// só forma um par a partir de ai_partner_id cruzado — sem ele, aquele atleta
// nunca entra em nenhum torneio resolvido e race_points nunca é tocado.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(path) { this.directories.add(path); }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) { this.files.set(path, String(content)); }
  async readText(path) { if (!this.files.has(path)) { const error = new Error('missing'); error.code = 'FILE_NOT_FOUND'; throw error; } return this.files.get(path); }
  async remove(path) { this.files.delete(path); }
  async rename(source, destination) { this.files.set(destination, this.files.get(source)); this.files.delete(source); }
  async copy(source, destination) { this.files.set(destination, this.files.get(source)); }
  async list(directory = '.') { const prefix = directory === '.' ? '' : `${directory}/`; return [...this.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ name: key.slice(prefix.length), isDirectory: false })); }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}

globalThis.location = { hostname: '127.0.0.1', pathname: '/playthrough-45a-race-persistence', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

let passed = 0;
let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
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
  const { verifySaveFoundation, ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { getRealAthleteRegistry, getConfirmedRealPairs } = await vite.ssrLoadModule('/src/players/realAthleteRegistry.js');
  const { buildCanonicalPairs, resolveCompletedWorldTourEvents } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.5A Race Persistence', playerName: 'Player 4.5A' });
  activeCareerAdapter.setActiveCareer(career);

  // ── 1. Refutar a hipótese "um atleta inconsistente aborta o settlement
  // inteiro" — buildCanonicalPairs pula item a item, nunca em cascata.
  await check('1/refutação. Um ai_partner_id pendurado (aponta para id inexistente) não impede outros pares válidos', () => {
    const athletes = [
      { id: 'ok-a', name: 'OK A', ai_partner_id: 'ok-b', overall_rating: 70, energy: 90 },
      { id: 'ok-b', name: 'OK B', ai_partner_id: 'ok-a', overall_rating: 70, energy: 90 },
      { id: 'broken-a', name: 'Broken A', ai_partner_id: 'nao-existe-nesta-populacao', overall_rating: 70, energy: 90 },
    ];
    const pairs = buildCanonicalPairs([], athletes);
    assert.equal(pairs.length, 1, 'apenas o par válido é formado — o atleta com referência pendurada é pulado, não derruba a função');
    assert.equal(pairs[0].athletes.map((a) => a.id).sort().join(','), 'ok-a,ok-b');
  });

  // ── 2. Reproduzir a condição real: seeding interrompido ANTES de parear
  // (perfis dos atletas reais existem, ai_partner_id ainda não foi gravado).
  const registryAthletes = getRealAthleteRegistry();
  const confirmedPairs = getConfirmedRealPairs();
  const coelloTapia = confirmedPairs.find((pair) => pair.a === 'real_arturo_coello' || pair.b === 'real_arturo_coello');
  assert.ok(coelloTapia, 'pré-condição: Coello/Tapia precisa estar no registro de pares confirmados');

  await check('2. Seeding interrompido (perfis criados, pareamento NÃO rodou ainda) — verifySaveFoundation antes da correção diria ok:true incorretamente', async () => {
    // Simula exatamente o ponto de interrupção: ensureWorldSeed2025 já
    // completou o loop de criação de AthleteProfile (linhas 74-80) mas foi
    // interrompido antes do loop de pareamento (linhas 89-174).
    for (const athlete of registryAthletes) {
      await localGame.entities.AthleteProfile.create({ ...athlete, id: athlete.bot_id });
    }
    const status = await verifySaveFoundation();
    assert.equal(status.ok, false, 'a correção detecta a semeadura incompleta — pares confirmados existem sem ai_partner_id cruzado');
    assert.equal(status.confirmedPairsSeeded, false);

    const coelloBefore = await localGame.entities.AthleteProfile.get('real_arturo_coello');
    assert.equal(coelloBefore.ai_partner_id, undefined, 'pré-condição: Coello realmente está sem parceiro neste ponto');
  });

  // ── 3. O reparo (mesma função idempotente que o bootstrap já chama)
  // completa o pareamento que a interrupção deixou pendente.
  await check('3/7. ensureWorldSeed2025 (idempotente) repara o pareamento pendente; verifySaveFoundation confirma', async () => {
    await ensureWorldSeed2025();
    const status = await verifySaveFoundation();
    assert.equal(status.ok, true, 'depois do reparo, a semeadura está genuinamente completa');
    assert.equal(status.confirmedPairsSeeded, true);

    const coello = await localGame.entities.AthleteProfile.get('real_arturo_coello');
    const tapia = await localGame.entities.AthleteProfile.get('real_agustin_tapia');
    assert.equal(coello.ai_partner_id, 'real_agustin_tapia', 'Coello/Tapia pareados após o reparo');
    assert.equal(tapia.ai_partner_id, 'real_arturo_coello');
    const galan = await localGame.entities.AthleteProfile.get('real_alejandro_galan');
    const chingotto = await localGame.entities.AthleteProfile.get('real_federico_chingotto');
    assert.equal(galan.ai_partner_id, 'real_federico_chingotto', 'Galán/Chingotto pareados após o reparo');
    assert.equal(chingotto.ai_partner_id, 'real_alejandro_galan');
  });

  // ── 4/6/8/9/10/11. Com o mundo reparado, um torneio AI-only resolvido
  // credita Race a Coello/Tapia de verdade — e o diagnóstico (raceWatch)
  // prova o antes/depois e a formação do par canônico.
  await check('4/6/8/9/10/11. Após o reparo, Coello/Tapia recebem race_points > 0 no settlement, com prova via raceWatch', async () => {
    // A fundação de uma carreira nova semeia o calendário real da temporada
    // inteira (~15 meses à frente) — cancela tudo isso para que o ÚNICO
    // torneio pendente na data do settlement seja o sintético deste teste,
    // eliminando qualquer não-determinismo de "qual torneio a IA escolheu
    // jogar esta semana" (fora do que este teste audita).
    for (const seeded of (await localGame.entities.Tournament.list('start_date', 2000)) || []) {
      await localGame.entities.Tournament.update(seeded.id, { world_tour_cancelled: true, world_tour_resolved: true });
    }
    // Playthrough 4.5D corrigiu a origem: `saveFoundation.js` agora grava
    // `ranking_position` (a partir de `seed_rank`) pros atletas reais já na
    // semeadura — Coello nasce rank ~1, não mais no fallback 999. Um tier
    // aberto (Bronze/Silver) ficaria "overqualified" (EntryManager.js,
    // OPEN_TIER_CEILING) pra quem tem rank tão alto; Crown é o tier
    // correto pro elenco real de topo, e é exatamente o que este item
    // audita (pareamento/Race), não elegibilidade de tier.
    const tournament = await localGame.entities.Tournament.create({
      id: 'race-watch-tournament', name: 'Doha Crown 4.5A', tier: 'Crown', world_tour_event: true,
      start_date: '2025-06-01', end_date: '2025-06-08', main_draw_size: 8,
    });

    const settlement = await resolveCompletedWorldTourEvents('2025-06-15');
    assert.equal(settlement.waitingForCanonicalPairs, undefined, 'buildCanonicalPairs não aborta mais — Coello/Tapia/Galán/Chingotto estão pareados');
    assert.ok(settlement.canonicalPairsFound >= 2, `pelo menos os 2 pares reais confirmados devem existir (obtido: ${settlement.canonicalPairsFound})`);
    assert.deepEqual(settlement.errors, [], `settlement não pode falhar silenciosamente: ${JSON.stringify(settlement.errors)}`);

    const coelloWatch = settlement.raceWatch.find((row) => row.label === 'Coello');
    assert.equal(coelloWatch.found_in_population, true);
    assert.equal(coelloWatch.ai_partner_id, 'real_agustin_tapia', 'raceWatch confirma o pareamento (prova/refutação do item 2)');
    assert.equal(coelloWatch.canonical_pair_formed, true, 'raceWatch confirma que buildCanonicalPairs realmente formou o par (não só que ai_partner_id existe)');

    assert.ok(settlement.resolved > 0, `o único torneio pendente (Crown, sintético) precisa resolver: ${JSON.stringify({ resolved: settlement.resolved, pending: settlement.pending })}`);
    const coelloAfter = await localGame.entities.AthleteProfile.get('real_arturo_coello');
    const tapiaAfter = await localGame.entities.AthleteProfile.get('real_agustin_tapia');
    assert.ok(Number(coelloAfter.race_points) > 0, `Coello deve ter race_points > 0 após settlement (obtido: ${coelloAfter.race_points})`);
    assert.equal(Number(coelloAfter.race_points), Number(tapiaAfter.race_points), '11. Coello e Tapia (mesma dupla) recebem exatamente os mesmos pontos');

    // ── 5/6. Prova de persistência: reler via repository, depois via uma
    // NOVA consulta list() (simulando reload da tela Ranking) — o valor
    // não pode se perder nem ser sobrescrito pela escrita SEGUINTE
    // (reranked bulkUpdate, que só toca ranking_position).
    const reread = await localGame.entities.AthleteProfile.get('real_arturo_coello');
    assert.equal(Number(reread.race_points), Number(coelloAfter.race_points), '6. valor sobrevive a uma releitura imediata pelo repository');
    const viaList = (await localGame.entities.AthleteProfile.list('-race_points', 50)).find((row) => row.id === 'real_arturo_coello');
    assert.equal(Number(viaList?.race_points), Number(coelloAfter.race_points), '7. Ranking.jsx (que lê via list/-world_ranking_points) veria o mesmo valor — nenhuma escrita seguinte (rerank) sobrescreve race_points');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-playthrough-4-5a-race-persistence: PASS');
} finally {
  await vite.close();
}
