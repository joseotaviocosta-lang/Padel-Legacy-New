import React, { useEffect, useState } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { MapPin, Calendar, Swords, Trophy, Bot, Play, AlertCircle } from 'lucide-react';
import { useCareer } from '@/careers/useCareer.js';
import { formatDate, ensureMyProfile, canPlayMatchToday, DAILY_MATCH_LIMIT, isInjured, injuryRecoveryDays } from '@/lib/padel';
import SimulationModal from '@/components/matches/SimulationModal';
import PartnerSelection from '@/components/career/PartnerSelection';
import { ActionFeedback, Button, EmptyState, Page, PageContent, PageHeader, PageSkeleton, StatCard, Surface, SurfaceHeader } from '@/components/design-system';
import { useActiveMatchCheckpoint } from '@/hooks/useActiveMatchCheckpoint.js';

export default function Matches() {
  const { activeCareer } = useCareer();
  const [matches, setMatches] = useState([]);
  const [profile, setProfile] = useState(null);
  const [showSimulation, setShowSimulation] = useState(false);
  const [showPartner, setShowPartner] = useState(false);
  const [loading, setLoading] = useState(true);
  // M3 (docs/MOBILE_M3_LIVE_MATCH_LIFECYCLE.md, Parte 8): uma partida treino
  // interrompida reabre o modal automaticamente (o modal em si sempre mostra
  // a confirmação "Continuar partida?" antes de restaurar — nunca cai direto
  // no meio do placar sem avisar).
  const { checkpoint: activeMatchCheckpoint } = useActiveMatchCheckpoint(activeCareer?.career_id);

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
        const list = await localGame.entities.Match.list('-created_date', 50);
        setMatches(list || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (activeMatchCheckpoint?.type === 'practice') setShowSimulation(true);
  }, [activeMatchCheckpoint]);

  if (loading) {
    return <PageSkeleton variant="stats" rows={4} />;
  }

  if (!profile) {
    return (
      <Page size="default"><PageContent>
        <EmptyState icon={Swords} title="Perfil não encontrado" description="Não foi possível carregar seu perfil. Tente recarregar a página." />
      </PageContent></Page>
    );
  }

  const wins = matches.filter(match => match.winner === 'A').length;
  const winRate = matches.length ? Math.round((wins / matches.length) * 100) : 0;
  const playStatus = canPlayMatchToday(profile);

  return (
    <Page>
      <PageContent>
        <PageHeader eyebrow="Preparação competitiva" title="Partidas de treino" description="Teste táticas, fortaleça a dupla e pratique sem alterar o ranking oficial." icon={Swords} tone="info" breadcrumb={['Competições', 'Partidas']} action={<Button level="primary" size="touch" onClick={() => profile?.partner_id ? setShowSimulation(true) : setShowPartner(true)} disabled={!playStatus.allowed}><Play className="h-4 w-4" /> Jogar agora</Button>} />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon={Swords} label="Hoje" value={`${profile?.practice_matches_today || 0}/${DAILY_MATCH_LIMIT}`} />
          <StatCard icon={Trophy} label="Vitórias" value={wins} tone="success" />
          <StatCard icon={AlertCircle} label="Aproveitamento" value={`${winRate}%`} tone={winRate >= 50 ? 'success' : 'warning'} />
          <StatCard icon={Bot} label="Histórico" value={matches.length} tone="info" />
        </div>

      {isInjured(profile) && (
        <ActionFeedback state="error" title={`Lesionado · recupera em ${injuryRecoveryDays(profile)} dias`} description="Avance o dia no calendário para se recuperar." />
      )}

      <Surface>
        <SurfaceHeader title="Histórico recente" description="Resultados mais recentes das partidas de preparação." icon={Calendar} />
        <div className="space-y-3">
        {matches.length === 0 ? (
          <EmptyState icon={Swords} title="Nenhuma partida registrada" description="Jogue uma partida de treino para iniciar o histórico da dupla." />
        ) : (
          matches.map((m) => {
            const wonA = m.winner === 'A';
            return (
              <div key={m.id} className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  {/* Team A */}
                  <div className={`flex-1 min-w-0 ${wonA ? 'opacity-100' : 'opacity-50'}`}>
                    <div className="flex items-center gap-2">
                      {wonA && <Trophy className="h-3.5 w-3.5 text-amber-400" />}
                      <span className="text-sm font-bold truncate">{(m.team_a || []).join(' & ')}</span>
                    </div>
                  </div>
                  {/* Score */}
                  <div className="flex items-center gap-2 px-3">
                    <span className={`text-2xl font-black tabular-nums ${wonA ? 'text-primary' : 'text-muted-foreground'}`}>{m.score_a}</span>
                    <span className="text-muted-foreground/40 text-xs">×</span>
                    <span className={`text-2xl font-black tabular-nums ${!wonA ? 'text-primary' : 'text-muted-foreground'}`}>{m.score_b}</span>
                  </div>
                  {/* Team B */}
                  <div className={`flex-1 min-w-0 text-right ${!wonA ? 'opacity-100' : 'opacity-50'}`}>
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-sm font-bold truncate">{(m.team_b || []).join(' & ')}</span>
                      {!wonA && <Trophy className="h-3.5 w-3.5 text-amber-400" />}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(m.date)}</span>
                  {m.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {m.location}</span>}
                  {m.match_type === 'simulada' && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground"><Bot className="h-2.5 w-2.5" /> Simulada</span>}
                  <span className="text-[9px] text-muted-foreground">Replays não estão mais disponíveis</span>
                </div>
              </div>
            );
          })
        )}
        </div>
      </Surface>

      {showSimulation && (
        <SimulationModal
          profile={profile}
          careerId={activeCareer?.career_id}
          onClose={() => setShowSimulation(false)}
          onProfileUpdate={setProfile}
          onComplete={async () => {
            const list = await localGame.entities.Match.list('-created_date', 50);
            setMatches(list || []);
          }}
        />
      )}

      {showPartner && (
        <PartnerSelection
          profile={profile}
          onClose={() => setShowPartner(false)}
          onPartnerSelected={(p) => { setProfile(p); setShowPartner(false); }}
        />
      )}
      </PageContent>
    </Page>
  );
}
