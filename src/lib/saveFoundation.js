import { localGame } from '@/api/localGameClient.js';
import worldSeedMeta from '@/data/worldSeed2025.json';
import { buildSupplementalRankingPopulation, buildSupplementalTeamRows, WORLD_RANKING_TARGET, TEAM_RANKING_TARGET } from '@/lib/rankingPopulation.js';
import { getRealAthleteRegistry, getConfirmedRealPairs, getProbableRealPairs } from '@/players/realAthleteRegistry.js';
import { buildLegacyTeamRankingRepair, repairLegacyTeamRankings, teamKey, computeCanonicalTeamRankingPoints } from '@/lib/teamRanking.js';
import { athleteProfileOverallRepair } from '@/players/athleteSchema.js';
import { formNewPartnerships } from '@/game-core/aiPartnershipLifecycle.js';

export const SAVE_FOUNDATION_VERSION = '4.0.0';

const safeList = async (entity, order='-created_date', limit=1000) => {
  try { return await localGame.entities[entity].list(order, limit) || []; }
  catch (error) { console.warn(`[Save Foundation] list ${entity}`, error); return []; }
};

async function upsertBy(entity, existing, key, value, payload) {
  const found = existing.find(item => String(item?.[key] || '') === String(value));
  if (found?.id) {
    const patch = {};
    for (const [field, fieldValue] of Object.entries(payload)) {
      if (found[field] === undefined || found[field] === null || found[field] === '' ||
          (typeof found[field] === 'number' && !Number.isFinite(found[field]))) {
        patch[field] = fieldValue;
      }
    }
    if (Object.keys(patch).length) {
      try { await localGame.entities[entity].update(found.id, patch); Object.assign(found, patch); } catch (error) {
        console.warn(`[Save Foundation] update ${entity}`, error);
      }
    }
    return found;
  }
  try {
    const created = await localGame.entities[entity].create(payload);
    existing.push(created || payload);
    return created;
  } catch (error) {
    console.warn(`[Save Foundation] create ${entity}`, error);
    return null;
  }
}

export async function createCriticalBackup() {
  try {
    const checkpoint = await localGame.storage.checkpoint('save-foundation-backup');
    if (checkpoint?.skipped) return null;
    return await localGame.storage.exportPersistent();
  } catch (error) {
    console.warn('[Save Foundation] backup nativo não criado', error);
    return null;
  }
}

// Fase 2G: química inicial dos pares pré-existentes na semeadura — mais
// alta para os "confirmados" (vieram de resultado real de torneio) do que
// para os "prováveis" (heurística de pontos parecidos, sem confirmação).
const SEED_PAIR_CHEMISTRY = Object.freeze({ locked: 88, unlocked: 60 });

// CLOUD-5 — variante em lote de `upsertBy`: as linhas que já existem seguem o
// mesmo caminho (patch só de campos ausentes); as que não existem são criadas
// com UM `bulkCreate` (uma gravação física do save) em vez de uma gravação
// completa por linha. Chaves repetidas na mesma lista, ou falha do lote,
// recaem no `upsertBy` sequencial original, preservando o comportamento.
async function upsertManyBy(entity, existing, key, items) {
  const keys = items.map(({ value }) => String(value));
  if (new Set(keys).size !== keys.length) {
    const rows = [];
    for (const { value, payload } of items) rows.push(await upsertBy(entity, existing, key, value, payload));
    return rows;
  }
  const rows = new Array(items.length).fill(null);
  const pending = [];
  for (let index = 0; index < items.length; index += 1) {
    const { value, payload } = items[index];
    if (existing.some(item => String(item?.[key] || '') === String(value) && item?.id)) {
      rows[index] = await upsertBy(entity, existing, key, value, payload);
    } else {
      pending.push(index);
    }
  }
  if (!pending.length) return rows;
  try {
    const created = await localGame.entities[entity].bulkCreate(pending.map(index => items[index].payload));
    pending.forEach((itemIndex, position) => {
      rows[itemIndex] = created[position] || null;
      existing.push(created[position] || items[itemIndex].payload);
    });
  } catch (error) {
    console.warn(`[Save Foundation] create em lote ${entity}`, error);
    for (const index of pending) rows[index] = await upsertBy(entity, existing, key, items[index].value, items[index].payload);
  }
  return rows;
}

export async function ensureWorldSeed2025({ force = false } = {}) {
  // Playthrough 5.26-B — identidade na coleção INTEIRA (antes: top 500 por
  // pontos, que recriava atletas reais e TeamRanking já existentes fora do
  // recorte). Ver verifySaveFoundation.
  const [{ athletes, byKey: realByKey, retiredIds }, teams, profiles] = await Promise.all([
    loadRealAthleteIdentity(),
    safeList('TeamRanking', '-ranking_points', FULL_COLLECTION_LIMIT),
    safeList('PlayerProfile', '-created_date', 20),
  ]);

  await createCriticalBackup();

  // Playthrough 5.6 — migração aditiva dos formatos legados conhecidos.
  // Não apaga linhas e não toca em valores válidos: OVR usa somente o alias
  // `overall`; TeamRanking só é reparado quando ambos os membros resolvem de
  // forma unívoca para AthleteProfiles existentes.
  const athleteIntegrityPatches = athletes
    .map((athlete) => ({ athlete, patch: athleteProfileOverallRepair(athlete) }))
    .filter(({ patch }) => patch)
    .map(({ athlete, patch }) => ({ id: athlete.id, ...patch }));
  if (athleteIntegrityPatches.length) {
    try {
      await localGame.entities.AthleteProfile.bulkUpdate(athleteIntegrityPatches);
      for (const patch of athleteIntegrityPatches) Object.assign(athletes.find((row) => row.id === patch.id) || {}, patch);
    } catch (error) { console.warn('[Save Foundation] integridade AthleteProfile', error); }
  }
  const teamIntegrityPatches = teams
    .map((team) => ({ team, patch: buildLegacyTeamRankingRepair(team, athletes) }))
    .filter(({ patch }) => patch)
    .map(({ team, patch }) => ({ id: team.id, ...patch }));
  if (teamIntegrityPatches.length) {
    try {
      await localGame.entities.TeamRanking.bulkUpdate(teamIntegrityPatches);
      for (const patch of teamIntegrityPatches) Object.assign(teams.find((row) => row.id === patch.id) || {}, patch);
    } catch (error) { console.warn('[Save Foundation] integridade TeamRanking legado', error); }
  }

  // Fase 2A/2B: os atletas reais vêm de um único registro canônico
  // (src/players/realAthleteRegistry.js -> src/data/realAthletesRegistry.json,
  // gerado por scripts/build-real-athletes-registry.mjs) — não mais de um
  // array hardcoded aqui. bot_id -> id real (atribuído por makeId() na
  // criação, Fase 0.1) mapeado abaixo pra uso na semeadura de parcerias.
  const registryAthletes = getRealAthleteRegistry();
  const botIdToRealId = new Map();
  const botIdToRow = new Map();
  const registryUpserts = [];
  for (const athlete of registryAthletes) {
    // Playthrough 5.26-B — aposentado e podado: conhecido pelo legado, nunca recriado.
    if (!realByKey.has(String(athlete.bot_id)) && retiredIds.has(String(athlete.bot_id))) continue;
    // Playthrough 4.5D, item 4 — o registro real (src/data/realAthletesRegistry.json)
    // só traz `world_ranking_points`/`fip_rank`/`seed_rank`, nunca
    // `ranking_position` — o campo que EntryManager.js:resolveEntryRank
    // realmente lê para decidir elegibilidade de tier. Sem isso,
    // normalizeAthlete (WorldTourLifecycle.js) cai no fallback `999` pra
    // TODO atleta real (Coello incluso) até a primeira liquidação de
    // torneio já ter rodado — que só acontece DEPOIS do primeiro sorteio.
    // Na primeira janela da carreira, isso derruba as 50 duplas reais
    // canônicas (as ÚNICAS que existem no dia 1, ver bug de
    // aiPartnershipLifecycle.js abaixo) para fora de Gold/Masters/Elite/
    // Crown — só Bronze/Silver (`minRanking:0`) ficam elegíveis, porque
    // ranking 999 nunca passa nos cortes de qualifying dos tiers acima.
    // `seed_rank` já É a posição real pretendida (1..100, gerada a partir
    // do ranking FIP na criação do registro) — é exatamente o dado que
    // faltava propagar.
    const ranking_position = Number(athlete.seed_rank || athlete.fip_rank) || null;
    // Fase 2.6, item 3: marca quando este atleta passou a existir NESTA
    // carreira — usado só pra "anos ativos" na linha-resumo de
    // aposentadoria (AthleteCareerLegacy), nunca uma biografia pré-jogo.
    registryUpserts.push({ value: athlete.bot_id, payload: { ...athlete, ranking_position, circuit_entry_date: worldSeedMeta.career_start_date } });
  }
  // CLOUD-5 — uma gravação para todos os atletas reais ausentes (antes: uma por atleta).
  const registryRows = await upsertManyBy('AthleteProfile', athletes, 'bot_id', registryUpserts);
  registryRows.forEach((row, index) => {
    const botId = registryUpserts[index].value;
    if (row?.id) { botIdToRealId.set(botId, row.id); botIdToRow.set(botId, row); }
  });

  // Fase 2F/2G: pares pré-existentes na semeadura. team_key SEMPRE derivado
  // dos ids REAIS (pós-criação), nunca de uma string estática no JSON —
  // uma string estática diverge do team_key que circuitLifecycle.js deriva
  // em produção (mesmos ids, mesma função canônica `teamKey`), duplicando a
  // linha de ranking na primeira semana de jogo (achado #2F). ai_partner_id
  // só é semeado se o atleta AINDA não tem parceiro — idempotente, nunca
  // sobrescreve um estado já evoluído pelo jogador.
  const seedPairs = [
    ...getConfirmedRealPairs().map((pair) => ({ ...pair, locked: true })),
    ...getProbableRealPairs().map((pair) => ({ ...pair, locked: false })),
  ];
  const athletePairUpdates = [];
  const teamPairPayloads = [];
  for (const pair of seedPairs) {
    const id1 = botIdToRealId.get(pair.a);
    const id2 = botIdToRealId.get(pair.b);
    const row1 = botIdToRow.get(pair.a);
    const row2 = botIdToRow.get(pair.b);
    if (!id1 || !id2 || !row1 || !row2) continue;
    // Playthrough 5.26-B — já pareado alguma vez (tem parceiro hoje OU o ciclo
    // da IA já registrou status, inclusive depois de o par se desfazer no
    // mercado): evoluído em jogo, não re-semear. Antes só olhava
    // ai_partner_id e re-pareava à força quem o mercado tinha separado.
    if (wasEverPairSeeded(row1) || wasEverPairSeeded(row2)) continue;
    const chemistry = pair.locked ? SEED_PAIR_CHEMISTRY.locked : SEED_PAIR_CHEMISTRY.unlocked;
    const common = {
      ai_partnership_status: 'ativa',
      ai_partnership_start_date: worldSeedMeta.career_start_date,
      ai_partnership_chemistry: chemistry,
      ai_partnership_protected: pair.locked,
      market_status: 'contratado',
    };
    athletePairUpdates.push({ id: id1, ...common, ai_partner_id: id2, ai_partner_name: pair.bName });
    athletePairUpdates.push({ id: id2, ...common, ai_partner_id: id1, ai_partner_name: pair.aName });
    const key = teamKey(id1, id2);
    // Playthrough 5.22-E, Parte M/N — semeadura migrada para a autoridade
    // canônica (SOMA). Antes usava média simples inline, divergente da
    // fórmula única.
    const points = computeCanonicalTeamRankingPoints(
      Number(row1.world_ranking_points) || 0,
      Number(row2.world_ranking_points) || 0);
    teamPairPayloads.push({
      team_key: key, player1_id: id1, player1_name: pair.aName, player1_country: row1.country,
      player2_id: id2, player2_name: pair.bName, player2_country: row2.country,
      ranking_points: points, race_points: 0, matches_played: 0, wins: 0, losses: 0, titles: [],
      season_id: String(worldSeedMeta.career_start_date || '').slice(0, 4), origin: pair.locked ? 'seed-confirmado' : 'seed-provavel',
    });
    row1.ai_partner_id = id2; row2.ai_partner_id = id1; // evita re-processar no mesmo load se a lista de pairs tiver o mesmo par duas vezes
  }

  // Fase 6.2, item 2 — os outros 46 reais (fora dos 27 pares confirmados/
  // prováveis) não têm parceiro real conhecido no registro
  // (`partner_confidence: null`) — decisão da Fase 2 era deixá-los entrar
  // "normalmente" no mercado de IA, junto dos ~900 bots, assumindo que o
  // mercado os separaria. Medido na Fase 6.1: essa loteria de formação
  // pode nunca sortear alguém (2 dos 5 casos rastreados nunca formaram
  // par em 2 temporadas inteiras), e quem fica livre por mais de ~12
  // meses cruza o penhasco do `legacy_seed` (`rankingWindow.js`) e fica
  // praticamente impossível de reparear depois — a origem raiz da
  // interseção de reais permanentemente ausentes (Fase 6, item 1).
  // "Parceiro desconhecido" não precisa virar "sem parceiro": um top 100
  // do FIP tem parceiro, só não sabemos qual pelo registro que temos.
  // Pareia os restantes entre si por proximidade de `fip_rank` (mesma
  // noção de "proximidade de ranking" que já orienta o mercado de IA em
  // produção — `aiPartnershipLifecycle.js:rankGapWeight`) — estado
  // INICIAL, `ai_partnership_protected:false` (mesma química de um par
  // "provável"), ao contrário das 6 duplas históricas CONFIRMADAS: o
  // mercado dissolve e reforma essas duplas normalmente dali em diante,
  // como qualquer par de IA. Não muda nenhuma regra para o resto da
  // população (bots inclusive) — só preenche um estado inicial que o
  // registro já sabia mas não estava sendo aplicado.
  const unseededReals = registryAthletes
    .filter((athlete) => botIdToRow.get(athlete.bot_id) && !wasEverPairSeeded(botIdToRow.get(athlete.bot_id)))
    .sort((a, b) => (Number(a.fip_rank) || 999) - (Number(b.fip_rank) || 999));
  for (let i = 0; i + 1 < unseededReals.length; i += 2) {
    const a = unseededReals[i];
    const b = unseededReals[i + 1];
    const id1 = botIdToRealId.get(a.bot_id);
    const id2 = botIdToRealId.get(b.bot_id);
    const row1 = botIdToRow.get(a.bot_id);
    const row2 = botIdToRow.get(b.bot_id);
    if (!id1 || !id2 || !row1 || !row2 || wasEverPairSeeded(row1) || wasEverPairSeeded(row2)) continue;
    const chemistry = SEED_PAIR_CHEMISTRY.unlocked;
    const common = {
      ai_partnership_status: 'ativa',
      ai_partnership_start_date: worldSeedMeta.career_start_date,
      ai_partnership_chemistry: chemistry,
      ai_partnership_protected: false,
      market_status: 'contratado',
    };
    athletePairUpdates.push({ id: id1, ...common, ai_partner_id: id2, ai_partner_name: b.name });
    athletePairUpdates.push({ id: id2, ...common, ai_partner_id: id1, ai_partner_name: a.name });
    const key = teamKey(id1, id2);
    // Playthrough 5.22-E, Parte M/N — mesma autoridade canônica (SOMA).
    const points = computeCanonicalTeamRankingPoints(
      Number(row1.world_ranking_points) || 0,
      Number(row2.world_ranking_points) || 0);
    teamPairPayloads.push({
      team_key: key, player1_id: id1, player1_name: a.name, player1_country: row1.country,
      player2_id: id2, player2_name: b.name, player2_country: row2.country,
      ranking_points: points, race_points: 0, matches_played: 0, wins: 0, losses: 0, titles: [],
      season_id: String(worldSeedMeta.career_start_date || '').slice(0, 4), origin: 'seed-inicial',
    });
    row1.ai_partner_id = id2; row2.ai_partner_id = id1;
  }

  if (athletePairUpdates.length) {
    try { await localGame.entities.AthleteProfile.bulkUpdate(athletePairUpdates); }
    catch (error) { console.warn('[Save Foundation] parcerias pré-existentes', error); }
  }
  await upsertManyBy('TeamRanking', teams, 'team_key', teamPairPayloads.map((team) => ({ value: team.team_key, payload: team })));

  // Completa o universo competitivo. O registro real traz só o topo; a
  // população suplementar cria profundidade suficiente para uma carreira
  // começar fora do Top 1000 e progredir de forma visível.
  const refreshedAthletes = await safeList('AthleteProfile', '-world_ranking_points', WORLD_RANKING_TARGET + 100);
  // Playthrough 5.5, Parte I — `TEAM_RANKING_TARGET + 100` (600) só cobria
  // a semeadura suplementar fixa; o mercado de parcerias forma mais pares
  // ao longo da carreira. `buildSupplementalRankingPopulation` agora
  // descarta pares já existentes em `existingTeams` (mesmo achado, ver
  // rankingPopulation.js) — precisa enxergar a coleção INTEIRA pra isso
  // funcionar numa carreira já avançada (recarregada), não só no dia 1.
  const refreshedTeams = await safeList('TeamRanking', '-ranking_points', 5000);
  const supplemental = buildSupplementalRankingPopulation(refreshedAthletes, refreshedTeams, worldSeedMeta.career_start_date);
  let createdProceduralBots = [];
  if (supplemental.athletes.length) {
    try { createdProceduralBots = (await localGame.entities.AthleteProfile.bulkCreate(supplemental.athletes)) || []; }
    catch (error) { console.warn('[Save Foundation] população de atletas', error); }
  }
  // Playthrough 5.10, Parte K — as duplas suplementares agora são formadas
  // DEPOIS de os atletas existirem de verdade, a partir dos registros
  // retornados pelo bulkCreate (que já carregam `id` canônico). Antes elas
  // eram construídas dentro de buildSupplementalRankingPopulation, antes de
  // qualquer id existir, e acabavam gravadas com membros `ranking-bot-NNNN`
  // — irresolvíveis contra AthleteProfile (achado da 5.9, Parte E).
  const persistedAthletes = createdProceduralBots.length ? createdProceduralBots : supplemental.athletes;
  const supplementalTeams = buildSupplementalTeamRows([...refreshedAthletes, ...persistedAthletes], refreshedTeams);
  if (supplementalTeams.length) {
    try { await localGame.entities.TeamRanking.bulkCreate(supplementalTeams); }
    catch (error) { console.warn('[Save Foundation] população de duplas', error); }
  }

  // Playthrough 5.10, Parte L — saves criados ANTES da correção de ordem
  // acima continuam com linhas cujos membros são `ranking-bot-NNNN`.
  // Reparo idempotente: remapeia pelo vínculo determinístico
  // (AthleteProfile.bot_id), normaliza team_key e funde duplicatas sem
  // somar pontos. Numa carreira já corrigida é um no-op.
  try { await repairLegacyTeamRankings(); }
  catch (error) { console.warn('[Save Foundation] reparo de duplas legadas', error); }

  // Playthrough 4.5D, item 4 — bug de seed/foundation na ORIGEM: os ~900
  // bots procedurais acima nascem SEM `ai_partner_id` (buildSupplementalRankingPopulation
  // não pareia ninguém) — o único mecanismo que faria isso,
  // processAiPartnershipMarket, só dispara na primeira VIRADA DE MÊS
  // (aiPartnershipLifecycle.js), deixando o mundo até 30 dias sem uma
  // única dupla canônica de bot. Na primeira janela do World Tour
  // (D-3 dos primeiros torneios, dias antes de qualquer mês virar), as
  // ÚNICAS 50 duplas canônicas existentes eram as reais — e essas, sem o
  // `ranking_position` corrigido acima, caem no fallback de rank 999 e só
  // são elegíveis pra Bronze/Silver. Resultado medido: Gold/Masters/Elite/
  // Crown sem NENHUMA dupla elegível na primeira onda, mesmo com >1000
  // atletas no mundo — exatamente o cancelamento "por falta de campo"
  // relatado (Cidade do Cabo).
  //
  // Correção na origem: forma as parcerias iniciais dos bots procedurais
  // JÁ NA SEMEADURA, reusando o MESMO algoritmo do mercado mensal
  // (formNewPartnerships, exportado de aiPartnershipLifecycle.js) — nunca
  // inventa pares arbitrários, só roda a mecânica canônica em lote, uma
  // vez, no bootstrap, em vez de esperar a 1ª virada de mês.
  // `formationFraction: 1` pareia (até o critério de qualidade do próprio
  // mercado permitir) a totalidade do pool livre — o circuito abre a
  // temporada com duplas já formadas, como um circuito profissional real.
  if (createdProceduralBots.length >= 2) {
    try { await formNewPartnerships(createdProceduralBots, worldSeedMeta.career_start_date, 1); }
    catch (error) { console.warn('[Save Foundation] parcerias iniciais dos bots procedurais', error); }
  }

  // Corrige somente campos estruturais ausentes. Nunca reinicia XP, moedas, data ou atributos.
  for (const profile of profiles) {
    if (!profile?.id) continue;
    const patch = {};
    if (!profile.career_date) patch.career_date = worldSeedMeta.career_start_date;
    if (!profile.save_schema_version) patch.save_schema_version = SAVE_FOUNDATION_VERSION;
    if (profile.partner_id && !profile.partner_name) {
      const partner = registryAthletes.find(a => a.bot_id === profile.partner_id);
      if (partner) patch.partner_name = partner.name;
    }
    if (Object.keys(patch).length) {
      try { await localGame.entities.PlayerProfile.update(profile.id, patch); } catch (error) {
        console.warn('[Save Foundation] perfil preservado, patch ignorado', error);
      }
    }
  }

  window.dispatchEvent(new CustomEvent('padel-save-foundation-ready', {
    detail: { version:SAVE_FOUNDATION_VERSION, athletes:WORLD_RANKING_TARGET, teams:TEAM_RANKING_TARGET }
  }));
  return { athletes: WORLD_RANKING_TARGET, teams: TEAM_RANKING_TARGET };
}

// Playthrough 4.5A — causa raiz do Race mundial zerado para os atletas reais
// nomeados (Coello/Tapia, Galán/Chingotto etc.) no app real, headless não
// reproduz. `SaveFoundationBootstrap.jsx` só chama `ensureWorldSeed2025()`
// (idempotente, sempre seguro de reexecutar) quando `verifySaveFoundation()`
// devolve `ok:false` — mas esta função só conferia que o AthleteProfile de
// cada atleta real EXISTE (`athleteIds.has(a.bot_id)`), nunca que o
// PAREAMENTO (`ai_partner_id`, seção de `seedPairs` acima, que roda DEPOIS
// da criação dos perfis dentro do mesmo `ensureWorldSeed2025`) realmente
// completou. `ensureWorldSeed2025` roda fora do ciclo de vida do
// `advanceDay` (dispara de um useEffect não aguardado, fire-and-forget, na
// montagem da tela) — se essa chamada for interrompida (app em segundo
// plano/finalizado no Android, navegação antes de terminar, StrictMode
// remontando o efeito) DEPOIS de criar os perfis mas ANTES de gravar
// `ai_partner_id`, `verifySaveFoundation` já reporta `ok:true` (os perfis
// existem) e o reparo NUNCA é tentado de novo — o atleta real fica sem
// parceiro canônico para sempre. `buildCanonicalPairs`
// (WorldTourLifecycle.js) só forma um par a partir de `ai_partner_id`
// cruzado; sem ele, aquele atleta específico nunca entra em nenhum torneio
// resolvido pelo circuito e `race_points` nunca é tocado — exatamente o
// padrão relatado (o jogador, cujo caminho de pontos é inteiramente
// independente desta semeadura, pontua normalmente; os pares reais mais
// visíveis do circuito, não). Headless nunca reproduz porque os harnesses
// sempre aguardam `ensureWorldSeed2025()` até completar, nunca correndo em
// paralelo com outra coisa que possa interrompê-la.
//
// Correção: `ok` agora também exige que todo par CONFIRMADO do registro
// (a fonte mais visível/crítica — Coello/Tapia, Galán/Chingotto...) tenha
// `ai_partner_id` cruzado dos dois lados. Uma semeadura parcial passa a ser
// detectada e reparada no próximo mount, sem reescrever nada que já esteja
// correto (`ensureWorldSeed2025` só toca quem ainda não tem parceiro).
//
// Playthrough 5.26-B — causa raiz do congelamento anual (P0). Esta
// verificação lia só os 500 primeiros AthleteProfile por pontos. Num mundo
// vivo, atletas reais do registro caem para fora desse recorte (perdem
// pontos, aposentam) e o par confirmado se desfaz no mercado da IA — duas
// evoluções LEGÍTIMAS que viravam "semeadura incompleta". O reparo então
// tentava CRIAR de novo o atleta real que já existia fora do recorte
// (`AthleteProfile já existe com o id: real_…`), a transação do dia falhava
// e o calendário nunca mais avançava (dias 366–452 em 100% das carreiras
// medidas na 5.26). A identidade agora é resolvida na coleção INTEIRA, por
// `bot_id`/`id`, e "par semeado" significa "o pareamento foi aplicado ao
// menos uma vez" — que é o que o reparo de semeadura interrompida (4.5A)
// precisa detectar.
const FULL_COLLECTION_LIMIT = 100000;

export async function loadRealAthleteIdentity() {
  const [athletes, legacy] = await Promise.all([
    safeList('AthleteProfile', '-world_ranking_points', FULL_COLLECTION_LIMIT),
    safeList('AthleteCareerLegacy', '-created_date', FULL_COLLECTION_LIMIT),
  ]);
  const byKey = new Map();
  for (const athlete of athletes) {
    if (athlete?.bot_id) byKey.set(String(athlete.bot_id), athlete);
    if (athlete?.id && !byKey.has(String(athlete.id))) byKey.set(String(athlete.id), athlete);
  }
  // Aposentado e já podado da coleção viva (pruneOldRetiredAthletes) continua
  // conhecido pelo legado — nunca é "ressuscitado" pela semeadura.
  const retiredIds = new Set((legacy || []).map((row) => String(row?.athlete_id || '')).filter(Boolean));
  return { athletes, byKey, retiredIds };
}

// Já passou pela semeadura de pares ao menos uma vez: tem parceiro hoje OU o
// ciclo de parceria da IA já registrou um status (inclusive 'sem_parceiro' /
// 'encerrada' depois de o par se desfazer no mercado).
export function wasEverPairSeeded(row) {
  return Boolean(row?.ai_partner_id || row?.ai_partnership_status);
}

export async function verifySaveFoundation() {
  const [{ athletes, byKey, retiredIds }, teams] = await Promise.all([
    loadRealAthleteIdentity(),
    safeList('TeamRanking', '-ranking_points', 500),
  ]);
  const registryAthletes = getRealAthleteRegistry();
  const isKnown = (botId) => byKey.has(String(botId)) || retiredIds.has(String(botId));
  const missingRealAthletes = registryAthletes.filter((a) => !isKnown(a.bot_id)).map((a) => a.bot_id);
  const confirmedPairs = getConfirmedRealPairs();
  const unseededConfirmedPairs = confirmedPairs.filter((pair) => {
    if (retiredIds.has(String(pair.a)) || retiredIds.has(String(pair.b))) return false;
    const rowA = byKey.get(String(pair.a));
    const rowB = byKey.get(String(pair.b));
    if (!rowA || !rowB) return true;
    // Semeadura interrompida (o caso que esta checagem existe para pegar)
    // deixa os DOIS membros sem pareamento. Se um deles já evoluiu (tem
    // histórico de parceria), a rotina de semeadura nunca vai — corretamente
    // — re-parear o par; tratá-lo como "não semeado" deixaria o reparo
    // rodando todo dia sem efeito.
    return !wasEverPairSeeded(rowA) && !wasEverPairSeeded(rowB);
  });
  const confirmedPairsSeeded = unseededConfirmedPairs.length === 0;
  return {
    ok: missingRealAthletes.length === 0 && confirmedPairsSeeded,
    athletes: athletes.length,
    teams: teams.length,
    confirmedPairsSeeded,
    missingRealAthletes,
    unseededConfirmedPairs: unseededConfirmedPairs.map((pair) => `${pair.a}+${pair.b}`),
    version: SAVE_FOUNDATION_VERSION,
  };
}
