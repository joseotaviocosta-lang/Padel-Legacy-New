// CLOUD-6M — o shell do AppLayout monta só UMA das duas barras (compacta
// <768px ou desktop), em vez de montar as duas e alternar por CSS.
// Teste estático (sem WebView/Android): guarda a estrutura que evita a
// duplicação de consultas do sino e do contexto de torneio.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync('src/components/AppLayout.jsx', 'utf8');
const perf = readFileSync('src/hooks/useAdaptivePerformance.js', 'utf8');

assert.match(perf, /matchMedia\?\.\('\(max-width: 767px\)'\)/, 'corte compacto = 767px (mesmo do md: do Tailwind)');
assert.match(layout, /const isCompactShell = performanceProfile\.compactViewport;/);

const headerOpen = layout.indexOf('<header className="pl-layer-header');
const headerClose = layout.indexOf('</header>', headerOpen);
assert.ok(headerOpen > 0 && headerClose > headerOpen, 'header mobile presente');
assert.match(layout.slice(layout.lastIndexOf('\n', headerOpen - 2) - 40, headerOpen), /\{isCompactShell && \(\s*$/, 'header mobile só monta no shell compacto');
assert.match(layout.slice(headerClose, headerClose + 40), /<\/header>\s*\)\}/, 'fecha o condicional do header mobile');

const barOpen = layout.indexOf('app-desktop-bar');
assert.match(layout.slice(barOpen - 80, barOpen), /\{!isCompactShell && \(\s*<div className="$/, 'barra desktop só monta fora do shell compacto');
const bell = layout.indexOf('<CommunicationBell />');
assert.match(layout.slice(bell, bell + 120), /<\/div>\s*<\/div>\s*\)\}/, 'fecha o condicional da barra desktop depois do sino');

// Cada componente com carga de dados continua com exatamente 1 instância por shell.
assert.equal((layout.match(/<CommunicationBell/g) || []).length, 2, '1 sino por shell (2 ocorrências no código, 1 montada por vez)');
assert.equal((layout.match(/<CareerHeaderContext/g) || []).length, 2);
console.log('PASS — CLOUD-6M shell single mount');
