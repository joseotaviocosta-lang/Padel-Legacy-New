import { GameStorage } from './GameStorage.js';

const PERSIST_FILE = 'storage-persist-test.json';

export function setupStorageTest() {
  if (typeof window === 'undefined') return;

  window.PadelStorageTest = {
    async run() {
      const storage = new GameStorage();
      await storage.initialize();
      const testId = `padel-storage-test-${Date.now()}`;
      const sample = {
        id: testId,
        database: {
          metadata: { created_at: new Date().toISOString(), test: true },
          records: [{ id: 'sample', value: 'ok' }],
        },
      };

      await storage.writeCareer(testId, sample, { backup: false });
      const loaded = await storage.readCareer(testId);
      await storage.writeJson('temp/cleanup-check.json', { ok: true }, { backup: false, validate: false });
      const listed = await storage.list('backups');
      const exists = await storage.exists(`careers/${testId}.json`);
      await storage.remove(`temp/cleanup-check.json`);

      return {
        success: true,
        careerId: testId,
        stored: loaded,
        backupEntries: listed.length,
        exists,
      };
    },

    async persist() {
      const storage = new GameStorage();
      await storage.initialize();
      const payload = {
        message: 'persistencia-ok',
        createdAt: new Date().toISOString(),
        randomValue: `${Math.random().toString(36).slice(2)}`,
      };
      await storage.writeJson(PERSIST_FILE, payload, { backup: false, validate: false });
      return payload;
    },

    async checkPersist() {
      const storage = new GameStorage();
      await storage.initialize();
      const exists = await storage.exists(PERSIST_FILE);
      if (!exists) {
        return { success: false, exists: false, data: null };
      }
      const data = await storage.readJson(PERSIST_FILE);
      return {
        success: data?.message === 'persistencia-ok',
        exists: true,
        data: data ? { message: data.message } : null,
      };
    },

    async cleanupPersist() {
      const storage = new GameStorage();
      await storage.initialize();
      const removed = await storage.remove(PERSIST_FILE);
      return { success: removed, removed };
    },
  };
}
