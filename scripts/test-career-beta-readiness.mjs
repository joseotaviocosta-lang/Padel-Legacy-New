// Fase 10 — Beta Readiness (docs/BETA_READINESS_PHASE10.md).
//
// Ao contrário de scripts/test-massive-careers-v32.mjs e
// scripts/test-career-difficulty-pace.mjs (que reimplementam suas próprias
// fórmulas de treino/ranking/economia em memória, sem tocar
// CareerManager/CareerRepository/GameStorage), este script exercita o
// PIPELINE REAL de produção: armazenamento fake (mesmo padrão já usado por
// scripts/benchmark-time-advance-rc.mjs e
// scripts/test-time-advance-performance-rc.mjs) injetado em
// GameStorage -> CareerRepository -> CareerManager reais, avançando o
// calendário via advanceCareerDays/finalizeCareerAdvanceRange reais,
// resolvendo decisões de torneio via resolveDecision real, e jogando
// partidas treino headless com o motor real (createMatch/playPoint) seguido
// de finalizePracticeMatch real. Não existe um segundo motor de carreira
// aqui — é o mesmo código que o jogo usa.
//
// Objetivo: detectar corrupção de estado, órfãos, duplicação de recompensa e
// quebra de determinismo/idempotência no pipeline real ao longo de uma
// carreira longa — não medir balanceamento estatístico (isso já é coberto
// pelos simuladores existentes acima).
import { createServer } from 'vite';

const HORIZON_DAYS = Number(process.argv.find((arg) => arg.startsWith('--days='))?.split('=')[1] || 90);
const VERBOSE = process.argv.includes('--verbose');

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(relativePath, content) { files.set(relativePath, String(content)); },
    async readText(relativePath) {
      if (!files.has(relativePath)) {
        const error = new Error('O arquivo não existe no armazenamento local.');
        error.code = 'FILE_NOT_FOUND';
        throw error;
      }
      return files.get(relativePath);
    },
    async exists(relativePath) { return files.has(relativePath); },
    async remove(relativePath) { return files.delete(relativePath); },
    async copy(sourcePath, destinationPath) { files.set(destinationPath, files.get(sourcePath)); return destinationPath; },
    async rename(sourcePath, destinationPath) { files.set(destinationPath, files.get(sourcePath)); files.delete(sourcePath); return destinationPath; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
    // Exposto só para medir tamanho de save (Parte 24 do enunciado) — não faz
    // parte do contrato TauriStorage normal.
    _files: files,
  };
}

// Pequeno PRNG determinístico (mulberry32) só para as DECISÕES do driver de
// comportamento (registrar torneio? jogar ou desistir?) — nunca para o motor
// de partida em si, que já usa seu próprio PRNG seedado (ver
// src/engine/match/random.js) através de createMatch/playPoint reais.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(text) {
  let value = 2166136261;
  for (let i = 0; i < String(text).length; i += 1) { value ^= String(text).charCodeAt(i); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

let totalFailures = 0;
const check = (condition, message) => {
  if (condition) { if (VERBOSE) console.log(`  ✓ ${message}`); return true; }
  totalFailures += 1;
  console.error(`  ✗ ${message}`);
  return false;
};

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { advanceCareerDays, finalizeCareerAdvanceRange } = await server.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { resolveDecision } = await server.ssrLoadModule('/src/lib/calendarSystem.js');
  const { registerTournament, validateTournamentRegistrations, getTournamentRegistrationWindow } = await server.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { finalizePracticeMatch } = await server.ssrLoadModule('/src/game-core/matchLifecycle.js');
  const { makeMatchFinalizationKey } = await server.ssrLoadModule('/src/game-core/matchFinalization.js');
  const { createMatch, playPoint } = await server.ssrLoadModule('/src/lib/matchEngine.js');
  const { getRandomBots, getDifficultyForPlayer, BOTS_BY_DIFFICULTY } = await server.ssrLoadModule('/src/lib/bots.js');
  const { isInjured, canPlayMatchToday, getChemistryBonus, getEnergyPenalty, ATTRIBUTE_KEYS, DAILY_TRAINING_LIMIT } = await server.ssrLoadModule('/src/lib/padel.js');

  // ---------------------------------------------------------------------
  // Parte 4 do enunciado: auditor de estados impossíveis/suspeitos.
  // ---------------------------------------------------------------------
  function auditCareer(career, ctx) {
    const issues = [];
    const push = (code, message) => issues.push({ code, message, careerId: ctx.careerId, day: ctx.day });

    const seen = new Set();
    (function walk(node, path) {
      if (node === null || node === undefined) return;
      if (typeof node === 'number') {
        if (!Number.isFinite(node)) push('NON_FINITE_NUMBER', `${path} = ${node}`);
        return;
      }
      if (typeof node !== 'object') return;
      if (seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) { node.forEach((item, index) => walk(item, `${path}[${index}]`)); return; }
      for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key);
    })(career, '');

    const p = career.player || {};
    // player.energy/fatigue/coins/atributos nunca devem ser null: um valor
    // NaN/Infinity gerado em algum ponto do jogo vira `null` silenciosamente
    // ao passar por JSON.stringify (GameStorage.writeJsonUnlocked serializa
    // com JSON.stringify, que converte NaN/Infinity em null) — o valor NÃO
    // fica "óbvio" como NaN num save exportado por um jogador para bug
    // report, e Number(null) é 0, então passaria batido pelas checagens de
    // intervalo abaixo se não checarmos null explicitamente primeiro.
    const requiredNumericFields = ['energy', 'fatigue', 'coins', 'xp', ...ATTRIBUTE_KEYS];
    for (const field of requiredNumericFields) {
      if (!Object.prototype.hasOwnProperty.call(p, field)) continue;
      if (p[field] === null) push('FIELD_NULL_AFTER_SERIALIZATION', `player.${field}=null (provável NaN/Infinity antes de serializar)`);
    }
    if (p.energy !== undefined && p.energy !== null && (Number(p.energy) < 0 || Number(p.energy) > 100)) push('ENERGY_OUT_OF_RANGE', `player.energy=${p.energy}`);
    if (p.fatigue !== undefined && p.fatigue !== null && (Number(p.fatigue) < 0 || Number(p.fatigue) > 100)) push('FATIGUE_OUT_OF_RANGE', `player.fatigue=${p.fatigue}`);
    if (p.coins !== undefined && p.coins !== null && Number(p.coins) < 0) push('NEGATIVE_COINS', `player.coins=${p.coins}`);
    for (const key of ATTRIBUTE_KEYS) {
      if (p[key] === undefined || p[key] === null) continue;
      if (Number(p[key]) < 1 || Number(p[key]) > 100) push('ATTRIBUTE_OUT_OF_RANGE', `player.${key}=${p[key]}`);
    }
    if (p.trainings_today !== undefined && Number(p.trainings_today) > DAILY_TRAINING_LIMIT) push('TRAINING_LIMIT_EXCEEDED', `player.trainings_today=${p.trainings_today} > ${DAILY_TRAINING_LIMIT}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.career_date))) push('INVALID_DATE', `player.career_date=${p.career_date}`);
    if (p.id && !career.entities) push('MISSING_ENTITIES', 'career.entities ausente com player definido');

    const entities = career.entities || {};
    for (const [entityName, rows] of Object.entries(entities)) {
      if (!Array.isArray(rows)) continue;
      const ids = rows.map((row) => row?.id).filter(Boolean);
      if (new Set(ids).size !== ids.length) push('DUPLICATE_ENTITY_ID', `entities.${entityName} contém ids duplicados`);
    }

    const tournaments = entities.Tournament || [];
    const registrations = entities.TournamentRegistration || [];
    if (typeof validateTournamentRegistrations === 'function' && registrations.length) {
      const result = validateTournamentRegistrations({ registrations, tournaments, players: [p] });
      if (!result.valid) for (const issue of result.issues || []) push('REGISTRATION_INTEGRITY', JSON.stringify(issue));
    }
    // Torneio referenciado por uma inscrição confirmada precisa existir.
    const tournamentIds = new Set(tournaments.map((t) => t.id));
    for (const reg of registrations) {
      if (['pending', 'confirmed'].includes(reg.status) && reg.tournament_id && !tournamentIds.has(reg.tournament_id)) {
        push('REGISTRATION_ORPHAN_TOURNAMENT', `TournamentRegistration ${reg.id} referencia torneio inexistente ${reg.tournament_id}`);
      }
    }
    // Partida de torneio precisa referenciar um torneio real.
    const matches = entities.Match || [];
    for (const m of matches) {
      if (m.competition_type === 'tournament' || m.is_tournament === true) {
        const tid = m.tournament_id || m.related_tournament_id;
        if (!tid) push('TOURNAMENT_MATCH_WITHOUT_TOURNAMENT', `Match ${m.id} é de torneio mas não referencia tournament_id`);
      }
    }
    // Registro confirmado sem torneio correspondente com status coerente já
    // coberto acima; aqui garantimos que não sobra 'confirmed'/'pending'
    // eternamente órfão de decisão (a checagem funcional de "não deve travar
    // para sempre" é feita pelo próprio loop de simulação, não aqui).

    return issues;
  }

  // ---------------------------------------------------------------------
  // Perfis de comportamento (subconjunto pragmático de A-H do enunciado,
  // Parte 5). G/H (troca de parceiro) não é simulado: o parceiro de treino
  // headless vem do catálogo estático de bots (src/lib/bots.js), fora do
  // sistema de propostas/Dupla — documentado como limitação de escopo em
  // docs/BETA_READINESS_PHASE10.md.
  // ---------------------------------------------------------------------
  const PROFILES = [
    {
      id: 'treino-foco', label: 'A: Foco em treino',
      practiceMatchChance: 0.5, maxEntryFee: 0,
      registerChance: 0, decisionPlayChance: 0.05,
    },
    {
      id: 'competicao-foco', label: 'B/E: Foco em competir + calendário agressivo',
      practiceMatchChance: 0.1, maxEntryFee: Infinity,
      registerChance: 1, decisionPlayChance: 0.95,
    },
    {
      id: 'equilibrado', label: 'C: Equilibrado',
      practiceMatchChance: 0.3, maxEntryFee: Infinity,
      registerChance: 0.5, decisionPlayChance: 0.5,
    },
    {
      id: 'descanso', label: 'D: Descansa bastante',
      practiceMatchChance: 0.1, maxEntryFee: Infinity,
      registerChance: 0.2, decisionPlayChance: 0.3,
    },
    {
      id: 'financeiro-conservador', label: 'F: Conservador financeiro',
      practiceMatchChance: 0.3, maxEntryFee: 150,
      registerChance: 0.6, decisionPlayChance: 0.6,
    },
  ];

  const SEEDS = [1001, 2002];

  // ---------------------------------------------------------------------
  // Partida treino headless com o motor real (mesma cadeia usada por
  // SimulationModal: createMatch -> playPoint* -> finalizePracticeMatch).
  // ---------------------------------------------------------------------
  async function playHeadlessPracticeMatch(profile, { matchSeed, dryRun = false } = {}) {
    const partnerId = BOTS_BY_DIFFICULTY.iniciante[0].id;
    const partner = BOTS_BY_DIFFICULTY.iniciante.find((b) => b.id === partnerId);
    const opponents = getRandomBots(getDifficultyForPlayer(profile), 2, [partnerId]);
    const chemistryBonus = getChemistryBonus(profile.partner_chemistry || 50);
    const energyPenalty = getEnergyPenalty(profile.energy || 100);
    const playerForMatch = { ...profile, _chemistryBonus: chemistryBonus, _energyPenalty: energyPenalty };
    let state = createMatch([playerForMatch, partner], opponents, { seed: matchSeed });
    let guard = 0;
    while (!state.finished && guard < 2000) { state = playPoint(state); guard += 1; }
    if (!state.finished) throw new Error(`Partida headless não terminou após ${guard} pontos (seed=${matchSeed})`);
    if (dryRun) return { state };
    const result = await finalizePracticeMatch({
      profile, matchState: state, partnerName: partner.name, opponents: opponents.map((o) => o.name),
    });
    // finalizePracticeMatch dispara o trabalho secundário (notícias, TeamRanking,
    // histórico) em queueMicrotask, sem exigir que o chamador aguarde (a UI real
    // nunca troca de carreira ativa no meio do caminho, então isso nunca importa
    // lá). Este script SIMULA VÁRIAS carreiras em sequência no mesmo processo, então
    // sem este await a escrita secundária de uma carreira podia terminar de executar
    // DEPOIS que activeCareerAdapter já tinha trocado para a próxima carreira,
    // gravando dados de uma carreira dentro do arquivo de outra. Artefato deste
    // harness multi-carreira, não um bug do pipeline real (jogo real = 1 carreira
    // ativa por sessão).
    await result.secondary;
    return { state, result };
  }

  // ---------------------------------------------------------------------
  // Simula uma carreira inteira usando o pipeline real.
  // ---------------------------------------------------------------------
  async function simulateCareer({ profileDef, seed, days, careerManager }) {
    // createDefaultCareerData() sempre gera o próprio career_id (createUuid())
    // e ignora qualquer career_id passado em — usar sempre o id devolvido por
    // createCareer(), nunca um id "desejado" localmente.
    const { career } = await careerManager.createCareer({ career_name: `Beta10 ${profileDef.label} seed=${seed}` });
    const careerId = career.career_id;
    activeCareerAdapter.setActiveCareer(career);
    const partnerId = BOTS_BY_DIFFICULTY.iniciante[0].id;
    await activeCareerAdapter.createPlayerProfile({
      id: `${careerId}-player`, sport_name: `Atleta ${profileDef.id}`,
      career_date: '2026-01-05', birth_date: '2009-06-15',
      energy: 100, fatigue: 0, morale: 70, form: 55, confidence: 60,
      coins: 3000, xp: 0, level: 'Iniciante',
      court_side: 'direita', play_style: 'equilibrado', career_difficulty: 'normal',
      partner_id: partnerId,
      trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
    });

    let profile = await localGame.entities.PlayerProfile.get(`${careerId}-player`);
    // Determinístico a partir de profileDef.id+seed (não do career_id
    // aleatório gerado por createDefaultCareerData) — uma falha encontrada
    // aqui é reproduzível só com `--days=N` e os mesmos profile/seed do log,
    // sem depender de qual UUID a carreira recebeu nesta execução.
    const rng = mulberry32(hashSeed(`${profileDef.id}-${seed}`));
    const allIssues = [];
    let day = 0;
    let matchCounter = 0;
    let stuckGuard = 0;

    while (day < days) {
      // Tenta registrar em um torneio elegível antes de avançar, conforme a
      // política do perfil (mimetiza o jogador olhando o calendário).
      if (rng() < profileDef.registerChance) {
        const tournaments = await localGame.entities.Tournament.list('-start_date', 200);
        const candidate = (tournaments || []).find((t) => {
          if (t.status === 'finalizado') return false;
          const fee = Number(t.entry_fee) || 0;
          if (fee > profileDef.maxEntryFee) return false;
          const window = getTournamentRegistrationWindow(t);
          return window.opensAt && window.closesAt && profile.career_date >= window.opensAt && profile.career_date <= window.closesAt;
        });
        if (candidate) {
          const partner = { id: partnerId, status: 'active', name: BOTS_BY_DIFFICULTY.iniciante[0].name };
          try {
            await registerTournament({ player: profile, partner, tournament: candidate });
            profile = await localGame.entities.PlayerProfile.get(profile.id);
          } catch (error) {
            allIssues.push({ code: 'REGISTER_THREW', message: String(error?.message || error), careerId, day });
          }
        }
      }

      const chunk = Math.min(28, days - day);
      const before = profile;
      const result = await advanceCareerDays(profile, chunk);
      profile = await finalizeCareerAdvanceRange(result.profile, before.career_date, result.profile.career_date);
      day += result.daysAdvanced;

      const savedCareer = await careerManager.readCareer(careerId);
      const issues = auditCareer(savedCareer, { careerId, day });
      allIssues.push(...issues);

      if (result.blockedBy) {
        if (!result.blockedBy.id) {
          // Não é uma decisão real (ex.: erro de calendário) — evita loop infinito.
          allIssues.push({ code: 'ADVANCE_STUCK', message: JSON.stringify(result.blockedBy), careerId, day });
          stuckGuard += 1;
          if (stuckGuard > 3) break;
        } else {
          const action = rng() < profileDef.decisionPlayChance ? 'play' : 'skip';
          await resolveDecision(result.blockedBy.id, action);
          profile = await localGame.entities.PlayerProfile.get(profile.id);
          stuckGuard = 0;
        }
        continue;
      }
      stuckGuard = 0;
      if (result.daysAdvanced === 0) { allIssues.push({ code: 'ADVANCE_ZERO_PROGRESS', message: 'daysAdvanced=0 sem blockedBy', careerId, day }); break; }

      // Partida treino headless ocasional (Parte 12 do enunciado).
      if (!isInjured(profile) && canPlayMatchToday(profile).allowed && rng() < profileDef.practiceMatchChance) {
        matchCounter += 1;
        try {
          await playHeadlessPracticeMatch(profile, { matchSeed: `${profileDef.id}-${seed}-match-${matchCounter}` });
          profile = await localGame.entities.PlayerProfile.get(profile.id);
        } catch (error) {
          allIssues.push({ code: 'PRACTICE_MATCH_THREW', message: String(error?.message || error), careerId, day });
        }
      }
    }

    const finalCareer = await careerManager.readCareer(careerId);
    return { careerId, profile, finalCareer, issues: allIssues, daysCompleted: day, matchesPlayed: matchCounter };
  }

  // ---------------------------------------------------------------------
  // Execução principal
  // ---------------------------------------------------------------------
  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  activeCareerAdapter.careerManager = careerManager;

  console.log(`\n=== Fase 10: simulação de carreira real (motor de produção), horizonte=${HORIZON_DAYS} dias ===\n`);

  const matrix = [];
  for (const profileDef of PROFILES) {
    for (const seed of SEEDS) {
      const startedAt = Date.now();
      const outcome = await simulateCareer({ profileDef, seed, days: HORIZON_DAYS, careerManager });
      const elapsedMs = Date.now() - startedAt;
      const saveSize = fakeStorage._files.get(`careers/${outcome.careerId}.json`)?.length || 0;
      matrix.push({
        profile: profileDef.id, seed, daysCompleted: outcome.daysCompleted, matchesPlayed: outcome.matchesPlayed,
        issues: outcome.issues.length, coins: outcome.profile.coins, energy: outcome.profile.energy,
        fatigue: outcome.profile.fatigue, xp: outcome.profile.xp, elapsedMs, saveSizeBytes: saveSize,
      });
      check(outcome.daysCompleted === HORIZON_DAYS, `${profileDef.id}/${seed}: completou os ${HORIZON_DAYS} dias solicitados (completou ${outcome.daysCompleted})`);
      check(outcome.issues.length === 0, `${profileDef.id}/${seed}: auditor não encontrou estados impossíveis/suspeitos (encontrou ${outcome.issues.length})`);
      if (outcome.issues.length) for (const issue of outcome.issues.slice(0, 10)) console.error(`      · [dia ${issue.day}] ${issue.code}: ${issue.message}`);
    }
  }

  console.log('\n--- Matriz de resultados ---');
  console.table(matrix.map(({ profile, seed, daysCompleted, matchesPlayed, issues, coins, energy, fatigue, xp, elapsedMs, saveSizeBytes }) => ({
    profile, seed, daysCompleted, matchesPlayed, issues, coins, energy, fatigue, xp, elapsedMs, saveSizeKB: Math.round(saveSizeBytes / 1024),
  })));

  // ---------------------------------------------------------------------
  // Parte 22: determinismo de save/load. Cenário A joga N dias contínuos.
  // Cenário B joga N/2, recarrega a carreira do zero via careerManager
  // (simulando fechar/reabrir o app), continua os outros N/2. O motor de
  // partida (createMatch/playPoint) é comprovadamente determinístico via
  // seed (ver docs/MOBILE_M3_LIVE_MATCH_LIFECYCLE.md); o pipeline diário em
  // si usa Math.random() não seedado em vários pontos (geração de bots,
  // dificuldade de oponente, etc. — ver getDifficultyForPlayer), então o
  // teste aqui verifica CONSISTÊNCIA ESTRUTURAL da continuação (mesma data
  // final, nenhuma corrupção, nenhuma duplicação), não igualdade byte-a-byte
  // — a igualdade byte-a-byte já é validada separadamente no motor de
  // partida por scripts/test-mobile-m3-live-match.mjs.
  console.log('\n=== Determinismo de save/load (recarregar no meio da carreira) ===\n');
  {
    const DET_DAYS = Math.min(20, HORIZON_DAYS);
    const profileDef = PROFILES[2]; // equilibrado
    const seed = 4242;

    const continuous = await simulateCareer({ profileDef, seed: `${seed}-continuous`, days: DET_DAYS, careerManager });

    // Cenário B: metade dos dias, "fecha o app" (relê do zero via
    // careerManager.readCareer, que passa pela mesma validação/migração de
    // um load real), continua a outra metade.
    const half = Math.floor(DET_DAYS / 2);
    const { career } = await careerManager.createCareer({ career_name: 'Beta10 Determinismo' });
    const careerIdB = career.career_id;
    activeCareerAdapter.setActiveCareer(career);
    const partnerId = BOTS_BY_DIFFICULTY.iniciante[0].id;
    await activeCareerAdapter.createPlayerProfile({
      id: `${careerIdB}-player`, sport_name: 'Atleta Determinismo', career_date: '2026-01-05', birth_date: '2009-06-15',
      energy: 100, fatigue: 0, morale: 70, form: 55, confidence: 60, coins: 3000, xp: 0, level: 'Iniciante',
      court_side: 'direita', play_style: 'equilibrado', career_difficulty: 'normal', partner_id: partnerId,
      trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
    });
    let profileB = await localGame.entities.PlayerProfile.get(`${careerIdB}-player`);
    for (let advanced = 0; advanced < half;) {
      const before = profileB;
      const result = await advanceCareerDays(profileB, Math.min(28, half - advanced));
      profileB = await finalizeCareerAdvanceRange(result.profile, before.career_date, result.profile.career_date);
      advanced += result.daysAdvanced;
      if (result.blockedBy?.id) { await resolveDecision(result.blockedBy.id, 'skip'); profileB = await localGame.entities.PlayerProfile.get(profileB.id); }
      else if (result.daysAdvanced === 0) break;
    }
    // "Fecha o app": relê a carreira do zero (nova validação+migração), como
    // um load real faria.
    const reloaded = await careerManager.readCareer(careerIdB);
    check(reloaded.player.career_date === profileB.career_date, 'determinismo: reload no meio da carreira preserva a data exata');
    check(JSON.stringify(reloaded) === JSON.stringify(await careerManager.readCareer(careerIdB)), 'determinismo: ler a mesma carreira duas vezes produz o mesmo JSON (leitura idempotente)');
    activeCareerAdapter.setActiveCareer(reloaded);
    profileB = reloaded.player;
    for (let advanced = 0; advanced < DET_DAYS - half;) {
      const before = profileB;
      const result = await advanceCareerDays(profileB, Math.min(28, DET_DAYS - half - advanced));
      profileB = await finalizeCareerAdvanceRange(result.profile, before.career_date, result.profile.career_date);
      advanced += result.daysAdvanced;
      if (result.blockedBy?.id) { await resolveDecision(result.blockedBy.id, 'skip'); profileB = await localGame.entities.PlayerProfile.get(profileB.id); }
      else if (result.daysAdvanced === 0) break;
    }

    check(continuous.profile.career_date === profileB.career_date, `determinismo: mesma data final contínuo (${continuous.profile.career_date}) vs. save/load (${profileB.career_date})`);
    check(Number.isFinite(profileB.coins) && profileB.coins >= 0, 'determinismo: carreira recarregada não corrompeu coins');
    check(auditCareer(await careerManager.readCareer(careerIdB), { careerId: careerIdB, day: 'det-final' }).length === 0, 'determinismo: carreira recarregada passa no auditor ao final');
  }

  // ---------------------------------------------------------------------
  // Parte 23: idempotência — finalizar a MESMA partida duas vezes não pode
  // duplicar XP/moedas/histórico. Reusa o mecanismo real (idempotencyKey em
  // CareerEntityRepository.batch), já preservado pelo M3 — aqui validado de
  // ponta a ponta com o motor real, não só a derivação da chave.
  console.log('\n=== Idempotência: finalizar a mesma partida duas vezes ===\n');
  {
    const { career } = await careerManager.createCareer({ career_name: 'Beta10 Idempotência' });
    const careerId = career.career_id;
    activeCareerAdapter.setActiveCareer(career);
    const partnerId = BOTS_BY_DIFFICULTY.iniciante[0].id;
    await activeCareerAdapter.createPlayerProfile({
      id: `${careerId}-player`, sport_name: 'Atleta Idempotência', career_date: '2026-01-05', birth_date: '2009-06-15',
      energy: 100, fatigue: 0, morale: 70, form: 55, confidence: 60, coins: 3000, xp: 0, level: 'Iniciante',
      court_side: 'direita', play_style: 'equilibrado', career_difficulty: 'normal', partner_id: partnerId,
      trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
    });
    let profile = await localGame.entities.PlayerProfile.get(`${careerId}-player`);
    // entities.Match começa com 3 partidas fictícias de LOCAL_SEED.Match
    // (histórico de exemplo remapeado para o jogador ativo, ver
    // seedCollection em CareerInitialDataService.js) assim que a coleção é
    // tocada pela primeira vez — comparar por DELTA, não por contagem
    // absoluta, é o jeito correto de checar duplicação aqui.
    const matchesBefore = await localGame.entities.Match.filter({ profile_id: profile.id });
    const { state } = await playHeadlessPracticeMatch(profile, { matchSeed: 'idempotency-seed', dryRun: true });
    const key = makeMatchFinalizationKey(profile, state);

    const first = await finalizePracticeMatch({ profile, matchState: state, partnerName: 'Parceiro Teste', opponents: ['Oponente A', 'Oponente B'] });
    await first.secondary;
    check(first.skipped !== true, 'idempotência: primeira finalização não é marcada como já processada');
    const afterFirst = await localGame.entities.PlayerProfile.get(profile.id);
    check(afterFirst.xp > profile.xp, `idempotência: XP aumentou na primeira finalização (${profile.xp} -> ${afterFirst.xp})`);
    check((afterFirst.processed_match_finalizations || []).includes(key), 'idempotência: chave de finalização registrada no perfil');

    const second = await finalizePracticeMatch({ profile: afterFirst, matchState: state, partnerName: 'Parceiro Teste', opponents: ['Oponente A', 'Oponente B'] });
    await second.secondary;
    check(second.skipped === true, 'idempotência: segunda finalização da MESMA partida é reconhecida como duplicata');
    const afterSecond = await localGame.entities.PlayerProfile.get(profile.id);
    check(afterSecond.xp === afterFirst.xp, `idempotência: XP não duplicou na segunda finalização (${afterFirst.xp} == ${afterSecond.xp})`);
    check(afterSecond.coins === afterFirst.coins, `idempotência: coins não duplicaram na segunda finalização (${afterFirst.coins} == ${afterSecond.coins})`);
    const matchesAfter = await localGame.entities.Match.filter({ profile_id: profile.id });
    const delta = matchesAfter.length - matchesBefore.length;
    check(delta === 1, `idempotência: exatamente 1 novo registro de Match após duas finalizações da mesma partida (delta=${delta})`);
  }

  // ---------------------------------------------------------------------
  // Parte 4/12: checkpoint corrompido não pode derrubar a carreira nem o
  // save principal (reuso do mecanismo já validado em M3 — aqui validado
  // que uma leitura de carreira com entidade corrompida não propaga exceção
  // não tratada para fora do auditor).
  console.log('\n=== Checkpoint/entidade corrompida não derruba a carreira ===\n');
  {
    const { career } = await careerManager.createCareer({ career_name: 'Beta10 Corrupção' });
    const careerId = career.career_id;
    activeCareerAdapter.setActiveCareer(career);
    await activeCareerAdapter.createPlayerProfile({
      id: `${careerId}-player`, sport_name: 'Atleta Corrupção', career_date: '2026-01-05', birth_date: '2009-06-15',
      energy: NaN, fatigue: Infinity, coins: -50, xp: 0, level: 'Iniciante',
      court_side: 'direita', play_style: 'equilibrado', career_difficulty: 'normal',
    });
    const corrupted = await careerManager.readCareer(careerId);
    const issues = auditCareer(corrupted, { careerId, day: 'corruption-check' });
    // fatigue:Infinity é normalizado em memória (normalizeFatigue, chamado
    // por normalizePlayerPhysicalStats) ANTES de qualquer escrita — nunca
    // chega a corromper o save. normalizeFatigue trata QUALQUER valor não
    // finito (Infinity incluído) como inválido e usa o fallback (0), não um
    // clamp para o teto — então Infinity vira 0, não 100. energy não tem
    // normalizador central equivalente (achado real, ver
    // docs/BETA_READINESS_PHASE10.md): o NaN sobrevive até o JSON.stringify
    // da escrita, onde vira `null` (JSON não representa NaN/Infinity) — o
    // auditor precisa (e agora consegue) detectar esse `null` residual, não
    // um NaN literal que nunca sobrevive ao round-trip de serialização.
    check(corrupted.player.fatigue === 0, `fatigue=Infinity é auto-curado para 0 (fallback) em memória antes de salvar (ficou ${corrupted.player.fatigue})`);
    check(corrupted.player.energy === null, `energy=NaN não tem normalizador central e vira null após serializar (ficou ${corrupted.player.energy})`);
    check(issues.some((i) => i.code === 'FIELD_NULL_AFTER_SERIALIZATION'), 'auditor detecta player.energy=null residual de NaN injetado propositalmente');
    check(issues.some((i) => i.code === 'NEGATIVE_COINS'), 'auditor detecta coins negativo injetado propositalmente');
  }

  // ---------------------------------------------------------------------
  // Parte 24: performance — carreira nova vs. carreira longa.
  console.log('\n--- Performance (Parte 24) ---');
  const freshEntry = matrix[0];
  const longEntry = matrix[matrix.length - 1];
  console.log(`Save carreira curta: ~${Math.round((freshEntry?.saveSizeBytes || 0) / 1024)}KB em ${freshEntry?.elapsedMs}ms para ${freshEntry?.daysCompleted} dias.`);
  console.log(`Save carreira longa: ~${Math.round((longEntry?.saveSizeBytes || 0) / 1024)}KB em ${longEntry?.elapsedMs}ms para ${longEntry?.daysCompleted} dias.`);
  const avgMsPerDay = matrix.reduce((sum, m) => sum + (m.elapsedMs / Math.max(1, m.daysCompleted)), 0) / matrix.length;
  console.log(`Média: ${avgMsPerDay.toFixed(1)}ms por dia de carreira avançado (pipeline real, sem UI).`);

  console.log(`\n${totalFailures === 0 ? '✓' : '✗'} CareerBetaReadinessTest: ${totalFailures === 0 ? 'PASS' : `FAIL (${totalFailures})`}\n`);
  process.exitCode = totalFailures === 0 ? 0 : 1;
} catch (error) {
  console.error('[test-career-beta-readiness] falhou com exceção não tratada:', error);
  process.exitCode = 1;
} finally {
  await server.close();
}
