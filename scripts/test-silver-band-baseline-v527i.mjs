// Playthrough 5.27-I, Bloco B/C — baseline Silver reproduzida antes de mexer:
// Silver main bem abaixo de Gold main, campo Silver mais forte que a dupla do
// jogador, e a causa mapeada (janela de 25% só no Silver do campo do jogador).
import { readFileSync } from 'node:fs';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { report } from './lib/v527iTestKit.mjs';

const { check, finish } = makeSuite('test-silver-band-baseline-v527i');
try {
  const b = report('micro-normal-365d.json').summary.baseline;
  await check('baseline (5 seeds Normal, 1a) medida com campo por tier', () => {
    assert.equal(b.careers, 5);
    for (const t of ['Bronze', 'Silver', 'Gold']) assert.ok(b.tiers[t].field.fields > 0 && b.tiers[t].field.ovr.p50 != null, t);
  });
  await check('inconsistência reproduzida: Silver main materialmente abaixo de Gold main e de Bronze', () => {
    const s = b.tiers.Silver.main.wr; const g = b.tiers.Gold.main.wr; const br = b.tiers.Bronze.main.wr;
    assert.ok(s + 5 < g || s + 5 < br, `Silver ${s} · Gold ${g} · Bronze ${br}`);
  });
  await check('campo Silver mais forte que a dupla do jogador nas partidas Silver', () => {
    const f = b.tiers.Silver.faced;
    assert.ok(f.opp > f.team, `adversário ${f.opp} × dupla ${f.team}`);
  });
  await check('causa mapeada: janela de deslocamento só no Silver, configurável e com 25% como padrão antigo', () => {
    const src = readFileSync('src/gameplay/worldTour/WorldTourLifecycle.js', 'utf8');
    assert.match(src, /silverFieldOffsetPct \?\? 0\.25/);
    assert.match(src, /isOpenTier && tournament\.tier === 'Silver'/);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
