export function resolveDevServerHost(environment = process.env) {
  return environment.TAURI_DEV_HOST?.trim() || '127.0.0.1';
}
