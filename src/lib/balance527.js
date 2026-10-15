// Playthrough 5.27 — CONFIGURAÇÃO CENTRAL DE REBALANCEAMENTO.
//
// Princípio: TUNING IS ALLOWED, mas centralizado (nenhum `if BALANCED`
// espalhado). Os três presets existem para a comparação medida; apenas UM vira
// default. Nada aqui toca arquitetura competitiva (5.26-D é protegida): só
// magnitudes de economia e a agressividade da admissão de base.
//
// Seleção: `globalThis.__PL527_PRESET = 'conservative' | 'balanced' | 'hardcore'`
// (default 'balanced'). Lido em runtime para o harness poder comparar presets
// sem recompilar.
export const BALANCE_527B_PRESETS = Object.freeze({
  conservative: Object.freeze({
    id: 'conservative',
    label: 'Conservative',
    version: '5.27-B',
    startingCoins: 900,
    initialAttributeMultiplier: 1.8,
    prizeMultiplier: 2.6,
    investmentRateMultiplier: 0.30,
    sponsor: Object.freeze({ monthlyMultiplier: 0.45, signMultiplier: 0.4, requireProof: true, proofMinTournaments: 1 }),
    staffMultiplier: 1.12,
    shopPriceMultiplier: 1.15,
    shopBonusMultiplier: 1.0,
  }),
  balanced: Object.freeze({
    id: 'balanced',
    label: 'Balanced',
    version: '5.27-B',
    startingCoins: 900,
    initialAttributeMultiplier: 1.8,
    prizeMultiplier: 3.0,
    investmentRateMultiplier: 0.23,
    sponsor: Object.freeze({ monthlyMultiplier: 0.22, signMultiplier: 0.21, requireProof: true, proofMinTournaments: 1 }),
    staffMultiplier: 1.25,
    shopPriceMultiplier: 1.2,
    shopBonusMultiplier: 1.0,
  }),
  hardcore: Object.freeze({
    id: 'hardcore',
    label: 'Hardcore',
    version: '5.27-B',
    startingCoins: 700,
    initialAttributeMultiplier: 1.8,
    prizeMultiplier: 2.0,
    investmentRateMultiplier: 0.18,
    sponsor: Object.freeze({ monthlyMultiplier: 0.16, signMultiplier: 0.15, requireProof: true, proofMinTournaments: 2 }),
    staffMultiplier: 1.4,
    shopPriceMultiplier: 1.3,
    shopBonusMultiplier: 1.0,
  }),
});

// Playthrough 5.27-E — NÚCLEO COMPETITIVO de entrada, COMPARTILHADO pelos 3
// presets -E (a comparação entre presets continua sendo só de economia).
// Diagnóstico 5.27-D: no 1º ano o jogador jogava com o parceiro da oferta
// inicial (OVR 9–14, escolhido perto do OVR do novato ~22), preso ~11 meses
// pela proteção de torneio comprometido, enquanto ele próprio evoluía para
// ~50. `firstPartnerTargetOvr` é o nível contra o qual a vitrine da PRIMEIRA
// dupla mede a distância de OVR (nunca abaixo do OVR atual do jogador).
export const ENTRY_COMPETITION_527E = Object.freeze({
  version: '5.27-E',
  firstPartnerTargetOvr: 36,
  // Peso da proximidade ao alvo na recomendação da 1ª dupla (fórmula 4.8: 0.2).
  firstPartnerRatingWeight: 0.45,
  // Pico de preferência/admissão do Silver: 800 → 900 (micro-calibração: campo
  // Silver 47 → 45, Bronze WR 41% → 45%; 1000 não muda mais nada).
  silverPeakLow: 900,
  // 5.27-I: janela do campo Silver do jogador (WorldTourLifecycle) — pula
  // max(vaga, 15% do pool fraco-primeiro) em vez de 25%. Com 25% o campo Silver
  // ficava ~11 OVR acima do Bronze (+7 acima da dupla; Silver 21% × Gold 32%);
  // 15% foi o menor ajuste que pôs Bronze > Silver ≈ Gold no micro (5 seeds).
  silverFieldOffsetPct: 0.15,
  // 5.27-F: pontos da derrota na 1ª rodada nos tiers com corte (Gold+) = 1% do
  // título (antes 4,5–5%: Gold 5→1, Platinum 9→2, Masters 23→5, Elite 45→10,
  // Crown 90→20). Ver circuitCatalog.buildRankPointsTable.
  gatedFirstRoundLossPointsRatio: 0.01,
});

const withE = (base, overrides = {}) => Object.freeze({ ...base, ...overrides, id: `${base.id}-e`, label: `${base.label}-E`, version: '5.27-E', competition: ENTRY_COMPETITION_527E });
export const BALANCE_527E_PRESETS = Object.freeze({
  'conservative-e': withE(BALANCE_527B_PRESETS.conservative),
  'balanced-e': withE(BALANCE_527B_PRESETS.balanced),
  'hardcore-e': withE(BALANCE_527B_PRESETS.hardcore),
});

// Alias retrocompatível (5.27 chamava de BALANCE_527_PRESETS).
export const BALANCE_527_PRESETS = BALANCE_527B_PRESETS;
const ALL_PRESETS = Object.freeze({ ...BALANCE_527B_PRESETS, ...BALANCE_527E_PRESETS });

export function getBalance527() {
  const id = (typeof globalThis !== 'undefined' && globalThis.__PL527_PRESET) || 'balanced';
  const preset = ALL_PRESETS[id] || BALANCE_527_PRESETS.balanced;
  // Só harness (micro-calibração 5.27-E): candidatos de núcleo competitivo sem
  // editar o arquivo; nunca setado pelo app.
  const override = typeof globalThis !== 'undefined' ? globalThis.__PL527E_COMPETITION_OVERRIDE : null;
  if (override && preset.competition) return { ...preset, competition: { ...preset.competition, ...override } };
  return preset;
}

// Prova mínima de carreira antes do primeiro patrocínio (Bloco B): reusa
// contadores que já existem no perfil (torneios disputados). Não inventa
// mecânica nova — só exige atividade real.
export function hasSponsorProof(profile, preset = getBalance527()) {
  if (!preset.sponsor.requireProof) return true;
  const played = Number(profile?.tournaments_played || 0);
  return played >= (preset.sponsor.proofMinTournaments || 0);
}

// Playthrough 5.27-B (Bloco P) — DEFINIÇÃO EXPLÍCITA de money-solved, para o
// harness e os testes medirem a MESMA coisa (nunca inferida):
//   receita recorrente >= despesa recorrente
//   E reserva de caixa >= 12 meses de despesa média.
// A travessia é o primeiro mês em que a condição vale e se mantém por >= 6
// meses consecutivos.
export function isMoneySolved({ recurringIncome = 0, recurringExpense = 0, cash = 0 } = {}) {
  if (!(recurringExpense > 0)) return false;
  return Number(recurringIncome) >= Number(recurringExpense) && Number(cash) >= Number(recurringExpense) * 12;
}

export function moneySolvedCrossing(months = [], { holdMonths = 6 } = {}) {
  let streak = 0;
  for (let index = 0; index < months.length; index += 1) {
    if (isMoneySolved(months[index])) {
      streak += 1;
      if (streak >= holdMonths) return { monthIndex: index - holdMonths + 1, month: months[index - holdMonths + 1]?.month ?? null };
    } else {
      streak = 0;
    }
  }
  return null;
}
