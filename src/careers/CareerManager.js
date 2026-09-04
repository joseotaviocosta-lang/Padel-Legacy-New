import { validateCareerData, validateCareerIndex } from './CareerValidator.js';
import { migrateCareer, migrateIndex } from './CareerMigration.js';
import { createDefaultCareerData, normalizeSaveName } from './careerDefaults.js';
import { CareerRepository } from './CareerRepository.js';
import { CAREER_INDEX_FILE_NAME, CAREER_BACKUPS_DIRECTORY } from './careerSchema.js';
import { registerBetaDiagnostic } from '../lib/betaDiagnostics.js';

function cloneDeep(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function createSummaryFromCareer(career) {
  return {
    id: career.career_id,
    save_name: career.career_name,
    player_name: career.metadata.player_name,
    court_side: career.metadata.court_side,
    play_style: career.metadata.play_style,
    career_difficulty: career.metadata.career_difficulty,
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
    await this.repository.readIndex();
    this.initialized = true;
  }


  async waitUntilCareerIsReadable(careerId, { attempts = 6, delayMs = 25 } = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        if (await this.repository.careerExists(careerId)) {
          return await this.repository.readCareer(careerId);
        }
      } catch (error) {
        lastError = error;
      }
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    if (lastError) throw lastError;
    throw new Error(`A carreira ${careerId} não ficou disponível após a gravação.`);
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

    // Só publique a carreira no índice e para a interface depois que o arquivo
    // principal puder ser relido. Isso fecha a janela em que o tutorial e o
    // ranking montavam contra um save ainda não visível no armazenamento.
    const persistedCareer = await this.waitUntilCareerIsReadable(defaultData.career_id);

    try {
      await this.repository.writeIndex(index);
    } catch (error) {
      await this.repository.deleteCareerFile(defaultData.career_id);
      throw error;
    }

    return {
      summary: createSummaryFromCareer(persistedCareer),
      career: persistedCareer,
    };
  }

  async readCareer(careerId) {
    await this.initialize();
    const index = await this.repository.readIndex();
    if (!index.careers.some((item) => item.id === careerId)) {
      throw new Error('Carreira não encontrada no índice.');
    }
    return this.repository.readCareer(careerId);
  }

  async loadCareer(careerId) {
    registerBetaDiagnostic({ type: 'CAREER_LOAD_START', careerId });
    try {
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

      Object.assign(entry, createSummaryFromCareer(careerData));
      index.last_career_id = careerId;
      await this.repository.writeIndex(index);
      registerBetaDiagnostic({ type: 'CAREER_INDEX_UPDATE', careerId, operation: 'load' });
      registerBetaDiagnostic({ type: 'CAREER_LOAD_SUCCESS', careerId, saveVersion: careerData.save_version });

      // Fase 2.9, item 1B (achado #20) — varredura silenciosa, best-effort:
      // instalações que já testaram versões anteriores (antes da rotação
      // por padrão de nome existir) têm centenas/milhares de arquivos de
      // backup acumulados que a correção da rotação, sozinha, NUNCA
      // removeria (ela só evita acúmulo NOVO). Roda uma vez por
      // carregamento de carreira; uma falha aqui não pode impedir o
      // carregamento em si.
      this.pruneCareerBackups(careerId).catch((error) => {
        registerBetaDiagnostic({ type: 'CAREER_BACKUP_SWEEP_FAILURE', careerId, message: error?.message, code: error?.code });
      });

      return careerData;
    } catch (error) {
      registerBetaDiagnostic({ type: 'CAREER_LOAD_FAILURE', careerId, message: error?.message, code: error?.code });
      throw error;
    }
  }

  /**
   * Fase 2.9, item 1B (achado #20) — poda os DOIS acúmulos de backup
   * (automático por escrita + manual por carreira). Ver
   * `CareerRepository.pruneAllBackups` para o detalhe; exposto aqui pra
   * quem só tem acesso ao `CareerManager` (ex.: `loadCareer` acima).
   */
  async pruneCareerBackups(careerId, { maxBackups = 3 } = {}) {
    return this.repository.pruneAllBackups(careerId, { maxBackups });
  }

  async saveCareer(careerId, careerData, {
    backup = true,
    updateIndex = true,
    // Hotfix persistência crítica: era `false` por padrão aqui, e o caminho
    // mais usado de todos (ActiveCareerAdapter.mutateActiveCareer, toda
    // atualização de entidade fora de uma transação em lote) nunca passava
    // este parâmetro — ou seja, a maioria dos saves reais da carreira corria
    // SEM a cópia de segurança antes de apagar o arquivo antigo. Ver
    // CareerRepository.writeCareer para o mecanismo em si.
    crashRecovery = true,
    caller = 'CareerManager.saveCareer',
  } = {}) {
    registerBetaDiagnostic({ type: 'CAREER_SAVE_START', careerId, caller });
    try {
      const validated = validateCareerData(careerData);
      if (validated.career_id !== careerId) {
        throw new Error('career_id no conteúdo não pode ser alterado.');
      }
      validated.updated_at = new Date().toISOString();
      validated.save_version = Number(validated.save_version || 0) + 1;

      // Gravações rotineiras de entidades não precisam reler + regravar o índice
      // de carreiras em toda pequena alteração. O índice é sincronizado de forma
      // periódica pelo ActiveCareerAdapter e continua obrigatório em saves
      // explícitos/gerenciamento de carreira.
      if (!updateIndex) {
        await this.repository.writeCareer(careerId, validated, { backup, crashRecovery, caller });
        registerBetaDiagnostic({ type: 'CAREER_SAVE_SUCCESS', careerId, saveVersion: validated.save_version, caller });
        return validated;
      }

      const index = await this.loadFreshIndex();
      const entry = index.careers.find((item) => item.id === careerId);
      if (!entry) throw new Error('Carreira não encontrada no índice.');
      const summary = createSummaryFromCareer(validated);

      await this.repository.writeCareer(careerId, validated, { backup, crashRecovery, caller });
      Object.assign(entry, summary);
      await this.repository.writeIndex(index);
      registerBetaDiagnostic({ type: 'CAREER_INDEX_UPDATE', careerId, operation: 'save', caller });
      registerBetaDiagnostic({ type: 'CAREER_SAVE_SUCCESS', careerId, saveVersion: validated.save_version, caller });

      return validated;
    } catch (error) {
      registerBetaDiagnostic({ type: 'CAREER_SAVE_FAILURE', careerId, caller, message: error?.message, code: error?.code });
      throw error;
    }
  }

  async renameCareer(careerId, newName) {
    const index = await this.loadFreshIndex();
    const entry = index.careers.find((item) => item.id === careerId);
    if (!entry) throw new Error('Carreira não encontrada no índice.');
    const normalized = normalizeSaveName(newName);

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

  async clearLastCareer() {
    const index = await this.loadFreshIndex();
    index.last_career_id = null;
    await this.repository.writeIndex(index);
    return true;
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
