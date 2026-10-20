// Fase 5.32-A — Ranking por COMPORTAMENTO, com o mundo real (carreira nova
// em memória, a mesma semeadura do navegador) e as autoridades reais
// (buildWorldRankingSnapshot, getTeamRankings/getTeamRank,
// getTeamRaceRankings). Os componentes da página são renderizados (SSR) com
// os dados derivados pelas MESMAS funções que a página usa.
//
//   H. hierarquia: posição antes de pontos, pontos antes do contexto;
//   P. contexto do jogador: posição, pontos, distância real para cima, dupla;
//   U. sem ranking: nenhuma posição numérica (nem #1001, nem #1000+);
//   M. linha mobile: posição, nome, pontos, país, OVR; destaque do jogador;
//   T. duplas: os dois membros, ids estáveis, "sua dupla", estado sem dupla,
//      pontos = soma canônica (sem fórmula nova);
//   R. Race: só quem pontuou, ano da carreira, pódio sem "0 pts".
// Uso: node scripts/test-ranking-views-v532.mjs
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
function hashSeed(value) { let h = 2166136261; for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
let rng = 1;
let fake = 0;
Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32; };
const RealDate = Date;
globalThis.Date = class DeterministicDate extends RealDate {
  constructor(...a) { if (a.length === 0) super((fake += 1000)); else super(...a); }
  static now() { return (fake += 1000); }
};
const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, writable: true, value: () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}` });
rng = hashSeed('ranking-532'); fake = new RealDate('2026-01-01T00:00:00.000Z').getTime();

let passed = 0;
const ok = (label, condition, detail = '') => { assert.ok(condition, `FALHOU: ${label} ${detail}`); passed += 1; console.log(`PASS — ${label}`); };
const quiet = (fn) => async (...a) => { const s = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; try { return await fn(...a); } finally { [console.warn, console.log, console.debug, console.error] = s; } };
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');

function memoryBackend() {
  const files = new Map();
  return {
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(a, b) { files.set(b, files.get(a)); return b; },
    async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; },
    async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; },
    getDataDirectoryDescription: () => 'memória',
  };
}

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const load = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await load('/src/storage/GameStorage.js');
  const { CareerRepository } = await load('/src/careers/CareerRepository.js');
  const { CareerManager } = await load('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await load('/src/gameplay/services/runtime.js');
  const { localGame } = await load('/src/api/localGameClient.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await load('/src/game-core/dayAdvanceCoordinator.js');
  const { resetIdCollisionSequence } = await load('/src/gameplay/repositories/CareerEntityRepository.js');
  const { BOTS_BY_DIFFICULTY } = await load('/src/lib/bots.js');
  const { getTeamRankings, getTeamRank, ensurePlayerTeamRanking, teamKey, computeCanonicalTeamRankingPoints } = await load('/src/lib/teamRanking.js');
  const { getTeamRaceRankings } = await load('/src/lib/teamRaceRanking.js');
  const { ensureWorldSeed2025, verifySaveFoundation } = await load('/src/lib/saveFoundation.js');
  const { repairLegacyPlayerPartnerAthlete } = await load('/src/lib/partnerAthlete.js');
  const { buildWorldRankingSnapshot } = await load('/src/lib/padel.js');
  const { startPartnership } = await load('/src/lib/partnershipSystem.js');
  const { teamListPoints, describeRankingPeriod, buildClimbContext } = await load('/src/lib/rankingDisplay.js');
  const page = await load('/src/pages/Ranking.jsx');
  const {
    deriveIndividualLadders, derivePlayerStanding, deriveRaceStanding, deriveTeamStanding, deriveWorldClimb, ladderNeighborsFor, withTeamPosition, TEAM_BOARD_CAP,
    WorldIndividualCard, WorldDoublesCard, RaceIndividualCard, RaceDoublesCard, IndividualList, TeamList, NoPairCard, SegmentedToggle,
  } = page;
  const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
  const noop = () => {};

  // Carreira nova, semeadura do navegador (como test-local-7d).
  resetIdCollisionSequence();
  const manager = new CareerManager(new CareerRepository(new GameStorage(memoryBackend())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ playerName: 'Ranking 532' });
  activeCareerAdapter.setActiveCareer(career);
  const profileId = 'r532-player';
  await activeCareerAdapter.createPlayerProfile({
    id: profileId, sport_name: 'Ranking 532', career_date: '2026-01-05', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle',
    court_side: 'direita', energy: 100, fatigue: 0, coins: 20000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false, country: 'Brasil',
  });
  await quiet(async () => {
    const status = await verifySaveFoundation();
    if (!status.ok) await ensureWorldSeed2025();
    const profile = await localGame.entities.PlayerProfile.get(profileId);
    const resolveTemplate = (id) => { for (const bots of Object.values(BOTS_BY_DIFFICULTY)) { const f = bots?.find((b) => b?.id === id); if (f) return f; } return null; };
    await repairLegacyPlayerPartnerAthlete(profile, resolveTemplate);
  })();
  const getProfile = () => localGame.entities.PlayerProfile.get(profileId);

  // ═══ U. Sem ranking ═══
  {
    const snapshot = await buildWorldRankingSnapshot(await getProfile());
    ok('U0. pré-condição: carreira nova é "sem ranking" pela autoridade', snapshot.unranked === true && snapshot.playerRank > 0,
      `(a autoridade ainda dá ao jogador a posição do fim da fila: #${snapshot.playerRank})`);
    const { circuitAthletes } = deriveIndividualLadders(snapshot);
    const self = circuitAthletes.find((row) => row.is_player_profile);
    ok('U1. a linha do jogador sem ranking não tem posição na escada', self && self.ladder_position === null);
    const { context, playerIndex } = derivePlayerStanding(snapshot, circuitAthletes);
    ok('U2. o contexto do jogador sem ranking tem rank 0 e nenhum vizinho inventado', context.rank === 0 && !context.above && !context.below && playerIndex >= 0);
    const hero = text(render(WorldIndividualCard, { context, rank: null, gapAbove: null, gapBelow: null, partnerName: null, onPartner: noop }));
    ok('U3. o cartão diz "Ainda sem ranking" e não mostra posição numérica nem "#1000+"',
      /Ainda sem ranking/.test(hero) && !/#\s?\d/.test(hero) && !/1000\+/.test(hero), hero);
    ok('U4. o cartão sem ranking diz como entrar (sem dado inventado) e mostra "Sem dupla"', /Dispute torneios oficiais/.test(hero) && /Sem dupla/.test(hero));
    const list = render(IndividualList, { items: circuitAthletes, visibleCount: circuitAthletes.length, onLoadMore: noop, onSelect: noop });
    const selfRow = list.match(/<li[^>]*data-self="true"[^>]*>([\s\S]*?)<\/li>/);
    ok('U5. na escada, a linha "Você" sem ranking mostra "—" no lugar da posição', selfRow && /^—/.test(text(selfRow[1])), selfRow && text(selfRow[1]));
  }

  // ═══ P/H. Jogador com ranking ═══
  let ranked;
  {
    // Um resultado oficial com pontos põe o jogador na escada (a autoridade
    // decide a posição; o teste só lê).
    const before = await buildWorldRankingSnapshot(await getProfile());
    const target = before.entries.filter((e) => !e.isPlayer)[400];
    await localGame.entities.PlayerProfile.update(profileId, { rank_points: target.points, tournaments_played: 1, matches_played: 2 });
    const snapshot = await buildWorldRankingSnapshot(await getProfile());
    ranked = snapshot;
    ok('P0. pré-condição: jogador ranqueado pela autoridade', !snapshot.unranked && snapshot.playerRank > 5);
    const { circuitAthletes } = deriveIndividualLadders(snapshot);
    const { context, playerIndex } = derivePlayerStanding(snapshot, circuitAthletes);
    const above = snapshot.entries[snapshot.playerRank - 2];
    const below = snapshot.entries[snapshot.playerRank];
    ok('P1. posição e pontos do cartão = os do snapshot', context.rank === snapshot.playerRank && context.points === snapshot.playerPoints);
    ok('P2. "acima" é exatamente a entrada anterior do snapshot (nome, posição, pontos)',
      context.above.name === above.name && context.above.rank === above.rank && context.above.points === above.points);
    ok('P3. "abaixo" é exatamente a entrada seguinte do snapshot', context.below.name === below.name && context.below.rank === below.rank);
    // 5.32-A.1 — contexto para subir pela escada da autoridade.
    const climb = deriveWorldClimb(circuitAthletes, playerIndex, true);
    const higher = [...snapshot.entries.slice(0, snapshot.playerRank - 1)].reverse().find((e) => e.points > snapshot.playerPoints);
    ok('C1. alvo para subir = a entrada mais próxima ACIMA com mais pontos (nunca "faltam 0")',
      climb.target && climb.target.name === higher.name && climb.target.rank === higher.rank && climb.target.gap === higher.points - snapshot.playerPoints && climb.target.gap > 0);
    const tiedAbove = above.points === snapshot.playerPoints;
    ok('C2. empate em pontos com quem está acima é reconhecido (posições distintas no individual)',
      tiedAbove ? (climb.tieAbove && climb.tieAbove.rank === above.rank && climb.tieAbove.sharesPosition === false) : climb.tieAbove === null,
      `(acima ${above.points} pts, jogador ${snapshot.playerPoints} pts)`);
    const html = render(WorldIndividualCard, { context, rank: context.rank, climb, partnerName: 'Parceiro Teste', onPartner: noop });
    const t = text(html);
    const gapText = climb.target.gap === 1 ? 'Falta 1 pt' : `Faltam ${fmt(climb.target.gap)} pts`;
    ok('P4. distância real para subir no texto (plural correto, alvo com mais pontos)', t.includes(`${gapText} para #${higher.rank} ${higher.name}`), t);
    ok('C3. empate dito sem ambiguidade: "Mesmos pontos de #N" (sem "empatado com", sem critério inventado)',
      (!tiedAbove || t.includes(`Mesmos pontos de #${above.rank} ${above.name}`)) && !/empatado com|desempate por/i.test(t) && !/Faltam 0/.test(t), t);
    ok('P5. dupla atual aparece no cartão', /Dupla: Parceiro Teste/.test(t));
    const iPos = t.indexOf(`#${context.rank}`);
    const iPts = t.indexOf(`${fmt(context.points)} pts`);
    const iGap = t.search(/Falta|Mesmos pontos/);
    ok('H1. hierarquia: posição → pontos → contexto (ordem no cartão)', iPos >= 0 && iPos < iPts && iPts < iGap, `${iPos} ${iPts} ${iGap}`);
    ok('H2. a posição é o maior texto do cartão (text-4xl)', /text-4xl[^"]*"[^>]*>#\d+</.test(html));
    const neighbors = ladderNeighborsFor(circuitAthletes, playerIndex);
    ok('P6. vizinhos: 2 acima, você, 2 abaixo — na ordem do snapshot',
      neighbors.length === 5 && neighbors[2].isSelf && neighbors.map((n) => n.item.ladder_position).join() === [-2, -1, 0, 1, 2].map((d) => context.rank + d).join());
    ok('P7. sem vizinhança para quem está no topo (o pódio já mostra)', ladderNeighborsFor(circuitAthletes, 2).length === 0);

    // ═══ M. Linha mobile ═══
    const list = render(IndividualList, { items: circuitAthletes, visibleCount: circuitAthletes.length, onLoadMore: noop, onSelect: noop });
    const rows = [...list.matchAll(/<li[^>]*data-ranking-row="athlete"[^>]*>([\s\S]*?)<\/li>/g)];
    const first = text(rows[0][1]);
    const e4 = snapshot.entries[3];
    ok('M1. com pódio, a escada continua do 4º (sem repetir o pódio)', first.startsWith('4 ') || first.startsWith('4'), first);
    ok('M2. linha = posição, nome, país, OVR e pontos', first.includes(e4.name) && first.includes(e4.country || 'Internacional') && /OVR \d+/.test(first) && first.includes(fmt(e4.points)), first);
    const selfRow = list.match(/<li[^>]*data-self="true"[^>]*>([\s\S]*?)<\/li>/);
    ok('M3. a linha do jogador tem a posição real, "Você" e destaque', selfRow && text(selfRow[1]).startsWith(String(snapshot.playerRank)) && /Você/.test(selfRow[1]) && /bg-primary\/10/.test(selfRow[1]));
    ok('M4. nenhuma linha diz "estável" sem dado de variação', !/est[aá]vel/i.test(list));
    ok('M5. o pódio mostra os 3 primeiros com pontos reais (sem "0 pts")', /data-ranking-podium/.test(list) && !/>0 pts</.test(list));
    const podium = text(list.match(/<ol[^>]*data-ranking-podium[\s\S]*?<\/ol>/)[0]);
    ok('M6. pódio em ordem 1-2-3 no DOM (leitor de tela) com os nomes do snapshot',
      podium.indexOf(snapshot.entries[0].name) < podium.indexOf(snapshot.entries[1].name) && podium.indexOf(snapshot.entries[1].name) < podium.indexOf(snapshot.entries[2].name));
  }

  // ═══ R. Race ═══
  {
    const { raceAthletes, raceHasPoints } = deriveIndividualLadders(ranked);
    ok('R0. temporada sem pontos: a escada da Race está vazia (nada de 1…N com 0 pontos)', raceHasPoints === false && raceAthletes.length === 0);
    const raceEmpty = deriveRaceStanding(raceAthletes);
    ok('R1. jogador sem pontos na Race não tem posição na Race', raceEmpty.rank === 0 && raceEmpty.index === -1);
    // Avança o calendário: torneios de IA terminam e distribuem Race real.
    let profile = await getProfile();
    await quiet(async () => {
      for (let day = 0; day < 45; day += 1) {
        await advanceCareerDayOnce(profile); await waitForCareerDaySecondaryWork();
        profile = await getProfile();
        const s = await buildWorldRankingSnapshot(profile);
        if (s.entries.filter((e) => e.racePoints > 0).length >= 8) break;
      }
    })();
    const snapshot = await buildWorldRankingSnapshot(profile);
    const { raceAthletes: race } = deriveIndividualLadders(snapshot);
    ok('R2. após torneios reais, a Race tem quem pontuou', race.length >= 3, `(${race.length} atletas, ${profile.career_date})`);
    ok('R3. escada da Race: só race_points > 0, ordenada, posições 1…N contíguas',
      race.every((r, i) => r.race_points > 0 && r.ladder_position === i + 1 && (i === 0 || race[i - 1].race_points >= r.race_points)));
    ok('R4. a Race lista atletas com race_points do próprio AthleteProfile (sem recálculo)',
      race.every((r) => snapshot.entries.find((e) => e.id === r.id).racePoints === r.race_points));
    const list = render(IndividualList, { items: race, race: true, visibleCount: 50, onLoadMore: noop, onSelect: noop });
    ok('R5. lista da Race rotula "race" e não mostra variação mundial', /race/.test(text(list)) && !/subiu|caiu/.test(list));
    const year = Number(String(profile.career_date).slice(0, 4));
    const card = text(render(RaceIndividualCard, { seasonYear: year, raceRank: 0, racePoints: 0, raceSeason: { tournaments: 0, best: null, last: null }, gapAbove: null, above: null }));
    ok('R6. cartão da Race usa o ano da carreira e não inventa posição sem pontos', card.includes(`Sua temporada ${year}`) && /Ainda sem ranking/.test(card) && !/#\d/.test(card), card);
    ok('R7. micro-explicação da Race traz o ano real', describeRankingPeriod('race', year).includes(String(year)));
    ok('R8. a Race individual explica que as Finals são de duplas do Mundial (sem "Top 8")', /melhores duplas do Mundial de duplas/.test(card) && !/Top\s*8/.test(card));

    // ═══ M7. Variação semanal (após passadas reais do circuito) ═══
    const { circuitAthletes: world } = deriveIndividualLadders(snapshot);
    const worldHtml = render(IndividualList, { items: world, visibleCount: world.length, onLoadMore: noop, onSelect: noop });
    const rowsById = new Map([...worldHtml.matchAll(/<li id="ranking-row-([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[1], m[2]]));
    let checked = 0; let wrong = 0; let moved = 0;
    for (const a of world.slice(3)) {
      const body = rowsById.get(String(a.id));
      if (!body) continue;
      const label = body.match(/aria-label="(subiu|caiu) (\d+)"/);
      const prev = Number(a.ranking_previous_position); const cur = Number(a.ranking_position);
      const expected = prev > 0 && cur > 0 ? prev - cur : 0;
      const shown = label ? (label[1] === 'subiu' ? 1 : -1) * Number(label[2]) : 0;
      checked += 1; if (shown !== expected) wrong += 1; if (expected) moved += 1;
    }
    const offset = world.filter((a) => a.ladder_position && a.ranking_position && a.ladder_position !== a.ranking_position).length;
    console.log(`     [registro] ${checked} linhas, ${moved} com variação real; ${offset} com posição do snapshot ≠ posição do circuito`);
    ok('M7. variação = posição anterior → atual do circuito (nunca contra a posição do snapshot)', checked > 0 && wrong === 0, `${wrong} errada(s)`);
  }

  // ═══ T. Duplas ═══
  {
    // Sem dupla.
    const noPair = text(render(NoPairCard, { title: 'Sem dupla ativa', description: 'Forme uma parceria para aparecer no ranking de duplas.', onFind: noop }));
    ok('T1. estado sem dupla: título, explicação e ação para procurar parceiro', /Sem dupla ativa/.test(noPair) && /Procurar parceiro/.test(noPair));
    const unrankedPair = text(render(WorldDoublesCard, { playerName: 'A', partnerName: 'B', pairRank: { rank: 0, points: 0, unranked: true }, playerPoints: 0, partnerPoints: 0, gapAbove: null, above: null }));
    ok('T2. dupla sem ranking: "Ainda sem ranking", sem posição numérica', /Ainda sem ranking/.test(unrankedPair) && !/#\d/.test(unrankedPair), unrankedPair);

    // Com dupla real.
    const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.elite || [])[0];
    const started = await quiet(async () => startPartnership(await getProfile(), bot, 60, 50))();
    const partnerId = started?.partnership?.partner_bot_id;
    ok('T3. pré-condição: parceria formada', Boolean(partnerId));
    await quiet(async () => ensurePlayerTeamRanking(await getProfile()))();
    const profile = await getProfile();
    const partner = await localGame.entities.AthleteProfile.get(partnerId);
    const rows = withTeamPosition(await getTeamRankings(TEAM_BOARD_CAP), false);
    const key = teamKey(profileId, partnerId);
    const own = rows.find((r) => r.team_key === key);
    const pairRank = await getTeamRank(profile, { id: partnerId });
    ok('T4. posição da linha = ranking_display_position da autoridade; sem pontos não há posição',
      rows.every((r) => (teamListPoints(r) > 0 ? r.ladder_position === r.ranking_display_position : r.ladder_position === null)));
    ok('T5. pontos da dupla do jogador = soma canônica dos membros (sem fórmula nova)',
      own && teamListPoints(own) === computeCanonicalTeamRankingPoints(profile.rank_points, partner.world_ranking_points ?? partner.ranking_points) && pairRank.points === teamListPoints(own),
      `${own && teamListPoints(own)} vs ${pairRank.points}`);
    const standing = deriveTeamStanding(rows, key);
    ok('T6. a dupla do jogador é achada pela chave canônica, na posição da autoridade', standing.index >= 0 && rows[standing.index].ladder_position === pairRank.rank);
    ok('T7. "acima" da dupla é a linha anterior, com os pontos do período Mundial',
      standing.index === 0 ? standing.above === null : standing.above.points === teamListPoints(rows[standing.index - 1]));
    const html = render(TeamList, { items: rows, visibleCount: rows.length, onLoadMore: noop, playerPairKey: key });
    const items = [...html.matchAll(/<li[^>]*data-ranking-row="team"[^>]*data-team-key="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];
    const shown = rows.slice(3);
    ok('T8. cada linha mostra os DOIS membros e os pontos Mundiais', items.every(([, k, body], i) => {
      const r = shown[i]; const t = text(body);
      return r.team_key === k && t.includes(r.player1_name) && t.includes(r.player2_name) && t.includes(fmt(teamListPoints(r)));
    }));
    ok('T9. ids estáveis: data-team-key único por linha', new Set(items.map(([, k]) => k)).size === items.length);
    const selfRows = [...html.matchAll(/<li[^>]*>/g)].map((m) => m[0]).filter((tag) => /data-self="true"/.test(tag)).map((tag) => [tag, tag.match(/data-team-key="([^"]+)"/)?.[1]]);
    ok('T10. exatamente uma linha "Sua dupla", a da chave do jogador', selfRows.length === 1 && selfRows[0][1] === key && /Sua dupla/.test(html));
    ok('T11. nenhuma dupla com "estável" inventado', !/est[aá]vel/i.test(html));
    const ledgerRow = rows.find((r) => r.stats_source === 'ledger' && Number(r.ledger_titles) > 0);
    if (ledgerRow) {
      const body = items.find(([, k]) => k === ledgerRow.team_key)?.[2] || '';
      ok('T12. títulos de dupla vêm do ledger (ledger_titles)', !body || text(body).includes(`${ledgerRow.ledger_titles} título`));
    } else {
      console.log('     (T12 sem dupla com ledger_titles > 0 neste mundo: coberto em test-ranking-ladder-v532)');
    }
    const ranked2 = text(render(WorldDoublesCard, { playerName: 'Ranking 532', partnerName: partner.name, pairRank, playerPoints: profile.rank_points, partnerPoints: partner.world_ranking_points, climb: standing.climb }));
    ok('T13. cartão da dupla: posição canônica e composição com Total', ranked2.includes(`#${pairRank.displayRank || pairRank.rank}`) && /Composição dos pontos/.test(ranked2) && /Total/.test(ranked2));

    // Race de duplas.
    const raceRows = withTeamPosition(await getTeamRaceRankings(TEAM_BOARD_CAP, { profile }), true).filter((r) => r.ladder_position);
    // A escada exibe a posição da AUTORIDADE (ranking_display_position de
    // getTeamRaceRankings), a mesma que getTeamRaceRank dá ao cartão.
    ok('T14. Race de duplas: só quem pontuou; posição = a da autoridade, nunca decrescente',
      raceRows.length > 0 && raceRows[0].ladder_position === 1 && raceRows.every((r, i) => r.race_points > 0
        && r.ladder_position === r.ranking_display_position && (i === 0 || r.ladder_position >= raceRows[i - 1].ladder_position)));
    // Registro (achado, fora do escopo visual): assignTeamRankingPositions
    // agrupa empates por ranking_points (Mundial) também no board da Race.
    const divergent = raceRows.filter((r, i) => i > 0 && r.ladder_position === raceRows[i - 1].ladder_position && r.race_points !== raceRows[i - 1].race_points).length;
    console.log(`     [registro] Race de duplas: ${divergent} empate(s) de posição com race_points diferentes (empate decidido pelo Mundial)`);
    const raceHtml = render(TeamList, { items: raceRows, race: true, visibleCount: 50, onLoadMore: noop, playerPairKey: key, pointsLabel: 'race' });
    const raceItems = [...raceHtml.matchAll(/data-team-key="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];
    ok('T15. a lista da Race exibe race_points (não os pontos mundiais — LOCAL-7D)', raceItems.every(([, k, body]) => {
      const r = raceRows.find((x) => x.team_key === k); return text(body).includes(fmt(r.race_points));
    }));
    const raceCard = text(render(RaceDoublesCard, { playerName: 'A', partnerName: 'B', racePairRank: { rank: 0, points: 0, unranked: true }, playerRacePoints: 0, partnerRacePoints: 0, gapAbove: null, above: null }));
    ok('T16. Race de duplas sem pontos: sem posição, e explica que a vaga nas Finals vem do Mundial', !/#\d/.test(raceCard) && /vem do Mundial de duplas/.test(raceCard));

    // ═══ D. 5.32-A.1 — contexto competitivo das duplas ═══
    const teamPts = (r) => teamListPoints(r);
    const board = withTeamPosition(await getTeamRankings(TEAM_BOARD_CAP), false);
    const w = deriveTeamStanding(board, key);
    const wn = ladderNeighborsFor(board, w.index);
    ok('D1. Mundial de duplas: "Ao seu redor" = 2 acima, a dupla, 2 abaixo, com posições e pontos reais',
      wn.length === 5 && wn[2].isSelf && wn[2].item.team_key === key
        && wn.every((n) => n.item === board[n.index] && n.item.ladder_position === board[n.index].ranking_display_position));
    const ownPts = teamPts(board[w.index]);
    const nearestHigher = [...board.slice(0, w.index)].reverse().find((r) => teamPts(r) > ownPts);
    ok('D2. alvo para subir = a dupla mais próxima com MAIS pontos; nunca "faltam 0"',
      w.climb.target && w.climb.target.rank === nearestHigher.ladder_position && w.climb.target.gap === teamPts(nearestHigher) - ownPts && w.climb.target.gap > 0);
    const prevRow = board[w.index - 1];
    ok('D3. empate em pontos na dupla: posição dividida reconhecida como "Empate em #N"',
      teamPts(prevRow) === ownPts
        ? w.climb.tieAbove?.sharesPosition === (prevRow.ladder_position === board[w.index].ladder_position)
        : w.climb.tieAbove === null);
    const pairCard = text(render(WorldDoublesCard, { playerName: 'Ranking 532', partnerName: partner.name, pairRank, playerPoints: profile.rank_points, partnerPoints: partner.world_ranking_points, climb: w.climb }));
    ok('D4. cartão da dupla: "Faltam N pts para #r" e empate sem ambiguidade',
      pairCard.includes(`${w.climb.target.gap === 1 ? 'Falta 1 pt' : `Faltam ${fmt(w.climb.target.gap)} pts`} para #${w.climb.target.rank}`)
        && (!w.climb.tieAbove?.sharesPosition || pairCard.includes(`Empate em #${w.climb.tieAbove.rank} com`)) && !/lidera/.test(pairCard), pairCard);

    // Homônimas: a escada desambigua por chave, nunca por nome.
    const byNames = new Map();
    for (const r of board) { const n = `${r.player1_name}|${r.player2_name}`; byNames.set(n, (byNames.get(n) || 0) + 1); }
    const sharedMemberName = board.filter((r) => /\s\d+$/.test(r.player1_name) || /\s\d+$/.test(r.player2_name)).length;
    console.log(`     [registro] ${sharedMemberName} duplas com membro de nome desambiguado (sufixo numérico); ${[...byNames.values()].filter((c) => c > 1).length} pares de nomes repetidos`);
    ok('D5. ids estáveis em TODA a escada (inclusive homônimos): team_key único', new Set(board.map((r) => r.team_key)).size === board.length);

    // Dupla fora do Top 600 (o caso #895 da validação manual).
    await localGame.entities.PlayerProfile.update(profileId, { rank_points: 1 });
    await localGame.entities.AthleteProfile.update(partnerId, { world_ranking_points: 1, ranking_points: 1 });
    await quiet(async () => ensurePlayerTeamRanking(await getProfile()))();
    const farRank = await getTeamRank(await getProfile(), { id: partnerId });
    const fullBoard = withTeamPosition(await getTeamRankings(TEAM_BOARD_CAP), false);
    const shortBoard = await getTeamRankings(600);
    const far = deriveTeamStanding(fullBoard, key);
    console.log(`     [registro] dupla rebaixada: #${farRank.rank} de ${fullBoard.length} duplas (${farRank.points} pts)`);
    ok('D6. dupla fora do Top 600: a escada completa a contém na posição de getTeamRank (com 600 ela sumia)',
      farRank.rank > 600 && !shortBoard.some((r) => r.team_key === key) && far.index >= 0 && fullBoard[far.index].ladder_position === farRank.rank,
      `rank ${farRank.rank}`);
    const farNeighbors = ladderNeighborsFor(fullBoard, far.index);
    const farCard = text(render(WorldDoublesCard, { playerName: 'Ranking 532', partnerName: partner.name, pairRank: farRank, playerPoints: 1, partnerPoints: 1, climb: far.climb }));
    ok('D7. fora do Top 600: "Ao seu redor" com vizinhos reais e cartão sem "lidera"',
      farNeighbors.length >= 3 && farNeighbors.some((n) => n.isSelf) && !/lidera/.test(farCard) && /Falta/.test(farCard), farCard);
    const noContext = text(render(WorldDoublesCard, { playerName: 'A', partnerName: 'B', pairRank: { rank: 895, displayRank: '895', points: 30, unranked: false }, playerPoints: 15, partnerPoints: 15, climb: null }));
    ok('D8. dupla ranqueada sem contexto carregado: mostra #895 e não inventa liderança nem distância', /#895/.test(noContext) && !/lidera|Falta|Empate/.test(noContext), noContext);
    const last = buildClimbContext(fullBoard, fullBoard.length - 1, { pointsOf: teamPts });
    ok('D9. dupla no fim da escada: sem linha "abaixo"', last.below === null);
    const first = deriveTeamStanding(fullBoard, fullBoard[0].team_key);
    const firstCard = text(render(WorldDoublesCard, { playerName: 'A', partnerName: 'B', pairRank: { rank: 1, displayRank: '1', points: teamPts(fullBoard[0]), unranked: false }, playerPoints: 0, partnerPoints: 0, climb: first.climb }));
    ok('D10. dupla em 1º: "lidera", sem alvo acima', first.climb.isLeader && !first.climb.target && /Sua dupla lidera o ranking/.test(firstCard));

    // Race de duplas: contexto só com pontos da Race.
    const raceBoard = withTeamPosition(await getTeamRaceRankings(TEAM_BOARD_CAP, { profile: await getProfile() }), true).filter((r) => r.ladder_position);
    const ownRace = deriveTeamStanding(raceBoard, key, { race: true });
    ok('D11. dupla sem pontos na Race: fora da escada da Race e sem contexto', ownRace.index === -1 && ownRace.climb === null);
    const pick = raceBoard.findIndex((r, i) => i > 5 && i < raceBoard.length - 2);
    if (pick > 0) {
      const sample = deriveTeamStanding(raceBoard, raceBoard[pick].team_key, { race: true });
      const higherRace = [...raceBoard.slice(0, pick)].reverse().find((r) => r.race_points > raceBoard[pick].race_points);
      ok('D12. contexto da Race usa só race_points (alvo e distância pela Race, não pelo Mundial)',
        sample.climb.target.rank === higherRace.ladder_position && sample.climb.target.gap === higherRace.race_points - raceBoard[pick].race_points
          && ladderNeighborsFor(raceBoard, pick).every((n) => teamListPoints(n.item, { race: true }) === n.item.race_points));
    } else {
      console.log('     (D12: Race de duplas curta demais neste mundo)');
    }
  }

  // ═══ Navegação ═══
  {
    const html = render(SegmentedToggle, { label: 'Período do ranking', options: [{ key: 'world', label: 'Mundial' }, { key: 'race', label: 'Race' }], value: 'race', onChange: noop });
    const tabs = [...html.matchAll(/role="tab" aria-selected="(true|false)"/g)].map((m) => m[1]);
    ok('N1. alternador acessível: tablist com 2 abas e só a ativa selecionada', /role="tablist"/.test(html) && tabs.join() === 'false,true');
  }

  console.log(`\ntest-ranking-views-v532: ${passed} PASS`);
} finally {
  await vite.close();
}
