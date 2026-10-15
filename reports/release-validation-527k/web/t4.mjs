import { attach } from './tauri.mjs';
const { browser, page, errors, state, shot, sleep, clickText } = await attach();
await page.goto('http://127.0.0.1:5174/partners', { waitUntil: 'networkidle2' }); await sleep(2500);
await clickText('Mercado'); await clickText('Analisar proposta');
let s = await state(1200); console.log('modal', JSON.stringify({ buttons: s.buttons.slice(-15), text: s.text.slice(-700) }));
const accepted = (await clickText('Aceitar')) || (await clickText('Formar dupla')) || (await clickText('Assinar')) || (await clickText('Confirmar'));
await sleep(2500); s = await state(800); await shot('t4-after-accept');
console.log('accepted', accepted, JSON.stringify({ text: s.text.slice(300, 800), buttons: s.buttons.slice(-10) })); console.log('errors', JSON.stringify(errors));
browser.disconnect();
