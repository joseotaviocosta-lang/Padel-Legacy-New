// Playthrough 5.24-B, Partes N/O — header mobile segue em 2 faixas e a
// restauração dos atalhos não rouba área útil.
//
// área útil = altura da viewport − header − BottomNav (medido no navegador).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const layout = readFileSync(new URL('../src/components/AppLayout.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

assert.match(css, /--pl-header-h-mobile:\s*6\.5rem/, 'altura do header mobile inalterada (6.5rem = 104px)');
const mobileHeader = layout.match(/<header className="pl-layer-header[^>]*md:hidden">[\s\S]*?<\/header>/)[0];
const rowCount = (mobileHeader.match(/<div className="(mt-1 )?flex w-full min-w-0 items-center/g) || []).length;
assert.equal(rowCount, 2, `header mobile deve ter 2 faixas (tem ${rowCount})`);
assert.match(mobileHeader, /CareerHeaderContext[\s\S]*Coins[\s\S]*CommunicationBell/, 'faixa 1: contexto + moedas + sino');
assert.match(mobileHeader, /HeaderRankShortcuts[\s\S]*CareerDayControl/, 'faixa 2: ranking/dupla/OVR + data/Avançar');

const evidenceFile = new URL('../reports/screenshots-524b/evidence.json', import.meta.url);
if (existsSync(evidenceFile)) {
  const evidence = JSON.parse(readFileSync(evidenceFile, 'utf8'));
  for (const [vp, minUsable] of [['360', 600], ['390', 640]]) {
    for (const [page, m] of Object.entries(evidence[vp].pages)) {
      assert.equal(m.header, 104, `${vp}/${page}: header ${m.header}px`);
      assert.equal(m.headerRows, 2, `${vp}/${page}: ${m.headerRows} faixas`);
      assert.equal(m.headerCount, 1, `${vp}/${page}: header duplicado`);
      assert.equal(m.bottomNavCount, 1, `${vp}/${page}: BottomNav duplicado/ausente`);
      assert.equal(m.overflowX, 0, `${vp}/${page}: overflow horizontal ${m.overflowX}px`);
      assert.ok(m.usable >= minUsable, `${vp}/${page}: área útil ${m.usable}px`);
    }
    const m = evidence[vp].pages.home;
    console.log(`   ${vp}: viewport ${m.viewport} − header ${m.header} − nav ${m.bottomNav} = ${m.usable}px úteis`);
  }
}

console.log('test-mobile-header-height-v524b: PASS');
