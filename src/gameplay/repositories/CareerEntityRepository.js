import { gameRepository as repository } from '../services/runtime.js';
import { seedCollection } from '../services/CareerInitialDataService.js';
import { normalizeFatiguePatch } from '../../game-core/physicalStats.js';

function clone(value) {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = 'entity') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Contador de gravações completas do save (uma por chamada a
// mutateActiveCareer). Usado por benchmarks/instrumentação de performance
// para medir amplificação de escrita; sem custo em produção além de um
// incremento de inteiro.
export const careerWriteStats = { count: 0 };
export function resetCareerWriteStats() { careerWriteStats.count = 0; }

// Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md, item 9 — "Storage / IPC"):
// contador leve de leituras/gravações + tempo gasto no chokepoint único por
// onde toda entidade passa (withCareer, abaixo). Não muda cache/estratégia
// de leitura nenhuma — só torna visível o que já acontece, para o overlay de
// perfdebug (MobilePerformanceMonitor).
export const careerIOStats = { reads: 0, writes: 0, totalMs: 0, maxMs: 0 };
export function resetCareerIOStats() { careerIOStats.reads = 0; careerIOStats.writes = 0; careerIOStats.totalMs = 0; careerIOStats.maxMs = 0; }
function nowMs() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }

function matches(row, query = {}) {
  return Object.entries(query || {}).every(([key, expected]) => {
    const actual = row?.[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected && !expected.$in.includes(actual)) return false;
      if ('$nin' in expected && expected.$nin.includes(actual)) return false;
      if ('$ne' in expected && actual === expected.$ne) return false;
      if ('$gte' in expected && !(actual >= expected.$gte)) return false;
      if ('$lte' in expected && !(actual <= expected.$lte)) return false;
      if ('$gt' in expected && !(actual > expected.$gt)) return false;
      if ('$lt' in expected && !(actual < expected.$lt)) return false;
      if ('$contains' in expected && !String(actual ?? '').toLowerCase().includes(String(expected.$contains).toLowerCase())) return false;
      return true;
    }
    return actual === expected;
  });
}

function sortRows(items, sort) {
  if (!sort || typeof sort !== 'string') return [...items];
  const fields = sort.split(',').map((field) => field.trim()).filter(Boolean);
  return [...items].sort((a, b) => {
    for (const raw of fields) {
      const desc = raw.startsWith('-');
      const field = desc ? raw.slice(1) : raw;
      const av = a?.[field] ?? '';
      const bv = b?.[field] ?? '';
      if (av === bv) continue;
      const result = av > bv ? 1 : -1;
      return desc ? -result : result;
    }
    return 0;
  });
}

export class CareerEntityRepository {
  constructor(gameRepository = repository) {
    this.repository = gameRepository;
    this.queryCache = new Map();
    this.cacheCareerRef = null;
  }

  syncCacheCareer(career) {
    if (this.cacheCareerRef !== career) {
      this.cacheCareerRef = career;
      this.queryCache.clear();
    }
  }

  invalidate(entityName = null) {
    if (!entityName) {
      this.queryCache.clear();
      return;
    }
    const prefix = `${entityName}|`;
    for (const key of this.queryCache.keys()) {
      if (key.startsWith(prefix)) this.queryCache.delete(key);
    }
  }

  copyRows(rows) {
    // Entidades do jogo são majoritariamente objetos planos. Um clone raso
    // protege a lista do cache sem structuredClone de centenas/milhares de
    // registros em toda montagem de tela.
    return rows.map((row) => (row && typeof row === 'object' ? { ...row } : row));
  }

  async withCareer(mutator, { save = false } = {}) {
    const start = nowMs();
    try {
      if (save) {
        careerWriteStats.count += 1;
        const transaction = await this.repository.mutateActiveCareer(async (career) => {
          if (!career.entities || typeof career.entities !== 'object' || Array.isArray(career.entities)) career.entities = {};
          return mutator(career);
        });
        return clone(transaction.result);
      }

      // Leituras de entidades usam o snapshot quente da carreira. Persistência
      // continua sendo a autoridade ao abrir/recarregar a carreira, mas não há
      // motivo para reler e parsear o mesmo arquivo para cada card da mesma tela.
      const career = await this.repository.ensureActiveCareer({ fresh: false, cloneResult: false });
      if (!career.entities || typeof career.entities !== 'object' || Array.isArray(career.entities)) career.entities = {};
      this.syncCacheCareer(career);
      return mutator(career);
    } finally {
      const duration = nowMs() - start;
      if (save) careerIOStats.writes += 1; else careerIOStats.reads += 1;
      careerIOStats.totalMs += duration;
      if (duration > careerIOStats.maxMs) careerIOStats.maxMs = duration;
    }
  }

  seedFor(entityName, career) {
    return seedCollection(entityName, career?.player?.id || null);
  }

  ensureCollection(entityName, career, { persist = false } = {}) {
    const existing = career.entities?.[entityName];
    if (Array.isArray(existing)) return existing;

    const seeded = this.seedFor(entityName, career);
    if (persist) career.entities[entityName] = seeded;
    return seeded;
  }

  async list(entityName, sort = null, limit = null) {
    return this.withCareer(async (career) => {
      const key = `${entityName}|list|${sort || ''}|${limit || ''}`;
      const cached = this.queryCache.get(key);
      if (cached) return this.copyRows(cached);
      const rows = this.ensureCollection(entityName, career);
      const sorted = sortRows(rows, sort);
      const out = limit ? sorted.slice(0, limit) : sorted;
      this.queryCache.set(key, out);
      return this.copyRows(out);
    }, { save: false });
  }

  async filter(entityName, query = {}, sort = null, limit = null) {
    return this.withCareer(async (career) => {
      const queryKey = JSON.stringify(query || {});
      const key = `${entityName}|filter|${queryKey}|${sort || ''}|${limit || ''}`;
      const cached = this.queryCache.get(key);
      if (cached) return this.copyRows(cached);
      const rows = this.ensureCollection(entityName, career);
      const sorted = sortRows(rows.filter((row) => matches(row, query)), sort);
      const out = limit ? sorted.slice(0, limit) : sorted;
      this.queryCache.set(key, out);
      return this.copyRows(out);
    }, { save: false });
  }

  async get(entityName, id) {
    return this.withCareer(async (career) => {
      const key = `${entityName}|get|${id}`;
      const cached = this.queryCache.get(key);
      if (cached) return { ...cached };
      const rows = this.ensureCollection(entityName, career);
      const found = rows.find((row) => row.id === id);
      if (!found) throw new Error(`${entityName} não encontrado: ${id}`);
      this.queryCache.set(key, found);
      return { ...found };
    }, { save: false });
  }

  async create(entityName, data = {}) {
    this.invalidate(entityName);
    return this.withCareer(async (career) => {
      const rows = this.ensureCollection(entityName, career, { persist: true });
      const timestamp = new Date().toISOString();
      const record = { ...clone(data), id: data.id || makeId(entityName.toLowerCase()), created_date: data.created_date || timestamp, updated_date: timestamp };
      if (rows.some((row) => row?.id === record.id)) {
        throw new Error(`${entityName} já existe com o id: ${record.id}`);
      }
      rows.push(record);
      return record;
    }, { save: true });
  }

  async update(entityName, id, data = {}) {
    this.invalidate(entityName);
    return this.withCareer(async (career) => {
      const rows = this.ensureCollection(entityName, career, { persist: true });
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) throw new Error(`${entityName} não encontrado para atualização: ${id}`);
      rows[index] = { ...rows[index], ...clone(data), id, updated_date: new Date().toISOString() };
      return rows[index];
    }, { save: true });
  }

  /**
   * Cria ou atualiza uma entidade de ID estável em uma única transação.
   * Indicado para catálogos canônicos que precisam reparar saves parciais.
   */
  async upsert(entityName, id, data = {}) {
    if (!id) throw new Error(`ID obrigatório para upsert de ${entityName}.`);
    this.invalidate(entityName);
    return this.withCareer(async (career) => {
      const rows = this.ensureCollection(entityName, career, { persist: true });
      const index = rows.findIndex((row) => row?.id === id);
      const timestamp = new Date().toISOString();
      if (index < 0) {
        const record = { ...clone(data), id, created_date: data.created_date || timestamp, updated_date: timestamp };
        rows.push(record);
        return record;
      }
      rows[index] = { ...rows[index], ...clone(data), id, updated_date: timestamp };
      return rows[index];
    }, { save: true });
  }

  async delete(entityName, id) {
    this.invalidate(entityName);
    return this.withCareer(async (career) => {
      const rows = this.ensureCollection(entityName, career, { persist: true });
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) rows.splice(index, 1);
      return { success: true };
    }, { save: true });
  }

  async bulkCreate(entityName, data = []) {
    if (!Array.isArray(data) || data.length === 0) return [];
    this.invalidate(entityName);
    return this.withCareer(async (career) => {
      const rows = this.ensureCollection(entityName, career, { persist: true });
      const knownIds = new Set(rows.map(row => row?.id).filter(Boolean));
      const timestamp = new Date().toISOString();
      const created = [];
      for (const item of data) {
        const record = { ...clone(item), id: item.id || makeId(entityName.toLowerCase()), created_date: item.created_date || timestamp, updated_date: timestamp };
        if (knownIds.has(record.id)) throw new Error(`${entityName} já existe com o id: ${record.id}`);
        knownIds.add(record.id);
        rows.push(record);
        created.push(record);
      }
      return created;
    }, { save: true });
  }

  async bulkUpdate(entityName, updates = []) {
    if (!Array.isArray(updates) || updates.length === 0) return [];
    this.invalidate(entityName);
    return this.withCareer(async (career) => {
      const rows = this.ensureCollection(entityName, career, { persist: true });
      const indexById = new Map(rows.map((row, index) => [row?.id, index]).filter(([id]) => id));
      const timestamp = new Date().toISOString();
      const result = [];
      for (const item of updates) {
        if (!item?.id) continue;
        const index = indexById.get(item.id);
        if (index === undefined) {
          const record = { ...clone(item), id: item.id, created_date: item.created_date || timestamp, updated_date: timestamp };
          rows.push(record);
          indexById.set(item.id, rows.length - 1);
          result.push(record);
        } else {
          rows[index] = { ...rows[index], ...clone(item), id: item.id, updated_date: timestamp };
          result.push(rows[index]);
        }
      }
      return result;
    }, { save: true });
  }

  /**
   * Aplica um conjunto heterogêneo de alterações em uma única gravação do save.
   * A operação playerUpdate atualiza o perfil raiz; as demais atuam nas coleções.
   */
  async batch(operations = [], options = {}) {
    if (!Array.isArray(operations) || operations.length === 0) {
      return { records: [], player: null, skipped: false, writes: 0 };
    }
    if (options.idempotencyKey) {
      const alreadyProcessed = await this.withCareer((career) => (
        Array.isArray(career.player?.processed_match_finalizations)
        && career.player.processed_match_finalizations.includes(options.idempotencyKey)
      ), { save: false });
      if (alreadyProcessed) {
        const player = await this.withCareer((career) => clone(career.player), { save: false });
        return { records: [], player, skipped: true, writes: 0 };
      }
    }
    const touched = new Set(operations.map((operation) => operation?.entityName).filter(Boolean));
    touched.forEach((entityName) => this.invalidate(entityName));
    const result = await this.withCareer(async (career) => {
      const processedKeys = new Set(career.player?.processed_match_finalizations || []);
      if (options.idempotencyKey && processedKeys.has(options.idempotencyKey)) {
        return { records: [], player: career.player, skipped: true, writes: 0 };
      }

      const timestamp = new Date().toISOString();
      const records = [];
      for (const operation of operations) {
        if (!operation || typeof operation !== 'object') continue;
        if (operation.type === 'playerUpdate') {
          if (!career.player || (operation.id && career.player.id !== operation.id)) {
            throw new Error(`PlayerProfile não encontrado para atualização: ${operation.id || 'sem id'}`);
          }
          career.player = { ...career.player, ...normalizeFatiguePatch(clone(operation.data || {})), id: career.player.id, updated_date: timestamp };
          records.push(career.player);
          continue;
        }

        const entityName = operation.entityName;
        if (!entityName) throw new Error('entityName obrigatório em operação batch.');
        const rows = this.ensureCollection(entityName, career, { persist: true });
        const id = operation.id || operation.data?.id || makeId(entityName.toLowerCase());
        const index = rows.findIndex((row) => row?.id === id);
        if (operation.type === 'delete') {
          if (index >= 0) rows.splice(index, 1);
          records.push({ id, success: true });
          continue;
        }
        if (operation.type === 'create' && index >= 0) throw new Error(`${entityName} já existe com o id: ${id}`);
        if (operation.type === 'update' && index < 0) throw new Error(`${entityName} não encontrado para atualização: ${id}`);
        const data = clone(operation.data || {});
        if (index < 0) {
          const record = { ...data, id, created_date: data.created_date || timestamp, updated_date: timestamp };
          rows.push(record);
          records.push(record);
        } else {
          rows[index] = { ...rows[index], ...data, id, updated_date: timestamp };
          records.push(rows[index]);
        }
      }

      if (options.idempotencyKey) {
        const nextKeys = [...processedKeys, options.idempotencyKey].slice(-250);
        career.player = { ...career.player, processed_match_finalizations: nextKeys, updated_date: timestamp };
      }
      return { records, player: career.player, skipped: false, writes: 1 };
    }, { save: true });
    return result;
  }

  async count(entityName, query = {}) {
    const rows = await this.filter(entityName, query);
    return rows.length;
  }
}
