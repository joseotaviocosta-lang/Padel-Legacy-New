import { attach } from './tauri.mjs';
const { browser, page, errors, state, shot, sleep, clickText } = await attach();
await page.goto('http://127.0.0.1:5174/partners', { waitUntil: 'networkidle2' }); await sleep(2500);
console.log('mercado', await clickText('Mercado'));
const s = await state(1500); console.log(JSON.stringify({ url: s.url, buttons: s.buttons.slice(10, 70), text: s.text.slice(400, 1500) }, null, 1));
await shot('t3-market'); console.log('errors', JSON.stringify(errors));
browser.disconnect();
