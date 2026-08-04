# Replay Engine 2D — Fundação v1

## Objetivo e fronteira arquitetural

Esta etapa introduz um replay determinístico e versionado sem transferir decisões esportivas ao renderer. O fluxo é:

```text
MatchEngine / RallyEngine
  -> rallyMemory + resultado + placar já decididos
  -> ReplayRecorder (adaptador único em MatchEngine.playPoint)
  -> Replay JSON v1
  -> ReplayPlayer
  -> Match2DRenderer (Canvas 2D)
```

O Match Engine continua decidindo golpe, execução, erro, vencedor, placar, energia, pressão e duração esportiva do rally. O Replay Engine atribui somente posições e durações visuais determinísticas.

## Arquitetura encontrada

- `MatchEngine.createMatch` cria estado, equipes e seed.
- `MatchEngine.playPoint` cria `createRandom(`${seed}:${pointNumber}`)`, executa `RallyEngine.play`, atualiza momentum, gera comentário e chama `awardPoint`.
- `RallyEngine.play` processa cada golpe. `rallyMemory` contém time, atleta, golpe, pressão, execução e dificuldade; `decisionTrace` e `coordinationEvents` fornecem dados auxiliares.
- `awardPoint`, `checkSet` e `finishSet` atualizam placar e inserem os eventos narrativos existentes: `point`, `game`, `tiebreak_start`, `tiebreak_end`, `set` e `match`.
- `LiveMatch` mostra placar/narração e chama `playPoint`; `SimulationModal` persiste o resultado e mostra a tela final.

### Determinismo existente

`hashSeed` aplica FNV-1a de 32 bits e `createRandom` usa uma sequência Mulberry32. Cada ponto recebe um PRNG novo derivado de `${matchSeed}:${pointNumber}`. O recorder não chama `Math.random`, não consome esse PRNG e gera IDs, data, coordenadas e durações apenas a partir de seed, índice e eventos canônicos. Duas simulações iguais produzem replay JSON byte a byte igual.

## Schema final

O envelope tem `replay_version`, IDs, seed, data determinística, quadra normalizada, equipes, placar inicial, duração e eventos. Coordenadas usam `x: 0..10`, `y: 0..20`, `z: 0..8`.

```json
{
  "replay_version": 1,
  "replay_id": "replay-123456",
  "match_id": "match-123456",
  "seed": "career-match-42",
  "created_at": "1970-01-02T10:17:36.000Z",
  "court": { "width": 10, "length": 20, "orientation": "top_down" },
  "teams": [
    { "id": "team-a", "side": "bottom", "players": [{ "id": "a1", "name": "Ana", "court_side": "right", "initial_position": { "x": 3, "y": 16 } }] }
  ],
  "initial_score": { "sets": [0, 0], "games": [0, 0], "points": ["0", "0"], "serving_team": "team-a" },
  "events": [
    { "id": "evt-0001", "type": "match_start", "rally_id": null, "point_id": null, "t": 0, "duration": 300, "actor_id": null, "data": {} },
    { "id": "evt-0005", "type": "shot", "rally_id": "rally-001", "point_id": "point-001", "t": 950, "duration": 220, "actor_id": "a1", "data": { "shot_type": "serve", "origin": { "x": 3, "y": 16 }, "target": { "x": 6.8, "y": 4 }, "outcome": "in_play" } }
  ]
}
```

Tipos aceitos: `match_start`, `set_start`, `game_start`, `point_start`, `serve`, `player_move`, `ball_move`, `shot`, `bounce`, `net_contact`, `wall_contact`, `error`, `winner`, `point_end`, `score_update`, `game_end`, `set_end`, `match_end` e `celebration`.

## Recorder e validação

`ReplayRecorder` mantém cursor temporal, IDs `evt-NNNN`, durações padrão e agrupamento por ponto/rally. `appendPointToReplay` é o único adaptador do Match Engine. Antes do encerramento, o validator verifica versão, tipo, tempo, duração, ordem, ator, coordenadas, placar, IDs duplicados e presença de início/fim.

## Timeline e player

`t` é o início absoluto em milissegundos e `duration` é a janela visual. A timeline usa busca binária para localizar eventos. `ReplayPlayer` é independente de React e oferece `load`, `play`, `pause`, `stop`, `seek`, `setSpeed`, `stepForward`, `stepBackward` e `restart`, com velocidades 0,5x, 1x, 2x e 4x. Ele usa `requestAnimationFrame` e notifica assinantes; React não atualiza a árvore a cada cálculo visual.

## Renderer e interface

`Match2DRenderer` desenha quadra, rede/linhas, quatro jogadores, bola, nomes, placar, golpe atual e trajetória em Canvas 2D. Jogadores e bola usam interpolação linear; arcos e lobs somam altura senoidal. `ReplayPanel` fornece play/pause, reinício, evento anterior/próximo, velocidade, progresso, tempos, nomes, trajetória e exportação JSON.

## Integração com partida real

A feature flag é `VITE_ENABLE_REPLAY_ENGINE=true`. Com ela ativa, `LiveMatch` solicita gravação e a tela final oferece **Assistir replay experimental**. Com a flag ausente ou falsa, nenhum replay é criado e o fluxo anterior permanece intacto. A persistência desta fase é em memória; `ReplayStorage` também exporta/importa JSON e já expõe `save/load` para uma futura implementação nativa.

## Fixture e testes

`sampleReplay.js` contém exatamente 25 eventos: saque, devolução, lob, recuo, bandeja, voleio, smash, contatos, fim do ponto, placar, celebração e fim da partida.

Comandos executados:

- `npm run test:replay`: passou. Schema, `INVALID_ACTOR`, determinismo, player, renderer renderizável, export/import, partida real e 2.000 eventos passaram. Resultado atual: `ok: true`, 25 eventos, 9.210 ms após a revisão de timing da etapa 2.
- `npm run lint`: passou sem erros.
- `npm run build`: passou; 3.774 módulos transformados.
- `npm run typecheck`: falhou por erros preexistentes e amplos em carreiras, páginas, tipos de entidades e globais de testes. Nenhum erro foi reportado nos módulos de replay.
- `npm run app:dev -- --no-watch`: o processo Tauri permaneceu ativo até o timeout de 60 s sem emitir erro no segundo teste fora do sandbox. A inspeção visual interativa ainda deve ser feita manualmente.

No modo de desenvolvimento, `await window.PadelReplayEngineTest.run()` retorna:

```json
{
  "ok": true,
  "schemaValid": true,
  "invalidActor": true,
  "deterministic": true,
  "playerValid": true,
  "renderable": true,
  "performanceValid": true,
  "events": 25,
  "durationMs": 9210,
  "exportImportEqual": true
}
```

## Arquivos

Criados:

- `src/gameplay/replay/ReplaySchema.js`
- `src/gameplay/replay/ReplayValidator.js`
- `src/gameplay/replay/ReplayRecorder.js`
- `src/gameplay/replay/ReplayTimeline.js`
- `src/gameplay/replay/ReplayPlayer.js`
- `src/gameplay/replay/ReplayStorage.js`
- `src/gameplay/replay/Match2DRenderer.js`
- `src/gameplay/replay/ReplayEngineTest.js`
- `src/gameplay/replay/fixtures/sampleReplay.js`
- `src/components/matches/ReplayPanel.jsx`
- `scripts/test-replay-engine.mjs`
- `docs/REPLAY-ENGINE-2D-FOUNDATION.md`

Alterados:

- `src/engine/match/MatchEngine.js`
- `src/components/matches/LiveMatch.jsx`
- `src/components/matches/SimulationModal.jsx`
- `src/dev/registerDevTests.js`
- `package.json`

## Limitações e próximos passos

- As posições são uma projeção visual determinística do golpe e lado; o Match Engine atual não produz coordenadas físicas contínuas.
- Estados visuais são inferidos por evento/golpe, ainda sem sprites.
- A memória não sobrevive ao fechamento do app; a próxima etapa pode conectar `ReplayStorage` ao armazenamento Tauri.
- A validação Canvas automatizada é estrutural; screenshots e regressão visual devem entrar na próxima etapa.
- Próximos passos: persistência nativa, importação por seletor de arquivo, melhores pontos, câmera lenta por rally, estados visuais completos e renderer PixiJS opcional mantendo o mesmo JSON.
