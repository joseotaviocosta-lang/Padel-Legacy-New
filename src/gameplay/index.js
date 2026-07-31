// Public gameplay API. Application code should import from '@/gameplay' when possible.
export { ActiveCareerAdapter } from './adapters/ActiveCareerAdapter.js';
export { PlayerAdapter } from './adapters/PlayerAdapter.js';
export { createEntityAdapter } from './adapters/EntityAdapter.js';
export { GameRepository } from './repositories/GameRepository.js';
export { CareerEntityRepository } from './repositories/CareerEntityRepository.js';
export { persistGameStateMetadata } from './services/GameStateBridge.js';
export { activeCareerAdapter, gameRepository } from './services/runtime.js';
export { USE_NEW_CAREER_SYSTEM, isNewCareerSystemEnabled } from './config/featureFlags.js';
