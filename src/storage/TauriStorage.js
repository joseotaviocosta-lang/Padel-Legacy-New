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

  async readText(relativePath) {
    const normalizedPath = normalizeRelativePath(relativePath);
    const existsPath = await exists(normalizedPath, createOptions());
    if (!existsPath) {
      throw new StorageError('O arquivo não existe no armazenamento local.', 'FILE_NOT_FOUND');
    }
    return readTextFile(normalizedPath, createOptions());
  }

  async writeText(relativePath, content) {
    const normalizedPath = normalizeRelativePath(relativePath);
    const parentDirectory = normalizedPath.includes('/') ? normalizedPath.split('/').slice(0, -1).join('/') : null;
    if (parentDirectory) {
      await this.ensureDirectory(parentDirectory);
    }
    return writeTextFile(normalizedPath, String(content), createOptions());
  }

  async exists(relativePath) {
    try {
      return await exists(normalizeRelativePath(relativePath), createOptions());
    } catch (error) {
      return false;
    }
  }

  async remove(relativePath, options = {}) {
    const normalizedPath = normalizeRelativePath(relativePath);
    if (!(await this.exists(normalizedPath))) {
      return false;
    }
    await remove(normalizedPath, createOptions(options));
    return true;
  }

  async copy(sourcePath, destinationPath) {
    const normalizedSource = normalizeRelativePath(sourcePath);
    const normalizedDestination = normalizeRelativePath(destinationPath);
    const parentDirectory = normalizedDestination.includes('/') ? normalizedDestination.split('/').slice(0, -1).join('/') : null;
    if (parentDirectory) {
      await this.ensureDirectory(parentDirectory);
    }
    await copyFile(normalizedSource, normalizedDestination, {
      ...createOptions(),
      fromPathBaseDir: STORAGE_BASE_DIRECTORY,
      toPathBaseDir: STORAGE_BASE_DIRECTORY,
    });
    return normalizedDestination;
  }

  async rename(sourcePath, destinationPath) {
    const normalizedSource = normalizeRelativePath(sourcePath);
    const normalizedDestination = normalizeRelativePath(destinationPath);
    const parentDirectory = normalizedDestination.includes('/') ? normalizedDestination.split('/').slice(0, -1).join('/') : null;
    if (parentDirectory) {
      await this.ensureDirectory(parentDirectory);
    }
    await rename(normalizedSource, normalizedDestination, {
      oldPathBaseDir: STORAGE_BASE_DIRECTORY,
      newPathBaseDir: STORAGE_BASE_DIRECTORY,
    });
    return normalizedDestination;
  }

  async list(relativeDirectory = '.') {
    const normalizedPath = normalizeRelativePath(relativeDirectory, { allowCurrentDirectory: true });
    if (normalizedPath === '.') {
      const entries = await readDir('', createOptions());
      return entries;
    }

    const existsPath = await this.exists(normalizedPath);
    if (!existsPath) {
      return [];
    }

    return readDir(normalizedPath, createOptions());
  }

  async ensureDirectory(relativeDirectory) {
    const normalizedPath = normalizeRelativePath(relativeDirectory, { allowCurrentDirectory: true });
    if (normalizedPath === '.') {
      return true;
    }
    await mkdir(normalizedPath, { recursive: true, ...createOptions() });
    return true;
  }

  async stat(relativePath) {
    const normalizedPath = normalizeRelativePath(relativePath);
    return stat(normalizedPath, createOptions());
  }

  getDataDirectoryDescription() {
    return 'AppData';
  }
}
