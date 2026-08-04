# Treinador em tempo real e adaptação dinâmica

## Estado anterior

O `MatchEngine` já possuía seed, pontos canônicos, traces de golpes, pressão, confiança, energia, fadiga, coordenação e mudanças táticas futuras. O replay registrava golpes, placar e táticas. Os intervalos seguros eram observáveis pela mudança de game/set. Não havia plano inicial congelado fora da tática, alvo explícito por golpe, analytics incremental ou histórico de decisões do treinador.

## Arquitetura

```text
RallyEngine (evento real e alvo)
  -> LiveMatchAnalytics (incremental)
  -> PatternChangeDetector (amostra e persistência)
  -> LiveCoachObserver (janela segura e cooldown)
  -> CoachSuggestionEngine (nível/especialidade)
  -> decisão explícita do jogador
  -> LiveTacticalAdjustmentManager
  -> activeTactics somente a partir do próximo ponto
  -> ReplayRecorder e relatório pós-jogo
```

O estado é serializável e faz parte da partida. Nenhum módulo consulta eventos futuros. Falhas de observação são capturadas em `liveCoach.errors`; a partida e os ajustes manuais continuam.

## Funcionalidade

- Janelas incrementais: três pontos, cinco pontos, último game, set atual e partida.
- Padrões iniciais: alvo concentrado, crescimento de lobs, erros de voleio, energia crítica e desvio do plano ofensivo.
- Confiança `low`, `medium` ou `high`, sempre acompanhada de amostra e persistência.
- Recomendações apenas em fim de game/set; durante rallies apenas dados são acumulados.
- Aplicar, aplicar parcialmente, ouvir parceiro ou manter o plano.
- Ajustes usam `effectiveFromPoint = currentPoint + 1` e snapshots de hashes anterior/novo.
- A IA adversária respeita cooldown e não reage a cada ponto.
- Sem treinador: HUD e métricas básicas continuam, sem recomendações especializadas.
- Eventos de replay: observação, sugestão, decisão, parceiro, ajuste e adaptação adversária.
- O relatório evita afirmar causalidade entre ajuste e resultado posterior.

## Persistência e compatibilidade

O schema de carreira v16 inicializa `live_coach_settings`, `live_coach_history`, `coach_match_observations` e `tactical_adjustment_history`. A migration é aditiva e idempotente. Partidas novas persistem o relatório e os snapshots; saves antigos recebem coleções vazias.

## Limites e riscos

O plano completo de saque/devolução ainda é representado pelos pesos suportados pelo motor atual. Direção geométrica detalhada e tempo real de permanência por zona dependem de ampliar o contrato esportivo, não apenas o visual do replay. Ajustes automáticos permanecem desativados por padrão; esta fase não altera atributos-base nem garante vantagem.

## Próxima fase

Adicionar editor pré-jogo de plano por fundamento, telemetria geométrica canônica e persistência agregada por treinador para calibração longitudinal.
