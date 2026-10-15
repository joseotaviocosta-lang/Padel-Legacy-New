import { localGame } from '@/api/localGameClient.js';
import { incrementMissionProgress } from '@/lib/padel';
import { gameRepository } from '@/gameplay/services/runtime.js';
import { getActivePersistenceTransactionContext } from '@/dev/persistenceTransactionProbe.js';

// Playthrough 5.27-M — "Salvar nome do atleta" (Missions.jsx).
//
// Antes: PlayerProfile.update (uma gravação COMPLETA da carreira) seguido de
// incrementMissionProgress (outra gravação completa, com a recompensa do
// tutorial). No Android cada gravação serializa o save inteiro e o envia pela
// ponte IPC do Tauri — o playtest físico sentiu um congelamento curto. Agora
// as duas escritas acontecem numa única transação de persistência (mesmo
// mecanismo do treino, executeTraining): uma gravação, e o nome e a
// recompensa ficam juntos — ou o save tem os dois, ou nenhum.
export async function saveAthleteNameFlow(profile, name) {
  if (!profile?.id) throw new Error('Perfil do atleta indisponível.');
  const sportName = String(name || '').trim();
  if (!sportName || sportName.length > 40) throw new Error('Nome do atleta inválido.');
  const activeTransaction = getActivePersistenceTransactionContext();
  return gameRepository.withPersistenceTransaction('athlete-name', async () => {
    const updated = await localGame.entities.PlayerProfile.update(profile.id, { sport_name: sportName });
    await incrementMissionProgress(updated.id, 'set_player_name', 1, updated.career_date);
    return updated;
  }, activeTransaction?.id ? { joinTransactionId: activeTransaction.id } : undefined);
}
