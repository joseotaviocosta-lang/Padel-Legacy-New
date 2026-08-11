import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEV_HOST = '127.0.0.1';
export const DEV_PORT = 5174;
export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function execFileResult(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function comparablePath(value) {
  return String(value ?? '')
    .replaceAll('/', path.sep)
    .replaceAll('\\\\', '\\')
    .toLowerCase();
}

export function isRecognizedProjectViteProcess(processDetails, projectRoot = PROJECT_ROOT) {
  const processName = String(processDetails?.name ?? '').toLowerCase();
  const commandLine = comparablePath(processDetails?.commandLine);
  const normalizedRoot = comparablePath(path.resolve(projectRoot)).replace(/\\$/, '');
  const viteEntry = `${normalizedRoot}\\node_modules\\vite\\bin\\vite.js`;
  const npmShimViteEntry = `${normalizedRoot}\\node_modules\\.bin\\..\\vite\\bin\\vite.js`;

  return (processName === 'node' || processName === 'node.exe')
    && (commandLine.includes(viteEntry) || commandLine.includes(npmShimViteEntry));
}

export function parseWindowsNetstat(output, port) {
  const targetPort = Number(port);
  const processIds = new Set();

  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (!match) continue;
    const portMatch = match[1].match(/:(\d+)$/);
    if (Number(portMatch?.[1]) === targetPort) processIds.add(Number(match[2]));
  }

  return [...processIds].filter((pid) => Number.isSafeInteger(pid) && pid > 0);
}

async function getListeningProcessIdsWindows(port) {
  const { stdout } = await execFileResult('netstat.exe', ['-ano', '-p', 'tcp']);
  return parseWindowsNetstat(stdout, port);
}

async function getListeningProcessIdsUnix(port) {
  try {
    const { stdout } = await execFileResult('lsof', [
      '-nP',
      `-iTCP:${port}`,
      '-sTCP:LISTEN',
      '-t',
    ]);
    return [...new Set(stdout.split(/\s+/).map(Number).filter((pid) => Number.isSafeInteger(pid) && pid > 0))];
  } catch (error) {
    if (error.code === 1) return [];
    throw error;
  }
}

export async function getListeningProcessIds(port = DEV_PORT) {
  return process.platform === 'win32'
    ? getListeningProcessIdsWindows(port)
    : getListeningProcessIdsUnix(port);
}

function parseTasklistName(output) {
  const match = String(output).match(/^"([^"]+)"/m);
  return match?.[1] ?? 'unknown';
}

async function getWindowsProcessDetails(pid) {
  const command = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); '
    + "$ErrorActionPreference = 'Stop'; "
    + `$process = Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\"; `
    + 'if ($null -eq $process) { exit 3 }; '
    + '[pscustomobject]@{ '
    + 'pid = [int]$process.ProcessId; '
    + 'parentPid = [int]$process.ParentProcessId; '
    + 'name = [string]$process.Name; '
    + 'executablePath = [string]$process.ExecutablePath; '
    + 'commandLine = [string]$process.CommandLine '
    + '} | ConvertTo-Json -Compress';

  try {
    const { stdout } = await execFileResult('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      command,
    ]);
    return JSON.parse(stdout.trim());
  } catch {
    const { stdout } = await execFileResult('tasklist.exe', [
      '/FI',
      `PID eq ${pid}`,
      '/FO',
      'CSV',
      '/NH',
    ]).catch(() => ({ stdout: '' }));
    return {
      pid,
      parentPid: null,
      name: parseTasklistName(stdout),
      executablePath: null,
      commandLine: null,
    };
  }
}

async function getUnixProcessDetails(pid) {
  try {
    const { stdout } = await execFileResult('ps', ['-p', String(pid), '-o', 'pid=,ppid=,comm=,args=']);
    const match = stdout.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+([\s\S]+)$/);
    if (!match) throw new Error('Processo não encontrado.');
    return {
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      name: path.basename(match[3]),
      executablePath: match[3],
      commandLine: match[4],
    };
  } catch {
    return { pid, parentPid: null, name: 'unknown', executablePath: null, commandLine: null };
  }
}

export async function getProcessDetails(pid) {
  return process.platform === 'win32'
    ? getWindowsProcessDetails(pid)
    : getUnixProcessDetails(pid);
}

export async function getAncestorProcessIds(startPid = process.ppid, maximumDepth = 16) {
  const ancestors = [];
  const visited = new Set();
  let currentPid = Number(startPid);

  while (Number.isSafeInteger(currentPid) && currentPid > 0 && !visited.has(currentPid) && ancestors.length < maximumDepth) {
    visited.add(currentPid);
    const details = await getProcessDetails(currentPid);
    const exists = details.name !== 'unknown' || details.executablePath || details.commandLine;
    if (!exists) break;
    ancestors.push(currentPid);
    currentPid = Number(details.parentPid);
  }

  return ancestors;
}

export async function inspectDevPort({ port = DEV_PORT, projectRoot = PROJECT_ROOT } = {}) {
  const processIds = await getListeningProcessIds(port);
  if (processIds.length === 0) return { port, state: 'free', processes: [] };

  const processes = await Promise.all(processIds.map(async (pid) => {
    const details = await getProcessDetails(pid);
    return {
      ...details,
      recognizedProjectVite: isRecognizedProjectViteProcess(details, projectRoot),
    };
  }));
  const allRecognized = processes.every((details) => details.recognizedProjectVite);

  return {
    port,
    state: allRecognized ? 'project_vite' : 'unknown',
    processes,
  };
}

export function formatProcessDetails(details) {
  return [
    `PID: ${details.pid}`,
    `Processo: ${details.name || 'unknown'}`,
    `Executável: ${details.executablePath || '<indisponível>'}`,
    `Comando: ${details.commandLine || '<indisponível>'}`,
  ].join('\n');
}

export function formatPortStatus(report) {
  const header = `Padel Legacy DEV\nPort: ${report.port}`;
  if (report.state === 'free') return `${header}\nStatus: FREE`;
  const kind = report.state === 'project_vite'
    ? 'PADEL LEGACY VITE'
    : 'UNKNOWN — NÃO SERÁ ENCERRADO';
  return `${header}\nStatus: IN USE (${kind})\n${report.processes.map(formatProcessDetails).join('\n\n')}`;
}

async function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function terminateSpawnedProcessTree(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) {
    throw new Error(`Recusa de segurança ao encerrar PID inválido: ${pid}`);
  }
  if (!(await isProcessRunning(pid))) return;

  if (process.platform === 'win32') {
    await execFileResult('taskkill.exe', ['/PID', String(pid), '/T', '/F']).catch(async (error) => {
      if (await isProcessRunning(pid)) throw error;
    });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    process.kill(pid, 'SIGTERM');
  }
  await delay(800);
  if (await isProcessRunning(pid)) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      process.kill(pid, 'SIGKILL');
    }
  }
}

export async function waitForPortFree({ port = DEV_PORT, timeoutMs = 8_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  do {
    if ((await getListeningProcessIds(port)).length === 0) return true;
    await delay(200);
  } while (Date.now() < deadline);
  return false;
}

export async function cleanupRecognizedDevServer({
  port = DEV_PORT,
  projectRoot = PROJECT_ROOT,
  timeoutMs = 8_000,
} = {}) {
  const initial = await inspectDevPort({ port, projectRoot });
  if (initial.state === 'free') return { cleaned: false, report: initial };
  if (initial.state !== 'project_vite') return { cleaned: false, blocked: true, report: initial };

  for (const candidate of initial.processes) {
    const current = await inspectDevPort({ port, projectRoot });
    const currentCandidate = current.processes.find((details) => details.pid === candidate.pid);
    if (!currentCandidate) continue;
    if (!currentCandidate.recognizedProjectVite) {
      throw new Error(`O PID ${candidate.pid} mudou de identidade; nenhum processo foi encerrado.`);
    }
    await terminateSpawnedProcessTree(candidate.pid);
  }

  if (!(await waitForPortFree({ port, timeoutMs }))) {
    throw new Error(`A porta ${port} não foi liberada após ${timeoutMs} ms.`);
  }

  return { cleaned: true, report: initial };
}

export async function prepareDevPort(options = {}) {
  const result = await cleanupRecognizedDevServer(options);
  if (result.blocked) {
    const processes = result.report.processes.map(formatProcessDetails).join('\n\n');
    throw new Error(
      `Porta ${result.report.port} está sendo utilizada por processo desconhecido.\n${processes}\n`
      + 'Feche esse processo manualmente; por segurança ele não foi encerrado.',
    );
  }
  return result;
}

function launchSessionWatchdog({ targetPid, supervisorPids, cleanupPort }) {
  const watchdogEntry = fileURLToPath(new URL('./dev-session-watchdog.mjs', import.meta.url));
  const watchdog = spawn(process.execPath, [watchdogEntry], {
    cwd: PROJECT_ROOT,
    detached: true,
    env: {
      ...process.env,
      PADEL_DEV_TARGET_PID: String(targetPid),
      PADEL_DEV_SUPERVISOR_PIDS: supervisorPids.join(','),
      PADEL_DEV_WATCHDOG_CLEANUP_PORT: cleanupPort ? '1' : '0',
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  watchdog.unref();
}

export async function superviseDevProcess({
  command,
  args,
  label,
  cleanupPort = false,
  environment = {},
  watchdogSupervisorPids = [],
}) {
  const child = spawn(command, args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...environment },
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    windowsHide: false,
  });
  launchSessionWatchdog({
    targetPid: child.pid,
    supervisorPids: [process.pid, ...watchdogSupervisorPids],
    cleanupPort,
  });
  let stopping = false;
  let resolveExit;
  const exited = new Promise((resolve) => { resolveExit = resolve; });
  child.once('exit', (code, signal) => resolveExit({ code, signal }));
  child.once('error', (error) => resolveExit({ code: 1, signal: null, error }));

  const finishCleanup = async () => {
    if (!cleanupPort) return;
    const cleanup = await cleanupRecognizedDevServer().catch((error) => ({ error }));
    if (cleanup?.error) console.error(`[dev] Falha no cleanup final: ${cleanup.error.message}`);
    if (cleanup?.blocked) console.error('[dev] A porta passou a pertencer a outro processo; ele não foi encerrado.');
  };

  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n[dev] Encerrando ${label} (${signal})...`);
    await terminateSpawnedProcessTree(child.pid).catch((error) => {
      console.error(`[dev] Não foi possível encerrar a árvore do PID ${child.pid}: ${error.message}`);
    });
    await exited;
    await finishCleanup();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };

  const onSigint = () => { void stop('SIGINT'); };
  const onSigterm = () => { void stop('SIGTERM'); };
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  process.once('exit', () => {
    if (!stopping && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  });

  const result = await exited;
  process.removeListener('SIGINT', onSigint);
  process.removeListener('SIGTERM', onSigterm);
  if (result.error) throw result.error;
  await finishCleanup();
  return result.code ?? (result.signal ? 1 : 0);
}
