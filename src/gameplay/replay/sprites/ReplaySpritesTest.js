import { sampleReplay } from '../fixtures/sampleReplay.js';
import { defaultSpritePack } from './defaultSpritePack.js';
import { SpriteAtlasLoader, validateSpriteManifest } from './SpriteAtlasLoader.js';
import { angleToDirection, resolveAnimation, resolveSpriteFrame } from './SpriteResolver.js';
import { createPlayerVisualProfile } from './PlayerVisualProfile.js';
import { ParticlePool } from './ParticlePool.js';

export async function runReplaySpritesTest() {
  const loader = new SpriteAtlasLoader(); const pack = await loader.load(defaultSpritePack); const validation = validateSpriteManifest(defaultSpritePack); const spritePackLoaded = pack.procedural && validation.valid; const animationsValidated = Object.keys(defaultSpritePack.animations).length >= 18;
  const missing = structuredClone(defaultSpritePack); delete missing.animations.bandeja; const fallbackWorking = resolveAnimation(missing, 'bandeja')?.name === 'smash';
  const forehand = defaultSpritePack.animations.forehand; const impactTime = forehand.impact_frame * 1000 / forehand.fps; const impact = resolveSpriteFrame(defaultSpritePack, 'forehand', 0, impactTime, 'high'); const impactSynced = impact.impact && Boolean(impact.impactOffset);
  const directions = new Set(Array.from({ length: 8 }, (_, index) => angleToDirection(index * Math.PI / 4))); const directionsWorking = directions.size === 8;
  const players = sampleReplay.teams.flatMap((team, teamIndex) => team.players.map((player) => ({ player, teamIndex }))); const profiles = players.map(({ player, teamIndex }) => createPlayerVisualProfile(player, teamIndex, sampleReplay.seed)); const visualProfiles = new Set(profiles.map((profile) => JSON.stringify([profile.skin_tone, profile.hair_style, profile.shirt_primary, profile.shirt_secondary]))).size;
  const oldReplay = structuredClone(sampleReplay); oldReplay.teams.flatMap((team) => team.players).forEach((player) => delete player.visual_profile); const oldReplayCompatible = oldReplay.teams.flatMap((team, teamIndex) => team.players.map((player) => createPlayerVisualProfile(player, teamIndex, oldReplay.seed))).length === 4;
  const pool = new ParticlePool(32); for (let index = 0; index < 1000; index += 1) pool.emit(0, 0, 'impact', index, 4); const memoryStable = pool.items.length === 32; const qualityTimingStable = ['low', 'medium', 'high'].every((quality) => resolveSpriteFrame(defaultSpritePack, 'smash', 0, 100, quality)?.name === 'smash'); const injuryNotInvented = !sampleReplay.events.some((event) => event.type === 'injury') && !profiles.some((profile) => profile.injured);
  const ok = spritePackLoaded && animationsValidated && impactSynced && fallbackWorking && directionsWorking && visualProfiles === 4 && oldReplayCompatible && memoryStable && qualityTimingStable && injuryNotInvented;
  return { ok, spritePackLoaded, animationsValidated, impactSynced, fallbackWorking, directionsWorking, visualProfiles, oldReplayCompatible, memoryStable, qualityTimingStable, injuryNotInvented };
}
