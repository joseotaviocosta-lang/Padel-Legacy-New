import { CareerManager } from '../../careers/CareerManager.js';
import { initializeCareerInitialData } from '../services/CareerInitialDataService.js';
import { normalizeFatiguePatch, normalizePlayerPhysicalStats } from '../../game-core/physicalStats.js';
import { recordStorageCacheAccess } from '../../dev/storageIOProbe.js';
import {
  createPersistenceTransaction,
  finishPersistenceTransaction,
  recordPersistenceLogicalMutation,
  recordPersistencePhysicalCommit,
  setActivePersistenceTransaction,
  setPersistenceTransactionDepth,
} from '../../dev/persistenceTransactionProbe.js';

function clone(value) {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function storageStateEquals(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key) || !storageStateEquals(left[key], right[key])) return false;
  }
  return true;
}

const ROUTINE_BACKUP_INTERVAL_MS = 5 * 60 * 1000;
const INDEX_SYNC_INTERVAL_MS = 15 * 1000;

export class ActiveCareerAdapter {
  constructor(careerManager = new CareerManager()) {
    this.careerManager = careerManager;
    this.activeCareer = null;
    this.activeCareerId = null;
    this.writeChain = Promise.resolve();
    this.activePersistenceTransaction = null;
    this.pendingWriteCount = 0;
    this.lastRoutineBackupAt = 0;
    this.lastIndexSyncAt = 0;
  }

  setActiveCareer(career) {
    this.activeCareer = career ? clone(career) : null;
    if (this.activeCareer?.player) {
      this.activeCareer.player = normalizePlayerPhysicalStats(this.activeCareer.player);
    }
    this.activeCareerId = career?.career_id || null;
  }

  clearActiveCareer() {
    this.activeCareer = null;
    this.activeCareerId = null;
  }

  async getActiveCareer({ fresh = false, waitForWrites = true, cloneResult = true, caller = 'ActiveCareerAdapter.getActiveCareer' } = {}) {
    // Uma transação mantém o snapshot confirmado isolado em `activeCareer` e
    // expõe seu draft somente aos repositories enquanto a unidade lógica roda.
    // Assim os stages seguintes veem imediatamente os stages anteriores, sem
    // publicar estado não confirmado como o snapshot quente definitivo.
    if (this.activePersistenceTransaction) {
      const draft = this.activePersistenceTransaction.draft;
      recordStorageCacheAccess({ key: `career:${draft?.career_id || 'transaction'}`, caller, cache: 'hit' });
      return cloneResult ? clone(draft) : draft;
    }

    // Leituras externas aguardam gravações anteriores. Operações que já estão
    // dentro da própria fila usam waitForWrites=false para não aguardarem a si
    // mesmas (deadlock).
    if (waitForWrites) {
      await this.writeChain.catch(() => {});
    }

    const hasMemoryCareer = Boolean(
      this.activeCareer?.career_id
      && this.activeCareerId === this.activeCareer.career_id
    );
    // O modo interno cloneResult=false existe justamente para consultas quentes
    // de entidades. Não clone o save inteiro antes de decidir usar a referência.
    const memoryCareer = hasMemoryCareer
      ? (cloneResult ? clone(this.activeCareer) : this.activeCareer)
      : null;

    if (!fresh && memoryCareer) {
      recordStorageCacheAccess({ key: `career:${this.activeCareerId}`, caller, cache: 'hit' });
      return memoryCareer;
    }
    recordStorageCacheAccess({ key: `career:${this.activeCareerId || 'last'}`, caller, cache: 'miss' });

    // Preserve o id selecionado em memória. O índice só é consultado ao abrir
    // novamente o aplicativo ou quando ainda não houve seleção nesta sessão.
    const careerId = this.activeCareerId || await this.careerManager.getLastCareer();
    if (!careerId) {
      this.clearActiveCareer();
      return null;
    }

    try {
      const career = fresh
        ? await this.careerManager.readCareer(careerId)
        : await this.careerManager.loadCareer(careerId);
      this.setActiveCareer(career);
      return cloneResult ? clone(this.activeCareer) : this.activeCareer;
    } catch (error) {
      // Durante a primeira montagem, a referência em memória já representa a
      // carreira recém-criada e validada. Caso o sistema de arquivos ainda não
      // exponha o arquivo naquele instante, não derrube ranking, tutorial ou
      // escolha do lado: use a cópia em memória e deixe a próxima gravação
      // consolidar o estado. Erros sem carreira em memória continuam fatais.
      const isMissingFile = error?.code === 'FILE_NOT_FOUND'
        || error?.code === 'CAREER_NOT_FOUND'
        || /arquivo não existe|carreira não encontrada no armazenamento/i.test(String(error?.message || ''));

      if (memoryCareer && memoryCareer.career_id === careerId && isMissingFile) {
        console.warn('[Career] leitura antecipada do save; usando carreira ativa em memória.', {
          careerId,
          code: error?.code,
        });
        return memoryCareer;
      }
      throw error;
    }
  }

  async ensureActiveCareer(options) {
    const career = await this.getActiveCareer(options);
    if (!career) throw new Error('Nenhuma carreira ativa encontrada. Escolha uma carreira na tela inicial.');
    return career;
  }

  async getPlayerProfile() {
    const career = await this.getActiveCareer({ fresh: false, cloneResult: false });
    return career?.player?.id ? clone(career.player) : null;
  }

  async createPlayerProfile(profile = {}) {
    const transaction = await this.mutateActiveCareer(async (career) => {
      // A criação é idempotente: montagens repetidas reutilizam o jogador.
      if (career.player?.id) {
        const missingFields = normalizeFatiguePatch(Object.fromEntries(
          Object.entries(clone(profile) || {}).filter(([key, value]) => (
            key !== 'id'
            && value !== undefined
            && value !== null
            && (career.player[key] === undefined || career.player[key] === null)
          )),
        ));

        if (Object.keys(missingFields).length > 0) {
          career.player = {
            ...clone(career.player),
            ...missingFields,
            id: career.player.id,
            updated_date: new Date().toISOString(),
          };
        }
        initializeCareerInitialData(career);
        return career.player;
      }

      const now = new Date().toISOString();
      career.player = {
        ...normalizePlayerPhysicalStats(clone(profile)),
        id: profile.id || `playerprofile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_date: profile.created_date || now,
        updated_date: now,
      };
      initializeCareerInitialData(career);
      return career.player;
    }, { caller: 'ActiveCareerAdapter.createPlayerProfile' });
    return clone(transaction.result);
  }

  async ensureInitialData() {
    const transaction = await this.mutateActiveCareer(async (career) => {
      return initializeCareerInitialData(career);
    }, { caller: 'ActiveCareerAdapter.ensureInitialData' });
    return clone(transaction.result);
  }

  async updatePlayerProfile(id, updates = {}) {
    const transaction = await this.mutateActiveCareer(async (career) => {
      const player = career.player || {};
      if (!player.id || player.id !== id) {
        throw new Error('O PlayerProfile ativo não corresponde ao id informado.');
      }
      career.player = {
        ...clone(player),
        ...normalizeFatiguePatch(clone(updates)),
        id: player.id,
        updated_date: new Date().toISOString(),
      };
      if (Object.prototype.hasOwnProperty.call(updates, 'court_side')) {
        career.metadata.court_side = updates.court_side;
        career.metadata.side_selected = Boolean(updates.court_side);
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'career_difficulty')) {
        career.metadata.career_difficulty = updates.career_difficulty;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'sport_name')) {
        career.metadata.player_name = String(updates.sport_name || '').trim() || career.metadata.player_name;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'play_style')) {
        career.metadata.play_style = updates.play_style;
        career.metadata.style_selected = Boolean(updates.play_style);
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'handedness')) career.metadata.handedness = updates.handedness;
      if (Object.prototype.hasOwnProperty.call(updates, 'archetype_id')) career.metadata.archetype_id = updates.archetype_id;
      if (Object.prototype.hasOwnProperty.call(updates, 'onboarding_completed')) {
        career.metadata.onboarding_completed = Boolean(updates.onboarding_completed);
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'tutorial_onboarding')) {
        career.tutorial = clone(updates.tutorial_onboarding);
      }
      return career.player;
    }, { caller: 'ActiveCareerAdapter.updatePlayerProfile' });
    return clone(transaction.result);
  }

  async mutateActiveCareer(mutator, { caller = 'ActiveCareerAdapter.mutateActiveCareer' } = {}) {
    const activeTransaction = this.activePersistenceTransaction;
    if (activeTransaction) {
      if (activeTransaction.rollbackError) throw activeTransaction.rollbackError;
      const operation = activeTransaction.mutationChain.then(async () => {
        if (activeTransaction.rollbackError) throw activeTransaction.rollbackError;
        try {
          // O draft já é um clone isolado do snapshot confirmado. Mutá-lo
          // diretamente evita clonar/stringify o save inteiro a cada entidade;
          // qualquer erro invalida a transação completa e descarta o draft.
          const result = await mutator(activeTransaction.draft);
          activeTransaction.dirty = true;
          recordPersistenceLogicalMutation(activeTransaction.probe, caller);
          return { result: clone(result), career: clone(activeTransaction.draft) };
        } catch (error) {
          activeTransaction.rollbackError = error;
          throw error;
        }
      });
      activeTransaction.mutationChain = operation.then(() => undefined, () => undefined);
      return operation;
    }

    // A carreira ativa em memória é a fonte quente durante a sessão. Ler o JSON
    // inteiro do disco antes de CADA entidade tornava páginas com 5-10 consultas
    // perceptivelmente lentas no desktop. A fila garante que o snapshot em
    // memória já contém todas as gravações anteriores.
    const previousWrites = this.writeChain.catch(() => {});
    const operation = previousWrites.then(async () => {
      const current = await this.ensureActiveCareer({
        fresh: false,
        waitForWrites: false,
        cloneResult: false,
        caller,
      });
      // O mutator recebe um draft isolado. Assim uma falha de persistência não
      // deixa o estado quente parcialmente alterado.
      const career = clone(current);
      const result = await mutator(career);
      const now = Date.now();
      const shouldBackup = now - this.lastRoutineBackupAt >= ROUTINE_BACKUP_INTERVAL_MS;
      const shouldSyncIndex = now - this.lastIndexSyncAt >= INDEX_SYNC_INTERVAL_MS;
      const saved = await this.careerManager.saveCareer(career.career_id, career, {
        backup: shouldBackup,
        updateIndex: shouldSyncIndex,
        caller,
      });
      if (shouldBackup) this.lastRoutineBackupAt = now;
      if (shouldSyncIndex) this.lastIndexSyncAt = now;
      this.setActiveCareer(saved);
      return { result: clone(result), career: clone(saved) };
    });

    this.writeChain = operation.then(() => undefined, () => undefined);
    return operation;
  }

  /**
   * Executa uma unidade lógica contra um draft da carreira e faz somente um
   * save físico ao final. Chamadas concorrentes externas entram na writeChain;
   * nesting explícito usa `transaction.withTransaction(...)` para compartilhar
   * o draft sem criar commit intermediário.
   */
  async withPersistenceTransaction(name, work, { joinTransactionId = null } = {}) {
    if (typeof name === 'function') {
      work = name;
      name = 'career-transaction';
    }
    if (typeof work !== 'function') throw new TypeError('A transação exige uma função assíncrona.');

    const active = this.activePersistenceTransaction;
    if (active && joinTransactionId === active.id) {
      active.depth += 1;
      setPersistenceTransactionDepth(active.probe, active.depth);
      try {
        return await work(this.createTransactionContext(active));
      } catch (error) {
        active.rollbackError = active.rollbackError || error;
        throw error;
      } finally {
        active.depth -= 1;
        setPersistenceTransactionDepth(active.probe, active.depth);
      }
    }

    this.pendingWriteCount += 1;
    const previousWrites = this.writeChain.catch(() => {});
    const operation = previousWrites.then(async () => {
      const current = await this.ensureActiveCareer({
        fresh: false,
        waitForWrites: false,
        cloneResult: false,
        caller: `transaction-begin:${name}`,
      });
      const probe = createPersistenceTransaction(name);
      probe.queueSizeBefore = Math.max(0, this.pendingWriteCount - 1);
      const snapshot = clone(current);
      const transaction = {
        id: probe.id,
        name: probe.name,
        depth: 1,
        snapshot,
        draft: clone(snapshot),
        dirty: false,
        rollbackError: null,
        mutationChain: Promise.resolve(),
        probe,
      };
      this.activePersistenceTransaction = transaction;
      setActivePersistenceTransaction(probe);

      try {
        const result = await work(this.createTransactionContext(transaction));
        await transaction.mutationChain;
        if (transaction.rollbackError) throw transaction.rollbackError;

        if (!transaction.dirty || storageStateEquals(transaction.draft, transaction.snapshot)) {
          probe.queueSizeAfter = Math.max(0, this.pendingWriteCount - 1);
          finishPersistenceTransaction(probe, { skippedCleanCommit: true });
          return result;
        }

        const commitStartedAt = typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();
        const commitNow = Date.now();
        const shouldBackup = commitNow - this.lastRoutineBackupAt >= ROUTINE_BACKUP_INTERVAL_MS;
        const saved = await this.careerManager.saveCareer(transaction.draft.career_id, transaction.draft, {
          backup: shouldBackup,
          crashRecovery: true,
          // O índice é apenas um catálogo/summary separado. A transação diária
          // confirma o arquivo autoritativo da carreira; um save independente
          // posterior mantém a política periódica já existente para o índice.
          updateIndex: false,
          caller: `transaction-commit:${name}`,
        });
        const commitIOms = (typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now()) - commitStartedAt;
        recordPersistencePhysicalCommit(probe, commitIOms);
        if (shouldBackup) this.lastRoutineBackupAt = commitNow;
        this.setActiveCareer(saved);
        probe.queueSizeAfter = Math.max(0, this.pendingWriteCount - 1);
        finishPersistenceTransaction(probe);
        return result;
      } catch (error) {
        // `activeCareer` nunca apontou para o draft; no erro ele continua sendo
        // exatamente o último snapshot confirmado. GameStorage também restaura
        // o arquivo anterior caso a troca final falhe.
        probe.queueSizeAfter = Math.max(0, this.pendingWriteCount - 1);
        finishPersistenceTransaction(probe, {
          rolledBack: true,
          rollbackReason: error?.message || error,
        });
        throw error;
      } finally {
        if (this.activePersistenceTransaction === transaction) {
          this.activePersistenceTransaction = null;
          setActivePersistenceTransaction(null);
        }
      }
    });

    this.writeChain = operation.then(() => undefined, () => undefined);
    try {
      return await operation;
    } finally {
      this.pendingWriteCount = Math.max(0, this.pendingWriteCount - 1);
    }
  }

  createTransactionContext(transaction) {
    return {
      id: transaction.id,
      name: transaction.name,
      get depth() { return transaction.depth; },
      withTransaction: (name, work) => this.withPersistenceTransaction(name, work, {
        joinTransactionId: transaction.id,
      }),
    };
  }

  async saveActiveCareer(careerData = null) {
    if (this.activePersistenceTransaction) {
      const transaction = this.activePersistenceTransaction;
      const nextCareer = careerData ? clone(careerData) : clone(transaction.draft);
      if (nextCareer?.career_id !== transaction.draft?.career_id) {
        throw new Error('Não é permitido trocar a carreira ativa dentro de uma transação.');
      }
      transaction.draft = nextCareer;
      transaction.dirty = true;
      recordPersistenceLogicalMutation(transaction.probe, 'ActiveCareerAdapter.saveActiveCareer');
      return clone(nextCareer);
    }
    const career = careerData ? clone(careerData) : await this.ensureActiveCareer({ fresh: true });
    const saved = await this.careerManager.saveCareer(career.career_id, career);
    this.setActiveCareer(saved);
    return clone(saved);
  }
}
