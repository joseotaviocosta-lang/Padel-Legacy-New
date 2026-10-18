// CLOUD-7C — comparação LÓGICA de dois saves (formato físico pode diferir: history_pack é expandido antes).
// Telemetria de tempo real persistida no estado (`durationMs`) e `last_played_at` são normalizadas e contadas à parte.
// Uso: node scripts/compare-cloud-7c-saves.mjs <saveA.json> <saveB.json> [--output=<json>]
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { unpackCareerFromStorage } from '../src/careers/tournamentHistoryCodec.js';

const [fileA, fileB] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const outFile = process.argv.find((a) => a.startsWith('--output='))?.slice(9);
const sha = (v) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const VOLATILE = new Set(['durationMs']);
function normalize(value, stats, pathKey = '') {
  if (Array.isArray(value)) return value.map((v) => normalize(v, stats, pathKey));
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      if (VOLATILE.has(key)) { stats[`${pathKey}.${key}`] = (stats[`${pathKey}.${key}`] || 0) + 1; out[key] = 0; } else out[key] = normalize(value[key], stats, key);
    }
    return out;
  }
  return value;
}
const load = (file) => unpackCareerFromStorage(JSON.parse(fs.readFileSync(file, 'utf8')));
const A = load(fileA); const B = load(fileB);
const statsA = {}; const statsB = {};
const entities = [...new Set([...Object.keys(A.entities), ...Object.keys(B.entities)])].sort();
const rawDiff = []; const normDiff = [];
for (const name of entities) {
  if (sha(A.entities[name]) !== sha(B.entities[name])) rawDiff.push(name);
  if (sha(normalize(A.entities[name], statsA, name)) !== sha(normalize(B.entities[name], statsB, name))) normDiff.push(name);
}
const playerRaw = sha(A.player) !== sha(B.player);
const playerNorm = sha(normalize(A.player, {}, 'player')) !== sha(normalize(B.player, {}, 'player'));
const topKeys = Object.keys(A).filter((k) => !['entities', 'player', 'last_played_at', 'updated_at', 'career_id'].includes(k));
const topDiff = topKeys.filter((k) => sha(A[k]) !== sha(B[k]));
const result = { fileA, fileB, entitiesCompared: entities.length, rawDifferentEntities: rawDiff, differentAfterNormalizingTelemetry: normDiff, playerDiffRaw: playerRaw, playerDiffNormalized: playerNorm, otherTopLevelDiffs: topDiff, telemetryFieldsNormalized: statsA, logicallyEquivalent: normDiff.length === 0 && !playerNorm && topDiff.length === 0 };
if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 1));
