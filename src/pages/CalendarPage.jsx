import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { Calendar as CalendarIcon, Trophy } from 'lucide-react';
import { PageContainer, PageHeader, GlassCard, EmptyStateCard, LoadingScreen } from '@/components/padel/ui';
import { ensureMyProfile } from '@/lib/padel';
import { daysBetween, CAREER_START_DATE } from '@/lib/career';
import { advanceCareerDay } from '@/game-core';
import { getTeamRank } from '@/lib/teamRanking';
import { getPartnerBot } from '@/lib/career';
import { enrichTournament } from '@/lib/tournaments';
import { getEventsForRange, getPendingDecisions, resolveDecision, isRegistrationOpen } from '@/lib/calendarSystem';
import { startOfWeek, addDays, format } from 'date-fns';
import CalendarWeekView from '@/components/calendar/CalendarWeekView';
import DayEventList from '@/components/calendar/DayEventList';
import PendingDecisionBanner from '@/components/calendar/PendingDecisionBanner';
import TournamentRegistrationModal from '@/components/calendar/TournamentRegistrationModal';
import TournamentModal from '@/components/tournaments/TournamentModal';
import { useToast } from '@/components/ui/use-toast';
import { loadModuleTasks, safeModuleTask } from '@/lib/moduleLoading';

const TIER_DOT = {
  P2: 'bg-cyan-500',
  P1: 'bg-purple-500',
  Major: 'bg-amber-500',
};

export default function CalendarPage() {
  const [profile, setProfile] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [matches, setMatches] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [pendingDecisions, setPendingDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
const [weekStart, setWeekStart] = useState(startOfWeek(new Date('2026-01-01T00:00:00'), { weekStartsOn: 0 }));
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDayData, setSelectedDayData] = useState({ events: [], matches: [], trainings: [] });
  const [registrationTournament, setRegistrationTournament] = useState(null);
  const [activeTournament, setActiveTournament] = useState(null);
  const [teamRank, setTeamRank] = useState({ rank: 0, total: 0 });
  const { toast } = useToast();

  const careerDate = profile?.career_date || CAREER_START_DATE;

  const loadData = useCallback(async () => {
    try {
      const user = await localGame.auth.me();
      const p = await ensureMyProfile(user);
      setProfile(p);
      if (!p) return;

      const partner = getPartnerBot(p);
      const rank = partner ? await safeModuleTask(() => getTeamRank(p, partner), { label: 'ranking da dupla', fallback: { rank: 0, total: 0 } }) : { rank: 0, total: 0 };
      setTeamRank(rank);

      const { t, m, tr, events, pending } = await loadModuleTasks({
        t: { task: () => localGame.entities.Tournament.list('-start_date', 100), fallback: [], label: 'torneios do calendário' },
        m: { task: () => localGame.entities.Match.list('-created_date', 50), fallback: [], label: 'partidas do calendário' },
        tr: { task: () => localGame.entities.TrainingSession.filter({ profile_id: p.id }), fallback: [], label: 'treinos do calendário' },
        events: { task: () => getEventsForRange(p.id, '2026-01-01', '2027-12-31'), fallback: [], label: 'eventos do calendário' },
        pending: { task: () => getPendingDecisions(p.id, p.career_date || CAREER_START_DATE), fallback: [], label: 'decisões pendentes' },
      });
      setTournaments((t || []).map(enrichTournament));
      setMatches(m || []);
      setTrainings(tr || []);
      setCalendarEvents(events || []);
      setPendingDecisions(pending || []);

      // Set week to current career date's week
      const cd = new Date((p.career_date || CAREER_START_DATE) + 'T00:00:00');
      setWeekStart(startOfWeek(cd, { weekStartsOn: 0 }));
      setSelectedDay(cd);
    } catch (e) {
      console.error('CalendarPage', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Update selected day data when day or data changes
  useEffect(() => {
    if (!selectedDay) return;
    const dayStr = format(selectedDay, 'yyyy-MM-dd');
    const dayEvents = calendarEvents.filter(e => {
      const start = e.start_date;
      const end = e.end_date || e.start_date;
      return dayStr >= start && dayStr <= end;
    });
    const dayMatches = matches.filter(m => m.date === dayStr);
    const dayTrainings = trainings.filter(t => t.date === dayStr);
    setSelectedDayData({ events: dayEvents, matches: dayMatches, trainings: dayTrainings });
  }, [selectedDay, calendarEvents, matches, trainings]);

  // Upcoming tournaments open for registration
  const upcomingTournaments = useMemo(() => {
    return tournaments
      .filter(t => t.start_date && t.start_date >= careerDate && isRegistrationOpen(t, careerDate))
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .slice(0, 5);
  }, [tournaments, careerDate]);

  async function handleAdvanceDay() {
    if (!profile) return;
    setAdvancing(true);
    try {
const updated = await advanceCareerDay(profile);
      setProfile(updated);
      // Refresh events and pending decisions
      const { events, pending } = await loadModuleTasks({
        events: { task: () => getEventsForRange(updated.id, '2026-01-01', '2027-12-31'), fallback: [], label: 'eventos após avanço do dia' },
        pending: { task: () => getPendingDecisions(updated.id, updated.career_date || CAREER_START_DATE), fallback: [], label: 'decisões após avanço do dia' },
      });
      setCalendarEvents(events || []);
      setPendingDecisions(pending || []);
      // Move selected day to new career date
      const cd = new Date((updated.career_date || CAREER_START_DATE) + 'T00:00:00');
      setSelectedDay(cd);
      setWeekStart(startOfWeek(cd, { weekStartsOn: 0 }));
    } catch (e) {
      toast({ title: 'Não é possível avançar', description: e.message, variant: 'destructive' });
    } finally {
      setAdvancing(false);
    }
  }

  async function handleResolveDecision(event, action) {
    try {
      await resolveDecision(event.id, action);
      const pending = await getPendingDecisions(profile.id, careerDate);
      setPendingDecisions(pending || []);
      if (action === 'play' && event.related_id) {
        const tournament = tournaments.find(t => t.id === event.related_id);
        if (tournament) {
          setActiveTournament(tournament);
          return;
        }
      }
      const events = await getEventsForRange(profile.id, '2026-01-01', '2027-12-31');
      setCalendarEvents(events || []);
      toast({ title: action === 'play' ? 'Decisão confirmada' : 'Compromisso cancelado' });
    } catch (e) {
      toast({ title: 'Erro', description: 'Não foi possível resolver.', variant: 'destructive' });
    }
  }

  function handleDayClick(day, data) {
    setSelectedDay(day);
  }

  function handlePlayTournament(event) {
    const tournament = tournaments.find(t => t.id === event.related_id);
    if (tournament) {
      setActiveTournament(tournament);
    }
  }

  async function handleTournamentComplete() {
    const { events, pending } = await loadModuleTasks({
      events: { task: () => getEventsForRange(profile.id, '2026-01-01', '2027-12-31'), fallback: [], label: 'eventos após torneio' },
      pending: { task: () => getPendingDecisions(profile.id, careerDate), fallback: [], label: 'decisões após torneio' },
    });
    setCalendarEvents(events || []);
    setPendingDecisions(pending || []);
    const matchesList = await localGame.entities.Match.list('-created_date', 50);
    setMatches(matchesList || []);
    const updatedProfile = await ensureMyProfile(await localGame.auth.me());
    setProfile(updatedProfile);
  }

  if (loading) return <LoadingScreen />;
  if (!profile) return <EmptyStateCard icon={CalendarIcon} message="Crie seu perfil para ver o calendário." />;

  return (
    <PageContainer>
      <PageHeader icon={CalendarIcon} title="Calendário da Carreira" subtitle="Gerencie sua agenda, inscrições e compromissos" accent="cyan" />

      {/* Pending decisions — blocks day advance */}
      {pendingDecisions.length > 0 && (
        <PendingDecisionBanner events={pendingDecisions} onResolve={handleResolveDecision} />
      )}

      {/* Week view */}
      <CalendarWeekView
        careerDate={careerDate}
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        events={calendarEvents}
        matches={matches}
        trainings={trainings}
        onDayClick={handleDayClick}
        onAdvanceDay={handleAdvanceDay}
        advancing={advancing}
      />

      {/* Selected day details */}
      {selectedDay && (
        <DayEventList
          day={selectedDay}
          dayData={selectedDayData}
          onResolve={handleResolveDecision}
          onPlayTournament={handlePlayTournament}
        />
      )}

      {/* Upcoming tournament registrations */}
      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <Trophy className="h-4 w-4 text-amber-400" /> Inscrições Abertas
        </h2>
        {upcomingTournaments.length === 0 ? (
          <EmptyStateCard icon={CalendarIcon} message="Nenhuma inscrição aberta no momento." />
        ) : (
          <div className="space-y-2">
            {upcomingTournaments.map(t => {
              const days = daysBetween(careerDate, t.start_date);
              const isRegistered = calendarEvents.some(e => e.related_id === t.id && e.status === 'scheduled');
              return (
                <button
                  key={t.id}
                  onClick={() => setRegistrationTournament(t)}
                  className="w-full flex items-center gap-3 rounded-xl bg-secondary/30 p-3 hover:bg-secondary/50 transition-colors text-left"
                >
                  <div className="text-center shrink-0">
                    <p className="text-[9px] text-muted-foreground uppercase">{format(new Date(t.start_date + 'T00:00:00'), 'MMM')}</p>
                    <p className="font-black text-lg leading-none">{format(new Date(t.start_date + 'T00:00:00'), 'dd')}</p>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{t.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${TIER_DOT[t.tier]} bg-opacity-15`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${TIER_DOT[t.tier]}`} /> {t.tier}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{t.location?.split(',')[0]}</span>
                      {isRegistered && <span className="text-[9px] text-primary font-bold">✓ Inscrito</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-cyan-400 shrink-0">{days > 0 ? `em ${days}d` : 'hoje'}</span>
                </button>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Registration modal */}
      {registrationTournament && (
        <TournamentRegistrationModal
          tournament={registrationTournament}
          profile={profile}
          teamRank={teamRank.rank}
          onClose={() => setRegistrationTournament(null)}
          onRegistered={async (updatedProfile) => {
            setProfile(updatedProfile);
            const events = await getEventsForRange(profile.id, '2026-01-01', '2027-12-31');
            setCalendarEvents(events || []);
            const tList = await localGame.entities.Tournament.list('-start_date', 100);
            setTournaments((tList || []).map(enrichTournament));
          }}
        />
      )}

      {/* Active tournament modal */}
      {activeTournament && (
        <TournamentModal
          tournament={activeTournament}
          profile={profile}
          onClose={() => setActiveTournament(null)}
          onProfileUpdate={setProfile}
          onComplete={handleTournamentComplete}
        />
      )}
    </PageContainer>
  );
}