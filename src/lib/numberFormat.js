export function formatGameNumber(value, {
  minimumFractionDigits = 0,
  maximumFractionDigits = 1,
  useGrouping = false,
} = {}) {
  const parsed = Number(value);
  const safeValue = Number.isFinite(parsed) ? parsed : 0;
  return safeValue.toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping,
  });
}

export function formatDecimalStat(value, fractionDigits = 2) {
  return formatGameNumber(value, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatAttributeGain(value) {
  return formatDecimalStat(value, 2);
}

export function formatCoinBalance(value) {
  const parsed = Number(value);
  return Math.max(0, Math.round(Number.isFinite(parsed) ? parsed : 0)).toLocaleString('pt-BR');
}

export function formatCurrency(value) {
  return formatCoinBalance(value);
}

export function formatSignedGameNumber(value, options = {}) {
  const parsed = Number(value);
  const safeValue = Number.isFinite(parsed) ? parsed : 0;
  return `${safeValue > 0 ? '+' : ''}${formatGameNumber(safeValue, options)}`;
}
