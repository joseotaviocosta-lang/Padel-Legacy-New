// Simulated data for home dashboard elements without dedicated entities yet.

export const SPONSORS = [
  { name: 'Head', tier: 'Ouro', contract: 5000, color: 'from-amber-500/20 to-amber-600/5', accent: 'text-amber-400', letter: 'H' },
  { name: 'Bullpad', tier: 'Prata', contract: 2500, color: 'from-blue-500/20 to-blue-600/5', accent: 'text-blue-400', letter: 'B' },
  { name: 'Nox', tier: 'Bronze', contract: 1200, color: 'from-purple-500/20 to-purple-600/5', accent: 'text-purple-400', letter: 'N' },
];

export function computeMoral(profile) {
  if (!profile) return 50;
  let moral = 50;
  moral += (profile.wins || 0) * 3;
  moral -= (profile.losses || 0) * 2;
  moral += (profile.tournaments_won || 0) * 5;
  const energy = profile.energy || 100;
  if (energy > 70) moral += 10;
  else if (energy < 30) moral -= 15;
  const chem = profile.partner_chemistry || 50;
  if (chem > 70) moral += 5;
  else if (chem < 30) moral -= 5;
  return Math.max(0, Math.min(100, Math.round(moral)));
}

export function computeFollowers(profile) {
  if (!profile) return 0;
  return 100 + Math.floor((profile.xp || 0) / 10) + (profile.tournaments_won || 0) * 150 + (profile.wins || 0) * 5;
}

export function getMockMessages(profile) {
  const messages = [];
  if (profile?.partner_name) {
    messages.push({
      from: profile.partner_name,
      avatar: (profile.partner_name[0] || 'P').toUpperCase(),
      content: 'Vamos treinar juntos hoje! Sinto que estamos evoluindo.',
      time: '2h',
    });
  }
  messages.push(
    { from: 'Coach Ramirez', avatar: 'R', content: 'Seu voleio melhorou muito. Mantenha o foco no treino de defesa.', time: '5h' },
    { from: 'Head Padel', avatar: 'H', content: 'Seu contrato de patrocínio foi renovado! Parabéns.', time: '1d' },
  );
  return messages;
}

export function getMockNotifications(profile, upcomingTournaments) {
  const notifs = [];
  if (upcomingTournaments && upcomingTournaments.length > 0) {
    notifs.push({
      icon: 'Trophy', title: 'Torneio se aproximando',
      message: `${upcomingTournaments[0].name} começa em breve`,
      time: '2h', read: false, accent: 'text-amber-400',
    });
  }
  notifs.push(
    { icon: 'Dumbbell', title: 'Energia recuperada', message: 'Você está pronto para treinar novamente', time: '5h', read: false, accent: 'text-primary' },
    { icon: 'Star', title: 'Nova oferta de patrocínio', message: 'Babolat está interessado em patrociná-lo', time: '1d', read: true, accent: 'text-purple-400' },
  );
  return notifs;
}