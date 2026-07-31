import React, { useState, useEffect } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { Calendar, FastForward, Dumbbell, Swords, Heart, Battery, AlertTriangle, Trophy, Lock } from 'lucide-react';
import { careerDateLabel, careerMonthLabel, advanceDay, daysBetween } from '@/lib/career';
import { DAILY_TRAINING_LIMIT, DAILY_MATCH_LIMIT, MAX_ENERGY, chemistryLabel, isInjured, injuryRecoveryDays, ENERGY_RECOVERY_PER_DAY, ENERGY_RECOVERY_FATIGUED, isRetired } from '@/lib/padel';
import { getPendingDecisions } from '@/lib/calendarSystem';

export default function CareerCalendar({ profile, onAdvanceDay }) {
  const [advancing, setAdvancing] = useState(false);
  const [nextTournament, setNextTournament] = useState(null);
  const [pendingDecisions, setPendingDecisions] = useState([]);
  const dateLabel = careerDateLabel(profile);
  const monthLabel = careerMonthLabel(profile);
  const trainingsToday = profile?.trainings_today || 0;
  const matchesToday = profile?.practice_matches_today || 0;
  const energy = profile?.energy ?? 100;
  const chemistry = profile?.partner_chemistry || 50;
  const chemInfo = chemistryLabel(chemistry);
  const injured = isInjured(profile);
  const recoveryDays = injuryRecoveryDays(profile);
  const fatigued = matchesToday > 0;
  const recoveryAmount = fatigued ? ENERGY_RECOVERY_FATIGUED : ENERGY_RECOVERY_PER_DAY;
  const retired = isRetired(profile);

  const energyColor = energy >= 70 ? 'text-green-400' : energy >= 50 ? 'text-primary' : energy >= 30 ? 'text-amber-400' : 'text-red-400';
  const energyBarColor = energy >= 70 ? 'bg-green-500' : energy >= 50 ? 'bg-primary' : energy >= 30 ? 'bg-amber-500' : 'bg-red-500';

  useEffect(() => {
    (async () => {
      try {
        const careerDate = profile?.career_date || '2026-01-01';
        const [list, pending] = await Promise.all([
          localGame.entities.Tournament.list('-start_date', 50),
          getPendingDecisions(profile?.id, careerDate),
        ]);
        const upcoming = (list || [])
          .filter(t => t.start_date && t.start_date >= careerDate)
          .sort((a, b) => a.start_date.localeCompare(b.start_date));
        setNextTournament(upcoming[0] || null);
        setPendingDecisions(pending || []);
      } catch (e) {}
    })();
  }, [profile?.career_date, profile?.id]);

  async function handleAdvance() {
    if (pendingDecisions.length > 0) return;
    setAdvancing(true);
    try {
      const updated = await advanceDay(profile);
      onAdvanceDay?.(updated);
    } catch (e) { console.error(e); }
    finally { setAdvancing(false); }
  }

  const tournamentDays = nextTournament ? daysBetween(profile?.career_date || '2026-01-01', nextTournament.start_date) : 0;

  return (
    <div className="glass rounded-2xl p-4 border border-primary/20 space-y-3">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Calendar className="h-7 w-7 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Calendário da Carreira</p>
          <p className="font-black text-lg leading-tight">{dateLabel}</p>
          <p className="text-xs text-primary font-bold">{monthLabel}</p>
        </div>
      </div>

      {/* Upcoming tournament notification */}
      {nextTournament && tournamentDays <= 14 && (
        <div className="glass rounded-xl p-3 border border-amber-500/30 bg-amber-500/5 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs flex-1">
            <span className="font-bold text-amber-400">{nextTournament.name}</span> em {tournamentDays} dia{tournamentDays !== 1 ? 's' : ''}. Planeje sua semana!
          </p>
        </div>
      )}

      {/* Injury warning */}
      {injured && (
        <div className="glass rounded-xl p-3 border border-red-500/30 bg-red-500/5 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-400 font-medium">
            Lesionado! Recupera em {recoveryDays} dias. Avance o dia para se recuperar.
          </p>
        </div>
      )}

      {/* Pending decision warning */}
      {pendingDecisions.length > 0 && (
        <div className="glass rounded-xl p-3 border border-amber-500/30 bg-amber-500/5 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-200 font-medium flex-1">
            Decisão obrigatória pendente: <span className="font-bold">{pendingDecisions[0].title}</span>. Resolva no Calendário antes de avançar.
          </p>
        </div>
      )}

      {/* Daily progress */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass rounded-xl p-2 flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-[9px] text-muted-foreground uppercase">Treino</p>
            <p className="text-xs font-bold tabular-nums">{trainingsToday}/{DAILY_TRAINING_LIMIT}</p>
          </div>
        </div>
        <div className="glass rounded-xl p-2 flex items-center gap-2">
          <Swords className="h-4 w-4 text-cyan-400 shrink-0" />
          <div className="flex-1">
            <p className="text-[9px] text-muted-foreground uppercase">Jogo treino</p>
            <p className="text-xs font-bold tabular-nums">{matchesToday}/{DAILY_MATCH_LIMIT}</p>
          </div>
        </div>
        <div className="glass rounded-xl p-2 flex items-center gap-2">
          <Battery className={`h-4 w-4 ${energyColor} shrink-0`} />
          <div className="flex-1">
            <p className="text-[9px] text-muted-foreground uppercase">Energia</p>
            <p className={`text-xs font-bold tabular-nums ${energyColor}`}>{energy}</p>
          </div>
        </div>
      </div>

      {/* Energy bar */}
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full transition-all ${energyBarColor}`} style={{ width: `${energy}%` }} />
      </div>

      {/* Recovery preview + Chemistry + Advance day */}
      <div className="flex items-center gap-2 flex-wrap">
        {profile?.partner_id && (
          <div className="glass rounded-xl px-3 py-2 flex items-center gap-2 flex-1 min-w-[140px]">
            <Heart className={`h-4 w-4 ${chemInfo.color}`} />
            <div>
              <p className="text-[9px] text-muted-foreground uppercase">Química</p>
              <p className={`text-xs font-bold ${chemInfo.color}`}>{chemInfo.label} ({chemistry})</p>
            </div>
          </div>
        )}
        <div className="glass rounded-xl px-3 py-2 flex items-center gap-1.5">
          <Battery className="h-3.5 w-3.5 text-primary" />
          <p className="text-[10px] text-muted-foreground">
            Recupera <span className="font-bold text-primary">+{recoveryAmount}</span>{fatigued && <span className="text-amber-400"> (cansado)</span>}
          </p>
        </div>
        <button
          onClick={handleAdvance}
          disabled={advancing || retired || pendingDecisions.length > 0}
          className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/15 text-primary font-bold text-xs hover:bg-primary/25 transition-colors disabled:opacity-50"
        >
          {pendingDecisions.length > 0 ? <><Lock className="h-3.5 w-3.5" /> Decisão Pendente</> : <><FastForward className="h-3.5 w-3.5" /> {advancing ? 'Avançando...' : 'Avançar Dia'}</>}
        </button>
      </div>
    </div>
  );
}