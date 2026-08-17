const specialtyMap = { tecnico: ['technical', 'offensive'], estratega: ['plan', 'opponent', 'positional'], fisico: ['physical'], mental: ['mental'], motivacional: ['mental'], duplas: ['partnership', 'positional'] };
// Mesmo catálogo real de tiers que LiveCoachObserver.levelOf (src/lib/coaches.js:
// COACH_TIERS) — iniciante/profissional caíam os dois no fallback `1` antes.
const coachLevel = (coach) => Number(coach?.level) || ({ iniciante: 1, regional: 2, profissional: 3, elite: 4, lendario: 5 }[String(coach?.tier || '').toLowerCase()] || 1);

const impacts = {
  games_lost_streak: 'Interromper a sequência adversária com mais controle e variação.',
  breaks_suffered: 'Proteger o saque com seleção mais segura e menor risco.',
  opponent_targeting_player: 'Reduzir a pressão no alvo e recuperar a cobertura central.',
  opponent_net_dominance: 'Retirar tempo dos rivais e disputar novamente a posição de rede.',
  opponent_more_lobs: 'Responder aos lobs sem abandonar a rede cedo demais.',
  volley_errors: 'Diminuir erros imediatos, aceitando menor volume de winners.',
  unforced_error_streak: 'Estabilizar os próximos games com margem maior sobre a rede.',
  ineffective_lobs: 'Variar a saída defensiva e escolher melhor o momento do lob.',
  low_smash_efficiency: 'Construir o ponto antes de buscar a definição por cima.',
  critical_energy: 'Preservar energia com ritmo e risco menores.',
  plan_not_executed: 'Aproximar a execução do objetivo original.',
};

export class CoachSuggestionEngine {
  generate(pattern, { coach, pointNumber, setNumber, gameNumber }) {
    if (!pattern) return null;
    const areas = specialtyMap[coach?.specialty] || [];
    const expert = areas.includes(pattern.category);
    const level = coachLevel(coach);
    const confidenceScore = Math.max(0.15, Math.min(0.98, pattern.confidenceScore + (expert ? 0.1 : -0.08) + (level - 2) * 0.03));
    return {
      id: `suggestion-${pointNumber}-${pattern.patternId}`,
      type: 'coach_suggestion', patternId: pattern.patternId, category: pattern.category,
      observation: pattern.evidence,
      evidence: { sampleSize: pattern.sampleSize, window: pattern.analysisWindow || 'last_2_games', persistence: pattern.persistence },
      confidence: confidenceScore >= 0.78 ? 'high' : confidenceScore >= 0.5 ? 'medium' : 'low',
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      suggestedAdjustment: pattern.adjustment,
      expectedImpact: impacts[pattern.patternId] || 'Ajustar o comportamento nos próximos pontos.',
      physicalCost: pattern.category === 'physical' ? 'low' : pattern.adjustment?.tacticId === 'agressivo' ? 'high' : 'medium',
      risk: pattern.adjustment?.tacticId === 'agressivo' ? 'higher_error_rate' : 'controlled',
      priority: pattern.priority, createdAtPoint: pointNumber, createdAtSet: setNumber,
      createdAtGame: gameNumber, coachId: coach?.id || null, specialtyMatched: expert,
    };
  }
}
