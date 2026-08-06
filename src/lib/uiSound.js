const STORAGE_KEY = 'padel:ui-sound-preferences';
const DEFAULTS = { enabled: true, volume: 0.35 };
let context = null;
let lastPlayedAt = 0;

export function loadUiSoundPreferences() {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      enabled: saved.enabled !== false,
      volume: Math.max(0, Math.min(1, Number(saved.volume ?? DEFAULTS.volume))),
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveUiSoundPreferences(patch) {
  const next = { ...loadUiSoundPreferences(), ...patch };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('padel:ui-sound-preferences', { detail: next }));
  }
  return next;
}

function ensureContext() {
  if (context || typeof window === 'undefined') return context;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  try {
    context = new AudioContextCtor();
  } catch {
    return null;
  }
  return context;
}

const CUES = {
  success: [[523.25, 0], [659.25, 0.075]],
  warning: [[392, 0], [349.23, 0.09]],
  error: [[220, 0], [174.61, 0.09]],
  notification: [[659.25, 0], [783.99, 0.08]],
  neutral: [[440, 0]],
};

export function playUiSound(type = 'neutral') {
  const prefs = loadUiSoundPreferences();
  if (!prefs.enabled || prefs.volume <= 0 || typeof document === 'undefined' || document.hidden) return false;
  const now = Date.now();
  if (now - lastPlayedAt < 90) return false;
  lastPlayedAt = now;
  const audio = ensureContext();
  if (!audio) return false;
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  const notes = CUES[type] || CUES.neutral;
  try {
    notes.forEach(([frequency, offset], index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + offset;
      const duration = type === 'error' ? 0.12 : 0.1;
      oscillator.type = type === 'error' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, prefs.volume * 0.045), start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
      if (index === notes.length - 1) oscillator.onended = () => {};
    });
    return true;
  } catch {
    return false;
  }
}

export function emitUiSound(type, source = 'system') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('padel:ui-feedback-sound', { detail: { type, source } }));
}
