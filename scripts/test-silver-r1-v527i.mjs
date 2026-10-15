// Playthrough 5.27-I, Bloco F (itens 27–29) — R1 por tier (Bronze, Silver,
// Gold, Platinum) medido no micro e no Stage 1; a chave não mudou (só a
// composição do campo Silver).
import { readFileSync } from 'node:fs';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { csvRows, report } from './lib/v527iTestKit.mjs';

const { check, finish } = makeSuite('test-silver-r1-v527i');
try {
  await check('micro: R1 por tier para baseline e escolhido', () => {
    const c = report('silver-choice.json').chosen;
    const s = report('micro-normal-365d.json').summary;
    for (const k of ['baseline', c]) for (const t of ['Bronze', 'Silver', 'Gold']) assert.ok(s[k].tiers[t].r1.n > 0, `${k} ${t}`);
  });
  await check('Stage 1: rounds.csv e qualifying-vs-main.csv com R1 por tier (Balanced-E Normal)', () => {
    const q = csvRows('qualifying-vs-main.csv').filter((r) => r.preset === 'balanced-e' && r.profile === 'normal');
    for (const t of ['Bronze', 'Silver', 'Gold', 'Platinum']) assert.ok(q.find((r) => r.tier === t && r.mainR1N > 0), t);
  });
  await check('Silver R1 no escolhido ≥ Silver R1 no baseline (micro)', () => {
    const c = report('silver-choice.json').chosen;
    const s = report('micro-normal-365d.json').summary;
    assert.ok(s[c].tiers.Silver.r1.wr >= s.baseline.tiers.Silver.r1.wr, `${s[c].tiers.Silver.r1.wr} × ${s.baseline.tiers.Silver.r1.wr}`);
  });
  await check('chave inalterada: semeadura e projeção do caminho sem mudança (só a janela Silver)', () => {
    const src = readFileSync('src/gameplay/worldTour/WorldTourLifecycle.js', 'utf8');
    assert.match(src, /buildSeededDrawSlots\(\{\s*entrants: \[\.\.\.selected, playerEntrant\]/);
    assert.match(src, /Math\.min\(Math\.round\(Number\(playerRank\)\), Math\.max\(1, bracketSize\)\)/);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
