import { attach } from './tauri.mjs';
const { browser, page, errors, state, shot, sleep, clickText } = await attach();
await page.goto('http://127.0.0.1:5174/game', { waitUntil: 'networkidle2' }); await sleep(2500);
const dateOf = (t) => (t.match(/\b(\d{2}\/\d{2}\/2026)\b/) || [])[1];
const log = [];
for (let i = 0; i < 16; i++) {
  const t0 = Date.now();
  const clicked = await clickText('Avançar', { exact: false });
  await sleep(3500);
  const s = await state(2500);
  log.push({ i, clicked, date: dateOf(s.text), ms: Date.now() - t0, hint: (s.text.match(/(Jogar[^.]{0,60}|Iniciar[^.]{0,60}|Decisão[^.]{0,60}|sorteio[^.]{0,60}|chave[^.]{0,40})/i) || [])[0] || null, dialogs: s.buttons.filter((b) => /Jogar|Iniciar|Confirmar|Continuar|Entrar|Partida|Ir para/i.test(b)).slice(0, 6) });
  if (s.buttons.some((b) => /Jogar|Iniciar partida|Entrar na quadra/i.test(b))) break;
}
await shot('t7-advance'); console.log(JSON.stringify(log, null, 1)); console.log('errors', JSON.stringify(errors));
browser.disconnect();
