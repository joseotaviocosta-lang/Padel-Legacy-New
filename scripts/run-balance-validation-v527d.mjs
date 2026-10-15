// Playthrough 5.27-D — ORQUESTRADOR resumível da validação de balanceamento.
//
// Cada carreira é um job atômico (<preset>-<perfil>-seed<NNN>-<anos>y) no
// manifest reports/rebalance-527d/jobs-manifest.json. Cada job roda o simulador
// real (sim-progression-economy-v526.mjs) em SEGMENTOS de 90 dias: o processo
// sai após gravar o checkpoint e é relançado, retomando do arquivo — o caminho
// contínuo e o interrompido/retomado são o mesmo. O job só vira DONE depois de
// o resultado final (com hashes) estar persistido em runs/<id>.json.
//
// Uso:
//   node scripts/run-balance-validation-v527d.mjs --init
//   node scripts/run-balance-validation-v527d.mjs --status
//   node scripts/run-balance-validation-v527d.mjs --stage=1 [--parallel=1|2] [--max-jobs=N]
//   node scripts/run-balance-validation-v527d.mjs --job balanced-normal-seed003-2y
//   node scripts/run-balance-validation-v527d.mjs --stage=1 --preset=balanced --profile=normal --seed=3
//   node scripts/run-balance-validation-v527d.mjs --export-bundle [--stage=2] [--with-source]
//   node scripts/run-balance-validation-v527d.mjs --import=<pasta ou arquivo>
//   node scripts/run-balance-validation-v527d.mjs --import-legacy-527c
//   node scripts/run-balance-validation-v527d.mjs --reset-job=<id>        (só manual)
// --resume é aceito e é o comportamento padrão (nunca recomeça do zero com
// checkpoint válido).
import { spawn } from 'node:child_process';
import { appendFileSync, cpSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import * as J from './lib/v527dJobs.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d = null) => {
  const eq = argv.find((a) => a.startsWith(`--${n}=`));
  if (eq) return eq.slice(n.length + 3);
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

const ROOT = J.rootDir(opt('root') ?? undefined);
const P = J.paths(ROOT);
const PARALLEL = Math.min(J.MAX_PARALLEL, Math.max(1, Number(opt('parallel', 1))));
const MAX_JOBS = Number(opt('max-jobs', Infinity));
const HEARTBEAT_MS = Number(opt('heartbeat-ms', 60000));
const STALL_MIN = Number(opt('stall-min', 15));
const KILL_MIN = Number(opt('kill-min', 45));
const CHECKPOINT_EVERY = Number(opt('checkpoint-every', J.CHECKPOINT_EVERY));
const SIM = resolve('scripts/sim-progression-economy-v526.mjs');
for (const d of [P.root, P.runs, P.work, P.logs, P.stalls, P.seedCheckpoints]) J.mkdirSync(d, { recursive: true });

const LOG = join(P.logs, 'orchestrator.log');
const log = (line) => { const l = `${new Date().toISOString()} [${process.pid}] ${line}`; console.log(l); appendFileSync(LOG, `${l}\n`); };
const jobLog = (id, line) => appendFileSync(join(P.logs, `${id}.log`), `${new Date().toISOString()} ${line}\n`);

// ── Gates de integridade (freeze + código) ─────────────────────────────────
async function currentHashes() {
  const snapshot = await J.computeBalanceSnapshot();
  const { codeHash } = J.computeCodeHash();
  return { snapshot, codeHash };
}
async function assertFrozen(manifest) {
  if (!J.existsSync(P.frozen)) throw new Error('frozen-balance.json ausente — rode --init');
  const frozen = J.readJson(P.frozen);
  const { snapshot, codeHash } = await currentHashes();
  const diffs = J.balanceDiff(frozen, snapshot);
  if (diffs.length) throw new Error(`BALANCE FREEZE VIOLADO (${diffs.length} diferenças): ${JSON.stringify(diffs).slice(0, 600)}`);
  if (manifest && manifest.codeHash !== codeHash) throw new Error(`CODE HASH mudou desde o --init (${manifest.codeHash.slice(0, 12)} → ${codeHash.slice(0, 12)}); resultados não seriam comparáveis`);
  if (H) await assertFrozen527h();
  return { frozen, codeHash };
}

// 5.27-H: congelamento semântico (presets -E, política v3, táticas, ranking,
// população) + ambiente obrigatório. Cada verificação fica registrada em
// logs/freeze-checks.jsonl (prova de "nenhuma mudança durante a matriz").
const FROZEN_H = join(P.root, 'frozen-config.json');
// 5.27-I: mesma mecânica, módulo de freeze da fase (escolhido pela raiz/ambiente).
const PHASE_I = process.env.PL527I === '1' || (J.existsSync(FROZEN_H) && J.readJson(FROZEN_H).phase === '5.27-I');
const H = PHASE_I ? await import('./lib/v527iFreeze.mjs') : process.env.PL527H === '1' || J.existsSync(FROZEN_H) ? await import('./lib/v527hFreeze.mjs') : null;
async function assertFrozen527h() {
  if (!J.existsSync(FROZEN_H)) throw new Error('frozen-config.json (5.27-H) ausente — rode --init');
  const current = await H.computeFrozenConfig();
  const diffs = H.frozenDiff(J.readJson(FROZEN_H), current);
  const env = H.envViolations();
  appendFileSync(join(P.logs, 'freeze-checks.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), semanticHash: current.semanticHash, diffs: diffs.length, env })}\n`);
  if (diffs.length) throw new Error(`CONFIG 5.27-H MUDOU DURANTE A MATRIZ (${diffs.length}): ${JSON.stringify(diffs).slice(0, 600)}`);
  if (env.length) throw new Error(`AMBIENTE 5.27-H inválido: ${env.join('; ')}`);
}

async function init() {
  const { snapshot, codeHash } = await currentHashes();
  if (H && !J.existsSync(FROZEN_H)) {
    const env = H.envViolations();
    if (env.length) throw new Error(`AMBIENTE 5.27-H inválido: ${env.join('; ')}`);
    const cfg = await H.computeFrozenConfig();
    J.atomicWrite(FROZEN_H, `${JSON.stringify({ frozenAt: new Date().toISOString(), rule: 'nenhum valor muda durante o Stage 1 (5.27-H)', codeHash, balanceHash527d: snapshot.balanceHash, ...cfg }, null, 2)}\n`);
    log(`frozen-config.json (5.27-H) gravado · semanticHash ${cfg.semanticHash.slice(0, 16)}`);
  }
  if (J.existsSync(P.frozen)) {
    const frozen = J.readJson(P.frozen);
    const diffs = J.balanceDiff(frozen, snapshot);
    if (diffs.length) throw new Error(`frozen-balance.json existente difere do código: ${JSON.stringify(diffs).slice(0, 400)}`);
    log('frozen-balance.json já existe e confere (0 diferenças)');
  } else {
    // Comparação com o baseline congelado da 5.27-C (mesmo tuning?).
    let vs527c = null;
    const base = 'reports/rebalance-527c/balance-baseline.json';
    if (J.existsSync(base)) {
      const b = J.readJson(base);
      const strip = (p) => Object.fromEntries(Object.entries(p).map(([id, v]) => [id, { ...v, version: undefined }]));
      vs527c = {
        presetsIdentical: J.canonical(strip(b.presets)) === J.canonical(strip(snapshot.presetsRaw)),
        populationAnchorsIdentical: J.canonical(b.populationAnchors) === J.canonical(snapshot.values.bronzeAnchors.overallRankAnchors),
        baselineFrozenAt: b.frozenAt,
      };
    }
    J.atomicWrite(P.frozen, `${JSON.stringify({ frozenAt: new Date().toISOString(), phase: '5.27-D', rule: 'balance diff during 5.27-D = 0', ...snapshot, vs527c }, null, 2)}\n`);
    log(`frozen-balance.json gravado · balanceHash ${snapshot.balanceHash.slice(0, 16)} · vs 5.27-C ${JSON.stringify(vs527c)}`);
  }
  J.withLock(P.lock, () => {
    const existing = J.loadManifest(ROOT);
    if (existing) {
      // Acrescenta jobs que faltarem (nunca apaga nem reseta os existentes).
      const have = new Set(existing.jobs.map((j) => j.id));
      const add = J.buildMatrix().filter((s) => !have.has(s.id)).map((s) => J.newJobEntry(s, ROOT));
      existing.jobs.push(...add);
      J.saveManifest(existing, ROOT);
      log(`manifest existente preservado (+${add.length} jobs) · ${existing.jobs.length} jobs`);
      return;
    }
    const manifest = J.createManifest({ codeHash, balanceHash: snapshot.balanceHash }, ROOT);
    J.saveManifest(manifest, ROOT);
    log(`manifest criado · ${manifest.jobs.length} jobs · codeHash ${codeHash.slice(0, 16)}`);
  });
}

// ── Seleção / gate de estágio ──────────────────────────────────────────────
function selectJobs(manifest) {
  const ids = (opt('job') || '').split(',').filter(Boolean);
  for (const id of ids) if (!manifest.jobs.some((j) => j.id === id)) throw new Error(`job desconhecido: ${id} (formato <preset>-<perfil>-seed<NNN>-<anos>y)`);
  const stage = opt('stage'); const preset = opt('preset'); const profile = opt('profile'); const seed = opt('seed');
  const includeOptional = flag('include-optional') || stage === 'long' && flag('preferred');
  return manifest.jobs.filter((j) => {
    if (ids.length) return ids.includes(j.id);
    if (stage && j.stage !== String(stage)) return false;
    if (preset && j.preset !== preset) return false;
    if (profile && j.profile !== profile) return false;
    if (seed && j.seed !== Number(seed)) return false;
    if (!j.required && !includeOptional) return false;
    return true;
  }).map((j) => j.id);
}
function stageGate(manifest, stage) {
  if (flag('ignore-stage-gate') || opt('job')) return null;
  if (stage === '2') {
    const decisionFile = join(P.root, 'stage1-decision.json');
    const s1 = manifest.jobs.filter((j) => j.stage === '1');
    if (s1.some((j) => j.status !== 'DONE')) return `Stage 1 incompleto (${s1.filter((j) => j.status === 'DONE').length}/45)`;
    if (!J.existsSync(decisionFile)) return 'stage1-decision.json ausente — rode o analisador';
    const d = J.readJson(decisionFile);
    if (!d.proceedToStage2) return `decisão do Stage 1 não libera o Stage 2: ${d.reason}`;
  }
  if (stage === 'long') {
    const s2 = manifest.jobs.filter((j) => j.stage === '2');
    if (s2.some((j) => j.status !== 'DONE')) return `Stage 2 incompleto (${s2.filter((j) => j.status === 'DONE').length}/45)`;
  }
  return null;
}

// ── Carga da máquina ───────────────────────────────────────────────────────
const running = new Map(); // id -> { child, startedAt }
async function waitForCapacity(slot) {
  if (flag('no-load-check')) return;
  const t0 = Date.now();
  for (;;) {
    const load = await J.machineLoad();
    const ours = running.size;
    const external = (load.harnessPids || []).filter((pid) => ![...running.values()].some((r) => r.child?.pid === pid)).length;
    J.writeFileSync(join(P.logs, 'load-latest.json'), JSON.stringify({ ...load, oursRunning: ours, externalHarnesses: external }, null, 1));
    appendFileSync(join(P.logs, 'load.jsonl'), `${JSON.stringify({ ...load, slot, oursRunning: ours, externalHarnesses: external })}\n`);
    const cpuSaturated = load.cpuPct >= 90;
    // ~1,5 GB por job ativo nos anos finais; o 1º job sempre pode começar.
    const memoryShort = ours > 0 && load.freeMB < 1800;
    const waited = (Date.now() - t0) / 60000;
    if (!cpuSaturated && !memoryShort) return;
    if (ours === 0 && waited >= 15) { log(`external load detected (cpu ${load.cpuPct}% · livre ${load.freeMB}MB) — 15 min esperando; iniciando o único job mesmo assim`); return; }
    if (ours > 0 && waited >= 30 && slot > 0) { log(`slot ${slot}: sem capacidade há 30 min (cpu ${load.cpuPct}% · livre ${load.freeMB}MB) — segue com ${ours} job(s)`); return 'skip'; }
    log(`external load detected — aguardando (cpu ${load.cpuPct}% · livre ${load.freeMB}MB · nossos ${ours} · node ${load.processes?.node ?? '?'} · java ${load.processes?.java ?? '?'} · cargo ${load.processes?.cargo ?? '?'} · outros harnesses ${external})`);
    await new Promise((r) => setTimeout(r, 60000));
  }
}

// ── Checkpoints semente (mesma carreira, job mais longo) ───────────────────
function seedFileFor(job, day) { return join(P.seedCheckpoints, `${job.preset}-${job.profile}-seed${J.pad3(job.seed)}-d${day}.ckpt`); }
function archiveSeedCheckpoint(manifest, job, ckpt, meta) {
  if (!J.ARCHIVE_DAYS.includes(meta?.day)) return;
  const consumers = manifest.jobs.filter((j) => j.id !== job.id && j.preset === job.preset && j.profile === job.profile && j.seed === job.seed && j.targetDays > meta.day && j.status !== 'DONE');
  if (!consumers.length) return;
  const target = seedFileFor(job, meta.day);
  if (J.existsSync(target)) return;
  const check = J.verifyCheckpoint(ckpt);
  if (!check.ok) { log(`${job.id}: checkpoint do dia ${meta.day} inválido para arquivar (${check.reason})`); return; }
  J.copyFileSync(ckpt, `${target}.tmp`);
  J.atomicWrite(`${target}.json`, JSON.stringify({ sourceJob: job.id, day: meta.day, sha256: check.sha, codeHash: manifest.codeHash, balanceHash: manifest.balanceHash, harnessVersion: J.HARNESS_VERSION, preset: job.preset, profile: job.profile, seed: job.seed }));
  renameSync(`${target}.tmp`, target);
  log(`${job.id}: checkpoint do dia ${meta.day} arquivado como semente para ${consumers.map((c) => c.id).join(', ')}`);
}
function seedFromDonor(manifest, job) {
  if (process.env.PL527D_NO_SEED === '1') return null;
  const prefix = `${job.preset}-${job.profile}-seed${J.pad3(job.seed)}-d`;
  const candidates = J.readdirSync(P.seedCheckpoints).filter((f) => f.startsWith(prefix) && f.endsWith('.ckpt'))
    .map((f) => ({ f, day: Number(f.slice(prefix.length, -5)) })).filter((c) => c.day < job.targetDays).sort((a, b) => b.day - a.day);
  for (const c of candidates) {
    const file = join(P.seedCheckpoints, c.f);
    let meta = null; try { meta = J.readJson(`${file}.json`); } catch { meta = null; }
    if (!meta || meta.codeHash !== manifest.codeHash || meta.balanceHash !== manifest.balanceHash || meta.harnessVersion !== J.HARNESS_VERSION) { log(`${job.id}: semente ${c.f} incompatível (hash/harness) — ignorada`); continue; }
    const check = J.verifyCheckpoint(file);
    if (!check.ok || check.sha !== meta.sha256 || check.preset !== job.preset || check.profile !== job.profile || check.seed !== job.seed) { log(`${job.id}: semente ${c.f} inválida (${check.reason || 'metadados'}) — ignorada`); continue; }
    const ckpt = J.checkpointFileFor(job, P.work);
    J.mkdirSync(dirname(ckpt), { recursive: true });
    J.copyFileSync(file, `${ckpt}.tmp`);
    renameSync(`${ckpt}.tmp`, ckpt);
    J.writeFileSync(`${ckpt}.meta.json`, JSON.stringify({ day: check.day, sha256: check.sha, preset: job.preset, profile: job.profile, seed: job.seed, seededFrom: meta.sourceJob }));
    return { file: J.rel(file), day: check.day, sourceJob: meta.sourceJob, sha256: check.sha };
  }
  return null;
}

// ── Finalização (resultado → runs/<id>.json, depois DONE) ──────────────────
function finalizeJob(id, { runtimeAdd = 0 } = {}) {
  const manifest = J.loadManifest(ROOT);
  const job = manifest.jobs.find((j) => j.id === id);
  const simFile = J.simResultFileFor(job, P.work);
  const result = J.readJson(simFile);
  if (result.days !== job.targetDays || result.profile !== job.profile || Number(result.seed) !== job.seed) {
    throw new Error(`resultado inconsistente: days=${result.days}/${job.targetDays} profile=${result.profile} seed=${result.seed}`);
  }
  const runtimeSeconds = Math.round((job.runtimeSeconds || 0) + runtimeAdd);
  const envelope = {
    schemaVersion: J.SCHEMA_VERSION, jobId: job.id, stage: job.stage, preset: job.preset, profile: job.profile, seed: job.seed,
    targetYears: job.targetYears, targetDays: job.targetDays, codeHash: manifest.codeHash, balanceHash: manifest.balanceHash,
    harnessVersion: J.HARNESS_VERSION, checkpointEvery: CHECKPOINT_EVERY, fastClone: true, isolateViteRng: true, host: J.hostname(),
    runtimeSeconds, attempts: job.attempts, segments: job.segments, seededFrom: job.seededFrom, createdAt: new Date().toISOString(),
    ...(H ? { phase: H.PHASE, policy: process.env.PL527E_POLICY, semanticHash: J.readJson(FROZEN_H).semanticHash } : {}),
    outcomeHash: J.outcomeHash(result), result,
  };
  envelope.resultHash = J.envelopeHash(envelope);
  const target = resolve(job.resultPath);
  let duplicate = null;
  if (J.existsSync(target)) {
    const prior = J.readJson(target);
    duplicate = prior.outcomeHash === envelope.outcomeHash ? 'consistent' : 'DIVERGENT';
  }
  if (duplicate !== 'consistent') {
    const file = duplicate === 'DIVERGENT' ? target.replace(/\.json$/, `.dup-${Date.now()}.json`) : target;
    J.atomicWrite(file, JSON.stringify(envelope));
    const back = J.readJson(file);
    if (J.envelopeHash(back) !== envelope.resultHash) throw new Error('verificação pós-escrita falhou (hash)');
  }
  J.updateManifest((m) => {
    const j = m.jobs.find((x) => x.id === id);
    if (duplicate === 'DIVERGENT') {
      m.determinismFailures.push({ at: new Date().toISOString(), jobId: id, prior: J.readJson(target).outcomeHash, now: envelope.outcomeHash });
      J.logEvent(m, 'DETERMINISM FAILURE', { id });
      j.error = 'DETERMINISM FAILURE (resultado duplicado divergente)';
    }
    j.status = 'DONE'; j.finishedAt = envelope.createdAt; j.runtimeSeconds = runtimeSeconds; j.owner = null; j.pendingFinalize = false;
    j.resultHash = duplicate === 'consistent' ? J.readJson(target).resultHash : envelope.resultHash;
    j.outcomeHash = envelope.outcomeHash; if (duplicate !== 'DIVERGENT') j.error = null;
    J.logEvent(m, 'job-done', { id, runtimeSeconds, duplicate });
  }, ROOT);
  rmSync(J.workDirFor(id, P.work), { recursive: true, force: true });
  return { envelope, duplicate };
}

// ── Execução de um job ─────────────────────────────────────────────────────
function claim(id) {
  return J.updateManifest((m) => {
    J.recoverStaleJobs(m, { root: ROOT });
    const j = m.jobs.find((x) => x.id === id);
    if (!j || j.status === 'DONE' || j.status === 'RUNNING') return null;
    if (j.status === 'FAILED' && !flag('retry-failed')) return null;
    if (j.status === 'FAILED') { j.attempts = 0; j.error = null; }
    j.status = 'RUNNING'; j.owner = { pid: process.pid, host: J.hostname(), at: new Date().toISOString() };
    j.startedAt ||= j.owner.at;
    J.logEvent(m, 'job-claimed', { id });
    return { ...j };
  }, ROOT);
}
const patchJob = (id, fn) => J.updateManifest((m) => { const j = m.jobs.find((x) => x.id === id); fn(j, m); }, ROOT);

let stopping = false;
async function runJob(id) {
  const job = claim(id);
  if (!job) return 'skipped';
  const ckpt = J.checkpointFileFor(job, P.work);
  const workDir = J.workDirFor(id, P.work);
  J.mkdirSync(workDir, { recursive: true });
  const ownerBeat = () => { try { J.atomicWrite(join(workDir, 'owner.json'), JSON.stringify({ pid: process.pid, host: J.hostname(), at: new Date().toISOString() })); } catch { /* melhor-esforço */ } };
  ownerBeat();
  const ownerTimer = setInterval(ownerBeat, 60000);
  try { return await runJobBody(id, job, ckpt, workDir); } finally { clearInterval(ownerTimer); }
}
async function runJobBody(id, job, ckpt, workDir) {
  // Sim terminou mas o orquestrador morreu antes de finalizar.
  if (J.existsSync(J.simResultFileFor(job, P.work))) { finalizeJob(id); log(`${id}: resultado do simulador já existia — finalizado`); return 'done'; }
  const hasOwn = (J.existsSync(ckpt) && J.verifyCheckpoint(ckpt).ok) || (J.existsSync(`${ckpt}.prev`) && J.verifyCheckpoint(`${ckpt}.prev`).ok);
  if (!hasOwn && (J.existsSync(ckpt) || J.existsSync(`${ckpt}.prev`))) {
    patchJob(id, (j) => { j.status = 'FAILED'; j.error = 'CHECKPOINT_CORRUPT (nenhum checkpoint válido; use --reset-job para recomeçar)'; j.owner = null; });
    log(`${id}: CHECKPOINT_CORRUPT — não retomado em silêncio`);
    return 'failed';
  }
  if (!hasOwn) {
    const seeded = seedFromDonor(J.loadManifest(ROOT), job);
    if (seeded) { patchJob(id, (j) => { j.seededFrom = seeded; j.lastCheckpointDay = seeded.day; }); log(`${id}: semeado do checkpoint do dia ${seeded.day} de ${seeded.sourceJob}`); }
  }
  let attemptsThisRun = 0;
  for (;;) {
    if (stopping) { patchJob(id, (j) => { j.status = J.existsSync(ckpt) ? 'CHECKPOINTED' : 'PENDING'; j.owner = null; }); return 'stopped'; }
    // Gate a cada segmento: o código e o balanceamento não podem mudar no meio.
    try { await assertFrozen(J.loadManifest(ROOT)); } catch (e) {
      patchJob(id, (j) => { j.status = J.existsSync(ckpt) ? 'CHECKPOINTED' : 'PENDING'; j.owner = null; j.error = e.message.slice(0, 300); });
      log(`${id}: ${e.message}`); stopping = true; return 'stopped';
    }
    const startDay = J.checkpointMeta(ckpt)?.day ?? 0;
    const t0 = Date.now();
    const env = { ...process.env, PL527_PRESET: job.preset, PL527D_FASTCLONE: '1', PL527D_ISOLATE_VITE_RNG: '1', PL527D_HEARTBEAT: join(workDir, 'heartbeat.json'), PL527D_HEARTBEAT_MS: String(HEARTBEAT_MS), PL527D_STALL_MS: String(STALL_MIN * 60000), PL527D_JOB: id };
    delete env.PL526_SHIM;
    const child = spawn(process.execPath, ['--max-old-space-size=4096', SIM, `--profile=${job.profile}`, `--seeds=${job.seed}-${job.seed}`, `--days=${job.targetDays}`, `--out=${workDir}`, `--checkpointEvery=${CHECKPOINT_EVERY}`, '--segment'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    running.set(id, { child, startedAt: t0 });
    patchJob(id, (j) => { j.owner = { pid: process.pid, childPid: child.pid, host: J.hostname(), at: new Date().toISOString() }; });
    let tail = '';
    const keep = (buf) => { for (const line of String(buf).split('\n')) { if (!line.trim()) continue; tail = `${tail}\n${line}`.slice(-3000); if (/^\[(casual|normal|optimizer) \d+\]|^\[ckpt\]/.test(line)) jobLog(id, line.trim()); } };
    child.stdout.on('data', keep); child.stderr.on('data', keep);
    // Watchdog: heartbeat parado → registra estado; sem progresso por KILL_MIN → mata o PRÓPRIO filho e retoma do checkpoint.
    let killedByWatchdog = false; let stallLogged = false;
    const watchdog = setInterval(() => {
      const hbFile = join(workDir, 'heartbeat.json');
      let hb = null; try { hb = J.readJson(hbFile); } catch { hb = null; }
      const hbAge = hb ? Date.now() - Date.parse(hb.at) : Date.now() - t0;
      const stalledMs = Math.max(hb?.stalledForMs || 0, hbAge > 3 * HEARTBEAT_MS ? hbAge : 0);
      if (stalledMs >= STALL_MIN * 60000 && !stallLogged) {
        stallLogged = true;
        const rec = { at: new Date().toISOString(), id, heartbeat: hb, heartbeatAgeMs: hbAge, eventLoopBlocked: hbAge > 3 * HEARTBEAT_MS, tail: tail.slice(-1500) };
        J.writeFileSync(join(P.stalls, `${id}-day${hb?.day ?? 'x'}-${Date.now()}.json`), JSON.stringify(rec, null, 1));
        for (const f of J.readdirSync(workDir).filter((x) => x.startsWith('stall-'))) J.copyFileSync(join(workDir, f), join(P.stalls, `${id}-${f}`));
        log(`${id}: SOFT-LOCK suspeito — sem progresso há ${Math.round(stalledMs / 60000)} min (dia ${hb?.day}, fase ${hb?.phase}); estado registrado`);
      }
      if (stalledMs >= KILL_MIN * 60000) { killedByWatchdog = true; log(`${id}: sem progresso há ${KILL_MIN} min — encerrando o simulador (filho deste orquestrador) para retomar do checkpoint`); child.kill(); }
    }, Math.min(60000, HEARTBEAT_MS));
    const code = await new Promise((r) => child.on('close', (c) => r(c)));
    clearInterval(watchdog);
    running.delete(id);
    const seconds = (Date.now() - t0) / 1000;
    const meta = J.checkpointMeta(ckpt);
    if (code === 3) {
      const m = J.loadManifest(ROOT);
      archiveSeedCheckpoint(m, job, ckpt, meta);
      patchJob(id, (j) => { j.segments += 1; j.resumes += 1; j.runtimeSeconds = Math.round((j.runtimeSeconds || 0) + seconds); j.lastCheckpointDay = meta?.day ?? null; });
      jobLog(id, `segmento ${startDay}→${meta?.day} em ${Math.round(seconds)}s`);
      continue;
    }
    if (code === 0 && J.existsSync(J.simResultFileFor(job, P.work))) {
      const { envelope, duplicate } = finalizeJob(id, { runtimeAdd: seconds });
      const last = envelope.result.weekly.at(-1) || {};
      log(`${id}: DONE · ${envelope.result.days}d · rank ${last.rank} · OVR ${last.ovr} · moedas ${envelope.result.finalCoins} · ${Math.round(envelope.runtimeSeconds / 60)} min · erros ${envelope.result.errors.length}${duplicate ? ` · duplicado ${duplicate}` : ''}`);
      return 'done';
    }
    if (code === 5) {
      patchJob(id, (j) => { j.status = 'FAILED'; j.owner = null; j.error = `simulador recusou o checkpoint: ${tail.split('\n').filter((l) => /CHECKPOINT/.test(l)).slice(-1)[0] || 'código 5'}`.slice(0, 300); });
      log(`${id}: FAILED (checkpoint recusado)`);
      return 'failed';
    }
    if (stopping) { patchJob(id, (j) => { j.status = J.existsSync(ckpt) ? 'CHECKPOINTED' : 'PENDING'; j.owner = null; j.runtimeSeconds = Math.round((j.runtimeSeconds || 0) + seconds); }); return 'stopped'; }
    // Interrupção externa / crash / watchdog: retoma do último checkpoint válido.
    attemptsThisRun += 1;
    let attempts = 0;
    patchJob(id, (j) => { j.attempts += 1; attempts = j.attempts; j.runtimeSeconds = Math.round((j.runtimeSeconds || 0) + seconds); j.error = `saída ${code}${killedByWatchdog ? ' (watchdog)' : ''}: ${tail.slice(-400)}`; });
    log(`${id}: simulador saiu com ${code}${killedByWatchdog ? ' (watchdog)' : ''} no dia ~${meta?.day ?? 0}+ — tentativa ${attempts}/${J.MAX_ATTEMPTS}, retomando do checkpoint (${meta?.day ?? 'início'})`);
    if (attempts >= J.MAX_ATTEMPTS) {
      patchJob(id, (j) => { j.status = 'FAILED'; j.owner = null; });
      log(`${id}: FAILED após ${attempts} tentativas`);
      return 'failed';
    }
  }
}

// ── Bundles / import ───────────────────────────────────────────────────────
async function exportBundle() {
  const manifest = J.loadManifest(ROOT);
  const { frozen, codeHash } = await assertFrozen(manifest);
  const ids = selectJobs(manifest).filter((id) => manifest.jobs.find((j) => j.id === id).status !== 'DONE');
  const bundleId = `bundle-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const dir = join(P.bundles, bundleId);
  J.mkdirSync(join(dir, 'checkpoints'), { recursive: true });
  const jobs = [];
  for (const id of ids) {
    const job = manifest.jobs.find((j) => j.id === id);
    const ckpt = J.checkpointFileFor(job, P.work);
    let checkpoint = null;
    // Só o último checkpoint VÁLIDO (sem .prev, logs, heartbeat).
    if (J.existsSync(ckpt) && J.verifyCheckpoint(ckpt).ok) { J.copyFileSync(ckpt, join(dir, 'checkpoints', `${id}.ckpt`)); checkpoint = `checkpoints/${id}.ckpt`; }
    jobs.push({ id, preset: job.preset, profile: job.profile, seed: job.seed, targetYears: job.targetYears, targetDays: job.targetDays, checkpoint, checkpointDay: checkpoint ? J.verifyCheckpoint(ckpt).day : null });
  }
  const { files } = J.computeCodeHash();
  J.writeFileSync(join(dir, 'bundle.json'), JSON.stringify({ bundleId, createdAt: new Date().toISOString(), codeHash, balanceHash: frozen.balanceHash, harnessVersion: J.HARNESS_VERSION, schemaVersion: J.SCHEMA_VERSION, checkpointEvery: CHECKPOINT_EVERY, jobs }, null, 2));
  J.writeFileSync(join(dir, 'code-files.json'), JSON.stringify(files, null, 1));
  J.copyFileSync(P.frozen, join(dir, 'frozen-balance.json'));
  if (flag('with-source')) {
    for (const p of ['src', 'scripts/lib', 'scripts/sim-progression-economy-v526.mjs', 'scripts/run-balance-validation-v527d.mjs', 'vite.config.js', 'package.json', 'package-lock.json', 'jsconfig.json', 'index.html']) {
      if (J.existsSync(p)) cpSync(p, join(dir, 'source', p), { recursive: true });
    }
  }
  J.writeFileSync(join(dir, 'README.md'), [
    `# ${bundleId}`, '',
    'Jobs pendentes da validação 5.27-D para rodar em outra máquina (sem GitHub).', '',
    '1. Use uma cópia do repositório com o MESMO código (codeHash em bundle.json; `source/` se exportado com --with-source).',
    '2. `npm ci`',
    `3. Para cada job: copie o checkpoint (se houver) para \`reports/rebalance-527d/work/<id>/.checkpoints/<perfil>-<seed>.json\` e rode:`,
    '   `node scripts/run-balance-validation-v527d.mjs --init` (uma vez) e',
    '   `node scripts/run-balance-validation-v527d.mjs --job <id>`',
    '4. Traga de volta `reports/rebalance-527d/runs/<id>.json` e importe aqui com `--import=<pasta>`.',
    '   O import valida balanceHash, codeHash, schemaVersion, jobId e resultHash; nada é aceito em silêncio.', '',
    `Jobs (${jobs.length}): ${jobs.map((j) => j.id).join(', ')}`,
  ].join('\n'));
  log(`bundle exportado: ${J.rel(dir)} · ${jobs.length} jobs · ${jobs.filter((j) => j.checkpoint).length} com checkpoint`);
  return dir;
}

async function importResults(source) {
  const manifest = J.loadManifest(ROOT);
  const { frozen, codeHash } = await assertFrozen(manifest);
  const files = J.statSync(source).isDirectory() ? J.readdirSync(source).filter((f) => f.endsWith('.json')).map((f) => join(source, f)) : [source];
  const report = [];
  for (const file of files) {
    let env = null; const reasons = [];
    try { env = J.readJson(file); } catch (e) { reasons.push(`json inválido: ${e.message}`); }
    if (env) {
      if (env.schemaVersion !== J.SCHEMA_VERSION) reasons.push(`schemaVersion ${env.schemaVersion} ≠ ${J.SCHEMA_VERSION}`);
      if (env.harnessVersion !== J.HARNESS_VERSION) reasons.push(`harnessVersion ${env.harnessVersion} ≠ ${J.HARNESS_VERSION}`);
      if (env.balanceHash !== frozen.balanceHash) reasons.push('balanceHash diferente do congelado');
      if (env.codeHash !== codeHash) reasons.push('codeHash diferente do código atual');
      const parsed = J.parseJobId(env.jobId);
      const job = manifest.jobs.find((j) => j.id === env.jobId);
      if (!parsed || !job) reasons.push(`jobId desconhecido: ${env.jobId}`);
      else if (parsed.preset !== env.preset || parsed.profile !== env.profile || parsed.seed !== env.seed || parsed.targetYears !== env.targetYears) reasons.push('campos do envelope não batem com o jobId');
      if (J.envelopeHash(env) !== env.resultHash) reasons.push('resultHash não confere (arquivo alterado/corrompido)');
      if (env.result && J.outcomeHash(env.result) !== env.outcomeHash) reasons.push('outcomeHash não confere');
      if (env.result && job && env.result.days !== job.targetDays) reasons.push(`dias ${env.result.days} ≠ ${job.targetDays}`);
    }
    if (reasons.length) { report.push({ file, jobId: env?.jobId ?? null, accepted: false, reasons }); log(`import REJEITADO ${basename(file)}: ${reasons.join('; ')}`); continue; }
    const job = manifest.jobs.find((j) => j.id === env.jobId);
    const target = resolve(job.resultPath);
    if (J.existsSync(target)) {
      const prior = J.readJson(target);
      const same = prior.outcomeHash === env.outcomeHash;
      if (!same) {
        J.updateManifest((m) => { m.determinismFailures.push({ at: new Date().toISOString(), jobId: env.jobId, prior: prior.outcomeHash, imported: env.outcomeHash, file }); J.logEvent(m, 'DETERMINISM FAILURE', { id: env.jobId, file }); }, ROOT);
        J.atomicWrite(target.replace(/\.json$/, `.import-${Date.now()}.json`), JSON.stringify(env));
      }
      report.push({ file, jobId: env.jobId, accepted: same, duplicate: same ? 'consistent' : 'DETERMINISM FAILURE' });
      log(`import ${env.jobId}: duplicado ${same ? 'consistente' : 'DIVERGENTE — DETERMINISM FAILURE'}`);
      continue;
    }
    J.atomicWrite(target, JSON.stringify(env));
    J.updateManifest((m) => {
      const j = m.jobs.find((x) => x.id === env.jobId);
      if (j.status === 'RUNNING') throw new Error(`${j.id} está RUNNING aqui — não importo por cima`);
      Object.assign(j, { status: 'DONE', finishedAt: env.createdAt, runtimeSeconds: env.runtimeSeconds, resultHash: env.resultHash, outcomeHash: env.outcomeHash, importedFrom: { file: J.rel(file), host: env.host }, error: null, owner: null });
      m.imports.push({ at: new Date().toISOString(), jobId: env.jobId, file: J.rel(file), host: env.host });
      J.logEvent(m, 'job-imported', { id: env.jobId });
    }, ROOT);
    report.push({ file, jobId: env.jobId, accepted: true });
    log(`import ${env.jobId}: aceito (host ${env.host})`);
  }
  J.atomicWrite(join(P.logs, `import-${Date.now()}.json`), JSON.stringify(report, null, 2));
  return report;
}

// Item 15: a carreira da 5.27-C só entra como DONE com tuning/harness/schema compatíveis.
async function importLegacy527c() {
  const manifest = J.loadManifest(ROOT);
  const { frozen } = await assertFrozen(manifest);
  const file = 'reports/rebalance-527c/conservative/raw/casual-001.json';
  const id = J.jobId('conservative', 'casual', 1, 2);
  const checks = { file, jobId: id, exists: J.existsSync(file) };
  if (checks.exists) {
    const raw = J.readJson(file);
    checks.tuningIdentical = Boolean(frozen.vs527c?.presetsIdentical && frozen.vs527c?.populationAnchorsIdentical);
    checks.harness527c = 'sim-progression-economy-v526 sem checkpoint (0 segmentos), sem fastclone';
    checks.harnessCompatible = false;
    checks.schemaCompatible = Boolean(raw.schemaVersion === J.SCHEMA_VERSION);
    checks.days = raw.days;
    checks.outcomeHash = J.outcomeHash(raw);
  }
  checks.decision = checks.exists && checks.tuningIdentical && checks.harnessCompatible && checks.schemaCompatible ? 'IMPORT' : 'RERUN';
  checks.reason = checks.decision === 'RERUN' ? 'harness 5.27-C (sem segmentos/fastclone) e resultado sem envelope/hashes ≠ 5.27-D: o job é rerodado; o outcomeHash da 5.27-C fica registrado para comparação de equivalência' : 'compatível';
  J.atomicWrite(join(P.root, 'legacy-import-527c.json'), `${JSON.stringify(checks, null, 2)}\n`);
  log(`legacy 5.27-C ${id}: ${checks.decision} — ${checks.reason}`);
  return checks;
}

function status() {
  const m = J.loadManifest(ROOT);
  if (!m) { console.log('sem manifest'); return; }
  const c = J.countStatuses(m);
  console.log(JSON.stringify(c, null, 1));
  for (const j of m.jobs.filter((x) => ['RUNNING', 'CHECKPOINTED', 'FAILED'].includes(x.status))) console.log(`${j.status.padEnd(12)} ${j.id} dia ${j.lastCheckpointDay ?? '-'} tentativas ${j.attempts} ${j.error ? `· ${j.error.slice(0, 120)}` : ''}`);
  if (m.determinismFailures.length) console.log(`DETERMINISM FAILURES: ${m.determinismFailures.length}`);
}

// ── main ───────────────────────────────────────────────────────────────────
process.on('SIGINT', () => { stopping = true; log('SIGINT — encerrando os simuladores deste orquestrador; jobs voltam a CHECKPOINTED'); for (const r of running.values()) r.child.kill(); });
process.on('SIGTERM', () => { stopping = true; for (const r of running.values()) r.child.kill(); });

if (flag('init')) { await init(); process.exit(0); }
if (flag('status')) { status(); process.exit(0); }
if (opt('reset-job')) {
  const id = opt('reset-job');
  J.updateManifest((m) => { const j = m.jobs.find((x) => x.id === id); if (!j) throw new Error(`job desconhecido ${id}`); if (j.status === 'DONE') throw new Error('job DONE não é resetado'); Object.assign(j, J.newJobEntry(j, ROOT)); J.logEvent(m, 'job-reset', { id }); }, ROOT);
  rmSync(J.workDirFor(id, P.work), { recursive: true, force: true });
  log(`${id}: resetado manualmente`); process.exit(0);
}
if (flag('export-bundle')) { await exportBundle(); process.exit(0); }
if (opt('import')) { const r = await importResults(resolve(opt('import'))); process.exit(r.every((x) => x.accepted) ? 0 : 2); }
if (flag('import-legacy-527c')) { await importLegacy527c(); process.exit(0); }

{
  const manifest = J.loadManifest(ROOT);
  if (!manifest) throw new Error('manifest ausente — rode --init');
  await assertFrozen(manifest);
  const recovered = J.updateManifest((m) => J.recoverStaleJobs(m, { root: ROOT }), ROOT);
  if (recovered.length) log(`recuperados ${recovered.length} jobs RUNNING obsoletos: ${recovered.map((r) => `${r.id} → ${r.to}`).join(', ')}`);
  if (flag('recover')) process.exit(0);
  const stage = opt('stage');
  const gate = stage ? stageGate(J.loadManifest(ROOT), String(stage)) : null;
  if (gate) { log(`Stage ${stage} bloqueado: ${gate}`); process.exit(2); }
  const queue = selectJobs(J.loadManifest(ROOT)).filter((id) => { const j = J.loadManifest(ROOT).jobs.find((x) => x.id === id); return j.status !== 'DONE' && (j.status !== 'FAILED' || flag('retry-failed')); });
  // Jobs com checkpoint primeiro (terminar o que começou).
  const m0 = J.loadManifest(ROOT);
  queue.sort((a, b) => (m0.jobs.find((j) => j.id === b).status === 'CHECKPOINTED') - (m0.jobs.find((j) => j.id === a).status === 'CHECKPOINTED'));
  log(`fila: ${queue.length} jobs · paralelismo ${PARALLEL} · max-jobs ${MAX_JOBS} · checkpoint a cada ${CHECKPOINT_EVERY} dias`);
  let started = 0; const outcomes = [];
  async function worker(slot) {
    if (slot > 0) await new Promise((r) => setTimeout(r, 90000)); // deixa o 1º job aquecer antes de medir carga
    while (!stopping && queue.length && started < MAX_JOBS) {
      const cap = await waitForCapacity(slot);
      if (cap === 'skip') { await new Promise((r) => setTimeout(r, 10 * 60000)); continue; }
      const id = queue.shift();
      if (!id) break;
      started += 1;
      const t0 = Date.now();
      let res;
      try { res = await runJob(id); } catch (e) {
        res = 'failed';
        log(`${id}: erro do orquestrador: ${e.stack || e.message}`);
        patchJob(id, (j) => { j.status = J.existsSync(J.checkpointFileFor(j, P.work)) ? 'CHECKPOINTED' : 'PENDING'; j.owner = null; j.error = `orquestrador: ${e.message}`.slice(0, 300); });
      }
      outcomes.push({ id, res, minutes: Math.round((Date.now() - t0) / 60000), concurrent: running.size + 1 });
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, (_, i) => worker(i)));
  const c = J.countStatuses(J.loadManifest(ROOT));
  log(`fim desta execução · ${outcomes.map((o) => `${o.id}:${o.res}`).join(' ')} · contagem ${JSON.stringify(c)}`);
  process.exit(outcomes.some((o) => o.res === 'failed') ? 1 : 0);
}
