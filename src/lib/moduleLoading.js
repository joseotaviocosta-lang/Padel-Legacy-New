const DEFAULT_TIMEOUT_MS = 8000;
const reportedFailures = new Set();

export class ModuleLoadTimeoutError extends Error {
  constructor(label, timeoutMs) {
    super(`Tempo limite ao carregar ${label} (${timeoutMs} ms).`);
    this.name = 'ModuleLoadTimeoutError';
    this.code = 'MODULE_LOAD_TIMEOUT';
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

export async function withModuleTimeout(task, { label = 'módulo', timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let timer;
  const operation = typeof task === 'function' ? Promise.resolve().then(task) : Promise.resolve(task);
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new ModuleLoadTimeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function safeModuleTask(task, {
  label = 'módulo',
  fallback = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onError,
} = {}) {
  try {
    const value = await withModuleTimeout(task, { label, timeoutMs });
    for (const key of reportedFailures) {
      if (key.startsWith(`${label}:`)) reportedFailures.delete(key);
    }
    return value ?? fallback;
  } catch (error) {
    const failureKey = `${label}:${error?.code || error?.name || 'ERROR'}:${error?.message || ''}`;
    if (!reportedFailures.has(failureKey)) {
      reportedFailures.add(failureKey);
      console.warn(`[ModuleTask] falha ao executar ${label}; usando fallback temporário.`, error);
    }
    onError?.(error);
    return typeof fallback === 'function' ? fallback(error) : fallback;
  }
}

export async function loadModuleTasks(definitions, options = {}) {
  const entries = Object.entries(definitions);
  const results = await Promise.all(entries.map(async ([key, definition]) => {
    const config = typeof definition === 'function' ? { task: definition } : definition;
    const value = await safeModuleTask(config.task, {
      label: config.label || key,
      fallback: config.fallback,
      timeoutMs: config.timeoutMs || options.timeoutMs,
      onError: config.onError,
    });
    return [key, value];
  }));
  return Object.fromEntries(results);
}
