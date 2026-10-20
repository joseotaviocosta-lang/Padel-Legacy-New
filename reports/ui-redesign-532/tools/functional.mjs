// Fase 5.32-A — roteiro funcional com CLIQUES REAIS (mouse/teclado) a
// 390×844 sobre saves reais (cópia em memória — session.mjs). Só leitura e
// navegação: nada é aceito, contratado ou gravado pela tela de Ranking.
// Uso: node functional.mjs <estado>   (t5-com-dupla | t5-race-sem-dupla | t5-sem-dupla | carreira-nova)
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { openSession, spa, sleep, setViewport } from './session.mjs';

const STATE = process.argv[2] || 't5-com-dupla';
const SAVES = {
  't5-com-dupla': 'reports/ui-redesign-532/fixtures/t5-com-dupla.json',
  't5-race-sem-dupla': 'reports/ui-redesign-532/fixtures/t5-race-sem-dupla.json',
  'carreira-nova': 'reports/ui-redesign-532/fixtures/carreira-nova.json',
  't5-sem-dupla': 'reports/local-8a-career-audit/run10/save-season-5.json',
};
const file = SAVES[STATE];
const careerId = readFileSync(file, 'utf8').slice(0, 4000).match(/"career_id":"([^"]+)"/)[1];
const { browser, page } = await openSession({ save: { url: `/${file}`, careerId } });
await setViewport(page, 390);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
const steps = [];
async function step(name, run) {
  try { const ok = await run(); steps.push({ name, ok: Boolean(ok) }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`); }
  catch (error) { steps.push({ name, ok: false, error: String(error.message).slice(0, 160) }); console.log(`FAIL — ${name}: ${error.message}`); }
}
const has = (fn, arg) => page.evaluate(fn, arg);
async function clickEl(selectorFn, arg) {
  const box = await page.evaluate((src, a) => {
    // eslint-disable-next-line no-new-func
    const el = new Function('a', `return (${src})(a)`)(a);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selectorFn.toString(), arg);
  if (!box) return false;
  await sleep(300);
  await page.mouse.click(box.x, box.y);
  await sleep(1300);
  return true;
}
const rowTexts = () => has(() => [...document.querySelectorAll('ol[aria-label^="Classificação"] [data-ranking-row]')].map((li) => li.innerText.replace(/\s+/g, ' ')));
const rowPositions = () => has(() => [...document.querySelectorAll('ol[aria-label^="Classificação"] [data-ranking-row]')].map((li) => Number(li.innerText.trim().split(/\s/)[0]) || null));
async function typeSearch(value) {
  // Rola o campo para o centro antes do toque: perto do rodapé ele fica sob
  // a barra de navegação fixa (o toque iria para a barra).
  await has(() => document.querySelector('[data-ranking-filters] input').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await sleep(300);
  const box = await has(() => { const i = document.querySelector('[data-ranking-filters] input'); const r = i.getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y);
  await page.keyboard.type(value, { delay: 30 });
  await sleep(900);
}

// ── Mundial · Individual ──
await spa(page, '/ranking?scope=world&type=individual', 4000);
const ranked = await has(() => /#\d+/.test(document.querySelector('[data-ranking-hero]')?.innerText || ''));
await step('cartão "Sua posição mundial" no topo', async () => has(() => document.querySelector('[data-ranking-hero]')?.getAttribute('data-ranking-hero') === 'world-individual'));
await step('busca "coello" filtra a escada e esconde o pódio', async () => {
  await typeSearch('coello');
  const rows = await rowTexts();
  const podium = await has(() => Boolean(document.querySelector('[data-ranking-podium]')));
  return rows.length >= 1 && rows.every((t) => /coello/i.test(t)) && !podium;
});
await step('a posição das linhas filtradas é a original (não 1, 2, 3…)', async () => {
  const pos = await rowPositions();
  return pos.length >= 1 && pos.every((p) => p === null || p >= 1) && !(pos.length > 1 && pos.every((p, i) => p === i + 1));
});
await step('limpar a busca (X) restaura pódio e escada', async () => {
  await clickEl(() => document.querySelector('[aria-label="Limpar busca"]'));
  return has(() => Boolean(document.querySelector('[data-ranking-podium]')) && document.querySelector('[data-ranking-filters] input').value === '');
});
await step('chip "Top 100": só posições ≤ 100; tocar de novo desliga', async () => {
  await clickEl(() => [...document.querySelectorAll('[data-ranking-filters] button[aria-pressed]')].find((b) => b.innerText.trim() === 'Top 100'));
  const pos = await rowPositions();
  const pressed = await has(() => [...document.querySelectorAll('[data-ranking-filters] button[aria-pressed=true]')].map((b) => b.innerText.trim()).join());
  await clickEl(() => [...document.querySelectorAll('[data-ranking-filters] button[aria-pressed]')].find((b) => b.innerText.trim() === 'Top 100'));
  const off = await has(() => document.querySelectorAll('[data-ranking-filters] button[aria-pressed=true]').length === 0);
  return pos.length > 0 && pos.every((p) => p && p <= 100) && pressed === 'Top 100' && off;
});
await step('chip do país do jogador: todas as linhas do país', async () => {
  const country = await has(() => [...document.querySelectorAll('[data-ranking-filters] button[aria-pressed]')].map((b) => b.innerText.trim()).find((t) => t !== 'Top 100'));
  if (!country) return false;
  await clickEl((c) => [...document.querySelectorAll('[data-ranking-filters] button[aria-pressed]')].find((b) => b.innerText.trim() === c), country);
  const rows = await rowTexts();
  await clickEl((c) => [...document.querySelectorAll('[data-ranking-filters] button[aria-pressed]')].find((b) => b.innerText.trim() === c), country);
  return rows.length > 0 && rows.every((t) => t.includes(country));
});
if (ranked) {
  await step('"Ao seu redor": 5 linhas, a do meio é "Você"', async () => has(() => {
    const rows = [...document.querySelectorAll('[data-ranking-neighbors] [data-ranking-row]')];
    return rows.length === 5 && rows[2].getAttribute('data-self') === 'true';
  }));
  await step('"Ver na lista" abre as páginas até a sua linha e a centraliza', async () => {
    await clickEl(() => [...document.querySelectorAll('[data-ranking-neighbors] button')].find((b) => /Ver na lista/.test(b.innerText)));
    await sleep(800);
    return has(() => {
      const row = document.querySelector('ol[aria-label^="Classificação"] [data-self="true"]');
      if (!row) return false;
      const r = row.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    });
  });
}
await step('tocar numa linha abre o atleta (modal) e Esc fecha', async () => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await clickEl(() => document.querySelector('ol[aria-label^="Classificação"] [data-ranking-row] button'));
  const open = await has(() => Boolean([...document.querySelectorAll('[role=dialog]')].find((e) => e.getClientRects().length)));
  await page.keyboard.press('Escape'); await sleep(900);
  const closed = await has(() => ![...document.querySelectorAll('[role=dialog]')].find((e) => e.getClientRects().length));
  return open && closed;
});
await step('"Carregar mais posições" pagina a escada', async () => {
  const before = (await rowTexts()).length;
  const clicked = await clickEl(() => [...document.querySelectorAll('button')].find((b) => /Carregar mais posições/.test(b.innerText)));
  const after = (await rowTexts()).length;
  return clicked ? after > before : true;
});

// ── Mundial · Duplas ──
await spa(page, '/ranking?scope=world&type=doubles', 5000);
const pairKind = await has(() => document.querySelector('[data-ranking-hero]')?.getAttribute('data-ranking-hero'));
if (pairKind === 'world-doubles') {
  // 5.32-A.1 — contexto competitivo das duplas.
  await step('A.1 Duplas: "Ao seu redor" com 2 acima, a dupla e 2 abaixo (dois membros e pontos em cada)', async () => has(() => {
    const rows = [...document.querySelectorAll('[data-ranking-neighbors] [data-ranking-row="team"]')];
    return rows.length === 5 && rows[2].getAttribute('data-self') === 'true'
      && rows.every((li) => li.querySelectorAll('span.block').length >= 2 && /\d/.test(li.querySelector('.text-right p')?.innerText || ''));
  }));
  await step('A.1 Duplas: cartão diz quanto falta para subir (alvo com mais pontos), sem "lidera"', async () => has(() => {
    const hero = document.querySelector('[data-ranking-hero="world-doubles"]');
    const target = hero?.querySelector('[data-ranking-climb="target"]')?.innerText || '';
    return /^Faltam? \d/.test(target) && !/Faltam 0/.test(target) && !/lidera/.test(hero.innerText);
  }));
  await step('A.1 Duplas: empate em pontos dito como "Empate em #N" (posição dividida) quando há', async () => has(() => {
    const tie = document.querySelector('[data-ranking-hero="world-doubles"] [data-ranking-climb="tie"]');
    const rows = [...document.querySelectorAll('[data-ranking-neighbors] [data-ranking-row="team"]')];
    const pts = (li) => li.querySelector('.text-right p')?.innerText;
    const tiedAbove = rows[1] && pts(rows[1]) === pts(rows[2]);
    return tiedAbove ? /^Empate em #\d+ com /.test(tie?.innerText || '') : !tie;
  }));
  for (const vp of [360, 1600]) {
    await step(`A.1 Duplas @${vp}: linhas de "Ao seu redor" com posição, nomes e pontos inteiros`, async () => {
      await setViewport(page, vp);
      await page.waitForFunction(() => document.querySelectorAll('[data-ranking-neighbors] [data-ranking-row]').length > 0, { timeout: 120000 }).catch(() => null);
      await sleep(800);
      const okRows = await has(() => [...document.querySelectorAll('[data-ranking-neighbors] [data-ranking-row]')].every((li) => {
        const row = li.firstElementChild; const r = row.getBoundingClientRect();
        const name = row.querySelector('.min-w-0.flex-1 p').getBoundingClientRect(); const pts = row.lastElementChild.getBoundingClientRect();
        return name.right <= pts.left + 1 && pts.right <= r.right + 1 && r.right <= window.innerWidth + 1;
      }));
      const overflow = await has(() => document.documentElement.scrollWidth - window.innerWidth);
      // Trocar isMobile recarrega a página (puppeteer): espera a escada voltar.
      await setViewport(page, 390);
      await page.waitForFunction(() => document.querySelectorAll('ol[aria-label^="Classificação"] [data-ranking-row]').length > 0, { timeout: 120000 }).catch(() => null);
      await sleep(800);
      return okRows && overflow <= 0;
    });
  }
  await step('Duplas: exatamente uma linha "Sua dupla" na escada aberta (após "Ver na lista")', async () => {
    const jumped = await clickEl(() => [...document.querySelectorAll('[data-ranking-neighbors] button')].find((b) => /Ver na lista/.test(b.innerText)));
    const n = await has(() => document.querySelectorAll('ol[aria-label^="Classificação"] [data-self="true"]').length);
    return !jumped || n === 1;
  });
  await step('"Composição dos pontos" abre e fecha (detalhe sob demanda)', async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const hasBreakdown = await has(() => Boolean(document.querySelector('[data-ranking-breakdown]')));
    if (!hasBreakdown) return true;
    await clickEl(() => document.querySelector('[data-ranking-breakdown] summary'));
    const open = await has(() => document.querySelector('[data-ranking-breakdown]').open && /total/i.test(document.querySelector('[data-ranking-breakdown]').innerText));
    await clickEl(() => document.querySelector('[data-ranking-breakdown] summary'));
    return open && await has(() => !document.querySelector('[data-ranking-breakdown]').open);
  });
} else {
  await step('sem dupla: "Procurar parceiro" leva ao mercado de parceiros', async () => {
    await clickEl(() => [...document.querySelectorAll('[data-ranking-hero="no-pair"] button')].find((b) => /Procurar parceiro/.test(b.innerText)));
    const ok = await has(() => location.pathname === '/partners' && /view=offers/.test(location.search));
    await page.goBack(); await sleep(2500);
    return ok;
  });
}
await step('Duplas: busca por um membro acha a dupla (qualquer lado)', async () => {
  const second = await has(() => document.querySelector('ol[aria-label^="Classificação"] [data-ranking-row="team"] span.block:nth-child(2)')?.textContent.replace(/^&\s*/, '').trim().split(' ').slice(-1)[0]);
  if (!second) return false;
  await typeSearch(second);
  const rows = await rowTexts();
  await clickEl(() => document.querySelector('[aria-label="Limpar busca"]'));
  // A busca ignora acento/caixa (normalizeSearchText): compara do mesmo jeito.
  const norm = (v) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return rows.length > 0 && rows.every((t) => norm(t).includes(norm(second)));
});

// ── Race ──
await spa(page, '/ranking?scope=race&type=individual', 4000);
await step('Race individual: escada só com pontos > 0 (ou estado "ainda não começou")', async () => has(() => {
  const rows = [...document.querySelectorAll('ol[aria-label^="Classificação"] [data-ranking-row]')];
  if (!rows.length) return /ainda não começou/.test(document.querySelector('main').innerText);
  return rows.every((li) => Number(li.querySelector('.text-right p')?.innerText.replace(/\./g, '')) > 0);
}));
await step('Race: a micro-explicação traz o ano da carreira', async () => has(() => /Race \d{4}:/.test(document.querySelector('[data-ranking-period]')?.innerText || '')));
await spa(page, '/ranking?scope=race&type=doubles', 5000);
await step('Race duplas: escada só com pontos > 0 (ou "Ainda sem pontos na Race")', async () => has(() => {
  const rows = [...document.querySelectorAll('ol[aria-label^="Classificação"] [data-ranking-row]')];
  if (!rows.length) return /Ainda sem pontos na Race/.test(document.querySelector('main').innerText);
  return rows.every((li) => Number(li.querySelector('.text-right p')?.innerText.replace(/\./g, '')) > 0);
}));

// ── Links do circuito ──
await step('"países" leva ao diretório de países e voltar retorna ao Ranking', async () => {
  await clickEl(() => [...document.querySelectorAll('[data-ranking-world-links] button')].find((b) => /países/.test(b.textContent)));
  const ok = await has(() => location.pathname === '/world/directory' && /tab=countries/.test(location.search));
  await page.goBack(); await sleep(2500);
  return ok && await has(() => location.pathname === '/ranking');
});
await step('0 erro de JS no roteiro', async () => errors.length === 0);

const out = 'reports/ui-redesign-532/functional.json';
const prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
prev[STATE] = { ranked, pairKind, steps, errors, pass: steps.filter((s) => s.ok).length, total: steps.length, at: new Date().toISOString() };
writeFileSync(out, JSON.stringify(prev, null, 2));
console.log(`${STATE}: ${prev[STATE].pass}/${prev[STATE].total}`);
await browser.close();
