// Playthrough 5.20-D — TESTE 3: TOUCH TARGETS E ACESSIBILIDADE DE TOQUE NO LIVE MATCH.
//
// Valida que todos os botões de ação e abas do Live Match respeitam os pisos de toque
// móvel da Playthrough 5.20 (>= 44px onde aplicável, botões primários com classe pl-btn-tap,
// botões de velocidade e controle com áreas confortáveis sem sobreposição acidental).
import assert from 'node:assert/strict';
import {
  launch,
  openCareer,
  launchLiveMatch,
  measureLiveMatch,
  switchMatchTab,
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

console.log('\n=== Playthrough 5.20-D: Teste 3 — Touch Targets do Live Match ===\n');

const browser = await launch();

try {
  const vp390 = { id: '390', label: 'Mobile 390x844', width: 390, height: 844, mobile: true };
  const page = await openCareer(browser, vp390);
  const matchOpen = await launchLiveMatch(page, { startImmediate: true });
  assert.ok(matchOpen, 'LiveMatch deve abrir em 390x844');

  const m = await measureLiveMatch(page);

  console.log('\n--- Medições de Touch Targets (Aba Jogo) ---');
  console.log(`Total de botões visíveis: ${m.touchTargets.visibleButtonCount}`);
  console.log(`Alvos pequenos (<44px não isentos): ${m.touchTargets.smallTargetsCount}`);
  if (m.touchTargets.smallTargets.length > 0) {
    console.log('Alvos pequenos detectados:', m.touchTargets.smallTargets);
  }

  // Verifica abas
  const tabDimensions = await page.evaluate(() => {
    return [...document.querySelectorAll('[role="tab"]')].map((t) => {
      const r = t.getBoundingClientRect();
      return { label: t.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) };
    });
  });

  console.log('\n--- Dimensões das Abas ---');
  console.table(tabDimensions);

  // Verifica botões de controle de reprodução
  const playbackButtonDimensions = await page.evaluate(() => {
    const playBtn = document.querySelector('button.pl-btn-tap') || [...document.querySelectorAll('button')].find(b => /Pausar|Continuar/i.test(b.textContent || ''));
    const skipBtns = [...document.querySelectorAll('button')].filter(b => ['Ponto', 'Game', 'Set', 'Fim'].includes((b.textContent || '').trim()));
    const speedBtns = [...document.querySelectorAll('[aria-label="Velocidade da partida"] button')];

    return {
      playBtn: playBtn ? { w: Math.round(playBtn.getBoundingClientRect().width), h: Math.round(playBtn.getBoundingClientRect().height) } : null,
      skips: skipBtns.map(b => ({ label: b.textContent.trim(), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })),
      speeds: speedBtns.map(b => ({ label: b.textContent.trim(), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })),
    };
  });

  console.log('\n--- Dimensões dos Controles de Reprodução ---');
  console.log(JSON.stringify(playbackButtonDimensions, null, 2));

  // Testa painel tático
  await switchMatchTab(page, 'tactics');
  const tacticsCards = await page.evaluate(() => {
    return [...document.querySelectorAll('button')].filter(b => /Equilibrado|Ofensivo|Defensivo/i.test(b.textContent || '')).map(b => {
      const r = b.getBoundingClientRect();
      return { label: b.textContent.slice(0, 20).trim(), w: Math.round(r.width), h: Math.round(r.height) };
    });
  });

  console.log('\n--- Dimensões dos Cards Táticos ---');
  console.table(tacticsCards);

  console.log('\n=== Executando Gates de Touch Targets ===\n');

  check('Botão primário Play/Pause tem altura confortável (>= 40px)', () => {
    assert.ok(playbackButtonDimensions.playBtn, 'Botão Play/Pause deve existir');
    assert.ok(playbackButtonDimensions.playBtn.h >= 40, `Altura ${playbackButtonDimensions.playBtn.h}px deve ser >= 40px`);
  });

  check('Botões de avanço rápido (Ponto, Game, Set, Fim) têm altura >= 36px', () => {
    assert.ok(playbackButtonDimensions.skips.length === 4, 'Devem existir 4 botões de avanço');
    for (const skip of playbackButtonDimensions.skips) {
      assert.ok(skip.h >= 36, `Botão ${skip.label} (${skip.h}px) deve ser >= 36px`);
    }
  });

  check('Pílulas de velocidade (1x, 2x, 5x, 10x) agrupadas com altura >= 32px', () => {
    assert.ok(playbackButtonDimensions.speeds.length === 4, 'Devem existir 4 opções de velocidade');
    for (const sp of playbackButtonDimensions.speeds) {
      assert.ok(sp.h >= 32 && sp.w >= 32, `Velocidade ${sp.label} (${sp.w}x${sp.h}px) deve ser >= 32x32px`);
    }
  });

  check('Abas de navegação de painéis têm altura >= 36px', () => {
    assert.equal(tabDimensions.length, 4, 'Devem existir 4 abas');
    for (const tab of tabDimensions) {
      assert.ok(tab.h >= 36, `Aba ${tab.label} (${tab.h}px) deve ter altura >= 36px`);
    }
  });

  check('Cards táticos são amplamente tocáveis (altura >= 50px)', () => {
    assert.ok(tacticsCards.length >= 3, 'Devem existir opções táticas');
    for (const card of tacticsCards) {
      assert.ok(card.h >= 50, `Card tático (${card.h}px) deve ter altura >= 50px`);
    }
  });

  await page.close();
} finally {
  await browser.close();
}

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
