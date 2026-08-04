import { TauriStorage } from '../../../storage/TauriStorage.js';
const PATH = 'preferences/replay-broadcast.json';
export const BROADCAST_PRESETS = Object.freeze({
  default: { cameraMode: 'auto', automaticReplays: 'important', crowdEnabled: true, captionsEnabled: true, reducedMotion: false, highContrast: false, quality: 'medium' },
  compact: { cameraMode: 'full_court', automaticReplays: 'off', crowdEnabled: true, captionsEnabled: true, reducedMotion: true, highContrast: false, quality: 'low' },
  cinematic: { cameraMode: 'auto', automaticReplays: 'frequent', crowdEnabled: true, captionsEnabled: true, reducedMotion: false, highContrast: false, quality: 'high' },
  performance: { cameraMode: 'full_court', automaticReplays: 'off', crowdEnabled: false, captionsEnabled: false, reducedMotion: true, highContrast: false, quality: 'low' },
  accessible: { cameraMode: 'full_court', automaticReplays: 'important', crowdEnabled: false, captionsEnabled: true, reducedMotion: true, highContrast: true, quality: 'medium' },
});
export const DEFAULT_BROADCAST_SETTINGS = Object.freeze({ broadcastPreset: 'default', automaticReplays: 'important', cameraMotion: true, crowdEnabled: true, refereeVoiceEnabled: true, captionsEnabled: true, pauseOnBlur: true, noFlashes: false, textScale: 1, masterVolume: .8, effectsVolume: .9, crowdVolume: .7, refereeVolume: .7, interfaceVolume: .45, ambienceVolume: .35, muted: false, ...BROADCAST_PRESETS.default });
let memory = { ...DEFAULT_BROADCAST_SETTINGS };
export const BroadcastSettings = { applyPreset(name, current = memory) { return { ...current, ...(BROADCAST_PRESETS[name] || BROADCAST_PRESETS.default), broadcastPreset: name }; }, async load() { const storage = new TauriStorage(); if (storage.isSupported() && await storage.exists(PATH)) { try { memory = { ...memory, ...JSON.parse(await storage.readText(PATH)) }; } catch { /* fallback */ } } return { ...memory }; }, async save(value) { memory = { ...memory, ...value }; const storage = new TauriStorage(); if (storage.isSupported()) await storage.writeText(PATH, JSON.stringify(memory, null, 2)); return { ...memory }; } };
