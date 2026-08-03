import React from 'react';
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EVENT_TYPES } from '@/lib/calendarSystem';

export default function CalendarMonthView({ month, onMonthChange, careerDate, events, onDayClick, injuryReturnDate }) {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const cells = [];
  for (let index = 0; index < first.getDay(); index += 1) cells.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) cells.push(new Date(first.getFullYear(), first.getMonth(), day));
  return <div className="glass rounded-2xl p-4 space-y-3">
    <div className="flex items-center justify-between"><button onClick={() => onMonthChange(addMonths(month, -1))} className="p-2 rounded-lg bg-secondary/40"><ChevronLeft className="h-4 w-4" /></button><p className="font-black capitalize">{format(month, 'MMMM yyyy', { locale: ptBR })}</p><button onClick={() => onMonthChange(addMonths(month, 1))} className="p-2 rounded-lg bg-secondary/40"><ChevronRight className="h-4 w-4" /></button></div>
    <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-bold text-muted-foreground">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((label) => <span key={label}>{label}</span>)}</div>
    <div className="grid grid-cols-7 gap-1">{cells.map((day, index) => {
      if (!day) return <span key={`empty-${index}`} />;
      const date = format(day, 'yyyy-MM-dd');
      const dayEvents = (events || []).filter((event) => event.start_date <= date && (event.end_date || event.start_date) >= date);
      const injured = injuryReturnDate && date >= careerDate && date < injuryReturnDate;
      return <button key={date} onClick={() => onDayClick(day)} className={`min-h-14 rounded-lg border p-1 text-left ${date === careerDate ? 'border-primary bg-primary/15' : injured ? 'border-rose-500/30 bg-rose-500/10' : dayEvents.length ? 'border-border bg-secondary/30' : 'border-transparent bg-secondary/10'}`}><span className="text-[10px] font-bold">{day.getDate()}</span><div className="mt-2 flex flex-wrap gap-0.5">{dayEvents.slice(0, 4).map((event) => <span key={event.id} title={event.title} className={`h-1.5 w-1.5 rounded-full ${(EVENT_TYPES[event.event_type] || EVENT_TYPES.personal).dot}`} />)}</div></button>;
    })}</div>
    {injuryReturnDate && <p className="text-[10px] text-rose-300">Dias destacados: período estimado de recuperação até {injuryReturnDate}.</p>}
  </div>;
}
