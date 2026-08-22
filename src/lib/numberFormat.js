export function formatDecimalStat(value, fractionDigits = 2) {
  const parsed = Number(value);
  const safeValue = Number.isFinite(parsed) ? parsed : 0;
  return safeValue.toFixed(fractionDigits);
}

export function formatAttributeGain(value) {
  return formatDecimalStat(value, 2);
}

export function formatCoinBalance(value) {
  const parsed = Number(value);
  return Math.max(0, Math.round(Number.isFinite(parsed) ? parsed : 0)).toLocaleString('pt-BR');
}
