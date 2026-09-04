import { StorageError } from './StorageError.js';

export class BackupManager {
  constructor(storage) {
    this.storage = storage;
  }

  async backupFile(sourcePath, backupPath, {
    maxBackups = 3,
    sourceKnownToExist = false,
    directoryReady = false,
    prefix = null,
    caller = 'BackupManager.backupFile',
  } = {}) {
    if (!sourceKnownToExist && !(await this.storage.exists(sourcePath, { caller: `${caller}:source-exists` }))) {
      throw new StorageError('Não foi possível criar o backup: arquivo original não encontrado.', 'BACKUP_SOURCE_MISSING');
    }

    const backupDirectory = backupPath.split('/').slice(0, -1).join('/');
    if (backupDirectory && !directoryReady) {
      await this.storage.ensureDirectory(backupDirectory, { caller: `${caller}:directory` });
    }

    await this.storage.copy(sourcePath, backupPath, { ensureParent: false, caller: `${caller}:copy` });

    // Fase 2.9, item 1 (achado #20): a rotação antiga girava em torno de
    // sufixos numéricos (`.2`, `.3`) sobre o MESMO `backupPath` reusado
    // entre chamadas — mas `GameStorage` embute um timestamp único no nome
    // de cada backup (de propósito, pra manter um histórico legível por
    // data), então `backupPath` nunca se repete e a rotação nunca
    // encontrava nada pra rotacionar. Preserva o nome com timestamp (não
    // "conserta" isso — mudaria o recurso de "histórico com data" pra
    // "nome fixo") e corrige a ROTAÇÃO: lista a pasta de backup, filtra
    // pelo mesmo padrão de nome que `GameStorage.tryRestoreFromBackup` já
    // usa pra achar backups (prefixo + sufixo fixo `-backup.json`), ordena
    // cronologicamente (timestamp ISO no nome já ordena lexicograficamente)
    // e remove tudo além dos `maxBackups` mais recentes — `maxBackups=3`
    // volta a significar "os 3 mais recentes", como sempre foi a intenção.
    if (prefix && backupDirectory) {
      await this.pruneOldBackups(backupDirectory, prefix, { maxBackups, caller: `${caller}:rotate` });
    }

    return backupPath;
  }

  /**
   * Remove backups além dos `maxBackups` mais recentes que casam com
   * `${prefix}-*-backup.json` em `directory`. Reaproveitável tanto pela
   * rotação automática (toda gravação, acima) quanto por uma varredura
   * avulsa (instalações que já acumularam backups de antes desta correção
   * — Fase 2.9, item 1B). Retorna quantos ficaram e quantos foram
   * removidos.
   */
  async pruneOldBackups(directory, prefix, { maxBackups = 3, caller = 'BackupManager.pruneOldBackups', matches = null } = {}) {
    // `matches` permite reaproveitar esta mesma rotina pra um esquema de
    // nome diferente (Fase 2.9, item 1B: `CareerRepository`'s pasta de
    // backup POR carreira usa `backup-<timestamp>.json`, sem prefixo — o
    // padrão `${prefix}-*-backup.json` abaixo é só o default usado pelo
    // backup automático do `GameStorage`, prefixo = nome do arquivo-fonte).
    const test = matches || ((name) => name.startsWith(`${prefix}-`) && name.endsWith('-backup.json'));
    const entries = await this.storage.list(directory, { caller: `${caller}:list` }).catch(() => []);
    const candidates = (entries || [])
      .filter((entry) => entry && !entry.isDirectory && typeof entry.name === 'string' && test(entry.name))
      .map((entry) => entry.name)
      .sort();
    const toRemove = candidates.slice(0, Math.max(0, candidates.length - maxBackups));
    let removedBytes = 0;
    for (const name of toRemove) {
      const path = `${directory}/${name}`;
      try {
        const info = await this.storage.stat?.(path, { caller: `${caller}:stat` }).catch(() => null);
        if (info?.size) removedBytes += info.size;
      } catch { /* stat é best-effort, só pra relatar bytes removidos */ }
      await this.storage.remove(path, { knownToExist: true, caller: `${caller}:prune` }).catch(() => {});
    }
    return { kept: candidates.length - toRemove.length, removed: toRemove.length, removedBytes };
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
