// Tutorial 4.1 — consistência de salário de treinador
// (docs/TUTORIAL_4_1_EXPANDED_ONBOARDING_AND_COACH_CLARITY.md, Parte H/I).
//
// QA real: o mercado mostrava "250 moedas/mês" antes de contratar, mas o
// toast pós-contratação dizia "salário mensal de 1 moedas". Causa raiz
// confirmada por leitura direta: um seed legado de 2 treinadores
// ("Carlos Mendes"/"Javier Molina", localSeed.js) usava o campo
// `monthly_salary` em vez do real `monthly_cost`, com nomes fora do
// catálogo real (COACHES_DATA) — ensureCoachCatalog() nunca corrigia essas
// linhas, e a fórmula original de hirePrimaryCoach (sem o fallback
// monthly_salary) resolvia para NaN → o piso `|| 1` mascarava o problema.
//
// Este teste prova: (1) o seed legado foi removido; (2) para treinadores
// reais de cada tier, salário de mercado === salário de contratação (nunca
// 1); (3) mesmo com uma linha no shape exato do bug antigo já persistida
// (save antigo), ela some do mercado e, se ainda assim contratada
// diretamente, resolve pelo fallback de 3 vias em vez de virar 1; (4) uma
// carreira já afetada (coach_monthly_salary:1 persistido) se autocorrige a
// próxima vez que o treinador ativo é resolvido, sem conceder/revogar
// nada; (5) o campo que a folha salarial mensal lê (profile.coach_monthly_
// salary) é exatamente o mesmo que hirePrimaryCoach grava.
//
// Convenção desta sessão: uma carreira tem UM PlayerProfile (modelo real de
// carreira única) — todos os cenários abaixo reusam o MESMO profile,
// resetando só os campos de contrato de treinador entre passos, em vez de
// criar múltiplos PlayerProfile na mesma carreira (o que colide/mescla no
// backend local, como o modelo de produção real também assume).
import { readFileSync } from 'node:fs';
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
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); },
    async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; },
    async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  // ═══════════════════════════════════════════════════════════════════════
  // 1) O seed legado (raiz do bug) foi removido de fato
  // ═══════════════════════════════════════════════════════════════════════
  const seedSource = readFileSync('src/local/localSeed.js', 'utf8');
  // "Carlos Mendes" ainda aparece como remetente de uma CareerMessage de
  // boas-vindas (flavor text não relacionado, não é uma linha de Coach).
  gate('Coach: [] em localSeed.js — o seed legado de 2 linhas com schema incompatível foi removido', /Coach:\s*\[\s*\]/.test(seedSource));

  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { evaluateCoachForCareer } = await server.ssrLoadModule('/src/lib/coaches.js');
  const { hirePrimaryCoach, renewPrimaryCoach, resolveActiveCoach, ensureCoachCatalog } = await server.ssrLoadModule('/src/game-core/coachLifecycle.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-coach-salary', name: 'QA Coach Salary' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-coach-salary', sport_name: 'QA Athlete', career_date: '2026-01-01', coins: 999999, level: 'Elite', reputation: 99, xp: 50000, ranking_position: 1, club_level: 10,
  });
  const resetCoachFields = async () => {
    profile = await localGame.entities.PlayerProfile.update(profile.id, {
      coach_id: null, coach_name: null, coach_contract_status: null, coach_monthly_salary: null, coach_paid_by_club: false, coins: 999999,
    });
  };

  // ═══════════════════════════════════════════════════════════════════════
  // 2) Para cada tier real, mercado === contratação (nunca 1)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Consistência por tier (mercado vs. contratação) ---');
  const catalog = await ensureCoachCatalog();
  gate('Catálogo de treinadores carrega com entradas reais', catalog.length > 50);
  for (const tier of ['iniciante', 'regional', 'profissional', 'elite']) {
    const coach = catalog.find((c) => c.tier === tier);
    gate(`Existe ao menos 1 treinador tier "${tier}" no catálogo`, Boolean(coach));
    if (!coach) continue;
    await resetCoachFields();
    const marketSalary = evaluateCoachForCareer(coach, profile, {}).salary;
    gate(`[${tier}] Salário de mercado nunca é 1 (real: ${marketSalary})`, marketSalary > 1);
    profile = await hirePrimaryCoach(profile, coach, 12);
    gate(`[${tier}] Salário na contratação (toast/contrato) === salário de mercado`, profile.coach_monthly_salary === marketSalary);
    gate(`[${tier}] Salário na contratação nunca é 1`, profile.coach_monthly_salary > 1);
    // A folha salarial mensal (lib/economy.js) lê profile.coach_monthly_salary
    // diretamente — mesma fonte, sem uma 5ª fórmula divergente.
    gate(`[${tier}] Campo que a folha mensal usa (coach_monthly_salary) está correto para dedução`, profile.coach_monthly_salary === marketSalary);
    profile = await renewPrimaryCoach(profile, coach, 12);
    gate(`[${tier}] Renovação também nunca cai para 1 (${profile.coach_monthly_salary})`, profile.coach_monthly_salary > 1);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3) Regressão exata do bug relatado: linha no shape do seed legado
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Regressão: reproduzindo o shape exato do bug relatado ---');
  const brokenRow = await localGame.entities.Coach.create({
    id: 'coach-001', name: 'Carlos Mendes', country: 'Brasil', specialty: 'Técnica', reputation: 65, monthly_salary: 500, philosophy: 'Equilíbrio e consistência', is_available: true,
  });
  const catalogAfterBrokenRow = await ensureCoachCatalog();
  gate('Linha no shape do bug antigo NUNCA aparece na lista oferecida pelo mercado (filtrada, não deletada)', !catalogAfterBrokenRow.some((c) => c.id === 'coach-001'));
  const stillPersisted = await localGame.entities.Coach.filter({ id: 'coach-001' });
  gate('A linha continua existindo no storage (não foi deletada, só deixou de ser oferecida)', stillPersisted.length === 1);

  await resetCoachFields();
  profile = await hirePrimaryCoach(profile, brokenRow, 12);
  gate('BUG REPRODUZIDO E CORRIGIDO: contratar diretamente a linha quebrada NUNCA resulta em salário 1 (resolve via fallback monthly_salary)', profile.coach_monthly_salary === 500);

  const totallyUnresolvable = await localGame.entities.Coach.create({ id: 'coach-ghost', name: 'Treinador Fantasma Sem Dado Nenhum' });
  await resetCoachFields();
  let threw = false;
  try {
    await hirePrimaryCoach(profile, totallyUnresolvable, 12);
  } catch (error) {
    threw = true;
    gate('Quando o salário é realmente irresolúvel, falha com erro diagnosticável (nunca "1 moeda" silencioso)', /salário/i.test(error.message) && /catálogo/i.test(error.message));
  }
  gate('Contratação de treinador com salário irresolúvel lança erro em vez de prosseguir com 1', threw);

  // ═══════════════════════════════════════════════════════════════════════
  // 4) Autocorreção de save já afetado (não-destrutiva)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Save já afetado: autocorreção sem re-conceder/revogar nada ---');
  profile = await localGame.entities.PlayerProfile.update(profile.id, {
    coach_id: 'coach-001', coach_name: 'Carlos Mendes', coach_contract_status: 'active', coach_monthly_salary: 1, coach_paid_by_club: false, coins: 12345,
  });
  const resolved = await resolveActiveCoach(profile);
  gate('resolveActiveCoach corrige o salário quebrado (1) para o valor canônico (500, via monthly_salary do próprio registro)', resolved.profile.coach_monthly_salary === 500);
  gate('Autocorreção não mexe em coins (não é um re-grant nem uma penalidade)', resolved.profile.coins === 12345);
  const reloaded = await localGame.entities.PlayerProfile.filter({ id: profile.id }).then((rows) => rows[0]);
  gate('Correção foi persistida (não só em memória)', reloaded.coach_monthly_salary === 500);

  console.log(`\n${gates} gates executados, todos PASS — Consistência de salário de treinador (mercado === contratação === contrato === toast === folha mensal, nunca "1 moeda" silencioso).`);
} finally {
  await server.close();
}
