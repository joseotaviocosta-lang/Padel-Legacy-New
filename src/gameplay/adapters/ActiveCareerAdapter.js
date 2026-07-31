import { CareerManager } from '../../careers/CareerManager.js';

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

  async getActiveCareer({ fresh = false } = {}) {
    // Toda leitura fresca deve aguardar gravações já enfileiradas. Isso impede
    // que componentes montados logo após a criação do save leiam o arquivo
    // enquanto uma mutação anterior ainda está sendo concluída.
    await this.writeChain.catch(() => {});

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
    const career = await this.ensureActiveCareer({ fresh: true });

    // A criação precisa ser idempotente. Algumas telas chamam ensureMyProfile
    // mais de uma vez durante a montagem; se a carreira já possui jogador,
    // reutilizamos o registro existente e apenas completamos campos ausentes.
    if (career.player?.id) {
      const missingFields = Object.fromEntries(
        Object.entries(clone(profile) || {}).filter(([key, value]) => (
          key !== 'id'
          && value !== undefined
          && value !== null
          && (career.player[key] === undefined || career.player[key] === null)
        )),
      );

      if (Object.keys(missingFields).length === 0) {
        this.setActiveCareer(career);
        return clone(career.player);
      }

      const updated = {
        ...clone(career.player),
        ...missingFields,
        id: career.player.id,
        updated_date: new Date().toISOString(),
      };
      career.player = updated;
      const saved = await this.careerManager.saveCareer(career.career_id, career);
      this.setActiveCareer(saved);
      return clone(updated);
    }

    const now = new Date().toISOString();
    const created = {
      ...clone(profile),
      id: profile.id || `playerprofile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      created_date: profile.created_date || now,
      updated_date: now,
    };
    career.player = created;
    const saved = await this.careerManager.saveCareer(career.career_id, career);
    this.setActiveCareer(saved);
    return clone(created);
  }

  async updatePlayerProfile(id, updates = {}) {
    const career = await this.ensureActiveCareer({ fresh: true });
    const player = career.player || {};
    if (!player.id || player.id !== id) throw new Error('O PlayerProfile ativo não corresponde ao id informado.');
    const updated = { ...clone(player), ...clone(updates), id: player.id, updated_date: new Date().toISOString() };
    career.player = updated;
    const saved = await this.careerManager.saveCareer(career.career_id, career);
    this.setActiveCareer(saved);
    return clone(updated);
  }

  async mutateActiveCareer(mutator) {
    const operation = this.writeChain
      .catch(() => {})
      .then(async () => {
        const career = await this.ensureActiveCareer({ fresh: true });
        const result = await mutator(career);
        const saved = await this.careerManager.saveCareer(career.career_id, career);
        this.setActiveCareer(saved);
        return { result: clone(result), career: clone(saved) };
      });
    this.writeChain = operation;
    return operation;
  }

  async saveActiveCareer(careerData = null) {
    const career = careerData ? clone(careerData) : await this.ensureActiveCareer({ fresh: true });
    const saved = await this.careerManager.saveCareer(career.career_id, career);
    this.setActiveCareer(saved);
    return clone(saved);
  }
}
