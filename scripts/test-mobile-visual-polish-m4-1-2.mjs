// M4.1.2 — Mobile Visual Polish, Bottom Nav, Density Normalization
// (docs/MOBILE_M4_1_2_VISUAL_POLISH.md).
//
// QA físico real (base M4.1.1) encontrou 3 grupos de problema: bottom nav
// visualmente misturada com o conteúdo em algumas telas; informações
// desalinhadas/coladas (HUD de Torneios, coluna OVR/Química espremida);
// botões grandes demais para mobile (Treinar, Abrir evento, +1/+3/+7 dias).
//
// Este teste é estrutural/textual (o padrão já estabelecido nesta sessão) —
// NÃO substitui a QA visual manual nos 5 viewports pedidos pela Parte I.
import { readFileSync } from 'node:fs';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

// ═══════════════════════════════════════════════════════════════════════
// Parte A — Bottom nav: superfície própria, z-index em token, gradiente
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Parte A: Bottom nav ---');
const cssSource = readFileSync('src/index.css', 'utf8');
gate('index.css define --z-bottom-nav (não mais um z-50 solto fora da escala)', /--z-bottom-nav:\s*55;/.test(cssSource));
gate('--z-bottom-nav fica acima de --z-floating (Guia flutuante nunca mais empata com a nav)', (() => {
  const floating = Number(cssSource.match(/--z-floating:\s*(\d+);/)?.[1]);
  const bottomNav = Number(cssSource.match(/--z-bottom-nav:\s*(\d+);/)?.[1]);
  return Number.isFinite(floating) && Number.isFinite(bottomNav) && bottomNav > floating;
})());

const navSource = readFileSync('src/components/BottomNav.jsx', 'utf8');
gate('BottomNav.jsx usa o token --z-bottom-nav, não mais um z-50 hardcoded', navSource.includes('z-[var(--z-bottom-nav)]') && !/\bz-50\b/.test(navSource));
gate('BottomNav.jsx tem superfície opaca reforçada (98%, não mais 96%)', navSource.includes('bg-background/98'));
gate('BottomNav.jsx tem um leve backdrop-blur (decorativo, não é o que esconde o conteúdo)', navSource.includes('backdrop-blur-sm'));
gate('BottomNav.jsx tem o gradiente de separação superior (Parte 3, leve, não um bloco pesado)', navSource.includes('bg-gradient-to-t from-background'));
gate('BottomNav.jsx continua respeitando a safe-area (Parte 5)', navSource.includes('env(safe-area-inset-bottom)'));

const layoutSource = readFileSync('src/components/AppLayout.jsx', 'utf8');
gate('AppLayout.jsx: <main> continua reservando bottom-nav-h + safe-area (fonte única, Parte 4)', layoutSource.includes('pb-[calc(var(--pl-bottom-nav-h)+env(safe-area-inset-bottom)'));

// ═══════════════════════════════════════════════════════════════════════
// Parte B — HUD/informações desalinhadas
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Parte B: HUD e coluna espremida ---');
const statusBarSource = readFileSync('src/components/career/CareerStatusBar.jsx', 'utf8');
gate('CareerStatusBar.jsx: linha "OVR · Química" tem truncate (Parte 9 — coluna espremida corrigida)', /text-\[10px\] text-muted-foreground truncate/.test(statusBarSource));
gate('CareerStatusBar.jsx é usado por Home e Torneios — um fix resolve as duas telas', (() => {
  const home = readFileSync('src/pages/CareerHub.jsx', 'utf8');
  const tournaments = readFileSync('src/pages/Tournaments.jsx', 'utf8');
  return home.includes('<CareerStatusBar') && tournaments.includes('<CareerStatusBar');
})());

const tournamentsSource = readFileSync('src/pages/Tournaments.jsx', 'utf8');
gate('Tournaments.jsx: hudItems não usa mais o nome do torneio como label (Parte 7/19 — "9d Los Angeles Cup" corrigido)', !/label:\s*nextTournament\.name/.test(tournamentsSource));
gate('Tournaments.jsx: hudItems não usa mais o label genérico "status" (redundante com o ícone)', !/label:\s*'status'/.test(tournamentsSource));
gate('Tournaments.jsx: hudItems não usa mais o label genérico "nível" (redundante com o ícone)', !/label:\s*'nível'/.test(tournamentsSource));
gate('Tournaments.jsx: o nome do torneio + contagem de dias viram um único value coerente', /value:\s*`\$\{nextTournament\.name\}/.test(tournamentsSource));

// ═══════════════════════════════════════════════════════════════════════
// Parte C — Botões grandes demais
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Parte C: densidade de botões ---');
gate('index.css define os tokens de altura de controle mobile (Parte 30)', cssSource.includes('--pl-mobile-control-h:') && cssSource.includes('--pl-mobile-control-h-primary:'));

const trainingCardSource = readFileSync('src/components/training/TrainingActivityCard.jsx', 'utf8');
gate('TrainingActivityCard.jsx: botão "Treinar" não é mais w-full (Parte 12 — card já identifica a atividade)', !trainingCardSource.includes('className="w-full"'));

const calendarSource = readFileSync('src/pages/CalendarPage.jsx', 'utf8');
gate('CalendarPage.jsx: título "Avançar carreira" some em mobile (Parte 24 — não ocupa mais uma coluna inteira)', calendarSource.includes('hidden min-w-0 flex-1 md:block'));
gate('CalendarPage.jsx: os 3 botões de avanço ganham um invólucro compacto único em mobile (Parte 14 — grupo segmentado)', calendarSource.includes('rounded-2xl bg-secondary/25 p-1'));
gate('CalendarPage.jsx: os 3 botões continuam com a mesma altura (size="touch" preservado nos 3)', (calendarSource.match(/size="touch"/g) || []).length >= 3);

console.log(`\n${gates} gates executados, todos PASS — M4.1.2 (bottom nav com superfície própria, HUD sem informação colada, botões densos). QA visual manual nos 5 viewports continua obrigatória — este teste não a substitui.`);
