import { TauriStorage } from './TauriStorage.js';
import { BackupManager } from './BackupManager.js';
import { validateSaveData, normalizeCareerMetadata, validateStoragePayload } from './SaveValidator.js';
import { StorageError } from './StorageError.js';

const CAREERS_DIRECTORY = 'careers';
const BACKUPS_DIRECTORY = 'backups';
const TEMP_DIRECTORY = 'temp';
const EXPORTS_DIRECTORY = 'exports';

const formatTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const careerFileName = (careerId) => `${careerId}.json`;
const backupFileName = (careerId) => `${careerId}-${formatTimestamp()}-backup.json`;
const tempFileName = (careerId) => `${careerId}-${formatTimestamp()}.tmp.json`;
const exportFileName = (careerId) => `${careerId}-${formatTimestamp()}-export.json`;

function pathJoin(...segments) {
  return segments.filter(Boolean).join('/');
}

function getFileName(relativePath) {
  return relativePath.split('/').pop() ?? relativePath;
}

export class GameStorage {
  constructor(storage = new TauriStorage()) {
    this.storage = storage;
    this.backupManager = new BackupManager(this.storage);
    this.initialized = false;
    this.writeLocks = new Map();
  }

  async initialize() {
    if (this.initialized) return;
    if (!this.storage.isSupported()) {
      throw new StorageError('O ambiente Tauri não está disponível.', 'TAURI_UNSUPPORTED');
    }
    await this.storage.initialize();
    this.initialized = true;
  }

  async ensureBaseDirectories() {
    await Promise.all([
      this.storage.ensureDirectory(CAREERS_DIRECTORY),
      this.storage.ensureDirectory(BACKUPS_DIRECTORY),
      this.storage.ensureDirectory(TEMP_DIRECTORY),
      this.storage.ensureDirectory(EXPORTS_DIRECTORY),
    ]);
  }

  getDataDirectory() {
    return this.storage.getDataDirectoryDescription();
  }

  careerPath(careerId) {
    return pathJoin(CAREERS_DIRECTORY, careerFileName(careerId));
  }

  backupPath(careerId) {
    return pathJoin(BACKUPS_DIRECTORY, backupFileName(careerId));
  }

  tempPath(careerId) {
    return pathJoin(TEMP_DIRECTORY, tempFileName(careerId));
  }

  exportPath(careerId) {
    return pathJoin(EXPORTS_DIRECTORY, exportFileName(careerId));
  }

  async readJson(relativePath) {
    await this.initialize();
    const normalizedPath = relativePath;
    if (!(await this.storage.exists(normalizedPath))) {
      throw new StorageError(
        `O arquivo não existe no armazenamento local: ${normalizedPath}`,
        'FILE_NOT_FOUND'
      );
    }

    let raw;
    try {
      raw = await this.storage.readText(normalizedPath);
    } catch (error) {
      // O arquivo pode desaparecer entre exists() e readText(). Mantemos o
      // mesmo contrato de erro para que os consumidores possam distinguir
      // ausência esperada de falhas reais de leitura.
      if (error?.code === 'FILE_NOT_FOUND') {
        throw new StorageError(
          `O arquivo não existe no armazenamento local: ${normalizedPath}`,
          'FILE_NOT_FOUND'
        );
      }
      throw error;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new StorageError(
        `Falha ao analisar o arquivo JSON: ${normalizedPath}`,
        'INVALID_JSON'
      );
    }
  }

  /**
   * Lê um JSON opcional sem transformar a primeira execução em erro.
   *
   * Retorna defaultValue somente quando o arquivo realmente não existe.
   * JSON inválido, falta de permissão e outros erros continuam sendo lançados,
   * evitando mascarar corrupção de dados ou falhas reais do armazenamento.
   */
  async readJsonIfExists(relativePath, defaultValue = null) {
    await this.initialize();
    const normalizedPath = relativePath;

    if (!(await this.storage.exists(normalizedPath))) {
      return defaultValue;
    }

    try {
      return await this.readJson(normalizedPath);
    } catch (error) {
      // Protege também contra a condição de corrida em que o arquivo é
      // removido entre a verificação de existência e a leitura.
      if (error?.code === 'FILE_NOT_FOUND') {
        return defaultValue;
      }
      throw error;
    }
  }

  /**
   * Lê um JSON opcional e o cria atomicamente com o valor padrão quando ainda
   * não existe. Útil para índices, preferências, caches e rankings locais.
   */
  async readJsonOrCreate(relativePath, defaultValue, options = {}) {
    const existing = await this.readJsonIfExists(relativePath, undefined);
    if (existing !== undefined) {
      return existing;
    }

    const initialValue = typeof defaultValue === 'function'
      ? await defaultValue()
      : defaultValue;

    return this.writeJson(relativePath, initialValue, {
      backup: false,
      ...options,
    });
  }

  async writeJson(relativePath, data, options = {}) {
    await this.initialize();
    const normalizedPath = relativePath;
    const previous = this.writeLocks.get(normalizedPath) || Promise.resolve();
    const operation = previous
      .catch(() => {})
      .then(() => this.writeJsonUnlocked(normalizedPath, data, options));

    this.writeLocks.set(normalizedPath, operation);
    try {
      return await operation;
    } finally {
      if (this.writeLocks.get(normalizedPath) === operation) {
        this.writeLocks.delete(normalizedPath);
      }
    }
  }

  async writeJsonUnlocked(normalizedPath, data, options = {}) {
    const validatedData = options.validate === false ? data : validateStoragePayload(data, { requireObject: true });
    // Saves de carreira podem ser grandes. JSON indentado aumenta bastante o
    // volume escrito/lido e o custo de comparação. Por padrão persistimos em
    // formato compacto; relatórios/exportações continuam livres para formatar.
    const serialized = options.pretty === true
      ? `${JSON.stringify(validatedData, null, 2)}\n`
      : `${JSON.stringify(validatedData)}\n`;
    const tempPath = pathJoin(TEMP_DIRECTORY, `${getFileName(normalizedPath)}-${formatTimestamp()}.tmp.json`);

    try {
      await this.storage.writeText(tempPath, serialized);
      const tempContent = await this.storage.readText(tempPath);
      if (tempContent !== serialized) {
        throw new StorageError('A escrita temporária não corresponde ao conteúdo original.', 'TEMP_WRITE_MISMATCH');
      }

      if (options.backup !== false && (await this.storage.exists(normalizedPath))) {
        const backupDestination = pathJoin(BACKUPS_DIRECTORY, `${getFileName(normalizedPath)}-${formatTimestamp()}-backup.json`);
        await this.backupManager.backupFile(normalizedPath, backupDestination);
      }

      if (await this.storage.exists(normalizedPath)) {
        await this.storage.remove(normalizedPath);
      }
      await this.storage.rename(tempPath, normalizedPath);

      const realContent = await this.storage.readText(normalizedPath);
      if (realContent !== serialized) {
        throw new StorageError('A validação do arquivo principal falhou.', 'FINAL_WRITE_MISMATCH');
      }
      JSON.parse(realContent);
      return validatedData;
    } finally {
      if (await this.storage.exists(tempPath)) {
        try {
          await this.storage.remove(tempPath);
        } catch (error) {
          // keep the temp cleanup best-effort
        }
      }
    }
  }

  async exists(relativePath) {
    await this.initialize();
    return this.storage.exists(relativePath);
  }

  async remove(relativePath) {
    await this.initialize();
    return this.storage.remove(relativePath);
  }

  async copy(sourcePath, destinationPath) {
    await this.initialize();
    return this.storage.copy(sourcePath, destinationPath);
  }

  async list(relativeDirectory) {
    await this.initialize();
    return this.storage.list(relativeDirectory);
  }

  async ensureDirectory(relativeDirectory) {
    await this.initialize();
    return this.storage.ensureDirectory(relativeDirectory);
  }

  async writeCareer(careerId, saveData, { backup = true } = {}) {
    await this.initialize();
    const validated = validateSaveData(saveData);
    await this.writeJson(this.careerPath(careerId), validated, { backup, validate: false });
    return validated;
  }

  async readCareer(careerId) {
    await this.initialize();
    const path = this.careerPath(careerId);
    if (!(await this.storage.exists(path))) {
      throw new StorageError('Carreira não encontrada no armazenamento local.', 'CAREER_NOT_FOUND');
    }
    return this.readJson(path);
  }

  async listCareerFiles() {
    await this.initialize();
    const entries = await this.list(CAREERS_DIRECTORY);
    return entries.filter((entry) => !entry.isDirectory && entry.name.endsWith('.json')).map((entry) => entry.name);
  }

  async listCareers() {
    await this.initialize();
    const files = await this.listCareerFiles();
    const careers = [];
    for (const fileName of files) {
      try {
        const id = String(fileName).replace(/\.json$/i, '');
        const career = await this.readCareer(id);
        careers.push({ id, metadata: normalizeCareerMetadata(career.__save_meta || {}), path: fileName });
      } catch (error) {
        // ignore invalid or unreadable files during listing
      }
    }
    return careers;
  }

  async deleteCareer(careerId) {
    await this.initialize();
    const careerPath = this.careerPath(careerId);
    if (await this.storage.exists(careerPath)) {
      await this.storage.remove(careerPath);
    }
    return true;
  }

  async exportCareer(careerId) {
    await this.initialize();
    const source = await this.readCareer(careerId);
    const exportPath = this.exportPath(careerId);
    await this.writeJson(exportPath, source, { backup: false, validate: false });
    return exportPath;
  }

  async restoreLatestBackup(careerId) {
    await this.initialize();
    const entries = await this.list(BACKUPS_DIRECTORY);
    const backups = entries
      .filter((entry) => !entry.isDirectory && entry.name.includes(careerId))
      .map((entry) => entry.name)
      .sort();
    if (backups.length === 0) {
      throw new StorageError('Nenhum backup disponível para restauração.', 'BACKUP_NOT_FOUND');
    }
    const latestBackup = backups[backups.length - 1];
    const backupPath = pathJoin(BACKUPS_DIRECTORY, latestBackup);
    const targetPath = this.careerPath(careerId);
    await this.backupManager.restoreBackup(backupPath, targetPath);
    return await this.readCareer(careerId);
  }

  async status() {
    await this.initialize();
    return {
      ready: true,
      storage: 'Tauri FS plugin',
      root: this.getDataDirectory(),
      careers: await this.listCareerFiles(),
    };
  }
}
