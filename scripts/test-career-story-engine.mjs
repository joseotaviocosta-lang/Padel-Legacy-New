// Fase 14 (docs/FASE_14_CAREER_IDENTITY.md, Parte 17).
//
// Cobre buildCareerTimeline/getNotableMatches — os "momentos marcantes"
// (Parte 4) e os níveis de importância (Parte 8) da timeline. Reaproveita
// press_importance já calculado e persistido em cada Match oficial
// (TournamentRunManager.js/getRoundPressImportance) — nenhuma heurística
// nova sendo testada aqui, só o consumo correto do campo real.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildCareerTimeline, getNotableMatches } = await server.ssrLoadModule('/src/lib/careerStory.js');

  const profile = { id: 'p-story', sport_name: 'QA Story', career_date: '2026-06-01', career_started_at: '2025-01-01', xp: 0 };

  // ── Cenário 1: carreira nova, sem partidas — nunca lança exceção ────────
  const emptyTimeline = buildCareerTimeline(profile, []);
  gate('1. Carreira nova (sem partidas): timeline não lança exceção e traz só o evento de início', emptyTimeline.length === 1 && emptyTimeline[0].type === 'start');
  gate('1b. Evento de início tem importance definida (major/important/normal)', ['major', 'important', 'normal'].includes(emptyTimeline[0].importance));

  // ── Cenário 21: partida de treino nunca vira "momento marcante" ─────────
  const practiceMatch = { id: 'm-practice', profile_id: 'p-story', date: '2026-02-01', competition_type: 'training', is_official: false, result: 'vitória', press_importance: 'global' };
  gate('21. Partida de treino NUNCA vira momento marcante mesmo com press_importance forjado (isOfficialMatch bloqueia)', getNotableMatches([practiceMatch], profile).length === 0);

  // ── Momento marcante real: press_importance 'high'/'global' em partida oficial ──
  const simpleMatch = { id: 'm-simple', profile_id: 'p-story', date: '2026-02-05', competition_type: 'tournament', is_official: true, result: 'vitória', press_importance: 'simple', tournament_name: 'Challenger QA', tournament_round: 'R32' };
  const highMatch = { id: 'm-high', profile_id: 'p-story', date: '2026-03-10', competition_type: 'tournament', is_official: true, result: 'vitória', press_importance: 'high', tournament_name: 'Master QA', tournament_round: 'Semifinal', opponent_rank: 8 };
  const globalMatch = { id: 'm-global', profile_id: 'p-story', date: '2026-04-20', competition_type: 'tournament', is_official: true, result: 'vitória', press_importance: 'global', tournament_outcome: 'champion', tournament_name: 'Elite QA', tournament_round: 'Final', opponent_rank: 3 };
  const notable = getNotableMatches([simpleMatch, highMatch, globalMatch], profile);
  gate("Partida 'simple' (R32 comum) NÃO vira momento marcante", !notable.some((m) => m.id === 'm-simple'));
  gate("Partida 'high' (semifinal contra Top 10) vira momento marcante", notable.some((m) => m.id === 'm-high'));
  gate("Partida 'global' (título em torneio de elite) vira momento marcante", notable.some((m) => m.id === 'm-global'));
  gate('Momento marcante de título usa o título correto ("Título no ...")', notable.find((m) => m.id === 'm-global').title.includes('Título no Elite QA'));

  // ── Timeline: momentos marcantes entram com a importância certa (Parte 8) ──
  const timelineWithMoments = buildCareerTimeline(profile, [simpleMatch, highMatch, globalMatch]);
  const globalEvent = timelineWithMoments.find((e) => e.id === 'notable-m-global');
  const highEvent = timelineWithMoments.find((e) => e.id === 'notable-m-high');
  gate('Timeline: momento "global" entra como importance=major', globalEvent?.importance === 'major');
  gate('Timeline: momento "high" entra como importance=important (não compete por atenção com o major)', highEvent?.importance === 'important');
  gate('Timeline: momento marcante cita o rank do adversário quando disponível', highEvent?.description.includes('#8'));
  gate('Timeline: partida "simple" nunca aparece como evento de timeline', !timelineWithMoments.some((e) => e.id === 'notable-m-simple'));

  // ── Parte 5: rivalidade consolidada vira 1 evento (não 1 por partida) ───
  const relationships = [{ target_name: 'Rival QA', shared_matches: 5, shared_wins: 3, shared_losses: 2, shared_finals: 1 }];
  const timelineWithRivalry = buildCareerTimeline(profile, [], { relationships });
  gate('Timeline inclui exatamente 1 evento de rivalidade quando há um rival consolidado (>=3 confrontos)', timelineWithRivalry.filter((e) => e.type === 'rivalry').length === 1);
  gate('Evento de rivalidade cita H2H real (3-2), não uma pontuação sintética', timelineWithRivalry.find((e) => e.type === 'rivalry').description.includes('3–2'));

  // ── Parte 6/7: parceria encerrada e treinador trocado entram na timeline ──
  const partnerships = [{ id: 'partnership-1', partner_name: 'Ex-Parceiro QA', status: 'encerrada_jogador', ended_career_date: '2026-03-01', shared_matches: 40, shared_wins: 25, shared_titles: 2 }];
  const coachTenures = [{ coachId: 'coach-1', coachName: 'Ex-Treinador QA', endedDate: '2026-02-15', ovrStart: 60, ovrEnd: 68, titles: 1 }];
  const timelineWithHistory = buildCareerTimeline(profile, [], { partnerships, coachTenures });
  gate('Timeline inclui o fim de uma parceria antiga com os fatos reais (partidas/vitórias/títulos)', timelineWithHistory.some((e) => e.type === 'partnership-end' && e.description.includes('40 partidas') && e.description.includes('2 título')));
  gate('Timeline inclui a troca de treinador com Overall real (não inventado)', timelineWithHistory.some((e) => e.type === 'coach-change' && e.description.includes('60 → 68')));
  gate('Parceria ATIVA nunca entra como "fim de parceria" (só status !== ativa)', !buildCareerTimeline(profile, [], { partnerships: [{ id: 'p2', partner_name: 'Atual', status: 'ativa', ended_career_date: null }] }).some((e) => e.type === 'partnership-end'));

  console.log(`\n${gates} gates executados, todos PASS — Career Story Engine (Fase 14): momentos marcantes, importância da timeline, rivalidade e histórico de dupla/treinador.`);
} finally {
  await server.close();
}
