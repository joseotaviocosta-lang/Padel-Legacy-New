// Aparência — Fase B: sugestão (não trava) de faixa de altura/biotipo com
// base no estilo/lado/mão que o jogador já escolheu no onboarding
// (chooseSide/chooseStyle, Missions.jsx). Reaproveita os MESMOS gatilhos
// táticos que evaluateBuildAffinity() (initialCareerProfiles.js) já usa pra
// dar bônus/penalidade de afinidade de estilo — não é uma heurística
// paralela inventada, é a mesma lógica esportiva estendida a uma dimensão
// física nova.
//
// Sugestão, não trava: o jogador pode escolher qualquer altura/biotipo fora
// da faixa — a UI (AppearanceEditor.jsx) só mostra um aviso contextual. Só
// aparece antes do primeiro save; depois disso o campo já está travado pela
// Fase A (characterFieldLocks.js) e a sugestão nunca mais é exibida, mesmo
// que o estilo mude depois no perfil — não precisa de lógica extra pra
// isso, é consequência direta de a trava já ter acontecido.
import { COURT_SIDE_OPTIONS } from './initialCareerProfiles.js';

const HEIGHT_MIN = 155;
const HEIGHT_MAX = 210;
const VALID_SIDES = COURT_SIDE_OPTIONS.map(side => side.id);

// Eixo primário — estilo. 3 tiers reais de exigência física (potência/rede,
// neutro, compacto/defesa); dentro de cada tier, cada estilo tem sua própria
// sub-faixa — nunca duas faixas idênticas byte a byte, mesmo entre estilos
// vizinhos do mesmo tier. A SOBREPOSIÇÃO entre faixas vizinhas é intencional
// (não deve haver fronteira rígida entre estilos parecidos) — o que não é
// intencional é duas faixas EXATAMENTE iguais, o que uma revisão anterior
// desta tabela tinha por acidente (construtor/contra_ataque e
// controle/defensivo estavam ambos com o mesmo range copiado do tier,
// sem diferenciação dentro do tier) e foi corrigido aqui.
export const STYLE_PHYSICAL_PROFILES = {
  // ── Tier potência/rede — mais dependentes de smash/voleio/saque, se
  // beneficiam de envergadura e alcance aéreo ──
  finalizador: {
    heightRange: [184, 202],
    primaryBuild: 'musculoso',
    secondaryBuild: 'robusto',
    rationale: 'Estilo mais dependente de rede, smash e saque dos 7 (top 3 pontos fortes) — envergadura e potência de ataque aéreo são vantagem direta.',
  },
  ofensivo: {
    heightRange: [180, 197],
    primaryBuild: 'musculoso',
    secondaryBuild: 'atletico',
    rationale: 'Busca a rede e acelera pra criar definições — alcance no voleio/smash importa, um degrau abaixo do finalizador.',
  },
  // ── Tier neutro — sem especialização física extrema ──
  equilibrado: {
    heightRange: [172, 188],
    primaryBuild: 'atletico',
    secondaryBuild: null,
    rationale: 'Combina construção, defesa e ataque sem especialização — faixa neutra centrada no próprio default do jogo (178cm/atlético).',
  },
  contra_ataque: {
    heightRange: [170, 185],
    primaryBuild: 'atletico',
    secondaryBuild: 'magro',
    rationale: 'Defende com segurança e acelera quando abre espaço — precisa de explosão pra transição, não só compacidade pura.',
  },
  construtor: {
    heightRange: [168, 182],
    primaryBuild: 'atletico',
    secondaryBuild: 'magro',
    rationale: 'Organiza o ponto e prepara a bola pra dupla de posições variadas — build equilibrado, sem puxar pra nenhum extremo.',
  },
  // ── Tier compacto/defesa — priorizam centro de gravidade baixo e
  // agilidade lateral sobre envergadura ──
  controle: {
    heightRange: [165, 179],
    primaryBuild: 'atletico',
    secondaryBuild: 'magro',
    rationale: 'Jogo de regularidade e ritmo de fundo de quadra — corpo compacto ajuda a cobertura lateral, não depende de alcance de rede.',
  },
  defensivo: {
    heightRange: [162, 177],
    primaryBuild: 'magro',
    secondaryBuild: 'atletico',
    rationale: 'Absorve pressão e prolonga trocas — centro de gravidade baixo e agilidade pesam mais que envergadura, o mais compacto dos 7.',
  },
};

function clampHeight([min, max]) {
  return [Math.max(HEIGHT_MIN, min), Math.min(HEIGHT_MAX, max)];
}

// Eixo secundário — lado/mão. Nudge pequeno (±2-3cm), só nos MESMOS combos
// que já valem bônus de afinidade em evaluateBuildAffinity() — não é uma
// heurística nova, é a mesma lógica tática existente estendida ao físico.
//
// `equilibrado` e `contra_ataque` DELIBERADAMENTE não têm nudge de lado
// aqui — não existe combo de afinidade correspondente pra eles em
// evaluateBuildAffinity() hoje. Não "complete" esta lista pra cobrir os 7
// estilos sem antes adicionar o combo correspondente lá — isso criaria uma
// correlação nova sem lastro na lógica tática já estabelecida do jogo.
function getSideHandNudge(handedness, preferredSide, playStyle) {
  const isOffensive = playStyle === 'ofensivo' || playStyle === 'finalizador';
  const isConstruction = playStyle === 'controle' || playStyle === 'construtor' || playStyle === 'defensivo';

  if (handedness === 'left' && preferredSide === 'direita' && isOffensive) {
    return { deltaCm: 3, note: 'Canhotos na direita abrem ângulos de ataque pelo centro — o combo mais agressivo do jogo, reforça ainda mais a ênfase de rede.' };
  }
  if (preferredSide === 'esquerda' && isOffensive) {
    return { deltaCm: 2, note: 'O lado esquerdo é convencionalmente o lado que fecha pontos no padel — reforça a ênfase de rede.' };
  }
  if (preferredSide === 'direita' && isConstruction) {
    return { deltaCm: -2, note: 'O lado direito é o lado de construção — reforça o perfil compacto.' };
  }
  // preferredSide === 'versatil' (ou combo sem regra acima): sem nudge — é
  // uma dimensão de flexibilidade tática, não físico.
  return null;
}

/**
 * @param {{ handedness?: string, preferredSide?: string, playStyle?: string }} params
 * @returns {null | { heightRange: [number, number], suggestedBuild: string, secondaryBuild: string|null, rationale: string, sideNote: string|null }}
 * Retorna null quando o jogador ainda não escolheu estilo/lado/mão (guard
 * defensivo: nunca inventa uma sugestão baseada num padrão silencioso —
 * relevante porque /character não tem gate de acesso e pode ser visitado
 * antes do onboarding de estilo terminar).
 */
export function getSuggestedPhysicalRange({ handedness, preferredSide, playStyle } = {}) {
  const profile = STYLE_PHYSICAL_PROFILES[playStyle];
  if (!profile || !['right', 'left'].includes(handedness) || !VALID_SIDES.includes(preferredSide)) return null;

  const nudge = getSideHandNudge(handedness, preferredSide, playStyle);
  const [baseMin, baseMax] = profile.heightRange;
  const delta = nudge?.deltaCm || 0;
  const heightRange = clampHeight([baseMin + delta, baseMax + delta]);

  return {
    heightRange,
    suggestedBuild: profile.primaryBuild,
    secondaryBuild: profile.secondaryBuild,
    rationale: profile.rationale,
    sideNote: nudge?.note || null,
  };
}
