// Onboarding Flow 3.1 (docs/ONBOARDING_FLOW_3_1.md, Parte 4).
//
// QA real: a página de treinadores escondia os benefícios reais atrás de
// "Ver detalhes" — o card mostrava tier/especialidade/salário/OVR e uma
// frase genérica, mas nunca os 2-3 benefícios concretos da especialidade.
// Além disso, o filtro padrão de uma carreira nova ("available") podia
// listar dezenas de treinadores de uma vez, sem paginação.
//
// Correção original: CoachCard.jsx passou a renderizar COACH_SPECIALTY_INFO
// [...].benefits; Coaches.jsx ganhou paginação client-side ("Mostrar mais")
// sem tocar em buildCoachDiscovery/filterCoachDiscovery/sortCoachDiscovery
// nem inventar critério de recomendação novo.
//
// Tutorial 4.1 (docs/TUTORIAL_4_1_EXPANDED_ONBOARDING_AND_COACH_CLARITY.md,
// Parte F/G): QA real encontrou justamente essa correção regredindo — o
// texto de .benefits é editorial estático e podia divergir do impacto
// numérico real (getCoachImpactSummary().highlights, mesma função que
// "Ver detalhes" usa). O card foi religado à função canônica; a seção 2
// abaixo foi atualizada para verificar essa fonte única, não a lista
// antiga.
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
  const { buildCoachDiscovery, COACH_SPECIALTY_INFO, COACHES_DATA, getCoachImpactSummary } = await server.ssrLoadModule('/src/lib/coaches.js');

  // ── 1) Todo specialty tem 2-3 benefícios reais ──────────────────────────
  const specialties = Object.entries(COACH_SPECIALTY_INFO);
  gate('COACH_SPECIALTY_INFO não está vazio', specialties.length > 0);
  for (const [id, info] of specialties) {
    gate(`Especialidade "${id}" tem entre 2 e 3 benefícios reais`, Array.isArray(info.benefits) && info.benefits.length >= 2 && info.benefits.length <= 3);
    gate(`Especialidade "${id}" tem label e summary`, Boolean(info.label) && Boolean(info.summary));
  }

  // ── 2) CoachCard.jsx só usa impacto real, nada inventado ─────────────────
  // Tutorial 4.1 (docs/TUTORIAL_4_1_EXPANDED_ONBOARDING_AND_COACH_CLARITY.md,
  // Parte F/G): QA real encontrou uma REGRESSÃO desta própria fase — o card
  // voltou a esconder o impacto real atrás de "Ver detalhes", porque
  // COACH_SPECIALTY_INFO.benefits (texto editorial estático) e
  // getCoachImpactSummary().highlights (efeito numérico real, usado em
  // CoachDetail.jsx) são duas listas independentes que podem divergir.
  // Corrigido religando o card à MESMA função canônica que o modal usa —
  // atualizado aqui de propósito, mesma propriedade real (nenhum dado
  // inventado, só a fonte certa). Ver test-coach-card-effects.mjs para a
  // cobertura dedicada e mais detalhada dessa correção.
  const card = fs.readFileSync('src/components/coaches/CoachCard.jsx', 'utf8');
  gate('CoachCard.jsx importa getCoachImpactSummary (mesma função que "Ver detalhes" usa, não uma lista editorial separada)', card.includes('getCoachImpactSummary'));
  gate('CoachCard.jsx renderiza impact.highlights — efeito numérico real, nunca a frase editorial vaga', card.includes('impact.highlights'));
  // Ignora comentários (o próprio código-fonte cita "mais estratégia" como
  // exemplo do texto antigo removido, dentro de um comentário explicativo —
  // não é uma renderização de verdade).
  const cardWithoutComments = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  gate('CoachCard.jsx não hardcoda nenhuma string de benefício editorial (nada inventado, nada vago)', specialties.flatMap(([, info]) => info.benefits).every((benefit) => !cardWithoutComments.includes(`'${benefit}'`) && !cardWithoutComments.includes(`"${benefit}"`)));

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
    assert.ok(COACH_SPECIALTY_INFO[item.coach.specialty], `especialidade "${item.coach.specialty}" (coach ${item.coach.id}) precisa ter entrada em COACH_SPECIALTY_INFO para o modal mostrar título/resumo`);
  }
  gate('Todo coach do catálogo produz impact.highlights não-vazio (nenhum card ficaria sem o efeito real)', discovery.every((item) => getCoachImpactSummary(item.coach, starter).highlights.length > 0));

  console.log(`\n${gates} gates executados, todos PASS — Onboarding Flow 3.1 (clareza na seleção de treinador).`);
} finally {
  await server.close();
}
