// Auditoria — Atletas reais vs. bots no ecossistema do jogo (FASE 2).
//
// Harness PERMANENTE: roda a pipeline REAL de produção (sem reimplementar
// nada) por N temporadas simuladas, sem nenhuma intervenção de jogador, e
// mede quantitativamente quem realmente disputa e vence os torneios do
// World Tour em segundo plano. Também amostra o catálogo de adversários
// usado nas partidas do PRÓPRIO jogador (pool separado, ver relatório) para
// medir a diluição de atletas reais nele.
//
// Uso: node scripts/audit-real-athletes-simulation.mjs [--seasons=5]
//
// Saída: reports/real-athletes-audit/summary.json (+ .md) e
// reports/real-athletes-audit/tournament-results.csv.
//
// NÃO altera nenhuma lógica de jogo — só chama funções de produção já
// existentes e relata o que elas produzem.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import worldSeed from '../src/data/worldSeed2025.json' with { type: 'json' };

const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const SEASONS = Math.max(1, Number(args.seasons || 5));
const START_YEAR = 2026;
const OUT_DIR = 'reports/real-athletes-audit';
// A camada de storage da carreira clona o blob inteiro a cada leitura/escrita
// de entidade — em escala de produção (1000 atletas, 500 duplas) uma
// temporada simulada levou ~4 minutos, tornando 5 temporadas impraticáveis
// para um harness que deve ser reexecutado a cada mudança de balanço. Reduz
// a população PROCEDURAL (mesma fórmula de rankingPopulation.js, só um
// corte menor da mesma curva por rank) e aumenta o passo de avanço de
// calendário — resolveCompletedWorldTourEvents é idempotente e agrupa por
// (ano, semana) internamente, então um passo maior não perde nenhum torneio
// concluído, só agrupa mais resoluções por chamada. Nenhuma lógica de jogo
// muda; só o TAMANHO DA AMOSTRA desta bateria específica.
const PROCEDURAL_ATHLETE_SAMPLE = Math.max(1, Number(args.proceduralAthletes || 220));
const PROCEDURAL_TEAM_SAMPLE = Math.max(1, Number(args.proceduralTeams || 110));
const STEP_DAYS = Math.max(1, Number(args.stepDays || 14));

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async ensureDirectory(p) { this.directories.add(p); return true; }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { return this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); return d; }
  async copy(s, d) { this.files.set(d, this.files.get(s)); return d; }
  async list(dir = '.') { return [...this.files.keys()]; }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { buildSupplementalRankingPopulation } = await vite.ssrLoadModule('/src/lib/rankingPopulation.js');
  const { buildSeasonTournaments } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const { resolveCompletedWorldTourEvents } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const { processAiPartnershipMarket } = await vite.ssrLoadModule('/src/game-core/aiPartnershipLifecycle.js');
  const { generateTournamentOpponent, getTournamentDifficulty } = await vite.ssrLoadModule('/src/lib/career.js');
  const { BOTS_BY_DIFFICULTY, BOT_DIFFICULTIES } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { getRealAthletes } = await vite.ssrLoadModule('/src/players/realAthletes.js');

  // ═══════════════ Setup: carreira sintética só para ter storage/entities ═══════════════
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'world-sim' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'world-sim-player', sport_name: 'World Sim', career_date: `${START_YEAR}-01-01`, birth_date: '2000-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
    tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });
  const profile = await localGame.entities.PlayerProfile.get('world-sim-player');

  // ═══════════════ Seed: exatamente o pipeline de produção (saveFoundation.js), sem o window.dispatchEvent ═══════════════
  const realAthleteIds = new Set();
  const realTeamKeys = new Set();
  for (const athlete of worldSeed.athletes) {
    await localGame.entities.AthleteProfile.create({ ...athlete, id: athlete.bot_id });
    realAthleteIds.add(athlete.bot_id);
  }
  for (const team of worldSeed.teams) {
    await localGame.entities.TeamRanking.create({ ...team, id: team.team_key });
    realTeamKeys.add(team.team_key);
  }
  const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const seededTeams = await localGame.entities.TeamRanking.list('-ranking_points', 600);
  const supplementalFull = buildSupplementalRankingPopulation(seededAthletes, seededTeams);
  // Amostra: os primeiros N por rank da MESMA curva de produção (não uma
  // população paralela) — ver nota de performance acima.
  const supplemental = {
    athletes: supplementalFull.athletes.slice(0, PROCEDURAL_ATHLETE_SAMPLE),
    teams: supplementalFull.teams.slice(0, PROCEDURAL_TEAM_SAMPLE),
  };
  await localGame.entities.AthleteProfile.bulkCreate(supplemental.athletes);
  await localGame.entities.TeamRanking.bulkCreate(supplemental.teams);
  const totalAthletes = seededAthletes.length + supplemental.athletes.length;
  const totalTeams = seededTeams.length + supplemental.teams.length;

  console.log(`Elenco: ${realAthleteIds.size} atletas reais + ${supplemental.athletes.length} bots procedurais (amostra de ${supplementalFull.athletes.length} gerados pela fórmula de produção) = ${totalAthletes} atletas.`);
  console.log(`Duplas: ${realTeamKeys.size} reais + ${supplemental.teams.length} bots = ${totalTeams} duplas.`);

  // ═══════════════ FASE 2a: simulação de mundo — 5 temporadas, sem o jogador ═══════════════
  const tournamentResults = [];
  const seasonSnapshots = [];
  const coelloTapiaSamples = [];
  const galanChingottoSamples = [];
  const realAthleteById = new Map(worldSeed.athletes.map((a) => [a.bot_id, a]));

  let cursor = `${START_YEAR}-01-01`;
  for (let yearIndex = 0; yearIndex < SEASONS; yearIndex += 1) {
    const year = START_YEAR + yearIndex;
    const seasonTournaments = buildSeasonTournaments(year, `season-${year}`);
    // A criação da carreira sintética já popula um calendário de demonstração
    // (localSeed.js) que pode colidir por id com o calendário real gerado
    // aqui para o mesmo ano — evita duplicar, sem alterar nenhum torneio já
    // existente.
    const existingIds = new Set((await localGame.entities.Tournament.list('-start_date', 2000)).map((t) => t.id));
    const newTournaments = seasonTournaments.filter((t) => !existingIds.has(t.id));
    if (newTournaments.length) await localGame.entities.Tournament.bulkCreate(newTournaments);

    let lastMonth = cursor.slice(0, 7);
    const stepsPerYear = Math.ceil(366 / STEP_DAYS) + 1;
    for (let step = 1; step <= stepsPerYear; step += 1) {
      const previousCursor = cursor;
      cursor = addDays(cursor, STEP_DAYS);
      if (cursor.slice(0, 4) !== String(year) && step > Math.floor(340 / STEP_DAYS)) break;

      await processAiPartnershipMarket(profile, previousCursor, cursor).catch(() => {});
      const resolution = await resolveCompletedWorldTourEvents(cursor).catch(() => null);
      if (resolution?.tournaments?.length) {
        for (const tournament of resolution.tournaments) {
          const [championPartnership, runnerUpPartnership] = await Promise.all([
            tournament.champion_partnership_id ? localGame.entities.Partnership.get(tournament.champion_partnership_id).catch(() => null) : null,
            tournament.runner_up_partnership_id ? localGame.entities.Partnership.get(tournament.runner_up_partnership_id).catch(() => null) : null,
          ]);
          const championIds = championPartnership ? [championPartnership.athlete_a_id, championPartnership.athlete_b_id] : [];
          const championRealCount = championIds.filter((id) => realAthleteIds.has(id)).length;
          tournamentResults.push({
            year, tournament_id: tournament.id, champion_name: tournament.champion,
            champion_ids: championIds.join('|'), champion_real_count: championRealCount,
            classification: championIds.length === 0 ? 'desconhecido' : championRealCount === 2 ? '100%_reais' : championRealCount === 1 ? 'mista' : '100%_bots',
          });
        }
      }

      const currentMonth = cursor.slice(0, 7);
      if (currentMonth !== lastMonth) {
        lastMonth = currentMonth;
        const [coello, tapia, galan, chingotto] = await Promise.all([
          localGame.entities.AthleteProfile.get('athlete_arturo_coello').catch(() => null),
          localGame.entities.AthleteProfile.get('athlete_agustin_tapia').catch(() => null),
          localGame.entities.AthleteProfile.get('athlete_alejandro_galan').catch(() => null),
          localGame.entities.AthleteProfile.get('athlete_federico_chingotto').catch(() => null),
        ]);
        coelloTapiaSamples.push(Boolean(coello?.ai_partner_id === 'athlete_agustin_tapia' || tapia?.ai_partner_id === 'athlete_arturo_coello'));
        galanChingottoSamples.push(Boolean(galan?.ai_partner_id === 'athlete_federico_chingotto' || chingotto?.ai_partner_id === 'athlete_alejandro_galan'));
      }
    }

    const top20 = await localGame.entities.AthleteProfile.list('-world_ranking_points', 20);
    seasonSnapshots.push({
      year,
      top20: top20.map((a, index) => ({ position: index + 1, id: a.id, name: a.name, points: a.world_ranking_points, real: realAthleteIds.has(a.id) })),
      realInTop20: top20.filter((a) => realAthleteIds.has(a.id)).length,
    });
    console.log(`Temporada ${year}: Top 20 tem ${top20.filter((a) => realAthleteIds.has(a.id)).length}/20 atletas reais.`);
  }

  const finalAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const finalReal = finalAthletes.filter((a) => realAthleteIds.has(a.id));
  const finalBots = finalAthletes.filter((a) => !realAthleteIds.has(a.id));
  const avgTournamentsReal = finalReal.reduce((sum, a) => sum + (Number(a.tournaments_played) || 0), 0) / (finalReal.length || 1);
  const avgTournamentsBots = finalBots.reduce((sum, a) => sum + (Number(a.tournaments_played) || 0), 0) / (finalBots.length || 1);
  const realNeverPlayed = finalReal.filter((a) => !Number(a.tournaments_played)).map((a) => ({ id: a.id, name: a.name }));

  const byClassification = tournamentResults.reduce((acc, row) => {
    acc[row.classification] = (acc[row.classification] || 0) + 1;
    return acc;
  }, {});

  const byTierClassification = {};
  for (const row of tournamentResults) {
    const tournament = (await localGame.entities.Tournament.get(row.tournament_id).catch(() => null));
    const tier = tournament?.tier || 'desconhecido';
    byTierClassification[tier] = byTierClassification[tier] || {};
    byTierClassification[tier][row.classification] = (byTierClassification[tier][row.classification] || 0) + 1;
  }

  // ═══════════════ FASE 2b: amostragem do catálogo de adversários DO JOGADOR (pool separado) ═══════════════
  const catalogRealIds = new Set(getRealAthletes().map((a) => a.id || a.template_id));
  const poolComposition = BOT_DIFFICULTIES.map((tier) => {
    const pool = BOTS_BY_DIFFICULTY[tier.id] || [];
    const real = pool.filter((bot) => catalogRealIds.has(bot.id) || catalogRealIds.has(bot.template_id) || bot.source_type === 'real').length;
    return { tier: tier.id, label: tier.label, total: pool.length, real, fictional: pool.length - real };
  });

  const lendaPool = BOTS_BY_DIFFICULTY.lenda || [];
  const SAMPLES = 500;
  let drawsWithAtLeastOneReal = 0;
  let drawsWithTwoReal = 0;
  for (let i = 0; i < SAMPLES; i += 1) {
    const fakeTournament = { id: `sample-crown-${i}`, tier: 'Crown', start_date: '2026-11-01' };
    const fakeProfile = { id: `sample-player-${i}` };
    const opponents = generateTournamentOpponent(fakeTournament, fakeProfile, 5, [], 0, 'main');
    const realCount = opponents.filter((bot) => catalogRealIds.has(bot.id) || catalogRealIds.has(bot.template_id) || bot.source_type === 'real').length;
    if (realCount >= 1) drawsWithAtLeastOneReal += 1;
    if (realCount === 2) drawsWithTwoReal += 1;
  }

  // ═══════════════ Relatório ═══════════════
  mkdirSync(OUT_DIR, { recursive: true });

  const summary = {
    generatedAt: new Date().toISOString(),
    seasonsSimulated: SEASONS,
    roster: {
      realAthletes: realAthleteIds.size, proceduralAthletes: supplemental.athletes.length, totalAthletes,
      realTeams: realTeamKeys.size, proceduralTeams: supplemental.teams.length, totalTeams,
    },
    worldTourSimulation: {
      tournamentsResolved: tournamentResults.length,
      byClassification,
      byTierClassification,
      seasonSnapshots,
      avgTournamentsPlayedRealAthletes: Number(avgTournamentsReal.toFixed(2)),
      avgTournamentsPlayedBots: Number(avgTournamentsBots.toFixed(2)),
      realAthletesNeverInAnyDraw: realNeverPlayed,
      realAthletesNeverInAnyDrawCount: realNeverPlayed.length,
      realAthletesTotal: realAthleteIds.size,
      coelloTapiaTogetherRate: coelloTapiaSamples.length ? Number((coelloTapiaSamples.filter(Boolean).length / coelloTapiaSamples.length * 100).toFixed(1)) : null,
      coelloTapiaSamples: coelloTapiaSamples.length,
      galanChingottoTogetherRate: galanChingottoSamples.length ? Number((galanChingottoSamples.filter(Boolean).length / galanChingottoSamples.length * 100).toFixed(1)) : null,
      galanChingottoSamples: galanChingottoSamples.length,
    },
    playerOpponentCatalog: {
      poolComposition,
      lendaSampling: {
        samples: SAMPLES, roundTested: 'Crown, rodada 6 (final)',
        drawsWithAtLeastOneReal, drawsWithAtLeastOneRealPct: Number((drawsWithAtLeastOneReal / SAMPLES * 100).toFixed(1)),
        drawsWithTwoReal, drawsWithTwoRealPct: Number((drawsWithTwoReal / SAMPLES * 100).toFixed(1)),
        theoreticalAtLeastOnePct: (() => {
          const total = lendaPool.length; const real = poolComposition.find((p) => p.tier === 'lenda')?.real || 0; const bots = total - real;
          if (total < 2) return null;
          const c2 = (n) => n * (n - 1) / 2;
          return Number(((1 - c2(bots) / c2(total)) * 100).toFixed(1));
        })(),
      },
    },
  };

  writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));

  const csvRows = ['year,tournament_id,tier,champion_name,champion_ids,champion_real_count,classification'];
  for (const row of tournamentResults) {
    const tournament = await localGame.entities.Tournament.get(row.tournament_id).catch(() => null);
    csvRows.push([row.year, row.tournament_id, tournament?.tier || '', JSON.stringify(row.champion_name || ''), row.champion_ids, row.champion_real_count, row.classification].join(','));
  }
  writeFileSync(`${OUT_DIR}/tournament-results.csv`, csvRows.join('\n'));

  console.log('\n=== RESUMO ===');
  console.log(`Torneios resolvidos (mundo, sem o jogador): ${tournamentResults.length}`);
  console.log('Classificação dos campeões:', byClassification);
  console.log(`Média de torneios disputados — reais: ${avgTournamentsReal.toFixed(2)} · bots: ${avgTournamentsBots.toFixed(2)}`);
  console.log(`Atletas reais que NUNCA apareceram em nenhuma chave: ${realNeverPlayed.length}/${realAthleteIds.size}`);
  console.log(`Coello/Tapia juntos: ${summary.worldTourSimulation.coelloTapiaTogetherRate}% das amostras mensais (${coelloTapiaSamples.length} amostras)`);
  console.log(`Galán/Chingotto juntos: ${summary.worldTourSimulation.galanChingottoTogetherRate}% das amostras mensais`);
  console.log('\nComposição dos pools de adversário do jogador (catálogo separado):', poolComposition);
  console.log(`Amostragem lenda (final Crown): ${drawsWithAtLeastOneReal}/${SAMPLES} sorteios com >=1 real (teórico: ${summary.playerOpponentCatalog.lendaSampling.theoreticalAtLeastOnePct}%)`);
  console.log(`\nRelatório salvo em ${OUT_DIR}/summary.json e ${OUT_DIR}/tournament-results.csv`);
} finally {
  await vite.close();
}
