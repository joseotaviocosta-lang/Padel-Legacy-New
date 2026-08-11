import { fileURLToPath } from 'node:url';
import { getAncestorProcessIds, prepareDevPort, superviseDevProcess } from './dev-port-manager.mjs';

try {
  const prepared = await prepareDevPort();
  if (prepared.cleaned) console.log('[dev] Instância Vite anterior encerrada com segurança.');

  const viteEntry = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
  const supervisorPids = await getAncestorProcessIds();
  process.exitCode = await superviseDevProcess({
    command: process.execPath,
    args: [viteEntry, ...process.argv.slice(2)],
    label: 'Vite',
    cleanupPort: true,
    watchdogSupervisorPids: supervisorPids,
  });
} catch (error) {
  console.error(`[dev] ${error.message}`);
  process.exitCode = 1;
}
