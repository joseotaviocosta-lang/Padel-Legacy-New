import { attach } from './attach.mjs';
const { browser, page, state, shot, sleep, errors } = await attach();
const t0 = Date.now(); let s;
for (let i = 0; i < 15; i++) { s = await state(600); if (/INSCRIÇÕES|Ver detalhes|Inscrever/.test(s.text)) break; await sleep(3000); }
await shot('android-tournaments-wait');
console.log(JSON.stringify({ waitedMs: Date.now() - t0, loaded: /INSCRIÇÕES|Ver detalhes|Inscrever/.test(s.text), text: s.text.slice(0, 500), errors }, null, 1));
browser.disconnect();
