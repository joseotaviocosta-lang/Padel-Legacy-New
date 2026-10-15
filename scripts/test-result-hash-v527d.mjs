// Playthrough 5.27-D, Bloco S — HASH DO RESULTADO.
// O envelope guarda job id, seed, preset, perfil, codeHash, balanceHash e
// resultHash; qualquer alteração no arquivo é detectada; o outcomeHash ignora
// só os campos voláteis do harness e pega qualquer mudança de desfecho.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as J from './lib/v527dJobs.mjs';
import { tempRoot, cleanup, initRoot, markDone, analyze, syntheticResult } from './lib/v527dTestKit.mjs';

const { check, finish } = makeSuite('test-result-hash-v527d');
const root = tempRoot('hash');
try {
  initRoot(root);
  const id = 'balanced-normal-seed003-2y';
  const env = markDone(root, id);

  await check('envelope traz job id, seed, preset, perfil, codeHash, balanceHash, resultHash', () => {
    for (const k of ['jobId', 'seed', 'preset', 'profile', 'codeHash', 'balanceHash', 'resultHash', 'outcomeHash', 'schemaVersion', 'harnessVersion']) assert.ok(env[k] != null, `sem ${k}`);
    assert.equal(env.jobId, id); assert.equal(env.seed, 3); assert.equal(env.preset, 'balanced'); assert.equal(env.profile, 'normal');
    assert.equal(J.envelopeHash(env), env.resultHash);
  });

  await check('JSON canônico: ordem das chaves não muda o hash', () => {
    assert.equal(J.canonical({ b: 1, a: [2, { d: 3, c: 4 }] }), J.canonical({ a: [2, { c: 4, d: 3 }], b: 1 }));
  });

  await check('outcomeHash ignora campos voláteis (ms, careerId, reloads, resumes, checkpoints, saveMB)', () => {
    const r = syntheticResult({ profile: 'normal', seed: 3, days: 730 });
    const h = J.outcomeHash(r);
    const v = { ...r, ms: 123, careerId: 'outro', reloads: 9, resumes: 8, checkpoints: 7, checkpointRecoveries: 1, weekly: r.weekly.map((w) => ({ ...w, saveMB: 99 })) };
    assert.equal(J.outcomeHash(v), h);
  });

  await check('outcomeHash muda com qualquer desfecho (moedas, rank, partida)', () => {
    const r = syntheticResult({ profile: 'normal', seed: 3, days: 730 });
    const h = J.outcomeHash(r);
    assert.notEqual(J.outcomeHash({ ...r, finalCoins: r.finalCoins + 1 }), h);
    assert.notEqual(J.outcomeHash({ ...r, weekly: r.weekly.map((w, i) => (i === 5 ? { ...w, rank: w.rank + 1 } : w)) }), h);
    assert.notEqual(J.outcomeHash({ ...r, matches: r.matches.map((m, i) => (i === 0 ? { ...m, won: !m.won } : m)) }), h);
  });

  await check('arquivo adulterado → envelopeHash não confere e o analisador o exclui (integrity.invalidHash)', () => {
    const file = join(J.paths(root).runs, `${id}.json`);
    const tampered = JSON.parse(readFileSync(file, 'utf8'));
    tampered.result.finalCoins += 1000;
    assert.notEqual(J.envelopeHash(tampered), tampered.resultHash);
    writeFileSync(file, JSON.stringify(tampered));
    const a = analyze(root);
    assert.equal(a.status, 0, a.stderr.slice(-300));
    const summary = J.readJson(join(root, 'analysis', 'summary.json'));
    assert.deepEqual(summary.integrity.invalidHash, [`${id}.json`]);
    assert.equal(summary.careersLoaded, 0);
    // e o manifest diz DONE sem arquivo válido → o analisador não conta a carreira
    assert.equal(summary.stages['1'].done, 1);
  });
} finally {
  cleanup(root);
  finish();
}
