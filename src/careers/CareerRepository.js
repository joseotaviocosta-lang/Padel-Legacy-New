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
    this.initializationPromise = null;
  }

  async initialize() {
    if (!this.initializationPromise) {
      this.initializationPromise = (async () => {
        await this.storage.initialize();
        await Promise.all([
          this.storage.ensureDirectory(CAREERS_DIRECTORY),
          this.storage.ensureDirectory(CAREER_BACKUPS_DIRECTORY),
        ]);
      })().catch((error) => {
        this.initializationPromise = null;
        throw error;
      });
    }
    await this.initializationPromise;
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
    }, { caller: 'CareerRepository.readIndex' });
    const migrated = migrateIndex(index);
    if (migrated.migrated) await this.storage.writeJson(CAREER_INDEX_FILE_NAME, migrated.data, { backup: true, validate: false });
    return validateCareerIndex(migrated.data);
  }

  async writeIndex(index) {
    await this.initialize();
    const validated = validateCareerIndex(index);
    return this.withIndexLock(async () => {
      // Hotfix persistência crítica: o índice é a ÚNICA lista que diz quais
      // carreiras existem (readIndex() cai para {careers:[]} vazio quando o
      // arquivo não é lido — ver comentário em readIndex). Sem backup nem
      // proteção contra crash, um índice perdido fazia TODAS as carreiras
      // "desaparecerem" da tela mesmo com os arquivos individuais intactos.
      // Mesma proteção que já existia para os arquivos de carreira, agora
      // aplicada ao índice também — nenhum mecanismo novo.
      return this.storage.writeJson(CAREER_INDEX_FILE_NAME, validated, { backup: true, crashRecovery: true, caller: 'CareerRepository.writeIndex' });
    });
  }

  async updateIndex(fn) {
    await this.initialize();
    return this.withIndexLock(async () => {
      const current = await this.readIndex();
      const updated = await fn(JSON.parse(JSON.stringify(current)));
      const validated = validateCareerIndex(updated);
      return this.storage.writeJson(CAREER_INDEX_FILE_NAME, validated, { backup: true, crashRecovery: true, caller: 'CareerRepository.updateIndex' });
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
    const rawCareer = await this.storage.readJson(path, { caller: 'CareerRepository.readCareer' });

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
    //
    // Hotfix persistência crítica: `crashRecovery` agora é ligado por padrão
    // (antes só withPersistenceTransaction o pedia explicitamente). Sem ele,
    // GameStorage.writeJsonUnlocked apaga o arquivo antigo ANTES de renomear
    // o temporário no lugar — se o processo morrer exatamente nessa janela
    // (comum no Android: suspensão/OOM kill), o arquivo da carreira fica
    // simplesmente inexistente, sem nenhuma cópia para recuperar. Com
    // crashRecovery sempre ativo, uma cópia do arquivo anterior é feita antes
    // da remoção; GameStorage.readJson já sabia restaurar essa cópia
    // automaticamente na próxima leitura — só faltava este `true` por padrão.
    return this.storage.writeJson(path, validated, {
      backup: options.backup !== false,
      validate: false,
      pretty: options.pretty === true,
      crashRecovery: options.crashRecovery !== false,
      caller: options.caller || 'CareerRepository.writeCareer',
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

  /**
   * Fase 2.9, item 1B (achado #20) — este é um segundo, SEPARADO acúmulo de
   * backups do mesmo formato "criar, nunca remover": `writeBackup` (usado
   * pelo botão manual do BetaTools e pelo backup de segurança antes de
   * `applySafeRepairs`) grava em `career_backups/career-<id>/backup-<ts>.json`
   * sem NENHUMA rotação — diferente do backup automático por escrita do
   * `GameStorage` (que ganhou rotação acima), esta pasta cresce a cada clique.
   * Reaproveita `BackupManager.pruneOldBackups` com um matcher próprio (aqui
   * não há prefixo — a pasta já é escopada por carreira).
   */
  async pruneBackups(careerId, { maxBackups = 3, caller = 'CareerRepository.pruneBackups' } = {}) {
    await this.initialize();
    const folder = await this.backupDirectory(careerId);
    if (!(await this.storage.exists(folder))) {
      return { kept: 0, removed: 0, removedBytes: 0 };
    }
    return this.storage.backupManager.pruneOldBackups(folder, null, {
      maxBackups,
      caller,
      matches: (name) => name.startsWith('backup-') && name.endsWith('.json'),
    });
  }

  /**
   * O índice de carreiras (`careers-index.json`) é gravado com
   * `backup:true` a cada criar/carregar/salvar/excluir carreira — MAIS
   * frequente que a gravação de qualquer carreira individual — e vive no
   * MESMO diretório flat de backups que o achado #20 original. Sem isto,
   * uma instalação antiga teria centenas de backups do índice nunca
   * varridos, mesmo depois da carreira específica já estar limpa.
   */
  async pruneIndexBackups({ maxBackups = 3, caller = 'CareerRepository.pruneIndexBackups' } = {}) {
    return this.storage.pruneBackupsFor(CAREER_INDEX_FILE_NAME, { maxBackups, caller });
  }

  /**
   * Fase 2.9, item 1B (achado #20) — poda os TRÊS acúmulos de backup com o
   * mesmo formato "criar, nunca remover": (A) o backup automático por
   * escrita do `GameStorage` pro arquivo da carreira (achado #20 original,
   * agora rotacionado por padrão de nome), (B) a pasta de backup manual por
   * carreira do `CareerRepository` (botão do BetaTools + backup de
   * segurança antes de `applySafeRepairs`, nunca teve rotação nenhuma) e
   * (C) o backup automático do ÍNDICE de carreiras (mesmo mecanismo de A,
   * mas um arquivo global, não por carreira). Ponto único reaproveitado
   * tanto pela varredura silenciosa no carregamento da carreira
   * (`CareerManager.loadCareer`) quanto pela ação manual de limpeza no
   * BetaTools.
   */
  async pruneAllBackups(careerId, { maxBackups = 3 } = {}) {
    const [automatic, manual, index] = await Promise.all([
      this.storage.pruneCareerBackups(careerId, { maxBackups, caller: 'CareerRepository.pruneAllBackups:automatic' }),
      this.pruneBackups(careerId, { maxBackups, caller: 'CareerRepository.pruneAllBackups:manual' }),
      this.pruneIndexBackups({ maxBackups, caller: 'CareerRepository.pruneAllBackups:index' }),
    ]);
    return {
      automatic,
      manual,
      index,
      removed: automatic.removed + manual.removed + index.removed,
      removedBytes: automatic.removedBytes + manual.removedBytes + index.removedBytes,
      kept: automatic.kept + manual.kept + index.kept,
    };
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
