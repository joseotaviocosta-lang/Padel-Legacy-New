import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, HeartPulse, Trophy, Zap } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { buildCareerHeaderContext } from '@/lib/careerHeaderContext.js';
import { wasTournamentUnreachableAtCareerStart } from '@/lib/tournamentRegistration.js';
import { APP_ROUTES } from '@/navigation/routes.js';

const ICON_BY_KIND = {
  injured: { icon: HeartPulse, tone: 'text-rose-400' },
  tournament_today: { icon: Trophy, tone: 'text-amber-400' },
  tournament_soon: { icon: Trophy, tone: 'text-amber-400' },
  tournament_round: { icon: Trophy, tone: 'text-amber-400' },
  fatigue: { icon: HeartPulse, tone: 'text-orange-400' },
  energy: { icon: Zap, tone: 'text-yellow-400' },
  tournament_upcoming: { icon: CalendarDays, tone: 'text-cyan-400' },
  idle: { icon: CalendarDays, tone: 'text-cyan-400' },
};

export default function CareerHeaderContext({ profile, compact = false }) {
  // Fase 15.6 (performance — Header não deve ler storage a cada render):
  // antes, `load` dependia do objeto `profile` inteiro — qualquer mudança de
  // perfil (moedas, XP após um treino, por exemplo) recriava `load` e
  // buscava Tournament/CalendarEvent de novo, mesmo quando nenhum dos dois
  // mudou. Torneios "em inscrição" e o calendário de torneios do jogador só
  // mudam de fato quando o DIA muda (ou o jogador troca) — nunca por um
  // treino/partida isolados no mesmo dia. A busca em si agora só depende de
  // `profile.id`/`career_date`; o cálculo do contexto (que também usa
  // energia/fadiga/lesão, voláteis dentro do mesmo dia) continua reagindo a
  // qualquer mudança do perfil, mas reaproveitando os dados já buscados.
  const [fetchedData, setFetchedData] = useState(null);
  const profileId = profile?.id;
  const careerDate = profile?.career_date;

  const load = useCallback(async () => {
    if (!profileId) return;
    try {
      const [tournaments, calendarEvents] = await Promise.all([
        // A página de Torneios lista os eventos por data, sem filtrar por
        // `status`. O cabeçalho filtrava por `status: 'inscricoes'` e por isso
        // podia não enxergar um evento que a página enxergava — daí anunciar
        // "Miami Cup · 8d" enquanto a página mostrava a pré-temporada em 6d,
        // e "corrigir" sozinho depois que a página era aberta. Mesma consulta
        // dos dois lados: a pergunta "qual é o próximo torneio?" não pode ter
        // duas respostas.
        localGame.entities.Tournament.list('start_date', 2000).catch(() => []),
        localGame.entities['CalendarEvent'].filter({ profile_id: profileId, event_type: 'tournament' }, 'start_date', 30).catch(() => []),
      ]);
      // Mesmo filtro da listagem de torneios: eventos cuja inscrição já tinha
      // fechado antes de a carreira começar nunca estiveram ao alcance do
      // jogador. Sem isto o cabeçalho anunciava "Hoje · <torneio>" no dia 1
      // apontando justamente para um evento impossível de disputar.
      const reachable = (tournaments || []).filter((item) => !wasTournamentUnreachableAtCareerStart(item));
      setFetchedData({ tournaments: reachable, calendarEvents });
    } catch (error) {
      console.warn('[CareerHeaderContext] contexto indisponível', error);
    }
  }, [profileId, careerDate]);

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
    };
  }, [load]);

  const context = useMemo(() => {
    if (!profile || !fetchedData) return null;
    return buildCareerHeaderContext({ profile, tournaments: fetchedData.tournaments, calendarEvents: fetchedData.calendarEvents });
  }, [profile, fetchedData]);

  if (!context) return null;
  const { icon: Icon, tone } = ICON_BY_KIND[context.kind] || ICON_BY_KIND.idle;
  const label = compact ? context.label.compact : context.label.full;
  const className = `pl-icon-tap inline-flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-1 ${compact ? 'max-w-[6.75rem]' : 'max-w-[17rem]'}`;
  const inner = (
    <>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
      <span className="truncate text-[10px] font-bold text-muted-foreground">{label}</span>
    </>
  );

  // Playthrough 5.27-M (playtest físico): o atalho continua MOSTRANDO o
  // próximo torneio, mas o toque leva sempre à página geral de Torneios — o
  // evento é aberto lá dentro ("Ver evento"/"Ver detalhes"). Antes o deep
  // link (buildTournamentPlayRoute) abria o evento direto a partir do header.
  // O atalho inteiro continua sendo um único alvo de toque.
  const ariaLabel = context.tournamentId ? `${context.ariaLabel || label} — abrir Torneios` : 'Abrir torneios';
  return (
    <Link to={APP_ROUTES.TOURNAMENTS} className={`${className} transition-colors hover:border-primary/40 hover:bg-card/70`} title={ariaLabel} aria-label={ariaLabel} data-header-tournament-shortcut="true">
      {inner}
    </Link>
  );
}
