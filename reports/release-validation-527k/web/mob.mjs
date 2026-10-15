// Helpers de toque para o WebView Android (bottom sheets são position:fixed → offsetParent null).
export function mobile(page, sleep, state, shot) {
  const box = (re) => page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const els = [...document.querySelectorAll('button, a, [role=button]')].filter((b) => vis(b) && !b.disabled);
    // Preferir o que estiver dentro de diálogo/sheet aberto (o último).
    const sheets = [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].filter(vis);
    const pool = sheets.length ? [...sheets.at(-1).querySelectorAll('button, a, [role=button]')].filter((b) => vis(b) && !b.disabled).concat(els) : els;
    const el = pool.find((b) => rx.test((b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')));
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    return true;
  }, re.source);
  const measure = (re) => page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const vis = (e) => e.getClientRects().length > 0;
    const sheets = [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].filter(vis);
    const all = [...document.querySelectorAll('button, a, [role=button]')].filter((b) => vis(b) && !b.disabled);
    const pool = sheets.length ? [...sheets.at(-1).querySelectorAll('button, a, [role=button]')].filter((b) => vis(b) && !b.disabled).concat(all) : all;
    const el = pool.find((b) => rx.test((b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')));
    if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, re.source);
  const tap = async (re, wait = 5000) => { if (!(await box(re))) return false; await sleep(600); const m = await measure(re); if (!m) return false; await page.touchscreen.tap(m.x, m.y); await sleep(wait); return true; };
  const waitFor = async (re, max = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { const s = await state(6000); if (re.test(s.text)) return Date.now() - t0; await sleep(2000); } return null; };
  return { tap, waitFor };
}
