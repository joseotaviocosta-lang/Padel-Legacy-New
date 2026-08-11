const targetPid = Number(process.env.PADEL_DEV_TARGET_PID);
const supervisorPids = String(process.env.PADEL_DEV_SUPERVISOR_PIDS ?? '')
  .split(',')
  .map(Number)
  .filter((pid) => Number.isSafeInteger(pid) && pid > 0);
const cleanupPortOnOrphan = process.env.PADEL_DEV_WATCHDOG_CLEANUP_PORT === '1';

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function findStoppedSupervisor() {
  return supervisorPids.find((pid) => !isRunning(pid));
}

if (!Number.isSafeInteger(targetPid) || targetPid <= 0) process.exit(2);

let orphanCleanupStarted = false;
setInterval(async () => {
  if (orphanCleanupStarted) return;
  if (!isRunning(targetPid)) process.exit(0);

  const stoppedSupervisor = findStoppedSupervisor();
  if (!stoppedSupervisor) return;
  orphanCleanupStarted = true;

  const { cleanupRecognizedDevServer, terminateSpawnedProcessTree } = await import('./dev-port-manager.mjs');
  await terminateSpawnedProcessTree(targetPid).catch(() => {});
  if (cleanupPortOnOrphan) await cleanupRecognizedDevServer().catch(() => {});
  process.exit(0);
}, 500);
