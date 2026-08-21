// Fase 13 (docs/FASE_13_CAREER_DEPTH.md, Parte 4/11/17).
//
// A Parte 11 pede pra AUDITAR o sistema de legado existente (não recriar) e
// "fortalecer", garantindo que os acontecimentos formem uma história
// coerente. A auditoria encontrou Legacy.jsx (Hall da Fama, Família,
// Timeline, Retrospectiva de Temporada) já sendo um sistema real — mas com
// 3 bugs concretos que quebravam essa coerência:
//
// (1) Legacy.jsx sempre mostrava 0% de conquistas desbloqueadas: comparava
//     contra `achievement.metric` (formato de um catálogo antigo de 12
//     itens), mas `Achievement.list()` retorna o catálogo REAL (175+
//     entradas, achievementsData.js) que usa `trigger_type` — nunca
//     `.metric`. Corrigido pra checar contra PlayerAchievement real.
// (2) "Estreia"/"Primeira Vitória" (MILESTONES) podiam disparar com
//     partida de TREINO (profile.matches_played/wins são contadores
//     só-de-treino — game-core/progression.js), a mesma classe de bug que
//     a Fase 12 já tinha corrigido pra conquistas mas não aqui.
// (3) careerStory.js (Timeline + Retrospectiva de Temporada) nunca
//     distinguia partida de treino de oficial — a fonte de dados de TODA a
//     história de carreira contava treino junto com resultado real.
//
// Este teste prova as 3 correções com o pipeline real (sem mocks das
// etapas críticas) + uma auditoria estrutural da fonte de Legacy.jsx
// (mesmo padrão híbrido já usado por test-achievements-ui-v2.mjs).
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const SOURCE = readFileSync('src/pages/Legacy.jsx', 'utf8');

// ── 1) Estrutural: as 3 correções existem no componente real ────────────────
gate('isAchievementUnlocked checa contra PlayerAchievement real (unlockedIds.has), nunca mais achievement.metric', /unlockedIds\.has\(a\.id\)/.test(SOURCE) && !/profile\?\.\[a\.metric\]/.test(SOURCE));
gate('Legacy.jsx busca PlayerAchievement.filter (mesma fonte que a aba Conquistas usa)', /PlayerAchievement\.filter/.test(SOURCE));
gate('MILESTONES de Estreia/Primeira Vitória usam stats.played/stats.won (oficial), nunca profile.matches_played/wins bruto', /stats\?\.played \|\| 0\) >= 1/.test(SOURCE) && /stats\?\.won \|\| 0\) >= 1/.test(SOURCE));
gate('Legacy.jsx importa isOfficialMatch de careerStory.js (fonte canônica de partida oficial)', /import \{ isOfficialMatch \} from '@\/lib\/careerStory'/.test(SOURCE));
gate('officialStats é derivado com isOfficialMatch (mesma fonte que Timeline/Retrospectiva usam)', /officialCareerMatches\s*=\s*matches\.filter\(isOfficialMatch\)/.test(SOURCE));
gate('Achievement.list() bruto é filtrado por future_system/is_active antes de apresentar (nunca mostra o catálogo cru)', /!entry\.future_system && entry\.is_active !== false/.test(SOURCE));

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { isOfficialMatch, buildCareerTimeline, buildSeasonRetrospectives } = await server.ssrLoadModule('/src/lib/careerStory.js');

  // ── 2) isOfficialMatch: tabela-verdade real ────────────────────────────────
  gate('isOfficialMatch: torneio + is_official:true → true', isOfficialMatch({ competition_type: 'tournament', is_official: true }) === true);
  gate('isOfficialMatch: treino (competition_type ausente) → false', isOfficialMatch({ is_official: true }) === false);
  gate('isOfficialMatch: torneio mas is_official:false → false (ex.: amistoso dentro de um evento)', isOfficialMatch({ competition_type: 'tournament', is_official: false }) === false);
  gate('isOfficialMatch: match nulo/indefinido → false, nunca lança exceção', isOfficialMatch(null) === false && isOfficialMatch(undefined) === false);

  // ── 3) buildCareerTimeline: só partida OFICIAL vira "Primeira partida"/"Primeira vitória" ──
  const profile = { id: 'p-legacy', sport_name: 'QA Legacy', career_date: '2026-01-11', career_started_at: '2025-01-11', xp: 0 };
  const practiceMatchOnly = [
    { id: 'm-practice-1', profile_id: 'p-legacy', date: '2025-02-01', competition_type: 'training', is_official: false, result: 'vitória', player_won: true },
    { id: 'm-practice-2', profile_id: 'p-legacy', date: '2025-02-05', competition_type: 'training', is_official: false, result: 'vitória', player_won: true },
  ];
  const timelineWithOnlyPractice = buildCareerTimeline(profile, practiceMatchOnly);
  gate('BUG BLOQUEADO: com só partidas de treino, timeline NÃO cria evento "Primeira partida oficial"', !timelineWithOnlyPractice.some((e) => e.type === 'match'));
  gate('BUG BLOQUEADO: com só partidas de treino, timeline NÃO cria evento "Primeira vitória"', !timelineWithOnlyPractice.some((e) => e.type === 'win'));

  const officialMatch = { id: 'm-official-1', profile_id: 'p-legacy', date: '2025-03-10', competition_type: 'tournament', is_official: true, result: 'vitória', player_won: true, tournament_name: 'Aberto QA' };
  const timelineWithOfficial = buildCareerTimeline(profile, [...practiceMatchOnly, officialMatch]);
  gate('Com 1 partida oficial (+ partidas de treino ao lado), timeline cria "Primeira partida oficial"', timelineWithOfficial.some((e) => e.type === 'match' && e.id.includes('m-official-1')));
  gate('Com 1 partida oficial vencida, timeline cria "Primeira vitória"', timelineWithOfficial.some((e) => e.type === 'win' && e.id.includes('m-official-1')));

  // ── 4) buildSeasonRetrospectives: contagem de temporada exclui treino ────────
  const seasonMatches = [
    ...practiceMatchOnly, // 2 vitórias de treino — não devem contar
    { id: 'm-off-a', profile_id: 'p-legacy', date: '2025-04-01', competition_type: 'tournament', is_official: true, result: 'vitória', player_won: true },
    { id: 'm-off-b', profile_id: 'p-legacy', date: '2025-04-15', competition_type: 'tournament', is_official: true, result: 'derrota', player_won: false },
    { id: 'm-off-c', profile_id: 'p-legacy', date: '2025-05-01', competition_type: 'tournament', is_official: true, result: 'vitória', player_won: true, round: 'final', is_final: true, tournament_name: 'Master QA' },
  ];
  const [season2025] = buildSeasonRetrospectives(profile, seasonMatches);
  gate('Retrospectiva de temporada existe para 2025', Boolean(season2025));
  gate('Contagem de partidas da temporada exclui as 2 de treino (3 oficiais, não 5)', season2025.matches === 3);
  gate('Contagem de vitórias da temporada exclui as vitórias de treino (2 oficiais, não 4)', season2025.wins === 2);
  gate('Título só conta a partir de vitória oficial em final (1 título, não influenciado por treino)', season2025.titles === 1);
  gate('Highlight do título cita o torneio real', season2025.highlights.some((h) => h.includes('Master QA')));

  // ── 4b) Timeline: escada de ranking unificada com a de conquistas (10 degraus, não a antiga lista de 6) ──
  const rankProfile = { ...profile, ranking_position: 200 }; // cruza Top 500 e Top 250, mas não Top 100
  const rankTimeline = buildCareerTimeline(rankProfile, []);
  gate('BUG BLOQUEADO: rank #200 agora cria evento "Entrada no Top 250" (a escada antiga da timeline pulava direto de Top 500 pra Top 100)', rankTimeline.some((e) => e.id === 'rank-250'));
  gate('rank #200 também mantém "Entrada no Top 500" (degrau mais largo, coerente)', rankTimeline.some((e) => e.id === 'rank-500'));
  gate('rank #200 NÃO cria "Entrada no Top 100" (ainda não foi alcançado)', !rankTimeline.some((e) => e.id === 'rank-100'));
  const eliteRankProfile = { ...profile, ranking_position: 4 }; // cruza Top 5 e Top 3, mas não #1
  const eliteTimeline = buildCareerTimeline(eliteRankProfile, []);
  gate('BUG BLOQUEADO: rank #4 cria "Entrada no Top 5" (não existia na escada antiga de 6 degraus)', eliteTimeline.some((e) => e.id === 'rank-5'));
  gate('rank #4 NÃO cria "Número 1 do mundo" (ainda não é #1)', !eliteTimeline.some((e) => e.id === 'rank-1'));

  // ── 5) Regressão: sem nenhuma partida, timeline/retrospectiva não quebram ──
  gate('buildCareerTimeline sem partidas ainda retorna o evento de início de carreira', buildCareerTimeline(profile, []).some((e) => e.type === 'start'));
  gate('buildSeasonRetrospectives sem partidas retorna lista vazia, não lança exceção', Array.isArray(buildSeasonRetrospectives(profile, [])) && buildSeasonRetrospectives(profile, []).length === 0);

  console.log(`\n${gates} gates executados, todos PASS — Integridade do legado de carreira (Fase 13, Parte 4/11): timeline, retrospectiva de temporada e marcos usam só partida oficial.`);
} finally {
  await server.close();
}
