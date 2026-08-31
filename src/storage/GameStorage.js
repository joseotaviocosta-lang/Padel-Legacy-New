import { TauriStorage } from './TauriStorage.js';
import { BackupManager } from './BackupManager.js';
import { validateSaveData, normalizeCareerMetadata, validateStoragePayload } from './SaveValidator.js';
import { StorageError } from './StorageError.js';
import { measureStorageOperation } from '../dev/storageIOProbe.js';
import { registerBetaDiagnostic } from '../lib/betaDiagnostics.js';

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

  async readJson(relativePath, { knownToExist = false, caller = 'GameStorage.readJson' } = {}) {
    await this.initialize();
    const normalizedPath = relativePath;
    let pathExists = knownToExist || await this.storage.exists(normalizedPath, { caller: `${caller}:exists` });
    let recoveredFrom = null;
    if (!pathExists) {
      registerBetaDiagnostic({ type: 'CAREER_RECOVERY_START', path: normalizedPath, caller });
      const recoveryPath = pathJoin(TEMP_DIRECTORY, `${getFileName(normalizedPath)}.rollback.json`);
      const recoveryExists = await this.storage.exists(recoveryPath, { caller: `${caller}:recovery-exists` });
      if (recoveryExists) {
        await this.storage.copy(recoveryPath, normalizedPath, {
          ensureParent: false,
          caller: `${caller}:recovery-restore`,
        });
        pathExists = true;
        recoveredFrom = 'crash-rollback';
      }
    }
    if (!pathExists) {
      // Segunda linha de defesa: nenhuma cópia de rollback de crash existia
      // (ou o `crashRecovery` daquela gravação não estava ativo — ver
      // CareerRepository.writeCareer), mas todo write bem-sucedido anterior
      // já deixou uma cópia em backups/ (abaixo, quando destinationExists).
      // Antes de declarar o arquivo perdido, tenta restaurar da cópia de
      // backup mais recente — nunca tratar ausência do arquivo principal
      // como exclusão sem antes esgotar as fontes de recuperação já
      // existentes (pedido explícito do hotfix de persistência crítica).
      const restoredFromBackup = await this.tryRestoreFromBackup(normalizedPath, caller);
      if (restoredFromBackup) {
        pathExists = true;
        recoveredFrom = 'backup';
      }
    }
    if (recoveredFrom) {
      registerBetaDiagnostic({
        type: 'CAREER_RECOVERY_SUCCESS', path: normalizedPath, source: recoveredFrom, caller,
      });
    } else if (!pathExists) {
      registerBetaDiagnostic({ type: 'CAREER_RECOVERY_FAILURE', path: normalizedPath, caller });
    }
    if (!pathExists) {
      throw new StorageError(
        `O arquivo não existe no armazenamento local: ${normalizedPath}`,
        'FILE_NOT_FOUND'
      );
    }

    let raw;
    try {
      raw = await this.storage.readText(normalizedPath, { knownToExist: true, caller: `${caller}:read` });
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
      return await measureStorageOperation(
        { operation: 'parse', key: normalizedPath, caller, layer: 'serialization' },
        () => JSON.parse(raw),
        { bytes: typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(raw).byteLength : raw.length },
      );
    } catch (error) {
      throw new StorageError(
        `Falha ao analisar o arquivo JSON: ${normalizedPath}`,
        'INVALID_JSON'
      );
    }
  }

  /**
   * Última linha de defesa de leitura: procura a cópia de backup mais
   * recente do arquivo (writeJsonUnlocked já cria uma em toda gravação que
   * substitui um arquivo existente, ver `options.backup`) e a restaura no
   * lugar do arquivo principal ausente. Nomes de backup são
   * `${fileName}-${timestampISO}-backup.json` — ordenação lexicográfica do
   * timestamp ISO já é ordenação cronológica.
   */
  async tryRestoreFromBackup(normalizedPath, caller) {
    const fileName = getFileName(normalizedPath);
    const entries = await this.storage.list(BACKUPS_DIRECTORY, { caller: `${caller}:backup-list` }).catch(() => []);
    const candidates = (entries || [])
      .filter((entry) => !entry.isDirectory && entry.name.startsWith(`${fileName}-`) && entry.name.endsWith('-backup.json'))
      .map((entry) => entry.name)
      .sort();
    if (candidates.length === 0) return false;
    const latest = candidates[candidates.length - 1];
    try {
      await this.storage.copy(pathJoin(BACKUPS_DIRECTORY, latest), normalizedPath, {
        ensureParent: false,
        caller: `${caller}:backup-restore`,
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Lê um JSON opcional sem transformar a primeira execução em erro.
   *
   * Retorna defaultValue somente quando o arquivo realmente não existe.
   * JSON inválido, falta de permissão e outros erros continuam sendo lançados,
   * evitando mascarar corrupção de dados ou falhas reais do armazenamento.
   */
  async readJsonIfExists(relativePath, defaultValue = null, { caller = 'GameStorage.readJsonIfExists' } = {}) {
    await this.initialize();
    const normalizedPath = relativePath;

    if (!(await this.storage.exists(normalizedPath, { caller: `${caller}:exists` }))) {
      return defaultValue;
    }

    try {
      return await this.readJson(normalizedPath, { knownToExist: true, caller });
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
    const caller = options.caller || 'GameStorage.writeJson';
    const serialized = await measureStorageOperation(
      { operation: 'stringify', key: normalizedPath, caller, layer: 'serialization' },
      () => options.pretty === true
        ? `${JSON.stringify(validatedData, null, 2)}\n`
        : `${JSON.stringify(validatedData)}\n`,
      { bytes: (value) => typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(value).byteLength : value.length },
    );
    const tempPath = pathJoin(TEMP_DIRECTORY, `${getFileName(normalizedPath)}-${formatTimestamp()}.tmp.json`);
    const recoveryPath = pathJoin(TEMP_DIRECTORY, `${getFileName(normalizedPath)}.rollback.json`);
    let tempNeedsCleanup = true;
    let recoveryNeedsCleanup = false;
    let destinationRemoved = false;

    try {
      await this.storage.writeText(tempPath, serialized, { ensureParent: false, caller: `${caller}:temp-write` });
      const tempContent = await this.storage.readText(tempPath, { knownToExist: true, caller: `${caller}:temp-verify` });
      if (tempContent !== serialized) {
        throw new StorageError('A escrita temporária não corresponde ao conteúdo original.', 'TEMP_WRITE_MISMATCH');
      }

      const destinationExists = await this.storage.exists(normalizedPath, { caller: `${caller}:destination-exists` });
      if (options.backup !== false && destinationExists) {
        const backupDestination = pathJoin(BACKUPS_DIRECTORY, `${getFileName(normalizedPath)}-${formatTimestamp()}-backup.json`);
        await this.backupManager.backupFile(normalizedPath, backupDestination, {
          sourceKnownToExist: true,
          directoryReady: true,
          caller: `${caller}:backup`,
        });
      }

      if (destinationExists) {
        if (options.crashRecovery === true) {
          await this.storage.remove(recoveryPath, { caller: `${caller}:recovery-clean-stale` });
          await this.storage.copy(normalizedPath, recoveryPath, {
            ensureParent: false,
            caller: `${caller}:recovery-copy`,
          });
          recoveryNeedsCleanup = true;
        }
        await this.storage.remove(normalizedPath, { knownToExist: true, caller: `${caller}:replace-remove` });
        destinationRemoved = true;
      }
      await this.storage.rename(tempPath, normalizedPath, { ensureParent: false, caller: `${caller}:atomic-rename` });
      tempNeedsCleanup = false;
      destinationRemoved = false;
      if (recoveryNeedsCleanup) {
        try {
          await this.storage.remove(recoveryPath, { knownToExist: true, caller: `${caller}:recovery-cleanup` });
          recoveryNeedsCleanup = false;
        } catch (error) {
          // O target novo já está completo; rollback antigo pode ser limpo na
          // próxima inicialização/leitura sem transformar sucesso em falha.
        }
      }

      // O temporário já foi relido e comparado byte a byte. O rename preserva
      // esses bytes; reler e parsear o save completo aqui duplicava I/O.
      return validatedData;
    } catch (error) {
      if (destinationRemoved && recoveryNeedsCleanup) {
        try {
          await this.storage.copy(recoveryPath, normalizedPath, {
            ensureParent: false,
            caller: `${caller}:recovery-rollback`,
          });
          destinationRemoved = false;
        } catch (rollbackError) {
          error.rollbackError = rollbackError;
        }
      }
      throw error;
    } finally {
      if (tempNeedsCleanup) {
        try {
          await this.storage.remove(tempPath, { caller: `${caller}:temp-cleanup` });
        } catch (error) {
          // keep the temp cleanup best-effort
        }
      }
      if (recoveryNeedsCleanup && !destinationRemoved) {
        try {
          await this.storage.remove(recoveryPath, { caller: `${caller}:recovery-cleanup` });
        } catch (error) {
          // cleanup best-effort; o alvo já foi restaurado por inteiro
        }
      }
    }
  }

  async exists(relativePath, { caller = 'GameStorage.exists' } = {}) {
    await this.initialize();
    return this.storage.exists(relativePath, { caller });
  }

  async remove(relativePath, { knownToExist = false, caller = 'GameStorage.remove', ...options } = {}) {
    await this.initialize();
    return this.storage.remove(relativePath, { ...options, knownToExist, caller });
  }

  async copy(sourcePath, destinationPath, { caller = 'GameStorage.copy', ...options } = {}) {
    await this.initialize();
    return this.storage.copy(sourcePath, destinationPath, { ...options, caller });
  }

  async list(relativeDirectory, { caller = 'GameStorage.list', ...options } = {}) {
    await this.initialize();
    return this.storage.list(relativeDirectory, { ...options, caller });
  }

  async ensureDirectory(relativeDirectory, { caller = 'GameStorage.ensureDirectory' } = {}) {
    await this.initialize();
    return this.storage.ensureDirectory(relativeDirectory, { caller });
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
    try {
      return await this.readJson(path, { caller: 'GameStorage.readCareer' });
    } catch (error) {
      if (error?.code === 'FILE_NOT_FOUND') {
        throw new StorageError('Carreira não encontrada no armazenamento local.', 'CAREER_NOT_FOUND');
      }
      throw error;
    }
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
