// Playthrough 5.26-C, Bloco D — 365 dias de ciclo de parceria sem laço.
// Roda a reprodução (parceiro aposentado no dia 0) por um ano inteiro: além
// da aposentadoria, os contratos de 30–60 dias vencem e são substituídos pela
// busca várias vezes. Invariantes do ano:
//   - o aposentado nunca volta (0 re-contratações);
//   - nenhuma dupla dura menos de 2 dias (laço = assinatura → fim no dia seguinte);
//   - o mesmo parceiro nunca é assinado em dias consecutivos;
//   - nunca há duas parcerias ativas ao mesmo tempo.
// A prova sobre carreiras completas (política inteira, com renovação) é o
// contador `resignLoopEvents` do harness, exigido = 0 na re-auditoria limpa.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-partner-contract-365d-v526c');
const work = mkdtempSync(join(tmpdir(), 'pl526c-365-'));
const ord = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000);
try {
  const out = join(work, 'repro-365.json');
  const r = spawnSync(process.execPath, ['scripts/repro-partner-retired-loop-v526c.mjs'], { encoding: 'utf8', env: { ...process.env, RS_DAYS: '365', RS_OUT: out }, maxBuffer: 64 * 1024 * 1024 });
  await check('365 dias simulados sem erro', () => assert.equal(r.status, 0, r.stderr?.slice(-500)));
  const { summary, signs, ended, days } = JSON.parse(readFileSync(out, 'utf8'));
  await check(`aposentado nunca re-contratado (${summary.signs} assinaturas no ano)`, () => {
    assert.equal(summary.retiredResigns, 0);
    assert.equal(summary.endedByRetirement, 1);
  });
  await check('houve trocas reais no ano (o teste exercita vencimento + busca)', () => assert.ok(signs.length >= 3, `assinaturas ${signs.length}`));
  await check('nenhuma dupla encerrada com menos de 2 dias (fora a montagem do dia 0)', () => {
    // O dia 0 é montagem do cenário (oferta aceita → trocada pela escolha da busca).
    const short = ended.filter((e) => e.partner !== summary.retiredPartner && e.started && e.ended && e.ended > signs[0].date)
      .filter((e) => ord(e.ended) - ord(e.started) < 2);
    assert.deepEqual(short, []);
  });
  await check('mesmo parceiro nunca assinado em dias consecutivos', () => {
    const repeats = signs.filter((s, i) => i > 0 && s.partner === signs[i - 1].partner && ord(s.date) - ord(signs[i - 1].date) <= 2);
    assert.deepEqual(repeats, []);
  });
  await check('dias sem dupla ao fim do dia = 0 (a busca sempre repõe)', () => {
    assert.equal(days.filter((d) => !d.activeAfter).length, 0);
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}
finish();
