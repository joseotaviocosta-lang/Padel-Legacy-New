import { attach } from './tauri.mjs';
const { browser, page, errors, shot, sleep } = await attach();
const PRIORITY = ['Continuar', 'Jogo equilibrado', 'Salvar plano do torneio', 'Confirmar', 'Iniciar partida', 'Começar partida', 'Entrar em quadra', 'Jogar partida', 'Jogar', 'Simular partida', 'Simular', 'Pular para o fim', 'Pular', 'Finalizar partida', 'Concluir', 'Ver resultado', 'Fechar'];
const log = [];
for (let i = 0; i < 40; i++) {
  const r = await page.evaluate((PRIORITY) => {
    const ds = [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].filter((d) => d.offsetParent || getComputedStyle(d).position === 'fixed');
    const top = ds.at(-1); if (!top) return { none: true };
    const btns = [...top.querySelectorAll('button')].filter((b) => b.offsetParent && !b.disabled);
    for (const p of PRIORITY) { const b = btns.find((x) => x.innerText.trim().replace(/\s+/g, ' ').startsWith(p)); if (b) { b.click(); return { clicked: p, dialog: top.innerText.replace(/\s+/g, ' ').slice(0, 160), all: btns.map((x) => x.innerText.trim()).slice(0, 12) }; } }
    return { stuck: true, dialog: top.innerText.replace(/\s+/g, ' ').slice(0, 300), all: btns.map((x) => x.innerText.trim()).slice(0, 20) };
  }, PRIORITY);
  log.push(r); await sleep(r.clicked && /Simular|Pular|Jogar|Iniciar|Começar/.test(r.clicked) ? 6000 : 2000);
  if (r.none || r.stuck) break;
}
await shot('t11-flow');
const page2 = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 900));
console.log(JSON.stringify(log, null, 1)); console.log('page', page2); console.log('errors', JSON.stringify(errors));
browser.disconnect();
