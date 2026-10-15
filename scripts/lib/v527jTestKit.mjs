// Playthrough 5.27-J — kit dos testes *-v527j: evidência das carreiras reais
// (smoke contínuo, rodada com save/reload semanal, seed 3 histórica) e
// decomposição do limbo (legítimo × extensão ilegítima).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ROOT = resolve('reports/rebalance-527j');
export const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
export const has = (name) => existsSync(join(ROOT, name));
export const report = (name) => readJson(join(ROOT, name));
export function smokeCareers() {
  const dir = join(ROOT, 'smoke', 'baseline', 'normal-730d');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson(join(dir, f))) : [];
}
export const reloadCareer = () => readJson(join(ROOT, 'reload-weekly', 'normal-003.json'));
export const EXIT_STATUSES = ['nao_renovara', 'encerrar_ao_final', 'encerra_apos_compromisso'];
const dayOf = (r, date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${r.startDate}T00:00:00Z`)) / 86400000);

/**
 * Inscrições que criaram compromisso novo depois da saída decidida (estado do
 * jogo NO MOMENTO da inscrição, gravado pelo harness): em
 * `encerra_apos_compromisso`, ou em saída decidida terminando após a data nominal.
 */
export function illegitimateRegistrations(r) {
  return (r.registrations || []).filter((g) => EXIT_STATUSES.includes(g.partnershipStatus)
    && (g.partnershipStatus === 'encerra_apos_compromisso' || (g.nominalEnd && g.tournamentEnd && g.tournamentEnd > g.nominalEnd)));
}

/** Limbo de cada saída: decisão → separação; legítimo = até o fim do último compromisso anterior à decisão. */
export function limboDecomposition(r) {
  const lastMatch = {};
  for (const m of r.matches || []) lastMatch[m.tournamentId] = Math.max(lastMatch[m.tournamentId] ?? -1, dayOf(r, m.date));
  // Episódios revertidos (a dupla renovou depois) não são saída: ficam fora do limbo.
  return (r.exitEvents || []).filter((e) => e.revertedDay == null).map((e) => {
    const decisionDay = e.exitDecidedAt && dayOf(r, e.exitDecidedAt) <= e.firstSeenDay ? dayOf(r, e.exitDecidedAt) : e.firstSeenDay;
    const regs = (r.registrations || []).filter((g) => g.partnershipId === e.partnershipId);
    const before = regs.filter((g) => g.day <= decisionDay && !EXIT_STATUSES.includes(g.partnershipStatus));
    const after = regs.filter((g) => g.day >= decisionDay && EXIT_STATUSES.includes(g.partnershipStatus));
    const change = (r.partners || []).find((p) => p.day > decisionDay)?.day ?? null;
    const separationDay = e.separationScheduled ? dayOf(r, e.separationScheduled) : null;
    // Fim do compromisso = data final do torneio (a separação espera o evento acabar, não a eliminação).
    const lastLegit = Math.max(decisionDay, ...before.map((g) => (g.tournamentEnd ? dayOf(r, g.tournamentEnd) : lastMatch[g.tournamentId] ?? -1)));
    return { partnershipId: e.partnershipId, decisionDay, status: e.status, nominalEnd: e.nominalEnd, preexisting: before.length, newAfterExit: after.length, illegitimateAfterExit: illegitimateRegistrations({ registrations: after }).length, lastLegitimateDay: lastLegit, scheduledSeparationDay: separationDay, scheduleHistory: e.scheduleHistory, newPartnerDay: change, limboDays: change == null ? null : change - decisionDay, legitimateDays: lastLegit - decisionDay, extensionDays: separationDay == null ? null : Math.max(0, separationDay - lastLegit) };
  });
}
