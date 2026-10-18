import { StorageError } from './StorageError.js';

const DATABASE_NAME = 'padel-legacy-storage';
const DATABASE_VERSION = 1;
const STORE_NAME = 'entries';
const INITIAL_DIRECTORIES = ['careers', 'backups', 'temp', 'exports'];

function normalizeRelativePath(relativePath, { allowCurrentDirectory = false } = {}) {
  if (typeof relativePath !== 'string') {
    throw new StorageError('O caminho relativo deve ser uma string.', 'INVALID_RELATIVE_PATH');
  }

  const trimmed = relativePath.trim();
  if (!trimmed && allowCurrentDirectory) return '.';
  if (!trimmed || trimmed.includes('\0')) {
    throw new StorageError('O caminho relativo é inválido.', 'INVALID_RELATIVE_PATH');
  }

  const normalized = trimmed.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.includes('://')) {
    throw new StorageError('Caminhos absolutos não são permitidos.', 'INVALID_RELATIVE_PATH');
  }

  const segments = normalized.split('/').filter(Boolean);
  if (!segments.length && allowCurrentDirectory) return '.';
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes(':'))) {
    throw new StorageError('O caminho relativo contém componentes inválidos.', 'INVALID_RELATIVE_PATH');
  }
  return segments.join('/');
}

function parentDirectories(path) {
  const segments = path.split('/');
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
}

export class BrowserStorage {
  constructor({ indexedDB = globalThis.indexedDB, databaseName = DATABASE_NAME } = {}) {
    this.indexedDB = indexedDB;
    this.databaseName = databaseName;
    this.databasePromise = null;
    this.initialized = false;
  }

  static isSupported() {
    return typeof globalThis.indexedDB?.open === 'function';
  }

  isSupported() {
    return typeof this.indexedDB?.open === 'function';
  }

  async openDatabase() {
    if (!this.isSupported()) {
      throw new StorageError('O armazenamento IndexedDB não está disponível.', 'STORAGE_UNSUPPORTED');
    }
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = this.indexedDB.open(this.databaseName, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME, { keyPath: 'path' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new StorageError('Não foi possível abrir o armazenamento do navegador.', 'STORAGE_OPEN_FAILED'));
      }).catch((error) => {
        this.databasePromise = null;
        throw error;
      });
    }
    return this.databasePromise;
  }

  async transaction(mode, run) {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      let transaction;
      let result;
      try {
        transaction = database.transaction(STORE_NAME, mode);
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error || new StorageError('Falha no armazenamento do navegador.', 'STORAGE_OPERATION_FAILED'));
        transaction.onabort = () => reject(transaction.error || new StorageError('Operação de armazenamento cancelada.', 'STORAGE_OPERATION_FAILED'));
        result = run(transaction.objectStore(STORE_NAME), transaction);
      } catch (error) {
        if (transaction) transaction.abort();
        reject(error);
      }
    });
  }

  async initialize() {
    if (this.initialized) return;
    const directories = INITIAL_DIRECTORIES.flatMap((path) => parentDirectories(`${path}/marker`)).concat(INITIAL_DIRECTORIES);
    await this.transaction('readwrite', (store) => {
      directories.forEach((path) => store.put({ path, isDirectory: true }));
    });
    this.initialized = true;
  }

  async exists(relativePath) {
    await this.initialize();
    const path = normalizeRelativePath(relativePath);
    return this.transaction('readonly', (store) => new Promise((resolve) => {
      const request = store.get(path);
      request.onsuccess = () => resolve(Boolean(request.result));
    }));
  }

  async readText(relativePath) {
    await this.initialize();
    const path = normalizeRelativePath(relativePath);
    return this.transaction('readonly', (store) => new Promise((resolve, reject) => {
      const request = store.get(path);
      request.onsuccess = () => {
        if (!request.result || request.result.isDirectory) {
          reject(new StorageError('O arquivo não existe no armazenamento local.', 'FILE_NOT_FOUND'));
          return;
        }
        resolve(request.result.content);
      };
      request.onerror = () => reject(request.error);
    }));
  }

  async writeText(relativePath, content) {
    await this.initialize();
    const path = normalizeRelativePath(relativePath);
    return this.transaction('readwrite', (store) => {
      parentDirectories(path).forEach((directory) => store.put({ path: directory, isDirectory: true }));
      store.put({ path, isDirectory: false, content: String(content) });
    });
  }

  async remove(relativePath, { recursive = false } = {}) {
    await this.initialize();
    const path = normalizeRelativePath(relativePath);
    return this.transaction('readwrite', (store) => new Promise((resolve, reject) => {
      const keysRequest = store.getAllKeys();
      keysRequest.onsuccess = () => {
        const keys = keysRequest.result;
        if (!keys.includes(path)) {
          resolve(false);
          return;
        }
        const entryRequest = store.get(path);
        entryRequest.onsuccess = () => {
          const entry = entryRequest.result;
          const descendants = keys.filter((key) => typeof key === 'string' && key.startsWith(`${path}/`));
          if (entry?.isDirectory && descendants.length && !recursive) {
            reject(new StorageError('O diretório não está vazio.', 'DIRECTORY_NOT_EMPTY'));
            return;
          }
          descendants.forEach((key) => store.delete(key));
          store.delete(path);
          resolve(true);
        };
        entryRequest.onerror = () => reject(entryRequest.error);
      };
      keysRequest.onerror = () => reject(keysRequest.error);
    }));
  }

  async copy(sourcePath, destinationPath) {
    return this.copyOrRename(sourcePath, destinationPath, false);
  }

  async rename(sourcePath, destinationPath) {
    return this.copyOrRename(sourcePath, destinationPath, true);
  }

  async copyOrRename(sourcePath, destinationPath, removeSource) {
    await this.initialize();
    const source = normalizeRelativePath(sourcePath);
    const destination = normalizeRelativePath(destinationPath);
    return this.transaction('readwrite', (store) => new Promise((resolve, reject) => {
      const request = store.get(source);
      request.onsuccess = () => {
        if (!request.result) {
          reject(new StorageError('O arquivo não existe no armazenamento local.', 'FILE_NOT_FOUND'));
          return;
        }
        parentDirectories(destination).forEach((directory) => store.put({ path: directory, isDirectory: true }));
        store.put({ ...request.result, path: destination });
        if (removeSource && source !== destination) store.delete(source);
        resolve(destination);
      };
      request.onerror = () => reject(request.error);
    }));
  }

  async list(relativeDirectory = '.') {
    await this.initialize();
    const directory = normalizeRelativePath(relativeDirectory, { allowCurrentDirectory: true });
    return this.transaction('readonly', (store) => new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => {
        const prefix = directory === '.' ? '' : `${directory}/`;
        const childPaths = request.result.filter((path) => {
          if (typeof path !== 'string' || !path.startsWith(prefix) || path === directory) return false;
          return !path.slice(prefix.length).includes('/');
        });
        if (!childPaths.length) {
          resolve([]);
          return;
        }
        const entries = [];
        let remaining = childPaths.length;
        childPaths.forEach((path) => {
          const entryRequest = store.get(path);
          entryRequest.onsuccess = () => {
            if (entryRequest.result) {
              entries.push({ name: path.slice(prefix.length), isDirectory: Boolean(entryRequest.result.isDirectory) });
            }
            remaining -= 1;
            if (!remaining) resolve(entries);
          };
          entryRequest.onerror = () => reject(entryRequest.error);
        });
      };
      request.onerror = () => reject(request.error);
    }));
  }

  async ensureDirectory(relativeDirectory) {
    await this.initialize();
    const path = normalizeRelativePath(relativeDirectory, { allowCurrentDirectory: true });
    if (path === '.') return true;
    return this.transaction('readwrite', (store) => {
      parentDirectories(`${path}/marker`).concat(path).forEach((directory) => store.put({ path: directory, isDirectory: true }));
    }).then(() => true);
  }

  async stat(relativePath) {
    await this.initialize();
    const path = normalizeRelativePath(relativePath);
    return this.transaction('readonly', (store) => new Promise((resolve, reject) => {
      const request = store.get(path);
      request.onsuccess = () => {
        if (!request.result) {
          reject(new StorageError('O arquivo não existe no armazenamento local.', 'FILE_NOT_FOUND'));
          return;
        }
        resolve({ isDirectory: Boolean(request.result.isDirectory), size: request.result.content?.length || 0 });
      };
      request.onerror = () => reject(request.error);
    }));
  }

  getDataDirectoryDescription() {
    return 'IndexedDB do navegador';
  }
}