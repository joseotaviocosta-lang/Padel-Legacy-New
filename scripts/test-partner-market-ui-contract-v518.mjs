// Playthrough 5.18-D, Parte J — UI CONTRACT DO MERCADO DE PARCEIROS.
//
// Sem pixel-perfect (a Parte J é explícita). O que se valida é o CONTRATO
// LÓGICO: para cada estado de carreira, quais dados a tela precisa ter e
// nenhum CTA morto. A verificação é feita sobre as AUTORIDADES que a tela
// consome, não sobre render — assim o teste não quebra por mudança de layout,
// mas quebra se um estado deixar de ser representável.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bootstrap, installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/partners');

const ctx = await bootstrap('UIContractV518', { rank: 450, careerDate: '2026-01-19' });
const { vite, mod, localGame, profileId } = ctx;
let { profile } = ctx;

const {
  getActivePartnership, endPartnership, startPartnership, getPartnershipHistory,
} = await mod('/src/lib/partnershipSystem.js');
const { getAvailablePartners } = await mod('/src/lib/career.js');
const { listPartnerOffers } = await mod('/src/lib/partnerOffers.js');
const { getContractDecisionState, CONTRACT_DECISION_STATES } = await mod('/src/game-core/partnerLifecycle.js');

await localGame.entities.PlayerProfile.update(profileId, { court_side: 'direita' });
profile = await localGame.entities.PlayerProfile.get(profileId);

const hubSource = readFileSync(new URL('../src/pages/PartnerHub.jsx', import.meta.url), 'utf8');

// --- Contrato estrutural das abas ----------------------------------------
await check('Parte J: a tela declara todas as abas de estado exigidas', () => {
  const REQUIRED_TABS = ['offers', 'search', 'overview', 'inbox', 'contract', 'history'];
  const missing = REQUIRED_TABS.filter((t) => !hubSource.includes(`'${t}'`));
  console.log(`   [registro] abas exigidas presentes: ${REQUIRED_TABS.length - missing.length}/${REQUIRED_TABS.length}`);
  assert.equal(missing.length, 0, `abas ausentes: ${missing.join(', ')}`);
});

await check('Parte J: toda aba declarada tem um bloco de render', () => {
  // CTA morto = aba no menu sem nada que a renderize.
  //
  // Playthrough 5.20-B: a tela passou a ter DOIS niveis — as 4 abas de
  // primeiro nivel (activeTab) e os 3 filtros dentro de Mercado
  // (marketFilter). Olhar so activeTab acusava "received, search, inbox" como
  // abas mortas quando elas tem render proprio, um filtro abaixo. Com os dois
  // niveis reconhecidos o gate fica ESTRITO: nenhuma entrada declarada pode
  // ficar sem render (antes tolerava uma).
  const declared = [...hubSource.matchAll(/\{\s*key:\s*'([a-z]+)'/g)].map((m) => m[1]);
  const rendered = new Set([
    ...[...hubSource.matchAll(/activeTab === '([a-z]+)'/g)].map((m) => m[1]),
    ...[...hubSource.matchAll(/marketFilter === '([a-z]+)'/g)].map((m) => m[1]),
  ]);
  const dead = declared.filter((tab) => !rendered.has(tab));
  console.log(`   [registro] declaradas=${declared.length} com render=${declared.length - dead.length}`);
  assert.equal(dead.length, 0, `abas sem render: ${dead.join(", ")}`);
});

// --- ESTADO 1: COM PARCEIRO ----------------------------------------------
const withPartner = await getActivePartnership(profileId);
assert.ok(withPartner, 'pré-condição: sem parceria');

await check('Parte J/estado COM PARCEIRO: dados de Minha Dupla disponíveis', () => {
  assert.ok(withPartner.partner_name, 'sem nome do parceiro');
  assert.ok(withPartner.started_career_date, 'sem data de início');
  assert.ok(Number.isFinite(Number(withPartner.chemistry)), 'sem química');
  console.log(`   [registro] ${withPartner.partner_name}, desde ${withPartner.started_career_date}, química ${withPartner.chemistry}`);
});

await check('Parte J/estado COM PARCEIRO: contrato é representável', () => {
  const state = getContractDecisionState(withPartner);
  console.log(`   [registro] estado do contrato: ${state}`);
  assert.ok(Object.values(CONTRACT_DECISION_STATES).includes(state), `estado inválido: ${state}`);
  assert.ok(withPartner.contract_end_date || withPartner.scheduled_end_date, 'sem data de fim de contrato');
});

// --- ESTADO 2: SEPARAÇÃO AGENDADA ----------------------------------------
await localGame.entities.Partnership.update(withPartner.id, {
  contract_status: 'encerra_apos_compromisso',
  separation_scheduled_date: '2026-03-08',
  separation_scheduled_after_tournament_id: 'algum-torneio',
});
const scheduled = await localGame.entities.Partnership.get(withPartner.id);

await check('Parte J/estado SEPARAÇÃO AGENDADA: data e alvo são legíveis', () => {
  const state = getContractDecisionState(scheduled);
  console.log(`   [registro] estado=${state} até ${scheduled.separation_scheduled_date}`);
  assert.equal(state, CONTRACT_DECISION_STATES.ENDING_AFTER_COMMITMENTS);
  assert.ok(scheduled.separation_scheduled_date, 'sem data de separação agendada');
  assert.ok(scheduled.separation_scheduled_after_tournament_id, 'sem compromisso-alvo');
});

// --- ESTADO 3: SEM PARCEIRO ----------------------------------------------
await endPartnership(withPartner.id, 'encerrada_jogador', 'Teste UI 5.18-D', '2026-02-20');
await localGame.entities.PlayerProfile.update(profileId, {
  partner_id: null, partner_name: null, partner_locked_until: null,
});
profile = await localGame.entities.PlayerProfile.get(profileId);

await check('Parte J/estado SEM PARCEIRO: nenhuma UI stale do antigo parceiro', async () => {
  const active = await getActivePartnership(profileId);
  console.log(`   [registro] parceria ativa=${active ? active.partner_name : 'nenhuma'} | profile.partner_id=${profile.partner_id}`);
  assert.ok(!active, 'ainda há parceria ativa');
  assert.equal(profile.partner_id, null, 'profile.partner_id ficou preso no antigo parceiro');
  assert.equal(profile.partner_name, null, 'profile.partner_name ficou preso');
});

await check('Parte J/estado SEM PARCEIRO: busca de parceiro tem candidatos', () => {
  const candidates = getAvailablePartners(profile) || [];
  console.log(`   [registro] candidatos na busca: ${candidates.length}`);
  assert.ok(candidates.length > 0, 'CTA "Buscar parceiro" levaria a lista vazia');
});

await check('Parte J/estado SEM PARCEIRO: histórico acessível', async () => {
  const history = await getPartnershipHistory(profileId);
  console.log(`   [registro] entradas de histórico: ${(history || []).length}`);
  assert.ok((history || []).length > 0, 'histórico vazio após separação');
});

// --- ESTADO 4/5: PROPOSTAS ------------------------------------------------
await check('Parte J/estado PROPOSTAS: a lista é consultável e sem duplicata', async () => {
  const offers = await listPartnerOffers(profileId).catch(() => []);
  const ids = (offers || []).map((o) => o.candidate_player_id).filter(Boolean);
  console.log(`   [registro] propostas=${(offers || []).length} candidatos distintos=${new Set(ids).size}`);
  assert.equal(new Set(ids).size, ids.length, 'proposta duplicada para o mesmo candidato');
  for (const o of offers || []) {
    assert.ok(o.status, `proposta ${o.id} sem status`);
  }
});

// --- ESTADO 6: NOVA DUPLA -----------------------------------------------
const candidates = getAvailablePartners(profile) || [];
const created = await startPartnership(profile, candidates[0], 120, 50);
profile = created.profile || await localGame.entities.PlayerProfile.get(profileId);

await check('Parte J/estado NOVA DUPLA: parceiro e contrato corretos', async () => {
  const active = await getActivePartnership(profileId);
  console.log(`   [registro] nova dupla: ${active?.partner_name} até ${active?.contract_end_date}`);
  assert.ok(active, 'nova parceria não existe');
  assert.equal(active.partner_name, candidates[0].name);
  assert.ok(active.contract_end_date || active.scheduled_end_date, 'nova parceria sem contrato');
  assert.equal(profile.partner_name, candidates[0].name, 'perfil não refletiu a nova dupla');
});

await check('Parte J/estado NOVA DUPLA: histórico antigo permanece', async () => {
  const history = await getPartnershipHistory(profileId);
  console.log(`   [registro] histórico após nova dupla: ${(history || []).length}`);
  assert.ok((history || []).length > 0, 'o histórico sumiu ao criar a nova dupla');
});

await check('Parte J: apenas UM estado de parceria é verdadeiro por vez', async () => {
  const all = await localGame.entities.Partnership.filter({ profile_id: profileId }).catch(() => []);
  const active = (all || []).filter((p) => p.status === 'ativa');
  console.log(`   [registro] linhas=${(all || []).length} ativas=${active.length}`);
  assert.equal(active.length, 1, `${active.length} parcerias ativas — a UI mostraria estado ambíguo`);
});

await vite.close();
finish('test-partner-market-ui-contract-v518');
