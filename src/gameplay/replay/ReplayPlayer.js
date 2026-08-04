import { eventIndexAt, replayDuration } from './ReplayTimeline.js';
import { validateReplay } from './ReplayValidator.js';
const boundRequestAnimationFrame = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
  ? window.requestAnimationFrame.bind(window)
  : typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : () => 0;
const boundCancelAnimationFrame = typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
  ? window.cancelAnimationFrame.bind(window)
  : typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame
    : () => {};
export class ReplayPlayer {
  constructor({ now = () => performance.now(), requestFrame = boundRequestAnimationFrame, cancelFrame = boundCancelAnimationFrame, allowIncomplete = false } = {}) {
    this.now = now;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.allowIncomplete = allowIncomplete;
    this.listeners = new Set();
    this.frame = null;
    this.lastTick = 0;
    this.destroyed = false;
    this.state = {
      status: 'idle',
      currentTime: 0,
      duration: 0,
      speed: 1,
      currentEventIndex: 0,
    };
  }
  load(replay) {
    if (this.destroyed) throw new Error('ReplayPlayer já foi destruído.');
    const validation = validateReplay(replay);
    const errors = this.allowIncomplete
      ? validation.errors.filter((item) => item.code !== 'MISSING_MATCH_END')
      : validation.errors;
    if (errors.length) throw new Error(errors.map((e) => e.message).join(' '));
    this.replay = replay;
    this.state = {
      ...this.state,
      status: 'idle',
      currentTime: 0,
      duration: replayDuration(replay),
      currentEventIndex: 0,
    };
    this.emit();
    return this;
  }
  update(replay) {
    if (this.destroyed) throw new Error('ReplayPlayer já foi destruído.');
    const validation = validateReplay(replay);
    const errors = this.allowIncomplete
      ? validation.errors.filter((item) => item.code !== 'MISSING_MATCH_END')
      : validation.errors;
    if (errors.length) throw new Error(errors.map((e) => e.message).join(' '));
    this.replay = replay;
    this.state.duration = replayDuration(replay);
    this.state.currentTime = Math.min(this.state.currentTime, this.state.duration);
    this.state.currentEventIndex = eventIndexAt(replay.events || [], this.state.currentTime);
    this.emit();
    return this;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }
  snapshot() {
    return {
      ...this.state,
      replay: this.replay,
      event: this.replay?.events?.[this.state.currentEventIndex],
    };
  }
  emit() {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
  play() {
    if (this.destroyed || !this.replay || this.state.status === 'playing') return;
    if (this.state.currentTime >= this.state.duration) this.seek(0);
    this.state.status = 'playing';
    this.lastTick = this.now();
    this.emit();
    this.frame = this.requestFrame(() => this.tick());
  }
  tick() {
    if (this.destroyed || this.state.status !== 'playing') return;
    const current = this.now();
    this.seek(this.state.currentTime + (current - this.lastTick) * this.state.speed, false);
    this.lastTick = current;
    if (this.state.currentTime >= this.state.duration) {
      this.state.status = 'finished';
      this.emit();
      return;
    }
    this.emit();
    this.frame = this.requestFrame(() => this.tick());
  }
  pause() {
    if (this.destroyed || this.state.status !== 'playing') return;
    if (this.frame != null) {
      this.cancelFrame(this.frame);
      this.frame = null;
    }
    this.state.status = 'paused';
    this.emit();
  }
  stop() {
    if (this.destroyed) return;
    this.pause();
    this.state.status = 'idle';
    this.seek(0);
  }
  seek(milliseconds, emit = true) {
    if (this.destroyed) return;
    this.state.currentTime = Math.min(this.state.duration, Math.max(0, milliseconds));
    this.state.currentEventIndex = eventIndexAt(this.replay?.events || [], this.state.currentTime);
    if (emit) this.emit();
  }
  setSpeed(speed) {
    if (this.destroyed) return;
    const parsed = Number(speed);
    if (![1, 2, 5, 10].includes(parsed)) throw new Error('Velocidade inválida.');
    this.state.speed = parsed;
    this.emit();
  }
  stepForward() {
    if (this.destroyed) return;
    const events = this.replay?.events || [];
    this.seek(events[Math.min(events.length - 1, this.state.currentEventIndex + 1)]?.t || 0);
  }
  stepBackward() {
    if (this.destroyed) return;
    const events = this.replay?.events || [];
    this.seek(events[Math.max(0, this.state.currentEventIndex - 1)]?.t || 0);
  }
  restartPoint() {
    if (this.destroyed) return;
    const pointId = this.replay?.events?.[this.state.currentEventIndex]?.point_id;
    const event = this.replay?.events?.find((item) => item.point_id === pointId)
      || this.replay?.events?.findLast((item) => item.t <= this.state.currentTime && item.type === 'point_start');
    this.seek(event?.t || 0);
  }
  nextPoint() {
    if (this.destroyed) return;
    const current = this.replay?.events?.[this.state.currentEventIndex]?.point_id;
    const event = this.replay?.events?.find((item) => item.t > this.state.currentTime && item.type === 'point_start' && item.point_id !== current);
    this.seek(event?.t ?? this.state.duration);
  }
  nextGame() {
    if (this.destroyed) return;
    const event = this.replay?.events?.find((item) => item.t > this.state.currentTime && item.type === 'game_start');
    this.seek(event?.t ?? this.state.duration);
  }
  endGame() {
    if (this.destroyed) return;
    const event = this.replay?.events?.find((item) => item.t > this.state.currentTime && item.type === 'game_end');
    this.seek(event ? event.t + event.duration : this.state.duration);
  }
  endSet() {
    if (this.destroyed) return;
    const event = this.replay?.events?.find((item) => item.t > this.state.currentTime && item.type === 'set_end');
    this.seek(event ? event.t + event.duration : this.state.duration);
  }
  endMatch() {
    if (this.destroyed) return;
    const event = this.replay?.events?.find((item) => item.type === 'match_end');
    this.seek(event ? event.t + event.duration : this.state.duration);
  }
  restart() {
    if (this.destroyed) return;
    this.pause();
    this.state.status = 'idle';
    this.seek(0);
  }
  destroy() {
    if (this.destroyed) return;
    if (this.frame != null) {
      this.cancelFrame(this.frame);
      this.frame = null;
    }
    this.listeners.clear();
    this.destroyed = true;
  }
}
