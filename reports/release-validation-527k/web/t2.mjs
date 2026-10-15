import { attach } from './tauri.mjs';
const { browser, page, errors, state, shot, sleep } = await attach();
const out = [];
for (const [name, path] of [['home', '/career-hub'], ['training', '/career/training'], ['partner', '/partners'], ['tournaments', '/tournaments'], ['ranking', '/ranking'], ['calendar', '/game/calendar']]) {
  const before = errors.length; const t0 = Date.now();
  await page.goto(`http://127.0.0.1:5174${path}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2500);
  const s = await state(300);
  await shot(`page-${name}`);
  const crash = /Something went wrong|Algo deu errado|Erro inesperado|ErrorBoundary/i.test(s.text);
  out.push({ name, path, url: s.url, ms: Date.now() - t0, newErrors: errors.slice(before), crash, sample: s.text.slice(0, 160), buttons: s.buttons.slice(0, 12) });
}
console.log(JSON.stringify(out, null, 1));
browser.disconnect();
