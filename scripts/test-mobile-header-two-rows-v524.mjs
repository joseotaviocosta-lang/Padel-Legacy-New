// Playthrough 5.24, Parte D — header mobile em DUAS faixas, sem overflow,
// com os atalhos na segunda linha; desktop preservado.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync(new URL('../src/components/AppLayout.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

// Token de altura só do mobile.
assert.match(css, /--pl-header-h-mobile:\s*6\.5rem/, 'token --pl-header-h-mobile deve existir');

// O header mobile é uma coluna (2 faixas) com altura do token novo.
const mobileHeader = layout.match(/<header className="pl-layer-header[^>]*md:hidden">[\s\S]*?<\/header>/)[0];
assert.match(mobileHeader, /flex-col/, 'header mobile deve empilhar as faixas');
assert.match(mobileHeader, /var\(--pl-header-h-mobile\)/, 'altura deve usar o token mobile');
assert.match(mobileHeader, /overflow-hidden/, 'sem overflow horizontal');

// Duas faixas: contexto (linha 1) e atalhos + Avançar (linha 2).
const rowCount = (mobileHeader.match(/<div className="(mt-1 )?flex w-full min-w-0 items-center/g) || []).length;
assert.equal(rowCount, 2, `esperado 2 faixas, encontrado ${rowCount}`);
assert.match(mobileHeader, /CareerHeaderContext/, 'faixa 1 tem o contexto do torneio');
assert.match(mobileHeader, /HeaderRankShortcuts/, 'faixa 2 tem os atalhos');
assert.match(mobileHeader, /CareerDayControl/, 'faixa 2 tem o Avançar');

// A main reserva a altura do header mobile (e zera no desktop).
assert.match(layout, /pt-\[calc\(var\(--pl-header-h-mobile\)\+env\(safe-area-inset-top\)\)\]/, 'main deve reservar a altura mobile');
assert.match(layout, /md:pt-0/, 'desktop não deve reservar');

// Desktop preservado: barra única md:flex com atalhos + status + dia + sino.
const desktopStart = layout.indexOf('app-desktop-bar');
assert.ok(desktopStart > 0, 'barra desktop deve existir');
const desktopBar = layout.slice(desktopStart, desktopStart + 2200);
assert.match(desktopBar, /HeaderRankShortcuts/);
assert.match(desktopBar, /CareerHud/);
assert.match(desktopBar, /CareerDayControl/);
assert.match(desktopBar, /CommunicationBell/);

console.log('test-mobile-header-two-rows-v524: PASS');
