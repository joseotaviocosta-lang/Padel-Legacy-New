import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bot, Calendar, MapPin, Play, Swords, Trophy } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { useCareer } from '@/careers/useCareer.js';
import PartnerSelection from '@/components/career/PartnerSelection';
import SimulationModal from '@/components/matches/SimulationModal';
import { ActionFeedback, EmptyState, StatusBadge, Surface, SurfaceHeader } from '@/components/design-system';
import { useActiveMatchCheckpoint } from '@/hooks/useActiveMatchCheckpoint.js';
import { canPlayMatchToday, DAILY_MATCH_LIMIT, formatDate, injuryRecoveryDays, isInjured } from '@/lib/padel.js';
import { TRAINING_CENTER_VIEWS } from '@/navigation/routes.js';

export default function PracticeMatchView({ profile, onProfileUpdate, onSelectView, autoOpen = false }) {
  const entities = /** @type {any} */ (localGame.entities);
  const { activeCareer } = useCareer();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSimulation, setShowSimulation] = useState(autoOpen);
  const [showPartner, setShowPartner] = useState(false);
  const { checkpoint } = useActiveMatchCheckpoint(activeCareer?.career_id);

  async function refreshMatches() {
    const list = await entities.Match.list('-created_date', 50);
    setMatches(list || []);
  }

  useEffect(() => {
    let cancelled = false;
    entities.Match.list('-created_date', 50)
      .then((list) => { if (!cancelled) setMatches(list || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entities.Match, profile.id]);

  useEffect(() => {
    if (checkpoint?.type === 'practice') setShowSimulation(true);
  }, [checkpoint]);

  const stats = useMemo(() => {
    const wins = matches.filter((match) => match.winner === 'A').length;
    return { wins, winRate: matches.length ? Math.round((wins / matches.length) * 100) : 0 };
  }, [matches]);
  const playStatus = canPlayMatchToday(profile);
  const playedToday = Number(profile.practice_matches_today || 0) >= DAILY_MATCH_LIMIT;

  return (
    <div className="space-y-3" data-training-center-view="match">
      {isInjured(profile) && <ActionFeedback state="error" title={`Lesionado · recupera em ${injuryRecoveryDays(profile)} dias`} description="Avance o dia no calendário para se recuperar." action={null} className="" />}

      <Surface variant={playStatus.allowed ? 'premium' : 'subtle'} padding="compact">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Swords className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-primary">Partida treino · {profile.practice_matches_today || 0}/{DAILY_MATCH_LIMIT}</p>
            <h2 className="text-base font-black">{playedToday ? 'Partida treino de hoje concluída ✓' : playStatus.allowed ? 'Disponível hoje' : 'Indisponível hoje'}</h2>
            <p className="text-xs text-muted-foreground">{playedToday ? 'O limite diário foi consumido. Avance o dia para jogar novamente.' : profile.partner_id ? 'Sua dupla está pronta para uma partida de preparação.' : 'Escolha uma dupla antes de entrar em quadra.'}</p>
          </div>
          <button type="button" onClick={() => profile.partner_id ? setShowSimulation(true) : setShowPartner(true)} disabled={!playStatus.allowed} className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50">
            <Play className="h-4 w-4" /> Jogar partida treino
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/45 pt-3 text-center">
          <div><p className="text-[9px] font-bold uppercase text-muted-foreground">Vitórias</p><p className="font-black">{stats.wins}</p></div>
          <div><p className="text-[9px] font-bold uppercase text-muted-foreground">Aproveitamento</p><p className="font-black">{stats.winRate}%</p></div>
          <div><p className="text-[9px] font-bold uppercase text-muted-foreground">Histórico</p><p className="font-black">{matches.length}</p></div>
        </div>
      </Surface>

      <Surface padding="none">
        <SurfaceHeader compact title="Histórico recente" description="Resultados de preparação, sem impacto no ranking oficial." icon={Calendar} action={null} className="mb-0 border-b border-border/45 p-3" />
        {loading ? (
          <div className="p-4 text-xs text-muted-foreground">Carregando histórico...</div>
        ) : matches.length === 0 ? (
          <EmptyState compact icon={Swords} eyebrow={null} title="Nenhuma partida registrada" description="Jogue uma partida treino para iniciar o histórico da dupla." action={null} secondaryAction={null} className="" />
        ) : matches.slice(0, 20).map((match) => {
          const won = match.winner === 'A';
          return (
            <div key={match.id} className="border-b border-border/45 p-3 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <p className={`truncate text-xs font-bold ${won ? '' : 'opacity-55'}`}>{(match.team_a || []).join(' & ')}</p>
                <strong className="text-lg tabular-nums text-primary">{match.score_a} × {match.score_b}</strong>
                <p className={`truncate text-right text-xs font-bold ${won ? 'opacity-55' : ''}`}>{(match.team_b || []).join(' & ')}</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border/35 pt-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(match.date)}</span>
                {match.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{match.location}</span>}
                <StatusBadge tone={won ? 'success' : 'neutral'} icon={null} className="">{won ? <><Trophy className="h-3 w-3" />Vitória</> : <><AlertCircle className="h-3 w-3" />Derrota</>}</StatusBadge>
                {match.match_type === 'simulada' && <span className="ml-auto flex items-center gap-1"><Bot className="h-3 w-3" />Simulada</span>}
              </div>
            </div>
          );
        })}
      </Surface>

      {showSimulation && (
        <SimulationModal
          profile={profile}
          careerId={activeCareer?.career_id}
          onClose={() => setShowSimulation(false)}
          onProfileUpdate={(updated) => onProfileUpdate(updated, 'training-center:practice-match')}
          onComplete={refreshMatches}
          onReturnToTrainingCenter={() => { setShowSimulation(false); onSelectView(TRAINING_CENTER_VIEWS.MATCH, { replace: true }); }}
        />
      )}
      {showPartner && (
        <PartnerSelection
          profile={profile}
          onClose={() => setShowPartner(false)}
          onPartnerSelected={(updated) => { onProfileUpdate(updated, 'training-center:partner'); setShowPartner(false); }}
        />
      )}
    </div>
  );
}
