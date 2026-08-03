import { CareerManager } from '../../careers/CareerManager.js';
import { initializeCareerInitialData } from '../services/CareerInitialDataService.js';

function clone(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

export class ActiveCareerAdapter {
  constructor(careerManager = new CareerManager()) {
    this.careerManager = careerManager;
    this.activeCareer = null;
    this.activeCareerId = null;
    this.writeChain = Promise.resolve();
  }

  setActiveCareer(career) {
    this.activeCareer = career ? clone(career) : null;
    this.activeCareerId = career?.career_id || null;
  }

  clearActiveCareer() {
    this.activeCareer = null;
    this.activeCareerId = null;
  }

  async getActiveCareer({ fresh = false, waitForWrites = true } = {}) {
    // Leituras externas aguardam gravações anteriores. Operações que já estão
    // dentro da própria fila usam waitForWrites=false para não aguardarem a si
    // mesmas (deadlock).
    if (waitForWrites) {
      await this.writeChain.catch(() => {});
    }

    const memoryCareer = (
      this.activeCareer?.career_id
      && this.activeCareerId === this.activeCareer.career_id
    ) ? clone(this.activeCareer) : null;

    if (!fresh && memoryCareer) return memoryCareer;

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
      return clone(this.activeCareer);
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
    const career = await this.getActiveCareer();
    return career?.player?.id ? clone(career.player) : null;
  }

  async createPlayerProfile(profile = {}) {
    const transaction = await this.mutateActiveCareer(async (career) => {
      // A criação é idempotente: montagens repetidas reutilizam o jogador.
      if (career.player?.id) {
        const missingFields = Object.fromEntries(
          Object.entries(clone(profile) || {}).filter(([key, value]) => (
            key !== 'id'
            && value !== undefined
            && value !== null
            && (career.player[key] === undefined || career.player[key] === null)
          )),
        );

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
        ...clone(profile),
        id: profile.id || `playerprofile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_date: profile.created_date || now,
        updated_date: now,
      };
      initializeCareerInitialData(career);
      return career.player;
    });
    return clone(transaction.result);
  }

  async ensureInitialData() {
    const transaction = await this.mutateActiveCareer(async (career) => {
      return initializeCareerInitialData(career);
    });
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
        ...clone(updates),
        id: player.id,
        updated_date: new Date().toISOString(),
      };
      if (Object.prototype.hasOwnProperty.call(updates, 'court_side')) {
        career.metadata.court_side = updates.court_side;
        career.metadata.side_selected = Boolean(updates.court_side);
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'sport_name')) {
        career.metadata.player_name = String(updates.sport_name || '').trim() || career.metadata.player_name;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'play_style')) {
        career.metadata.play_style = updates.play_style;
        career.metadata.style_selected = Boolean(updates.play_style);
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'onboarding_completed')) {
        career.metadata.onboarding_completed = Boolean(updates.onboarding_completed);
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'tutorial_onboarding')) {
        career.tutorial = clone(updates.tutorial_onboarding);
      }
      return career.player;
    });
    return clone(transaction.result);
  }

  async mutateActiveCareer(mutator) {
    // Capture a fila anterior antes de criar a nova operação. Assim, a operação
    // atual aguarda somente trabalhos anteriores e nunca aguarda a si mesma.
    const previousWrites = this.writeChain.catch(() => {});
    const operation = previousWrites.then(async () => {
      const career = await this.ensureActiveCareer({
        fresh: true,
        waitForWrites: false,
      });
      const result = await mutator(career);
      const saved = await this.careerManager.saveCareer(career.career_id, career);
      this.setActiveCareer(saved);
      return { result: clone(result), career: clone(saved) };
    });

    // A fila permanece resolvível mesmo quando uma operação falha, permitindo
    // que gravações futuras continuem. O chamador ainda recebe o erro original.
    this.writeChain = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async saveActiveCareer(careerData = null) {
    const career = careerData ? clone(careerData) : await this.ensureActiveCareer({ fresh: true });
    const saved = await this.careerManager.saveCareer(career.career_id, career);
    this.setActiveCareer(saved);
    return clone(saved);
  }
}
