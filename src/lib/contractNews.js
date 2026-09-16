import { localGame } from '@/api/localGameClient.js';

// Assinar/renovar contrato (comissão técnica, treinador, patrocínio) não
// gerava nada — nem notícia, nem notificação. São momentos de carreira, e o
// schema de WorldEvent já tem categoria para eles (`transferencia` para
// contratação de equipe, `novo_patrocinador` para patrocínio).
//
// Proporcionalidade: um contrato é notícia MENOR que um título. Por isso
// `tier: 'normal'` (nunca 'destaque', que é o slot disputado pelos resultados
// de torneio no CareerHub/WorldHub) e nenhuma notificação de AÇÃO NECESSÁRIA —
// o jogador já sabe que assinou; isto é registro, não pedido de decisão.
//
// Idempotente por id determinístico: reassinar o mesmo contrato na mesma data
// não duplica a entrada.
export async function publishContractEvent({
  profileId,
  playerName,
  kind,
  partyName,
  careerDate,
  renewal = false,
  months = null,
}) {
  if (!profileId || !partyName || !careerDate) return null;
  const eventType = kind === 'sponsor' ? 'novo_patrocinador' : 'transferencia';
  const label = kind === 'sponsor' ? 'patrocínio' : kind === 'coach' ? 'treinador' : 'comissão técnica';
  const verb = renewal ? 'renova' : 'acerta';
  const safe = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60);
  const id = `contract-${safe(kind)}-${safe(profileId)}-${safe(partyName)}-${safe(careerDate)}`;
  const duration = months ? ` Contrato de ${months} meses.` : '';
  try {
    return await localGame.entities.WorldEvent.upsert(id, {
      id,
      event_type: eventType,
      title: `${playerName || 'O atleta'} ${verb} com ${partyName}`,
      content: `${renewal ? 'Renovação' : 'Novo acordo'} de ${label} fechado por ${playerName || 'o atleta'}.${duration}`,
      related_players: [playerName].filter(Boolean),
      event_date: careerDate,
      tier: 'normal',
      tags: ['contrato', label],
      profile_id: profileId,
    });
  } catch {
    // Registro de carreira não pode derrubar a contratação em si.
    return null;
  }
}
