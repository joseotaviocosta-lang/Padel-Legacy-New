// Playthrough 4.5, item 18 — instrumentação DEV do circuito cronológico.
//
// O headless já divergiu várias vezes do app real (itens 1-16 desta fase
// inteira só foram reproduzidos jogando no APK, nunca nos scripts de
// harness). Este módulo dá ao próximo diagnóstico uma fonte de dados
// PERSISTIDA (sobrevive a reload/restart, ao contrário de um console.log) em
// vez de depender só de inferência visual — sem virar uma tela permanente:
// nenhum componente de UI lê isto, é gravado toda vez que o day-tick do
// circuito roda e lido só por script/QA quando necessário.
//
// Gate em runtime (mesma convenção de src/dev/storageIOProbe.js —
// `padel:perfdebug`), nunca `import.meta.env.DEV`: o cenário que este módulo
// existe para cobrir é justamente um build de release rodando no dispositivo
// físico, onde DEV é sempre false.
import { localGame } from '@/api/localGameClient.js';

export const WORLD_TOUR_DIAGNOSTIC_ENTITY = 'WorldTourDiagnosticLog';
const STORAGE_KEY = 'padel:worldtourdebug';
// Rotativo: mantém só os últimos N dias — um diagnóstico de divergência real
// precisa da JANELA recente (dias antes/depois do sintoma), não do histórico
// completo da carreira.
const RETENTION_DAYS = 30;

let enabledOverride = null;

export function isWorldTourDiagnosticsEnabled() {
  if (enabledOverride !== null) return enabledOverride;
  if (typeof window === 'undefined') return false;
  try {
    const queryValue = new URLSearchParams(window.location?.search || '').get('worldtourdebug');
    if (queryValue === '1') {
      window.localStorage?.setItem(STORAGE_KEY, '1');
      return true;
    }
    if (queryValue === '0') {
      window.localStorage?.setItem(STORAGE_KEY, '0');
      return false;
    }
    return window.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Usado somente por testes Node, onde não existe localStorage/window. */
export function setWorldTourDiagnosticsEnabledForTests(value = null) {
  enabledOverride = value === null ? null : Boolean(value);
}

function safeCount(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

/**
 * Registra o resultado de um day-tick do circuito (draws, resoluções,
 * pontos de Race, WorldEvents, erros) numa linha por data, e poda entradas
 * fora da janela de retenção. Nunca lança — instrumentação não pode derrubar
 * o avanço de dia que está observando.
 */
export async function recordWorldTourDiagnosticDay(date, {
  worldTourResult = null,
  playerTournamentResult = null,
} = {}) {
  if (!date || !isWorldTourDiagnosticsEnabled()) return null;
  try {
    const entities = /** @type {any} */ (localGame.entities);
    const entry = {
      id: `wtd:${date}`,
      date,
      recorded_at: new Date().toISOString(),
      draws_created: safeCount(worldTourResult?.drawn),
      draws_cancelled: safeCount(worldTourResult?.cancelled),
      tournaments_pending: safeCount(worldTourResult?.pending),
      tournaments_settled: safeCount(worldTourResult?.resolved),
      race_writes: safeCount(worldTourResult?.rankingUpdates),
      world_events_created: safeCount(worldTourResult?.news),
      player_tournaments_settled: safeCount(playerTournamentResult?.resolved),
      waiting_for_canonical_pairs: Boolean(worldTourResult?.waitingForCanonicalPairs),
      canonical_pairs_found: safeCount(worldTourResult?.canonicalPairsFound),
      athletes_considered: safeCount(worldTourResult?.athletesConsidered),
      // Playthrough 4.5A, item 1/4/5 — por torneio resolvido hoje (limitado a
      // 20, não o save inteiro) e os 4 pares reais mais visíveis do circuito
      // (Coello/Tapia/Galán/Chingotto), antes/depois do write de race_points.
      tournament_diagnostics: Array.isArray(worldTourResult?.tournamentDiagnostics)
        ? worldTourResult.tournamentDiagnostics.slice(0, 20)
        : [],
      race_watch: Array.isArray(worldTourResult?.raceWatch) ? worldTourResult.raceWatch : [],
      errors: [
        ...(Array.isArray(worldTourResult?.errors) ? worldTourResult.errors.slice(0, 5) : []),
        ...(Array.isArray(playerTournamentResult?.errors) ? playerTournamentResult.errors.slice(0, 5) : []),
      ],
    };
    await entities[WORLD_TOUR_DIAGNOSTIC_ENTITY].upsert(entry.id, entry);

    // Poda por janela de retenção — melhor esforço, nunca bloqueia a escrita
    // principal acima nem propaga erro do avanço de dia.
    const cutoff = new Date(`${date}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const rows = (await entities[WORLD_TOUR_DIAGNOSTIC_ENTITY].list('-date', RETENTION_DAYS + 30).catch(() => [])) || [];
    const stale = rows.filter((row) => row.date && row.date < cutoffDate);
    for (const row of stale) await entities[WORLD_TOUR_DIAGNOSTIC_ENTITY].delete(row.id).catch(() => {});

    return entry;
  } catch (error) {
    console.warn('[WorldTourDiagnostics] falha ao registrar diagnóstico do dia (ignorada).', error?.message || error);
    return null;
  }
}

export async function getWorldTourDiagnosticHistory(limit = RETENTION_DAYS) {
  try {
    const entities = /** @type {any} */ (localGame.entities);
    return (await entities[WORLD_TOUR_DIAGNOSTIC_ENTITY].list('-date', limit)) || [];
  } catch {
    return [];
  }
}
