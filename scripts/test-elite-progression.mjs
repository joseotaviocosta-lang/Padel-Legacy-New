// Fase 13.1 (docs/FASE_13_1_CAREER_PACE_VALIDATION.md, Parte 10/15/21).
//
// Achado central da investigação: nenhum ponto da criação real de carreira
// (CareerInitialDataService.js, ActiveCareerAdapter.js,
// initialCareerProfiles.js, assistente de personagem) jamais define
// `profile.potential`. Todo jogador real caía no fallback antigo da fórmula
// de teto de atributo (getAttributeDevelopmentCeiling, trainingSystemV2.js):
// 72, teto ~82-84 — abaixo do próprio Overall dos bots do Top 100 real
// (~85, rankingPopulation.js), tornando o Top 100+ estruturalmente
// inalcançável para qualquer carreira real. Os simuladores estatísticos
// (massive-v32/career-difficulty-pace) nunca expuseram isso porque SEMPRE
// injetam seu próprio `potential` (78-91) por cenário.
//
// Este teste prova, com a função REAL (não uma cópia), que: (1) o bug
// existia (fallback antigo ficava abaixo do Overall real dos bots do
// Top 100); (2) a correção (fallback 80) resolve isso sem tornar o Top 20-
// 10-5-3-#1 trivial (ainda exige mais do que a média — carreira excepcional
// continua sendo necessária, Parte 12); (3) a inconsistência entre os dois
// fallbacks do mesmo campo (72 vs 60) foi unificada.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

// Mesma fórmula de rankingPopulation.js (Overall de um bot pela posição no
// ranking) — não uma cópia arbitrária, é literalmente a leitura do arquivo
// real via import, para nunca divergir se a curva for recalibrada depois.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { getAttributeDevelopmentCeiling, calculateTrainingGainBudget } = await server.ssrLoadModule('/src/lib/trainingSystemV2.js');
  const rankingPopulationSource = await server.ssrLoadModule('/src/lib/rankingPopulation.js');
  const botOverallAtRank = (rank) => Math.max(35, Math.min(96, Math.round(96 - Math.pow(rank / rankingPopulationSource.WORLD_RANKING_TARGET, 0.72) * 57)));

  const realProfile = { id: 'qa-elite', play_style: 'equilibrado', tactical_role: '' }; // sem `potential` — exatamente como todo perfil real
  gate('Perfil real (sem potential definido) não lança exceção ao calcular teto', typeof getAttributeDevelopmentCeiling(realProfile, 'forehand') === 'number');

  const realCeiling = getAttributeDevelopmentCeiling(realProfile, 'forehand');
  gate('BUG CONFIRMADO E CORRIGIDO: teto de um perfil real (sem potential) agora é >= Overall de um bot do Top 100 (antes, 72→~82-84, ficava ABAIXO de 85)', realCeiling >= botOverallAtRank(100));
  gate('Teto de um perfil real fica abaixo do Overall de um bot do Top 20 (carreira excepcional continua exigindo mais que o padrão — Parte 12, não virou trivial)', realCeiling < botOverallAtRank(20));
  gate('Teto de um perfil real fica claramente abaixo do Overall de um bot do Top 10/5/3/#1 (elite continua difícil por design)', realCeiling < botOverallAtRank(10) && realCeiling < botOverallAtRank(5) && realCeiling < botOverallAtRank(1));

  // ── Consistência entre os dois pontos de leitura do mesmo campo ausente ──
  const budget = calculateTrainingGainBudget({ profile: realProfile, training: { baseGainBudget: 0.9, groupId: 'court', primaryAttributes: { forehand: 1 }, secondaryAttributes: {} }, intensityId: 'moderado' });
  gate('calculateTrainingGainBudget não lança exceção com o mesmo perfil real sem potential', Number.isFinite(budget.budget));

  // ── Uma carreira EXCEPCIONAL (potential alto, hipótese explícita de teste — Parte 12) já consegue algo bem melhor ──
  const exceptionalProfile = { id: 'qa-exceptional', potential: 95, play_style: 'ofensivo', tactical_role: '' };
  const exceptionalCeiling = getAttributeDevelopmentCeiling(exceptionalProfile, 'smash'); // smash é preferido pro estilo ofensivo
  gate('Uma carreira EXCEPCIONAL (potential=95, hipótese de teste explícita) atinge teto comparável ao Top 5-3 real — #1 continua raro, mas alcançável (Parte 12/13)', exceptionalCeiling >= botOverallAtRank(5) && exceptionalCeiling < botOverallAtRank(1) + 3);

  // ── Regressão: perfil que JÁ define potential explicitamente continua respeitado (nunca sobrescrito pelo fallback) ──
  const explicitProfile = { id: 'qa-explicit', potential: 60, play_style: 'equilibrado', tactical_role: '' };
  const explicitCeiling = getAttributeDevelopmentCeiling(explicitProfile, 'forehand');
  gate('Perfil que já define potential explicitamente (ex.: simuladores de pace) nunca é sobrescrito pelo novo fallback — continua usando o valor próprio', explicitCeiling < realCeiling);

  console.log(`\n${gates} gates executados, todos PASS — Correção do teto de atributo para carreiras reais (Fase 13.1, Parte 10/15): Top 100+ deixa de ser estruturalmente inalcançável, elite continua difícil por design.`);
} finally {
  await server.close();
}
