export const replayDuration = (replay) => replay?.events?.reduce((end, event) => {
  const start = Number(event?.t);
  const duration = Number(event?.duration);
  return Math.max(end, (Number.isFinite(start) ? start : 0) + (Number.isFinite(duration) ? duration : 0));
}, 0) || Number(replay?.duration) || 0;
export const eventIndexAt = (events, time) => {
  let low = 0; let high = events.length - 1; let found = 0;
  while (low <= high) { const middle = (low + high) >> 1; if (events[middle].t <= time) { found = middle; low = middle + 1; } else high = middle - 1; }
  return found;
};
export const eventProgress = (event, time) => event?.duration ? Math.min(1, Math.max(0, (time - event.t) / event.duration)) : 1;
