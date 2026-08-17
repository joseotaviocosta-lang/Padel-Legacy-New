// M3.3 (docs/MOBILE_M3_3_PERFORMANCE.md, Parte 5) — instrumentação DEV-only
// para medir pontos reais do app (startup, avanço de calendário, LiveMatch)
// sem espalhar performance.now()/mark solto pelo código.
//
// `import.meta.env.DEV` é substituído por um literal (`false` em build de
// produção) pelo próprio Vite em tempo de build — o minificador elimina o
// branch morto resultante, então nada disto sobrevive no bundle release
// (nem os console.debug, nem os marks). Não precisa de remoção manual.
const enabled = import.meta.env.DEV;

export function mark(name) {
  if (!enabled || typeof performance === 'undefined' || !performance.mark) return;
  performance.mark(name);
}

/** Mede entre dois marks já registrados e loga em ms. Retorna a duração ou null (fora de DEV / marks ausentes). */
export function measure(label, startMark, endMark) {
  if (!enabled || typeof performance === 'undefined' || !performance.measure) return null;
  try {
    const entry = performance.measure(label, startMark, endMark);
    console.debug(`[perf] ${label}: ${entry.duration.toFixed(1)}ms`);
    return entry.duration;
  } catch {
    return null;
  }
}

/** Envolve uma função assíncrona e loga sua duração real, sem alterar o retorno. */
export async function timeAsync(label, fn) {
  if (!enabled) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    console.debug(`[perf] ${label}: ${(performance.now() - start).toFixed(1)}ms`);
  }
}
