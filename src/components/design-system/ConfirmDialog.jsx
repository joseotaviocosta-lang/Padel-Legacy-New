import React from 'react';
import { ModalShell } from './ModalShell';
import { Button } from './Button';

/**
 * Confirmação oficial do Design System 2.0 — substitui `window.confirm` em
 * toda ação destrutiva/irreversível (Fase 8, auditoria de modais). Usa
 * `ModalShell` por baixo, então herda de graça as mesmas garantias de
 * viewport/scroll/foco/ESC — não é uma quarta implementação de overlay.
 *
 * Uso:
 *   <ConfirmDialog open={open} onClose={close} onConfirm={run} tone="danger"
 *     title="Excluir carreira" description={`Excluir definitivamente “${name}”?`}>
 *     Esta ação não pode ser desfeita.
 *   </ConfirmDialog>
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  confirming = false,
}) {
  return (
    <ModalShell
      open={open}
      onClose={confirming ? undefined : onClose}
      closeOnBackdrop={!confirming}
      closeOnEscape={!confirming}
      title={title}
      description={description}
      size="sm"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" level="secondary" onClick={onClose} disabled={confirming} className="sm:min-w-28">
            {cancelLabel}
          </Button>
          <Button
            type="button"
            level={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={confirming}
            className="sm:min-w-28"
          >
            {confirming ? 'Aguarde…' : confirmLabel}
          </Button>
        </div>
      )}
    >
      {children ? <div className="text-sm leading-relaxed text-muted-foreground">{children}</div> : null}
    </ModalShell>
  );
}
