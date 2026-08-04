import { eventIndexAt, replayDuration } from './ReplayTimeline.js';
import { validateReplay } from './ReplayValidator.js';
export class ReplayPlayer {
  constructor({ now = () => performance.now(), requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, allowIncomplete = false } = {}) { this.now = now; this.requestFrame = requestFrame; this.cancelFrame = cancelFrame; this.allowIncomplete = allowIncomplete; this.listeners = new Set(); this.state = { status: 'idle', currentTime: 0, duration: 0, speed: 1, currentEventIndex: 0 }; }
  load(replay) { const validation = validateReplay(replay); const errors = this.allowIncomplete ? validation.errors.filter((item) => item.code !== 'MISSING_MATCH_END') : validation.errors; if (errors.length) throw new Error(errors.map((e) => e.message).join(' ')); this.replay = replay; this.state = { ...this.state, status: 'idle', currentTime: 0, duration: replayDuration(replay), currentEventIndex: 0 }; this.emit(); return this; }
  update(replay) { const validation = validateReplay(replay); const errors = this.allowIncomplete ? validation.errors.filter((item) => item.code !== 'MISSING_MATCH_END') : validation.errors; if (errors.length) throw new Error(errors.map((e) => e.message).join(' ')); this.replay = replay; this.state.duration = replayDuration(replay); this.state.currentTime = Math.min(this.state.currentTime, this.state.duration); this.state.currentEventIndex = eventIndexAt(replay.events || [], this.state.currentTime); this.emit(); return this; }
  subscribe(listener) { this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener); }
  snapshot() { return { ...this.state, replay: this.replay, event: this.replay?.events?.[this.state.currentEventIndex] }; }
  emit() { const snapshot = this.snapshot(); this.listeners.forEach((listener) => listener(snapshot)); }
  play() { if (!this.replay || this.state.status === 'playing') return; if (this.state.currentTime >= this.state.duration) this.seek(0); this.state.status = 'playing'; this.lastTick = this.now(); this.emit(); this.frame = this.requestFrame(() => this.tick()); }
  tick() { if (this.state.status !== 'playing') return; const current = this.now(); this.seek(this.state.currentTime + (current - this.lastTick) * this.state.speed, false); this.lastTick = current; if (this.state.currentTime >= this.state.duration) { this.state.status = 'finished'; this.emit(); return; } this.emit(); this.frame = this.requestFrame(() => this.tick()); }
  pause() { if (this.state.status === 'playing') { this.cancelFrame(this.frame); this.state.status = 'paused'; this.emit(); } }
  stop() { this.pause(); this.state.status = 'idle'; this.seek(0); }
  seek(milliseconds, emit = true) { this.state.currentTime = Math.min(this.state.duration, Math.max(0, milliseconds)); this.state.currentEventIndex = eventIndexAt(this.replay?.events || [], this.state.currentTime); if (emit) this.emit(); }
  setSpeed(speed) { if (![1, 2, 5, 10].includes(Number(speed))) throw new Error('Velocidade inválida.'); this.state.speed = Number(speed); this.emit(); }
  stepForward() { const events = this.replay?.events || []; this.seek(events[Math.min(events.length - 1, this.state.currentEventIndex + 1)]?.t || 0); }
  stepBackward() { const events = this.replay?.events || []; this.seek(events[Math.max(0, this.state.currentEventIndex - 1)]?.t || 0); }
  restartPoint() { const pointId = this.replay?.events?.[this.state.currentEventIndex]?.point_id; const event = this.replay?.events?.find((item) => item.point_id === pointId) || this.replay?.events?.findLast((item) => item.t <= this.state.currentTime && item.type === 'point_start'); this.seek(event?.t || 0); }
  nextPoint() { const current = this.replay?.events?.[this.state.currentEventIndex]?.point_id; const event = this.replay?.events?.find((item) => item.t > this.state.currentTime && item.type === 'point_start' && item.point_id !== current); this.seek(event?.t ?? this.state.duration); }
  nextGame() { const event = this.replay?.events?.find((item) => item.t > this.state.currentTime && item.type === 'game_start'); this.seek(event?.t ?? this.state.duration); }
  endGame() { const event = this.replay?.events?.find((item) => item.t > this.state.currentTime && item.type === 'game_end'); this.seek(event ? event.t + event.duration : this.state.duration); }
  endSet() { const event = this.replay?.events?.find((item) => item.t > this.state.currentTime && item.type === 'set_end'); this.seek(event ? event.t + event.duration : this.state.duration); }
  endMatch() { const event = this.replay?.events?.find((item) => item.type === 'match_end'); this.seek(event ? event.t + event.duration : this.state.duration); }
  restart() { this.pause(); this.state.status = 'idle'; this.seek(0); }
  destroy() { this.cancelFrame(this.frame); this.listeners.clear(); }
}
