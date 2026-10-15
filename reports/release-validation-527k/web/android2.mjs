import { attach } from './attach.mjs';
const { browser, page, errors, state, shot, sleep, clickText } = await attach();
const nav = async (path) => { await page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, path); await sleep(4000); };
const out = { steps: [] };
const step = async (name, fn) => { const t0 = Date.now(); let ok = false; let note = null; try { ok = await fn(); } catch (e) { note = e.message.slice(0, 200); } const s = await state(200).catch(() => ({})); out.steps.push({ name, ok: Boolean(ok), ms: Date.now() - t0, url: s.url, note, newErrors: errors.splice(0) }); };
await step('continuar carreira Android', async () => { await sleep(2000); const s = await state(); if (s.url.startsWith('/careers')) { await clickText('Continuar carreira'); await sleep(5000); } return !(await state()).url.startsWith('/careers'); });
for (const [n, p] of [['inicio', '/game'], ['treinos', '/career/training'], ['dupla', '/partners'], ['torneios', '/tournaments'], ['ranking', '/ranking']]) {
  await step(`página ${n}`, async () => { await nav(p); const s = await state(400); await shot(`android-${n}`); return s.url.startsWith(p) && !/Algo deu errado|Erro inesperado/.test(s.text) && s.text.length > 200; });
}
await step('formar dupla', async () => { await nav('/partners'); await clickText('Mercado'); await clickText('Analisar proposta'); await clickText('Aceitar proposta'); await sleep(3000); return (await state(1200)).text.includes('Dupla ativa'); });
await step('inscrever', async () => { await nav('/tournaments'); await sleep(2000); await clickText('Inscrever', { exact: true }); await clickText('Confirmar inscrição'); await sleep(3000); return (await state(1200)).text.includes('INSCRITO PARA ESTE TORNEIO'); });
console.log(JSON.stringify(out, null, 1));
browser.disconnect();
