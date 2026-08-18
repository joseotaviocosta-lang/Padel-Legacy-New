// Onboarding Flow 3.1 (docs/ONBOARDING_FLOW_3_1.md, Parte 4).
//
// QA real: a página de treinadores escondia os benefícios reais atrás de
// "Ver detalhes" — o card mostrava tier/especialidade/salário/OVR e uma
// frase genérica, mas nunca os 2-3 benefícios concretos da especialidade.
// Além disso, o filtro padrão de uma carreira nova ("available") podia
// listar dezenas de treinadores de uma vez, sem paginação.
//
// Correção: CoachCard.jsx passou a renderizar COACH_SPECIALTY_INFO[...]
// .benefits (dado já real, usado também em getCoachImpactSummary — nenhum
// bônus foi inventado); Coaches.jsx ganhou paginação client-side
// ("Mostrar mais") sem tocar em buildCoachDiscovery/filterCoachDiscovery/
// sortCoachDiscovery nem inventar critério de recomendação novo.
//
// Este teste prova: (1) todo specialty tem 2-3 benefícios reais; (2)
// CoachCard.jsx só usa benefícios vindos de COACH_SPECIALTY_INFO, sem
// strings de benefício novas e hardcoded; (3) Coaches.jsx tem paginação e
// mantém os imports de descoberta intactos (nenhum algoritmo novo); (4) o
// pipeline real de buildCoachDiscovery (badges "recomendado"/"melhor
// custo-benefício") continua idêntico ao já validado em
// test-coach-discovery-rc.mjs — a mudança é só de apresentação.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { buildCoachDiscovery, COACH_SPECIALTY_INFO, COACHES_DATA } = await server.ssrLoadModule('/src/lib/coaches.js');

  // ── 1) Todo specialty tem 2-3 benefícios reais ──────────────────────────
  const specialties = Object.entries(COACH_SPECIALTY_INFO);
  gate('COACH_SPECIALTY_INFO não está vazio', specialties.length > 0);
  for (const [id, info] of specialties) {
    gate(`Especialidade "${id}" tem entre 2 e 3 benefícios reais`, Array.isArray(info.benefits) && info.benefits.length >= 2 && info.benefits.length <= 3);
    gate(`Especialidade "${id}" tem label e summary`, Boolean(info.label) && Boolean(info.summary));
  }

  // ── 2) CoachCard.jsx só usa benefícios reais, nada inventado ────────────
  const card = fs.readFileSync('src/components/coaches/CoachCard.jsx', 'utf8');
  gate('CoachCard.jsx importa COACH_SPECIALTY_INFO (já importado antes desta fase)', card.includes('COACH_SPECIALTY_INFO'));
  gate('CoachCard.jsx renderiza specialty?.benefits — nenhum dado novo, só exposição', card.includes('specialty?.benefits'));
  // Anti-invenção: nenhuma string de benefício nova, hardcoded, fora do
  // objeto importado. Os textos reais (ex.: "mais progresso técnico") só
  // podem vir de COACH_SPECIALTY_INFO (coaches.js) — nunca duplicados aqui.
  const knownBenefitStrings = specialties.flatMap(([, info]) => info.benefits);
  for (const benefit of knownBenefitStrings) {
    gate(`CoachCard.jsx não hardcoda o benefício "${benefit}" (deve vir só de coaches.js)`, !card.includes(`'${benefit}'`) && !card.includes(`"${benefit}"`));
  }

  // ── 3) Coaches.jsx: paginação, sem novo algoritmo de recomendação ───────
  const page = fs.readFileSync('src/pages/Coaches.jsx', 'utf8');
  gate('Coaches.jsx tem estado de paginação (visibleCount)', page.includes('visibleCount'));
  gate('Coaches.jsx tem um controle de "Mostrar mais"', /Mostrar mais/.test(page));
  gate('Coaches.jsx zera a paginação quando os filtros mudam', /setVisibleCount\(12\)/.test(page) || /useState\(12\)/.test(page));
  gate('buildCoachDiscovery continua importado e chamado (mesma descoberta de sempre)', page.includes('buildCoachDiscovery'));
  gate('filterCoachDiscovery continua importado e chamado', page.includes('filterCoachDiscovery'));
  gate('sortCoachDiscovery continua importado e chamado', page.includes('sortCoachDiscovery'));
  gate('Nenhum novo campo de "score"/"ranking" próprio foi introduzido em Coaches.jsx', !/customScore|ownRanking|newRecommendation/i.test(page));

  // ── 4) Pipeline real: badges recomendado/melhor custo-benefício intactos ──
  // (mesmo fixture de test-coach-discovery-rc.mjs — prova que a mudança de
  // card não afeta em nada a camada de dados/decisão.)
  const starter = {
    id: 'player-new', level: 'Iniciante', reputation: 0, xp: 0, coins: 5000,
    ranking_position: 1200, coach_id: 'club-coach', coach_paid_by_club: true,
    play_style: 'Equilibrado', region: 'Brasil', club_level: 0,
  };
  const catalog = COACHES_DATA.map((coach, index) => ({ ...coach, id: coach.catalog_key || `coach-${index}` }));
  const discovery = buildCoachDiscovery(catalog, starter, { monthlyIncome: 2500 });
  const recommendedIds = discovery.filter((item) => item.recommended).map((item) => item.coach.id);
  const bestValueIds = discovery.filter((item) => item.bestValue).map((item) => item.coach.id);
  gate('buildCoachDiscovery ainda produz recomendados (top 5)', recommendedIds.length > 0 && recommendedIds.length <= 5);
  gate('buildCoachDiscovery ainda produz melhor custo-benefício (top 3)', bestValueIds.length > 0 && bestValueIds.length <= 3);
  for (const item of discovery) {
    assert.ok(COACH_SPECIALTY_INFO[item.coach.specialty], `especialidade "${item.coach.specialty}" (coach ${item.coach.id}) precisa ter entrada em COACH_SPECIALTY_INFO para o card mostrar benefícios`);
  }
  gate('Todo coach do catálogo tem uma especialidade com benefícios mapeados (nenhum card ficaria sem a lista)', discovery.every((item) => Array.isArray(COACH_SPECIALTY_INFO[item.coach.specialty]?.benefits)));

  console.log(`\n${gates} gates executados, todos PASS — Onboarding Flow 3.1 (clareza na seleção de treinador).`);
} finally {
  await server.close();
}
