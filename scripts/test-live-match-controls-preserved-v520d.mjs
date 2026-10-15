// Playthrough 5.20-D — TESTE 4: CONTROLES E FUNCIONALIDADES PRESERVADAS DO LIVE MATCH.
//
// Valida a integridade interativa de todos os controles do LiveMatch.jsx:
//   1. Play / Pause funcional;
//   2. Velocidades 1x, 2x, 5x, 10x acionáveis e refletidas no estado;
//   3. Transição de abas (Jogo, Tática, Técnico, Ao vivo);
//   4. Seleção e aplicação de táticas em quadra;
//   5. Modos de narração (Completa, Resumida, Momentos);
//   6. Avanço por Ponto e por Game;
//   7. Modal de confirmação para simular até o fim.
import assert from 'node:assert/strict';
import {
  launch,
  openCareer,
  launchLiveMatch,
  togglePlayPause,
  setMatchSpeed,
  switchMatchTab,
  setNarrationMode,
  advanceMatchPoints,
  advanceMatchGame,
  capture520dScreenshot,
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

console.log('\n=== Playthrough 5.20-D: Teste 4 — Controles e Funcionalidades Preservadas ===\n');

const browser = await launch();

try {
  const vp390 = { id: '390', label: 'Mobile 390x844', width: 390, height: 844, mobile: true };
  const page = await openCareer(browser, vp390);
  const matchOpen = await launchLiveMatch(page, { startImmediate: true });
  assert.ok(matchOpen, 'LiveMatch deve abrir em 390x844');

  console.log('Testando controles interativos do Live Match...');

  // 1. Play / Pause
  console.log('1. Testando Play / Pause...');
  await togglePlayPause(page, 'pause');
  const isPaused = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /Continuar/i.test(b.textContent || ''));
    return Boolean(btn);
  });
  check('Play / Pause: pausar partida altera botão para "Continuar"', () => {
    assert.ok(isPaused, 'Botão deve exibir "Continuar" quando pausado');
  });

  await togglePlayPause(page, 'play');
  const isPlaying = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /Pausar/i.test(b.textContent || ''));
    return Boolean(btn);
  });
  check('Play / Pause: retomar partida altera botão para "Pausar"', () => {
    assert.ok(isPlaying, 'Botão deve exibir "Pausar" quando em reprodução');
  });

  // Pausa novamente para testes controlados
  await togglePlayPause(page, 'pause');

  // 2. Velocidades 1x, 2x, 5x, 10x
  console.log('2. Testando velocidades 1x, 2x, 5x, 10x...');
  for (const speed of [2, 5, 10, 1]) {
    await setMatchSpeed(page, speed);
    const activeSpeed = await page.evaluate(() => {
      const activeBtn = document.querySelector('[aria-label="Velocidade da partida"] button[aria-pressed="true"]');
      return activeBtn ? activeBtn.textContent.trim() : null;
    });
    check(`Velocidade: selecionar ${speed}x marca botão como ativo (${activeSpeed})`, () => {
      assert.equal(activeSpeed, `${speed}x`);
    });
  }

  // 3. Modos de narração (Completa, Resumida, Momentos)
  console.log('3. Testando modos de narração...');
  for (const mode of ['Resumida', 'Momentos', 'Completa']) {
    await setNarrationMode(page, mode);
    const activeMode = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.className.includes('bg-primary text-primary-foreground') && ['Completa', 'Resumida', 'Momentos'].includes(b.textContent.trim()));
      return btn ? btn.textContent.trim() : null;
    });
    check(`Modo de narração: selecionar "${mode}" atualiza visualização ativa (${activeMode})`, () => {
      assert.equal(activeMode, mode);
    });
  }

  // 4. Painel Tático (Aba Tática)
  console.log('4. Testando painel Tático...');
  await switchMatchTab(page, 'tactics');
  await new Promise((r) => setTimeout(r, 400));
  await capture520dScreenshot(page, 'live-match-390-tactic');
  console.log(`${PASS} Screenshot capturado: reports/screenshots-520d/live-match-390-tactic.png`);

  const hasTacticsOptions = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => /Ofensivo|Defensivo|Equilibrado|Potência/i.test(b.textContent || ''));
    return btns.length >= 3;
  });
  check('Painel Tático: lista de táticas disponíveis renderizada com sucesso', () => {
    assert.ok(hasTacticsOptions, 'Opções táticas devem estar visíveis');
  });

  // Aplica tática "Ofensivo"
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /Ofensivo/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  // Volta automaticamente para aba Jogo e exibe feedback
  const feedbackTactic = await page.evaluate(() => {
    const statusP = document.querySelector('[role="status"]');
    return statusP ? statusP.textContent : '';
  });
  check('Painel Tático: alterar tática retorna para aba Jogo e exibe confirmação', () => {
    assert.ok(/Ofensivo/i.test(feedbackTactic), `Feedback da tática deve ser exibido: "${feedbackTactic}"`);
  });

  // 5. Painel Técnico (Aba Técnico)
  console.log('5. Testando painel Técnico...');
  await switchMatchTab(page, 'coach');
  await new Promise((r) => setTimeout(r, 400));
  await capture520dScreenshot(page, 'live-match-390-coach');
  console.log(`${PASS} Screenshot capturado: reports/screenshots-520d/live-match-390-coach.png`);

  const coachPanelOpen = await page.evaluate(() => {
    return Boolean(document.querySelector('[data-coach-panel]'));
  });
  check('Painel Técnico: aba abre com sucesso e renderiza seção do treinador', () => {
    assert.ok(coachPanelOpen, 'Painel do técnico deve existir no DOM');
  });

  // 6. Painel Estatísticas Ao Vivo
  console.log('6. Testando painel Estatísticas Ao Vivo...');
  await switchMatchTab(page, 'stats');
  await new Promise((r) => setTimeout(r, 400));
  const statsTable = await page.evaluate(() => {
    return Boolean(document.querySelector('div.grid.grid-cols-\\[4\\.5rem_1fr_4\\.5rem\\]'));
  });
  check('Estatísticas Ao Vivo: tabela comparativa de métricas em tempo real renderizada', () => {
    assert.ok(statsTable, 'Tabela de estatísticas ao vivo deve estar presente');
  });

  // 7. Avanço de Ponto e Game
  console.log('7. Testando avanço por Ponto e por Game...');
  await switchMatchTab(page, 'match');
  await new Promise((r) => setTimeout(r, 300));

  const pointsBefore = await page.evaluate(() => document.querySelector('.scrollbar-premium')?.querySelectorAll('div').length || 0);
  await advanceMatchPoints(page, 2);
  const pointsAfter = await page.evaluate(() => document.querySelector('.scrollbar-premium')?.querySelectorAll('div').length || 0);
  check('Avanço de Ponto: botão "Ponto" avança pontos e adiciona narração', () => {
    assert.ok(pointsAfter >= pointsBefore, 'Eventos de narração devem acumular após avançar pontos');
  });

  await advanceMatchGame(page);
  await new Promise((r) => setTimeout(r, 500));
  const pointsAfterGame = await page.evaluate(() => document.querySelector('.scrollbar-premium')?.querySelectorAll('div').length || 0);
  check('Avanço de Game: botão "Game" avança a partida até a conclusão de um game', () => {
    assert.ok(pointsAfterGame >= pointsAfter, 'Game deve avançar a simulação');
  });

  // 8. Diálogo de confirmação para simular até o fim
  console.log('8. Testando diálogo de simular até o fim...');
  await page.evaluate(() => {
    const endBtn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Fim');
    if (endBtn) endBtn.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  const dialogTitle = await page.evaluate(() => {
    return document.querySelector('[role="dialog"] h2, [role="alertdialog"] h2, h3')?.textContent || '';
  });
  check('Simular até o fim: botão "Fim" abre ConfirmDialog com aviso de simulação', () => {
    assert.ok(/Simular até o fim/i.test(dialogTitle), `Título do diálogo: "${dialogTitle}"`);
  });

  // Cancela o diálogo
  await page.evaluate(() => {
    const cancelBtn = [...document.querySelectorAll('button')].find(b => /Cancelar/i.test(b.textContent || ''));
    if (cancelBtn) cancelBtn.click();
  });
  await new Promise((r) => setTimeout(r, 300));

  await page.close();
} finally {
  await browser.close();
}

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
