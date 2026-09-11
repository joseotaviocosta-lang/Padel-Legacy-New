import { localGame } from '@/api/localGameClient.js';
import worldSeedMeta from '@/data/worldSeed2025.json';
import { buildSupplementalRankingPopulation, WORLD_RANKING_TARGET, TEAM_RANKING_TARGET } from '@/lib/rankingPopulation.js';
import { getRealAthleteRegistry, getConfirmedRealPairs, getProbableRealPairs } from '@/players/realAthleteRegistry.js';
import { teamKey } from '@/lib/teamRanking.js';

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

export async function ensureWorldSeed2025({ force = false } = {}) {
  const [athletes, teams, profiles] = await Promise.all([
    safeList('AthleteProfile', '-world_ranking_points', 500),
    safeList('TeamRanking', '-ranking_points', 500),
    safeList('PlayerProfile', '-created_date', 20),
  ]);

  await createCriticalBackup();

  // Fase 2A/2B: os atletas reais vêm de um único registro canônico
  // (src/players/realAthleteRegistry.js -> src/data/realAthletesRegistry.json,
  // gerado por scripts/build-real-athletes-registry.mjs) — não mais de um
  // array hardcoded aqui. bot_id -> id real (atribuído por makeId() na
  // criação, Fase 0.1) mapeado abaixo pra uso na semeadura de parcerias.
  const registryAthletes = getRealAthleteRegistry();
  const botIdToRealId = new Map();
  const botIdToRow = new Map();
  for (const athlete of registryAthletes) {
    // Fase 2.6, item 3: marca quando este atleta passou a existir NESTA
    // carreira — usado só pra "anos ativos" na linha-resumo de
    // aposentadoria (AthleteCareerLegacy), nunca uma biografia pré-jogo.
    const row = await upsertBy('AthleteProfile', athletes, 'bot_id', athlete.bot_id, { ...athlete, circuit_entry_date: worldSeedMeta.career_start_date });
    if (row?.id) { botIdToRealId.set(athlete.bot_id, row.id); botIdToRow.set(athlete.bot_id, row); }
  }

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
    if (row1.ai_partner_id || row2.ai_partner_id) continue; // já tem parceiro (evoluído em jogo ou seed anterior)
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
    const points = Math.round((Number(row1.world_ranking_points) || 0) + (Number(row2.world_ranking_points) || 0)) / 2;
    teamPairPayloads.push({
      team_key: key, player1_id: id1, player1_name: pair.aName, player1_country: row1.country,
      player2_id: id2, player2_name: pair.bName, player2_country: row2.country,
      ranking_points: Math.round(points), race_points: 0, matches_played: 0, wins: 0, losses: 0, titles: [],
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
    .filter((athlete) => !botIdToRow.get(athlete.bot_id)?.ai_partner_id)
    .sort((a, b) => (Number(a.fip_rank) || 999) - (Number(b.fip_rank) || 999));
  for (let i = 0; i + 1 < unseededReals.length; i += 2) {
    const a = unseededReals[i];
    const b = unseededReals[i + 1];
    const id1 = botIdToRealId.get(a.bot_id);
    const id2 = botIdToRealId.get(b.bot_id);
    const row1 = botIdToRow.get(a.bot_id);
    const row2 = botIdToRow.get(b.bot_id);
    if (!id1 || !id2 || !row1 || !row2 || row1.ai_partner_id || row2.ai_partner_id) continue;
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
    const points = Math.round((Number(row1.world_ranking_points) || 0) + (Number(row2.world_ranking_points) || 0)) / 2;
    teamPairPayloads.push({
      team_key: key, player1_id: id1, player1_name: a.name, player1_country: row1.country,
      player2_id: id2, player2_name: b.name, player2_country: row2.country,
      ranking_points: Math.round(points), race_points: 0, matches_played: 0, wins: 0, losses: 0, titles: [],
      season_id: String(worldSeedMeta.career_start_date || '').slice(0, 4), origin: 'seed-inicial',
    });
    row1.ai_partner_id = id2; row2.ai_partner_id = id1;
  }

  if (athletePairUpdates.length) {
    try { await localGame.entities.AthleteProfile.bulkUpdate(athletePairUpdates); }
    catch (error) { console.warn('[Save Foundation] parcerias pré-existentes', error); }
  }
  for (const team of teamPairPayloads) {
    await upsertBy('TeamRanking', teams, 'team_key', team.team_key, team);
  }

  // Completa o universo competitivo. O registro real traz só o topo; a
  // população suplementar cria profundidade suficiente para uma carreira
  // começar fora do Top 1000 e progredir de forma visível.
  const refreshedAthletes = await safeList('AthleteProfile', '-world_ranking_points', WORLD_RANKING_TARGET + 100);
  const refreshedTeams = await safeList('TeamRanking', '-ranking_points', TEAM_RANKING_TARGET + 100);
  const supplemental = buildSupplementalRankingPopulation(refreshedAthletes, refreshedTeams, worldSeedMeta.career_start_date);
  if (supplemental.athletes.length) {
    try { await localGame.entities.AthleteProfile.bulkCreate(supplemental.athletes); }
    catch (error) { console.warn('[Save Foundation] população de atletas', error); }
  }
  if (supplemental.teams.length) {
    try { await localGame.entities.TeamRanking.bulkCreate(supplemental.teams); }
    catch (error) { console.warn('[Save Foundation] população de duplas', error); }
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

export async function verifySaveFoundation() {
  const [athletes, teams] = await Promise.all([
    safeList('AthleteProfile', '-world_ranking_points', 500),
    safeList('TeamRanking', '-ranking_points', 500),
  ]);
  const registryAthletes = getRealAthleteRegistry();
  const athleteIds = new Set(athletes.map(a => a.bot_id));
  return {
    ok: registryAthletes.every(a => athleteIds.has(a.bot_id)),
    athletes: athletes.length,
    teams: teams.length,
    version: SAVE_FOUNDATION_VERSION,
  };
}
