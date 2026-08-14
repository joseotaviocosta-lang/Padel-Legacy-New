import { useEffect, useState } from 'react';

// M3.2 (docs/MOBILE_M3_2_ANDROID_UX_STABILITY.md, Problema E/Parte 6-7): com
// `interactive-widget=resizes-content` (index.html) o layout viewport já
// encolhe junto com o teclado — 100dvh e `position: fixed` já refletem o
// espaço real disponível, então isto não precisa recalcular altura nenhuma.
// A única peça que falta é UX: esconder a bottom nav enquanto o teclado está
// aberto para liberar espaço vertical. Um único listener de
// `visualViewport.resize` é suficiente (nada de polling).
export function useKeyboardInset() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return undefined;
    const viewport = window.visualViewport;
    let baselineHeight = viewport.height;
    let baselineWidth = viewport.width;

    function handleResize() {
      // Rotação de tela muda a largura — não é teclado, então também
      // atualiza a referência em vez de ser tratada como abertura.
      const widthStable = Math.abs(viewport.width - baselineWidth) < 2;
      const shrink = baselineHeight - viewport.height;
      const open = widthStable && shrink > baselineHeight * 0.18;
      setKeyboardOpen(open);
      if (!open) {
        baselineHeight = viewport.height;
        baselineWidth = viewport.width;
      }
    }

    viewport.addEventListener('resize', handleResize);
    return () => viewport.removeEventListener('resize', handleResize);
  }, []);

  return keyboardOpen;
}
