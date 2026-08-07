export function parsePadelVersion(version = '') {
  const m = /^0\.9\.0-(beta|rc)\.(\d+)(?:\.(\d+))?$/.exec(String(version));
  return m ? { channel: m[1], major: Number(m[2]), patch: Number(m[3] || 0) } : null;
}
export function isAtLeastBetaOrRC(version, minimumBeta = 0) {
  const parsed = parsePadelVersion(version);
  return Boolean(parsed && (parsed.channel === 'rc' || parsed.major >= minimumBeta));
}
