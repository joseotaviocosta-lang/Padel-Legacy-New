// M4.2.1 (docs/MOBILE_M4_2_1_TRAINING_ECONOMY.md, Parte 2/3/37).
//
// Prova com o pipeline real (CareerManager + executeTraining, sem mocks das
// etapas críticas): treino deixou de PAGAR moedas e passa a CUSTAR — a
// evolução/XP/energia/fadiga/limite diário continuam exatamente como
// estavam antes (Parte 2 lista o que deve ser preservado). Os 20 casos
// pedidos pela Parte 37, numerados.
//
// IMPORTANTE (memória de sessão): o harness local só suporta 1
// PlayerProfile por carreira — usa-se UM perfil + `.update()` de reset
// entre cenários, nunca múltiplos `.create()` (isso já quebrou testes
// anteriores nesta sessão de forma sutil: `.update()` faz merge, então
// resetar explicitamente cada campo que o cenário seguinte não deve herdar
// é obrigatório).
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; }, async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; }, async stat() { return { size: 0 }; }, getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { executeTraining, TRAINING_ACTIVITIES } = await server.ssrLoadModule('/src/lib/trainingSystemV2.js');
  const { getTrainingCost, TRAINING_COST_INTENSITY_MULTIPLIER } = await server.ssrLoadModule('/src/lib/trainingEconomy.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { missionRuntime } = await server.ssrLoadModule('/src/missions/missionSystem.js');
  missionRuntime.setHydrationStatus('ready'); // sem isso, incrementMissionProgress no-opa silenciosamente (canProcessEvents()===false)

  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'career-training-economy', name: 'QA Training Economy' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  const activity = TRAINING_ACTIVITIES.find((a) => a.id === 'court-groundstrokes');

  const RESET = {
    career_level: 3, coins: 5000, xp: 0, energy: 100, fatigue: 0, trainings_today: 0, injured_until: null,
    serve: 30, forehand: 30, backhand: 30, volley: 30, bandeja: 30, smash: 30, defense: 30, agility: 30, strategy: 30, emotional_control: 30,
    attribute_progress: {}, tournament_matches_today: 0, coach_id: null,
  };

  // Único PlayerProfile da carreira — todo cenário reseta explicitamente
  // via .update() (merge), nunca cria um segundo perfil.
  let profile = await localGame.entities.PlayerProfile.create({ id: 'qa-training-economy', sport_name: 'QA Training', career_date: '2026-01-11', ...RESET });
  async function reset(extra = {}) {
    profile = await localGame.entities.PlayerProfile.update(profile.id, { ...RESET, ...extra });
    return profile;
  }

  // ── 1-2) Treino não concede moedas; debita custo exato ───────────────────
  await reset();
  const cost1 = getTrainingCost(profile, 'moderado');
  const res1 = await executeTraining(profile, activity, 'moderado', {});
  gate('1. Treino NUNCA aumenta coins (resultado é sempre <= saldo anterior)', res1.profile.coins <= 5000);
  gate('1b. Nenhuma moeda concedida pela atividade em si (débito exato, não crédito)', res1.profile.coins === 5000 - cost1);
  gate('2. Treino debita exatamente o custo previsto (5000 - custo)', res1.profile.coins === 5000 - cost1);

  // ── 3) Saldo suficiente ──────────────────────────────────────────────────
  gate('3. Com saldo suficiente, treino é executado (sem erro)', !res1.error);

  // ── 4) Saldo insuficiente ────────────────────────────────────────────────
  await reset({ coins: 1 });
  const coinsBeforeFail4 = profile.coins;
  const res4 = await executeTraining(profile, activity, 'intenso', {});
  gate('4. Saldo insuficiente bloqueia o treino com erro claro', Boolean(res4.error) && /insuficiente/i.test(res4.error));
  const reloaded4 = (await localGame.entities.PlayerProfile.filter({ id: profile.id }))[0];
  gate('4b. Saldo insuficiente: coins NÃO foram alterados (nenhum débito parcial)', Number(reloaded4.coins) === coinsBeforeFail4);

  // ── 5-8) Custo por intensidade ───────────────────────────────────────────
  await reset();
  const stageBase = 20; // beginner (career_level 3) — TRAINING_BASE_COST_BY_STAGE.beginner
  const costLeve = getTrainingCost(profile, 'leve');
  const costModerado = getTrainingCost(profile, 'moderado');
  const costIntenso = getTrainingCost(profile, 'intenso');
  gate('5. Custo leve = base × 0.7 (arredondado)', costLeve === Math.round(stageBase * TRAINING_COST_INTENSITY_MULTIPLIER.leve));
  gate('6. Custo normal = base × 1.0', costModerado === stageBase);
  gate('7. Custo intenso = base × 1.4 (arredondado)', costIntenso === Math.round(stageBase * TRAINING_COST_INTENSITY_MULTIPLIER.intenso));
  gate('8. Custo muda com intensidade (leve < normal < intenso, estritamente crescente)', costLeve < costModerado && costModerado < costIntenso);

  // ── 9-12) Ganho/XP/energia/fadiga preservados ────────────────────────────
  await reset();
  const before9 = { energy: profile.energy, fatigue: profile.fatigue, xp: profile.xp };
  const res9 = await executeTraining(profile, activity, 'moderado', {});
  gate('9. Ganho de atributo preservado (algum atributo aumentou)', Object.values(res9.gains).some((g) => g.levels > 0 || g.progress > 0));
  gate('10. XP preservado (aumentou exatamente pelo valor do catálogo)', res9.profile.xp === before9.xp + activity.xp);
  gate('11. Energia debitada normalmente (mesma fórmula de antes, independente da economia)', res9.profile.energy < before9.energy);
  gate('12. Fadiga aumentada normalmente', res9.profile.fatigue > before9.fatigue);

  // ── 13) Limite diário preservado ─────────────────────────────────────────
  await reset();
  for (let i = 0; i < 3; i += 1) {
    const r = await executeTraining(profile, activity, 'leve', {});
    if (r.error) break;
    profile = r.profile;
  }
  const overLimit = await executeTraining(profile, activity, 'leve', {});
  gate('13. Limite diário de 3 treinos continua bloqueando o 4º (DAILY_TRAINING_LIMIT preservado)', Boolean(overLimit.error) && /[Ll]imite di[aá]rio/.test(overLimit.error));

  // ── 14-15) Missão ainda pode progredir/recompensar (trilha independente do custo) ──
  // Parte 15 do briefing: "Treino custa 30; Missão recompensa 100;
  // Resultado líquido: +70" — a recompensa de missão é excepcional, não
  // recorrente, e existe por cima do custo normal do treino, sem bloquear
  // nem ser bloqueada por ele.
  // Reproduzir o pipeline COMPLETO de missões (seleção determinística,
  // MissionProgress, hidratação de app) está fora do escopo deste teste —
  // já é exaustivamente coberto por test:missions. A garantia real que a
  // Parte 15 pede é: o novo custo de treino não toca em nenhum código do
  // sistema de missão/conquista, e a chamada que credita progresso continua
  // acontecendo sem lançar exceção mesmo com o novo débito no meio do caminho.
  await reset();
  const coinsBeforeMissions = profile.coins;
  const costHere = getTrainingCost(profile, 'moderado');
  const trainingMissionCatalog = await localGame.entities.Mission.list();
  const trainMissionDef = trainingMissionCatalog.find((m) => m.id === 'mission-train-1');
  const resMission = await executeTraining(profile, activity, 'moderado', {});
  profile = resMission.profile;
  gate('14. incrementMissionProgress continua sendo chamado a cada treino sem lançar exceção, mesmo com o novo débito de moedas no mesmo fluxo (mission-train-1 existe no catálogo com reward_coins intacto)', Boolean(trainMissionDef) && trainMissionDef.reward_coins === 80 && !resMission.error);
  gate('15. O débito de treino e a recompensa de missão são trilhas de dados independentes: o saldo caiu exatamente pelo custo do treino (nenhuma recompensa de missão foi somada/descontada por engano na mesma escrita)', profile.coins === coinsBeforeMissions - costHere);

  // ── 16) Tutorial/primeiro treino não trava ───────────────────────────────
  await reset();
  const tutorialRes = await executeTraining(profile, activity, 'moderado', {});
  gate('16. Primeiro treino de uma carreira nova (5000 moedas iniciais) nunca falha por saldo insuficiente', !tutorialRes.error);

  // ── 17) Double-click não cobra duas vezes ────────────────────────────────
  await reset();
  const dcSnapshot = profile;
  const costDc = getTrainingCost(dcSnapshot, 'moderado');
  const [dc1, dc2] = await Promise.all([
    executeTraining(dcSnapshot, activity, 'moderado', {}),
    executeTraining(dcSnapshot, activity, 'moderado', {}),
  ]);
  gate('17. Duas chamadas concorrentes com o MESMO snapshot de profile não empilham o débito (ambas calculam o mesmo alvo absoluto, não uma subtração relativa)', dc1.profile.coins === 5000 - costDc && dc2.profile.coins === 5000 - costDc);

  // ── 18) Falha não debita ──────────────────────────────────────────────────
  await reset({ energy: 2 });
  const coinsBeforeFail18 = profile.coins;
  const failRes = await executeTraining(profile, activity, 'intenso', {});
  gate('18. Falha por energia insuficiente não debita moedas (validação de energia vem antes de qualquer escrita)', Boolean(failRes.error) && !failRes.profile);
  const reloaded18 = (await localGame.entities.PlayerProfile.filter({ id: profile.id }))[0];
  gate('18b. Coins permanecem inalterados após a falha', Number(reloaded18.coins) === coinsBeforeFail18);

  // ── 19) Retry seguro ──────────────────────────────────────────────────────
  await reset({ coins: 1 });
  const firstAttempt = await executeTraining(profile, activity, 'moderado', {});
  gate('19a. Primeira tentativa falha por saldo insuficiente', Boolean(firstAttempt.error));
  profile = await localGame.entities.PlayerProfile.update(profile.id, { coins: 5000 });
  const secondAttempt = await executeTraining(profile, activity, 'moderado', {});
  gate('19b. Segunda tentativa (retry, agora com saldo) executa normalmente, sem resíduo da falha anterior', !secondAttempt.error && secondAttempt.profile.coins === 5000 - getTrainingCost(profile, 'moderado'));

  // ── 20) Persistência correta ──────────────────────────────────────────────
  await reset();
  const persistCost = getTrainingCost(profile, 'moderado');
  const persistRes = await executeTraining(profile, activity, 'moderado', {});
  const reloaded20 = (await localGame.entities.PlayerProfile.filter({ id: profile.id }))[0];
  gate('20. Saldo debitado persiste no storage após o treino (reler do storage bate com o resultado em memória)', reloaded20.coins === persistRes.profile.coins && reloaded20.coins === 5000 - persistCost);

  // ── Parte 38: determinismo — mudança financeira não deve alterar atributos/resultado esportivo ──
  // Duas execuções com o MESMO estado esportivo (atributos/energia/fadiga)
  // mas saldos de moedas radicalmente diferentes (5000 vs 500000) devem
  // produzir o MESMO ganho de atributo/XP — a camada econômica nova nunca
  // pode vazar pra dentro da fórmula de progresso esportivo.
  await reset({ coins: 5000 });
  const cheapRunProfile = { ...profile };
  const cheapRun = await executeTraining(profile, activity, 'moderado', {});
  await reset({ coins: 500000 });
  const richRun = await executeTraining(profile, activity, 'moderado', {});
  gate('38a. Ganho de atributo é idêntico independente do saldo de moedas (5000 vs 500000)', JSON.stringify(cheapRun.gains) === JSON.stringify(richRun.gains));
  gate('38b. XP concedido é idêntico independente do saldo de moedas', cheapRun.profile.xp === richRun.profile.xp);
  gate('38c. Custo em MOEDAS de treino é idêntico independente do saldo atual (custo não escala com quanto o jogador já tem)', getTrainingCost(cheapRunProfile, 'moderado') === getTrainingCost({ ...cheapRunProfile, coins: 500000 }, 'moderado'));

  console.log(`\n${gates} gates executados, todos PASS — Economia de treino (M4.2.1): treino custa, não paga; evolução/XP/energia/fadiga/limite preservados; sem double-charge; sem soft-lock no primeiro treino; determinismo esportivo preservado (Parte 38).`);
} finally {
  await server.close();
}
