// Infraestrutura central de "Android Back fecha overlay" (Fase M1 —
// docs/MOBILE_AUDIT.md, achado P1 "Android back button sem tratamento").
//
// Estratégia padrão para SPA em WebView: cada overlay que abre empurra uma
// entrada de histórico (`history.pushState`) sem navegar de fato — só um
// marcador. O botão/gesto voltar do Android consome exatamente essa entrada
// e dispara `popstate`; um único listener global (ligado uma vez, nunca
// duplicado) fecha o overlay do topo da pilha nesse evento. Fechar o overlay
// pela UI (X, backdrop, Escape) faz o caminho inverso: `history.back()`
// consome a mesma entrada, mantendo o histórico balanceado sem exigir dois
// "voltar" para sair da tela depois.
//
// `pendingProgrammaticPops` existe para o caso de overlays empilhados: ao
// fechar o overlay do topo pela UI, o `history.back()` programático dispara
// um `popstate` assíncrono que NÃO pode ser tratado como um voltar real —
// senão fecharia também o overlay de baixo com um único Back físico.

const stack = [];
let bound = false;
let pendingProgrammaticPops = 0;

function handlePopState() {
  if (pendingProgrammaticPops > 0) {
    pendingProgrammaticPops -= 1;
    return;
  }
  if (!stack.length) return;
  const top = stack.pop();
  top.onBack();
}

function ensureBound() {
  if (bound || typeof window === 'undefined') return;
  window.addEventListener('popstate', handlePopState);
  bound = true;
}

/** Chamado quando um overlay abre. `onBack` é invocado se o Android back for pressionado com este overlay no topo da pilha. */
export function registerOverlay(id, onBack) {
  if (typeof window === 'undefined') return;
  ensureBound();
  try {
    window.history.pushState({ plOverlay: id }, '');
  } catch {
    // Ambiente sem History API utilizável (não deveria ocorrer no Tauri/WebView) — degrada para nenhum tratamento de Back, sem quebrar o overlay em si.
    return;
  }
  stack.push({ id, onBack });
}

/** Chamado quando um overlay fecha (por qualquer motivo: X, backdrop, Escape, ação da própria página). Idempotente. */
export function unregisterOverlay(id) {
  if (typeof window === 'undefined') return;
  const idx = stack.findIndex((entry) => entry.id === id);
  if (idx === -1) return; // já removido pelo próprio handlePopState (Back físico)
  stack.splice(idx, 1);
  pendingProgrammaticPops += 1;
  try {
    window.history.back();
  } catch {
    pendingProgrammaticPops -= 1;
  }
}

/** Só para testes/depuração — não usar em código de produto. */
export function __getOverlayStackSizeForTests() {
  return stack.length;
}
