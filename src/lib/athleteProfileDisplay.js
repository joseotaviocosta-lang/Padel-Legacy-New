// Fase 5.32-C — Diretório e Perfis de Atletas: helpers PUROS de apresentação.
//
// Nada aqui lê storage, calcula pontos, posição, OVR ou resultado. Cada
// função recebe o que a autoridade já entregou e decide o que é exibível,
// distinguindo três estados que a tela antiga confundia:
//   - valor real (inclusive ZERO de verdade);
//   - "não registrado" — o campo não existe no save (ex.: atletas reais de
//     uma carreira nova ainda não têm contadores de carreira);
//   - "indisponível" — a autoridade não respondeu.
//
// Autoridades:
//   - posição Mundial atual: buildWorldRankingSnapshot (a MESMA do Ranking
//     5.32-A; nunca `ranking_position` gravado pelo circuito, que diverge);
//   - Race: snapshot.entries[].racePoints, mesma ordenação da escada da Race;
//   - parceiro atual: `ai_partner_id` mútuo + ninguém aposentado (fonte do
//     motor de IA, como em Mundo 5.32-B); parceiro-jogador pela Partnership
//     ativa do jogador;
//   - histórico de parcerias: Partnership + PartnershipLegacy, por ids;
//   - resultados: AthleteRankingResult (janela do ranking) + recent_results
//     (parceiro de cada torneio, por id);
//   - aposentadoria: flags do atleta + AthleteCareerLegacy.
import { isAthleteRetired } from '../game-core/livingCircuitRules.js';
import { normalizeCourtSide } from '../players/athleteSchema.js';
import { normalizeSearchText, resolveStandingRank } from './rankingDisplay.js';

export const isRetiredAthlete = (athlete) => Boolean(athlete) && isAthleteRetired(athlete);

// ── Posições (Mundial / Race) pela autoridade do Ranking ────────────────
/**
 * Mapas id → posição a partir do snapshot mundial. Mundial: posição do
 * snapshot, só com pontos (resolveStandingRank) e sem o jogador "sem
 * ranking". Race: só quem pontuou, race desc → mundial desc → id (a mesma
 * ordem da escada da Race do Ranking).
 */
export function buildStandingIndex(snapshot) {
  const world = new Map();
  const race = new Map();
  if (!snapshot?.entries) return { world, race, available: false };
  for (const entry of snapshot.entries) {
    if (entry.isPlayer && snapshot.unranked) continue;
    const rank = resolveStandingRank({ rank: entry.rank, points: entry.points });
    if (rank) world.set(entry.id, { rank, points: Math.max(0, Number(entry.points) || 0) });
  }
  [...snapshot.entries]
    .filter((entry) => Number(entry.racePoints) > 0)
    .sort((a, b) => b.racePoints - a.racePoints || b.points - a.points || String(a.id).localeCompare(String(b.id)))
    .forEach((entry, index) => race.set(entry.id, { rank: index + 1, points: Math.max(0, Number(entry.racePoints) || 0) }));
  return { world, race, available: true };
}

/** Posição exibível de um atleta (null = sem posição — nunca o campo gravado). */
export function standingOf(index, athleteId) {
  if (!index?.available) return { world: null, race: null, available: false };
  return { world: index.world.get(athleteId) || null, race: index.race.get(athleteId) || null, available: true };
}

// ── Identidade ───────────────────────────────────────────────────────────
const SIDE_LABEL = { right: 'Direita', left: 'Esquerda', flex: 'Ambos os lados' };
export function sideLabel(athlete) {
  const raw = athlete?.preferred_side || athlete?.court_side || null;
  return raw ? SIDE_LABEL[normalizeCourtSide(raw)] : null;
}

export function ageOf(athlete) {
  const age = Number(athlete?.age);
  return Number.isFinite(age) && age > 0 ? Math.trunc(age) : null;
}

export function overallOf(athlete) {
  const value = Number(athlete?.overall_rating ?? athlete?.overall);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

const STYLE_LABEL = { equilibrado: 'Equilibrado' };
export function styleLabel(athlete) {
  const raw = athlete?.play_style || null;
  if (!raw) return null;
  return STYLE_LABEL[raw] || raw;
}

/** Busca sem acento em nome e país (a mesma normalização do Ranking). */
export function matchesAthleteSearch(athlete, query) {
  const q = normalizeSearchText(query);
  if (!q) return true;
  return normalizeSearchText(`${athlete?.name || ''} ${athlete?.country || ''}`).includes(q);
}

// ── Valores de carreira (zero ≠ não registrado) ──────────────────────────
/** Número do save: valor real (inclusive 0) ou null quando o campo não existe. */
export function recordedNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resumo de carreira. Prioriza o próprio atleta; para aposentado sem os
 * contadores, cai no AthleteCareerLegacy gravado na aposentadoria.
 * Cada item: { key, label, value (número|null), note }.
 */
export function buildCareerSummary(athlete, legacy = null) {
  const pick = (field, legacyField = field) => {
    const own = recordedNumber(athlete?.[field]);
    if (own !== null) return own;
    return legacy ? recordedNumber(legacy[legacyField]) : null;
  };
  const wins = pick('career_wins');
  const losses = pick('career_losses');
  return [
    { key: 'titles', label: 'Títulos', value: pick('career_titles') },
    { key: 'tournaments', label: 'Torneios', value: recordedNumber(athlete?.tournaments_played) },
    { key: 'wins', label: 'Vitórias', value: wins },
    { key: 'losses', label: 'Derrotas', value: losses },
  ];
}

const TIER_ORDER = ['Legacy Finals', 'Crown', 'Elite', 'Masters', 'Circuit Finals', 'Platinum', 'Gold', 'Silver', 'Bronze'];
/** Títulos por tier, do maior para o menor (só tiers com título). */
export function titlesByTier(athlete, legacy = null) {
  const source = athlete?.career_titles_by_tier || legacy?.career_titles_by_tier || null;
  if (!source || typeof source !== 'object') return [];
  return Object.entries(source)
    .map(([tier, count]) => ({ tier, count: Number(count) || 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => (TIER_ORDER.indexOf(a.tier) + 1 || 99) - (TIER_ORDER.indexOf(b.tier) + 1 || 99));
}

/**
 * Melhor posição: o registro do circuito (best_ranking_position) é
 * histórico. Se a posição ATUAL (snapshot) for melhor que o registro, a
 * atual é mostrada como tal — nunca uma posição antiga apresentada como atual.
 */
export function bestRankingOf(athlete, currentWorldRank = null, legacy = null) {
  const recorded = recordedNumber(athlete?.best_ranking_position) ?? (legacy ? recordedNumber(legacy.best_ranking_position) : null);
  const best = recorded !== null && recorded > 0 ? recorded : null;
  if (currentWorldRank && (!best || currentWorldRank < best)) return { rank: currentWorldRank, source: 'atual' };
  return best ? { rank: best, source: 'registro' } : null;
}

// ── Parceiro atual ───────────────────────────────────────────────────────
const aiPartnerOf = (athlete) => athlete?.ai_partner_id || athlete?.partner_athlete_id || null;

/**
 * Parceiro atual de um atleta.
 *   status 'current'  → { partner: { id, name, isPlayer } }
 *   status 'retired'  → o próprio atleta está aposentado (sem parceiro atual)
 *   status 'none'     → livre (o motor não registra parceiro)
 *   status 'unknown'  → há um parceiro apontado, mas não foi possível confirmar
 * `playerPartnership`: Partnership ativa do jogador com este atleta (ou null);
 * `partnerAthlete`: o registro do atleta apontado por ai_partner_id (ou null).
 */
export function resolveCurrentPartner({ athlete, partnerAthlete = null, playerPartnership = null, player = null } = {}) {
  if (!athlete) return { status: 'unknown', partner: null };
  if (isRetiredAthlete(athlete)) return { status: 'retired', partner: null };
  if (playerPartnership && player?.id) {
    return { status: 'current', partner: { id: player.id, name: player.sport_name || player.name || 'Você', isPlayer: true } };
  }
  const partnerId = aiPartnerOf(athlete);
  if (!partnerId) return { status: 'none', partner: null };
  if (!partnerAthlete || partnerAthlete.id !== partnerId) return { status: 'unknown', partner: null };
  if (isRetiredAthlete(partnerAthlete)) return { status: 'none', partner: null };
  if (aiPartnerOf(partnerAthlete) !== athlete.id) return { status: 'unknown', partner: null };
  return { status: 'current', partner: { id: partnerAthlete.id, name: partnerAthlete.name || athlete.ai_partner_name || 'Parceiro', isPlayer: false } };
}

// ── Histórico de parcerias ───────────────────────────────────────────────
function partnershipIds(row) {
  if (Array.isArray(row?.athlete_ids) && row.athlete_ids.length === 2) return row.athlete_ids;
  const a = row?.athlete_a_id || row?.profile_id || null;
  const b = row?.athlete_b_id || row?.partner_bot_id || null;
  return a && b ? [a, b] : [];
}

// O motor grava o motivo já em texto ("fim de contrato sem renovação",
// "aposentadoria", "fim natural de ciclo"…): exibido como está.
const endReasonText = (value) => (value ? String(value).trim().replace(/^./, (c) => c.toLowerCase()) : null);

/**
 * Parcerias do atleta, por ids (nunca por nome). Linhas vivas de
 * Partnership e resumos permanentes de PartnershipLegacy (dedupe pelo id
 * original). O parceiro atual (resolveCurrentPartner) marca a linha atual;
 * se a parceria atual não tem registro formal (duplas semeadas), ela entra
 * como "Atual" sem data de início — nada é fabricado.
 */
export function buildPartnershipHistory(athleteId, { partnerships = [], legacies = [], current = null, nameOf = () => null } = {}) {
  const rows = new Map();
  const add = (key, row) => { if (!rows.has(key)) rows.set(key, row); };
  for (const p of partnerships || []) {
    const ids = partnershipIds(p);
    if (!ids.includes(athleteId)) continue;
    const partnerId = ids[0] === athleteId ? ids[1] : ids[0];
    const partnerName = (p.athlete_a_id === partnerId ? p.athlete_a_name : p.athlete_b_id === partnerId ? p.athlete_b_name : null)
      || (p.partner_bot_id === athleteId ? null : p.partner_name) || nameOf(partnerId) || 'Parceiro';
    add(p.id, {
      id: p.id, partnerId, partnerName,
      start: p.started_career_date || null,
      end: p.ended_career_date || null,
      ended: p.status !== 'ativa' || Boolean(p.ended_career_date),
      endReason: endReasonText(p.end_reason),
      titles: null, matches: null,
    });
  }
  for (const l of legacies || []) {
    const ids = [l.athlete_a_id, l.athlete_b_id];
    if (!ids.includes(athleteId)) continue;
    const partnerId = ids[0] === athleteId ? ids[1] : ids[0];
    const key = l.original_partnership_id || l.id;
    const existing = rows.get(key);
    const legacyRow = {
      id: key, partnerId,
      partnerName: (l.athlete_a_id === partnerId ? l.athlete_a_name : l.athlete_b_name) || l.partner_name || nameOf(partnerId) || 'Parceiro',
      start: l.started_career_date || null, end: l.ended_career_date || null, ended: true,
      endReason: endReasonText(l.end_reason),
      titles: recordedNumber(l.shared_titles), matches: recordedNumber(l.shared_matches),
    };
    rows.set(key, existing ? { ...existing, ...Object.fromEntries(Object.entries(legacyRow).filter(([, v]) => v !== null)), ended: existing.ended || legacyRow.ended } : legacyRow);
  }
  const list = [...rows.values()];
  // Atual = o parceiro confirmado agora; uma linha "ativa" de outro parceiro
  // não confirmada pelo motor não é chamada de atual.
  for (const row of list) row.current = Boolean(current?.partner && row.partnerId === current.partner.id && !row.end);
  if (current?.partner && !list.some((row) => row.current)) {
    list.push({ id: `current:${current.partner.id}`, partnerId: current.partner.id, partnerName: current.partner.name, start: null, end: null, ended: false, current: true, endReason: null, titles: null, matches: null, unregistered: true });
  }
  return list.sort((a, b) => Number(b.current) - Number(a.current) || String(b.start || '').localeCompare(String(a.start || '')));
}

// ── Resultados ───────────────────────────────────────────────────────────
// Valores reais de AthleteRankingResult.finish (códigos e textos antigos).
const FINISH = {
  champion: 'Campeão', 'campeão': 'Campeão', campeao: 'Campeão',
  final: 'Final', finalista: 'Final', runner_up: 'Final', finalist: 'Final',
  semifinal: 'Semifinal', semifinalista: 'Semifinal',
  quarterfinal: 'Quartas', 'quartas de final': 'Quartas',
  r16: 'Oitavas', round_of_16: 'Oitavas', r32: '1ª rodada', round_of_32: '1ª rodada',
  entry: 'Estreia', participante: 'Participação',
  qualifying: 'Qualifying', qualifier: 'Qualifying',
  legacy_seed: 'Pontos herdados (início da carreira)',
};
export function finishLabel(finish) {
  return FINISH[String(finish || '').trim().toLowerCase()] || (finish ? String(finish) : 'Participação');
}

/**
 * Resultados do atleta: AthleteRankingResult (a autoridade do ranking, janela
 * recente) com o parceiro de cada torneio vindo de recent_results pelo id do
 * torneio. Sem linha de resultado → nada é reconstruído.
 */
export function buildResultHistory(results = [], recentResults = [], { selfName = null } = {}) {
  const partnerByTournament = new Map();
  // Nome do parceiro = o membro da dupla gravada que não é o próprio atleta.
  const partnerNameOf = (pair) => {
    const names = String(pair || '').split(' & ').map((n) => n.trim()).filter(Boolean);
    const others = selfName ? names.filter((n) => n !== selfName) : names;
    return others.length === 1 ? others[0] : (pair || null);
  };
  for (const r of recentResults || []) if (r?.tournament_id) partnerByTournament.set(r.tournament_id, { id: r.partner_id || null, pair: r.pair_name || null, name: partnerNameOf(r.pair_name) });
  const seen = new Set();
  return [...(results || [])]
    .filter((r) => r && r.tournament_id && !seen.has(`${r.tournament_id}`) && seen.add(`${r.tournament_id}`))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .map((r) => ({
      tournamentId: r.tournament_id,
      name: r.tournament_name || 'Torneio',
      tier: r.tier || null,
      date: r.date || null,
      finish: finishLabel(r.finish),
      won: finishLabel(r.finish) === 'Campeão',
      points: recordedNumber(r.points),
      partner: partnerByTournament.get(r.tournament_id) || null,
    }));
}

/** Resumo por temporada dos resultados carregados (rótulo deixa claro o recorte). */
export function summarizeBySeason(history = []) {
  const bySeason = new Map();
  for (const row of history) {
    const year = String(row.date || '').slice(0, 4) || '—';
    const item = bySeason.get(year) || { year, events: 0, titles: 0, finals: 0 };
    item.events += 1;
    if (row.won) item.titles += 1;
    if (row.finish === 'Final') item.finals += 1;
    bySeason.set(year, item);
  }
  return [...bySeason.values()].sort((a, b) => b.year.localeCompare(a.year));
}

// ── Aposentadoria ────────────────────────────────────────────────────────
export function retirementInfo(athlete, legacy = null) {
  if (!isRetiredAthlete(athlete)) return null;
  return {
    date: athlete?.retirement_date || athlete?.retired_career_date || legacy?.retirement_date || null,
    age: recordedNumber(athlete?.retirement_age) ?? (legacy ? recordedNumber(legacy.retirement_age) : null),
    yearsActive: legacy ? recordedNumber(legacy.years_active) : null,
    mainPartner: legacy?.main_partner_name || null,
  };
}

// ── Diretório ────────────────────────────────────────────────────────────
// Recortes do diretório. As definições continuam as de antes; o que mudou é
// a autoridade de posição (snapshot, sem cair no ranking_position gravado):
//   - top100: posição Mundial atual ≤ 100;
//   - elite: posição Mundial atual ≤ 30 OU OVR ≥ 84 (critério existente);
//   - rising: fase de carreira antes do auge (career_stage prospect/rising
//     ou career_phase "Ascensão") — é a fase pela idade, não desempenho;
//   - veteran: career_stage veteran ou career_phase "Veterano";
//   - retired: aposentados.
export const DIRECTORY_SEGMENTS = [
  { id: 'all', label: 'Todos' },
  { id: 'top100', label: 'Top 100' },
  { id: 'elite', label: 'Elite' },
  { id: 'rising', label: 'Antes do auge' },
  { id: 'veteran', label: 'Veteranos' },
  { id: 'retired', label: 'Aposentados' },
];

export function inSegment(athlete, segment, worldRank = null) {
  const retired = isRetiredAthlete(athlete);
  switch (segment) {
    case 'top100': return !retired && Boolean(worldRank) && worldRank <= 100;
    case 'elite': return !retired && ((Boolean(worldRank) && worldRank <= 30) || (overallOf(athlete) || 0) >= 84);
    case 'rising': return !retired && (['prospect', 'rising'].includes(athlete?.career_stage) || athlete?.career_phase === 'Ascensão');
    case 'veteran': return !retired && (athlete?.career_stage === 'veteran' || athlete?.career_phase === 'Veterano');
    case 'retired': return retired;
    default: return true;
  }
}

/** Ordenação: ranking atual (sem posição vai ao fim, por OVR), OVR, forma, decisões. */
export function compareAthletes(sortBy, rankOf) {
  const ovr = (a) => overallOf(a) || 0;
  return (a, b) => {
    if (sortBy === 'form') return Number(b.form ?? b.current_form ?? 0) - Number(a.form ?? a.current_form ?? 0) || ovr(b) - ovr(a);
    if (sortBy === 'clutch') return Number(b.behavior_axes?.clutch ?? 0) - Number(a.behavior_axes?.clutch ?? 0) || ovr(b) - ovr(a);
    if (sortBy === 'overall') return ovr(b) - ovr(a) || (rankOf(a.id) || Infinity) - (rankOf(b.id) || Infinity);
    const ra = rankOf(a.id) || Infinity;
    const rb = rankOf(b.id) || Infinity;
    return ra - rb || ovr(b) - ovr(a) || String(a.name || '').localeCompare(String(b.name || ''));
  };
}

/** Estilos realmente presentes nos dados (o filtro antigo esquecia "Controle"). */
export function styleOptions(athletes = []) {
  return [...new Set((athletes || []).map(styleLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
