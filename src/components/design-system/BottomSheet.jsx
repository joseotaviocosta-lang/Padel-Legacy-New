import React, { useId } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useOverlayBehavior } from './useOverlayBehavior';

// Painel mobile que sobe do rodapé (auditoria UI/UX, seção 7 e 21). Reusa
// exatamente as mesmas garantias de ModalShell/DrawerShell (useOverlayBehavior:
// portal, scroll-lock, focus-trap, ESC) para que o incidente antigo da
// Central BETA subindo para fora da tela nunca se repita em um componente novo.
export function BottomSheet({
  open,
  onClose,
  title,
  description = null,
  children,
  footer = null,
  className = '',
  closeOnBackdrop = true,
  closeOnEscape = true,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const { closeRef, panelRef } = useOverlayBehavior({ open, onClose, closeOnEscape });

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pl-modal-backdrop fixed inset-0 flex items-end justify-center"
      data-app-sheet
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
    >
      {closeOnBackdrop && <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar painel" onClick={onClose} />}
      <section
        ref={panelRef}
        className={cn(
          'pl-modal-panel pl-drawer-enter relative z-10 flex max-h-[calc(100dvh-2.5rem)] w-full min-w-0 flex-col overflow-hidden rounded-t-3xl border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]',
          className,
        )}
      >
        <div className="flex shrink-0 justify-center pt-2.5">
          <span className="h-1.5 w-10 rounded-full bg-border" aria-hidden="true" />
        </div>
        <header className="pl-modal-header flex shrink-0 items-start justify-between gap-4 border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h2 id={titleId} className="truncate text-base font-black tracking-tight">{title}</h2>}
            {description && <p id={descriptionId} className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="pl-modal-close inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="pl-modal-content scrollbar-premium min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
        {footer && <footer className="pl-modal-footer shrink-0 border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
