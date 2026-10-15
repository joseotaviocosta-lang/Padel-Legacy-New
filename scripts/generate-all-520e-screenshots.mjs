import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, goto, dismissOverlays, openCareer } from './lib/auditSession.mjs';

const OUT_DIR = resolve('reports/screenshots-520e');
mkdirSync(OUT_DIR, { recursive: true });

const DESKTOP_VP = { id: '1366', label: 'Notebook 1366x768', width: 1366, height: 768 };
const MOBILE_VP = { id: '390', label: 'Mobile 390x844', width: 390, height: 844, mobile: true };

const DESKTOP_SHOTS = [
  { name: '01-desktop-career-athlete.png', path: '/career/athlete?tab=profile' },
  { name: '02-desktop-career-training.png', path: '/career/training?tab=training' },
  { name: '03-desktop-career-team.png', path: '/career/team?tab=coach' },
  { name: '04-desktop-career-relations.png', path: '/career/relations?tab=relationships' },
  { name: '05-desktop-world-circuit.png', path: '/world/circuit?tab=news' },
  { name: '06-desktop-world-directory.png', path: '/world/directory?tab=athletes' },
  { name: '07-desktop-tournaments.png', path: '/tournaments' },
  { name: '08-desktop-ranking.png', path: '/ranking' },
];

const MOBILE_SHOTS = [
  { name: '09-mobile-career-athlete.png', path: '/career/athlete?tab=profile' },
  { name: '10-mobile-career-training.png', path: '/career/training?tab=training' },
  { name: '11-mobile-career-team.png', path: '/career/team?tab=coach' },
];

async function run() {
  console.log('\n=== Gerando Capturas Visuais 5.20-E em reports/screenshots-520e/ ===\n');

  const browser = await launch();

  try {
    // Desktop
    const dPage = await openCareer(browser, DESKTOP_VP);
    for (const s of DESKTOP_SHOTS) {
      await goto(dPage, s.path, { settle: 1500 });
      await dismissOverlays(dPage);
      const outPath = resolve(OUT_DIR, s.name);
      await dPage.screenshot({ path: outPath, fullPage: false });
      console.log(`✓ Screenshot gerado: ${s.name}`);
    }
    await dPage.close();

    // Mobile
    const mPage = await openCareer(browser, MOBILE_VP);
    for (const s of MOBILE_SHOTS) {
      await goto(mPage, s.path, { settle: 1500 });
      await dismissOverlays(mPage);
      const outPath = resolve(OUT_DIR, s.name);
      await mPage.screenshot({ path: outPath, fullPage: false });
      console.log(`✓ Screenshot gerado: ${s.name}`);
    }
    await mPage.close();

    console.log('\n=== Todas as capturas visuais 5.20-E foram geradas com sucesso! ===\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
