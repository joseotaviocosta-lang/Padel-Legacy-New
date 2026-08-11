import { DEV_PORT, formatPortStatus, prepareDevPort } from './dev-port-manager.mjs';

try {
  const result = await prepareDevPort();
  if (result.cleaned) {
    console.log(formatPortStatus(result.report));
    console.log(`[dev] Servidor antigo do Padel Legacy encerrado. Porta ${DEV_PORT} liberada.`);
  } else {
    console.log(`Padel Legacy DEV\nPort: ${DEV_PORT}\nStatus: FREE`);
  }
} catch (error) {
  console.error(`[dev] ${error.message}`);
  process.exitCode = 1;
}
