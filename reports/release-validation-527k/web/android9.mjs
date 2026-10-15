import { attach } from './attach.mjs';
const { browser, page, state, shot, sleep } = await attach();
const tapBox = async (re) => page.evaluate((src) => { const rx = new RegExp(src); const els = [...document.querySelectorAll('button, a, [role=button]')].filter((b) => b.offsetParent && !b.disabled); const el = els.find((b) => rx.test((b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '))); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: (el.innerText || '').trim().slice(0, 40), href: el.getAttribute('href') }; }, re.source);
const go = async (re, name, wait = 8000) => { const b = await tapBox(re); if (b) { await sleep(300); await page.touchscreen.tap(b.x, b.y); } await sleep(wait); const s = await state(300); await shot(`a9-${name}`); console.log(name, JSON.stringify(b), '→', s.url, '|', s.buttons.slice(4, 22).join(' · ')); };
await go(/^Carreira$/, '1-carreira');
await go(/Minha dupla/, '2-minhadupla', 15000);
browser.disconnect();
