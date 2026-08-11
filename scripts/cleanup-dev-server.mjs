import { DEV_PORT, cleanupRecognizedDevServer, formatPortStatus } from './dev-port-manager.mjs';

try {
  const result = await cleanupRecognizedDevServer();
  if (result.blocked) {
    console.error(formatPortStatus(result.report));
    console.error('[dev:cleanup] Processo desconhecido preservado. Feche-o manualmente se quiser liberar a porta.');
    process.exitCode = 1;
  } else if (result.cleaned) {
    console.log(formatPortStatus(result.report));
    console.log(`[dev:cleanup] Servidor do Padel Legacy encerrado. Porta ${DEV_PORT} liberada.`);
  } else {
    console.log(`Padel Legacy DEV\nPort: ${DEV_PORT}\nStatus: FREE`);
  }
} catch (error) {
  console.error(`[dev:cleanup] ${error.message}`);
  process.exitCode = 1;
}
