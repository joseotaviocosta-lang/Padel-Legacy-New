import { attach } from './attach.mjs';
const { browser, page, state, shot } = await attach();
const s = await state(2500); await shot('android-proposta');
const dlg = await page.evaluate(() => [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].map((d) => ({ visible: Boolean(d.offsetParent) || getComputedStyle(d).position === 'fixed', text: d.innerText.replace(/\s+/g, ' ').slice(0, 300), buttons: [...d.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean) })));
console.log(JSON.stringify({ url: s.url, buttons: s.buttons, dialogs: dlg, text: s.text.slice(0, 900) }, null, 1));
browser.disconnect();
