// Hotfix 5.31-B — reprodução do caso do Redmi 12 com LAYOUT REAL (CSS do app):
// Os módulos temporários usados (cópia do CoachCard do HEAD 68cb1f9 + montador) foram
// apagados ao fim da fase; o resultado está em coach-card-repro.json e compare/coach-card-repro-*.png.
// "Caio Silva" + RECOMENDADO + MELHOR CUSTO-BENEFÍCIO + OVR 44, renderizado
// no app (Vite) em 360/390, versão do APK 9006 (cópia temporária do HEAD)
// e versão corrigida, lado a lado. Também nome longo e OVR de 2 dígitos.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const p = (await b.pages()).find((x) => x.url().includes('5174'));
const cdp = await p.createCDPSession();
const out = {};
for (const vw of [360, 390]) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: vw, height: 900, deviceScaleFactor: 2, mobile: true });
  await sleep(500);
  const result = await p.evaluate(async (vw) => {
    const coaches = await import('/src/lib/coaches.js');
    const { mount } = await import('/src/components/coaches/__repro531b.tmp.jsx');
    const profile = { id: 'p', career_level: 1, coins: 950, reputation: 0, court_side: 'right' };
    const caio = coaches.COACHES_DATA.find((c) => c.name === 'Caio Silva');
    const base = coaches.evaluateCoachForCareer(caio, profile);
    const cases = [
      { id: 'caio-2-badges', evaluation: { ...base, overall: 44, recommended: true, bestValue: true } },
      { id: 'sem-badge', evaluation: { ...base, overall: 44, recommended: false, bestValue: false } },
      { id: 'nome-longo', evaluation: { ...base, coach: { ...caio, name: 'Maximiliano "Maxi" Fernández de la Cruz' }, overall: 72, recommended: true, bestValue: true } },
    ];
    document.getElementById('repro531b')?.remove();
    const host = document.createElement('div');
    host.id = 'repro531b';
    host.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow:auto;background:hsl(var(--background));padding:8px 12px;';
    document.body.appendChild(host);
    const rootEl = document.createElement('div'); host.appendChild(rootEl);
    mount(rootEl, cases, profile);
    await new Promise((r) => setTimeout(r, 800));
    const measure = (sel) => {
      const card = document.querySelector(`[data-case="${sel}"] [data-coach-card]`);
      const name = card.querySelector('h3');
      const badges = [...card.querySelectorAll('span.rounded-full')].filter((x) => /recomendado|custo/i.test(x.innerText));
      const ovr = [...card.querySelectorAll('p')].find((x) => /^\d{1,3}$/.test(x.innerText.trim()));
      const nr = name.getBoundingClientRect(); const or = ovr.getBoundingClientRect();
      const overlap = (a, b2) => !(a.right <= b2.left || b2.right <= a.left || a.bottom <= b2.top || b2.bottom <= a.top);
      return {
        name: name.innerText, nameTruncated: name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 1, nameWidth: Math.round(nr.width),
        badges: badges.map((x) => x.innerText), badgeClipped: badges.some((x) => x.scrollWidth > x.clientWidth + 1),
        badgeOverlapsOvr: badges.some((x) => overlap(x.getBoundingClientRect(), or)), ovr: ovr.innerText, ovrWidth: Math.round(or.width),
        cardHeight: Math.round(card.getBoundingClientRect().height), cardOverflow: card.scrollWidth > card.clientWidth + 1,
      };
    };
    const res = {};
    for (const c of ['caio-2-badges', 'sem-badge', 'nome-longo']) res[c] = { before: measure(`before-${c}`), after: measure(`after-${c}`) };
    return res;
  }, vw);
  await p.screenshot({ path: `reports/ui-hotfix-531b/compare/coach-card-repro-${vw}.png`, fullPage: false });
  out[vw] = result;
  await p.evaluate(() => document.getElementById('repro531b')?.remove());
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
writeFileSync('reports/ui-hotfix-531b/coach-card-repro.json', JSON.stringify(out, null, 2));
for (const [vw, r] of Object.entries(out)) for (const [k, v] of Object.entries(r)) console.log(vw, k.padEnd(14), 'ANTES', JSON.stringify({ trunc: v.before.nameTruncated, w: v.before.nameWidth, h: v.before.cardHeight }), 'DEPOIS', JSON.stringify({ trunc: v.after.nameTruncated, w: v.after.nameWidth, h: v.after.cardHeight, ovl: v.after.badgeOverlapsOvr, clip: v.after.badgeClipped }));
b.disconnect();
