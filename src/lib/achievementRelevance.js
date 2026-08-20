// Achievements Polish 12.1 (docs/ACHIEVEMENTS_POLISH_12_1.md).
//
// QA real: para um atleta de 16 anos em início de carreira, "Próximas
// conquistas" mostrava Relação de Confiança (60/100), Auge (16/28),
// Veterano (16/35), Lenda Madura (16/40), Um Mês (10/30) — a regra antiga
// (achievementEngine.js:findNextLockedAchievement / o `nextUp` de
// AchievementsPanel.jsx) ordenava SÓ por `percent` desc. Isso é
// matematicamente correto (idade/tempo avançam de forma linear e previsível,
// então acumulam percentual alto rápido) mas não é o que motiva um jogador:
// metas de partida/torneio ainda em 0% (porque o jogador ainda não jogou
// nenhuma partida oficial) perdiam a corrida de percentual pra conquistas
// que "acontecem sozinhas com o tempo".
//
// Esta função NÃO substitui `findNextLockedAchievement` (que continua
// servindo o card de ranking da Home — mesma fonte, Fase 12 Parte Q) nem
// toca no catálogo/triggers/rewards/engine principal — é uma camada de
// RANKEAMENTO por cima de `evaluateAchievements`, puramente síncrona sobre
// dados já carregados (profile + context), sem nenhuma busca de storage.
import { evaluateAchievements } from './achievementEngine.js';
import { getCareerEconomyStage } from './sportsEconomyV26.js';

// Fase 12: mesma regra de agrupamento que a página já usa — trigger_type
// sozinho já é a "escada" certa, exceto max_attribute (10 atributos
// independentes, cada um sua própria escada).
function ladderKey(achievement) {
  return achievement.attribute_key ? `${achievement.trigger_type}:${achievement.attribute_key}` : achievement.trigger_type;
}

// Parte F/13: quanto o jogador controla essa conquista por decisão própria,
// de 0 (puramente passivo) a 100 (decisão esportiva direta). Não existe
// registro persistido disso no catálogo — é conhecimento de domínio sobre o
// vocabulário fechado de EVALUABLE_TRIGGER_TYPES (Fase 12), então um mapa
// fixo é a forma correta de expressar, não uma heurística de texto.
const TRIGGER_ACTIONABILITY = {
  win_tournament: 95, beat_rank1: 92, win_official_match: 92, play_official_match: 90,
  beat_top10: 90, reach_rank: 88, join_tournament: 85, win_streak: 80,
  all_max_attributes: 75, hire_coach: 68, sign_sponsor: 68, max_attribute: 70,
  complete_training: 65, multi_sponsor: 65, upgrade_facility: 60, reach_coins: 60,
  reach_level: 60, own_legendary: 58, own_mythic: 58, own_exclusive: 58,
  buy_property: 55, make_investment: 55, own_items: 55, all_categories: 55,
  max_coach_affinity: 48, long_coach: 45, recover_injury: 40,
  advance_day: 15, reach_age: 10, create_profile: 5,
};
const DEFAULT_ACTIONABILITY = 50;

// Parte C: conquistas que avançam só com a passagem do tempo, sem nenhuma
// decisão do jogador — no máximo UMA pode aparecer em "Próximas" (Parte 6),
// e só se estiver realisticamente perto (Parte 7 — percentual isolado engana
// aqui: 16/28 anos = 57%, mas faltam 12 anos reais de carreira).
const PASSIVE_TIME_TRIGGERS = new Set(['advance_day', 'reach_age']);

// Decaimento por unidade restante — anos pesam muito mais que dias, porque
// uma temporada de padel dura ~1 ano de jogo mas o threshold é medido em
// idade/dias corridos, não em ações do jogador.
function passiveTimeCloseness(achievement, value) {
  const remaining = Math.max(0, Number(achievement.threshold) - (Number(value) || 0));
  const decayPerUnit = achievement.trigger_type === 'reach_age' ? 15 : 3;
  return Math.max(0, 100 - remaining * decayPerUnit);
}

function buildReason(achievement, row, isPassive) {
  if (isPassive) return 'Marco de longevidade — chega com o tempo, não com uma decisão agora.';
  if (row.percent >= 70) return 'Muito perto de desbloquear.';
  if (['play_official_match', 'win_official_match', 'join_tournament', 'win_tournament', 'reach_rank'].includes(achievement.trigger_type)) {
    return 'Marco esportivo da fase atual da carreira.';
  }
  return 'Meta relevante para o estágio atual da carreira.';
}

/**
 * Estágio de carreira usado só para compor o `reason`/contexto de auditoria
 * desta camada — reaproveita a taxonomia canônica já usada pelo mercado de
 * profissionais (`getCareerEconomyStage`, sportsEconomyV26.js) em vez de
 * inventar uma segunda (Parte 5), só substituindo o rank pela fonte canônica
 * de ranking já buscada pelo `context` (Fase 12 — nunca profile.ranking_position
 * bruto, que pode estar desatualizado).
 */
export function getCareerRelevanceStage(profile, context) {
  const canonicalRank = context?.worldRank?.rank;
  const effectiveProfile = canonicalRank > 0 ? { ...profile, ranking_position: canonicalRank, world_rank: canonicalRank } : profile;
  return getCareerEconomyStage(effectiveProfile);
}

/**
 * "Próximas conquistas" relevantes — combina progresso real, o quanto o
 * jogador controla aquela conquista por decisão própria, e uma penalidade
 * forte por distância temporal real (não percentual) em marcos passivos.
 * Pura: opera só sobre `evaluateAchievements` (síncrono, já em memória) —
 * nenhuma busca de storage, nenhum loop de rede (Parte M).
 *
 * Diversidade (Parte E): no máximo 1 conquista por escada (garantido antes
 * mesmo do ranking, já que só o próximo degrau de cada escada entra na
 * disputa), no máximo 2 por categoria, no máximo 1 puramente passiva
 * (advance_day/reach_age) — nunca as 3 de idade juntas, nunca 10/50/100 da
 * mesma escada juntas.
 */
export function findNextRelevantAchievements(profile, context, { limit = 5 } = {}) {
  const rows = evaluateAchievements(profile, context);
  const candidates = rows.filter((row) => row.evaluable && !row.unlocked);

  // Só o próximo degrau bloqueado de cada escada disputa a lista (Parte 12).
  // Usa `percent` (não o threshold cru) pra decidir qual é "o próximo": a
  // maioria das escadas é crescente (play_official_match 1→10→50, menor
  // threshold = mais fácil/perto), mas reach_rank é invertida (Top 100 é
  // MAIS fácil que Top 10, mesmo com threshold menor) — `percent` já
  // resolve essa inversão dentro de getAchievementProgress, então comparar
  // por ele generaliza certo pras duas direções sem precisar de um caso
  // especial por trigger_type aqui.
  const nextPerLadder = new Map();
  for (const row of candidates) {
    const key = ladderKey(row.achievement);
    const existing = nextPerLadder.get(key);
    if (!existing || row.percent > existing.percent) nextPerLadder.set(key, row);
  }

  const scored = [...nextPerLadder.values()].map((row) => {
    const { achievement, percent, value } = row;
    const isPassive = PASSIVE_TIME_TRIGGERS.has(achievement.trigger_type);
    const progressComponent = isPassive ? passiveTimeCloseness(achievement, value) : percent;
    const actionability = TRIGGER_ACTIONABILITY[achievement.trigger_type] ?? DEFAULT_ACTIONABILITY;
    // Progresso pesa um pouco mais que a "gravidade esportiva" pura — uma
    // conquista quase pronta ainda deve furar a fila mesmo com
    // actionability média (ex.: Relação de Confiança em 90/100).
    const relevanceScore = Math.round((progressComponent * 0.55 + actionability * 0.45) * 100) / 100;
    return {
      achievement, progress: row, relevanceScore, category: achievement.category,
      isPassiveTime: isPassive, ladderKey: ladderKey(achievement),
      reason: buildReason(achievement, row, isPassive),
    };
  });
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const selected = [];
  const perCategoryCount = new Map();
  const usedLadders = new Set();
  let passiveUsed = 0;
  for (const item of scored) {
    if (selected.length >= limit) break;
    if (usedLadders.has(item.ladderKey)) continue; // defesa extra — já é 1-por-escada por construção
    if (item.isPassiveTime && passiveUsed >= 1) continue;
    const catCount = perCategoryCount.get(item.category) || 0;
    if (catCount >= 2) continue;
    selected.push(item);
    usedLadders.add(item.ladderKey);
    perCategoryCount.set(item.category, catCount + 1);
    if (item.isPassiveTime) passiveUsed += 1;
  }

  return selected;
}
