const animation = (frames, fps, loop = true, impactFrame = null, pivot = { x: 0, y: 20 }) => ({ frames, fps, loop, ...(impactFrame == null ? {} : { impact_frame: impactFrame, impact_offset: { x: 12, y: -7 } }), pivot });
export const defaultSpritePack = Object.freeze({
  sprite_pack_version: 1, id: 'padel-legacy-procedural-v1', type: 'procedural', frame_width: 64, frame_height: 80, directions: 8,
  animations: {
    idle: animation([0, 1, 2, 1], 5), ready: animation([0, 1, 2, 1], 7), walk: animation([0, 1, 2, 3], 8), run: animation([0, 1, 2, 3, 4, 5], 12), shuffle: animation([0, 1, 2, 3], 10), backpedal: animation([0, 1, 2, 3], 9),
    serve: animation([0, 1, 2, 3, 4, 5], 12, false, 4, { x: 0, y: 22 }), forehand: animation([0, 1, 2, 3, 4], 14, false, 2), backhand: animation([0, 1, 2, 3, 4], 14, false, 2), volley_forehand: animation([0, 1, 2, 3], 15, false, 2), volley_backhand: animation([0, 1, 2, 3], 15, false, 2), lob: animation([0, 1, 2, 3, 4], 11, false, 3), bandeja: animation([0, 1, 2, 3, 4, 5], 13, false, 3, { x: 0, y: 22 }), smash: animation([0, 1, 2, 3, 4, 5], 16, false, 4, { x: 0, y: 24 }),
    wall_return: animation([0, 1, 2, 3, 4], 12, false, 3), stretched_defense: animation([0, 1, 2, 3], 10, false, 2), celebration: animation([0, 1, 2, 3, 4, 5], 9, false), frustration: animation([0, 1, 2, 3], 7, false), injury_reaction: animation([0, 1, 2, 3], 6, false),
  },
});
export const ANIMATION_FALLBACKS = Object.freeze({ bandeja: ['smash', 'forehand', 'ready', 'idle'], volley_backhand: ['backhand', 'ready', 'idle'], volley_forehand: ['forehand', 'ready', 'idle'], wall_return: ['backhand', 'forehand', 'ready', 'idle'], stretched_defense: ['backhand', 'ready', 'idle'], injury_reaction: ['frustration', 'idle'], run: ['walk', 'ready', 'idle'], shuffle: ['walk', 'ready', 'idle'], backpedal: ['walk', 'ready', 'idle'] });
