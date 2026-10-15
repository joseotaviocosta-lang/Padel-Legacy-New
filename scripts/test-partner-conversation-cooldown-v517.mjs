// Playthrough 5.17 (continuação), Parte D — CONVERSA NÃO PODE SER FARMADA.
//
// Antes desta fase não havia cooldown nem retorno decrescente: clicar
// "apoio" repetidamente somava +5 de moral por clique até saturar em 100.
// A conversa importava, mas importava demais e sem limite.
import assert from 'node:assert/strict';
import { bootstrap, installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/partners');

const ctx = await bootstrap('CooldownV517', { rank: 600, careerDate: '2026-01-19' });
const { vite, mod, localGame, profileId } = ctx;

const { addConversation, getActivePartnership } = await mod('/src/lib/partnershipSystem.js');
const {
  getPartnerBondState, getConversationCooldownState, CONVERSATION_COOLDOWN_DAYS,
} = await mod('/src/lib/partnerBondSystem.js');

const partnership = await getActivePartnership(profileId);
assert.ok(partnership, 'pré-condição: sem parceria ativa');

const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const stateOf = async () => getPartnerBondState(await localGame.entities.Partnership.get(partnership.id));
const rowOf = async () => localGame.entities.Partnership.get(partnership.id);

const DAY = '2026-01-20';

await check('Parte D: a primeira conversa do dia TEM efeito', async () => {
  const before = await stateOf();
  await addConversation(partnership.id, 'Você', 'Vamos com tudo!', 'apoio', DAY);
  const after = await stateOf();
  console.log(`   [registro] morale ${before.morale} -> ${after.morale}`);
  assert.ok(after.morale > before.morale, 'a primeira conversa não teve efeito');
});

await check('Parte D/8: a SEGUNDA conversa no mesmo dia é bloqueada', async () => {
  const before = await stateOf();
  const result = await addConversation(partnership.id, 'Você', 'De novo!', 'apoio', DAY);
  const after = await stateOf();
  console.log(`   [registro] bloqueada=${Boolean(result?.conversation_blocked)} | morale ${before.morale} -> ${after.morale}`);
  assert.ok(result?.conversation_blocked, 'a segunda conversa do dia não foi bloqueada');
  assert.equal(after.morale, before.morale, 'o bond mudou apesar do cooldown');
  assert.equal(after.trust, before.trust);
});

await check('Parte D: a conversa bloqueada NÃO entra no histórico', async () => {
  const row = await rowOf();
  const sameDay = (row.conversations || []).filter((c) => c.career_date === DAY);
  console.log(`   [registro] conversas registradas em ${DAY}: ${sameDay.length}`);
  assert.equal(sameDay.length, 1, 'a tentativa bloqueada foi gravada mesmo assim');
});

await check('Parte D: passado o cooldown, a conversa volta a valer', async () => {
  const next = addDays(DAY, CONVERSATION_COOLDOWN_DAYS);
  const before = await stateOf();
  const result = await addConversation(partnership.id, 'Você', 'Seguimos firmes.', 'apoio', next);
  const after = await stateOf();
  console.log(`   [registro] ${next}: bloqueada=${Boolean(result?.conversation_blocked)} | morale ${before.morale} -> ${after.morale}`);
  assert.ok(!result?.conversation_blocked, 'ainda bloqueada após o cooldown');
  assert.ok(after.morale >= before.morale, 'a conversa liberada não teve efeito');
});

await check('Parte D/9: o retorno DECRESCE dentro da mesma janela', async () => {
  // Três dias seguidos: o ganho de cada conversa precisa encolher.
  const base = '2026-03-01';
  const gains = [];
  for (let i = 0; i < 4; i += 1) {
    const day = addDays(base, i);
    const before = await stateOf();
    await addConversation(partnership.id, 'Você', 'Bom trabalho!', 'apoio', day);
    const after = await stateOf();
    gains.push(after.morale - before.morale);
  }
  console.log(`   [registro] ganhos de moral em 4 dias seguidos: ${gains.join(', ')}`);
  assert.ok(gains[0] > 0, 'a primeira conversa da janela não teve ganho');
  assert.ok(gains[1] <= gains[0], 'a segunda conversa rendeu igual ou mais que a primeira');
  assert.ok(gains[3] === 0, 'a quarta conversa da janela ainda rendeu ganho');
});

await check('Parte D: SPAM não eleva a relação indefinidamente', async () => {
  // 30 tentativas na mesma janela de 7 dias: o total tem de ser limitado.
  const base = '2026-04-01';
  const before = await stateOf();
  for (let i = 0; i < 30; i += 1) {
    await addConversation(partnership.id, 'Você', 'Vamos!', 'apoio', addDays(base, i % 7));
  }
  const after = await stateOf();
  const delta = after.morale - before.morale;
  console.log(`   [registro] 30 tentativas -> ganho total de moral: ${delta}`);
  assert.ok(delta <= 12, `spam rendeu ${delta} de moral — ainda é farmável`);
  assert.ok(after.morale <= 100, 'moral estourou o teto');
});

await check('Parte D: o estado de cooldown é RELOAD-SAFE', async () => {
  // Releitura crua do banco, sem estado de sessão.
  const row = await rowOf();
  const state = getConversationCooldownState(row, '2026-04-07');
  console.log(`   [registro] após reload: recentes=${state.recentCount} bloqueada=${state.blocked} última=${state.lastDate}`);
  assert.ok(Number.isFinite(state.recentCount), 'estado de cooldown irrecuperável');
  assert.ok(state.lastDate, 'a última conversa não é recuperável do banco');
});

await check('Parte D: uma janela nova reabre o efeito integral', async () => {
  const far = '2026-06-01';
  const before = await stateOf();
  await addConversation(partnership.id, 'Você', 'Novo ciclo.', 'apoio', far);
  const after = await stateOf();
  const gain = after.morale - before.morale;
  console.log(`   [registro] ganho numa janela limpa: ${gain}`);
  assert.ok(gain > 0 || after.morale === 100, 'janela nova não restaurou o efeito');
});

await vite.close();
finish('test-partner-conversation-cooldown-v517');
