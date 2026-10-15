// Playthrough 5.27-D — núcleo do pipeline de validação de balanceamento
// distribuído/retomável. Compartilhado pelo orquestrador
// (run-balance-validation-v527d.mjs), pelo analisador (analyze-rebalance-527d.mjs)
// e pelos testes *-v527d.
//
// Princípio: DO NOT TUNE · DO NOT REDESIGN · FINISH THE EVIDENCE. Nada aqui
// altera configuração do jogo; o snapshot congelado só LÊ os valores.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync,
  renameSync, statSync, unlinkSync, writeFileSync, writeSync,
} from 'node:fs';
import { hostname, cpus, freemem, totalmem } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

export const SCHEMA_VERSION = '527d-result/1';
// Versão do caminho de execução: segmentos de 90 dias (processo novo a cada
// checkpoint) + clone rápido equivalente + RNG do Vite isolado do RNG do jogo. Resultados de outro caminho não são
// importados como DONE (ver legacy import, item 15).
export const HARNESS_VERSION = '5.27-D/segment90+fastclone+viterng/2';
export const CHECKPOINT_EVERY = 90;
export const MAX_PARALLEL = 2;
export const MAX_ATTEMPTS = 5;
// 5.27-H: PL527D_PRESETS=conservative-e,balanced-e,hardcore-e roda a mesma matriz nos presets -E.
export const PRESETS = process.env.PL527D_PRESETS ? process.env.PL527D_PRESETS.split(',') : ['conservative', 'balanced', 'hardcore'];
export const PROFILES = ['casual', 'normal', 'optimizer'];
export const STATUSES = ['PENDING', 'RUNNING', 'CHECKPOINTED', 'DONE', 'FAILED'];
// Mesmas convenções de dias das fases anteriores (5.26: 1826 = 5 temporadas,
// 3653 = 10; 5.27-C: 730 = 2 anos).
export const YEAR_DAYS = { 2: 730, 5: 1826, 10: 3653 };
// Dias de checkpoint arquivados para semear jobs mais longos da MESMA carreira
// (mesma seed/preset/perfil ⇒ mesmo estado no dia 720 do run de 2 e de 5 anos).
export const ARCHIVE_DAYS = process.env.PL527D_ARCHIVE_DAYS ? process.env.PL527D_ARCHIVE_DAYS.split(',').map(Number) : [720, 1800];

// Só para os testes *-v527d: dias curtos por duração ("2:20,5:30,10:40"),
// recusado na raiz oficial para nunca contaminar a matriz real.
export function targetDaysFor(years, root = rootDir()) {
  const override = process.env.PL527D_TEST_DAYS;
  if (!override) return YEAR_DAYS[years];
  if ([resolve('reports/rebalance-527d'), resolve('reports/rebalance-527h'), resolve('reports/rebalance-527i')].includes(resolve(root))) throw new Error('PL527D_TEST_DAYS não é permitido na raiz oficial');
  const map = Object.fromEntries(override.split(',').map((kv) => kv.split(':').map(Number)));
  return map[years] ?? YEAR_DAYS[years];
}

export function rootDir(base = process.env.PL527D_ROOT || 'reports/rebalance-527d') { return resolve(base); }
export function paths(root = rootDir()) {
  return {
    root,
    manifest: join(root, 'jobs-manifest.json'),
    lock: join(root, '.manifest.lock'),
    frozen: join(root, 'frozen-balance.json'),
    runs: join(root, 'runs'),
    work: join(root, 'work'),
    seedCheckpoints: join(root, 'seed-checkpoints'),
    bundles: join(root, 'job-bundles'),
    logs: join(root, 'logs'),
    stalls: join(root, 'logs', 'stalls'),
  };
}

// ── IDs ───────────────────────────────────────────────────────────────────
export const pad3 = (n) => String(n).padStart(3, '0');
export function jobId(preset, profile, seed, years) { return `${preset}-${profile}-seed${pad3(seed)}-${years}y`; }
export function parseJobId(id) {
  const m = /^((?:conservative|balanced|hardcore)(?:-e)?)-(casual|normal|optimizer)-seed(\d{3})-(\d+)y$/.exec(String(id));
  if (!m) return null;
  return { preset: m[1], profile: m[2], seed: Number(m[3]), targetYears: Number(m[4]) };
}

/** Matriz completa (99 jobs): Stage 1 (45), Stage 2 (45), long (3 obrigatórios + 6 preferenciais). */
export function buildMatrix() {
  const jobs = [];
  // Stage 1: intercala presets e perfis por seed — resultados parciais já são pareados.
  for (let seed = 1; seed <= 5; seed += 1) {
    for (const profile of PROFILES) for (const preset of PRESETS) jobs.push({ stage: '1', preset, profile, seed, targetYears: 2, required: true });
  }
  for (let seed = 1; seed <= 15; seed += 1) {
    for (const profile of PROFILES) jobs.push({ stage: '2', preset: 'balanced', profile, seed, targetYears: 5, required: true });
  }
  for (let seed = 1; seed <= 3; seed += 1) {
    for (const profile of PROFILES) jobs.push({ stage: 'long', preset: 'balanced', profile, seed, targetYears: 10, required: seed === 1 });
  }
  // 5.27-H: PL527D_STAGES=1 restringe a matriz ao Stage 1 (45 carreiras).
  const stages = process.env.PL527D_STAGES ? process.env.PL527D_STAGES.split(',') : null;
  return jobs.filter((j) => !stages || stages.includes(j.stage)).map((j) => ({ id: jobId(j.preset, j.profile, j.seed, j.targetYears), ...j }));
}

export function newJobEntry(spec, root = rootDir()) {
  const P = paths(root);
  return {
    id: spec.id, stage: spec.stage, preset: spec.preset, profile: spec.profile, seed: spec.seed, targetYears: spec.targetYears,
    targetDays: targetDaysFor(spec.targetYears, root), required: spec.required,
    status: 'PENDING', attempts: 0, startedAt: null, finishedAt: null,
    checkpointPath: rel(checkpointFileFor(spec, P.work)), lastCheckpointDay: null,
    resultPath: rel(join(P.runs, `${spec.id}.json`)), error: null, runtimeSeconds: null,
    owner: null, segments: 0, resumes: 0, seededFrom: null, resultHash: null, outcomeHash: null, importedFrom: null,
  };
}

export const rel = (p) => relative(process.cwd(), p).replace(/\\/g, '/');
export function workDirFor(id, workRoot = paths().work) { return join(workRoot, id); }
/** Caminho exato que o simulador usa: OUT/.checkpoints/<perfil>-<seed>.json */
export function checkpointFileFor(job, workRoot = paths().work) {
  return join(workDirFor(job.id, workRoot), '.checkpoints', `${job.profile}-${pad3(job.seed)}.json`);
}
export function simResultFileFor(job, workRoot = paths().work) {
  return join(workDirFor(job.id, workRoot), `${job.profile}-${pad3(job.seed)}.json`);
}

// ── Hash / JSON canônico ────────────────────────────────────────────────────
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v)).join(',')}]`;
  return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// Campos do resultado que NÃO são desfecho de jogo: tempo de parede, UUID
// aleatório do save (crypto.randomUUID, não semeado) e contadores do próprio
// harness (quantas vezes recarregou/retomou). Todo o resto entra no hash.
export const VOLATILE_RESULT_FIELDS = ['ms', 'careerId', 'reloads', 'resumes', 'checkpoints', 'checkpointRecoveries'];
// weekly[].saveMB é a medição do harness do maior arquivo no storage em
// memória: no modo contínuo os backups/ rotativos ficam na memória, no
// segmentado são podados a cada checkpoint (diferença medida: 0,01 MB). Ela
// continua no resultado (Bloco P), mas não é desfecho de jogo.
export function outcomeOf(result) {
  const copy = { ...result };
  for (const k of VOLATILE_RESULT_FIELDS) delete copy[k];
  if (Array.isArray(copy.weekly)) copy.weekly = copy.weekly.map(({ saveMB, ...w }) => w);
  return copy;
}
export const outcomeHash = (result) => sha256(canonical(outcomeOf(result)));

export function envelopeHash(envelope) {
  const { resultHash, ...rest } = envelope;
  return sha256(canonical(rest));
}

// ── Escrita atômica ─────────────────────────────────────────────────────────
function retry(fn, tries = 20) {
  for (let i = 0; ; i += 1) {
    try { return fn(); } catch (e) {
      if (i >= tries || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      const until = Date.now() + 25 * (i + 1); while (Date.now() < until) { /* espera curta */ }
    }
  }
}
export function atomicWrite(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = openSync(tmp, 'w');
  try { writeSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  retry(() => renameSync(tmp, file));
}
export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

// ── Checkpoint com checksum (formato escrito pelo simulador) ────────────────
// <JSON>\n#sha256:<hex do JSON>
export function readCheckpointText(file) {
  if (!existsSync(file)) return { ok: false, reason: 'missing' };
  const text = readFileSync(file, 'utf8');
  const cut = text.lastIndexOf('\n#sha256:');
  if (cut < 0) return { ok: false, reason: 'no-checksum' };
  const body = text.slice(0, cut);
  const expected = text.slice(cut + 9).trim();
  const actual = sha256(body);
  if (actual !== expected) return { ok: false, reason: 'checksum-mismatch', expected, actual };
  return { ok: true, body, sha: actual };
}
export function verifyCheckpoint(file) {
  const r = readCheckpointText(file);
  if (!r.ok) return r;
  try {
    const payload = JSON.parse(r.body);
    return { ok: true, sha: r.sha, day: payload.day, preset: payload.preset ?? null, profile: payload.profile, seed: payload.seed, harness: payload.harness ?? null };
  } catch (e) { return { ok: false, reason: `json:${e.message}` }; }
}
/** Lê só os metadados do checkpoint (sidecar gravado depois do arquivo). */
export function checkpointMeta(file) {
  const meta = `${file}.meta.json`;
  if (!existsSync(meta)) return null;
  try { return readJson(meta); } catch { return null; }
}

// ── Hash do código e snapshot congelado do balanceamento ───────────────────
const CODE_EXTRA_FILES = [
  'scripts/sim-progression-economy-v526.mjs', 'scripts/lib/v526CareerSim.mjs', 'scripts/lib/v526Actions.mjs',
  'scripts/lib/v526Tournament.mjs', 'scripts/lib/v527dFastClone.mjs', 'scripts/lib/v527gPartnerScore.mjs', 'scripts/lib/v527iOptimizerScore.mjs', 'vite.config.js', 'package.json', 'package-lock.json',
];
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
export function codeFiles(repo = process.cwd()) {
  const files = walk(join(repo, 'src')).map((p) => relative(repo, p).replace(/\\/g, '/'));
  for (const f of CODE_EXTRA_FILES) if (existsSync(join(repo, f))) files.push(f);
  return files.sort();
}
/** Hash de conteúdo (CRLF→LF, para não depender do autocrlf de cada máquina). */
export function fileHash(path) { return sha256(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')); }
export function computeCodeHash(repo = process.cwd()) {
  const list = codeFiles(repo).map((f) => [f, fileHash(join(repo, f))]);
  return { codeHash: sha256(canonical(list)), files: Object.fromEntries(list) };
}

const BALANCE_SOURCES = [
  'src/lib/balance527.js', 'src/lib/economy.js', 'src/lib/rankingPopulation.js', 'src/lib/circuitCatalog.js',
  'src/gameplay/difficulty/difficultyConfig.js', 'src/lib/staffCatalog.js', 'src/lib/storeCatalog.js',
  'src/lib/initialCareerProfiles.js', 'src/lib/sponsors.js', 'src/lib/padel.js',
];
function grab(text, re, label) {
  const m = re.exec(text);
  if (!m) throw new Error(`snapshot: não achei ${label}`);
  return m[1];
}
/**
 * Snapshot do balanceamento LIDO do código atual. `balanceHash` cobre os valores
 * estruturados; `sourceHashes` cobre os arquivos inteiros que carregam números
 * de balanceamento (qualquer edição neles também é detectada).
 */
export async function computeBalanceSnapshot(repo = process.cwd()) {
  const { BALANCE_527B_PRESETS } = await import(`file:///${join(repo, 'src/lib/balance527.js').replace(/\\/g, '/')}`);
  const read = (f) => readFileSync(join(repo, f), 'utf8');
  const economy = read('src/lib/economy.js');
  const population = read('src/lib/rankingPopulation.js');
  const circuit = read('src/lib/circuitCatalog.js');
  const presets = JSON.parse(JSON.stringify(BALANCE_527B_PRESETS));
  const anchorList = (name) => JSON.parse(`[${grab(population, new RegExp(`${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);`), name).replace(/\s+/g, '').replace(/,$/, '')}]`);
  const anchors = anchorList('OVERALL_RANK_ANCHORS');
  const pointAnchors = anchorList('RANKING_POINT_ANCHORS');
  const fireStaff = grab(economy, /(export async function fireStaff[\s\S]*?\n\})/, 'fireStaff');
  const values = {
    presets: Object.fromEntries(Object.entries(presets).map(([id, p]) => [id, {
      startingCoins: p.startingCoins,
      initialAttributeMultiplier: p.initialAttributeMultiplier,
      sponsorMonthlyMultiplier: p.sponsor.monthlyMultiplier,
      sponsorSignMultiplier: p.sponsor.signMultiplier,
      sponsorRequireProof: p.sponsor.requireProof,
      sponsorProofMinTournaments: p.sponsor.proofMinTournaments,
      prizeMultiplier: p.prizeMultiplier,
      staffMultiplier: p.staffMultiplier,
      shopPriceMultiplier: p.shopPriceMultiplier,
      shopBonusMultiplier: p.shopBonusMultiplier,
      investmentRateMultiplier: p.investmentRateMultiplier,
    }])),
    defaultPreset: 'balanced',
    cdbMonthlyRate: Number(grab(economy, /id: 'cdb'[^}]*return_rate: ([\d.]+)/, 'CDB return_rate')),
    bronzeAnchors: { overallRankAnchors: anchors, rankingPointAnchors: pointAnchors, jitterSpread: Number(grab(population, /OVERALL_JITTER_SPREAD = (\d+)/, 'OVERALL_JITTER_SPREAD')) },
    openTierBands: {
      ceilingMirror: grab(circuit, /const OPEN_TIER_CEILING_MIRROR = ([^;]+);/, 'OPEN_TIER_CEILING_MIRROR').trim(),
      silver: grab(circuit, /const OPEN_TIER_SILVER_BAND = Object\.freeze\((\{[^)]*\})\)/, 'OPEN_TIER_SILVER_BAND'),
      bronze: grab(circuit, /const OPEN_TIER_BRONZE_BAND = Object\.freeze\((\{[^)]*\})\)/, 'OPEN_TIER_BRONZE_BAND'),
    },
    severance: {
      rule: 'dismissal always succeeds; penalty = 50% of monthly cost when contract still running; becomes debt (termination_funded_by_debt) when penalty > coins',
      fireStaffSourceHash: sha256(fireStaff.replace(/\r\n/g, '\n')),
    },
  };
  return {
    version: '5.27-D',
    balanceHash: sha256(canonical(values)),
    values,
    presetsRaw: presets,
    sourceHashes: Object.fromEntries(BALANCE_SOURCES.map((f) => [f, fileHash(join(repo, f))])),
  };
}
/** Diferenças entre o snapshot congelado e o atual (0 = gate verde). */
export function balanceDiff(frozen, current) {
  const diffs = [];
  if (frozen.balanceHash !== current.balanceHash) diffs.push({ field: 'balanceHash', frozen: frozen.balanceHash, current: current.balanceHash });
  for (const [f, h] of Object.entries(frozen.sourceHashes || {})) if (current.sourceHashes?.[f] !== h) diffs.push({ field: `source:${f}`, frozen: h, current: current.sourceHashes?.[f] ?? null });
  return diffs;
}

// ── Lock do manifest ───────────────────────────────────────────────────────
export function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
export function withLock(lockFile, fn, { timeoutMs = 60000, staleMs = 120000 } = {}) {
  mkdirSync(dirname(lockFile), { recursive: true });
  const t0 = Date.now();
  for (;;) {
    try {
      const fd = openSync(lockFile, 'wx');
      writeSync(fd, JSON.stringify({ pid: process.pid, host: hostname(), at: Date.now() }));
      closeSync(fd);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let holder = null;
      try { holder = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { /* sendo escrito */ }
      const stale = holder && ((holder.host === hostname() && !pidAlive(holder.pid)) || Date.now() - holder.at > staleMs);
      if (stale) { try { unlinkSync(lockFile); } catch { /* outro já removeu */ } continue; }
      if (Date.now() - t0 > timeoutMs) throw new Error(`lock ocupado: ${lockFile} (${JSON.stringify(holder)})`);
      const until = Date.now() + 40; while (Date.now() < until) { /* espera */ }
    }
  }
  try { return fn(); } finally { try { unlinkSync(lockFile); } catch { /* já removido */ } }
}

// ── Manifest ───────────────────────────────────────────────────────────────
export function loadManifest(root = rootDir()) {
  const P = paths(root);
  return existsSync(P.manifest) ? readJson(P.manifest) : null;
}
export function saveManifest(manifest, root = rootDir()) {
  manifest.updatedAt = new Date().toISOString();
  manifest.counts = countStatuses(manifest);
  atomicWrite(paths(root).manifest, `${JSON.stringify(manifest, null, 2)}\n`);
}
/** read-modify-write do manifest sob lock (seguro entre processos). */
export function updateManifest(fn, root = rootDir()) {
  return withLock(paths(root).lock, () => {
    const manifest = loadManifest(root);
    if (!manifest) throw new Error('manifest ausente — rode --init');
    const out = fn(manifest);
    saveManifest(manifest, root);
    return out;
  });
}
export function countStatuses(manifest) {
  const counts = {};
  for (const stage of ['1', '2', 'long']) {
    const jobs = manifest.jobs.filter((j) => j.stage === stage);
    counts[stage] = Object.fromEntries(STATUSES.map((s) => [s, jobs.filter((j) => j.status === s).length]));
    counts[stage].total = jobs.length;
    counts[stage].requiredDone = jobs.filter((j) => j.required && j.status === 'DONE').length;
    counts[stage].required = jobs.filter((j) => j.required).length;
  }
  return counts;
}
export function createManifest({ codeHash, balanceHash }, root = rootDir()) {
  return {
    phase: '5.27-D', schemaVersion: SCHEMA_VERSION, harnessVersion: HARNESS_VERSION, checkpointEvery: CHECKPOINT_EVERY,
    codeHash, balanceHash, createdAt: new Date().toISOString(),
    jobs: buildMatrix().map((spec) => newJobEntry(spec, root)),
    events: [], determinismFailures: [], imports: [],
  };
}
export function logEvent(manifest, kind, data = {}) {
  manifest.events.push({ at: new Date().toISOString(), kind, ...data });
  if (manifest.events.length > 2000) manifest.events.splice(0, manifest.events.length - 2000);
}

/**
 * Item 6: RUNNING sem processo vivo nunca bloqueia a fila. Vivo = mesmo host,
 * pid do dono OU do simulador vivo E heartbeat recente. Senão:
 * resultado do simulador já gravado → FINALIZE (o orquestrador conclui),
 * checkpoint válido → CHECKPOINTED, nada → PENDING.
 */
export function recoverStaleJobs(manifest, { root = rootDir(), heartbeatFreshMs = 5 * 60000, now = Date.now() } = {}) {
  const P = paths(root);
  const recovered = [];
  for (const job of manifest.jobs) {
    if (job.status !== 'RUNNING') continue;
    const dir = workDirFor(job.id, P.work);
    const readAge = (f) => { try { const x = readJson(join(dir, f)); return { x, age: now - (Date.parse(x.at) || 0) }; } catch { return { x: null, age: Infinity }; } };
    // heartbeat.json = simulador (a cada 60 s); owner.json = orquestrador dono (a cada 60 s).
    const { x: hb, age: hbAge } = readAge('heartbeat.json');
    const { x: owner, age: ownerAge } = readAge('owner.json');
    const sameHost = !job.owner?.host || job.owner.host === hostname();
    const claimAge = now - (Date.parse(job.owner?.at) || 0);
    const alive = sameHost && ((ownerAge < heartbeatFreshMs && pidAlive(owner?.pid)) || (hbAge < heartbeatFreshMs && pidAlive(hb?.pid)) || (claimAge < heartbeatFreshMs && pidAlive(job.owner?.pid)));
    if (alive) continue;
    const ckpt = checkpointFileFor(job, P.work);
    const resultFile = simResultFileFor(job, P.work);
    const ck = existsSync(ckpt) ? verifyCheckpoint(ckpt) : { ok: false };
    const prev = existsSync(`${ckpt}.prev`) ? verifyCheckpoint(`${ckpt}.prev`) : { ok: false };
    const from = job.status;
    if (existsSync(resultFile)) job.status = 'CHECKPOINTED', job.pendingFinalize = true;
    else if (ck.ok || prev.ok) { job.status = 'CHECKPOINTED'; job.lastCheckpointDay = ck.ok ? ck.day : prev.day; }
    else job.status = 'PENDING';
    job.owner = null;
    recovered.push({ id: job.id, from, to: job.status, heartbeatAgeMs: Number.isFinite(hbAge) ? hbAge : null });
    logEvent(manifest, 'stale-running-recovered', recovered.at(-1));
  }
  return recovered;
}

// ── Carga da máquina (Bloco E) ─────────────────────────────────────────────
function cpuTimes() { return cpus().map((c) => c.times); }
export async function sampleCpu(ms = 1500) {
  const a = cpuTimes();
  await new Promise((r) => setTimeout(r, ms));
  const b = cpuTimes();
  let busy = 0; let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = (k) => b[i][k] - a[i][k];
    const t = d('user') + d('nice') + d('sys') + d('idle') + d('irq');
    busy += t - d('idle'); total += t;
  }
  return total ? Math.round((100 * busy) / total) : 0;
}
function processCounts() {
  try {
    const text = process.platform === 'win32'
      ? execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
      : execFileSync('ps', ['-eo', 'comm'], { encoding: 'utf8' });
    const names = text.split(/\r?\n/).map((l) => (l.split('","')[0] || '').replace(/^"/, '').toLowerCase().trim()).filter(Boolean);
    const count = (re) => names.filter((n) => re.test(n)).length;
    return { node: count(/^node(\.exe)?$/), java: count(/^java(w)?(\.exe)?$/), gradle: count(/gradle/), cargo: count(/^(cargo|rustc)(\.exe)?$/) };
  } catch { return null; }
}
function otherHarnesses() {
  if (process.platform !== 'win32') return null;
  try {
    const text = execFileSync('powershell', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'sim-progression|run-progression|playthrough|simulat' } | ForEach-Object { $_.ProcessId }"],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000 });
    return text.split(/\r?\n/).map((s) => Number(s.trim())).filter(Boolean);
  } catch { return null; }
}
export async function machineLoad() {
  const cpu = await sampleCpu();
  return {
    at: new Date().toISOString(), host: hostname(), cpuPct: cpu, cpus: cpus().length,
    freeMB: Math.round(freemem() / 1048576), totalMB: Math.round(totalmem() / 1048576),
    processes: processCounts(), harnessPids: otherHarnesses(),
  };
}

export { existsSync, copyFileSync, statSync, readdirSync, unlinkSync, mkdirSync, writeFileSync, readFileSync, hostname };
