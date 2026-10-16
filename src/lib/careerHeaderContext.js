// Hotfix pré-beta — Page chrome cleanup (docs/PAGE_CHROME_TUTORIAL_HOTFIX.md).
//
// Lógica pura por trás do chip de contexto do cabeçalho global
// (`CareerHeaderContext.jsx`). Extraída para cá para ficar testável sem
// jsdom (o componente só decide ícone/JSX; a decisão de qual estado mostrar
// — e o texto/aria-label exatos — vive aqui, igual ao padrão já usado por
// `tournamentNextAction.js`).
export function daysUntil(from, to) {
  if (!from || !to) return null;
  return Math.max(0, Math.ceil((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000));
}

function pluralDays(value) {
  return `${value} dia${value === 1 ? '' : 's'}`;
}

/**
 * @param {object} [input]
 * @param {object|null} [input.profile]
 * @param {Array<{id:string,name:string,start_date:string}>} [input.tournaments] Torneios com inscrições abertas (já filtrados por status, não filtrados por data).
 * @param {Array<object>} [input.calendarEvents] Eventos de torneio com tournament_run canônico.
 * @returns {{kind:string, label:{compact:string,full:string}, ariaLabel:string|null, tournamentId:string|null, daysUntil:number|null}|null}
 */
export function buildCareerHeaderContext({ profile, tournaments = [], calendarEvents = [] } = {}) {
  if (!profile) return null;
  const careerDate = profile.career_date || '2026-01-01';
  const injured = profile.injury_status === 'injured' || profile.is_injured;
  const fatigue = Number(profile.fatigue) || 0;
  const energy = Number(profile.energy) || 0;

  // Hotfix 5.30-B: a escolha do evento vem da autoridade única
  // (nextEventAuthority.js), a mesma de Home e Torneios: em andamento →
  // inscrito → inscrição aberta → próximo no calendário. A regra antiga
  // ("o primeiro por data") ficava diferente das outras superfícies.
  const nextEvent = selectNextRelevantEvent({ tournaments, calendarEvents, careerDate });

  // Fase 15.4: tournament_run é a fonte canônica para uma campanha já
  // iniciada. A data do round atual vem do próprio match, nunca do
  // CalendarEvent legado (que pode ainda apontar para a rodada anterior).
  const activeMatch = nextEvent?.kind === NEXT_EVENT_KINDS.ACTIVE ? nextEvent.match : null;
  const next = nextEvent && !activeMatch && nextEvent.startDate
    ? { id: nextEvent.tournamentId, name: nextEvent.name, start_date: nextEvent.startDate }
    : null;
  const until = next ? daysUntil(careerDate, next.start_date) : null;
  if (activeMatch) {
    const roundDays = daysUntil(careerDate, activeMatch.date);
    const tournamentName = nextEvent.name;
    const timing = roundDays === 0 ? 'Hoje' : roundDays === 1 ? 'Amanhã' : `${roundDays}d`;
    return {
      kind: roundDays === 0 ? 'tournament_today' : 'tournament_round',
      label: {
        compact: `${tournamentName} · ${timing}`,
        full: `${tournamentName} · ${activeMatch.round} · ${timing}`,
      },
      ariaLabel: `${tournamentName}: ${activeMatch.round} ${roundDays === 0 ? 'hoje' : `em ${pluralDays(roundDays)}`}`,
      tournamentId: nextEvent.tournamentId,
      daysUntil: roundDays,
    };
  }

  if (injured) {
    const days = profile.injury_days_remaining || '—';
    return {
      kind: 'injured',
      label: { compact: `Recuperação · ${days}d`, full: `Recuperação · ${days} dias` },
      ariaLabel: null,
      tournamentId: null,
      daysUntil: null,
    };
  }

  // Item 25 do hotfix: torneio dentro de 5 dias é a informação prioritária
  // do chip — precisa deixar explícito que é "próximo torneio", não só
  // nome + número solto.
  if (next && until <= 5) {
    const today = until === 0;
    return {
      kind: today ? 'tournament_today' : 'tournament_soon',
      label: today
        ? { compact: `Hoje · ${next.name}`, full: `Hoje · ${next.name}` }
        : { compact: `${next.name} · ${until}d`, full: `Próximo torneio · ${next.name} · ${until}d` },
      ariaLabel: today
        ? `Próximo torneio: ${next.name} hoje`
        : `Próximo torneio: ${next.name} em ${pluralDays(until)}`,
      tournamentId: next.id,
      daysUntil: until,
    };
  }

  if (fatigue >= 70) {
    const value = Math.round(fatigue);
    return {
      kind: 'fatigue',
      label: { compact: `Fadiga alta · ${value}%`, full: `Fadiga alta · ${value}%` },
      ariaLabel: null,
      tournamentId: null,
      daysUntil: until,
    };
  }

  if (energy <= 30) {
    const value = Math.round(energy);
    return {
      kind: 'energy',
      label: { compact: `Energia baixa · ${value}%`, full: `Energia baixa · ${value}%` },
      ariaLabel: null,
      tournamentId: null,
      daysUntil: until,
    };
  }

  // Sem urgência: mantém o comportamento existente (nome do próximo torneio
  // distante, ou "Semana de desenvolvimento" quando não há nenhum) — item 25
  // do hotfix pede para não inventar um estado novo aqui.
  return {
    kind: next ? 'tournament_upcoming' : 'idle',
    label: next
      ? { compact: `${next.name} · ${until}d`, full: `Próximo torneio · ${next.name} · ${until}d` }
      : { compact: 'Torneios', full: 'Torneios' },
    ariaLabel: next ? `Próximo torneio: ${next.name} em ${pluralDays(until)}` : null,
    tournamentId: next?.id || null,
    daysUntil: until,
  };
}
import { NEXT_EVENT_KINDS, selectNextRelevantEvent } from '@/lib/nextEventAuthority.js';
