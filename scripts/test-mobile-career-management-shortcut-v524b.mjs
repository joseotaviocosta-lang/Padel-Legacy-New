// Playthrough 5.24-B, Partes C/D — "Gerenciar carreiras" acessível no mobile.
//
// A 5.20-B escondeu o botão da FloatingUtilityRail no mobile (`hidden
// md:flex`). O acesso volta no topo do drawer ☰ do header mobile: 2 toques.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const layout = readFileSync(new URL('../src/components/AppLayout.jsx', import.meta.url), 'utf8');
const rail = readFileSync(new URL('../src/components/system/FloatingUtilityRail.jsx', import.meta.url), 'utf8');

const quick = layout.match(/function MobileQuickAccess[\s\S]*?\n\}/)?.[0];
assert.ok(quick, 'MobileQuickAccess deve existir');
assert.match(quick, /aria-label="Gerenciar carreiras"/);
assert.match(quick, /onClick=\{openCareerManager\}/, 'usa o MESMO fluxo da rail (fecha a carreira e abre /careers)');
assert.match(layout, /async function openCareerManager\(\)[\s\S]*?careerManager\.close\(\)[\s\S]*?'\/careers'/);

// Renderizado dentro do drawer mobile (md:hidden), antes da navegação.
const drawer = layout.match(/<motion\.aside[^>]*id="mobile-navigation-drawer"[\s\S]*?<\/motion\.aside>/)?.[0];
assert.ok(drawer, 'drawer mobile deve existir');
assert.match(drawer, /md:hidden/, 'drawer é só mobile');
assert.match(drawer, /<MobileQuickAccess[\s\S]*?<nav/, 'acesso rápido fica no topo do drawer');

// A rail continua com o atalho. (5.24-C: voltou a aparecer também no
// mobile, em 1 toque; este drawer segue como fallback.)
assert.match(rail, /aria-label="Gerenciar carreiras"/, 'rail mantém o atalho');

// Toques reais medidos no navegador.
const evidenceFile = new URL('../reports/screenshots-524b/evidence.json', import.meta.url);
if (existsSync(evidenceFile)) {
  const evidence = JSON.parse(readFileSync(evidenceFile, 'utf8'));
  for (const vp of ['360', '390']) {
    const s = evidence[vp]?.shortcuts?.careers;
    assert.ok(s, `atalho medido em ${vp}`);
    assert.ok(s.taps <= 2, `${vp}: ${s.taps} toques`);
    assert.equal(s.landed, '/careers', `${vp}: destino ${s.landed}`);
  }
  console.log('   medido: 2 toques (☰ → Gerenciar carreiras) em 360 e 390 → /careers');
}

console.log('test-mobile-career-management-shortcut-v524b: PASS');
