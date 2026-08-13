export function resolveDevServerHost(environment = process.env) {
  return environment.TAURI_DEV_HOST?.trim() || '127.0.0.1';
}

export function resolveHmrConfig(environment = process.env, port = 5174) {
  const host = environment.TAURI_DEV_HOST?.trim();
  return host ? { protocol: 'ws', host, port } : undefined;
}
