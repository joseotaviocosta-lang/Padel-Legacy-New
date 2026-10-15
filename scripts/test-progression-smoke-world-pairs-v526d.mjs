// Playthrough 5.26-D, Bloco K — valida a auditoria curta PÓS-PARIDADE (smoke
// 5 seeds × 3 perfis × 2 temporadas, sem shim). Lê os resultados brutos e os
// artefatos do analisador e aplica os HARD GATES da fase.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const { check, finish } = makeSuite('test-progression-smoke-world-pairs-v526d');
const ROOT = resolve('reports/tournament-world-parity-526d');
const RAW = resolve(ROOT, 'smoke/raw');
try {
  await check('smoke existe (15 carreiras: 5 seeds × 3 perfis)', () => {
    assert.ok(existsSync(RAW), 'sem pasta smoke/raw — rode scripts/run-progression-economy-v526.mjs --root=...');
    const files = readdirSync(RAW).filter((f) => /^(casual|normal|optimizer)-\d{3}\.json$/.test(f));
    assert.equal(files.length, 15, `carreiras encontradas: ${files.length}`);
  });

  const careers = readdirSync(RAW).filter((f) => /^(casual|normal|optimizer)-\d{3}\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(RAW, f), 'utf8')));

  await check('todas rodam 730 dias, sem shim, sem soft-lock e sem erro', () => {
    const bad = careers.filter((c) => c.days !== 730 || c.shimEver !== false || (c.softLock?.fires || 0) > 0 || (c.errors || []).length > 0);
    assert.deepEqual(bad.map((c) => `${c.profile}-${c.seed}: days=${c.days} shim=${c.shimEver} errors=${(c.errors || []).length}`), []);
  });

  const upsets = JSON.parse(readFileSync(resolve(ROOT, 'upsets.json'), 'utf8')).smoke.all;
  const fallback = JSON.parse(readFileSync(resolve(ROOT, 'fallback.json'), 'utf8'));
  const summary = JSON.parse(readFileSync(resolve(ROOT, 'summary.json'), 'utf8'));

  await check('cobertura de rank do adversário aumenta MATERIALMENTE vs ~0% da 5.26-C', () => {
    assert.ok(upsets.opponentRankCoverage.teamRanking > 0, 'nenhum adversário com team-ranking');
    assert.ok(upsets.opponentRankCoverage.pct > 20, `cobertura ainda baixa: ${upsets.opponentRankCoverage.pct}%`);
  });

  await check('hard gate: nenhum adversário sem rank quando a TeamRanking canônica existe', () => {
    assert.equal(upsets.missingWhenCanonicalExists, 0, `faltando rank: ${upsets.missingWhenCanonicalExists}`);
    assert.equal(upsets.opponentRankCoverage.missingRoster, 0, `missing-roster: ${upsets.opponentRankCoverage.missingRoster}`);
  });

  await check('a maioria dos adversários vem do MUNDO (world-pair), com fallback sintético medido e baixo', () => {
    const world = upsets.opponentOrigin.worldPair;
    const synthetic = upsets.opponentOrigin.fallbackSynthetic;
    assert.ok(world > 0, 'nenhum adversário do mundo');
    const share = world / (world + synthetic);
    assert.ok(share > 0.75, `mundo ${world} vs sintético ${synthetic}`);
    assert.ok(Number.isFinite(fallback.fallbackPct), 'fallback não medido');
  });

  await check('upset detection recebe ranks reais (>= 1 oportunidade de zebra medida)', () => {
    assert.ok(upsets.attempted >= 1, `nenhuma tentativa de zebra (${upsets.attempted})`);
    assert.ok(upsets.canonicalRowExists > 0, 'nenhuma linha canônica de dupla no adversário');
  });

  await check('paridade de OVR: card do adversário = motor (0 mismatch)', () => {
    assert.equal(summary.gates.smoke.opponentOvrMismatchMatches, 0);
    const partner = summary.gates.smoke.partnerOvrMismatchMatches;
    assert.equal(partner, 0, `OVR do parceiro divergente (${partner})`);
  });

  await check('progressão recalculada nos 15 runs (marcos Top500..Top1 presentes)', () => {
    const prog = JSON.parse(readFileSync(resolve(ROOT, 'summary.json'), 'utf8')).progression.smoke;
    for (const p of ['casual', 'normal', 'optimizer']) {
      assert.ok(prog[p]?.milestones?.top500, `sem marcos para ${p}`);
      assert.ok(prog[p].rank['2y'], `sem rank em 2 anos para ${p}`);
    }
  });
} finally {
  finish();
}
