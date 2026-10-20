// LOCAL-8A — auditoria de dados de uma carreira longa (somente leitura; nenhum código de produção alterado).
//
// Lê os saves por temporada gravados por scripts/cloud-7c-long-career.mjs (--dumpSeasons) e confere, com as funções
// REAIS do jogo (tabelas de pontos, janela rolling, derivação da chave canônica), a integridade de torneios, ranking
// individual, Race, ranking de duplas e ledger das parcerias. Produz um JSON resumido por temporada (sem dumps).
//
// Uso: node scripts/audit-local-8a-career.mjs --run=<pasta do simulador> [--out=<arquivo json>]
// (npm run test:local-8a-career-audit -- --run=...)
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
if (!args.run) { console.error('uso: --run=<pasta do simulador com save-season-N.json>'); process.exit(2); }
const RUN = path.resolve(String(args.run));
const OUT = path.resolve(String(args.out || path.join(RUN, 'audit-local-8a.json')));
// save-season-N.json (fim da temporada N) ou save-dayN.json (checkpoint de dia).
const saves = fs.readdirSync(RUN).map((f) => f.match(/^save-(season-|day)(\d+)\.json$/)).filter(Boolean)
  .map((m) => ({ file: m[0], label: m[1] === 'day' ? `dia ${m[2]}` : `temporada ${m[2]}`, order: m[1] === 'day' ? Number(m[2]) / 365 : Number(m[2]) }))
  .sort((a, b) => a.order - b.order);
if (!saves.length) { console.error(`nenhum save-season-N.json / save-dayN.json em ${RUN}`); process.exit(2); }

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const load = (p) => vite.ssrLoadModule(p);
  const { getRoundOutcomeTable } = await load('/src/lib/circuitCatalog.js');
  const { getTournamentRewards } = await load('/src/lib/career.js');
  const { computeRollingPoints } = await load('/src/game-core/rankingWindow.js');
  const { deriveTournamentFactsFromFullBracket } = await load('/src/gameplay/worldTour/tournamentSettlement.js');
  const { computeCanonicalTeamRankingPoints } = await load('/src/lib/teamRankingFormula.js');

  const aiPoints = (tier, position, entrants) => {
    const { roundCount, roundPoints } = getRoundOutcomeTable(tier, entrants);
    const index = position - 1;
    const depth = index <= 0 ? 0 : Math.floor(Math.log2(index)) + 1;
    return roundPoints[Math.max(0, roundCount - depth)] ?? roundPoints[0] ?? 0;
  };
  const key = (ids) => [...ids].filter(Boolean).sort().join('_');
  const sideKey = (name, pairId) => (pairId ? `id:${pairId}` : `name:${name}`);
  const seasonOf = (date, start) => Math.floor((new Date(`${date}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / (365 * 86400000)) + 1;

  const report = { run: RUN, seasons: [] };
  for (const { file: saveFile, label: season } of saves) {
    const file = path.join(RUN, saveFile);
    const raw = fs.readFileSync(file, 'utf8');
    const save = JSON.parse(raw);
    const E = save.entities || {};
    const player = save.player || (E.PlayerProfile || [])[0] || {};
    const date = player.career_date;
    const start = '2026-01-05';
    const T = E.Tournament || [];
    const athletes = new Map((E.AthleteProfile || []).map((a) => [a.id, a]));
    const partnerships = new Map((E.Partnership || []).map((p) => [p.id, p]));
    const results = E.AthleteRankingResult || [];
    const resultsByTournament = new Map();
    for (const r of results) { if (!r.tournament_id) continue; if (!resultsByTournament.has(r.tournament_id)) resultsByTournament.set(r.tournament_id, []); resultsByTournament.get(r.tournament_id).push(r); }
    const membersOf = (pairId, snapshotEntry) => (snapshotEntry?.member_ids?.length === 2 ? snapshotEntry.member_ids
      : String(pairId).startsWith('profile-pair:') ? String(pairId).slice('profile-pair:'.length).split(':')
        : [partnerships.get(pairId)?.athlete_a_id, partnerships.get(pairId)?.athlete_b_id]).filter(Boolean);
    const isActive = (id) => athletes.get(id) && !athletes.get(id).retired && athletes.get(id).career_status !== 'aposentado';
    const isPlayerTournament = (t) => t.player_participated || (t.bracket_history || []).some((r) => (r.matches || []).some((m) => m.player_match));

    // ── Torneios ──
    const tour = { total: T.length, finished: 0, cancelled: 0, future: 0, inProgress: 0, stuck: 0, stuckIds: [], withoutChampion: 0,
      championMismatch: 0, runnerUpMismatch: 0, placementDuplicates: 0, placementCountMismatch: 0, invalidWinner: 0, missingSettlementId: 0,
      settlementDup: 0, playerTournaments: 0, aiOnly: 0, ambiguousIdentity: 0, homonymBrackets: 0, bySeason: {} };
    const seenSettlement = new Set();
    const pointsIssues = { checked: 0, wrong: 0, examples: [] };
    const ledgerExpected = new Map(); // key -> { w, l, t, events }
    for (const t of T) {
      const s = t.end_date ? seasonOf(t.end_date, start) : null;
      const bucket = tour.bySeason[s] = tour.bySeason[s] || { scheduled: 0, finished: 0, cancelled: 0, stuck: 0 };
      bucket.scheduled += 1;
      if (t.status === 'cancelado') { tour.cancelled += 1; bucket.cancelled += 1; continue; }
      if (t.status !== 'finalizado') {
        const days = t.end_date ? (new Date(date) - new Date(t.end_date)) / 86400000 : -1;
        // Exibição fora do circuito (sem chave, sem pontos): fica em 'inscricoes' se o jogador não joga — contada à parte.
        if ((t.tier === 'Exibição' || t.is_exhibition) && t.world_tour_event === false && days > 14 && !isPlayerTournament(t)) { tour.exhibitionOpen = (tour.exhibitionOpen || 0) + 1; continue; }
        if (!t.start_date || t.start_date > date) tour.future += 1;
        else if (days <= 14) tour.inProgress += 1;
        else { tour.stuck += 1; bucket.stuck += 1; if (tour.stuckIds.length < 10) tour.stuckIds.push(t.id); }
        continue;
      }
      tour.finished += 1; bucket.finished += 1;
      if (!t.champion) tour.withoutChampion += 1;
      if (!t.world_tour_resolved && !t.player_decided_result) continue; // exibição / legado sem chave canônica
      if (t.canonical_settlement_id) { if (seenSettlement.has(t.canonical_settlement_id)) tour.settlementDup += 1; seenSettlement.add(t.canonical_settlement_id); } else tour.missingSettlementId += 1;
      if (t.pair_identity_ambiguous) tour.ambiguousIdentity += 1;
      const rounds = t.bracket_history || [];
      for (const r of rounds) for (const m of r.matches || []) if (!m.winner || (m.winner !== m.team_a && m.winner !== m.team_b)) tour.invalidWinner += 1;
      const facts = rounds.length ? deriveTournamentFactsFromFullBracket(rounds) : null;
      if (facts) {
        if (facts.champion !== t.champion) tour.championMismatch += 1;
        if (facts.runner_up !== t.runner_up) tour.runnerUpMismatch += 1;
      }
      const pl = t.placements || [];
      const plKeys = pl.map((p) => sideKey(p.team, p.pair_id));
      if (plKeys.length !== new Set(plKeys).size) tour.placementDuplicates += 1;
      if (pl.some((p) => p.pair_id)) tour.homonymBrackets += 1;
      const snapshot = t.draw_ranking_snapshot || [];
      const rows = resultsByTournament.get(t.id) || [];
      // Resultados com mais de 364 dias saem da janela rolling e são podados de propósito: os pontos desses torneios não
      // são mais conferíveis (contados como expirados, não como erro). O ledger/colocações continuam conferidos.
      const expired = t.end_date && (new Date(date) - new Date(t.end_date)) / 86400000 > 364;
      if (expired) pointsIssues.expiredTournaments = (pointsIssues.expiredTournaments || 0) + 1;
      const rowByAthlete = new Map(rows.map((r) => [r.athlete_id, r]));
      if (isPlayerTournament(t)) {
        tour.playerTournaments += 1;
        // Pontos do campo (LOCAL-7G): rodadas vencidas na chave → getTournamentRewards. Só chaves completas.
        if (!facts) continue;
        const won = new Map([[facts.champion, rounds.length]]);
        rounds.forEach((r, i) => (r.matches || []).forEach((m) => { const loser = m.winner === m.team_a ? m.team_b : m.team_a; if (!won.has(loser)) won.set(loser, i); }));
        const record = new Map();
        for (const r of rounds) for (const m of r.matches || []) {
          if (!m.team_a || !m.team_b || !m.winner || (m.player_match && !m.score)) continue;
          const lose = m.winner === m.team_a ? m.team_b : m.team_a;
          for (const [n, f] of [[m.winner, 'w'], [lose, 'l']]) { const x = record.get(n) || { w: 0, l: 0 }; x[f] += 1; record.set(n, x); }
        }
        for (const entry of snapshot) {
          if (!won.has(entry.name)) continue;
          const expected = getTournamentRewards(t.tier, won.get(entry.name)).rankPoints;
          for (const id of membersOf(entry.pair_id, entry).filter(isActive)) {
            if (expired) continue;
            pointsIssues.checked += 1;
            const row = rowByAthlete.get(id);
            if (row && Number(row.points) !== expected) { pointsIssues.wrong += 1; if (pointsIssues.examples.length < 5) pointsIssues.examples.push(`${t.id} ${entry.name}: ${row.points}≠${expected}`); }
          }
          const k = key(membersOf(entry.pair_id, entry));
          const rec = record.get(entry.name) || { w: 0, l: 0 };
          const acc = ledgerExpected.get(k) || { w: 0, l: 0, t: 0, events: 0 };
          acc.w += rec.w; acc.l += rec.l; acc.t += entry.name === facts.champion ? 1 : 0; acc.events += 1; ledgerExpected.set(k, acc);
        }
      } else {
        tour.aiOnly += 1;
        if (pl.length && (t.draw_pair_ids || []).length && pl.length !== t.draw_pair_ids.length) tour.placementCountMismatch += 1;
        const byes = new Set(rounds[0]?.byes || []);
        const record = new Map();
        for (const r of rounds) for (const m of r.matches || []) {
          if (!m.team_a || !m.team_b || !m.winner) continue;
          const lose = m.winner === m.team_a ? m.team_b : m.team_a;
          for (const [n, f] of [[m.winner, 'w'], [lose, 'l']]) { const x = record.get(n) || { w: 0, l: 0 }; x[f] += 1; record.set(n, x); }
        }
        for (const entry of snapshot) {
          const placement = pl.find((p) => (p.pair_id ? p.pair_id === entry.pair_id : p.team === entry.name));
          if (!placement) continue;
          const expected = aiPoints(t.tier, placement.position, t.simulated_entrants || snapshot.length);
          for (const id of membersOf(entry.pair_id, entry).filter(isActive)) {
            if (expired) continue;
            pointsIssues.checked += 1;
            const row = rowByAthlete.get(id);
            if (!row || Number(row.points) !== expected) { pointsIssues.wrong += 1; if (pointsIssues.examples.length < 5) pointsIssues.examples.push(`${t.id} ${entry.name}: ${row?.points ?? '—'}≠${expected}`); }
          }
          const k = key(membersOf(entry.pair_id, entry));
          const rec = record.get(entry.name) || { w: 0, l: 0 };
          const acc = ledgerExpected.get(k) || { w: 0, l: 0, t: 0, events: 0 };
          acc.w += rec.w + (byes.has(entry.name) ? 1 : 0); acc.l += rec.l; acc.t += placement.position === 1 ? 1 : 0; acc.events += 1; ledgerExpected.set(k, acc);
        }
      }
    }

    // ── Ranking individual: duplicação, janela rolling (atletas sem resultado após a última passada semanal) ──
    const dupResults = results.length - new Set(results.map((r) => `${r.athlete_id}|${r.tournament_id || r.id}`)).size;
    const lastCircuit = [...athletes.values()].map((a) => a.last_circuit_update || '').sort().pop();
    const resultsByAthlete = new Map();
    for (const r of results) { if (!resultsByAthlete.has(r.athlete_id)) resultsByAthlete.set(r.athlete_id, []); resultsByAthlete.get(r.athlete_id).push(r); }
    let rollingChecked = 0; let rollingWrong = 0; const rollingExamples = [];
    for (const a of athletes.values()) {
      if (!isActive(a.id) || a.last_circuit_update !== lastCircuit) continue;
      const rows = resultsByAthlete.get(a.id) || [];
      if (rows.some((r) => (r.date || '') >= lastCircuit)) continue;
      rollingChecked += 1;
      const expected = computeRollingPoints(rows, [], lastCircuit);
      if (Number(a.world_ranking_points) !== expected) { rollingWrong += 1; if (rollingExamples.length < 3) rollingExamples.push(`${a.name}: ${a.world_ranking_points}≠${expected}`); }
    }
    // ── Race: acumulador do ano civil = soma dos resultados de torneio do ano corrente ──
    const year = String(date).slice(0, 4);
    let raceChecked = 0; let raceWrong = 0; const raceExamples = [];
    for (const a of athletes.values()) {
      if (!isActive(a.id)) continue;
      const sum = (resultsByAthlete.get(a.id) || []).filter((r) => r.tournament_id && String(r.date || '').startsWith(year)).reduce((s, r) => s + Number(r.points || 0), 0);
      if (!sum && !Number(a.race_points)) continue;
      raceChecked += 1;
      if (Number(a.race_points || 0) !== sum) { raceWrong += 1; if (raceExamples.length < 3) raceExamples.push(`${a.name}: race ${a.race_points} vs ${sum}`); }
    }
    // ── Ranking de duplas: unicidade, soma canônica (pós-passada semanal), ledger vs partidas reais ──
    const team = E.TeamRanking || [];
    const teamKeys = team.map((r) => key([r.player1_id, r.player2_id]));
    const teamDup = teamKeys.length - new Set(teamKeys).size;
    let sumChecked = 0; let sumWrong = 0;
    for (const r of team) {
      const a = athletes.get(r.player1_id); const b = athletes.get(r.player2_id);
      if (!a || !b || !isActive(a.id) || !isActive(b.id) || a.ai_partner_id !== b.id) continue;
      if ((resultsByAthlete.get(a.id) || []).concat(resultsByAthlete.get(b.id) || []).some((x) => (x.date || '') >= lastCircuit)) continue;
      sumChecked += 1;
      if (Number(r.ranking_points) !== computeCanonicalTeamRankingPoints(a.world_ranking_points, b.world_ranking_points)) sumWrong += 1;
    }
    let ledgerChecked = 0; let ledgerWrong = 0; let ledgerMathWrong = 0; const ledgerExamples = [];
    for (const r of team) {
      if (r.stats_source !== 'ledger') continue;
      if (Number(r.matches_played) !== Number(r.wins) + Number(r.losses)) ledgerMathWrong += 1;
      const exp = ledgerExpected.get(key([r.player1_id, r.player2_id]));
      if (!exp || exp.events !== Number(r.ledger_events)) continue; // só pares com todos os eventos ainda no save
      ledgerChecked += 1;
      if (exp.w !== Number(r.wins) || exp.l !== Number(r.losses) || exp.t !== Number(r.ledger_titles || 0)) { ledgerWrong += 1; if (ledgerExamples.length < 3) ledgerExamples.push(`${r.player1_name} & ${r.player2_name}: ${r.wins}V/${r.losses}D/${r.ledger_titles}t vs ${exp.w}/${exp.l}/${exp.t}`); }
    }
    // ── Parcerias, aposentadorias, jogador ──
    const P = E.Partnership || [];
    const retired = [...athletes.values()].filter((a) => a.retired || a.career_status === 'aposentado').length;
    const homonymNames = (() => { const c = new Map(); for (const a of athletes.values()) if (isActive(a.id)) c.set(a.name, (c.get(a.name) || 0) + 1); return [...c.values()].filter((n) => n > 1).length; })();
    const playerResults = (resultsByAthlete.get(player.id) || []).filter((r) => r.tournament_id);
    report.seasons.push({
      season, date, saveBytes: Buffer.byteLength(raw),
      tournaments: tour, points: pointsIssues,
      ranking: { results: results.length, duplicateResults: dupResults, rollingChecked, rollingWrong, rollingExamples, raceChecked, raceWrong, raceExamples },
      teams: { rows: team.length, duplicates: teamDup, sumChecked, sumWrong, ledgerRows: team.filter((r) => r.stats_source === 'ledger').length, ledgerChecked, ledgerWrong, ledgerMathWrong, ledgerExamples },
      world: { athletes: athletes.size, active: [...athletes.values()].filter((a) => isActive(a.id)).length, retired, partnerships: P.length, activePartnerships: P.filter((p) => p.status === 'ativa').length, homonymNameGroups: homonymNames },
      player: { rankPoints: player.rank_points, racePoints: player.race_points, titles: (player.titles || []).length, tournamentsPlayed: player.tournaments_played, results: playerResults.length, bestFinish: playerResults.reduce((b, r) => Math.max(b, Number(r.points || 0)), 0) },
    });
    console.log(`${season} ${date}: torneios ${tour.finished}/${tour.total} concluídos, travados ${tour.stuck}, pontos errados ${pointsIssues.wrong}/${pointsIssues.checked}, rolling ${rollingWrong}/${rollingChecked}, race ${raceWrong}/${raceChecked}, ledger ${ledgerWrong}/${ledgerChecked}, duplas dup ${teamDup}, save ${(Buffer.byteLength(raw) / 1048576).toFixed(1)} MB`);
  }
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  console.log(`relatório: ${OUT}`);
} finally {
  await vite.close();
}
