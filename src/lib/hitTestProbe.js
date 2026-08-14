// M2.1 (docs/MOBILE_M2_1_DEVICE_HOTFIX.md) — diagnóstico controlado e opcional
// para casos como o sino em landscape (Parte 3 do enunciado): descobre, direto
// no aparelho físico e sem precisar de USB debugging, qual elemento realmente
// recebe pointerdown/click numa coordenada da tela via document.elementFromPoint.
//
// Fica inerte por padrão (custo de inicialização é só ler localStorage/URL uma
// vez) — só passa a ouvir eventos se explicitamente ativado, então não é
// telemetria nem debug permanente em produção.
//
// Ativar: abrir a URL do app com ?hitdebug=1 uma vez (persiste via
// localStorage entre navegações da SPA) ou, com o app já aberto, rodar no
// console `localStorage.setItem('padel:hit-test-probe', '1')` e recarregar.
// Desativar: ?hitdebug=0, ou `localStorage.removeItem('padel:hit-test-probe')`.
const STORAGE_KEY = 'padel:hit-test-probe';

function isEnabled() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has('hitdebug')) {
    if (params.get('hitdebug') === '0') {
      window.localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    window.localStorage.setItem(STORAGE_KEY, '1');
    return true;
  }
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

function describeElement(el) {
  if (!el) return 'null';
  const id = el.id ? `#${el.id}` : '';
  const classAttr = typeof el.className === 'string' ? el.className : '';
  const cls = classAttr.trim() ? `.${classAttr.trim().split(/\s+/).slice(0, 3).join('.')}` : '';
  const label = el.getAttribute?.('aria-label');
  const style = window.getComputedStyle?.(el);
  const pe = style ? ` pointer-events=${style.pointerEvents}` : '';
  return `${el.tagName?.toLowerCase() || '?'}${id}${cls}${pe}${label ? ` aria-label="${label}"` : ''}`;
}

let badgeEl = null;
function ensureBadge() {
  if (badgeEl && document.body.contains(badgeEl)) return badgeEl;
  badgeEl = document.createElement('div');
  badgeEl.setAttribute('data-hit-test-probe', '');
  badgeEl.style.cssText = 'position:fixed;left:0.5rem;bottom:0.5rem;z-index:2147483647;max-width:calc(100vw - 1rem);padding:0.5rem 0.65rem;background:rgba(10,12,20,0.92);color:#d8ffb0;font:10px/1.45 ui-monospace,monospace;border-radius:10px;pointer-events:none;white-space:pre-wrap;box-shadow:0 8px 24px rgba(0,0,0,0.4);';
  document.body.appendChild(badgeEl);
  return badgeEl;
}

function report(type, event) {
  const x = event.clientX ?? event.touches?.[0]?.clientX;
  const y = event.clientY ?? event.touches?.[0]?.clientY;
  if (x == null || y == null) return;
  const atPoint = document.elementFromPoint(x, y);
  const mismatch = event.target !== atPoint;
  const orientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  const line = [
    `[hit-test] ${type} @ (${Math.round(x)},${Math.round(y)}) ${orientation} ${window.innerWidth}x${window.innerHeight}`,
    `  event.target:      ${describeElement(event.target)}`,
    `  elementFromPoint:  ${describeElement(atPoint)}`,
    mismatch ? '  ⚠ DIVERGENTE — outro elemento está sobre o alvo do evento' : '  ✓ mesmo elemento',
  ].join('\n');
  console.log(line);
  ensureBadge().textContent = line;
}

export function initHitTestProbe() {
  if (!isEnabled()) return;
  ['pointerdown', 'click'].forEach((type) => {
    window.addEventListener(type, (event) => report(type, event), { capture: true, passive: true });
  });
  console.log('[hit-test] Probe ativo — toque em qualquer lugar para ver qual elemento recebeu o evento. Desative com ?hitdebug=0.');
}
