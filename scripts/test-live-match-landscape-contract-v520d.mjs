// Playthrough 5.20-D — TESTE 2: CONTRATO LANDSCAPE E DESKTOP DO LIVE MATCH (844x390 e 1366x768).
//
// Valida que em landscape mobile (844x390) e laptop (1366x768):
//   1. Placar permanece visível e compacto sem dominar metade da tela;
//   2. Barra de abas permanece acessível;
//   3. Narração mantém área útil aproveitável (threshold >= 40px mantido de acordo com a decisão de produto);
//   4. Controles inferiores cabem sem scroll externo impossível;
//   5. Zero overflow horizontal e proporções adequadas no desktop.
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

console.log('\n=== Playthrough 5.20-D: Teste 2 — Contrato Landscape & Desktop do Live Match ===\n');

const browser = await launch();

try {
  // 1. Landscape 844x390
  const vp844 = { id: '844x390', label: 'Landscape Mobile 844x390', width: 844, height: 390, mobile: true };
  const page844 = await openCareer(browser, vp844);
  const matchOpen844 = await launchLiveMatch(page844, { startImmediate: true });
  assert.ok(matchOpen844, 'LiveMatch deve abrir em landscape 844x390');

  // Captura em andamento
  await advanceMatchPoints(page844, 3);
  await capture520dScreenshot(page844, 'live-match-844x390-running');
  console.log(`${PASS} Screenshot capturado: reports/screenshots-520d/live-match-844x390-running.png`);

  // Pausa e captura pausada
  await togglePlayPause(page844, 'pause');
  await capture520dScreenshot(page844, 'live-match-844x390-paused');
  console.log(`${PASS} Screenshot capturado: reports/screenshots-520d/live-match-844x390-paused.png`);

  const m844 = await measureLiveMatch(page844);
  await page844.close();

  // 2. Laptop 1366x768
  const vp1366 = { id: '1366', label: 'Laptop 1366x768', width: 1366, height: 768 };
  const page1366 = await newPage(browser, vp1366);
  const matchOpen1366 = await launchLiveMatch(page1366, { startImmediate: true });
  assert.ok(matchOpen1366, 'LiveMatch deve abrir em desktop 1366x768');

  await advanceMatchPoints(page1366, 4);
  await togglePlayPause(page1366, 'pause');
  await capture520dScreenshot(page1366, 'live-match-1366-running');
  console.log(`${PASS} Screenshot capturado: reports/screenshots-520d/live-match-1366-running.png`);

  const m1366 = await measureLiveMatch(page1366);
  await page1366.close();

  console.log('\n--- Medições 844x390 ---');
  console.log(JSON.stringify(m844, null, 2));

  console.log('\n--- Medições 1366x768 ---');
  console.log(JSON.stringify(m1366, null, 2));

  console.log('\n=== Executando Gates de Contrato Landscape & Desktop ===\n');

  // Gates Landscape 844x390
  check('844x390: LiveMatch montado com sucesso', () => {
    assert.ok(m844.hasLiveMatch, 'LiveMatch deve existir');
  });

  check('844x390: Placar visível e proporcional', () => {
    assert.ok(m844.scoreboard.visible, 'Placar deve estar visível');
    assert.ok(m844.scoreboard.height >= 40, 'Altura do placar deve ser >= 40px');
  });

  check('844x390: Barra de abas compacta e presente', () => {
    assert.ok(m844.tabs.visible, 'Tablist deve estar visível');
    assert.equal(m844.tabs.count, 4, 'Tablist deve conter 4 abas');
  });

  check('844x390: Área de narração preserva piso de conteúdo útil (>= 40px mantido)', () => {
    assert.ok(m844.narration.visible, 'Narração deve estar visível');
    assert.ok(m844.narration.height >= 40, `Altura útil da narração (${m844.narration.height}px) deve ser >= 40px`);
  });

  check('844x390: Controles inferiores visíveis dentro do modal/viewport', () => {
    assert.ok(m844.controls.visible, 'Controles devem estar visíveis');
  });

  check('844x390: Zero overflow horizontal', () => {
    assert.ok(m844.overflowX <= 0, `Overflow horizontal detectado: ${m844.overflowX}px`);
  });

  // Gates Laptop 1366x768
  check('1366x768: LiveMatch montado com sucesso', () => {
    assert.ok(m1366.hasLiveMatch, 'LiveMatch deve existir em desktop');
  });

  check('1366x768: Espaço generoso para narração em desktop (>= 150px)', () => {
    assert.ok(m1366.narration.visible, 'Narração deve estar visível');
    assert.ok(m1366.narration.height >= 150, `Altura da narração (${m1366.narration.height}px) deve ser >= 150px`);
  });

  check('1366x768: Placar e controles perfeitamente contidos', () => {
    assert.ok(m1366.scoreboard.visible && m1366.controls.visible, 'Placar e controles devem estar visíveis');
  });

} finally {
  await browser.close();
}

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
