// Fase 14 (docs/FASE_14_CAREER_IDENTITY.md, Parte 3/10/17).
//
// Prova a escada de ranking unificada (Top500..#1, 10 degraus — antes só 4:
// 1/10/100/500) e as notificações de marco de partida (1ª partida/vitória/
// título, vitória sobre Top10/#1), via `evaluateCareerMatchMilestones` real
// escrevendo CareerMessage de verdade (localGame), com o mesmo
// achievementContext real construído por achievementContext.js.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { rankingMilestoneCrossed, RANKING_MILESTONES } = await server.ssrLoadModule('/src/game-core/gameStateLifecycle.js');
  const { evaluateCareerMatchMilestones } = await server.ssrLoadModule('/src/lib/careerStoryEvents.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');

  // localGame precisa de um backend de storage antes de qualquer
  // entities.X.create/filter em ambiente Node — mesmo bootstrap de memória
  // já usado por test-mobile-filters-postmatch-m4-2-2.mjs (sem isto, cai no
  // storage real do Tauri, indisponível fora do app).
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
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
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'career-milestones', name: 'QA Milestones' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  // ── Escada completa: cenários 5-14 do briefing (Top500..#1) ─────────────
  gate('Escada unificada tem os 10 degraus pedidos (500/250/100/50/30/20/10/5/3/1)', JSON.stringify([...RANKING_MILESTONES].sort((a, b) => a - b)) === JSON.stringify([1, 3, 5, 10, 20, 30, 50, 100, 250, 500]));
  const rungs = [[900, 500, 500], [400, 250, 250], [150, 100, 100], [80, 50, 50], [40, 30, 30], [25, 20, 20], [15, 10, 10], [8, 5, 5], [4, 3, 3], [2, 1, 1]];
  for (const [prev, curr, expected] of rungs) {
    gate(`5-14. Cruzar de #${prev} para #${curr} dispara o marco Top ${expected}`, rankingMilestoneCrossed(prev, curr) === expected);
  }
  gate('Pequena variação dentro da mesma faixa (920 -> 918) NUNCA dispara marco', rankingMilestoneCrossed(920, 918) === null);
  // rank #8 cruza Top 500..Top 10 (8<=10) mas NÃO cruza Top 5 (8<=5 é falso)
  // — o degrau mais exclusivo realmente cruzado é Top 10, não Top 5.
  gate('Salto grande (900 -> 8) relata só o degrau mais exclusivo REALMENTE cruzado (Top 10, não os 6 degraus mais largos juntos, e não Top 5 que ainda não foi alcançado)', rankingMilestoneCrossed(900, 8) === 10);
  gate('Sem posição anterior conhecida (undefined), cruzar #90 dispara Top 100 normalmente', rankingMilestoneCrossed(undefined, 90) === 100);

  // ── Integração real: press + notificação no mesmo evento (Parte 11) ─────
  const gslSource = await import('node:fs/promises').then((fs) => fs.readFile('src/game-core/gameStateLifecycle.js', 'utf8'));
  gate('Marco de ranking dispara PressArticle além da CareerMessage (Parte 11 — cobre a lacuna real encontrada na auditoria)', /createOptional\('PressArticle'/.test(gslSource) && gslSource.includes("upsertCareerMessage(updatedProfile.id, `ranking-milestone:"));

  // ── Marcos de PARTIDA: 1ª oficial / 1ª vitória / 1º título / Top10 / #1 ──
  const profile = { id: 'qa-milestones', tournaments_won: 0 };
  const baseMatch = { id: 'm1', date: '2026-05-01', tournament_name: 'Aberto QA', result: 'vitória' };

  await evaluateCareerMatchMilestones(profile, baseMatch, { officialMatches: { played: 1, won: 1, lost: 0 } });
  const afterFirst = await localGame.entities.CareerMessage.filter({ profile_id: 'qa-milestones' });
  gate('2. Primeira partida oficial gera notificação de marco', afterFirst.some((m) => m.metadata?.context_key === 'career-milestone:first-official-match'));
  gate('3. Primeira vitória oficial gera notificação de marco', afterFirst.some((m) => m.metadata?.context_key === 'career-milestone:first-official-win'));

  // 4. Primeiro título
  const titleProfile = { id: 'qa-milestones', tournaments_won: 1 };
  const titleMatch = { id: 'm2', date: '2026-06-01', tournament_name: 'Master QA', result: 'vitória', tournament_outcome: 'champion' };
  await evaluateCareerMatchMilestones(titleProfile, titleMatch, { officialMatches: { played: 2, won: 2, lost: 0 } });
  const afterTitle = await localGame.entities.CareerMessage.filter({ profile_id: 'qa-milestones' });
  gate('4. Primeiro título gera notificação de marco (prioridade alta)', afterTitle.some((m) => m.metadata?.context_key === 'career-milestone:first-title' && m.priority === 'alta'));

  // Vitória sobre Top 10 / #1
  const top10Match = { id: 'm3', date: '2026-07-01', tournament_name: 'Elite QA', result: 'vitória', opponent_rank: 7 };
  await evaluateCareerMatchMilestones(titleProfile, top10Match, { officialMatches: { played: 3, won: 3, lost: 0, beatTop10: true } });
  const afterTop10 = await localGame.entities.CareerMessage.filter({ profile_id: 'qa-milestones' });
  gate('Vitória sobre Top 10 gera notificação de marco', afterTop10.some((m) => m.metadata?.context_key === `career-milestone:beat-top10:${top10Match.id}`));

  const rank1Match = { id: 'm4', date: '2026-07-15', tournament_name: 'Elite QA', result: 'vitória', opponent_rank: 1 };
  await evaluateCareerMatchMilestones(titleProfile, rank1Match, { officialMatches: { played: 4, won: 4, lost: 0, beatTop10: true, beatRank1: true } });
  const afterRank1 = await localGame.entities.CareerMessage.filter({ profile_id: 'qa-milestones' });
  gate('Vitória sobre o #1 do mundo gera notificação de marco (prioridade alta)', afterRank1.some((m) => m.metadata?.context_key === `career-milestone:beat-rank1:${rank1Match.id}` && m.priority === 'alta'));

  // ── 22/23: evento comum não gera spam / marco não duplica ────────────────
  const normalMatch = { id: 'm5', date: '2026-08-01', tournament_name: 'Regional QA', result: 'derrota' };
  await evaluateCareerMatchMilestones(titleProfile, normalMatch, { officialMatches: { played: 5, won: 4, lost: 1 } });
  const afterNormal = await localGame.entities.CareerMessage.filter({ profile_id: 'qa-milestones' });
  gate('22. Uma derrota comum (sem marco nenhum cruzado) não cria NENHUMA CareerMessage nova', afterNormal.length === afterRank1.length);

  const countBeforeRepeat = afterNormal.length;
  await evaluateCareerMatchMilestones(profile, baseMatch, { officialMatches: { played: 1, won: 1, lost: 0 } }); // repete a MESMA 1ª partida
  const afterRepeat = await localGame.entities.CareerMessage.filter({ profile_id: 'qa-milestones' });
  gate('23. Reavaliar a MESMA 1ª partida (ex.: reload) nunca duplica a notificação de marco (upsert idempotente)', afterRepeat.length === countBeforeRepeat);

  console.log(`\n${gates} gates executados, todos PASS — Marcos de carreira (Fase 14): escada de ranking unificada + notificações de partida deduplicadas.`);
} finally {
  await server.close();
}
