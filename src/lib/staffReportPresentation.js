// Playthrough 5.19, Partes A/B/C — CONTRATO DE APRESENTAÇÃO DA COMISSÃO.
//
// O que o playtest mostrou na tela:
//   "Plano proposto: [object Object]"
//   "{"priority":"medium","title":"Monte uma sinergia","body":"..."}"
//
// Duas causas somadas, uma no produtor e outra no consumidor:
//
// 1. PRODUTOR (staffLifecycle.js) gravava `proposed_plan: meeting.plan.plan`.
//    `buildStrategicWeeklyPlan` devolve `{ id, label, reason, plan }`, em que
//    `plan` é o MAPA DE DIAS (`{ ter: { activity_id, intensity }, ... }`) e
//    `label` é o nome legível ("Controle e consistência"). O campo gravado era
//    o mapa, não o rótulo.
//
// 2. CONSUMIDOR (StaffReportHighlight.jsx) renderizava `String(plan)`, que
//    para qualquer objeto produz "[object Object]"; e, para as recomendações,
//    procurava `item.label || item.message` — campos que não existem no shape
//    real `{ priority, title, body }` — caindo num `JSON.stringify(item)`.
//
// Este módulo é a fonte única de formatação. NÃO usa JSON.stringify nem
// String(objeto) em nenhum caminho: quando não há texto legível, devolve null
// e a UI omite o bloco, que é honesto.
//
// Tolerância a save legado (Parte C): saves gravados antes desta correção
// carregam `proposed_plan` como MAPA DE DIAS. Esse caso é reconhecido e
// resumido em linguagem humana, em vez de quebrar ou vazar objeto.

const WEEKDAY_LABELS = Object.freeze({
  seg: 'seg', ter: 'ter', qua: 'qua', qui: 'qui',
  sex: 'sex', sab: 'sáb', dom: 'dom',
});

const PRIORITY_ORDER = Object.freeze({ high: 0, alta: 0, medium: 1, media: 1, média: 1, low: 2, baixa: 2 });

function cleanText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/** Um mapa de dias tem chaves de dia da semana apontando para sessões. */
function isWeekdayScheduleMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (!keys.length) return false;
  return keys.every((key) => Object.hasOwn(WEEKDAY_LABELS, String(key).toLowerCase()));
}

function summarizeSchedule(map) {
  const days = Object.keys(map)
    .map((key) => String(key).toLowerCase())
    .filter((key) => Object.hasOwn(WEEKDAY_LABELS, key))
    .map((key) => WEEKDAY_LABELS[key]);
  if (!days.length) return null;
  const count = days.length;
  return `${count} ${count === 1 ? 'sessão' : 'sessões'}: ${days.join(', ')}`;
}

/**
 * @returns {{title: string, detail: string|null}|null} nunca um objeto cru.
 */
export function formatStaffPlan(value) {
  if (value == null) return null;
  const asText = cleanText(value);
  if (asText) return { title: asText, detail: null };
  if (typeof value !== 'object') return null;

  // Shape canônico de buildStrategicWeeklyPlan.
  const label = cleanText(value.label) || cleanText(value.title) || cleanText(value.name);
  const reason = cleanText(value.reason) || cleanText(value.description);
  if (label) {
    const nested = value.plan && isWeekdayScheduleMap(value.plan) ? summarizeSchedule(value.plan) : null;
    return { title: label, detail: reason || nested };
  }

  // Save legado: o campo guarda o MAPA DE DIAS direto.
  if (isWeekdayScheduleMap(value)) {
    const summary = summarizeSchedule(value);
    return summary ? { title: 'Plano de treino da semana', detail: summary } : null;
  }

  // Objeto de forma desconhecida: omitir é melhor que vazar.
  return null;
}

/**
 * @returns {{title: string, body: string|null, priority: string|null}|null}
 */
export function formatStaffRecommendation(item) {
  if (item == null) return null;
  const asText = cleanText(item);
  if (asText) return { title: asText, body: null, priority: null };
  if (typeof item !== 'object') return null;

  const title = cleanText(item.title) || cleanText(item.label) || cleanText(item.message) || cleanText(item.headline);
  const body = cleanText(item.body) || cleanText(item.detail) || cleanText(item.description);
  const priority = cleanText(item.priority);
  // Sem título mas com corpo: o corpo vira o texto visível.
  if (!title) return body ? { title: body, body: null, priority } : null;
  return { title, body, priority };
}

/** Lista formatada, já sem entradas irrecuperáveis e ordenada por prioridade. */
export function formatStaffRecommendations(value) {
  const list = Array.isArray(value) ? value : (value == null ? [] : [value]);
  return list
    .map((item) => formatStaffRecommendation(item))
    .filter(Boolean)
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[String(a.priority || '').toLowerCase()] ?? 3;
      const pb = PRIORITY_ORDER[String(b.priority || '').toLowerCase()] ?? 3;
      return pa - pb;
    });
}

/** Rótulo curto de prioridade para a UI; null quando não há prioridade. */
export function formatRecommendationPriority(priority) {
  const key = String(priority || '').toLowerCase();
  if (key === 'high' || key === 'alta') return 'Prioritário';
  if (key === 'medium' || key === 'media' || key === 'média') return 'Atenção';
  if (key === 'low' || key === 'baixa') return 'Sugestão';
  return null;
}
