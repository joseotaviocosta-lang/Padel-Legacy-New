import React, { useId } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useOverlayBehavior } from './useOverlayBehavior';

// Right-side slide-in panel for secondary/extensive information (assistant
// insights, help/glossary content, player detail). Shares ModalShell's
// portal + scroll-lock + focus-trap + ESC guarantees via useOverlayBehavior,
// so it isn't a second competing overlay system — just a different shape.
//
// M1.1 (docs/MOBILE_M1_1_DEVICE_HOTFIX.md): the panel is edge-to-edge
// (h-full, no centering margin like ModalShell), so without pl-safe-t/
// pl-safe-b the header's close button rendered directly under the Android
// status bar/notch. The safe-area padding lives on the panel itself so it
// insets header, content and footer together without touching their own
// padding.
export function DrawerShell({
  open,
  onClose,
  title,
  description = null,
  children,
  footer = null,
  size = 'md',
  className = '',
  closeOnBackdrop = true,
  closeOnEscape = true,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const { closeRef, panelRef } = useOverlayBehavior({ open, onClose, closeOnEscape });

  if (!open || typeof document === 'undefined') return null;
  const widths = { sm: 'max-w-xs', md: 'max-w-sm', lg: 'max-w-md', xl: 'max-w-lg' };

  return createPortal(
    <div
      className="pl-modal-backdrop fixed inset-0 flex justify-end"
      data-app-drawer
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
    >
      {closeOnBackdrop && <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar painel" onClick={onClose} />}
      <section
        ref={panelRef}
        className={cn('pl-modal-panel pl-drawer-enter pl-safe-t pl-safe-b relative z-10 flex h-full w-full min-w-0 flex-col overflow-hidden border-l bg-background', widths[size] || widths.md, className)}
      >
        <header className="pl-modal-header flex shrink-0 items-start justify-between gap-4 border-b px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            {title && <h2 id={titleId} className="truncate text-base font-black tracking-tight sm:text-lg">{title}</h2>}
            {description && <p id={descriptionId} className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">{description}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="pl-modal-close inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="pl-modal-content scrollbar-premium min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
        {footer && <footer className="pl-modal-footer shrink-0 border-t px-4 py-3 sm:px-5">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
