// Playthrough 5.26-C — testes novos da fase + regressões obrigatórias (5.26-B,
// ranking, parceria, torneio, persistência 5.24-D/E e 5.25), uma por vez
// (cada uma sobe seu próprio Vite SSR), com timeout. Grava
// reports/progression-clean-526c/regressions.json.
//   node scripts/run-regressions-v526c.mjs [--only=<grupo>]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GROUPS = {
  'Novos 5.26-C': ['test-world-ranking-year-rollover-v526c', 'test-race-year-reset-v526c', 'test-ranking-expiration-window-v526c', 'test-sponsor-eligibility-authority-v526c', 'test-all-sponsors-reachable-v526c', 'test-opponent-team-rank-resolution-v526c', 'test-upset-detection-v526c', 'test-historical-opponent-pair-rank-v526c', 'test-partner-resign-loop-v526c', 'test-partner-contract-365d-v526c', 'test-progression-run-resume-v526c', 'test-clean-audit-no-shim-v526c'],
  'Integridade 5.26-B': ['test-partner-engine-ovr-authority-v526b', 'test-partner-committed-roster-ovr-v526b', 'test-athlete-repair-idempotency-v526b', 'test-achievement-final-match-reward-v526b', 'test-reputation-progress-persists-v526b', 'test-ranking-gating-current-position-v526b', 'test-player-age-career-clock-v526b', 'test-sponsor-tier-age-progression-v526b', 'test-shop-tier-unlock-v526b'],
  Ranking: ['test-team-ranking-sum-formula-v522e', 'test-team-ranking-pair-change-sum-v522e', 'test-player-team-ranking-authority', 'test-player-team-ranking-position-v522g', 'test-ranking-consistency', 'test-ranking-race-season', 'test-race-circuit-ledger-parity-v5', 'test-playthrough-4-5a-race-persistence', 'test-ranking-four-view-architecture-v523', 'test-circuit-ranking-reload-idempotency', 'test-opponent-world-rank-authority', 'test-opponent-ranking-canonical-authority-v515', 'test-opponent-rank-real-source', 'test-ranking-ui-authority-v56'],
  Parceria: ['test-partner-athlete-materialization-v512', 'test-partner-athlete-idempotency-v512', 'test-partner-athlete-separation-v512', 'test-partner-athlete-new-partnership-v512', 'test-partner-athlete-teamranking-v512', 'test-partner-offers-v2', 'test-partner-rejection-cooldown', 'test-former-partner-reintegration-v518', 'test-long-career-partner-ecology-v518', 'test-living-partnership-market-phase15', 'test-living-partnerships-v29', 'test-partnership-expiry-with-committed-tournament-v517', 'test-committed-partner-athlete-resolution-v519', 'test-partner-contract-decision-ui-v519'],
  Torneio: ['test-match-integrity', 'test-live-coach-tournament', 'test-tournament-result-authority', 'test-settlement-uses-persisted-draw-roster', 'test-walkover-player-tournament-settlement', 'test-parallel-tournament-settlement-v59', 'test-bronze-silver-strength-order', 'test-gold-masters-strength-order', 'test-circuit-rank-strength-correlation', 'test-opponent-strength-by-round'],
  World: ['test-living-world-v23', 'test-ai-market-headless-integration-v518', 'test-athlete-profile-ovr-repair-v56', 'test-athlete-profile-ranking-integrity-v56', 'test-legacy-save-real-pair-duplication-repair-v516', 'test-legacy-ranking-repair-idempotency-v56', 'test-legacy-boot-single-repair-write-v524e', 'test-idle-boot-zero-write-v524e'],
  Persistência: ['test-tutorial-reward-persists-after-reload-v524d', 'test-tutorial-reward-single-write-v524d', 'test-tutorial-reward-app-restart-v524d', 'test-tutorial-reward-idempotency-v524d', 'test-mobile-storage-m3-6', 'test-achievement-reward-atomicity-v524e', 'test-achievement-multi-unlock-batch-v524e', 'test-achievement-reward-restart-v524e', 'test-achievement-reward-idempotency-v524e', 'test-achievement-write-failure-recovery-v524e', 'test-mission-reward-regression-v524e'],
  'Patrocínio/Loja': ['test-sports-economy-v26', 'test-shop-phase1', 'test-career-opportunity-progression'],
};
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const results = [];
for (const [group, tests] of Object.entries(GROUPS)) {
  if (only && only !== group) continue;
  for (const name of tests) {
    const t0 = Date.now();
    const { code, tail } = await new Promise((done) => {
      const child = spawn(process.execPath, [`scripts/${name}.mjs`], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      const keep = (b) => { out = (out + b).slice(-4000); };
      child.stdout.on('data', keep); child.stderr.on('data', keep);
      const timer = setTimeout(() => child.kill(), 40 * 60 * 1000);
      child.on('close', (c) => { clearTimeout(timer); done({ code: c, tail: out }); });
    });
    const ok = code === 0;
    const summary = tail.split('\n').filter((l) => /passaram|PASS|\d+\/\d+/.test(l)).slice(-1)[0]?.trim() || null;
    results.push({ group, name, ok, code, seconds: Math.round((Date.now() - t0) / 1000), summary, tail: ok ? undefined : tail.split('\n').filter((l) => /✗|FAIL|Error|assert|falh|expected/i.test(l)).slice(0, 10).join('\n') });
    console.log(`${ok ? '✓' : '✗'} [${group}] ${name} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
}
const dir = resolve('reports/progression-clean-526c');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, `regressions${only ? `-${only.replace(/\W+/g, '_')}` : ''}.json`), JSON.stringify(results, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passaram`);
