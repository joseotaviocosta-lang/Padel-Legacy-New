import { attach } from './attach.mjs';
import { mobile } from './mob.mjs';
const { browser, page, state, shot, sleep, errors } = await attach();
const { tap, waitFor } = mobile(page, sleep, state, shot);
const log = [];
const step = async (name, fn) => { const t0 = Date.now(); let r; try { r = await fn(); } catch (e) { r = `erro ${e.message.slice(0, 100)}`; } log.push({ name, r, ms: Date.now() - t0, errors: errors.splice(0) }); console.log(JSON.stringify(log.at(-1))); };
const dateNow = async () => ((await state(400)).text.match(/\b(\d{2}\/\d{2})\b/) || [])[1];



await step('Confirmar inscrição', async () => (await tap(/^Confirmar inscrição$|^Confirmar$/, 6000)) && waitFor(/INSCRITO PARA ESTE TORNEIO|Inscrito/i, 60000));
await shot('a12-inscrito');
const days = [];
await step('Avançar até o torneio', async () => {
  for (let i = 0; i < 14; i++) {
    const t0 = Date.now();
    if ((await state(3000)).buttons.some((b) => /Ir para o torneio/.test(b))) break;
    await tap(/^Avançar$/, 2500);
    // Fecha o resumo do dia, se aparecer.
    await tap(/^Continuar$/, 1500);
    days.push({ date: await dateNow(), ms: Date.now() - t0 });
  }
  return days;
});
await shot('a12-dia-torneio');
console.log('dias', JSON.stringify(days));
browser.disconnect();
