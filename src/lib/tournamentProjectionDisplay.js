// CLOUD-6H — apresentação da "Análise do treinador" (card de Tournaments.jsx).
//
// `getTournamentChoiceProfile` estima titleChance só a partir do rank da dupla
// e do prestígio do tier: não recebe OVR da dupla nem o campo real. A CLOUD-6G
// mediu Gold com rank 443 mostrando 40% enquanto o motor dá ~0% na 1ª rodada.
// Esses números continuam servindo à IA e ao ranking de "melhor opção"
// (contrato inalterado); só a EXIBIÇÃO ao jogador deixa de apresentá-los como
// probabilidade de vencer o torneio.
export const RANK_ONLY_PROJECTION_NOTE = 'Projeção aproximada pelo ranking da dupla. Não considera a força dos adversários nem o campo sorteado.';
export const UNESTIMATED_CHANCE_LABEL = 'Não estimada';

export function buildCoachAnalysisRows(coach) {
  if (!coach) return [];
  const signed = (value) => `${value >= 0 ? '+' : ''}${value}`;
  return [
    { key: 'title', label: 'Chance de título', value: UNESTIMATED_CHANCE_LABEL },
    { key: 'semifinal', label: 'Chance de semifinal', value: UNESTIMATED_CHANCE_LABEL },
    { key: 'net', label: 'Lucro esperado (aprox.)', value: signed(coach.expectedNet) },
    { key: 'points', label: 'Pontos esperados (aprox.)', value: String(coach.expectedPoints) },
    { key: 'fatigue', label: 'Fadiga estimada', value: `+${coach.fatigueIncrease}%`, tone: 'fatigue' },
  ];
}
