// Playthrough 5.20-B, Parte AE — FOLGA DO BALAO DE AJUDA.
//
// O teste M4.1 listava "colisao visual do GuideButton" entre os gates FISICOS
// NAO AUTOMATIZADOS: era sabido e nunca medido. Este teste mede.
//
// A distincao que importa: um FAB fixo passar por cima do conteudo DURANTE a
// rolagem e comportamento normal — o jogador rola e o controle reaparece. O
// defeito e a pagina TERMINAR embaixo dele, deixando um controle coberto sem
// nenhuma rolagem que o liberte. Medido em 360px com a pagina no fim da
// rolagem, a Home deixava "Sem parceiro — toque para escolher" nessa situacao.
//
// Gate: nenhum controle coberto pelo balao no fim da rolagem.
import { launch, goto, dismissOverlays, openCareer } from './lib/auditSession.mjs';
import { VIEWPORTS } from './lib/visualAuditDriver.mjs';
let passed = 0; let failed = 0;

// O app redireciona DEPOIS do load (guarda de carreira, LegacyRedirect), e um
// evaluate que caia nessa janela morre com "Execution context was destroyed".
// Isso ja derrubou tres medicoes desta fase; aqui esta num teste permanente,
// entao nao pode depender de sorte de temporizacao: a leitura e refeita
// quando o contexto morre, em vez de o teste virar vermelho por navegacao.
async function evaluateStable(page, fn, tentativas = 4) {
  let ultimo;
  for (let i = 0; i < tentativas; i += 1) {
    try { return await page.evaluate(fn); }
    catch (error) {
      ultimo = error;
      if (!/Execution context was destroyed|Target closed/.test(String(error.message))) throw error;
      await new Promise((r) => setTimeout(r, 900));
    }
  }
  throw ultimo;
}
const browser = await launch();
const page = await openCareer(browser, VIEWPORTS.find((v) => v.width === 360));
for (const [label, path] of [['Home', '/game'], ['Torneios', '/tournaments'], ['Minha Dupla', '/partners']]) {
  await goto(page, path); await dismissOverlays(page);
  const d = await evaluateStable(page, async () => {
    // Rolar UMA vez nao basta: o conteudo cresce depois do primeiro scroll
    // (imagens, secoes que so medem apos layout) e a pagina para no meio.
    // Medir ali acusa qualquer linha do meio que caia sob o balao — e passar
    // por cima do conteudo durante a rolagem e justamente o comportamento
    // ACEITAVEL que este teste nao deve reprovar. Rola ate a posicao parar de
    // mudar, e so entao mede.
    let anterior = -1;
    for (let i = 0; i < 12; i += 1) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 300));
      if (Math.round(window.scrollY) === anterior) break;
      anterior = Math.round(window.scrollY);
    }
    const restante = Math.round(document.body.scrollHeight - window.innerHeight - window.scrollY);
    const fab = [...document.querySelectorAll('button')].find((b) => /bg-emerald-500/.test(b.className || ''));
    if (!fab) return { semFab: true };
    const f = fab.getBoundingClientRect();
    const hits = [];
    for (const el of document.querySelectorAll('button, a, input, [role="button"]')) {
      if (el === fab || fab.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const over = !(r.right < f.left || r.left > f.right || r.bottom < f.top || r.top > f.bottom);
      if (over) hits.push({ txt: (el.textContent || '').trim().slice(0, 24) || el.tagName });
    }
    return { fab: { t: Math.round(f.top), l: Math.round(f.left) }, hits, restante };
  });
  // Se nem assim a pagina chegou ao fim, a leitura nao vale: reprovar aqui
  // seria acusar sobreposicao durante a rolagem.
  if (!d.semFab && d.restante > 4) {
    failed += 1;
    console.log(`[31m✗[0m ${label}: nao foi possivel chegar ao fim da pagina (faltaram ${d.restante}px) — leitura invalida`);
    continue;
  }
  const n = d.semFab ? 0 : d.hits.length;
  console.log(`   [registro] ${label.padEnd(12)} controles cobertos no fim da rolagem: ${n}${n ? ' -> ' + d.hits.map((h) => '"' + h.txt + '"').join(', ') : ''}`);
  if (n > 0) { failed += 1; console.log(`[31m✗[0m ${label}: o balao de ajuda cobre ${n} controle(s) com a pagina no fim`); }
  else { passed += 1; console.log(`[32m✓[0m ${label}: nenhum controle sob o balao no fim da rolagem`); }
}
await browser.close();
console.log(`
=== Resultado: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
