import React, { useEffect, useState } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { Crown, Flame, Coins, Zap, Star, Calendar, Trophy, Award, Play, CheckCircle, Lock, Newspaper, BarChart3, TrendingUp, AlertCircle, Shield, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
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
import { Page, PageContent, PageHeader as PremiumPageHeader, Surface, StatCard, EmptyState } from '@/components/design-system';
import { enrichTournament } from '@/lib/tournaments';
import { getTeamRank } from '@/lib/teamRanking';
import { getPartnerBot } from '@/lib/career';
import { isRegistrationOpen } from '@/lib/calendarSystem';
import { evaluateTournamentChoice } from '@/gameplay/worldTour/TournamentSelectionAI.js';
import { buildAthleteEntryContext, evaluateTournamentEntry, getEntryPathLabel } from '@/gameplay/worldTour/EntryManager.js';
import { validateTournamentIntegrity } from '@/lib/tournamentIntegrity.js';
import { cancelTournamentRegistration, isPlayerRegisteredForTournament, listTournamentRegistrations } from '@/lib/tournamentRegistration.js';
import { useCareer } from '@/careers/useCareer.js';
import { spectatorStore } from '@/gameplay/replay/spectator/SpectatorStore.js';

const TIER_CONFIG = {
  Crown:{label:'Legacy Crown',badge:'bg-amber-500/15 text-amber-300 border-amber-500/40',card:'border-amber-500/25 hover:border-amber-500/50',glow:'shadow-[0_0_24px_rgba(245,158,11,0.12)]',icon:Crown,diffLabel:'Lendário',diffColor:'text-red-400'},
  Elite:{label:'Legacy Elite',badge:'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',card:'border-fuchsia-500/20 hover:border-fuchsia-500/40',glow:'',icon:Flame,diffLabel:'Muito Difícil',diffColor:'text-red-400'},
  Masters:{label:'Legacy Masters',badge:'bg-purple-500/15 text-purple-300 border-purple-500/30',card:'border-purple-500/20 hover:border-purple-500/40',glow:'',icon:Trophy,diffLabel:'Difícil',diffColor:'text-orange-400'},
  Platinum:{label:'Legacy Platinum',badge:'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',card:'border-cyan-500/20 hover:border-cyan-500/40',glow:'',icon:Star,diffLabel:'Competitivo',diffColor:'text-yellow-400'},
  Gold:{label:'Legacy Gold',badge:'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',card:'border-yellow-500/20 hover:border-yellow-500/40',glow:'',icon:Award,diffLabel:'Acessível',diffColor:'text-emerald-400'},
  Silver:{label:'Legacy Silver',badge:'bg-slate-500/15 text-slate-300 border-slate-500/30',card:'border-slate-500/20 hover:border-slate-500/40',glow:'',icon:Shield,diffLabel:'Entrada Mundial',diffColor:'text-slate-300'},
};

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const FILTERS = [
  {id:'all',label:'Todos'}, {id:'Crown',label:'Crown'}, {id:'Elite',label:'Elite'},
  {id:'Masters',label:'Masters'}, {id:'Platinum',label:'Platinum'}, {id:'Gold',label:'Gold'}, {id:'Silver',label:'Silver'},
];

function prepareTournamentList(items) {
  const enriched = (Array.isArray(items) ? items : []).filter(Boolean).map(enrichTournament);
  const errors = validateTournamentIntegrity(enriched);
  const identityErrors = errors.filter(error => error.type === 'missing-id' || error.type === 'duplicate-id');
  if (identityErrors.length > 0) {
    throw new Error(`Integridade dos torneios inválida: ${identityErrors.map(error => error.id || error.type).join(', ')}`);
  }
  if (import.meta.env.DEV && errors.length > 0) console.warn('[Tournaments] inconsistências não fatais', errors);
  return enriched;
}

export default function Tournaments() {
  const {activeCareer}=useCareer();
  const [followedTournaments,setFollowedTournaments]=useState(new Set());
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
  const [registrationRecords, setRegistrationRecords] = useState(new Map());
  const [registrationTournament, setRegistrationTournament] = useState(null);
  const [teamRank, setTeamRank] = useState(0);
  const [activeRunEvents, setActiveRunEvents] = useState(new Map());

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);

        // Simulate champions for past tournaments the player didn't play
        // and ensure the calendar extends into the future
        if (p?.career_date) {
          await simulatePastTournaments(p.career_date);
          await ensureFutureTournaments(p.career_date);
        }

        // Fetch all tournaments — the calendar spans multiple seasons now
        const list = await localGame.entities.Tournament.list('-start_date', 200);
        setTournaments(prepareTournamentList(list));

        // Determine the current season based on career year
        const seasons = await localGame.entities.Season.list('-start_date', 50);
        const careerYear = p?.career_date ? new Date(p.career_date + 'T00:00:00').getFullYear() : 2026;
        const currentSeason = seasons?.find(s => s.season_number === careerYear)
          || seasons?.find(s => s.is_active)
          || seasons?.[0];
        setSeason(currentSeason);

        // Track played tournaments
        const matches = await localGame.entities.Match.list('-created_date', 100);
        const played = new Set(
          (matches || [])
            .filter(m => m.tournament_name && m.tournament_name !== 'Partida Oficial' && m.team_a?.[0] === p?.sport_name)
            .map(m => m.tournament_name)
        );
        setPlayedTournaments(played);
        setMatches(matches || []);

        // Track confirmed registrations from the canonical registration entity.
        if (p?.id) {
          const registrations = await listTournamentRegistrations(p.id);
          const confirmed = (registrations || []).filter(item => item.status === 'confirmed');
          setRegisteredTournaments(new Set(confirmed.map(item => item.tournament_id)));
          setRegistrationRecords(new Map(confirmed.map(item => [item.tournament_id, item])));
          const runEvents = await localGame.entities.CalendarEvent.filter({ profile_id: p.id, status: 'scheduled', event_type: 'tournament' }).catch(() => []);
          setActiveRunEvents(new Map((runEvents || []).filter((event) => event.metadata?.tournament_run).map((event) => [event.related_id, event])));

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
  useEffect(()=>{if(activeCareer?.career_id)spectatorStore.load(activeCareer.career_id).then((state)=>setFollowedTournaments(new Set(state.followed_tournament_ids)));},[activeCareer?.career_id]);
  async function toggleTournamentFollow(id){const next=await spectatorStore.toggle(activeCareer.career_id,'followed_tournament_ids',id);setFollowedTournaments(new Set(next.followed_tournament_ids));}

  async function refreshProfile() {
    const user = await localGame.auth.me();
    const p = await ensureMyProfile(user);
    setProfile(p);
    const [matches, tournamentList, runEvents] = await Promise.all([
      localGame.entities.Match.list('-created_date', 100),
      localGame.entities.Tournament.list('-start_date', 200),
      localGame.entities.CalendarEvent.filter({ profile_id: profile.id, status: 'scheduled', event_type: 'tournament' }).catch(() => []),
    ]);
    setMatches(matches || []);
    setTournaments(prepareTournamentList(tournamentList));
    const played = new Set(
      (matches || [])
        .filter(m => m.tournament_name && m.tournament_name !== 'Partida Oficial' && m.team_a?.[0] === p?.sport_name)
        .map(m => m.tournament_name)
    );
    setPlayedTournaments(played);

    // Reload registered tournaments
    const registrations = await listTournamentRegistrations(p.id);
    const confirmed = (registrations || []).filter(item => item.status === 'confirmed');
    setRegisteredTournaments(new Set(confirmed.map(item => item.tournament_id)));
    setRegistrationRecords(new Map(confirmed.map(item => [item.tournament_id, item])));
    setActiveRunEvents(new Map((runEvents || []).filter((event) => event.metadata?.tournament_run).map((event) => [event.related_id, event])));
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
    if (activeRunEvents.has(t.id)) return false;
    if (t.start_date && careerDate) return t.start_date < careerDate;
    return (t.month || 0) < currentMonth;
  }

  function isTournamentPlayable(t) {
    if (activeRunEvents.has(t.id)) return true;
    return Boolean(t.start_date && careerDate && t.start_date === careerDate);
  }

  function canRegisterForTournament(t) {
    if (isTournamentPast(t) || registeredTournaments.has(t.id)) return false;
    return isRegistrationOpen(t, careerDate);
  }

  const hasEnergyForTournament = (profile?.energy || 0) >= 20;

  const { filtered, counts, byMonth } = (() => {
    const ordered = [...tournaments].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
    const totals = Object.fromEntries(FILTERS.slice(1).map(item => [item.id, 0]));
    ordered.forEach(tournament => {
      if (Object.hasOwn(totals, tournament.tier)) totals[tournament.tier] += 1;
    });
    const inSelectedView = ordered.filter(tournament => {
      const isPast = activeRunEvents.has(tournament.id) ? false : tournament.start_date && careerDate
        ? tournament.start_date < careerDate
        : (tournament.month || 0) < currentMonth;
      return view === 'upcoming' ? !isPast : isPast;
    });
    const selected = filter === 'all' ? inSelectedView : inSelectedView.filter(tournament => tournament.tier === filter);
    const grouped = selected.reduce((groups, tournament) => {
      const key = tournament.start_date?.slice(0, 7) || `sem-data-${tournament.month || 0}`;
      (groups[key] ||= []).push(tournament);
      return groups;
    }, {});
    return { filtered: selected, counts: totals, byMonth: grouped };
  })();

  async function handlePlay(tournament) {
    const activeRun = activeRunEvents.get(tournament.id);
    if (!activeRun && isTournamentPast(tournament)) return;
    if (!activeRun && playedTournaments.has(tournament.name)) return;
    // If not registered yet, open registration modal first
    const persistedRegistration = await isPlayerRegisteredForTournament(profile.id, tournament.id);
    if (!persistedRegistration) {
      if (!canRegisterForTournament(tournament)) return;
      setRegistrationTournament(tournament);
      return;
    }
    if (!isTournamentPlayable(tournament)) return;
    if (!profile?.partner_id) {
      setShowPartner(true);
      return;
    }
    setActiveTournament(tournament);
  }

  async function handleRegistered(updatedProfile) {
    if (updatedProfile) setProfile(updatedProfile);
    // Refresh registered set
    const registrations = await listTournamentRegistrations((updatedProfile || profile).id);
    const confirmed = (registrations || []).filter(item => item.status === 'confirmed');
    setRegisteredTournaments(new Set(confirmed.map(item => item.tournament_id)));
    setRegistrationRecords(new Map(confirmed.map(item => [item.tournament_id, item])));
  }

  async function handleCancelRegistration(tournament) {
    const registration = registrationRecords.get(tournament.id);
    if (!registration || !window.confirm(`Cancelar a inscrição em ${tournament.name}? A agenda será liberada.`)) return;
    const result = await cancelTournamentRegistration({ player: profile, registration, tournament, currentDate: careerDate });
    if (result.success) await handleRegistered(result.profile);
  }

  return (
    <Page width="wide">
      <PageContent>
        <PremiumPageHeader
          eyebrow="Padel Legacy World Tour"
          title={season?.name || 'Temporada 2026'}
          description={season?.description || 'Escolha os torneios certos, administre inscrições e acompanhe a evolução do circuito.'}
          icon={Trophy}
          tone="premium"
          breadcrumb={['Competições', 'Torneios']}
          action={<Link to="/world-tour/live" className="inline-flex items-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/25"><Radio className="h-4 w-4"/>Ao vivo</Link>}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard icon={Crown} label="Crown" value={counts.Crown} tone="premium" />
          <StatCard icon={Flame} label="Elite" value={counts.Elite} tone="danger" />
          <StatCard icon={Trophy} label="Masters" value={counts.Masters} tone="info" />
          <StatCard icon={Star} label="Platinum" value={counts.Platinum} tone="brand" />
          <StatCard icon={Award} label="Gold" value={counts.Gold} tone="warning" />
          <StatCard icon={Shield} label="Silver" value={counts.Silver} />
        </div>

        <Surface variant="subtle" padding="compact" className="text-xs text-muted-foreground">
          Inscrições normalmente abrem 30 dias antes e encerram 1 dia antes. Datas sobrepostas geram conflito e exigem uma escolha estratégica da dupla.
        </Surface>

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
        <EmptyState icon={Trophy} title="Nenhum torneio encontrado" description={view === 'upcoming' ? 'Não há torneios futuros disponíveis para os filtros atuais.' : 'Não há torneios passados nos filtros atuais.'} />
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
                    onCancel={() => handleCancelRegistration(t)}
                    onViewBracket={() => setBracketTournament(t)}
                    careerDate={profile?.career_date}
                    profile={profile}
                    teamRank={teamRank}
                    followed={followedTournaments.has(t.id)}
                    onToggleFollow={()=>toggleTournamentFollow(t.id)}
                    activeRun={activeRunEvents.get(t.id) || null}
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
      </PageContent>
    </Page>
  );
}

function TournamentCard({ tournament, isPlayable, isPast, isPlayed, isRegistered, canRegister, hasPartner, hasEnergy, onPlay, onCancel, onViewBracket, careerDate, profile, teamRank, followed, onToggleFollow, activeRun }) {
  const config = TIER_CONFIG[tournament.tier] || TIER_CONFIG.Silver;
  const Icon = config.icon;
  const coach = !isPast ? evaluateTournamentChoice(tournament, {
    rank: teamRank,
    teamRank,
    energy: profile?.energy ?? 100,
    age: profile?.age ?? 25,
    nationality: profile?.nationality,
  }, {}) : null;
  const entry = !isPast ? evaluateTournamentEntry(tournament, buildAthleteEntryContext(profile, teamRank, tournament)) : null;
  const activeMatch = activeRun?.metadata?.tournament_run?.matches?.[activeRun?.metadata?.tournament_run?.currentRound || 0] || null;
  const displayDate = activeMatch?.date || tournament.start_date;

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
            {tournament.concurrent_events > 1 && (
              <span className="ml-1 inline-flex items-center rounded-full bg-red-500/10 text-red-300 border border-red-500/20 px-2 py-0.5 text-[9px] font-bold uppercase">
                Escolha estratégica · {tournament.concurrent_events} eventos
              </span>
            )}
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
      <div className="mb-3 flex gap-2"><button onClick={onToggleFollow} className={`text-[10px] font-bold rounded-lg px-2 py-1 ${followed?'bg-primary/15 text-primary':'bg-secondary text-muted-foreground'}`}>{followed?'Torneio acompanhado':'Acompanhar torneio'}</button><button onClick={onViewBracket} className="rounded-lg bg-secondary px-2 py-1 text-[10px] font-bold text-cyan-300">Ver chave</button></div>

      {tournament.description && (
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-3 line-clamp-2">{tournament.description}</p>
      )}

      {displayDate && (
        <div className="flex items-center gap-1.5 mb-2">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-foreground">{formatDate(displayDate)}</span>
          {careerDate && (() => {
            const days = daysBetween(careerDate, displayDate);
            return (
              <span className={`text-[10px] ${days === 0 ? 'text-primary font-bold' : days > 0 ? 'text-cyan-400' : 'text-muted-foreground'}`}>
                {days === 0 ? '• Hoje!' : days > 0 ? `• em ${days}d` : `• há ${Math.abs(days)}d`}
              </span>
            );
          })()}
        </div>
      )}
      {activeMatch && <div className="mb-3 rounded-xl border border-primary/25 bg-primary/5 p-2.5"><p className="text-[9px] font-black uppercase tracking-wider text-primary">Em torneio</p><p className="mt-1 text-xs font-bold">{activeMatch.round} · {activeMatch.preparationCompleted ? 'plano definido' : 'preparação pendente'}</p></div>}

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

      {coach && (
        <div className="mb-3 rounded-xl bg-secondary/35 border border-border/40 p-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] uppercase tracking-wider font-black text-primary">Análise do treinador</span>
            <span className={`text-[9px] font-bold ${entry?.eligible ? 'text-emerald-400' : 'text-red-400'}`}>
              {getEntryPathLabel(entry?.path)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            <span className="text-muted-foreground">Chance de título</span><strong className="text-right">{coach.titleChance}%</strong>
            <span className="text-muted-foreground">Chance de semifinal</span><strong className="text-right">{coach.semifinalChance}%</strong>
            <span className="text-muted-foreground">Lucro esperado</span><strong className="text-right">{coach.expectedNet >= 0 ? '+' : ''}{coach.expectedNet}</strong>
            <span className="text-muted-foreground">Pontos esperados</span><strong className="text-right">{coach.expectedPoints}</strong>
            <span className="text-muted-foreground">Fadiga estimada</span><strong className="text-right text-orange-400">+{coach.fatigueIncrease}%</strong>
          </div>
        </div>
      )}

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
            {!hasPartner ? <><Lock className="h-3 w-3" /> Parceiro</> : !hasEnergy && activeMatch?.date === careerDate ? <><AlertCircle className="h-3 w-3" /> Sem energia</> : activeMatch ? <><Play className="h-3 w-3" /> {activeMatch.date === careerDate && activeMatch.preparationCompleted ? 'Jogar' : 'Preparar'}</> : isRegistered && isPlayable ? <><Play className="h-3 w-3" /> Jogar</> : isRegistered ? <><CheckCircle className="h-3 w-3" /> Inscrito</> : <><CheckCircle className="h-3 w-3" /> Inscrever</>}
          </button>
        )}
        {isRegistered && !isPlayable && !isPast && <button onClick={onCancel} className="ml-auto text-[10px] font-bold text-red-300 hover:text-red-200">Cancelar inscrição</button>}
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
