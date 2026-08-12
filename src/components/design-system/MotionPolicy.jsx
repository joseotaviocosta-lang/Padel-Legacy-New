import React, { createContext, useContext } from 'react';

const MotionPolicyContext = createContext(null);

const FALLBACK_POLICY = { allowDecorativeMotion: true, lowPower: false, reducedMotion: false, compactViewport: false };

function readFallback() {
  if (typeof window === 'undefined') return FALLBACK_POLICY;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  return { ...FALLBACK_POLICY, reducedMotion, allowDecorativeMotion: !reducedMotion };
}

/**
 * Publica o perfil de `useAdaptivePerformance` (já calculado uma vez em
 * AppLayout) para qualquer componente do design system, sem cada um precisar
 * assinar suas próprias media queries. Todo componente de motion novo deve
 * consumir `useMotionPolicy()` em vez de assumir animação decorativa livre.
 */
export function MotionPolicyProvider({ value, children }) {
  return <MotionPolicyContext.Provider value={value}>{children}</MotionPolicyContext.Provider>;
}

export function useMotionPolicy() {
  const ctx = useContext(MotionPolicyContext);
  // Sem provider montado (telas fora do AppLayout, ex.: Login/Register):
  // cai para checar prefers-reduced-motion diretamente. Nunca assume
  // animação decorativa livre por padrão.
  return ctx || readFallback();
}
