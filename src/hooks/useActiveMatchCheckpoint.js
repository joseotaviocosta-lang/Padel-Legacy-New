import { useCallback, useEffect, useState } from 'react';
import { getMatchCheckpointRepository } from '@/careers/MatchCheckpointRepository.js';

// M3 (docs/MOBILE_M3_LIVE_MATCH_LIFECYCLE.md) — detecção de "partida em
// andamento" para a UX de recovery (Parte 8): páginas que podem abrir
// LiveMatch (Matches.jsx, Tournaments.jsx) e o aviso global usam este hook
// para saber, sem duplicar leitura de arquivo, se existe um checkpoint
// pendente para a carreira ativa.
export function useActiveMatchCheckpoint(careerId) {
  const [checkpoint, setCheckpoint] = useState(null);
  const [loading, setLoading] = useState(Boolean(careerId));

  const refresh = useCallback(async () => {
    if (!careerId) {
      setCheckpoint(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    const found = await getMatchCheckpointRepository().read(careerId).catch(() => null);
    setCheckpoint(found);
    setLoading(false);
    return found;
  }, [careerId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const found = await refresh();
      if (!active) return;
      void found;
    })();
    return () => { active = false; };
  }, [refresh]);

  const clear = useCallback(async () => {
    if (!careerId) return;
    await getMatchCheckpointRepository().clear(careerId).catch(() => {});
    setCheckpoint(null);
  }, [careerId]);

  return { checkpoint, loading, refresh, clear };
}
