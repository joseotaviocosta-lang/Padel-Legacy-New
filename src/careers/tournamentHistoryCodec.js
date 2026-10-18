// CLOUD-7B2B — codec de persistência do histórico de torneios finalizados.
//
// Só roda na FRONTEIRA do arquivo (gravar/ler): o estado em memória e todos os leitores continuam vendo o
// formato expandido de sempre. Sem marcador `history_pack` o torneio é lido exatamente como antes (saves
// anteriores à 7B2B não precisam de migração). Sem perda: cada torneio só é empacotado depois de provar,
// por round-trip, que `unpack(pack(t))` serializa byte a byte igual ao original; qualquer dúvida deixa o
// torneio intacto. Nunca muta o objeto de entrada.
export const HISTORY_PACK_VERSION = 1;
// A LEITURA do formato compacto está sempre ativa; a GRAVAÇÃO compacta só liga com esta chave (ou a opção
// `compactHistory` do repositório, ou `globalThis.__PADEL_HISTORICAL_COMPACTION__ = true`, usado pelos testes
// para reexecutar as suítes de persistência com a gravação compacta ligada). Desligada por padrão:
// ver docs/CLOUD_7B2B_HISTORICAL_COMPACTION.md.
export const HISTORICAL_COMPACTION_WRITE_ENABLED = false;
export const isHistoricalCompactionWriteEnabled = () => HISTORICAL_COMPACTION_WRITE_ENABLED
  || globalThis.__PADEL_HISTORICAL_COMPACTION__ === true;
const HEAVY_FIELDS = ['bracket_history', 'draw_ranking_snapshot', 'draw_pair_ids', 'placements', 'participants'];
const REF = '\u0001';
const MIN_DICT_LENGTH = 8;

export function isPackedTournament(tournament) {
  return Boolean(tournament && tournament.history_pack);
}

// Estado final inequívoco: liquidação canônica registrada, campeão/vice conhecidos, chave completa e todas
// as partidas encerradas. A data nunca é critério.
export function isTournamentSettled(tournament) {
  if (!tournament || tournament.status !== 'finalizado' || tournament.world_tour_resolved !== true) return false;
  if (!tournament.canonical_settlement_id || !tournament.champion || !tournament.runner_up) return false;
  if (tournament.history_pack) return false;
  const rounds = tournament.bracket_history;
  if (!Array.isArray(rounds) || !rounds.length) return false;
  return rounds.every((round) => Array.isArray(round?.matches) && round.matches.every((match) => (
    match && match.winner && (match.status === undefined || match.status === 'completed')
  )));
}

const matchIdFor = (id, roundIndex, matchIndex) => `${id}:r${roundIndex}:m${matchIndex}`;
const defaultSources = (id, roundIndex, matchIndex) => (roundIndex === 0 ? [] : [matchIdFor(id, roundIndex - 1, matchIndex * 2), matchIdFor(id, roundIndex - 1, matchIndex * 2 + 1)]);
const sameArray = (a, b) => Array.isArray(a) && a.length === b.length && a.every((value, index) => value === b[index]);

function eachString(value, visit) {
  if (typeof value === 'string') { visit(value); return; }
  if (Array.isArray(value)) { value.forEach((item) => eachString(item, visit)); return; }
  if (value && typeof value === 'object') Object.values(value).forEach((item) => eachString(item, visit));
}

function mapStrings(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn));
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = mapStrings(value[key], fn);
    return out;
  }
  return value;
}

function elideDerivedMatchFields(tournamentId, rounds) {
  return rounds.map((round, roundIndex) => ({
    ...round,
    matches: (round.matches || []).map((match, matchIndex) => {
      const copy = { ...match };
      if (copy.match_id === matchIdFor(tournamentId, roundIndex, matchIndex)) delete copy.match_id;
      if (sameArray(copy.source_match_ids, defaultSources(tournamentId, roundIndex, matchIndex))) delete copy.source_match_ids;
      return copy;
    }),
  }));
}

// Reinsere as chaves na ordem canônica; se a ordem original era outra, o round-trip falha e o torneio fica intacto.
const MATCH_KEY_ORDER = ['match_id', 'source_match_ids', 'date', 'status', 'team_a', 'team_b', 'winner', 'score'];
function restoreDerivedMatchFields(tournamentId, rounds) {
  return rounds.map((round, roundIndex) => ({
    ...round,
    matches: (round.matches || []).map((match, matchIndex) => {
      const full = { ...match };
      if (!('match_id' in full)) full.match_id = matchIdFor(tournamentId, roundIndex, matchIndex);
      if (!('source_match_ids' in full)) full.source_match_ids = defaultSources(tournamentId, roundIndex, matchIndex);
      const ordered = {};
      for (const key of MATCH_KEY_ORDER) if (key in full) ordered[key] = full[key];
      for (const key of Object.keys(full)) if (!(key in ordered)) ordered[key] = full[key];
      return ordered;
    }),
  }));
}

function buildPack(tournament) {
  const fields = {};
  for (const name of HEAVY_FIELDS) if (tournament[name] !== undefined) fields[name] = tournament[name];
  if (Array.isArray(fields.bracket_history)) fields.bracket_history = elideDerivedMatchFields(tournament.id, fields.bracket_history);
  const counts = new Map();
  eachString(fields, (text) => { if (text.length >= MIN_DICT_LENGTH) counts.set(text, (counts.get(text) || 0) + 1); });
  const dict = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([text]) => text);
  const index = new Map(dict.map((text, i) => [text, i]));
  const encoded = mapStrings(fields, (text) => (index.has(text) ? `${REF}${index.get(text).toString(36)}` : text));
  return { v: HISTORY_PACK_VERSION, dict, fields: encoded, at: Object.keys(tournament).map((key, i) => [key, i]).filter(([key]) => HEAVY_FIELDS.includes(key)) };
}

function readPack(tournamentId, pack) {
  const fields = mapStrings(pack.fields, (text) => {
    if (!text.startsWith(REF)) return text;
    const entry = pack.dict[parseInt(text.slice(1), 36)];
    if (typeof entry !== 'string') throw new Error(`history_pack corrompido no torneio ${tournamentId}: referência fora do dicionário.`);
    return entry;
  });
  if (Array.isArray(fields.bracket_history)) fields.bracket_history = restoreDerivedMatchFields(tournamentId, fields.bracket_history);
  return fields;
}

function hasReservedStrings(tournament) {
  let reserved = false;
  eachString(HEAVY_FIELDS.map((name) => tournament[name]), (text) => { if (text.startsWith(REF)) reserved = true; });
  return reserved;
}

// Devolve o torneio empacotado, ou o MESMO objeto quando não é elegível/verificável.
export function packTournament(tournament) {
  if (!isTournamentSettled(tournament) || hasReservedStrings(tournament)) return tournament;
  try {
    const pack = buildPack(tournament);
    const packed = { history_pack: pack };
    for (const key of Object.keys(tournament)) if (!HEAVY_FIELDS.includes(key)) packed[key] = tournament[key];
    // Prova de equivalência do objeto inteiro (chaves, ordem e valores).
    if (JSON.stringify(unpackTournament(packed)) !== JSON.stringify(tournament)) return tournament;
    return packed;
  } catch {
    return tournament;
  }
}

// Expande no próprio objeto (uso interno: o chamador é dono do dado recém-lido). Falha fechada: pacote
// ilegível lança erro em vez de entregar um torneio sem histórico.
export function unpackTournament(tournament) {
  const pack = tournament?.history_pack;
  if (!pack) return tournament;
  if (pack.v !== HISTORY_PACK_VERSION || !Array.isArray(pack.at) || !Array.isArray(pack.dict) || !pack.fields || typeof pack.fields !== 'object') {
    throw new Error(`history_pack inválido no torneio ${tournament.id}.`);
  }
  const fields = readPack(tournament.id, pack);
  // `history_pack` é só o marcador: as demais chaves voltam na ordem original, com as pesadas nas posições gravadas.
  const rest = Object.keys(tournament).filter((key) => key !== 'history_pack');
  const entries = rest.map((key) => [key, tournament[key]]);
  for (const [name, position] of pack.at) if (name in fields) entries.splice(position, 0, [name, fields[name]]);
  const expanded = Object.fromEntries(entries);
  return expanded;
}

function withTournaments(career, mapper) {
  const list = career?.entities?.Tournament;
  if (!Array.isArray(list) || !list.length) return career;
  let changed = false;
  const next = list.map((tournament) => { const out = mapper(tournament); if (out !== tournament) changed = true; return out; });
  return changed ? { ...career, entities: { ...career.entities, Tournament: next } } : career;
}

// Cópia rasa: só os torneios finalizados ganham objeto novo; o resto do save é compartilhado.
export const packCareerForStorage = (career) => withTournaments(career, packTournament);
export const unpackCareerFromStorage = (career) => withTournaments(career, unpackTournament);
