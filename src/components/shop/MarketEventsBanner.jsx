import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, X } from 'lucide-react';
import { EVENT_TYPE_META } from '@/lib/marketEngine';

export default function MarketEventsBanner({ events, onDismiss }) {
  const [expanded, setExpanded] = useState(null);
  const navigate = useNavigate();

  if (!events || events.length === 0) return null;

  const topEvents = events
    .filter(e => e.is_active)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, 5);

  if (topEvents.length === 0) return null;

  return (
    <div className="space-y-2">
      {topEvents.map((ev) => {
        const meta = EVENT_TYPE_META[ev.event_type] || {};
        const emoji = ev.image_emoji || meta.emoji || '📊';
        const isExpanded = expanded === ev.id;

        return (
          <div
            key={ev.id}
            className="glass rounded-2xl p-3 border border-primary/20 overflow-hidden relative animate-slide-up"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-secondary/60 flex items-center justify-center text-xl shrink-0">
                {emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm truncate">{ev.title}</h3>
                  <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                    (meta.color || ev.badge_color) === 'green' ? 'border-green-500/40 bg-green-500/15 text-green-400' :
                    (meta.color || ev.badge_color) === 'red' ? 'border-red-500/40 bg-red-500/15 text-red-400' :
                    (meta.color || ev.badge_color) === 'amber' ? 'border-amber-500/40 bg-amber-500/15 text-amber-400' :
                    (meta.color || ev.badge_color) === 'cyan' ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-400' :
                    (meta.color || ev.badge_color) === 'purple' ? 'border-purple-500/40 bg-purple-500/15 text-purple-400' :
                    'border-primary/40 bg-primary/15 text-primary'
                  }`}>
                    {ev.badge_label || meta.label}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-1">{ev.description}</p>
              </div>
              <button
                onClick={() => setExpanded(isExpanded ? null : ev.id)}
                className="p-1.5 rounded-lg hover:bg-secondary/50 shrink-0"
              >
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </button>
            </div>

            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-border/40 space-y-2 animate-scale-in">
                <p className="text-xs text-muted-foreground">{ev.description}</p>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  {ev.affected_categories?.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground">
                      Categorias: {ev.affected_categories.join(', ')}
                    </span>
                  )}
                  {ev.affected_manufacturers?.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground">
                      Marcas: {ev.affected_manufacturers.join(', ')}
                    </span>
                  )}
                  {ev.affected_rarities?.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground">
                      Raridades: {ev.affected_rarities.join(', ')}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full font-bold ${
                    ev.price_modifier < 1 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                  }`}>
                    {ev.price_modifier < 1 ? `-${Math.round((1 - ev.price_modifier) * 100)}%` : `+${Math.round((ev.price_modifier - 1) * 100)}%`}
                  </span>
                  {ev.end_date && (
                    <span className="px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground">
                      Até {new Date(ev.end_date).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}