import assert from 'node:assert/strict';
import {
  applyPartnerBondEvent,
  calculatePartnershipPerformanceBonus,
  derivePartnershipIdentity,
  getPartnerConversationEffect,
} from '../src/lib/partnerBondSystem.js';

const base = {
  chemistry: 60,
  partner_trust: 55,
  partner_morale: 70,
  natural_chemistry: 68,
  shared_matches: 20,
  shared_wins: 12,
  partner_play_style: 'Controle',
};

const afterWin = applyPartnerBondEvent(base, { chemistry: 2, trust: 2, morale: 3 });
assert.equal(afterWin.chemistry, 62);
assert.equal(afterWin.trust, 57);
assert.equal(afterWin.morale, 73);

const conversation = getPartnerConversationEffect('apoio');
assert.ok(conversation.trust > 0 && conversation.morale > 0);

const identity = derivePartnershipIdentity({ ...base, chemistry: 82, partner_trust: 78, shared_matches: 70, shared_wins: 45 });
assert.ok(identity?.name && identity?.description);

const lowBonus = calculatePartnershipPerformanceBonus(base);
const highBonus = calculatePartnershipPerformanceBonus({ ...base, chemistry: 92, partner_trust: 90, partner_morale: 88, shared_matches: 100 });
assert.ok(lowBonus >= 0);
assert.ok(highBonus > lowBonus);
assert.ok(highBonus <= 0.06);

console.log('LivingPartnershipsV29Test: PASS');
console.log('✓ química, confiança e moral separadas');
console.log('✓ conversas alteram vínculo');
console.log('✓ identidade da dupla é derivada do histórico');
console.log('✓ bônus esportivo é pequeno e limitado');
