// LOCAL-9A — prova de impacto dos equipamentos (diagnóstico isolado, somente leitura do jogo).
//
// Carreira real em storage de MEMÓRIA (scripts/lib/v526bTestKit.mjs). Nada de IndexedDB, nada
// de save do usuário, nenhum arquivo de src/ alterado. Fixtures de atributo são gravadas só
// nessa carreira de memória.
//
// Caminho exercitado (o mesmo do jogo):
//   compra+equipar  → scripts/lib/v526Actions.mjs `buyAndEquip` (réplica declarada de Shop.jsx
//                     `buy` + Inventory.jsx `toggleEquip`; a lógica vive dentro dos componentes)
//   desequipar      → réplica do ramo `wasEquipped` de Inventory.jsx `toggleEquip` (abaixo)
//   motor           → createMatch/playPoint reais (@/lib/matchEngine), jogador = {...PlayerProfile}
//                     como TournamentModal.jsx:1064 e practiceMatchSession.js:36 montam
//   treino × teto   → previewTraining + applyAttributeGains reais (trainingSystemV2.js, puras)
//
// Uso: node reports/local-9a-equipment-sponsorship-audit/tools/equipment-impact.mjs [--matches=400]
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootCareer, reloadCareer } from '../../../scripts/lib/v526bTestKit.mjs';
import { buyAndEquip } from '../../../scripts/lib/v526Actions.mjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const MATCHES = Number(arg('matches', 400));
const ATTRS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
const CATS = ['raquete', 'grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'acessorio', 'colecionavel'];
const pick = (o) => Object.fromEntries(ATTRS.map((k) => [k, Number(o?.[k]) || 0]));
const ovr = (o) => Math.round(ATTRS.reduce((s, k) => s + (Number(o[k]) || 0), 0) / ATTRS.length);
const ovrExact = (o) => +(ATTRS.reduce((s, k) => s + (Number(o[k]) || 0), 0) / ATTRS.length).toFixed(2);
const sumBonus = (b) => Object.values(b || {}).reduce((s, v) => s + (Number(v) || 0), 0);

let { rt, storage, careerId, profile } = await bootCareer('local-9a-equipment');
const report = { generatedBy: 'LOCAL-9A equipment-impact', matchesPerScenario: MATCHES, fixtures: {}, checks: [], ceiling: null, callChain: null };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); };

try {
  const market = await rt.load('/src/lib/marketEngine.js');
  const store = await rt.load('/src/lib/storeCatalog.js');
  await market.seedMarket(profile.career_date);
  await store.ensureExpandedShopCatalog();
  let E = rt.localGame.entities;
  const allItems = ((await E.ShopItem.list('catalog_order', 2000)) || []).map(store.normalizeShopItem);
  const best = (filter) => {
    const out = {};
    for (const it of allItems.filter(filter)) {
      const cur = out[it.category];
      const t = sumBonus(it.attribute_bonus);
      if (t > 0 && (!cur || t > cur.t || (t === cur.t && it.price < cur.item.price))) out[it.category] = { item: it, t };
    }
    return CATS.map((c) => out[c]?.item).filter(Boolean);
  };
  const isRelic = (it) => String(it.id).startsWith('historical-relic-');
  const LOADOUTS = {
    A_sem_equipamento: [],
    B_basicos: best((i) => i.rarity === 'comum' && !isRelic(i)),
    C_intermediarios: best((i) => i.rarity === 'epico' && !isRelic(i)),
    D_melhores_catalogo: best((i) => !isRelic(i)),
    D2_melhores_com_reliquias: best(() => true),
  };
  report.loadouts = Object.fromEntries(Object.entries(LOADOUTS).map(([k, l]) => [k, l.map((i) => ({ name: i.name, category: i.category, rarity: i.rarity, price: i.price, bonus: i.attribute_bonus }))]));

  const { createMatch, playPoint } = await rt.load('/src/lib/matchEngine.js');
  const training = await rt.load('/src/lib/trainingSystemV2.js');

  async function unequipAll() {
    // Réplica do ramo "desequipar" de Inventory.jsx toggleEquip: subtrai applied_bonus (ou o bônus declarado).
    const p = await E.PlayerProfile.get(profile.id);
    const inv = (await E.PlayerInventory.filter({ profile_id: profile.id })) || [];
    const shopMap = Object.fromEntries(allItems.map((i) => [i.id, i]));
    const working = { ...p }; const updates = {}; const invUpdates = [];
    for (const it of inv.filter((i) => i.equipped)) {
      const applied = it.applied_bonus || shopMap[it.item_id]?.attribute_bonus || {};
      for (const [k, v] of Object.entries(applied)) { working[k] = Math.max(0, (working[k] || 0) - v); updates[k] = working[k]; }
      if (it.category === 'raquete') updates.racket = '';
      invUpdates.push({ id: it.id, equipped: false, applied_bonus: null });
    }
    if (Object.keys(updates).length) await E.PlayerProfile.update(p.id, updates);
    if (invUpdates.length) await E.PlayerInventory.bulkUpdate(invUpdates);
  }
  async function equipLoadout(items) {
    for (const item of items) {
      const p = await E.PlayerProfile.get(profile.id);
      const inv = (await E.PlayerInventory.filter({ profile_id: profile.id })) || [];
      const owned = inv.find((i) => i.item_id === item.id);
      if (owned) {
        // Já comprado (cenário anterior): réplica do ramo "equipar" de Inventory.jsx toggleEquip,
        // sem nova compra (buyAndEquip sempre cria uma linha nova no inventário).
        const shopMap = Object.fromEntries(allItems.map((i) => [i.id, i]));
        const working = { ...p }; const updates = {}; const invUpdates = [];
        for (const other of inv.filter((i) => i.category === owned.category && i.equipped && i.id !== owned.id)) {
          const applied = other.applied_bonus || shopMap[other.item_id]?.attribute_bonus || {};
          for (const [k, v] of Object.entries(applied)) { working[k] = Math.max(0, (working[k] || 0) - v); updates[k] = working[k]; }
          invUpdates.push({ id: other.id, equipped: false, applied_bonus: null });
        }
        const appliedBonus = {};
        for (const [k, v] of Object.entries(item.attribute_bonus || {})) {
          const before = working[k] || 0; const after = Math.max(0, Math.min(100, before + v));
          working[k] = after; updates[k] = after; appliedBonus[k] = after - before;
        }
        if (item.category === 'raquete') updates.racket = item.name;
        invUpdates.push({ id: owned.id, equipped: true, applied_bonus: appliedBonus });
        if (Object.keys(updates).length) await E.PlayerProfile.update(p.id, updates);
        await E.PlayerInventory.bulkUpdate(invUpdates);
      } else {
        await buyAndEquip(rt, p, { item, price: item.price }, inv);
      }
    }
  }
  function enginePlayer(state) { const pl = state.teams.A[0]; return { overall: pl.overall, attributes: pl.attributes }; }
  async function runMatches(fixtureKey, partner, opponents) {
    const p = await E.PlayerProfile.get(profile.id);
    const forMatch = { ...p, _chemistryBonus: 0 };
    let wins = 0; let pointsA = 0; let pointsTotal = 0; let engine = null; let outcomes = '';
    for (let i = 0; i < MATCHES; i += 1) {
      let s = createMatch([forMatch, partner], opponents, { seed: `local-9a-${fixtureKey}-${i}` });
      if (i === 0) engine = enginePlayer(s);
      let guard = 0;
      while (!s.finished && guard < 3000) { s = playPoint(s); guard += 1; }
      if (s.winner === 'A') wins += 1;
      outcomes += s.winner === 'A' ? '1' : '0';
      const pa = s.stats?.teams?.A?.pointsWon ?? null; const pb = s.stats?.teams?.B?.pointsWon ?? null;
      if (pa != null && pb != null) { pointsA += pa; pointsTotal += pa + pb; }
    }
    return { stored: pick(p), storedOvr: ovr(p), engine, wins, winRate: +(wins / MATCHES).toFixed(4), pointShare: pointsTotal ? +(pointsA / pointsTotal).toFixed(4) : null, outcomes };
  }

  const FIXTURES = { medio_60: 60, elite_85: 85 };
  for (const [fixtureKey, level] of Object.entries(FIXTURES)) {
    await unequipAll();
    const base = Object.fromEntries(ATTRS.map((k) => [k, level]));
    await E.PlayerProfile.update(profile.id, { ...base, coins: 50_000_000, energy: 100, fatigue: 0, morale: 70, confidence: 70 });
    const mk = (id) => ({ id, name: id, ...base, energy: 100, morale: 70 });
    const partner = mk(`9a-partner-${fixtureKey}`);
    const opponents = [mk(`9a-opp1-${fixtureKey}`), mk(`9a-opp2-${fixtureKey}`)];
    const rows = {};
    for (const [scenario, items] of Object.entries(LOADOUTS)) {
      await unequipAll();
      const reverted = pick(await E.PlayerProfile.get(profile.id));
      if (JSON.stringify(reverted) !== JSON.stringify(base)) check(`${fixtureKey}: desequipar tudo devolve exatamente o atributo-base antes de ${scenario}`, false, reverted);
      await equipLoadout(items);
      const expected = Object.fromEntries(ATTRS.map((k) => [k, Math.min(100, level + items.reduce((s, it) => s + (Number(it.attribute_bonus?.[k]) || 0), 0))]));
      const r = await runMatches(fixtureKey, partner, opponents);
      const declared = items.reduce((s, it) => s + sumBonus(it.attribute_bonus), 0);
      rows[scenario] = { items: items.length, declaredBonusTotal: declared, expectedStored: expected, ...r };
      check(`${fixtureKey}/${scenario}: atributo gravado = base + bônus (teto 100)`, JSON.stringify(r.stored) === JSON.stringify(expected), JSON.stringify(r.stored) === JSON.stringify(expected) ? null : { stored: r.stored, expected });
      check(`${fixtureKey}/${scenario}: motor recebe o atributo gravado (normalizePlayer)`, ATTRS.every((k) => (k === 'emotional_control' ? r.engine.attributes.emotional : r.engine.attributes[k]) === r.stored[k]));
      console.log(`  ${fixtureKey}/${scenario}: itens=${items.length} bônus declarado=${declared} OVR gravado=${r.storedOvr} OVR motor=${r.engine.overall} vitórias=${r.wins}/${MATCHES} (${(r.winRate * 100).toFixed(1)}%) pontos=${r.pointShare}`);
    }
    // Comparação pareada contra A (mesma seed por partida): ganhou só com equipamento × perdeu só com equipamento.
    const baseOut = rows.A_sem_equipamento.outcomes;
    for (const [scenario, row] of Object.entries(rows)) {
      let onlyEquip = 0; let onlyBase = 0;
      for (let i = 0; i < MATCHES; i += 1) { if (row.outcomes[i] === '1' && baseOut[i] === '0') onlyEquip += 1; if (row.outcomes[i] === '0' && baseOut[i] === '1') onlyBase += 1; }
      const diff = (onlyEquip - onlyBase) / MATCHES;
      // IC 95% da diferença pareada (aproximação normal de McNemar).
      const se = Math.sqrt(Math.max(0, (onlyEquip + onlyBase) / MATCHES - diff * diff) / MATCHES);
      row.pairedVsA = { onlyEquipWins: onlyEquip, onlyBaseWins: onlyBase, winRateDiff: +diff.toFixed(4), ci95: [+(diff - 1.96 * se).toFixed(4), +(diff + 1.96 * se).toFixed(4)] };
      delete row.outcomes;
      if (scenario !== 'A_sem_equipamento') console.log(`  ${fixtureKey}/${scenario} × A: Δ vitória ${(diff * 100).toFixed(1)} pp (IC95 ${(row.pairedVsA.ci95[0] * 100).toFixed(1)} a ${(row.pairedVsA.ci95[1] * 100).toFixed(1)}) · Δ pontos ${((row.pointShare - rows.A_sem_equipamento.pointShare) * 100).toFixed(2)} pp`);
    }
    report.fixtures[fixtureKey] = { level, rows };
  }

  // Troca: C → D numa categoria, sem acúmulo; duplicado do mesmo item não acumula.
  await unequipAll();
  const lvl = 60; const base = Object.fromEntries(ATTRS.map((k) => [k, lvl]));
  await E.PlayerProfile.update(profile.id, base);
  const racketC = LOADOUTS.C_intermediarios.find((i) => i.category === 'raquete');
  const racketD = LOADOUTS.D_melhores_catalogo.find((i) => i.category === 'raquete');
  await equipLoadout([racketC]);
  await equipLoadout([racketD]);
  const afterSwap = pick(await E.PlayerProfile.get(profile.id));
  const expSwap = Object.fromEntries(ATTRS.map((k) => [k, lvl + (Number(racketD.attribute_bonus?.[k]) || 0)]));
  check('troca de raquete (épica → melhor) remove o bônus antigo e aplica só o novo', JSON.stringify(afterSwap) === JSON.stringify(expSwap), { racketC: racketC.name, racketD: racketD.name });
  const equippedRackets = ((await E.PlayerInventory.filter({ profile_id: profile.id })) || []).filter((i) => i.equipped && i.category === 'raquete');
  check('apenas 1 item equipado por categoria após a troca', equippedRackets.length === 1, { equipped: equippedRackets.length });
  // Duplicado: comprar de novo o mesmo item (Shop.jsx `buy` não bloqueia por si; o botão some na UI) e equipar.
  const pD = await E.PlayerProfile.get(profile.id);
  await buyAndEquip(rt, pD, { item: racketD, price: racketD.price }, (await E.PlayerInventory.filter({ profile_id: profile.id })) || []);
  const afterDup = pick(await E.PlayerProfile.get(profile.id));
  const dupRows = ((await E.PlayerInventory.filter({ profile_id: profile.id })) || []).filter((i) => i.item_id === racketD.id);
  check('item duplicado no inventário não acumula bônus (mesma categoria desequipa a cópia)', JSON.stringify(afterDup) === JSON.stringify(expSwap), { copies: dupRows.length, equippedCopies: dupRows.filter((r) => r.equipped).length });
  report.duplicateCopiesCreated = dupRows.length;

  // Save/load: equipa D completo, recarrega a carreira do storage e compara.
  await unequipAll();
  await E.PlayerProfile.update(profile.id, base);
  await equipLoadout(LOADOUTS.D_melhores_catalogo);
  const beforeReload = { attrs: pick(await E.PlayerProfile.get(profile.id)), inv: ((await E.PlayerInventory.filter({ profile_id: profile.id })) || []).filter((i) => i.equipped).map((i) => ({ item: i.item_id, applied: i.applied_bonus })).sort((a, b) => a.item.localeCompare(b.item)) };
  rt = await reloadCareer(rt, storage, careerId);
  E = rt.localGame.entities;
  const afterReload = { attrs: pick(await E.PlayerProfile.get(profile.id)), inv: ((await E.PlayerInventory.filter({ profile_id: profile.id })) || []).filter((i) => i.equipped).map((i) => ({ item: i.item_id, applied: i.applied_bonus })).sort((a, b) => a.item.localeCompare(b.item)) };
  check('save → load preserva atributos efetivos, itens equipados e applied_bonus', JSON.stringify(beforeReload) === JSON.stringify(afterReload), { equipped: afterReload.inv.length });
  await unequipAll();
  check('após recarregar, desequipar tudo devolve o atributo-base exato', JSON.stringify(pick(await E.PlayerProfile.get(profile.id))) === JSON.stringify(base));

  // Treino × teto de desenvolvimento (funções puras reais). Mesmo atleta, mesma sequência de treinos.
  const activities = ['court', 'physical', 'mental'].flatMap((cat) => training.TRAINING_ACTIVITIES.filter((a) => a.category === cat).slice(0, 2));
  const fullBonus = {};
  for (const it of LOADOUTS.D_melhores_catalogo) for (const [k, v] of Object.entries(it.attribute_bonus || {})) fullBonus[k] = (fullBonus[k] || 0) + v;
  const start = { id: 'ceiling-probe', potential: 80, play_style: 'equilibrado', fatigue: 0, energy: 100, morale: 70, ...Object.fromEntries(ATTRS.map((k) => [k, 40])) };
  const ceilings = Object.fromEntries(ATTRS.map((k) => [k, training.getAttributeDevelopmentCeiling(start, k)]));
  function simulate(p0, sessions, equipAt = null) {
    let p = { ...p0, attribute_progress: {} };
    let applied = {};
    const curve = [];
    for (let s = 0; s <= sessions; s += 1) {
      if (equipAt === s) { applied = {}; for (const [k, v] of Object.entries(fullBonus)) { const after = Math.min(100, p[k] + v); applied[k] = after - p[k]; p[k] = after; } }
      if (s % 250 === 0) curve.push({ session: s, effectiveOvr: ovrExact(p), baseOvr: ovrExact(Object.fromEntries(ATTRS.map((k) => [k, p[k] - (applied[k] || 0)]))), window: training.getDevelopmentWindow(p).multiplier });
      if (s === sessions) break;
      const act = activities[s % activities.length];
      const preview = training.previewTraining(p, act, 'moderado', 0, {});
      const { updates, progress } = training.applyAttributeGains(p, preview.gains);
      p = { ...p, ...updates, attribute_progress: progress };
    }
    const effective = pick(p);
    const baseAttrs = Object.fromEntries(ATTRS.map((k) => [k, effective[k] - (applied[k] || 0)]));
    return { effective, effectiveOvr: ovrExact(effective), base: baseAttrs, baseOvr: ovrExact(baseAttrs), applied, curve };
  }
  const SESSIONS = Number(arg('sessions', 6000));
  const noEquip = simulate(start, SESSIONS, null);
  const equipEarly = simulate(start, SESSIONS, 0);
  const equipLate = simulate(start, SESSIONS, SESSIONS);
  // Medição (não é PASS/FAIL): vantagem efetiva de equipar cedo, por horizonte de treino.
  const horizons = noEquip.curve.map((row, i) => ({
    session: row.session,
    semEquip: row.effectiveOvr,
    equipCedoEfetivo: equipEarly.curve[i].effectiveOvr,
    equipCedoBase: equipEarly.curve[i].baseOvr,
    vantagemEfetiva: +(equipEarly.curve[i].effectiveOvr - row.effectiveOvr).toFixed(2),
    perdaDeDesenvolvimentoBase: +(row.effectiveOvr - equipEarly.curve[i].baseOvr).toFixed(2),
  }));
  report.ceiling = { sessions: SESSIONS, startOvr: ovrExact(start), ceilings, ceilingOvr: ovrExact(ceilings), fullBonus, fullBonusTotal: sumBonus(fullBonus), declaredOvrGain: +(sumBonus(fullBonus) / ATTRS.length).toFixed(2), horizons, noEquip, equipEarly, equipLate };
  for (const h of horizons.filter((x) => x.session % 1000 === 0)) console.log(`  teto/sessão ${h.session}: sem equip ${h.semEquip} · equipado cedo ${h.equipCedoEfetivo} (base ${h.equipCedoBase}) · vantagem ${h.vantagemEfetiva} · base perdida ${h.perdaDeDesenvolvimentoBase}`);
  console.log(`  equipar só ao final (${SESSIONS} sessões): ${noEquip.effectiveOvr} → ${equipLate.effectiveOvr} (bônus declarado ≈ +${report.ceiling.declaredOvrGain} OVR; teto médio ${report.ceiling.ceilingOvr})`);

  report.callChain = [
    'Shop.jsx buy(): PlayerInventory.create(equipped:false) + PlayerProfile.update(coins - preço) + recordFinancialEntry',
    'Inventory.jsx toggleEquip(): desequipa a mesma categoria (subtrai applied_bonus), soma attribute_bonus ao ATRIBUTO-BASE do PlayerProfile com piso 0/teto 100, grava applied_bonus no PlayerInventory',
    'TournamentModal.jsx:1064 playerForMatch = {...profile, _chemistryBonus, _energyPenalty, _coachMatchBonus, _partnerBondBonus} → LiveMatch → createMatch',
    'practiceMatchSession.js:36 playerForMatch = {...profile, ...} → createMatch',
    'engine/match/playerModel.js normalizePlayer(): attributes.<k> = raw.<k>; overall = baseOverallRating(raw) (média dos 10) + química/treinador/vínculo',
    'trainingSystemV2.js applyAttributeGains(): teto aplicado sobre o valor GRAVADO (que já contém o bônus); getDevelopmentWindow usa o mesmo valor',
    'padel.js buildMatchRewardsPatch(): bônus de vitória limitado pelo mesmo teto (headroom = teto - valor gravado)',
  ];
} finally {
  await rt.close();
}
const failed = report.checks.filter((c) => !c.ok).length;
report.summary = { checks: report.checks.length, failed };
writeFileSync(resolve(OUT, 'equipment-impact.json'), JSON.stringify(report, null, 1));
console.log(`\nequipment-impact: ${report.checks.length - failed}/${report.checks.length} verificações OK → ${resolve(OUT, 'equipment-impact.json')}`);
