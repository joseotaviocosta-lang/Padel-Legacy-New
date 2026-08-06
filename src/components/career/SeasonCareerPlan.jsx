import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Dumbbell, Flag, ShieldCheck, Trophy, Users } from 'lucide-react';
import { ProgressBar, StatusBadge, Surface, SurfaceHeader } from '@/components/design-system';

const ICONS = {
  competicao: Trophy,
  desenvolvimento: Dumbbell,
  relacao: Users,
  estrutura: ShieldCheck,
};

export default function SeasonCareerPlan({ plan }) {
  if (!plan?.goals?.length) return null;

  return (
    <Surface className="overflow-hidden" aria-labelledby="season-plan-title">
      <SurfaceHeader
        eyebrow={`PLANO DA TEMPORADA ${plan.season}`}
        title="Quatro pilares para sua evolução"
        description="Acompanhe o progresso esportivo, técnico, humano e estrutural sem perder o foco da carreira."
        icon={Flag}
        action={<StatusBadge tone={plan.overallProgress >= 75 ? 'success' : 'info'}>{plan.overallProgress}% geral</StatusBadge>}
      />
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {plan.goals.map((goal) => {
          const Icon = ICONS[goal.category] || Flag;
          return (
            <Link
              key={goal.title}
              to={goal.route}
              className="group rounded-2xl border border-border/70 bg-background/35 p-4 transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary/[0.04]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                <span className="text-xs font-black tabular-nums text-foreground">{Math.round(goal.progress)}%</span>
              </div>
              <h3 className="mt-4 text-sm font-black leading-tight text-foreground">{goal.title}</h3>
              <p className="mt-1 min-h-9 text-xs leading-relaxed text-muted-foreground">{goal.description}</p>
              <ProgressBar value={goal.progress} className="mt-3" />
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">Abrir objetivo <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
            </Link>
          );
        })}
      </div>
    </Surface>
  );
}
