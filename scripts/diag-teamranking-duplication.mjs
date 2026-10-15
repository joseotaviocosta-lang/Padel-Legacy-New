import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let capturedLists = [];
const sim = await runHeadlessWorldSimulation({
  years: 1, label: 'diag-teamdup', trackWeeklyDraws: false, includeRankingResults: true,
  onBeforeClose: async ({ localGame }) => {
    const all = await localGame.entities.TeamRanking.list(null, 60000);
    const capped = await localGame.entities.TeamRanking.list('-ranking_points', 600);
    console.log(`TOTAL TeamRanking rows (no cap): ${all.length}`);
    console.log(`Rows visible via list('-ranking_points', 600): ${capped.length}`);
    const cappedKeys = new Set(capped.map((r) => r.team_key));
    const distinctKeysAll = new Set(all.map((r) => r.team_key));
    console.log(`Distinct team_key total: ${distinctKeysAll.size} | visible within cap: ${cappedKeys.size}`);
    const coelloRows = all.filter((r) => r.player1_name?.includes('Coello') || r.player2_name?.includes('Coello'));
    console.log(`\nCoello/Tapia rows found: ${coelloRows.length}`);
    for (const r of coelloRows.slice(0, 30)) {
      console.log(`  id=${r.id} team_key=${r.team_key} points=${r.ranking_points} created=${r.created_date} updated=${r.updated_date}`);
    }
  },
});
console.log('done', sim.label);
