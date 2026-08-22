import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { advanceCareerDayOnce, isCareerDayAdvanceProcessing, subscribeCareerDayAdvance } from '@/game-core/dayAdvanceCoordinator.js';
import { getCareerDatePresentation } from '@/lib/careerDatePresentation.js';
import { describeCalendarBlock } from '@/lib/tournamentNextAction.js';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { APP_ROUTES } from '@/navigation/routes.js';

export default function CareerDayControl({ profile = null, compact = false, className = '' }) {
  const [processing, setProcessing] = useState(isCareerDayAdvanceProcessing);
  const { toast } = useToast();
  const navigate = useNavigate();
  const date = useMemo(() => getCareerDatePresentation(profile?.career_date), [profile?.career_date]);

  useEffect(() => subscribeCareerDayAdvance(setProcessing), []);

  async function handleAdvance() {
    if (!profile?.id || processing) return;
    try {
      await advanceCareerDayOnce(profile);
    } catch (error) {
      // Hotfix UX (docs/TOURNAMENT_GUIDED_FLOW_HOTFIX.md, itens 10/11/28): o
      // bloqueio em si não muda — só a mensagem passa a responder "por que" e
      // "o que fazer", com um CTA que abre a partida pendente diretamente em
      // vez de um erro genérico que deixa o jogador procurando sozinho.
      const block = describeCalendarBlock(error?.blockingEvent);
      toast({
        title: block?.title || 'Não é possível avançar',
        description: block?.description || error?.message || 'Não foi possível avançar a carreira em um dia.',
        variant: 'destructive',
        action: block?.destination ? <ToastAction onClick={() => navigate(block.destination)}>{block.actionLabel || 'Resolver'}</ToastAction> : undefined,
      });
    }
  }

  return (
    <div className={cn('flex min-w-0 shrink-0 items-stretch gap-1', className)} aria-label="Data e avanço da carreira">
      {/* Hotfix 14.1 (docs/HOTFIX_14_1_MATCH_UX_INTERVIEWS.md, Parte 17/18/19):
          a data era um <div> puramente informativo — vira um botão real
          (semântico, focável, Enter/Space nativos) para a MESMA rota
          canônica que describeCalendarBlock/CareerCalendar já usam
          (/game/calendar), sem duplicar rota nova. Hover/focus é discreto
          (fundo sutil) — não um CTA verde grande, continua parecendo parte
          do header (Parte 18). "Avançar" ao lado permanece intocado, sua
          própria função/comportamento não muda (Parte 19/20 — navegar para
          o calendário é só uma troca de rota, nunca um avanço de tempo, e
          nenhum outro item de navegação do header já é bloqueado durante
          recovery de partida, então este não introduz um bypass novo). */}
      <button
        type="button"
        onClick={() => navigate(APP_ROUTES.CALENDAR)}
        title="Abrir calendário"
        aria-label="Abrir calendário"
        className="pl-icon-tap flex w-11 shrink-0 flex-col justify-center rounded-md px-0.5 py-1 text-center transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto sm:min-w-[7.35rem] sm:px-2.5"
      >
        <span className="text-[8px] font-extrabold uppercase leading-none tracking-[0.12em] text-info sm:hidden">{date.weekdayShort}</span>
        <span className="hidden text-[8px] font-extrabold uppercase leading-none tracking-[0.12em] text-info sm:block">{date.weekday}</span>
        <span className="mt-1 whitespace-nowrap text-[10px] font-black leading-none tabular-nums sm:hidden">{date.compactDate}</span>
        <span className="mt-1 hidden whitespace-nowrap text-[11px] font-black leading-none tabular-nums sm:block">{date.fullDate}</span>
      </button>
      <button
        type="button"
        onClick={handleAdvance}
        disabled={!profile?.id || processing}
        title="Avançar carreira em um dia"
        aria-label="Avançar carreira em um dia"
        aria-busy={processing}
        className={cn(
          'pl-btn-tap inline-flex w-11 shrink-0 items-center justify-center gap-1 rounded-lg bg-primary px-1 text-[10px] font-black text-primary-foreground transition-[filter,opacity] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55 min-[390px]:w-auto min-[390px]:min-w-[4.55rem] min-[390px]:px-1.5',
          !compact && 'sm:min-w-[6.6rem] sm:px-3 sm:text-xs',
        )}
      >
        <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden min-[390px]:inline">{processing ? (compact ? '…' : 'Processando...') : 'Avançar'}</span>
      </button>
    </div>
  );
}
