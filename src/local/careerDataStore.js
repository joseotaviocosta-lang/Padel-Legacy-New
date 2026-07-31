import { CareerManager } from '@/careers/CareerManager.js';
import { CareerEntityRepository } from '@/gameplay/repositories/CareerEntityRepository.js';
import { gameRepository } from '@/gameplay/services/runtime.js';

const entityRepository = new CareerEntityRepository(gameRepository);
const manager = new CareerManager();

function clone(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

async function requireActiveCareer({ fresh = true } = {}) {
  const career = await gameRepository.getActiveCareer({ fresh });
  if (!career) {
    throw new Error('Nenhuma carreira selecionada. Escolha uma carreira na tela inicial.');
  }
  return career;
}

/**
 * Armazenamento local compatível com a API de entidades do jogo.
 *
 * A partir da Foundation 0.3.0.1 esta fachada NÃO possui armazenamento próprio.
 * Todas as entidades são lidas e gravadas dentro do JSON da carreira ativa por
 * CareerRepository -> GameStorage -> TauriStorage.
 */
export const careerDataStore = {
  async ready() {
    await requireActiveCareer();
    return true;
  },
  list: (entity, sort = null, limit = null) => entityRepository.list(entity, sort, limit),
  filter: (entity, query = {}, sort = null, limit = null) => entityRepository.filter(entity, query, sort, limit),
  get: (entity, id) => entityRepository.get(entity, id),
  create: (entity, data = {}) => entityRepository.create(entity, data),
  update: (entity, id, data = {}) => entityRepository.update(entity, id, data),
  delete: (entity, id) => entityRepository.delete(entity, id),
  bulkCreate: (entity, data = []) => entityRepository.bulkCreate(entity, data),
  bulkUpdate: (entity, updates = []) => entityRepository.bulkUpdate(entity, updates),
  count: (entity, query = {}) => entityRepository.count(entity, query),

  async checkpoint(reason = 'manual') {
    const career = await requireActiveCareer();
    career.__save_meta = {
      ...(career.__save_meta || {}),
      checkpoint_reason: reason,
      checkpoint_at: new Date().toISOString(),
    };
    const saved = await gameRepository.saveActiveCareer(career);
    return { success: true, saved_at: saved.updated_at, reason };
  },

  async exportPersistent() {
    const career = await requireActiveCareer();
    return {
      format: 'padel-legacy-career',
      career_id: career.career_id,
      schema_version: career.save_schema_version,
      exported_at: new Date().toISOString(),
      career: clone(career),
    };
  },

  async import(data) {
    const source = data?.career || data;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new Error('Arquivo de save inválido.');
    }
    const active = await requireActiveCareer();
    if (source.career_id && source.career_id !== active.career_id) {
      throw new Error('O save importado pertence a outra carreira.');
    }
    const saved = await gameRepository.saveActiveCareer({
      ...clone(source),
      career_id: active.career_id,
    });
    return clone(saved);
  },

  async restoreBackup() {
    const career = await requireActiveCareer({ fresh: false });
    const restored = await manager.restoreCareerBackup(career.career_id);
    gameRepository.setActiveCareer(restored);
    return clone(restored);
  },

  async status() {
    const career = await gameRepository.getActiveCareer({ fresh: false });
    return {
      ready: Boolean(career),
      active_career_id: career?.career_id || null,
      schema_version: career?.save_schema_version || null,
      saved_at: career?.updated_at || null,
      dirty: false,
      storage: 'CareerRepository / GameStorage / TauriStorage',
      entities: Object.keys(career?.entities || {}).length,
    };
  },

  export() {
    return clone(gameRepository.adapter?.activeCareer || {});
  },

  storageKey: 'careers/<career-id>.json',
  schemaVersion: 2,
};

export const careerManager = {
  async list() {
    return manager.listCareers({ includeArchived: true });
  },
  async activeId() {
    return manager.getLastCareer();
  },
  async close() {
    await manager.clearLastCareer();
    gameRepository.clearActiveCareer();
    return true;
  },
};
