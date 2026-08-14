import { useEffect, useId, useRef } from 'react';
import { registerOverlay, unregisterOverlay } from './overlayBackStack';

// Shared scroll-lock + focus-trap + ESC-to-close + Android-Back-to-close
// behavior for portal-based overlays (ModalShell, BottomSheet, DrawerShell).
// Extracted so every overlay in the app gets the same guarantees instead of
// each one hand-rolling its own version.
export function useOverlayBehavior({ open, onClose, closeOnEscape = true }) {
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);
  const overlayId = useId();
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  onCloseRef.current = onClose;
  closeOnEscapeRef.current = closeOnEscape;

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.body.style.overflow = 'hidden';
    // M3.2: só força foco no botão fechar se nada dentro do painel já pegou
    // foco sozinho (ex.: <input autoFocus> num formulário de onboarding) —
    // antes isto sempre roubava o foco do campo de volta para o X logo após
    // o autoFocus, fechando o teclado Android no primeiro toque.
    const focusTimer = window.setTimeout(() => {
      if (panelRef.current && panelRef.current.contains(document.activeElement)) return;
      closeRef.current?.focus();
    }, 0);

    // Mesma regra do Escape: só fecha de fato se closeOnEscape permitir (passos
    // obrigatórios de onboarding usam closeOnEscape=false). De todo modo o
    // overlay sempre entra na pilha de histórico, então um Back físico nunca
    // navega para fora da tela por baixo de um overlay obrigatório — só é
    // absorvido sem efeito, igual ao Escape hoje.
    registerOverlay(overlayId, () => {
      if (closeOnEscapeRef.current) onCloseRef.current?.();
    });

    const onKey = (event) => {
      if (event.key === 'Escape' && closeOnEscapeRef.current) {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [])].filter((element) => !element.hasAttribute('hidden'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.removeEventListener('keydown', onKey);
      unregisterOverlay(overlayId);
      previousFocusRef.current?.focus?.();
    };
    // M3.2 (docs/MOBILE_M3_2_ANDROID_UX_STABILITY.md): `onClose`/`closeOnEscape`
    // ficam FORA das deps de propósito — os callers quase sempre passam
    // `onClose` como arrow function inline (`onClose={() => {...}}`), então uma
    // nova referência nascia a cada re-render do pai. Com esses valores nas
    // deps, digitar num input controlado dentro do modal (o pai re-renderiza a
    // cada tecla) fazia este efeito inteiro desmontar/remontar a cada
    // caractere — e o cleanup chama `previousFocusRef.current?.focus?.()`,
    // arrancando o foco do input de volta para o elemento que tinha foco antes
    // do modal abrir. No teclado Android isso fecha o teclado a cada tecla
    // (parecendo "a tela fecha sozinha"). Os valores atuais continuam
    // acessíveis via onCloseRef/closeOnEscapeRef (atualizados em toda
    // renderização, fora do efeito), então nada aqui fica desatualizado.
  }, [open, overlayId]);

  return { closeRef, panelRef };
}
