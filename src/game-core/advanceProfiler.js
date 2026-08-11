export function isAdvanceDebugEnabled() {
  const runtime = /** @type {any} */ (globalThis);
  return runtime.__PADEL_ADVANCE_DEBUG__ === true
    || ['localhost', '127.0.0.1'].includes(runtime.location?.hostname);
}

/**
 * Perfilador de estágios reutilizável para o pipeline de avanço de tempo,
 * no mesmo formato do profiler de fim de partida (matchFinalization.js).
 * Ao contrário daquele, não força uma lista fixa de estágios: dias com
 * virada de mês/semana passam por estágios extras, dias comuns não.
 */
export function createAdvanceProfiler({ enabled = isAdvanceDebugEnabled(), logger = console.debug, label = 'Advance' } = {}) {
  const startedAt = performance.now();
  const timings = {};
  const measure = async (stage, task) => {
    const stageStartedAt = performance.now();
    try {
      return await task();
    } finally {
      const elapsed = Number((performance.now() - stageStartedAt).toFixed(3));
      timings[stage] = Number(((timings[stage] || 0) + elapsed).toFixed(3));
    }
  };
  const finish = () => {
    timings.TOTAL = Number((performance.now() - startedAt).toFixed(3));
    if (enabled) {
      Object.entries(timings).forEach(([stage, ms]) => {
        if (stage !== 'TOTAL') logger(`[${label}] ${stage}: ${ms}ms`);
      });
      logger(`[${label}] TOTAL: ${timings.TOTAL}ms`);
    }
    return { ...timings };
  };
  return { measure, finish, timings };
}
