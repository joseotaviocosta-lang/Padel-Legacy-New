import assert from 'node:assert/strict';
import {
  eventOccursOn,
  isActionableCalendarDecision,
  shouldBlockBeforeAdvance,
  getInjuryAutoResolution,
} from '../src/game-core/calendarAdvancePolicy.js';

const date = '2026-03-10';
const base = { id: 'event-1', status: 'scheduled', start_date: date, end_date: date };

assert.equal(eventOccursOn(base, date), true);
assert.equal(eventOccursOn({ ...base, status: 'completed' }, date), false);

// Um torneio antigo sem decisão não deve impedir +3 dias ou +1 semana.
const passiveTournament = { ...base, event_type: 'tournament', requires_decision: false, is_mandatory: false };
assert.equal(shouldBlockBeforeAdvance(passiveTournament, date), false);

// Um torneio realmente inscrito e ainda não resolvido deve parar o avanço normal.
const registeredTournament = { ...base, event_type: 'tournament', requires_decision: true, is_mandatory: true, decision_type: 'play_tournament' };
assert.equal(isActionableCalendarDecision(registeredTournament), true);
assert.equal(shouldBlockBeforeAdvance(registeredTournament, date), true);

// Planejamento automático nunca é uma decisão manual.
const plannedTraining = { ...base, event_type: 'training_camp', requires_decision: false, metadata: { planner_created: true } };
assert.equal(shouldBlockBeforeAdvance(plannedTraining, date), false);

// Durante a lesão, torneio é perdido e treino é cancelado automaticamente.
assert.deepEqual(getInjuryAutoResolution(registeredTournament, date), {
  status: 'missed',
  requires_decision: false,
  injury_resolution: 'tournament_missed',
});
assert.deepEqual(getInjuryAutoResolution(plannedTraining, date), {
  status: 'cancelled',
  requires_decision: false,
  injury_resolution: 'activity_cancelled',
});

// Uma decisão administrativa continua bloqueando, inclusive durante a recuperação.
const contractDecision = { ...base, event_type: 'contract', requires_decision: true, decision_type: 'renew_contract' };
assert.equal(shouldBlockBeforeAdvance(contractDecision, date), true);
assert.equal(getInjuryAutoResolution(contractDecision, date), null);

console.log('CalendarAdvanceV24Test: PASS');
console.log('✓ atalhos ignoram torneios passivos e atividades automáticas');
console.log('✓ torneios inscritos continuam bloqueando o avanço normal');
console.log('✓ lesão resolve torneios e treinos automaticamente');
console.log('✓ decisões administrativas continuam protegidas');
