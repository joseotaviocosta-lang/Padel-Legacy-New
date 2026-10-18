// CLOUD-7B1 — backend Tauri SIMULADO em memória para benchmarks em Node.
// Instala window.__TAURI_INTERNALS__.invoke com os comandos de src-tauri/src/storage.rs
// (storage_read_text/write_text/exists/remove/copy/rename/list/mkdir/stat), de modo que o
// GameStorage escolha o TauriStorage REAL (e execute o JS real de serialização/IPC do cliente).
// NÃO mede IPC nem disco nativos: o custo do lado Rust/WebView/Android não existe aqui.
export function installTauriMock() {
  const files = new Map();
  const dirs = new Set();
  const counters = { calls: 0, byCommand: {}, writeBytes: 0, readBytes: 0 };
  const missing = (p) => Object.assign(new Error(`No such file: ${p}`), { code: 'FILE_NOT_FOUND' });
  const handlers = {
    storage_read_text: ({ path }) => { if (!files.has(path)) throw missing(path); const s = files.get(path); counters.readBytes += s.length; return s; },
    storage_write_text: ({ path, content }) => { files.set(path, content); counters.writeBytes += content.length; },
    storage_exists: ({ path }) => files.has(path) || dirs.has(path),
    storage_remove: ({ path }) => { files.delete(path); },
    storage_copy: ({ from, to }) => { if (!files.has(from)) throw missing(from); files.set(to, files.get(from)); },
    storage_rename: ({ from, to }) => { if (!files.has(from)) throw missing(from); files.set(to, files.get(from)); files.delete(from); },
    storage_list: ({ path }) => [...files.keys()].filter((k) => !path || k.startsWith(`${path}/`)).map((k) => ({ name: k.split('/').pop(), is_dir: false, size: files.get(k).length })),
    storage_mkdir: ({ path }) => { dirs.add(path); },
    storage_stat: ({ path }) => { if (!files.has(path)) throw missing(path); return { size: files.get(path).length, is_dir: false, is_file: true }; },
  };
  const invoke = async (command, args = {}) => {
    counters.calls += 1;
    counters.byCommand[command] = (counters.byCommand[command] || 0) + 1;
    const handler = handlers[command];
    if (!handler) throw new Error(`comando não simulado: ${command}`);
    return handler(args);
  };
  globalThis.window = globalThis.window || {};
  Object.assign(globalThis.window, {
    location: globalThis.window.location || { pathname: '/', hostname: 'bench' },
    dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {},
    __TAURI_INTERNALS__: { invoke, transformCallback() { return 0; } },
  });
  return { files, counters, reset() { counters.calls = 0; counters.byCommand = {}; counters.writeBytes = 0; counters.readBytes = 0; } };
}
