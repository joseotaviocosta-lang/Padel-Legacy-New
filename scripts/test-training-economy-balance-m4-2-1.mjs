// M4.2.1 (docs/MOBILE_M4_2_1_TRAINING_ECONOMY.md, Parte 18/19/20/39).
//
// Simula carreiras de 30 dias, 90 dias e 1 temporada (365 dias) com 3
// perfis de frequência de treino (A: raro, B: moderado, C: quase todo dia),
// usando o motor REAL de treino (executeTraining/getTrainingCost — não uma
// reimplementação em paralelo) para medir se o novo custo é um sink
// econômico relevante sem quebrar a carreira.
//
// Modelo de renda (disclosed, não é o motor de produção completo — Parte
// 18 pede "não precisa simular cada custo separadamente"): patrocínio
// passivo diário derivado do valor real de um patrocinador Bronze
// (sponsors.js, base_monthly_value ~1800/mês ÷30) + torneio Silver semanal
// ocasional (career.js TIER_REWARD_TABLES.Silver, prêmios reais de
// 15-650 por rodada) — os dois únicos números usados vêm de dados já
// auditados nesta fase, não inventados.
//
// Cada cenário roda em um SUBPROCESSO isolado (spawnSync, mesmo padrão já
// usado por scripts/test-beta-readiness.mjs) — um CareerManager por
// processo é o padrão comprovadamente seguro nesta base; trocar de
// CareerManager no meio do mesmo processo quebra o índice interno do
// ActiveCareerAdapter (achado real durante a implementação, não hipotético).
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const isWorker = process.argv.includes('--worker');

if (isWorker) {
  const profileKey = process.argv[process.argv.indexOf('--profile') + 1];
  const days = Number(process.argv[process.argv.indexOf('--days') + 1]);
  const result = await runScenario(profileKey, days);
  process.stdout.write(`RESULT_JSON:${JSON.stringify(result)}\n`);
  process.exit(0);
}

async function runScenario(profileKey, days) {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

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

  try {
    const { executeTraining, TRAINING_ACTIVITIES } = await server.ssrLoadModule('/src/lib/trainingSystemV2.js');
    const { getTrainingCost } = await server.ssrLoadModule('/src/lib/trainingEconomy.js');
    const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
    const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
    const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
    const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
    const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');

    const activity = TRAINING_ACTIVITIES.find((a) => a.id === 'court-groundstrokes');
    const SPONSOR_DAILY_INCOME = Math.round(1800 / 30);
    const SILVER_ROUND_PRIZES = [15, 45, 110, 260, 650];

    const PROFILES = {
      A_raro: { label: 'A) Treina pouco (1x a cada 3 dias)', trainsToday: (day) => day % 3 === 0, sessionsPerDay: 1 },
      B_moderado: { label: 'B) Treina moderadamente (1x/dia)', trainsToday: () => true, sessionsPerDay: 1 },
      C_intenso: { label: 'C) Treina quase todo dia (3x/dia, limite diário)', trainsToday: () => true, sessionsPerDay: 3 },
    };

    function addDays(dateStr, n) {
      const d = new Date(`${dateStr}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    }

    const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
    await careerManager.createCareer({ id: `career-balance-${profileKey}-${days}`, name: 'QA Balance' });
    activeCareerAdapter.careerManager = careerManager;
    await activeCareerAdapter.getActiveCareer();

    const spec = PROFILES[profileKey];
    let profile = await localGame.entities.PlayerProfile.create({
      id: `qa-balance-${profileKey}-${days}`, sport_name: 'QA Balance', career_date: '2026-01-11',
      career_level: 3, coins: 5000, xp: 0, energy: 100, fatigue: 0, trainings_today: 0,
      serve: 30, forehand: 30, backhand: 30, volley: 30, bandeja: 30, smash: 30, defense: 30, agility: 30, strategy: 30, emotional_control: 30,
    });

    let totalIncome = 0;
    let totalTrainingSpend = 0;
    let sessionsCompleted = 0;
    let daysBlockedByCoins = 0;
    let minBalance = profile.coins;
    let silverRoundIdx = 0;

    for (let day = 1; day <= days; day += 1) {
      let dailyIncome = SPONSOR_DAILY_INCOME;
      if (day % 7 === 0) {
        dailyIncome += SILVER_ROUND_PRIZES[silverRoundIdx % SILVER_ROUND_PRIZES.length];
        silverRoundIdx += 1;
      }
      totalIncome += dailyIncome;
      profile = await localGame.entities.PlayerProfile.update(profile.id, {
        coins: Number(profile.coins) + dailyIncome,
        trainings_today: 0,
        energy: Math.min(100, Number(profile.energy) + 32),
        fatigue: Math.max(0, Number(profile.fatigue) - 10),
        career_date: addDays('2026-01-11', day),
      });

      if (spec.trainsToday(day)) {
        const sessions = spec.sessionsPerDay || 1;
        let blockedThisDay = false;
        for (let s = 0; s < sessions; s += 1) {
          const cost = getTrainingCost(profile, 'moderado');
          const res = await executeTraining(profile, activity, 'moderado', {});
          if (res.error) { blockedThisDay = true; break; }
          totalTrainingSpend += cost;
          sessionsCompleted += 1;
          profile = res.profile;
          minBalance = Math.min(minBalance, profile.coins);
        }
        if (blockedThisDay) daysBlockedByCoins += 1;
      }
      minBalance = Math.min(minBalance, profile.coins);
    }

    return {
      profileKey, profile: spec.label, days, sessionsCompleted,
      startingCoins: 5000, finalCoins: Math.round(profile.coins),
      totalIncome, totalTrainingSpend,
      trainingSpendPctOfIncome: totalIncome > 0 ? Math.round((totalTrainingSpend / totalIncome) * 1000) / 10 : null,
      minBalance: Math.round(minBalance), daysBlockedByCoins,
      wentNegativeOrSoftlocked: minBalance < 0 || daysBlockedByCoins > days * 0.1,
    };
  } finally {
    await server.close();
  }
}

// ── Modo orquestrador: spawna 1 subprocesso por cenário ──────────────────
const scriptPath = fileURLToPath(import.meta.url);
const results = [];
for (const days of [30, 90, 365]) {
  for (const profileKey of ['A_raro', 'B_moderado', 'C_intenso']) {
    // Hotfix 15.5.4 (complemento — sorteio em D-3): o cenário mais pesado
    // (C_intenso/365d, ~850 sessões de treino simuladas) já rodava perto do
    // limite de 120s; não é um caso de correção — este teste não registra
    // nenhum torneio, então o novo hook de sorteio (isTournamentDrawDue,
    // dentro de processCalendarEvents) nunca executa trabalho real aqui, só
    // uma checagem booleana por evento não-torneio. A margem foi ampliada
    // para absorver variação normal de carga da máquina, sem alterar nenhum
    // número de economia/balanço que o teste valida.
    const proc = spawnSync(process.execPath, [scriptPath, '--worker', '--profile', profileKey, '--days', String(days)], { encoding: 'utf8', timeout: 180_000 });
    if (proc.status !== 0) {
      console.error(proc.stdout, proc.stderr);
      throw new Error(`Cenário ${profileKey}/${days}d falhou (exit ${proc.status}).`);
    }
    const line = proc.stdout.split('\n').find((l) => l.startsWith('RESULT_JSON:'));
    if (!line) throw new Error(`Cenário ${profileKey}/${days}d não produziu resultado.`);
    results.push(JSON.parse(line.slice('RESULT_JSON:'.length)));
  }
}

console.log(JSON.stringify(results, null, 2));
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/fase-m4-2-1-training-economy-balance.json', JSON.stringify(results, null, 2));

const problems = results.filter((r) => r.wentNegativeOrSoftlocked);
console.log(`\n${results.length} cenários simulados. ${problems.length} com risco de soft-lock/saldo negativo.`);
if (problems.length) console.log(JSON.stringify(problems, null, 2));
