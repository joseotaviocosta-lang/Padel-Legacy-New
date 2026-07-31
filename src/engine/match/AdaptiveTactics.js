export class AdaptiveTactics {
  modifiers({ shot, player, context }) {
    let value = 0;
    const reasons = [];

    if (context.opponentAtNet >= 1 && shot === 'lob') {
      value += 14 + context.opponentAtNet * 3;
      reasons.push('adversários pressionando a rede');
    }
    if (context.opponentAtNet >= 1 && shot === 'chiquita') {
      value += 8;
      reasons.push('busca tirar velocidade da dupla na rede');
    }
    if (context.partnerTired && ['lob', 'bandeja', 'backhand'].includes(shot)) {
      value += 7;
      reasons.push('protege o parceiro cansado');
    }
    if (context.partnerTired && shot === 'smash') {
      value -= 5;
      reasons.push('evita transição longa com parceiro cansado');
    }
    if (context.tiredOpponentEnergy < 45 && ['drive', 'volley', 'smash'].includes(shot)) {
      value += 7;
      reasons.push('pressiona o adversário mais cansado');
    }
    if (context.memory?.opponentNetPressure > 0.5 && shot === 'lob') {
      value += 9;
      reasons.push('adapta-se ao padrão ofensivo adversário');
    }
    if (context.memory?.lobFrequency > 0.55 && shot === 'lob') {
      value -= 11;
      reasons.push('evita repetir lobs em excesso');
    }
    if (context.memory?.smashFrequency > 0.45 && shot === 'smash') {
      value -= 9;
      reasons.push('varia após sequência de smashes');
    }

    const adaptability = Number(player.personality?.adaptability ?? 50);
    value *= 0.75 + adaptability / 200;
    return { value, reasons };
  }
}
