const SHOT_LABELS = {
  serve: 'saque', drive: 'drive', backhand: 'backhand', lob: 'lob', volley: 'voleio',
  bandeja: 'bandeja', smash: 'smash', chiquita: 'chiquita',
};

export class CommentaryEngine {
  point({ winner, finisher, shot, result, rallyLength, random }) {
    const label = SHOT_LABELS[shot] || shot;
    if (result === 'winner') {
      const options = [
        `${finisher.name} fecha com um ${label} vencedor!`,
        `${label[0].toUpperCase()}${label.slice(1)} preciso de ${finisher.name}.`,
        `${finisher.name} encontra o espaço e define o ponto.`,
      ];
      if (rallyLength >= 12) options.push(`Que troca! Depois de ${rallyLength} golpes, ${finisher.name} define.`);
      return random.pick(options);
    }
    return random.pick([
      `${finisher.name} erra o ${label}.`,
      `A pressão força o erro de ${finisher.name}.`,
      `${finisher.name} tenta acelerar, mas manda para fora.`,
    ]);
  }
}
