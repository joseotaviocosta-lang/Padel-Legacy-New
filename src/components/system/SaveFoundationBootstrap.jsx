import { useEffect } from 'react';
import { ensureWorldSeed2025, verifySaveFoundation } from '@/lib/saveFoundation';

export default function SaveFoundationBootstrap() {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const status = await verifySaveFoundation();
        if (!cancelled && !status.ok) await ensureWorldSeed2025();
      } catch (error) {
        console.error('[Save Foundation] inicialização segura falhou; nenhum save foi apagado.', error);
      }
    };
    const timer = window.setTimeout(run, 700);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);
  return null;
}
