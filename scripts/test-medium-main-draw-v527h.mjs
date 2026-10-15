// Playthrough 5.27-H, Bloco C (item 15) — Medium de chave principal: Gold main
// e Platinum main medidos; o Medium do Balanced-E Normal vem majoritariamente
// da chave principal (não de qualifying fácil) e o breakdown fecha com o total.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { csvRows, report } from './lib/v527hTestKit.mjs';

const { check, finish } = makeSuite('test-medium-main-draw-v527h');
try {
  const rows = csvRows('medium-breakdown.csv');
  const get = (p, pr, t, st, y = 'all') => rows.find((r) => r.preset === p && r.profile === pr && r.tier === t && r.stage === st && String(r.year) === String(y));
  await check('Gold main e Platinum main medidos (Balanced-E Normal)', () => {
    for (const t of ['Gold', 'Platinum']) { const x = get('balanced-e', 'normal', t, 'main'); assert.ok(x && x.N > 0, `${t} main sem partidas`); assert.ok(x.WR != null); }
  });
  await check('breakdown fecha: qualifying + main = Medium do preset/perfil', () => {
    const s = report('stage1.json').byPreset;
    for (const p of ['conservative-e', 'balanced-e', 'hardcore-e']) for (const pr of ['all', 'casual', 'normal', 'optimizer']) {
      const n = ['Gold', 'Platinum'].reduce((acc, t) => acc + get(p, pr, t, 'main').N + get(p, pr, t, 'qualifying').N, 0);
      assert.equal(n, s[p][pr].competition.medium.n, `${p}/${pr}`);
    }
  });
  await check('Medium do Balanced-E Normal é majoritariamente de chave principal (≥ 50% das partidas)', () => {
    const main = get('balanced-e', 'normal', 'Gold', 'main').N + get('balanced-e', 'normal', 'Platinum', 'main').N;
    const q = get('balanced-e', 'normal', 'Gold', 'qualifying').N + get('balanced-e', 'normal', 'Platinum', 'qualifying').N;
    assert.ok(main >= q, `main ${main} vs qualifying ${q}`);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
