// Playthrough 5.26 — orquestrador das carreiras da auditoria.
// Um processo por carreira (memória liberada ao fim de cada uma), N workers em
// paralelo, retomável: carreiras com JSON já gravado são puladas.
//
//   node scripts/run-progression-economy-v526.mjs --workers=4 --seeds=30 --longSeeds=3
//
// Lote principal: casual/normal/otimizador × seeds 1..N × 5 temporadas (1826 dias).
// Lote longo:     3 seeds por perfil × 10 temporadas (3653 dias).
// Amostra de save/reload: 20% das seeds (seed % 5 === 0) recarregam o runtime a
// cada 180 dias a partir do storage persistido.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const WORKERS = Number(arg('workers', 4));
const SEEDS = Number(arg('seeds', 30));
const LONG_SEEDS = Number(arg('longSeeds', 3));
const PROFILES = arg('profiles', 'normal,casual,optimizer').split(',');
// 5.26-B: pasta de saída, dias e faixa de seeds configuráveis (auditoria de
// integridade reduzida) sem mudar o padrão da 5.26.
const ROOT = resolve(arg('root', 'reports/progression-economy-526'));
const RAW = resolve(ROOT, 'raw');
const RAW_LONG = resolve(ROOT, 'raw-long');
const LOG = resolve(ROOT, 'runner.log');
const MAIN_DAYS = Number(arg('days', 1826));
// 5.26-C: checkpoint por carreira + segmentos (o simulador sai com 3 a cada
// checkpoint e é reiniciado, retomando do arquivo). Saída anormal (kill
// externo) também é retomada do último checkpoint, até MAX_RETRIES vezes.
const CHECKPOINT_EVERY = Number(arg('checkpointEvery', 0));
const MAX_RETRIES = Number(arg('maxRetries', 5));
const LONG_DAYS = Number(arg('longDays', 3653));
// 5.26-C: seeds cujo save FINAL é gravado (--keepSave) para a conferência manual.
const KEEP_SAVE_SEEDS = new Set(String(arg('keepSaveSeeds', '')).split(',').filter(Boolean).map(Number));
mkdirSync(RAW, { recursive: true });
mkdirSync(RAW_LONG, { recursive: true });

const jobs = [];
// Intercala perfis para que resultados parciais já cubram os três.
for (let s = 1; s <= SEEDS; s += 1) {
  for (const p of PROFILES) jobs.push({ profile: p, seed: s, days: MAIN_DAYS, out: RAW, reloadEvery: s % 5 === 0 ? 180 : 0 });
}
for (let s = 1; s <= LONG_SEEDS; s += 1) {
  for (const p of PROFILES) jobs.push({ profile: p, seed: 500 + s, days: LONG_DAYS, out: RAW_LONG, reloadEvery: 0 });
}
// 5.26-C: --longFirst=1 põe a 1ª seed longa (501, um por perfil) no início da
// fila — o mínimo de carreiras de 10 temporadas sai primeiro; as demais
// longas continuam no fim.
if (arg('longFirst', '0') === '1') {
  const first = jobs.filter((j) => j.seed === 501);
  jobs.splice(0, jobs.length, ...first, ...jobs.filter((j) => j.seed !== 501));
}
// --interleaveLong=K: uma carreira longa a cada K posições da fila (a 1ª na
// posição 0), na ordem seed 501 → 503. Limita quantas longas (≈2 GB de RSS
// cada nos anos finais) rodam ao mesmo tempo sem deixar workers ociosos.
const INTERLEAVE = Number(arg('interleaveLong', 0));
if (INTERLEAVE > 0) {
  const longs = jobs.filter((j) => j.days === LONG_DAYS);
  const mains = jobs.filter((j) => j.days !== LONG_DAYS);
  const ordered = [];
  while (longs.length || mains.length) {
    if (longs.length) ordered.push(longs.shift());
    ordered.push(...mains.splice(0, INTERLEAVE - 1));
    if (!longs.length) { ordered.push(...mains.splice(0)); }
  }
  jobs.splice(0, jobs.length, ...ordered);
}
// 5.26-C: --jobs=perfil-seed,... restringe o plano a essas carreiras (alvo
// reduzido a 40 carreiras a pedido do usuário).
const ONLY_JOBS = String(arg('jobs', '')).split(',').filter(Boolean);
if (ONLY_JOBS.length) jobs.splice(0, jobs.length, ...jobs.filter((j) => ONLY_JOBS.includes(`${j.profile}-${j.seed}`)));
// 5.26-C: trava por lote — supervisor e watchdog podem relançar o runner ao
// mesmo tempo depois de um kill externo; dois runners no mesmo lote
// processariam a mesma carreira em paralelo sobre o mesmo checkpoint.
const LOCK = resolve(ROOT, '.runner.lock');
if (existsSync(LOCK)) {
  const other = Number(readFileSync(LOCK, 'utf8'));
  let alive = false;
  try { if (other && other !== process.pid) { process.kill(other, 0); alive = true; } } catch { alive = false; }
  if (alive) { console.log(`outro runner ativo neste lote (pid ${other}); saindo`); process.exit(0); }
}
writeFileSync(LOCK, String(process.pid));
const pending = jobs.filter((j) => !existsSync(resolve(j.out, `${j.profile}-${String(j.seed).padStart(3, '0')}.json`)));
const log = (line) => { const l = `${new Date().toISOString()} ${line}`; console.log(l); appendFileSync(LOG, `${l}\n`); };
log(`início: ${jobs.length} carreiras no plano, ${pending.length} pendentes, ${WORKERS} workers`);

let done = 0;
async function worker(id) {
  while (pending.length) {
    const job = pending.shift();
    const t0 = Date.now();
    let code = null; let segments = 0; let retries = 0;
    for (;;) {
    code = await new Promise((resolveRun) => {
      const child = spawn(process.execPath, [
        '--max-old-space-size=3072', 'scripts/sim-progression-economy-v526.mjs',
        `--profile=${job.profile}`, `--seeds=${job.seed}-${job.seed}`, `--days=${job.days}`,
        `--reloadEvery=${job.reloadEvery}`, `--out=${job.out}`,
        ...(CHECKPOINT_EVERY > 0 ? [`--checkpointEvery=${CHECKPOINT_EVERY}`, '--segment'] : []),
        ...(KEEP_SAVE_SEEDS.has(job.seed) ? ['--keepSave'] : []),
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      let tail = '';
      const keep = (buf) => {
        for (const line of String(buf).split('\n')) {
          if (/^\[(casual|normal|optimizer) \d+\]/.test(line)) log(`w${id} ${line.trim()}`);
          else if (line.trim()) tail = `${tail}\n${line}`.slice(-2000);
        }
      };
      child.stdout.on('data', keep);
      child.stderr.on('data', keep);
      child.on('close', (c) => { if (c !== 0 && c !== 3) log(`w${id} ${job.profile}-${job.seed} saiu com código ${c}: ${tail.slice(-600)}`); resolveRun(c); });
    });
    if (code === 3) { segments += 1; continue; } // fim de segmento → retoma do checkpoint
    if (code !== 0 && CHECKPOINT_EVERY > 0 && retries < MAX_RETRIES) { retries += 1; log(`w${id} ${job.profile}-${job.seed} retomando do checkpoint (tentativa ${retries}/${MAX_RETRIES})`); continue; }
    break;
    }
    done += 1;
    log(`w${id} ${job.profile}-${job.seed} (${job.days}d) ${code === 0 ? 'ok' : 'FALHA'} em ${Math.round((Date.now() - t0) / 60000)} min · ${segments} segmentos · ${retries} retomadas · ${done} feitas · ${pending.length} na fila`);
  }
}
await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i + 1)));
// 5.26-C: marcador para o supervisor (relança o runner se ele for morto de fora).
const missing = jobs.filter((j) => !existsSync(resolve(j.out, `${j.profile}-${String(j.seed).padStart(3, '0')}.json`)));
if (!missing.length) writeFileSync(resolve(ROOT, '.complete'), new Date().toISOString());
log(`fim · ${missing.length} carreiras sem resultado`);
