// Playthrough 5.20-B, Parte A — SHIM DE STORAGE PARA AUDITORIA VISUAL.
//
// O app persiste exclusivamente via Tauri: `TauriStorage.isSupported()` exige
// `window.__TAURI_INTERNALS__`, e as operacoes de arquivo vem de
// `@tauri-apps/plugin-fs`, que chama o IPC nativo. Num navegador puro nao ha
// storage, o app mostra "O ambiente Tauri nao esta disponivel" e NENHUMA pagina
// de jogo e alcancavel — o que inviabilizaria a auditoria visual exigida.
//
// Este shim emula a superficie do plugin de arquivos sobre um Map em memoria,
// exatamente como os harnesses headless em Node ja fazem com MemoryStorage. Ele
// e injetado pelo DRIVER (evaluateOnNewDocument), nunca pelo produto: nenhum
// arquivo de src/ sabe que ele existe.
//
// Shapes conferidos em node_modules/@tauri-apps/plugin-fs/dist-js/index.js:
//   - write_text_file: invoke(cmd, Uint8Array, { headers: { path: encodeURIComponent(path) } })
//     (o caminho NAO vem em args; os dados sao o 2o argumento posicional)
//   - read_text_file:  invoke(cmd, { path, options }) -> precisa devolver BYTES
//   - demais:          invoke(cmd, { path | oldPath/newPath | fromPath/toPath })
export const TAURI_BROWSER_SHIM = String.raw`(() => {
  if (window.__TAURI_INTERNALS__) return;
  // Persistencia em localStorage, NAO em memoria: page.goto faz recarga
  // completa, e um Map de pagina zerava o storage a cada navegacao — o app
  // voltava ao gerenciador de carreiras e a auditoria fotografava sempre a
  // mesma tela. Descoberto olhando os screenshots, nao os numeros.
  const KEY = '__pl_audit_fs__';
  const load = () => { try { return new Map(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Map(); } };
  const files = load();
  // Playthrough 5.24-D — o localStorage tem ~5M caracteres de cota. Cada
  // gravação da carreira (2,1M+) também deixava cópia temporária, cópia de
  // recuperação e backups completos no MESMO Map: o setItem passava de 7-11M,
  // estourava QuotaExceededError e o catch vazio engolia — NENHUMA escrita
  // pós-criação sobrevivia a um reload no harness (medido: arquivo com a
  // mesma revisão da criação para sempre). Era isso o "100 ↔ 150" da 5.24-C.
  // Agora só os arquivos DURÁVEIS vão para o localStorage (índice + carreiras);
  // backups/temporários ficam só em memória, como arquivos auxiliares. E uma
  // falha deixa de ser silenciosa: fica em window.__plShimPersistFailures.
  const durable = (k) => k === 'careers-index.json'
    || (k.indexOf('careers/') === 0 && k.slice(-5) === '.json' && k.indexOf('.tmp') < 0 && k.indexOf('recovery') < 0);
  window.__plShimPersistFailures = window.__plShimPersistFailures || [];
  const persist = () => {
    const snapshot = [...files].filter(([k]) => durable(k));
    try { localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch (e) {
      window.__plShimPersistFailures.push({ at: Date.now(), error: e && e.name, files: snapshot.length });
      console.error('[audit-shim] persistência do storage de teste falhou', e && e.name);
    }
  };
  const dirs = new Set(['', '.']);
  // Barra invertida via fromCharCode: um literal aqui atravessaria heredoc,
  // String.raw e injecao, e ja se perdeu uma vez nesta fase.
  const BS = String.fromCharCode(92);
  const norm = (p) => { let v = String(p || '').split(BS).join('/'); return v.startsWith('./') ? v.slice(2) : v; };
  const parentOf = (p) => { const n = norm(p); const i = n.lastIndexOf('/'); return i < 0 ? '' : n.slice(0, i); };
  const addDirs = (p) => { let d = parentOf(p); while (d) { dirs.add(d); d = parentOf(d); } };
  // Reconstroi as pastas a partir dos arquivos ja persistidos: sem isto,
  // exists() de diretorio falha depois de uma recarga.
  for (const k of files.keys()) addDirs(k);
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const handlers = {
    'plugin:fs|read_text_file': (a) => {
      const k = norm(a.path);
      if (!files.has(k)) { const e = new Error('path not found: ' + k); e.code = 'ENOENT'; throw e; }
      return Array.from(enc.encode(files.get(k)));
    },
    'plugin:fs|exists': (a) => { const k = norm(a.path); return files.has(k) || dirs.has(k); },
    'plugin:fs|mkdir': (a) => { let d = norm(a.path); while (d) { dirs.add(d); d = parentOf(d); } return null; },
    'plugin:fs|read_dir': (a) => {
      const base = norm(a.path); const prefix = base ? base + '/' : '';
      const seen = new Map();
      for (const k of files.keys()) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length); const seg = rest.split('/')[0];
        if (seg) seen.set(seg, { name: seg, isFile: !rest.includes('/'), isDirectory: rest.includes('/'), isSymlink: false });
      }
      for (const d of dirs) {
        if (!d.startsWith(prefix) || d === base) continue;
        const seg = d.slice(prefix.length).split('/')[0];
        if (seg && !seen.has(seg)) seen.set(seg, { name: seg, isFile: false, isDirectory: true, isSymlink: false });
      }
      return [...seen.values()];
    },
    'plugin:fs|remove': (a) => { const k = norm(a.path); files.delete(k); dirs.delete(k); persist(); return null; },
    'plugin:fs|rename': (a) => {
      const from = norm(a.oldPath); const to = norm(a.newPath);
      if (files.has(from)) { files.set(to, files.get(from)); files.delete(from); addDirs(to); persist(); }
      return null;
    },
    'plugin:fs|copy_file': (a) => {
      const from = norm(a.fromPath); const to = norm(a.toPath);
      if (files.has(from)) { files.set(to, files.get(from)); addDirs(to); persist(); }
      return null;
    },
    'plugin:fs|stat': (a) => {
      const k = norm(a.path); const isFile = files.has(k);
      if (!isFile && !dirs.has(k)) { const e = new Error('path not found: ' + k); e.code = 'ENOENT'; throw e; }
      return { size: isFile ? enc.encode(files.get(k)).length : 0, isFile, isDirectory: !isFile,
        isSymlink: false, atime: Date.now(), mtime: Date.now(), birthtime: Date.now(), readonly: false, fileAttributes: 0 };
    },
  };

  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    plugins: {},
    transformCallback: (cb) => { const id = Math.floor(Math.random() * 1e9); window['_' + id] = cb; return id; },
    invoke: async (cmd, args, options) => {
      // write_text_file e o unico com shape posicional: dados no 2o argumento,
      // caminho em options.headers.path (URL-encoded).
      // Playthrough 5.25 — comandos de storage do próprio app (storage.rs),
      // Conteúdo como string (ver storage.rs).
      if (cmd === 'storage_write_text') {
        const path = norm(args.path);
        files.set(path, String(args.content)); addDirs(path); persist();
        return null;
      }
      const storageCommands = {
        storage_read_text: (a) => { const k = norm(a.path); if (!files.has(k)) { const e = new Error('path not found: ' + k); e.code = 'ENOENT'; throw e; } return files.get(k); },
        storage_exists: (a) => handlers['plugin:fs|exists']({ path: a.path }),
        storage_remove: (a) => handlers['plugin:fs|remove']({ path: a.path }),
        storage_copy: (a) => handlers['plugin:fs|copy_file']({ fromPath: a.from, toPath: a.to }),
        storage_rename: (a) => handlers['plugin:fs|rename']({ oldPath: a.from, newPath: a.to }),
        storage_list: (a) => handlers['plugin:fs|read_dir']({ path: a.path }),
        storage_mkdir: (a) => handlers['plugin:fs|mkdir']({ path: a.path }),
        storage_stat: (a) => handlers['plugin:fs|stat']({ path: a.path }),
      };
      if (storageCommands[cmd]) return storageCommands[cmd](args || {});
      if (cmd === 'plugin:fs|write_text_file') {
        const raw = options && options.headers && options.headers.path;
        const path = norm(decodeURIComponent(String(raw || '')));
        const bytes = args instanceof Uint8Array ? args : new Uint8Array(args || []);
        files.set(path, dec.decode(bytes)); persist();
        addDirs(path);
        return null;
      }
      const h = handlers[cmd];
      if (h) return h(args || {});
      return null;
    },
    convertFileSrc: (p) => p,
  };
  window.__PL_AUDIT_SHIM__ = true;
})();`;
