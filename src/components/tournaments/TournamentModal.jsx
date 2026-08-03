import React, { useState, useRef, useEffect } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { X, Crown, Trophy, Coins, Zap, Star, Play, ChevronRight, Bot, CheckCircle, XCircle, MapPin, Shield } from 'lucide-react';
import { overallRating, applyMatchRewards, levelForXp, getChemistryBonus, isInjured, injuryRecoveryDays, getEnergyPenalty, incrementMissionProgress, TOURNAMENT_ENERGY_COST } from '@/lib/padel';
import { getTournamentRounds, generateTournamentOpponent, getPartnerBot, getTournamentRewards } from '@/lib/career';
import { getActivePartnership, recordPartnershipMatch, recordPartnershipTitle } from '@/lib/partnershipSystem';
import { updateTeamRanking, addTeamTitle, getTeamRank, addTeamRankingPoints } from '@/lib/teamRanking';
import { getSetScoreString } from '@/lib/matchEngine';
import LiveMatch from '@/components/matches/LiveMatch';
import { useToast } from '@/components/ui/use-toast';
import { createQualifyingState, recordQualifyingResult, buildQualifyingBracketHistory } from '@/gameplay/worldTour/QualifyingManager.js';
import { createMainDrawState, recordMainDrawResult, buildMainDrawBracketHistory } from '@/gameplay/worldTour/MainDrawManager.js';
import { buildPhysicalPatch, getCoachPhysicalRecommendation } from '@/gameplay/worldTour/PhysicalConditionManager.js';

const TIER_STYLES = {
  Crown:{icon:Crown,color:'text-amber-400'}, Elite:{icon:Crown,color:'text-fuchsia-400'},
  Masters:{icon:Trophy,color:'text-purple-400'}, Platinum:{icon:Trophy,color:'text-cyan-400'},
  Gold:{icon:Trophy,color:'text-yellow-400'}, Silver:{icon:Trophy,color:'text-slate-300'},
};

export default function TournamentModal({ tournament, profile: initialProfile, onClose, onProfileUpdate, onComplete }) {
  const [profile, setProfile] = useState(initialProfile);
  const [roundIdx, setRoundIdx] = useState(0);
  const [phase, setPhase] = useState('intro');
  const [opponent, setOpponent] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [tournamentRewards, setTournamentRewards] = useState(null);
  const [teamRank, setTeamRank] = useState({ rank: 0, total: 0 });
  const [calendarEvent, setCalendarEvent] = useState(null);
  const [qualifyingState, setQualifyingState] = useState(null);
  const [tournamentStage, setTournamentStage] = useState('main');
  const [mainDrawState, setMainDrawState] = useState(null);
  const [physicalReport, setPhysicalReport] = useState(null);
  const savedRef = useRef(false);
  const tournamentHistoryRef = useRef([]);
  const { toast } = useToast();

  const partner = getPartnerBot(profile);
  const mainRounds = getTournamentRounds(tournament);
  const qualifyingRounds = (qualifyingState?.roundLabels || []).map((label, index) => ({ id: `qualifying-${index + 1}`, label }));
  const rounds = tournamentStage === 'qualifying' ? qualifyingRounds : mainRounds;
  const currentRound = rounds[roundIdx];
  const tierStyle = TIER_STYLES[tournament?.tier] || TIER_STYLES.Silver;
  const TierIcon = tierStyle.icon;

  // Load the registration and restore a pending qualifying bracket.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const events = await localGame.entities.CalendarEvent.filter({
        profile_id: initialProfile.id,
        related_id: tournament.id,
        status: 'scheduled',
      });
      if (cancelled || !events?.length) return;
      const event = events[0];
      setCalendarEvent(event);
      const metadata = event.metadata || {};
      if (metadata.main_draw_state) { setMainDrawState(metadata.main_draw_state); if (!metadata.qualifying_required || metadata.qualifying_status === 'qualified') setRoundIdx(Number(metadata.main_draw_state.currentRound || 0)); }
      if (metadata.qualifying_required && metadata.qualifying_status !== 'qualified') {
        const restored = metadata.qualifying_state || createQualifyingState({
          tournament,
          profile: initialProfile,
          partner: getPartnerBot(initialProfile),
          teamRank: metadata.team_rank || 0,
        });
        setQualifyingState(restored);
        setTournamentStage('qualifying');
        setRoundIdx(Number(restored.currentRound || 0));
      }
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [initialProfile.id, tournament.id]);

  // Generate opponent when round changes
  useEffect(() => {
    const excludeIds = [partner?.id].filter(Boolean);
    const opp = generateTournamentOpponent(tournament, initialProfile, roundIdx, excludeIds, teamRank.rank);
    setOpponent(opp);
  }, [roundIdx, teamRank.rank, tournament?.id, tournamentStage]);

  // Fetch team ranking seed
  useEffect(() => {
    (async () => {
      const p = getPartnerBot(initialProfile);
      if (p) {
        const rank = await getTeamRank(initialProfile, p);
        setTeamRank(rank);
      }
    })();
  }, []);

  useEffect(() => {
    if (tournamentStage !== 'main' || mainDrawState || !profile || !partner) return;
    const opponentTeams = mainRounds.map((_, idx) => {
      const members = generateTournamentOpponent(tournament, profile, idx, [partner?.id].filter(Boolean), teamRank.rank);
      return { id: `round-${idx}`, name: members.map(m => m.name).join(' & '), rank: Math.max(1, (teamRank.rank || 200) - idx * 5), members };
    });
    const created = createMainDrawState({ tournament, profile, partner, teamRank: teamRank.rank || 9999, rounds: mainRounds, opponentTeams });
    setMainDrawState(created);
    if (calendarEvent?.id) localGame.entities.CalendarEvent.update(calendarEvent.id, { metadata: { ...(calendarEvent.metadata || {}), main_draw_state: created, main_draw_status: 'in_progress', player_seed: created.playerSeed } }).then(setCalendarEvent).catch(console.error);
  }, [tournamentStage, mainDrawState, profile?.id, partner?.id, teamRank.rank, calendarEvent?.id]);

  async function handleMatchFinished(matchState) {
    if (savedRef.current) return;
    savedRef.current = true;
    const won = matchState.winner === 'A';

    try {
      if (tournamentStage === 'qualifying' && qualifyingState) {
        const teamA = `${profile.sport_name} & ${partner?.name || 'Parceiro'}`;
        const teamB = opponent.map((bot) => bot.name).join(' & ');
        const nextQualifying = recordQualifyingResult(qualifyingState, {
          won,
          teamA,
          teamB,
          winner: won ? teamA : teamB,
          score: getSetScoreString(matchState),
        });
        setQualifyingState(nextQualifying);
        const nextMetadata = {
          ...(calendarEvent?.metadata || {}),
          qualifying_state: nextQualifying,
          qualifying_status: nextQualifying.status,
          qualifying_bracket_history: buildQualifyingBracketHistory(nextQualifying),
        };
        if (calendarEvent?.id) {
          const eventUpdates = { metadata: nextMetadata };
          if (nextQualifying.eliminated) {
            eventUpdates.status = 'completed';
            eventUpdates.requires_decision = false;
          }
          const savedEvent = await localGame.entities.CalendarEvent.update(calendarEvent.id, eventUpdates);
          setCalendarEvent(savedEvent);
        }
        await localGame.entities.Match.create({
          profile_id: profile.id,
          career_date: profile.career_date,
          date: profile.career_date || new Date().toISOString().slice(0, 10),
          location: tournament.name,
          tournament_name: tournament.name,
          team_a: [profile.sport_name, partner?.name || 'Parceiro'],
          team_b: opponent.map((bot) => bot.name),
          score_a: matchState.setsA,
          score_b: matchState.setsB,
          winner: matchState.winner,
          result: won ? 'vitória' : 'derrota',
          match_type: 'qualifying',
          notes: `${currentRound?.label || 'Qualifying'} | ${getSetScoreString(matchState)}`,
        });
        setLastResult({ won, matchState });
        if (nextQualifying.eliminated) {
          const xp = (Number(profile.xp) || 0) + 20;
          const updated = await localGame.entities.PlayerProfile.update(profile.id, { xp, level: levelForXp(xp) });
          setProfile(updated);
          onProfileUpdate?.(updated);
          setTournamentRewards({ coins: 0, xp: 20, rankPoints: 0 });
          setPhase('eliminated');
          onComplete?.();
        } else if (nextQualifying.promoted) {
          setPhase('qualified');
        } else {
          setPhase('round_result');
        }
        return;
      }

      const currentMain = mainDrawState || createMainDrawState({ tournament, profile, partner, teamRank: teamRank.rank || 9999, rounds: mainRounds });
      const teamAName = `${profile.sport_name} & ${partner?.name || 'Parceiro'}`;
      const teamBName = opponent.map((bot) => bot.name).join(' & ');
      const nextMain = recordMainDrawResult(currentMain, { won, teamA: teamAName, teamB: teamBName, winner: won ? teamAName : teamBName, score: getSetScoreString(matchState) });
      setMainDrawState(nextMain);
      if (calendarEvent?.id) {
        const saved = await localGame.entities.CalendarEvent.update(calendarEvent.id, { metadata: { ...(calendarEvent.metadata || {}), main_draw_state: nextMain, main_draw_status: nextMain.status, main_draw_bracket_history: buildMainDrawBracketHistory(nextMain), player_seed: nextMain.playerSeed } });
        setCalendarEvent(saved);
      }

      await localGame.entities.Match.create({
        profile_id: profile.id,
        career_date: profile.career_date,
        date: profile.career_date || new Date().toISOString().slice(0, 10),
        location: tournament.name,
        tournament_name: tournament.name,
        team_a: [profile.sport_name, partner?.name || 'Parceiro'],
        team_b: opponent.map(b => b.name),
        score_a: matchState.setsA,
        score_b: matchState.setsB,
        winner: matchState.winner,
        result: won ? 'vitória' : 'derrota',
        match_type: 'simulada',
        notes: `${currentRound?.label || 'Torneio'} | ${getSetScoreString(matchState)}`,
      });
      let updated = await applyMatchRewards(profile, won, { skipPhysical: true });
      const physical = buildPhysicalPatch({ profile: updated, tournament, roundLabel: currentRound?.label, won, matchesThisWeek: Number(profile.matches_this_week) || 0, date: profile.career_date || new Date().toISOString().slice(0, 10) });
      updated = await localGame.entities.PlayerProfile.update(updated.id, physical.patch);
      setPhysicalReport(physical);
      await updateTeamRanking(profile, partner, won);
      // Record partnership match result for chemistry evolution
      const activeP = await getActivePartnership(profile.id);
      if (activeP) {
        recordPartnershipMatch(activeP.id, won, tournament.name).catch(() => {});
      }
      incrementMissionProgress(profile.id, 'join_tournament').catch(() => {});
      tournamentHistoryRef.current.push({
        round: currentRound?.label || `Rodada ${roundIdx + 1}`,
        team_a: `${profile.sport_name} & ${partner?.name || 'Parceiro'}`,
        team_b: opponent.map(b => b.name).join(' & '),
        winner: won ? `${profile.sport_name} & ${partner?.name || 'Parceiro'}` : opponent.map(b => b.name).join(' & '),
        score: getSetScoreString(matchState),
      });
      setProfile(updated);
      onProfileUpdate?.(updated);
      setLastResult({ won, matchState });

      if (won) {
        if (roundIdx + 1 >= rounds.length) {
          await applyTournamentCompletion(updated, rounds.length, nextMain);
          setPhase('champion');
        } else {
          setPhase('round_result');
        }
      } else {
        await applyTournamentCompletion(updated, roundIdx, nextMain);
        setPhase('eliminated');
      }
      onComplete?.();
    } catch (e) {
      console.error(e);
      toast({ title: 'Erro', description: 'Falha ao salvar.', variant: 'destructive' });
      setPhase('eliminated');
    }
  }

  async function applyTournamentCompletion(p, roundsWon, completedMainState = mainDrawState) {
    const rewards = getTournamentRewards(tournament.tier, roundsWon);
    const isChampion = roundsWon >= rounds.length;
    try {
      const updates = {
        coins: (p.coins || 0) + rewards.coins,
        xp: (p.xp || 0) + rewards.xp,
        level: levelForXp((p.xp || 0) + rewards.xp),
        rank_points: (Number(p.rank_points) || 0) + rewards.rankPoints,
      };
      if (isChampion) {
        updates.tournaments_won = (p.tournaments_won || 0) + 1;
        updates.titles = [...(p.titles || []), tournament.name];
      }
      const updated = await localGame.entities.PlayerProfile.update(p.id, updates);
      await addTeamRankingPoints(p, partner, rewards.rankPoints);
      if (isChampion) {
        incrementMissionProgress(p.id, 'win_tournament').catch(() => {});
        await addTeamTitle(p, partner, tournament.name);
        // Record partnership title for chemistry boost
        const activeP = await getActivePartnership(p.id);
        if (activeP) {
          recordPartnershipTitle(activeP.id).catch(() => {});
        }
        const finalMatch = tournamentHistoryRef.current[tournamentHistoryRef.current.length - 1];
        const bracketHistory = tournamentHistoryRef.current.map((match) => ({
          round: match.round,
          matches: [{
            team_a: match.team_a,
            team_b: match.team_b,
            winner: match.winner,
            score: match.score,
          }],
        }));
        await localGame.entities.Tournament.update(tournament.id, {
          status: 'finalizado',
          champion: `${p.sport_name} & ${partner?.name || 'Parceiro'}`,
          runner_up: finalMatch?.team_b || 'Dupla finalista',
          bracket_history: bracketHistory,
          current_phase: 'concluido',
        });
      }
      // Resolve the calendar event for this tournament
      try {
        const events = await localGame.entities.CalendarEvent.filter({
          profile_id: p.id,
          related_id: tournament.id,
          status: 'scheduled',
        });
        if (events && events.length > 0) {
          await localGame.entities.CalendarEvent.update(events[0].id, {
            status: 'completed',
            requires_decision: false,
            metadata: { ...(events[0].metadata || {}), main_draw_state: completedMainState, main_draw_status: isChampion ? 'champion' : 'eliminated', main_draw_bracket_history: buildMainDrawBracketHistory(completedMainState), finish_label: isChampion ? 'Campeão' : (currentRound?.label || 'Participação') },
          });
        }
      } catch (e) { console.error('calendar event resolve', e); }
      setProfile(updated);
      onProfileUpdate?.(updated);
      setTournamentRewards(rewards);
    } catch (e) { console.error(e); }
  }

  async function abandonTournament() {
    const reason = profile?.injury_status === 'lesionado' ? `Abandono por ${profile.injury_type || 'lesão'}` : 'Abandono por desgaste físico';
    try {
      if (calendarEvent?.id) {
        await localGame.entities.CalendarEvent.update(calendarEvent.id, {
          status: 'completed', requires_decision: false,
          metadata: { ...(calendarEvent.metadata || {}), main_draw_status: 'withdrawn', finish_label: reason, withdrawal_reason: reason },
        });
      }
      setTournamentRewards({ coins: 0, xp: 10, rankPoints: 0 });
      const xp = (Number(profile.xp) || 0) + 10;
      const updated = await localGame.entities.PlayerProfile.update(profile.id, { xp, level: levelForXp(xp) });
      setProfile(updated); onProfileUpdate?.(updated); setPhase('withdrawn'); onComplete?.();
    } catch (error) { console.error(error); toast({ title: 'Erro', description: 'Não foi possível registrar o abandono.', variant: 'destructive' }); }
  }

  function nextRound() {
    setRoundIdx(tournamentStage === 'qualifying' ? Number(qualifyingState?.currentRound || roundIdx + 1) : Number(mainDrawState?.currentRound || roundIdx + 1));
    setLastResult(null);
    savedRef.current = false;
    setPhase('intro');
  }

  async function enterMainDraw() {
    if (calendarEvent?.id) {
      const metadata = {
        ...(calendarEvent.metadata || {}),
        qualifying_status: 'qualified',
        qualifying_state: qualifyingState,
        promoted_to_main_draw: true,
      };
      const savedEvent = await localGame.entities.CalendarEvent.update(calendarEvent.id, { metadata });
      setCalendarEvent(savedEvent);
    }
    setTournamentStage('main');
    setMainDrawState(null);
    setRoundIdx(0);
    setLastResult(null);
    savedRef.current = false;
    setPhase('intro');
  }

  const playerOvr = overallRating(profile);
  const partnerOvr = partner ? overallRating(partner) : 0;
  const championRewards = getTournamentRewards(tournament.tier, rounds.length);
  const participationRewards = getTournamentRewards(tournament.tier, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4" onClick={onClose}>
      <div className="glass rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-black flex items-center gap-2">
            <TierIcon className={`h-5 w-5 ${tierStyle.color}`} /> {tournament.name}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Round progress */}
        <div className="flex items-center gap-1 mb-4">
          {rounds.map((r, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full transition-all ${i < roundIdx ? 'bg-primary' : i === roundIdx ? 'bg-primary/50' : 'bg-secondary'}`} />
          ))}
        </div>

        <div className="mb-3 flex items-center justify-between rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">Etapa atual</span>
          <span className="text-xs font-black text-cyan-300">{tournamentStage === 'qualifying' ? 'Qualifying' : 'Chave principal'}</span>
        </div>

        {/* Intro */}
        {phase === 'intro' && (
          <div className="space-y-4">
            <div className="glass rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">{currentRound?.label}</p>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <TeamMember name={profile?.sport_name || 'Você'} ovr={playerOvr} highlight />
                  <TeamMember name={partner?.name || 'Sem parceiro'} ovr={partnerOvr} />
                </div>
                <div className="text-center px-2">
                  <span className="text-xs font-bold text-muted-foreground">VS</span>
                </div>
                <div className="flex-1 space-y-2">
                  {opponent ? opponent.map((b, i) => (
                    <TeamMember key={i} name={b.name} ovr={overallRating(b)} rightAlign />
                  )) : (
                    <><div className="h-10 rounded-lg bg-secondary/30 animate-pulse" /><div className="h-10 rounded-lg bg-secondary/30 animate-pulse" /></>
                  )}
                </div>
              </div>
            </div>

            {teamRank.rank > 0 && (
              <div className="glass rounded-xl p-2 text-center">
                <span className="text-[10px] text-muted-foreground">Cabeça de chave </span>
                <span className="text-xs font-bold text-primary">#{teamRank.rank}</span>
                <span className="text-[10px] text-muted-foreground"> de {teamRank.total} duplas</span>
              </div>
            )}

            <div className="glass rounded-xl p-3">
              <div className="flex items-center justify-around">
                <Reward icon={Coins} value={championRewards.coins} color="text-yellow-400" label="Moedas" />
                <Reward icon={Zap} value={championRewards.xp} color="text-primary" label="XP" />
                <Reward icon={Star} value={championRewards.rankPoints} color="text-cyan-400" label="Pontos" />
              </div>
              <p className="text-[9px] text-muted-foreground text-center mt-2">
                Prêmio do título · participação garante {participationRewards.rankPoints} pts
              </p>
            </div>

            {(() => {
              const medical = getCoachPhysicalRecommendation(profile, tournament, currentRound?.label);
              return (
                <div className="glass rounded-xl p-3 border border-orange-500/20 bg-orange-500/5 space-y-2">
                  <div className="flex items-center justify-between"><span className="text-[10px] uppercase font-bold text-muted-foreground">Avaliação física</span><span className="text-xs font-black text-orange-300">{medical.level}</span></div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-[9px] text-muted-foreground">Energia após</p><p className="text-xs font-bold">{medical.projectedEnergy}%</p></div>
                    <div><p className="text-[9px] text-muted-foreground">Fadiga após</p><p className="text-xs font-bold">{medical.projectedFatigue}%</p></div>
                    <div><p className="text-[9px] text-muted-foreground">Risco lesão</p><p className="text-xs font-bold">{Math.round(medical.injuryRisk * 100)}%</p></div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{medical.advice}</p>
                </div>
              );
            })()}

            <button
              onClick={() => {
                if (isInjured(profile)) {
                  toast({ title: 'Lesionado', description: `Recupera em ${injuryRecoveryDays(profile)} dias.` });
                  return;
                }
                if ((profile.energy || 0) < TOURNAMENT_ENERGY_COST) {
                  toast({ title: 'Energia insuficiente', description: `Você precisa de ${TOURNAMENT_ENERGY_COST} energia. Descanse ou recupere antes de jogar.`, variant: 'destructive' });
                  return;
                }
                savedRef.current = false;
                setPhase('match');
              }}
              className="w-full py-3 rounded-xl bg-green-500 text-white font-bold text-sm hover:bg-green-600 transition-colors shadow-[0_0_20px_rgba(34,197,94,0.3)] flex items-center justify-center gap-2"
            >
              <Play className="h-4 w-4" /> Jogar {currentRound?.label}
            </button>
            {(profile.energy || 0) < 35 && <button onClick={abandonTournament} className="w-full py-2 rounded-xl border border-red-500/30 text-red-300 text-xs font-bold hover:bg-red-500/10">Abandonar torneio e iniciar recuperação</button>}
          </div>
        )}

        {phase === 'withdrawn' && (
          <div className="space-y-4 text-center">
            <div className="glass rounded-2xl p-6 border border-orange-500/40 bg-orange-500/5">
              <Shield className="h-12 w-12 text-orange-400 mx-auto mb-2" />
              <p className="text-xl font-black text-orange-300">Torneio abandonado</p>
              <p className="text-sm text-muted-foreground mt-1">A equipe priorizou sua recuperação física. Você recebeu 10 XP.</p>
            </div>
            <button onClick={onClose} className="w-full py-3 rounded-xl bg-secondary font-bold text-sm">Fechar</button>
          </div>
        )}

        {/* Match */}
        {phase === 'match' && opponent && (
          <LiveMatch
            teamA={[{ ...profile, _chemistryBonus: getChemistryBonus(profile.partner_chemistry || 50), _energyPenalty: getEnergyPenalty(profile.energy || 100) }, partner].filter(Boolean)}
            teamB={opponent}
            initialTacticId="equilibrado"
            onFinished={handleMatchFinished}
          />
        )}

        {/* Round result */}
        {phase === 'round_result' && lastResult && (
          <div className="space-y-4 text-center">
            <div className="glass rounded-2xl p-6 border border-primary/40 bg-primary/5">
              <CheckCircle className="h-12 w-12 text-primary mx-auto mb-2" />
              <p className="text-xl font-black text-primary">Vitória!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {currentRound?.label}: {lastResult.matchState.setsA}-{lastResult.matchState.setsB}
              </p>
              {physicalReport && <p className="text-xs text-muted-foreground mt-2">Energia: {profile.energy}% · Fadiga: {profile.fatigue || 0}%{physicalReport.injury?.injured ? ` · Lesão: ${physicalReport.injury.type}` : ''}</p>}
            </div>
            <button
              onClick={nextRound}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              {rounds[roundIdx + 1]?.label} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {phase === 'qualified' && (
          <div className="space-y-4 text-center">
            <div className="glass rounded-2xl p-6 border border-cyan-500/40 bg-cyan-500/5">
              <Shield className="h-14 w-14 text-cyan-400 mx-auto mb-2" />
              <p className="text-2xl font-black text-cyan-300">CLASSIFICADO!</p>
              <p className="text-sm text-muted-foreground mt-1">Sua dupla garantiu vaga na chave principal.</p>
            </div>
            <button onClick={enterMainDraw} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2">
              Entrar na chave principal <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Champion */}
        {phase === 'champion' && (
          <div className="space-y-4 text-center">
            <div className="glass rounded-2xl p-6 border border-amber-500/40 bg-amber-500/5">
              <Crown className="h-16 w-16 text-amber-400 mx-auto mb-2" />
              <p className="text-2xl font-black text-amber-400">CAMPEÃO!</p>
              <p className="text-sm text-muted-foreground mt-1">{tournament.name}</p>
            </div>
            {tournamentRewards && (
              <div className="glass rounded-xl p-4 flex items-center justify-around">
                <Reward icon={Coins} value={`+${tournamentRewards.coins}`} color="text-yellow-400" label="Moedas" />
                <Reward icon={Zap} value={`+${tournamentRewards.xp}`} color="text-primary" label="XP" />
                <Reward icon={Star} value={`+${tournamentRewards.rankPoints}`} color="text-cyan-400" label="Pontos" />
              </div>
            )}
            <button onClick={onClose} className="w-full py-3 rounded-xl bg-secondary/50 text-foreground font-bold text-sm hover:bg-secondary transition-colors">
              Fechar
            </button>
          </div>
        )}

        {/* Eliminated */}
        {phase === 'eliminated' && lastResult && (
          <div className="space-y-4 text-center">
            <div className="glass rounded-2xl p-6 border border-destructive/40 bg-destructive/5">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
              <p className="text-xl font-black text-destructive">Eliminado</p>
              <p className="text-sm text-muted-foreground mt-1">
                {currentRound?.label}: {lastResult.matchState.setsA}-{lastResult.matchState.setsB}
              </p>
              {physicalReport && <p className="text-xs text-muted-foreground mt-2">Energia: {profile.energy}% · Fadiga: {profile.fatigue || 0}%{physicalReport.injury?.injured ? ` · Lesão: ${physicalReport.injury.type}` : ''}</p>}
            </div>
            {tournamentRewards && (
              <div className="glass rounded-xl p-4 flex items-center justify-around">
                <Reward icon={Coins} value={`+${tournamentRewards.coins}`} color="text-yellow-400" label="Moedas" />
                <Reward icon={Zap} value={`+${tournamentRewards.xp}`} color="text-primary" label="XP" />
                <Reward icon={Star} value={`+${tournamentRewards.rankPoints}`} color="text-cyan-400" label="Pontos" />
              </div>
            )}
            <button onClick={onClose} className="w-full py-3 rounded-xl bg-secondary/50 text-foreground font-bold text-sm hover:bg-secondary transition-colors">
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamMember({ name, ovr, highlight, rightAlign }) {
  return (
    <div className={`flex items-center gap-2 ${rightAlign ? 'flex-row-reverse text-right' : ''}`}>
      <div className={`h-8 w-8 rounded-lg ${highlight ? 'bg-primary/20' : 'bg-secondary/60'} flex items-center justify-center shrink-0`}>
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold truncate">{name}</p>
        <p className="text-[9px] text-muted-foreground tabular-nums">OVR {ovr}</p>
      </div>
    </div>
  );
}

function Reward({ icon: Icon, value, color, label }) {
  return (
    <div className="flex items-center gap-1">
      <Icon className={`h-4 w-4 ${color}`} />
      <div>
        <p className="text-sm font-black tabular-nums">{value}</p>
        <p className="text-[8px] text-muted-foreground uppercase">{label}</p>
      </div>
    </div>
  );
}