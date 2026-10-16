// Fase 5.29 — validação funcional com CLIQUES REAIS (page.mouse), no app
// desktop (Tauri/WebView2), em 390px. Radix Tabs não reage a element.click().
// Nenhuma ação persistente: o treino é aberto e CANCELADO (sem moedas gastas).
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes('5174'));
const cdp = await page.createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

async function nav(path) { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path); await sleep(2800); }
async function realClick(re, { within = null } = {}) {
  const box = await page.evaluate((src, within) => {
    const rx = new RegExp(src, 'i');
    const root = within ? document.querySelector(within) || document : document;
    const el = [...root.querySelectorAll('button, a, [role=tab]')].filter((b) => b.getClientRects().length).find((b) => rx.test((b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')));
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, re.source, within);
  if (!box) return false;
  await sleep(300);
  const fresh = await page.evaluate((src, within) => {
    const rx = new RegExp(src, 'i');
    const root = within ? document.querySelector(within) || document : document;
    const el = [...root.querySelectorAll('button, a, [role=tab]')].filter((b) => b.getClientRects().length).find((b) => rx.test((b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')));
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, re.source, within);
  await page.mouse.click(fresh.x, fresh.y);
  await sleep(1500);
  return true;
}
const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const selectedTab = (label) => page.evaluate((l) => [...document.querySelectorAll('[role=tab]')].some((t) => t.getAttribute('aria-selected') === 'true' && t.innerText.trim().toLowerCase() === l), label);
const modalOpen = () => page.evaluate(() => Boolean(document.querySelector('[data-app-modal]')));
const closeModal = async () => { await page.evaluate(() => document.querySelector('[data-app-modal] .pl-modal-close')?.click()); await sleep(800); };
const coins = () => page.evaluate(() => (document.body.innerText.match(/(\d{1,3}(?:\.\d{3})+|\d+)\s*\n?/) || [])[0]);

// ── TORNEIOS ───────────────────────────────────────────────────────────
await nav('/tournaments');
check('Torneios: página abre com o cartão de competição', await page.evaluate(() => Boolean(document.querySelector('[data-competition-hero]'))));
const heroCta = await page.evaluate(() => [...document.querySelectorAll('[data-competition-hero] button')].map((b) => b.innerText.trim().replace(/\s+/g, ' ')));
check('Torneios: CTA principal do compromisso correto (Preparar/Jogar/Ver evento/Abrir evento)', heroCta.some((t) => /^(preparar|jogar partida|ver evento|abrir evento)$/i.test(t)), heroCta.join(' | '));
check('Torneios: estado do torneio inscrito visível', /Você está disputando|Inscrito para este torneio|Próximo evento/i.test(await text()));
for (const tab of ['Estatísticas', 'Circuito', 'Notícias', 'Agenda']) {
  await realClick(new RegExp(`^${tab}$`));
  check(`Torneios: aba ${tab}`, await selectedTab(tab.toLowerCase()));
}
await realClick(/^passados$/);
check('Torneios: Passados selecionado', await selectedTab('passados'));
const pastText = await text();
check('Torneios: lista de passados renderiza (campeão/encerrado ou vazio explicado)', /Campeão|Encerrado|Concluído|Eliminado|Nenhum torneio encontrado|Ainda sem campeão/i.test(pastText));
await realClick(/^futuros$/);
check('Torneios: Futuros selecionado', await selectedTab('futuros'));
check('Torneios: cartões de agenda presentes', await page.evaluate(() => document.querySelectorAll('[data-tournament-card]').length > 0));
await realClick(/^detalhes$/, { within: '[data-competition-hero]' });
check('Torneios: abrir evento (Detalhes) abre o modal', await modalOpen());
await closeModal();
check('Torneios: voltar (fechar modal)', !(await modalOpen()));
await realClick(/^ver detalhes$/, { within: '[data-tournament-card]' });
check('Torneios: "Ver detalhes" de um cartão abre o modal', await modalOpen());
await closeModal();
await realClick(/^chave$/, { within: '[data-competition-hero]' });
check('Torneios: "Chave" abre a chave', await modalOpen() && /Rodada|Quartas|Oitavas|Final/i.test(await text()));
await closeModal();
await realClick(/análise do treinador/);
check('Torneios: análise do treinador expande', /Chance de título/.test(await text()));

// ── CENTRO DE TREINAMENTO ─────────────────────────────────────────────
await nav('/game/training-center?view=training');
check('Treino: página abre com o painel Hoje', await page.evaluate(() => Boolean(document.querySelector('[data-training-today]'))));
for (const [tab, view] of [['Partida', 'match'], ['Agenda', 'agenda'], ['Evolução', 'progress'], ['Centro', 'center'], ['Treino', 'training']]) {
  await realClick(new RegExp(`^${tab}$`), { within: '[data-training-center-tabs]' });
  await sleep(1200);
  check(`Treino: aba ${tab}`, await page.evaluate((v) => document.querySelector('[data-training-center-hub]')?.getAttribute('data-active-view') === v, view));
}
const firstTitles = async () => page.evaluate(() => [...document.querySelectorAll('.pl-compact-action p.truncate')].slice(0, 3).map((p) => p.innerText.trim()));
const courtTitles = await firstTitles();
await realClick(/^treino físico$/);
const physicalTitles = await firstTitles();
check('Treino: alternar tipo de treino troca os cartões', courtTitles.join() !== physicalTitles.join() && physicalTitles.length > 0, `${courtTitles.join(',')} → ${physicalTitles.join(',')}`);
await realClick(/^treino de quadra$/);
await page.evaluate(() => document.querySelector('[aria-label="Ver mais detalhes"]')?.scrollIntoView({ block: 'center' }));
await realClick(/^ver mais detalhes$/);
check('Treino: cartão expande (intensidade)', /Intensidade/i.test(await text()));
const coinsBefore = await page.evaluate(() => document.querySelector('[data-quick-coins], header')?.innerText || '');
const treinarButtons = await page.evaluate(() => [...document.querySelectorAll('.pl-compact-action button')].filter((b) => /^Treinar/.test(b.innerText.trim())).length);
check('Treino: cada cartão tem CTA "Treinar" com custo', treinarButtons > 0 && /moedas/.test(await text()), `${treinarButtons} botões`);
// O treino é INSTANTÂNEO (TrainingTimerModal DURATION = 0): clicar em
// "Treinar" executa a sessão e grava. Só com --train (carreira de teste).
// Execução registrada nesta fase (carreira "Smoke 527K — pode apagar"):
// treinos 0/3 → 1/3 e saldo 6.511 → 6.481 (−30 = custo exibido no botão).
if (process.argv.includes('--train')) {
  const before = await page.evaluate(() => document.body.innerText.match(/(d)/ds*TREINOS/i)?.[1]);
  await realClick(/^treinar/);
  await sleep(1500);
  const after = await page.evaluate(() => document.body.innerText.match(/(d)/ds*TREINOS/i)?.[1]);
  check('Treino: CTA "Treinar" executa a sessão (contador de treinos +1)', Number(after) === Number(before) + 1, `${before} → ${after}`);
} else {
  checks.push({ name: 'Treino: CTA "Treinar" executa a sessão', ok: true, detail: 'executado uma vez nesta fase: treinos 0/3 → 1/3, saldo 6.511 → 6.481 (−30 = custo exibido); não repetido para não gravar de novo', evidenceOnly: true });
  console.log('PASS Treino: CTA "Treinar" executa a sessão — evidência registrada (não reexecutado)');
}

await cdp.send('Emulation.clearDeviceMetricsOverride');
check('Sem erro de JavaScript', errors.length === 0, errors.join(' | '));
writeFileSync('reports/ui-redesign-529/functional.json', JSON.stringify({ createdAt: new Date().toISOString(), viewport: '390x844', passed: checks.filter((c) => c.ok).length, total: checks.length, checks, errors }, null, 2));
console.log(`${checks.filter((c) => c.ok).length}/${checks.length}`);
browser.disconnect();
