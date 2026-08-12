import React from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Button as DSButton,
  EmptyState as DSEmptyState,
  IconFrame,
  Page as DSPage,
  PageHeader as DSPageHeader,
  Surface,
  Tabs as DSTabs,
} from '@/components/design-system';
import { cn } from '@/lib/utils';

/**
 * @deprecated Biblioteca-sombra pré-Design-System-2.0 (ver docs/DESIGN_SYSTEM_V2.md).
 * Cada export abaixo é agora um adapter fino sobre `@/components/design-system`:
 * preserva a API antiga — para não quebrar os call sites existentes — mas
 * renderiza com os componentes oficiais por baixo. Não importe daqui em
 * código novo; use `@/components/design-system` diretamente.
 *
 * `SimpleHeader`, `GhostButton`, `SectionTitle`, `LinkPill` e `ResultFeedback`
 * foram removidos nesta consolidação: 0 usos confirmados em todo o projeto e
 * cada um duplicava um componente oficial (PageHeader, Button, SurfaceHeader,
 * Button, ActionFeedback, respectivamente).
 */

// ─── LoadingScreen ─────────────────────────────────────────────
/** @deprecated Prefira `PageSkeleton` do design-system em código novo. */
export function LoadingScreen() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-5">
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-primary/25 pulse-ring" />
        <div className="absolute inset-0 rounded-2xl bg-primary/15 pulse-ring" style={{ animationDelay: '0.4s' }} />
        <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center glow-primary">
          <span className="text-primary-foreground font-black text-2xl">P</span>
        </div>
      </div>
      <div className="flex gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

// ─── PageContainer ──────────────────────────────────────────────
/** @deprecated Prefira `Page`/`PageContent` do design-system em código novo. */
export function PageContainer({ children, className = '' }) {
  return <DSPage size="default" className={cn('space-y-6', className)}>{children}</DSPage>;
}

// ─── PageHeader ────────────────────────────────────────────────
/**
 * @deprecated Prefira `PageHeader` do design-system em código novo — props
 * diferentes: eyebrow/title/description/icon/action/stats/breadcrumb/tone.
 */
const ACCENT_TONE = { primary: 'brand', amber: 'warning', cyan: 'info', purple: 'team', accent: 'info', green: 'success' };

export function PageHeader({ icon, title, subtitle, children, accent = 'primary', eyebrow }) {
  return (
    <DSPageHeader
      icon={icon}
      title={title}
      description={subtitle}
      eyebrow={eyebrow}
      tone={ACCENT_TONE[accent] || 'brand'}
      action={children}
    />
  );
}

// ─── GlassCard ─────────────────────────────────────────────────
/** @deprecated Prefira `Surface` do design-system em código novo. */
export function GlassCard({ children, className = '', hover = false, ...props }) {
  return (
    <Surface variant={hover ? 'interactive' : 'default'} padding="default" className={className} {...props}>
      {children}
    </Surface>
  );
}

// ─── EmptyStateCard ────────────────────────────────────────────
/** @deprecated Prefira `EmptyState` do design-system em código novo. */
export function EmptyStateCard({ icon, title, message, action }) {
  return <DSEmptyState icon={icon} title={title || message} description={title ? message : undefined} action={action} />;
}

// ─── TabBar ────────────────────────────────────────────────────
/** @deprecated Prefira `Tabs` do design-system em código novo. */
export function TabBar({ tabs, activeTab, onTabChange, variant = 'buttons' }) {
  return <DSTabs tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} variant={variant === 'segmented' ? 'segmented' : 'buttons'} />;
}

// ─── FilterPills ───────────────────────────────────────────────
/** @deprecated Considere `Tabs` (variant="buttons") do design-system para casos novos. */
export function FilterPills({ filters, activeFilter, onFilterChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
      {filters.map(f => (
        <button
          key={f.id}
          type="button"
          onClick={() => onFilterChange(f.id)}
          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            activeFilter === f.id
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ─── InfoBanner ────────────────────────────────────────────────
/**
 * @deprecated Aviso estático — sem equivalente 1:1 no design-system
 * (`ActionFeedback` é para estados de ação assíncrona, não avisos
 * persistentes). Reconstruído sobre `Surface`/`IconFrame` oficiais.
 */
const BANNER_TONE = { warning: 'warning', error: 'danger', info: 'brand', success: 'success' };
const TONE_TEXT = { warning: 'text-warning', danger: 'text-destructive', brand: 'text-primary', success: 'text-success' };
const TONE_BORDER = { warning: 'border-warning/35', danger: 'border-destructive/35', brand: 'border-primary/35', success: 'border-success/35' };

export function InfoBanner({ icon = AlertCircle, variant = 'warning', children, className = '' }) {
  const tone = BANNER_TONE[variant] || 'warning';
  return (
    <Surface padding="compact" className={cn('flex items-center gap-3', TONE_BORDER[tone], className)}>
      <IconFrame icon={icon} tone={tone} size="sm" />
      <p className={cn('flex-1 text-sm', TONE_TEXT[tone])}>{children}</p>
    </Surface>
  );
}

// ─── PrimaryButton ─────────────────────────────────────────────
/** @deprecated Prefira `Button` (level="primary") do design-system em código novo. */
export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <DSButton level="primary" size="touch" className={cn('glow-primary', className)} {...props}>
      {children}
    </DSButton>
  );
}
