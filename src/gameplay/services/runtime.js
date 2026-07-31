import { ActiveCareerAdapter } from '../adapters/ActiveCareerAdapter.js';
import { GameRepository } from '../repositories/GameRepository.js';

export const activeCareerAdapter = new ActiveCareerAdapter();
export const gameRepository = new GameRepository(activeCareerAdapter);
