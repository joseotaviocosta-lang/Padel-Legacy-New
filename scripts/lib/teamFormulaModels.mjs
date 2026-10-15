// Playthrough 5.11, Parte E — modelos candidatos para os pontos de uma
// dupla a partir dos rolling points individuais dos dois membros.
//
// Todos são funções PURAS de (a, b), determinísticas, simétricas
// (f(a,b) === f(b,a)) e sem acesso a banco — requisito da Parte R.
// Nenhum usa OVR (Parte V) nem nome (critério 8).
//
// Convenção de zeros (Parte J): um membro com 0 pontos é "sem resultado
// no circuito", não um erro. Nenhum modelo pode devolver NaN, Infinity ou
// dividir por zero; modelos multiplicativos colapsariam a dupla inteira
// para 0, então usam um piso explícito em vez de silenciosamente zerar.

// Reexporta a fórmula REAL de produção para que os testes nunca repliquem
// a implementação que estão verificando.
export { computeCanonicalTeamRankingPoints } from '../../src/lib/teamRankingFormula.js';

// Curva canônica de pontos do circuito — usada pela população sintética
// determinística dos testes (sem boot de mundo).
import { pointsForRank } from '../../src/lib/rankingPopulation.js';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const asPair = (a, b) => {
  const x = num(a);
  const y = num(b);
  return { min: Math.min(x, y), max: Math.max(x, y), sum: x + y };
};

// Razão de assimetria. Com o membro fraco em 0 a razão seria infinita;
// usa 1 como piso do denominador para manter a curva contínua e finita.
export function gapRatio(a, b) {
  const { min, max } = asPair(a, b);
  if (max <= 0) return 1;
  return max / Math.max(min, 1);
}

// MODEL A — média simples (histórico: produção até a 5.10).
export const modelSimpleAverage = (a, b) => Math.round(asPair(a, b).sum / 2);

// MODEL B — média geométrica (histórico: produção na 5.11, SUPERADA na
// 5.22-E pela soma). Mantido só para comparação antes/depois.
export const modelGeometric = (a, b) => {
  const { min, max } = asPair(a, b);
  return Math.round(Math.sqrt(Math.max(min, 0) * max));
};

// MODEL G — SOMA (autoridade vigente desde a 5.22-E).
//   TeamRankingPoints = A + B
// É a mesma função de produção reexportada acima; exposta com rótulo de
// modelo para as tabelas de comparação.
export const modelSum = (a, b) => Math.round(asPair(a, b).sum);

// MODEL C — ponderado pelo membro fraco.
export const modelWeighted = (wWeak) => (a, b) => {
  const { min, max } = asPair(a, b);
  return Math.round(min * wWeak + max * (1 - wWeak));
};

// MODEL D — média harmônica. Com min=0 devolveria 0/0; piso em 1.
export const modelHarmonic = (a, b) => {
  const { min, max } = asPair(a, b);
  const lo = Math.max(min, 1);
  if (max <= 0) return 0;
  return Math.round((2 * lo * max) / (lo + max));
};

// MODEL E — uplift limitado: parte do membro fraco e sobe uma fração fixa
// da distância até o forte. Algebricamente equivale ao MODEL C com
// wWeak = 1 - fraction; mantido separado porque o briefing pede os dois e
// a leitura de produto é diferente ("quanto a estrela consegue puxar").
export const modelCappedUplift = (fraction) => (a, b) => {
  const { min, max } = asPair(a, b);
  return Math.round(min + fraction * (max - min));
};

// MODEL F — média com penalidade de assimetria.
// penalty(ratio) = 1 / (1 + k * ln(ratio)) — contínua, monotônica
// decrescente, penalty(1) = 1 exatamente, sem cliffs (Parte I).
export const asymmetryPenalty = (k) => (ratio) => {
  const r = Math.max(1, Number(ratio) || 1);
  return 1 / (1 + k * Math.log(r));
};

export const modelPenalizedAverage = (k) => (a, b) => {
  const { sum } = asPair(a, b);
  return Math.round((sum / 2) * asymmetryPenalty(k)(gapRatio(a, b)));
};

// Catálogo comparado nos testes. Rótulos curtos para caber nas tabelas.
// `modelSum` (id 'G') é a AUTORIDADE VIGENTE; A/B/C/D/E/F são históricos.
export const MODELS = [
  { id: 'A', label: 'média simples', fn: modelSimpleAverage, historical: true },
  { id: 'B', label: 'geométrica', fn: modelGeometric, historical: true },
  { id: 'G', label: 'soma (atual)', fn: modelSum, current: true },
  { id: 'C60', label: 'ponderado 60/40', fn: modelWeighted(0.6), historical: true },
  { id: 'C70', label: 'ponderado 70/30', fn: modelWeighted(0.7), historical: true },
  { id: 'C75', label: 'ponderado 75/25', fn: modelWeighted(0.75), historical: true },
  { id: 'D', label: 'harmônica', fn: modelHarmonic, historical: true },
  { id: 'E50', label: 'uplift 0.50', fn: modelCappedUplift(0.5), historical: true },
  { id: 'E65', label: 'uplift 0.65', fn: modelCappedUplift(0.65), historical: true },
  { id: 'F10', label: 'penalty k=0.10', fn: modelPenalizedAverage(0.10), historical: true },
  { id: 'F15', label: 'penalty k=0.15', fn: modelPenalizedAverage(0.15), historical: true },
  { id: 'F20', label: 'penalty k=0.20', fn: modelPenalizedAverage(0.20), historical: true },
];

export const CURRENT_MODEL = MODELS.find((m) => m.current);

export const modelById = (id) => MODELS.find((m) => m.id === id);

// ---------------------------------------------------------------------------
// População determinística representativa (Playthrough 5.22-F).
//
// Os testes da família 5.11 mediam o efeito da fórmula sobre a população
// semeada; isso exigia um ano de simulação headless (~5-8 min por teste).
// O objetivo é a FÓRMULA, não o calendário: `pointsForRank` já é a curva
// canônica de pontos do circuito, então uma população construída sobre ela
// reproduz a distribuição (elite equilibrada, cauda longa, assimetria) de
// forma instantânea e determinística.
// ---------------------------------------------------------------------------
export function buildSyntheticPopulation({ pairCount = 500, worldSize = 1000 } = {}) {
  const athletes = Array.from({ length: worldSize }, (_, i) => ({
    id: `synth-${i}`,
    points: pointsForRank(i + 1),
  }));
  const pairs = [];
  for (let i = 0; i < pairCount; i += 1) {
    const a = athletes[(i * 2) % athletes.length];
    const b = athletes[(i * 2 + 1) % athletes.length];
    pairs.push({ key: `pair-${i}`, name: `${a.id}/${b.id}`, a: a.points, b: b.points, ratio: gapRatio(a.points, b.points) });
  }
  return { athletes, pairs };
}

// ---------------------------------------------------------------------------
// Utilitários de comparação.
// ---------------------------------------------------------------------------

// Posição de `points` dentro de uma lista ordenada desc (ranking de
// competição: empates dividem posição).
export function positionOf(points, sortedDesc) {
  let i = 0;
  while (i < sortedDesc.length && sortedDesc[i] > points) i += 1;
  return i + 1;
}

export function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const value of setA) if (setB.has(value)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 1 : inter / union;
}
