// Playthrough 5.27-I — congelamento do Stage 1 com a banda Silver escolhida no
// micro e a política v4 (Otimizador corrigido). Reaproveita o snapshot
// semântico da 5.27-H e acrescenta os dois escopos desta fase como blocos
// próprios (silver, optimizerPolicy), que também entram no hash semântico.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, fileHash, sha256 } from './v527dJobs.mjs';
import { computeFrozenConfig as compute527h, frozenDiff as diff527h } from './v527hFreeze.mjs';

export const PHASE = '5.27-I';
export const POLICY = 'v4';
export const PRESETS_E = ['conservative-e', 'balanced-e', 'hardcore-e'];
export const REQUIRED_ENV = { PL527E_POLICY: POLICY, PL527H_PARTNER_QUALITY: '1', PL527I_FIELD_DIAG: '1' };
export const FORBIDDEN_ENV = ['PL527E_COMPETITION', 'PL526_SHIM', 'PL527D_TEST_DAYS'];
export const ENV_527I = Object.freeze({
  PL527I: '1',
  PL527D_ROOT: 'reports/rebalance-527i',
  PL527D_PRESETS: PRESETS_E.join(','),
  PL527D_STAGES: '1',
  ...REQUIRED_ENV,
});

export async function computeFrozenConfig(repo = process.cwd()) {
  const base = await compute527h(repo);
  const url = (f) => `file:///${join(repo, f).replace(/\\/g, '/')}`;
  const { ENTRY_COMPETITION_527E } = await import(url('src/lib/balance527.js'));
  const { OPTIMIZER_V4 } = await import(url('scripts/lib/v527iOptimizerScore.mjs'));
  const wtl = readFileSync(join(repo, 'src/gameplay/worldTour/WorldTourLifecycle.js'), 'utf8').replace(/\r\n/g, '\n');
  const blocks = {
    ...base.blocks,
    silver: {
      silverPeakLow: ENTRY_COMPETITION_527E.silverPeakLow,
      silverFieldOffsetPct: ENTRY_COMPETITION_527E.silverFieldOffsetPct ?? 0.25,
      fieldWindowSource: /const openTierOffset = [^;]+;/.exec(wtl)?.[0] ?? null,
    },
    optimizerPolicy: { policyVersion: POLICY, ...OPTIMIZER_V4, sourceHash: fileHash(join(repo, 'scripts/lib/v527iOptimizerScore.mjs')) },
  };
  const blockHashes = Object.fromEntries(Object.entries(blocks).map(([k, v]) => [k, sha256(canonical(v))]));
  const sourceHashes = { ...base.sourceHashes, silver: { 'src/gameplay/worldTour/WorldTourLifecycle.js': fileHash(join(repo, 'src/gameplay/worldTour/WorldTourLifecycle.js')) }, optimizerPolicy: { 'scripts/lib/v527iOptimizerScore.mjs': fileHash(join(repo, 'scripts/lib/v527iOptimizerScore.mjs')) } };
  const semanticHash = sha256(canonical(['balance', 'partnerPolicy', 'tactics', 'ranking', 'population', 'silver', 'optimizerPolicy'].map((k) => [k, blockHashes[k]])));
  return { phase: PHASE, presets: PRESETS_E, policy: POLICY, requiredEnv: REQUIRED_ENV, forbiddenEnv: FORBIDDEN_ENV, semanticHash, blockHashes, blocks, sourceHashes };
}
export const frozenDiff = diff527h;
export function envViolations(env = process.env) {
  const v = [];
  for (const [k, want] of Object.entries(REQUIRED_ENV)) if (env[k] !== want) v.push(`${k}=${env[k] ?? '(ausente)'} (esperado ${want})`);
  for (const k of FORBIDDEN_ENV) if (env[k]) v.push(`${k} setado (proibido no Stage 1)`);
  return v;
}
