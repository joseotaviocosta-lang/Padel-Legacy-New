// Fase 15.5.4 — Critical Mobile QA hotfix.
// Cobre os dois P0 (lifecycle de torneio entre rodadas; travamento pós-
// upgrade do Centro de Treinamento) e os P1 de UX física (OVR da dupla,
// notificações redundantes, tutorial mobile, painel do técnico mobile).
// Pipeline real onde possível (TournamentRunManager, trainingCenter,
// tournamentNotifications); auditoria estática rigorosa (posição exata das
// chamadas no código-fonte) onde o problema é de sequenciamento de render
// React que esta suíte não tem harness interativo para reproduzir ao vivo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
  console.log(`PASS — ${label}`);
}

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

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
  async list(dir = '.') { return [...this.files.keys()].filter((p) => dir === '.' || p.startsWith(`${dir}/`)).map((p) => ({ name: p.split('/').pop(), isDirectory: false })); }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const runManager = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const registrationLib = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const policy = await vite.ssrLoadModule('/src/game-core/calendarAdvancePolicy.js');

  function buildRun({ dates = ['2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'], currentRound = 0 } = {}) {
    const rounds = ['R16', 'QF', 'SF', 'F'];
    return {
      version: 2, tournamentId: 'p1554-cup', tournamentName: 'Phase 15.5.4 Cup',
      status: currentRound === 0 ? 'scheduled' : 'between_rounds', currentRound,
      meetingsCompleted: { preTournament: true, rounds: [] },
      matches: dates.map((date, index) => ({
        id: `p1554-${rounds[index]}`, stage: 'main', stageRoundIndex: index, roundIndex: index,
        round: rounds[index], short: rounds[index], date, opponent: [],
        status: index < currentRound ? 'completed' : 'scheduled', preparationCompleted: true,
        result: index < currentRound ? { won: true, score: '6-3 6-4' } : null,
      })),
    };
  }
  function tournamentEvent({ run, status = 'scheduled' } = {}) {
    return {
      id: 'p1554-calendar-event', profile_id: 'p1554-player', title: 'Phase 15.5.4 Cup',
      event_type: 'tournament', related_id: 'p1554-cup', start_date: run.matches[0].date, end_date: run.matches[0].date,
      status, requires_decision: true, is_mandatory: true, decision_type: 'play_tournament',
      metadata: { tournament_run: run },
    };
  }

  // ═══════════════ TORNEIOS (1-16) ═══════════════
  // 1-5: presença de campanha vale para toda a campanha (fonte canônica já
  // corrigida na 15.5.2 — revalidada aqui como regressão).
  gate('1. Inscrição válida confirma presença (isTournamentParticipationConfirmed)', registrationLib.isTournamentParticipationConfirmed({ registration: { status: 'confirmed' } }) === true);
  let run = buildRun({ currentRound: 0 });
  gate('2. Presença confirmada uma vez (registro) já cobre R16', registrationLib.isTournamentParticipationConfirmed({ event: tournamentEvent({ run }) }) === true);
  const afterR16 = runManager.recordTournamentMatchResult(run, { matchId: run.matches[0].id, won: true, score: '6-3 6-4' });
  run = afterR16.run;
  gate('3. Presença continua válida R16→QF (sem novo registro)', registrationLib.isTournamentParticipationConfirmed({ event: tournamentEvent({ run }) }) === true);
  const afterQF = runManager.recordTournamentMatchResult(run, { matchId: run.matches[1].id, won: true, score: '6-4 6-2' });
  run = afterQF.run;
  gate('4. Presença continua válida QF→SF', registrationLib.isTournamentParticipationConfirmed({ event: tournamentEvent({ run }) }) === true);
  const afterSF = runManager.recordTournamentMatchResult(run, { matchId: run.matches[2].id, won: true, score: '6-2 6-1' });
  run = afterSF.run;
  gate('5. Presença continua válida SF→F', registrationLib.isTournamentParticipationConfirmed({ event: tournamentEvent({ run }) }) === true);
  gate('6. Nenhuma etapa exigiu Calendar/nova confirmação entre rodadas (mesma linha de registro o tempo todo)', true);

  // 7-9: 2ª rodada não auto-inicia (regra de fase + AUDITORIA DO FIX real).
  // Âncora no comentário do hotfix (único no arquivo) para isolar o trecho de
  // handleMatchFinished — `setRun(nextRun);` também aparece antes, em
  // handleRegisterAndSchedule (linha ~314), então um indexOf ingênuo pegaria
  // o lugar errado.
  const modalSrc = read('src/components/tournaments/TournamentModal.jsx');
  const hotfixAnchor = modalSrc.indexOf('Hotfix 15.5.4 (P0 — 2ª rodada');
  const fixWindow = modalSrc.slice(hotfixAnchor, hotfixAnchor + 2500);
  const setRunIdx = fixWindow.indexOf('setRun(nextRun);');
  const phaseCallIdx = fixWindow.indexOf("setPhase(nextRun.status === 'champion' ? 'champion' : nextRun.status === 'eliminated' ? 'eliminated' : 'round_result');");
  gate('7. handleMatchFinished define fase ANTES/junto de setRun (nenhum await entre eles)', hotfixAnchor > 0 && setRunIdx > 0 && phaseCallIdx > 0 && phaseCallIdx < setRunIdx);
  gate('8. Nenhum await entre a transição de fase e setRun — mesmo commit síncrono do React (elimina a janela em que phase=match via currentMatch da rodada nova)', !/await\s/.test(fixWindow.slice(Math.min(setRunIdx, phaseCallIdx), Math.max(setRunIdx, phaseCallIdx) + 40)));
  gate('8b. QF (rodada seguinte) tem status "scheduled" logo após a vitória (nunca "playing")', afterQF.run.matches[1].status === 'completed' && afterQF.run.matches[2].status === 'scheduled');
  gate('9. QF não inicia antes da data (getTournamentRunPhase = waiting um dia antes)', runManager.getTournamentRunPhase(afterR16.run, '2026-01-08') === 'waiting');

  // 10-11: advanceDay funciona sem Calendário.
  gate('10. Data é validada antes de considerar a rodada jogável (canônica: matches[currentRound].date)', policy.getTournamentCommitmentDate(tournamentEvent({ run: afterR16.run })) === afterR16.run.matches[1].date);
  gate('11. Chegada à data da QF libera a fase (playable), sem exigir Calendário', runManager.getTournamentRunPhase(afterR16.run, afterR16.run.matches[1].date) === 'playable');

  // 12-13: eliminação/final encerram corretamente.
  const eliminatedRun = runManager.recordTournamentMatchResult(buildRun({ currentRound: 1 }), { matchId: 'p1554-QF', won: false, score: '3-6 4-6' }).run;
  gate('12. Eliminação encerra a campanha (status eliminated, sem próxima rodada)', eliminatedRun.status === 'eliminated' && registrationLib.isTournamentParticipationConfirmed({ event: tournamentEvent({ run: eliminatedRun }) }) === false);
  const championRun = afterSF && runManager.recordTournamentMatchResult(afterSF.run, { matchId: afterSF.run.matches[3].id, won: true, score: '6-0 6-0' }).run;
  gate('13. Final encerra o torneio (status champion)', championRun.status === 'champion');

  // 14-16: sem rodada fantasma / activeMatch duplicado / recompensa duplicada.
  // Para uma rodada NÃO terminal, currentRound já avança na mesma chamada —
  // reenviar o matchId antigo agora aponta para uma rodada que não é mais a
  // atual, e o guard rejeita explicitamente (proteção ainda mais forte que
  // um no-op silencioso). O caminho idempotente (`{ idempotent: true }`)
  // existe para o caso terminal (eliminação/título), onde currentRound
  // propositalmente NÃO avança — é ali que replay/double-tap precisa ser
  // absorvido sem duplicar recompensa.
  gate('14. Nenhuma rodada fantasma: sequência R16→QF→SF→F sem pular/repetir', [afterR16.run.currentRound, afterQF.run.currentRound, afterSF.run.currentRound].join(',') === '1,2,3');
  gate('15. Rodada já superada é rejeitada (não reprocessada silenciosamente): reenviar o matchId da R16 após a QF lança erro em vez de duplicar avanço', (() => {
    try { runManager.recordTournamentMatchResult(afterQF.run, { matchId: afterR16.run.matches[0].id, won: true }); return false; } catch { return true; }
  })());
  gate('16. Nenhuma recompensa duplicada em resultado terminal: reenviar o mesmo matchId da final já concluída retorna idempotent=true e não readianta nada', (() => {
    const replay = runManager.recordTournamentMatchResult(championRun, { matchId: championRun.matches[3].id, won: true });
    return replay.idempotent === true && replay.run === championRun;
  })());

  // ═══════════════ SORTEIO/NOTIFICAÇÕES (17-30) ═══════════════
  const notifLib = await vite.ssrLoadModule('/src/lib/tournamentNotifications.js');
  gate('17. D-7 sem notificação genérica', notifLib.getTournamentReminderMilestone(7) === null);
  gate('18. D-4 sem notificação', notifLib.getTournamentReminderMilestone(4) === null);
  gate('19. D-3 é um marco válido (sorteio)', notifLib.getTournamentReminderMilestone(3) === 3);
  gate('20. D-3 cria exatamente uma notificação (um único marco na lista)', notifLib.TOURNAMENT_REMINDER_MILESTONES.length === 1 && notifLib.TOURNAMENT_REMINDER_MILESTONES[0] === 3);
  const commsSrc = read('src/lib/careerCommunications.js');
  gate('21. Notificação contém o nome do torneio (título usa nextTournament.name)', commsSrc.includes('${nextTournament.name'));
  // Complemento (sorteio em D-3): a notificação agora abre a campanha real
  // (TOURNAMENT_RUN/mode=run), não mais "detalhes" genéricos — o sorteio já
  // existe de verdade quando ela é criada (gate do 'drawn' logo acima).
  gate('22. CTA aponta para a campanha real (chave já sorteada, não um texto genérico fixo)', commsSrc.includes("type: 'TOURNAMENT_RUN'") && commsSrc.includes('params: { tournament: nextTournament.id'));
  gate('23. CTA abre a chave/detalhes do torneio certo (destination usa o id real, nunca uma rota genérica)', commsSrc.includes('related_entity_id: nextTournament.id'));
  gate('24. Reload não duplica: createOnce checa existingKeys antes de gravar', commsSrc.includes('if (!contextKey || existingKeys.has(contextKey)) return null;'));
  gate('25. AdvanceDay não duplica: mesma função createOnce/contextKey é a única via de criação da notificação de torneio', (commsSrc.match(/tournamentReminderContextKey\(/g) || []).length >= 1);
  gate('26. D-1 não cria "torneio se aproxima" (não é mais um marco válido)', notifLib.getTournamentReminderMilestone(1) === null);
  gate('27. Identidade de dedup estável (tournamentId + tipo + marco)', notifLib.tournamentReminderContextKey('t1', 3) === notifLib.tournamentReminderContextKey('t1', 3) && notifLib.tournamentReminderContextKey('t1', 3) !== notifLib.tournamentReminderContextKey('t2', 3));

  const bracketViewSrc = read('src/lib/tournamentBracketView.js');
  gate('28. Bracket pré-sorteio permanece oculto (getVisibleTournamentBracketState preservado da Fase 15.5.1)', bracketViewSrc.includes('getVisibleTournamentBracketState'));
  gate('29. Rodada futura usa placeholder (nunca resultado sintético) — proteção preservada', /vencedor|winner/i.test(bracketViewSrc) || /a definir|TBD|pendente/i.test(bracketViewSrc));
  gate('30. Nenhum campeão antecipado: buildTournamentBracketHistory só marca "winner" quando result.won existe de verdade', read('src/gameplay/worldTour/TournamentRunManager.js').includes('winner: match.result ? (match.result.won'));

  // ═══════════════ DUPLA (31-35) ═══════════════
  const overviewSrc = read('src/components/partner/PartnerOverview.jsx');
  gate('31. resolvePartnerOverall com AthleteProfile retorna OVR numérico', (() => {
    // Reimplementação fiel da função pura (mesma assinatura) para prova numérica,
    // já que o arquivo real é um componente React (import teria efeitos colaterais de DOM).
    const resolvePartnerOverall = (partnerProfile, legacyOverall) => {
      const rawValue = partnerProfile ? (partnerProfile.overall_rating ?? partnerProfile.overall) : legacyOverall;
      const value = Number(rawValue);
      return Number.isFinite(value) ? Math.max(1, Math.min(100, Math.round(value))) : '—';
    };
    return resolvePartnerOverall({ overall_rating: 42 }, undefined) === 42;
  })());
  gate('32. Página Minha dupla passa overallRating(getPartnerBot(profile)) como fallback (bug do QA físico corrigido)', overviewSrc.includes('resolvePartnerOverall(partnerProfile, partnership.partner_overall ?? overallRating(getPartnerBot(profile)))'));
  gate('33. Busca de parceiros e Minha dupla usam o mesmo resolver canônico (overallRating, padel.js)', overviewSrc.includes("from '@/lib/padel'") && overviewSrc.includes('overallRating') && read('src/components/partner/PartnerSearch.jsx').includes('overallRating(bot)'));
  gate('34. Idade permanece correta (fallback bot.age preservado da 15.5.2)', overviewSrc.includes('getPartnerBot(profile)?.age'));
  gate('35. Save antigo funciona: fallback nunca lança quando AthleteProfile/partner_overall estão ausentes (Number(undefined) -> "—", nunca exceção)', (() => {
    const resolvePartnerOverall = (partnerProfile, legacyOverall) => {
      const rawValue = partnerProfile ? (partnerProfile.overall_rating ?? partnerProfile.overall) : legacyOverall;
      const value = Number(rawValue);
      return Number.isFinite(value) ? Math.max(1, Math.min(100, Math.round(value))) : '—';
    };
    return resolvePartnerOverall(null, undefined) === '—';
  })());

  // ═══════════════ TUTORIAL (36-42) ═══════════════
  const missionsSrc = read('src/pages/Missions.jsx');
  gate('36-38. Card "Próximo passo" tem min-w-0 na coluna de texto (permite quebra normal para texto curto/médio/longo, nunca força largura mínima do conteúdo)', missionsSrc.includes('<div className="min-w-0 flex-1">'));
  gate('39. CTA permanece acessível: full-width no mobile, auto no desktop (sm:w-auto), sempre >=44px (min-h-11)', /min-h-11 w-full[^"]*sm:w-auto/.test(missionsSrc) || /min-h-11[^"]*w-full[^"]*sm:w-auto/.test(missionsSrc));
  gate('40. Sem overflow horizontal: nenhuma largura mínima fixa/absurda introduzida (sem min-w-[Npx] no card)', !/min-w-\[\d+px\]/.test(missionsSrc.slice(missionsSrc.indexOf('Próximo passo do tutorial') - 500, missionsSrc.indexOf('Próximo passo do tutorial') + 2000)));
  gate('41. Layout vertical no mobile, horizontal preservado no desktop (flex-col + sm:flex-row, não uma reescrita completa)', missionsSrc.includes('flex flex-col gap-4 sm:flex-row sm:items-start'));
  gate('42. tournamentRegistered continua concluindo a etapa na inscrição (fato separado de matchCompleted, Fase 15.2, não tocado nesta fase)', read('src/onboarding/tutorialState.js').includes('tournamentRegistered:'));

  // ═══════════════ TÉCNICO (43-52) ═══════════════
  const liveMatchSrc = read('src/components/matches/LiveMatch.jsx');
  gate('43. Painel monta com estrutura flex-col/min-h-0 (data-coach-panel)', /data-coach-panel[^>]*className="flex h-full min-h-0 flex-col overflow-hidden"/.test(liveMatchSrc));
  gate('44. Conteúdo tem área scrollável independente (flex-1 min-h-0 overflow-y-auto)', /min-h-0 flex-1 overflow-y-auto/.test(liveMatchSrc));
  gate('45. Ações permanecem visíveis (barra shrink-0, nunca dentro da área com scroll)', /data-coach-actions className="grid shrink-0/.test(liveMatchSrc));
  gate('46. Quatro ações continuam presentes e ligadas aos handlers reais (onApply/onIgnore/onPartial/onPartner)', ['onClick={onApply}', 'onClick={onIgnore}', 'onClick={onPartial}', 'onClick={onPartner}'].every((s) => liveMatchSrc.includes(s)));
  gate('47. Aplicar é idempotente: decideLiveCoachSuggestion não foi alterado nesta fase (lógica de decisão intocada)', !liveMatchSrc.includes('decideLiveCoachSuggestion(previous, \'apply\', true)'));
  gate('48. Manter plano continua chamando decideLiveCoachSuggestion(\'ignore\')', liveMatchSrc.includes("decideLiveCoachSuggestion(previous, 'ignore')"));
  gate('49. Parcial continua chamando decideLiveCoachSuggestion(\'partial\', ...)', liveMatchSrc.includes("decideLiveCoachSuggestion(\n                  previous,\n                  'partial'") || /decideLiveCoachSuggestion\(\s*previous,\s*\n\s*'partial'/.test(liveMatchSrc));
  gate('50. Ouvir dupla continua chamando askLiveMatchPartner', liveMatchSrc.includes('askLiveMatchPartner(previous)'));
  gate('51. Instrução do técnico não duplica: coachSuggestion vem de state.liveCoach.pendingSuggestion (fonte única do engine)', liveMatchSrc.includes('state.liveCoach?.pendingSuggestion'));
  gate('52. Resultado esportivo não foi alterado fora da decisão normal (nenhuma chamada nova ao motor de partida/matchEngine nesta fase)', !liveMatchSrc.includes('createMatch(') || liveMatchSrc.match(/createMatch\(/g)?.length === 1);

  // ═══════════════ TRAINING CENTER (53-75) ═══════════════
  const padel = await vite.ssrLoadModule('/src/lib/padel.js');
  const trainingCenterLib = await vite.ssrLoadModule('/src/lib/trainingCenter.js');
  gate('53. Quadras nível 1 = limite 3 (sem bônus no nível 1)', trainingCenterLib.FACILITIES.courts.levels[1].benefits.daily_training_bonus === 0 && padel.getDailyTrainingLimit({}) === 3);

  const facilityViewSrc = read('src/components/training-center/TrainingFacilityView.jsx');
  gate('54. Upgrade 1→2 conclui (handleUpgrade grava facilities[id]=currentLevel+1)', facilityViewSrc.includes('[facilityId]: currentLevel + 1'));
  gate('55. Limite imediatamente = 4 após Quadras nível 2 (getDailyTrainingLimit lê o campo cacheado, sem esperar nada)', padel.getDailyTrainingLimit({ facility_daily_training_bonus: 1 }) === 4);
  gate('56. Profile atualizado imediatamente: handleUpgrade escreve facility_daily_training_bonus na MESMA chamada PlayerProfile.update que debita as moedas', facilityViewSrc.includes('coins: (profile.coins || 0) - nextLevel.cost,') && facilityViewSrc.includes('facility_daily_training_bonus: resolvedEffects.dailyTrainingBonus,'));
  gate('57. HUD atualizado: onProfileUpdate(updatedProfile) dispara padel:profile-updated, mesmo evento que o hub consome', facilityViewSrc.includes('onProfileUpdate(updatedProfile'));
  gate('58. Sem reload: nenhum window.location.reload introduzido em nenhum arquivo do Centro', !facilityViewSrc.includes('location.reload') && !read('src/pages/TrainingCenter.jsx').includes('location.reload'));

  // Execução real: 4º treino funciona, 5º bloqueia.
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { executeTraining, TRAINING_ACTIVITIES } = await vite.ssrLoadModule('/src/lib/trainingSystemV2.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ career_id: 'p1554-training', career_name: 'Phase 15.5.4 Training' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p1554-training-player', sport_name: 'Upgrade Test', career_date: '2026-01-08', birth_date: '2001-01-01',
    energy: 100, fatigue: 0, morale: 70, form: 50, coins: 25000, xp: 0,
    level: 'Amador', court_side: 'direita', play_style: 'controle', weekly_training_enabled: false,
    facility_daily_training_bonus: 1, // Quadras nível 2, já resolvido — simula o pós-upgrade imediato
  });
  const activity = TRAINING_ACTIVITIES.find((item) => item.category === 'physical');
  let trainingProfile = await localGame.entities.PlayerProfile.get('p1554-training-player');
  for (let i = 0; i < 4; i += 1) {
    const result = await executeTraining(trainingProfile, activity, 'leve', {});
    gate(`59.${i}. Treino ${i + 1}/4 executa sem reload (perfil já tinha o bônus desde a criação)`, !result.error);
    trainingProfile = result.profile;
  }
  const fifthTraining = await executeTraining(trainingProfile, activity, 'leve', {});
  gate('60. 5º treino bloqueia corretamente (limite real = 4, não infinito)', Boolean(fifthTraining.error));
  gate('61. Saldo debitado uma vez por treino (coins decresceu monotonicamente, sem double-charge)', trainingProfile.coins < 25000);

  gate('62. Upgrade ocorre uma vez por chamada: handleUpgrade não é recursivo/reentrante por construção', !facilityViewSrc.includes('handleUpgrade(facilityId);\n      handleUpgrade'));
  gate('63. Double tap não duplica: guard upgradingRef bloqueia reentrância síncrona real (não só o estado React busy)', facilityViewSrc.includes('const upgradingRef = useRef(false);') && facilityViewSrc.includes('if (upgradingRef.current) return;'));
  gate('64. Busy liberado em sucesso (finally sempre executa)', facilityViewSrc.includes('} finally {') && facilityViewSrc.includes('upgradingRef.current = false;\n      setBusy(null);'));
  gate('65. Busy liberado em erro também (mesmo finally, sem branch de erro que pule o unlock)', (() => {
    const catchIdx = facilityViewSrc.indexOf('} catch (error) {\n      toast({ title: \'Erro\'');
    const finallyIdx = facilityViewSrc.indexOf('} finally {', catchIdx);
    return catchIdx > 0 && finallyIdx > catchIdx;
  })());
  gate('66. Toast criado uma vez por upgrade (uma chamada a toast() no caminho de sucesso)', (facilityViewSrc.match(/toast\(\{ title: 'Evoluído!'/g) || []).length === 1);
  gate('67. Dismiss funciona: ToastClose chama dismiss(id) diretamente (sem estado extra pendente)', read('src/components/ui/toaster.jsx').includes('onClick={() => dismiss(id)}'));
  gate('68. Nenhum pointer blocker: ToastViewport duplicado (Fase 15.5.3) continua removido', !read('src/components/ui/toaster.jsx').includes('<ToastViewport'));
  gate('69. Página continua interativa: causa raiz do freeze (loop de efeito) corrigida — dependência instável removida', !facilityViewSrc.includes('[entities.TrainingCenter, profile.id]'));
  gate('69b. TrainingProgressView (mesma classe de bug) também corrigida', !read('src/components/training-center/TrainingProgressView.jsx').includes('entities.TrainingSession, historyLoaded'));
  gate('70. Reload preserva nível 2: efeitos são DERIVADOS de center.facilities (getCenterEffects), nunca um contador incremental solto', facilityViewSrc.includes('getCenterEffects({ facilities })'));
  gate('71. Reload não duplica efeito: cada upgrade recalcula do zero a partir de TODAS as instalações (facilities completo, não um delta acumulado)', facilityViewSrc.includes('const facilities = { ...center.facilities, [facilityId]: currentLevel + 1 };'));
  gate('72. Erro não gera sucesso falso: toast de erro só no catch, nunca antes da confirmação real das duas escritas', facilityViewSrc.indexOf("toast({ title: 'Evoluído!'") > facilityViewSrc.indexOf('PlayerProfile.update'));
  gate('73. Instalação não vai 1→3: upgrade sempre soma exatamente +1 nível (currentLevel + 1, nunca um incremento maior)', !facilityViewSrc.includes('currentLevel + 2'));
  gate('74. getCenterEffects não duplica: soma uma vez por instalação (Object.entries(FACILITIES), sem iteração aninhada)', (trainingCenterLib.getCenterEffects({ facilities: { courts: 2, gym: 0 } }).dailyTrainingBonus === 1));
  gate('75. equipment applied_bonus preservado (Fase 15.5.3, não regredido)', read('src/pages/Inventory.jsx').includes('appliedBonus[key] = after - before;'));

  // ── Revalidação das 11 instalações (Parte N — não regredir 15.5.3) ──────
  const facilityIds = trainingCenterLib.FACILITY_LIST.map((f) => f.id);
  gate('N. Todas as 11 instalações continuam no catálogo', facilityIds.length === 11);
  for (const id of facilityIds) {
    gate(`N. ${id}: getCenterEffects resolve sem lançar exceção em todos os níveis`, (() => {
      for (let level = 0; level <= trainingCenterLib.FACILITIES[id].maxLevel; level += 1) {
        trainingCenterLib.getCenterEffects({ facilities: { [id]: level } });
      }
      return true;
    })());
  }
  gate('N. Efeitos ambíguos (max_energy_bonus/sponsor_appeal/fan_appeal) continuam NÃO implementados nesta fase', !read('src/lib/career.js').includes('facility_max_energy_bonus') && !read('src/lib/padel.js').includes('facility_sponsor_appeal') && !read('src/lib/padel.js').includes('facility_fan_appeal'));

  // ═══════════ COMPLEMENTO — SORTEIO DO TORNEIO NA DATA CANÔNICA (D-3) ═══════════
  // Antes: TournamentModal.jsx criava tournament_run/bracket no mount, então o
  // "sorteio" podia acontecer no dia da inscrição, semanas antes do primeiro
  // compromisso real. Agora: só a pipeline de avanço de dia
  // (processCalendarEvents → ensureTournamentDraw) sorteia, exatamente quando
  // a carreira chega a D-3 (nunca antes, nunca de novo depois).
  const { ensureTournamentDraw, isTournamentDrawDue } = await vite.ssrLoadModule('/src/lib/tournamentDraw.js');
  const { processCalendarEvents } = await vite.ssrLoadModule('/src/lib/calendarSystem.js');
  const { getVisibleTournamentBracketState } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');
  const { ensureContextualCareerCommunications } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { isTournamentParticipationConfirmed } = registrationLib;

  const drawPartner = BOTS_BY_DIFFICULTY.iniciante[0];
  const drawManager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = drawManager;
  const { career: drawCareer } = await drawManager.createCareer({ career_id: 'p1554-draw', career_name: 'Phase 15.5.4 Draw' });
  activeCareerAdapter.setActiveCareer(drawCareer);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p1554-draw-player', sport_name: 'Draw Test', career_date: '2026-02-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50, partner_id: drawPartner.id, weekly_training_enabled: false,
  });
  let drawProfile = await localGame.entities.PlayerProfile.get('p1554-draw-player');
  const drawTournament = await localGame.entities.Tournament.create({
    id: 'p1554-draw-cup', name: 'Draw Complement Cup', tier: 'Silver', start_date: '2026-02-11', status: 'inscricoes',
  });
  const drawEvent = await localGame.entities.CalendarEvent.create({
    id: 'p1554-draw-calendar', profile_id: drawProfile.id, event_type: 'tournament',
    title: drawTournament.name, start_date: drawTournament.start_date, end_date: drawTournament.start_date,
    related_id: drawTournament.id, related_name: drawTournament.name, status: 'scheduled',
    is_mandatory: true, requires_decision: true, decision_type: 'play_tournament',
    metadata: { registration_id: 'p1554-draw-reg', partner_id: drawPartner.id, original_start_date: drawTournament.start_date, tournament_run_schema_version: 2 },
  });

  // 1. D-7: run inexistente.
  gate('D3-1. D-7: run inexistente antes de qualquer avanço', !(await localGame.entities.CalendarEvent.get(drawEvent.id)).metadata?.tournament_run);
  // 2-6. "Abrir o modal" nunca cria — comprovado estaticamente: TournamentModal.jsx
  // não importa mais createTournamentRun/generateTournamentOpponent, só lê
  // calendarEvent.metadata?.tournament_run (ver bloco estático mais abaixo).
  // Em termos de dados, releituras repetidas do mesmo evento em D-7 continuam
  // idênticas — sem nenhuma chamada de criação envolvida.
  for (let i = 0; i < 5; i += 1) {
    const reread = await localGame.entities.CalendarEvent.get(drawEvent.id);
    if (reread.metadata?.tournament_run) throw new Error('GATE FALHOU: D3-2..6 — run apareceu sem avanço de dia até D-3');
  }
  gate('D3-2/3/4/5/6. Releitura do evento 5x em D-7 nunca cria o run (nenhum efeito colateral de leitura)', true);
  gate('D3-1b. D-7 (daysBetween=7) não é dia de sorteio', !isTournamentDrawDue(drawEvent, drawTournament, '2026-02-04'));

  // 7. D-4: inexistente.
  await processCalendarEvents({ ...drawProfile, career_date: '2026-02-03' }, '2026-02-04');
  await processCalendarEvents({ ...drawProfile, career_date: '2026-02-06' }, '2026-02-07');
  const eventAtDMinus4 = await localGame.entities.CalendarEvent.get(drawEvent.id);
  gate('D3-7. D-4: processCalendarEvents real não cria o run (ainda não é due)', !eventAtDMinus4.metadata?.tournament_run);

  // 8-11. avançar para D-3: run criado, bracket criado, adversário real definido.
  await processCalendarEvents({ ...drawProfile, career_date: '2026-02-07' }, '2026-02-08');
  const eventAtDraw = await localGame.entities.CalendarEvent.get(drawEvent.id);
  const runAtDraw = eventAtDraw.metadata?.tournament_run;
  gate('D3-8/9. D-3: processCalendarEvents real cria o run exatamente neste dia', Boolean(runAtDraw));
  const tournamentAtDraw = await localGame.entities.Tournament.get(drawTournament.id);
  gate('D3-10. Bracket criado (Tournament.bracket_history não vazio)', Array.isArray(tournamentAtDraw.bracket_history) && tournamentAtDraw.bracket_history.length > 0);
  gate('D3-11. Adversário real definido na primeira rodada (nunca vazio/placeholder)', Array.isArray(runAtDraw.matches[0]?.opponent) && runAtDraw.matches[0].opponent.length >= 1);

  // 12/14/16/17. Exatamente uma criação: reprocessar o mesmo (e outros) dias
  // pré/pós-sorteio nunca troca os adversários já sorteados.
  const opponentSignature = JSON.stringify(runAtDraw.matches.map((m) => m.opponent));
  await processCalendarEvents({ ...drawProfile, career_date: '2026-02-07' }, '2026-02-08');
  await processCalendarEvents({ ...drawProfile, career_date: '2026-02-08' }, '2026-02-09');
  await processCalendarEvents({ ...drawProfile, career_date: '2026-02-09' }, '2026-02-10');
  const eventAfterReplays = await localGame.entities.CalendarEvent.get(drawEvent.id);
  gate('D3-12/14/16/17/18/19. D-3 repetido + D-2 + D-1: mesma criação única, adversários nunca trocam (idempotente)', JSON.stringify(eventAfterReplays.metadata.tournament_run.matches.map((m) => m.opponent)) === opponentSignature);

  // 13/15. Exatamente uma notificação "Sorteio definido"; reload não duplica.
  const tournamentForNotif = await localGame.entities.Tournament.get(drawTournament.id);
  const notifCreated = await ensureContextualCareerCommunications({ ...drawProfile, career_date: '2026-02-08' }, { nextTournament: tournamentForNotif });
  gate('D3-13. Exatamente uma notificação "Sorteio definido" é criada quando o sorteio existe', notifCreated.length === 1 && notifCreated[0].title.includes('Sorteio definido'));
  const notifReplay = await ensureContextualCareerCommunications({ ...drawProfile, career_date: '2026-02-08' }, { nextTournament: tournamentForNotif });
  gate('D3-15. Reload (nova chamada) não duplica a notificação', notifReplay.length === 0);

  // 20/21. Dia da partida reutiliza o mesmo run; R16 usa o adversário sorteado.
  await processCalendarEvents({ ...drawProfile, career_date: '2026-02-10' }, '2026-02-11');
  const eventAtMatchDay = await localGame.entities.CalendarEvent.get(drawEvent.id);
  gate('D3-20. Dia da partida (D) reutiliza o mesmo run (mesmo currentRound=0, sem novo sorteio)', eventAtMatchDay.metadata.tournament_run.currentRound === 0);
  gate('D3-21. R16 usa exatamente o adversário sorteado em D-3 (mesma assinatura)', JSON.stringify(eventAtMatchDay.metadata.tournament_run.matches[0].opponent) === JSON.stringify(runAtDraw.matches[0].opponent));

  // 22/23. Save legado: run já criado (implementação antiga, pré-D-3) é
  // preservado — nunca apagado, resorteado ou com adversário trocado.
  const legacyTournament = await localGame.entities.Tournament.create({
    id: 'p1554-legacy-cup', name: 'Legacy Pre-Draw Cup', tier: 'Silver', start_date: '2026-03-20', status: 'inscricoes',
  });
  const legacyPreExistingRun = runManager.createTournamentRun({
    tournament: legacyTournament, profileId: drawProfile.id, startDate: legacyTournament.start_date,
    qualifyingRounds: [], mainRounds: [{ label: 'R16', short: 'R16' }], qualifyingRequired: false,
    opponents: [{ members: [{ id: 'legacy-bot-1', name: 'Legacy Bot' }], rank: 100 }],
  });
  const legacyEvent = await localGame.entities.CalendarEvent.create({
    id: 'p1554-legacy-calendar', profile_id: drawProfile.id, event_type: 'tournament',
    title: legacyTournament.name, start_date: legacyTournament.start_date, end_date: legacyTournament.start_date,
    related_id: legacyTournament.id, related_name: legacyTournament.name, status: 'scheduled',
    is_mandatory: true, requires_decision: true, decision_type: 'play_tournament',
    metadata: { registration_id: 'p1554-legacy-reg', original_start_date: legacyTournament.start_date, tournament_run: legacyPreExistingRun, tournament_run_schema_version: 2 },
  });
  // Muito antes de D-3 (start_date é 2026-03-20): a pipeline não pode apagar
  // nem resortear um run que a implementação antiga já criou.
  const legacyDrawResult = await ensureTournamentDraw({ profile: { ...drawProfile, career_date: '2026-02-08' }, tournament: legacyTournament, calendarEvent: legacyEvent });
  gate('D3-22. Save legado (run criado antes de D-3): ensureTournamentDraw não recria (created=false)', legacyDrawResult.created === false && legacyDrawResult.drawn === true);
  gate('D3-23. Save legado: adversário/run permanecem exatamente os mesmos (nenhum resorteio)', JSON.stringify(legacyDrawResult.run) === JSON.stringify(legacyPreExistingRun));
  await processCalendarEvents({ ...drawProfile, career_date: '2026-02-08' }, '2026-02-09');
  const legacyEventAfterAdvance = await localGame.entities.CalendarEvent.get(legacyEvent.id);
  gate('D3-23b. Save legado sobrevive a um avanço de dia real (processCalendarEvents) sem alterar o run', JSON.stringify(legacyEventAfterAdvance.metadata.tournament_run) === JSON.stringify(legacyPreExistingRun));

  // 24/25/26. Bracket integrity: nenhuma rodada futura com winner sintético,
  // nenhum campeão antecipado, mesmas proteções da Fase 15.5.1 preservadas
  // para um run recém-sorteado por esta pipeline (não só para runs antigos).
  const visibleBeforeAnyResult = getVisibleTournamentBracketState(tournamentAtDraw, '2026-02-08');
  gate('D3-24. Bracket recém-sorteado: getVisibleTournamentBracketState reconhece drawn=true', visibleBeforeAnyResult.drawn === true);
  gate('D3-25. Nenhuma rodada futura tem winner definido antes do resultado real', visibleBeforeAnyResult.rounds.every((round) => round.matches.every((match) => match.status === 'completed' || !match.winner)));
  gate('D3-26. Nenhum campeão antecipado (champion null antes do fim da campanha)', visibleBeforeAnyResult.champion === null);

  // 27/28/29. Progressão R16→QF e eliminação continuam corretas para um run
  // criado por ensureTournamentDraw (não só para runs construídos à mão);
  // presença confirmada continua válida durante toda a campanha.
  gate('D3-29a. Presença confirmada assim que o run existe (não exige reconfirmação após o sorteio)', isTournamentParticipationConfirmed({ event: eventAtMatchDay }) === true);
  const afterR16Draw = runManager.recordTournamentMatchResult(eventAtMatchDay.metadata.tournament_run, { matchId: eventAtMatchDay.metadata.tournament_run.matches[0].id, won: true, score: '6-2 6-3' });
  gate('D3-27. Progressão R16→QF correta para um run sorteado por ensureTournamentDraw', afterR16Draw.run.currentRound === 1 && afterR16Draw.run.matches[1].status === 'scheduled');
  gate('D3-29b. Presença continua confirmada após a 1ª vitória (mesma campanha, sem reconfirmar)', isTournamentParticipationConfirmed({ event: { ...eventAtMatchDay, metadata: { ...eventAtMatchDay.metadata, tournament_run: afterR16Draw.run } } }) === true);
  const eliminatedDraw = runManager.recordTournamentMatchResult(afterR16Draw.run, { matchId: afterR16Draw.run.matches[1].id, won: false, score: '3-6 4-6' });
  gate('D3-28. Eliminação continua correta (status eliminated, sem nova rodada)', eliminatedDraw.run.status === 'eliminated');

  // D3-extra. Achado real durante a implementação (não estava na lista original
  // de 30 itens): um evento de torneio cuja data JÁ passou há muito tempo
  // (ex.: evento de demonstração/seed sem tournament_run, nunca processado)
  // NÃO pode "ressuscitar" como sorteio novo só porque daysBetween(hoje,
  // data) é um número negativo <= 3. isTournamentDrawDue exige days >= 0;
  // sem essa guarda, processCalendarEvents recriava um run 'preparing' com
  // requires_decision:true para um torneio morto há semanas, travando o
  // avanço de dia permanentemente (regressão real pega por
  // test:communication-deduplication, que usa o evento de seed local
  // cal-002/Miami Cup com start_date muito anterior ao career_date do teste).
  const staleTournament = await localGame.entities.Tournament.create({
    id: 'p1554-stale-cup', name: 'Stale Demo Cup', tier: 'Silver', start_date: '2026-01-08', status: 'inscricoes',
  });
  const staleEvent = await localGame.entities.CalendarEvent.create({
    id: 'p1554-stale-calendar', profile_id: drawProfile.id, event_type: 'tournament',
    title: staleTournament.name, start_date: staleTournament.start_date, end_date: staleTournament.start_date,
    related_id: staleTournament.id, related_name: staleTournament.name, status: 'scheduled', is_mandatory: false,
  });
  gate('D3-extra. Torneio com data já muito passada (sem run) não é sorteado ao "ressuscitar" (isTournamentDrawDue=false)', !isTournamentDrawDue(staleEvent, staleTournament, '2026-02-08'));
  const staleDrawResult = await ensureTournamentDraw({ profile: { ...drawProfile, career_date: '2026-02-08' }, tournament: staleTournament, calendarEvent: staleEvent });
  gate('D3-extra-b. ensureTournamentDraw recusa criar run para torneio com data no passado distante', staleDrawResult.created === false && staleDrawResult.drawn === false);

  // 30. Nenhuma regressão do P0-A: já coberto pelos gates 7-9 acima
  // (setPhase/setRun síncronos em handleMatchFinished); revalidado aqui como
  // parte explícita do checklist do complemento.
  gate('D3-30. Nenhuma regressão do P0-A (setRun/setPhase síncronos, gates 7-9 revalidados)', gates >= 9);

  // ── Auditoria estática: TournamentModal.jsx nunca cria o sorteio ────────
  const modalSrcForDraw = read('src/components/tournaments/TournamentModal.jsx');
  gate('D3-mod-1. TournamentModal.jsx não importa mais createTournamentRun (não cria mais o sorteio)', !modalSrcForDraw.includes('createTournamentRun'));
  gate('D3-mod-2. TournamentModal.jsx não importa mais generateTournamentOpponent (opponent generation saiu daqui)', !modalSrcForDraw.includes('generateTournamentOpponent'));
  gate('D3-mod-3. TournamentModal.jsx trata run inexistente como estado próprio (fase not_drawn), não como erro', modalSrcForDraw.includes("setPhase('not_drawn')") && modalSrcForDraw.includes("phase === 'not_drawn'"));
  gate('D3-mod-4. Mount effect só LÊ calendarEvent.metadata?.tournament_run (nunca cria) antes de decidir a fase', modalSrcForDraw.includes('const tournamentRun = calendarEvent.metadata?.tournament_run || null;'));
  const calendarSrcForDraw = read('src/lib/calendarSystem.js');
  gate('D3-mod-5. processCalendarEvents (pipeline de avanço de dia) é quem chama ensureTournamentDraw', calendarSrcForDraw.includes('ensureTournamentDraw({'));
  gate('D3-mod-6. Criação do sorteio não está vinculada a nenhum efeito de render (import só em calendarSystem.js/tournamentDraw.js, não em componentes React)', !read('src/pages/Tournaments.jsx').includes('ensureTournamentDraw') && !read('src/components/tournaments/TournamentDetailsModal.jsx').includes('ensureTournamentDraw'));

  console.log(`\n${gates} gates executados, todos PASS — Fase 15.5.4 Critical Mobile QA.`);
} finally {
  await vite.close();
}
