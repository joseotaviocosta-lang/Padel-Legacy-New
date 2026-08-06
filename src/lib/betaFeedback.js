import { buildBetaDiagnosticReport } from '@/lib/betaDiagnostics.js';

const SEVERITY_LABELS = {
  blocker: 'Bloqueador',
  high: 'Grave',
  medium: 'Moderado',
  low: 'Polimento',
};

function sanitizeText(value, maxLength = 4000) {
  return String(value || '').trim().slice(0, maxLength);
}

export function buildBetaFeedbackReport({ career, pathname, feedback = {} } = {}) {
  const diagnostic = buildBetaDiagnosticReport({ career, pathname });
  const severity = ['blocker', 'high', 'medium', 'low'].includes(feedback.severity)
    ? feedback.severity
    : 'medium';

  return {
    report_type: 'padel_legacy_closed_beta_feedback',
    generated_at: new Date().toISOString(),
    severity,
    severity_label: SEVERITY_LABELS[severity],
    category: sanitizeText(feedback.category, 80) || 'Outro',
    title: sanitizeText(feedback.title, 180) || 'Problema sem título',
    steps: sanitizeText(feedback.steps),
    expected: sanitizeText(feedback.expected),
    actual: sanitizeText(feedback.actual),
    notes: sanitizeText(feedback.notes),
    consent_to_include_diagnostic: feedback.includeDiagnostic !== false,
    diagnostic: feedback.includeDiagnostic === false ? null : diagnostic,
  };
}

export function downloadBetaFeedbackReport(options = {}) {
  const report = buildBetaFeedbackReport(options);
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeTitle = (report.title || 'feedback')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .toLowerCase();
  link.href = url;
  link.download = `padel-legacy-feedback-${safeTitle || 'relato'}-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return report;
}
