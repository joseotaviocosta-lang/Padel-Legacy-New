import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateRenewalInterest,
  decideRenewal,
  getPartnershipContractTransition,
  partnershipRecordId,
  seededHash,
} from '../src/game-core/livingCircuitRules.js';
import { evaluatePartnerCompatibility } from '../src/players/teamCompatibility.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const day = (date, amount) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); };
const start = '2026-01-01';
const end = day(start, 60);
const partnership = {
  id: 'partnership-player-partner-2026-01-01', status: 'ativa', contract_status: 'ativo',
  started_career_date: start, contract_end_date: end, scheduled_end_date: end,
  chemistry: 78, partner_morale: 80, shared_matches: 20, shared_wins: 13,
};

for (const threshold of [15, 7, 3, 1]) {
  const target = day(end, -threshold);
  const transition = getPartnershipContractTransition(partnership, day(target, -1), target);
  assert.deepEqual(transition.warningDays, [threshold], `D-${threshold} deve disparar uma vez`);
  assert.deepEqual(getPartnershipContractTransition(partnership, target, target).warningDays, [], `D-${threshold} não pode duplicar no reload`);
}
assert.equal(getPartnershipContractTransition(partnership, day(end, -1), end).state, 'vencido');
assert.equal(getPartnershipContractTransition(partnership, end, day(end, 1)).shouldEnd, false, 'D+1 mantém a dupla na carência');
assert.equal(getPartnershipContractTransition(partnership, day(end, 7), day(end, 8)).shouldEnd, true, 'D+8 encerra contrato não resolvido');
assert.equal(getPartnershipContractTransition({ ...partnership, contract_status: 'encerrar_ao_final' }, end, day(end, 1)).shouldEnd, true);

const player = { id: 'player', career_date: day(start, 45), ranking_position: 80, ranking_trend: 'subindo', partner_chemistry: 78 };
const partner = { id: 'partner', name: 'Miguel', ranking_position: 92, expected_salary: 100, morale: 80 };
const high = calculateRenewalInterest(partnership, player, partner);
assert.equal(high.level, 'alto');
assert.equal(decideRenewal(partnership, player, partner, { durationDays: 120, prizeSplit: 50, monthlySalary: 120 }).outcome, 'accepted');
const crisis = { ...partnership, id: 'crisis', chemistry: 20, partner_morale: 22, shared_matches: 20, shared_wins: 2 };
const refusal = decideRenewal(crisis, { ...player, ranking_position: 800, ranking_trend: 'caindo' }, { ...partner, ranking_position: 60 }, { durationDays: 60, prizeSplit: 70, monthlySalary: 0 }, player.career_date, { name: 'Atleta Elite', ranking_position: 20 });
assert.equal(refusal.outcome, 'refused');
assert.ok(refusal.interest.factors.some((factor) => factor.includes('oportunidade')));

const right = { id: 'right', name: 'Direita', preferred_side: 'right', handedness: 'right', tactical_role: 'controlador', overall_rating: 75 };
const left = { id: 'left', name: 'Esquerda', preferred_side: 'left', handedness: 'right', tactical_role: 'finalizador', overall_rating: 76 };
assert.equal(evaluatePartnerCompatibility(right, left).sideResolution.naturalFit, true);
assert.equal(partnershipRecordId('b', 'a', start), partnershipRecordId('a', 'b', start));
assert.equal(seededHash('save:date:event'), seededHash('save:date:event'));

const partnerLifecycle = fs.readFileSync(path.join(root, 'src/game-core/partnerLifecycle.js'), 'utf8');
const aiMarket = fs.readFileSync(path.join(root, 'src/game-core/aiPartnershipLifecycle.js'), 'utf8');
const gameState = fs.readFileSync(path.join(root, 'src/game-core/gameStateLifecycle.js'), 'utf8');
const advance = fs.readFileSync(path.join(root, 'src/game-core/dayAdvanceCoordinator.js'), 'utf8');
const offers = fs.readFileSync(path.join(root, 'src/lib/partnerOffers.js'), 'utf8');
const nextAction = fs.readFileSync(path.join(root, 'src/lib/careerNextAction.js'), 'utf8');
const partnerHub = fs.readFileSync(path.join(root, 'src/pages/PartnerHub.jsx'), 'utf8');

assert.match(partnerLifecycle, /partner-contract-expiry:\$\{active\.id\}:\$\{daysBefore\}/);
assert.match(partnerLifecycle, /partner-contract-ended/);
assert.match(partnerLifecycle, /schedulePartnerSeparation/);
assert.match(partnerLifecycle, /processPartnerMarketInterest/);
assert.match(aiMarket, /entityName: 'Partnership'/);
assert.match(aiMarket, /minimumStabilityReached/);
assert.match(gameState, /stage\('partnerMarketInterest'/);
assert.match(advance, /withPersistenceTransaction/);
assert.match(offers, /spontaneous-market-offer-while-paired/);
assert.match(offers, /-\$\{month\}/);
assert.match(nextAction, /partnership-negotiation/);
assert.match(nextAction, /find-partner/);
assert.match(partnerHub, /Encerrar ao final do contrato/);

console.log('LivingPartnershipMarketPhase15: PASS');
console.log(`fixture 60 dias: ${start} -> ${end}; D-15/D-7/D-3/D-1 idempotentes; D0 vencido; D+1 protegido; D+8 encerrado`);

