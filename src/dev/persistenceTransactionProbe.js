// Mobile M3.7 — telemetria barata de persistência transacional.
//
// Assim como o storageIOProbe, este módulo precisa sobreviver ao build release
// usado no aparelho físico. Ele não ativa UI nem grava dados por conta própria;
// apenas mantém contadores em memória enquanto o app está aberto.

const totals = createEmptyTotals();
let activeTransaction = null;
let lastTransaction = null;
let lastMultiDayAdvance = null;
let sequence = 0;
let activeStage = null;

function createEmptyTotals() {
  return {
    transactions: 0,
    commits: 0,
    rollbacks: 0,
    skippedCleanCommits: 0,
    logicalMutations: 0,
    physicalCommits: 0,
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

export function createPersistenceTransaction(name) {
  sequence += 1;
  totals.transactions += 1;
  return {
    id: `${String(name || 'transaction')}#${sequence}`,
    name: String(name || 'transaction'),
    depth: 1,
    logicalMutations: 0,
    physicalCommits: 0,
    commitIOms: 0,
    startedAt: nowMs(),
    durationMs: 0,
    rolledBack: false,
    skippedCleanCommit: false,
    rollbackReason: null,
    callers: {},
    stages: {},
  };
}

export function setActivePersistenceTransaction(transaction) {
  activeTransaction = transaction || null;
}

export function getActivePersistenceTransactionContext() {
  if (!activeTransaction) return activeStage ? { stage: activeStage } : null;
  return {
    id: activeTransaction.id,
    name: activeTransaction.name,
    depth: activeTransaction.depth,
    stage: activeStage,
  };
}

export function setPersistenceProfilerStage(stage = null) {
  const previous = activeStage;
  activeStage = stage ? String(stage) : null;
  return previous;
}

export function setPersistenceTransactionDepth(transaction, depth) {
  transaction.depth = Math.max(1, Number(depth) || 1);
}

export function recordPersistenceLogicalMutation(transaction, caller = 'unknown') {
  transaction.logicalMutations += 1;
  totals.logicalMutations += 1;
  const key = String(caller || 'unknown');
  transaction.callers[key] = (transaction.callers[key] || 0) + 1;
  const stage = activeStage || 'unscoped';
  transaction.stages[stage] = (transaction.stages[stage] || 0) + 1;
}

export function recordPersistencePhysicalCommit(transaction, commitIOms = 0) {
  transaction.physicalCommits += 1;
  transaction.commitIOms += Number(commitIOms || 0);
  totals.physicalCommits += 1;
}

export function finishPersistenceTransaction(transaction, {
  rolledBack = false,
  skippedCleanCommit = false,
  rollbackReason = null,
} = {}) {
  transaction.durationMs = roundMs(nowMs() - transaction.startedAt);
  transaction.commitIOms = roundMs(transaction.commitIOms);
  transaction.depth = 0;
  transaction.rolledBack = Boolean(rolledBack);
  transaction.skippedCleanCommit = Boolean(skippedCleanCommit);
  transaction.rollbackReason = rollbackReason ? String(rollbackReason) : null;
  if (rolledBack) totals.rollbacks += 1;
  else if (skippedCleanCommit) totals.skippedCleanCommits += 1;
  else totals.commits += 1;
  lastTransaction = {
    ...transaction,
    callers: { ...transaction.callers },
    stages: { ...transaction.stages },
    at: Date.now(),
  };
  if (activeTransaction === transaction) activeTransaction = null;
  return lastTransaction;
}

export function getPersistenceTransactionSnapshot() {
  return {
    totals: { ...totals },
    active: activeTransaction ? {
      id: activeTransaction.id,
      name: activeTransaction.name,
      depth: activeTransaction.depth,
      logicalMutations: activeTransaction.logicalMutations,
      physicalCommits: activeTransaction.physicalCommits,
      durationMs: roundMs(nowMs() - activeTransaction.startedAt),
    } : null,
    last: lastTransaction ? {
      ...lastTransaction,
      callers: { ...lastTransaction.callers },
      stages: { ...lastTransaction.stages },
    } : null,
    lastMultiDayAdvance: lastMultiDayAdvance ? { ...lastMultiDayAdvance } : null,
  };
}

export function recordMultiDayAdvanceResult(result = {}) {
  lastMultiDayAdvance = {
    requestedDays: Math.max(0, Number(result.requestedDays) || 0),
    processedDays: Math.max(0, Number(result.processedDays) || 0),
    remainingDays: Math.max(0, Number(result.remainingDays) || 0),
    stopReason: result.stopReason ? String(result.stopReason) : null,
    transactions: Math.max(0, Number(result.transactions) || 0),
    physicalCommits: Math.max(0, Number(result.physicalCommits) || 0),
    initialDate: result.initialDate || null,
    finalDate: result.finalDate || null,
    displayedStartDate: result.displayedStartDate || null,
    automaticTrainings: Math.max(0, Number(result.automaticTrainings) || 0),
    at: Date.now(),
  };
  return { ...lastMultiDayAdvance };
}

export function resetPersistenceTransactionStats() {
  Object.assign(totals, createEmptyTotals());
  lastTransaction = null;
  lastMultiDayAdvance = null;
}
