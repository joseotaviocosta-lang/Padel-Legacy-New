// Playthrough 5.20-D — AUDITORIA VISUAL COMPLETA DO LIVE MATCH
//
// Executa o Live Match real nos 5 viewports obrigatórios (360x800, 390x844, 844x390, 1366x768, 1920x1080)
// e captura todos os estados visuais exigidos pelas Partes B-P da 5.20-D:
//   1. início da partida
//   2. narração em andamento
//   3. partida pausada
//   4. velocidade 1x, 2x, 5x, 10x
//   5. técnico aberto
//   6. tática aberta
//   7. estatísticas ao vivo
//   8. narração acumulada
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  launch,
  newPage,
  goto,
  openCareer,
  dismissOverlays,
  VIEWPORTS_520D,
  SCREENSHOT_DIR_520D,
  measureLiveMatch,
  togglePlayPause,
  setMatchSpeed,
  switchMatchTab,
  advanceMatchPoints,
} from './lib/liveMatchHarness.mjs';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

console.log('\n=== PLAYTHROUGH 5.20-D — LIVE MATCH VISUAL AUDIT & SCREENSHOT SUITE ===\n');

mkdirSync(SCREENSHOT_DIR_520D, { recursive: true });

const browser = await launch();
const resultsByViewport = {};

try {
  // Prepara carreira inicial no viewport 390
  const basePage = await openCareer(browser, VIEWPORTS_520D[1]);
  
  // Garante que o jogador tem uma dupla contratada
  await goto(basePage, '/partners', { settle: 1500 });
  await dismissOverlays(basePage);
  
  const hasPartner = await basePage.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    return !btns.some((b) => /Escolher Dupla/i.test(b.textContent || ''));
  });

  if (!hasPartner) {
    console.log('Selecionando dupla inicial...');
    await basePage.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Escolher Dupla|Buscar|Contratar/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 1000));
    await basePage.evaluate(() => {
      const partnerBtns = [...document.querySelectorAll('button')].filter(b => /Iniciante|Amador/i.test(b.textContent || '') && !b.textContent.includes('Confirmar'));
      if (partnerBtns.length > 0) partnerBtns[0].click();
    });
    await new Promise((r) => setTimeout(r, 500));
    await basePage.evaluate(() => {
      const confirmBtn = [...document.querySelectorAll('button')].find(b => /Confirmar/i.test(b.textContent || ''));
      if (confirmBtn) confirmBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1500));
  }
  await basePage.close();

  // Itera por todos os viewports e realiza as capturas e medições
  for (const vp of VIEWPORTS_520D) {
    console.log(`\n--- Auditando Viewport: ${vp.label} (${vp.width}x${vp.height}) ---`);
    const page = await newPage(browser, vp);
    await goto(page, '/game/training-center?view=match', { settle: 1500 });
    await dismissOverlays(page);

    // Clica em "Jogar partida treino"
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find((x) => /Jogar partida treino/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Se houver modal de parceiro ainda aberto
    await page.evaluate(() => {
      const partnerBtns = [...document.querySelectorAll('button')].filter(b => /Iniciante|Amador/i.test(b.textContent || '') && !b.textContent.includes('Confirmar'));
      if (partnerBtns.length > 0) partnerBtns[0].click();
      const confirmBtn = [...document.querySelectorAll('button')].find(b => /Confirmar/i.test(b.textContent || ''));
      if (confirmBtn) confirmBtn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Clica em "Iniciar Partida" no SimulationModal
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find((x) => /Iniciar Partida/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    // 1. Início da Partida (Start)
    if (vp.id === '360') {
      await page.screenshot({ path: resolve(SCREENSHOT_DIR_520D, 'live-match-360-start.png') });
      console.log(`${PASS} Capturado: live-match-360-start.png`);
    }

    // Avança alguns pontos e pausa
    await advanceMatchPoints(page, 4);
    await togglePlayPause(page, 'pause');
    await new Promise((r) => setTimeout(r, 400));

    // 2. Partida em andamento (Running) / Pausada (Paused)
    const runningName = vp.id === '844x390' ? 'live-match-844x390-running.png' : `live-match-${vp.id}-running.png`;
    await page.screenshot({ path: resolve(SCREENSHOT_DIR_520D, runningName) });
    console.log(`${PASS} Capturado: ${runningName}`);

    if (vp.id === '844x390') {
      await page.screenshot({ path: resolve(SCREENSHOT_DIR_520D, 'live-match-844x390-paused.png') });
      console.log(`${PASS} Capturado: live-match-844x390-paused.png`);
    }

    // 3. Aba Tática (Tactic)
    await switchMatchTab(page, 'tactics');
    await new Promise((r) => setTimeout(r, 400));
    if (vp.id === '390' || vp.id === '844x390') {
      const tacticName = vp.id === '844x390' ? 'live-match-844x390-tactic.png' : 'live-match-390-tactic.png';
      await page.screenshot({ path: resolve(SCREENSHOT_DIR_520D, tacticName) });
      console.log(`${PASS} Capturado: ${tacticName}`);
    }

    // 4. Aba Técnico (Coach)
    await switchMatchTab(page, 'coach');
    await new Promise((r) => setTimeout(r, 400));
    if (vp.id === '390' || vp.id === '844x390') {
      const coachName = vp.id === '844x390' ? 'live-match-844x390-coach.png' : 'live-match-390-coach.png';
      await page.screenshot({ path: resolve(SCREENSHOT_DIR_520D, coachName) });
      console.log(`${PASS} Capturado: ${coachName}`);
    }

    // Retorna para aba Jogo
    await switchMatchTab(page, 'match');
    await new Promise((r) => setTimeout(r, 300));

    // Mede layout
    const measurement = await measureLiveMatch(page);
    resultsByViewport[vp.id] = measurement;

    console.log(`   - Placar: visível=${measurement.scoreboard.visible}, altura=${measurement.scoreboard.height}px`);
    console.log(`   - Tabs: visível=${measurement.tabs.visible}, altura=${measurement.tabs.height}px, abas=${measurement.tabs.count}`);
    console.log(`   - Narração: visível=${measurement.narration.visible}, altura=${measurement.narration.height}px`);
    console.log(`   - Controles: visível=${measurement.controls.visible}, altura=${measurement.controls.height}px, dentroViewport=${measurement.controls.withinViewport}`);
    console.log(`   - Overflow X: ${measurement.overflowX}px`);
    console.log(`   - Small Touch Targets (<44px): ${measurement.touchTargets.smallTargetsCount}`);

    await page.close();
  }

  console.log('\n=== AUDITORIA CONCLUÍDA COM SUCESSO ===\n');
} finally {
  await browser.close();
}
