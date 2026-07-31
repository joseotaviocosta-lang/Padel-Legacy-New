import React from 'react';
import { format, addDays, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight, Trophy, Dumbbell, Moon, Plane, Mic, Swords, FastForward, Clock } from 'lucide-react';
import { EVENT_TYPES } from '@/lib/calendarSystem';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const EVENT_ICON = {
  tournament: Trophy,
  travel: Plane,
  rest: Moon,
  training_camp: Dumbbell,
  press: Mic,
  sponsor_event: Mic,
  medical: Clock,
  personal: Calendar,
};

export default function CalendarWeekView({
  careerDate,
  weekStart,
  onWeekChange,
  events,
  matches,
  trainings,
  onDayClick,
  onAdvanceDay,
  advancing,
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const careerDateObj = new Date(careerDate + 'T00:00:00');

  function getDayData(day) {
    const dayStr = format(day, 'yyyy-MM-dd');
    const dayEvents = events.filter(e => {
      const start = e.start_date;
      const end = e.end_date || e.start_date;
      return dayStr >= start && dayStr <= end;
    });
    const dayMatches = matches.filter(m => m.date === dayStr);
    const dayTrainings = trainings.filter(t => t.date === dayStr);
    return { events: dayEvents, matches: dayMatches, trainings: dayTrainings, total: dayEvents.length + dayMatches.length + dayTrainings.length };
  }

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onWeekChange(addDays(weekStart, -7))}
          className="h-9 w-9 rounded-lg bg-secondary/50 flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="font-black text-sm">
            {format(weekStart, 'dd MMM', { locale: ptBR })} — {format(addDays(weekStart, 6), 'dd MMM yyyy', { locale: ptBR })}
          </p>
          <p className="text-[10px] text-muted-foreground">Data atual: {format(careerDateObj, 'dd MMM yyyy', { locale: ptBR })}</p>
        </div>
        <button
          onClick={() => onWeekChange(addDays(weekStart, 7))}
          className="h-9 w-9 rounded-lg bg-secondary/50 flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={d} className="text-center text-[9px] font-bold text-muted-foreground uppercase py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayStr = format(day, 'yyyy-MM-dd');
          const isCareerDay = isSameDay(day, careerDateObj);
          const isPast = dayStr < careerDate;
          const data = getDayData(day);
          const isFuture = dayStr > careerDate;

          return (
            <button
              key={dayStr}
              onClick={() => onDayClick?.(day, data)}
              className={`relative aspect-[3/4] rounded-lg p-1 flex flex-col items-center justify-start gap-0.5 transition-all text-left ${
                isCareerDay
                  ? 'bg-primary/15 border border-primary/40 ring-1 ring-primary/20'
                  : isPast
                    ? 'bg-secondary/10 opacity-50'
                    : data.total > 0
                      ? 'bg-secondary/40 border border-border/40'
                      : 'bg-secondary/10 hover:bg-secondary/20'
              }`}
            >
              <span className={`text-[10px] font-bold ${isCareerDay ? 'text-primary' : 'text-muted-foreground'}`}>
                {format(day, 'd')}
              </span>
              {/* Event dots */}
              <div className="flex flex-wrap gap-0.5 justify-center mt-auto mb-0.5">
                {data.events.slice(0, 3).map((e, i) => {
                  const meta = EVENT_TYPES[e.event_type] || EVENT_TYPES.personal;
                  return (
                    <span key={i} className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  );
                })}
                {data.matches.length > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                )}
                {data.trainings.length > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                )}
              </div>
              {/* Event count */}
              {data.total > 3 && (
                <span className="text-[7px] text-muted-foreground font-bold">+{data.total - 3}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Advance day button */}
      <button
        onClick={onAdvanceDay}
        disabled={advancing}
        className="w-full py-2.5 rounded-xl bg-primary/15 text-primary font-bold text-xs hover:bg-primary/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        <FastForward className="h-3.5 w-3.5" /> {advancing ? 'Avançando...' : 'Avançar 1 Dia'}
      </button>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
        {Object.entries(EVENT_TYPES).slice(0, 6).map(([key, meta]) => (
          <span key={key} className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Partida
        </span>
        <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" /> Treino
        </span>
      </div>
    </div>
  );
}