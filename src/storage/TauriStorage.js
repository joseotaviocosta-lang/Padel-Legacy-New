import {
  BaseDirectory,
  copyFile,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  stat,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { StorageError } from './StorageError.js';
import { measureStorageOperation } from '../dev/storageIOProbe.js';

const STORAGE_BASE_DIRECTORY = BaseDirectory.AppData;

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

function createOptions(options = {}) {
  return {
    ...options,
    baseDir: options.baseDir ?? STORAGE_BASE_DIRECTORY,
  };
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
      () => readTextFile(normalizedPath, createOptions()),
      { bytes: byteLength },
    );
  }

  async writeText(relativePath, content, { ensureParent = true, caller = 'TauriStorage.writeText' } = {}) {
    const normalizedPath = normalizeRelativePath(relativePath);
    const parentDirectory = normalizedPath.includes('/') ? normalizedPath.split('/').slice(0, -1).join('/') : null;
    if (parentDirectory && ensureParent) {
      await this.ensureDirectory(parentDirectory, { caller: `${caller}:parent` });
    }
    const serialized = String(content);
    return measureStorageOperation(
      { operation: 'write', key: normalizedPath, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => writeTextFile(normalizedPath, serialized, createOptions()),
      { bytes: byteLength(serialized) },
    );
  }

  async exists(relativePath, { caller = 'TauriStorage.exists' } = {}) {
    const normalizedPath = normalizeRelativePath(relativePath);
    try {
      return await measureStorageOperation(
        { operation: 'exists', key: normalizedPath, caller, layer: 'tauri-ipc', cache: 'miss' },
        () => exists(normalizedPath, createOptions()),
      );
    } catch (error) {
      return false;
    }
  }

  async remove(relativePath, options = {}) {
    const normalizedPath = normalizeRelativePath(relativePath);
    const { knownToExist = false, caller = 'TauriStorage.remove', ...fsOptions } = options;
    if (!knownToExist && !(await this.exists(normalizedPath, { caller: `${caller}:preflight` }))) {
      return false;
    }
    await measureStorageOperation(
      { operation: 'remove', key: normalizedPath, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => remove(normalizedPath, createOptions(fsOptions)),
    );
    return true;
  }

  async copy(sourcePath, destinationPath, { ensureParent = true, caller = 'TauriStorage.copy' } = {}) {
    const normalizedSource = normalizeRelativePath(sourcePath);
    const normalizedDestination = normalizeRelativePath(destinationPath);
    const parentDirectory = normalizedDestination.includes('/') ? normalizedDestination.split('/').slice(0, -1).join('/') : null;
    if (parentDirectory && ensureParent) {
      await this.ensureDirectory(parentDirectory, { caller: `${caller}:parent` });
    }
    await measureStorageOperation(
      { operation: 'copy', key: `${normalizedSource} -> ${normalizedDestination}`, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => copyFile(normalizedSource, normalizedDestination, {
        ...createOptions(),
        fromPathBaseDir: STORAGE_BASE_DIRECTORY,
        toPathBaseDir: STORAGE_BASE_DIRECTORY,
      }),
    );
    return normalizedDestination;
  }

  async rename(sourcePath, destinationPath, { ensureParent = true, caller = 'TauriStorage.rename' } = {}) {
    const normalizedSource = normalizeRelativePath(sourcePath);
    const normalizedDestination = normalizeRelativePath(destinationPath);
    const parentDirectory = normalizedDestination.includes('/') ? normalizedDestination.split('/').slice(0, -1).join('/') : null;
    if (parentDirectory && ensureParent) {
      await this.ensureDirectory(parentDirectory, { caller: `${caller}:parent` });
    }
    await measureStorageOperation(
      { operation: 'rename', key: `${normalizedSource} -> ${normalizedDestination}`, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => rename(normalizedSource, normalizedDestination, {
        oldPathBaseDir: STORAGE_BASE_DIRECTORY,
        newPathBaseDir: STORAGE_BASE_DIRECTORY,
      }),
    );
    return normalizedDestination;
  }

  async list(relativeDirectory = '.', { knownToExist = false, caller = 'TauriStorage.list' } = {}) {
    const normalizedPath = normalizeRelativePath(relativeDirectory, { allowCurrentDirectory: true });
    if (normalizedPath === '.') {
      const entries = await measureStorageOperation(
        { operation: 'list', key: '.', caller, layer: 'tauri-ipc', cache: 'miss' },
        () => readDir('', createOptions()),
      );
      return entries;
    }

    const existsPath = knownToExist || await this.exists(normalizedPath, { caller: `${caller}:preflight` });
    if (!existsPath) {
      return [];
    }

    return measureStorageOperation(
      { operation: 'list', key: normalizedPath, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => readDir(normalizedPath, createOptions()),
    );
  }

  async ensureDirectory(relativeDirectory, { caller = 'TauriStorage.ensureDirectory' } = {}) {
    const normalizedPath = normalizeRelativePath(relativeDirectory, { allowCurrentDirectory: true });
    if (normalizedPath === '.') {
      return true;
    }
    await measureStorageOperation(
      { operation: 'mkdir', key: normalizedPath, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => mkdir(normalizedPath, { recursive: true, ...createOptions() }),
    );
    return true;
  }

  async stat(relativePath, { caller = 'TauriStorage.stat' } = {}) {
    const normalizedPath = normalizeRelativePath(relativePath);
    return measureStorageOperation(
      { operation: 'stat', key: normalizedPath, caller, layer: 'tauri-ipc', cache: 'miss' },
      () => stat(normalizedPath, createOptions()),
    );
  }

  getDataDirectoryDescription() {
    return 'AppData';
  }
}
