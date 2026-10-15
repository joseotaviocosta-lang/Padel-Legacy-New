import { invoke } from '@tauri-apps/api/core';
import { StorageError } from './StorageError.js';
import { measureStorageOperation } from '../dev/storageIOProbe.js';

// Playthrough 5.25 — o save usa os comandos async do PRÓPRIO app
// (src-tauri/src/storage.rs) em vez do plugin-fs. No Android, os comandos
// síncronos do plugin (exists/rename/remove/stat/mkdir) rodavam segurando o
// lock global de plugins do Tauri e, para resolver AppData, bloqueavam
// esperando a main thread a CADA chamada — com a main thread em
// onPageFinished pedindo o mesmo lock, o app travava (ANR capturado no
// aparelho). Mesmo contrato: caminhos relativos a AppData, sem traversal.
// ENVIO como string: no Android o IPC é postMessage+JSON e bytes
// (Uint8Array) viravam um array JSON de milhões de números. LEITURA em bytes
// crus: o caminho de resposta é rápido (medido no aparelho: ~100ms x ~370ms).
const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

function decodeText(result) {
  if (typeof result === 'string') return result;
  const bytes = result instanceof ArrayBuffer ? new Uint8Array(result) : Uint8Array.from(result || []);
  return decoder ? decoder.decode(bytes) : String.fromCharCode(...bytes);
}

function normalizeRelativePath(relativePath, { allowCurrentDirectory = false } = {}) {
  if (typeof relativePath !== 'string') {
    throw new StorageError('O caminho relativo deve ser uma string.', 'INVALID_RELATIVE_PATH');
  }

  const trimmed = relativePath.trim();
  if (!trimmed) {
    if (allowCurrentDirectory) {
      return '.';
    }
    throw new StorageError('O caminho relativo não pode ser vazio.', 'INVALID_RELATIVE_PATH');
  }

  if (trimmed.includes('\0')) {
    throw new StorageError('O caminho relativo contém caracteres nulos.', 'INVALID_RELATIVE_PATH');
  }

  const normalized = trimmed.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.startsWith('\\')) {
    throw new StorageError('Caminhos absolutos não são permitidos.', 'INVALID_RELATIVE_PATH');
  }
  if (/^[A-Za-z]:/.test(normalized) || normalized.includes('://')) {
    throw new StorageError('Protocolos e unidades de disco não são permitidos.', 'INVALID_RELATIVE_PATH');
  }

  const segments = normalized.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    if (allowCurrentDirectory) {
      return '.';
    }
    throw new StorageError('O caminho relativo não pode ser vazio.', 'INVALID_RELATIVE_PATH');
  }

  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new StorageError('Caminhos com traversal não são permitidos.', 'INVALID_RELATIVE_PATH');
    }
    if (segment.includes(':')) {
      throw new StorageError('Componentes de caminho com protocolos ou unidades não são permitidos.', 'INVALID_RELATIVE_PATH');
    }
  }

  return segments.join('/');
}

function byteLength(value) {
  const text = String(value ?? '');
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).byteLength;
  return text.length;
}

export class TauriStorage {
  static isSupported() {
    return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
  }

  isSupported() {
    return TauriStorage.isSupported();
  }

  async initialize() {
    await Promise.all([
      this.ensureDirectory('careers'),
      this.ensureDirectory('backups'),
      this.ensureDirectory('temp'),
      this.ensureDirectory('exports'),
    ]);
  }

  async readText(relativePath, { knownToExist = false, caller = 'TauriStorage.readText' } = {}) {
    const normalizedPath = normalizeRelativePath(relativePath);
    if (!knownToExist && !(await this.exists(normalizedPath, { caller: `${caller}:preflight` }))) {
      throw new StorageError('O arquivo não existe no armazenamento local.', 'FILE_NOT_FOUND');
    }
    return measureStorageOperation(
      { operation: 'read', key: normalizedPath, caller, layer: 'tauri-ipc', cache: 'miss' },
      async () => decodeText(await invoke('storage_read_text', { path: normalizedPath })),
      { bytes: byteLength },
    );
  }

  async writeText(relativePath, content, { ensureParent = true, caller = 'TauriStorage.writeText' } = {}) {
    const normalizedPath = normalizeRelativePath(relativePath);
    // O comando nativo cria a pasta-pai na mesma operação (ensureParent fica
    // implícito; sem o mkdir separado de antes — uma ida ao IPC a menos).
    void ensureParent;
    const serialized = String(content);
    return measureStorageOperation(
      { operation: 'write', key: normalizedPath, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => invoke('storage_write_text', { path: normalizedPath, content: serialized }),
      { bytes: byteLength(serialized) },
    );
  }

  async exists(relativePath, { caller = 'TauriStorage.exists', attempts = 3, retryDelayMs = 40 } = {}) {
    const normalizedPath = normalizeRelativePath(relativePath);
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await measureStorageOperation(
          { operation: 'exists', key: normalizedPath, caller, layer: 'tauri-ipc', cache: 'miss' },
          () => invoke('storage_exists', { path: normalizedPath }),
        );
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
    // Hotfix persistência crítica: antes, QUALQUER erro do plugin de FS aqui
    // virava silenciosamente `false` — uma falha transitória de I/O (comum no
    // Android sob pressão de memória/retomada do app) era indistinguível de
    // "o arquivo realmente não existe", e era exatamente isso que fazia uma
    // carreira real parecer "excluída". Só depois de esgotar as tentativas
    // é que caímos de volta em `false`; o chamador (GameStorage.readJson)
    // ainda tenta as camadas de recuperação (rollback de crash, backup) antes
    // de finalmente declarar o arquivo ausente.
    if (lastError) {
      console.warn('[TauriStorage] exists() falhou em todas as tentativas — assumindo ausência só por exaustão, não por confirmação real', { path: normalizedPath, caller, error: lastError?.message });
    }
    return false;
  }

  async remove(relativePath, options = {}) {
    const normalizedPath = normalizeRelativePath(relativePath);
    const { knownToExist = false, caller = 'TauriStorage.remove', recursive = false } = options;
    if (!knownToExist && !(await this.exists(normalizedPath, { caller: `${caller}:preflight` }))) {
      return false;
    }
    await measureStorageOperation(
      { operation: 'remove', key: normalizedPath, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => invoke('storage_remove', { path: normalizedPath, recursive: Boolean(recursive) }),
    );
    return true;
  }

  async copy(sourcePath, destinationPath, { ensureParent = true, caller = 'TauriStorage.copy' } = {}) {
    const normalizedSource = normalizeRelativePath(sourcePath);
    const normalizedDestination = normalizeRelativePath(destinationPath);
    void ensureParent; // a pasta-pai é criada pelo comando nativo
    await measureStorageOperation(
      { operation: 'copy', key: `${normalizedSource} -> ${normalizedDestination}`, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => invoke('storage_copy', { from: normalizedSource, to: normalizedDestination }),
    );
    return normalizedDestination;
  }

  async rename(sourcePath, destinationPath, { ensureParent = true, caller = 'TauriStorage.rename' } = {}) {
    const normalizedSource = normalizeRelativePath(sourcePath);
    const normalizedDestination = normalizeRelativePath(destinationPath);
    void ensureParent; // a pasta-pai é criada pelo comando nativo
    await measureStorageOperation(
      { operation: 'rename', key: `${normalizedSource} -> ${normalizedDestination}`, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => invoke('storage_rename', { from: normalizedSource, to: normalizedDestination }),
    );
    return normalizedDestination;
  }

  async list(relativeDirectory = '.', { knownToExist = false, caller = 'TauriStorage.list' } = {}) {
    const normalizedPath = normalizeRelativePath(relativeDirectory, { allowCurrentDirectory: true });
    if (normalizedPath === '.') {
      const entries = await measureStorageOperation(
        { operation: 'list', key: '.', caller, layer: 'tauri-ipc', cache: 'miss' },
        () => invoke('storage_list', { path: '' }),
      );
      return entries;
    }

    const existsPath = knownToExist || await this.exists(normalizedPath, { caller: `${caller}:preflight` });
    if (!existsPath) {
      return [];
    }

    return measureStorageOperation(
      { operation: 'list', key: normalizedPath, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => invoke('storage_list', { path: normalizedPath }),
    );
  }

  async ensureDirectory(relativeDirectory, { caller = 'TauriStorage.ensureDirectory' } = {}) {
    const normalizedPath = normalizeRelativePath(relativeDirectory, { allowCurrentDirectory: true });
    if (normalizedPath === '.') {
      return true;
    }
    await measureStorageOperation(
      { operation: 'mkdir', key: normalizedPath, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => invoke('storage_mkdir', { path: normalizedPath }),
    );
    return true;
  }

  async stat(relativePath, { caller = 'TauriStorage.stat' } = {}) {
    const normalizedPath = normalizeRelativePath(relativePath);
    return measureStorageOperation(
      { operation: 'stat', key: normalizedPath, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => invoke('storage_stat', { path: normalizedPath }),
    );
  }

  getDataDirectoryDescription() {
    return 'AppData';
  }
}
