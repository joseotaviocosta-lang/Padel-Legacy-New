export function hashSeed(input = Date.now()) {
  const text = String(input);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRandom(seed, initialState) {
  let state = Number.isInteger(initialState) ? initialState >>> 0 : (hashSeed(seed) || 1);
  return {
    next() {
      state += 0x6d2b79f5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state() { return state >>> 0; },
    pick(items) {
      if (!items?.length) return undefined;
      return items[Math.floor(this.next() * items.length)];
    },
    weighted(items) {
      const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
      if (total <= 0) return items[0]?.value;
      let cursor = this.next() * total;
      for (const item of items) {
        cursor -= Math.max(0, item.weight);
        if (cursor <= 0) return item.value;
      }
      return items.at(-1)?.value;
    },
  };
}
