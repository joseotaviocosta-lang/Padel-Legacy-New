import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Calendar as CalendarIcon, FastForward, Trophy, Zap, Battery, Clock3, AlertTriangle } from 'lucide-react';
import { Button, EmptyState, Page, PageHeader, PageSkeleton, Surface, StatusBadge, ModalShell, Tabs, ConfirmDialog } from '@/components/design-system';
import { ensureMyProfile, incrementMissionProgress } from '@/lib/padel';
import { daysBetween, CAREER_START_DATE } from '@/lib/career';
import { getCareerDatePresentation } from '@/lib/careerDatePresentation.js';
import { advanceCareerDayOnce, advanceCareerDays, advanceCareerUntilRecovered, finalizeCareerAdvanceRange, hasActiveInjury } from '@/game-core';
import { getTeamRank } from '@/lib/teamRanking';
import { getPartnerBot } from '@/lib/career';
import { enrichTournament } from '@/lib/tournaments';
import { getEventsForRange, getPendingDecisions, resolveDecision, isRegistrationOpen, scheduleRecurringActivities, cancelPlannedActivity, updatePlannedActivity } from '@/lib/calendarSystem';
import { startOfWeek, format } from 'date-fns';
import CalendarWeekView from '@/components/calendar/CalendarWeekView';
import DayEventList from '@/components/calendar/DayEventList';
import PendingDecisionBanner from '@/components/calendar/PendingDecisionBanner';
import TournamentRegistrationModal from '@/components/calendar/TournamentRegistrationModal';
import TournamentModal from '@/components/tournaments/TournamentModal';
import { useToast } from '@/components/ui/use-toast';
import { loadModuleTasks, safeModuleTask } from '@/lib/moduleLoading';
import CalendarPlanner from '@/components/calendar/CalendarPlanner';
import CalendarMonthView from '@/components/calendar/CalendarMonthView';
import { useCareer } from '@/careers/useCareer.js';

const TIER_DOT = {
  Silver:'bg-slate-500', Gold:'bg-yellow-500', Platinum:'bg-cyan-500',
  Masters:'bg-purple-500', Elite:'bg-fuchsia-500', Crown:'bg-amber-500',
};

export default function CalendarPage() {
  const { activeCareer } = useCareer();
  const [searchParams] = useSearchParams();
  const openedEventRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [matches, setMatches] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [pendingDecisions, setPendingDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [advancingBatch, setAdvancingBatch] = useState(null);
  const [advanceProgress, setAdvanceProgress] = useState(null);
  const advanceLockRef = useRef(false);
  const [planning, setPlanning] = useState(false);
  const [viewMode, setViewMode] = useState('week');
  const [visibleMonth, setVisibleMonth] = useState(new Date('2026-01-01T00:00:00'));
  const [skippingInjury, setSkippingInjury] = useState(false);
  const [confirmSkipInjury, setConfirmSkipInjury] = useState(false);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date('2026-01-01T00:00:00'), { weekStartsOn: 0 }));
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDayData, setSelectedDayData] = useState({ events: [], matches: [], trainings: [] });
  const [dayDetailsOpen, setDayDetailsOpen] = useState(false);
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
      setVisibleMonth(cd);
    } catch (e) {
      console.error('CalendarPage', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const requestedId = searchParams.get('event');
    if (!requestedId || loading || openedEventRef.current === requestedId) return;
    openedEventRef.current = requestedId;
    const requested = calendarEvents.find((event) => String(event.id) === requestedId);
    if (!requested?.start_date) return;
    const date = new Date(`${requested.start_date}T00:00:00`);
    setSelectedDay(date);
    setWeekStart(startOfWeek(date, { weekStartsOn: 0 }));
    setVisibleMonth(date);
    setDayDetailsOpen(true);
  }, [calendarEvents, loading, searchParams]);

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

  function applyAdvancedDate(updated, { broadcast = true } = {}) {
    if (!updated) return;
    setProfile(updated);
    const cd = new Date((updated.career_date || CAREER_START_DATE) + 'T00:00:00');
    setSelectedDay(cd);
    setWeekStart(startOfWeek(cd, { weekStartsOn: 0 }));
    setVisibleMonth(cd);
    if (broadcast) {
      window.dispatchEvent(new CustomEvent('padel:profile-updated', { detail: { profile: updated, profileId: updated.id, careerDate: updated.career_date } }));
      window.dispatchEvent(new CustomEvent('padel:communications-refresh'));
    }
  }

  async function refreshAfterAdvance(updated, { broadcast = true } = {}) {
    // A data e os indicadores são atualizados imediatamente. As listas pesadas
    // são recarregadas em segundo plano e nunca mantêm os botões bloqueados.
    applyAdvancedDate(updated, { broadcast });
    const { events, pending, tr } = await loadModuleTasks({
      events: { task: () => getEventsForRange(updated.id, '2026-01-01', '2027-12-31'), fallback: calendarEvents, timeoutMs: 2500, label: 'eventos após avanço do calendário' },
      pending: { task: () => getPendingDecisions(updated.id, updated.career_date || CAREER_START_DATE), fallback: [], timeoutMs: 2500, label: 'decisões após avanço do calendário' },
      tr: { task: () => localGame.entities.TrainingSession.filter({ profile_id: updated.id }), fallback: trainings, timeoutMs: 2500, label: 'treinos após avanço do calendário' },
    }, { timeoutMs: 2500 });
    setCalendarEvents(events || []);
    setPendingDecisions(pending || []);
    setTrainings(tr || []);
  }

  async function getFreshProfile() {
    if (!profile?.id) return profile;
    return localGame.entities.PlayerProfile.get(profile.id).catch(() => profile);
  }

  async function handleAdvanceDay() {
    if (!profile || advanceLockRef.current) return;
    advanceLockRef.current = true;
    setAdvancing(true);
    try {
      const current = await getFreshProfile();
      const updated = await advanceCareerDayOnce(current);
      applyAdvancedDate(updated, { broadcast: false });
      // Não aguarda consultas secundárias para liberar o próximo avanço.
      void refreshAfterAdvance(updated, { broadcast: false }).catch((error) => console.warn('[Calendar] atualização secundária falhou', error));
    } catch (e) {
      toast({ title: 'Não é possível avançar', description: e.message, variant: 'destructive' });
    } finally {
      advanceLockRef.current = false;
      setAdvancing(false);
    }
  }

  async function handleAdvancePeriod(days) {
    if (!profile || advanceLockRef.current) return;
    advanceLockRef.current = true;
    setAdvancingBatch(days);
    setAdvanceProgress({ current: 0, total: days });
    try {
      const current = await getFreshProfile();
      const result = await advanceCareerDays(current, days, {
        onProgress: ({ current: processed, total, profile: progressedProfile }) => {
          setAdvanceProgress({ current: processed, total });
          applyAdvancedDate(progressedProfile, { broadcast: false });
        },
      });
      const updated = result.profile;
      applyAdvancedDate(updated);
      // Libera os controles assim que as datas essenciais forem persistidas.
      // Universo Vivo, IA e relatórios são sincronizados uma vez em segundo plano.
      void finalizeCareerAdvanceRange(updated, result.rangeStartDate, updated.career_date)
        .then((finalProfile) => refreshAfterAdvance(finalProfile || updated))
        .catch((error) => console.warn('[Calendar] finalização global do avanço falhou', error));
      const trainingsDone = (result.daily || []).filter((day) => day.automaticTraining).length;
      const interrupted = result.blockedBy ? ` Avanço interrompido antes de: ${result.blockedBy.title}.` : '';
      toast({ title: `${result.daysAdvanced} dia(s) processado(s)`, description: `${trainingsDone} treino(s) automático(s) · Energia ${updated.energy} · Fadiga ${updated.fatigue}.${interrupted}` });
    } catch (error) {
      toast({ title: 'Avanço interrompido', description: error?.message, variant: 'destructive' });
    } finally {
      advanceLockRef.current = false;
      setAdvancingBatch(null);
      setAdvanceProgress(null);
    }
  }

  async function refreshCalendarEvents() {
    const events = await getEventsForRange(profile.id, '2026-01-01', '2027-12-31');
    setCalendarEvents(events || []);
  }

  async function handleScheduleActivity(input) {
    setPlanning(true);
    try {
      const result = await scheduleRecurringActivities(profile, input, input.repeatWeeks);
      await refreshCalendarEvents();
      if (result.created.length) {
        await incrementMissionProgress(profile.id, 'schedule_calendar_activity', 1, profile.career_date, {
          triggerEventId: `calendar-plan:${profile.id}:${result.created[0]?.id || input.date}`,
        });
      }
      const skipped = result.skipped.length ? ` ${result.skipped.length} data(s) com conflito foram ignoradas.` : '';
      toast({ title: `${result.created.length} atividade(s) programada(s)`, description: `Serão processadas automaticamente.${skipped}` });
    } catch (error) {
      toast({ title: 'Não foi possível programar', description: error?.message, variant: 'destructive' });
    } finally { setPlanning(false); }
  }

  async function handleCancelActivity(event) {
    setPlanning(true);
    try {
      await cancelPlannedActivity(profile.id, event);
      await refreshCalendarEvents();
      toast({ title: 'Atividade cancelada' });
    } catch (error) {
      toast({ title: 'Não foi possível cancelar', description: error?.message, variant: 'destructive' });
    } finally { setPlanning(false); }
  }

  async function handleEditActivity(event) {
    const date = window.prompt('Nova data da atividade (AAAA-MM-DD):', event.start_date);
    if (!date || date === event.start_date) return;
    setPlanning(true);
    try {
      await updatePlannedActivity(profile, event, date.trim());
      await refreshCalendarEvents();
      toast({ title: 'Atividade reagendada' });
    } catch (error) {
      toast({ title: 'Não foi possível reagendar', description: error?.message, variant: 'destructive' });
    } finally { setPlanning(false); }
  }

  function handleSkipInjury() {
    if (!profile || advanceLockRef.current) return;
    setConfirmSkipInjury(true);
  }

  async function runSkipInjury() {
    advanceLockRef.current = true;
    setSkippingInjury(true);
    try {
      const current = await getFreshProfile();
      const result = await advanceCareerUntilRecovered(current);
      applyAdvancedDate(result.profile);
      void finalizeCareerAdvanceRange(result.profile, result.rangeStartDate, result.profile.career_date)
        .then((finalProfile) => refreshAfterAdvance(finalProfile || result.profile))
        .catch((error) => console.warn('[Calendar] finalização global da recuperação falhou', error));
      if (result.blockedBy) {
        toast({ title: 'Avanço interrompido com segurança', description: `Compromisso: ${result.blockedBy.title}${result.blockedBy.start_date ? ` em ${result.blockedBy.start_date}` : ''}.` });
      } else {
        const missed = Number(result.summary?.tournamentsMissed || 0);
        const cancelled = Number(result.summary?.activitiesCancelledByInjury || 0);
        const details = [
          `${result.daysAdvanced} dia(s) avançado(s)`,
          `Energia ${result.profile.energy}`,
          `Fadiga ${result.profile.fatigue}`,
          missed ? `${missed} torneio(s) perdido(s)` : null,
          cancelled ? `${cancelled} atividade(s) cancelada(s)` : null,
        ].filter(Boolean).join(' · ');
        toast({ title: result.recovered ? 'Recuperação concluída' : 'Limite de segurança atingido', description: details });
      }
    } catch (error) {
      toast({ title: 'Avanço interrompido', description: error?.message, variant: 'destructive' });
    } finally {
      advanceLockRef.current = false;
      setSkippingInjury(false);
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
    setDayDetailsOpen(true);
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

  if (loading) return <PageSkeleton variant="dashboard" rows={3} />;
  if (!profile) return <Page size="default"><EmptyState icon={CalendarIcon} title="Crie seu perfil" description="Crie seu perfil para ver o calendário." /></Page>;

  const nextTournament = upcomingTournaments[0] || null;
  const daysToNextTournament = nextTournament ? daysBetween(careerDate, nextTournament.start_date) : null;
  const datePresentation = getCareerDatePresentation(careerDate);
  const injurySkipDays = Math.max(Number(profile?.injury_days_remaining) || 0, profile?.injured_until ? daysBetween(careerDate, profile.injured_until) : 0);

  return (
    <Page>
      <PageHeader
        eyebrow="Planejamento da carreira"
        icon={CalendarIcon}
        title="Calendário"
        description="Organize treinos, descanso e competições sem perder decisões importantes."
        breadcrumb={["Competições", "Calendário"]}
        tone="info"
        stats={
          <>
            <StatusBadge tone="info">{format(new Date(`${careerDate}T00:00:00`), 'dd/MM/yyyy')}</StatusBadge>
            {pendingDecisions.length > 0 && <StatusBadge tone="warning">{pendingDecisions.length} decisão(ões)</StatusBadge>}
            {nextTournament && <StatusBadge tone="premium">{daysToNextTournament > 0 ? `${daysToNextTournament}d para competir` : 'Competição hoje'}</StatusBadge>}
          </>
        }
      />

      {/* Faixa operacional (Polish 2.1, docs/REDESIGN_POLISH_2_1.md, objetivo 7):
          o Polish 2 comprimiu Energia/Fadiga/Agenda/Torneio em 4 StatCards
          estreitos disputando espaço com data+botões na mesma linha — o QA
          real mostrou os rótulos e o nome do torneio truncados ("Dispo...",
          "Los A..."). Substituído por 3 colunas (Data | Status do dia |
          Ações) no desktop — cada uma com largura própria, sem competir por
          espaço — mantendo o ganho de altura do Polish 2 sem sacrificar
          legibilidade. Mesmos dados, mesmos handlers/labels/estados de
          disabled dos botões de avanço; nenhuma lógica de calendário tocada. */}
      <Surface variant="premium" className="grid gap-5 lg:grid-cols-[auto_1fr_auto] lg:items-start lg:gap-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-premium">{datePresentation.weekday}</p>
          <p className="mt-0.5 text-2xl font-black tracking-tight sm:text-3xl">{datePresentation.fullDate}</p>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Status do dia</p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
            <DayStatusRow icon={Battery} label="Energia" value={`${Math.round(Number(profile.energy) || 0)}%`} tone={Number(profile.energy) < 30 ? 'danger' : 'success'} />
            <DayStatusRow icon={Zap} label="Fadiga" value={`${Math.round(Number(profile.fatigue) || 0)}%`} tone={Number(profile.fatigue) > 65 ? 'danger' : Number(profile.fatigue) > 40 ? 'warning' : 'info'} />
            <DayStatusRow icon={Clock3} label="Agenda" value={String(calendarEvents.filter((event) => event.start_date >= careerDate).length)} tone="brand" />
            <DayStatusRow
              icon={Trophy}
              label="Próximo torneio"
              value={nextTournament ? (daysToNextTournament > 0 ? `${daysToNextTournament} dias` : 'Hoje') : 'Agenda livre'}
              detail={nextTournament?.name}
              tone="premium"
              className="col-span-2 sm:col-span-3"
            />
          </div>
        </div>

        <div className="flex flex-col items-start gap-1.5 lg:items-stretch">
          <div className="flex flex-wrap gap-2 lg:flex-col">
            <Button level="primary" size="touch" onClick={handleAdvanceDay} disabled={advancing || Boolean(advancingBatch) || pendingDecisions.length > 0}>
              <FastForward className="h-4 w-4" />{advancing ? 'Avançando...' : pendingDecisions.length > 0 ? 'Decisão pendente' : '+1 dia'}
            </Button>
            <Button level="secondary" size="touch" disabled={Boolean(advancingBatch) || advancing || pendingDecisions.length > 0} onClick={() => handleAdvancePeriod(3)}>
              {advancingBatch === 3 ? `${advanceProgress?.current || 0}/3…` : '+3 dias'}
            </Button>
            <Button level="secondary" size="touch" disabled={Boolean(advancingBatch) || advancing || pendingDecisions.length > 0} onClick={() => handleAdvancePeriod(7)}>
              {advancingBatch === 7 ? `${advanceProgress?.current || 0}/7…` : '+1 semana'}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Avanço inteligente: processa treinos, descanso e o Universo Vivo, parando diante de decisões obrigatórias.</p>
        </div>
      </Surface>

      <Tabs tabs={[{ key: 'week', label: 'Semana' }, { key: 'month', label: 'Mês' }]} activeTab={viewMode} onTabChange={setViewMode} variant="segmented" />

      {/* Pending decisions — blocks day advance */}
      {pendingDecisions.length > 0 && (
        <PendingDecisionBanner events={pendingDecisions} onResolve={handleResolveDecision} />
      )}

      {hasActiveInjury(profile) && <Surface variant="elevated" padding="compact" className="border-rose-500/30 bg-rose-500/5"><div className="flex flex-col gap-3 md:flex-row md:items-center"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300"><AlertTriangle className="h-5 w-5" /></span><div className="flex-1"><p className="text-sm font-bold text-rose-200">Período de recuperação</p><p className="text-xs text-muted-foreground">Retorno estimado em {Math.max(Number(profile.injury_days_remaining) || 0, profile.injured_until ? daysBetween(careerDate, profile.injured_until) : 0)} dia(s).</p></div><Button level="danger" size="sm" onClick={handleSkipInjury} disabled={skippingInjury} className="bg-rose-500/15 text-rose-200 hover:bg-rose-500/25">{skippingInjury ? 'Processando...' : 'Avançar até a recuperação'}</Button></div></Surface>}

      {/* Week view */}
      {viewMode === 'week' ? <CalendarWeekView
        careerDate={careerDate}
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        events={calendarEvents}
        matches={matches}
        trainings={trainings}
        onDayClick={handleDayClick}
      /> : <CalendarMonthView month={visibleMonth} onMonthChange={setVisibleMonth} careerDate={careerDate} events={calendarEvents} injuryReturnDate={profile.injury_return_date || profile.injured_until} onDayClick={handleDayClick} />}

      {/* Selected day details */}
      <ModalShell
        open={dayDetailsOpen && Boolean(selectedDay)}
        onClose={() => setDayDetailsOpen(false)}
        title="Compromissos do dia"
        size="sm"
      >
        <DayEventList
          day={selectedDay}
          dayData={selectedDayData}
          onResolve={(event, action) => { handleResolveDecision(event, action); setDayDetailsOpen(false); }}
          onPlayTournament={(event) => { handlePlayTournament(event); setDayDetailsOpen(false); }}
        />
      </ModalShell>

      <ConfirmDialog
        open={confirmSkipInjury}
        onClose={() => setConfirmSkipInjury(false)}
        onConfirm={() => { setConfirmSkipInjury(false); runSkipInjury(); }}
        tone="default"
        title="Avançar até a recuperação"
        description={`Avançar ${injurySkipDays} dia(s) até a recuperação?`}
        confirmLabel="Avançar"
      >
        Todos os sistemas diários serão processados. Treinos serão cancelados e torneios serão marcados como perdidos automaticamente durante a lesão. Apenas outras decisões obrigatórias interrompem o avanço.
      </ConfirmDialog>

      <CalendarPlanner profile={profile} selectedDate={selectedDay ? format(selectedDay, 'yyyy-MM-dd') : careerDate} events={calendarEvents} onSchedule={handleScheduleActivity} onCancel={handleCancelActivity} onEdit={handleEditActivity} busy={planning} />

      {/* Upcoming tournament registrations */}
      <Surface>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <Trophy className="h-4 w-4 text-amber-400" /> Inscrições abertas
        </h2>
        {upcomingTournaments.length === 0 ? (
          <EmptyState compact icon={CalendarIcon} title="Nenhuma inscrição aberta" description="Volte quando um novo torneio abrir inscrições." />
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
                      <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${TIER_DOT[t.tier] || TIER_DOT.Silver} bg-opacity-15`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${TIER_DOT[t.tier] || TIER_DOT.Silver}`} /> {t.tier}
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
      </Surface>

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
          careerId={activeCareer?.career_id}
          onClose={() => setActiveTournament(null)}
          onProfileUpdate={setProfile}
          onComplete={handleTournamentComplete}
        />
      )}
    </Page>
  );
}

// Linha de status do dia (Polish 2.1, objetivo 8) — sem truncate no valor
// nem no detalhe (nome do torneio): quando falta largura, o texto quebra em
// vez de virar "Los A...". Local a esta página (não é um primitive novo do
// design-system) porque StatCard não coube bem neste layout de 3 colunas.
function DayStatusRow({ icon: Icon, label, value, detail, tone = 'brand', className = '' }) {
  const toneColor = {
    danger: 'text-destructive', warning: 'text-warning', success: 'text-success',
    info: 'text-info', brand: 'text-primary', premium: 'text-premium',
  }[tone] || 'text-primary';
  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${toneColor}`} />
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-sm font-black leading-tight ${toneColor}`}>{value}</p>
        {detail && <p className="text-[11px] leading-snug text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}
