// Fase 13.1 (docs/FASE_13_1_CAREER_PACE_VALIDATION.md, Parte 5/17/21).
//
// Prova, lendo a fonte real de dificuldade (nunca uma cópia —
// src/gameplay/difficulty/difficultyConfig.js), que: (1) fácil continua
// mais rápido que normal, que continua mais rápido que difícil, em TODOS os
// multiplicadores relevantes de pace (treino/XP/ranking/prêmio); (2)
// nenhuma dificuldade multiplica penalidades a ponto de tornar qualquer
// coisa "praticamente impossível" (todas ficam num raio razoável do
// neutro); (3) 'hard' representa o balanceamento atual do jogo (comentário
// da própria fonte), não um universo completamente diferente de 'normal'.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { DIFFICULTY_CONFIG, getDifficultyModifier, ALLOWED_CAREER_DIFFICULTIES } = await server.ssrLoadModule('/src/gameplay/difficulty/difficultyConfig.js');

  gate('Existem exatamente 3 dificuldades permitidas (easy/normal/hard)', ALLOWED_CAREER_DIFFICULTIES.length === 3 && ['easy', 'normal', 'hard'].every((d) => ALLOWED_CAREER_DIFFICULTIES.includes(d)));

  // ── Parte 17: fácil > normal > hard em TODOS os multiplicadores de aceleração ──
  const ACCELERATION_KEYS = ['trainingGainMultiplier', 'careerXpMultiplier', 'recoveryMultiplier', 'prizeMultiplier', 'rankingPointsMultiplier'];
  for (const key of ACCELERATION_KEYS) {
    const easy = getDifficultyModifier('easy', key);
    const normal = getDifficultyModifier('normal', key);
    const hard = getDifficultyModifier('hard', key);
    gate(`${key}: fácil (${easy}) >= normal (${normal}) >= difícil (${hard}) — ordem de aceleração preservada`, easy >= normal && normal >= hard);
  }
  // Penalidades/requisitos (quanto MAIOR, pior/mais exigente para o
  // jogador) devem ir na direção oposta — fácil sempre <= difícil.
  for (const key of ['fatigueGainMultiplier', 'injuryRiskMultiplier', 'costMultiplier', 'coachRequirementMultiplier']) {
    const easy = getDifficultyModifier('easy', key);
    const normal = getDifficultyModifier('normal', key);
    const hard = getDifficultyModifier('hard', key);
    gate(`${key} (penalidade/exigência): fácil (${easy}) <= normal (${normal}) <= difícil (${hard}) — fácil penaliza/exige menos`, easy <= normal && normal <= hard);
  }

  // ── Parte 17: nenhuma dificuldade cria universos radicalmente diferentes ──
  // "hard" representa o balanceamento atual do jogo (comentário da própria
  // fonte) — os multiplicadores de aceleração de "easy"/"normal" são reais
  // e substanciais, mas nenhum deles ultrapassa uma faixa de 3x em relação
  // ao neutro (1.0), o que já é generoso o bastante sem criar "fácil = #1
  // automático" nem "difícil = #1 impossível" (ambos ainda usam a MESMA
  // curva de pontos/Overall de bots — só a velocidade de progresso muda).
  for (const difficultyId of ALLOWED_CAREER_DIFFICULTIES) {
    for (const key of [...ACCELERATION_KEYS, 'fatigueGainMultiplier', 'injuryRiskMultiplier', 'costMultiplier', 'coachRequirementMultiplier']) {
      const value = getDifficultyModifier(difficultyId, key);
      gate(`${difficultyId}.${key} (${value}) fica dentro de uma faixa razoável (0.5x-3x do neutro) — nenhum universo radicalmente diferente`, value >= 0.5 && value <= 3);
    }
  }

  // ── Nenhuma dificuldade zera injúria/recuperação (achado de findings.js do harness original) ──
  for (const difficultyId of ALLOWED_CAREER_DIFFICULTIES) {
    gate(`${difficultyId}: injuryRiskMultiplier nunca é 0 (lesão continua possível em toda dificuldade)`, getDifficultyModifier(difficultyId, 'injuryRiskMultiplier') > 0);
  }

  // ── Perfil sem dificuldade definida cai no neutro puro (1/0), nunca em 'hard' silenciosamente ──
  gate('Perfil sem career_difficulty definido usa o neutro puro (1.0), não os valores calibrados de "hard"', getDifficultyModifier({}, 'trainingGainMultiplier') === 1 && getDifficultyModifier(null, 'trainingGainMultiplier') === 1);
  gate('Dificuldade desconhecida/inválida também cai no neutro puro, nunca lança exceção', getDifficultyModifier('lendario', 'trainingGainMultiplier') === 1);

  console.log(`\n${gates} gates executados, todos PASS — Consistência de dificuldade (Fase 13.1, Parte 5/17): fácil > normal > difícil preservado, nenhum universo radicalmente diferente, fallback neutro seguro.`);
} finally {
  await server.close();
}
