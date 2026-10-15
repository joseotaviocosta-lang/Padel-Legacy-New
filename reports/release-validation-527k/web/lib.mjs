import puppeteer from 'puppeteer-core';
export async function open() {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'], userDataDir: 'C:/Users/joseo/AppData/Local/Temp/claude/c--Projetos-Padel-Legacy-New/f701e79a-ea2d-496d-88ec-2819a1d499fd/scratchpad/chrome-527k' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 240)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 240)}`); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clickText = async (t, { exact = false } = {}) => { const ok = await page.evaluate((t, exact) => { const el = [...document.querySelectorAll('button, a, [role=button], [role=tab], label')].find((b) => { const s = (b.innerText || b.getAttribute('aria-label') || '').trim(); return exact ? s === t : s.includes(t); }); if (el && !el.disabled) { el.scrollIntoView(); el.click(); return true; } return false; }, t, exact); await sleep(1500); return ok; };
  const state = async () => page.evaluate(() => ({ url: location.pathname, buttons: [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 50), inputs: [...document.querySelectorAll('input,select,textarea')].filter((i) => i.offsetParent).map((i) => `${i.type}:${i.name || i.placeholder || i.id}`), text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 500) }));
  const shot = (n) => page.screenshot({ path: `reports/release-validation-527k/web/${n}.png` });
  return { browser, page, errors, sleep, clickText, state, shot };
}
