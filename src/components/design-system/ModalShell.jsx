import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export function ModalShell({ open, onClose, title, description, children, footer, size = 'lg', className }) {
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;
  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-background/80 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label={title || 'Janela'}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar" onClick={onClose} />
      <section className={cn('relative z-10 flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl sm:max-h-[calc(100dvh-2rem)]', widths[size] || widths.lg, className)}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/65 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0"><h2 className="truncate text-base font-black sm:text-lg">{title}</h2>{description && <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>}</div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
        {footer && <footer className="shrink-0 border-t border-border/65 bg-card/95 px-4 py-3 sm:px-5">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
