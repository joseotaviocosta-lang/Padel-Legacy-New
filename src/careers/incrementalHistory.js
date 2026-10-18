// CLOUD-7B2C — compactação INCREMENTAL experimental (desligada por padrão; não habilitada em produção).
//
// Cada torneio liquidado é empacotado UMA vez, quando a escrita que o finalizou termina, e permanece empacotado
// (um string JSON único, `history_pack.blob`) na memória, no clone transacional e no arquivo. Leitores continuam
// vendo o formato de sempre: `CareerEntityRepository` entrega cópias com os campos pesados como getters
// preguiçosos (expandem só quando alguém lê o campo; nada de estado expandido guardado em cache global).
// Escritas que tocam campos pesados de uma linha empacotada expandem a linha primeiro; a varredura seguinte a
// reempacota (contado em `stats.repacks`).
import {
  expandHistoryFields, isTournamentSettled, packTournament, TOURNAMENT_HEAVY_FIELDS, unpackTournament,
} from './tournamentHistoryCodec.js';

export const INCREMENTAL_COMPACTION_ENABLED = false;
// `globalThis.__PADEL_INCREMENTAL_COMPACTION__ = true` liga a estratégia nos testes/benchmarks (--import preload).
export const isIncrementalCompactionEnabled = () => INCREMENTAL_COMPACTION_ENABLED
  || globalThis.__PADEL_INCREMENTAL_COMPACTION__ === true;

const stats = { packs: 0, packSkips: 0, packMs: 0, views: 0, materializations: 0, materializeMs: 0, writeExpansions: 0, sweeps: 0 };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
export const getIncrementalStats = () => ({ ...stats });
export function resetIncrementalStats() { for (const key of Object.keys(stats)) stats[key] = 0; }

// Varredura barata (2 leituras de campo por linha) que empacota, no próprio array, linhas liquidadas ainda abertas.
// Linhas que não passam na prova de round-trip ficam como estão (e são tentadas de novo na próxima varredura).
export function compactSettledRows(rows) {
  if (!Array.isArray(rows)) return 0;
  stats.sweeps += 1;
  let packed = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.history_pack || row.status !== 'finalizado' || !row.bracket_history) continue;
    if (!isTournamentSettled(row)) continue;
    const t0 = now();
    const next = packTournament(row, { blob: true });
    stats.packMs += now() - t0;
    if (next === row) { stats.packSkips += 1; continue; }
    rows[i] = next;
    stats.packs += 1;
    packed += 1;
  }
  return packed;
}

// Cópia de leitura de uma linha empacotada: mesmas chaves, mesma ordem, campos pesados preguiçosos e graváveis.
export function lazyTournamentView(row) {
  if (!row?.history_pack) return { ...row };
  stats.views += 1;
  const at = row.history_pack.at;
  const entries = Object.keys(row).filter((key) => key !== 'history_pack').map((key) => [key, row[key]]);
  for (const [name, position] of at) entries.splice(position, 0, [name, undefined]);
  let fields = null;
  const materialize = () => {
    if (!fields) {
      const t0 = now();
      fields = expandHistoryFields(row);
      stats.materializations += 1;
      stats.materializeMs += now() - t0;
    }
    return fields;
  };
  const view = {};
  for (const [key, value] of entries) {
    if (TOURNAMENT_HEAVY_FIELDS.includes(key) && at.some(([name]) => name === key)) {
      Object.defineProperty(view, key, {
        enumerable: true,
        configurable: true,
        get: () => materialize()[key],
        set(next) { Object.defineProperty(view, key, { value: next, enumerable: true, configurable: true, writable: true }); },
      });
    } else {
      view[key] = value;
    }
  }
  return view;
}

export const viewForResult = (row) => (row?.history_pack ? lazyTournamentView(row) : row);

// Linha a ser mesclada com `patch`: se o patch toca campos pesados, a linha empacotada é expandida antes.
export function writableRow(row, patch) {
  if (!row?.history_pack) return row;
  if (!patch || !TOURNAMENT_HEAVY_FIELDS.some((name) => name in patch)) return row;
  stats.writeExpansions += 1;
  return unpackTournament(row);
}
