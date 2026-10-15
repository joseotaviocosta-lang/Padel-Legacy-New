// Playthrough 5.26 — testes do harness da auditoria de progressão/economia.
//   1. determinismo: mesma seed duas vezes → saída idêntica;
//   2. sem vazamento de futuro: os primeiros N dias de uma carreira mais longa
//      são idênticos à carreira curta (nenhuma decisão usa informação futura);
//   3. save/reload: o estado persistido (perfil + entidades-chave) é idêntico antes
//      de fechar e depois de recarregar o runtime do storage — em todo reload;
//   4. livro-razão: todo mês fecha (abertura + receitas − despesas = saldo) e
//      nenhuma moeda fica sem categoria;
//   5. paridade de lifecycle: o mundo andou pelos sistemas reais e as chaves
//      dos torneios do jogador são as canônicas.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const SEED = 777;
const LONG_DAYS = 56;
const SHORT_DAYS = 40;
const work = mkdtempSync(join(tmpdir(), 'pl526-test-'));
const results = [];
const check = (name, fn) => { try { fn(); results.push({ name, ok: true }); console.log(`✓ ${name}`); } catch (e) { results.push({ name, ok: false, error: e.message }); console.log(`✗ ${name}\n  ${e.message.split('\n').slice(0, 20).join('\n  ')}`); } };

function run(tag, days, extra = []) {
  const out = join(work, tag);
  const r = spawnSync(process.execPath, ['scripts/sim-progression-economy-v526.mjs', '--profile=normal', `--seeds=${SEED}-${SEED}`, `--days=${days}`, `--out=${out}`, '--force', ...extra], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`simulação ${tag} falhou: ${r.stderr.slice(-800)}`);
  return JSON.parse(readFileSync(join(out, `normal-${SEED}.json`), 'utf8'));
}
// Campos que dependem de relógio de parede/processo, não do jogo.
// Primeiro caminho divergente (mensagem de falha legível).
function firstDiff(a, b, path = '') {
  if (Object.is(a, b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return `${path}: ${JSON.stringify(a)?.slice(0, 120)} ≠ ${JSON.stringify(b)?.slice(0, 120)}`;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], `${path}.${k}`); if (d) return d; }
  return null;
}
const sameOrExplain = (x, y) => {
  const diffs = [...new Set([...Object.keys(x), ...Object.keys(y)])].map((k) => firstDiff(x[k], y[k], `.${k}`)).filter(Boolean);
  if (diffs.length) throw new Error(`divergências:\n${diffs.join('\n')}`);
};
const strip = (r) => { const { ms, careerId, ...rest } = r; return rest; };

try {
  console.log(`seed ${SEED}: execuções ${LONG_DAYS}d ×2, ${SHORT_DAYS}d, ${LONG_DAYS}d com reload…`);
  const a = run('a', LONG_DAYS);
  const b = run('b', LONG_DAYS);
  const short = run('short', SHORT_DAYS);
  const reload = run('reload', LONG_DAYS, ['--reloadEvery=14']);

  check('determinismo: mesma seed → saída idêntica', () => sameOrExplain(strip(a), strip(b)));

  check('sem vazamento de futuro: prefixo da carreira longa = carreira curta', () => {
    const cut = short.weekly.at(-1).day; // último snapshot da curta
    const pre = (r) => ({
      weekly: r.weekly.filter((w) => w.day < cut),
      matches: r.matches.filter((m) => m.date < short.weekly.at(-1).date),
      registrations: r.registrations.filter((x) => x.day < cut),
      sponsors: r.sponsors.filter((x) => x.day < cut),
      purchases: r.purchases.filter((x) => x.day < cut),
      coaches: r.coaches.filter((x) => x.day < cut),
      staff: r.staff.filter((x) => x.day < cut),
    });
    assert.ok(pre(short).weekly.length >= 4, 'prefixo curto demais');
    assert.deepStrictEqual(pre(a), pre(short));
  });

  // Save/reload: o estado persistido (perfil + entidades-chave) é idêntico
  // antes de fechar e depois de recarregar, em TODOS os reloads. (Igualdade
  // bit a bit da carreira inteira não é o critério: o runtime novo perde
  // caches em memória e a sequência aleatória posterior muda — como num
  // reabrir real do app.)
  check('save/reload: nenhum estado muda ao salvar e recarregar', () => {
    assert.ok(reload.reloads >= 3, `esperava ≥3 reloads, houve ${reload.reloads}`);
    assert.deepStrictEqual(reload.reloadMismatches, [], `divergências após reload: ${JSON.stringify(reload.reloadMismatches).slice(0, 400)}`);
    assert.equal(reload.errors.length, 0, `erros: ${reload.errors.join('; ')}`);
  });

  check('livro-razão: todo mês reconcilia e nada fica sem categoria', () => {
    for (const r of [a, short, reload]) {
      assert.deepStrictEqual(r.residualSites, {}, `resíduo sem categoria: ${JSON.stringify(r.residualSites)}`);
      for (const [month, L] of Object.entries(r.ledger)) {
        if (L.closing == null) continue;
        const inc = Object.values(L.income).reduce((s, v) => s + v, 0);
        const exp = Object.values(L.expense).reduce((s, v) => s + v, 0);
        assert.equal(L.opening + inc - exp + (L.transfers || 0), L.closing, `mês ${month} não fecha`);
      }
      const months = Object.keys(r.ledger).sort();
      for (let i = 1; i < months.length; i += 1) assert.equal(r.ledger[months[i]].opening, r.ledger[months[i - 1]].closing, `abertura de ${months[i]} ≠ fechamento anterior`);
      assert.equal(r.ledger[months.at(-1)].closing ?? r.finalCoins, r.finalCoins, 'saldo final ≠ moedas do perfil');
    }
  });

  check('paridade de lifecycle: mundo real andou e chaves do jogador são canônicas', () => {
    assert.ok(a.world, 'sem bloco world');
    assert.ok(a.world.tournamentsFinished > 0, 'nenhum torneio da IA finalizado');
    assert.ok(a.world.rankingResults > 0, 'nenhum AthleteRankingResult gravado');
    assert.ok(a.matches.length > 0, 'jogador não disputou partida');
    const played = new Set(a.tournaments.map((t) => t.tournamentId));
    assert.equal(a.world.playerCanonicalBrackets, played.size, 'torneio do jogador sem chave canônica (bracket_schema_version ≥ 2)');
    assert.equal(a.errors.length, 0, `erros: ${a.errors.join('; ')}`);
  });

  check('estático: política usa RNG próprio (não consome o RNG do jogo de forma oculta)', () => {
    const src = readFileSync(resolve('scripts/sim-progression-economy-v526.mjs'), 'utf8');
    assert.ok(src.includes('mulberry32(hashSeed(`policy:'), 'RNG de política não isolado');
    assert.ok(!/bracket_history/.test(src), 'simulador lê bracket_history (risco de conhecer resultado futuro)');
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} testes passaram`);
process.exit(failed.length ? 1 : 0);
