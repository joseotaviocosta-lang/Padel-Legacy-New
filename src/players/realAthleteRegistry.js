// Fase 2A — registro canônico único dos atletas reais. Fonte de dados:
// src/data/realAthletesRegistry.json (gerado por
// scripts/build-real-athletes-registry.mjs — não editar o JSON à mão).
// Todo sistema que precisa saber "quem são os atletas reais" (seed do
// mundo/ranking, catálogo de adversários de prática, integridade de
// conteúdo estático) lê DESTE módulo — nunca duplica a lista.
// Import relativo (não `@/...`): este módulo é alcançado por
// scripts/test-player-system.mjs em Node puro (via athleteCatalog.js ->
// realAthletes.js), sem o alias Vite.
import registryData from '../data/realAthletesRegistry.json' with { type: 'json' };

export function getRealAthleteRegistry() {
  return registryData.athletes.map((athlete) => ({ ...athlete }));
}

export function getRealAthleteById(id) {
  const found = registryData.athletes.find((athlete) => athlete.id === id);
  return found ? { ...found } : null;
}

export function getRealAthleteRegistryMeta() {
  return { generatedAt: registryData.generatedAt, source: registryData.source, snapshotDate: registryData.snapshot_date, count: registryData.count };
}

// Pares "confirmado" (resultado de torneio real) — travados, só se desfazem
// por evento narrativo explícito (Fase 2G.1).
export function getConfirmedRealPairs() {
  return pairsByConfidence('confirmado');
}

// Pares "provavel" (heurística de pontos quase idênticos) — usados só como
// ESTADO INICIAL do mercado de parcerias; o mercado pode dissolvê-los
// normalmente (Fase 2G.2).
export function getProbableRealPairs() {
  return pairsByConfidence('provavel');
}

export function getUnpairedRealAthleteIds() {
  return registryData.athletes.filter((athlete) => !athlete.partner_confidence).map((athlete) => athlete.id);
}

function pairsByConfidence(confidence) {
  const athletes = registryData.athletes;
  const byId = new Map(athletes.map((athlete) => [athlete.id, athlete]));
  const pairs = [];
  const seen = new Set();
  for (const athlete of athletes) {
    if (athlete.partner_confidence !== confidence || !athlete.partner_id) continue;
    const key = [athlete.id, athlete.partner_id].sort().join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    const partner = byId.get(athlete.partner_id);
    if (!partner) continue;
    pairs.push({ a: athlete.id, b: athlete.partner_id, aName: athlete.name, bName: partner.name });
  }
  return pairs;
}

// Fase 2A.3 — integridade: nenhum id duplicado no registro; todo
// partner_id resolve para um id existente no próprio registro; nenhum
// atleta real duplicado entre o registro e o pool de ranking gerado
// proceduralmente (checado externamente por quem constrói o pool, já que
// este módulo não tem acesso ao pool procedural).
export function validateRealAthleteRegistryIntegrity() {
  const errors = [];
  const athletes = registryData.athletes;
  const ids = new Set();
  for (const athlete of athletes) {
    if (ids.has(athlete.id)) errors.push(`id duplicado: ${athlete.id}`);
    ids.add(athlete.id);
    if (!athlete.is_real) errors.push(`${athlete.id}: is_real não é true`);
  }
  for (const athlete of athletes) {
    if (athlete.partner_confidence && !ids.has(athlete.partner_id)) {
      errors.push(`${athlete.id} (${athlete.name}): partner_id "${athlete.partner_id}" não existe no registro`);
    }
  }
  return { ok: errors.length === 0, errors, count: athletes.length };
}
