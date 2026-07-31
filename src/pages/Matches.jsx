import React, { useEffect, useState } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { MapPin, Calendar, Swords, Trophy, Bot, Play, AlertCircle } from 'lucide-react';
import { formatDate, levelForXp, ensureMyProfile, canPlayMatchToday, DAILY_MATCH_LIMIT, isInjured, injuryRecoveryDays } from '@/lib/padel';
import SimulationModal from '@/components/matches/SimulationModal';
import PartnerSelection from '@/components/career/PartnerSelection';
import { LoadingScreen, PageHeader, EmptyStateCard, InfoBanner, EmptyStateCard as EmptyProfileCard } from '@/components/padel/ui';

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [profile, setProfile] = useState(null);
  const [showSimulation, setShowSimulation] = useState(false);
  const [showPartner, setShowPartner] = useState(false);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        <EmptyStateCard icon={Swords} title="Perfil não encontrado" message="Não foi possível carregar seu perfil. Tente recarregar a página." />
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <PageHeader icon={Swords} title="Partidas Treino" subtitle="Pratique sem afetar o ranking. Apenas torneios contam pontos." accent="cyan">
        <span className="text-xs text-muted-foreground tabular-nums">{(profile?.practice_matches_today || 0)}/{DAILY_MATCH_LIMIT} jogo</span>
        <button
          onClick={() => profile?.partner_id ? setShowSimulation(true) : setShowPartner(true)}
          disabled={!canPlayMatchToday(profile).allowed}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-500 text-white font-bold text-sm hover:bg-green-600 transition-colors shadow-[0_0_20px_rgba(34,197,94,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play className="h-4 w-4" /> Jogar
        </button>
      </PageHeader>

      {isInjured(profile) && (
        <InfoBanner variant="error" icon={AlertCircle}>
          Você está lesionado! Recupera em {injuryRecoveryDays(profile)} dias. Avance o dia no calendário.
        </InfoBanner>
      )}

      {/* Match list */}
      <div className="space-y-3">
        {matches.length === 0 ? (
          <EmptyStateCard icon={Swords} message="Nenhuma partida registrada ainda. Clique em Jogar para começar sua jornada." />
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
                </div>
              </div>
            );
          })
        )}
      </div>

      {showSimulation && (
        <SimulationModal
          profile={profile}
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
    </div>
  );
}