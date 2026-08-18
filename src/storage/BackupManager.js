import { StorageError } from './StorageError.js';

export class BackupManager {
  constructor(storage) {
    this.storage = storage;
  }

  async backupFile(sourcePath, backupPath, {
    maxBackups = 3,
    sourceKnownToExist = false,
    directoryReady = false,
    caller = 'BackupManager.backupFile',
  } = {}) {
    if (!sourceKnownToExist && !(await this.storage.exists(sourcePath, { caller: `${caller}:source-exists` }))) {
      throw new StorageError('Não foi possível criar o backup: arquivo original não encontrado.', 'BACKUP_SOURCE_MISSING');
    }

    const backupDirectory = backupPath.split('/').slice(0, -1).join('/');
    if (backupDirectory && !directoryReady) {
      await this.storage.ensureDirectory(backupDirectory, { caller: `${caller}:directory` });
    }

    const existingBackups = [];
    const backupBaseName = backupPath;
    for (let index = 0; index < maxBackups; index += 1) {
      const rotationPath = index === 0 ? backupBaseName : `${backupBaseName}.${index + 1}`;
      if (await this.storage.exists(rotationPath, { caller: `${caller}:rotation-exists` })) {
        existingBackups.push(rotationPath);
      }
    }

    for (let index = existingBackups.length - 1; index >= 0; index -= 1) {
      const currentPath = existingBackups[index];
      const rotatedPath = `${backupBaseName}.${index + 2}`;
      if (await this.storage.exists(rotatedPath, { caller: `${caller}:rotated-exists` })) {
        await this.storage.remove(rotatedPath, { knownToExist: true, caller: `${caller}:rotated-remove` });
      }
      await this.storage.rename(currentPath, rotatedPath, { ensureParent: false, caller: `${caller}:rotate` });
    }

    await this.storage.copy(sourcePath, backupPath, { ensureParent: false, caller: `${caller}:copy` });
    return backupPath;
  }

  async restoreBackup(backupPath, targetPath) {
    if (!(await this.storage.exists(backupPath))) {
      throw new StorageError('Não foi possível restaurar o backup: arquivo de backup não encontrado.', 'BACKUP_MISSING');
    }
    if (await this.storage.exists(targetPath)) {
      await this.storage.remove(targetPath);
    }
    await this.storage.copy(backupPath, targetPath);
    return targetPath;
  }
}
