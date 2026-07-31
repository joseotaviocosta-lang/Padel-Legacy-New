import { AdaptiveTactics } from './AdaptiveTactics.js';

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
  constructor({ adaptiveTactics = new AdaptiveTactics() } = {}) {
    this.adaptiveTactics = adaptiveTactics;
  }

  evaluate({ player, pressure, tactic, context = {} }) {
    const atNet = player.position.zone === 'net';
    const tired = 100 - player.energy;
    const aggressive = tactic?.id === 'agressivo' || tactic?.id === 'potencia';
    const defensive = tactic?.id === 'defensivo';
    const attack = tendency(player, 'attack');
    const defense = tendency(player, 'defense');
    const control = tendency(player, 'control');
    const improvisation = tendency(player, 'improvisation');
    const riskTolerance = Number(player.personality?.riskTolerance ?? 50);
    const discipline = Number(player.personality?.discipline ?? 50);

    return SHOTS.map((shot) => {
      const reasons = [];
      let weight = 8 + shotSkill(player, shot) / 8;
      if (atNet && ['volley', 'bandeja', 'smash'].includes(shot)) { weight += 18; reasons.push('posição de rede'); }
      if (!atNet && ['lob', 'drive', 'backhand', 'chiquita'].includes(shot)) weight += 14;
      if (!atNet && ['volley', 'smash'].includes(shot)) weight = 0;
      if (pressure > 65 && shot === 'lob') { weight += 18; reasons.push('alívio sob pressão'); }
      if (pressure > 65 && shot === 'smash') weight -= 8;
      if (aggressive && ['smash', 'volley', 'drive'].includes(shot)) weight += 12;
      if (defensive && ['lob', 'bandeja', 'backhand'].includes(shot)) weight += 12;
      if (player.style.includes('pot') && shot === 'smash') weight += 18;
      if (player.style.includes('defens') && shot === 'lob') weight += 18;
      if (tired > 45 && shot === 'smash') { weight -= 12; reasons.push('energia baixa'); }

      if (['smash', 'volley', 'drive'].includes(shot)) weight += (attack - 50) / 7;
      if (['lob', 'bandeja', 'backhand'].includes(shot)) weight += (defense - 50) / 8;
      if (['bandeja', 'chiquita', 'lob'].includes(shot)) weight += (control - 50) / 10;
      if (['chiquita', 'smash'].includes(shot)) weight += (improvisation - 50) / 10;

      const highRisk = ['smash', 'chiquita', 'drive'].includes(shot);
      if (context.importantPoint && highRisk) {
        const composure = Number(player.behavior?.tendencies?.pressure_resistance ?? 50);
        weight += (composure - 50) / 5;
        weight += context.trailingPoint ? -(discipline / 18) : context.riskFreedom / 3;
        reasons.push(context.trailingPoint ? 'reduz risco em ponto decisivo' : 'placar permite agressividade');
      }
      if (context.leadingPoint && highRisk) weight += riskTolerance / 16;
      if (context.confidenceGap > 8 && highRisk) weight += Math.min(8, context.confidenceGap / 3);
      if (context.confidenceGap < -8 && ['lob', 'bandeja', 'backhand'].includes(shot)) weight += 7;

      const adaptive = this.adaptiveTactics.modifiers({ shot, player, context });
      weight += adaptive.value;
      reasons.push(...adaptive.reasons);

      weight += player.personality.creativity / 20;
      return { value: shot, weight: Math.max(0, weight), reasons };
    });
  }

  chooseDetailed({ player, pressure, tactic, random, context = {} }) {
    const candidates = this.evaluate({ player, pressure, tactic, context });
    const shot = random.weighted(candidates.map(({ value, weight }) => ({ value, weight })));
    const selected = candidates.find((candidate) => candidate.value === shot);
    return {
      shot,
      reasons: selected?.reasons || [],
      candidates: candidates.map(({ value, weight }) => ({ shot: value, weight: Number(weight.toFixed(2)) })),
    };
  }

  choose(args) {
    return this.chooseDetailed(args).shot;
  }
}
