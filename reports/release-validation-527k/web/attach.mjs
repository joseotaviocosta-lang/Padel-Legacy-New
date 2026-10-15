import puppeteer from 'puppeteer-core';
export async function attach() {
  const browser = await puppeteer.connect({ browserURL: process.env.DEVTOOLS || 'http://127.0.0.1:9223', defaultViewport: null });
  const [page] = (await browser.pages()).filter((p) => /5174|tauri.localhost/.test(p.url()));
  const errors = []; page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 240)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 240)}`); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clickText = async (t, { exact = false, within = null } = {}) => { const ok = await page.evaluate((t, exact, within) => { const root = within ? document.querySelector(within) || document : document; const el = [...root.querySelectorAll('button, a, [role=button], [role=tab], [role=menuitem]')].filter((b) => b.offsetParent).find((b) => { const s = (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '); return exact ? s === t : s.includes(t); }); if (el && !el.disabled) { el.scrollIntoView({ block: 'center' }); el.click(); return true; } return false; }, t, exact, within); await sleep(1800); return ok; };
  const state = async (n = 600) => page.evaluate((n) => ({ url: location.pathname + location.search, buttons: [...document.querySelectorAll('button, [role=button]')].filter((b) => b.offsetParent).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 70), inputs: [...document.querySelectorAll('input,select,textarea')].filter((i) => i.offsetParent).map((i) => `${i.type}:${i.name || i.placeholder || i.id}`), text: document.body.innerText.replace(/\s+/g, ' ').slice(0, n) }), n);
  const shot = (name) => page.screenshot({ path: `reports/release-validation-527k/web/${name}.png` });
  return { browser, page, errors, sleep, clickText, state, shot };
}
