# Replay Engine 2D — Gameplay

## Estado inicial e decisão arquitetural

A fundação v1 estava completa: schema versionado, eventos ordenados, recorder, validator, player, storage, fixture, renderer Canvas, determinismo e integração experimental. Esta etapa evolui a apresentação sem reescrever o replay e sem alterar decisões do Match Engine.

O cálculo visual saiu do Canvas e passou para `ReplayScene`. Assim, o fluxo permanece unidirecional:

```text
eventos canônicos -> ReplayScene determinística -> Match2DRenderer -> Canvas
```

O renderer nunca devolve posição, resultado ou estado ao Match Engine. Aproximações táticas e correções de contato existem apenas na cena transitória.

## Quadra e coordenadas

`ReplayVisualConfig` centraliza quadra 10 × 20 m, rede em `y=10`, linhas de saque, paredes e padding. `Match2DRenderer.worldToScreen` e `screenToWorld` aplicam resolução e câmera sem gravar pixels no replay. A quadra mostra perímetro, rede, quadrados de serviço, paredes laterais/de fundo, aberturas laterais e lados A/B.

## Jogadores, movimento e golpes

Posições ausentes em replays antigos são derivadas de lado/equipe. O validator impede jogadores inicialmente a menos de 0,4 m. Perfis `walk`, `shuffle`, `run`, `sprint`, `recover` e `backpedal` usam easing determinístico com destino exato. O marcador possui frente orientada ao movimento/alvo.

Estados visuais implementados ou aceitos pela cena: `ready`, `moving`, `serving`, `forehand`, `backhand`, `volley`, `lob`, `bandeja`, `smash`, `celebrating` e `frustrated`. Escala, contorno, direção e rótulo distinguem os golpes. Contatos muito distantes produzem warning do validator; a cena aceita somente aproximação visual limitada.

## Bola, parede e rede

Perfis determinísticos diferenciam saque, lob, voleio, bandeja, smash e arco comum. O `z` do evento é preservado; quando ausente, um arco secundário é derivado do golpe. Velocidades têm fallback por tipo.

`bounce`, `wall_contact`, `side_wall_contact`, `back_wall_contact`, `double_wall_contact` e `net_contact` produzem compressão e marca de impacto. A trajetória seguinte continua vindo do próximo evento; não há física livre. A tabela central usa 550 ms no saque, 900 ms no lob, 280 ms no voleio, 240 ms no smash, 70 ms no impacto de parede, 900 ms no fim do ponto e 400 ms na troca de placar.

## Câmera, HUD e efeitos

Modos disponíveis:

- `full_court`: quadra completa;
- `follow_ball`: acompanha a bola;
- `follow_player`: acompanha o atleta selecionado;
- `auto`: zoom discreto em voleios/smashes.

A câmera interpola o foco e pode ser desligada ou neutralizada por movimento reduzido. O HUD permanece fixo e exibe duplas, sets, games, pontos, golpe, velocidade e golpes no rally. O placar só muda em `score_update`.

Efeitos opcionais: rastro, impactos/quiques, rótulos, nomes, aumento de bola/jogadores, alto contraste e movimento reduzido. Equipes também são identificadas por posição, texto e marcadores, não apenas cor. A janela perde foco e pausa o player.

## Narração e controles

`ReplayNarration` converte somente eventos existentes em frases por saque, golpe, contato, desfecho e placar. Não usa aleatoriedade. O painel atualiza a frase conforme a timeline e limita atualizações React a aproximadamente 10 Hz; Canvas continua em `requestAnimationFrame`.

Controles: play/pause, reiniciar ponto, evento anterior/próximo, próximo ponto, próximo game, próximo ponto importante, seek e 0,5x/1x/1,5x/2x/4x. Pontos importantes incluem placar em 40, fim de set/match, tiebreak sinalizado, rally longo e smash vencedor. Repetir/seek nunca altera placar ou replay.

## Modos de partida

Antes da partida treino o usuário escolhe:

- **Texto**: fluxo anterior;
- **2D animado**: cada ponto recém-produzido é tocado no Canvas durante a partida;
- **Resultado rápido**: conclui a simulação sem intervalos.

O replay final continua disponível pelo botão experimental. A feature flag permanece `VITE_ENABLE_REPLAY_ENGINE=true`; desativada, o jogo textual segue normal.

## Preferências

`ReplayPreferences` salva velocidade, câmera e acessibilidade no `AppData` Tauri em `preferences/replay-2d.json`. No navegador sem Tauri mantém defaults em memória, coerente com a política offline do projeto e sem `localStorage`.

## Compatibilidade

Replays sem posição inicial, `z`, velocidade, spin, orientação ou estado continuam aceitos. `ReplayScene` aplica fallbacks visuais determinísticos. O schema v1 não foi substituído; somente novos tipos detalhados de contato foram acrescentados à lista aceita.

## Testes e performance

- `npm run test:replay`: passou (fundação, determinismo, 2.000 eventos, export/import).
- `npm run test:replay-gameplay`: passou: saque, parede, lob, smash, quatro câmeras, narrativa, compatibilidade antiga, pontos importantes e determinismo.
- `npm run lint`: passou.
- `npm run build`: passou, 3.779 módulos transformados.
- `npm run app:dev -- --no-watch`: permaneceu ativo por 60 s sem erro capturado e foi encerrado pelo timeout. A validação visual completa na janela Tauri permanece manual.

`window.PadelReplayGameplayTest.run()` retorna, no ambiente desta execução:

```json
{
  "ok": true,
  "serveRendered": true,
  "wallContactRendered": true,
  "lobRendered": true,
  "smashRendered": true,
  "cameraModes": 4,
  "narrationSynced": true,
  "deterministic": true,
  "legacyCompatible": true,
  "importantPoints": true,
  "averageFps": 28387
}
```

`averageFps` é throughput da resolução de cena em Node, não FPS real de pintura. O valor serve apenas para detectar regressões grosseiras; FPS visual deve ser medido no Tauri.

## Arquivos desta etapa

Criados:

- `ReplayVisualConfig.js`
- `ReplayScene.js`
- `ReplayNarration.js`
- `ReplayImportantPoints.js`
- `ReplayPreferences.js`
- `ReplayGameplayTest.js`
- `scripts/test-replay-gameplay.mjs`
- este documento

Alterados:

- `Match2DRenderer.js`
- `ReplayPlayer.js`
- `ReplaySchema.js`
- `ReplayRecorder.js`
- `ReplayValidator.js`
- `ReplayPanel.jsx`
- `LiveMatch.jsx`
- `SimulationModal.jsx`
- `registerDevTests.js`
- `package.json`

## Limitações e próxima fase

- O Match Engine ainda não fornece coordenadas contínuas para todos os atletas; movimentos intermediários são apenas projeções visuais.
- O filtro de pontos importantes usa os dados disponíveis no replay v1; break/set/match point ficarão mais precisos se futuros eventos trouxerem flags canônicas.
- Replay imediato automático em 0,5x não interrompe sozinho a partida; os controles permitem reiniciar o ponto sem gerar novo replay.
- Não foi adicionado áudio porque o projeto não possui barramento/ativos de áudio de partida. Isso evita dependência e risco nesta fase.
- A próxima fase recomendada é sprites 2D, identidade dos atletas, animação quadro a quadro, áudio próprio/licenciado e regressão visual por screenshots, mantendo ReplayScene e Match Engine intactos.
