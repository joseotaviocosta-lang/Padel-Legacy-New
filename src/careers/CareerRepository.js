import { GameStorage } from '../storage/GameStorage.js';
import { CAREER_INDEX_FILE_NAME, CAREERS_DIRECTORY, CAREER_BACKUPS_DIRECTORY } from './careerSchema.js';
import { validateCareerData, validateCareerIndex } from './CareerValidator.js';
import { migrateCareer, migrateIndex } from './CareerMigration.js';

const careerFileName = (careerId) => `${careerId}.json`;
const backupFolderName = (careerId) => `career-${careerId}`;

export class CareerRepository {
  constructor(storage = new GameStorage()) {
    this.storage = storage;
    this.indexLock = Promise.resolve();
  }

  async initialize() {
    await this.storage.initialize();
    await Promise.all([
      this.storage.ensureDirectory(CAREERS_DIRECTORY),
      this.storage.ensureDirectory(CAREER_BACKUPS_DIRECTORY),
    ]);
  }

  async withIndexLock(fn) {
    const next = this.indexLock.then(fn, fn);
    this.indexLock = next.catch(() => {});
    return next;
  }

  async readIndex() {
    await this.initialize();
    const index = await this.storage.readJsonIfExists(CAREER_INDEX_FILE_NAME, {
      schema_version: 1,
      last_career_id: null,
      careers: [],
    });
    const migrated = migrateIndex(index);
    if (migrated.migrated) await this.storage.writeJson(CAREER_INDEX_FILE_NAME, migrated.data, { backup: true, validate: false });
    return validateCareerIndex(migrated.data);
  }

  async writeIndex(index) {
    await this.initialize();
    const validated = validateCareerIndex(index);
    return this.withIndexLock(async () => {
      return this.storage.writeJson(CAREER_INDEX_FILE_NAME, validated, { backup: false });
    });
  }

  async updateIndex(fn) {
    await this.initialize();
    return this.withIndexLock(async () => {
      const current = await this.readIndex();
      const updated = await fn(JSON.parse(JSON.stringify(current)));
      const validated = validateCareerIndex(updated);
      return this.storage.writeJson(CAREER_INDEX_FILE_NAME, validated, { backup: false });
    });
  }

  async getCareerPath(careerId) {
    if (!careerId || typeof careerId !== 'string') {
      throw new Error('careerId inválido.');
    }
    return `${CAREERS_DIRECTORY}/${careerFileName(careerId)}`;
  }

  async careerExists(careerId) {
    const path = await this.getCareerPath(careerId);
    return this.storage.exists(path);
  }

  async readCareer(careerId) {
    const path = await this.getCareerPath(careerId);
    const rawCareer = await this.storage.readJson(path);

    // A migração precisa ocorrer antes da validação estrita. Saves de versões
    // anteriores são válidos para a versão em que foram criados, mas ainda não
    // satisfazem necessariamente o schema atual.
    const migration = migrateCareer(rawCareer);
    const validated = validateCareerData(migration.data);

    if (validated.career_id !== careerId) {
      throw new Error('career_id no arquivo difere do careerId solicitado.');
    }

    if (migration.migrated) {
      // writeJson com backup preserva o arquivo antigo antes da atualização.
      await this.storage.writeJson(path, validated, { backup: true, validate: false });
    }

    return validated;
  }

  async writeCareer(careerId, data, options = {}) {
    const path = await this.getCareerPath(careerId);
    const validated = validateCareerData(data);
    if (validated.career_id !== careerId) {
      throw new Error('career_id no conteúdo difere do careerId solicitado.');
    }
    // Gravações rotineiras não devem criar backup físico em toda pequena
    // alteração de entidade. O ActiveCareerAdapter decide quando um backup
    // completo é necessário (por padrão, no máximo uma vez a cada 5 min).
    return this.storage.writeJson(path, validated, {
      backup: options.backup !== false,
      validate: false,
      pretty: options.pretty === true,
    });
  }

  async deleteCareerFile(careerId) {
    const path = await this.getCareerPath(careerId);
    return this.storage.remove(path);
  }

  async listCareerFiles() {
    await this.initialize();
    const entries = await this.storage.list(CAREERS_DIRECTORY);
    return entries.filter((entry) => !entry.isDirectory && entry.name.endsWith('.json')).map((entry) => entry.name);
  }

  async listCareerIds() {
    const files = await this.listCareerFiles();
    return files.map((name) => name.replace(/\.json$/i, ''));
  }

  async listBackupFiles(careerId) {
    await this.initialize();
    const folder = await this.backupDirectory(careerId);
    if (!(await this.storage.exists(folder))) {
      return [];
    }
    const entries = await this.storage.list(folder);
    return entries.filter((entry) => !entry.isDirectory && entry.name.endsWith('.json')).map((entry) => `${folder}/${entry.name}`);
  }

  async backupDirectory(careerId) {
    await this.initialize();
    return `${CAREER_BACKUPS_DIRECTORY}/${backupFolderName(careerId)}`;
  }

  async writeBackup(careerId, data) {
    const folder = await this.backupDirectory(careerId);
    await this.storage.ensureDirectory(folder);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup-${timestamp}.json`;
    const path = `${folder}/${fileName}`;
    return this.storage.writeJson(path, data, { backup: false, validate: false });
  }

  async deleteBackupFolder(careerId) {
    const folder = await this.backupDirectory(careerId);
    const exists = await this.storage.exists(folder);
    if (!exists) return false;
    const entries = await this.storage.list(folder);
    for (const entry of entries) {
      await this.storage.remove(`${folder}/${entry.name}`);
    }
    return this.storage.remove(folder);
  }
}
