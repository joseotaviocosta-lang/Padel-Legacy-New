import { loadModuleTasks, safeModuleTask, withModuleTimeout } from '@/lib/moduleLoading';

export async function runModuleStabilityTest() {
  const immediate = await safeModuleTask(() => Promise.resolve(['ok']), {
    label: 'consulta imediata',
    fallback: [],
    timeoutMs: 100,
  });

  const timeoutFallback = await safeModuleTask(
    () => new Promise(() => {}),
    { label: 'consulta travada', fallback: ['fallback'], timeoutMs: 30 },
  );

  const partial = await loadModuleTasks({
    catalog: { task: () => Promise.resolve([{ id: 'item-1' }]), fallback: [], timeoutMs: 100 },
    optional: { task: () => Promise.reject(new Error('coleção opcional ausente')), fallback: [], timeoutMs: 100 },
    stalled: { task: () => new Promise(() => {}), fallback: [], timeoutMs: 30 },
  });

  let timeoutCode = null;
  try {
    await withModuleTimeout(() => new Promise(() => {}), { label: 'teste de timeout', timeoutMs: 20 });
  } catch (error) {
    timeoutCode = error?.code;
  }

  const result = {
    success: immediate[0] === 'ok'
      && timeoutFallback[0] === 'fallback'
      && partial.catalog.length === 1
      && partial.optional.length === 0
      && partial.stalled.length === 0
      && timeoutCode === 'MODULE_LOAD_TIMEOUT',
    immediateOk: immediate[0] === 'ok',
    timeoutFallbackOk: timeoutFallback[0] === 'fallback',
    partialFailureIsolated: partial.catalog.length === 1 && partial.optional.length === 0,
    stalledTaskReleased: partial.stalled.length === 0,
    timeoutCodeOk: timeoutCode === 'MODULE_LOAD_TIMEOUT',
  };

  if (!result.success) throw new Error(`Falha no teste de estabilidade dos módulos: ${JSON.stringify(result)}`);
  return result;
}

export function setupModuleStabilityTest() {
  if (typeof window !== 'undefined') window.PadelModuleStabilityTest = { run: runModuleStabilityTest };
}
