import { formatPortStatus, inspectDevPort } from './dev-port-manager.mjs';

try {
  console.log(formatPortStatus(await inspectDevPort()));
} catch (error) {
  console.error(`[dev:status] Não foi possível diagnosticar a porta: ${error.message}`);
  process.exitCode = 1;
}
