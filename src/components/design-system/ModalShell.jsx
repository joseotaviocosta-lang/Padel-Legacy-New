import React, { useId } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useOverlayBehavior } from './useOverlayBehavior';

export function ModalShell({
  open,
  onClose,
  title,
  description = null,
  children,
  footer = null,
  size = 'lg',
  className = '',
  closeOnBackdrop = true,
  closeOnEscape = true,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const { closeRef, panelRef } = useOverlayBehavior({ open, onClose, closeOnEscape });

  if (!open || typeof document === 'undefined') return null;
  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl', full: 'max-w-[96rem]' };

  return createPortal(
    <div
      className="pl-modal-backdrop fixed inset-0 flex items-center justify-center p-2 sm:p-4"
      data-app-modal
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
    >
      {closeOnBackdrop && <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar janela" onClick={onClose} />}
      <section
        ref={panelRef}
        data-layout-fullbleed
        className={cn('pl-modal-panel pl-modal-enter pl-safe-t pl-safe-b relative z-10 flex max-h-[calc(100dvh-1rem)] w-full min-w-0 flex-col overflow-hidden rounded-2xl border sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl', widths[size] || widths.lg, className)}
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
