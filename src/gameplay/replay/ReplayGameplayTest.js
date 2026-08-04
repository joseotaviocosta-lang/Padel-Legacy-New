import { sampleReplay } from './fixtures/sampleReplay.js';
import { resolveReplayScene } from './ReplayScene.js';
import { CAMERA_MODES } from './ReplayVisualConfig.js';
import { narrationForEvent } from './ReplayNarration.js';
import { groupReplayPoints } from './ReplayImportantPoints.js';
import { validateReplay } from './ReplayValidator.js';

const middle = (event) => event.t + event.duration / 2;
export async function runReplayGameplayTest() {
  const serve = sampleReplay.events.find((event) => event.type === 'serve'); const lob = sampleReplay.events.find((event) => event.data?.shot_type === 'lob'); const smash = sampleReplay.events.find((event) => event.data?.shot_type === 'smash'); const wall = sampleReplay.events.find((event) => event.type === 'wall_contact');
  const serveScene = resolveReplayScene(sampleReplay, middle(serve)); const lobScene = resolveReplayScene(sampleReplay, middle(lob)); const smashScene = resolveReplayScene(sampleReplay, middle(smash)); const wallScene = resolveReplayScene(sampleReplay, middle(wall));
  const serveRendered = serveScene.players.find((player) => player.id === serve.actor_id)?.state === 'serving' && serveScene.ball.z > 0; const lobRendered = lobScene.shot?.type === 'lob'; const smashRendered = smashScene.shot?.type === 'smash' && smashScene.shot.speed >= 100; const wallContactRendered = wallScene.impacts.some((impact) => impact.type === 'wall_contact');
  const narrationSynced = sampleReplay.events.filter((event) => ['serve', 'shot', 'wall_contact', 'score_update'].includes(event.type)).every((event) => narrationForEvent(event, sampleReplay));
  const first = JSON.stringify(resolveReplayScene(sampleReplay, 5000)); const second = JSON.stringify(resolveReplayScene(sampleReplay, 5000)); const deterministic = first === second;
  const oldReplay = structuredClone(sampleReplay); oldReplay.teams.flatMap((team) => team.players).forEach((player) => delete player.initial_position); oldReplay.events.forEach((event) => { if (event.data) { delete event.data.speed_kmh; delete event.data.ball_speed_kmh; if (event.data.from) delete event.data.from.z; if (event.data.to) delete event.data.to.z; } }); const legacyCompatible = validateReplay(oldReplay).valid && Boolean(resolveReplayScene(oldReplay, 3000).ball);
  const started = performance.now(); for (let index = 0; index < 600; index += 1) resolveReplayScene(sampleReplay, index / 600 * sampleReplay.duration); const elapsed = performance.now() - started; const averageFps = Math.round(600 / Math.max(elapsed / 1000, 0.001));
  const points = groupReplayPoints(sampleReplay); const importantPoints = points.some((point) => point.important); const ok = serveRendered && wallContactRendered && lobRendered && smashRendered && narrationSynced && deterministic && legacyCompatible && importantPoints;
  return { ok, serveRendered, wallContactRendered, lobRendered, smashRendered, cameraModes: CAMERA_MODES.length, narrationSynced, deterministic, legacyCompatible, importantPoints, averageFps };
}
