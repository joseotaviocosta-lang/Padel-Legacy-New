import { StorageError } from './StorageError.js';

export class BackupManager {
  constructor(storage) {
    this.storage = storage;
  }

  async backupFile(sourcePath, backupPath, { maxBackups = 3 } = {}) {
    if (!(await this.storage.exists(sourcePath))) {
      throw new StorageError('Não foi possível criar o backup: arquivo original não encontrado.', 'BACKUP_SOURCE_MISSING');
    }

    const backupDirectory = backupPath.split('/').slice(0, -1).join('/');
    if (backupDirectory) {
      await this.storage.ensureDirectory(backupDirectory);
    }

    const existingBackups = [];
    const backupBaseName = backupPath;
    for (let index = 0; index < maxBackups; index += 1) {
      const rotationPath = index === 0 ? backupBaseName : `${backupBaseName}.${index + 1}`;
      if (await this.storage.exists(rotationPath)) {
        existingBackups.push(rotationPath);
      }
    }

    for (let index = existingBackups.length - 1; index >= 0; index -= 1) {
      const currentPath = existingBackups[index];
      const rotatedPath = `${backupBaseName}.${index + 2}`;
      if (await this.storage.exists(rotatedPath)) {
        await this.storage.remove(rotatedPath);
      }
      await this.storage.rename(currentPath, rotatedPath);
    }

    await this.storage.copy(sourcePath, backupPath);
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
