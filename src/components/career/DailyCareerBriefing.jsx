import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck2, Sparkles } from 'lucide-react';
import { Surface, StatusBadge } from '@/components/design-system';

export default function DailyCareerBriefing({ briefing }) {
  if (!briefing) return null;

  return (
    <Surface className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Briefing do dia</p>
              <h2 className="mt-1 text-lg font-black sm:text-xl">{briefing.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{briefing.summary}</p>
            </div>
          </div>
          <CalendarCheck2 className="hidden h-5 w-5 text-muted-foreground sm:block" />
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {briefing.priorities.map((item) => (
            <Link
              key={item.id}
              to={item.route}
              className="group flex min-h-24 flex-col justify-between rounded-2xl border border-border/60 bg-background/45 p-3 transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-background/70"
            >
              <div>
                <StatusBadge tone={item.tone}>{item.label}</StatusBadge>
                <p className="mt-2 text-sm font-black leading-tight">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>
              </div>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                Abrir <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </Surface>
  );
}
