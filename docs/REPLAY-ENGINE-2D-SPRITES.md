# Replay Engine 2D — Sprites

## Escopo

Esta etapa modifica exclusivamente a apresentação Canvas. Match Engine, eventos canônicos, ReplayRecorder, ReplaySchema, ReplayPlayer, placar e trajetórias continuam sendo as fontes existentes. A branch é `feature/replay-engine-2d-sprites`.

O renderer anterior possuía marcadores vetoriais orientados. Agora o fluxo visual é:

```text
ReplayScene
  -> AnimationStateMachine
  -> SpriteResolver
  -> PlayerVisualProfile
  -> PlayerSpriteRenderer / SpriteFallbackRenderer
  -> Canvas + ParticlePool
```

## Sprite pack padrão

`defaultSpritePack.js` é um manifesto v1 substituível:

```js
{
  sprite_pack_version: 1,
  id: 'padel-legacy-procedural-v1',
  type: 'procedural',
  frame_width: 64,
  frame_height: 80,
  directions: 8,
  animations: {
    forehand: {
      frames: [0, 1, 2, 3, 4],
      fps: 14,
      loop: false,
      impact_frame: 2,
      impact_offset: { x: 12, y: -7 },
      pivot: { x: 0, y: 20 }
    }
  }
}
```

O pack inicial é procedural, autoral e não depende de imagens externas. Corpo, cabelo, uniforme e raquete compartilham frame, pivô e direção. O loader também aceita futuro `atlas_url`; carrega uma única `Image`, mantém cache e usa fallback quando houver falha.

## Animações e state machine

Animações disponíveis: `idle`, `ready`, `walk`, `run`, `shuffle`, `backpedal`, `serve`, `forehand`, `backhand`, `volley_forehand`, `volley_backhand`, `lob`, `bandeja`, `smash`, `wall_return`, `stretched_defense`, `celebration`, `frustration` e `injury_reaction`.

Fallbacks são hierárquicos. Exemplo: `bandeja -> smash -> forehand -> ready -> idle`. Um asset ausente nunca interrompe o replay.

`AnimationStateMachine` mantém estado por atleta (`idle`, `moving`, `striking`, `celebrating`, `frustrated`, `injured`), instante de entrada e blend curto. A animação é escolhida pelos estados já resolvidos da timeline.

## Impacto e direções

`SpriteResolver` calcula frame por tempo/FPS. O frame definido em `impact_frame` retorna `impact: true` e offset de raquete; velocidade de replay preserva a proporção temporal. O evento da bola continua sendo a única fonte de lançamento e trajetória.

Oito direções são suportadas: N, NE, E, SE, S, SW, W e NW. Packs de uma direção podem ser espelhados apenas horizontalmente; texto e HUD não participam do espelhamento.

## Identidade visual

`PlayerVisualProfile` deriva deterministicamente de `seed + player_id`:

- tipo corporal;
- tom de pele;
- cabelo e cor;
- cores primária/secundária;
- shorts, calçados e raquete;
- símbolo triangular para dupla A e circular para dupla B.

Os quatro atletas da fixture geram quatro perfis diferentes. Esses dados nunca entram no Match Engine. Replays antigos recebem perfil automaticamente sem migração.

## Renderização e efeitos

Os personagens têm pernas animadas, braços, raquete, preparação/golpe, salto em smash/bandeja/defesa, comemoração e frustração. Pivôs mantêm os pés ancorados. Atletas e bola possuem sombras separadas; a sombra da bola indica altura.

`ParticlePool` possui tamanho fixo e atende impacto, parede, rede, smash e comemoração sem criar objetos continuamente. Qualidade baixa reduz frames/partículas e remove sombras avançadas; média é padrão; alta aumenta efeitos. Timing e resultado permanecem iguais.

`reducedMotion` fixa a câmera via configuração existente, reduz partículas e usa animação simplificada. Alto contraste, símbolos de equipe e nomes evitam dependência exclusiva de cor. `debugSprites` mostra bounding box, pivô, animação, frame e direção.

## Preview

A rota de desenvolvimento `/dev/sprite-preview` permite selecionar animação, oito direções, velocidade, uniforme e debug de pivô/frame/impacto. O Canvas usa o mesmo resolver e renderer da partida e não atualiza React a cada frame.

## Validação do manifesto

O loader detecta versão, ID, dimensões, direções, frames, FPS, pivô, impact frame, idle e atlas ausentes. Mensagens incluem código e animação afetada. Falha de atlas registra erro e o `SpriteSystem` usa o pack procedural seguro.

## Testes

- `npm run test:replay`: passou.
- `npm run test:replay-gameplay`: passou.
- `npm run test:replay-sprites`: passou.
- `npm run lint`: passou.
- `npm run build`: passou; 3.789 módulos transformados.
- `npm run app:dev -- --no-watch`: passou; Vite desktop iniciou, Rust terminou e `padel-legacy.exe` foi executado. Apenas warning informativo do linker.

`window.PadelReplaySpritesTest.run()` retorna:

```json
{
  "ok": true,
  "spritePackLoaded": true,
  "animationsValidated": true,
  "impactSynced": true,
  "fallbackWorking": true,
  "directionsWorking": true,
  "visualProfiles": 4,
  "oldReplayCompatible": true,
  "memoryStable": true,
  "qualityTimingStable": true,
  "injuryNotInvented": true
}
```

## Arquivos criados nesta etapa

- `src/gameplay/replay/sprites/defaultSpritePack.js`
- `src/gameplay/replay/sprites/SpriteAtlasLoader.js`
- `src/gameplay/replay/sprites/AnimationStateMachine.js`
- `src/gameplay/replay/sprites/SpriteResolver.js`
- `src/gameplay/replay/sprites/PlayerVisualProfile.js`
- `src/gameplay/replay/sprites/PlayerSpriteRenderer.js`
- `src/gameplay/replay/sprites/SpriteFallbackRenderer.js`
- `src/gameplay/replay/sprites/ParticlePool.js`
- `src/gameplay/replay/sprites/SpriteSystem.js`
- `src/gameplay/replay/sprites/ReplaySpritesTest.js`
- `src/pages/dev/SpritePreview.jsx`
- `scripts/test-replay-sprites.mjs`
- `docs/REPLAY-ENGINE-2D-SPRITES.md`

Alterados nesta etapa: `Match2DRenderer.js`, `ReplayVisualConfig.js`, `ReplayPanel.jsx`, `App.jsx`, `registerDevTests.js` e `package.json`. Alterações em Match Engine/recorder/schema/player vistas no working tree são herdadas das etapas anteriores, não desta etapa visual.

## Limitações e próxima fase

- O pack atual é procedural; ainda não é pixel art desenhada frame a frame em PNG.
- Interação física entre parceiros é representada por reação conjunta, sem coreografia de deslocamento adicional.
- Intensidade de celebração usa os eventos disponíveis; metadados futuros de final/título permitirão variantes mais precisas.
- Lesão só é exibida quando um estado/evento real estiver disponível; nenhuma lesão é inferida.
- O editor ainda não exporta manifesto/atlas.

A próxima fase recomendada é polimento audiovisual e direção de transmissão: atlas artístico final, áudio próprio/licenciado, câmera de broadcast, transições de set, replays editoriais e regressão visual automatizada, sem tocar novamente no Match Engine.
