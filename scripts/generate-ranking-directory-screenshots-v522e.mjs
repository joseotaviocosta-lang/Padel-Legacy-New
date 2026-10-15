// Playthrough 5.22-E, Parte AO — capturas de Mundial, Race, Duplas, Clubes e
// Países em desktop e mobile (390 e 360), e medição da altura do bloco do
// jogador até o início da lista.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, goto, dismissOverlays, openCareer } from './lib/auditSession.mjs';

const OUT_DIR = resolve('reports/screenshots-522e');
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { id: 'desktop', label: '1366x768', width: 1366, height: 768 },
  { id: '390', label: '390x844', width: 390, height: 844, mobile: true },
  { id: '360', label: '360x800', width: 360, height: 800, mobile: true },
];

const SHOTS = [
  { name: 'mundial', path: '/ranking?tab=circuit', anchor: 'Sua posição mundial' },
  { name: 'race', path: '/ranking?tab=race', anchor: 'Sua temporada' },
  { name: 'duplas', path: '/ranking?tab=teams', anchor: 'Sua dupla' },
  { name: 'clubes', path: '/world/directory?tab=clubs', anchor: 'Clubes' },
  { name: 'paises', path: '/world/directory?tab=countries', anchor: 'Países' },
];

async function measureBlock(page, anchorText) {
  return page.evaluate((anchor) => {
    const nodes = [...document.querySelectorAll('p, h1, h2, h3')];
    const target = nodes.find((n) => (n.textContent || '').trim().toLowerCase().startsWith(anchor.toLowerCase()));
    if (!target) return null;
    const block = target.closest('[class*="rounded-2xl"]') || target.parentElement;
    const rect = block.getBoundingClientRect();
    const listStart = [...document.querySelectorAll('[data-compact-list-item], .pl-compact-list-item, [class*="render-window"] > *')]
      .map((n) => n.getBoundingClientRect().top)
      .filter((top) => top > rect.top);
    return {
      blockHeight: Math.round(rect.height),
      blockTop: Math.round(rect.top),
      listStart: listStart.length ? Math.round(Math.min(...listStart)) : null,
      distanceBlockToStart: listStart.length ? Math.round(Math.min(...listStart) - rect.top) : null,
    };
  }, anchorText).catch(() => null);
}

async function run() {
  const browser = await launch();
  const measurements = {};
  try {
    for (const vp of VIEWPORTS) {
      const page = await openCareer(browser, vp);
      for (const shot of SHOTS) {
        await goto(page, shot.path, { settle: 1800 });
        await dismissOverlays(page);
        const outPath = resolve(OUT_DIR, `${shot.name}-${vp.id}.png`);
        await page.screenshot({ path: outPath, fullPage: false });
        const measured = await measureBlock(page, shot.anchor);
        measurements[`${shot.name}-${vp.id}`] = measured;
        console.log(`✓ ${shot.name}-${vp.id}.png${measured ? ` (bloco ${measured.blockHeight}px)` : ''}`);
      }
      await page.close();
    }
    writeFileSync(resolve(OUT_DIR, 'measurements.json'), JSON.stringify(measurements, null, 2));
    console.log(`\nMedições salvas em reports/screenshots-522e/measurements.json`);
  } finally {
    await browser.close();
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
