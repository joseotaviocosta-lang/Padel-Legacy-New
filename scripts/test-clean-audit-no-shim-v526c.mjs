// Playthrough 5.26-C — a re-auditoria limpa roda o JOGO REAL, sem o shim de
// soft-lock da 5.26 (create de AthleteProfile duplicado devolvendo a linha
// existente). O shim é opt-in (PL526_SHIM=1) desde a 5.26-B.
// Verifica: (1) o portão do shim no código; (2) uma carreira curta sem a
// variável não instala o shim e não o dispara; (3) todos os resultados da
// re-auditoria em reports/progression-clean-526c (smoke, lote principal,
// longas) foram gerados sem shim, sem soft-lock e completaram os dias.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-clean-audit-no-shim-v526c');
const work = mkdtempSync(join(tmpdir(), 'pl526c-noshim-'));
const ROOT = 'reports/progression-clean-526c';
try {
  await check('shim só instala com PL526_SHIM=1 (portão no harness)', () => {
    const src = readFileSync('scripts/lib/v526CareerSim.mjs', 'utf8');
    assert.match(src, /if \(process\.env\.PL526_SHIM !== '1'\) return;/);
  });
  await check('runner e supervisores não ligam o shim', () => {
    assert.doesNotMatch(readFileSync('scripts/run-progression-economy-v526.mjs', 'utf8'), /PL526_SHIM/);
  });
  await check('nenhum arquivo em src/ contém o contorno', () => {
    const r = spawnSync('git', ['grep', '-l', '__pl526', '--', 'src'], { encoding: 'utf8' });
    assert.equal(r.stdout.trim(), '');
  });

  const env = { ...process.env }; delete env.PL526_SHIM;
  const run = spawnSync(process.execPath, ['scripts/sim-progression-economy-v526.mjs', '--profile=normal', '--seeds=3-3', '--days=45', `--out=${work}`], { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
  await check('carreira curta sem a variável roda até o fim', () => assert.equal(run.status, 0, run.stderr?.slice(-400)));
  const out = JSON.parse(readFileSync(join(work, 'normal-003.json'), 'utf8'));
  await check('…com shimEver=false e 0 disparos', () => {
    assert.equal(out.shimEver, false);
    assert.equal(out.softLock.fires, 0);
    assert.equal(out.days, 45);
  });

  const dirs = [`${ROOT}/smoke/raw`, `${ROOT}/runs/raw`, `${ROOT}/runs/raw-long`].filter(existsSync);
  const files = dirs.flatMap((d) => readdirSync(d).filter((f) => /^(casual|normal|optimizer)-\d{3}\.json$/.test(f)).map((f) => join(d, f)));
  await check(`re-auditoria: ${files.length} carreiras encontradas em ${dirs.length} lote(s)`, () => assert.ok(files.length > 0, 'nenhum resultado da re-auditoria ainda'));
  const bad = [];
  for (const f of files) {
    const c = JSON.parse(readFileSync(f, 'utf8'));
    const planned = f.includes('raw-long') ? 3653 : f.includes('smoke') ? 730 : 1826;
    if (c.shimEver !== false) bad.push(`${f}: shimEver=${c.shimEver}`);
    if (c.softLock?.fires) bad.push(`${f}: soft-lock ${c.softLock.fires}`);
    if (c.days !== planned) bad.push(`${f}: ${c.days}/${planned} dias`);
    if ((c.errors || []).some((e) => /já existe/.test(e))) bad.push(`${f}: erro de AthleteProfile duplicado`);
  }
  await check('todas sem shim, sem soft-lock, com todos os dias e sem erro de duplicata', () => assert.deepEqual(bad, []));
} finally {
  rmSync(work, { recursive: true, force: true });
}
finish();
