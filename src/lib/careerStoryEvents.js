// Fase 14 (docs/FASE_14_CAREER_IDENTITY.md, Parte 2/10/11): careerStory.js
// permanece puro (só deriva Timeline/Retrospectiva a partir de dados já
// buscados, sem storage) — este módulo pequeno e separado é quem PRECISA
// escrever (notificação deduplicada), então fica fora do módulo puro em
// vez de forçar os dois num só arquivo (Parte 2 permite não forçar o
// formato sugerido quando a arquitetura existente pede outra coisa).
//
// Reaproveita o MESMO padrão de dedupe já usado por todo o resto do jogo
// (buildStableMessageId/upsertCareerMessage, careerCommunications.js) —
// nenhum novo mecanismo de idempotência. Chamado ao lado de
// syncPlayerAchievements em TournamentModal.jsx, com o MESMO
// achievementContext já construído ali — nenhuma consulta extra (Parte 15).
import { upsertCareerMessage } from '@/lib/careerCommunications.js';

export async function evaluateCareerMatchMilestones(profile, matchRecord, achievementContext) {
  if (!profile?.id || !matchRecord) return;
  const official = achievementContext?.officialMatches;
  const tasks = [];

  if (official?.played === 1) {
    tasks.push(upsertCareerMessage(profile.id, 'career-milestone:first-official-match', {
      sender_name: 'Circuito Padel Legacy', sender_type: 'federacao',
      title: 'Sua estreia oficial', content: `Você disputou sua primeira partida oficial, no ${matchRecord.tournament_name || 'circuito'}.`,
      message_type: 'career_milestone', notification_type: 'CAREER_MILESTONE', career_date: matchRecord.date,
    }));
  }
  if (official?.won === 1 && matchRecord.result === 'vitória') {
    tasks.push(upsertCareerMessage(profile.id, 'career-milestone:first-official-win', {
      sender_name: 'Circuito Padel Legacy', sender_type: 'federacao',
      title: 'Primeira vitória oficial', content: `Sua primeira vitória em uma partida oficial, no ${matchRecord.tournament_name || 'circuito'}.`,
      message_type: 'career_milestone', notification_type: 'CAREER_MILESTONE', career_date: matchRecord.date,
    }));
  }
  if (matchRecord.tournament_outcome === 'champion' && Number(profile.tournaments_won) === 1) {
    tasks.push(upsertCareerMessage(profile.id, 'career-milestone:first-title', {
      sender_name: 'Circuito Padel Legacy', sender_type: 'federacao',
      title: 'Seu primeiro título', content: `Você conquistou o ${matchRecord.tournament_name}, seu primeiro título no circuito profissional.`,
      message_type: 'career_milestone', notification_type: 'CAREER_MILESTONE', career_date: matchRecord.date, priority: 'alta',
    }));
  }
  // beat-top10/beat-rank1: diferente dos "primeira vez" acima (que só
  // podem ser verdadeiros numa única partida da carreira inteira), vencer
  // um Top 10 pode acontecer mais de uma vez — e `officialMatches.beatTop10`
  // é um booleano "alguma vez", não "nesta partida". Chave de dedupe por
  // ID de partida (em vez de uma chave estática) evita tanto reabrir como
  // não-lida uma notificação antiga (o upsert reseta is_read/is_new) quanto
  // perder um 2º grande resultado real por causa de uma chave já usada.
  if (matchRecord.result === 'vitória' && Number(matchRecord.opponent_rank) > 0 && Number(matchRecord.opponent_rank) <= 10) {
    tasks.push(upsertCareerMessage(profile.id, `career-milestone:beat-top10:${matchRecord.id}`, {
      sender_name: 'Circuito Padel Legacy', sender_type: 'federacao',
      title: 'Vitória sobre o Top 10', content: `Você venceu um adversário do Top 10 (#${matchRecord.opponent_rank}) no ${matchRecord.tournament_name}.`,
      message_type: 'career_milestone', notification_type: 'CAREER_MILESTONE', career_date: matchRecord.date,
    }));
  }
  if (matchRecord.result === 'vitória' && Number(matchRecord.opponent_rank) === 1) {
    tasks.push(upsertCareerMessage(profile.id, `career-milestone:beat-rank1:${matchRecord.id}`, {
      sender_name: 'Circuito Padel Legacy', sender_type: 'federacao',
      title: 'Você venceu o #1 do mundo', content: `Uma vitória histórica sobre o número 1 do ranking mundial, no ${matchRecord.tournament_name}.`,
      message_type: 'career_milestone', notification_type: 'CAREER_MILESTONE', career_date: matchRecord.date, priority: 'alta',
    }));
  }

  await Promise.all(tasks);
}
