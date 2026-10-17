// CLOUD-6H — testes determinísticos: (A) seleção do simulador == regras do jogo,
// (B) exibição da "Análise do treinador" sem percentual enganoso, (C) caracterização do seeding do jogador.
// Módulos reais de produção via Vite SSR; nenhum arquivo de src/ é alterado por este teste.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import * as act from './lib/v526Actions.mjs';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';

let passed = 0; let failed = 0;
const check = async (label, fn) => { try { await fn(); passed += 1; console.log(`✓ ${label}`); } catch (e) { failed += 1; console.log(`✗ ${label}\n   ${e.message}`); } };
const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
try {
  const entryManager = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const circuit = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const display = await vite.ssrLoadModule('/src/lib/tournamentProjectionDisplay.js');
  const { buildSeededDrawSlots } = await vite.ssrLoadModule('/src/gameplay/worldTour/tournamentSettlement.js');
  const A = { entryManager, circuit };
  const TIERS = Object.keys(circuit.TOURNAMENT_TIER_CONFIG);
  const gameSet = (profile, teamRank) => TIERS.filter((tier) => entryManager.evaluateTournamentEntry({ tier }, entryManager.buildAthleteEntryContext(profile, teamRank, { tier })).eligible);
  const simSet = (profile, teamRank, ind) => { const sel = act.selectionRankFilter(A, profile, teamRank, ind); return TIERS.filter((tier) => sel.allows({ tier })); };
  // estados equivalentes de carreira: (rank individual, rank da dupla) — inclui os casos da 6G
  const STATES = [[600, 600], [437, 462], [443, 443], [380, 380], [700, 300], [250, 900], [901, 901], [120, 640], [1000, 460], [50, 50], [700, 0], [380, 0]];

  await check('A1: tiers oferecidos pelo simulador == tiers elegíveis no jogo para estados equivalentes', () => {
    delete process.env.PL526_LEGACY_INDIVIDUAL_RANK_SELECTION;
    for (const [ind, team] of STATES) {
      const profile = { world_ranking: ind };
      assert.deepEqual(simSet(profile, team, ind), gameSet(profile, team), `ind=${ind} team=${team}`);
    }
  });
  await check('A2: Gold por qualifying é oferecido com rank da dupla 451–900 mesmo com rank individual > 450', () => {
    const profile = { world_ranking: 600 };
    assert.ok(simSet(profile, 600, 600).includes('Gold'));
    assert.ok(simSet(profile, 462, 437).includes('Gold'));
    assert.ok(!simSet(profile, 901, 901).includes('Gold'));
  });
  await check('A3: rank da dupla manda sobre o individual (dupla 300 com individual 700 vê Gold direto)', () => {
    const sel = act.selectionRankFilter(A, { world_ranking: 700 }, 300, 700);
    assert.equal(sel.rank, 300); assert.ok(sel.allows({ tier: 'Gold' }));
  });
  await check('A4: elegibilidade preservada — teto da base continua barrando Silver com dupla ≤ 400', () => {
    assert.ok(!simSet({ world_ranking: 380 }, 380, 380).includes('Silver'));
  });
  await check('A5: sem rank da dupla o simulador recai no individual, como o jogo', () => {
    const sel = act.selectionRankFilter(A, { world_ranking: 700 }, 0, 700);
    assert.equal(sel.rank, 700);
  });
  await check('A6: comportamento histórico só com PL526_LEGACY_INDIVIDUAL_RANK_SELECTION=1 (explícito) e reproduz a divergência da 6G', () => {
    process.env.PL526_LEGACY_INDIVIDUAL_RANK_SELECTION = '1';
    try {
      const profile = { world_ranking: 600 };
      assert.ok(!simSet(profile, 600, 600).includes('Gold'));
      assert.ok(gameSet(profile, 600).includes('Gold'));
      assert.equal(act.selectionRankFilter(A, profile, 300, 700).rank, 700);
    } finally { delete process.env.PL526_LEGACY_INDIVIDUAL_RANK_SELECTION; }
    assert.equal(act.legacyIndividualRankSelection(), false);
  });

  await check('B1: contrato de getTournamentChoiceProfile inalterado (IA/planejamento) — Gold rank 443 = 40', () => {
    const p = circuit.getTournamentChoiceProfile({ tier: 'Gold' }, 443);
    assert.equal(p.titleChance, 40);
    assert.deepEqual(Object.keys(p).sort(), ['expectedNet', 'expectedPoints', 'exposure', 'prestige', 'risk', 'titleChance']);
  });
  await check('B2: a análise do treinador não exibe percentual de título/semifinal e avisa que é projeção por ranking', () => {
    const coach = { titleChance: 40, semifinalChance: 68, expectedNet: -120, expectedPoints: 31, fatigueIncrease: 22 };
    const rows = display.buildCoachAnalysisRows(coach);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    assert.equal(byKey.title, display.UNESTIMATED_CHANCE_LABEL); assert.equal(byKey.semifinal, display.UNESTIMATED_CHANCE_LABEL);
    assert.ok(!rows.some((r) => /%/.test(r.value) && (r.key === 'title' || r.key === 'semifinal')));
    assert.equal(byKey.net, '-120'); assert.equal(byKey.points, '31'); assert.equal(byKey.fatigue, '+22%');
    assert.match(display.RANK_ONLY_PROJECTION_NOTE, /ranking/i); assert.match(display.RANK_ONLY_PROJECTION_NOTE, /advers/i);
    assert.deepEqual(display.buildCoachAnalysisRows(null), []);
  });

  // ── C — seeding do jogador (mundo real semeado; só leitura) ────────────────
  const { rt, profile } = await bootDrawCareer('6h-seeding');
  const W = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const gold = await rt.localGame.entities.Tournament.create({ id: 'g6h-Gold', name: '6H Gold', tier: 'Gold', start_date: profile.career_date, end_date: profile.career_date, status: 'inscricoes', main_draw_size: 24 });
  const build = (playerRank) => W.buildPlayerTournamentField({ tournament: gold, profile, playerRank, playerTeamName: 'Dupla', partnerAthleteId: profile.partner_id || null, qualifyingRoundCount: 0 });
  const f443 = await build(443); const f9999 = await build(9999); const fUnranked = await build(0);
  const rk = (f, id) => (id ? f.rankByPairId.get(id) || 0 : null);

  await check('C1: o campo é de 31 duplas reais com rank real, todas piores que o tamanho da chave (32) → clamp coloca o jogador como nº 1', () => {
    const ranks = f443.entrants.map((p) => f443.rankByPairId.get(p.id) || 0).filter(Boolean);
    assert.ok(ranks.length >= 20, `entrantes ranqueados: ${ranks.length}`);
    assert.ok(Math.min(...ranks) > 32, `menor rank do campo = ${Math.min(...ranks)}`);
  });
  await check('C2: o rank real da dupla não influencia a chave — 443 e 9999 produzem os mesmos adversários (clamp em min(rank, 32))', () => {
    assert.deepEqual(f443.mainOpponentIds, f9999.mainOpponentIds);
  });
  await check('C3: dupla sem ranking (playerRank 0) também vira nº 1 (percentil 0,75 → seed 24 < ranks reais) — chave idêntica', () => {
    assert.deepEqual(fUnranked.mainOpponentIds, f443.mainOpponentIds);
  });
  await check('C4: seeding honesto (rank real 443 no mesmo campo) mudaria o caminho — 1ª rodada passa de pior seed do campo para o melhor', () => {
    const ents = f443.entrants.map((p) => ({ id: p.id, name: p.name || p.id, strength: f443.strengthByPairId.get(p.id) || 0, seedRank: f443.rankByPairId.get(p.id) || 0 }));
    const honest = buildSeededDrawSlots({ entrants: [...ents, { id: '__p__', name: 'Dupla', strength: 0, seedRank: 443, isPlayer: true }], tournamentId: `${gold.id}:player-field` });
    const slot = honest.slots.findIndex((e) => e?.isPlayer);
    const sibling = honest.slots[slot % 2 === 0 ? slot + 1 : slot - 1];
    const currentR1 = rk(f443, f443.mainOpponentIds[0]);
    assert.ok(sibling && sibling.seedRank > 0 && currentR1 > 0);
    // Hoje o nº 1 enfrenta o PIOR seed na 1ª rodada; com rank honesto (443 > todos) o jogador seria o último seed e enfrentaria o MELHOR.
    assert.ok(currentR1 > sibling.seedRank, `R1 atual rank ${currentR1} vs honesto rank ${sibling.seedRank}`);
    console.log(`   R1 atual: rank ${currentR1} | R1 com seeding honesto: rank ${sibling.seedRank}`);
  });
} finally { await vite.close(); }
console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
