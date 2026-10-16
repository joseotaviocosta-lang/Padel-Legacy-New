// 5.30-B — lê (sem gravar) header, Tournament store e o que o header calcula.
import puppeteer from 'puppeteer-core';
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const p = (await b.pages()).find((x) => x.url().includes('5174'));
const out = await p.evaluate(async () => {
  const { localGame } = await import('/src/api/localGameClient.js');
  const { wasTournamentUnreachableAtCareerStart } = await import('/src/lib/tournamentRegistration.js');
  const user = await localGame.auth.me();
  const profiles = await localGame.entities.AthleteProfile.list('-created_date', 50);
  const header = document.querySelector('[data-header-tournament-shortcut]');
  const asc = await localGame.entities.Tournament.list('start_date', 2000);
  const desc = await localGame.entities.Tournament.list('-start_date', 2000);
  const all = await localGame.entities.Tournament.list('start_date', 100000);
  const pick = (t) => t && ({ id: t.id, name: t.name, tier: t.tier, start: t.start_date, status: t.status, exh: t.is_exhibition, unreachable: wasTournamentUnreachableAtCareerStart(t) });
  return {
    header: header?.textContent, headerAria: header?.getAttribute('aria-label'),
    total: all.length, ascLen: asc.length, descLen: desc.length,
    ascFirst: asc.slice(0, 3).map(pick), ascLast: pick(asc[asc.length - 1]),
    exhibitions: all.filter((t) => t.is_exhibition || t.tier === 'Exibição').map(pick),
    early: all.filter((t) => t.start_date >= '2026-01-01' && t.start_date <= '2026-02-05').map(pick),
  };
});
console.log(JSON.stringify(out, null, 2));
b.disconnect();
