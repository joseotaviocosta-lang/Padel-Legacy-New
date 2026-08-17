// Hotfix UX — guided flow de torneio (docs/TOURNAMENT_GUIDED_FLOW_HOTFIX.md).
//
// Causa raiz do "CTA de entrevista não navega": ModalShell/useOverlayBehavior
// empurra uma entrada de histórico quando abre (`registerOverlay`) para o
// Android Back conseguir só fechar o overlay em vez de sair do app. Quando o
// overlay desmonta, `unregisterOverlay` sempre chamava `history.back()` para
// "equilibrar" essa entrada — MESMO quando o desmonte aconteceu porque algo
// dentro do overlay (o CTA "Dar entrevista") já tinha navegado de verdade
// para outra rota. Nesse caso, o `history.back()` desfazia a navegação que
// acabou de acontecer — o clique parecia não fazer nada.
//
// Este teste exercita o módulo real (src/components/design-system/
// overlayBackStack.js) contra um `window.history` fake em memória (sem
// jsdom — o módulo só toca history.pushState/back/state e
// addEventListener('popstate'), então um mock mínimo é suficiente e mais
// direto que subir um DOM inteiro).
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createFakeWindow() {
  const entries = [{ state: null, url: '/' }];
  let index = 0;
  const listeners = [];
  return {
    addEventListener(type, handler) { if (type === 'popstate') listeners.push(handler); },
    removeEventListener(type, handler) {
      if (type !== 'popstate') return;
      const i = listeners.indexOf(handler);
      if (i !== -1) listeners.splice(i, 1);
    },
    // Dispara popstate de forma síncrona — suficiente para testar a lógica
    // de negócio (o módulo real não depende da ordem exata de microtasks).
    history: {
      pushState(state, _title, url) {
        entries.length = index + 1;
        entries.push({ state, url: url || entries[index].url });
        index += 1;
      },
      back() {
        if (index <= 0) return;
        index -= 1;
        const current = entries[index];
        listeners.slice().forEach((handler) => handler({ state: current.state }));
      },
      get state() { return entries[index].state; },
    },
    _currentUrl: () => entries[index].url,
    _simulatePhysicalBack() {
      if (index <= 0) return;
      index -= 1;
      const current = entries[index];
      listeners.slice().forEach((handler) => handler({ state: current.state }));
    },
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const modulePath = '/src/components/design-system/overlayBackStack.js';

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 1 — fechamento normal (X/backdrop/Escape): comportamento
  // preservado, history.back() equilibra a entrada do overlay.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 1: fechamento normal do overlay ---');
  {
    const fakeWindow = createFakeWindow();
    globalThis.window = fakeWindow;
    const mod = await server.ssrLoadModule(modulePath + '?scenario=1');
    let backCalled = false;
    mod.registerOverlay('modal-a', () => { backCalled = true; });
    gate('registerOverlay empurra uma entrada de histórico', fakeWindow.history.state?.plOverlay === 'modal-a');
    mod.unregisterOverlay('modal-a');
    gate('fechamento normal chama history.back() (equilibra a entrada)', fakeWindow.history.state?.plOverlay === undefined);
    gate('onBack NÃO é chamado num fechamento programático (pendingProgrammaticPops absorve o popstate)', backCalled === false);
    gate('pilha de overlays fica vazia', mod.__getOverlayStackSizeForTests() === 0);
    delete globalThis.window;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 2 — Android Back físico fecha o overlay do topo.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 2: Android Back físico ---');
  {
    const fakeWindow = createFakeWindow();
    globalThis.window = fakeWindow;
    const mod = await server.ssrLoadModule(modulePath + '?scenario=2');
    let backCalled = false;
    mod.registerOverlay('modal-b', () => { backCalled = true; });
    fakeWindow._simulatePhysicalBack();
    gate('Back físico dispara onBack do overlay do topo', backCalled === true);
    gate('pilha esvazia depois do Back físico', mod.__getOverlayStackSizeForTests() === 0);
    delete globalThis.window;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 3 — O BUG: navegação real por cima do overlay, seguida do
  // desmonte do overlay (o caso do CTA de entrevista). unregisterOverlay NÃO
  // pode desfazer a navegação real.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 3: navegação real por cima do overlay (o bug relatado) ---');
  {
    const fakeWindow = createFakeWindow();
    globalThis.window = fakeWindow;
    fakeWindow.history.pushState({ usr: 'react-router' }, '', '/tournaments');
    const mod = await server.ssrLoadModule(modulePath + '?scenario=3');
    // Modal do torneio abre — empurra a entrada de histórico do overlay.
    mod.registerOverlay('tournament-modal', () => {});
    gate('estado inicial: URL ainda é a de antes do CTA', fakeWindow._currentUrl() === '/tournaments');
    // Usuário clica "Dar entrevista" -> navigate('/press?...') (é isso que
    // o React Router faz de verdade: um pushState com URL nova).
    fakeWindow.history.pushState({ usr: 'react-router' }, '', '/press?tab=interviews&interview=x');
    gate('navigate() real mudou a URL para /press', fakeWindow._currentUrl().startsWith('/press'));
    // A rota mudou -> Tournaments desmonta -> TournamentModal desmonta ->
    // o cleanup do useOverlayBehavior chama unregisterOverlay.
    mod.unregisterOverlay('tournament-modal');
    gate('depois do desmonte do modal, a URL AINDA é /press (a navegação real não foi desfeita)', fakeWindow._currentUrl().startsWith('/press'));
    gate('pilha de overlays fica vazia mesmo sem compensar a entrada (idempotente)', mod.__getOverlayStackSizeForTests() === 0);
    delete globalThis.window;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 4 — overlays aninhados: fechar o do topo não mexe no de baixo.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 4: overlays aninhados ---');
  {
    const fakeWindow = createFakeWindow();
    globalThis.window = fakeWindow;
    const mod = await server.ssrLoadModule(modulePath + '?scenario=4');
    let bottomBackCalled = false;
    mod.registerOverlay('bottom', () => { bottomBackCalled = true; });
    mod.registerOverlay('top', () => {});
    gate('dois overlays na pilha', mod.__getOverlayStackSizeForTests() === 2);
    mod.unregisterOverlay('top');
    gate('fechar o do topo deixa só o de baixo na pilha', mod.__getOverlayStackSizeForTests() === 1);
    gate('overlay de baixo não foi afetado (onBack não disparou)', bottomBackCalled === false);
    delete globalThis.window;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 5 — unregisterOverlay chamado duas vezes (idempotência: X
  // clicado e o cleanup do React rodando de qualquer forma).
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 5: unregisterOverlay idempotente ---');
  {
    const fakeWindow = createFakeWindow();
    globalThis.window = fakeWindow;
    const mod = await server.ssrLoadModule(modulePath + '?scenario=5');
    mod.registerOverlay('modal-c', () => {});
    mod.unregisterOverlay('modal-c');
    const urlAfterFirst = fakeWindow._currentUrl();
    mod.unregisterOverlay('modal-c');
    gate('segunda chamada não lança nem move a URL de novo', fakeWindow._currentUrl() === urlAfterFirst);
    delete globalThis.window;
  }
} finally {
  await server.close();
}

console.log(`\ntest:overlay-back-stack OK — ${gates} gates (fechamento normal, Back físico, navegação real por cima do overlay, aninhamento, idempotência).`);
