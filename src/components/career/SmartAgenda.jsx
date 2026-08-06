import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Coffee, Dumbbell, Trophy } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { localGame } from '@/api/localGameClient.js';
import { Surface, StatusBadge } from '@/components/design-system';

function eventIcon(event) {
  const type = String(event.event_type || event.type || '').toLowerCase();
  if (type.includes('tournament') || type.includes('torneio')) return Trophy;
  if (type.includes('training') || type.includes('treino')) return Dumbbell;
  return CalendarDays;
}

export default function SmartAgenda({ profile, tournaments = [] }) {
  const [events, setEvents] = useState([]);
  const careerDate = profile?.career_date || '2026-01-01';

  useEffect(() => {
    let active = true;
    (async () => {
      if (!profile?.id) return;
      const endDate = format(addDays(new Date(`${careerDate}T00:00:00`), 6), 'yyyy-MM-dd');
      const rows = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id }).catch(() => []);
      if (active) setEvents((rows || []).filter((event) => event.start_date >= careerDate && event.start_date <= endDate));
    })();
    return () => { active = false; };
  }, [profile?.id, careerDate]);

  const agenda = useMemo(() => {
    const items = [...events];
    for (const tournament of tournaments) {
      if (!tournament.start_date || tournament.start_date < careerDate) continue;
      const diff = Math.ceil((new Date(`${tournament.start_date}T00:00:00`) - new Date(`${careerDate}T00:00:00`)) / 86400000);
      if (diff > 6 || items.some((item) => item.related_entity_id === tournament.id)) continue;
      items.push({ id: `tournament-${tournament.id}`, start_date: tournament.start_date, title: tournament.name, event_type: 'tournament' });
    }
    return items.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))).slice(0, 7);
  }, [events, tournaments, careerDate]);

  return (
    <Surface className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Agenda inteligente</p>
          <h2 className="mt-0.5 text-base font-black">Próximos 7 dias</h2>
        </div>
        <Link to="/game/calendar" className="inline-flex items-center gap-1 text-xs font-bold text-primary">Calendário <ChevronRight className="h-3.5 w-3.5" /></Link>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-1">
        {agenda.length ? agenda.map((event) => {
          const Icon = eventIcon(event);
          const isToday = event.start_date === careerDate;
          return (
            <div key={event.id || `${event.start_date}-${event.title}`} className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/25 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><p className="truncate text-sm font-bold">{event.title || event.name || 'Compromisso'}</p>{isToday && <StatusBadge tone="success">Hoje</StatusBadge>}</div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{format(new Date(`${event.start_date}T00:00:00`), "EEEE, dd 'de' MMM", { locale: ptBR })}</p>
              </div>
            </div>
          );
        }) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4 sm:col-span-2 xl:col-span-1">
            <Coffee className="h-5 w-5 text-emerald-400" />
            <div><p className="text-sm font-bold">Semana livre</p><p className="text-xs text-muted-foreground">Use o período para treinar, recuperar energia ou ajustar seu planejamento.</p></div>
          </div>
        )}
      </div>
    </Surface>
  );
}
