import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Crown, HeartPulse, Sparkles, Trophy, Users } from 'lucide-react';
import { StatusBadge } from '@/components/design-system';

const icons = {
  injury: HeartPulse,
  title: Trophy,
  ranking: Crown,
  tournament: Activity,
  form: Sparkles,
  partnership: Users,
};

const toneClasses = {
  danger: 'border-red-500/35 bg-gradient-to-br from-red-500/15 via-card to-card shadow-[0_18px_50px_hsl(0_75%_45%/0.12)]',
  premium: 'border-amber-400/35 bg-gradient-to-br from-amber-400/15 via-card to-card shadow-[0_18px_50px_hsl(42_92%_50%/0.12)]',
  success: 'border-emerald-400/35 bg-gradient-to-br from-emerald-400/12 via-card to-card shadow-[0_18px_50px_hsl(155_70%_42%/0.10)]',
  info: 'border-cyan-400/35 bg-gradient-to-br from-cyan-400/12 via-card to-card shadow-[0_18px_50px_hsl(190_80%_45%/0.10)]',
  neutral: 'border-border/70 bg-card',
};

const iconClasses = {
  danger: 'bg-red-500/15 text-red-300',
  premium: 'bg-amber-400/15 text-amber-300',
  success: 'bg-emerald-400/15 text-emerald-300',
  info: 'bg-cyan-400/15 text-cyan-300',
  neutral: 'bg-secondary text-muted-foreground',
};

export default function CareerMomentBanner({ moment }) {
  if (!moment) return null;
  const Icon = icons[moment.type] || Sparkles;
  const tone = moment.tone || 'neutral';

  return (
    <section className={`relative overflow-hidden rounded-3xl border p-5 md:p-6 ${toneClasses[tone] || toneClasses.neutral}`} aria-labelledby={`career-moment-${moment.id}`}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-white/5 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconClasses[tone] || iconClasses.neutral}`}><Icon className="h-6 w-6" /></span>
          <div className="min-w-0">
            <StatusBadge tone={tone === 'premium' ? 'premium' : tone}>{moment.eyebrow}</StatusBadge>
            <h2 id={`career-moment-${moment.id}`} className="mt-2 text-xl font-black tracking-tight md:text-2xl">{moment.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{moment.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 pl-16 lg:pl-0">
          {moment.secondaryAction && <Link to={moment.secondaryAction.route} className="inline-flex items-center justify-center rounded-xl border border-border/80 bg-background/50 px-4 py-2.5 text-sm font-bold transition-colors hover:bg-secondary">{moment.secondaryAction.label}</Link>}
          {moment.primaryAction && <Link to={moment.primaryAction.route} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground shadow-lg shadow-primary/15 transition-transform hover:-translate-y-0.5">{moment.primaryAction.label}<ArrowRight className="h-4 w-4" /></Link>}
        </div>
      </div>
    </section>
  );
}
