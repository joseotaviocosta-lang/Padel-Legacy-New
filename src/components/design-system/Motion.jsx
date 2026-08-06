import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Entrada visual reutilizável sem dependências externas. */
export function MotionReveal({
  as: Component = 'div',
  children,
  className,
  delay = 0,
  variant = 'up',
  once = true,
  ...props
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        if (once) observer.disconnect();
      } else if (!once) {
        setVisible(false);
      }
    }, { rootMargin: '40px', threshold: 0.08 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [once]);

  return (
    <Component
      ref={ref}
      className={cn('pl-motion-reveal', `pl-motion-${variant}`, visible && 'is-visible', className)}
      style={{ '--pl-motion-delay': `${Math.max(0, delay)}ms` }}
      {...props}
    >
      {children}
    </Component>
  );
}

/** Anima valores numéricos quando mudam, respeitando reduced-motion. */
export function AnimatedNumber({ value, duration = 500, formatter, className, ...props }) {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
  const previousRef = useRef(safeValue);
  const [display, setDisplay] = useState(safeValue);

  useEffect(() => {
    const from = previousRef.current;
    previousRef.current = safeValue;
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || from === safeValue) {
      setDisplay(safeValue);
      return undefined;
    }
    const started = performance.now();
    let frame;
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + ((safeValue - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [safeValue, duration]);

  const rendered = useMemo(() => (
    formatter ? formatter(display) : Math.round(display).toLocaleString('pt-BR')
  ), [display, formatter]);

  return <span className={cn('tabular-nums', className)} {...props}>{rendered}</span>;
}

/** Destaca alterações recentes de indicadores sem bloquear a interface. */
export function ChangePulse({ value, children, className, tone = 'brand' }) {
  const previousRef = useRef(value);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (previousRef.current === value) return undefined;
    previousRef.current = value;
    setChanged(true);
    const timer = window.setTimeout(() => setChanged(false), 700);
    return () => window.clearTimeout(timer);
  }, [value]);

  return <span className={cn('pl-change-pulse', `pl-change-${tone}`, changed && 'is-changing', className)}>{children}</span>;
}
