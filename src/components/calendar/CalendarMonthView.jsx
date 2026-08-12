import React from 'react';
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EVENT_TYPES } from '@/lib/calendarSystem';
import { IconButton, Surface } from '@/components/design-system';

export default function CalendarMonthView({ month, onMonthChange, careerDate, events, onDayClick, injuryReturnDate }) {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const cells = [];
  for (let index = 0; index < first.getDay(); index += 1) cells.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) cells.push(new Date(first.getFullYear(), first.getMonth(), day));
  return (
    <Surface className="space-y-3">
      <div className="flex items-center justify-between">
        <IconButton icon={ChevronLeft} label="Mês anterior" level="secondary" onClick={() => onMonthChange(addMonths(month, -1))} />
        <p className="font-black capitalize">{format(month, 'MMMM yyyy', { locale: ptBR })}</p>
        <IconButton icon={ChevronRight} label="Próximo mês" level="secondary" onClick={() => onMonthChange(addMonths(month, 1))} />
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-bold text-muted-foreground">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} />;
          const date = format(day, 'yyyy-MM-dd');
          const dayEvents = (events || []).filter((event) => event.start_date <= date && (event.end_date || event.start_date) >= date);
          const injured = injuryReturnDate && date >= careerDate && date < injuryReturnDate;
          return (
            <button
              type="button"
              key={date}
              onClick={() => onDayClick(day)}
              aria-current={date === careerDate ? 'date' : undefined}
              aria-label={`${format(day, "d 'de' MMMM", { locale: ptBR })}${dayEvents.length ? `, ${dayEvents.length} compromisso(s)` : ''}`}
              className={`min-h-11 rounded-lg border p-1 text-left ${date === careerDate ? 'border-primary bg-primary/15' : injured ? 'border-rose-500/30 bg-rose-500/10' : dayEvents.length ? 'border-border bg-secondary/30' : 'border-transparent bg-secondary/10'}`}
            >
              <span className="text-[10px] font-bold">{day.getDate()}</span>
              <div className="mt-2 flex flex-wrap gap-0.5">
                {dayEvents.slice(0, 4).map((event) => <span key={event.id} title={event.title} className={`h-1.5 w-1.5 rounded-full ${(EVENT_TYPES[event.event_type] || EVENT_TYPES.personal).dot}`} />)}
              </div>
            </button>
          );
        })}
      </div>
      {injuryReturnDate && <p className="text-[10px] text-rose-300">Dias destacados: período estimado de recuperação até {injuryReturnDate}.</p>}
    </Surface>
  );
}
