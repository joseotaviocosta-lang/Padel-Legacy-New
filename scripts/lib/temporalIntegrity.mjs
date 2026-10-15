// Playthrough 5.18-G, Partes A/R — REGRA METODOLÓGICA E RESOLUÇÃO TEMPORAL.
//
// REGRA (Parte A), válida para todo teste desta fase e das seguintes:
//
//   Nenhum fato histórico pode ser reconstruído a partir de estado final.
//
// O caso concreto que originou a regra: a 5.18-E montou o índice de "quem
// jogou" traduzindo `draw_pair_ids` de 2026 pelas linhas de Partnership lidas
// ao fim de 2028. Parcerias se dissolvem e se reformam, e um sorteio de 2026
// lido pela linha de 2029 é creditado à dupla ERRADA. Medido na 5.18-F: 6 de
// 20 duplas do cohort apareciam com 0-1 semanas jogadas quando de fato
// jogaram 7-29, produzindo "6 lacunas extremas de 30-34 semanas" que não
// existiam. Numa run de 1 temporada o erro não aparece (ainda não houve
// rotatividade), e foi por isso que passou despercebido.
//
// Fontes ADMITIDAS para um fato datado em D:
//   - draw_pair_ids / draw_ranking_snapshot (gravados no próprio sorteio);
//   - Partnership válida EM D (snapshot daquela semana);
//   - candidate pool do instante;
//   - captura do observador de admissão (drawAdmissionObserver).
//
// Fonte PROIBIDA: qualquer entidade lida depois, usada para inferir a quem
// pertencia um id no passado.
//
// Este módulo existe para que a resolução histórica tenha UMA implementação
// só (Parte R: "não duplicar cinco formas diferentes de resolver Partnership
// histórica").

export const TEMPORAL_RULE = Object.freeze({
  id: 'no-final-state-reconstruction',
  statement: 'Nenhum fato histórico pode ser reconstruído a partir de estado final.',
  allowedSources: Object.freeze([
    'draw_pair_ids',
    'draw_ranking_snapshot',
    'partnership-snapshot-da-data',
    'candidate-pool-do-instante',
    'draw-admission-observer',
  ]),
  forbiddenSources: Object.freeze([
    'partnership-lida-no-fim-da-simulacao',
    'teamranking-lido-no-fim-da-simulacao',
  ]),
});

/**
 * Resolve os membros de um id de dupla usando APENAS o mapa de Partnership
 * válido na data do fato. `partnershipByIdAtDate` tem de ser o snapshot
 * daquela semana — passar o mapa final é exatamente o erro que a regra proíbe.
 */
export function resolvePairMembersAt(pairId, partnershipByIdAtDate) {
  const raw = String(pairId);
  if (raw.startsWith('profile-pair:')) {
    const ids = raw.slice('profile-pair:'.length).split(':').filter(Boolean);
    return ids.length === 2 ? ids : null;
  }
  const row = partnershipByIdAtDate?.get(raw);
  if (!row) return null;
  const ids = [row.athlete_a_id, row.athlete_b_id].filter(Boolean);
  return ids.length === 2 ? ids : null;
}

/**
 * Chave canônica de dupla. ATENÇÃO: ids de atleta CONTÊM underscore
 * (`real_arturo_coello`), então a chave NUNCA pode ser desmontada por
 * split('_') — os dois ids andam junto com ela.
 */
export const pairKey = (a, b) => [a, b].sort().join('_');

export const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const weekOf = (date) => Math.floor(new Date(`${String(date).slice(0, 10)}T00:00:00Z`).getTime() / 604800000);

/**
 * Constrói, para UMA semana, o conjunto de chaves de dupla que competem —
 * resolvendo os ids com o mapa de Partnership DAQUELA semana.
 */
export function playedKeysForWeek({ tournaments, week, partnershipByIdAtDate }) {
  const played = new Set();
  for (const t of tournaments) {
    if (!Array.isArray(t.draw_pair_ids) || !t.draw_pair_ids.length) continue;
    const s = weekOf(t.start_date);
    const e = weekOf(t.end_date || t.start_date);
    if (week < s || week > e) continue;
    for (const pid of t.draw_pair_ids) {
      const m = resolvePairMembersAt(pid, partnershipByIdAtDate);
      if (m) played.add(pairKey(m[0], m[1]));
    }
  }
  return played;
}

/**
 * Lacunas de inatividade sobre linhas semanais já resolvidas temporalmente.
 * `mutual` delimita a existência da dupla; `played` interrompe a contagem.
 * Estar ou não no pool canônico NÃO interrompe — uma dupla recíproca fora do
 * pool continua sendo uma dupla que não compete.
 */
export function activeWindowGaps(rows) {
  const gaps = [];
  let cur = null;
  const flush = () => { if (cur && cur.length) gaps.push(cur); cur = null; };
  for (const r of rows) {
    if (r.played || !r.mutual) { flush(); continue; }
    if (!cur) cur = { start: r.date, end: r.date, length: 0, weeks: [] };
    cur.end = r.date;
    cur.length += 1;
    cur.weeks.push(r);
  }
  flush();
  return gaps;
}
