// Playthrough 5.26-B — valida as saídas da auditoria reduzida de integridade
// (reports/progression-integrity-526b/smoke/raw: 5 seeds × 3 perfis × 2
// temporadas, sem contorno) contra as expectativas duras da fase.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-integrity-smoke-simulation-v526b');
const dir = resolve(process.argv.find((a) => a.startsWith('--dir='))?.split('=')[1] || 'reports/progression-integrity-526b/smoke/raw');
const careers = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.save.json')).map((f) => ({ file: f, ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
const all = (fn) => careers.every(fn);
const some = (fn) => careers.some(fn);

await check(`15 carreiras (5 seeds × 3 perfis) presentes (achadas: ${careers.length})`, () => {
  assert.equal(careers.length, 15);
  for (const p of ['casual', 'normal', 'optimizer']) assert.equal(careers.filter((c) => c.profile === p).length, 5, p);
});
await check('2 temporadas completas (730 dias) em todas', () => assert.ok(all((c) => c.days === 730), careers.filter((c) => c.days !== 730).map((c) => `${c.file}:${c.days}`).join(',')));
await check('freeze = 0 (nenhuma falha de avanço, nenhum erro)', () => assert.ok(all((c) => !c.advanceFailures.length && !c.errors.length), careers.filter((c) => c.advanceFailures.length || c.errors.length).map((c) => c.file).join(',')));
await check('contorno = 0 (shim desligado)', () => assert.ok(all((c) => c.softLock.fires === 0)));
await check('OVR do parceiro no motor = OVR canônico em 100% das partidas', () => {
  const rows = careers.flatMap((c) => c.matches.filter((m) => m.engineOvr && m.partnerDisplayOvr != null));
  assert.ok(rows.length > 500, `poucas partidas: ${rows.length}`);
  const off = rows.filter((m) => m.engineOvr.A[1] !== m.partnerDisplayOvr);
  assert.equal(off.length, 0, `${off.length} divergentes, ex.: ${JSON.stringify(off[0] && { motor: off[0].engineOvr.A[1], card: off[0].partnerDisplayOvr })}`);
  assert.ok(!rows.some((m) => m.engineOvr.A[1] === 1), 'parceiro com OVR 1 no motor');
});
await check('moedas de conquista perdidas no settlement = 0', () => assert.equal(careers.reduce((t, c) => t + Object.values(c.ledger).reduce((a, m) => a + (Number(m.expense.reward_overwrite) || 0), 0), 0), 0));
await check('livro-razão sem resíduo', () => assert.ok(all((c) => Object.keys(c.residualSites || {}).length === 0)));
await check('reputação aumenta (> 0) em carreiras com imprensa', () => assert.ok(some((c) => c.weekly.some((w) => (w.reputation || 0) > 0))));
await check('idade avança com a data da carreira (16 → 18 em 2 anos)', () => assert.ok(all((c) => c.weekly[0].age === 16 && c.weekly.at(-1).age === 18), careers.map((c) => `${c.weekly[0].age}->${c.weekly.at(-1).age}`).join(',')));
await check('ranking_position gravado e muda com o ranking', () => assert.ok(all((c) => new Set(c.weekly.map((w) => w.rankingPositionField).filter((x) => x != null)).size > 3)));
await check('patrocínio passa do Bronze quando os requisitos são cumpridos (alguma carreira)', () => assert.ok(some((c) => c.sponsors.some((s) => s.tier !== 'Bronze')), 'só Bronze'));
await check('loja desbloqueia acima de incomum (alguma carreira)', () => assert.ok(some((c) => c.weekly.some((w) => ['raro', 'epico', 'lendario', 'mitico', 'exclusivo'].includes(w.shopUnlockedRarity)))));
finish();
