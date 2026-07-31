import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Crown, Flame, Circle, Coins, Zap, Star, Calendar, Trophy, Award, Play, CheckCircle, Lock, Newspaper, BarChart3, TrendingUp, AlertCircle } from 'lucide-react';
import { ensureMyProfile, formatDate } from '@/lib/padel';
import { careerMonth, daysBetween, ensureFutureTournaments } from '@/lib/career';
import { simulatePastTournaments } from '@/lib/teamRanking';
import CareerStatusBar from '@/components/career/CareerStatusBar';
import PartnerSelection from '@/components/career/PartnerSelection';
import TournamentModal from '@/components/tournaments/TournamentModal';
import TournamentRegistrationModal from '@/components/calendar/TournamentRegistrationModal';
import TournamentStats from '@/components/tournaments/TournamentStats';
import CircuitEvolution from '@/components/tournaments/CircuitEvolution';
import TournamentNews from '@/components/tournaments/TournamentNews';
import TournamentBracket from '@/components/tournaments/TournamentBracket';
import { LoadingScreen } from '@/components/padel/ui';
import { enrichTournament } from '@/lib/tournaments';
import { getTeamRank } from '@/lib/teamRanking';
import { getPartnerBot } from '@/lib/career';
import { isRegistrationOpen } from '@/lib/calendarSystem';

const TIER_CONFIG = {
  Major: {
    label: 'Major',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    card: 'border-amber-500/25 hover:border-amber-500/50',
    glow: 'shadow-[0_0_24px_rgba(245,158,11,0.12)]',
    icon: Crown,
    diffLabel: 'Muito Difícil',
    diffColor: 'text-red-400',
  },
  P1: {
    label: 'P1',
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    card: 'border-purple-500/20 hover:border-purple-500/40',
    glow: '',
    icon: Flame,
    diffLabel: 'Difícil',
    diffColor: 'text-orange-400',
  },
  P2: {
    label: 'P2',
    badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    card: 'border-cyan-500/20 hover:border-cyan-500/40',
    glow: '',
    icon: Circle,
    diffLabel: 'Equilibrado',
    diffColor: 'text-green-400',
  },
};

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'Major', label: 'Majors' },
  { id: 'P1', label: 'P1' },
  { id: 'P2', label: 'P2' },
];

export default function Tournaments() {
  const [tournaments, setTournaments] = useState([]);
  const [season, setSeason] = useState(null);
  const [profile, setProfile] = useState(null);
  const [playedTournaments, setPlayedTournaments] = useState(new Set());
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [showPartner, setShowPartner] = useState(false);
  const [activeTournament, setActiveTournament] = useState(null);
  const [activeTab, setActiveTab] = useState('calendar');
  const [matches, setMatches] = useState([]);
  const [bracketTournament, setBracketTournament] = useState(null);
  const [registeredTournaments, setRegisteredTournaments] = useState(new Set());
  const [registrationTournament, setRegistrationTournament] = useState(null);
  const [teamRank, setTeamRank] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const user = await base44.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);

        // Simulate champions for past tournaments the player didn't play
        // and ensure the calendar extends into the future
        if (p?.career_date) {
          await simulatePastTournaments(p.career_date);
          await ensureFutureTournaments(p.career_date);
        }

        // Fetch all tournaments — the calendar spans multiple seasons now
        const list = await base44.entities.Tournament.list('-start_date', 200);
        setTournaments((list || []).map(enrichTournament));

        // Determine the current season based on career year
        const seasons = await base44.entities.Season.list('-start_date', 50);
        const careerYear = p?.career_date ? new Date(p.career_date + 'T00:00:00').getFullYear() : 2026;
        const currentSeason = seasons?.find(s => s.season_number === careerYear)
          || seasons?.find(s => s.is_active)
          || seasons?.[0];
        setSeason(currentSeason);

        // Track played tournaments
        const matches = await base44.entities.Match.list('-created_date', 100);
        const played = new Set(
          (matches || [])
            .filter(m => m.tournament_name && m.tournament_name !== 'Partida Oficial' && m.team_a?.[0] === p?.sport_name)
            .map(m => m.tournament_name)
        );
        setPlayedTournaments(played);
        setMatches(matches || []);

        // Track registered tournaments (scheduled calendar events)
        if (p?.id) {
          const calEvents = await base44.entities.CalendarEvent.filter({
            profile_id: p.id,
            event_type: 'tournament',
            status: 'scheduled',
          });
          setRegisteredTournaments(new Set((calEvents || []).map(e => e.related_id).filter(Boolean)));

          // Compute team rank if player has a partner
          if (p.partner_id) {
            const partner = getPartnerBot(p);
            if (partner) {
              const { rank } = await getTeamRank(p, partner);
              setTeamRank(rank);
            }
          }
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  async function refreshProfile() {
    const user = await base44.auth.me();
    const p = await ensureMyProfile(user);
    setProfile(p);
    const [matches, tournamentList] = await Promise.all([
      base44.entities.Match.list('-created_date', 100),
      base44.entities.Tournament.list('-start_date', 200),
    ]);
    setMatches(matches || []);
    setTournaments((tournamentList || []).map(enrichTournament));
    const played = new Set(
      (matches || [])
        .filter(m => m.tournament_name && m.tournament_name !== 'Partida Oficial' && m.team_a?.[0] === p?.sport_name)
        .map(m => m.tournament_name)
    );
    setPlayedTournaments(played);

    // Reload registered tournaments
    const calEvents = await base44.entities.CalendarEvent.filter({
      profile_id: p.id,
      event_type: 'tournament',
      status: 'scheduled',
    });
    setRegisteredTournaments(new Set((calEvents || []).map(e => e.related_id).filter(Boolean)));
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        <div className="glass rounded-2xl p-10 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Não foi possível carregar seu perfil. Tente recarregar a página.</p>
        </div>
      </div>
    );
  }

  const currentMonth = careerMonth(profile);
  const careerDate = profile?.career_date;

  function isTournamentPast(t) {
    if (t.start_date && careerDate) return t.start_date < careerDate;
    return (t.month || 0) < currentMonth;
  }

  function isTournamentPlayable(t) {
    return Boolean(t.start_date && careerDate && t.start_date === careerDate);
  }

  function canRegisterForTournament(t) {
    if (isTournamentPast(t) || registeredTournaments.has(t.id)) return false;
    return isRegistrationOpen(t, careerDate);
  }

  const hasEnergyForTournament = (profile?.energy || 0) >= 20;

  const sorted = [...tournaments].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
  const byView = view === 'upcoming'
    ? sorted.filter(t => !isTournamentPast(t))
    : sorted.filter(t => isTournamentPast(t));
  const filtered = filter === 'all' ? byView : byView.filter(t => t.tier === filter);

  const counts = {
    Major: sorted.filter(t => t.tier === 'Major').length,
    P1: sorted.filter(t => t.tier === 'P1').length,
    P2: sorted.filter(t => t.tier === 'P2').length,
  };

  const byMonth = {};
  filtered.forEach(t => {
    const key = t.start_date?.slice(0, 7) || `sem-data-${t.month || 0}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(t);
  });

  function handlePlay(tournament) {
    if (isTournamentPast(tournament)) return;
    if (playedTournaments.has(tournament.name)) return;
    // If not registered yet, open registration modal first
    if (!registeredTournaments.has(tournament.id)) {
      if (!canRegisterForTournament(tournament)) return;
      setRegistrationTournament(tournament);
      return;
    }
    if (!profile?.partner_id) {
      setShowPartner(true);
      return;
    }
    setActiveTournament(tournament);
  }

  async function handleRegistered(updatedProfile) {
    if (updatedProfile) setProfile(updatedProfile);
    // Refresh registered set
    const calEvents = await base44.entities.CalendarEvent.filter({
      profile_id: (updatedProfile || profile).id,
      event_type: 'tournament',
      status: 'scheduled',
    });
    setRegisteredTournaments(new Set((calEvents || []).map(e => e.related_id).filter(Boolean)));
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="glass rounded-2xl p-5 grid-bg relative overflow-hidden">
        <div className="absolute -top-12 -right-12 h-40 w-40 bg-amber-500/15 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="h-5 w-5 text-amber-400" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-amber-400 font-bold">Circuito Oficial</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">{season?.name || 'Temporada 2026'}</h1>
          <p className="text-sm text-muted-foreground mt-1">{season?.description || 'Calendário completo de torneios'}</p>

          <div className="flex gap-3 mt-4 flex-wrap">
            <SummaryStat icon={Crown} label="Majors" value={counts.Major} color="text-amber-400" />
            <SummaryStat icon={Flame} label="P1" value={counts.P1} color="text-purple-400" />
            <SummaryStat icon={Circle} label="P2" value={counts.P2} color="text-cyan-400" />
          </div>
        </div>
      </div>

      <CareerStatusBar profile={profile} onPartnerClick={() => setShowPartner(true)} />

      {/* Top tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
        {[
          { id: 'calendar', label: 'Calendário', icon: Calendar },
          { id: 'stats', label: 'Estatísticas', icon: BarChart3 },
          { id: 'circuit', label: 'Circuito', icon: TrendingUp },
          { id: 'news', label: 'Notícias', icon: Newspaper },
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'glass text-muted-foreground hover:text-foreground'}`}>
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'calendar' && (
      <>
      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('upcoming')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            view === 'upcoming'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          Futuros
        </button>
        <button
          onClick={() => setView('past')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            view === 'past'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          Passados
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map(t => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filter === t.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tournament list */}
      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {view === 'upcoming' ? 'Nenhum torneio futuro disponível.' : 'Nenhum torneio passado encontrado.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.keys(byMonth).sort((a, b) => view === 'past' ? b.localeCompare(a) : a.localeCompare(b)).map(m => {
            const [yearText, monthText] = m.split('-');
            const monthNumber = Number(monthText);
            const groupYear = Number(yearText);
            const careerYear = careerDate ? Number(careerDate.slice(0, 4)) : 0;
            const isCurrentGroup = groupYear === careerYear && monthNumber === currentMonth;
            return (
            <div key={m}>
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> {MONTHS[monthNumber - 1] || 'Sem data'} {groupYear || ''}
                {isCurrentGroup && (
                  <span className="ml-1 inline-flex items-center rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[9px] font-bold uppercase">Atual</span>
                )}
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {byMonth[m].map(t => (
                  <TournamentCard
                    key={t.id}
                    tournament={t}
                    isPlayable={isTournamentPlayable(t)}
                    isPast={isTournamentPast(t)}
                    isPlayed={isTournamentPast(t) && playedTournaments.has(t.name)}
                    isRegistered={registeredTournaments.has(t.id)}
                    canRegister={canRegisterForTournament(t)}
                    hasPartner={!!profile?.partner_id}
                    hasEnergy={hasEnergyForTournament}
                    onPlay={() => handlePlay(t)}
                    onViewBracket={() => setBracketTournament(t)}
                    careerDate={profile?.career_date}
                  />
                ))}
              </div>
            </div>
            );
          })}
        </div>
      )}

      </>
      )}

      {activeTab === 'stats' && (
        <TournamentStats profile={profile} tournaments={tournaments} matches={matches} />
      )}
      {activeTab === 'circuit' && (
        <CircuitEvolution tournaments={tournaments} />
      )}
      {activeTab === 'news' && (
        <TournamentNews tournaments={tournaments} profile={profile} />
      )}

      {bracketTournament && (
        <TournamentBracket tournament={bracketTournament} onClose={() => setBracketTournament(null)} />
      )}

      {showPartner && (
        <PartnerSelection
          profile={profile}
          onClose={() => setShowPartner(false)}
          onPartnerSelected={(p) => { setProfile(p); setShowPartner(false); }}
        />
      )}

      {activeTournament && (
        <TournamentModal
          tournament={activeTournament}
          profile={profile}
          onClose={() => setActiveTournament(null)}
          onProfileUpdate={setProfile}
          onComplete={refreshProfile}
        />
      )}

      {registrationTournament && (
        <TournamentRegistrationModal
          tournament={registrationTournament}
          profile={profile}
          teamRank={teamRank}
          onClose={() => setRegistrationTournament(null)}
          onRegistered={handleRegistered}
        />
      )}
    </div>
  );
}

function SummaryStat({ icon: Icon, label, value, color }) {
  return (
    <div className="glass rounded-xl px-3 py-2 flex items-center gap-2">
      <Icon className={`h-4 w-4 ${color}`} />
      <div>
        <p className="text-lg font-black leading-none">{value}</p>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    </div>
  );
}

function TournamentCard({ tournament, isPlayable, isPast, isPlayed, isRegistered, canRegister, hasPartner, hasEnergy, onPlay, onViewBracket, careerDate }) {
  const config = TIER_CONFIG[tournament.tier] || TIER_CONFIG.P2;
  const Icon = config.icon;

  return (
    <div className={`glass rounded-2xl p-4 border ${config.card} ${config.glow} transition-all ${isPlayed || isPast ? 'opacity-60' : 'hover:scale-[1.02]'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-secondary/60 flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm leading-tight">{tournament.name}</h3>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide mt-0.5 ${config.badge}`}>
              {config.label}
            </span>
          </div>
        </div>
        {isPlayed ? (
          <div className="flex items-center gap-1 text-green-400 shrink-0">
            <CheckCircle className="h-4 w-4" />
            <span className="text-[9px] font-bold uppercase">Concluído</span>
          </div>
        ) : isPast ? (
          <div className="flex items-center gap-1 text-muted-foreground shrink-0">
            <Lock className="h-4 w-4" />
            <span className="text-[9px] font-bold uppercase">Encerrado</span>
          </div>
        ) : null}
      </div>

      {tournament.description && (
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-3 line-clamp-2">{tournament.description}</p>
      )}

      {tournament.start_date && (
        <div className="flex items-center gap-1.5 mb-2">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-foreground">{formatDate(tournament.start_date)}</span>
          {careerDate && (() => {
            const days = daysBetween(careerDate, tournament.start_date);
            return (
              <span className={`text-[10px] ${days === 0 ? 'text-primary font-bold' : days > 0 ? 'text-cyan-400' : 'text-muted-foreground'}`}>
                {days === 0 ? '• Hoje!' : days > 0 ? `• em ${days}d` : `• há ${Math.abs(days)}d`}
              </span>
            );
          })()}
        </div>
      )}

      {isPast && tournament.champion && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] text-amber-400/70 uppercase font-bold tracking-wide">Campeão</p>
            <p className="text-xs font-bold text-amber-300 truncate">{tournament.champion}</p>
          </div>
          <button onClick={onViewBracket} className="text-[9px] text-primary font-bold px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors shrink-0">
            Ver Chave
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-3">
        <span className={`text-[10px] font-semibold ${config.diffColor}`}>● {config.diffLabel}</span>
        <span className="text-[10px] text-muted-foreground">·</span>
        <span className="text-[10px] text-muted-foreground">{tournament.max_participants || 16} vagas</span>
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-border/40">
        <Reward icon={Coins} value={tournament.prize_coins} color="text-yellow-400" />
        <Reward icon={Zap} value={tournament.xp_reward} color="text-primary" />
        <Reward icon={Star} value={tournament.rank_points} color="text-cyan-400" />
        {(isPlayable || canRegister) && !isPlayed && (
          <button
            onClick={onPlay}
            className={`ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-[11px] transition-colors ${
              !hasPartner
                ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                : isPlayable && !hasEnergy
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                  : isRegistered
                    ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                    : 'bg-primary/15 text-primary hover:bg-primary/25'
            }`}
          >
            {!hasPartner ? <><Lock className="h-3 w-3" /> Parceiro</> : !hasEnergy ? <><AlertCircle className="h-3 w-3" /> Sem energia</> : isRegistered && isPlayable ? <><Play className="h-3 w-3" /> Jogar</> : isRegistered ? <><CheckCircle className="h-3 w-3" /> Inscrito</> : <><CheckCircle className="h-3 w-3" /> Inscrever</>}
          </button>
        )}
      </div>
    </div>
  );
}

function Reward({ icon: Icon, value, color }) {
  return (
    <div className="flex items-center gap-1">
      <Icon className={`h-3 w-3 ${color}`} />
      <span className="text-xs font-bold tabular-nums">{value || 0}</span>
    </div>
  );
}