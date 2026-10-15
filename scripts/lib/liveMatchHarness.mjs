// Playthrough 5.20-D — HARNESS DE VALIDAÇÃO E AUDITORIA DO LIVE MATCH.
//
// Cria caminho determinístico e reproduzível até a partida ao vivo real (LiveMatch.jsx),
// tanto em partida treino (Training Center -> SimulationModal) quanto em torneio oficial
// (TournamentModal), usando entidades reais do domínio sem mocks sintéticos de componentes.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { launch, newPage, goto } from './visualAuditDriver.mjs';
import { openCareer, dismissOverlays } from './auditSession.mjs';

export const VIEWPORTS_520D = [
  { id: '360', label: 'Mobile 360x800', width: 360, height: 800, mobile: true },
  { id: '390', label: 'Mobile 390x844 (Ref)', width: 390, height: 844, mobile: true },
  { id: '844x390', label: 'Landscape Mobile 844x390', width: 844, height: 390, mobile: true },
  { id: '1366', label: 'Laptop 1366x768', width: 1366, height: 768 },
  { id: '1920', label: 'Desktop 1920x1080', width: 1920, height: 1080 },
];

export const SCREENSHOT_DIR_520D = resolve(process.cwd(), 'reports/screenshots-520d');

/**
 * Reseta o contador diário de partidas e restaura energia no storage do browser.
 * @param {import('puppeteer-core').Page} page
 */
export async function resetDailyMatchAllowance(page) {
  await page.evaluate(() => {
    try {
      const KEY = '__pl_audit_fs__';
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const files = new Map(JSON.parse(raw));
      for (const [filePath, content] of files.entries()) {
        if (filePath.includes('PlayerProfile') && filePath.endsWith('.json')) {
          try {
            const data = JSON.parse(content);
            data.practice_matches_today = 0;
            data.tournament_matches_today = 0;
            data.trainings_today = 0;
            data.energy = 100;
            data.fatigue = 0;
            if (!data.partner_id) {
              data.partner_id = 'bot_iniciante_1';
              data.partner_name = 'Lucas Bot';
            }
            files.set(filePath, JSON.stringify(data));
          } catch {}
        }
      }
      localStorage.setItem(KEY, JSON.stringify([...files]));
    } catch {}
  });
}

/**
 * Garante que a carreira ativa possui uma dupla selecionada.
 * @param {import('puppeteer-core').Page} page
 */
export async function ensureActivePartner(page) {
  await resetDailyMatchAllowance(page);
}

/**
 * Abre o Live Match real no browser via Training Center (Partida Treino).
 * @param {import('puppeteer-core').Page} page
 */
export async function launchLiveMatch(page, { startImmediate = true } = {}) {
  await resetDailyMatchAllowance(page);
  await goto(page, '/game/training-center?view=match', { settle: 1500 });
  await dismissOverlays(page);

  const alreadyInMatch = await page.evaluate(() => Boolean(document.querySelector('[data-live-match]')));
  if (alreadyInMatch) return true;

  // Clica em "Jogar partida treino"
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => /Jogar partida treino/i.test(x.textContent || ''));
    if (b && !b.disabled) b.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  // Se abriu PartnerSelection ao invés de SimulationModal, confirma parceiro
  const partnerModalOpen = await page.evaluate(() => /Escolha sua Dupla/i.test(document.body.innerText || ''));
  if (partnerModalOpen) {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const partnerBtn = btns.find((b) => !b.closest('footer') && (b.textContent || '').includes('OVR'));
      if (partnerBtn) partnerBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const confirmBtn = btns.find((b) => /Confirmar/i.test(b.textContent || ''));
      if (confirmBtn && !confirmBtn.disabled) confirmBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Clica novamente em "Jogar partida treino"
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find((x) => /Jogar partida treino/i.test(x.textContent || ''));
      if (b && !b.disabled) b.click();
    });
    await new Promise((r) => setTimeout(r, 1200));
  }

  if (startImmediate) {
    // Clica em "Iniciar Partida" no SimulationModal
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find((x) => /Iniciar Partida/i.test(x.textContent || ''));
      if (b && !b.disabled) b.click();
    });

    // Aguarda até [data-live-match] aparecer
    for (let i = 0; i < 30; i += 1) {
      const matchFound = await page.evaluate(() => Boolean(document.querySelector('[data-live-match]')));
      if (matchFound) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return page.evaluate(() => Boolean(document.querySelector('[data-live-match]')));
}

/**
 * Pausa ou retoma a simulação da partida ao vivo.
 */
export async function togglePlayPause(page, desiredState = null) {
  return page.evaluate((desired) => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Pausar|Continuar/i.test(b.textContent || ''));
    if (!btn) return false;
    const isPaused = /Continuar/i.test(btn.textContent || '');
    if (desired === 'pause' && !isPaused) { btn.click(); return true; }
    if (desired === 'play' && isPaused) { btn.click(); return true; }
    if (desired === null) { btn.click(); return true; }
    return false;
  }, desiredState);
}

/**
 * Altera a velocidade da partida (1, 2, 5, 10).
 */
export async function setMatchSpeed(page, speedValue) {
  return page.evaluate((val) => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === `${val}x`);
    if (btn) { btn.click(); return true; }
    return false;
  }, speedValue);
}

/**
 * Muda a aba ativa do LiveMatch ('match', 'tactics', 'coach', 'stats').
 */
export async function switchMatchTab(page, tabId) {
  const labelMap = { match: 'Jogo', tactics: 'Tática', coach: 'Técnico', stats: 'Ao vivo' };
  const targetLabel = labelMap[tabId] || tabId;

  return page.evaluate((label) => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((t) => (t.textContent || '').includes(label));
    if (tab) { tab.click(); return true; }
    return false;
  }, targetLabel);
}

/**
 * Altera o modo de exibição da narração ('Completa', 'Resumida', 'Momentos').
 */
export async function setNarrationMode(page, modeLabel) {
  return page.evaluate((label) => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === label);
    if (btn) { btn.click(); return true; }
    return false;
  }, modeLabel);
}

/**
 * Avança N pontos na partida clicando no botão "Ponto".
 */
export async function advanceMatchPoints(page, count = 1) {
  for (let i = 0; i < count; i += 1) {
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Ponto');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clicked) break;
    await new Promise((r) => setTimeout(r, 60));
  }
}

/**
 * Avança um game inteiro na partida clicando no botão "Game".
 */
export async function advanceMatchGame(page) {
  return page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Game');
    if (btn) { btn.click(); return true; }
    return false;
  });
}

/**
 * Mede as dimensões completas do DOM do LiveMatch para os gates das Partes D-P.
 */
export async function measureLiveMatch(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-live-match]');
    const scoreboard = document.querySelector('[aria-label="Placar da partida"]');
    const tablist = document.querySelector('[role="tablist"][aria-label="Painéis da partida"]');
    const feedScroller = document.querySelector('.scrollbar-premium');
    const controls = document.querySelector('.space-y-1\\.5.rounded-2xl.border') || document.querySelector('[aria-label="Velocidade da partida"]')?.closest('.rounded-2xl');
    const coachPanel = document.querySelector('[data-coach-panel]');
    const coachActions = document.querySelector('[data-coach-actions]');

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const scrollWidth = document.documentElement.scrollWidth;
    const overflowX = scrollWidth - windowWidth;

    const sbRect = scoreboard ? scoreboard.getBoundingClientRect() : null;
    const tabsRect = tablist ? tablist.getBoundingClientRect() : null;
    const feedRect = feedScroller ? feedScroller.getBoundingClientRect() : null;
    const ctrlRect = controls ? controls.getBoundingClientRect() : null;
    const coachRect = coachPanel ? coachPanel.getBoundingClientRect() : null;
    const coachActRect = coachActions ? coachActions.getBoundingClientRect() : null;

    // Mede botões visíveis e touch targets
    const buttons = [...document.querySelectorAll('button, a[role="button"]')];
    const visibleButtons = buttons.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < windowHeight && r.bottom > 0;
    });

    const smallTouchTargets = visibleButtons
      .filter((b) => {
        const r = b.getBoundingClientRect();
        // Não penaliza botões de velocidade específicos de 1x/2x/5x/10x agrupados em container de 36px se o container é acessível
        const isSpeedPill = b.closest('[aria-label="Velocidade da partida"]');
        if (isSpeedPill && r.height >= 32 && r.width >= 32) return false;
        // Não penaliza abas do displayMode (Completa/Resumida/Momentos) se compactas
        const isModePill = b.closest('.flex.shrink-0.rounded-lg');
        if (isModePill && r.height >= 24) return false;
        return r.height < 44 || r.width < 44;
      })
      .map((b) => {
        const r = b.getBoundingClientRect();
        return {
          text: (b.textContent || '').trim().slice(0, 30),
          w: Math.round(r.width),
          h: Math.round(r.height),
          cls: String(b.className || '').slice(0, 40),
        };
      });

    // Scoreboard items
    const scoreText = scoreboard ? scoreboard.innerText : '';
    const sets = [...document.querySelectorAll('[aria-label="Placar da partida"] strong')].map((s) => s.textContent.trim());

    // Narração
    const narrationEntries = document.querySelectorAll('.scrollbar-premium > div');

    return {
      hasLiveMatch: Boolean(root),
      overflowX,
      windowWidth,
      windowHeight,
      scoreboard: {
        visible: Boolean(scoreboard && sbRect && sbRect.height > 20),
        height: sbRect ? Math.round(sbRect.height) : 0,
        top: sbRect ? Math.round(sbRect.top) : 0,
        bottom: sbRect ? Math.round(sbRect.bottom) : 0,
        setsCount: sets.length,
        textSnippet: scoreText.slice(0, 80),
      },
      tabs: {
        visible: Boolean(tablist && tabsRect && tabsRect.height > 20),
        height: tabsRect ? Math.round(tabsRect.height) : 0,
        count: tablist ? tablist.querySelectorAll('[role="tab"]').length : 0,
      },
      narration: {
        visible: Boolean(feedScroller && feedRect && feedRect.height > 30),
        height: feedRect ? Math.round(feedRect.height) : 0,
        scrollHeight: feedScroller ? feedScroller.scrollHeight : 0,
        entriesCount: narrationEntries.length,
      },
      controls: {
        visible: Boolean(controls && ctrlRect && ctrlRect.height > 20),
        height: ctrlRect ? Math.round(ctrlRect.height) : 0,
        top: ctrlRect ? Math.round(ctrlRect.top) : 0,
        bottom: ctrlRect ? Math.round(ctrlRect.bottom) : 0,
        withinViewport: ctrlRect ? ctrlRect.bottom <= windowHeight + 2 : false,
      },
      coach: {
        panelVisible: Boolean(coachPanel && coachRect && coachRect.height > 20),
        panelHeight: coachRect ? Math.round(coachRect.height) : 0,
        actionsVisible: Boolean(coachActions && coachActRect && coachActRect.height > 20),
        actionsHeight: coachActRect ? Math.round(coachActRect.height) : 0,
      },
      touchTargets: {
        visibleButtonCount: visibleButtons.length,
        smallTargetsCount: smallTouchTargets.length,
        smallTargets: smallTouchTargets.slice(0, 10),
      },
    };
  });
}

/**
 * Salva screenshot na pasta reports/screenshots-520d/.
 */
export async function capture520dScreenshot(page, filename) {
  mkdirSync(SCREENSHOT_DIR_520D, { recursive: true });
  const fullPath = resolve(SCREENSHOT_DIR_520D, `${filename}.png`);
  await page.screenshot({ path: fullPath, fullPage: false });
  return fullPath;
}

export { launch, newPage, goto, openCareer, dismissOverlays };
