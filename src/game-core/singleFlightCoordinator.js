/**
 * Coordena uma operação assíncrona global com uma única Promise em voo.
 * A liberação acontece no finally da operação real, em sucesso ou erro.
 * @template T
 * @param {(...args: any[]) => Promise<T> | T} execute
 * @param {{ onStateChange?: ((change: { previous: boolean, next: boolean, source: string }) => void) | null, source?: string }} [options]
 */
export function createSingleFlightCoordinator(execute, { onStateChange = null, source = 'SingleFlight' } = {}) {
  let activeRequest = null;
  let processing = false;
  const listeners = new Set();

  const publish = (next) => {
    const previous = processing;
    processing = next;
    onStateChange?.({ previous, next, source });
    listeners.forEach((listener) => {
      try { listener(next); }
      catch (error) { console.error(`[${source}] listener de estado falhou`, error); }
    });
  };

  const run = (...args) => {
    if (activeRequest) return activeRequest;

    publish(true);
    activeRequest = Promise.resolve()
      .then(() => execute(...args))
      .finally(() => {
        activeRequest = null;
        publish(false);
      });
    return activeRequest;
  };

  return {
    run,
    isProcessing: () => processing,
    subscribe(listener) {
      listeners.add(listener);
      listener(processing);
      return () => { listeners.delete(listener); };
    },
  };
}
