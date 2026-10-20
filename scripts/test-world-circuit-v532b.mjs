// Fase 5.32-B — Mundo / Circuito Mundial por COMPORTAMENTO.
//
//   S. seletores puros com dados sintéticos (estados difíceis):
//      posição = a do snapshot (nunca ranking_position gravado), sem ranking
//      sem degrau, World × Race sem mistura, parceria atual pela autoridade
//      de Partnership, campeões só com ids gravados, eventos reais,
//      prioridade do destaque, dados ausentes;
//   R. carreira NOVA real em memória (semeadura do navegador): líderes =
//      os MESMOS que o Ranking 5.32-A deriva; destaque sem resultado
//      inventado; eventos que existem no calendário; links para rotas
//      reais; atleta aposentado sai dos líderes; parceria encerrada é
//      sinalizada sem mudar a posição;
//   A. carreiras da LOCAL-8A (temporadas 1 e 10, se os saves existirem
//      localmente — são artefatos ignorados pelo Git): título recente,
//      líderes = Ranking, parcerias encerradas no topo, leitura de torneios
//      cobre o calendário, custo da derivação com histórico extenso.
// Uso: node scripts/test-world-circuit-v532b.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
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
rng = hashSeed('world-532b'); fake = new RealDate('2026-01-01T00:00:00.000Z').getTime();

// <Link> no SSR avisa que useLayoutEffect não roda no servidor — esperado aqui.
const realConsoleError = console.error;
console.error = (...args) => { if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return; realConsoleError(...args); };

let passed = 0;
let skipped = 0;
const ok = (label, condition, detail = '') => { assert.ok(condition, `FALHOU: ${label} ${detail}`); passed += 1; console.log(`PASS — ${label}`); };
const quiet = (fn) => async (...a) => { const s = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; try { return await fn(...a); } finally { [console.warn, console.log, console.debug, console.error] = s; } };
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

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

// Rotas reais do app (App.jsx) — todo link da tela tem de cair numa delas.
const APP = readFileSync('src/App.jsx', 'utf8');
const ROUTES = new Set([...APP.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]));
const routeExists = (href) => ROUTES.has(href.split('?')[0]);

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const load = (p) => vite.ssrLoadModule(p);
  const W = await load('/src/lib/worldCircuitDisplay.js');
  const { resolveRankingView } = await load('/src/lib/rankingDisplay.js');
  const { CircuitHero, CircuitLeaders, MajorEvents, ExploreCircuit, EXPLORE, readWorldCircuit } = await load('/src/pages/WorldHub.jsx');
  const { deriveIndividualLadders, withTeamPosition, TEAM_BOARD_CAP } = await load('/src/pages/Ranking.jsx');
  const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Component, props)));
  const renderModel = (model, careerDate, seasonYear) => ({
    hero: render(CircuitHero, { highlight: model.highlight, careerDate }),
    leaders: render(CircuitLeaders, { worldTop: model.worldTop, doublesTop: model.doublesTop, raceTop: model.raceTop, seasonYear, rankingAvailable: model.rankingAvailable, doublesAvailable: model.doublesAvailable }),
    events: render(MajorEvents, { upcoming: model.upcoming, champions: model.champions, careerDate, available: model.tournamentsAvailable }),
  });

  // ═══ S. Seletores puros ═══════════════════════════════════════════════
  {
    const entry = (id, rank, points, extra = {}) => ({ id, name: `A${id}`, rank, points, racePoints: 0, country: 'Espanha', raw: { ranking_position: 999 }, ...extra });
    const snapshot = { unranked: false, entries: [entry('a', 1, 900), entry('b', 2, 800, { racePoints: 50 }), entry('c', 3, 700, { racePoints: 300 }), entry('d', 4, 0)] };
    const top = W.selectWorldIndividualTop(snapshot, 5);
    ok('S1. posição exibida = a do snapshot (o ranking_position gravado, 999, é ignorado)', top.map((r) => r.rank).join() === '1,2,3' && top.every((r) => r.rank !== 999));
    ok('S2. sem pontos não há degrau (o #4 com 0 pts fica fora)', top.length === 3);
    const unrankedPlayer = { unranked: true, entries: [entry('p', 1, 50, { isPlayer: true }), entry('a', 2, 40)] };
    ok('S3. jogador "sem ranking" pela autoridade não ocupa o topo', W.selectWorldIndividualTop(unrankedPlayer, 3).map((r) => r.id).join() === 'a');
    const race = W.selectRaceIndividualTop(snapshot, 3);
    ok('S4. Race ordena por pontos da Race e só com quem pontuou', race.map((r) => `${r.id}:${r.rank}:${r.points}`).join() === 'c:1:300,b:2:50');
    ok('S5. Mundial exibe pontos mundiais, Race exibe pontos da Race (sem mistura)', top.find((r) => r.id === 'c').points === 700 && race.find((r) => r.id === 'c').points === 300);

    const teams = [
      { team_key: 'x', player1_id: 'a', player1_name: 'Ana', player2_id: 'b', player2_name: 'Bia', ranking_points: 500, race_points: 9999, ranking_display_position: 1, stats_source: 'ledger', wins: 5, losses: 1, ledger_titles: 2 },
      { team_key: 'y', player1_id: 'c', player1_name: 'Caio', player2_id: 'd', player2_name: 'Davi', ranking_points: 400, ranking_display_position: 2 },
      { team_key: 'z', player1_id: 'me', player1_name: 'Eu', player2_id: 'e', player2_name: 'Eva', ranking_points: 300, ranking_display_position: 3 },
      { team_key: 'w', player1_id: 'f', player1_name: 'Fê', player2_id: 'g', player2_name: 'Gil', ranking_points: 0, ranking_display_position: 4 },
    ];
    // Atletas como o motor de IA os deixa: a/b juntos; c/d desfeitos
    // (dissolvePartnerships zera ai_partner_id); e/f com f aposentado.
    const pairAthletes = [
      { id: 'a', ai_partner_id: 'b' }, { id: 'b', ai_partner_id: 'a' },
      { id: 'c', ai_partner_id: null, ai_partnership_status: 'encerrada' }, { id: 'd', ai_partner_id: null },
      { id: 'e', ai_partner_id: 'f' }, { id: 'f', ai_partner_id: 'e', career_status: 'aposentado' },
    ];
    const ctx = (extra = {}) => ({ athletesById: new Map(pairAthletes.map((x) => [x.id, x])), playerId: 'me', playerPartnerId: 'e', ...extra });
    const pairs = W.selectWorldDoublesTop(teams, ctx(), 5);
    ok('S6. duplas: posição = ranking_display_position da autoridade, sem 0 pts', pairs.map((p) => p.rank).join() === '1,2,3');
    ok('S7. duplas: pontos mundiais (ranking_points), nunca race_points', pairs[0].points === 500);
    ok('S8. parceria atual pela fonte do motor (ai_partner_id mútuo); desfeita → false', pairs[0].current === true && pairs[1].current === false);
    ok('S9. dupla do jogador: atual pelo parceiro da Partnership ativa dele, marcada "sua dupla"', pairs[2].current === true && pairs[2].isPlayerPair === true && !pairs[0].isPlayerPair);
    ok('S10. identidade da dupla pelos ids dos dois membros', pairs[0].members.map((m) => m.id).join() === 'a,b');
    ok('S11. sem como confirmar, nada é afirmado (current = null)',
      W.selectWorldDoublesTop(teams, { athletesById: null }, 1)[0].current === null
      && W.resolvePairCurrent(['a', 'zz'], ctx()) === null
      && W.resolvePairCurrent(['me', 'e'], ctx({ playerPartnerId: undefined })) === null);
    ok('S11b. membro aposentado: a dupla não é atual mesmo com ai_partner_id mútuo', W.resolvePairCurrent(['e', 'f'], ctx()) === false);
    ok('S11c. jogador sem dupla / com outro parceiro: a dupla antiga dele não é atual',
      W.resolvePairCurrent(['me', 'e'], ctx({ playerPartnerId: null })) === false && W.resolvePairCurrent(['me', 'e'], ctx({ playerPartnerId: 'x' })) === false);
    ok('S12. V/D/títulos só do ledger (LOCAL-7H); sem ledger → null', pairs[0].record?.titles === 2 && pairs[1].record === null);

    const T = (id, extra) => ({ id, name: id, tier: 'Masters', circuit_level: 5, world_tour_event: true, start_date: '2030-03-01', end_date: '2030-03-05', status: 'finalizado', ...extra });
    const tournaments = [
      T('old-crown', { tier: 'Crown', circuit_level: 7, end_date: '2030-01-10', start_date: '2030-01-03', champion_athlete_ids: ['a', 'b'], champion_athlete_names: ['Ana', 'Bia'] }),
      T('recent', { end_date: '2030-03-05', champion_athlete_ids: ['c', 'd'], champion_athlete_names: ['Caio', 'Davi'], runner_up_athlete_ids: ['a', 'b'], runner_up_athlete_names: ['Ana', 'Bia'] }),
      T('one-id', { end_date: '2030-03-06', champion_athlete_ids: ['c'], champion_athlete_names: ['Caio'] }),
      T('bronze', { tier: 'Bronze', circuit_level: 0, end_date: '2030-03-07', champion_athlete_ids: ['a', 'b'] }),
      T('exhibition', { tier: 'Exibição', circuit_level: -1, is_exhibition: true, end_date: '2030-03-07', champion_athlete_ids: ['a', 'b'] }),
      T('future-champ', { end_date: '2030-03-20', champion_athlete_ids: ['a', 'b'] }),
      T('live', { start_date: '2030-03-08', end_date: '2030-03-12', status: 'em_andamento' }),
      T('open', { tier: 'Elite', circuit_level: 6, start_date: '2030-03-25', end_date: '2030-03-30', status: 'inscricoes' }),
      T('cancelled', { start_date: '2030-03-15', end_date: '2030-03-18', status: 'cancelado' }),
      T('far', { start_date: '2030-06-01', end_date: '2030-06-05', status: 'inscricoes' }),
      T('silver-next', { tier: 'Silver', circuit_level: 1, start_date: '2030-03-09', end_date: '2030-03-12', status: 'inscricoes' }),
    ];
    const date = '2030-03-10';
    const champs = W.selectRecentMajorChampions(tournaments, date, 5);
    ok('S13. campeões: só torneio resolvido com os DOIS ids gravados, oficial, grande evento, já encerrado',
      champs.map((c) => c.id).join() === 'recent,old-crown', champs.map((c) => c.id).join());
    ok('S14. campeões preservam ids e nomes gravados (sem dedução por notícia)', champs[0].champions.map((m) => `${m.id}:${m.name}`).join() === 'c:Caio,d:Davi' && champs[0].runnersUp.length === 2);
    const upcoming = W.selectUpcomingMajorEvents(tournaments, date, 5);
    ok('S15. próximos: grandes eventos não encerrados/cancelados, em ordem de data, com o que está em curso',
      upcoming.map((e) => `${e.id}:${e.status}`).join() === 'live:live,open:open,far:soon', upcoming.map((e) => `${e.id}:${e.status}`).join());
    ok('S16. "Em N dias" vem das datas do calendário', upcoming[2].daysUntil === W.daysBetween(date, '2030-06-01') && W.untilLabel(upcoming[2].daysUntil) === `Em ${upcoming[2].daysUntil} dias`);

    const leader = top[0];
    ok('S17. destaque 1: título de grande evento recente', W.selectCircuitHighlight({ champions: champs, upcoming, leader }).kind === 'champion');
    const stale = champs.map((c) => ({ ...c, daysAgo: W.RECENT_CHAMPION_WINDOW_DAYS + 1 }));
    ok('S18. destaque 2: título antigo não é manchete; evento em curso é', W.selectCircuitHighlight({ champions: stale, upcoming, leader }).kind === 'live');
    ok('S19. destaque 3: sem título recente nem evento em curso → número 1 do mundo', W.selectCircuitHighlight({ champions: [], upcoming: upcoming.slice(1), leader }).kind === 'leader');
    ok('S20. destaque 4: sem líder → próximo grande evento; sem nada → null', W.selectCircuitHighlight({ upcoming: upcoming.slice(1) }).kind === 'next' && W.selectCircuitHighlight({}) === null);

    const empty = W.buildWorldCircuitModel({});
    ok('S21. dados ausentes: autoridades indisponíveis são declaradas, nada é preenchido', !empty.rankingAvailable && !empty.doublesAvailable && !empty.tournamentsAvailable && empty.highlight === null && empty.worldTop.length === 0);
    const html = renderModel(empty, '2030-03-10', 2030);
    ok('S22. destaque vazio mostra exploração com link real', /ainda não tem destaques/.test(text(html.hero)) && hrefs(html.hero).every(routeExists));
    ok('S23. líderes indisponíveis dizem "indisponível" (não "ninguém pontuou")', (text(html.leaders).match(/indisponível/g) || []).length === 3);
    ok('S24. eventos indisponíveis dizem "indisponível"', (text(html.events).match(/indisponíve/g) || []).length === 2);
    const emptyButAvailable = renderModel(W.buildWorldCircuitModel({ ranking: { entries: [] }, teams: [], pairAthletes: [], tournaments: [] }), '2030-03-10', 2030);
    ok('S25. vazio real (sem pontos) diz isso sem número inventado', /Ninguém pontuou no ranking mundial/.test(text(emptyButAvailable.leaders)) && !/#\d/.test(text(emptyButAvailable.leaders)));

    const synthetic = renderModel(W.buildWorldCircuitModel({ ranking: snapshot, teams, pairAthletes, playerPartnerId: 'e', tournaments, careerDate: date, playerId: 'me' }), date, 2030);
    ok('S26. dupla encerrada é sinalizada na linha (sem sair da posição)', /2 Caio & Davi Encerrada/.test(text(synthetic.leaders)), text(synthetic.leaders));
    ok('S27. etiqueta "Encerrada" fica fora do nome truncado', /<span class="min-w-0 truncate font-semibold">Caio &amp; Davi<\/span><span[^>]*data-pair-current="false"/.test(synthetic.leaders));
    ok('S28. "Sua dupla" marcada na linha do jogador', /Eu & Eva Sua dupla/.test(text(synthetic.leaders)));
  }

  // ═══ R. Carreira nova real ═══════════════════════════════════════════════
  const { GameStorage } = await load('/src/storage/GameStorage.js');
  const { CareerRepository } = await load('/src/careers/CareerRepository.js');
  const { CareerManager } = await load('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await load('/src/gameplay/services/runtime.js');
  const { localGame } = await load('/src/api/localGameClient.js');
  const { resetIdCollisionSequence } = await load('/src/gameplay/repositories/CareerEntityRepository.js');
  const { BOTS_BY_DIFFICULTY } = await load('/src/lib/bots.js');
  const { getTeamRankings } = await load('/src/lib/teamRanking.js');
  const { ensureWorldSeed2025, verifySaveFoundation } = await load('/src/lib/saveFoundation.js');
  const { repairLegacyPlayerPartnerAthlete } = await load('/src/lib/partnerAthlete.js');
  const { buildWorldRankingSnapshot } = await load('/src/lib/padel.js');

  // Exatamente as leituras do WorldHub (load() → readWorldCircuit).
  const readWorld = (profile) => readWorldCircuit(profile);
  // O que o Ranking 5.32-A mostraria nos mesmos degraus.
  const rankingLadders = async (profile) => {
    const snapshot = await buildWorldRankingSnapshot(profile);
    const { circuitAthletes, raceAthletes } = deriveIndividualLadders(snapshot);
    const teams = withTeamPosition(await getTeamRankings(TEAM_BOARD_CAP), false);
    return {
      world: circuitAthletes.filter((r) => r.ladder_position).slice(0, 3).map((r) => `${r.id}#${r.ladder_position}:${r.world_ranking_points}`),
      race: raceAthletes.slice(0, 3).map((r) => `${r.id}#${r.ladder_position}:${r.race_points}`),
      teams: teams.filter((r) => r.ladder_position).slice(0, 3).map((r) => `${r.team_key}#${r.ladder_position}:${r.ranking_points}`),
    };
  };
  const worldKeys = (model) => ({
    world: model.worldTop.map((r) => `${r.id}#${r.rank}:${r.points}`),
    race: model.raceTop.map((r) => `${r.id}#${r.rank}:${r.points}`),
    teams: model.doublesTop.map((r) => `${r.key}#${r.rank}:${r.points}`),
  });

  {
    resetIdCollisionSequence();
    const manager = new CareerManager(new CareerRepository(new GameStorage(memoryBackend())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ playerName: 'Mundo 532B' });
    activeCareerAdapter.setActiveCareer(career);
    const profileId = 'w532-player';
    await activeCareerAdapter.createPlayerProfile({
      id: profileId, sport_name: 'Mundo 532B', career_date: '2026-01-05', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle',
      court_side: 'direita', energy: 100, fatigue: 0, coins: 20000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false, country: 'Brasil',
    });
    await quiet(async () => {
      const status = await verifySaveFoundation();
      if (!status.ok) await ensureWorldSeed2025();
      const profile = await localGame.entities.PlayerProfile.get(profileId);
      const resolveTemplate = (id) => { for (const bots of Object.values(BOTS_BY_DIFFICULTY)) { const f = bots?.find((b) => b?.id === id); if (f) return f; } return null; };
      await repairLegacyPlayerPartnerAthlete(profile, resolveTemplate);
    })();
    const profile = await localGame.entities.PlayerProfile.get(profileId);
    const reads = await readWorld(profile);
    const model = W.buildWorldCircuitModel(reads);
    const ladders = await rankingLadders(profile);
    const mine = worldKeys(model);
    ok('R1. carreira nova: líder e top 3 mundial = a escada do Ranking 5.32-A', mine.world.length === 3 && mine.world.join() === ladders.world.join(), `${mine.world} vs ${ladders.world}`);
    ok('R2. carreira nova: top 3 de duplas = a escada de duplas do Ranking (mesma posição e pontos)', mine.teams.length === 3 && mine.teams.join() === ladders.teams.join(), `${mine.teams} vs ${ladders.teams}`);
    ok('R3. carreira nova: Race = a escada da Race do Ranking (vazia antes do primeiro torneio)', mine.race.join() === ladders.race.join());
    ok('R4. carreira nova: nenhum campeão inventado (nenhuma final disputada)', model.champions.length === 0);
    ok('R5. carreira nova: destaque = número 1 do mundo (fato, não resultado)', model.highlight?.kind === 'leader' && model.highlight.leader.id === model.worldTop[0].id);
    const all = await localGame.entities.Tournament.list('-start_date', 5000);
    const byId = new Map(all.map((t) => [t.id, t]));
    ok('R6. próximos grandes eventos existem no calendário, são futuros e Platinum+',
      model.upcoming.length > 0 && model.upcoming.every((e) => byId.has(e.id) && byId.get(e.id).start_date === e.startDate && e.endDate >= profile.career_date && e.level >= W.MAJOR_EVENT_LEVEL));
    const html = renderModel(model, profile.career_date, 2026);
    const links = [...hrefs(html.hero), ...hrefs(html.leaders), ...hrefs(html.events), ...hrefs(render(ExploreCircuit))];
    ok('R7. todo link da tela cai numa rota real do app', links.length >= 10 && links.every(routeExists), links.filter((l) => !routeExists(l)).join());
    const rankingLinks = links.filter((l) => l.startsWith('/ranking?scope='));
    ok('R8. links do ranking abrem a view certa (scope/type entendidos pelo Ranking)', rankingLinks.length >= 4 && rankingLinks.every((l) => {
      const p = new URLSearchParams(l.split('?')[1]);
      const v = resolveRankingView(p);
      return v.scope === p.get('scope') && v.type === p.get('type') && !v.legacy;
    }));
    ok('R9. links de torneio apontam para torneios que existem', links.filter((l) => l.startsWith('/tournaments?tournament=')).every((l) => byId.has(decodeURIComponent(l.split('=')[1]))));
    ok('R10. atalhos de exploração: 6 destinos, todos rotas reais', EXPLORE.length === 6 && EXPLORE.every((e) => routeExists(e.to)));
    const heroText = text(html.hero);
    ok('R11. destaque do líder mostra nome e pontos mundiais do snapshot', heroText.includes(model.worldTop[0].name) && heroText.includes(W.formatPts(model.worldTop[0].points)));

    // Atleta aposentado: sai dos líderes e do Ranking ao mesmo tempo.
    const leaderId = model.worldTop[0].id;
    await localGame.entities.AthleteProfile.update(leaderId, { career_status: 'aposentado', retired: true });
    const afterRetire = W.buildWorldCircuitModel(await readWorld(profile));
    const laddersAfter = await rankingLadders(profile);
    ok('R12. atleta aposentado sai do topo do Mundo', !afterRetire.worldTop.some((r) => r.id === leaderId));
    ok('R13. depois da aposentadoria, Mundo e Ranking seguem iguais', worldKeys(afterRetire).world.join() === laddersAfter.world.join());
    const retiredPair = afterRetire.doublesTop.find((p) => p.members.some((m) => m.id === leaderId));
    ok('R13b. a dupla do aposentado continua na escada de duplas (pontos na janela), sinalizada como não atual',
      !retiredPair || retiredPair.current === false, retiredPair ? `${W.pairLabel(retiredPair.members)}:${retiredPair.current}` : '');

    // Carreira nova: as duplas reais semeadas jogam juntas (sem linha de
    // Partnership ainda) — nenhuma pode aparecer como "encerrada".
    const fresh = W.buildWorldCircuitModel(reads);
    ok('R14. carreira nova: as duplas do topo aparecem como atuais (nenhuma "encerrada" falsa)', fresh.doublesTop.every((p) => p.current === true), fresh.doublesTop.map((p) => `${W.pairLabel(p.members)}:${p.current}`).join());
    // Parceria desfeita com os MESMOS campos que dissolvePartnerships grava:
    // a dupla segue na posição (TeamRanking intacto) e é sinalizada.
    const lead = afterRetire.doublesTop.find((p) => p.current === true);
    for (const member of lead.members) {
      await localGame.entities.AthleteProfile.update(member.id, { ai_partner_id: null, ai_partner_name: null, ai_partnership_status: 'encerrada', ai_partnership_end_date: profile.career_date, market_status: 'livre' });
    }
    const ended = W.buildWorldCircuitModel(await readWorld(profile));
    const endedRow = ended.doublesTop.find((p) => p.key === lead.key);
    ok('R15. parceria desfeita: a dupla mantém posição e pontos', endedRow && endedRow.rank === lead.rank && endedRow.points === lead.points);
    ok('R16. parceria desfeita: marcada como não atual e exibida como encerrada', endedRow.current === false
      && /Encerrada|Parceria encerrada/.test(text(renderModel(ended, profile.career_date, 2026).leaders)));
  }

  // ═══ A. Carreiras longas (LOCAL-8A) ═══════════════════════════════════════
  const SAVES = [
    ['A1', 'reports/local-8a-career-audit/run10/save-season-1.json'],
    ['A10', 'reports/local-8a-career-audit/run10/save-season-10.json'],
  ];
  for (const [tag, file] of SAVES) {
    if (!existsSync(file)) { skipped += 1; console.log(`SKIP — ${tag}: ${file} ausente (artefato local da LOCAL-8A)`); continue; }
    resetIdCollisionSequence();
    const manager = new CareerManager(new CareerRepository(new GameStorage(memoryBackend())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const data = JSON.parse(readFileSync(file, 'utf8'));
    await quiet(async () => {
      await manager.importCareer(data);
      activeCareerAdapter.setActiveCareer(await manager.loadCareer(data.career_id));
    })();
    const profile = await localGame.entities.PlayerProfile.get(data.player.id);
    const reads = await readWorld(profile);
    const t0 = performance.now();
    const model = W.buildWorldCircuitModel(reads);
    const deriveMs = performance.now() - t0;
    const ladders = await rankingLadders(profile);
    const mine = worldKeys(model);
    ok(`${tag}.1 líderes Mundial = Ranking 5.32-A`, mine.world.length === 3 && mine.world.join() === ladders.world.join(), `${mine.world} vs ${ladders.world}`);
    ok(`${tag}.2 duplas = Ranking 5.32-A (leitura curta, mesmas posições da população inteira)`, mine.teams.join() === ladders.teams.join(), `${mine.teams} vs ${ladders.teams}`);
    ok(`${tag}.3 Race = Ranking 5.32-A`, mine.race.join() === ladders.race.join());
    // Posições exibidas ≠ ranking_position gravado? (a divergência conhecida)
    const raw = new Map(reads.ranking.entries.map((e) => [e.id, Number(e.raw?.ranking_position) || null]));
    const divergent = model.worldTop.filter((r) => raw.get(r.id) !== r.rank).length;
    console.log(`  ${tag}: ranking_position gravado diverge da posição exibida em ${divergent}/3 do topo (a tela usa o snapshot)`);
    ok(`${tag}.4 posições exibidas vêm do snapshot (1..3, sem buracos)`, model.worldTop.map((r) => r.rank).join() === '1,2,3' || model.worldTop.every((r, i) => r.rank <= i + 1));
    // Parceria atual: testemunha independente — a linha canônica de
    // Partnership 'ativa' (existe nas carreiras que já rodaram o mercado).
    const activeKeys = new Set((await localGame.entities.Partnership.filter({ status: 'ativa' }))
      .map((p) => [...(p.athlete_ids || [p.athlete_a_id || p.profile_id, p.athlete_b_id || p.partner_bot_id])].sort().join()));
    const witness = (p) => activeKeys.has(p.members.map((m) => m.id).sort().join());
    ok(`${tag}.5 "parceria atual" bate com a Partnership ativa (testemunha independente)`, model.doublesTop.every((p) => p.current === witness(p)), model.doublesTop.map((p) => `${p.current}/${witness(p)}`).join());
    // Torneios: a leitura de 400 cobre o calendário futuro inteiro.
    const all = await localGame.entities.Tournament.list('-start_date', 5000);
    const full = W.buildWorldCircuitModel({ ...reads, tournaments: all });
    ok(`${tag}.6 leitura de torneios (400) = calendário inteiro para próximos e campeões`, JSON.stringify(full.upcoming) === JSON.stringify(model.upcoming) && JSON.stringify(full.champions) === JSON.stringify(model.champions));
    const byId = new Map(all.map((t) => [t.id, t]));
    ok(`${tag}.7 campeões = registro do torneio (ids e nomes gravados, já encerrado)`, model.champions.length > 0 && model.champions.every((c) => {
      const t = byId.get(c.id);
      return t && c.champions.map((m) => m.id).join() === t.champion_athlete_ids.join() && c.champions.map((m) => m.name).join() === t.champion_athlete_names.join() && c.date <= profile.career_date;
    }));
    const lastMajor = all.filter((t) => t.champion_athlete_ids?.length === 2 && W.tournamentLevel(t) >= W.MAJOR_EVENT_LEVEL && t.end_date <= profile.career_date)
      .sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
    const expectedHero = W.daysBetween(lastMajor.end_date, profile.career_date) <= W.RECENT_CHAMPION_WINDOW_DAYS ? 'champion' : null;
    ok(`${tag}.8 destaque coerente com o calendário (${expectedHero || 'sem título recente'})`, expectedHero ? model.highlight.kind === 'champion' && model.highlight.champion.id === lastMajor.id : model.highlight.kind !== 'champion');
    const html = renderModel(model, profile.career_date, Number(profile.career_date.slice(0, 4)));
    ok(`${tag}.9 render com histórico extenso: todos os links válidos`, [...hrefs(html.hero), ...hrefs(html.leaders), ...hrefs(html.events)].every(routeExists));
    const endedInTop = model.doublesTop.filter((p) => p.current === false).length;
    ok(`${tag}.10 parcerias encerradas no topo são sinalizadas (${endedInTop})`, (text(html.leaders).match(/Encerrada|Parceria encerrada/g) || []).length === endedInTop);
    ok(`${tag}.11 derivação do modelo é barata com histórico extenso (${deriveMs.toFixed(1)} ms < 50)`, deriveMs < 50);
  }

  console.log(`test-world-circuit-v532b: ${passed} PASS${skipped ? ` · ${skipped} SKIP` : ''}`);
} finally {
  await vite.close();
}
