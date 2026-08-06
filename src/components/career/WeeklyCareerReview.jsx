import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, CalendarRange } from 'lucide-react';
import { Surface, StatusBadge } from '@/components/design-system';

export default function WeeklyCareerReview({ review }) {
  if (!review) return null;

  return (
    <Surface className="overflow-hidden">
      <div className="border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BarChart3 className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Pulso da carreira</p>
              <h2 className="text-base font-black sm:text-lg">Resumo dos últimos 7 dias</h2>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5" /> {review.periodLabel}
          </span>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.85fr)] sm:p-5">
        <div className="rounded-2xl border border-border/60 bg-background/45 p-4">
          <StatusBadge tone={review.headline.tone}>{review.headline.label}</StatusBadge>
          <h3 className="mt-3 text-lg font-black leading-tight">{review.headline.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{review.headline.description}</p>
          <Link to={review.headline.route} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
            Ver recomendação <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {review.metrics.map((metric) => (
            <div key={metric.id} className="rounded-2xl border border-border/60 bg-muted/15 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-2xl font-black tracking-tight">{metric.value}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{metric.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </Surface>
  );
}
