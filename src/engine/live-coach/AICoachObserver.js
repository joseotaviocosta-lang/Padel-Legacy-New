import { OpponentAdaptationTracker } from './OpponentAdaptationTracker.js';
export class AICoachObserver { choose({state,proposedTactic,level=1}){if(!OpponentAdaptationTracker.shouldAdjust(state,level))return state.activeTactics.B;return proposedTactic;} }
