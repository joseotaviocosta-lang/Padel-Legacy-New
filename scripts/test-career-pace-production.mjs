// Fase 13.1 (docs/FASE_13_1_CAREER_PACE_VALIDATION.md, Parte 3).
//
// Harness canônico de pace usando o MÁXIMO possível do pipeline real de
// produção — não um segundo modelo estatístico. Reaproveita a fundação já
// existente de scripts/test-career-beta-readiness.mjs (Fase 10: GameStorage
// -> CareerRepository -> CareerManager reais, advanceCareerDays/
// finalizeCareerAdvanceRange reais, resolveDecision real, partida de treino
// headless com createMatch/playPoint reais + finalizePracticeMatch real) e
// ACRESCENTA a peça que faltava: partida de TORNEIO headless também com o
// motor real, usando as mesmas funções puras que TournamentModal.jsx usa
// (createTournamentRun, generateTournamentOpponent, getCurrentTournamentMatch,
// recordTournamentMatchResult, prepareTournamentFinalization) — nenhuma
// fórmula de probabilidade nova, nenhum ranking recalculado à parte.
//
// SIMPLIFICAÇÃO DISCLOSED (Parte 3 exige documentar): a construção do
// `tournament_run` inicial (bracket + oponentes) é feita AQUI, chamando as
// MESMAS funções puras que TournamentModal.jsx chama no mount (nenhuma
// fórmula reinventada) — a única coisa que este script NÃO reproduz é a
// camada de React/checkpoint/recovery da UI (irrelevante para pace, já que
// não há usuário podendo fechar o app no meio de uma partida aqui).
import { createServer } from 'vite';

const HORIZON_DAYS = Number(process.argv.find((arg) => arg.startsWith('--days='))?.split('=')[1] || 1460); // ~4 anos
const RUNS_PER_PROFILE = Number(process.argv.find((arg) => arg.startsWith('--runs='))?.split('=')[1] || 3);
const DIFFICULTIES = (process.argv.find((arg) => arg.startsWith('--difficulties='))?.split('=')[1] || 'easy,normal,hard').split(',');
const OUTPUT = process.argv.find((arg) => arg.startsWith('--output='))?.split('=')[1] || 'reports/career-pace-production.json';

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; }, async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; }, async stat() { return { size: 0 }; }, getDataDirectoryDescription: () => 'memory',
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(text) {
  let value = 2166136261;
  for (let i = 0; i < String(text).length; i += 1) { value ^= String(text).charCodeAt(i); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

// Parte 4: 5 arquétipos pedidos, mapeados sobre o subconjunto já real e
// testado da Fase 10 (não duplicado — mesmos campos de decisão).
const PROFILES = [
  { id: 'equilibrado', label: '1) Equilibrado', practiceMatchChance: 0.3, maxEntryFee: Infinity, registerChance: 0.6, decisionPlayChance: 0.7 },
  { id: 'competitivo', label: '2) Competitivo (prioriza torneios)', practiceMatchChance: 0.1, maxEntryFee: Infinity, registerChance: 1, decisionPlayChance: 0.95 },
  { id: 'desenvolvimento', label: '3) Desenvolvimento (prioriza treino)', practiceMatchChance: 0.5, maxEntryFee: Infinity, registerChance: 0.3, decisionPlayChance: 0.6 },
  { id: 'conservador', label: '4) Conservador (descanso + financeiro)', practiceMatchChance: 0.15, maxEntryFee: 150, registerChance: 0.25, decisionPlayChance: 0.5 },
  { id: 'agressivo', label: '5) Agressivo (máximo de competição)', practiceMatchChance: 0.05, maxEntryFee: Infinity, registerChance: 1, decisionPlayChance: 1 },
];

const RANK_RUNGS = [500, 250, 100, 50, 30, 20, 10, 5, 3, 1];

async function main() {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
    const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
    const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
    const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
    const { advanceCareerDays, finalizeCareerAdvanceRange } = await server.ssrLoadModule('/src/game-core/calendarLifecycle.js');
    const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
    const { resolveDecision } = await server.ssrLoadModule('/src/lib/calendarSystem.js');
    const { registerTournament, getTournamentRegistrationWindow } = await server.ssrLoadModule('/src/lib/tournamentRegistration.js');
    const { finalizePracticeMatch } = await server.ssrLoadModule('/src/game-core/matchLifecycle.js');
    const { createMatch, playPoint } = await server.ssrLoadModule('/src/lib/matchEngine.js');
    const { getRandomBots, getDifficultyForPlayer, BOTS_BY_DIFFICULTY } = await server.ssrLoadModule('/src/lib/bots.js');
    const { isInjured, canPlayMatchToday, getChemistryBonus, getEnergyPenalty, getWorldRank } = await server.ssrLoadModule('/src/lib/padel.js');
    const { createTournamentRun, getCurrentTournamentMatch, recordTournamentMatchResult } = await server.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
    const { prepareTournamentFinalization } = await server.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
    const { getTournamentRounds, generateTournamentOpponent } = await server.ssrLoadModule('/src/lib/career.js');
    const { getQualifyingRoundLabels } = await server.ssrLoadModule('/src/gameplay/worldTour/QualifyingManager.js');
    const { getTrainingCost } = await server.ssrLoadModule('/src/lib/trainingEconomy.js');
    const { executeTraining, TRAINING_ACTIVITIES } = await server.ssrLoadModule('/src/lib/trainingSystemV2.js');

    const trainingActivity = TRAINING_ACTIVITIES.find((a) => a.id === 'court-groundstrokes');
    const partnerId = BOTS_BY_DIFFICULTY.iniciante[0].id;
    const partnerBot = BOTS_BY_DIFFICULTY.iniciante[0];

    async function playHeadlessPracticeMatch(profile, matchSeed) {
      const opponents = getRandomBots(getDifficultyForPlayer(profile), 2, [partnerId]);
      const chemistryBonus = getChemistryBonus(profile.partner_chemistry || 50);
      const energyPenalty = getEnergyPenalty(profile.energy || 100);
      const playerForMatch = { ...profile, _chemistryBonus: chemistryBonus, _energyPenalty: energyPenalty };
      let state = createMatch([playerForMatch, partnerBot], opponents, { seed: matchSeed });
      let guard = 0;
      while (!state.finished && guard < 2000) { state = playPoint(state); guard += 1; }
      if (!state.finished) return;
      const result = await finalizePracticeMatch({ profile, matchState: state, partnerName: partnerBot.name, opponents: opponents.map((o) => o.name) });
      await result.secondary;
    }

    // Constrói (ou recupera) o tournament_run anexado ao CalendarEvent, com
    // as MESMAS funções puras que TournamentModal.jsx usa no mount — Parte 3.
    async function ensureTournamentRun(event, tournament, profile) {
      if (event.metadata?.tournament_run) return event.metadata.tournament_run;
      const registrations = await localGame.entities.TournamentRegistration.filter({ profile_id: profile.id, tournament_id: tournament.id });
      const registration = (registrations || [])[0];
      const qualifyingRequired = Boolean(event.metadata?.qualifying_required || registration?.entry_path === 'qualifying');
      const mainRounds = getTournamentRounds(tournament);
      const qualifyingRounds = qualifyingRequired ? getQualifyingRoundLabels(tournament).map((label) => ({ label, short: 'Q' })) : [];
      const stageRounds = [
        ...qualifyingRounds.map((round, index) => ({ ...round, stage: 'qualifying', stageRoundIndex: index })),
        ...mainRounds.map((round, index) => ({ ...round, stage: 'main', stageRoundIndex: index })),
      ];
      const rank = await getWorldRank(profile).catch(() => ({ rank: 900 }));
      const usedIds = [partnerId];
      const opponents = stageRounds.map((round) => {
        let members = generateTournamentOpponent(tournament, profile, round.stageRoundIndex, usedIds, rank.rank, round.stage);
        if (members.length < 2) members = generateTournamentOpponent(tournament, profile, round.stageRoundIndex, [partnerId], rank.rank, round.stage);
        usedIds.push(...members.map((item) => item.id));
        return { members, rank: Math.max(1, Number(rank.rank || 240) - (round.stageRoundIndex + 1) * (round.stage === 'main' ? 8 : 3)) };
      });
      const run = createTournamentRun({
        tournament, profileId: profile.id,
        startDate: event.metadata?.original_start_date || event.start_date || tournament.start_date,
        qualifyingRounds, mainRounds, qualifyingRequired, opponents,
      });
      await localGame.entities.CalendarEvent.update(event.id, { metadata: { ...event.metadata, tournament_run: run } });
      return run;
    }

    // Joga a rodada ATUAL do torneio com o motor real (createMatch/playPoint)
    // e aplica o resultado com recordTournamentMatchResult (pura) +
    // prepareTournamentFinalization (real, só ao terminar a campanha).
    async function playHeadlessTournamentRound({ eventId, tournament, profile, matchSeed }) {
      const event = await localGame.entities.CalendarEvent.get(eventId);
      let run = await ensureTournamentRun(event, tournament, profile);
      const match = getCurrentTournamentMatch(run);
      if (!match || match.status === 'completed') { await resolveDecision(eventId, 'play'); return { profile, terminal: true }; }

      const opponents = (match.opponent || []).length >= 2 ? match.opponent : [partnerBot, partnerBot];
      const playerForMatch = { ...profile, _chemistryBonus: getChemistryBonus(profile.partner_chemistry || 50), _energyPenalty: getEnergyPenalty(profile.energy || 100) };
      let state = createMatch([playerForMatch, partnerBot], opponents, { seed: matchSeed });
      let guard = 0;
      while (!state.finished && guard < 2000) { state = playPoint(state); guard += 1; }
      if (!state.finished) { await resolveDecision(eventId, 'skip'); return { profile, terminal: true }; }

      const won = state.winner === 'A';
      const score = `${state.setsA}-${state.setsB}`;
      const transition = recordTournamentMatchResult(run, { matchId: match.id, won, score, tournament, upset: won && Number(match.opponentRank || 9999) < 100 });
      run = transition.run;

      await localGame.entities.Match.create({
        id: `${match.id}-play`, profile_id: profile.id, career_date: profile.career_date, date: profile.career_date,
        tournament_id: tournament.id, tournament_name: tournament.name, tournament_round: match.round,
        competition_type: 'tournament', is_official: true, is_tournament: true,
        result: won ? 'vitória' : 'derrota', winner: state.winner, opponent_rank: match.opponentRank || null,
      }).catch(() => {});

      const terminal = ['eliminated', 'champion', 'finished'].includes(run.status);
      await localGame.entities.CalendarEvent.update(eventId, {
        metadata: { ...event.metadata, tournament_run: run },
        requires_decision: false,
        status: terminal ? 'completed' : 'scheduled',
      });

      if (terminal) {
        const roundsWon = run.matches.filter((m) => m.stage === 'main' && m.result?.won).length;
        const totalRounds = run.matches.filter((m) => m.stage === 'main').length;
        const completion = await prepareTournamentFinalization({
          profile, tournament, partner: partnerBot, roundsWon, totalRounds,
          runId: `${profile.id}:${tournament.id}:${tournament.start_date || 'edition'}`,
        });
        if (completion.operations?.length) await localGame.batch(completion.operations).catch(async () => {
          for (const op of completion.operations) {
            if (op.type === 'upsert') await localGame.entities[op.entityName].upsert?.(op.id, op.data).catch(() => {});
            else if (op.type === 'update') await localGame.entities[op.entityName].update(op.id, op.data).catch(() => {});
          }
        });
        const updated = await localGame.entities.PlayerProfile.update(profile.id, completion.playerPatch);
        return { profile: updated, terminal: true };
      }
      return { profile, terminal: false };
    }

    async function simulateCareer({ profileDef, difficultyId, seed, careerManager }) {
      const { career } = await careerManager.createCareer({ career_name: `Pace13.1 ${profileDef.label} ${difficultyId} seed=${seed}` });
      const careerId = career.career_id;
      activeCareerAdapter.setActiveCareer(career);
      await activeCareerAdapter.createPlayerProfile({
        id: `${careerId}-player`, sport_name: `Atleta ${profileDef.id}`,
        career_date: '2026-01-05', birth_date: '2009-06-15',
        energy: 100, fatigue: 0, morale: 70, form: 55, confidence: 60,
        coins: 5000, xp: 0, level: 'Iniciante',
        court_side: 'direita', play_style: 'equilibrado', career_difficulty: difficultyId,
        partner_id: partnerId, career_level: 3,
        trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
        serve: 32, forehand: 32, backhand: 32, volley: 30, bandeja: 30, smash: 30, defense: 30, agility: 32, strategy: 28, emotional_control: 28,
        potential: 82, partner_chemistry: 50,
      });
      let profile = await localGame.entities.PlayerProfile.get(`${careerId}-player`);
      const rng = mulberry32(hashSeed(`${profileDef.id}-${difficultyId}-${seed}`));
      const rankAtAge = {};
      const overallAtAge = {};
      let day = 0;
      let matchCounter = 0;
      let stuckGuard = 0;

      while (day < HORIZON_DAYS) {
        if (rng() < profileDef.registerChance) {
          const tournaments = await localGame.entities.Tournament.list('-start_date', 200);
          const candidate = (tournaments || []).find((t) => {
            if (t.status === 'finalizado') return false;
            const fee = Number(t.entry_fee) || 0;
            if (fee > profileDef.maxEntryFee) return false;
            const window = getTournamentRegistrationWindow(t);
            return window.opensAt && window.closesAt && profile.career_date >= window.opensAt && profile.career_date <= window.closesAt;
          });
          if (candidate) {
            try {
              await registerTournament({ player: profile, partner: { id: partnerId, status: 'active', name: partnerBot.name }, tournament: candidate });
              profile = await localGame.entities.PlayerProfile.get(profile.id);
            } catch { /* elegibilidade real recusou — esperado, não é erro de harness */ }
          }
        }

        const chunk = Math.min(28, HORIZON_DAYS - day);
        const before = profile;
        const result = await advanceCareerDays(profile, chunk);
        profile = await finalizeCareerAdvanceRange(result.profile, before.career_date, result.profile.career_date);
        day += result.daysAdvanced;

        if (result.blockedBy) {
          if (!result.blockedBy.id) { stuckGuard += 1; if (stuckGuard > 3) break; continue; }
          const playThisRound = rng() < profileDef.decisionPlayChance;
          if (playThisRound && result.blockedBy.event_type === 'tournament' && result.blockedBy.related_id) {
            const tournament = await localGame.entities.Tournament.get(result.blockedBy.related_id).catch(() => null);
            if (tournament) {
              matchCounter += 1;
              const { profile: afterMatch } = await playHeadlessTournamentRound({
                eventId: result.blockedBy.id, tournament, profile, matchSeed: `${profileDef.id}-${difficultyId}-${seed}-tmatch-${matchCounter}`,
              }).catch(() => ({ profile }));
              profile = afterMatch;
            } else {
              await resolveDecision(result.blockedBy.id, 'skip');
            }
          } else {
            await resolveDecision(result.blockedBy.id, playThisRound ? 'play' : 'skip');
          }
          profile = await localGame.entities.PlayerProfile.get(profile.id);
          stuckGuard = 0;
          continue;
        }
        stuckGuard = 0;
        if (result.daysAdvanced === 0) break;

        // Treino real (custo/ganho reais — M4.2.1) algumas vezes por semana.
        if (rng() < 0.4 && Number(profile.trainings_today || 0) < 3) {
          const coachBonus = {};
          const cost = getTrainingCost(profile, 'moderado');
          if (Number(profile.coins || 0) >= cost) {
            const trainRes = await executeTraining(profile, trainingActivity, 'moderado', coachBonus).catch(() => null);
            if (trainRes?.profile) profile = trainRes.profile;
          }
        }
        if (!isInjured(profile) && (await canPlayMatchToday(profile)).allowed && rng() < profileDef.practiceMatchChance) {
          matchCounter += 1;
          await playHeadlessPracticeMatch(profile, `${profileDef.id}-${difficultyId}-${seed}-pmatch-${matchCounter}`).catch(() => {});
          profile = await localGame.entities.PlayerProfile.get(profile.id);
        }

        const age = Math.floor((new Date(profile.career_date) - new Date(profile.birth_date)) / 31557600000);
        const rank = await getWorldRank(profile).catch(() => null);
        if (rank?.rank > 0 && (rankAtAge[age] == null || rank.rank < rankAtAge[age])) rankAtAge[age] = rank.rank;
        const attrs = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
        const overall = Math.round(attrs.reduce((s, k) => s + (Number(profile[k]) || 0), 0) / attrs.length);
        if (overallAtAge[age] == null || overall > overallAtAge[age]) overallAtAge[age] = overall;
      }

      const finalRank = await getWorldRank(profile).catch(() => ({ rank: null }));
      return { careerId, profileDef: profileDef.id, difficultyId, seed, daysCompleted: day, matchesPlayed: matchCounter, rankAtAge, overallAtAge, finalRank: finalRank?.rank, finalProfile: { coins: profile.coins, xp: profile.xp } };
    }

    const fakeStorage = createMemoryStorage();
    const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
    activeCareerAdapter.careerManager = careerManager;

    const results = [];
    for (const difficultyId of DIFFICULTIES) {
      for (const profileDef of PROFILES) {
        for (let seed = 0; seed < RUNS_PER_PROFILE; seed += 1) {
          const startedAt = Date.now();
          const outcome = await simulateCareer({ profileDef, difficultyId, seed, careerManager });
          results.push({ ...outcome, ms: Date.now() - startedAt });
          console.log(`[${difficultyId}] ${profileDef.label} seed=${seed}: ${outcome.daysCompleted}d, ${outcome.matchesPlayed} partidas, rank final=${outcome.finalRank}, ${Date.now() - startedAt}ms`);
        }
      }
    }

    const fs = await import('node:fs');
    fs.mkdirSync('reports', { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify({ horizonDays: HORIZON_DAYS, runsPerProfile: RUNS_PER_PROFILE, difficulties: DIFFICULTIES, rankRungs: RANK_RUNGS, results }, null, 2));
    console.log(`\n${results.length} carreiras reais simuladas (pipeline de produção). Relatório: ${OUTPUT}`);
  } finally {
    await server.close();
  }
}

await main();
