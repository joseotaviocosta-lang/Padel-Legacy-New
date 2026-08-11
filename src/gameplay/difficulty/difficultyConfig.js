// Fonte central dos modificadores de dificuldade de carreira. Nenhum outro
// módulo deve espalhar números mágicos de dificuldade — sempre ler daqui via
// getDifficultyModifier(). Este arquivo não pode importar nada (nem `@/...`),
// para poder ser usado tanto pelo app (via alias `@/gameplay/difficulty/...`)
// quanto por scripts Node puros (scripts/test-career-difficulty*.mjs).

export const ALLOWED_CAREER_DIFFICULTIES = ['easy', 'normal', 'hard'];

// Usado apenas para pré-selecionar o card na UI de criação de carreira.
// Não é um valor persistido por padrão — carreiras novas começam com
// career_difficulty = null até o jogador confirmar a escolha no tutorial.
export const DEFAULT_NEW_CAREER_DIFFICULTY = 'normal';

// Usado pela migração de saves antigos (CareerMigration v17): o jogo atual
// representa aproximadamente o Difícil, então saves sem dificuldade definida
// migram para 'hard' sem alterar nenhum atributo já conquistado.
export const DEFAULT_MIGRATED_CAREER_DIFFICULTY = 'hard';

// Cada chave abaixo é lida por um único ponto de integração no código de
// carreira (ver plano de implementação para o mapeamento arquivo-a-arquivo).
// IMPORTANTE: "hard" representa o balanceamento atual do jogo, mas NÃO é
// necessariamente idêntico ao neutro puro (1/0) — a simulação de pacing
// mostrou que o jogo atual (sem nenhum ajuste) leva 11+ temporadas para
// atingir o auge, acima da meta de 8-10. Por isso hard recebe um ajuste leve
// em treino/XP (permitido explicitamente pelo espec: "aumentar
// principalmente training; XP; de forma leve"), calibrado por simulação.
// O fallback verdadeiramente neutro (usado quando nenhuma dificuldade está
// definida) é uma constante separada — ver neutralValueFor() abaixo — que
// nunca muda mesmo que os valores de "hard" sejam recalibrados.
export const DIFFICULTY_CONFIG = {
  hard: {
    // Velocidade de ganho de atributo em treino (src/lib/trainingSystemV2.js).
    trainingGainMultiplier: 1.10,
    // Velocidade de ganho de XP de carreira (treino, partidas, torneios).
    careerXpMultiplier: 1.05,
    // Quanto energia/fadiga se recupera em dias livres e em recuperação médica.
    recoveryMultiplier: 1,
    // Quão rápido a fadiga cresce com treino/partidas/torneios.
    fatigueGainMultiplier: 1,
    // Multiplicador aplicado ao risco de lesão calculado (treino, torneio, semanal).
    injuryRiskMultiplier: 1,
    // Premiação de torneio (moedas por colocação).
    prizeMultiplier: 1,
    // Custos mensais (equipe técnica, treinador, clube).
    costMultiplier: 1,
    // Pontos de ranking ganhos em torneios e partidas de treino.
    rankingPointsMultiplier: 1,
    // Relaxamento dos requisitos de reputação/nível de clube/ranking exigidos
    // por treinadores (não afeta o requisito de nível de habilidade).
    coachRequirementMultiplier: 1,
    // Bônus percentual aplicado à curva de atributos iniciais do build.
    initialAttributeBonusPct: 0,
  },
  normal: {
    trainingGainMultiplier: 1.45,
    careerXpMultiplier: 1.25,
    recoveryMultiplier: 1.10,
    fatigueGainMultiplier: 0.90,
    injuryRiskMultiplier: 0.88,
    prizeMultiplier: 1.08,
    costMultiplier: 0.97,
    // Calibrado por simulação: o ganho de pontos de ranking decai 20% ao
    // fim de cada temporada, então um multiplicador pequeno (~1.03) quase
    // não move a posição no ranking — foi preciso um valor bem maior para
    // que o Médio realmente acelere o acesso competitivo (§13 do espec).
    rankingPointsMultiplier: 1.35,
    coachRequirementMultiplier: 0.92,
    initialAttributeBonusPct: 0.05,
  },
  easy: {
    trainingGainMultiplier: 2.00,
    careerXpMultiplier: 1.70,
    recoveryMultiplier: 1.25,
    fatigueGainMultiplier: 0.80,
    injuryRiskMultiplier: 0.70,
    prizeMultiplier: 1.20,
    costMultiplier: 0.90,
    rankingPointsMultiplier: 2.90,
    coachRequirementMultiplier: 0.82,
    initialAttributeBonusPct: 0.12,
  },
};

/**
 * Normaliza qualquer fonte plausível de dificuldade para um id válido ou null.
 * Aceita: string ('easy'/'normal'/'hard'), um PlayerProfile-like
 * ({career_difficulty}), ou um career-like ({metadata:{career_difficulty}}).
 * Qualquer outra coisa (ausente, inválida, id desconhecido) retorna null —
 * esse null é o que faz getDifficultyModifier cair no valor neutro.
 */
export function normalizeCareerDifficulty(source) {
  let raw = null;
  if (typeof source === 'string') {
    raw = source;
  } else if (source && typeof source === 'object') {
    if (typeof source.career_difficulty === 'string') raw = source.career_difficulty;
    else if (source.metadata && typeof source.metadata.career_difficulty === 'string') raw = source.metadata.career_difficulty;
  }
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  return ALLOWED_CAREER_DIFFICULTIES.includes(normalized) ? normalized : null;
}

// Fallback verdadeiramente neutro por chave (multiplicador = 1, bônus = 0),
// INDEPENDENTE dos valores calibrados de "hard". Isso é deliberado: "hard"
// pode ser recalibrado (ex.: treino/XP levemente acima de 1.0, ver acima)
// sem nunca afetar o comportamento de código/testes que não definem
// career_difficulty — o contrato de compatibilidade abaixo depende disso.
const ADDITIVE_KEYS = new Set(['initialAttributeBonusPct']);
function neutralValueFor(key) {
  return ADDITIVE_KEYS.has(key) ? 0 : 1;
}

/**
 * Único ponto de leitura de multiplicadores de dificuldade em todo o jogo.
 * Contrato crítico de compatibilidade: quando `source` não tem dificuldade
 * definida (perfil de teste isolado, carreira ainda não migrada/escolhida,
 * chave desconhecida), retorna o valor verdadeiramente neutro (1 para
 * multiplicadores, 0 para bônus aditivos) — nunca os valores calibrados de
 * 'hard', 'normal' ou 'easy'. Isso garante que qualquer fixture/teste que
 * não define career_difficulty continue se comportando exatamente como
 * antes deste sistema existir, mesmo que 'hard' seja recalibrado.
 */
export function getDifficultyModifier(source, key) {
  const neutral = neutralValueFor(key);
  const difficulty = normalizeCareerDifficulty(source);
  if (!difficulty) return neutral;
  const tierConfig = DIFFICULTY_CONFIG[difficulty];
  const value = tierConfig ? tierConfig[key] : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : neutral;
}
