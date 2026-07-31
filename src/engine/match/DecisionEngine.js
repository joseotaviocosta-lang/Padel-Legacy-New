const SHOTS = ['drive', 'backhand', 'lob', 'volley', 'bandeja', 'smash', 'chiquita'];

function shotSkill(player, shot) {
  const map = {
    drive: player.attributes.forehand,
    backhand: player.attributes.backhand,
    lob: (player.attributes.defense + player.attributes.strategy) / 2,
    volley: player.attributes.volley,
    bandeja: player.attributes.bandeja,
    smash: player.attributes.smash,
    chiquita: (player.attributes.forehand + player.attributes.strategy) / 2,
  };
  return map[shot] ?? player.overall;
}

function tendency(player, name, fallback = 50) {
  return Number(player?.behavior?.tendencies?.[name] ?? fallback);
}

export class DecisionEngine {
  choose({ player, pressure, tactic, random }) {
    const atNet = player.position.zone === 'net';
    const tired = 100 - player.energy;
    const aggressive = tactic?.id === 'agressivo' || tactic?.id === 'potencia';
    const defensive = tactic?.id === 'defensivo';
    const attack = tendency(player, 'attack');
    const defense = tendency(player, 'defense');
    const control = tendency(player, 'control');
    const improvisation = tendency(player, 'improvisation');

    const candidates = SHOTS.map((shot) => {
      let weight = 8 + shotSkill(player, shot) / 8;
      if (atNet && ['volley', 'bandeja', 'smash'].includes(shot)) weight += 18;
      if (!atNet && ['lob', 'drive', 'backhand', 'chiquita'].includes(shot)) weight += 14;
      if (!atNet && ['volley', 'smash'].includes(shot)) weight = 0;
      if (pressure > 65 && shot === 'lob') weight += 18;
      if (pressure > 65 && shot === 'smash') weight -= 8;
      if (aggressive && ['smash', 'volley', 'drive'].includes(shot)) weight += 12;
      if (defensive && ['lob', 'bandeja', 'backhand'].includes(shot)) weight += 12;
      if (player.style.includes('pot') && shot === 'smash') weight += 18;
      if (player.style.includes('defens') && shot === 'lob') weight += 18;
      if (tired > 45 && shot === 'smash') weight -= 12;

      // Etapa 1: a personalidade já diferencia preferências sem substituir
      // a tomada de decisão contextual, que será aprofundada na Etapa 2.
      if (['smash', 'volley', 'drive'].includes(shot)) weight += (attack - 50) / 7;
      if (['lob', 'bandeja', 'backhand'].includes(shot)) weight += (defense - 50) / 8;
      if (['bandeja', 'chiquita', 'lob'].includes(shot)) weight += (control - 50) / 10;
      if (['chiquita', 'smash'].includes(shot)) weight += (improvisation - 50) / 10;

      weight += player.personality.creativity / 20;
      return { value: shot, weight: Math.max(0, weight) };
    });

    return random.weighted(candidates);
  }
}
