// LOCAL-9B-R1 — validação final das decisões D1–D4 sobre o modelo base + equipamento.
//
//   D1 conquistas "Alcance 100": efetivo (base + equipamento, limite 100); descrição diz que o
//      equipamento conta; desbloqueio no fechamento do dia (sem abrir a tela), uma vez, pago uma vez.
//   D2 parceiros e negociação: OVR natural.
//   D3 ranking: pontos decidem; o desempate por OVR usa o mesmo valor de antes da 9B (efetivo);
//      inscrição e entrada não dependem de OVR.
//   D4 migração v21 → v22 por loadCareer, saveCareer e importCareer; idempotente; v22 estável em
//      ciclos de leitura/gravação; backup preservado.
// Carreiras em MEMÓRIA (scripts/lib/v526bTestKit.mjs). Uso: node scripts/test-local-9b-r1-validation.mjs
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
const { bootCareer, reloadCareer } = await import('./lib/v526bTestKit.mjs');

const OUT_DIR = 'reports/local-9b-attribute-equipment-foundation';
const ATTRS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
const pick = (o) => Object.fromEntries(ATTRS.map((k) => [k, Number(o?.[k]) || 0]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let quietDepth = 0; let saved = null;
const quiet = async (fn) => { if (process.env.PL9B_VERBOSE) return fn(); if (quietDepth++ === 0) { saved = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error] = saved; } };
const report = { generatedBy: 'LOCAL-9B-R1 validation', checks: [], sections: {} };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail != null && !ok ? ` ${JSON.stringify(detail)}` : ''}`); };

async function prepare(seed, attrs, extra = {}) {
  const booted = await quiet(() => bootCareer(seed));
  const { rt } = booted; const E = rt.localGame.entities;
  const market = await rt.load('/src/lib/marketEngine.js'); const store = await rt.load('/src/lib/storeCatalog.js');
  const bots = await rt.load('/src/lib/bots.js');
  await quiet(async () => { await market.seedMarket(booted.profile.career_date); await store.ensureExpandedShopCatalog(); });
  const profile = await E.PlayerProfile.update(booted.profile.id, { ...attrs, coins: 5_000_000, energy: 100, fatigue: 0, potential: 80, birth_date: '2004-05-05', play_style: 'equilibrado', partner_id: bots.BOTS_BY_DIFFICULTY.iniciante[0].id, achievements_v2_reconciled: true, weekly_training_enabled: false, ...extra });
  const items = ((await E.ShopItem.list('catalog_order', 2000)) || []).map(store.normalizeShopItem);
  return { ...booted, rt, E, profile, items };
}
async function buy(ctx, item) {
  const p = await ctx.E.PlayerProfile.get(ctx.profile.id);
  const row = await ctx.E.PlayerInventory.create({ profile_id: p.id, item_id: item.id, item_name: item.name, category: item.category, rarity: item.rarity, quantity: 1, equipped: false, acquired_date: p.career_date });
  await ctx.E.PlayerProfile.update(p.id, { coins: (p.coins || 0) - item.price });
  return row;
}
async function toggle(ctx, row) {
  const { toggleEquipItem } = await ctx.rt.load('/src/game-core/equipmentLifecycle.js');
  const inventory = (await ctx.E.PlayerInventory.filter({ profile_id: ctx.profile.id })) || [];
  return toggleEquipItem({ profile: await ctx.E.PlayerProfile.get(ctx.profile.id), inventory, target: inventory.find((r) => r.id === row.id), shopItems: await ctx.E.ShopItem.list() });
}
async function advance(ctx, days) {
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await ctx.rt.load('/src/game-core/dayAdvanceCoordinator.js');
  const { resolveDecision } = await ctx.rt.load('/src/lib/calendarSystem.js');
  let p = await ctx.E.PlayerProfile.get(ctx.profile.id); let errors = 0;
  for (let d = 0; d < days; d += 1) {
    let ok = false;
    for (let a = 0; a < 6 && !ok; a += 1) {
      try { p = await quiet(async () => { const next = await advanceCareerDayOnce(p); await waitForCareerDaySecondaryWork(); return next; }); ok = true; }
      catch { const pending = ((await ctx.E.CalendarEvent.filter({ profile_id: p.id })) || []).find((e) => e.status !== 'completed' && e.status !== 'cancelled' && e.requires_decision); if (!pending) break; await quiet(() => resolveDecision(pending.id, 'skip')); p = await ctx.E.PlayerProfile.get(p.id); }
    }
    if (!ok) { errors += 1; break; }
  }
  return { profile: p, errors };
}

const kit = await import('./lib/v526bTestKit.mjs');
const pure = await kit.bootModules();
try {
  const data = await pure.load('/src/lib/achievementsData.js');
  const EM = await pure.load('/src/lib/equipmentModifiers.js');
  const { migrateCareer } = await pure.load('/src/careers/CareerMigration.js');

  // ── D1: catálogo ───────────────────────────────────────────────────────────
  const maxAttr = data.ACHIEVEMENT_CATALOG.filter((a) => a.trigger_type === 'max_attribute');
  const allMax = data.ACHIEVEMENT_CATALOG.filter((a) => a.trigger_type === 'all_max_attributes');
  check('D1: as 11 conquistas de atributo 100 dizem que o equipamento conta', maxAttr.length === 10 && allMax.length === 1 && [...maxAttr, ...allMax].every((a) => /\(equipamentos contam\)\.$/.test(a.description)));
  check('D1: attribute_key continua derivado da descrição — 10 chaves distintas e corretas', new Set(maxAttr.map((a) => a.attribute_key)).size === 10 && maxAttr.find((a) => a.name === 'Potência Pura')?.attribute_key === 'smash' && maxAttr.find((a) => a.name === 'Coração de Gelo')?.attribute_key === 'emotional_control');
  check('D1: limiar continua 100 (não 98)', [...maxAttr, ...allMax].every((a) => (a.trigger_type === 'all_max_attributes' ? a.threshold === 1 : a.threshold === 100)));

  // ── D1: desbloqueio no ciclo normal, uma vez, pago uma vez ────────────────
  {
    const S = report.sections.achievementUnlock = {};
    const ctx = await prepare('local-9b-r1-ach', { ...Object.fromEntries(ATTRS.map((k) => [k, 60])), smash: 95 });
    const achievement = maxAttr.find((a) => a.attribute_key === 'smash');
    const racket = ctx.items.filter((i) => i.category === 'raquete' && Number(i.attribute_bonus?.smash) >= 5).sort((a, b) => a.price - b.price)[0];
    const paRows = async () => ((await ctx.E.PlayerAchievement.filter({ profile_id: ctx.profile.id })) || []).filter((r) => r.achievement_id === achievement.id);
    const payments = async () => ((await ctx.E.FinancialTransaction.filter({ profile_id: ctx.profile.id })) || []).filter((t) => String(t.source_id || '').startsWith(`pa-${achievement.id}-`));
    const row = await buy(ctx, racket);
    await advance(ctx, 1);
    S.withoutEquip = { unlocked: (await paRows()).length };
    check('D1: base 95 sem equipamento — não desbloqueia (controle)', S.withoutEquip.unlocked === 0);
    await toggle(ctx, row);
    const coinsBefore = (await ctx.E.PlayerProfile.get(ctx.profile.id)).coins;
    const day = await advance(ctx, 1);
    S.afterEquip = { unlocked: (await paRows()).length, payments: (await payments()).length, coinsDelta: (await ctx.E.PlayerProfile.get(ctx.profile.id)).coins - coinsBefore };
    check(`D1: equipado (efetivo ${Math.min(100, 95 + racket.attribute_bonus.smash)}) — desbloqueia no fechamento do dia, sem abrir a tela`, day.errors === 0 && S.afterEquip.unlocked === 1 && S.afterEquip.payments === 1, S.afterEquip);
    await advance(ctx, 2);
    ctx.rt = await quiet(() => reloadCareer(ctx.rt, ctx.storage, ctx.careerId)); ctx.E = ctx.rt.localGame.entities;
    await advance(ctx, 2);
    S.afterMoreDays = { unlocked: (await paRows()).length, payments: (await payments()).length };
    check('D1: mais dias + save/load + mais dias — continua 1 desbloqueio e 1 pagamento', S.afterMoreDays.unlocked === 1 && S.afterMoreDays.payments === 1, S.afterMoreDays);
    const inv = ((await ctx.E.PlayerInventory.filter({ profile_id: ctx.profile.id })) || []).find((r) => r.id === row.id);
    await toggle(ctx, inv);
    await advance(ctx, 2);
    S.afterUnequip = { unlocked: (await paRows()).length, payments: (await payments()).length, base: (await ctx.E.PlayerProfile.get(ctx.profile.id)).smash };
    check('D1: desequipar não revoga a conquista nem paga de novo; base continua 95', S.afterUnequip.unlocked === 1 && S.afterUnequip.payments === 1 && S.afterUnequip.base === 95, S.afterUnequip);
    // D2 na mesma carreira: perfil gravado (natural) com e sem equipamento é o mesmo.
    await toggle(ctx, { ...inv, equipped: false });
    const partnerLifecycle = await ctx.rt.load('/src/game-core/partnerLifecycle.js');
    const negotiation = await ctx.rt.load('/src/game-core/marketNegotiationLifecycle.js');
    const partnership = await ctx.rt.load('/src/lib/partnershipSystem.js');
    const bots = await ctx.rt.load('/src/lib/bots.js');
    const bot = bots.BOTS_BY_DIFFICULTY.avancado?.[0] || bots.BOTS_BY_DIFFICULTY.iniciante[1];
    const stored = await ctx.E.PlayerProfile.get(ctx.profile.id);
    const mods = await (await ctx.rt.load('/src/game-core/equipmentLifecycle.js')).loadEquipmentModifiers(ctx.profile.id);
    const natural = { ...stored }; const effective = EM.applyEquipmentModifiers(stored, { ...mods, strategy: (mods.strategy || 0) + 30, defense: 30 });
    const athlete = { id: 'neg-athlete', overall_rating: 80, expected_salary: 1500 };
    const terms = (p) => JSON.stringify([partnerLifecycle.getSuggestedPartnerTerms(p, bot), negotiation.getNegotiationPreview(p, athlete, null, {}), partnership.computeCompatibility(p, bot, [])]);
    check('D2: termos de parceria, negociação e compatibilidade usam o perfil gravado (natural); equipado = sem equipamento', Object.keys(mods).length > 0 && terms(stored) === terms(natural));
    check('D2: o teste é sensível — com atributos efetivos o resultado mudaria', terms(effective) !== terms(natural));
    await ctx.rt.close();
  }

  // ── D2/D3: quem aplica o modificador (estático) ───────────────────────────
  {
    const allowed = new Set(['src/lib/equipmentModifiers.js', 'src/game-core/equipmentLifecycle.js', 'src/careers/CareerMigration.js', 'src/game-core/practiceMatchSession.js', 'src/components/matches/SimulationModal.jsx', 'src/components/tournaments/TournamentModal.jsx', 'src/lib/achievementEngine.js', 'src/lib/achievementContext.js', 'src/lib/padel.js', 'src/pages/Inventory.jsx', 'src/pages/PlayerProfile.jsx']);
    const { execSync } = await import('node:child_process');
    const users = execSync('git grep -l -E "applyEquipmentModifiers|loadEffectivePlayerProfile|computeEquipmentModifiers|getEffectiveAttributes" -- src', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    const unexpected = users.filter((f) => !allowed.has(f));
    const untracked = ['src/lib/equipmentModifiers.js', 'src/game-core/equipmentLifecycle.js'];
    check('D2/D3: o efetivo só é calculado na partida, na exibição, nas conquistas e no desempate do ranking', unexpected.length === 0, unexpected);
    const src = (p) => readFileSync(p, 'utf8');
    check('D2: parceiros/negociação/compatibilidade não aplicam equipamento', ['src/game-core/partnerLifecycle.js', 'src/game-core/marketNegotiationLifecycle.js', 'src/lib/partnershipSystem.js', 'src/players/teamCompatibility.js', 'src/lib/partnerOffers.js', 'src/game-core/postSeparationMarket.js'].every((f) => !/equipment|Equipment/.test(src(f))));
    check('D3: inscrição, entrada e pontos de ranking não leem OVR do jogador', ['src/lib/tournamentRegistration.js', 'src/gameplay/worldTour/EntryManager.js', 'src/lib/teamRankingFormula.js', 'src/game-core/rankingWindow.js'].every((f) => !/overallRating|baseOverallRating/.test(src(f))));
    report.sections.effectiveUsers = users.concat(untracked.filter((f) => !users.includes(f)));
  }

  // ── D3: desempate do ranking individual = mesmo valor de antes da 9B ──────
  {
    const S = report.sections.rankingTiebreak = {};
    const ctx = await prepare('local-9b-r1-rank', Object.fromEntries(ATTRS.map((k) => [k, 50])));
    const padel = await ctx.rt.load('/src/lib/padel.js');
    const athletes = (await ctx.E.AthleteProfile.list('-world_ranking_points', 1500)) || [];
    const rival = athletes.find((a) => Number(a.world_ranking_points) > 0 && Number(a.overall_rating) >= 55 && Number(a.overall_rating) <= 60 && a.status !== 'retired');
    S.rival = rival ? { points: rival.world_ranking_points, ovr: rival.overall_rating } : null;
    if (!rival) check('D3: rival com pontos e OVR 55–60 encontrado no mundo', false);
    else {
      await ctx.E.PlayerProfile.update(ctx.profile.id, { rank_points: Number(rival.world_ranking_points), world_ranking_points: Number(rival.world_ranking_points), matches_played: 5, tournaments_played: 1 });
      const order = async () => { const snap = await padel.buildWorldRankingSnapshot(await ctx.E.PlayerProfile.get(ctx.profile.id)); const me = snap.entries.find((e) => e.isPlayer); const other = snap.entries.find((e) => e.id === rival.id); return { me: me.rank, rival: other?.rank, shownOvr: me.overallRating, tiebreak: me.tiebreakRating, points: me.points }; };
      S.unequipped = await order();
      const best = ['raquete', 'roupa', 'acessorio', 'mochila', 'colecionavel', 'tenis'].map((c) => ctx.items.filter((i) => i.category === c).sort((a, b) => Object.values(b.attribute_bonus || {}).reduce((s, v) => s + v, 0) - Object.values(a.attribute_bonus || {}).reduce((s, v) => s + v, 0))[0]).filter(Boolean);
      for (const it of best) await toggle(ctx, await buy(ctx, it));
      S.equipped = await order();
      const legacyOrderAbove = S.equipped.tiebreak > Number(rival.overall_rating) || (S.equipped.tiebreak === Number(rival.overall_rating) && String(ctx.profile.id) < String(rival.id));
      check(`D3: empate de pontos — sem equipamento o jogador (OVR ${S.unequipped.shownOvr}) fica abaixo do rival (OVR ${rival.overall_rating})`, S.unequipped.me > S.unequipped.rival, S.unequipped);
      check(`D3: equipado — desempate pelo OVR com equipamento (${S.equipped.tiebreak}), como antes da 9B; OVR exibido continua natural (${S.equipped.shownOvr})`, S.equipped.shownOvr === S.unequipped.shownOvr && (S.equipped.me < S.equipped.rival) === legacyOrderAbove, S.equipped);
      check('D3: pontos do jogador não mudam com equipamento', S.equipped.points === S.unequipped.points);
    }
    await ctx.rt.close();
  }

  // ── D4: migração por loadCareer, saveCareer e importCareer ────────────────
  {
    const S = report.sections.migrationPaths = {};
    const ctx = await prepare('local-9b-r1-mig', { ...Object.fromEntries(ATTRS.map((k) => [k, 70])), smash: 97 });
    const racket = ctx.items.filter((i) => i.category === 'raquete' && Number(i.attribute_bonus?.smash) >= 5).sort((a, b) => a.price - b.price)[0];
    const row = await buy(ctx, racket); await toggle(ctx, row);
    const natural = pick(await ctx.E.PlayerProfile.get(ctx.profile.id));
    const v22 = await ctx.rt.careerManager.exportCareer(ctx.careerId);
    // Save v21 equivalente: bônus gravado no atributo + applied_bonus (modelo antigo), descrição antiga.
    const v21 = JSON.parse(JSON.stringify(v22));
    v21.save_schema_version = 21; delete v21.player.attribute_model_version;
    const applied = {};
    for (const [k, v] of Object.entries(racket.attribute_bonus)) { if (!ATTRS.includes(k)) continue; const after = Math.max(0, Math.min(100, v21.player[k] + v)); applied[k] = after - v21.player[k]; v21.player[k] = after; }
    v21.entities.PlayerInventory = v21.entities.PlayerInventory.map((r) => (r.id === row.id ? { ...r, applied_bonus: applied } : r));
    v21.entities.Achievement = (v21.entities.Achievement || []).map((a) => (a.trigger_type === 'max_attribute' ? { ...a, description: a.description.replace(' (equipamentos contam).', '.') } : a));
    const legacyStored = pick(v21.player);
    const effectiveOf = async (manager, careerId) => {
      ctx.rt.runtime.activeCareerAdapter.setActiveCareer(await manager.loadCareer(careerId));
      const p = await ctx.E.PlayerProfile.get(v22.player.id);
      const mods = await (await ctx.rt.load('/src/game-core/equipmentLifecycle.js')).loadEquipmentModifiers(p.id);
      const ach = ((await ctx.E.Achievement.list()) || []).filter((a) => a.trigger_type === 'max_attribute');
      return { base: pick(p), effective: EM.getEffectiveAttributes(p, mods), equipped: ((await ctx.E.PlayerInventory.filter({ profile_id: p.id })) || []).filter((r) => r.equipped).length, model: p.attribute_model_version, descriptionsUpdated: ach.length === 10 && ach.every((a) => a.description.endsWith('(equipamentos contam).')) };
    };
    const freshManager = async () => { const st = new (await ctx.rt.load('/src/storage/GameStorage.js')).GameStorage(new (await import('./lib/v526CareerSim.mjs')).MemoryStorage(new Map())); const { CareerRepository } = await ctx.rt.load('/src/careers/CareerRepository.js'); const { CareerManager } = await ctx.rt.load('/src/careers/CareerManager.js'); const m = new CareerManager(new CareerRepository(st)); ctx.rt.runtime.activeCareerAdapter.careerManager = m; ctx.rt.runtime.activeCareerAdapter.clearActiveCareer(); return m; };
    const expect = (r) => same(r.base, natural) && r.equipped === 1 && r.model === 2 && r.descriptionsUpdated;
    // importCareer v21
    let m = await freshManager();
    await quiet(() => m.importCareer(JSON.parse(JSON.stringify(v21))));
    S.importV21 = await effectiveOf(m, v22.career_id);
    check('D4: importCareer(v21) → base natural, item equipado, modelo 2, descrições atualizadas', expect(S.importV21), S.importV21);
    // importCareer v22
    m = await freshManager();
    await quiet(() => m.importCareer(JSON.parse(JSON.stringify(v22))));
    S.importV22 = await effectiveOf(m, v22.career_id);
    check('D4: importCareer(v22) → atributos inalterados (nada subtraído)', same(S.importV22.base, natural) && same(S.importV22.effective, S.importV21.effective));
    // saveCareer v21 sobre carreira existente
    await quiet(() => m.saveCareer(v22.career_id, JSON.parse(JSON.stringify(v21))));
    S.saveV21 = await effectiveOf(m, v22.career_id);
    check('D4: saveCareer(v21) → migra antes de validar; base natural', expect(S.saveV21), S.saveV21);
    // saveCareer v22
    await quiet(() => m.saveCareer(v22.career_id, JSON.parse(JSON.stringify(v22))));
    S.saveV22 = await effectiveOf(m, v22.career_id);
    check('D4: saveCareer(v22) → atributos inalterados', same(S.saveV22.base, natural));
    // loadCareer de arquivo v21 gravado direto no storage (leitura do disco) — com backup
    const storage = new (await import('./lib/v526CareerSim.mjs')).MemoryStorage(new Map());
    const { GameStorage } = await ctx.rt.load('/src/storage/GameStorage.js'); const { CareerRepository } = await ctx.rt.load('/src/careers/CareerRepository.js'); const { CareerManager } = await ctx.rt.load('/src/careers/CareerManager.js');
    m = new CareerManager(new CareerRepository(new GameStorage(storage)));
    ctx.rt.runtime.activeCareerAdapter.careerManager = m; ctx.rt.runtime.activeCareerAdapter.clearActiveCareer();
    await quiet(() => m.importCareer(JSON.parse(JSON.stringify(v22))));
    const path = await m.repository.getCareerPath(v22.career_id);
    await storage.writeText(path, JSON.stringify(v21));
    const filesBefore = new Set(storage.files.keys());
    S.loadV21 = await quiet(() => effectiveOf(m, v22.career_id));
    const onDisk = JSON.parse(storage.files.get(path));
    const backups = [...storage.files.keys()].filter((k) => !filesBefore.has(k) || /backup/i.test(k));
    const backupWithV21 = backups.some((k) => { try { const b = JSON.parse(storage.files.get(k)); return b?.save_schema_version === 21 && same(pick(b.player), legacyStored); } catch { return false; } });
    S.loadV21.disk = { version: onDisk.save_schema_version, base: pick(onDisk.player) }; S.loadV21.backups = backups.length;
    check('D4: loadCareer de arquivo v21 → migra, regrava como v22 com a base natural', expect(S.loadV21) && onDisk.save_schema_version === 22 && same(pick(onDisk.player), natural), S.loadV21);
    check('D4: o save v21 original fica preservado em backup (nada apagado)', backupWithV21, { backups });
    // Ciclos de leitura/gravação v22 (5x) e reload: nada subtraído de novo
    const cycles = [];
    for (let i = 0; i < 5; i += 1) {
      const loaded = await m.loadCareer(v22.career_id);
      await quiet(() => m.saveCareer(v22.career_id, loaded));
      cycles.push(pick(JSON.parse(storage.files.get(path)).player));
    }
    check('D4: 5 ciclos loadCareer→saveCareer em v22 — atributos idênticos em todos', cycles.every((c) => same(c, natural)));
    const twice = migrateCareer(migrateCareer(v21).data);
    check('D4: migração repetida não subtrai de novo (migrate(migrate(v21)))', same(pick(twice.data.player), natural) && !twice.migrated);
    const again = migrateCareer(JSON.parse(JSON.stringify(v21)));
    check('D4: determinística (duas migrações do mesmo v21 → mesmo resultado)', JSON.stringify(again.data) === JSON.stringify(migrateCareer(JSON.parse(JSON.stringify(v21))).data));
    let futureError = null; try { await m.saveCareer(v22.career_id, { ...v22, save_schema_version: 23 }); } catch (e) { futureError = e.message; }
    check('D4: versão futura recusada também no saveCareer', /futura|desconhecid/i.test(futureError || ''), futureError);
    S.natural = natural; S.legacyStored = legacyStored;
    await ctx.rt.close();
  }
} finally {
  await pure.close();
}

const failed = report.checks.filter((c) => !c.ok);
report.summary = { checks: report.checks.length, failed: failed.length };
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/r1-validation.json`, JSON.stringify(report, null, 1));
console.log(`\nLOCAL-9B-R1: ${report.checks.length - failed.length}/${report.checks.length} verificações OK`);
process.exit(failed.length ? 1 : 0);
