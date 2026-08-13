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
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);

    // Mesma regra do Escape: só fecha de fato se closeOnEscape permitir (passos
    // obrigatórios de onboarding usam closeOnEscape=false). De todo modo o
    // overlay sempre entra na pilha de histórico, então um Back físico nunca
    // navega para fora da tela por baixo de um overlay obrigatório — só é
    // absorvido sem efeito, igual ao Escape hoje.
    registerOverlay(overlayId, () => {
      if (closeOnEscapeRef.current) onCloseRef.current?.();
    });

    const onKey = (event) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        onClose?.();
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
  }, [open, onClose, closeOnEscape, overlayId]);

  return { closeRef, panelRef };
}
