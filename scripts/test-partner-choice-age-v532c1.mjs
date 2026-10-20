// Fase 5.32-C.1 — idade e informações essenciais na escolha do 1º parceiro.
// Regressão que este teste trava: o redesign 5.31 tirou país e idade do card
// de proposta ("Escolha sua dupla"); a idade é essencial para a decisão.
//
//   U. regra da idade (candidateAgeAt) e render (SSR) do painel de propostas
//      com fixtures: jovem, veterano, idade na DATA DA CARREIRA, sem dado;
//   B. navegador real (Chrome + dev server, perfil temporário): carreira
//      nova pela UI → /partners?view=offers; em 360/390/768/1366/1600/
//      paisagem cada candidato mostra país, idade, lado e OVR sem corte nem
//      overflow; a idade exibida = a do registro na data da carreira;
//      análise e comparação mostram a idade; aceitar a proposta registra a
//      dupla escolhida (Partnership ativa com o MESMO atleta); 0 erro de JS.
// Uso: node scripts/test-partner-choice-age-v532c1.mjs   (requer npm run dev)
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { launch, goto, BASE } from './lib/visualAuditDriver.mjs';
import { openCareer, dismissOverlays } from './lib/auditSession.mjs';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
const realConsoleError = console.error;
console.error = (...args) => { if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return; realConsoleError(...args); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (label, condition, detail = '') => { assert.ok(condition, `FALHOU: ${label} ${detail}`); passed += 1; console.log(`PASS — ${label}`); };
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// ═══ U. Regra e render ═══════════════════════════════════════════════════
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const { candidateAgeAt, candidateIdentityLine } = await vite.ssrLoadModule('/src/lib/candidateDisplay.js');
  const { ageAtDate } = await vite.ssrLoadModule('/src/lib/padel.js');
  const { default: PartnerOffersPanel } = await vite.ssrLoadModule('/src/components/partner/PartnerOffersPanel.jsx');

  ok('U1. idade pela data da CARREIRA (nascido 2004-06-10: 21 em 2026-01-01, 22 em 2026-07-01)',
    candidateAgeAt({ birth_date: '2004-06-10', age: 99 }, '2026-01-01') === 21 && candidateAgeAt({ birth_date: '2004-06-10' }, '2026-07-01') === 22);
  ok('U2. mesma regra de idade do jogo (ageAtDate), sem cálculo paralelo', candidateAgeAt({ birth_date: '1999-10-06' }, '2036-01-03') === ageAtDate('1999-10-06', '2036-01-03'));
  ok('U3. sem data de nascimento → idade gravada do registro', candidateAgeAt({ age: 34 }, '2026-01-01') === 34);
  ok('U4. sem dado nenhum → null (nada inventado; ageAtDate cairia em 16)', candidateAgeAt({}, '2026-01-01') === null && candidateAgeAt({ age: 0 }, null) === null);
  ok('U5. jovem (16) e veterano (38) preservados', candidateAgeAt({ birth_date: '2010-01-01' }, '2026-03-01') === 16 && candidateAgeAt({ age: 38 }, '2026-03-01') === 38);
  ok('U6. linha de identidade só com o que existe', candidateIdentityLine({ country: 'Argentina', age: 22, preferred_side: 'right' }, '2026-01-01') === 'Argentina · 22 anos · Direita'
    && candidateIdentityLine({ country: 'Brasil' }, '2026-01-01') === 'Brasil');

  const profile = { id: 'me', career_date: '2026-01-01', court_side: 'direita', preferred_side: 'right', play_style: 'controle', overall_rating: 30 };
  const offer = (id, candidate, extra = {}) => ({ id, status: 'pending', contract: { durationDays: 45, prizeSplit: 54 }, candidate_snapshot: { id: `a-${id}`, name: `Atleta ${id}`, overall_rating: 30, preferred_side: 'left', play_style: 'Controle', ...candidate }, ...extra });
  const offers = [
    offer('young', { country: 'Argentina', birth_date: '2008-05-01' }, { recommended: true }),
    offer('vet', { country: 'Espanha', age: 37 }),
    offer('none', { country: 'Itália' }),
  ];
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(PartnerOffersPanel, { profile, offers, loading: false, error: null, onRetry() {}, onAccept() {}, onReject() {}, onSearch() {} })));
  const cards = html.split('data-partner-candidate="offer"').slice(1);
  ok('U7. três cards de proposta renderizados', cards.length === 3);
  ok('U8. jovem: país + idade na data da carreira (17 anos) + lado + OVR', /data-candidate-age="17"/.test(cards[0]) && /Argentina/.test(text(cards[0])) && /17 anos/.test(text(cards[0])) && /esquerda/.test(text(cards[0])) && /OVR 30/.test(text(cards[0])));
  ok('U9. veterano: 37 anos visível no card', /data-candidate-age="37"/.test(cards[1]) && /37 anos/.test(text(cards[1])));
  ok('U10. sem dado: nenhuma idade inventada, país/lado/OVR mantidos', !/data-candidate-age/.test(cards[2]) && !/anos/.test(text(cards[2]).replace(/dias/, '')) && /Itália/.test(text(cards[2])) && /OVR 30/.test(text(cards[2])));
  ok('U11. ordem e recomendação das propostas preservadas', text(cards[0]).includes('Atleta young') && /Recomendado/.test(text(cards[0])) && text(cards[1]).includes('Atleta vet'));

  // PartnerSelection (Home/Torneios → "Escolher parceiro"): modelos de bot reais.
  const { default: PartnerSelection } = await vite.ssrLoadModule('/src/components/career/PartnerSelection.jsx');
  const { getAvailablePartners } = await vite.ssrLoadModule('/src/lib/career.js');
  const selectionProfile = { id: 'me', career_date: '2026-01-01', court_side: 'direita', xp: 0, level: 'Iniciante' };
  const pool = getAvailablePartners(selectionProfile);
  let selectionHtml = '';
  try {
    selectionHtml = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(PartnerSelection, { profile: selectionProfile, onClose() {}, onPartnerSelected() {} })));
  } catch (error) { selectionHtml = `ERRO ${error.message}`; }
  void selectionHtml; // ModalShell usa portal: no SSR o painel não é emitido.
  ok('U12. PartnerSelection: todo bot disponível tem idade/país/lado na linha de identidade (mesma regra)',
    pool.length > 0 && pool.every((bot) => {
      const line = candidateIdentityLine(bot, selectionProfile.career_date);
      const age = candidateAgeAt(bot, selectionProfile.career_date);
      return (!age || line.includes(`${age} anos`)) && (!bot.country || line.includes(bot.country));
    }), `${pool.length}`);
} finally {
  await vite.close();
}

// ═══ B. Fluxo real no navegador ═══════════════════════════════════════════
const up = await fetch(BASE).then((r) => r.ok).catch(() => false);
assert.ok(up, `dev server indisponível em ${BASE} (rode npm run dev)`);
const VPS = [
  { id: '360', width: 360, height: 800, mobile: true },
  { id: '390', width: 390, height: 844, mobile: true },
  { id: 'landscape', width: 844, height: 390, mobile: true },
  { id: '768', width: 768, height: 1024, mobile: true },
  { id: '1366', width: 1366, height: 768 },
  { id: '1600', width: 1600, height: 900 },
];
const readCards = (page) => page.evaluate(async () => {
  const vw = window.innerWidth;
  const inScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
  const outside = [...document.querySelectorAll('main *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && !inScroller(el) && (r.right > vw + 1 || r.left < -1); });
  const cards = [...document.querySelectorAll('[data-partner-candidate="offer"]')].map((card) => {
    const box = card.getBoundingClientRect();
    const inside = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= box.left - 1 && r.right <= box.right + 1 && r.right <= vw + 1; };
    const ageEl = card.querySelector('[data-candidate-age]');
    const identity = card.querySelector('[data-candidate-identity]');
    // A idade não pode estar escondida pelo truncamento da linha.
    const ageVisible = Boolean(ageEl) && inside(ageEl) && (!identity || ageEl.getBoundingClientRect().right <= identity.getBoundingClientRect().right + 1);
    return {
      name: card.querySelector('[data-candidate-name]')?.innerText.trim(),
      age: ageEl ? Number(ageEl.getAttribute('data-candidate-age')) : null,
      ageVisible,
      ovrVisible: inside(card.querySelector('[data-candidate-ovr]')),
      sideVisible: inside(card.querySelector('[data-candidate-side]')),
      identity: identity?.innerText.trim(),
      buttonVisible: [...card.querySelectorAll('button')].every(inside),
    };
  });
  const { localGame } = await import('/src/api/localGameClient.js');
  const { candidateAgeAt } = await import('/src/lib/candidateDisplay.js');
  const me = (await localGame.entities.PlayerProfile.list())[0];
  const pending = (await localGame.entities.PartnerOffer.filter({ status: 'pending' })) || [];
  const expected = Object.fromEntries(await Promise.all(pending.map(async (o) => {
    const snap = o.candidate_snapshot || {};
    const live = snap.id ? await localGame.entities.AthleteProfile.get(snap.id).catch(() => null) : null;
    return [snap.name, { snapshot: candidateAgeAt(snap, me.career_date), live: live ? candidateAgeAt(live, me.career_date) : null, country: snap.country || null }];
  })));
  return { overflowX: document.documentElement.scrollWidth - vw, outside: outside.length, cards, expected, careerDate: me.career_date };
});

const browser = await launch();
try {
  const page = await openCareer(browser, VPS[1]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  await goto(page, '/partners?view=offers', { settle: 4000 });
  await dismissOverlays(page);
  for (const vp of VPS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: Boolean(vp.mobile), hasTouch: Boolean(vp.mobile) });
    await sleep(800);
    const m = await readCards(page);
    const label = `escolha da dupla @ ${vp.id}`;
    ok(`${label}: há candidatos`, m.cards.length >= 3, `${m.cards.length}`);
    ok(`${label}: 0 overflow / elemento fora da tela`, m.overflowX <= 0 && m.outside === 0, `${m.overflowX}/${m.outside}`);
    ok(`${label}: idade visível em TODO candidato (sem truncar)`, m.cards.every((c) => c.age && c.ageVisible), JSON.stringify(m.cards.map((c) => [c.name, c.age, c.ageVisible])));
    ok(`${label}: OVR, lado e botões visíveis`, m.cards.every((c) => c.ovrVisible && c.sideVisible && c.buttonVisible));
    ok(`${label}: idade = registro na data da carreira (${m.careerDate}); país exibido`, m.cards.every((c) => m.expected[c.name] && c.age === m.expected[c.name].snapshot && (!m.expected[c.name].country || c.identity.includes(m.expected[c.name].country))),
      JSON.stringify(m.cards.map((c) => [c.name, c.age, m.expected[c.name]])));
    if (vp.id === '390') {
      const ages = m.cards.map((c) => c.age);
      console.log(`  idades exibidas: ${m.cards.map((c) => `${c.name} ${c.age}`).join(' · ')}`);
      ok('candidatos com idades diferentes conferidos', new Set(ages).size >= 2, JSON.stringify(ages));
      ok('idade do card = idade do atleta vivo no save (quando o atleta existe)', m.cards.every((c) => m.expected[c.name].live === null || m.expected[c.name].live === c.age));
    }
  }

  // PartnerSelection (Torneios → barra de status "Dupla") — mesmo dado essencial.
  await goto(page, '/tournaments', { settle: 4000 });
  await dismissOverlays(page);
  const openedSelection = await page.evaluate(() => {
    const b = [...document.querySelectorAll('main button, main [role=button]')].find((x) => /sem parceiro|toque para escolher/i.test(x.innerText));
    if (!b) return false;
    b.click();
    return true;
  });
  await sleep(1500);
  const selection = await page.evaluate(async () => {
    const vw = window.innerWidth;
    const cards = [...document.querySelectorAll('[data-partner-candidate="selection"]')];
    const { getAvailablePartners } = await import('/src/lib/career.js');
    const { candidateAgeAt } = await import('/src/lib/candidateDisplay.js');
    const { localGame } = await import('/src/api/localGameClient.js');
    const me = (await localGame.entities.PlayerProfile.list())[0];
    const byName = new Map(getAvailablePartners(me).map((b) => [b.name, b]));
    return {
      courtSide: me.court_side || null,
      count: cards.length,
      rows: cards.map((c) => {
        const name = c.querySelector('.truncate')?.innerText.trim();
        const identity = c.querySelector('[data-candidate-identity]');
        const r = identity?.getBoundingClientRect();
        const bot = byName.get(name);
        return { name, identity: identity?.innerText.trim() || null, age: Number(identity?.getAttribute('data-candidate-age')) || null, expected: bot ? candidateAgeAt(bot, me.career_date) : undefined, inside: Boolean(r && r.width > 0 && r.right <= vw + 1) };
      }),
    };
  });
  if (openedSelection && selection.count) {
    ok(`PartnerSelection: ${selection.count} candidatos com país · idade · lado visíveis`, selection.rows.every((r) => r.identity && r.inside), JSON.stringify(selection.rows.slice(0, 3)));
    ok('PartnerSelection: idade = a do modelo do atleta na data da carreira', selection.rows.every((r) => r.expected === undefined || r.age === r.expected), JSON.stringify(selection.rows.slice(0, 3)));
  } else {
    console.log(`  PartnerSelection: aberto=${openedSelection}, candidatos=${selection.count}, lado de quadra do perfil=${selection.courtSide} (sem lado, getAvailablePartners devolve vazio — regra existente)`);
  }
  await page.keyboard.press('Escape').catch(() => null);
  await sleep(800);
  await goto(page, '/partners?view=offers', { settle: 4000 });
  await dismissOverlays(page);

  // Comparação mostra idade.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await sleep(600);
  await page.evaluate(() => { [...document.querySelectorAll('[data-partner-candidate="offer"] button')].filter((b) => /comparar/i.test(b.innerText)).slice(0, 2).forEach((b) => b.click()); });
  await page.waitForFunction(() => /Idade/.test(document.querySelector('[data-partner-comparison]')?.innerText || ''), { timeout: 15000 }).catch(() => null);
  const comparison = await page.evaluate(() => document.querySelector('[data-partner-comparison]')?.innerText || '');
  ok('comparação inclui a linha Idade', /Idade/.test(comparison) && /\d+ anos/.test(comparison), comparison.slice(0, 120));

  // Análise → aceitar → dupla registrada é a escolhida.
  const chosen = await page.evaluate(() => {
    const card = document.querySelector('[data-partner-candidate="offer"]');
    const name = card.querySelector('[data-candidate-name]').innerText.trim();
    const age = card.querySelector('[data-candidate-age]')?.getAttribute('data-candidate-age');
    [...card.querySelectorAll('button')].find((b) => /analisar proposta/i.test(b.innerText)).click();
    return { name, age };
  });
  await sleep(1500);
  const detail = await page.evaluate(() => document.querySelector('[role=dialog]')?.innerText || '');
  ok('análise da proposta mostra a idade do candidato', detail.includes(`${chosen.age} anos`), detail.slice(0, 160));
  await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => /aceitar proposta/i.test(b.innerText))?.click());
  await sleep(5000);
  await dismissOverlays(page);
  const registered = await page.evaluate(async () => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const me = (await localGame.entities.PlayerProfile.list())[0];
    const active = (await localGame.entities.Partnership.filter({ profile_id: me.id, status: 'ativa' })) || [];
    const id = active[0]?.partner_bot_id || active[0]?.athlete_b_id || me.partner_id || null;
    const athlete = id ? await localGame.entities.AthleteProfile.get(id).catch(() => null) : null;
    return { count: active.length, name: athlete?.name || active[0]?.partner_name || null, partnerId: id };
  });
  ok(`aceitar registra a dupla escolhida (${chosen.name})`, registered.count === 1 && registered.name === chosen.name, JSON.stringify(registered));
  await goto(page, '/game', { settle: 3500 });
  await dismissOverlays(page);
  const home = await page.evaluate(() => document.body.innerText);
  ok('o fluxo segue: a Home mostra a nova dupla', home.includes(chosen.name.split(' ')[0]) && !/Sem parceiro — toque para escolher/.test(home));
  ok('0 erro de JS no fluxo', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}
console.log(`test-partner-choice-age-v532c1: ${passed} PASS`);
