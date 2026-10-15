// Playthrough 5.27-H — CONGELAMENTO do estado exato validado no Stage 1.
//
// FREEZE → RUN → MEASURE → DECIDE. Este módulo só LÊ o código: monta o
// frozen-config.json (balanced-e + política Normal v3 + táticas + motor +
// ranking + população + economia + compromisso) e um hash SEMÂNTICO por bloco.
// O orquestrador recalcula o hash antes de cada job; qualquer diferença aborta
// a matriz (hard rule: nenhum desses valores muda durante o Stage 1).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, computeBalanceSnapshot, fileHash, sha256 } from './v527dJobs.mjs';

export const PHASE = '5.27-H';
export const POLICY = 'v3';
export const PRESETS_E = ['conservative-e', 'balanced-e', 'hardcore-e'];
// Variáveis de ambiente que o Stage 1 da 5.27-H usa — e as que NÃO podem estar setadas
// (overrides de calibração de fases anteriores mudariam o jogo no meio da matriz).
export const REQUIRED_ENV = { PL527E_POLICY: POLICY, PL527H_PARTNER_QUALITY: '1' };
export const FORBIDDEN_ENV = ['PL527E_COMPETITION', 'PL526_SHIM', 'PL527D_TEST_DAYS'];
// Ambiente completo do lançador (scripts/run-stage1-v527h.mjs).
export const ENV_527H = Object.freeze({
  PL527H: '1',
  PL527D_ROOT: 'reports/rebalance-527h',
  PL527D_PRESETS: PRESETS_E.join(','),
  PL527D_STAGES: '1',
  ...REQUIRED_ENV,
});

const SOURCES = {
  balance: ['src/lib/balance527.js', 'src/lib/economy.js', 'src/lib/sponsors.js', 'src/lib/staffCatalog.js', 'src/lib/storeCatalog.js', 'src/lib/initialCareerProfiles.js'],
  partnerPolicy: ['scripts/lib/v527gPartnerScore.mjs', 'src/players/teamCompatibility.js', 'src/lib/partnershipSystem.js'],
  tactics: ['src/engine/match/MatchTactics.js', 'src/engine/match/DecisionEngine.js', 'src/engine/match/RallyEngine.js', 'src/engine/match/MatchEngine.js'],
  ranking: ['src/lib/circuitCatalog.js', 'src/lib/teamRanking.js'],
  population: ['src/lib/rankingPopulation.js'],
  commitment: ['src/game-core/partnerLifecycle.js', 'src/careers/CareerManager.js'],
  harness: ['scripts/sim-progression-economy-v526.mjs', 'scripts/lib/v526Tournament.mjs', 'scripts/lib/v526Actions.mjs', 'scripts/lib/v526CareerSim.mjs'],
};

function grab(text, re, label) {
  const m = re.exec(text);
  if (!m) throw new Error(`freeze 5.27-H: não achei ${label}`);
  return m[1];
}
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();

export async function computeFrozenConfig(repo = process.cwd()) {
  const read = (f) => readFileSync(join(repo, f), 'utf8');
  const url = (f) => `file:///${join(repo, f).replace(/\\/g, '/')}`;
  const { BALANCE_527E_PRESETS, ENTRY_COMPETITION_527E } = await import(url('src/lib/balance527.js'));
  const { NORMAL_PARTNER_WEIGHTS } = await import(url('scripts/lib/v527gPartnerScore.mjs'));
  const base = await computeBalanceSnapshot(repo); // âncoras, bandas Bronze/Silver, CDB, rescisão (5.27-D)
  const sim = read('scripts/sim-progression-economy-v526.mjs');
  const rally = read('src/engine/match/RallyEngine.js');
  const decision = read('src/engine/match/DecisionEngine.js');
  const engine = read('src/engine/match/MatchEngine.js');
  const tacticsSrc = read('src/engine/match/MatchTactics.js');
  const circuit = read('src/lib/circuitCatalog.js');
  const presetsE = JSON.parse(JSON.stringify(BALANCE_527E_PRESETS));

  const blocks = {
    balance: {
      presets: Object.fromEntries(Object.entries(presetsE).map(([id, p]) => [id, {
        startingCoins: p.startingCoins, initialAttributeMultiplier: p.initialAttributeMultiplier,
        sponsor: p.sponsor, prizeMultiplier: p.prizeMultiplier, staffMultiplier: p.staffMultiplier,
        shopPriceMultiplier: p.shopPriceMultiplier, shopBonusMultiplier: p.shopBonusMultiplier,
        investmentRateMultiplier: p.investmentRateMultiplier, version: p.version,
      }])),
      cdbMonthlyRate: base.values.cdbMonthlyRate,
      severance: base.values.severance,
    },
    partnerPolicy: {
      policyVersion: POLICY,
      normalWeights: NORMAL_PARTNER_WEIGHTS,
      levelFitRule: '100 − 4 × max(0, playerOVR − candidateOVR); sem bônus acima do nível',
      affordabilityRule: '100 × (moedas/salário)/6 − 2 × max(0, divisão − 50)',
      renewalRule: 'Normal v3 renova só se score(atual) ≥ renewVsMarket × melhor score da Busca (e razão OVR ≥ renewMinPartnerShare)',
      policies: norm(grab(sim, /(export const POLICIES = \{[\s\S]*?\n\};)/, 'POLICIES')),
      ovrAuthority: 'teamCompatibility ratingOf → baseOverallRating (média de atributos)',
      ovrAuthoritySource: norm(grab(read('src/players/teamCompatibility.js'), /(const ratingOf = [\s\S]*?\n\};)/, 'ratingOf')),
    },
    tactics: {
      matchTactics: norm(grab(tacticsSrc, /(export const MATCH_TACTICS = Object\.freeze\(\[[\s\S]*?\]\);)/, 'MATCH_TACTICS')),
      tacticRiskScale: Number(grab(rally, /const TACTIC_RISK_SCALE = ([\d.]+);/, 'TACTIC_RISK_SCALE')),
      tacticIdBonus: norm(grab(decision, /(const idBonus = [^;]+;)/, 'idBonus')),
      aiAdaptation: { enabled: false, gate: norm(grab(engine, /(const proposedBotTactic = [^;]+;)/, 'opponentAdaptive gate')) },
    },
    engine: {
      energyConditionSlope: Number(grab(rally, /const CONDITION_SLOPE = ([\d.]+);/, 'CONDITION_SLOPE')),
      botEnergyRule: 'inalterada (v526Tournament.mjs, hash em sources.harness)',
    },
    ranking: {
      gatedFirstRoundLossPointsRatio: ENTRY_COMPETITION_527E.gatedFirstRoundLossPointsRatio,
      rankPointsTableSource: norm(grab(circuit, /(function buildRankPointsTable[\s\S]*?\n\})/, 'buildRankPointsTable')),
    },
    population: {
      overallRankAnchors: base.values.bronzeAnchors.overallRankAnchors,
      rankingPointAnchors: base.values.bronzeAnchors.rankingPointAnchors,
      jitterSpread: base.values.bronzeAnchors.jitterSpread,
      openTierBands: base.values.openTierBands,
      entryCompetition: ENTRY_COMPETITION_527E,
    },
    commitment: {
      rule: 'dupla comprometida em torneio inscrito permanece até o fim dos compromissos; par histórico imutável (não alterado na 5.27-H)',
      partnerLifecycleHash: fileHash(join(repo, 'src/game-core/partnerLifecycle.js')),
    },
  };
  const blockHashes = Object.fromEntries(Object.entries(blocks).map(([k, v]) => [k, sha256(canonical(v))]));
  const sourceHashes = Object.fromEntries(Object.entries(SOURCES).map(([k, files]) => [k, Object.fromEntries(files.map((f) => [f, fileHash(join(repo, f))]))]));
  // Hash semântico pedido (item 4): balance + partner policy + tactics + ranking + population.
  const semanticHash = sha256(canonical(['balance', 'partnerPolicy', 'tactics', 'ranking', 'population'].map((k) => [k, blockHashes[k]])));
  return { phase: PHASE, presets: PRESETS_E, policy: POLICY, requiredEnv: REQUIRED_ENV, forbiddenEnv: FORBIDDEN_ENV, semanticHash, blockHashes, blocks, sourceHashes };
}

/** Diferenças entre o congelado e o atual (0 = gate verde). */
export function frozenDiff(frozen, current) {
  const diffs = [];
  if (frozen.semanticHash !== current.semanticHash) diffs.push({ field: 'semanticHash', frozen: frozen.semanticHash, current: current.semanticHash });
  for (const [k, h] of Object.entries(frozen.blockHashes || {})) if (current.blockHashes?.[k] !== h) diffs.push({ field: `block:${k}`, frozen: h, current: current.blockHashes?.[k] ?? null });
  for (const [k, files] of Object.entries(frozen.sourceHashes || {})) for (const [f, h] of Object.entries(files)) if (current.sourceHashes?.[k]?.[f] !== h) diffs.push({ field: `source:${f}`, frozen: h, current: current.sourceHashes?.[k]?.[f] ?? null });
  return diffs;
}

export function envViolations(env = process.env) {
  const v = [];
  for (const [k, want] of Object.entries(REQUIRED_ENV)) if (env[k] !== want) v.push(`${k}=${env[k] ?? '(ausente)'} (esperado ${want})`);
  for (const k of FORBIDDEN_ENV) if (env[k]) v.push(`${k} setado (proibido no Stage 1)`);
  return v;
}
