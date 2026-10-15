import { attach } from './attach.mjs';
const { browser, page, shot } = await attach();
await shot('a14-now');
const info = await page.evaluate(() => { const vis = (e) => e.getClientRects().length > 0; return { url: location.pathname, buttons: [...document.querySelectorAll('button,a,[role=button]')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40), dialogs: [...document.querySelectorAll('[role=dialog],[aria-modal=true]')].filter(vis).map((d) => d.innerText.replace(/\s+/g, ' ').slice(0, 300)) }; });
console.log(JSON.stringify(info, null, 1));
browser.disconnect();
