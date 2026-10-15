// Playthrough 5.27-D, Bloco R — DISTRIBUIÇÃO POR ARQUIVOS (sem GitHub).
// Export de bundle dos jobs pendentes (sem arquivos desnecessários) e import
// de resultados vindos de outra máquina, validando balanceHash, codeHash,
// schemaVersion, jobId e resultHash. Nada é aceito em silêncio.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as J from './lib/v527dJobs.mjs';
import { tempRoot, cleanup, initRoot, orch, envelopeFor, syntheticResult, writeSyntheticCheckpoint } from './lib/v527dTestKit.mjs';

const { check, finish } = makeSuite('test-cross-machine-result-import-v527d');
const home = tempRoot('home'); const remote = tempRoot('remote'); const drop = tempRoot('drop');
const ID = 'balanced-optimizer-seed005-2y';
try {
  initRoot(home); initRoot(remote);
  const job = J.loadManifest(home).jobs.find((j) => j.id === ID);
  const result = syntheticResult({ profile: job.profile, seed: job.seed, days: job.targetDays });
  const good = envelopeFor(remote, ID, result, { host: 'outra-maquina' });
  const put = (name, env) => { const f = join(drop, name); J.atomicWrite(f, JSON.stringify(env)); return f; };
  const imp = (file) => orch(home, [`--import=${file}`]);
  const resign = (env, patch) => { const e = { ...env, ...patch }; delete e.resultHash; e.resultHash = J.envelopeHash(e); return e; };

  await check('export-bundle: só jobs pendentes, último checkpoint válido (sem .prev), metadados de hash', () => {
    const j2 = J.loadManifest(home).jobs.find((j) => j.id === 'conservative-casual-seed002-2y');
    const ck = J.checkpointFileFor(j2, J.paths(home).work);
    writeSyntheticCheckpoint(ck, { version: 2, preset: j2.preset, profile: j2.profile, seed: j2.seed, day: 180, out: {} });
    writeSyntheticCheckpoint(`${ck}.prev`, { day: 90 });
    const r = orch(home, ['--export-bundle', '--stage=1']);
    assert.equal(r.status, 0, r.stderr.slice(-400));
    const dir = join(J.paths(home).bundles, readdirSync(J.paths(home).bundles)[0]);
    const b = J.readJson(join(dir, 'bundle.json'));
    assert.equal(b.jobs.length, 45);
    assert.equal(b.codeHash, J.loadManifest(home).codeHash);
    assert.equal(b.balanceHash, J.loadManifest(home).balanceHash);
    assert.equal(b.schemaVersion, J.SCHEMA_VERSION);
    const files = readdirSync(join(dir, 'checkpoints'));
    assert.deepEqual(files, ['conservative-casual-seed002-2y.ckpt']);
    assert.equal(b.jobs.find((x) => x.id === 'conservative-casual-seed002-2y').checkpointDay, 180);
    for (const f of ['frozen-balance.json', 'code-files.json', 'README.md']) assert.ok(existsSync(join(dir, f)), `bundle sem ${f}`);
    assert.ok(!existsSync(join(dir, 'source')), 'source só com --with-source');
  });

  await check('resultado válido de outra máquina → aceito, DONE com importedFrom', () => {
    const r = imp(put('ok.json', good));
    assert.equal(r.status, 0, r.stdout.slice(-400));
    const j = J.loadManifest(home).jobs.find((x) => x.id === ID);
    assert.equal(j.status, 'DONE'); assert.equal(j.importedFrom.host, 'outra-maquina');
    assert.equal(J.readJson(join(J.paths(home).runs, `${ID}.json`)).resultHash, good.resultHash);
  });

  await check('mesmo resultado de novo → duplicado consistente (sem DETERMINISM FAILURE)', () => {
    const r = imp(put('ok-again.json', good));
    assert.equal(r.status, 0);
    assert.match(r.stdout, /duplicado consistente/);
    assert.equal(J.loadManifest(home).determinismFailures.length, 0);
  });

  const rejected = (name, env, re) => {
    const r = imp(put(name, env));
    assert.notEqual(r.status, 0, 'deveria rejeitar');
    assert.match(r.stdout, re);
  };
  await check('balanceHash diferente → REJEITADO', () => rejected('bal.json', resign(good, { balanceHash: 'f'.repeat(64), jobId: 'balanced-optimizer-seed004-2y', seed: 4 }), /balanceHash diferente do congelado/));
  await check('codeHash diferente → REJEITADO', () => rejected('code.json', resign(good, { codeHash: 'e'.repeat(64), jobId: 'balanced-optimizer-seed004-2y', seed: 4 }), /codeHash diferente/));
  await check('schemaVersion diferente → REJEITADO', () => rejected('schema.json', resign(good, { schemaVersion: '527d-result/0', jobId: 'balanced-optimizer-seed004-2y', seed: 4 }), /schemaVersion/));
  await check('jobId desconhecido → REJEITADO', () => rejected('id.json', resign(good, { jobId: 'balanced-optimizer-seed099-2y', seed: 99 }), /jobId desconhecido/));
  await check('envelope inconsistente com o jobId → REJEITADO', () => rejected('mismatch.json', resign(good, { jobId: 'balanced-optimizer-seed004-2y' }), /não batem com o jobId/));
  await check('arquivo adulterado sem refazer hash → REJEITADO', () => { const t = JSON.parse(JSON.stringify(good)); t.jobId = 'balanced-optimizer-seed004-2y'; t.seed = 4; rejected('tamper.json', t, /resultHash não confere/); });
  await check('nenhum rejeitado virou DONE', () => {
    assert.equal(J.loadManifest(home).jobs.find((x) => x.id === 'balanced-optimizer-seed004-2y').status, 'PENDING');
  });

  await check('duplicado com hash válido mas desfecho diferente → DETERMINISM FAILURE registrado', () => {
    const other = syntheticResult({ profile: job.profile, seed: job.seed, days: job.targetDays, coinsAt: () => 777 });
    const divergent = envelopeFor(remote, ID, other, { host: 'terceira-maquina' });
    const r = imp(put('div.json', divergent));
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /DETERMINISM FAILURE/);
    const m = J.loadManifest(home);
    assert.equal(m.determinismFailures.length, 1);
    assert.equal(J.readJson(join(J.paths(home).runs, `${ID}.json`)).resultHash, good.resultHash, 'o original não pode ser sobrescrito');
  });
} finally {
  cleanup(home); cleanup(remote); cleanup(drop);
  finish();
}
