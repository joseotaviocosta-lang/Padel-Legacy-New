import { useEffect } from 'react';
import { ensureWorldSeed2025, verifySaveFoundation } from '@/lib/saveFoundation';
import { useCareer } from '@/careers/useCareer.js';

export default function SaveFoundationBootstrap() {
  const { activeCareer, loading } = useCareer();

  useEffect(() => {
    if (loading || !activeCareer?.career_id) return undefined;

    let cancelled = false;
    const run = async () => {
      try {
        const status = await verifySaveFoundation();
        if (!cancelled && !status.ok) await ensureWorldSeed2025();
      } catch (error) {
        console.error('[Save Foundation] inicialização segura falhou; nenhum save foi apagado.', error);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [activeCareer?.career_id, loading]);

  return null;
}
