// Regra canônica do teto individual de desenvolvimento por atributo.
// Módulo folha (sem import de padel.js/trainingSystemV2.js) para que o treino e as
// recompensas de partida compartilhem a MESMA fórmula sem import circular.
import { ATTRIBUTE_KEYS } from '@/lib/attributes.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

const STYLE_ATTRIBUTE_BONUSES = Object.freeze({
  offensive: new Set(['smash', 'volley', 'bandeja', 'serve']),
  defensive: new Set(['defense', 'agility', 'backhand', 'emotional_control']),
  control: new Set(['strategy', 'forehand', 'backhand', 'volley']),
  balanced: new Set(ATTRIBUTE_KEYS),
});

function getProfileStyleKey(profile) {
  const value = `${profile?.play_style || ''} ${profile?.tactical_role || ''}`.toLowerCase();
  if (/ofens|finaliz|pot[eê]ncia|agress/.test(value)) return 'offensive';
  if (/defens|contra/.test(value)) return 'defensive';
  if (/control|construtor|t[aá]tic/.test(value)) return 'control';
  return 'balanced';
}

// Fase 13.1 (docs/FASE_13_1_CAREER_PACE_VALIDATION.md, Parte 10/15, Caso 4):
// achado real confirmado por auditoria de código — nenhum ponto da criação
// real de carreira (CareerInitialDataService.js, ActiveCareerAdapter.js,
// initialCareerProfiles.js, o assistente de personagem) jamais define
// `profile.potential`. Todo jogador real caía no fallback antigo (72,
// teto ~82-84) — abaixo do próprio Overall dos bots do Top 100 (~85, ver
// rankingPopulation.js), tornando o Top 100+ estruturalmente inalcançável
// para QUALQUER carreira real, não só difícil. Os simuladores de pace
// (massive-v32/career-difficulty-pace) nunca expuseram esse problema
// porque SEMPRE injetam seu próprio `potential` (78-91) por cenário — eles
// testam builds mais talentosos do que qualquer perfil real recebe.
// Corrigido no MENOR ponto possível (só o fallback, nenhum campo novo
// persistido, nenhuma tela de criação de personagem alterada): 80 é o
// mesmo valor já usado e validado por um dos 10 cenários "saudáveis" do
// massive-v32 (economy-conservative), dá teto ~87 (acima do Top 100 real,
// ainda abaixo do Top 20-10 real de propósito — carreira excepcional
// continua exigindo mais do que a média, por design, Parte 12).
export function getAttributeDevelopmentCeiling(profile, attribute) {
  const potential = clamp(profile?.potential ?? 80, 45, 99);
  const base = 47 + potential * 0.48;
  const styleKey = getProfileStyleKey(profile);
  const preferred = STYLE_ATTRIBUTE_BONUSES[styleKey]?.has(attribute);
  const initial = Number(profile?.initial_attributes?.[attribute]);
  const initialModifier = Number.isFinite(initial) ? clamp((initial - 10) * 0.18, -2, 2) : 0;
  const specialization = styleKey === 'balanced' ? 0 : preferred ? 2.5 : -1.5;
  return Math.round(clamp(base + specialization + initialModifier, 65, 98));
}
