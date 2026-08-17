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
 * @returns {{kind:string, label:{compact:string,full:string}, ariaLabel:string|null, tournamentId:string|null, daysUntil:number|null}|null}
 */
export function buildCareerHeaderContext({ profile, tournaments = [] } = {}) {
  if (!profile) return null;
  const careerDate = profile.career_date || '2026-01-01';
  const injured = profile.injury_status === 'injured' || profile.is_injured;
  const fatigue = Number(profile.fatigue) || 0;
  const energy = Number(profile.energy) || 0;

  const next = (tournaments || [])
    .filter((item) => item?.start_date && item.start_date >= careerDate)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0] || null;
  const until = next ? daysUntil(careerDate, next.start_date) : null;

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
      : { compact: 'Semana de desenvolvimento', full: 'Semana de desenvolvimento' },
    ariaLabel: next ? `Próximo torneio: ${next.name} em ${pluralDays(until)}` : null,
    tournamentId: next?.id || null,
    daysUntil: until,
  };
}
