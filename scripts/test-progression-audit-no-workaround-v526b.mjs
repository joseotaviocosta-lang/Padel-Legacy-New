// Playthrough 5.26-B — a auditoria pós-correção roda o jogo REAL: o shim que a
// 5.26 usou para atravessar o congelamento é opt-in (PL526_SHIM=1, só para
// reproduzir o build antigo) e fica desligado por padrão.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { installBrowserShim, MemoryStorage, bootRuntime } from './lib/v526CareerSim.mjs';

const { check, finish } = makeSuite('test-progression-audit-no-workaround-v526b');

await check('código do harness: shim só liga com PL526_SHIM=1', () => {
  const src = readFileSync(resolve('scripts/lib/v526CareerSim.mjs'), 'utf8');
  assert.match(src, /process\.env\.PL526_SHIM !== '1'\) return;/);
  assert.doesNotMatch(src, /PL526_NO_SHIM/);
});

{
  delete process.env.PL526_SHIM;
  installBrowserShim();
  const rt = await bootRuntime(new MemoryStorage());
  try {
    const { CareerEntityRepository } = await rt.load('/src/gameplay/repositories/CareerEntityRepository.js');
    await check('runtime padrão: CareerEntityRepository.create NÃO está interceptado', () => assert.equal(Boolean(CareerEntityRepository.prototype.__pl526Shim), false));
  } finally { await rt.close(); }
}

const work = mkdtempSync(join(tmpdir(), 'pl526b-noshim-'));
try {
  const env = { ...process.env }; delete env.PL526_SHIM;
  spawnSync(process.execPath, ['scripts/sim-progression-economy-v526.mjs', '--profile=casual', '--seeds=3-3', '--days=90', `--out=${work}`, '--force'], { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
  const out = JSON.parse(readFileSync(join(work, 'casual-003.json'), 'utf8'));
  await check('carreira curta do harness: 0 disparos de contorno, 0 erros', () => { assert.equal(out.softLock.fires, 0); assert.deepEqual(out.errors, []); });
} finally {
  rmSync(work, { recursive: true, force: true });
}

// Saídas da auditoria reduzida pós-correção (se já geradas): nenhuma usou contorno.
const smokeDir = resolve('reports/progression-integrity-526b/smoke/raw');
let files = [];
try { files = readdirSync(smokeDir).filter((f) => f.endsWith('.json') && !f.endsWith('.save.json')); } catch { /* ainda não gerada */ }
await check(`auditoria reduzida: nenhuma das ${files.length} carreiras precisou de contorno`, () => {
  for (const f of files) { const r = JSON.parse(readFileSync(join(smokeDir, f), 'utf8')); assert.equal(r.softLock.fires, 0, f); }
});
finish();
