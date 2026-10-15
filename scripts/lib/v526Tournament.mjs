// Playthrough 5.26 — rodada de torneio headless, espelhando TournamentModal.jsx.
//
// Ordem idêntica ao modal: reunião/preparação (completePreTournamentMeeting /
// completeRoundPreparation) → startTournamentMatch → motor real
// (createMatch + playPoint) com o MESMO playerForMatch (química, energia,
// treinador, vínculo da dupla) e o MESMO parceiro comprometido
// (resolveCommittedPartnerAthlete — roster do sorteio, nunca a parceria
// atual) → handleMatchFinished (recordTournamentMatchResult, recompensa da
// partida, físico, TeamRanking/Partnership, bracket canônico, batch
// idempotente) → prepareTournamentFinalization → conquistas.
// Omitido de propósito (sem efeito econômico/esportivo): notícias/entrevista
// pós-jogo (buildRoundMediaOperations) e checkpoint de recuperação da UI.
import { ovrOf } from './v526Actions.mjs';

const teamName = (profile, partner) => `${profile?.sport_name || profile?.name || 'Jogador'} & ${partner?.name || 'Parceiro'}`;
const LIVE_COACH_DEFAULTS = { liveCoachEnabled: true, suggestionFrequency: 'normal', allowMinorAutoAdjustments: false, showLiveMetrics: true, showConfidence: true, pauseOnImportantSuggestion: true };

async function persistRun(rt, A, event, tournament, nextRun, profile, partner) {
  const { localGame } = rt;
  const freshEvent = await localGame.entities.CalendarEvent.get(event.id).catch(() => event);
  const nextMatch = A.runManager.getCurrentTournamentMatch(nextRun);
  const terminal = ['eliminated', 'champion', 'finished'].includes(nextRun.status);
  const eventData = {
    title: terminal ? tournament.name : `${tournament.name} — ${nextMatch?.round || 'Torneio'}`,
    start_date: nextMatch?.date || freshEvent.start_date,
    end_date: nextMatch?.date || freshEvent.end_date,
    status: terminal ? 'completed' : 'scheduled',
    requires_decision: !terminal,
    metadata: { ...(freshEvent.metadata || {}), tournament_run: nextRun, tournament_run_schema_version: 2 },
  };
  const freshT = await localGame.entities.Tournament.get(tournament.id).catch(() => null);
  const preserve = Number(freshT?.bracket_schema_version) >= 2 && Array.isArray(freshT?.bracket_history) && freshT.bracket_history.length > 0;
  const bracket = preserve ? freshT.bracket_history : A.runManager.buildTournamentBracketHistory(nextRun, teamName(profile, partner));
  await localGame.batch([
    { type: 'update', entityName: 'CalendarEvent', id: freshEvent.id, data: eventData },
    { type: 'update', entityName: 'Tournament', id: tournament.id, data: { ...(preserve ? {} : { bracket_history: bracket }), current_phase: nextRun.status === 'champion' ? 'concluido' : nextRun.status } },
  ]);
}

/**
 * Joga a rodada atual do evento. Devolve { outcome, matchRow, finalization }.
 * outcome: 'played' | 'forfeit' | 'waiting' | 'no-run' | 'done'.
 */
const avg = (arr) => (arr.length ? arr.reduce((t, v) => t + (Number(v) || 0), 0) / arr.length : 0);
export async function playTournamentRound(rt, A, { eventId, strategyId = 'balanced', seedText }) {
  const { localGame, padel } = rt;
  const event = await localGame.entities.CalendarEvent.get(eventId).catch(() => null);
  if (!event) return { outcome: 'no-run' };
  const tournament = await localGame.entities.Tournament.get(event.related_id).catch(() => null);
  let run = event.metadata?.tournament_run;
  if (!tournament || !run) return { outcome: 'no-run' };
  let profile = await localGame.entities.PlayerProfile.get((await localGame.entities.PlayerProfile.list(null, 1))[0].id);
  const starter = await A.coachLifecycle.resolveActiveCoach(profile).catch(() => ({ profile, coach: null }));
  profile = starter.profile || profile;
  const coach = starter.coach || null;
  const partner = await A.committedRoster.resolveCommittedPartnerAthlete({ profile, tournamentId: tournament.id, calendarEvents: [event] })
    .catch(() => A.career.getPartnerBot(profile));

  let phase = A.runManager.getTournamentRunPhase(run, profile.career_date);
  if (['eliminated', 'champion', 'finished'].includes(phase)) return { outcome: 'done' };
  if (phase === 'pre_tournament') {
    run = A.runManager.completePreTournamentMeeting(run, strategyId).run;
    await persistRun(rt, A, event, tournament, run, profile, partner);
    phase = A.runManager.getTournamentRunPhase(run, profile.career_date);
  }
  if (phase === 'round_preparation') {
    run = A.runManager.completeRoundPreparation(run, { optionId: strategyId }).run;
    await persistRun(rt, A, event, tournament, run, profile, partner);
    phase = A.runManager.getTournamentRunPhase(run, profile.career_date);
  }
  if (phase !== 'playable') return { outcome: phase === 'waiting' ? 'waiting' : 'no-run', phase };
  // Mesmas travas do botão "Jogar" do modal.
  if (padel.isInjured(profile) || (profile.energy || 0) < padel.TOURNAMENT_ENERGY_COST) {
    await A.calendarSystem.resolveDecision(event.id, 'skip').catch(() => null);
    return { outcome: 'forfeit', reason: padel.isInjured(profile) ? 'lesão' : 'energia' };
  }
  run = A.runManager.startTournamentMatch(run, profile.career_date);
  await persistRun(rt, A, event, tournament, run, profile, partner);

  const match = A.runManager.getCurrentTournamentMatch(run);
  const opponent = Array.isArray(match?.opponent) ? match.opponent : [];
  const coachEffects = coach ? A.coaches.getCoachEffects(coach, profile) : null;
  const coachMatchBonus = coach ? Math.min(3, ((coachEffects?.strategyBonus || 0) + (coachEffects?.partnershipBonus || 0)) * 0.35) : 0;
  const playerForMatch = {
    ...profile,
    _chemistryBonus: padel.getChemistryBonus(profile.partner_chemistry || 50),
    _energyPenalty: padel.getEnergyPenalty(profile.energy || 100),
    _coachMatchBonus: coachMatchBonus,
    _partnerBondBonus: A.bond.calculatePartnershipPerformanceBonus({
      chemistry: profile.partner_chemistry, partner_trust: profile.partner_trust,
      partner_morale: profile.partner_morale, natural_chemistry: profile.partner_chemistry,
      shared_matches: profile.matches_played || 0,
    }) * 40,
  };
  // Playthrough 5.27-F (Bloco G/K) — só harness: PL527F_FORCED_WR=<0..1> fixa a
  // taxa de vitórias do jogador para auditar o ranking com calendário real. A
  // decisão é determinística pela seed da partida; o motor real joga com o
  // time do jogador no máximo (vitória) ou no mínimo (derrota) só nesta partida.
  let partnerForMatch = partner;
  if (process.env.PL527F_FORCED_WR != null && process.env.PL527F_FORCED_WR !== '') {
    let h = 2166136261; for (const ch of String(seedText)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    // fmix32 (murmur3): o FNV puro de seeds que só diferem no fim não espalha os bits altos.
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    const wantWin = ((h >>> 0) / 4294967296) < Number(process.env.PL527F_FORCED_WR);
    const level = wantWin ? 99 : 1;
    const KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
    const force = (p) => (p ? { ...p, ...Object.fromEntries(KEYS.map((k) => [k, level])), overall_rating: level, overall: level, energy: 100 } : p);
    Object.assign(playerForMatch, force(playerForMatch));
    partnerForMatch = force(partner);
  }
  const liveCoachSettings = { ...LIVE_COACH_DEFAULTS, ...(profile.live_coach_settings || {}) };
  const engineStart = A.matchEngine.createMatch([playerForMatch, partnerForMatch].filter(Boolean), opponent, { initialTacticId: run.strategy?.matchTacticId || 'equilibrado', coach, liveCoachSettings, seed: seedText });
  // OVR que o MOTOR realmente usa (playerModel.normalizePlayer) — pode divergir do OVR exibido.
  const engineOvr = { A: engineStart.teams.A.map((p) => p.overall), B: engineStart.teams.B.map((p) => p.overall) };
  let state = A.matchEngine.createMatch([playerForMatch, partnerForMatch].filter(Boolean), opponent, { initialTacticId: run.strategy?.matchTacticId || 'equilibrado', coach, liveCoachSettings, seed: seedText });
  let guard = 0;
  while (!state.finished && guard < 3000) { state = A.matchEngine.playPoint(state); guard += 1; }
  const won = state.winner === 'A';

  // Telemetria de dificuldade (antes de qualquer mutação do resultado).
  const teamRank = partner ? await A.teamRanking.getTeamRank(profile, partner).catch(() => ({ rank: 0 })) : { rank: 0 };
  const oppIds = opponent.map((o) => o?.id).filter(Boolean);
  // 5.26-C: telemetria da identidade da dupla adversária (diagnóstico do rank ausente).
  const oppAthletesFound = (await Promise.all(oppIds.map((id) => localGame.entities.AthleteProfile.get(id).catch(() => null)))).filter(Boolean).length;
  // Mesma chamada do TournamentModal.jsx (5.26-C, Bloco C): roster com nome.
  const oppRank = await A.teamRanking.getCanonicalTeamWorldRank(opponent.filter((o) => o?.id).map((o) => ({ id: o.id, name: o.name }))).catch(() => ({ unranked: true, source: 'error' }));
  // Gate da 5.26-C: "rank ausente quando existe TeamRanking canônica" — a
  // linha é procurada pelos ids RESOLVIDOS (mesma identidade do rank).
  const resolvedIds = oppRank?.memberIds?.length >= 2 ? oppRank.memberIds : oppIds;
  const oppKey = resolvedIds.length >= 2 ? A.teamRanking.teamKey(resolvedIds[0], resolvedIds[1]) : null;
  const oppTeamRow = oppKey ? ((await localGame.entities.TeamRanking.filter({ team_key: oppKey }).catch(() => [])) || [])[0] : null;
  const upset = A.teamRanking.isUpsetResult ? A.teamRanking.isUpsetResult({ won, teamRank, opponentRank: oppRank }) : (won && !oppRank.unranked && Number(oppRank.rank) < Number(teamRank.rank || 9999));
  const worldRank = await padel.getWorldRank(profile).catch(() => ({ rank: 0 }));
  const playerOvr = ovrOf(profile);
  const partnerOvr = ovrOf(partner);
  const oppOvrs = opponent.map(ovrOf);
  const teamStrength = (playerOvr + (partnerOvr ?? playerOvr)) / 2;
  const oppStrength = oppOvrs.length ? oppOvrs.reduce((s, v) => s + (v || 0), 0) / oppOvrs.length : null;
  const matchRow = {
    date: profile.career_date, tournamentId: tournament.id, tournamentName: tournament.name, tier: tournament.tier,
    stage: match.stage, round: match.round, stageRoundIndex: match.stageRoundIndex,
    playerOvr, partnerOvr, teamStrength, oppAOvr: oppOvrs[0] ?? null, oppBOvr: oppOvrs[1] ?? null, oppStrength,
    strengthDelta: oppStrength == null ? null : teamStrength - oppStrength,
    playerRank: worldRank?.rank || null, teamRank: teamRank?.rank || null, oppTeamRank: oppRank?.unranked ? null : oppRank?.rank, oppRankSource: oppRank?.source || null, oppCanonicalIds: oppRank?.memberIds || null, upset,
    // OVR exibido (campo `overall` do AthleteProfile / card) x OVR do motor.
    partnerDisplayOvr: Number(partner?.overall ?? partner?.overall_rating) || null,
    oppDisplayOvr: opponent.map((o) => Number(o?.overall ?? o?.overall_rating) || null),
    engineOvr, engineTeamA: avg(engineOvr.A), engineTeamB: avg(engineOvr.B), engineDelta: avg(engineOvr.A) - avg(engineOvr.B),
    oppIds, oppTeamKey: oppKey, oppTeamRowExists: Boolean(oppTeamRow), oppTeamRowPoints: oppTeamRow ? Number(oppTeamRow.ranking_points) || 0 : null, oppAthletesFound, oppRaw: opponent.map((o) => ({ id: o?.id, bot_id: o?.bot_id, name: o?.name })),
    // 5.26-D — origem do campo do torneio do jogador e identidade do par.
    fieldOrigin: tournament.draw_field_origin_version || null,
    drawFallbackCount: Number(tournament.draw_fallback_pair_count) || 0,
    drawRealCount: Number(tournament.draw_real_pair_count) || 0,
    opponentPairId: match.opponentPairId || null,
    opponentSource: match.opponentSource || null,
    won, score: `${state.setsA}-${state.setsB}`, energy: profile.energy, coach: Boolean(coach),
    // 5.27-H, Bloco F: táticas iniciais (estáticas — adaptação da IA OFF) e se a IA adaptou.
    tacticA: engineStart.activeTactics?.A?.id || null, tacticB: engineStart.activeTactics?.B?.id || null,
    tacticBFinal: state.activeTactics?.B?.id || null, opponentAdaptive: state.opponentAdaptive === true,
  };

  // ── handleMatchFinished ────────────────────────────────────────────────
  const freshEvent = await localGame.entities.CalendarEvent.get(event.id);
  const freshProfile = await localGame.entities.PlayerProfile.get(profile.id);
  const freshTournament = await localGame.entities.Tournament.get(tournament.id).catch(() => tournament);
  const freshRun = freshEvent.metadata?.tournament_run || run;
  const freshMatch = A.runManager.getCurrentTournamentMatch(freshRun);
  const score = A.matchEngine.getSetScoreString(state);
  const stats = A.runManager.summarizeTournamentMatch(state);
  const transition = A.runManager.recordTournamentMatchResult(freshRun, {
    matchId: freshMatch.id, won, score, stats, tournament,
    upset,
  });
  const nextRun = transition.run;
  const completedMatch = nextRun.matches.find((m) => m.id === freshMatch.id);
  const matchRecord = {
    id: freshMatch.id, profile_id: profile.id, career_date: profile.career_date, played_date: profile.career_date, date: profile.career_date,
    location: tournament.name, tournament_id: tournament.id, tournament_name: tournament.name, tournament_round: freshMatch.round,
    team_a: [profile.sport_name, partner?.name || 'Parceiro'], team_b: opponent.map((o) => o.name),
    score_a: state.setsA, score_b: state.setsB, score, winner: state.winner, result: won ? 'vitória' : 'derrota',
    opponent_rank: !oppRank.unranked && Number(oppRank.rank) > 0 ? Number(oppRank.rank) : null,
    // 5.26-C, Bloco C — mesmos campos históricos do TournamentModal.jsx.
    opponent_rank_source: oppRank?.source || null, opponent_member_ids: oppRank?.memberIds || [], team_rank_at_match: Number(teamRank?.rank) > 0 ? Number(teamRank.rank) : null, is_upset: upset,
    status: 'completed', match_type: freshMatch.stage === 'qualifying' ? 'qualifying' : 'tournament', competition_type: 'tournament',
    is_official: true, is_tournament: true, world_tour_event: Boolean(tournament.world_tour_event), match_occurred: true,
    tournament_outcome: nextRun.status === 'champion' ? 'champion' : nextRun.status === 'eliminated' ? 'eliminated' : 'advanced',
    press_importance: completedMatch.pressImportance, stats_summary: stats, notes: `${freshMatch.round} | ${score}`,
  };
  const rewardAlreadyApplied = (freshProfile.processed_match_keys || []).includes(freshMatch.id);
  const reward = padel.buildMatchRewardsPatch(freshProfile, won, { skipPhysical: true, idempotencyKey: freshMatch.id, officialTournament: true });
  let draft = { ...freshProfile, ...reward.updates };
  if (!rewardAlreadyApplied) {
    const prior = Number(freshProfile.current_win_streak) || 0;
    const next = won ? prior + 1 : 0;
    draft = { ...draft, current_win_streak: next };
    const THRESHOLD = 5; // TournamentModal.jsx: const WILDCARD_STREAK_THRESHOLD = 5 (local ao componente)
    if (next >= THRESHOLD && prior < THRESHOLD && !(Number(draft.wildcard_tokens) > 0)) draft = { ...draft, wildcard_tokens: (Number(draft.wildcard_tokens) || 0) + 1 };
  }
  const physicalKeys = Array.isArray(draft.processed_tournament_physical_keys) ? draft.processed_tournament_physical_keys : [];
  let physical = null;
  if (!physicalKeys.includes(freshMatch.id)) {
    physical = A.physical.buildPhysicalPatch({ profile: draft, tournament, roundLabel: freshMatch.round, won, matchesThisWeek: Number(draft.matches_this_week) || 0, date: profile.career_date });
    draft = { ...draft, ...physical.patch, processed_tournament_physical_keys: [...physicalKeys, freshMatch.id].slice(-100) };
  }
  const rankingKey = partner?.id ? A.teamRanking.teamKey(freshProfile.id, partner.id) : null;
  const [rankingRows, activePartnership] = rewardAlreadyApplied ? [[], null] : await Promise.all([
    rankingKey ? localGame.entities.TeamRanking.filter({ team_key: rankingKey }) : Promise.resolve([]),
    A.partnership.getActivePartnership(profile.id),
  ]);
  const operations = [];
  if (!rewardAlreadyApplied) {
    const ranking = rankingRows?.[0];
    if (rankingKey && partner) {
      const sorted = [freshProfile, partner].sort((a, b) => a.id.localeCompare(b.id));
      const pp = Math.max(0, Number(freshProfile.rank_points ?? freshProfile.ranking_points ?? freshProfile.world_ranking_points) || 0);
      const ptp = Math.max(0, Number(partner.world_ranking_points ?? partner.ranking_points) || 0);
      operations.push({ type: 'upsert', entityName: 'TeamRanking', id: ranking?.id || `team-ranking-${rankingKey}`, data: {
        team_key: rankingKey, player1_id: sorted[0].id, player1_name: sorted[0].sport_name || sorted[0].name, player2_id: sorted[1].id, player2_name: sorted[1].sport_name || sorted[1].name,
        ranking_points: A.teamRanking.computeCanonicalTeamRankingPoints(pp, ptp), matches_played: (Number(ranking?.matches_played) || 0) + 1,
        wins: (Number(ranking?.wins) || 0) + (won ? 1 : 0), losses: (Number(ranking?.losses) || 0) + (won ? 0 : 1), titles: ranking?.titles || [],
      } });
    }
    if (activePartnership) {
      const patch = A.partnership.buildPartnershipMatchPatch(activePartnership, won, tournament.name, profile.career_date);
      const clearedQ = won && freshMatch.stage === 'qualifying' && A.runManager.getCurrentTournamentMatch(nextRun)?.stage === 'main';
      if (clearedQ) patch.priority_window_remaining = A.entryManager.PRIORITY_WINDOW_N;
      operations.push({ type: 'update', entityName: 'Partnership', id: activePartnership.id, data: patch });
      draft = { ...draft, partner_chemistry: patch.chemistry, partner_trust: patch.partner_trust, partner_morale: patch.partner_morale };
    }
  }
  const hasCanon = Number(freshTournament?.bracket_schema_version) >= 2 && Array.isArray(freshTournament?.bracket_history) && freshTournament.bracket_history.length > 0;
  const bracket = hasCanon && completedMatch.stage === 'main'
    ? A.settlement.applyPlayerMatchToCanonicalBracket(freshTournament.bracket_history, {
      roundIndex: completedMatch.stageRoundIndex, playerTeamName: teamName(draft, partner),
      opponentTeamName: opponent.length ? opponent.map((o) => o.name).filter(Boolean).join(' & ') : null,
      won, score: completedMatch.result?.score || null, date: completedMatch.date,
    }).rounds
    : (hasCanon ? freshTournament.bracket_history : A.runManager.buildTournamentBracketHistory(nextRun, teamName(draft, partner)));
  const nextScheduled = A.runManager.getCurrentTournamentMatch(nextRun);
  const terminalStatus = ['eliminated', 'champion', 'finished'].includes(nextRun.status);
  operations.push(...A.tournamentMatchLifecycle.buildTournamentRoundCoreOperations({
    matchRecord, profileId: freshProfile.id,
    playerPatch: { ...reward.updates, ...(physical?.patch || {}), partner_chemistry: draft.partner_chemistry, partner_trust: draft.partner_trust, partner_morale: draft.partner_morale, processed_tournament_physical_keys: draft.processed_tournament_physical_keys, current_win_streak: draft.current_win_streak, wildcard_tokens: draft.wildcard_tokens },
    event: freshEvent,
    eventPatch: {
      title: terminalStatus ? tournament.name : `${tournament.name} — ${nextScheduled?.round || 'Torneio'}`,
      start_date: nextScheduled?.date || freshEvent.start_date, end_date: nextScheduled?.date || freshEvent.end_date,
      status: terminalStatus ? 'completed' : 'scheduled', requires_decision: !terminalStatus,
      metadata: { ...(freshEvent.metadata || {}), tournament_run: nextRun, tournament_run_schema_version: 2, last_completed_match_id: freshMatch.id, next_round_date: transition.nextMatch?.date || null },
    },
    tournament, tournamentPatch: { bracket_history: bracket, current_phase: nextRun.status === 'champion' ? 'concluido' : nextRun.status },
    mediaOperations: [],
    // 5.27-M: mesmo argumento do TournamentModal (linha do extrato da partida).
    rewardCoins: rewardAlreadyApplied ? 0 : Number(reward.updates?.coins ?? freshProfile.coins) - Number(freshProfile.coins || 0),
  }));
  const core = await localGame.batch(operations, { idempotencyKey: `tournament:${freshMatch.id}` });
  let updated = core.player || draft;
  let finalization = null;
  let completion = null;
  if (transition.terminal) {
    const mainRounds = nextRun.matches.filter((m) => m.stage === 'main');
    completion = await A.tournamentLifecycle.prepareTournamentFinalization({
      profile: updated, tournament, partner, roundsWon: A.runManager.countMainDrawWins(nextRun), totalRounds: mainRounds.length,
      runId: `${tournament.id}:${nextRun.createdAt}`, bracketHistory: bracket,
      runnerUp: won ? opponent.map((o) => o.name).join(' & ') : teamName(updated, partner), run: nextRun,
    });
    updated = completion.updatedProfile || updated;
    finalization = { status: nextRun.status, roundsWon: A.runManager.countMainDrawWins(nextRun), totalRounds: mainRounds.length, rewards: completion.rewards || null };
  }
  let achievementsCoins = 0;
  try {
    const wr = await padel.getWorldRank(updated).catch(() => null);
    const ctx = await A.achievementContext.buildAchievementContext(updated, { worldRank: wr });
    const sync = await A.achievements.syncPlayerAchievements(updated, ctx, { localGame });
    achievementsCoins = (sync.unlocked || []).reduce((s, a) => s + (Number(a.coins_reward) || 0), 0);
  } catch { /* igual ao modal: conquistas são best-effort */ }
  // Commit da rodada/finalização — MESMA chamada do modal (TournamentModal
  // handleMatchFinished): incrementMissionProgress com as operações da
  // finalização e o playerPatch (moedas/XP/pontos do torneio). Ordem igual:
  // depois das conquistas.
  const coinsBeforeCommit = Number((await localGame.entities.PlayerProfile.get(profile.id))?.coins) || 0;
  const missionObjectives = [...(won ? ['win_matches'] : []), 'play_matches', ...(nextRun.status === 'champion' ? ['win_tournament'] : [])];
  if (!(rewardAlreadyApplied && !transition.terminal)) {
    await padel.incrementMissionProgress(profile.id, missionObjectives, 1, profile.career_date, {
      triggerEventId: freshMatch.id, batchWrites: true,
      additionalOperations: transition.terminal ? completion.operations : [],
      playerPatch: transition.terminal && !completion.idempotent ? completion.playerPatch : null,
      playerIncrements: transition.terminal && !completion.idempotent ? completion.playerIncrements : null,
    });
  }
  const coinsAfterCommit = Number((await localGame.entities.PlayerProfile.get(profile.id))?.coins) || 0;
  if (finalization) finalization.commit = { coinsBeforeCommit, coinsAfterCommit, patchCoins: completion?.playerPatch?.coins ?? null };
  return { outcome: 'played', matchRow, finalization, matchRewardCoins: Number(reward.updates?.coins ?? freshProfile.coins) - Number(freshProfile.coins || 0), achievementsCoins };
}
