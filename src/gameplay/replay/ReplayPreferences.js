import { TauriStorage } from '@/storage/TauriStorage.js';
import { DEFAULT_VISUAL_OPTIONS } from './ReplayVisualConfig.js';
const PATH = 'preferences/replay-2d.json'; let cached = { replaySpeed: 1, ...DEFAULT_VISUAL_OPTIONS };
export const ReplayPreferences = { async load() { const storage = new TauriStorage(); if (!storage.isSupported() || !(await storage.exists(PATH))) return { ...cached }; try { cached = { ...cached, ...JSON.parse(await storage.readText(PATH)) }; } catch { /* defaults */ } return { ...cached }; }, async save(preferences) { cached = { ...cached, ...preferences }; const storage = new TauriStorage(); if (storage.isSupported()) await storage.writeText(PATH, JSON.stringify(cached, null, 2)); return { ...cached }; } };
