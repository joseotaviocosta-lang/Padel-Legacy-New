/** Compartilha apenas inicializações simultâneas da mesma chave e nunca cacheia dados entre carreiras. */
export function createKeyedInitializer(initializer) {
  const inFlight = new Map();
  return function initializeOnce(key, ...args) {
    if (!inFlight.has(key)) {
      const operation = Promise.resolve()
        .then(() => initializer(...args))
        .finally(() => inFlight.delete(key));
      inFlight.set(key, operation);
    }
    return inFlight.get(key);
  };
}
