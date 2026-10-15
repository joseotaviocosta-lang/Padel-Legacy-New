// Playthrough 5.17, Partes A/B — REPRODUÇÃO DO P0 DO PLAYTEST.
//
// Cenário real observado: inscrição feita com Pedro Teixeira, parceria
// terminou antes do evento, a chave passou a mostrar "<jogador> & Parceiro"
// e o parceiro desapareceu durante a partida.
//
// Este teste não usa mock de superfície: sobe um mundo real, forma parceria,
// inscreve em torneio futuro, encerra o contrato e então pergunta quem é a
// dupla daquele torneio.
import assert from 'node:assert/strict';
import { bootstrap, installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/tournaments');

const ctx = await bootstrap('ExpiryV517', { rank: 950, careerDate: '2026-01-19' });
const { vite, mod, localGame, profileId, partner } = ctx;
let { profile } = ctx;

const { registerTournament } = await mod('/src/lib/tournamentRegistration.js');
const {
  resolveCommittedPartnerId, resolveCommittedPartnerAthlete,
  findCommittedTournaments, canRegisterNewTournamentWithPartnership,
} = await mod('/src/lib/committedRoster.js');
const { getPartnerBot } = await mod('/src/lib/career.js');
const { getActivePartnership, endPartnership } = await mod('/src/lib/partnershipSystem.js');

// --- 1. Parceria ativa + inscrição num torneio futuro ----------------------
const partnership = await getActivePartnership(profileId);
assert.ok(partnership, 'pré-condição: nenhuma parceria ativa');

const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
const future = tournaments.find((t) => t.start_date > '2026-02-01' && t.tier === 'Bronze')
  || tournaments.find((t) => t.start_date > '2026-02-01');
assert.ok(future, 'pré-condição: nenhum torneio futuro');

const registered = await registerTournament({
  player: profile, partner, tournament: future, teamRank: 950,
});
assert.ok(registered?.success, `inscrição falhou: ${JSON.stringify(registered?.reasons)}`);

const partnerIdBefore = partner.id;
const partnerNameBefore = partner.sport_name || partner.name;

await check('Parte B/1: a inscrição salva os IDs dos DOIS integrantes', async () => {
  const rows = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId });
  const row = rows.find((r) => r.tournament_id === future.id);
  assert.ok(row, 'inscrição não encontrada');
  assert.equal(row.profile_id, profileId, 'sem id do jogador');
  assert.ok(row.partner_id, 'sem id do parceiro');
  console.log(`   [registro] inscrição: ${row.profile_id} + ${row.partner_id}`);
});

// --- 2. A parceria termina ANTES do torneio -------------------------------
await endPartnership(partnership.id, 'encerrada_contrato', 'Contrato não renovado', '2026-01-25');
await localGame.entities.PlayerProfile.update(profileId, {
  partner_id: null, partner_name: null, partner_locked_until: null,
});
profile = await localGame.entities.PlayerProfile.get(profileId);

await check('pré-condição: a parceria realmente terminou', async () => {
  const active = await getActivePartnership(profileId).catch(() => null);
  assert.ok(!active, 'a parceria ainda está ativa — o cenário não reproduz o bug');
  assert.equal(profile.partner_id, null, 'partner_id não foi limpo');
});

await check('Parte B/4: o resolver DINÂMICO passa a retornar null (causa raiz)', () => {
  // Este é o comportamento que produzia "Parceiro" — registrado aqui como
  // evidência da causa, não como algo a ser corrigido em getPartnerBot.
  const live = getPartnerBot(profile);
  console.log(`   [registro] getPartnerBot após separação: ${live ? live.name : 'null'}`);
  assert.equal(live, null, 'o cenário não reproduz a perda do resolver dinâmico');
});

await check('Parte B/5: o ex-parceiro continua existindo no mundo', async () => {
  const still = await localGame.entities.AthleteProfile.get(partnerIdBefore).catch(() => null);
  const byBot = still ? null : await localGame.entities.AthleteProfile.filter({ bot_id: partnerIdBefore }).catch(() => []);
  const found = still || byBot?.[0] || null;
  console.log(`   [registro] ex-parceiro no mundo: ${found ? (found.sport_name || found.name) : 'AUSENTE'}`);
  assert.ok(found, 'o ex-parceiro sumiu do mundo');
});

// --- 3. A CORREÇÃO: o torneio assumido mantém a dupla registrada ----------
await check('Parte B/2+6: o torneio assumido resolve o PARCEIRO REGISTRADO', async () => {
  const rows = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId });
  const id = resolveCommittedPartnerId(future.id, { registrations: rows, calendarEvents: [] });
  assert.equal(id, partnerIdBefore, 'o id do parceiro registrado se perdeu');
});

await check('Parte B/6: o nome da dupla NÃO vira "Parceiro" genérico', async () => {
  const resolved = await resolveCommittedPartnerAthlete({
    profile, tournamentId: future.id,
  });
  const name = resolved?.sport_name || resolved?.name || null;
  console.log(`   [registro] parceiro do compromisso: ${name}`);
  assert.ok(resolved, 'nenhum parceiro resolvido para o compromisso');
  assert.notEqual(name, 'Parceiro', 'a dupla caiu no fallback genérico');
  assert.ok(name && name.length > 1, 'nome de parceiro inválido');
});

await check('Parte B/3: a identidade vem da dupla REGISTRADA, não da parceria atual', async () => {
  // Sem parceria ativa, o único caminho possível é o registro — é isso que
  // prova que a resolução deixou de ser dinâmica.
  const active = await getActivePartnership(profileId).catch(() => null);
  assert.ok(!active);
  const resolved = await resolveCommittedPartnerAthlete({ profile, tournamentId: future.id });
  assert.ok(resolved?.id === partnerIdBefore || resolved?.bot_id === partnerIdBefore,
    `resolveu ${resolved?.id} em vez de ${partnerIdBefore}`);
});

await check('Parte C: um torneio NÃO assumido não inventa parceiro', async () => {
  const other = tournaments.find((t) => t.id !== future.id && t.start_date > '2026-02-01');
  const rows = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId });
  const id = resolveCommittedPartnerId(other.id, { registrations: rows, calendarEvents: [] });
  assert.equal(id, null, 'um torneio sem inscrição resolveu um parceiro do nada');
});

await check('Parte C: compromissos pendentes são detectados', async () => {
  const rows = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId });
  const pending = findCommittedTournaments({
    registrations: rows, tournaments, careerDate: '2026-01-25', partnerId: partnerIdBefore,
  });
  console.log(`   [registro] compromissos pendentes: ${pending.map((p) => p.name).join(', ') || 'nenhum'}`);
  assert.ok(pending.length >= 1, 'o compromisso assumido não foi detectado');
  assert.equal(pending[0].tournamentId, future.id);
});

await check('Parte C: a extensão competitiva NÃO reabre o mercado', () => {
  const ended = { contract_status: 'encerrar_ao_final', contract_end_date: '2026-02-01' };
  assert.equal(canRegisterNewTournamentWithPartnership(ended, '2026-01-20'), true,
    'antes da data nominal ainda deve ser possível assinar');
  assert.equal(canRegisterNewTournamentWithPartnership(ended, '2026-02-10'), false,
    'depois da data nominal a extensão não pode permitir inscrição nova');
});

console.log(`\n[contexto] parceiro original: ${partnerNameBefore} (${partnerIdBefore})`);
await vite.close();
finish('test-partnership-expiry-with-committed-tournament-v517');
