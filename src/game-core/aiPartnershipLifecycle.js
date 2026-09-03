import { localGame } from '@/api/localGameClient.js';
import { evaluatePartnerCompatibility } from '@/players/teamCompatibility.js';
import { careerDaysBetween, isAthleteRetired, partnershipRecordId, seededChance, seededInteger } from './livingCircuitRules.js';
import { fnv1aHash } from '@/lib/hashUtils.js';
import { WORLD_RANKING_TARGET } from '@/lib/rankingPopulation.js';

// Fase 2E.2: 500 excluía metade da população de 1000 — e de forma
// PERMANENTE, não só truncada: quem cai fora do corte de ranking_position
// nunca mais é buscado por este `list()`, então nunca mais tem
// ranking_position recalculado por ninguém, e fica excluído para sempre
// (confirmado: processWorldCircuit também lê e escreve ranking_position
// pelo MESMO corte — acompanhar `POPULATION_LIST_CAP` em circuitLifecycle.js).
// O teto agora cobre a população inteira com folga; ninguém fica de fora.
const POPULATION_LIST_CAP = WORLD_RANKING_TARGET + 100;

const entities = /** @type {any} */ (localGame.entities);

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, safeNumber(value)));
}

function hash(text) {
  return fnv1aHash(String(text || ''));
}

function integer(seed, min, max) {
  return min + (hash(seed) % Math.max(1, max - min + 1));
}

function monthKey(date) {
  return String(date || '').slice(0, 7);
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function pairKeyOf(a, b) {
  return [String(a), String(b)].sort().join(':');
}

async function listWorldPartnerships() {
  const rows = (await entities.Partnership.list('-started_career_date', 2500).catch(() => [])) || [];
  return rows.filter((row) => row.partnership_type === 'npc' || row.scope === 'world');
}

async function ensureCanonicalPartnerships(athletes, currentDate, existing) {
  const byPair = new Map(existing.map((row) => [pairKeyOf(row.athlete_a_id || row.participant_a_id, row.athlete_b_id || row.participant_b_id), row]));
  const byId = new Map(athletes.map((athlete) => [athlete.id, athlete]));
  const operations = [];
  const processed = new Set();
  for (const athlete of athletes) {
    const partnerId = aiPartnerId(athlete);
    if (!partnerId || !byId.has(partnerId)) continue;
    const pairKey = pairKeyOf(athlete.id, partnerId);
    if (processed.has(pairKey) || byPair.has(pairKey)) continue;
    processed.add(pairKey);
    const partner = byId.get(partnerId);
    const startDate = athlete.ai_partnership_start_date || partner.ai_partnership_start_date || currentDate;
    const id = partnershipRecordId(athlete.id, partner.id, startDate);
    operations.push({ type: 'upsert', entityName: 'Partnership', id, data: {
      partnership_type: 'npc', scope: 'world', athlete_a_id: athlete.id, athlete_b_id: partner.id,
      athlete_ids: [athlete.id, partner.id], athlete_a_name: athlete.name, athlete_b_name: partner.name,
      partner_name: partner.name, started_career_date: startDate, scheduled_end_date: addDays(startDate, 240),
      contract_end_date: addDays(startDate, 240), contract_status: 'ativo', status: 'ativa',
      chemistry: clamp(athlete.ai_partnership_chemistry ?? partner.ai_partnership_chemistry ?? 60, 0, 100),
      origin: 'legacy-ai-partnership-migration', history: [{ date: startDate, event: 'formed', reason: 'legacy_import' }],
      schema_version: 2,
    } });
  }
  if (operations.length) await localGame.batch(operations);
  return listWorldPartnerships();
}

function athleteOverall(athlete) {
  return clamp(athlete?.overall ?? athlete?.overall_rating ?? 50, 1, 99);
}

function isRetired(athlete) {
  return isAthleteRetired(athlete);
}

function isInjured(athlete, date) {
  return Boolean(
    athlete?.current_injury
    || (athlete?.injured_until && athlete.injured_until >= date)
    || String(athlete?.market_status || '').toLowerCase() === 'lesionado'
  );
}

function hasHumanContract(athlete) {
  return Boolean(athlete?.current_partner_profile_id || athlete?.contracted_to_profile_id);
}

function aiPartnerId(athlete) {
  return athlete?.ai_partner_id || athlete?.partner_athlete_id || null;
}

function compatibility(a, b) {
  const rankingGap = Math.abs(safeNumber(a?.ranking_position, 500) - safeNumber(b?.ranking_position, 500));
  const tacticalScore = evaluatePartnerCompatibility(a, b).total;
  const rankingScore = clamp(100 - rankingGap / 8, 0, 100);
  const ambitionA = safeNumber(a?.ambition, 50);
  const ambitionB = safeNumber(b?.ambition, 50);
  const personalityScore = clamp(100 - Math.abs(ambitionA - ambitionB) * 2, 0, 100);
  return Math.round(tacticalScore * 0.6 + rankingScore * 0.25 + personalityScore * 0.15);
}

async function createWorldEvent(payload) {
  try {
    const entity = entities?.WorldEvent;
    if (!entity?.create) return null;
    return await entity.create(payload);
  } catch (error) {
    console.warn('[Game Core] Evento de parceria não criado:', error?.message || error);
    return null;
  }
}

function availableAthletes(athletes, date) {
  return athletes.filter((athlete) => (
    athlete?.id
    && !isRetired(athlete)
    && !isInjured(athlete, date)
    && !hasHumanContract(athlete)
    && !aiPartnerId(athlete)
  ));
}

// Fase 2H — "força da preferência" por proximidade de ranking, em config
// pra calibrar sem tocar na lógica abaixo. 0 = neutro (comportamento
// anterior à Fase 2H); quanto maior, mais a seleção despreza pares
// distantes na tabela. Decaimento exponencial, não corte rígido — sempre
// sobra uma cauda pequena de probabilidade pra pareamentos improváveis
// (achado do próprio pedido: "duplas surpresa são material narrativo").
export const RANKING_PROXIMITY_STRENGTH = 0.01;

function rankGapWeight(rankA, rankB) {
  const gap = Math.abs(safeNumber(rankA, 500) - safeNumber(rankB, 500));
  return Math.exp(-gap * RANKING_PROXIMITY_STRENGTH);
}

// Fase 2H (achado da Fase 0.3, item 2): selectPair era cego a ranking na
// escolha do SEGUNDO membro — `compatibility()` já pesava ranking em 25%,
// mas o pico de sinergia tática (60% do peso) podia vencer mesmo com um
// gap gigante de ranking, porque a escolha era sempre o argmax (maior
// score, ponto final). Agora a escolha do segundo é um sorteio PONDERADO
// (não mais "pega o melhor") — cada candidato pesa
// compatibilidade × proximidade-de-ranking, e o sorteio respeita esse
// peso. Isso é o que faz um gap enorme ficar IMPROVÁVEL em vez de só
// "pontuar um pouco menos" — sem nunca zerar a chance por completo.
function selectPair(free, month, pairIndex) {
  if (free.length < 2) return null;
  const ordered = [...free].sort((a, b) => {
    const scoreA = hash(`${month}:${pairIndex}:${a.id}`);
    const scoreB = hash(`${month}:${pairIndex}:${b.id}`);
    return scoreA - scoreB;
  });
  const first = ordered[0];
  const firstRank = safeNumber(first.ranking_position, 500);
  const weighted = ordered.slice(1).map((athlete) => {
    const score = compatibility(first, athlete);
    const weight = Math.max(0.01, score) * rankGapWeight(firstRank, athlete.ranking_position);
    return { athlete, score, weight };
  });
  const totalWeight = weighted.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (!totalWeight) return null;
  let roll = ((hash(`${month}:${pairIndex}:${first.id}:pick-second`) % 1000000) / 1000000) * totalWeight;
  let chosen = weighted[weighted.length - 1];
  for (const candidate of weighted) {
    if (roll < candidate.weight) { chosen = candidate; break; }
    roll -= candidate.weight;
  }
  return chosen ? { first, second: chosen.athlete, compatibility: chosen.score } : null;
}

async function dissolvePartnerships(athletes, currentDate, partnerships = []) {
  const month = monthKey(currentDate);
  const byId = new Map(athletes.map((athlete) => [athlete.id, athlete]));
  const canonicalByPair = new Map(partnerships.filter((row) => row.status === 'ativa').map((row) => [pairKeyOf(row.athlete_a_id || row.participant_a_id, row.athlete_b_id || row.participant_b_id), row]));
  const processedPairs = new Set();
  const events = [];
  let dissolved = 0;
  // Fase 1.5 (achado #5 da Fase 0.3): todo par ATIVO pagava 2 escritas
  // individuais aqui TODO mês — mesmo quando nada muda além do contador de
  // meses juntos. Cada updateAthlete()/entities.Partnership.update()
  // dispara sua própria transação withCareer (CareerEntityRepository.js),
  // que clona o save inteiro; medido: 24→205 escritas do mês 1 ao 12 numa
  // temporada de 970 bots, a causa raiz do crescimento de custo de ~15×
  // por dia ao longo da temporada. circuitLifecycle.js já resolveu o
  // mesmo padrão pro sistema de ranking (comentário na função ali) —
  // mesma solução aqui: acumula os patches e grava tudo em um único
  // bulkUpdate por entidade ao final do laço, em vez de uma transação por
  // atleta/parceria.
  const athleteUpdates = [];
  const partnershipUpdates = [];

  for (const athlete of athletes) {
    const partnerId = aiPartnerId(athlete);
    if (!partnerId || hasHumanContract(athlete)) continue;
    const pairKey = pairKeyOf(athlete.id, partnerId);
    if (processedPairs.has(pairKey)) continue;
    processedPairs.add(pairKey);

    const partner = byId.get(partnerId);
    if (!partner) {
      athleteUpdates.push({
        id: athlete.id,
        ai_partner_id: null,
        ai_partner_name: null,
        market_status: 'livre',
        ai_partnership_status: 'sem_parceiro',
      });
      continue;
    }

    const canonical = canonicalByPair.get(pairKey);
    const chemistry = clamp(canonical?.chemistry ?? athlete.ai_partnership_chemistry ?? partner.ai_partnership_chemistry ?? 60, 0, 100);
    const startDate = canonical?.started_career_date || athlete.ai_partnership_start_date || currentDate;
    const monthsTogether = Math.max(0, Math.floor(careerDaysBetween(startDate, currentDate) / 30));

    // Fase 2G.1: duplas históricas "confirmadas" (resultado real de
    // torneio, semeadas em saveFoundation.js com ai_partnership_protected)
    // não passam pelo sorteio de renovação/rompimento — só se desfazem por
    // aposentadoria (retirementEnd, abaixo) ou evento narrativo explícito
    // em outro sistema. "Prováveis" NÃO têm essa flag — dissolvem
    // normalmente, de propósito (acertar uma dupla errada trancada seria
    // pior que deixar o mercado decidir, achado do próprio pedido).
    const protectedPair = Boolean(athlete.ai_partnership_protected || partner.ai_partnership_protected);
    if (protectedPair && !isRetired(athlete) && !isRetired(partner)) {
      athleteUpdates.push({ id: athlete.id, ai_partnership_months: monthsTogether + 1 });
      athleteUpdates.push({ id: partner.id, ai_partnership_months: monthsTogether + 1 });
      continue;
    }
    const formAverage = (safeNumber(athlete.form ?? athlete.current_form, 60) + safeNumber(partner.form ?? partner.current_form, 60)) / 2;
    const contractEnd = canonical?.contract_end_date || canonical?.scheduled_end_date || addDays(startDate, 240);
    const contractExpired = currentDate >= contractEnd;
    const renewalScore = clamp(chemistry * 0.5 + formAverage * 0.3 + Math.min(100, monthsTogether * 5) * 0.2, 0, 100);
    const retirementEnd = isRetired(athlete) || isRetired(partner);
    const renews = !retirementEnd && contractExpired && seededChance(`${month}:${pairKey}:renew`, Math.max(18, renewalScore - 8));
    if (renews && canonical?.id) {
      const duration = seededInteger(`${month}:${pairKey}:duration`, 210, 360);
      partnershipUpdates.push({
        id: canonical.id,
        contract_status: 'renovado', contract_end_date: addDays(currentDate, duration), scheduled_end_date: addDays(currentDate, duration),
        renewal_count: safeNumber(canonical.renewal_count, 0) + 1,
        history: [...(canonical.history || []), { date: currentDate, event: 'renewed', duration_days: duration, reason: 'stability' }].slice(-30),
      });
      athleteUpdates.push({ id: athlete.id, ai_partnership_months: monthsTogether + 1 });
      athleteUpdates.push({ id: partner.id, ai_partnership_months: monthsTogether + 1 });
      continue;
    }
    const minimumStabilityReached = careerDaysBetween(startDate, currentDate) >= 120;
    const pressure = clamp((52 - chemistry) + Math.max(0, 45 - formAverage) + Math.max(0, monthsTogether - 30), 0, 42);
    const shouldDissolve = retirementEnd || contractExpired || (minimumStabilityReached && seededChance(`${month}:${pairKey}:breakup`, pressure));
    if (!shouldDissolve) {
      athleteUpdates.push({ id: athlete.id, ai_partnership_months: monthsTogether + 1 });
      athleteUpdates.push({ id: partner.id, ai_partnership_months: monthsTogether + 1 });
      continue;
    }

    const common = {
      ai_partner_id: null,
      ai_partner_name: null,
      ai_partnership_status: 'encerrada',
      ai_partnership_end_date: currentDate,
      market_status: 'livre',
    };
    athleteUpdates.push({ id: athlete.id, ...common, partnership_history_count: safeNumber(athlete.partnership_history_count, 0) + 1 });
    athleteUpdates.push({ id: partner.id, ...common, partnership_history_count: safeNumber(partner.partnership_history_count, 0) + 1 });
    if (canonical?.id) {
      partnershipUpdates.push({
        id: canonical.id,
        status: 'encerrada_parceiro', contract_status: 'encerrado', ended_career_date: currentDate,
        end_reason: retirementEnd ? 'aposentadoria' : contractExpired ? 'fim de contrato sem renovação' : chemistry < 45 ? 'incompatibilidade e resultados ruins' : 'fim natural de ciclo',
        history: [...(canonical.history || []), { date: currentDate, event: 'ended', reason: retirementEnd ? 'retirement' : contractExpired ? 'contract_expired' : 'sporting_cycle' }].slice(-30),
      });
    }
    dissolved += 1;
    const event = await createWorldEvent({
      event_date: currentDate,
      date: currentDate,
      title: `${athlete.name || 'Atleta'} e ${partner.name || 'parceiro'} encerram a dupla`,
      description: `A parceria terminou após ${monthsTogether} mês(es). Entrosamento final: ${chemistry}/100.`,
      category: 'mercado',
      event_type: 'ai_partnership_dissolved',
      importance: athleteOverall(athlete) >= 80 || athleteOverall(partner) >= 80 ? 'alta' : 'media',
      athlete_id: athlete.id,
      related_athlete_id: partner.id,
    });
    if (event) events.push(event);
  }

  if (athleteUpdates.length) await entities.AthleteProfile.bulkUpdate(athleteUpdates);
  if (partnershipUpdates.length) await entities.Partnership.bulkUpdate(partnershipUpdates);

  return { dissolved, events };
}

// Fase 2.6, item 1: 8 fixo por mês, independente do tamanho do pool de
// livres — mesmo padrão de "número escolhido pra população do momento"
// que o teste de invariante da Fase 2.5 já combate (2E). Substituído por
// uma FRAÇÃO do pool de livres: escala sozinho pra cima quando o mundo
// cresce e pra baixo conforme o próprio pool de livres encolhe (o mercado
// se autolimita — não existe outro jeito de "esvaziar" um pool
// proporcional). Calibrado empiricamente contra um alvo de cobertura em
// regime estável (scripts/diag-market-formation-calibration.mjs),
// documentado em reports/real-athletes-audit/FASE-2.6-RELATORIO.md, item 1
// (justificativa revisada na Fase 2.7, item 3).
// Fase 2.7, item 3: era `let` exportado com um setter pra permitir o
// script de calibração testar vários valores sem reiniciar o processo —
// um mutável global em produção, mesmo que nada chamasse o setter fora de
// teste hoje, era um acidente esperando acontecer (uma chamada indevida
// mudaria o comportamento de TODA carreira ativa, silenciosamente). Trocado
// por injeção de parâmetro: a constante volta a ser `const` de verdade, e
// quem precisa de um valor diferente (só o script de calibração) passa
// via `options.formationFraction`, sem tocar em estado de módulo — a
// classe inteira de "mutação acidental em produção" deixa de existir.
export const MARKET_FORMATION_FRACTION = 0.14;

async function formNewPartnerships(athletes, currentDate, formationFraction = MARKET_FORMATION_FRACTION) {
  const month = monthKey(currentDate);
  const free = availableAthletes(athletes, currentDate);
  const events = [];
  let formed = 0;
  const targetPairs = Math.max(0, Math.floor((free.length * formationFraction) / 2));

  // Fase 2.6, item 1.5: com o alvo agora proporcional ao pool (em vez de
  // travado em 8), o número de pares/mês pode subir bastante — cada par
  // pagava 3 transações completas (2 updateAthlete + 1 Partnership.upsert)
  // mais 1 WorldEvent.create, todas individuais. Mesmo padrão já corrigido
  // em dissolvePartnerships/circuitLifecycle.js/generateProspects: acumula
  // os patches e grava tudo em batches únicos ao final do laço. A seleção
  // (quais pares se formam, em que ordem) não muda — `free`/`pair.first`/
  // `pair.second` são mutados em memória de forma síncrona logo após a
  // escolha (linhas abaixo), então `availableAthletes` já enxerga o par
  // como ocupado na iteração seguinte mesmo sem esperar a escrita no banco.
  const athleteUpdates = [];
  const partnershipOps = [];
  const eventPayloads = [];

  for (let index = 0; index < targetPairs; index += 1) {
    const remaining = availableAthletes(free, currentDate);
    const pair = selectPair(remaining, month, index);
    if (!pair) break;
    if (pair.compatibility < 48 && integer(`${month}:${index}:weak-pair`, 0, 99) > 25) break;

    const chemistry = clamp(42 + Math.round(pair.compatibility * 0.45), 45, 88);
    const duration = seededInteger(`${month}:${pair.first.id}:${pair.second.id}:contract`, 210, 360);
    const common = {
      ai_partnership_status: 'ativa',
      ai_partnership_start_date: currentDate,
      ai_partnership_months: 0,
      ai_partnership_chemistry: chemistry,
      market_status: 'contratado',
      last_updated_date: currentDate,
    };
    athleteUpdates.push({ id: pair.first.id, ...common, ai_partner_id: pair.second.id, ai_partner_name: pair.second.name });
    athleteUpdates.push({ id: pair.second.id, ...common, ai_partner_id: pair.first.id, ai_partner_name: pair.first.name });

    const partnershipId = partnershipRecordId(pair.first.id, pair.second.id, currentDate);
    partnershipOps.push({ type: 'upsert', entityName: 'Partnership', id: partnershipId, data: {
      partnership_type: 'npc', scope: 'world', athlete_a_id: pair.first.id, athlete_b_id: pair.second.id,
      athlete_ids: [pair.first.id, pair.second.id], athlete_a_name: pair.first.name, athlete_b_name: pair.second.name,
      partner_name: pair.second.name, started_career_date: currentDate, scheduled_end_date: addDays(currentDate, duration),
      contract_end_date: addDays(currentDate, duration), negotiated_duration_days: duration, contract_status: 'ativo',
      status: 'ativa', chemistry, compatibility_score: pair.compatibility, origin: 'world-partner-market',
      history: [{ date: currentDate, event: 'formed', reason: 'market_match', compatibility: pair.compatibility }], schema_version: 2,
    } });

    pair.first.ai_partner_id = pair.second.id;
    pair.second.ai_partner_id = pair.first.id;
    formed += 1;
    eventPayloads.push({
      event_date: currentDate,
      date: currentDate,
      title: `Nova dupla: ${pair.first.name || 'Atleta'} e ${pair.second.name || 'Atleta'}`,
      description: `A dupla foi formada com compatibilidade estimada em ${pair.compatibility}/100 e entrosamento inicial ${chemistry}/100.`,
      category: 'mercado',
      event_type: 'ai_partnership_formed',
      importance: athleteOverall(pair.first) >= 82 || athleteOverall(pair.second) >= 82 ? 'alta' : 'media',
      athlete_id: pair.first.id,
      related_athlete_id: pair.second.id,
    });
  }

  if (athleteUpdates.length) await entities.AthleteProfile.bulkUpdate(athleteUpdates);
  if (partnershipOps.length) await localGame.batch(partnershipOps);
  if (eventPayloads.length) {
    try {
      events.push(...await entities.WorldEvent.bulkCreate(eventPayloads));
    } catch (error) {
      console.warn('[Game Core] Evento de parceria não criado:', error?.message || error);
    }
  }

  return { formed, events };
}

/**
 * Atualiza as duplas controladas pela IA uma vez a cada mudança de mês.
 * Não interfere no atleta contratado pelo jogador humano.
 *
 * `options.formationFraction` (Fase 2.7, item 3): só pra
 * scripts/diag-market-formation-calibration.mjs testar outros valores sem
 * mexer no módulo — em produção, nunca é passado, e `formNewPartnerships`
 * usa o `MARKET_FORMATION_FRACTION` padrão.
 */
export async function processAiPartnershipMarket(profile, previousDate, currentDate, options = {}) {
  const previousMonth = monthKey(previousDate);
  const currentMonth = monthKey(currentDate);
  if (!currentMonth || previousMonth === currentMonth) {
    return { skipped: true, month: currentMonth, formed: 0, dissolved: 0, events: [] };
  }

  if (profile?.last_ai_partnership_month === currentMonth) {
    return { skipped: true, month: currentMonth, formed: 0, dissolved: 0, events: [] };
  }

  const athletes = (await entities.AthleteProfile.list('ranking_position', POPULATION_LIST_CAP)) || [];
  const worldPartnerships = await ensureCanonicalPartnerships(athletes, currentDate, await listWorldPartnerships());
  const dissolution = await dissolvePartnerships(athletes, currentDate, worldPartnerships);
  const refreshed = (await entities.AthleteProfile.list('ranking_position', POPULATION_LIST_CAP)) || athletes;
  const formation = await formNewPartnerships(refreshed, currentDate, options.formationFraction);

  let updatedProfile = profile;
  const summary = {
    month: currentMonth,
    formed: formation.formed,
    dissolved: dissolution.dissolved,
    totalEvents: formation.events.length + dissolution.events.length,
  };

  if (profile?.id) {
    updatedProfile = await entities.PlayerProfile.update(profile.id, {
      last_ai_partnership_month: currentMonth,
      last_ai_partnership_summary: summary,
    });
  }

  return {
    profile: updatedProfile,
    skipped: false,
    ...summary,
    events: [...dissolution.events, ...formation.events],
  };
}

export async function getAiPartnershipSnapshot(profile) {
  const athletes = (await entities.AthleteProfile.list('ranking_position', POPULATION_LIST_CAP)) || [];
  const activePairs = new Set();
  let freeAgents = 0;
  for (const athlete of athletes) {
    const partnerId = aiPartnerId(athlete);
    if (partnerId) activePairs.add([athlete.id, partnerId].sort().join(':'));
    else if (!isRetired(athlete) && !hasHumanContract(athlete)) freeAgents += 1;
  }
  return {
    activeAiPartnerships: activePairs.size,
    freeAgents,
    lastProcessedMonth: profile?.last_ai_partnership_month || null,
    lastSummary: profile?.last_ai_partnership_summary || null,
  };
}
