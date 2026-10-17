// CLOUD-6F — teste de caracterização da fronteira OPEN_TIER_CEILING (sem mudança de produção).
// Fixa o comportamento atual (antes) para que qualquer proposta futura (6F-A/6F-B) tenha referência.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let passed = 0; let failed = 0;
const check = (label, fn) => { try { fn(); passed += 1; console.log(`✓ ${label}`); } catch (e) { failed += 1; console.log(`✗ ${label}\n   ${e.message}`); } };
const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
try {
  const { evaluateTournamentEntry, OPEN_TIER_CEILING, buildAthleteEntryContext } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const ev = (tier, rank, extra = {}, opts) => evaluateTournamentEntry({ tier }, { rank, teamRank: rank, ...extra }, opts);

  check('OPEN_TIER_CEILING continua 400', () => assert.equal(OPEN_TIER_CEILING, 400));
  for (const rank of [350, 375, 399, 400]) {
    check(`rank ${rank}: Bronze/Silver barrados (overqualified), Gold direto`, () => {
      for (const t of ['Bronze', 'Silver']) { const e = ev(t, rank); assert.equal(e.eligible, false); assert.equal(e.overqualified, true); }
      assert.deepEqual([ev('Gold', rank).eligible, ev('Gold', rank).path], [true, 'direct']);
    });
  }
  for (const rank of [401, 425, 450]) {
    check(`rank ${rank}: Bronze, Silver e Gold elegíveis (diretos)`, () => {
      for (const t of ['Bronze', 'Silver', 'Gold']) { const e = ev(t, rank); assert.equal(e.eligible, true); assert.equal(e.path, 'direct'); }
    });
  }
  check('rank 500: Bronze/Silver diretos; Gold só via qualifying', () => {
    assert.equal(ev('Bronze', 500).path, 'direct'); assert.equal(ev('Silver', 500).path, 'direct'); assert.equal(ev('Gold', 500).path, 'qualifying');
  });
  check('a mudança Bronze/Silver ocorre exatamente entre 400 e 401', () => {
    assert.equal(ev('Silver', 400).eligible, false); assert.equal(ev('Silver', 401).eligible, true);
  });
  check('Gold: direto até 450, qualifying a partir de 451', () => {
    assert.equal(ev('Gold', 450).path, 'direct'); assert.equal(ev('Gold', 451).path, 'qualifying');
  });
  check('sem ranking: Bronze e Silver abertos; Gold fechado', () => {
    assert.equal(ev('Bronze', 0).eligible, true); assert.equal(ev('Silver', 0).eligible, true); assert.equal(ev('Gold', 0).eligible, false);
  });
  check('contexto do jogador usa o rank da DUPLA (teamRank explícito vence profile.world_ranking)', () => {
    const ctx = buildAthleteEntryContext({ world_ranking: 900 }, 380, { tier: 'Silver' });
    assert.equal(ctx.rank, 380); assert.equal(evaluateTournamentEntry({ tier: 'Silver' }, ctx).eligible, false);
  });
  check('elite real (rank 100) segue barrada da base — restrição preservada', () => {
    assert.equal(ev('Bronze', 100).eligible, false); assert.equal(ev('Silver', 100).eligible, false);
  });
  check('monotonia: melhorar o rank nunca remove acesso a tiers pagos já elegíveis', () => {
    for (const t of ['Gold', 'Platinum', 'Masters']) for (let r = 900; r > 1; r -= 1) if (ev(t, r).eligible) assert.equal(ev(t, r - 1).eligible, true, `${t} ${r}->${r - 1}`);
  });
  check('caminho da IA (aiFieldContext) respeita o mesmo teto', () => {
    assert.equal(ev('Silver', 400, {}, { aiFieldContext: true }).eligible, false); assert.equal(ev('Silver', 401, {}, { aiFieldContext: true }).eligible, true);
  });
  check('OBSERVAÇÃO: wildcard contorna o teto (comportamento atual, não alterado)', () => {
    assert.equal(ev('Bronze', 200, { wildcard: true }).eligible, true);
  });
} finally { await vite.close(); }
console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
