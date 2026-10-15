import { attach } from './attach.mjs';
const { browser, page, state, shot } = await attach();
const s = await state(1500); await shot('android-now');
console.log(JSON.stringify({ url: s.url, text: s.text, buttons: s.buttons.slice(0, 30) }, null, 1));
browser.disconnect();
