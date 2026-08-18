// Mobile M3.6 — telemetria de Storage/I/O no ponto mais baixo do app.
//
// Este módulo precisa existir no APK release, mas fica inerte por padrão. O
// gate é o mesmo do MobilePerformanceMonitor (`padel:perfdebug`) e é avaliado
// em runtime; não use import.meta.env.DEV aqui.

import { getActivePersistenceTransactionContext } from './persistenceTransactionProbe.js';

const PERFDEBUG_STORAGE_KEY = 'padel:perfdebug';
const RECENT_OPERATION_LIMIT = 300;

const aggregates = new Map();
const recent = [];
const totals = createEmptyTotals();
let enabledOverride = null;

function createEmptyTotals() {
  return {
    calls: 0,
    reads: 0,
    writes: 0,
    totalMs: 0,
    maxMs: 0,
    bytesRead: 0,
    bytesWritten: 0,
    cacheHits: 0,
    cacheMisses: 0,
    failures: 0,
  };
}

function nowMs() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function isEnabled() {
  if (enabledOverride !== null) return enabledOverride;
  if (typeof window === 'undefined') return false;
  try {
    const queryValue = new URLSearchParams(window.location?.search || '').get('perfdebug');
    if (queryValue === '1') {
      window.localStorage?.setItem(PERFDEBUG_STORAGE_KEY, '1');
      return true;
    }
    if (queryValue === '0') return false;
    return window.localStorage?.getItem(PERFDEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function currentRoute() {
  return typeof window !== 'undefined' ? window.location?.pathname || null : null;
}

function normalizeMeta(meta = {}) {
  const transaction = getActivePersistenceTransactionContext();
  return {
    operation: String(meta.operation || 'unknown'),
    key: String(meta.key || meta.path || 'unknown'),
    caller: String(meta.caller || 'unknown'),
    layer: String(meta.layer || 'tauri-ipc'),
    cache: meta.cache === 'hit' || meta.cache === 'miss' ? meta.cache : null,
    transactionId: meta.transactionId || transaction?.id || null,
    transactionName: meta.transactionName || transaction?.name || null,
    transactionDepth: Number(meta.transactionDepth || transaction?.depth || 0),
    transactionStage: meta.transactionStage || transaction?.stage || null,
  };
}

function aggregateStorageKey(key) {
  return String(key).replace(
    /-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/g,
    '-<timestamp>',
  );
}

function record(meta, durationMs, { bytes = 0, failed = false } = {}) {
  const normalized = normalizeMeta(meta);
  const duration = Number(durationMs || 0);
  const byteCount = Math.max(0, Number(bytes || 0));
  const entry = {
    ...normalized,
    durationMs: roundMs(duration),
    bytes: byteCount,
    failed: Boolean(failed),
    route: currentRoute(),
    at: Date.now(),
  };

  const groupedKey = aggregateStorageKey(normalized.key);
  const aggregateKey = [normalized.layer, normalized.operation, groupedKey, normalized.caller, normalized.cache || 'none', normalized.transactionName || 'no-tx', normalized.transactionStage || 'no-stage'].join('|');
  const aggregate = aggregates.get(aggregateKey) || {
    ...normalized,
    key: groupedKey,
    count: 0,
    totalMs: 0,
    maxMs: 0,
    bytes: 0,
    failures: 0,
  };
  aggregate.count += 1;
  aggregate.totalMs += duration;
  aggregate.maxMs = Math.max(aggregate.maxMs, duration);
  aggregate.bytes += byteCount;
  if (failed) aggregate.failures += 1;
  aggregates.set(aggregateKey, aggregate);

  totals.calls += 1;
  totals.totalMs += duration;
  totals.maxMs = Math.max(totals.maxMs, duration);
  if (normalized.operation === 'read') {
    totals.reads += 1;
    totals.bytesRead += byteCount;
  }
  if (normalized.operation === 'write') {
    totals.writes += 1;
    totals.bytesWritten += byteCount;
  }
  if (normalized.cache === 'hit') totals.cacheHits += 1;
  if (normalized.cache === 'miss') totals.cacheMisses += 1;
  if (failed) totals.failures += 1;

  recent.push(entry);
  if (recent.length > RECENT_OPERATION_LIMIT) recent.shift();
  return entry;
}

/** Mede uma operação sync/async sem alterar retorno nem propagação de erro. */
export async function measureStorageOperation(meta, task, options = {}) {
  if (!isEnabled()) return task();
  const start = nowMs();
  try {
    const result = await task();
    const bytes = typeof options.bytes === 'function' ? options.bytes(result) : options.bytes;
    record(meta, nowMs() - start, { bytes });
    return result;
  } catch (error) {
    record(meta, nowMs() - start, { bytes: options.bytes, failed: true });
    throw error;
  }
}

/** Registra hit/miss de caches lógicos sem fingir que isso é um IPC físico. */
export function recordStorageCacheAccess(meta = {}) {
  if (!isEnabled()) return;
  record({ ...meta, operation: meta.operation || 'cache', layer: meta.layer || 'memory-cache' }, 0, { bytes: meta.bytes });
}

export function captureStorageTotals() {
  return { ...totals };
}

export function diffStorageTotals(before = {}) {
  const diff = {};
  for (const key of Object.keys(totals)) diff[key] = Number(totals[key] || 0) - Number(before[key] || 0);
  diff.totalMs = roundMs(diff.totalMs);
  diff.maxMs = roundMs(totals.maxMs);
  return diff;
}

export function getStoragePerformanceSnapshot(limit = 20) {
  const operations = [...aggregates.values()]
    .map((entry) => ({ ...entry, totalMs: roundMs(entry.totalMs), maxMs: roundMs(entry.maxMs) }))
    .sort((a, b) => b.totalMs - a.totalMs || b.count - a.count)
    .slice(0, limit);
  const cacheSamples = totals.cacheHits + totals.cacheMisses;
  return {
    totals: {
      ...totals,
      totalMs: roundMs(totals.totalMs),
      maxMs: roundMs(totals.maxMs),
      cacheHitRate: cacheSamples ? Math.round((totals.cacheHits / cacheSamples) * 1000) / 10 : 0,
    },
    operations,
    recent: recent.map((entry) => ({ ...entry })),
  };
}

export function resetStoragePerformanceStats() {
  aggregates.clear();
  recent.length = 0;
  Object.assign(totals, createEmptyTotals());
}

// Usado somente por testes Node, onde não existe localStorage.
export function setStorageProbeEnabledForTests(value = null) {
  enabledOverride = value === null ? null : Boolean(value);
}
