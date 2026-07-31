import { validateCareerData, validateCareerIndex } from './CareerValidator.js';
import { migrateCareer, migrateIndex } from './CareerMigration.js';
import { createDefaultCareerData } from './careerDefaults.js';
import { CareerRepository } from './CareerRepository.js';
import { CAREER_INDEX_FILE_NAME, CAREER_BACKUPS_DIRECTORY } from './careerSchema.js';

function cloneDeep(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeName(name, field) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`${field} deve ser uma string não vazia.`);
  }
  return name.trim();
}

function createSummaryFromCareer(career) {
  return {
    id: career.career_id,
    save_name: career.career_name,
    player_name: career.metadata.player_name,
    court_side: career.metadata.court_side,
    play_style: career.metadata.play_style,
    career_type: career.career_type,
    career_date: career.metadata.career_date,
    ranking_position: career.metadata.ranking_position,
    season: career.metadata.season,
    created_at: career.created_at,
    updated_at: career.updated_at,
    last_played_at: career.last_played_at,
    archived: career.metadata.archived,
  };
}

export class CareerManager {
  constructor(repository = new CareerRepository()) {
    this.repository = repository;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    await this.repository.initialize();
    await this.repository.writeIndex(await this.repository.readIndex());
    this.initialized = true;
  }

  async loadFreshIndex() {
    await this.initialize();
    const index = await this.repository.readIndex();
    const migrated = migrateIndex(index);
    if (migrated.migrated) {
      await this.repository.writeIndex(migrated.data);
      return migrated.data;
    }
    return index;
  }

  async listCareers({ includeArchived = false, careerType } = {}) {
    const index = await this.loadFreshIndex();
    const filtered = index.careers.filter((item) => {
      if (!includeArchived && item.archived) return false;
      if (careerType && item.career_type !== careerType) return false;
      return true;
    });
    return filtered.sort((a, b) => new Date(b.last_played_at).getTime() - new Date(a.last_played_at).getTime());
  }

  async getCareerSummary(careerId) {
    const index = await this.loadFreshIndex();
    const item = index.careers.find((entry) => entry.id === careerId);
    if (!item) throw new Error('Carreira não encontrada no índice.');
    return item;
  }

  async createCareer(data) {
    const defaultData = createDefaultCareerData(data);
    const index = await this.loadFreshIndex();
    if (index.careers.some((item) => item.id === defaultData.career_id)) {
      throw new Error('Carreira já existe com o mesmo career_id.');
    }

    const summary = createSummaryFromCareer(defaultData);
    index.careers.push(summary);
    index.last_career_id = defaultData.career_id;

    await this.repository.writeCareer(defaultData.career_id, defaultData);
    try {
      await this.repository.writeIndex(index);
    } catch (error) {
      await this.repository.deleteCareerFile(defaultData.career_id);
      throw error;
    }

    return {
      summary,
      career: defaultData,
    };
  }

  async loadCareer(careerId) {
    const index = await this.loadFreshIndex();
    const entry = index.careers.find((item) => item.id === careerId);
    if (!entry) {
      throw new Error('Carreira não encontrada no índice.');
    }

    const career = await this.repository.readCareer(careerId);
    const migrated = migrateCareer(career);
    const careerData = migrated.data;
    if (migrated.migrated) {
      await this.repository.writeCareer(careerId, careerData);
    }
    careerData.last_played_at = new Date().toISOString();
    careerData.updated_at = careerData.last_played_at;
    await this.repository.writeCareer(careerId, careerData);

    entry.last_played_at = careerData.last_played_at;
    index.last_career_id = careerId;
    await this.repository.writeIndex(index);

    return careerData;
  }

  async saveCareer(careerId, careerData, { backup = true } = {}) {
    const index = await this.loadFreshIndex();
    const entry = index.careers.find((item) => item.id === careerId);
    if (!entry) throw new Error('Carreira não encontrada no índice.');

    const validated = validateCareerData(careerData);
    if (validated.career_id !== careerId) {
      throw new Error('career_id no conteúdo não pode ser alterado.');
    }
    validated.updated_at = new Date().toISOString();
    const summary = createSummaryFromCareer(validated);

    await this.repository.writeCareer(careerId, validated, { backup });

    Object.assign(entry, summary);
    await this.repository.writeIndex(index);

    return validated;
  }

  async renameCareer(careerId, newName) {
    const index = await this.loadFreshIndex();
    const entry = index.careers.find((item) => item.id === careerId);
    if (!entry) throw new Error('Carreira não encontrada no índice.');
    const normalized = normalizeName(newName, 'Nome da carreira');

    const career = await this.repository.readCareer(careerId);
    career.career_name = normalized;
    career.updated_at = new Date().toISOString();
    const summary = createSummaryFromCareer(career);

    await this.repository.writeCareer(careerId, career);
    Object.assign(entry, summary);
    await this.repository.writeIndex(index);

    return summary;
  }

  async duplicateCareer(careerId, { careerType = 'experiment' } = {}) {
    const original = await this.repository.readCareer(careerId);
    const clone = cloneDeep(original);
    clone.career_id = `${careerId}-${Math.random().toString(36).slice(2, 8)}`;
    clone.career_name = `${clone.career_name} (cópia)`;
    clone.career_type = careerType;
    const createdAt = new Date().toISOString();
    clone.created_at = createdAt;
    clone.updated_at = createdAt;
    clone.last_played_at = createdAt;
    clone.metadata.archived = false;
    clone.metadata.career_date = createdAt.slice(0, 10);

    const summary = createSummaryFromCareer(clone);
    const index = await this.loadFreshIndex();
    if (index.careers.some((item) => item.id === clone.career_id)) {
      throw new Error('ID duplicado gerado durante duplicação.');
    }

    await this.repository.writeCareer(clone.career_id, clone);
    index.careers.push(summary);
    index.last_career_id = clone.career_id;
    await this.repository.writeIndex(index);

    return { summary, career: clone };
  }

  async deleteCareer(careerId, { confirmed = false } = {}) {
    if (!confirmed) {
      throw new Error('Confirmação necessária para excluir a carreira.');
    }

    const index = await this.loadFreshIndex();
    const position = index.careers.findIndex((item) => item.id === careerId);
    if (position === -1) throw new Error('Carreira não encontrada no índice.');

    await this.repository.deleteCareerFile(careerId);
    await this.repository.deleteBackupFolder(careerId);
    index.careers.splice(position, 1);
    if (index.last_career_id === careerId) {
      index.last_career_id = null;
    }
    await this.repository.writeIndex(index);

    return true;
  }

  async archiveCareer(careerId) {
    const index = await this.loadFreshIndex();
    const entry = index.careers.find((item) => item.id === careerId);
    if (!entry) throw new Error('Carreira não encontrada no índice.');

    const career = await this.repository.readCareer(careerId);
    career.metadata.archived = true;
    career.updated_at = new Date().toISOString();
    const summary = createSummaryFromCareer(career);

    await this.repository.writeCareer(careerId, career);
    Object.assign(entry, summary);
    await this.repository.writeIndex(index);

    return summary;
  }

  async restoreArchivedCareer(careerId) {
    const index = await this.loadFreshIndex();
    const entry = index.careers.find((item) => item.id === careerId);
    if (!entry) throw new Error('Carreira não encontrada no índice.');

    const career = await this.repository.readCareer(careerId);
    career.metadata.archived = false;
    career.updated_at = new Date().toISOString();
    const summary = createSummaryFromCareer(career);

    await this.repository.writeCareer(careerId, career);
    Object.assign(entry, summary);
    await this.repository.writeIndex(index);

    return summary;
  }

  async setLastCareer(careerId) {
    const index = await this.loadFreshIndex();
    if (!index.careers.some((item) => item.id === careerId)) {
      throw new Error('Carreira não encontrada no índice.');
    }
    index.last_career_id = careerId;
    await this.repository.writeIndex(index);
    return careerId;
  }

  async getLastCareer() {
    const index = await this.loadFreshIndex();
    return index.last_career_id;
  }

  async exportCareer(careerId) {
    const career = await this.loadCareer(careerId);
    return career;
  }

  async importCareer(data) {
    const careerData = validateCareerData(data);
    const index = await this.loadFreshIndex();
    if (index.careers.some((item) => item.id === careerData.career_id)) {
      throw new Error('Carreira já existe com o mesmo career_id.');
    }
    const summary = createSummaryFromCareer(careerData);
    index.careers.push(summary);
    index.last_career_id = careerData.career_id;

    await this.repository.writeCareer(careerData.career_id, careerData);
    try {
      await this.repository.writeIndex(index);
    } catch (error) {
      await this.repository.deleteCareerFile(careerData.career_id);
      throw error;
    }
    return { summary, career: careerData };
  }

  async restoreCareerBackup(careerId) {
    const backups = await this.repository.listBackupFiles(careerId);
    if (backups.length === 0) {
      throw new Error('Nenhum backup encontrado para a carreira.');
    }
    const latestBackup = backups.sort().pop();
    const raw = await this.repository.storage.readJson(latestBackup);
    const validated = validateCareerData(raw);
    await this.repository.writeCareer(careerId, validated);
    return validated;
  }

  async validateCareer(careerData) {
    return validateCareerData(careerData);
  }
}
