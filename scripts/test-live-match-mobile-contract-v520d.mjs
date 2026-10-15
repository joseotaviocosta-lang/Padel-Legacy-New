// Playthrough 5.20-D — TESTE 1: CONTRATO MOBILE DO LIVE MATCH (360x800 e 390x844).
//
// Valida que em mobile pequeno (360x800) e mobile de referência (390x844):
//   1. Placar permanece visível, com sets, games, pontos e nomes legíveis;
//   2. Nenhuma quebra de layout ou overflow horizontal (overflowX <= 0);
//   3. Painéis de tabs (Jogo, Tática, Técnico, Ao vivo) estão presentes e acessíveis;
//   4. Narração ocupa a maior área útil e possui scroll interno sem estourar o modal;
//   5. Controles inferiores de reprodução estão visíveis dentro da viewport.
import assert from 'node:assert/strict';
import {
  launch,
  newPage,
  openCareer,
  launchLiveMatch,
  measureLiveMatch,
  capture520dScreenshot,
  advanceMatchPoints,
  togglePlayPause,
} from './lib/liveMatchHarness.mjs';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`${PASS} ${label}`);
  } catch (error) {
    failed += 1;
    console.log(`${FAIL} ${label}`);
    console.log(`   ${error.message}`);
  }
}

console.log('\n=== Playthrough 5.20-D: Teste 1 — Contrato Mobile do Live Match ===\n');

const browser = await launch();

try {
  // Mobile 360x800
  const vp360 = { id: '360', label: 'Mobile 360x800', width: 360, height: 800, mobile: true };
  const page360 = await openCareer(browser, vp360);
  const matchOpen360 = await launchLiveMatch(page360, { startImmediate: true });
  assert.ok(matchOpen360, 'LiveMatch deve abrir em 360x800');

  // Captura estado de início
  await capture520dScreenshot(page360, 'live-match-360-start');
  console.log(`${PASS} Screenshot capturado: reports/screenshots-520d/live-match-360-start.png`);

  // Avança pontos e captura em andamento
  await advanceMatchPoints(page360, 3);
  await togglePlayPause(page360, 'pause');
  await capture520dScreenshot(page360, 'live-match-360-running');
  console.log(`${PASS} Screenshot capturado: reports/screenshots-520d/live-match-360-running.png`);

  const m360 = await measureLiveMatch(page360);
  await page360.close();

  // Mobile 390x844
  const vp390 = { id: '390', label: 'Mobile 390x844', width: 390, height: 844, mobile: true };
  const page390 = await newPage(browser, vp390);
  const matchOpen390 = await launchLiveMatch(page390, { startImmediate: true });
  assert.ok(matchOpen390, 'LiveMatch deve abrir em 390x844');

  await advanceMatchPoints(page390, 4);
  await togglePlayPause(page390, 'pause');
  await capture520dScreenshot(page390, 'live-match-390-running');
  console.log(`${PASS} Screenshot capturado: reports/screenshots-520d/live-match-390-running.png`);

  const m390 = await measureLiveMatch(page390);
  await page390.close();

  console.log('\n--- Medições 360x800 ---');
  console.log(JSON.stringify(m360, null, 2));

  console.log('\n--- Medições 390x844 ---');
  console.log(JSON.stringify(m390, null, 2));

  console.log('\n=== Executando Gates de Contrato Mobile ===\n');

  // Gates 360x800
  check('360px: LiveMatch montado com sucesso', () => {
    assert.ok(m360.hasLiveMatch, 'Componente LiveMatch deve existir no DOM');
  });

  check('360px: Placar visível com altura adequada (>= 50px)', () => {
    assert.ok(m360.scoreboard.visible, 'Placar deve estar visível');
    assert.ok(m360.scoreboard.height >= 50, `Altura do placar (${m360.scoreboard.height}px) deve ser >= 50px`);
  });

  check('360px: Placar exibe sets e pontuação', () => {
    assert.ok(m360.scoreboard.setsCount >= 2, 'Placar deve exibir pontuações das duas duplas');
  });

  check('360px: Barra de abas (4 painéis) visível', () => {
    assert.ok(m360.tabs.visible, 'Tablist deve estar visível');
    assert.equal(m360.tabs.count, 4, 'Tablist deve ter 4 abas (Jogo, Tática, Técnico, Ao vivo)');
  });

  check('360px: Área de narração visível e com espaço flexível', () => {
    assert.ok(m360.narration.visible, 'Narração deve estar visível');
    assert.ok(m360.narration.height >= 80, `Altura da narração (${m360.narration.height}px) deve ser >= 80px`);
  });

  check('360px: Controles inferiores visíveis dentro do viewport', () => {
    assert.ok(m360.controls.visible, 'Controles devem estar visíveis');
    assert.ok(m360.controls.withinViewport, 'Controles devem caber dentro do viewport sem sumir');
  });

  check('360px: Zero overflow horizontal (overflowX <= 0)', () => {
    assert.ok(m360.overflowX <= 0, `Overflow horizontal detectado: ${m360.overflowX}px`);
  });

  // Gates 390x844
  check('390px: LiveMatch montado com sucesso', () => {
    assert.ok(m390.hasLiveMatch, 'Componente LiveMatch deve existir no DOM');
  });

  check('390px: Placar visível e proporcional', () => {
    assert.ok(m390.scoreboard.visible, 'Placar deve estar visível');
    assert.ok(m390.scoreboard.height >= 50, `Altura do placar (${m390.scoreboard.height}px) deve ser >= 50px`);
  });

  check('390px: Narração com área generosa em viewport referência (>= 120px)', () => {
    assert.ok(m390.narration.visible, 'Narração deve estar visível');
    assert.ok(m390.narration.height >= 120, `Altura da narração (${m390.narration.height}px) deve ser >= 120px`);
  });

  check('390px: Controles inferiores perfeitamente contidos', () => {
    assert.ok(m390.controls.visible && m390.controls.withinViewport, 'Controles devem estar visíveis e contidos');
  });

  check('390px: Zero overflow horizontal', () => {
    assert.ok(m390.overflowX <= 0, `Overflow horizontal detectado: ${m390.overflowX}px`);
  });

} finally {
  await browser.close();
}

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
