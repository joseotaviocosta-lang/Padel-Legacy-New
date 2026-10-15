// Playthrough 5.26, Parte 2 — INVENTÁRIO DO BALANCEAMENTO ATUAL.
// Lê os valores direto das autoridades reais (nenhum número copiado à mão) e
// grava reports/progression-economy-526/inventory.json + inventory.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { installBrowserShim } from './lib/v526CareerSim.mjs';

installBrowserShim();
const OUT = resolve('reports/progression-economy-526');
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(p);
try {
  const circuit = await load('/src/lib/circuitCatalog.js');
  const sponsors = await load('/src/lib/sponsors.js');
  const coaches = await load('/src/lib/coaches.js');
  const economy = await load('/src/lib/economy.js');
  const store = await load('/src/lib/storeCatalog.js');
  const training = await load('/src/lib/trainingEconomy.js');
  const trainingV2 = await load('/src/lib/trainingSystemV2.js');
  const difficulty = await load('/src/gameplay/difficulty/difficultyConfig.js');
  const careerDiff = await load('/src/lib/careerDifficultyLabels.js');

  const tiers = Object.entries(circuit.TOURNAMENT_TIER_CONFIG).map(([id, t]) => ({
    id, label: t.label, order: t.order, entryFee: t.entryFee, rankPoints: t.rankPoints, championPrize: t.prize, championXp: t.xp,
    roundCoins: t.roundCoins, roundPoints: t.roundPoints, roundXp: t.roundXp, mainDrawSize: t.mainDrawSize, qualifyingSize: t.qualifyingSize,
    minLevel: t.minLevel, minRanking: t.minRanking, maxRanking: t.maxRanking ?? null, difficultyModifier: t.difficultyModifier,
    eventsPerYear: circuit.TIER_EVENTS_PER_YEAR?.[id] ?? null, durationDays: t.durationDays,
  }));

  const sponsorRows = sponsors.SPONSOR_CATALOG.map((s) => ({
    id: s.id, name: s.name, tier: s.tier, base_monthly_value: s.base_monthly_value, base_sign_bonus: s.base_sign_bonus,
    contract_duration_months: s.contract_duration_months, min_xp: s.min_xp, min_titles: s.min_titles, min_fan_appeal: s.min_fan_appeal,
    min_age: s.min_age, max_age: s.max_age, monthly_budget: s.monthly_budget, is_available: s.is_available,
    goals: (s.commercial_goals || []).map((g) => `${g.type}:${g.target}/${g.period} +${g.reward}/${g.penalty}`).join('; '),
    performance_clauses: s.performance_clauses || {},
  }));

  const coachRows = (coaches.COACHES_DATA || []).map((c) => ({
    id: c.id, name: c.name, tier: c.tier, overall: c.overall, reputation: c.reputation,
    salary: coaches.resolveCoachCanonicalSalary(c), signing_fee: c.signing_fee ?? c.signingFee ?? null,
    min_level: c.demands?.min_level ?? null, min_ranking: c.demands?.min_ranking ?? c.demands?.max_ranking ?? null,
  }));

  const staffMarket = (economy.STAFF_MARKET || []).map((s) => ({
    id: s.id, role: s.staff_type || s.role || s.type, name: s.name, quality: s.quality ?? s.skill ?? s.level ?? null,
    monthly_cost: s.monthly_cost, signing_fee: s.signing_fee ?? null, min_ranking: s.min_ranking ?? null, tier: s.tier ?? null,
  }));
  const staffRoles = Object.values(economy.STAFF_ROLE_DEFINITIONS || {}).map((r) => ({ id: r.id, name: r.name, purpose: r.purpose, effects: r.effects || r.effect || null }));

  // Catálogo da loja: o ampliado é gerado por ensureExpandedShopCatalog em
  // runtime; aqui registramos as regras de acesso (SHOP_PROGRESSION).
  const shopProgression = store.SHOP_PROGRESSION;

  const trainingCosts = { baseByStage: training.TRAINING_BASE_COST_BY_STAGE, intensityMultiplier: training.TRAINING_COST_INTENSITY_MULTIPLIER };
  const trainingActivities = (trainingV2.TRAINING_ACTIVITIES || []).map((a) => ({ id: a.id, name: a.name, energy: a.energy_cost ?? a.energyCost ?? null, attributes: a.attributes || a.attribute || null }));

  const inventory = {
    generatedAt: new Date().toISOString(),
    tiers, sponsors: sponsorRows, sponsorSlotLimits: sponsors.SPONSOR_SLOT_LIMITS,
    coaches: coachRows, coachTiers: coaches.COACH_TIERS,
    staffRoles, staffMarket,
    properties: economy.PROPERTIES, investments: economy.INVESTMENTS,
    shopProgression, trainingCosts, trainingActivities,
    careerDifficulty: difficulty.DIFFICULTY_CONFIG, careerDifficultyLabels: careerDiff.CAREER_DIFFICULTY_OPTIONS || null,
  };
  writeFileSync(resolve(OUT, 'inventory.json'), JSON.stringify(inventory, null, 2));

  const md = [];
  md.push('# Inventário do balanceamento atual (5.26)\n', 'Gerado de `scripts/audit-balance-inventory-v526.mjs` a partir das autoridades reais.\n');
  md.push('## Tiers de torneio\n', '| Tier | Inscrição | Pts campeão | Prêmio campeão | Chave | Ranking mín. | Dific. mod. | Eventos/ano |', '|---|---|---|---|---|---|---|---|');
  for (const t of tiers) md.push(`| ${t.id} | ${t.entryFee} | ${t.rankPoints} | ${t.championPrize} | ${t.mainDrawSize}${t.qualifyingSize ? `+Q${t.qualifyingSize}` : ''} | ${t.minRanking || '—'} | ${t.difficultyModifier} | ${t.eventsPerYear ?? '—'} |`);
  md.push('\n## Patrocinadores\n', '| Patrocinador | Tier | Base/mês | Luvas | Duração | XP mín. | Títulos | Fãs mín. | Idade |', '|---|---|---|---|---|---|---|---|---|');
  for (const s of sponsorRows) md.push(`| ${s.name} | ${s.tier} | ${s.base_monthly_value} | ${s.base_sign_bonus} | ${s.contract_duration_months} m | ${s.min_xp} | ${s.min_titles} | ${s.min_fan_appeal} | ${s.min_age}-${s.max_age} |`);
  md.push('\nNegociação: `monthly = base × (0,7 + match/100 × 0,6) × (1 + poder de negociação ≤ 0,45)`. **Não há requisito de ranking** em `canSign` (só XP, títulos, fãs e idade).');
  md.push('\n## Treinadores\n', '| Treinador | Tier | OVR | Salário/mês | Nível mín. |', '|---|---|---|---|---|');
  for (const c of coachRows) md.push(`| ${c.name} | ${c.tier} | ${c.overall ?? '—'} | ${c.salary ?? '—'} | ${c.min_level ?? '—'} |`);
  md.push('\n## Staff (mercado)\n', '| Profissional | Função | Qualidade | Custo/mês |', '|---|---|---|---|');
  for (const s of staffMarket) md.push(`| ${s.name} | ${s.role} | ${s.quality ?? '—'} | ${s.monthly_cost} |`);
  md.push('\n## Loja — regras de acesso por raridade\n', '| Raridade | Nível de carreira | Ranking máx. | Reputação | Preço mínimo |', '|---|---|---|---|---|');
  for (const [k, v] of Object.entries(shopProgression)) md.push(`| ${k} | ${v.minCareerLevel} | ${v.maxRanking ?? '—'} | ${v.minReputation} | ${v.priceFloor} |`);
  md.push('\n## Investimentos (retorno MENSAL declarado)\n', '| Investimento | Mínimo | Retorno/mês | Risco |', '|---|---|---|---|');
  for (const i of economy.INVESTMENTS) md.push(`| ${i.name} | ${i.min_amount} | ${(i.return_rate * 100).toFixed(1)}% | ${i.risk} |`);
  md.push('\n## Imóveis\n', '| Imóvel | Preço | Manutenção/mês | Bônus |', '|---|---|---|---|');
  for (const p of economy.PROPERTIES) md.push(`| ${p.name} | ${p.price} | ${p.monthly_maintenance} | ${p.description} |`);
  md.push('\n## Treino — custo base por estágio\n', '```json', JSON.stringify(trainingCosts, null, 2), '```');
  md.push('\n## Dificuldade de carreira (modificadores)\n', '```json', JSON.stringify(difficulty.DIFFICULTY_CONFIG, null, 2), '```');
  writeFileSync(resolve(OUT, 'inventory.md'), md.join('\n'));
  console.log(`tiers=${tiers.length} sponsors=${sponsorRows.length} coaches=${coachRows.length} staff=${staffMarket.length} investimentos=${economy.INVESTMENTS.length}`);
  console.log(`→ ${OUT}/inventory.json · inventory.md`);
} finally {
  await server.close();
}
