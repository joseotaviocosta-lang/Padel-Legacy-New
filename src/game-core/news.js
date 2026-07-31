import { localGame } from '@/api/localGameClient.js';
import { safeName, todayForProfile } from './utils';

export async function publishMatchNews(profile, won, partnerName, opponents, score) {
  const player = safeName(profile);
  const title = won
    ? `${player} vence ao lado de ${partnerName}`
    : `${player} é superado em partida equilibrada`;
  const content = won
    ? `${player} e ${partnerName} venceram ${opponents.join(' e ')} por ${score}. A dupla segue ganhando entrosamento.`
    : `${player} e ${partnerName} perderam para ${opponents.join(' e ')} por ${score}, mas ganharam experiência para a sequência da temporada.`;

  const article = await localGame.entities.PressArticle.create({
    profile_id: profile.id,
    title,
    content,
    sentiment: won ? 'positivo' : 'neutro',
    outlet: 'Padel Legacy News',
    journalist_name: 'Redação PL',
    published_date: todayForProfile(profile),
  });

  await localGame.entities.Post.create({
    author_name: 'Padel Legacy News',
    author_type: 'media',
    content: title,
    likes: won ? 24 : 9,
    comments_count: won ? 6 : 2,
    created_date: new Date().toISOString(),
  });
  return article;
}
