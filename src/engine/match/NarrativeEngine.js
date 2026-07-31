const SHOT_LABELS = {
  serve: 'saque', drive: 'drive', backhand: 'backhand', lob: 'lob', volley: 'voleio',
  bandeja: 'bandeja', smash: 'smash', chiquita: 'chiquita',
};

const capitalize = (text) => text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;

export class NarrativeEngine {
  describePoint({ winner, finisher, shot, result, rallyLength, decisionTrace = [], random, match = {}, stats, forcedError = false }) {
    const label = SHOT_LABELS[shot] || shot;
    const lastDecision = [...decisionTrace].reverse().find((entry) => entry.playerId === finisher.id);
    const reasons = lastDecision?.reasons || [];
    const streak = stats?.currentTeamStreak?.team === winner ? stats.currentTeamStreak.length : 1;
    const archetype = finisher.behavior?.archetype?.label;
    const tags = [];
    let importance = 1;

    if (match.importantPoint) { tags.push('ponto_decisivo'); importance += 2; }
    if (match.breakPoint) { tags.push('break_point'); importance += 2; }
    if (rallyLength >= 12) { tags.push('rally_longo'); importance += 1; }
    if (streak >= 4) { tags.push('sequencia'); importance += 1; }
    if (result === 'winner') tags.push('winner');
    if (forcedError) tags.push('erro_forcado');
    if (result === 'error' && !forcedError) tags.push('erro_nao_forcado');

    const options = result === 'winner'
      ? this.winnerOptions({ finisher, label, rallyLength, streak, match, reasons, archetype })
      : this.errorOptions({ finisher, label, rallyLength, match, forcedError, reasons });

    const message = random.pick(options.filter(Boolean));
    return {
      message,
      headline: this.headline({ finisher, label, result, match, rallyLength, forcedError }),
      tags,
      importance: Math.min(5, importance),
      reasons: reasons.slice(0, 3),
      archetype: archetype || null,
      streak,
    };
  }

  winnerOptions({ finisher, label, rallyLength, streak, match, reasons, archetype }) {
    const options = [
      `${finisher.name} fecha com um ${label} vencedor!`,
      `${capitalize(label)} preciso de ${finisher.name}.`,
      `${finisher.name} encontra o espaço e define o ponto.`,
    ];
    if (rallyLength >= 12) options.push(`Que troca! Depois de ${rallyLength} golpes, ${finisher.name} encontra a definição.`);
    if (match.breakPoint) options.push(`${finisher.name} assume a responsabilidade no break point e define com ${label}.`);
    if (match.importantPoint && !match.breakPoint) options.push(`${finisher.name} cresce no ponto decisivo e encontra um ${label} vencedor.`);
    if (streak >= 4) options.push(`${finisher.name} mantém o embalo: já são ${streak} pontos seguidos para a dupla.`);
    if (reasons.some((reason) => reason.includes('rede'))) options.push(`${finisher.name} lê a pressão na rede e responde com precisão.`);
    if (reasons.some((reason) => reason.includes('cansad'))) options.push(`${finisher.name} percebe o desgaste adversário e acelera no momento certo.`);
    if (archetype === 'Finalizador') options.push(`Instinto de finalizador: ${finisher.name} não desperdiça a oportunidade.`);
    return options;
  }

  errorOptions({ finisher, label, rallyLength, match, forcedError, reasons }) {
    const options = forcedError ? [
      `A pressão adversária força o erro de ${finisher.name}.`,
      `${finisher.name} chega desequilibrado e não controla o ${label}.`,
      `A construção do ponto deixa ${finisher.name} sem uma resposta confortável.`,
    ] : [
      `${finisher.name} erra o ${label}.`,
      `${finisher.name} tenta acelerar, mas manda para fora.`,
      `Erro não forçado de ${finisher.name} no ${label}.`,
    ];
    if (rallyLength >= 12) options.push(`Depois de uma longa troca de ${rallyLength} golpes, ${finisher.name} cede no erro.`);
    if (match.breakPoint) options.push(`${finisher.name} sente a pressão do break point e erra o ${label}.`);
    if (match.importantPoint && !match.breakPoint) options.push(`O ponto decisivo pesa, e ${finisher.name} não controla o ${label}.`);
    if (reasons.some((reason) => reason.includes('risco'))) options.push(`${finisher.name} aceita o risco, mas a execução não acompanha a intenção.`);
    return options;
  }

  headline({ finisher, label, result, match, rallyLength, forcedError }) {
    if (match.breakPoint && result === 'winner') return 'Definição em break point';
    if (match.breakPoint && result === 'error') return 'Pressão no break point';
    if (rallyLength >= 15) return 'Rally memorável';
    if (result === 'winner') return `${capitalize(label)} vencedor`;
    if (forcedError) return 'Erro provocado pela pressão';
    return `Erro no ${label}`;
  }
}
