// Playthrough 5.24-B, Parte D — acesso restaurado SEM poluir a tela.
//  - (5.24-C: a rail mobile voltou a mostrar os 2 atalhos — ver *-v524c);
//  - nenhuma faixa nova no header;
//  - cada atalho aparece UMA vez por breakpoint (drawer no mobile, rail no
//    desktop) — sem duplicação visual.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync(new URL('../src/components/AppLayout.jsx', import.meta.url), 'utf8');
const rail = readFileSync(new URL('../src/components/system/FloatingUtilityRail.jsx', import.meta.url), 'utf8');

// MobileQuickAccess é usado exatamente uma vez, e só no drawer.
assert.equal((layout.match(/<MobileQuickAccess\b/g) || []).length, 1, 'acesso rápido renderizado uma única vez');
const mobileHeader = layout.match(/<header className="pl-layer-header[^>]*md:hidden">[\s\S]*?<\/header>/)[0];
assert.doesNotMatch(mobileHeader, /MobileQuickAccess|Gerenciar carreiras|Centro de treinamento/, 'header não ganhou atalhos novos');
const desktopBar = layout.slice(layout.indexOf('app-desktop-bar'), layout.indexOf('app-desktop-bar') + 2200);
assert.doesNotMatch(desktopBar, /MobileQuickAccess/, 'desktop não duplica o acesso rápido');

// Rail: BETA + os 2 atalhos. A 5.24-C (decisão de produto pós-playtest)
// tornou os atalhos visíveis também no mobile; a regra "rail mobile = só
// BETA" desta fase foi substituída. Sem novos botões além desses 3 — a
// medição de visibilidade/sobreposição vive nos testes *-v524c.mjs.
assert.equal((rail.match(/className="[^"]*\bhidden md:flex/g) || []).length, 0, 'atalhos não ficam mais ocultos no mobile');
assert.equal((rail.match(/\$\{SHORTCUT_CLASS\}/g) || []).length, 2, 'rail tem exatamente 2 atalhos (além da BETA)');
// 5.25: a Central BETA recebe estado controlado (aberta pelo menu no mobile).
assert.match(rail, /<BetaTools compact\b[^>]*\/>/);

console.log('test-mobile-utility-access-v524b: PASS');
