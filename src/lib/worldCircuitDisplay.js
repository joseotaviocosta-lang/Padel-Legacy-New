// Fase 5.32-B — Mundo / Circuito Mundial: helpers PUROS de apresentação.
//
// Nenhum calcula pontos ou posição. Cada um recebe o que a autoridade já
// entregou e só decide o que é exibível:
//   - individual (Mundial e Race): buildWorldRankingSnapshot — a MESMA
//     escada do Ranking 5.32-A (posição = ordem do snapshot, nunca o
//     `ranking_position` gravado pelo circuito, que diverge em parte da
//     população; ver reports/ui-redesign-532/world/UI_REDESIGN_532_B.md);
//   - duplas: getTeamRankings (ranking_display_position, pontos do período
//     por teamListPoints — LOCAL-7D);
//   - parceria ATUAL: a mesma fonte que o motor de IA usa para saber quem
//     joga com quem (`ai_partner_id` mútuo, aiPartnershipLifecycle — ao
//     desfazer a dupla o motor zera o campo nos dois); a dupla do jogador
//     pela Partnership ativa dele (a mesma regra do Ranking). As linhas de
//     Partnership das IAs NÃO servem sozinhas: a semeadura de uma carreira
//     nova forma as duplas reais só no atleta (a linha canônica nasce
//     depois), e a Coello/Tapia nº 1 apareceria como "encerrada";
//   - torneios: o próprio registro do Tournament (campeões gravados pelo
//     settlement com ids — LOCAL-7E; datas, tier e local do calendário).
import { TOURNAMENT_TIER_CONFIG, getTournamentTierConfig, isOfficialRankedTournament } from './circuitCatalog.js';
import { isSelectableTournament, isTournamentRegistrationOpenOn } from './nextEventAuthority.js';
import { resolveStandingRank, teamListPoints, teamLedgerRecord } from './rankingDisplay.js';
import { isAthleteRetired } from '../game-core/livingCircuitRules.js';

// "Grande evento" = Platinum para cima na escada do circuito (Platinum,
// Circuit Finals, Masters, Elite, Crown, Legacy Finals). Bronze/Silver/Gold
// acontecem toda semana e enchem a tela sem contar história.
export const MAJOR_EVENT_LEVEL = TOURNAMENT_TIER_CONFIG.Platinum.order;
// Um título só é "manchete" enquanto é recente.
export const RECENT_CHAMPION_WINDOW_DAYS = 21;

const DAY_MS = 86400000;
const pairKeyOf = (a, b) => [String(a), String(b)].sort().join('::');

export function daysBetween(fromDate, toDate) {
  const a = Date.parse(`${String(fromDate || '').slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toDate || '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

export function tournamentLevel(tournament) {
  const level = Number(tournament?.circuit_level);
  if (Number.isFinite(level)) return level;
  return tournament?.tier && TOURNAMENT_TIER_CONFIG[tournament.tier] ? TOURNAMENT_TIER_CONFIG[tournament.tier].order : -1;
}

export function tournamentTierLabel(tournament) {
  if (!tournament?.tier) return 'Torneio';
  return getTournamentTierConfig(tournament.tier).shortLabel || tournament.tier;
}

// ── Ranking individual (Mundial) ─────────────────────────────────────────
// Mesma regra do Ranking (deriveIndividualLadders): posição do snapshot, sem
// pontos não há posição, e o jogador sem ranking não ocupa degrau.
export function selectWorldIndividualTop(snapshot, limit = 3) {
  const rows = [];
  for (const entry of snapshot?.entries || []) {
    if (entry.isPlayer && snapshot?.unranked) continue;
    const rank = resolveStandingRank({ rank: entry.rank, points: entry.points });
    if (!rank) continue;
    rows.push({ id: entry.id, name: entry.name, country: entry.country || null, points: Math.max(0, Number(entry.points) || 0), rank, isPlayer: Boolean(entry.isPlayer) });
    if (rows.length >= limit) break;
  }
  return rows;
}

// ── Race individual ──────────────────────────────────────────────────────
// Mesma ordenação da escada da Race no Ranking: só quem pontuou na
// temporada; race desc → mundial desc → id.
export function selectRaceIndividualTop(snapshot, limit = 3) {
  return [...(snapshot?.entries || [])]
    .filter((entry) => Number(entry.racePoints) > 0)
    .sort((a, b) => b.racePoints - a.racePoints || b.points - a.points || String(a.id).localeCompare(String(b.id)))
    .slice(0, limit)
    .map((entry, index) => ({ id: entry.id, name: entry.name, country: entry.country || null, points: Math.max(0, Number(entry.racePoints) || 0), rank: index + 1, isPlayer: Boolean(entry.isPlayer) }));
}

// ── Parcerias atuais ─────────────────────────────────────────────────────
const aiPartnerOf = (athlete) => athlete?.ai_partner_id || athlete?.partner_athlete_id || null;

/**
 * A dupla ainda joga junta? true/false só quando há como saber; null quando
 * a fonte não respondeu ou um membro não foi encontrado (nada é afirmado).
 *   - dupla do jogador: o parceiro da Partnership ativa do jogador
 *     (`playerPartnerId`: string = parceiro atual, null = sem dupla,
 *     undefined = não lido);
 *   - dupla de IA: `ai_partner_id` mútuo e nenhum dos dois aposentado.
 */
export function resolvePairCurrent([idA, idB] = [], { athletesById = null, playerId = null, playerPartnerId = undefined } = {}) {
  if (playerId && (idA === playerId || idB === playerId)) {
    if (playerPartnerId === undefined) return null;
    const other = idA === playerId ? idB : idA;
    return Boolean(playerPartnerId) && other === playerPartnerId;
  }
  if (!athletesById) return null;
  const a = athletesById.get(idA);
  const b = athletesById.get(idB);
  if (!a || !b) return null;
  if (isAthleteRetired(a) || isAthleteRetired(b)) return false;
  return aiPartnerOf(a) === b.id && aiPartnerOf(b) === a.id;
}

/** Ids dos membros das primeiras linhas (para ler só os atletas necessários). */
export function doublesMemberIds(rows, count = 6) {
  return [...new Set((rows || []).slice(0, count).flatMap((row) => [row?.player1_id, row?.player2_id]).filter(Boolean))];
}

// ── Ranking de duplas (Mundial) ──────────────────────────────────────────
// A escada de duplas é por PAR: inclui parcerias que já se desfizeram e
// seguem com pontos na janela. A tela não esconde nem reordena nada — só
// diz se o par ainda joga junto (`current`: true/false/null).
export function selectWorldDoublesTop(rows, pairContext = {}, limit = 3) {
  const { playerId = null } = pairContext;
  const out = [];
  for (const row of rows || []) {
    const points = teamListPoints(row);
    const rank = resolveStandingRank({ rank: row?.ranking_display_position, points });
    if (!rank || !row?.player1_id || !row?.player2_id) continue;
    out.push({
      key: row.team_key || pairKeyOf(row.player1_id, row.player2_id),
      rank,
      points,
      members: [{ id: row.player1_id, name: row.player1_name || 'Atleta' }, { id: row.player2_id, name: row.player2_name || 'Atleta' }],
      current: resolvePairCurrent([row.player1_id, row.player2_id], pairContext),
      isPlayerPair: Boolean(playerId && (row.player1_id === playerId || row.player2_id === playerId)),
      record: teamLedgerRecord(row),
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ── Torneios ─────────────────────────────────────────────────────────────
function endDateOf(tournament) {
  return String(tournament?.end_date || tournament?.start_date || '').slice(0, 10);
}

/**
 * Próximos grandes eventos do circuito (inclui o que está em andamento).
 * Mesmos filtros de "selecionável" da autoridade de próximo evento
 * (isSelectableTournament) — sem eventos cancelados, encerrados ou
 * inalcançáveis; status de inscrição pela mesma janela de Torneios.
 */
export function selectUpcomingMajorEvents(tournaments, careerDate, limit = 3) {
  if (!careerDate) return [];
  return (tournaments || [])
    .filter((t) => isSelectableTournament(t) && isOfficialRankedTournament(t) && tournamentLevel(t) >= MAJOR_EVENT_LEVEL && endDateOf(t) >= careerDate)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)) || tournamentLevel(b) - tournamentLevel(a))
    .slice(0, limit)
    .map((t) => {
      const live = t.start_date <= careerDate && endDateOf(t) >= careerDate;
      const status = live ? 'live' : isTournamentRegistrationOpenOn(t, careerDate) ? 'open' : 'soon';
      return {
        id: t.id,
        name: t.name || 'Torneio',
        tier: tournamentTierLabel(t),
        level: tournamentLevel(t),
        startDate: t.start_date,
        endDate: endDateOf(t),
        location: t.location || [t.city, t.country].filter(Boolean).join(', ') || null,
        status,
        daysUntil: live ? 0 : daysBetween(careerDate, t.start_date),
      };
    });
}

/**
 * Campeões recentes de grandes eventos — só torneio resolvido com os DOIS
 * campeões gravados por id (champion_athlete_ids, LOCAL-7E). Nada é
 * deduzido de notícia ou de nome.
 */
export function selectRecentMajorChampions(tournaments, careerDate, limit = 3, { playerId = null } = {}) {
  if (!careerDate) return [];
  return (tournaments || [])
    .filter((t) => {
      const ids = t?.champion_athlete_ids;
      return Array.isArray(ids) && ids.length === 2 && ids[0] && ids[1]
        && isOfficialRankedTournament(t) && tournamentLevel(t) >= MAJOR_EVENT_LEVEL
        && endDateOf(t) && endDateOf(t) <= careerDate;
    })
    .sort((a, b) => endDateOf(b).localeCompare(endDateOf(a)) || tournamentLevel(b) - tournamentLevel(a))
    .slice(0, limit)
    .map((t) => {
      const names = Array.isArray(t.champion_athlete_names) ? t.champion_athlete_names : [];
      const runnerIds = Array.isArray(t.runner_up_athlete_ids) ? t.runner_up_athlete_ids : [];
      const runnerNames = Array.isArray(t.runner_up_athlete_names) ? t.runner_up_athlete_names : [];
      return {
        id: t.id,
        name: t.name || 'Torneio',
        tier: tournamentTierLabel(t),
        level: tournamentLevel(t),
        date: endDateOf(t),
        daysAgo: daysBetween(endDateOf(t), careerDate),
        location: t.location || [t.city, t.country].filter(Boolean).join(', ') || null,
        champions: t.champion_athlete_ids.map((id, i) => ({ id, name: names[i] || 'Atleta' })),
        runnersUp: runnerIds.length === 2 ? runnerIds.map((id, i) => ({ id, name: runnerNames[i] || 'Atleta' })) : [],
        playerWon: Boolean(playerId && t.champion_athlete_ids.includes(playerId)),
      };
    });
}

/**
 * O destaque do circuito (hero), em ordem de prioridade — só fatos:
 *   1. título de grande evento nos últimos RECENT_CHAMPION_WINDOW_DAYS dias;
 *   2. grande evento em andamento;
 *   3. número 1 do mundo (carreira nova cai aqui: o mundo já tem líder);
 *   4. próximo grande evento;
 *   null → a tela mostra o estado vazio com exploração.
 */
export function selectCircuitHighlight({ champions = [], upcoming = [], leader = null } = {}) {
  const champion = champions.find((c) => c.daysAgo !== null && c.daysAgo <= RECENT_CHAMPION_WINDOW_DAYS);
  if (champion) return { kind: 'champion', champion };
  const live = upcoming.find((e) => e.status === 'live');
  if (live) return { kind: 'live', event: live };
  if (leader) return { kind: 'leader', leader };
  if (upcoming[0]) return { kind: 'next', event: upcoming[0] };
  return null;
}

/**
 * Modelo completo da tela Mundo a partir das leituras das autoridades.
 * `null` em qualquer entrada = autoridade indisponível (a tela diz isso, não
 * apresenta um vazio como se fosse fato).
 */
export function buildWorldCircuitModel({ ranking = null, teams = null, pairAthletes = null, playerPartnerId = undefined, tournaments = null, careerDate = null, playerId = null } = {}) {
  const worldTop = selectWorldIndividualTop(ranking, 3);
  const raceTop = selectRaceIndividualTop(ranking, 3);
  const athletesById = Array.isArray(pairAthletes) ? new Map(pairAthletes.filter((a) => a?.id).map((a) => [a.id, a])) : null;
  const doublesTop = selectWorldDoublesTop(teams || [], { athletesById, playerId, playerPartnerId }, 3);
  const upcoming = selectUpcomingMajorEvents(tournaments || [], careerDate, 3);
  const champions = selectRecentMajorChampions(tournaments || [], careerDate, 3, { playerId });
  return {
    worldTop, raceTop, doublesTop, upcoming, champions,
    highlight: selectCircuitHighlight({ champions, upcoming, leader: worldTop[0] || null }),
    rankingAvailable: Boolean(ranking),
    doublesAvailable: Array.isArray(teams),
    tournamentsAvailable: Array.isArray(tournaments),
  };
}

export function pairLabel(members = []) {
  return members.map((m) => m.name).join(' & ');
}

export function formatPts(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? 'pt' : 'pts'}`;
}

export function untilLabel(days) {
  if (days === null || days === undefined) return null;
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  return `Em ${days} dias`;
}
