/**
 * Padel Legacy Design System — v33 Foundation
 * Fonte única para decisões visuais reutilizadas por componentes e gráficos.
 * Os valores de tema aplicados ao DOM permanecem em src/index.css.
 */
export const colors = Object.freeze({
  brand: { primary: 'hsl(var(--primary))', accent: 'hsl(var(--accent))' },
  semantic: {
    success: 'hsl(var(--success))',
    warning: 'hsl(var(--warning))',
    danger: 'hsl(var(--destructive))',
    premium: 'hsl(var(--premium))',
    info: 'hsl(var(--info))',
  },
  surface: {
    page: 'hsl(var(--background))',
    card: 'hsl(var(--card))',
    elevated: 'hsl(var(--surface-elevated))',
    subtle: 'hsl(var(--surface-subtle))',
  },
});

export const spacing = Object.freeze({
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  6: '1.5rem',
  8: '2rem',
  12: '3rem',
  16: '4rem',
});

export const radius = Object.freeze({
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.25rem',
  full: '9999px',
});

export const motion = Object.freeze({
  instant: 90,
  fast: 150,
  normal: 220,
  slow: 360,
  deliberate: 520,
  easing: [0.22, 1, 0.36, 1],
  easingCss: 'cubic-bezier(0.22, 1, 0.36, 1)',
  stagger: 45,
});

export const breakpoints = Object.freeze({
  mobile: 0,
  tablet: 640,
  notebook: 1024,
  desktop: 1280,
  wide: 1536,
});

export const typography = Object.freeze({
  display: 'clamp(1.75rem, 3vw, 2.5rem)',
  h1: 'clamp(1.5rem, 2.3vw, 2rem)',
  h2: 'clamp(1.25rem, 1.8vw, 1.5rem)',
  h3: '1.125rem',
  body: '0.9375rem',
  small: '0.8125rem',
  caption: '0.6875rem',
  // Números esportivos grandes (ranking, dinheiro, XP, placar). Antes repetido
  // manualmente como `text-xl font-black sm:text-2xl` em cada página.
  statLarge: 'text-xl font-black tracking-[-0.035em] sm:text-2xl tabular-nums',
  statHuge: 'text-3xl font-black tracking-[-0.035em] sm:text-4xl tabular-nums',
});

// Espelha as camadas de empilhamento definidas em src/index.css (:root).
// Fonte de runtime = CSS custom properties (usadas via classes pl-layer-*);
// este objeto existe para código JS que precisa do número bruto (ex.: z-index
// inline de um portal ad hoc). Mantenha os dois em sincronia manualmente.
export const zIndex = Object.freeze({
  header: 40,
  floating: 50,
  dropdown: 60,
  notification: 80,
  modal: 100,
  toast: 120,
  critical: 200,
});

// Espelha as variáveis de sombra/elevação usadas pelas classes `.pl-surface*`
// e `.pl-modal-panel` em src/index.css. Documentado aqui para referência
// JS-side (ex.: gráficos Recharts que precisam de um valor de sombra em vez
// de uma classe utilitária).
export const shadows = Object.freeze({
  color: 'hsl(var(--shadow-color))',
  card: '0 12px 34px hsl(var(--shadow-color) / 0.18)',
  elevated: '0 18px 48px hsl(var(--shadow-color) / 0.25)',
  modal: '0 30px 90px hsl(var(--shadow-color) / 0.62)',
});

// Espelha `--motion-*`/`--ease-premium` de src/index.css. Use `motion.fast`/
// `motion.normal`/`motion.slow` (acima) para durações; isto documenta a
// contrapartida CSS já aplicada globalmente aos componentes `pl-*`.
export const transitions = Object.freeze({
  fast: 'var(--motion-fast, 150ms)',
  normal: 'var(--motion-normal, 250ms)',
  slow: 'var(--motion-slow, 350ms)',
  easing: 'var(--ease-premium, cubic-bezier(0.22, 1, 0.36, 1))',
});
