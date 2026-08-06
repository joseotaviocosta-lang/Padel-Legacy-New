import React from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const stateConfig = {
  idle: null,
  loading: { icon: LoaderCircle, tone: 'info', label: 'Processando' },
  success: { icon: CheckCircle2, tone: 'success', label: 'Concluído' },
  warning: { icon: AlertTriangle, tone: 'warning', label: 'Atenção' },
  error: { icon: XCircle, tone: 'danger', label: 'Não foi possível concluir' },
};

/**
 * Feedback visual compacto para ações assíncronas.
 * Mantém mensagens de sucesso, erro e processamento consistentes entre telas.
 */
export function ActionFeedback({ state = 'idle', title, description, action, className }) {
  const config = stateConfig[state];
  if (!config) return null;
  const Icon = config.icon;

  return (
    <div
      role={state === 'error' ? 'alert' : 'status'}
      aria-live={state === 'error' ? 'assertive' : 'polite'}
      className={cn('pl-action-feedback pl-feedback-enter flex min-w-0 items-start gap-3 rounded-xl border p-3', `pl-tone-${config.tone}`, className)}
    >
      <span className="pl-action-feedback-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
        <Icon className={cn('h-4 w-4', state === 'loading' && 'animate-spin')} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold">{title || config.label}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
