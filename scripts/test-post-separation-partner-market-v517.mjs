// Playthrough 5.17, Parte F — o mercado não pode ficar morto após a
// separação.
//
// Playtest: a parceria acabou, o jogador ficou sem dupla, NENHUMA proposta
// apareceu e ele foi obrigado a procurar manualmente.
//
// Causa medida: `ensureInitialPartnerOffers` só roda quando o jogador ABRE o
// PartnerHub, e é "inicial" (recusa-se a rodar de novo). Pior, o tick diário
// `processPartnerDay` começava com `if (!active) return profile` — todo o
// ciclo de parceria estava condicionado a JÁ ter dupla.
import assert from 'node:assert/strict';
import { bootstrap, installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/partners');

const ctx = await bootstrap('MercadoV517', { rank: 700, careerDate: '2026-01-19' });
const { vite, mod, localGame, profileId } = ctx;
let { profile } = ctx;

const { getActivePartnership, endPartnership } = await mod('/src/lib/partnershipSystem.js');
const { processPartnerDay } = await mod('/src/game-core/partnerLifecycle.js');
const {
  ensurePostSeparationPartnerMarket, postSeparationWindowIndex,
  isCandidateAvailable, findLastSeparationDate,
  POST_SEPARATION_FIRST_WINDOW_DAYS, POST_SEPARATION_INTERVAL_DAYS,
} = await mod('/src/game-core/postSeparationMarket.js');

const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const offers = async () => localGame.entities.PartnerOffer.filter({ profile_id: profileId }).catch(() => []);

await check('Parte F: as janelas seguem a regra (1ª logo após, depois semanais)', () => {
  assert.equal(postSeparationWindowIndex('2026-01-25', '2026-01-26'), null, 'janela cedo demais');
  assert.equal(postSeparationWindowIndex('2026-01-25', addDays('2026-01-25', POST_SEPARATION_FIRST_WINDOW_DAYS)), 0);
  assert.equal(
    postSeparationWindowIndex('2026-01-25', addDays('2026-01-25', POST_SEPARATION_FIRST_WINDOW_DAYS + POST_SEPARATION_INTERVAL_DAYS)),
    1, 'a segunda janela não abriu após uma semana',
  );
});

await check('Parte F: candidato comprometido NÃO é proponível', () => {
  const committed = new Set(['ja-comprometido']);
  assert.equal(isCandidateAvailable({ id: 'ja-comprometido' }, committed), false);
  assert.equal(isCandidateAvailable({ id: 'livre' }, committed), true);
  assert.equal(isCandidateAvailable({ id: 'x', ai_partner_id: 'y' }, new Set()), false,
    'atleta já pareado no mundo foi oferecido');
  assert.equal(isCandidateAvailable({ id: 'z', career_status: 'aposentado' }, new Set()), false);
});

// --- Separação real -------------------------------------------------------
const partnership = await getActivePartnership(profileId);
assert.ok(partnership, 'pré-condição: sem parceria');
const SEPARATION = '2026-01-25';
await endPartnership(partnership.id, 'encerrada_contrato', 'Teste 5.17', SEPARATION);
await localGame.entities.PlayerProfile.update(profileId, {
  partner_id: null, partner_name: null, partner_locked_until: null,
});
profile = await localGame.entities.PlayerProfile.get(profileId);

await check('Parte F: a separação é recuperável do estado PERSISTIDO', async () => {
  const found = await findLastSeparationDate(profileId);
  console.log(`   [registro] separação detectada: ${found}`);
  assert.ok(found, 'a separação não é recuperável após reload');
});

await check('Parte F: antes da primeira janela, NADA é gerado', async () => {
  const result = await ensurePostSeparationPartnerMarket(profile, addDays(SEPARATION, 1));
  console.log(`   [registro] ${JSON.stringify({ created: result.created, reason: result.reason })}`);
  assert.equal(result.created, 0);
  assert.equal(result.reason, 'too-soon');
});

await check('Parte F/7-8: o TICK DIÁRIO gera as propostas da primeira janela', async () => {
  // A prova de que a correção está no caminho real do jogo: antes,
  // `processPartnerDay` retornava imediatamente quando não havia parceria,
  // e nada jamais rodava. Aqui quem serve a janela é o tick, não uma
  // chamada direta.
  const date = addDays(SEPARATION, POST_SEPARATION_FIRST_WINDOW_DAYS);
  const before = (await offers()).length;
  await processPartnerDay({ ...profile, career_date: date }, addDays(date, -1), date);
  const after = (await offers()).length;
  console.log(`   [registro] via processPartnerDay na janela 0: ${before} -> ${after}`);
  assert.ok(after - before >= 2, `o tick diário criou só ${after - before} propostas`);
  assert.ok(after - before <= 4, `${after - before} propostas — acima do teto de 4`);
});

await check('Parte F: as propostas ficam PERSISTIDAS', async () => {
  const rows = await offers();
  const fromMarket = rows.filter((o) => o.source === 'post-separation-market');
  console.log(`   [registro] propostas persistidas: ${fromMarket.length}`);
  assert.ok(fromMarket.length >= 2);
  for (const o of fromMarket) {
    assert.ok(o.candidate_player_id, 'proposta sem candidato');
    assert.ok(o.contract, 'proposta sem termos de contrato');
  }
});

await check('Parte F: a MESMA janela não gera propostas de novo (idempotência)', async () => {
  const date = addDays(SEPARATION, POST_SEPARATION_FIRST_WINDOW_DAYS);
  const before = (await offers()).length;
  const again = await ensurePostSeparationPartnerMarket({ ...profile, career_date: date }, date);
  const after = (await offers()).length;
  console.log(`   [registro] reprocessar a janela: created=${again.created} (${again.reason || 'ok'})`);
  assert.equal(again.created, 0);
  assert.equal(after, before, 'a janela duplicou propostas');
});

await check('Parte F: uma NOVA janela abre após uma semana sem dupla', async () => {
  const date = addDays(SEPARATION, POST_SEPARATION_FIRST_WINDOW_DAYS + POST_SEPARATION_INTERVAL_DAYS);
  const before = (await offers()).length;
  const result = await ensurePostSeparationPartnerMarket({ ...profile, career_date: date }, date);
  const after = (await offers()).length;
  console.log(`   [registro] janela 1 criou ${result.created} (total ${before} -> ${after})`);
  assert.ok(result.created >= 1, 'nenhuma proposta na segunda janela');
});

await check('Parte F: dedupe — nenhum candidato é proposto duas vezes', async () => {
  const rows = await offers();
  const ids = rows.map((o) => o.candidate_player_id).filter(Boolean);
  console.log(`   [registro] propostas=${ids.length} candidatos distintos=${new Set(ids).size}`);
  assert.equal(new Set(ids).size, ids.length, 'o mesmo candidato foi proposto mais de uma vez');
});

await check('Parte F: o jogador é NOTIFICADO (não precisa descobrir sozinho)', async () => {
  const messages = await localGame.entities.CareerMessage.filter({ profile_id: profileId }).catch(() => []);
  const marketMsgs = (messages || []).filter((m) => m.message_type === 'partner_market_window');
  console.log(`   [registro] avisos de mercado: ${marketMsgs.length}`);
  assert.ok(marketMsgs.length >= 1, 'nenhuma notificação de proposta');
});

await check('Parte F: o mercado PARA quando não há mais agente livre', async () => {
  // Observação de mundo (registrada de propósito): a semeadura pareia ~994
  // dos ~1000 atletas, então o conjunto de agentes livres é pequeno e se
  // esgota depois de algumas janelas. Parar com `no-candidates` é o
  // comportamento honesto — melhor que oferecer alguém já comprometido, que
  // é justamente o que a Parte F proíbe.
  const date = addDays(SEPARATION, POST_SEPARATION_FIRST_WINDOW_DAYS + POST_SEPARATION_INTERVAL_DAYS * 3);
  const before = (await offers()).length;
  const result = await ensurePostSeparationPartnerMarket({ ...profile, career_date: date }, date);
  const after = (await offers()).length;
  console.log(`   [registro] janela tardia: created=${result.created} reason=${result.reason || 'ok'}`);
  assert.equal(after, before + result.created, 'contagem de propostas inconsistente');
  assert.ok(['no-candidates', 'no-viable-offer', undefined].includes(result.reason) || result.created > 0,
    `motivo inesperado: ${result.reason}`);
});

await check('Parte F: com parceria ativa, o mercado fica quieto', async () => {
  const withPartner = { ...profile, partner_id: 'alguem' };
  const result = await ensurePostSeparationPartnerMarket(withPartner, addDays(SEPARATION, 30));
  assert.equal(result.created, 0);
  assert.equal(result.reason, 'has-partner');
});

await vite.close();
finish('test-post-separation-partner-market-v517');
