// CLOUD-7C (somente diagnóstico) — por que torneios com jogador ativo falham na prova de round-trip do codec 7B2B/7B2C.
// Lê um save (formato físico qualquer), separa torneios liquidados NÃO empacotados e classifica a causa da falha.
// Uso: node scripts/diagnose-cloud-7c-roundtrip.mjs <save.json> [--output=<json>]
import fs from 'node:fs';
import { isTournamentSettled, packTournament } from '../src/careers/tournamentHistoryCodec.js';

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const outFile = process.argv.find((a) => a.startsWith('--output='))?.slice(9);
const save = JSON.parse(fs.readFileSync(file, 'utf8'));
const tournaments = save.entities.Tournament;
const settledUnpacked = tournaments.filter((t) => t.status === 'finalizado' && !t.history_pack && isTournamentSettled(t));
// ordem canônica que o codec restaura (tournamentHistoryCodec.js, MATCH_KEY_ORDER) — espelhada aqui só para diagnosticar
const CANON = ['match_id', 'source_match_ids', 'date', 'status', 'team_a', 'team_b', 'winner', 'score'];
const canonicalOrder = (match) => {
  const out = {};
  for (const k of CANON) if (k in match) out[k] = match[k];
  for (const k of Object.keys(match)) if (!(k in out)) out[k] = match[k];
  return out;
};
const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
const J = JSON.stringify;
const report = { file, tournaments: tournaments.length, finalizados: tournaments.filter((t) => t.status === 'finalizado').length, settledUnpacked: settledUnpacked.length, causes: {}, examples: [] };
let reorderFixes = 0; let semanticallyEqualAfterSort = 0; let withPlayerMatch = 0; let withoutPlayerMatch = 0; const orderSignatures = {};
for (const t of settledUnpacked) {
  const matches = t.bracket_history.flatMap((r) => r.matches);
  const hasPlayer = matches.some((m) => m.player_match);
  if (hasPlayer) withPlayerMatch += 1; else withoutPlayerMatch += 1;
  for (const m of matches) { const sig = Object.keys(m).join(','); orderSignatures[sig] = (orderSignatures[sig] || 0) + 1; }
  const nonCanonicalOrder = matches.filter((m) => J(Object.keys(m)) !== J(Object.keys(canonicalOrder(m))));
  const nonPatternIds = matches.filter((m, i) => !String(m.match_id).match(/:r\d+:m\d+$/));
  const copy = JSON.parse(J(t));
  copy.bracket_history = copy.bracket_history.map((r) => ({ ...r, matches: r.matches.map(canonicalOrder) }));
  const packsAfterReorder = packTournament(copy, { blob: true }) !== copy;
  if (packsAfterReorder) reorderFixes += 1;
  const equalAfterSort = J(sorted(copy)) === J(sorted(t));
  if (equalAfterSort) semanticallyEqualAfterSort += 1;
  const absentSources = matches.filter((m) => !('source_match_ids' in m));
  // Experimentos de causa (dados alterados só nesta cópia de diagnóstico):
  //  E1 só reordena as chaves; E2 só injeta `source_match_ids: []` onde a chave não existe; E3 faz as duas coisas.
  const injectSources = (rounds, reorder) => rounds.map((r) => ({ ...r, matches: r.matches.map((m) => { const x = 'source_match_ids' in m ? m : { ...m, source_match_ids: [] }; return reorder ? canonicalOrder(x) : x; }) }));
  const tryPack = (rounds) => { const c = JSON.parse(J(t)); c.bracket_history = rounds; return packTournament(c, { blob: true }) !== c; };
  const e1 = tryPack(JSON.parse(J(t)).bracket_history.map((r) => ({ ...r, matches: r.matches.map(canonicalOrder) })));
  const e2 = tryPack(injectSources(JSON.parse(J(t)).bracket_history, false));
  const e3 = tryPack(injectSources(JSON.parse(J(t)).bracket_history, true));
  report.experiments = report.experiments || { reorderOnly: 0, injectOnly: 0, reorderAndInject: 0 };
  if (e1) report.experiments.reorderOnly += 1; if (e2) report.experiments.injectOnly += 1; if (e3) report.experiments.reorderAndInject += 1;
  const causeKey = [absentSources.length ? 'source_match_ids_ausente' : null, nonCanonicalOrder.length ? 'ordem_de_chaves' : null].filter(Boolean).join('+') || 'outra';
  report.causes[causeKey] = (report.causes[causeKey] || 0) + 1;
  report.absentSourceMatchesPerTournament = report.absentSourceMatchesPerTournament || {};
  report.absentSourceMatchesPerTournament[absentSources.length] = (report.absentSourceMatchesPerTournament[absentSources.length] || 0) + 1;
  if (report.examples.length < 1 && nonCanonicalOrder.length && absentSources.length) {
    const absent = absentSources[0];
    report.exampleAbsentKey = { tournament: t.id, originalJson: J(absent), restoredByCodecJson: J({ ...absent, source_match_ids: [] }), note: 'o codec deriva source_match_ids=[] para partida da rodada 0 quando a chave está ausente: o torneio restaurado ganha uma chave que o original não tinha' };
    const sample = nonCanonicalOrder[0];
    report.examples.push({
      tournament: t.id, hasPlayerMatch: hasPlayer, nonPatternMatchIds: nonPatternIds.length,
      originalKeyOrder: Object.keys(sample), restoredKeyOrder: Object.keys(canonicalOrder(sample)),
      originalJson: J(sample), restoredJson: J(canonicalOrder(sample)),
    });
  }
}
report.withPlayerMatch = withPlayerMatch; report.withoutPlayerMatch = withoutPlayerMatch;
report.semanticallyIdenticalIgnoringKeyOrder = semanticallyEqualAfterSort;
report.matchKeyOrderSignatures = orderSignatures;
// controle: torneios liquidados JÁ empacotados nunca têm partida do jogador
const packed = tournaments.filter((t) => t.history_pack);
report.packedTournaments = packed.length;
if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
