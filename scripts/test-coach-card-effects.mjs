// Tutorial 4.1 — clareza do card de treinador
// (docs/TUTORIAL_4_1_EXPANDED_ONBOARDING_AND_COACH_CLARITY.md, Parte F/G).
//
// QA real: o card mostrava texto editorial vago ("mais estratégia") de
// COACH_SPECIALTY_INFO.benefits, enquanto o impacto numérico real
// (getCoachImpactSummary().highlights, mesma função de CoachDetail.jsx)
// só aparecia em "Ver detalhes" — impossível comparar treinadores sem
// abrir cada um. Este teste prova: (1) o card foi realmente religado à
// função canônica, não a uma cópia; (2) para treinadores de cada
// especialidade, os highlights mostrados são números reais (nunca a lista
// editorial estática); (3) card e "Ver detalhes" usam a MESMA função —
// não têm como divergir de novo; (4) o valor de assinatura (antes
// ausente do card) agora aparece.
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
  // ═══════════════════════════════════════════════════════════════════════
  // 1) Fonte do card: religada à função canônica, lista editorial removida
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- 1) CoachCard.jsx usa a fonte canônica, não uma lista editorial separada ---');
  const cardSource = readFileSync('src/components/coaches/CoachCard.jsx', 'utf8');
  gate('CoachCard.jsx importa getCoachImpactSummary (mesma função que "Ver detalhes" usa)', cardSource.includes("import { COACH_TIERS, getCoachImpactSummary } from '@/lib/coaches';"));
  gate('CoachCard.jsx NÃO importa mais COACH_SPECIALTY_INFO (a lista editorial estática que causava a divergência)', !/import\s*\{[^}]*COACH_SPECIALTY_INFO/.test(cardSource));
  gate('CoachCard.jsx renderiza impact.highlights (efeito real), não specialty.benefits (texto vago)', cardSource.includes('impact.highlights') && !cardSource.includes('specialty.benefits') && !cardSource.includes('specialty?.benefits'));
  gate('CoachCard.jsx recebe profile como prop (necessário para calcular o impacto real)', /CoachCard\(\{\s*evaluation,\s*profile,/.test(cardSource));
  gate('CoachCard.jsx mostra o valor de assinatura (evaluation.signingCost) — antes ausente do card', cardSource.includes('evaluation.signingCost'));

  const detailSource = readFileSync('src/components/coaches/CoachDetail.jsx', 'utf8');
  gate('CoachDetail.jsx ("Ver detalhes") também usa getCoachImpactSummary — mesma fonte, nunca mais duas listas', detailSource.includes('getCoachImpactSummary(coach, profile)'));

  const pageSource = readFileSync('src/pages/Coaches.jsx', 'utf8');
  gate('Coaches.jsx passa profile para os 3 pontos de renderização de CoachCard', (pageSource.match(/<CoachCard key=\{evaluation\.coach\.id\} evaluation=\{evaluation\} profile=\{profile\}/g) || []).length === 3);

  // ═══════════════════════════════════════════════════════════════════════
  // 2) Para cada especialidade real, o impacto é numérico, nunca vago
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- 2) Impacto real por especialidade (nunca texto editorial vago) ---');
  const { COACHES_DATA, getCoachImpactSummary, evaluateCoachForCareer } = await server.ssrLoadModule('/src/lib/coaches.js');
  const profile = {
    id: 'qa-coach-card', level: 'Elite', reputation: 90, coins: 999999, coach_trust: 55, coach_relationship_months: 0,
    play_style: 'Equilibrado', court_side: 'direita',
  };
  const VAGUE_EDITORIAL_PHRASES = ['mais estratégia', 'melhores escolhas de golpe', 'mais progresso técnico', 'mais confiança', 'mais energia', 'mais foco'];

  for (const specialty of ['tecnico', 'motivacional', 'estratega', 'fisico', 'mental']) {
    const coach = COACHES_DATA.find((c) => c.specialty === specialty);
    gate(`Existe ao menos 1 treinador real de especialidade "${specialty}" no catálogo`, Boolean(coach));
    if (!coach) continue;
    const impact = getCoachImpactSummary(coach, profile);
    gate(`[${specialty}] impact.highlights não está vazio`, impact.highlights.length > 0);
    gate(`[${specialty}] highlights são efeitos reais (contêm número ou "Foco:"), nunca a frase editorial vaga`, impact.highlights.every((h) => (/\d/.test(h) || h.startsWith('Foco:')) && !VAGUE_EDITORIAL_PHRASES.includes(h)));
    const evaluation = evaluateCoachForCareer(coach, profile, {});
    gate(`[${specialty}] evaluation.signingCost é um número válido (>= 0), o que o card agora exibe`, Number.isFinite(evaluation.signingCost) && evaluation.signingCost >= 0);
    gate(`[${specialty}] evaluation.salary nunca é 1 (mesma garantia de coach-salary-consistency, verificada aqui pelo ângulo do card)`, evaluation.salary > 1);
  }

  console.log(`\n${gates} gates executados, todos PASS — Clareza do card de treinador (impacto real no card, nunca lista editorial, card === "Ver detalhes").`);
} finally {
  await server.close();
}
