import { attach } from './tauri.mjs';
const { browser, page, errors, shot, sleep } = await attach();
const dialogs = async () => page.evaluate(() => [...document.querySelectorAll('[role=dialog], [aria-modal=true], .fixed.inset-0')].filter((d) => d.offsetParent || getComputedStyle(d).position === 'fixed').map((d) => ({ text: d.innerText.replace(/\s+/g, ' ').slice(0, 600), buttons: [...d.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean) })));
console.log('antes', JSON.stringify(await dialogs()));
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].filter((x) => x.offsetParent && x.innerText.trim() === 'Preparar'); b[0]?.click(); });
await sleep(2500); await shot('t10-prep');
console.log('depois', JSON.stringify(await dialogs(), null, 1)); console.log('errors', JSON.stringify(errors));
browser.disconnect();
