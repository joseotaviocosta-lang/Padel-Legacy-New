// Playthrough 5.27-I — candidatos do micro (só variáveis de ambiente lidas pelo
// simulador/jogo). Uma dimensão por candidato Silver (item 20): A = faixa de
// rank; B/C = janela do campo; D = A+B.
export const CANDIDATES = Object.freeze({
  baseline: {},
  SILVER_A: { PL527E_COMPETITION: '{"silverPeakLow":1100}' },
  SILVER_B: { PL527E_COMPETITION: '{"silverFieldOffsetPct":0.10}' },
  SILVER_C: { PL527E_COMPETITION: '{"silverFieldOffsetPct":0}' },
  SILVER_D: { PL527E_COMPETITION: '{"silverPeakLow":1100,"silverFieldOffsetPct":0.10}' },
  // Acrescentado depois de ver A–D no micro de 1 ano: B (10%) já leva o campo
  // Silver ao nível do Bronze; 15% testa um ajuste MENOR na mesma dimensão.
  SILVER_E: { PL527E_COMPETITION: '{"silverFieldOffsetPct":0.15}' },
  // Controle da política antiga do otimizador (v3) para o antes/depois do Bloco A.
  'opt-v3': { PL527E_POLICY: 'v3' },
});
