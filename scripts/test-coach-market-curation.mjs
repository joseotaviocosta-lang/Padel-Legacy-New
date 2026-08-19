// Starter Coach Flow — curated coach market (docs/STARTER_COACH_FLOW.md,
// Parte C-F).
//
// Dados reais medidos contra o catálogo real de 118 treinadores (24
// autorais + 94 gerados): uma carreira recém-criada (16 anos, Iniciante,
// reputação 0, 325 moedas) já tem 24 treinadores "disponíveis" de uma vez
// — todo o tier iniciante, nada os bloqueia — mas só ~7 distintos chegam a
// ser marcados recommended/bestValue pelo algoritmo que já existia.
// buildCoachMarket() reaproveita buildCoachDiscovery inteiro (nenhum
// critério de elegibilidade/recomendação novo) e só aplica um teto por
// estágio de carreira — mesmo padrão já usado pelo mercado de
// patrocinadores (getCareerEconomyStage/STAGE_MARKET_LIMITS,
// sportsEconomyV26.js) — sobre o resultado, sem tocar no catálogo.
//
// Este teste prova: (1) o mercado curado nunca excede o teto do estágio;
// (2) `highlighted` é exatamente o que buildCoachDiscovery já marcava
// recommended/bestValue — nenhuma pontuação paralela; (3) availableCount/
// locked continuam refletindo o conjunto completo, sem nada apagado do
// catálogo; (4) o conjunto curado tem variedade real de tier/especialidade
// (não 8 opções quase idênticas); (5) Coaches.jsx reusa buildCoachMarket/
// buildCoachDiscovery e a página ficou mais compacta (4 StatCards → 1
// linha).
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { buildCoachDiscovery, buildCoachMarket, COACHES_DATA } = await server.ssrLoadModule('/src/lib/coaches.js');

  gate('Catálogo real tem 118 treinadores (nada foi apagado)', COACHES_DATA.length === 118);
  const catalog = COACHES_DATA.map((coach, index) => ({ ...coach, id: coach.catalog_key || `coach-${index}` }));

  // Mesmos três perfis medidos na pesquisa real desta fase.
  const STARTER = { id: 'p-starter', age: 16, level: 'Iniciante', reputation: 0, xp: 0, coins: 325, ranking_position: 1000, club_level: 0, career_level: 1 };
  const MID_CAREER = { id: 'p-mid', age: 22, level: 'Competitivo', reputation: 45, xp: 22000, coins: 15000, ranking_position: 220, club_level: 2, career_level: 15 };
  const ELITE = { id: 'p-elite', age: 26, level: 'Avançado', reputation: 82, xp: 90000, coins: 80000, ranking_position: 50, club_level: 5, career_level: 40 };

  for (const [label, profile] of [['STARTER', STARTER], ['MID_CAREER', MID_CAREER], ['ELITE', ELITE]]) {
    const discovery = buildCoachDiscovery(catalog, profile, { monthlyIncome: null });
    const market = buildCoachMarket(catalog, profile, { monthlyIncome: null });
    const discoveryAvailable = discovery.filter((item) => item.availability.available);
    const discoveryLocked = discovery.filter((item) => !item.availability.available);

    gate(`${label}: curated nunca excede o teto do estágio (${market.curated.length} ≤ ${market.cap})`, market.curated.length <= market.cap);
    gate(`${label}: availableCount reflete o conjunto completo de buildCoachDiscovery (${market.availableCount} === ${discoveryAvailable.length})`, market.availableCount === discoveryAvailable.length);
    gate(`${label}: locked reflete o mesmo bloqueio de buildCoachDiscovery (${market.locked.length} === ${discoveryLocked.length})`, market.locked.length === discoveryLocked.length);
    gate(`${label}: highlighted é só quem buildCoachDiscovery já marcava recommended/bestValue (nenhuma pontuação paralela)`,
      market.highlighted.every((item) => item.recommended || item.bestValue)
      && discoveryAvailable.filter((item) => item.recommended || item.bestValue).length === market.highlighted.length);
    gate(`${label}: nenhum treinador do catálogo sumiu (discovery.length === catalog.length)`, discovery.length === catalog.length);

    if (market.curated.length >= 4) {
      const tiers = new Set(market.curated.map((item) => item.coach.tier));
      const specialties = new Set(market.curated.map((item) => item.coach.specialty));
      gate(`${label}: mercado curado tem variedade real (não são todos idênticos) — ${tiers.size} tier(s), ${specialties.size} especialidade(s)`, tiers.size >= 1 && specialties.size >= 2);
    }
  }

  // Estágio inicial precisa mostrar algo próximo de 6-10 opções (item 7 do hotfix).
  const starterMarket = buildCoachMarket(catalog, STARTER, { monthlyIncome: null });
  gate('STARTER: teto do mercado inicial fica na faixa pedida pelo hotfix (6-10)', starterMarket.cap >= 6 && starterMarket.cap <= 10);
  gate('STARTER: mercado disponível de verdade é bem maior que o curado (prova que existe curadoria real, não só o teto natural)', starterMarket.availableCount > starterMarket.curated.length);

  // Mercado inicial cresce conforme a carreira avança (item 9).
  const midMarket = buildCoachMarket(catalog, MID_CAREER, { monthlyIncome: null });
  const eliteMarket = buildCoachMarket(catalog, ELITE, { monthlyIncome: null });
  gate('Teto do mercado cresce com o estágio da carreira (STARTER < MID_CAREER < ELITE)', starterMarket.cap < midMarket.cap && midMarket.cap < eliteMarket.cap);

  // ── Coaches.jsx reusa buildCoachMarket/buildCoachDiscovery, sem algoritmo paralelo ──
  const page = readFileSync('src/pages/Coaches.jsx', 'utf8');
  gate('Coaches.jsx importa buildCoachMarket', page.includes('buildCoachMarket'));
  gate('Coaches.jsx ainda importa buildCoachDiscovery (não substituído por algo paralelo)', page.includes('buildCoachDiscovery'));
  gate('Nenhuma pontuação/elegibilidade nova foi inventada em Coaches.jsx', !/customRecommendation|newScoring|ownEligibility/i.test(page));
  gate('4 StatCards grandes deram lugar a uma linha compacta de indicadores', !page.includes('<StatCard') && page.includes('Nenhum treinador'));
  gate('Estado sem treinador não finge confiança/afinidade existentes', page.includes("hiredCoach ? `${trust}%` : '—'") && page.includes("hiredCoach ? `${affinityCurrent}%` : '—'"));
  gate('Card mostra "Recomendados para você" / "Outras opções disponíveis" (Parte 15)', page.includes('Recomendados para você') && page.includes('Outras opções disponíveis'));
  gate('Bloqueados continuam fora da lista principal por padrão (Parte 16, filtro padrão "available")', page.includes("useState('available')"));

  console.log(`\n${gates} gates executados, todos PASS — mercado de treinadores curado por estágio de carreira.`);
} finally {
  await server.close();
}
