import { attach } from './tauri.mjs';
const { browser, page, errors, state, shot, sleep, clickText } = await attach();
await page.goto('http://127.0.0.1:5174/tournaments', { waitUntil: 'networkidle2' }); await sleep(3000);
console.log('inscrever', await clickText('Inscrever', { exact: true }));
let s = await state(900); console.log('modal', JSON.stringify({ buttons: s.buttons.slice(-8), text: s.text.slice(-500) }));
const ok = (await clickText('Confirmar inscrição')) || (await clickText('Confirmar')) || (await clickText('Inscrever dupla'));
await sleep(2500); s = await state(600); await shot('t6-after-register');
console.log('confirmed', ok, JSON.stringify(s.text.slice(250, 600)), 'errors', JSON.stringify(errors));
browser.disconnect();
