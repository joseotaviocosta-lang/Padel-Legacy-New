// Helpers de apresentação de tempo para o Mundo Vivo (Fase 7 — Mundo Vivo).
// Puramente de exibição: não lê nem escreve entidades, não gera eventos.
// Mantém "Hoje/Ontem/Esta semana" consistentes entre Notícias, Universo Vivo
// e Mercado sem duplicar a lógica de formatação em cada página.

function toUtcDay(dateStr) {
  if (!dateStr) return null;
  const parsed = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Rotula a distância entre `eventDate` e `referenceDate` (normalmente
 * `profile.career_date`) como Hoje/Ontem/Esta semana, ou `null` quando mais
 * antigo — quem chama decide o fallback (ex.: data formatada) nesse caso.
 */
export function relativeDayLabel(eventDate, referenceDate) {
  const event = toUtcDay(eventDate);
  const reference = toUtcDay(referenceDate);
  if (!event || !reference) return null;
  const diffDays = Math.round((reference.getTime() - event.getTime()) / 86400000);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays > 1 && diffDays <= 7) return 'Esta semana';
  return null;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Rótulo de exibição compacto: usa o rótulo relativo quando disponível,
 * senão cai para "13 ago".
 */
export function formatWorldDate(eventDate, referenceDate) {
  const relative = relativeDayLabel(eventDate, referenceDate);
  if (relative) return relative;
  const event = toUtcDay(eventDate);
  if (!event) return '';
  return `${event.getUTCDate()} ${MONTHS[event.getUTCMonth()]}`;
}

/**
 * Agrupa uma lista de eventos (cada um com `event_date`) em baldes
 * cronológicos Hoje/Ontem/Esta semana/Mais antigo, preservando a ordem
 * original (já vem `-event_date` das consultas existentes).
 */
export function groupByRelativeDay(events, referenceDate) {
  const buckets = new Map([
    ['Hoje', []],
    ['Ontem', []],
    ['Esta semana', []],
    ['Mais antigo', []],
  ]);
  for (const event of events || []) {
    const label = relativeDayLabel(event.event_date, referenceDate) || 'Mais antigo';
    buckets.get(label).push(event);
  }
  return [...buckets.entries()].filter(([, rows]) => rows.length > 0);
}
