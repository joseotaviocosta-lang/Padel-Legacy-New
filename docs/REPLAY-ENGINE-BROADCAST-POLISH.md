# Replay Engine — Broadcast Polish

## Escopo e arquitetura

Branch: `feature/replay-engine-broadcast-polish`.

Esta etapa interpreta somente Replay Events. Match Engine, resultado, eventos canônicos, trajetória, placar esportivo, progressão, ranking e torneios não foram alterados.

```text
Replay Events
  -> BroadcastDirector
     -> CameraDirector
     -> AudioDirector
     -> CrowdDirector
     -> ReplayHighlightManager
     -> MatchPresentationController
  -> BroadcastHUD + Match2DRenderer
```

Eventos consumidos: saque, golpe, movimento da bola, quique, parede, rede, winner/error, `point_end`, `score_update`, `game_end`, `set_end`, `match_end` e celebração. Informações não presentes — torneio, ranking, energia histórica, segundo saque, Golden Point e final/título — são omitidas.

## Presets e persistência

Presets em `BroadcastSettings`:

- `default`: câmera moderada, HUD completo e replays importantes;
- `compact`: câmera fixa, efeitos reduzidos e sem replay automático;
- `cinematic`: qualidade alta e replays frequentes;
- `performance`: câmera fixa, áudio/efeitos mínimos;
- `accessible`: alto contraste, legendas, câmera estável e movimento reduzido.

Mixer: geral, efeitos, torcida, árbitro, interface e ambiente, além de mute. Preferências são salvas no AppData Tauri em `preferences/replay-broadcast.json`; fora do Tauri, defaults ficam em memória.

## Placar e apresentação

`BroadcastHUD` exibe sobrenomes, símbolos das duplas, sets, games, pontos, duração e estado especial quando comprovado pelos dados do ponto. O placar é reconstruído exclusivamente a partir de `score_update`; seek e replay não antecipam nem duplicam placar.

A apresentação inclui introdução pulável, entrada com duplas/quadra, intervalo de set com estatísticas acumuladas reais e encerramento com placar, máxima registrada, rally mais longo e quantidade de destaques. Campos ausentes não aparecem.

## Câmera

`CameraDirector` usa cooldown mínimo de 1.800 ms e no máximo três cortes por rally. Saque, lob, smash, rally longo e celebração podem mudar entre quadra completa, atleta, bola e autozoom. `reducedMotion` ou câmera desativada força quadra completa. Todos os modos retornados pertencem à lista segura do renderer e o HUD permanece fora do transform da câmera.

## Áudio e torcida

`AudioDirector` mapeia eventos reais para raquete, quique, parede, rede, celebração, erro e árbitro. A variação é escolhida por hash determinístico de `seed + event_id`. Intensidade usa apenas velocidade/tipo disponíveis e volumes configurados.

Os sons são sintetizados com Web Audio API, sem arquivos externos. Um navegador sem Web Audio, contexto bloqueado, áudio mudo ou falha parcial continua silenciosamente. Créditos: `docs/AUDIO-ASSET-CREDITS.md`.

`CrowdDirector` possui `neutral`, `anticipation`, `applause`, `cheer`, `big_cheer`, `tension`, `disappointment` e `silence`. Rally, smash, winner, erro, set e partida controlam intensidade. O perfil padrão usa público médio, energia 0,65 e reverberação interna; metadados reais do replay podem sobrescrevê-lo.

## Replays automáticos e destaques

`ReplayHighlightManager` pontua somente dados reais: quantidade de golpes, importância, smash, parede dupla e velocidade. Modos: desligado, importantes e frequentes.

`MatchPresentationController` pausa o fluxo, volta ao início do mesmo ponto, toca a 0,5x, mostra `REPLAY` e retorna ao instante anterior. Não cria eventos nem recalcula placar. Eventos já processados não duplicam áudio/estatísticas.

O pacote de destaques referencia intervalos do replay original:

```json
{
  "match_id": "match-sample-v1",
  "highlight_ids": ["highlight-point-001"],
  "point_ranges": [{ "point_id": "point-001", "start": 950, "end": 9210, "score": 67 }],
  "generated_at": "2026-08-03T18:00:00.000Z"
}
```

Nenhum evento é copiado. A timeline existente continua navegável; próximos pontos/games e pontos importantes usam os mesmos intervalos.

## Acessibilidade e foco

Há legendas derivadas de eventos, alto contraste, movimento reduzido, câmera fixa, mixer independente, escala de texto/bola e modo sem flashes. O HUD e as legendas oferecem alternativa visual aos sons. Ao perder foco, o player pausa quando configurado e o contexto de áudio é suspenso, sem reexecutar o Match Engine.

## Testes

- `npm run test:replay-broadcast`: passou.
- `npm run test:replay-sprites`: passou.
- `npm run test:replay-gameplay`: passou.
- `npm run lint`: passou.
- `npm run build`: passou; 3.797 módulos.
- `npm run app:dev -- --no-watch`: permaneceu ativo durante 60 s, sem erro capturado, e foi encerrado pelo limite da automação. A inspeção visual completa no desktop permanece manual.

`window.PadelReplayBroadcastTest.run()`:

```json
{
  "ok": true,
  "scoreboardSynced": true,
  "audioSynced": true,
  "crowdContextual": true,
  "automaticReplayWorking": true,
  "highlightsGenerated": true,
  "cameraSafe": true,
  "preferencesPersisted": true,
  "fallbackWithoutAudio": true,
  "deterministic": true
}
```

## Arquivos desta etapa

Criados:

- `broadcast/BroadcastSettings.js`
- `broadcast/AudioDirector.js`
- `broadcast/CrowdDirector.js`
- `broadcast/CameraDirector.js`
- `broadcast/ReplayHighlightManager.js`
- `broadcast/BroadcastDirector.js`
- `broadcast/MatchPresentationController.js`
- `broadcast/ReplayBroadcastTest.js`
- `components/matches/BroadcastHUD.jsx`
- `scripts/test-replay-broadcast.mjs`
- `docs/AUDIO-ASSET-CREDITS.md`
- este documento

Alterados nesta etapa: `ReplayPanel.jsx`, `registerDevTests.js` e `package.json`. Mudanças de Match Engine, recorder, schema, player e renderer vistas no working tree pertencem às etapas anteriores.

## Limitações

- Web Audio procedural é funcional e autoral, mas ainda não substitui um pacote sonoro gravado profissionalmente.
- A fixture atual possui um ponto; resumos por game/set ficam mais ricos em replays completos.
- Break/set/match point dependem das flags/razões disponíveis no replay v1; não são inferidos como fato quando ausentes.
- Não há metadado canônico de final/título, então troféu e celebração de campeão não são exibidos indevidamente.
- A UI final de biblioteca de destaques será melhor tratada na integração com a carreira.

Próxima etapa recomendada: integração total do modo 2D com a carreira, persistência histórica de replays, biblioteca de partidas, destaques no Jornal e finais, mantendo todas as camadas esportivas intactas.
