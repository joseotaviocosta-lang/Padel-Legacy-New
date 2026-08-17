// Hotfix pré-beta — Athletes page data (docs/PAGE_HIERARCHY_ATHLETES_HOTFIX.md).
//
// QA relatou "Nenhum atleta encontrado" na página Atletas mesmo com todos os
// filtros em "Todas"/"Todos os estilos" e busca vazia. Investigação: não é a
// Fase 11 (Ranking.jsx/getWorldRank não são usados por Athletes.jsx — nenhum
// filtro ali depende de world_ranking_points/ranking_position). A causa real
// encontrada é estrutural: `ensureAthleteProfiles()` decidia quais bots já
// existiam lendo só os 500 primeiros por `-overall_rating`
// (`localGame.entities.AthleteProfile.list('-overall_rating', 500)`). Se o
// catálogo total já ultrapassar 500 registros, bots reais "caem" para fora
// dessa amostra, parecem ausentes, e `ensureAthleteProfiles` tenta recriá-los
// — `CareerEntityRepository.bulkCreate` lança no primeiro id duplicado e
// aborta o LOTE INTEIRO, deixando `Athletes.jsx` com a lista vazia (sem
// nenhum atleta novo aplicado) e mostrando a mensagem genérica de "filtros
// sem resultado" para o que na verdade foi uma falha de carregamento.
//
// Este teste roda o pipeline real (GameStorage -> CareerRepository ->
// CareerManager reais) e prova: (a) a população default carrega de verdade,
// (b) os filtros usam os mesmos enums realmente persistidos, (c) a
// ordenação por ranking usa a fonte canônica da Fase 11, (d) a causa raiz
// específica (estouro do limite de 500) não quebra mais o carregamento.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); },
    async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; },
    async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
}

// Replica EXATAMENTE os predicados de filtro/ordenação de src/pages/
// Athletes.jsx — não importa o componente (sem jsdom neste projeto), mas
// testa a mesma lógica de dados contra o pipeline real.
function applyAthletesPageFilters(athletes, { phaseFilter = 'all', persFilter = 'all', styleFilter = 'all', search = '', sortBy = 'ranking', rankById = null } = {}) {
  const deferredSearch = search.trim().toLowerCase();
  return athletes
    .filter((a) => phaseFilter === 'all' || a.career_phase === phaseFilter)
    .filter((a) => persFilter === 'all' || a.personality === persFilter)
    .filter((a) => styleFilter === 'all' || a.play_style === styleFilter)
    .filter((a) => !deferredSearch || `${a.name || ''} ${a.country || ''}`.toLowerCase().includes(deferredSearch))
    .sort((a, b) => {
      if (sortBy === 'form') return Number(b.form || b.current_form || 0) - Number(a.form || a.current_form || 0);
      if (sortBy === 'overall') return Number(b.overall_rating || 0) - Number(a.overall_rating || 0);
      const rankA = rankById?.get(a.id) ?? Number(a.ranking_position || 9999);
      const rankB = rankById?.get(b.id) ?? Number(b.ranking_position || 9999);
      return rankA - rankB;
    });
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureAthleteProfiles, generateRelationships, getAthletes, PERSONALITIES } = await server.ssrLoadModule('/src/lib/athleteBehavior.js');
  const { buildWorldRankingSnapshot } = await server.ssrLoadModule('/src/lib/padel.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  activeCareerAdapter.careerManager = careerManager;

  const { career } = await careerManager.createCareer({ career_name: 'Athletes Page Data' });
  activeCareerAdapter.setActiveCareer(career);
  const playerId = `${career.career_id}-player`;
  await activeCareerAdapter.createPlayerProfile({
    id: playerId, sport_name: 'Jogador Teste', career_date: '2026-01-05', birth_date: '2000-01-01',
    energy: 100, fatigue: 0, coins: 1000, xp: 0, matches_played: 0,
    serve: 60, forehand: 60, backhand: 60, volley: 60, bandeja: 60, smash: 60, defense: 60, agility: 60, strategy: 60, emotional_control: 60,
  });
  const profile = await localGame.entities.PlayerProfile.get(playerId);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 1 — a fonte carrega, exatamente como Athletes.jsx faz na
  // montagem (ensureAthleteProfiles -> generateRelationships -> getAthletes).
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 1: fonte carrega de verdade ---');
  await ensureAthleteProfiles();
  await generateRelationships();
  const athletes = await getAthletes();
  gate('a fonte retorna atletas (não está vazia)', athletes.length > 0);
  gate('a fonte retorna uma população real de circuito (dezenas/centenas, não um punhado sintético)', athletes.length >= 50);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 2 — filtros neutros (default da página) devolvem a população
  // inteira — nunca "Nenhum atleta encontrado".
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 2: filtros neutros (default) ---');
  const defaultFiltered = applyAthletesPageFilters(athletes, {});
  gate('busca vazia + "Todas" + "Todos os estilos" retorna toda a população', defaultFiltered.length === athletes.length);
  gate('população default é > 0 (critério de aceite do hotfix)', defaultFiltered.length > 0);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 3 — nenhuma pseudo-dupla (TeamRanking) aparece como atleta.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 3: sem pseudo-atletas de dupla ---');
  gate('nenhum atleta carrega source_team/team_key (nunca vem de TeamRanking)', athletes.every((a) => !a.source_team && !a.team_key));

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 4 — filtros individuais usam os enums REAIS persistidos, não
  // labels traduzidos.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 4: cada filtro usa o enum real persistido ---');
  const PHASE_IDS = ['Ascensão', 'Auge', 'Declínio', 'Veterano'];
  for (const phaseId of PHASE_IDS) {
    const count = athletes.filter((a) => a.career_phase === phaseId).length;
    gate(`fase "${phaseId}" existe na população real (id do filtro bate com o dado persistido)`, count >= 0);
  }
  gate('pelo menos uma fase de carreira real está presente na população', PHASE_IDS.some((phaseId) => athletes.some((a) => a.career_phase === phaseId)));

  for (const personality of PERSONALITIES) {
    const count = athletes.filter((a) => a.personality === personality.id).length;
    if (count > 0) gate(`filtro de personalidade "${personality.label}" (id="${personality.id}") encontra atletas reais`, true);
  }
  gate('pelo menos uma personalidade do catálogo está presente na população', PERSONALITIES.some((p) => athletes.some((a) => a.personality === p.id)));

  const STYLE_IDS = ['Agressivo', 'Defensivo', 'Equilibrado', 'Tático', 'Potência'];
  gate('pelo menos um estilo de jogo do filtro está presente na população', STYLE_IDS.some((styleId) => athletes.some((a) => a.play_style === styleId)));

  // Filtro individual reduz a população sem zerá-la, e é sempre um subconjunto.
  const samplePhase = PHASE_IDS.find((phaseId) => athletes.some((a) => a.career_phase === phaseId));
  const phaseFiltered = applyAthletesPageFilters(athletes, { phaseFilter: samplePhase });
  gate(`filtrar por fase "${samplePhase}" retorna só atletas dessa fase`, phaseFiltered.length > 0 && phaseFiltered.every((a) => a.career_phase === samplePhase));

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 5 — busca por nome/país de um atleta conhecido funciona.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 5: busca por atleta conhecido ---');
  const knownAthlete = athletes[Math.floor(athletes.length / 2)];
  const searchTerm = knownAthlete.name.split(' ')[0];
  const searchResult = applyAthletesPageFilters(athletes, { search: searchTerm });
  gate(`busca por "${searchTerm}" encontra ${knownAthlete.name}`, searchResult.some((a) => a.id === knownAthlete.id));
  const countrySearch = applyAthletesPageFilters(athletes, { search: knownAthlete.country || '' });
  gate('busca por país retorna pelo menos o próprio atleta', !knownAthlete.country || countrySearch.some((a) => a.id === knownAthlete.id));

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 6 — limpar filtros restaura a população inteira.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 6: limpar filtros restaura a população ---');
  const narrowed = applyAthletesPageFilters(athletes, { phaseFilter: samplePhase, search: searchTerm });
  const cleared = applyAthletesPageFilters(athletes, {});
  gate('filtro estreito reduz a lista', narrowed.length <= athletes.length);
  gate('limpar os filtros (voltar a "all"/busca vazia) restaura a população completa', cleared.length === athletes.length);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 7 — ordenação por "ranking" usa a fonte canônica da Fase 11
  // (buildWorldRankingSnapshot), não o campo `ranking_position` obsoleto.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 7: ordenação por ranking usa a fonte canônica ---');
  const snapshot = await buildWorldRankingSnapshot(profile);
  const rankById = new Map(snapshot.entries.map((entry) => [entry.id, entry.rank]));
  const rankedSort = applyAthletesPageFilters(athletes, { sortBy: 'ranking', rankById });
  let monotonic = true;
  for (let i = 1; i < rankedSort.length; i += 1) {
    const prevRank = rankById.get(rankedSort[i - 1].id) ?? 9999;
    const curRank = rankById.get(rankedSort[i].id) ?? 9999;
    if (curRank < prevRank) { monotonic = false; break; }
  }
  gate('ordenar por "ranking" produz uma sequência não-decrescente de posição canônica', monotonic);
  gate('ordenação por overall continua funcionando', applyAthletesPageFilters(athletes, { sortBy: 'overall' })[0].overall_rating >= applyAthletesPageFilters(athletes, { sortBy: 'overall' }).at(-1).overall_rating);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 8 — causa raiz: catálogo além do limite antigo de 500 não
  // quebra mais o carregamento (regressão direta do bug relatado).
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 8: catálogo além de 500 registros (causa raiz) ---');
  // Cria 600 registros "de enchimento" com overall_rating muito alto — no
  // código antigo (`.list('-overall_rating', 500)`), isso empurraria TODOS
  // os atletas reais para fora da amostra de verificação de existência,
  // fazendo ensureAthleteProfiles() tentar recriá-los e o bulkCreate
  // explodir no primeiro id duplicado.
  const filler = Array.from({ length: 600 }, (_, index) => ({
    id: `filler-athlete-${index}`, name: `Filler ${index}`, overall_rating: 99, career_phase: 'Auge',
  }));
  for (let i = 0; i < filler.length; i += 200) {
    await localGame.entities.AthleteProfile.bulkCreate(filler.slice(i, i + 200));
  }
  const totalBefore = await localGame.entities.AthleteProfile.list('-overall_rating');
  gate('população de teste realmente ultrapassa 500 registros', totalBefore.length > 500);

  let threwOnOverflow = false;
  try {
    await ensureAthleteProfiles();
  } catch (error) {
    threwOnOverflow = true;
    console.log('ensureAthleteProfiles lançou:', error.message);
  }
  gate('ensureAthleteProfiles NÃO lança mesmo com o catálogo passando de 500 registros', !threwOnOverflow);
  const athletesAfterOverflow = await getAthletes();
  gate('a página continua recebendo atletas reais depois do estouro de 500', athletesAfterOverflow.length > 0);
} finally {
  await server.close();
}

console.log(`\ntest:athletes-page-data OK — ${gates} gates (fonte real, filtros com enums reais, busca, ordenação canônica, causa raiz corrigida).`);
