// LOCAL-9B — atributo-base × modificador de equipamento.
//
// Prova as invariantes do novo modelo (docs/LOCAL_9B_BASE_ATTRIBUTES_EQUIPMENT_MODIFIERS.md):
//   I1 independência do treino   — carreiras gêmeas (mesma seed, mesmas compras); só uma equipa.
//                                  Treino e avanço de dia pelo caminho REAL: atributos-base idênticos.
//   I2 ordem das operações       — treinar→equipar × equipar→treinar: base e efetivo idênticos.
//   I3 reversibilidade           — equipar→desequipar não toca a base; efetivo volta ao anterior.
//   I4 sem duplicação            — equipar repetido, cópia duplicada, dois itens na mesma categoria.
//   I5 persistência              — save→load preserva base, inventário, modificadores e efetivo.
//   I6 determinismo              — mesmas seeds → mesmos resultados (treino, partidas).
//   I7 limites                   — efetivo em [0, 100]; base 98 + 10 → 100; o motor nunca recebe > 100.
//   I8 isolamento de partidas    — trocar equipamento depois não altera partida concluída nem snapshot.
// Mais: treino de 1.000/6.000 sessões (modelo novo × antigo), impacto nas partidas (kits A–D2,
// 400 seeds pareadas), migração do save 21→22 e fluxo de carreira em três estágios.
// Carreiras em MEMÓRIA (scripts/lib/v526bTestKit.mjs). Nada de IndexedDB nem saves do usuário.
// Uso: node scripts/test-local-9b-attribute-equipment-foundation.mjs [--matches=400] [--sessions=6000]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
const { bootCareer, reloadCareer } = await import('./lib/v526bTestKit.mjs');

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const MATCHES = Number(arg('matches', 400));
const SESSIONS = Number(arg('sessions', 6000));
const OUT_DIR = 'reports/local-9b-attribute-equipment-foundation';
const ATTRS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
const CATS = ['raquete', 'grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'acessorio', 'colecionavel'];
const pick = (o) => Object.fromEntries(ATTRS.map((k) => [k, Number(o?.[k]) || 0]));
const ovrExact = (o) => +(ATTRS.reduce((s, k) => s + (Number(o?.[k]) || 0), 0) / ATTRS.length).toFixed(2);
const sumBonus = (b) => Object.values(b || {}).reduce((s, v) => s + (Number(v) || 0), 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let quietDepth = 0; let saved = null;
const quiet = async (fn) => { if (process.env.PL9B_VERBOSE) return fn(); if (quietDepth++ === 0) { saved = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error] = saved; } };

const report = { generatedBy: 'LOCAL-9B attribute-equipment-foundation', matchesPerScenario: MATCHES, sessions: SESSIONS, checks: [], sections: {} };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail != null && !ok ? ` ${JSON.stringify(detail)}` : ''}`); };
const timings = {};
const timed = async (label, fn) => { const t0 = performance.now(); try { return await fn(); } finally { timings[label] = Math.round(performance.now() - t0); } };

// ── Carreira de memória pronta para equipar ─────────────────────────────────
async function prepareCareer(seed, attrs, extra = {}) {
  const booted = await quiet(() => bootCareer(seed));
  const { rt } = booted;
  const E = rt.localGame.entities;
  const market = await rt.load('/src/lib/marketEngine.js');
  const store = await rt.load('/src/lib/storeCatalog.js');
  const bots = await rt.load('/src/lib/bots.js');
  await quiet(async () => { await market.seedMarket(booted.profile.career_date); await store.ensureExpandedShopCatalog(); });
  const partner = bots.BOTS_BY_DIFFICULTY.iniciante[0];
  const profile = await E.PlayerProfile.update(booted.profile.id, {
    ...attrs, coins: 50_000_000, energy: 100, fatigue: 0, morale: 70, confidence: 60, form: 55, potential: 80,
    birth_date: '2004-05-05', play_style: 'equilibrado', partner_id: partner.id, partner_chemistry: 50, weekly_training_enabled: false, ...extra,
  });
  const items = ((await E.ShopItem.list('catalog_order', 2000)) || []).map(store.normalizeShopItem);
  return { ...booted, rt, E, profile, partner, items };
}
function loadoutsFrom(items) {
  const best = (filter) => {
    const out = {};
    for (const it of items.filter(filter)) {
      const cur = out[it.category]; const t = sumBonus(it.attribute_bonus);
      if (t > 0 && (!cur || t > cur.t || (t === cur.t && it.price < cur.item.price))) out[it.category] = { item: it, t };
    }
    return CATS.map((c) => out[c]?.item).filter(Boolean);
  };
  const isRelic = (it) => String(it.id).startsWith('historical-relic-');
  return {
    A_sem_equipamento: [],
    B_basicos: best((i) => i.rarity === 'comum' && !isRelic(i)),
    C_intermediarios: best((i) => i.rarity === 'epico' && !isRelic(i)),
    D_melhores_catalogo: best((i) => !isRelic(i)),
    D2_melhores_com_reliquias: best(() => true),
  };
}
// Compra exatamente como Shop.jsx buy() grava (linha de inventário + débito).
// O id do ShopItem é gerado por carreira: o item do kit é localizado nesta
// carreira pelo nome e categoria (mesmo bônus declarado).
async function buyItem(ctx, kitItem) {
  const item = ctx.items.find((i) => i.name === kitItem.name && i.category === kitItem.category);
  if (!item) throw new Error(`item do kit ausente nesta carreira: ${kitItem.name}`);
  const p = await ctx.E.PlayerProfile.get(ctx.profile.id);
  const inv = await ctx.E.PlayerInventory.create({ profile_id: p.id, item_id: item.id, item_name: item.name, category: item.category, rarity: item.rarity, quantity: 1, equipped: false, acquired_date: p.career_date, current_durability: item.durability || 100, usage_count: 0, purchase_price: item.price });
  await ctx.E.PlayerProfile.update(p.id, { coins: (p.coins || 0) - item.price });
  return inv;
}
async function toggle(ctx, invRow) {
  const { toggleEquipItem } = await ctx.rt.load('/src/game-core/equipmentLifecycle.js');
  const inventory = (await ctx.E.PlayerInventory.filter({ profile_id: ctx.profile.id })) || [];
  const target = inventory.find((r) => r.id === invRow.id) || invRow;
  const shopItems = await ctx.E.ShopItem.list();
  return toggleEquipItem({ profile: await ctx.E.PlayerProfile.get(ctx.profile.id), inventory, target, shopItems });
}
async function equipped(ctx) { return ((await ctx.E.PlayerInventory.filter({ profile_id: ctx.profile.id })) || []).filter((r) => r.equipped).map((r) => r.item_id).sort(); }
async function modifiers(ctx) { return (await ctx.rt.load('/src/game-core/equipmentLifecycle.js')).loadEquipmentModifiers(ctx.profile.id); }
async function effective(ctx) {
  const { applyEquipmentModifiers } = await ctx.rt.load('/src/lib/equipmentModifiers.js');
  return pick(applyEquipmentModifiers(await ctx.E.PlayerProfile.get(ctx.profile.id), await modifiers(ctx)));
}
// N dias de [2 treinos reais + avanço de dia real]. Sem partidas: vitórias dão
// ganho de atributo legítimo e o equipamento muda vitórias.
async function trainDays(ctx, days) {
  const training = await ctx.rt.load('/src/lib/trainingSystemV2.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await ctx.rt.load('/src/game-core/dayAdvanceCoordinator.js');
  const { resolveDecision } = await ctx.rt.load('/src/lib/calendarSystem.js');
  const acts = ['court', 'physical', 'mental', 'tactical'].flatMap((cat) => training.TRAINING_ACTIVITIES.filter((a) => a.category === cat).slice(0, 1));
  let p = await ctx.E.PlayerProfile.get(ctx.profile.id);
  const log = { sessions: 0, errors: [], advanceErrors: 0 };
  for (let d = 0; d < days; d += 1) {
    for (let s = 0; s < 2; s += 1) {
      const act = acts[(d * 2 + s) % acts.length];
      const res = await quiet(() => training.executeTraining(p, act, 'moderado', {}));
      if (res?.error) log.errors.push(res.error); else { log.sessions += 1; p = res.profile || await ctx.E.PlayerProfile.get(p.id); }
    }
    let advanced = false;
    for (let attempt = 0; attempt < 6 && !advanced; attempt += 1) {
      try { p = await quiet(async () => { const next = await advanceCareerDayOnce(p); await waitForCareerDaySecondaryWork(); return next; }); advanced = true; }
      catch {
        const fresh = await ctx.E.PlayerProfile.get(p.id);
        const pending = ((await ctx.E.CalendarEvent.filter({ profile_id: p.id })) || []).filter((e) => e.status !== 'completed' && e.status !== 'cancelled' && e.requires_decision && e.start_date <= fresh.career_date)[0];
        if (!pending) break;
        await quiet(() => resolveDecision(pending.id, 'skip'));
        p = await ctx.E.PlayerProfile.get(p.id);
      }
    }
    if (!advanced) { log.advanceErrors += 1; break; }
  }
  return { ...log, date: p.career_date, base: pick(await ctx.E.PlayerProfile.get(p.id)) };
}

const pure = await (async () => {
  const { bootModules } = await import('./lib/v526bTestKit.mjs');
  return bootModules();
})();
try {
  const EM = await pure.load('/src/lib/equipmentModifiers.js');
  const training = await pure.load('/src/lib/trainingSystemV2.js');
  const { createMatch, playPoint } = await pure.load('/src/lib/matchEngine.js');
  const { normalizePlayer } = await pure.load('/src/engine/match/playerModel.js');
  const { migrateCareer } = await pure.load('/src/careers/CareerMigration.js');
  const schema = await pure.load('/src/careers/careerSchema.js');

  // Catálogo real: uma carreira de memória (ativação real da Loja).
  const catalogCtx = await prepareCareer('local-9b-catalog', Object.fromEntries(ATTRS.map((k) => [k, 40])));
  const LOADOUTS = loadoutsFrom(catalogCtx.items);
  const shopById = new Map(catalogCtx.items.map((i) => [i.id, i]));
  const kitModifiers = (items) => EM.computeEquipmentModifiers(items.map((it, i) => ({ id: `kit-${i}`, item_id: it.id, equipped: true })), shopById);
  report.sections.loadouts = Object.fromEntries(Object.entries(LOADOUTS).map(([k, l]) => [k, { items: l.length, declaredTotal: l.reduce((s, it) => s + sumBonus(it.attribute_bonus), 0), modifiers: kitModifiers(l) }]));
  await catalogCtx.rt.close();

  // ── Modelo puro: limites, aplicação única, plano de equipar ───────────────
  {
    const base98 = Object.fromEntries(ATTRS.map((k) => [k, 98]));
    const eff = EM.applyEquipmentModifiers(base98, { smash: 10, defense: -5 });
    check('I7: base 98 + 10 → 100 (limite do efetivo); bônus negativo reduz só o efetivo', eff.smash === 100 && eff.defense === 93 && base98.smash === 98);
    check('I7: piso 0 no efetivo (bônus negativo sobre base baixa)', EM.applyEquipmentModifiers({ smash: 3 }, { smash: -8 }).smash === 0);
    check('I4: aplicação dupla impedida (perfil já efetivo não recebe o bônus de novo)', EM.applyEquipmentModifiers(eff, { smash: 10 }).smash === 100 && EM.applyEquipmentModifiers(EM.applyEquipmentModifiers({ smash: 50 }, { smash: 5 }), { smash: 5 }).smash === 55);
    const racket = LOADOUTS.D_melhores_catalogo.find((i) => i.category === 'raquete');
    const racket2 = LOADOUTS.C_intermediarios.find((i) => i.category === 'raquete');
    const dupRows = [{ id: 'a', item_id: racket.id, equipped: true }, { id: 'b', item_id: racket.id, equipped: true }, { id: 'a', item_id: racket.id, equipped: true }];
    check('I4: cópia duplicada equipada não acumula (um item por categoria)', same(EM.computeEquipmentModifiers(dupRows, shopById), EM.sanitizeBonus(racket.attribute_bonus)));
    check('I4: duas raquetes equipadas (save inconsistente) → só uma conta, a de menor id', same(EM.computeEquipmentModifiers([{ id: 'z', item_id: racket2.id, equipped: true }, { id: 'y', item_id: racket.id, equipped: true }], shopById), EM.sanitizeBonus(racket.attribute_bonus)));
    check('I4: item não equipado, sem ShopItem ou de categoria fora dos slots não concede bônus', same(EM.computeEquipmentModifiers([{ id: '1', item_id: racket.id, equipped: false }, { id: '2', item_id: 'nao-existe', equipped: true }], shopById), {}) && same(EM.computeEquipmentModifiers([{ id: '3', item_id: 'x', equipped: true }], { x: { id: 'x', category: 'carro', attribute_bonus: { smash: 9 } } }), {}));
    check('I4: chaves de bônus que não são atributo são ignoradas', same(EM.sanitizeBonus({ control: 4, smash: 2, power: 1 }), { smash: 2 }));
    const plan = EM.planEquipToggle({ inventory: [{ id: 'old', item_id: racket2.id, category: 'raquete', equipped: true }], target: { id: 'new', item_id: racket.id, category: 'raquete', item_name: racket.name, equipped: false }, shopItems: shopById });
    check('equipar: plano só muda flags e o nome da raquete — nenhum atributo-base', plan.invUpdates.length === 2 && Object.keys(plan.profileUpdates).every((k) => k === 'racket') && plan.invUpdates.every((u) => u.applied_bonus === null));
  }

  // ── I1/I2 em funções puras: 1.000 e 6.000 sessões, modelo novo × antigo ───
  await timed('training-6000', async () => {
    const kit = kitModifiers(LOADOUTS.D_melhores_catalogo);
    const acts = ['court', 'physical', 'mental'].flatMap((cat) => training.TRAINING_ACTIVITIES.filter((a) => a.category === cat).slice(0, 2));
    const start = { id: 'ceiling-probe', potential: 80, play_style: 'equilibrado', fatigue: 0, energy: 100, morale: 70, ...Object.fromEntries(ATTRS.map((k) => [k, 40])) };
    // Modelo novo: o treino recebe o perfil gravado (base). `equipAt` só muda o efetivo.
    function simulateNew(sessions, equipAt) {
      let p = { ...start, attribute_progress: {} };
      const curve = [];
      for (let s = 0; s <= sessions; s += 1) {
        const mods = equipAt != null && s >= equipAt ? kit : {};
        if (s % 1000 === 0) curve.push({ session: s, baseOvr: ovrExact(p), effectiveOvr: ovrExact(EM.applyEquipmentModifiers(p, mods)), capLoss: +((sumBonus(mods) - EM.totalAppliedModifier(p, mods)) / ATTRS.length).toFixed(2) });
        if (s === sessions) break;
        const preview = training.previewTraining(p, acts[s % acts.length], 'moderado', 0, {});
        const { updates, progress } = training.applyAttributeGains(p, preview.gains);
        p = { ...p, ...updates, attribute_progress: progress };
      }
      return { base: pick(p), curve };
    }
    // Modelo antigo (referência, réplica da 9A): bônus somado no valor gravado.
    function simulateOld(sessions) {
      let p = { ...start, attribute_progress: {} }; const applied = {};
      for (const [k, v] of Object.entries(kit)) { const after = Math.min(100, p[k] + v); applied[k] = after - p[k]; p[k] = after; }
      const curve = [];
      for (let s = 0; s <= sessions; s += 1) {
        if (s % 1000 === 0) curve.push({ session: s, effectiveOvr: ovrExact(p), baseOvr: ovrExact(Object.fromEntries(ATTRS.map((k) => [k, p[k] - (applied[k] || 0)]))) });
        if (s === sessions) break;
        const preview = training.previewTraining(p, acts[s % acts.length], 'moderado', 0, {});
        const { updates, progress } = training.applyAttributeGains(p, preview.gains);
        p = { ...p, ...updates, attribute_progress: progress };
      }
      return { curve };
    }
    const none = simulateNew(SESSIONS, null);
    const early = simulateNew(SESSIONS, 0);
    const late = simulateNew(SESSIONS, SESSIONS);
    const old = simulateOld(SESSIONS);
    const rows = none.curve.map((row, i) => ({
      session: row.session, semEquip: row.baseOvr,
      novo_base: early.curve[i].baseOvr, novo_efetivo: early.curve[i].effectiveOvr, novo_vantagem: +(early.curve[i].effectiveOvr - row.baseOvr).toFixed(2), novo_perdaNoLimite100: early.curve[i].capLoss,
      antigo_base: old.curve[i].baseOvr, antigo_efetivo: old.curve[i].effectiveOvr, antigo_vantagem: +(old.curve[i].effectiveOvr - row.baseOvr).toFixed(2), antigo_basePerdida: +(row.baseOvr - old.curve[i].baseOvr).toFixed(2),
    }));
    report.sections.trainingHorizon = { start: ovrExact(start), kit, kitDeclaredOvr: +(sumBonus(kit) / ATTRS.length).toFixed(2), rows };
    for (const r of rows) console.log(`  sessão ${r.session}: sem equip ${r.semEquip} · NOVO base ${r.novo_base} efetivo ${r.novo_efetivo} (+${r.novo_vantagem}) · ANTIGO base ${r.antigo_base} efetivo ${r.antigo_efetivo} (+${r.antigo_vantagem}, base perdida ${r.antigo_basePerdida})`);
    check(`I1: ${SESSIONS} sessões — base idêntica com e sem equipamento`, same(none.base, early.base));
    check('I2: equipar no início × no fim — base final idêntica e efetivo final idêntico', same(early.base, late.base) && early.curve.at(-1).effectiveOvr === late.curve.at(-1).effectiveOvr);
    // A vantagem só pode diminuir pelo limite de 100 do efetivo (o kit D põe
    // +32 em controle emocional) — nunca pelo treino.
    const declaredOvr = report.sections.trainingHorizon.kitDeclaredOvr;
    const r1000 = rows.find((r) => r.session === 1000); const rLast = rows.at(-1);
    const onlyCapLoss = (r) => Math.abs(r.novo_vantagem - (declaredOvr - r.novo_perdaNoLimite100)) <= 0.06;
    check(`1.000 sessões: base sem perda; vantagem ${r1000?.novo_vantagem} OVR = +${declaredOvr} declarado − ${r1000?.novo_perdaNoLimite100} cortado pelo limite 100 (antes +${r1000?.antigo_vantagem}, base −${r1000?.antigo_basePerdida})`, r1000 && r1000.novo_base === r1000.semEquip && onlyCapLoss(r1000));
    check(`${SESSIONS} sessões: base sem perda; vantagem ${rLast.novo_vantagem} OVR = +${declaredOvr} − ${rLast.novo_perdaNoLimite100} do limite 100 (antes +${rLast.antigo_vantagem}, base −${rLast.antigo_basePerdida})`, rLast.novo_base === rLast.semEquip && onlyCapLoss(rLast));
  });

  // ── Impacto nas partidas (mesmas seeds e adversários; efetivo pelo modelo novo) ─
  await timed('impact', async () => {
    const enginePlayer = (state) => state.teams.A[0];
    async function runMatches(key, playerBase, mods, partner, opponents) {
      const forMatch = { ...EM.applyEquipmentModifiers(playerBase, mods), _chemistryBonus: 0 };
      let wins = 0; let pa = 0; let pt = 0; let engine = null; let outcomes = '';
      for (let i = 0; i < MATCHES; i += 1) {
        let s = createMatch([forMatch, partner], opponents, { seed: `local-9b-${key}-${i}` });
        if (i === 0) engine = { overall: enginePlayer(s).overall, attributes: enginePlayer(s).attributes };
        let guard = 0; while (!s.finished && guard < 3000) { s = playPoint(s); guard += 1; }
        if (s.winner === 'A') wins += 1;
        outcomes += s.winner === 'A' ? '1' : '0';
        const a = s.stats?.teams?.A?.pointsWon; const b = s.stats?.teams?.B?.pointsWon;
        if (a != null && b != null) { pa += a; pt += a + b; }
      }
      return { effectiveOvr: ovrExact(forMatch), engine, winRate: +(wins / MATCHES).toFixed(4), pointShare: pt ? +(pa / pt).toFixed(4) : null, outcomes };
    }
    const fixtures = { medio_60: 60, elite_85: 85, teto_98: 98 };
    report.sections.impact = {};
    for (const [fk, level] of Object.entries(fixtures)) {
      const base = Object.fromEntries(ATTRS.map((k) => [k, level]));
      const mk = (id) => ({ id, name: id, ...Object.fromEntries(ATTRS.map((k) => [k, Math.min(level, 90)])), energy: 100, morale: 70 });
      const partner = mk(`9b-partner-${fk}`); const opponents = [mk(`9b-opp1-${fk}`), mk(`9b-opp2-${fk}`)];
      const rows = {};
      for (const [scenario, items] of Object.entries(LOADOUTS)) {
        const mods = kitModifiers(items);
        const r = await runMatches(`${fk}-${scenario}`, base, mods, partner, opponents);
        const expected = EM.getEffectiveAttributes(base, mods);
        const engineOk = ATTRS.every((k) => (k === 'emotional_control' ? r.engine.attributes.emotional : r.engine.attributes[k]) === expected[k]);
        if (!engineOk || ATTRS.some((k) => expected[k] > 100)) check(`${fk}/${scenario}: motor recebe o efetivo (≤ 100)`, false, { engine: r.engine.attributes, expected });
        rows[scenario] = { declared: sumBonus(mods), ...r };
      }
      check(`${fk}: motor recebe base + modificador, limitado a 100, nos 5 kits`, true);
      const baseOut = rows.A_sem_equipamento.outcomes;
      for (const [scenario, row] of Object.entries(rows)) {
        let onlyEquip = 0; let onlyBase = 0;
        for (let i = 0; i < MATCHES; i += 1) { if (row.outcomes[i] === '1' && baseOut[i] === '0') onlyEquip += 1; if (row.outcomes[i] === '0' && baseOut[i] === '1') onlyBase += 1; }
        const diff = (onlyEquip - onlyBase) / MATCHES;
        const se = Math.sqrt(Math.max(0, (onlyEquip + onlyBase) / MATCHES - diff * diff) / MATCHES);
        row.pairedVsA = { winRateDiff: +diff.toFixed(4), ci95: [+(diff - 1.96 * se).toFixed(4), +(diff + 1.96 * se).toFixed(4)] };
        if (scenario !== 'A_sem_equipamento') console.log(`  ${fk}/${scenario}: OVR efetivo ${row.effectiveOvr} · vitórias ${(row.winRate * 100).toFixed(1)}% · Δ ${(diff * 100).toFixed(1)} pp (IC95 ${(row.pairedVsA.ci95[0] * 100).toFixed(1)} a ${(row.pairedVsA.ci95[1] * 100).toFixed(1)})`);
      }
      // I6: mesma seed → mesmo resultado (reexecuta um cenário).
      const again = await runMatches(`${fk}-D_melhores_catalogo`, base, kitModifiers(LOADOUTS.D_melhores_catalogo), partner, opponents);
      check(`I6: ${fk} — mesmas seeds produzem exatamente os mesmos ${MATCHES} resultados`, again.outcomes === rows.D_melhores_catalogo.outcomes);
      for (const row of Object.values(rows)) delete row.outcomes;
      report.sections.impact[fk] = { level, opponentsLevel: Math.min(level, 90), rows };
    }
    const m60 = report.sections.impact.medio_60.rows;
    check('impacto (médio 60): melhor kit do catálogo e kit com relíquias vencem mais que sem equipamento (pareado)', m60.D_melhores_catalogo.pairedVsA.winRateDiff > 0 && m60.D2_melhores_com_reliquias.pairedVsA.winRateDiff > 0);
    // Depois de treino longo: o kit mantém o efeito (antes ele quase sumia).
    const trained = report.sections.trainingHorizon.rows.at(-1);
    const trainedLevel = Math.round(trained.semEquip);
    const tb = Object.fromEntries(ATTRS.map((k) => [k, trainedLevel]));
    const mk = (id) => ({ id, name: id, ...tb, energy: 100, morale: 70 });
    const p2 = mk('9b-partner-trained'); const o2 = [mk('9b-opp1-trained'), mk('9b-opp2-trained')];
    const tA = await runMatches('trained-A', tb, {}, p2, o2);
    const tD = await runMatches('trained-D', tb, kitModifiers(LOADOUTS.D_melhores_catalogo), p2, o2);
    report.sections.impactAfterTraining = { sessions: SESSIONS, baseLevel: trainedLevel, winRateNoKit: tA.winRate, winRateKitD: tD.winRate, effectiveOvrKitD: tD.effectiveOvr };
    console.log(`  após ${SESSIONS} sessões (base ${trainedLevel}): sem kit ${(tA.winRate * 100).toFixed(1)}% · kit D ${(tD.winRate * 100).toFixed(1)}% (efetivo ${tD.effectiveOvr})`);
    check('impacto após treino prolongado: o kit continua dando vantagem', tD.winRate > tA.winRate);
  });

  // ── Migração do save 21 → 22 ─────────────────────────────────────────────
  {
    const racket = LOADOUTS.D_melhores_catalogo.find((i) => i.category === 'raquete');
    const shoes = LOADOUTS.D_melhores_catalogo.find((i) => i.category === 'tenis');
    const naturalBase = Object.fromEntries(ATTRS.map((k) => [k, 70]));
    naturalBase.smash = 97;
    const stored = { ...naturalBase }; const applied = {};
    for (const [k, v] of Object.entries(racket.attribute_bonus)) { const after = Math.max(0, Math.min(100, stored[k] + v)); applied[k] = after - stored[k]; stored[k] = after; }
    for (const [k, v] of Object.entries(shoes.attribute_bonus)) stored[k] = Math.max(0, Math.min(100, stored[k] + v));
    // Regra da migração (= desequipar antigo): − applied_bonus quando existe;
    // − bônus declarado em linha anterior ao hotfix 15.5.3; piso 0.
    const expectedBase = Object.fromEntries(ATTRS.map((k) => [k, Math.max(0, stored[k] - (applied[k] || 0) - (Number(shoes.attribute_bonus?.[k]) || 0))]));
    const legacy = {
      save_schema_version: 21, career_id: 'legacy-9b', player: { id: 'p1', fatigue: 0, ...stored },
      entities: {
        ShopItem: [racket, shoes],
        PlayerInventory: [
          { id: 'i1', profile_id: 'p1', item_id: racket.id, category: 'raquete', equipped: true, applied_bonus: applied },
          { id: 'i2', profile_id: 'p1', item_id: shoes.id, category: 'tenis', equipped: true },
          { id: 'i3', profile_id: 'p1', item_id: racket.id, category: 'raquete', equipped: false, applied_bonus: null },
        ],
      },
    };
    const before = JSON.stringify(legacy);
    const { data, fromVersion, toVersion } = migrateCareer(legacy);
    check(`migração ${fromVersion}→${toVersion}: schema atual é 22`, toVersion === 22 && schema.CAREER_SAVE_SCHEMA_VERSION === 22 && data.save_schema_version === 22);
    check('migração: base = gravado − applied_bonus (e − bônus declarado em linha sem applied_bonus), piso 0', same(pick(data.player), expectedBase), { got: pick(data.player), want: expectedBase });
    // Só a raquete (com applied_bonus): a base natural volta exata, inclusive no atributo que o teto 100 cortava.
    const racketOnly = migrateCareer({ ...legacy, player: { id: 'p1', fatigue: 0, ...Object.fromEntries(ATTRS.map((k) => [k, Math.min(100, naturalBase[k] + (Number(racket.attribute_bonus?.[k]) || 0))])) }, entities: { ShopItem: [racket], PlayerInventory: [legacy.entities.PlayerInventory[0]] } }).data;
    check('migração: com applied_bonus a base natural volta exata (smash 97 coberto pelo teto 100)', same(pick(racketOnly.player), naturalBase), { got: pick(racketOnly.player), want: naturalBase });
    check('migração: itens continuam equipados e applied_bonus é zerado', data.entities.PlayerInventory.filter((r) => r.equipped).length === 2 && data.entities.PlayerInventory.every((r) => r.applied_bonus == null));
    check('migração: entrada não é mutada; marca attribute_model_version = 2', JSON.stringify(legacy) === before && data.player.attribute_model_version === 2);
    const again = migrateCareer(data);
    check('migração: idempotente (save 22 não é migrado de novo)', !again.migrated && same(pick(again.data.player), expectedBase));
    let futureError = null; try { migrateCareer({ ...data, save_schema_version: 23 }); } catch (error) { futureError = error.message; }
    check('save de versão futura é recusado explicitamente (não carrega em silêncio)', /futura/i.test(futureError || ''));
    // Fixture real (v21, sem item equipado): base inalterada.
    const fixture = JSON.parse(readFileSync('reports/ui-redesign-532/fixtures/t5-com-dupla.json', 'utf8'));
    const migrated = migrateCareer(fixture).data;
    check(`fixture real t5 (v${fixture.save_schema_version}, ${(fixture.entities.PlayerInventory || []).filter((r) => r.equipped).length} item(ns) equipado(s)) migra sem alterar atributos indevidamente`, (fixture.entities.PlayerInventory || []).some((r) => r.equipped) || same(pick(migrated.player), pick(fixture.player)));
    report.sections.migration = { naturalBase: pick(naturalBase), storedLegacy: pick(stored), migratedBase: pick(data.player), migrationNote: data.player.attribute_model_migration };
  }

  // ── I1 com o caminho real: carreiras gêmeas ──────────────────────────────
  await timed('twins', async () => {
    const DAYS = 20;
    const kit = LOADOUTS.D_melhores_catalogo;
    const runTwin = async (equip) => {
      const ctx = await prepareCareer('local-9b-twin', Object.fromEntries(ATTRS.map((k) => [k, 40])));
      const rows = []; for (const it of kit) rows.push(await buyItem(ctx, it));
      const baseBefore = pick(await ctx.E.PlayerProfile.get(ctx.profile.id));
      if (equip) for (const r of rows) await toggle(ctx, r);
      const baseAfterEquip = pick(await ctx.E.PlayerProfile.get(ctx.profile.id));
      const result = await trainDays(ctx, DAYS);
      const eff = await effective(ctx);
      await ctx.rt.close();
      return { baseBefore, baseAfterEquip, ...result, effective: eff };
    };
    const A = await runTwin(false);
    const B = await runTwin(true);
    report.sections.twins = { days: DAYS, A: { sessions: A.sessions, date: A.date, baseOvr: ovrExact(A.base), effectiveOvr: ovrExact(A.effective), errors: A.errors.slice(0, 3) }, B: { sessions: B.sessions, date: B.date, baseOvr: ovrExact(B.base), effectiveOvr: ovrExact(B.effective), errors: B.errors.slice(0, 3) } };
    console.log(`  gêmeas: ${A.sessions}/${B.sessions} sessões até ${A.date} · base ${ovrExact(A.base)} × ${ovrExact(B.base)} · efetivo ${ovrExact(A.effective)} × ${ovrExact(B.effective)}`);
    check('I3/equipar: equipar 9 itens pelo fluxo real não altera nenhum atributo-base', same(B.baseBefore, B.baseAfterEquip));
    check(`I1: carreiras gêmeas, ${A.sessions} treinos reais + ${DAYS} avanços de dia — atributos-base idênticos com e sem equipamento`, A.sessions > 0 && A.sessions === B.sessions && same(A.base, B.base) && A.date === B.date, { A: A.base, B: B.base });
    check('I1: o treino real desenvolveu a base (não é um teste vazio)', ovrExact(A.base) > ovrExact(A.baseBefore));
    check('I1: efetivo = base + kit na carreira equipada; igual à base na outra', same(A.effective, A.base) && same(B.effective, EM.getEffectiveAttributes(B.base, kitModifiers(kit))));
    // I6: a mesma gêmea de novo produz o mesmo resultado.
    const B2 = await runTwin(true);
    check('I6: mesma seed e mesmas ações → mesmo resultado de carreira (base, efetivo, data)', same(B2.base, B.base) && same(B2.effective, B.effective) && B2.date === B.date);
  });

  // ── I2 com o caminho real: treinar→equipar × equipar→treinar ────────────
  await timed('order', async () => {
    const kit = LOADOUTS.C_intermediarios;
    const run = async (equipFirst) => {
      const ctx = await prepareCareer('local-9b-order', Object.fromEntries(ATTRS.map((k) => [k, 45])));
      const rows = []; for (const it of kit) rows.push(await buyItem(ctx, it));
      if (equipFirst) for (const r of rows) await toggle(ctx, r);
      await trainDays(ctx, 8);
      if (!equipFirst) for (const r of rows) await toggle(ctx, r);
      const out = { base: pick(await ctx.E.PlayerProfile.get(ctx.profile.id)), effective: await effective(ctx), equipped: await equipped(ctx) };
      await ctx.rt.close();
      return out;
    };
    const first = await run(true); const later = await run(false);
    check('I2 (caminho real): equipar→treinar × treinar→equipar — base, efetivo e itens equipados idênticos', same(first, later), { first: first.base, later: later.base });
  });

  // ── Fluxo de carreira em três estágios + I3, I4, I5, I8 ──────────────────
  await timed('career-flow', async () => {
    report.sections.careerFlow = {};
    const ceilingProbe = { potential: 80, play_style: 'equilibrado' };
    const nearCeiling = Object.fromEntries(ATTRS.map((k) => [k, training.getAttributeDevelopmentCeiling(ceilingProbe, k) - 1]));
    const stages = {
      iniciante: Object.fromEntries(ATTRS.map((k) => [k, 22])),
      intermediario: Object.fromEntries(ATTRS.map((k) => [k, 55])),
      proximo_ao_teto: nearCeiling,
    };
    for (const [stage, attrs] of Object.entries(stages)) {
      const S = report.sections.careerFlow[stage] = {};
      let ctx = await prepareCareer(`local-9b-flow-${stage}`, attrs);
      const startBase = pick(await ctx.E.PlayerProfile.get(ctx.profile.id));
      // Compra → inventário → equipar
      const kitC = LOADOUTS.C_intermediarios; const kitD = LOADOUTS.D_melhores_catalogo;
      const rowsC = []; for (const it of kitC) rowsC.push(await buyItem(ctx, it));
      check(`${stage}: comprar não altera a base`, same(pick(await ctx.E.PlayerProfile.get(ctx.profile.id)), startBase));
      for (const r of rowsC) await toggle(ctx, r);
      check(`${stage}: equipar kit épico não altera a base; efetivo = base + kit`, same(pick(await ctx.E.PlayerProfile.get(ctx.profile.id)), startBase) && same(await effective(ctx), EM.getEffectiveAttributes(startBase, kitModifiers(kitC))));
      // I4: equipar o mesmo item de novo (dois toggles = desequipa e equipa) e cópia duplicada.
      const racketRow = rowsC.find((r) => r.category === 'raquete');
      await toggle(ctx, racketRow); await toggle(ctx, racketRow);
      const dup = await buyItem(ctx, kitC.find((i) => i.category === 'raquete'));
      await toggle(ctx, dup);
      const modsAfterDup = await modifiers(ctx);
      check(`${stage}: I4 — reequipar e equipar cópia duplicada não acumulam bônus`, same(modsAfterDup, kitModifiers(kitC)) && (await equipped(ctx)).length === kitC.length);
      // Treino real equipado: ganho igual ao previsto pela base (o equipamento não entra).
      const pBefore = await ctx.E.PlayerProfile.get(ctx.profile.id);
      const trainingMod = await ctx.rt.load('/src/lib/trainingSystemV2.js');
      const act = trainingMod.TRAINING_ACTIVITIES.find((a) => a.category === 'court');
      const preview = trainingMod.previewTraining(pBefore, act, 'moderado', 0, {});
      const expectedApply = trainingMod.applyAttributeGains(pBefore, preview.gains);
      const res = await quiet(() => trainingMod.executeTraining(pBefore, act, 'moderado', {}));
      const after = await ctx.E.PlayerProfile.get(ctx.profile.id);
      check(`${stage}: treino real equipado aplica exatamente o ganho calculado sobre a base`, !res?.error && ATTRS.every((k) => (expectedApply.updates[k] ?? pBefore[k]) === after[k]), res?.error || { expected: expectedApply.updates, got: pick(after) });
      // Avanço diário + partida treino (motor recebe o efetivo)
      const flow = await trainDays(ctx, 2);
      const { preparePracticeMatchSession } = await ctx.rt.load('/src/game-core/practiceMatchSession.js');
      const { finalizePracticeMatch } = await ctx.rt.load('/src/game-core/matchLifecycle.js');
      const { createMatch: cm, playPoint: pp } = await ctx.rt.load('/src/lib/matchEngine.js');
      let profileNow = await ctx.E.PlayerProfile.update(ctx.profile.id, { energy: 100, fatigue: 0 });
      const modsNow = await modifiers(ctx);
      const session = preparePracticeMatchSession(profileNow, null, { equipmentModifiers: modsNow });
      let state = cm(session.teamA, session.teamB, { seed: `local-9b-flow-${stage}` });
      const snapshot = JSON.stringify(state.teams.A[0].attributes);
      const expectedEff = EM.getEffectiveAttributes(profileNow, modsNow);
      check(`${stage}: partida treino — motor recebe o efetivo (base + equipamento)`, ATTRS.every((k) => (k === 'emotional_control' ? state.teams.A[0].attributes.emotional : state.teams.A[0].attributes[k]) === expectedEff[k]));
      let guard = 0; while (!state.finished && guard < 3000) { state = pp(state); guard += 1; }
      const fin = await quiet(() => finalizePracticeMatch({ profile: profileNow, matchState: state, partnerName: session.partner.name, opponents: session.opponents.map((o) => o.name) }));
      await quiet(() => fin?.secondary);
      const matchesBefore = JSON.stringify(((await ctx.E.Match.list('-created_date', 50)) || []).map((m) => ({ id: m.id, result: m.result, score: m.score })));
      // Save/load (I5)
      const beforeReload = { base: pick(await ctx.E.PlayerProfile.get(ctx.profile.id)), equipped: await equipped(ctx), mods: await modifiers(ctx), eff: await effective(ctx) };
      ctx.rt = await quiet(() => reloadCareer(ctx.rt, ctx.storage, ctx.careerId)); ctx.E = ctx.rt.localGame.entities;
      const afterReload = { base: pick(await ctx.E.PlayerProfile.get(ctx.profile.id)), equipped: await equipped(ctx), mods: await modifiers(ctx), eff: await effective(ctx) };
      check(`${stage}: I5 — save→load preserva base, itens equipados, modificadores e efetivo`, same(beforeReload, afterReload));
      // Troca de equipamento (C → D) e I8
      const baseBeforeSwap = afterReload.base;
      const rowsD = []; for (const it of kitD) rowsD.push(await buyItem(ctx, it));
      for (const r of rowsD) await toggle(ctx, r);
      const matchesAfter = JSON.stringify(((await ctx.E.Match.list('-created_date', 50)) || []).map((m) => ({ id: m.id, result: m.result, score: m.score })));
      check(`${stage}: troca para o melhor kit não altera a base; modificador = kit D`, same(pick(await ctx.E.PlayerProfile.get(ctx.profile.id)), baseBeforeSwap) && same(await modifiers(ctx), kitModifiers(kitD)));
      check(`${stage}: I8 — trocar equipamento não altera a partida concluída nem o snapshot do motor`, matchesBefore === matchesAfter && JSON.stringify(state.teams.A[0].attributes) === snapshot);
      // I3: desequipar tudo → base intacta, efetivo = base
      for (const r of ((await ctx.E.PlayerInventory.filter({ profile_id: ctx.profile.id })) || []).filter((x) => x.equipped)) await toggle(ctx, r);
      const finalBase = pick(await ctx.E.PlayerProfile.get(ctx.profile.id));
      check(`${stage}: I3 — desequipar tudo deixa a base intacta e o efetivo volta à base`, same(finalBase, baseBeforeSwap) && same(await effective(ctx), finalBase));
      // Continuação
      const cont = await trainDays(ctx, 2);
      check(`${stage}: carreira continua (treino e avanço de dia) depois de tudo`, cont.advanceErrors === 0 && cont.sessions > 0);
      const endProfile = await ctx.E.PlayerProfile.get(ctx.profile.id);
      const ceilings = Object.fromEntries(ATTRS.map((k) => [k, training.getAttributeDevelopmentCeiling(endProfile, k)]));
      const endBase = pick(endProfile);
      check(`${stage}: I7 — base nunca passa do teto natural nem de 100`, ATTRS.every((k) => endBase[k] <= Math.max(ceilings[k], startBase[k]) && endBase[k] <= 100));
      S.result = { startOvr: ovrExact(startBase), endBaseOvr: ovrExact(endBase), daysTrained: flow.sessions + cont.sessions, matchWinner: state.winner, finalizeSkipped: Boolean(fin?.skipped) };
      await ctx.rt.close();
    }
  });

  // ── Integração estática: telas e harness usam a fonte canônica ───────────
  {
    const src = (p) => readFileSync(p, 'utf8');
    check('Inventory.jsx não grava atributo no equipar (usa toggleEquipItem)', src('src/pages/Inventory.jsx').includes('toggleEquipItem') && !src('src/pages/Inventory.jsx').includes('applyToProfile'));
    check('TournamentModal monta o jogador com applyEquipmentModifiers e só começa depois de carregar o equipamento', /\.\.\.effectiveProfile/.test(src('src/components/tournaments/TournamentModal.jsx')) && src('src/components/tournaments/TournamentModal.jsx').includes('equipmentModifiers === null'));
    check('SimulationModal/practiceMatchSession aplicam o modificador só no jogador da partida', src('src/game-core/practiceMatchSession.js').includes('applyEquipmentModifiers(profile, equipmentModifiers)') && src('src/components/matches/SimulationModal.jsx').includes('equipmentModifiers === null'));
    check('treino e teto continuam lendo o perfil gravado (base) — sem modificador', !/equipment/i.test(src('src/lib/trainingSystemV2.js')) && !/equipment/i.test(src('src/lib/attributeCeiling.js')));
  }
} finally {
  await pure.close();
}

report.timingsMs = timings;
const failed = report.checks.filter((c) => !c.ok);
report.summary = { checks: report.checks.length, failed: failed.length };
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/${process.env.PL9B_LABEL || 'results'}.json`, JSON.stringify(report, null, 1));
console.log(`\nLOCAL-9B: ${report.checks.length - failed.length}/${report.checks.length} verificações OK · tempos ${JSON.stringify(timings)}`);
process.exit(failed.length ? 1 : 0);
