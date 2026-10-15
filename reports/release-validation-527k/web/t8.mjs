import { attach } from './tauri.mjs';
const { browser, page, errors, state, shot, sleep, clickText } = await attach();
console.log('ir', await clickText('Ir para o torneio'));
await sleep(3000);
let s = await state(1500); await shot('t8-tournament');
console.log(JSON.stringify({ url: s.url, buttons: s.buttons.slice(8, 50), text: s.text.slice(300, 1500) }, null, 1)); console.log('errors', JSON.stringify(errors));
browser.disconnect();
