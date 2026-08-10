const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

function parseCareerDate(value) {
  const match = String(value || '').match(ISO_DATE_PATTERN);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() !== Number(match[2]) - 1
    || date.getUTCDate() !== Number(match[3])
  ) return null;
  return date;
}

function capitalize(value) {
  return value ? `${value.charAt(0).toLocaleUpperCase('pt-BR')}${value.slice(1)}` : value;
}

export function getCareerDatePresentation(value) {
  const date = parseCareerDate(value);
  if (!date) {
    return { fullDate: '—', compactDate: '—', weekday: '—', weekdayShort: '—' };
  }

  const format = (options) => new Intl.DateTimeFormat('pt-BR', {
    ...options,
    timeZone: 'UTC',
  }).format(date);

  return {
    fullDate: format({ day: '2-digit', month: '2-digit', year: 'numeric' }),
    compactDate: format({ day: '2-digit', month: '2-digit' }),
    weekday: capitalize(format({ weekday: 'long' })),
    weekdayShort: format({ weekday: 'short' }).replaceAll('.', '').toLocaleUpperCase('pt-BR'),
  };
}
