// Playthrough 5.17 (continuação), Partes C/D — EFEITO REAL DA CONVERSA.
//
// AUDITORIA (Parte C), feita ANTES de qualquer mudança: a conversa NUNCA foi
// cosmética. `addConversation` (partnershipSystem.js) já aplicava
// `getPartnerConversationEffect(tone)` via `applyPartnerBondEvent`,
// persistindo chemistry/trust/morale no Partnership E no PlayerProfile, com
// clamp 0–100 e histórico das últimas 40 falas.
//
// Valores medidos no código:
//   positivo  chemistry +1  trust +3  morale +4
//   apoio     chemistry +1  trust +4  morale +5
//   objetivo  chemistry +2  trust +2  morale +2
//   neutro    chemistry  0  trust +1  morale  0
//   negativo  chemistry -2  trust -4  morale -4
//
// O que FALTAVA (e a Parte D pede): cooldown e retorno decrescente. Além
// disso a data gravada era a data REAL do sistema, não a da carreira — não
// servia para regra de jogo nenhuma.
import assert from 'node:assert/strict';
import { bootstrap, installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/partners');

const ctx = await bootstrap('ConversaV517', { rank: 600, careerDate: '2026-01-19' });
const { vite, mod, localGame, profileId } = ctx;

const { addConversation, getActivePartnership } = await mod('/src/lib/partnershipSystem.js');
const {
  getPartnerConversationEffect, getPartnerBondState,
  conversationDiminishingFactor, scaleConversationEffect,
} = await mod('/src/lib/partnerBondSystem.js');

const partnership = await getActivePartnership(profileId);
assert.ok(partnership, 'pré-condição: sem parceria ativa');

const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const stateOf = async () => getPartnerBondState(await localGame.entities.Partnership.get(partnership.id));

console.log('=== PARTE C: tabela de efeitos (lida do código) ===');
console.log('tom         chemistry  trust  morale');
for (const tone of ['positivo', 'apoio', 'objetivo', 'neutro', 'negativo']) {
  const e = getPartnerConversationEffect(tone);
  console.log(`${tone.padEnd(12)}${String(e.chemistry).padStart(9)}${String(e.trust).padStart(7)}${String(e.morale).padStart(8)}`);
}

await check('Parte C/5: tom POSITIVO tem efeito real e persistente', async () => {
  const before = await stateOf();
  await addConversation(partnership.id, 'Você', 'Bom jogo!', 'positivo', '2026-01-20');
  const after = await stateOf();
  console.log(`   [registro] trust ${before.trust} -> ${after.trust} | morale ${before.morale} -> ${after.morale}`);
  assert.ok(after.trust > before.trust, 'confiança não subiu');
  assert.ok(after.morale > before.morale, 'moral não subiu');
});

await check('Parte C: o efeito PERSISTE (releitura do banco)', async () => {
  const fresh = await localGame.entities.Partnership.get(partnership.id);
  assert.ok(Array.isArray(fresh.conversations) && fresh.conversations.length >= 1,
    'a conversa não ficou no histórico');
  const last = fresh.conversations[fresh.conversations.length - 1];
  assert.equal(last.tone, 'positivo');
  assert.equal(last.career_date, '2026-01-20', 'a data de CARREIRA não foi gravada');
});

await check('Parte C: o efeito também vai para o PlayerProfile', async () => {
  const profile = await localGame.entities.PlayerProfile.get(profileId);
  const fresh = await localGame.entities.Partnership.get(partnership.id);
  assert.equal(profile.partner_trust, fresh.partner_trust, 'perfil e parceria divergiram');
  assert.equal(profile.partner_morale, fresh.partner_morale);
});

await check('Parte C/7: tom NEGATIVO piora a relação', async () => {
  const before = await stateOf();
  await addConversation(partnership.id, 'Você', 'Isso não está funcionando.', 'negativo', '2026-01-22');
  const after = await stateOf();
  console.log(`   [registro] trust ${before.trust} -> ${after.trust} | morale ${before.morale} -> ${after.morale}`);
  assert.ok(after.trust < before.trust, 'confiança não caiu');
  assert.ok(after.morale < before.morale, 'moral não caiu');
});

await check('Parte C/6: tom NEUTRO é quase nulo (estabilizador)', () => {
  const e = getPartnerConversationEffect('neutro');
  console.log(`   [registro] neutro = chemistry ${e.chemistry}, trust ${e.trust}, morale ${e.morale}`);
  assert.equal(e.chemistry, 0);
  assert.equal(e.morale, 0);
  assert.ok(Math.abs(e.trust) <= 1, 'neutro deixou de ser quase nulo');
});

await check('Parte D: os valores continuam PEQUENOS (não viram atalho)', () => {
  for (const tone of ['positivo', 'apoio', 'objetivo', 'neutro', 'negativo']) {
    const e = getPartnerConversationEffect(tone);
    for (const key of ['chemistry', 'trust', 'morale']) {
      assert.ok(Math.abs(e[key]) <= 5, `${tone}.${key} = ${e[key]} é grande demais para uma conversa`);
    }
  }
});

await check('Parte D: o retorno decrescente reduz o ganho, sem zerar penalidade', () => {
  assert.equal(conversationDiminishingFactor(0), 1);
  assert.equal(conversationDiminishingFactor(1), 0.5);
  assert.equal(conversationDiminishingFactor(2), 0.25);
  assert.equal(conversationDiminishingFactor(3), 0);
  const positivo = scaleConversationEffect(getPartnerConversationEffect('positivo'), 0.5);
  const negativo = scaleConversationEffect(getPartnerConversationEffect('negativo'), 0.5);
  console.log(`   [registro] positivo amortecido: ${JSON.stringify(positivo)} | negativo: ${JSON.stringify(negativo)}`);
  assert.ok(positivo.morale < 4, 'ganho positivo não foi amortecido');
  assert.equal(negativo.morale, -4, 'a penalidade foi amortecida — brigar sairia barato');
});

await check('Parte D: os limites 0–100 são respeitados', async () => {
  // Empurra a moral para o teto e confirma que não estoura.
  let date = '2026-02-01';
  for (let i = 0; i < 40; i += 1) {
    await addConversation(partnership.id, 'Você', 'Ótimo trabalho!', 'apoio', date);
    date = addDays(date, 7);
  }
  const state = await stateOf();
  console.log(`   [registro] após 40 conversas: chemistry=${state.chemistry} trust=${state.trust} morale=${state.morale}`);
  for (const key of ['chemistry', 'trust', 'morale']) {
    assert.ok(state[key] >= 0 && state[key] <= 100, `${key} fora de 0..100: ${state[key]}`);
    assert.ok(Number.isFinite(state[key]), `${key} não é número`);
  }
});

await check('Parte D/10: o histórico é mantido e limitado', async () => {
  const fresh = await localGame.entities.Partnership.get(partnership.id);
  console.log(`   [registro] conversas no histórico: ${fresh.conversations.length}`);
  assert.ok(fresh.conversations.length > 0, 'histórico vazio');
  assert.ok(fresh.conversations.length <= 40, 'histórico cresceu sem limite');
});

await vite.close();
finish('test-partner-conversation-effects-v517');
