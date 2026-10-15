// Playthrough 5.17 (continuação), Partes A/B — CICLO DE AVISOS DO CONTRATO.
//
// AUDITORIA (Parte A): existem 4 avisos de vencimento — D-15, D-7, D-3 e
// D-1 (PARTNERSHIP_WARNING_DAYS) — mais "Contrato vencido" e "Fim da
// parceria". Cada um tem chave de contexto estável
// (`partner-contract-expiry:<id>:<dias>`), então NENHUM duplica por dia nem
// por reload: eles disparam só na travessia do marco.
//
// O defeito real (Parte B): todos eram emitidos com
// `status: 'decisao_pendente'` MESMO depois de o jogador já ter decidido.
// "Decida o futuro da dupla" reaparecia como pendência nova a cada marco.
import assert from 'node:assert/strict';
import { bootstrap, installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/partners');

const ctx = await bootstrap('ContratoV517', { rank: 600, careerDate: '2026-01-19' });
const { vite, mod, localGame, profileId } = ctx;
const { profile } = ctx;

const { getActivePartnership } = await mod('/src/lib/partnershipSystem.js');
const {
  processPartnerDay, getContractDecisionState, isContractDecided, CONTRACT_DECISION_STATES,
} = await mod('/src/game-core/partnerLifecycle.js');

const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const contractMessages = async () => {
  const rows = await localGame.entities.CareerMessage.filter({ profile_id: profileId }).catch(() => []);
  return (rows || []).filter((m) => String(m.message_type || '').startsWith('partner_contract')
    || String(m.message_type || '') === 'partner_separation_scheduled');
};

const partnership = await getActivePartnership(profileId);
assert.ok(partnership, 'pré-condição: sem parceria');

// Contrato terminando em 2026-03-03 (o caso do playtest).
const END = '2026-03-03';
await localGame.entities.Partnership.update(partnership.id, {
  contract_end_date: END, scheduled_end_date: END, contract_status: 'ativa',
});

await check('Parte B: o estado inicial é UNDECIDED', async () => {
  const p = await localGame.entities.Partnership.get(partnership.id);
  assert.equal(getContractDecisionState(p), CONTRACT_DECISION_STATES.UNDECIDED);
  assert.equal(isContractDecided(p), false);
});

// --- Avança pelos marcos SEM decidir --------------------------------------
let date = addDays(END, -20);
for (let i = 0; i < 6; i += 1) {
  const next = addDays(date, 1);
  await processPartnerDay({ ...profile, career_date: next }, date, next);
  date = next;
}

const undecidedMsgs = await contractMessages();
console.log('=== PARTE A: avisos emitidos (sem decisão) ===');
console.log('dia         context_key                                    status            pendente?');
for (const m of undecidedMsgs) {
  const key = String(m.metadata?.context_key || '').slice(0, 44);
  console.log(`${String(m.career_date).padEnd(12)}${key.padEnd(46)}${String(m.status).padEnd(18)}${m.status === 'decisao_pendente'}`);
}

await check('Parte A/1: existem avisos de vencimento e eles são únicos por marco', async () => {
  const keys = undecidedMsgs.map((m) => m.metadata?.context_key).filter(Boolean);
  console.log(`   [registro] avisos=${keys.length} chaves distintas=${new Set(keys).size}`);
  assert.equal(new Set(keys).size, keys.length, 'marco duplicado');
});

await check('Parte A/4: sem decisão, o aviso EXIGE decisão', async () => {
  const pending = undecidedMsgs.filter((m) => m.status === 'decisao_pendente');
  console.log(`   [registro] pendentes: ${pending.length}`);
  assert.ok(pending.length >= 1, 'nenhum aviso pediu decisão');
});

await check('Parte A/7: reprocessar o MESMO dia não cria aviso novo', async () => {
  const before = (await contractMessages()).length;
  await processPartnerDay({ ...profile, career_date: date }, addDays(date, -1), date);
  const after = (await contractMessages()).length;
  console.log(`   [registro] reprocessando ${date}: ${before} -> ${after}`);
  assert.equal(after, before, 'o mesmo dia gerou aviso novo');
});

// --- O jogador DECIDE encerrar ao final -----------------------------------
await localGame.entities.Partnership.update(partnership.id, { contract_status: 'encerrar_ao_final' });

await check('Parte B: a decisão fica registrada como ENDING_AT_EXPIRY', async () => {
  const p = await localGame.entities.Partnership.get(partnership.id);
  assert.equal(getContractDecisionState(p), CONTRACT_DECISION_STATES.ENDING_AT_EXPIRY);
  assert.equal(isContractDecided(p), true);
});

const beforeDecisionCount = (await contractMessages()).length;

// Avança pelos marcos restantes (D-3, D-1) JÁ com a decisão tomada.
date = addDays(END, -5);
for (let i = 0; i < 5; i += 1) {
  const next = addDays(date, 1);
  await processPartnerDay({ ...profile, career_date: next }, date, next);
  date = next;
}

const afterDecision = await contractMessages();
const newAfterDecision = afterDecision.slice(beforeDecisionCount);

console.log('\n=== PARTE B: avisos APÓS a decisão ===');
for (const m of newAfterDecision) {
  console.log(`${String(m.career_date).padEnd(12)}${String(m.title).padEnd(34)}${String(m.status).padEnd(16)}estado=${m.metadata?.contract_decision_state || '-'}`);
}

await check('Parte B/3: NENHUM aviso volta como pendência após a decisão', async () => {
  const pending = newAfterDecision.filter((m) => m.status === 'decisao_pendente');
  console.log(`   [registro] novos pendentes após decidir: ${pending.length}`);
  assert.equal(pending.length, 0,
    `${pending.length} avisos voltaram a pedir decisão: ${pending.map((m) => m.title).join(' | ')}`);
});

await check('Parte B: o aviso informativo NÃO oferece CTA de decisão', () => {
  const withCta = newAfterDecision.filter((m) => Array.isArray(m.actions) && m.actions.length > 0);
  assert.equal(withCta.length, 0, 'aviso pós-decisão ainda oferece "Conversar sobre o futuro"');
});

await check('Parte B: o aviso pós-decisão carrega o ESTADO da decisão', () => {
  for (const m of newAfterDecision) {
    assert.ok(m.metadata?.contract_decision_state, 'aviso sem estado de decisão no metadata');
    assert.notEqual(m.metadata.contract_decision_state, CONTRACT_DECISION_STATES.UNDECIDED);
  }
});

await check('Parte B/4: a decisão SOBREVIVE ao reload', async () => {
  // Releitura crua do banco, sem estado de sessão.
  const fresh = await localGame.entities.Partnership.get(partnership.id);
  assert.equal(getContractDecisionState(fresh), CONTRACT_DECISION_STATES.ENDING_AT_EXPIRY,
    'a decisão se perdeu ao reler do banco');
});

await check('Parte A/8: o dedupe é estável entre execuções', async () => {
  const before = (await contractMessages()).length;
  for (let i = 0; i < 3; i += 1) {
    await processPartnerDay({ ...profile, career_date: date }, addDays(date, -1), date);
  }
  const after = (await contractMessages()).length;
  console.log(`   [registro] 3 reprocessamentos: ${before} -> ${after}`);
  assert.equal(after, before, 'reprocessar gerou avisos novos');
});

await check('Parte B: ENDING_AFTER_COMMITMENTS é um estado distinto e decidido', async () => {
  await localGame.entities.Partnership.update(partnership.id, { contract_status: 'encerra_apos_compromisso' });
  const p = await localGame.entities.Partnership.get(partnership.id);
  assert.equal(getContractDecisionState(p), CONTRACT_DECISION_STATES.ENDING_AFTER_COMMITMENTS);
  assert.equal(isContractDecided(p), true);
});

await check('Parte B: parceria encerrada vira ENDED', () => {
  assert.equal(getContractDecisionState({ status: 'encerrada', contract_status: 'vencido' }),
    CONTRACT_DECISION_STATES.ENDED);
});

await vite.close();
finish('test-partnership-contract-notification-lifecycle-v517');
