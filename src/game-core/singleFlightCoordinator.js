/**
 * Coordena uma operação assíncrona global com uma única Promise em voo.
 * A liberação acontece no finally da operação real, em sucesso ou erro.
 */
export function createSingleFlightCoordinator(execute) {
  let activeRequest = null;
  let processing = false;
  const listeners = new Set();

  const publish = (next) => {
    processing = next;
    listeners.forEach((listener) => listener(next));
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

