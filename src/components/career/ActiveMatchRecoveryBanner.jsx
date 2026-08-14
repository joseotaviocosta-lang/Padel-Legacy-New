import React from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Play } from 'lucide-react';
import { useCareer } from '@/careers/useCareer.js';
import { useActiveMatchCheckpoint } from '@/hooks/useActiveMatchCheckpoint.js';

// M3 (docs/MOBILE_M3_LIVE_MATCH_LIFECYCLE.md, Parte 8): ponto único e sempre
// visível (Home) para o jogador saber que existe uma partida interrompida,
// mesmo que ele não volte sozinho para Partidas/Torneios. O clique só
// navega — a confirmação real de "continuar" acontece dentro do
// SimulationModal/TournamentModal (ambos já detectam o mesmo checkpoint e
// pedem confirmação antes de restaurar, nunca abrindo direto no meio).
export default function ActiveMatchRecoveryBanner() {
  const { activeCareer } = useCareer();
  const navigate = useNavigate();
  const { checkpoint } = useActiveMatchCheckpoint(activeCareer?.career_id);

  if (!checkpoint) return null;

  const isTournament = checkpoint.type === 'tournament';
  const destination = isTournament ? '/tournaments' : '/matches';

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <History className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-black">Partida em andamento</p>
          <p className="text-xs text-muted-foreground">
            {isTournament ? 'Uma rodada de torneio' : 'Uma partida treino'} foi interrompida antes de terminar.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate(destination)}
        className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground"
      >
        <Play className="h-3.5 w-3.5" /> Continuar partida
      </button>
    </div>
  );
}
