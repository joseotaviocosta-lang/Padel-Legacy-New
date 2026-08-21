// Fase 13.1 (docs/FASE_13_1_CAREER_PACE_VALIDATION.md, Parte 2/24).
//
// Achado real da investigação (Parte 2): test:career-difficulty-pace nunca
// esteve travado — é CPU-bound por escopo (5 passadas de ~1000 carreiras ×
// 16 temporadas × 48 semanas cada, dominado por scoring de parceiro contra
// um pool de 2200 candidatos). Medido: ~0.3s/carreira, uniforme entre as 3
// dificuldades (sem outlier), confirmando ausência de O(n²)/loop infinito —
// só precisa de mais tempo (~20-25min em runs=100) do que timeouts curtos
// de CI costumam dar. Corrigido: a 5ª passada (hardCareers recomputava
// 'hard' do zero, já calculado na 3ª) virou reaproveitamento do resultado
// já obtido — ~20% mais rápido, zero mudança de números.
//
// Este teste prova, numa escala pequena e rápida (segundos, não minutos):
// (1) o tempo por carreira escala de forma LINEAR com o número de
// carreiras (nunca quadrática); (2) a correção da passada redundante
// realmente elimina uma chamada inteira de simulateDifficulty('hard').
import { spawnSync } from 'node:child_process';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function runWithRuns(runs) {
  const startedAt = Date.now();
  // seasons=4 (curto de propósito, só pra medir tempo) faz o harness sinalizar
  // "PEAK_MEDIAN_OUT_OF_RANGE" (exitCode=1) — comportamento CORRETO e
  // esperado dele (as janelas de auge são calibradas pra 16 temporadas, não
  // 4), não uma falha de execução. `proc.error` (falha real de spawn/timeout),
  // não `proc.status` (reflete achados de balanceamento, não crash), é o
  // sinal certo de "o processo não rodou".
  const proc = spawnSync(process.execPath, ['scripts/test-career-difficulty-pace.mjs', `--runs=${runs}`, '--seasons=4', '--output=reports/.perf-probe.json'], { encoding: 'utf8', timeout: 180_000 });
  if (proc.error) throw new Error(`test-career-difficulty-pace.mjs --runs=${runs} falhou ao executar: ${proc.error.message}`);
  if (!proc.stdout || !proc.stdout.includes('"configuration"')) throw new Error(`test-career-difficulty-pace.mjs --runs=${runs} não produziu saída esperada.`);
  return Date.now() - startedAt;
}

// Duas escalas pequenas (não a escala de produção — Parte 24 pede medir o
// PADRÃO de crescimento, não repetir a suíte inteira aqui, que já roda
// via test:career-difficulty-pace na regressão).
const t1 = runWithRuns(2);
const t2 = runWithRuns(6); // 3x mais carreiras que t1

console.log(`(info) runs=2: ${t1}ms · runs=6 (3x): ${t2}ms · razão: ${(t2 / t1).toFixed(2)}x`);

// Linear esperaria ~3x; O(n²) esperaria ~9x. Damos margem generosa (até 5x)
// pra absorver overhead fixo de setup (geração do pool de 2200 atletas,
// que não escala com `runs`) sem marcar falso-positivo.
gate('Tempo escala aproximadamente LINEAR com o número de carreiras (3x carreiras -> no máximo ~5x tempo, nunca ~9x de uma quadrática)', (t2 / t1) <= 5);

// ── Parte 2: a correção da passada redundante existe no arquivo real ────
import { readFileSync } from 'node:fs';
const source = readFileSync('scripts/test-career-difficulty-pace.mjs', 'utf8');
gate('BUG DE PERFORMANCE CORRIGIDO: hardCareers reaproveita o resultado já computado no loop principal, não recomputa simulateDifficulty(\'hard\') pela 2ª vez', source.includes('hardCareersFromLoop') && !/const hardCareers\s*=\s*simulateDifficulty\('hard'\)/.test(source));
gate('Instrumentação de tempo por fase (perPhaseMs) existe — Parte 2 pede "criar medição de tempo por etapa"', source.includes('perPhaseMs'));

console.log(`\n${gates} gates executados, todos PASS — Performance do harness de pace por dificuldade (Fase 13.1, Parte 2/24): escala linear, sem O(n²)/loop infinito, passada redundante eliminada.`);
