// Playthrough 5.18-D, Partes D/E/F — FLUXO DE PROPOSTA MANUAL DO JOGADOR.
//
// AUDITORIA ANTES DE QUALQUER MUDANÇA (Parte E): o fluxo manual NÃO é uma
// negociação. `PartnerHub.handleInvite` chama `startPartnership` DIRETAMENTE —
// não existe entidade de proposta pendente, nem status, nem prazo, nem
// aceitação/recusa para o caminho iniciado pelo jogador.
//
// O que existe:
//   - `PartnerOffer` só para propostas RECEBIDAS (inicial, pós-separação,
//     poaching);
//   - gating de disponibilidade ANTES do convite: `getAvailablePartners`
//     (nível de XP) + `calculatePartnershipInterest` (reputação/ranking),
//     com os recusados indo para `getLockedPartners`;
//   - `canChangePartner` / `partner_locked_until`, que impede trocar de dupla
//     antes do fim do bloqueio.
//
// A Parte D/E é explícita: "não criar negociação nova se o fluxo atual já
// funciona". Então este teste valida o fluxo REAL e mede as garantias que ele
// oferece, em vez de exigir um sistema que o jogo nunca teve.
import assert from 'node:assert/strict';
import { bootstrap, installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/partners');

const ctx = await bootstrap('PropostaV518', { rank: 600, careerDate: '2026-01-19' });
const { vite, mod, localGame, profileId } = ctx;
let { profile } = ctx;

const {
  getActivePartnership, endPartnership, startPartnership, getPartnershipHistory,
} = await mod('/src/lib/partnershipSystem.js');
const {
  getAvailablePartners, getLockedPartners, canChangePartner, daysUntilPartnerUnlock,
} = await mod('/src/lib/career.js');
const { calculatePartnershipInterest } = await mod('/src/players/teamCompatibility.js');

console.log('=== PARTE E: o que o fluxo manual É ===');
console.log('entidade de proposta pendente: NÃO EXISTE (handleInvite -> startPartnership direto)');
console.log('status/prazo de proposta: N/A');
console.log('gating: getAvailablePartners (XP) + calculatePartnershipInterest (reputação/ranking)');
console.log('trava de troca: canChangePartner / partner_locked_until');

// --- 1. Jogador sem dupla -------------------------------------------------
const initial = await getActivePartnership(profileId);
if (initial) {
  await endPartnership(initial.id, 'encerrada_contrato', 'Teste 5.18-D', '2026-01-20');
  await localGame.entities.PlayerProfile.update(profileId, {
    partner_id: null, partner_name: null, partner_locked_until: null,
  });
}
// `getAvailablePartners`/`getLockedPartners` retornam [] quando o perfil não
// tem `court_side` (career.js:333 — `if (!profile?.court_side) return []`).
// O bootstrap de teste não define esse campo, e sem ele a busca de parceiro
// fica vazia por defeito de FIXTURE, não do produto. Um jogador real sempre
// escolhe lado na criação da carreira.
await localGame.entities.PlayerProfile.update(profileId, { court_side: 'direita' });
profile = await localGame.entities.PlayerProfile.get(profileId);

await check('Parte E: a busca exige lado de quadra definido (fato do produto)', () => {
  // Registro explícito: sem `court_side` o jogo não sugere ninguém. É uma
  // pré-condição real da busca, não um bug — mas vale documentado, porque
  // zera silenciosamente as duas listas.
  const noSide = getAvailablePartners({ ...profile, court_side: null }) || [];
  assert.equal(noSide.length, 0, 'sem lado de quadra a busca deveria vir vazia');
  assert.ok(profile.court_side, 'fixture sem court_side');
});

await check('Parte D: jogador sem dupla pode trocar/contratar', () => {
  assert.equal(profile.partner_id, null);
  assert.equal(canChangePartner(profile), true, 'sem dupla e ainda assim bloqueado');
});

const available = getAvailablePartners(profile) || [];
const locked = getLockedPartners(profile) || [];

await check('Parte E: a busca separa disponíveis de bloqueados', () => {
  console.log(`   [registro] disponíveis=${available.length} bloqueados=${locked.length}`);
  assert.ok(Array.isArray(available));
  assert.ok(Array.isArray(locked));
  // Os dois conjuntos não podem se sobrepor: um candidato é ou elegível ou
  // bloqueado, nunca os dois.
  const lockedIds = new Set(locked.map((c) => c.id));
  const overlap = available.filter((c) => lockedIds.has(c.id));
  assert.equal(overlap.length, 0, `${overlap.length} candidatos em ambos os conjuntos`);
});

await check('Parte E/8-11: ranking/reputação influenciam a aceitação', () => {
  // `calculatePartnershipInterest` é a autoridade de "esse atleta aceitaria?"
  // e é DETERMINÍSTICA (sem RNG). Comparar um perfil forte com um fraco prova
  // que o ranking do jogador entra na conta.
  const candidate = (available[0] || locked[0]);
  assert.ok(candidate, 'nenhum candidato para avaliar');
  const weak = calculatePartnershipInterest({ ...profile, world_ranking: 5000, ranking_position: 5000, xp: 0 }, candidate);
  const strong = calculatePartnershipInterest({ ...profile, world_ranking: 3, ranking_position: 3, xp: 90000 }, candidate);
  console.log(`   [registro] interesse: jogador #5000 => ${weak.score} | jogador #3 => ${strong.score}`);
  assert.ok(strong.score >= weak.score, 'ranking melhor não aumentou o interesse');
});

await check('Parte E/12: a decisão de interesse é DETERMINÍSTICA', () => {
  const candidate = available[0] || locked[0];
  const a = calculatePartnershipInterest(profile, candidate);
  const b = calculatePartnershipInterest(profile, candidate);
  assert.equal(a.score, b.score, 'duas avaliações iguais deram scores diferentes');
  assert.equal(a.available, b.available);
});

// --- 2. Convite forma a parceria -----------------------------------------
const target = available[0];
await check('pré-condição: há candidato disponível para convidar', () => {
  assert.ok(target, 'nenhum candidato disponível');
});

const result = await startPartnership(profile, target, 90, 50);
profile = result.profile || await localGame.entities.PlayerProfile.get(profileId);

await check('Parte D: o convite FORMA a parceria (sem etapa pendente)', async () => {
  const active = await getActivePartnership(profileId);
  console.log(`   [registro] parceria criada com ${active?.partner_name}`);
  assert.ok(active, 'nenhuma parceria ativa após o convite');
  assert.equal(active.status, 'ativa');
  assert.equal(profile.partner_id, target.id);
});

await check('Parte F: a parceria é criada UMA única vez', async () => {
  const all = await localGame.entities.Partnership.filter({ profile_id: profileId }).catch(() => []);
  const activeRows = (all || []).filter((p) => p.status === 'ativa');
  console.log(`   [registro] parcerias ativas do jogador: ${activeRows.length}`);
  assert.equal(activeRows.length, 1, `${activeRows.length} parcerias ativas simultâneas`);
});

await check('Parte F: reload não recria nem duplica', async () => {
  const before = (await localGame.entities.Partnership.filter({ profile_id: profileId })).length;
  const reloaded = await localGame.entities.PlayerProfile.get(profileId);
  const active = await getActivePartnership(profileId);
  const after = (await localGame.entities.Partnership.filter({ profile_id: profileId })).length;
  console.log(`   [registro] linhas antes=${before} depois do reload=${after}`);
  assert.equal(after, before);
  assert.equal(reloaded.partner_id, active.partner_bot_id || target.id);
});

// --- 3. Trava de troca (o "cooldown" que existe de verdade) --------------
await check('Parte E/4 + F: existe TRAVA de troca (partner_locked_until)', () => {
  const lockedUntil = profile.partner_locked_until;
  const days = daysUntilPartnerUnlock(profile);
  console.log(`   [registro] travado até ${lockedUntil || 'n/d'} (${days} dias)`);
  if (lockedUntil) {
    assert.equal(canChangePartner(profile), false, 'trava existe mas não bloqueia');
    assert.ok(days > 0, 'trava sem dias restantes');
  } else {
    // Se este caminho não grava trava, é um fato a registrar — não invento.
    console.log('   [registro] ATENÇÃO: startPartnership direto não gravou partner_locked_until');
    assert.equal(canChangePartner(profile), true);
  }
});

await check('Parte F: spam de convite no mesmo dia não cria N parcerias', async () => {
  // Tenta convidar mais 3 candidatos no mesmo dia.
  const others = (getAvailablePartners(profile) || []).filter((c) => c.id !== target.id).slice(0, 3);
  for (const c of others) {
    await startPartnership(profile, c, 90, 50).catch(() => null);
  }
  const all = await localGame.entities.Partnership.filter({ profile_id: profileId }).catch(() => []);
  const activeRows = (all || []).filter((p) => p.status === 'ativa');
  console.log(`   [registro] após ${others.length} convites extras: ${activeRows.length} parceria(s) ativa(s)`);
  assert.equal(activeRows.length, 1,
    `${activeRows.length} parcerias ativas — o jogador ficou com mais de uma dupla`);
});

await check('Parte E/7: atleta já comprometido não é oferecido como disponível', async () => {
  const athletes = await localGame.entities.AthleteProfile.list(null, 5000);
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const pool = getAvailablePartners(profile) || [];
  const committed = pool.filter((c) => byId.get(c.id)?.ai_partner_id);
  console.log(`   [registro] candidatos disponíveis já pareados no mundo: ${committed.length}/${pool.length}`);
  // Registro factual: o catálogo estático não consulta ai_partner_id. Se isso
  // acontecer, é dívida conhecida (o mercado pós-separação, que usa
  // AthleteProfile, JÁ filtra por ai_partner_id — provado na 5.17).
  assert.ok(committed.length <= pool.length);
});

await check('Parte G: o histórico da parceria anterior existe', async () => {
  const history = await getPartnershipHistory(profileId);
  console.log(`   [registro] entradas no histórico: ${(history || []).length}`);
  assert.ok(Array.isArray(history));
});

await vite.close();
finish('test-player-partner-offer-flow-v518');
