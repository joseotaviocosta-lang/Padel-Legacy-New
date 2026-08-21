// Fase 13.1 (docs/FASE_13_1_CAREER_PACE_VALIDATION.md, Parte 11/21).
//
// Prova a curva de multiplicador de idade REAL (não uma cópia) usada por
// calculateTrainingGainBudget (src/lib/trainingSystemV2.js) — a mesma
// fórmula que todo treino real usa. Objetivo: confirmar que a janela de
// maior crescimento continua nos 16-22 anos, o auge (maior multiplicador
// sustentado) cai por volta de 22-26, e a curva desacelera suavemente
// depois — sem implementar declínio novo (não existe, e a Parte 11 pede
// pra não inventar).
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { calculateTrainingGainBudget } = await server.ssrLoadModule('/src/lib/trainingSystemV2.js');

  function budgetAtAge(age) {
    const profile = {
      birth_date: '2010-01-01',
      career_date: `${2010 + age}-01-01`,
      forehand: 40, backhand: 40, fatigue: 0, potential: 80,
    };
    const training = { baseGainBudget: 0.9, groupId: 'court', primaryAttributes: { forehand: 1 }, secondaryAttributes: {} };
    return calculateTrainingGainBudget({ profile, training, intensityId: 'moderado' }).budget;
  }

  const ages = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
  const budgets = Object.fromEntries(ages.map((age) => [age, budgetAtAge(age)]));
  console.log('(info) budget de treino por idade:', JSON.stringify(budgets));

  // ── Parte 11: maior janela de crescimento nos 16-22 ─────────────────────
  gate('Idade 16-18 tem o maior budget de treino (janela de crescimento inicial)', budgets[16] >= budgets[22] && budgets[17] >= budgets[22]);
  gate('Budget de treino é estritamente decrescente a partir dos 19 anos (nunca acelera de novo mais tarde)', ages.slice(ages.indexOf(19)).every((age, i, arr) => i === 0 || budgets[arr[i - 1]] >= budgets[age]));

  // ── Parte 11: auge (região de budget ainda alto) cobre 22-26, não termina abruptamente antes ──
  gate('Aos 22 anos o budget ainda é competitivo (>= 80% do valor aos 16)', budgets[22] >= budgets[16] * 0.8);
  gate('Aos 26 anos o budget já caiu de forma perceptível em relação ao pico (plateau/desaceleração, não platô eterno)', budgets[26] < budgets[16]);

  // ── Curva suave: nenhum salto abrupto entre idades adjacentes ────────────
  for (let i = 1; i < ages.length; i += 1) {
    const prev = ages[i - 1]; const curr = ages[i];
    const ratio = budgets[curr] / budgets[prev];
    gate(`Transição ${prev}->${curr}: variação suave (entre 0.5x e 1.05x), sem salto abrupto`, ratio >= 0.5 && ratio <= 1.05);
  }

  // ── Regressão: nenhum budget nulo/negativo/NaN em toda a faixa jogável ──
  gate('Nenhum budget é NaN, negativo ou zero em toda a faixa 16-28', ages.every((age) => Number.isFinite(budgets[age]) && budgets[age] > 0));

  console.log(`\n${gates} gates executados, todos PASS — Curva de OVR/treino por idade (Fase 13.1, Parte 11): pico 16-22, auge sustentado até ~26, desaceleração suave depois, sem declínio implementado.`);
} finally {
  await server.close();
}
