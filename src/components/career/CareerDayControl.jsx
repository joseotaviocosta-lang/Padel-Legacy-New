import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { advanceCareerDayOnce, isCareerDayAdvanceProcessing, subscribeCareerDayAdvance } from '@/game-core/dayAdvanceCoordinator.js';
import { getCareerDatePresentation } from '@/lib/careerDatePresentation.js';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export default function CareerDayControl({ profile = null, compact = false, className = '' }) {
  const [processing, setProcessing] = useState(isCareerDayAdvanceProcessing);
  const { toast } = useToast();
  const date = useMemo(() => getCareerDatePresentation(profile?.career_date), [profile?.career_date]);

  useEffect(() => subscribeCareerDayAdvance(setProcessing), []);

  async function handleAdvance() {
    if (!profile?.id || processing) return;
    try {
      await advanceCareerDayOnce(profile);
    } catch (error) {
      toast({
        title: 'Não é possível avançar',
        description: error?.message || 'Não foi possível avançar a carreira em um dia.',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className={cn('flex min-w-0 shrink-0 items-stretch gap-1.5', className)} aria-label="Data e avanço da carreira">
      <div className="flex min-w-[3.75rem] shrink-0 flex-col justify-center rounded-xl border border-border/55 bg-card/62 px-1.5 py-1 text-center sm:min-w-[7.35rem] sm:px-2.5">
        <span className="text-[8px] font-extrabold uppercase leading-none tracking-[0.12em] text-info sm:hidden">{date.weekdayShort}</span>
        <span className="hidden text-[8px] font-extrabold uppercase leading-none tracking-[0.12em] text-info sm:block">{date.weekday}</span>
        <span className="mt-1 whitespace-nowrap text-[10px] font-black leading-none tabular-nums sm:hidden">{date.compactDate}</span>
        <span className="mt-1 hidden whitespace-nowrap text-[11px] font-black leading-none tabular-nums sm:block">{date.fullDate}</span>
      </div>
      <button
        type="button"
        onClick={handleAdvance}
        disabled={!profile?.id || processing}
        title="Avançar carreira em um dia"
        aria-label="Avançar carreira em um dia"
        aria-busy={processing}
        className={cn(
          'pl-btn-tap inline-flex min-w-[4.8rem] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 text-[10px] font-black text-primary-foreground transition-[filter,opacity] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55',
          !compact && 'sm:min-w-[6.6rem] sm:px-3 sm:text-xs',
        )}
      >
        <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
        <span>{processing ? (compact ? '…' : 'Processando...') : 'Avançar'}</span>
      </button>
    </div>
  );
}
