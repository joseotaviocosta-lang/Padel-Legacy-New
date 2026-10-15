import { attach } from './tauri.mjs';
const { browser, page, errors, state, shot, sleep, clickText } = await attach();
await page.goto('http://127.0.0.1:5174/tournaments', { waitUntil: 'networkidle2' }); await sleep(3000);
let s = await state(1600); console.log(JSON.stringify({ buttons: s.buttons.slice(10, 60), text: s.text.slice(350, 1600) }, null, 1));
await shot('t5-tournaments'); console.log('errors', JSON.stringify(errors));
browser.disconnect();
