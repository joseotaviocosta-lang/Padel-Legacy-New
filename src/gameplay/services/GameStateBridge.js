import { gameRepository as repository } from './runtime.js';

export async function persistGameStateMetadata(profile) {
  if (!profile?.id) return profile;
  const activeProfile = await repository.getPlayerProfile();
  if (!activeProfile || activeProfile.id !== profile.id) {
    throw new Error('O estado recebido não pertence à carreira ativa.');
  }
  return repository.updatePlayerProfile(profile.id, profile);
}
