import { useEffect, useMemo, useState } from 'react';

function readProfile() {
  if (typeof window === 'undefined') {
    return { reducedMotion: false, lowPower: false, compactViewport: false, pageVisible: true, saveData: false };
  }

  const navigatorInfo = window.navigator || {};
  const connection = navigatorInfo.connection || navigatorInfo.mozConnection || navigatorInfo.webkitConnection;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const compactViewport = window.matchMedia?.('(max-width: 767px)').matches ?? false;
  const saveData = Boolean(connection?.saveData);
  const limitedCpu = Number.isFinite(navigatorInfo.hardwareConcurrency) && navigatorInfo.hardwareConcurrency <= 4;
  const limitedMemory = Number.isFinite(navigatorInfo.deviceMemory) && navigatorInfo.deviceMemory <= 4;

  return {
    reducedMotion,
    compactViewport,
    saveData,
    lowPower: reducedMotion || saveData || limitedCpu || limitedMemory,
    pageVisible: document.visibilityState !== 'hidden',
  };
}

/**
 * Perfil leve para adaptar animações, preloads e renderização sem alterar gameplay.
 * Responde a mudanças de viewport, preferência de movimento e visibilidade da aba.
 */
export function useAdaptivePerformance() {
  const [profile, setProfile] = useState(readProfile);

  useEffect(() => {
    const reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const viewportQuery = window.matchMedia?.('(max-width: 767px)');
    const connection = window.navigator?.connection || window.navigator?.mozConnection || window.navigator?.webkitConnection;
    const refresh = () => setProfile(readProfile());

    reducedQuery?.addEventListener?.('change', refresh);
    viewportQuery?.addEventListener?.('change', refresh);
    connection?.addEventListener?.('change', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      reducedQuery?.removeEventListener?.('change', refresh);
      viewportQuery?.removeEventListener?.('change', refresh);
      connection?.removeEventListener?.('change', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return useMemo(() => ({
    ...profile,
    allowDecorativeMotion: profile.pageVisible && !profile.lowPower && !profile.compactViewport,
    allowRoutePreload: profile.pageVisible && !profile.saveData,
  }), [profile]);
}
