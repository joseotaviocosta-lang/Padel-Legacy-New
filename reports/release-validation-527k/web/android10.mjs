import { attach } from './attach.mjs';
const { browser, page, state, shot, sleep } = await attach();
const tapBox = async (re) => page.evaluate((src) => { const rx = new RegExp(src); const els = [...document.querySelectorAll('button, a, [role=button]')].filter((b) => b.offsetParent && !b.disabled); const el = els.find((b) => rx.test((b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '))); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: (el.innerText || '').trim().slice(0, 40) }; }, re.source);
const go = async (re, name, wait = 6000) => { const b = await tapBox(re); if (b) { await sleep(500); const b2 = await tapBox(re); await page.touchscreen.tap((b2 || b).x, (b2 || b).y); } await sleep(wait); const s = await state(400); await shot(`a10-${name}`); const dlg = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map((d) => [...d.querySelectorAll('button')].map((x) => x.innerText.trim()).filter(Boolean))); console.log(name, JSON.stringify(b), '→', s.url, '| dialogs', JSON.stringify(dlg), '|', s.text.slice(150, 400)); };
await go(/^Analisar proposta$/, '1-analisar');
await go(/^Aceitar proposta$/, '2-aceitar', 12000);
browser.disconnect();
