import { attach } from './attach.mjs';
const BASE = 'http://tauri.localhost';
const { browser, page, errors, state, shot, sleep, clickText } = await attach();
const out = { steps: [] };
const step = async (name, fn) => { const t0 = Date.now(); let ok = false; let note = null; try { ok = await fn(); } catch (e) { note = e.message.slice(0, 200); } out.steps.push({ name, ok: Boolean(ok), ms: Date.now() - t0, note, newErrors: errors.splice(0) }); };
await step('abrir carreiras', async () => { await page.goto(`${BASE}/careers`, { waitUntil: 'networkidle2', timeout: 90000 }); await sleep(3000); return (await state()).text.includes('Nova carreira'); });
await step('criar carreira', async () => { await clickText('Nova carreira'); await page.type('input[placeholder="Ex.: Rumo ao topo"]', 'Smoke Android 527K'); await clickText('Criar carreira', { exact: true }); await sleep(6000); return /\/game|\/career/.test((await state()).url); });
for (const [n, p] of [['inicio', '/game'], ['treinos', '/career/training'], ['dupla', '/partners'], ['torneios', '/tournaments'], ['ranking', '/ranking']]) {
  await step(`página ${n}`, async () => { await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle2', timeout: 90000 }); await sleep(3500); const s = await state(); await shot(`android-${n}`); return !/Algo deu errado|Erro inesperado/.test(s.text) && s.text.length > 200; });
}
await step('formar dupla', async () => { await page.goto(`${BASE}/partners`, { waitUntil: 'networkidle2' }); await sleep(3000); await clickText('Mercado'); await clickText('Analisar proposta'); await clickText('Aceitar proposta'); await sleep(3000); return (await state(900)).text.includes('Dupla ativa'); });
await step('inscrever', async () => { await page.goto(`${BASE}/tournaments`, { waitUntil: 'networkidle2' }); await sleep(3500); await clickText('Inscrever', { exact: true }); await clickText('Confirmar inscrição'); await sleep(3000); return (await state(900)).text.includes('INSCRITO PARA ESTE TORNEIO'); });
console.log(JSON.stringify(out, null, 1));
browser.disconnect();
