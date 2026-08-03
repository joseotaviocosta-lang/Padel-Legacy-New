import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronRight } from 'lucide-react';

// ─── LoadingScreen ─────────────────────────────────────────────
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
export function PageContainer({ children, className = '' }) {
  return (
    <div className={`px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in ${className}`}>
      {children}
    </div>
  );
}

// ─── PageHeader ────────────────────────────────────────────────
// Unified glass hero header with icon, title, subtitle, and optional actions.
const ACCENT_BG = {
  primary: 'bg-primary/20',
  amber: 'bg-amber-500/20',
  cyan: 'bg-cyan-500/20',
  purple: 'bg-purple-500/20',
  accent: 'bg-accent/20',
  green: 'bg-green-500/20',
};
const ACCENT_TEXT = {
  primary: 'text-primary',
  amber: 'text-amber-400',
  cyan: 'text-cyan-400',
  purple: 'text-purple-400',
  accent: 'text-accent',
  green: 'text-green-400',
};
const GLOW = {
  primary: 'bg-primary/20',
  amber: 'bg-amber-500/15',
  cyan: 'bg-cyan-500/15',
  purple: 'bg-purple-500/15',
  accent: 'bg-accent/15',
  green: 'bg-green-500/15',
};

export function PageHeader({ icon: Icon, title, subtitle, children, accent = 'primary', badge, eyebrow }) {
  return (
    <div className="relative overflow-hidden rounded-3xl glass p-5 md:p-6 grid-bg">
      <div className={`absolute -top-10 -right-10 h-36 w-36 ${GLOW[accent] || GLOW.primary} rounded-full blur-3xl`} />
      <div className="relative flex flex-wrap sm:flex-nowrap items-center gap-4">
        {Icon && (
          <div className={`h-14 w-14 rounded-2xl ${ACCENT_BG[accent] || ACCENT_BG.primary} flex items-center justify-center shrink-0`}>
            <Icon className={`h-7 w-7 ${ACCENT_TEXT[accent] || ACCENT_TEXT.primary}`} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {eyebrow && (
            <div className="flex items-center gap-2 mb-1">
              {Icon && <Icon className={`h-4 w-4 ${ACCENT_TEXT[accent] || ACCENT_TEXT.primary}`} />}
              <span className={`text-[10px] uppercase tracking-[0.25em] font-bold ${ACCENT_TEXT[accent] || ACCENT_TEXT.primary}`}>{eyebrow}</span>
            </div>
          )}
          <h1 className="text-xl md:text-2xl font-black tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children && <div className="flex w-full sm:w-auto items-center gap-2 sm:shrink-0">{children}</div>}
      </div>
    </div>
  );
}

// ─── SimpleHeader ──────────────────────────────────────────────
// For pages where the hero card is too heavy — just title + subtitle + actions.
export function SimpleHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-black tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

// ─── GlassCard ─────────────────────────────────────────────────
export function GlassCard({ children, className = '', hover = false, ...props }) {
  return (
    <div
      className={`glass rounded-2xl p-4 ${hover ? 'transition-all duration-300 hover:border-primary/40 hover:scale-[1.01] hover:shadow-lg hover:shadow-primary/5 active:scale-[0.99]' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── EmptyState ────────────────────────────────────────────────
export function EmptyStateCard({ icon: Icon, title, message, action }) {
  return (
    <div className="glass rounded-2xl p-10 text-center animate-scale-in">
      {Icon && <Icon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />}
      {title && <p className="font-bold text-sm text-foreground mb-1">{title}</p>}
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── TabBar ────────────────────────────────────────────────────
// Unified tab bar. `variant="segmented"` = glass pill (like Ranking),
// `variant="buttons"` = individual buttons (like Missions/Shop).
export function TabBar({ tabs, activeTab, onTabChange, variant = 'buttons' }) {
  if (variant === 'segmented') {
    return (
      <div className="flex gap-1 p-1 glass rounded-2xl overflow-x-auto scrollbar-none">
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className={`min-w-max flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />} {t.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {tabs.map(t => {
        const Icon = t.icon;
        const isActive = activeTab === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`min-w-max flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all ${isActive ? 'bg-primary/15 text-primary' : 'glass text-muted-foreground hover:text-foreground'}`}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="text-[10px] opacity-60">({t.count})</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── FilterPills ───────────────────────────────────────────────
// Horizontal scrollable filter pills (like Shop categories, Tournaments filters).
export function FilterPills({ filters, activeFilter, onFilterChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
      {filters.map(f => (
        <button
          key={f.id}
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
const BANNER_VARIANTS = {
  warning: { border: 'border-amber-500/40', bg: 'bg-amber-500/5', iconColor: 'text-amber-400', textColor: 'text-amber-200' },
  error: { border: 'border-red-500/40', bg: 'bg-red-500/5', iconColor: 'text-red-400', textColor: 'text-red-300' },
  info: { border: 'border-primary/40', bg: 'bg-primary/5', iconColor: 'text-primary', textColor: 'text-primary' },
  success: { border: 'border-green-500/40', bg: 'bg-green-500/5', iconColor: 'text-green-400', textColor: 'text-green-300' },
};

export function InfoBanner({ icon: Icon = AlertCircle, variant = 'warning', children, className = '' }) {
  const v = BANNER_VARIANTS[variant] || BANNER_VARIANTS.warning;
  return (
    <div className={`glass rounded-2xl p-4 border ${v.border} flex items-center gap-3 ${v.bg} ${className}`}>
      <Icon className={`h-5 w-5 ${v.iconColor} shrink-0`} />
      <p className={`text-sm ${v.textColor} flex-1`}>{children}</p>
    </div>
  );
}

// ─── PrimaryButton ─────────────────────────────────────────────
export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 hover:scale-[1.02] active:scale-[0.97] transition-all glow-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// ─── GhostButton ───────────────────────────────────────────────
export function GhostButton({ children, className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl glass text-muted-foreground font-semibold text-sm hover:text-foreground hover:bg-secondary/60 active:scale-[0.97] transition-all ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// ─── SectionTitle ──────────────────────────────────────────────
export function SectionTitle({ icon: Icon, children, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-bold text-sm flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        {children}
      </h2>
      {action}
    </div>
  );
}

// ─── LinkButton ────────────────────────────────────────────────
// Small pill-style link button used in headers.
export function LinkPill({ to, icon: Icon, children, variant = 'ghost' }) {
  const variantClass = variant === 'primary'
    ? 'bg-primary text-primary-foreground hover:opacity-90 glow-primary'
    : 'bg-secondary/50 text-muted-foreground hover:text-foreground';
  return (
    <Link to={to} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${variantClass}`}>
      {Icon && <Icon className="h-3.5 w-3.5" />} {children}
    </Link>
  );
}

// ─── ResultFeedback ────────────────────────────────────────────
// Success/error feedback banner (like Training result toast).
const FEEDBACK_VARIANTS = {
  success: { border: 'border-primary/40', bg: 'bg-primary/5', iconBg: 'bg-primary/20', iconColor: 'text-primary' },
  error: { border: 'border-amber-500/40', bg: 'bg-amber-500/5', iconBg: 'bg-amber-500/20', iconColor: 'text-amber-400' },
};

export function ResultFeedback({ variant = 'success', icon: Icon, title, children, onClose }) {
  const v = FEEDBACK_VARIANTS[variant] || FEEDBACK_VARIANTS.success;
  const FinalIcon = Icon || (variant === 'success' ? ChevronRight : AlertCircle);
  return (
    <div className={`glass rounded-2xl p-4 border ${v.border} flex items-center gap-3 ${v.bg} animate-slide-up`}>
      <div className={`h-10 w-10 rounded-full ${v.iconBg} flex items-center justify-center shrink-0`}>
        <FinalIcon className={`h-5 w-5 ${v.iconColor}`} />
      </div>
      <div className="flex-1">
        {title && <p className="font-bold text-sm">{title}</p>}
        {children && <p className="text-xs text-muted-foreground">{children}</p>}
      </div>
      {onClose && <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Fechar</button>}
    </div>
  );
}
