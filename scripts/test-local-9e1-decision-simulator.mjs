// LOCAL-9E.1 — testes do simulador de decisões (políticas + driver).
//
// 1. Políticas puras: orçamento, ROI de equipamento pela fonte canônica da
//    9B (com o limite de 100), patrocínio, renovação, treinador, staff,
//    torneio, investimento; determinismo e diferenças entre perfis.
// 2. Driver real (processo separado, 14 dias): mesma seed + mesmo perfil →
//    mesmo hash; os três perfis partem do MESMO estado (pareamento); zero
//    erros e zero violações de integridade; save/load idêntico.
// 3. Sonda (só leitura de regra existente): renovar patrocínio fora da janela.
//
// Uso: node scripts/test-local-9e1-decision-simulator.mjs [--skipDriver]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as P from './lib/local9e1Policies.mjs';
import { MemoryStorage, bootRuntime, createRealCareer, installDeterminism } from './lib/v526CareerSim.mjs';

const results = [];
const check = (name, ok, detail = null) => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${ok || detail == null ? '' : ` · ${JSON.stringify(detail).slice(0, 300)}`}`); };
const SKIP_DRIVER = process.argv.includes('--skipDriver');

// ── Fonte canônica da 9B carregada pelo Vite (mesmo módulo do jogo) ─────────
installDeterminism('9e1-tests');
const storage = new MemoryStorage();
const rt = await bootRuntime(storage);
const eq = await rt.load('/src/lib/equipmentModifiers.js');

// ── 1. Políticas puras ─────────────────────────────────────────────────────
{
  check('três perfis definidos', P.PROFILE_IDS.every((id) => P.getPolicy(id).id === id));
  let threw = false; try { P.getPolicy('casual'); } catch { threw = true; }
  check('perfil desconhecido é recusado', threw);

  const b = P.planBudget({ coins: 2000, fixedMonthly: 300 }, P.getPolicy('economico'));
  check('orçamento econômico: reserva = 4 meses de folha', b.reserve === 1200 && b.free === 800, b);
  const bc = P.planBudget({ coins: 2000, fixedMonthly: 300 }, P.getPolicy('competitivo'));
  check('orçamento competitivo: reserva menor, caixa livre maior', bc.reserve === 300 && bc.free > b.free, bc);
  check('orçamento: piso de reserva sem folha', P.planBudget({ coins: 100, fixedMonthly: 0 }, P.getPolicy('economico')).free === 0);

  // Equipamento: ganho real = pontos efetivos (pós-limite) — fonte da 9B.
  const shopItems = [
    { id: 'r1', category: 'raquete', attribute_bonus: { smash: 2 } },
    { id: 'r2', category: 'raquete', attribute_bonus: { smash: 5 } },
    { id: 'b1', category: 'bola', attribute_bonus: { serve: 1 } },
    { id: 'c1', category: 'colecionavel', attribute_bonus: { smash: 10 } },
  ];
  const profile = { serve: 40, forehand: 40, backhand: 40, volley: 40, bandeja: 40, smash: 97, defense: 40, agility: 40, strategy: 40, emotional_control: 40 };
  const inventory = [{ id: 'inv-r1', item_id: 'r1', equipped: true }];
  check('ganho de trocar raquete +2 por +5 com base 97 = +1 (limite 100)', P.equipmentGain({ profile, inventory, shopItems, item: shopItems[1] }, eq) === 1);
  check('ganho de um slot vazio = bônus inteiro', P.equipmentGain({ profile, inventory, shopItems, item: shopItems[2] }, eq) === 1);
  check('ganho de item que só soma em atributo no limite = 0', P.equipmentGain({ profile: { ...profile, smash: 100 }, inventory: [], shopItems, item: shopItems[3] }, eq) === 0);
  check('ganho não depende de item duplicado no inventário', P.equipmentGain({ profile, inventory: [...inventory, { id: 'inv-r1b', item_id: 'r1', equipped: true }], shopItems, item: shopItems[1] }, eq) === 1);

  const rows = [
    { item: shopItems[1], price: 1000, unlocked: true, available: true, owned: false, bonusTotal: 5 },
    { item: shopItems[2], price: 50, unlocked: true, available: true, owned: false, bonusTotal: 1 },
    // Acima do teto do econômico (20% de 2.000), dentro do competitivo (80%).
    { item: shopItems[3], price: 1500, unlocked: true, available: true, owned: false, bonusTotal: 10 },
    { item: { id: 'x', category: 'grip', attribute_bonus: { volley: 3 } }, price: 60, unlocked: false, available: true, owned: false, bonusTotal: 3 },
  ];
  const lowBase = { ...profile, smash: 40 };
  const budget = { free: 2000 };
  const pe = P.pickEquipmentPurchase({ rows, profile: lowBase, inventory, shopItems, budget }, P.getPolicy('economico'), eq);
  const pc = P.pickEquipmentPurchase({ rows, profile: lowBase, inventory, shopItems, budget }, P.getPolicy('competitivo'), eq);
  check('econômico escolhe o maior ROI (bola +1 por 50)', pe?.row.item.id === 'b1', pe && { id: pe.row.item.id, roi: pe.roi });
  check('competitivo escolhe o maior ganho que cabe no caixa (colecionável +10)', pc?.row.item.id === 'c1', pc && { id: pc.row.item.id, gain: pc.gain });
  check('item bloqueado nunca é escolhido', ![pe, pc].some((x) => x?.row.item.id === 'x'));
  check('sem caixa livre não compra', P.pickEquipmentPurchase({ rows, profile: lowBase, inventory, shopItems, budget: { free: 0 } }, P.getPolicy('competitivo'), eq) === null);
  check('não compra item sem ganho efetivo (base no limite)', P.pickEquipmentPurchase({ rows: [rows[2]], profile: { ...profile, smash: 100 }, inventory: [], shopItems, budget }, P.getPolicy('competitivo'), eq) === null);

  // Patrocínio.
  const offers = [
    { sponsor: { id: 'a', tier: 'Bronze' }, offer: { sign_bonus: 100, monthly_salary: 200, duration_months: 12 } },
    { sponsor: { id: 'b', tier: 'Prata' }, offer: { sign_bonus: 300, monthly_salary: 250, duration_months: 4 } },
  ];
  check('econômico ordena pelo valor total do contrato', P.rankSponsorOffers(offers, P.getPolicy('economico'))[0].sponsor.id === 'a');
  check('competitivo ordena pelo tier', P.rankSponsorOffers(offers, P.getPolicy('competitivo'))[0].sponsor.id === 'b');
  const pol = P.getPolicy('equilibrado');
  check('renovação: fora da janela não renova', !P.shouldRenewSponsor({ contract: { is_renewable: true }, daysLeft: 90 }, pol).renew);
  check('renovação: dentro da janela renova', P.shouldRenewSponsor({ contract: { is_renewable: true }, daysLeft: 20 }, pol).renew);
  check('renovação: contrato não renovável', !P.shouldRenewSponsor({ contract: { is_renewable: false }, daysLeft: 5 }, pol).renew);
  check('renovação competitiva cede a um tier melhor no slot', !P.shouldRenewSponsor({ contract: { is_renewable: true }, daysLeft: 5, betterTierInSlot: true }, P.getPolicy('competitivo')).renew);

  // Treinador e staff.
  const coaches = [
    { coach: { id: 'c-a', overall: 60 }, salary: 300, signing: 100 },
    { coach: { id: 'c-b', overall: 75 }, salary: 900, signing: 300 },
  ];
  check('econômico: treinador só com salário ≤ 20% da receita', P.pickCoach({ coaches, currentOverall: null, recurringIncome: 1500, coins: 5000 }, P.getPolicy('economico'))?.coach.id === 'c-a');
  check('competitivo: melhor treinador sustentável', P.pickCoach({ coaches, currentOverall: null, recurringIncome: 1500, coins: 5000 }, P.getPolicy('competitivo'))?.coach.id === 'c-b');
  check('sem receita recorrente não contrata treinador', P.pickCoach({ coaches, currentOverall: null, recurringIncome: 0, coins: 99999 }, P.getPolicy('competitivo')) === null);
  check('upgrade exige +8 de overall', P.pickCoach({ coaches, currentOverall: 70, recurringIncome: 9999, coins: 99999 }, P.getPolicy('competitivo')) === null);
  const staff = [{ id: 's1', roleId: 'physio', monthlyCost: 200, quality: 3 }, { id: 's2', roleId: 'manager', monthlyCost: 200, quality: 5 }];
  check('econômico não contrata staff fora da prioridade', P.pickStaff({ candidates: staff, payroll: 0, recurringIncome: 5000, coins: 5000 }, P.getPolicy('economico')) === null);
  check('equilibrado segue a prioridade (fisioterapeuta)', P.pickStaff({ candidates: staff, payroll: 0, recurringIncome: 5000, coins: 5000 }, pol)?.id === 's1');

  // Torneios.
  const cands = [{ id: 't1', tier: 'Bronze', entry_fee: 10 }, { id: 't2', tier: 'Silver', entry_fee: 40 }, { id: 't3', tier: 'Gold', entry_fee: 120 }];
  const order = (t) => ({ Bronze: 1, Silver: 2, Gold: 3 })[t.tier];
  const fit = (t) => (t.tier === 'Silver' ? 1 : 0);
  check('econômico: encaixe e taxa menor', P.rankTournaments({ cands, coins: 500, fit, order }, P.getPolicy('economico'))[0].id === 't2');
  check('competitivo: tier mais alto que o caixa permite', P.rankTournaments({ cands, coins: 500, fit, order }, P.getPolicy('competitivo'))[0].id === 't3');
  check('taxa acima da fração do caixa é descartada', !P.rankTournaments({ cands, coins: 500, fit, order }, P.getPolicy('economico')).some((t) => t.id === 't3'));

  // Investimento.
  check('econômico investe o excedente acima de 2× a reserva', P.planInvestment({ coins: 10000, reserve: 1000 }, P.getPolicy('economico')) === 4000);
  check('competitivo nunca investe', P.planInvestment({ coins: 1e6, reserve: 100 }, P.getPolicy('competitivo')) === 0);

  // Determinismo das funções puras: 200 chamadas → mesma escolha.
  const picks = new Set(Array.from({ length: 200 }, () => JSON.stringify(P.pickEquipmentPurchase({ rows, profile: lowBase, inventory, shopItems, budget }, pol, eq))));
  check('políticas puras são determinísticas', picks.size === 1);
}

// ── 3. Sonda: renovar patrocínio a qualquer momento (regra existente) ─────
{
  const { careerId, profile: p0 } = await createRealCareer(rt, { saveName: '9E.1 sonda' });
  const sponsors = await rt.load('/src/lib/sponsors.js');
  const E = rt.localGame.entities;
  // Fixture isolada (memória): prova de carreira cumprida para poder assinar.
  let p = await E.PlayerProfile.update(p0.id, { tournaments_played: 10 });
  const sponsor = sponsors.SPONSOR_CATALOG.find((s) => s.tier === 'Bronze' && sponsors.canSign(s, p).ok);
  const probe = { careerId, sponsor: sponsor?.id || null };
  if (sponsor) {
    const c0 = Number(p.coins) || 0;
    await sponsors.signSponsorContract(p, sponsor);
    p = await E.PlayerProfile.get(p.id);
    probe.signBonus = (Number(p.coins) || 0) - c0;
    const renewals = [];
    for (let i = 0; i < 3; i += 1) {
      const [contract] = await E.PlayerContract.filter({ profile_id: p.id, sponsor_id: sponsor.id, is_active: true });
      const before = Number(p.coins) || 0;
      await sponsors.renewContract(contract, sponsor, p);
      p = await E.PlayerProfile.get(p.id);
      renewals.push((Number(p.coins) || 0) - before);
    }
    probe.renewalBonusesSameDay = renewals;
    probe.activeAfter = (await E.PlayerContract.filter({ profile_id: p.id, sponsor_id: sponsor.id, is_active: true })).length;
  }
  // Registro, não asserção de correção: a regra é do jogo e fica para a 9D.
  check('sonda de renovação executada (achado registrado, regra não alterada)', Boolean(sponsor) && probe.activeAfter === 1, probe);
  results.at(-1).probe = probe;
}
await rt.close();

// ── 2. Driver real em processo separado ───────────────────────────────────
const driver = {};
if (!SKIP_DRIVER) {
  const dir = mkdtempSync(join(tmpdir(), 'pl-9e1-'));
  const run = (profile, sub) => {
    const out = join(dir, sub);
    execFileSync(process.execPath, ['--max-old-space-size=6144', 'scripts/sim-local-9e1-decisions.mjs', `--profile=${profile}`, '--seeds=2-2', '--days=14', `--out=${out}`, '--force'], { env: { ...process.env, TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
    return JSON.parse(readFileSync(join(out, `${profile}-d14-s002.json`), 'utf8'));
  };
  try {
    const a = run('equilibrado', 'a');
    const b = run('equilibrado', 'b');
    const e = run('economico', 'e');
    const c = run('competitivo', 'c');
    driver.hashes = { a: a.resultHash, b: b.resultHash, economico: e.resultHash, competitivo: c.resultHash };
    check('driver: mesma seed e perfil → mesmo hash (determinismo)', a.resultHash === b.resultHash, driver.hashes);
    const start = (o) => JSON.stringify({ startDate: o.startDate, coins: o.startCoins, archetype: o.archetype, style: o.playStyle, potential: o.potential, attrs: o.weekly[0].attrs });
    check('driver: os três perfis partem do mesmo estado (pareamento)', start(a) === start(e) && start(a) === start(c));
    for (const [name, o] of [['econômico', e], ['equilibrado', a], ['competitivo', c]]) {
      check(`driver ${name}: 14 dias, sem erro`, o.days >= 14 && o.errors.length === 0, o.errors);
      check(`driver ${name}: zero violações de integridade`, o.integrity.violations.length === 0, o.integrity.violations.slice(0, 3));
      check(`driver ${name}: save/load idêntico (base, modificadores, efetivo, inventário)`, o.saveLoad.identical, o.saveLoad.mismatches);
      const unattributed = Object.values(o.ledger).reduce((s, m) => s + m.unattributed, 0);
      check(`driver ${name}: livro-caixa sem resíduo não atribuído`, unattributed === 0, { unattributed });
    }
    check('driver: perfis divergem nas decisões', new Set([a.resultHash, e.resultHash, c.resultHash]).size === 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const failed = results.filter((r) => !r.ok);
const outDir = resolve('reports/local-9e1-decision-simulator');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'tests.json'), `${JSON.stringify({ generatedBy: 'scripts/test-local-9e1-decision-simulator.mjs', total: results.length, failed: failed.length, results, driver }, null, 1)}\n`);
console.log(`\nLOCAL-9E.1: ${results.length - failed.length}/${results.length} verificações OK`);
setTimeout(() => process.exit(failed.length ? 1 : 0), 50);
