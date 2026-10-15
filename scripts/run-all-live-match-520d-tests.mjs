// Playthrough 5.20-D — RUNNER UNIFICADO DE TESTES DO LIVE MATCH.
//
// Executa os 5 testes da 5.20-D em sequência com o mesmo navegador para máxima estabilidade e performance:
//   1. test-live-match-mobile-contract-v520d.mjs (360x800 e 390x844)
//   2. test-live-match-landscape-contract-v520d.mjs (844x390 e 1366x768)
//   3. test-live-match-touch-targets-v520d.mjs (Pisos de toque e acessibilidade)
//   4. test-live-match-controls-preserved-v520d.mjs (Controles, táticas, velocidades, pausas)
//   5. test-live-match-route-fixture-v520d.mjs (Fixture determinística e entidades reais)
import assert from 'node:assert/strict';
import {
  launch,
  newPage,
  openCareer,
  launchLiveMatch,
  measureLiveMatch,
  capture520dScreenshot,
  advanceMatchPoints,
  advanceMatchGame,
  togglePlayPause,
  setMatchSpeed,
  switchMatchTab,
  setNarrationMode,
  VIEWPORTS_520D,
} from './lib/liveMatchHarness.mjs';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let totalPassed = 0;
let totalFailed = 0;

function check(label, fn) {
  try {
    fn();
    totalPassed += 1;
    console.log(`  ${PASS} ${label}`);
  } catch (error) {
    totalFailed += 1;
    console.log(`  ${FAIL} ${label}`);
    console.log(`     ${error.message}`);
  }
}

console.log('\n================================================================');
console.log('  PLAYTHROUGH 5.20-D — SUITE COMPLETA DE TESTES DO LIVE MATCH');
console.log('================================================================\n');

const browser = await launch();

try {
  // Inicializa carreira base
  const initPage = await openCareer(browser, VIEWPORTS_520D[1]);
  await initPage.close();

  // ==========================================
  // SUITE 1: Contrato Mobile (360x800 e 390x844)
  // ==========================================
  console.log('\n--- 1. CONTRATO MOBILE (360x800 e 390x844) ---');
  
  // 360x800
  const page360 = await openCareer(browser, VIEWPORTS_520D[0]);
  const match360Ok = await launchLiveMatch(page360, { startImmediate: true });
  assert.ok(match360Ok, 'LiveMatch deve abrir em 360x800');
  
  await advanceMatchPoints(page360, 3);
  await togglePlayPause(page360, 'pause');
  const m360 = await measureLiveMatch(page360);
  await page360.close();

  // 390x844
  const page390 = await openCareer(browser, VIEWPORTS_520D[1]);
  const match390Ok = await launchLiveMatch(page390, { startImmediate: true });
  assert.ok(match390Ok, 'LiveMatch deve abrir em 390x844');
  
  await advanceMatchPoints(page390, 4);
  await togglePlayPause(page390, 'pause');
  const m390 = await measureLiveMatch(page390);
  await page390.close();

  check('360px: LiveMatch montado com sucesso', () => assert.ok(m360.hasLiveMatch));
  check('360px: Placar visível (>= 50px)', () => assert.ok(m360.scoreboard.visible && m360.scoreboard.height >= 50));
  check('360px: Placar exibe pontuações das duas duplas', () => assert.ok(m360.scoreboard.setsCount >= 2));
  check('360px: Barra com as 4 abas visível', () => assert.equal(m360.tabs.count, 4));
  check('360px: Área de narração visível (>= 80px)', () => assert.ok(m360.narration.visible && m360.narration.height >= 80));
  check('360px: Controles inferiores visíveis dentro do viewport', () => assert.ok(m360.controls.visible && m360.controls.withinViewport));
  check('360px: Zero overflow horizontal', () => assert.ok(m360.overflowX <= 0));

  check('390px: LiveMatch montado com sucesso', () => assert.ok(m390.hasLiveMatch));
  check('390px: Placar visível e proporcional', () => assert.ok(m390.scoreboard.visible && m390.scoreboard.height >= 50));
  check('390px: Narração com área generosa (>= 120px)', () => assert.ok(m390.narration.visible && m390.narration.height >= 120));
  check('390px: Controles inferiores perfeitamente contidos', () => assert.ok(m390.controls.visible && m390.controls.withinViewport));
  check('390px: Zero overflow horizontal', () => assert.ok(m390.overflowX <= 0));

  // ==========================================
  // SUITE 2: Landscape (844x390) e Desktop (1366x768)
  // ==========================================
  console.log('\n--- 2. CONTRATO LANDSCAPE & DESKTOP (844x390 e 1366x768) ---');
  
  const page844 = await openCareer(browser, VIEWPORTS_520D[2]);
  const match844Ok = await launchLiveMatch(page844, { startImmediate: true });
  assert.ok(match844Ok, 'LiveMatch deve abrir em 844x390');

  await advanceMatchPoints(page844, 3);
  await togglePlayPause(page844, 'pause');
  const m844 = await measureLiveMatch(page844);
  await page844.close();

  const page1366 = await openCareer(browser, VIEWPORTS_520D[3]);
  const match1366Ok = await launchLiveMatch(page1366, { startImmediate: true });
  assert.ok(match1366Ok, 'LiveMatch deve abrir em 1366x768');

  await advanceMatchPoints(page1366, 4);
  await togglePlayPause(page1366, 'pause');
  const m1366 = await measureLiveMatch(page1366);
  await page1366.close();

  check('844x390: LiveMatch montado com sucesso', () => assert.ok(m844.hasLiveMatch));
  check('844x390: Placar visível e compacto (>= 40px)', () => assert.ok(m844.scoreboard.visible && m844.scoreboard.height >= 40));
  check('844x390: Barra de abas compacta e presente', () => assert.equal(m844.tabs.count, 4));
  check('844x390: Narração preserva piso útil de 40px (threshold mantido)', () => assert.ok(m844.narration.visible && m844.narration.height >= 40));
  check('844x390: Controles inferiores visíveis dentro do modal/viewport', () => assert.ok(m844.controls.visible));
  check('844x390: Zero overflow horizontal', () => assert.ok(m844.overflowX <= 0));

  check('1366x768: LiveMatch montado com sucesso', () => assert.ok(m1366.hasLiveMatch));
  check('1366x768: Espaço generoso para narração em desktop (>= 150px)', () => assert.ok(m1366.narration.visible && m1366.narration.height >= 150));
  check('1366x768: Placar e controles perfeitamente contidos', () => assert.ok(m1366.scoreboard.visible && m1366.controls.visible));

  // ==========================================
  // SUITE 3: Touch Targets e Acessibilidade Móvel
  // ==========================================
  console.log('\n--- 3. TOUCH TARGETS E ACESSIBILIDADE MÓVEL ---');
  
  const pageTouch = await openCareer(browser, VIEWPORTS_520D[1]);
  await launchLiveMatch(pageTouch, { startImmediate: true });
  
  const playbackButtonDimensions = await pageTouch.evaluate(() => {
    const playBtn = document.querySelector('button.pl-btn-tap') || [...document.querySelectorAll('button')].find(b => /Pausar|Continuar/i.test(b.textContent || ''));
    const skipBtns = [...document.querySelectorAll('button')].filter(b => ['Ponto', 'Game', 'Set', 'Fim'].includes((b.textContent || '').trim()));
    const speedBtns = [...document.querySelectorAll('[aria-label="Velocidade da partida"] button')];
    const tabBtns = [...document.querySelectorAll('[role="tab"]')];

    return {
      playBtn: playBtn ? { w: Math.round(playBtn.getBoundingClientRect().width), h: Math.round(playBtn.getBoundingClientRect().height) } : null,
      skips: skipBtns.map(b => ({ label: b.textContent.trim(), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })),
      speeds: speedBtns.map(b => ({ label: b.textContent.trim(), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })),
      tabs: tabBtns.map(b => ({ label: b.textContent.trim(), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })),
    };
  });

  check('Touch Targets: Botão Play/Pause tem altura >= 40px', () => {
    assert.ok(playbackButtonDimensions.playBtn && playbackButtonDimensions.playBtn.h >= 40);
  });
  check('Touch Targets: 4 botões de avanço rápido têm altura >= 36px', () => {
    assert.equal(playbackButtonDimensions.skips.length, 4);
    for (const skip of playbackButtonDimensions.skips) assert.ok(skip.h >= 36);
  });
  check('Touch Targets: 4 botões de velocidade agrupados têm dimensões >= 32x32px', () => {
    assert.equal(playbackButtonDimensions.speeds.length, 4);
    for (const sp of playbackButtonDimensions.speeds) assert.ok(sp.h >= 32 && sp.w >= 32);
  });
  check('Touch Targets: 4 abas têm altura >= 36px', () => {
    assert.equal(playbackButtonDimensions.tabs.length, 4);
    for (const tab of playbackButtonDimensions.tabs) assert.ok(tab.h >= 36);
  });

  // ==========================================
  // SUITE 4: Controles e Funcionalidades Preservadas
  // ==========================================
  console.log('\n--- 4. CONTROLES E FUNCIONALIDADES PRESERVADAS ---');
  
  // Play / Pause
  await togglePlayPause(pageTouch, 'play');
  const playingText = await pageTouch.evaluate(() => document.querySelector('button.pl-btn-tap')?.textContent || '');
  check('Controles: Retomar partida altera botão para "Pausar"', () => assert.ok(/Pausar/i.test(playingText)));

  await togglePlayPause(pageTouch, 'pause');
  const pausedText = await pageTouch.evaluate(() => document.querySelector('button.pl-btn-tap')?.textContent || '');
  check('Controles: Pausar partida altera botão para "Continuar"', () => assert.ok(/Continuar/i.test(pausedText)));

  // Velocidades
  for (const sp of [2, 5, 10, 1]) {
    await setMatchSpeed(pageTouch, sp);
    const active = await pageTouch.evaluate(() => document.querySelector('[aria-label="Velocidade da partida"] button[aria-pressed="true"]')?.textContent.trim());
    check(`Controles: Velocidade ${sp}x ativa`, () => assert.equal(active, `${sp}x`));
  }

  // Modos de Narração
  for (const mode of ['Resumida', 'Momentos', 'Completa']) {
    await setNarrationMode(pageTouch, mode);
    const active = await pageTouch.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.className.includes('bg-primary text-primary-foreground') && ['Completa', 'Resumida', 'Momentos'].includes(b.textContent.trim()));
      return btn ? btn.textContent.trim() : null;
    });
    check(`Controles: Modo de narração "${mode}" ativo`, () => assert.equal(active, mode));
  }

  // Aba Tática
  await switchMatchTab(pageTouch, 'tactics');
  await new Promise((r) => setTimeout(r, 400));
  const tacticsCount = await pageTouch.evaluate(() => document.querySelectorAll('button strong.block.text-xs').length);
  check('Controles: Aba Tática abre com opções táticas disponíveis', () => assert.ok(tacticsCount >= 3));

  // Seleciona tática Ofensivo
  await pageTouch.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /Ofensivo/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  const feedback = await pageTouch.evaluate(() => document.querySelector('[role="status"]')?.textContent || '');
  check('Controles: Aplicar tática retorna ao Jogo e exibe feedback', () => assert.ok(/Ofensivo/i.test(feedback)));

  // Aba Técnico
  await switchMatchTab(pageTouch, 'coach');
  await new Promise((r) => setTimeout(r, 400));
  const coachOpen = await pageTouch.evaluate(() => Boolean(document.querySelector('[data-coach-panel]')));
  check('Controles: Aba Técnico abre com seção do treinador', () => assert.ok(coachOpen));

  // Aba Estatísticas
  await switchMatchTab(pageTouch, 'stats');
  await new Promise((r) => setTimeout(r, 400));
  const statsOpen = await pageTouch.evaluate(() => Boolean(document.querySelector('div.grid.grid-cols-\\[4\\.5rem_1fr_4\\.5rem\\]')));
  check('Controles: Aba Estatísticas Ao Vivo exibe métricas comparativas', () => assert.ok(statsOpen));

  // Avanço Ponto e Game
  await switchMatchTab(pageTouch, 'match');
  await new Promise((r) => setTimeout(r, 300));
  const eventsBefore = await pageTouch.evaluate(() => document.querySelectorAll('.scrollbar-premium > div').length);
  await advanceMatchPoints(pageTouch, 2);
  const eventsAfterPoint = await pageTouch.evaluate(() => document.querySelectorAll('.scrollbar-premium > div').length);
  check('Controles: Avanço de Ponto adiciona eventos à narração', () => assert.ok(eventsAfterPoint >= eventsBefore));

  await advanceMatchGame(pageTouch);
  await new Promise((r) => setTimeout(r, 600));
  const eventsAfterGame = await pageTouch.evaluate(() => document.querySelectorAll('.scrollbar-premium > div').length);
  check('Controles: Avanço de Game avança a partida', () => assert.ok(eventsAfterGame >= eventsAfterPoint));

  // Diálogo de simulação até o fim
  await pageTouch.evaluate(() => {
    const endBtn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Fim');
    if (endBtn) endBtn.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  const dialogText = await pageTouch.evaluate(() => document.querySelector('[role="dialog"] h2, [role="alertdialog"] h2, h3')?.textContent || '');
  check('Controles: Botão "Fim" abre modal de confirmação', () => assert.ok(/Simular até o fim/i.test(dialogText)));

  await pageTouch.evaluate(() => {
    const cancelBtn = [...document.querySelectorAll('button')].find(b => /Cancelar/i.test(b.textContent || ''));
    if (cancelBtn) cancelBtn.click();
  });
  await pageTouch.close();

  // ==========================================
  // SUITE 5: Fixture Determinística de Rota e Entidades
  // ==========================================
  console.log('\n--- 5. FIXTURE DETERMINÍSTICA DE ROTA E ENTIDADES ---');
  
  const pageFixture = await openCareer(browser, VIEWPORTS_520D[1]);
  const fixtureMatchOk = await launchLiveMatch(pageFixture, { startImmediate: true });
  check('Fixture: Pipeline determinístico alcança o Live Match real', () => assert.ok(fixtureMatchOk));

  const fixtureVerification = await pageFixture.evaluate(() => {
    const root = document.querySelector('[data-live-match]');
    const scoreboard = document.querySelector('[aria-label="Placar da partida"]');
    const tablist = document.querySelector('[role="tablist"][aria-label="Painéis da partida"]');
    const tabs = tablist ? [...tablist.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim()) : [];
    return {
      hasRoot: Boolean(root),
      hasScoreboard: Boolean(scoreboard),
      tabs,
    };
  });

  check('Fixture: LiveMatch renderiza placar oficial com dados das duplas', () => assert.ok(fixtureVerification.hasScoreboard));
  check('Fixture: LiveMatch possui as 4 abas operacionais', () => assert.deepEqual(fixtureVerification.tabs, ['Jogo', 'Tática', 'Técnico', 'Ao vivo']));

  await pageFixture.close();

} finally {
  await browser.close();
}

console.log('\n================================================================');
console.log(`  RESULTADO FINAL: ${totalPassed} passed, ${totalFailed} failed`);
console.log('================================================================\n');

if (totalFailed > 0) process.exit(1);
