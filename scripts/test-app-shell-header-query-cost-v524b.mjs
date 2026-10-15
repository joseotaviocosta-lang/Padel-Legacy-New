// Playthrough 5.24-B, Partes G/K — custo do header (AppShell).
//
// Auditoria: o header resolve ranking individual + dupla em applyProfile,
// disparado só no mount e por 3 eventos (com debounce) — nunca por render ou
// troca de rota. Por refresh: 1 leitura de TeamRanking (getTeamRank), e a
// materialização da dupla NÃO grava quando os pontos já são canônicos (antes
// cada montagem do Ranking pagava uma gravação completa da carreira).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const layout = readFileSync(new URL('../src/components/AppLayout.jsx', import.meta.url), 'utf8');
const hook = layout.match(/function useCareerHeaderData\(\)[\s\S]*?\n\}/)[0];

check('applyProfile/load são estáveis (useCallback) — o efeito não re-roda por render', () => {
  assert.match(hook, /const applyProfile = useCallback\(async[\s\S]*?\}, \[\]\);/);
  assert.match(hook, /const load = useCallback\(async[\s\S]*?\}, \[applyProfile\]\);/);
  assert.match(hook, /\}, \[applyProfile, load\]\);/);
});

check('header escuta exatamente 3 eventos e remove os 3 (sem listener duplicado)', () => {
  const added = hook.match(/window\.addEventListener\('([^']+)'/g) || [];
  const removed = hook.match(/window\.removeEventListener\('([^']+)'/g) || [];
  assert.equal(added.length, 3);
  assert.equal(removed.length, 3);
  assert.match(hook, /setTimeout\(flush, 150\)/, 'debounce de eventos repetidos');
});

check('ranking da dupla só é resolvido dentro de applyProfile (não depende da rota)', () => {
  assert.equal((layout.match(/resolveHeaderTeamRank\(/g) || []).length, 2, '1 definição + 1 chamada');
  assert.match(hook, /resolveHeaderTeamRank\(nextProfile\)/);
  assert.doesNotMatch(hook, /location|useLocation/);
});

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const store = installEntityStore(localGame, {
    PlayerProfile: [{ id: 'player-1', name: 'Jogador', rank_points: 39 }],
    AthleteProfile: [{ id: 'athlete-1', name: 'Parceiro', world_ranking_points: 978 }],
    Partnership: [{ id: 'part-1', profile_id: 'player-1', status: 'ativa', partner_bot_id: 'athlete-1' }],
    TeamRanking: [],
  });
  const counts = { list: 0, update: 0, create: 0 };
  const base = localGame.entities.TeamRanking;
  const wrapped = {
    ...base,
    list: (...a) => { counts.list += 1; return base.list(...a); },
    update: (...a) => { counts.update += 1; return base.update(...a); },
    create: (...a) => { counts.create += 1; return base.create(...a); },
  };
  const entities = localGame.entities;
  localGame.entities = new Proxy({}, { get: (_t, name) => (name === 'TeamRanking' ? wrapped : entities[name]) });
  const player = store.state.PlayerProfile[0];

  await teamRanking.ensurePlayerTeamRanking(player);
  const afterFirst = { ...counts };
  for (let i = 0; i < 5; i += 1) await teamRanking.ensurePlayerTeamRanking(player);

  check('materialização: 1ª chamada cria a linha; 5 chamadas seguintes com pontos iguais gravam 0 vezes', () => {
    assert.equal(afterFirst.create, 1);
    assert.equal(counts.create, 1);
    assert.equal(counts.update, 0, `updates redundantes: ${counts.update}`);
    assert.equal(store.state.TeamRanking[0].ranking_points, 39 + 978, 'valor canônico A + B preservado');
  });

  player.rank_points = 50;
  await teamRanking.ensurePlayerTeamRanking(player);
  check('pontos mudaram → grava (correção preservada)', () => {
    assert.equal(counts.update, 1);
    assert.equal(store.state.TeamRanking[0].ranking_points, 50 + 978);
  });

  const listBefore = counts.list;
  const rank = await teamRanking.getTeamRank(player, { id: 'athlete-1' });
  check('getTeamRank (refresh do header) = 1 leitura de TeamRanking', () => {
    assert.equal(counts.list - listBefore, 1);
    assert.equal(rank.points, 1028);
    assert.equal(rank.unranked, false);
  });
} finally {
  await vite.close();
}

// Medição real (perf-mobile-pages-v524b.mjs): leituras do header por refresh e
// por navegação.
const reportFile = new URL('../reports/perf-524b/after-heavy-360.json', import.meta.url);
if (existsSync(reportFile)) {
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  check('medido: refresh do header lê TeamRanking no máximo 2x (cache hit+miss do mesmo list)', () => {
    assert.ok(report.headerRefresh.teamRankingReadsMedian <= 2, `${report.headerRefresh.teamRankingReadsMedian}`);
    assert.deepEqual(report.headerRefresh.appLayoutRenders, [1, 1, 1], 'um commit do AppLayout por refresh');
  });
  check('medido: navegar para páginas sem duplas não lê TeamRanking (header não re-consulta por rota)', () => {
    for (const id of ['training', 'economy', 'world']) assert.equal(report.pages[id].teamRankingReadsMedian, 0, id);
  });
}

finish('test-app-shell-header-query-cost-v524b');
