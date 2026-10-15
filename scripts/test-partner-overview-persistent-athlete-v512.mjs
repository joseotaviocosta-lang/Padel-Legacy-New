// Playthrough 5.12 (continuação), Partes Q/R/S/U/V — a tela "Minha Dupla"
// (PartnerOverview) precisa ler o AthleteProfile PERSISTIDO, não o template
// estático do catálogo, e mostrar todos os dados do contrato e da parceria.
//
// Testa as FONTES que a tela consome (resolvePartnerOverall, AthleteProfile
// por partner_bot_id, getTeamRank, getWorldRank e os campos da Partnership),
// sem montar React — o que a tela renderiza é derivado desses valores.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-partner-overview-persistent-athlete-v512', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(p) { this.directories.add(p); }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); }
  async copy(s, d) { this.files.set(d, this.files.get(s)); }
  async list(dir = '.') { const p = dir === '.' ? '' : `${dir}/`; return [...this.files.keys()].filter((k) => k.startsWith(p)).map((k) => ({ name: k.slice(p.length), isDirectory: false })); }
  async stat() { return { size: 0 }; }
}

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { formPartnerContract } = await vite.ssrLoadModule('/src/game-core/partnerLifecycle.js');
  const { endPartnership, getActivePartnership } = await vite.ssrLoadModule('/src/lib/partnershipSystem.js');
  const { finalizeTournamentRun } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
  const { getTeamRank } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
  const { getWorldRank } = await vite.ssrLoadModule('/src/lib/padel.js');
  const { resolvePartnerOverall } = await vite.ssrLoadModule('/src/components/partner/PartnerOverview.jsx');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.12 Overview', playerName: 'P512V' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p512v', sport_name: 'P512V', career_date: '2026-03-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 50000, xp: 0, morale: 70, form: 50, energy: 100, rank_points: 600,
  });
  await ensureWorldSeed2025();

  const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
  const { partnership } = await formPartnerContract(profile, bot, { durationDays: 120, prizeSplit: 55, monthlySalary: 800 });

  // O que a tela carrega: AthleteProfile por partner_bot_id.
  const partnerProfile = await localGame.entities.AthleteProfile.get(partnership.partner_bot_id);

  console.log(`parceiro na tela: ${partnerProfile?.name} | id=${partnerProfile?.id}`);
  console.log(`OVR exibido=${resolvePartnerOverall(partnerProfile, partnership.partner_overall)} idade=${partnerProfile?.age}`);

  await check('Parte Q/25: a tela resolve o parceiro por partner_bot_id -> AthleteProfile', () => {
    assert.ok(partnerProfile, 'AthleteProfile não encontrado pelo id da parceria');
    assert.equal(partnerProfile.id, partnership.partner_bot_id);
  });

  await check('Parte S: o OVR exibido vem do AthleteProfile persistido', () => {
    assert.equal(resolvePartnerOverall(partnerProfile, 999), Number(bot.overall_rating),
      'o fallback legado foi usado no lugar do atleta persistido');
  });

  await check('Parte R/21: idade disponível para a tela', () => {
    assert.ok(Number(partnerProfile.age) > 0, `idade=${partnerProfile.age}`);
  });

  await check('Parte R/29: contrato completo disponível', () => {
    assert.equal(partnership.contract_status, 'ativo');
    assert.equal(Number(partnership.monthly_salary), 800);
    assert.equal(Number(partnership.prize_split_pct), 55);
    assert.ok(partnership.contract_started_date && partnership.contract_end_date);
  });

  await check('Parte R/30-32: química, confiança e moral disponíveis', () => {
    assert.ok(Number(partnership.chemistry) > 0, `química=${partnership.chemistry}`);
    assert.ok(Number(partnership.partner_trust) > 0, `confiança=${partnership.partner_trust}`);
    assert.ok(Number(partnership.partner_morale) > 0, `moral=${partnership.partner_morale}`);
  });

  await check('Parte R/27: ranking INDIVIDUAL do parceiro é consultável', async () => {
    const rank = await getWorldRank(partnerProfile).catch(() => null);
    console.log(`   [registro] ranking individual do parceiro: ${JSON.stringify(rank?.rank ?? rank)}`);
    assert.ok(rank !== null && rank !== undefined, 'getWorldRank não resolveu o parceiro');
  });

  // Um torneio para a dupla existir no ranking de duplas.
  const tournament = await localGame.entities.Tournament.create({
    id: 'p512v-cup', name: 'Copa Overview', tier: 'Silver', start_date: '2026-03-01', status: 'em_andamento',
  });
  const fresh = await localGame.entities.PlayerProfile.get('p512v');
  await finalizeTournamentRun({ profile: fresh, tournament, partner: partnerProfile, roundsWon: 2, totalRounds: 3 });

  await check('Parte R: dupla com parceiro recém-materializado herda os pontos do jogador (regra da soma, 5.22-E)', async () => {
    // Playthrough 5.22-E: a fórmula canônica virou SOMA (0 + x = x). Um
    // parceiro ainda sem histórico de circuito NÃO zera mais a dupla — a
    // parceria herda imediatamente os pontos do jogador e exibe posição/pontos
    // reais. O "—" (sem ranking) fica reservado ao caso 0 + 0.
    const after = await localGame.entities.PlayerProfile.get('p512v');
    const rank = await getTeamRank(after, partnerProfile);
    console.log(`   [registro] antes do circuito: #${rank.rank} (${rank.displayRank}) com ${rank.points} pts`);
    assert.equal(rank.unranked, false, 'dupla marcada como sem ranking');
    assert.ok(Number(rank.points) > 0, `dupla sem pontos: ${rank.points}`);
    assert.notEqual(rank.displayRank, '—', 'dupla exibida como sem ranking');
    assert.ok(rank.rank > 0, `sem posição: ${rank.rank}`);
  });

  await check('Parte R/28/33: com o parceiro pontuando no circuito, a dupla ganha posição', async () => {
    // Dá ao parceiro histórico de circuito REAL (resultados datados) e roda
    // a passada do circuito — o caminho de produção.
    const { processWorldCircuit } = await vite.ssrLoadModule('/src/game-core/circuitLifecycle.js');
    for (const [i, points] of [1200, 1800, 2400].entries()) {
      await localGame.entities.AthleteRankingResult.create({
        id: `${partnerProfile.id}:ov-${i}`, athlete_id: partnerProfile.id,
        tournament_id: `ov-${i}`, tournament_name: `Histórico ${i}`, tier: 'Masters',
        date: '2026-02-20', points, finish: 'champion',
      });
    }
    const current = await localGame.entities.PlayerProfile.get('p512v');
    await processWorldCircuit(current, '2026-03-01', '2026-03-08');

    const partnerAfter = await localGame.entities.AthleteProfile.get(partnerProfile.id);
    const playerAfter = await localGame.entities.PlayerProfile.get('p512v');
    const rank = await getTeamRank(playerAfter, partnerAfter);
    console.log(`   [registro] parceiro com ${partnerAfter.world_ranking_points} pts de circuito -> dupla #${rank.rank} com ${rank.points} pts`);
    assert.ok(Number(partnerAfter.world_ranking_points) > 0, 'parceiro não pontuou no circuito');
    assert.ok(Number(rank.points) > 0, 'dupla continuou sem pontos');
    assert.equal(rank.unranked, false, 'dupla marcada como sem ranking');
    assert.ok(rank.rank > 0, 'sem posição');
    const live = (await localGame.entities.Partnership.filter({ id: partnership.id }, null, 1))[0];
    assert.ok(Number(live.shared_matches ?? 0) >= 0);
  });

  await check('Parte U: renovação/expiração apontam para o parceiro materializado', async () => {
    const rows = await localGame.entities.AthleteProfile.filter({ id: partnership.partner_bot_id }, null, 1);
    assert.equal(rows.length, 1, 'renovação não encontraria o parceiro como atleta');
    assert.equal(rows[0].name, partnerProfile.name);
  });

  // ---- separação ----
  await endPartnership(partnership.id, 'encerrada_jogador', 'Fim do teste', '2026-06-01');
  const activeAfter = await getActivePartnership('p512v');
  const survivor = (await localGame.entities.AthleteProfile.filter({ id: partnership.partner_bot_id }, null, 1))[0];

  await check('Parte V/34: após encerrar, não há parceria ativa para a tela mostrar', () => {
    assert.ok(!activeAfter, 'ainda existe parceria ativa');
  });

  await check('Parte V/35: o ex-parceiro continua no mundo', () => {
    assert.ok(survivor, 'atleta foi apagado');
    assert.equal(Number(survivor.overall_rating), Number(bot.overall_rating));
  });

  await check('Parte V/36: nova dupla aparece corretamente para a tela', async () => {
    const bot2 = (BOTS_BY_DIFFICULTY.amador || [])[1];
    const current = await localGame.entities.PlayerProfile.get('p512v');
    const second = await formPartnerContract(current, bot2, { durationDays: 60, prizeSplit: 50, monthlySalary: 400 });
    const newPartner = await localGame.entities.AthleteProfile.get(second.partnership.partner_bot_id);
    assert.ok(newPartner, 'nova parceria sem atleta');
    assert.notEqual(newPartner.id, survivor.id, 'nova dupla reusou o ex-parceiro');
    assert.equal(resolvePartnerOverall(newPartner, 999), Number(bot2.overall_rating));
    console.log(`   [registro] nova dupla: ${newPartner.name} OVR=${newPartner.overall_rating}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-partner-overview-persistent-athlete-v512: PASS');
} finally {
  await vite.close();
}
