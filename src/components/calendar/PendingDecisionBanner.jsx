import React from 'react';
import { AlertTriangle, Trophy } from 'lucide-react';
import { EVENT_TYPES } from '@/lib/calendarSystem';

export default function PendingDecisionBanner({ events, onResolve, onNavigate }) {
  if (!events || events.length === 0) return null;

  const event = events[0];
  const meta = EVENT_TYPES[event.event_type] || EVENT_TYPES.personal;
  const Icon = Trophy; // default for tournaments

  return (
    <div className="glass rounded-2xl p-4 border border-amber-500/40 bg-amber-500/5 animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Decisão Obrigatória</p>
          <p className="font-bold text-sm mt-0.5">{event.title}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {event.description || `Compromisso em ${event.start_date}`}
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onResolve(event, 'play')}
              className="px-4 py-2 rounded-xl bg-green-500/20 text-green-400 font-bold text-xs hover:bg-green-500/30 transition-colors"
            >
              Confirmar Presença
            </button>
            <button
              onClick={() => onResolve(event, 'skip')}
              className="px-4 py-2 rounded-xl bg-red-500/15 text-red-400 font-bold text-xs hover:bg-red-500/25 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}