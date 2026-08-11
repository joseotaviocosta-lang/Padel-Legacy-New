import { fileURLToPath } from 'node:url';
import { getAncestorProcessIds, prepareDevPort, superviseDevProcess } from './dev-port-manager.mjs';

try {
  const prepared = await prepareDevPort();
  if (prepared.cleaned) console.log('[app:dev] Instância Vite anterior encerrada com segurança.');

  const tauriEntry = fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url));
  const supervisorPids = await getAncestorProcessIds();
  process.exitCode = await superviseDevProcess({
    command: process.execPath,
    args: [tauriEntry, 'dev', ...process.argv.slice(2)],
    label: 'Tauri e seus processos filhos',
    cleanupPort: true,
    watchdogSupervisorPids: supervisorPids,
  });
} catch (error) {
  console.error(`[app:dev] ${error.message}`);
  process.exitCode = 1;
}
