// Extraído de padel.js (Fase 12, docs/ACHIEVEMENTS_2_0.md): achievementsData.js
// precisa da lista de atributos para derivar `attribute_key` a partir da
// descrição de cada conquista `max_attribute`. Importar direto de padel.js
// fechava um ciclo real de módulos — padel.js importa localGameClient.js,
// que importa localSeed.js, que importa achievementsData.js — então
// achievementsData.js importando padel.js de volta criava
// padel.js→...→achievementsData.js→padel.js, quebrando qualquer teste cujo
// grafo de import passasse por padel.js antes de achievementsData.js
// (ATTRIBUTES chegava `undefined` no meio da própria avaliação de padel.js).
// Este módulo não importa nada — é uma folha —, então pode ser importado
// tanto por padel.js quanto por achievementsData.js sem reintroduzir o
// ciclo. padel.js re-exporta os dois nomes para não quebrar os ~20 outros
// arquivos que já importam ATTRIBUTES/ATTRIBUTE_KEYS de lá.
export const ATTRIBUTES = [
  { key: 'serve', label: 'Saque', icon: 'Zap' },
  { key: 'forehand', label: 'Forehand', icon: 'ArrowUpRight' },
  { key: 'backhand', label: 'Backhand', icon: 'ArrowUpLeft' },
  { key: 'volley', label: 'Voleio', icon: 'Waves' },
  { key: 'bandeja', label: 'Bandeja', icon: 'Circle' },
  { key: 'smash', label: 'Smash', icon: 'Hammer' },
  { key: 'defense', label: 'Defesa', icon: 'Shield' },
  { key: 'agility', label: 'Agilidade', icon: 'Gauge' },
  { key: 'strategy', label: 'Estratégia', icon: 'Brain' },
  { key: 'emotional_control', label: 'Controle Emoc.', icon: 'Flame' },
];

export const ATTRIBUTE_KEYS = ATTRIBUTES.map((a) => a.key);

// Playthrough 5.26-B — AUTORIDADE ÚNICA do OVR-base de qualquer atleta.
// É a mesma regra que padel.js:overallRating já usava na UI (Playthrough
// 5.22): entidade treinável → média dos atributos PRESENTES (ausente é
// desconhecido, não zero); atleta do mundo sem atributos planos → o
// `overall_rating`/`overall` declarado. Mora aqui (módulo-folha, sem
// imports) para que o motor de partida use exatamente a mesma regra sem
// puxar o grafo inteiro de padel.js. Antes, o motor (engine/match/
// playerModel.js) tinha a sua própria média sobre as 10 chaves com piso 1:
// todo AthleteProfile sem atributos planos (parceiro materializado, atletas
// do mundo) entrava na partida com OVR 1.
// Devolve `null` quando não há nenhuma fonte (desconhecido); sem
// modificadores de contexto (química, energia…) e sem clamp — cada chamador
// aplica os seus.
export function baseOverallRating(profile) {
  if (!profile) return null;
  const attributeValues = ATTRIBUTE_KEYS
    .map((key) => Number(profile[key]))
    .filter((value) => Number.isFinite(value));
  if (attributeValues.length) {
    const sum = attributeValues.reduce((a, b) => a + b, 0);
    return Math.round(sum / attributeValues.length);
  }
  const declared = Number(profile.overall_rating ?? profile.overall);
  if (!Number.isFinite(declared) || declared <= 0) return null;
  return Math.round(declared);
}
