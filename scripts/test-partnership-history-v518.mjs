// Playthrough 5.18-D, Partes G/H — HISTÓRICO DE PARCERIAS.
//
// Fluxo: A+B joga parte da temporada, termina, A+C nasce.
// Validar que A+B fica consultável como HISTÓRICO (com stats, datas e motivo)
// e que A+C começa limpa, sem herdar partida nem título.
import assert from 'node:assert/strict';
import { bootstrap, installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/partners');

const ctx = await bootstrap('HistoricoV518', { rank: 500, careerDate: '2026-01-19' });
const { vite, mod, localGame, profileId } = ctx;
let { profile } = ctx;

const {
  getActivePartnership, endPartnership, startPartnership, getPartnershipHistory,
  buildPartnershipMatchPatch,
} = await mod('/src/lib/partnershipSystem.js');
const { getAvailablePartners } = await mod('/src/lib/career.js');

await localGame.entities.PlayerProfile.update(profileId, { court_side: 'direita' });
profile = await localGame.entities.PlayerProfile.get(profileId);

// --- A+B: dupla inicial, com resultados ----------------------------------
const partnershipAB = await getActivePartnership(profileId);
assert.ok(partnershipAB, 'pré-condição: sem parceria inicial');
const partnerBName = partnershipAB.partner_name;
const AB_START = partnershipAB.started_career_date;

// Simula resultados reais da dupla A+B pela autoridade existente.
let abRow = partnershipAB;
for (const won of [true, true, false, true, false]) {
  const patch = buildPartnershipMatchPatch(abRow, won, 'Torneio Teste', '2026-02-10');
  abRow = await localGame.entities.Partnership.update(abRow.id, patch);
}
await localGame.entities.Partnership.update(abRow.id, {
  shared_titles: 1, chemistry: 72,
});
abRow = await localGame.entities.Partnership.get(abRow.id);

const AB_SNAPSHOT = {
  partner_name: abRow.partner_name,
  started_career_date: abRow.started_career_date,
  shared_matches: Number(abRow.shared_matches) || 0,
  shared_wins: Number(abRow.shared_wins) || 0,
  shared_losses: Number(abRow.shared_losses) || 0,
  shared_titles: Number(abRow.shared_titles) || 0,
  chemistry: Number(abRow.chemistry) || 0,
};

console.log('=== A+B antes do término ===');
console.log(JSON.stringify(AB_SNAPSHOT));

await check('Parte G: A+B acumulou estatísticas reais', () => {
  assert.ok(AB_SNAPSHOT.shared_matches >= 5, `só ${AB_SNAPSHOT.shared_matches} partidas`);
  assert.equal(AB_SNAPSHOT.shared_wins + AB_SNAPSHOT.shared_losses, AB_SNAPSHOT.shared_matches,
    'V+D incoerente com partidas na dupla do jogador');
  assert.equal(AB_SNAPSHOT.shared_titles, 1);
});

// --- Término --------------------------------------------------------------
const AB_END = '2026-06-15';
await endPartnership(abRow.id, 'encerrada_jogador', 'Decisão de teste 5.18-D', AB_END);
await localGame.entities.PlayerProfile.update(profileId, {
  partner_id: null, partner_name: null, partner_locked_until: null,
});
profile = await localGame.entities.PlayerProfile.get(profileId);

await check('Parte H: A+B deixa de ser parceria ATIVA', async () => {
  const active = await getActivePartnership(profileId);
  assert.ok(!active, 'A+B continua ativa após o término');
  const row = await localGame.entities.Partnership.get(abRow.id);
  assert.notEqual(row.status, 'ativa', `status continua ${row.status}`);
});

await check('Parte G: o histórico de A+B permanece CONSULTÁVEL', async () => {
  const history = await getPartnershipHistory(profileId);
  const entry = (history || []).find((h) => h.partner_name === partnerBName);
  console.log(`   [registro] entradas=${(history || []).length} | A+B encontrada=${Boolean(entry)}`);
  assert.ok(entry, 'A+B não aparece no histórico');
  return entry;
});

await check('Parte G: o histórico preserva datas, partidas, V/D e títulos', async () => {
  const history = await getPartnershipHistory(profileId);
  const entry = (history || []).find((h) => h.partner_name === partnerBName);
  assert.ok(entry, 'A+B ausente');
  console.log(`   [registro] ${entry.partner_name}: ${entry.started_career_date} -> ${entry.ended_career_date} | ${entry.shared_matches}j ${entry.shared_wins}V ${entry.shared_losses}D ${entry.shared_titles}T`);
  assert.equal(String(entry.started_career_date).slice(0, 10), String(AB_START).slice(0, 10));
  assert.equal(String(entry.ended_career_date).slice(0, 10), AB_END);
  assert.equal(Number(entry.shared_matches), AB_SNAPSHOT.shared_matches);
  assert.equal(Number(entry.shared_wins), AB_SNAPSHOT.shared_wins);
  assert.equal(Number(entry.shared_losses), AB_SNAPSHOT.shared_losses);
  assert.equal(Number(entry.shared_titles), AB_SNAPSHOT.shared_titles);
});

await check('Parte G: o histórico registra o MOTIVO do término', async () => {
  const row = await localGame.entities.Partnership.get(abRow.id);
  const history = await getPartnershipHistory(profileId);
  const entry = (history || []).find((h) => h.partner_name === partnerBName);
  const reason = entry?.termination_reason || entry?.end_reason || row.end_reason || row.status;
  console.log(`   [registro] motivo: ${reason}`);
  assert.ok(reason, 'nenhum motivo de término registrado');
});

// --- A+C: nova dupla ------------------------------------------------------
const candidates = (getAvailablePartners(profile) || []).filter((c) => c.id !== abRow.partner_bot_id);
assert.ok(candidates.length, 'nenhum candidato para A+C');
const partnerC = candidates[0];
const created = await startPartnership(profile, partnerC, 120, 50);
profile = created.profile || await localGame.entities.PlayerProfile.get(profileId);
const partnershipAC = await getActivePartnership(profileId);

await check('Parte G: A+C nasce como parceria nova e ATIVA', () => {
  console.log(`   [registro] A+C com ${partnershipAC?.partner_name}`);
  assert.ok(partnershipAC, 'A+C não foi criada');
  assert.equal(partnershipAC.status, 'ativa');
  assert.notEqual(partnershipAC.id, abRow.id, 'A+C reusou a linha de A+B');
  assert.notEqual(partnershipAC.partner_name, partnerBName);
});

await check('Parte G: A+C NÃO herda partidas, V/D nem títulos', () => {
  const stats = {
    matches: Number(partnershipAC.shared_matches) || 0,
    wins: Number(partnershipAC.shared_wins) || 0,
    losses: Number(partnershipAC.shared_losses) || 0,
    titles: Number(partnershipAC.shared_titles) || 0,
  };
  console.log(`   [registro] A+C stats iniciais: ${JSON.stringify(stats)}`);
  assert.equal(stats.matches, 0, 'A+C herdou partidas');
  assert.equal(stats.wins, 0, 'A+C herdou vitórias');
  assert.equal(stats.losses, 0, 'A+C herdou derrotas');
  assert.equal(stats.titles, 0, 'A+C herdou títulos');
});

await check('Parte H: A+B segue no histórico DEPOIS de A+C existir', async () => {
  const history = await getPartnershipHistory(profileId);
  const entry = (history || []).find((h) => h.partner_name === partnerBName);
  assert.ok(entry, 'o histórico de A+B desapareceu ao criar A+C');
  assert.equal(Number(entry.shared_matches), AB_SNAPSHOT.shared_matches,
    'as estatísticas de A+B foram alteradas pela nova parceria');
});

await check('Parte H: apenas UMA parceria ativa coexiste', async () => {
  const all = await localGame.entities.Partnership.filter({ profile_id: profileId }).catch(() => []);
  const activeRows = (all || []).filter((p) => p.status === 'ativa');
  console.log(`   [registro] linhas totais=${(all || []).length} ativas=${activeRows.length}`);
  assert.equal(activeRows.length, 1, `${activeRows.length} parcerias ativas`);
});

await vite.close();
finish('test-partnership-history-v518');
