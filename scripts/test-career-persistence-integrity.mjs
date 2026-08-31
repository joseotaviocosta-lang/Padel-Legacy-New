// Hotfix crítico — Integridade de persistência da carreira + nome do atleta
// nas notícias.
//
// BUG 1 (crítico, relatado 2x no Android): a carreira "desaparece" com
// "O arquivo não existe no armazenamento local: careers/<id>.json", mesmo com
// o índice ainda listando essa carreira.
//
// Causa raiz confirmada (duas falhas independentes, ambas no caminho de
// escrita/leitura genérico usado por TODO save de carreira — não só torneios,
// mas qualquer avanço de calendário, partida, ranking, etc., já que tudo
// passa pelo mesmo GameStorage.writeJsonUnlocked):
//
// (a) GameStorage.writeJsonUnlocked apaga o arquivo de destino ANTES de
//     renomear o temporário no lugar (`storage.remove(dest)` seguido de
//     `storage.rename(temp, dest)`, duas chamadas IPC separadas). Se o
//     processo morre exatamente nessa janela — no Android, suspensão em
//     segundo plano ou OOM kill são exatamente esse tipo de encerramento
//     abrupto — o arquivo simplesmente deixa de existir. A única proteção
//     (`crashRecovery: true`, que copia o arquivo antigo para um
//     `*.rollback.json` ANTES de apagar) já existia no código, mas só era
//     ativada explicitamente por `withPersistenceTransaction`; o caminho mais
//     usado de todos (ActiveCareerAdapter.mutateActiveCareer, toda alteração
//     de entidade fora de um lote) nunca passava essa opção — a maioria dos
//     saves reais rodava SEM a proteção.
// (b) TauriStorage.exists() tratava QUALQUER erro do plugin de FS (não só
//     "arquivo não existe") como `false` — uma falha transitória de I/O
//     (plausível no Android sob pressão de memória/retomada do app) virava
//     indistinguível de "o arquivo realmente não existe", disparando o mesmo
//     erro fatal sem nenhuma nova tentativa.
//
// Correção: (1) crashRecovery ligado por padrão em todo write de carreira E
// de índice (CareerRepository.js/CareerManager.js) — mecanismo já existente,
// só faltava ser sempre usado; (2) TauriStorage.exists() tenta 3x antes de
// concluir ausência; (3) GameStorage.readJson ganha uma segunda linha de
// defesa — se não há rollback de crash, procura o backup mais recente
// (backups/, já gerado automaticamente por todo write que substitui um
// arquivo existente) e restaura dali antes de finalmente declarar o arquivo
// perdido; (4) diagnóstico estruturado (registerBetaDiagnostic, mecanismo já
// usado por calendarLifecycle.js) em CAREER_LOAD_*/CAREER_SAVE_*/
// CAREER_RECOVERY_*/CAREER_INDEX_UPDATE; (5) `save_version` incremental
// diagnóstico. NENHUM código apaga metadados/carreira automaticamente por uma
// leitura falhar — confirmado por auditoria estática abaixo.
//
// BUG 2: notícia de início de carreira sempre mostrava "José Costa" (o perfil
// de demonstração do seed local, src/local/localSeed.js) em vez do nome do
// atleta real, porque PressArticle não estava na lista de coleções que NUNCA
// herdam dados de demonstração (CareerInitialDataService.js) — o primeiro
// acesso a PressArticle de uma carreira nova caía no fallback de seed
// (ensureCollection, CareerEntityRepository.js), que só remapeia
// `profile_id`, nunca o texto. Fonte canônica do nome do atleta (já usada em
// todo o resto do jogo): `profile.sport_name` (ver game-core/utils.js,
// safeName()). Corrigido adicionando 'PressArticle' à mesma lista de
// exclusão que já protege Match/TrainingSession/MissionProgress.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
  console.log(`PASS — ${label}`);
}

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// MemoryStorage com pontos de injeção de falha — usado para provar as duas
// janelas de corrida reais (crash entre remove()/rename(), exists() que
// falha de forma transitória) sem depender do plugin nativo do Tauri.
class FaultyMemoryStorage {
  constructor() {
    this.files = new Map();
    this.directories = new Set();
    this.renameInterceptor = null; // (source, dest) => void | throws
    this.existsFailuresRemaining = 0; // próximas N chamadas a exists() lançam
  }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async ensureDirectory(p) { this.directories.add(p); return true; }
  async exists(p) {
    if (this.existsFailuresRemaining > 0) {
      this.existsFailuresRemaining -= 1;
      throw new Error('SIMULATED_TRANSIENT_IO_ERROR');
    }
    return this.files.has(p) || this.directories.has(p);
  }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { return this.files.delete(p); }
  async rename(s, d) {
    if (this.renameInterceptor) {
      const fn = this.renameInterceptor;
      this.renameInterceptor = null; // dispara uma única vez
      fn(s, d);
    }
    this.files.set(d, this.files.get(s));
    this.files.delete(s);
    return d;
  }
  async copy(s, d) { this.files.set(d, this.files.get(s)); return d; }
  async list(dir = '.') {
    const prefix = dir && dir !== '.' ? `${dir}/` : '';
    const names = [...this.files.keys()]
      .filter((p) => p.startsWith(prefix))
      .map((p) => p.slice(prefix.length))
      .filter((rest) => rest && !rest.includes('/'));
    return names.map((name) => ({ name, isDirectory: false }));
  }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerDay } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { registerTournament } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { publishMatchNews } = await vite.ssrLoadModule('/src/game-core/news.js');
  const { buildBetaDiagnosticReport } = await vite.ssrLoadModule('/src/lib/betaDiagnostics.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  function harness(id) {
    const rawStorage = new FaultyMemoryStorage();
    const manager = new CareerManager(new CareerRepository(new GameStorage(rawStorage)));
    return { manager, rawStorage };
  }

  async function activateFor(id, manager) {
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
  }

  async function freshCareer(id, { manager } = {}) {
    const h = manager ? { manager, rawStorage: null } : harness(id);
    activeCareerAdapter.careerManager = h.manager;
    const { career } = await h.manager.createCareer({ playerName: 'Novo Atleta' });
    activeCareerAdapter.setActiveCareer(career);
    const partner = BOTS_BY_DIFFICULTY.iniciante[0];
    await activeCareerAdapter.createPlayerProfile({
      id: `${id}-player`, sport_name: id, career_date: '2026-01-01', birth_date: '2001-01-01',
      level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
      coins: 5000, xp: 0, morale: 70, form: 50, partner_id: partner.id, weekly_training_enabled: false,
    });
    const profile = await localGame.entities.PlayerProfile.get(`${id}-player`);
    return { ...h, career, profile, partner };
  }

  // ═══════════════ 1. Crash simulado entre remove() e rename() ═══════════════
  // Reproduz exatamente a causa raiz confirmada: o 2º save (o 1º é sempre uma
  // criação, sem arquivo anterior para apagar) apaga o arquivo antigo e então
  // falha antes do rename — sem a correção, a carreira ficaria "perdida"
  // (FILE_NOT_FOUND) mesmo tendo existido um instante antes.
  {
    const { manager, rawStorage } = harness('crash-mid-write');
    // createDefaultCareerData() sempre gera seu próprio career_id (UUID) —
    // career_id/career_name passados aqui são ignorados pelo schema atual.
    // Usamos sempre o id REAL devolvido, nunca um literal assumido.
    const { career } = await manager.createCareer({ playerName: 'Atleta Um' });
    const realId = career.career_id;
    const v1 = { ...career, metadata: { ...career.metadata, ranking_position: 10 } };
    await manager.saveCareer(realId, v1); // save normal — vira o "estado bom" que deve sobreviver ao crash

    let crashed = false;
    rawStorage.renameInterceptor = () => { crashed = true; throw new Error('SIMULATED_CRASH_BEFORE_RENAME_COMPLETES'); };
    const v2 = { ...v1, metadata: { ...v1.metadata, ranking_position: 999 } };
    await assert.rejects(() => manager.saveCareer(realId, v2), 'o save que "crasha" deve propagar o erro, nunca fingir sucesso');
    gate('Crash simulado: o interceptor de rename realmente disparou (cenário reproduzido)', crashed);

    const recovered = await manager.loadCareer(realId);
    gate('Crash mid-write (exceção JS capturável): a carreira NUNCA aparece como perdida', recovered.career_id === realId);
    gate('Crash mid-write (exceção JS capturável): recupera automaticamente para a ÚLTIMA versão válida (ranking_position=10, não 999 nem corrompido)', recovered.metadata.ranking_position === 10);
    // Esta camada (writeJsonUnlocked's próprio catch) já existia e se
    // auto-repara DENTRO da mesma chamada, porque a exceção é capturável em
    // JS. Ela NÃO cobre o caso real relatado no Android: um kill de processo
    // (suspensão/OOM) não deixa nenhum catch rodar — o app simplesmente
    // encerra com o arquivo já removido e o rename nunca aplicado. Esse
    // cenário só é simulável reproduzindo o estado em disco diretamente,
    // sem passar pela função de escrita (nenhum JS roda entre remove() e a
    // "morte" do processo) — é isso que o próximo bloco testa.
  }

  // ═══════════════ 1b. Kill de processo real (nenhum catch em JS chega a rodar) ═══════════════
  // Reproduz o estado exato que um OOM kill/suspensão do Android no meio de
  // writeJsonUnlocked deixaria: o arquivo principal já foi removido, a cópia
  // de rollback já existe (crashRecovery copiou antes de remover), e o
  // rename() do temporário nunca chegou a acontecer — tudo isso manipulando
  // o storage diretamente, sem chamar writeJsonUnlocked, para garantir que
  // NENHUM catch em JS "ajude" o cenário (fiel ao que um kill real faz).
  {
    const { manager, rawStorage } = harness('process-kill');
    const { career } = await manager.createCareer({ playerName: 'Atleta Um-B' });
    const realId = career.career_id;
    const v1 = { ...career, metadata: { ...career.metadata, ranking_position: 42 } };
    await manager.saveCareer(realId, v1); // save normal — o "estado bom" anterior ao kill

    const careerPath = `careers/${realId}.json`;
    const rollbackPath = `temp/${realId}.json.rollback.json`;
    const goodContent = rawStorage.files.get(careerPath);
    rawStorage.files.set(rollbackPath, goodContent); // crashRecovery já tinha copiado
    rawStorage.files.delete(careerPath); // remove(dest) já rodou
    // rename(temp, dest) NUNCA roda — o processo "morre" aqui, sem catch.

    const recovered = await manager.loadCareer(realId);
    gate('Kill de processo real (sem catch em JS): a carreira NUNCA aparece como perdida', recovered.career_id === realId);
    gate('Kill de processo real: recupera para a última versão confirmada antes do kill (ranking_position=42)', recovered.metadata.ranking_position === 42);

    const report = buildBetaDiagnosticReport();
    gate('Diagnóstico: CAREER_RECOVERY_SUCCESS (source=crash-rollback) foi registrado para este caso', report.runtimeErrors.some((e) => e.type === 'CAREER_RECOVERY_SUCCESS' && e.source === 'crash-rollback'));
  }

  // ═══════════════ 2. Sem rollback de crash, recupera do backup mais recente ═══════════════
  {
    const { manager, rawStorage } = harness('backup-fallback');
    const { career } = await manager.createCareer({ playerName: 'Atleta Dois' });
    const realId = career.career_id;
    await manager.saveCareer(realId, { ...career, metadata: { ...career.metadata, ranking_position: 1 } });
    await new Promise((r) => setTimeout(r, 3));
    await manager.saveCareer(realId, { ...career, metadata: { ...career.metadata, ranking_position: 2 } });
    await new Promise((r) => setTimeout(r, 3));
    await manager.saveCareer(realId, { ...career, metadata: { ...career.metadata, ranking_position: 3 } });

    // Simula perda TOTAL do arquivo principal E de qualquer rollback de
    // crash (pior caso: as duas primeiras linhas de defesa já se perderam) —
    // só resta o histórico de backups já gerado automaticamente a cada save.
    const careerFilePath = `careers/${realId}.json`;
    for (const path of [...rawStorage.files.keys()]) {
      if (path === careerFilePath || path.endsWith('.rollback.json')) rawStorage.files.delete(path);
    }

    const recovered = await manager.loadCareer(realId);
    gate('Sem rollback disponível: a carreira ainda assim NÃO desaparece (recupera do backup)', recovered.career_id === realId);
    gate('Backup restaurado é a versão mais recente disponível em backups/ (ranking_position=2, o penúltimo salvo)', recovered.metadata.ranking_position === 2);

    const report = buildBetaDiagnosticReport();
    gate('Diagnóstico: CAREER_RECOVERY_SUCCESS (source=backup) foi registrado', report.runtimeErrors.some((e) => e.type === 'CAREER_RECOVERY_SUCCESS' && e.source === 'backup'));
  }

  // ═══════════════ 3. exists() transitório nunca é a causa raiz sozinho — auditoria estática do retry ═══════════════
  {
    const tauriSrc = read('src/storage/TauriStorage.js');
    gate('TauriStorage.exists() tenta novamente antes de concluir ausência (não trata 1º erro como "não existe")', /for \(let attempt = 1; attempt <= attempts/.test(tauriSrc) && tauriSrc.includes('assumindo ausência só por exaustão'));
  }

  // ═══════════════ 4. Nunca excluir carreira/metadados automaticamente por falha de leitura ═══════════════
  {
    const providerSrc = read('src/careers/CareerProvider.jsx');
    const adapterSrc = read('src/gameplay/adapters/ActiveCareerAdapter.js');
    gate('CareerProvider nunca chama deleteCareer fora do callback explícito do usuário (deleteCareer só aparece 1x, na função exportada)', (providerSrc.match(/careerManager\.deleteCareer\(/g) || []).length === 1);
    gate('ActiveCareerAdapter.getActiveCareer não apaga a carreira em memória quando a leitura falha por arquivo ausente — usa o cache quente como fallback', adapterSrc.includes('usando carreira ativa em memória'));
    gate('clearActiveCareer() nunca é chamado dentro do catch de erro de leitura de getActiveCareer (só no caminho "sem last_career_id")', !/catch[\s\S]{0,400}clearActiveCareer/.test(adapterSrc));
  }

  // ═══════════════ 5. crashRecovery e backup do índice ligados por padrão ═══════════════
  {
    const repoSrc = read('src/careers/CareerRepository.js');
    gate('writeCareer usa crashRecovery por padrão (só desliga com false explícito)', repoSrc.includes('crashRecovery: options.crashRecovery !== false'));
    gate('writeIndex agora protege o índice com backup + crashRecovery (antes era backup:false)', /async writeIndex\(index\)[\s\S]{0,1200}backup: true, crashRecovery: true/.test(repoSrc));
    gate('updateIndex também protege o índice', /async updateIndex\(fn\)[\s\S]{0,1200}backup: true, crashRecovery: true/.test(repoSrc));
  }

  // ═══════════════ 6. save_version incrementa e todos os eventos de diagnóstico existem ═══════════════
  {
    const { manager } = harness('save-version');
    const { career } = await manager.createCareer({ playerName: 'Atleta Três' });
    const realId = career.career_id;
    gate('save_version começa em 0 na criação', career.save_version === 0);
    const v1 = await manager.saveCareer(realId, career);
    gate('save_version incrementa a cada saveCareer (0 → 1)', v1.save_version === 1);
    const v2 = await manager.saveCareer(realId, v1);
    gate('save_version continua incrementando (1 → 2)', v2.save_version === 2);

    const report = buildBetaDiagnosticReport();
    const types = new Set(report.runtimeErrors.map((e) => e.type));
    for (const expected of ['CAREER_LOAD_START', 'CAREER_LOAD_SUCCESS', 'CAREER_SAVE_START', 'CAREER_SAVE_SUCCESS', 'CAREER_INDEX_UPDATE']) {
      gate(`Diagnóstico de persistência registra ${expected}`, types.has(expected));
    }
  }

  // ═══════════════ 7. Save concorrente nunca corrompe o arquivo ═══════════════
  {
    const { manager } = harness('concurrent-save');
    const { career } = await manager.createCareer({ playerName: 'Atleta Quatro' });
    const realId = career.career_id;
    const base = await manager.saveCareer(realId, career);
    const a = { ...base, metadata: { ...base.metadata, ranking_position: 111 } };
    const b = { ...base, metadata: { ...base.metadata, ranking_position: 222 } };
    const results = await Promise.allSettled([
      manager.saveCareer(realId, a),
      manager.saveCareer(realId, b),
    ]);
    gate('Saves concorrentes: pelo menos um dos dois completa com sucesso', results.some((r) => r.status === 'fulfilled'));
    const final = await manager.loadCareer(realId);
    gate('Arquivo final é um JSON válido e íntegro (career_id preservado, nunca uma mistura corrompida)', final.career_id === realId && [111, 222].includes(final.metadata.ranking_position));
  }

  // ═══════════════ 8. Ciclo completo: torneio → save → "reload" (nova instância do manager) → intacto ═══════════════
  {
    const { manager, profile: initialProfile, partner, career: initialCareer } = await freshCareer('tournament-reload');
    const realId = initialCareer.career_id;
    const tournament = await localGame.entities.Tournament.create({ id: 'tournament-reload-t1', name: 'Reload Cup', tier: 'Silver', start_date: '2026-01-08', status: 'inscricoes' });
    await registerTournament({ player: initialProfile, partner, tournament, teamRank: 200 });
    let current = await localGame.entities.PlayerProfile.get(initialProfile.id);
    while (current.career_date < '2026-01-08') current = await advanceCareerDay(current, {});

    // "Recarregar o app": nova leitura independente da MESMA carreira, sem
    // reaproveitar nenhum estado quente em memória.
    const reloaded = await manager.loadCareer(realId);
    gate('Após torneio completo (D-3..D-0) + reload: career_id preservado', reloaded.career_id === realId);
    gate('Após torneio completo + reload: perfil do jogador preservado', reloaded.player?.id === initialProfile.id);
    const reloadedEvent = (reloaded.entities.CalendarEvent || []).find((e) => e.related_id === tournament.id);
    gate('Após torneio completo + reload: tournament_run do torneio disputado continua presente', Boolean(reloadedEvent?.metadata?.tournament_run));
  }

  // ═══════════════ 9. Teste de estresse — 100 ciclos de save/reload ═══════════════
  {
    const { manager } = harness('stress-100');
    const { career } = await manager.createCareer({ playerName: 'Atleta Cinco' });
    const realId = career.career_id;
    let current = career;
    let lostCareers = 0;
    let brokenReferences = 0;
    let firstError = null;
    for (let cycle = 1; cycle <= 100; cycle += 1) {
      current = { ...current, metadata: { ...current.metadata, ranking_position: cycle } };
      try {
        await manager.saveCareer(realId, current);
        const reloaded = await manager.loadCareer(realId);
        if (reloaded.career_id !== realId) brokenReferences += 1;
        current = reloaded;
      } catch (error) {
        lostCareers += 1;
        firstError = firstError || error;
      }
    }
    if (firstError) console.error('[stress-100] primeiro erro:', firstError);
    gate('Teste de estresse (100 ciclos save→reload): 0 carreiras perdidas', lostCareers === 0);
    gate('Teste de estresse (100 ciclos save→reload): 0 referências quebradas (career_id sempre íntegro)', brokenReferences === 0);
    gate('Teste de estresse: estado final reflete o último ciclo (nenhum save antigo sobrescreveu um mais novo)', current.metadata.ranking_position === 100);
  }

  // ═══════════════ 10. Nome do atleta nas notícias — nunca o nome da conta/perfil de demonstração ═══════════════
  {
    for (const [athleteName, otherAthleteName] of [['João Silva', 'Maria'], ['Carlos', 'outronome']]) {
      const id = `news-${athleteName.replace(/\s+/g, '-').toLowerCase()}`;
      const { profile } = await freshCareer(id);
      const updatedProfile = await activeCareerAdapter.updatePlayerProfile(profile.id, { sport_name: athleteName });

      gate(`PressArticle de carreira nova NUNCA é seedado com o artigo de demonstração (nome da conta: ${id})`, (await localGame.entities.PressArticle.filter({ profile_id: profile.id })).length === 0);

      const article = await publishMatchNews(updatedProfile, true, 'Parceiro Bot', ['Rival A', 'Rival B'], '6-4 6-3');
      gate(`Notícia gerada usa o nome do ATLETA (${athleteName}), nunca "José Costa"`, article.title.includes(athleteName) && !article.content.includes('José Costa'));
      gate(`Notícia não depende acidentalmente de outro nome (${otherAthleteName})`, !article.content.includes(otherAthleteName));

      // Varredura ampla: nenhuma entidade da carreira deve conter o texto do
      // perfil de demonstração — pedido explícito de não corrigir só esta
      // notícia específica.
      const fullCareer = await activeCareerAdapter.getActiveCareer({ fresh: true });
      const serialized = JSON.stringify(fullCareer.entities || {});
      gate(`Nenhuma entidade da carreira "${id}" contém o texto do perfil de demonstração ("José Costa inicia sua trajetória")`, !serialized.includes('José Costa inicia sua trajetória'));
    }
  }

  // ═══════════════ 11. Auditoria estática: PressArticle protegido, fonte canônica documentada ═══════════════
  {
    const initSrc = read('src/gameplay/services/CareerInitialDataService.js');
    gate('PressArticle está na lista de coleções que nunca herdam dados de demonstração', /NEVER_SEED_WITH_DEMO_DATA = new Set\(\[[^\]]*'PressArticle'[^\]]*\]\)/.test(initSrc));
    const utilsSrc = read('src/game-core/utils.js');
    gate('safeName (fonte canônica do nome do atleta) continua lendo profile.sport_name em primeiro lugar', utilsSrc.includes("profile?.sport_name || profile?.name"));
  }

  console.log(`\n${gates} gates executados, todos PASS — Career Persistence Integrity + Athlete News Name.`);
} finally {
  await vite.close();
}
