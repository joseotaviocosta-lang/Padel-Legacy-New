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
});
