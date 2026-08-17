# Hotfix — técnico durante as partidas

## Regressão 1: treinador silencioso em partida treino

`coach` chega a `SimulationModal`/`TournamentModal` por um efeito assíncrono
(`ensureStarterCoach`). `LiveMatch` grava o treinador no motor uma única vez,
dentro do lazy initializer de `useState(() => createMatch(..., { coach }))`.
Se o primeiro render de `LiveMatch` acontece antes desse carregamento
terminar, `liveCoach.coach` fica `null` para sempre — mesmo depois do prop
`coach` atualizar, o `useState` nunca roda de novo. O jogador via o nome do
treinador na tela (o prop `coach` chegava certo em outros lugares da UI),
mas o motor nunca observava um ponto sequer, então nenhuma orientação surgia
durante a partida inteira. `TournamentModal` não tinha o mesmo problema
porque a tela de torneio só libera o botão de jogar depois que o
carregamento inteiro (incluindo o treinador) termina; `SimulationModal` não
tinha essa trava.

Fix: `attachLiveCoach(state, coach)` (`src/engine/match/MatchEngine.js`) —
idempotente, só grava o treinador se o motor ainda não tinha um. `LiveMatch`
chama isso num `useEffect` que observa o prop `coach`, então quando o
carregamento atrasado termina, o motor "aprende" sobre o treinador a partir
daquele ponto em diante, sem reiniciar a partida.

## Regressão 2: estatísticas impossíveis ("22/22")

Já havia sido corrigida antes deste hotfix (ver histórico do repositório):
`opponent_targeting_player` agora usa só as últimas 12 ações com alvo
(`recentTargetShots`), exige amostra mínima de 8 e concentração mínima de
70% antes de falar em "adversário concentrando o jogo". Este hotfix adiciona
`test:live-coach-realism`, que joga dezenas de partidas reais e varre TODO
texto de orientação gerado à procura de numerador > denominador, denominador
acima da janela real, ou amostra abaixo do mínimo — para impedir que essa
classe de bug volte silenciosamente.

## Ajustes complementares

- **Qualidade do treinador**: `levelOf`/`coachLevel` (`LiveCoachObserver.js`,
  `CoachSuggestionEngine.js`) usavam tiers que não existem no catálogo real
  (`basico`, `nacional`). As tiers reais são `iniciante/regional/
  profissional/elite/lendario` (`src/lib/coaches.js: COACH_TIERS`) —
  `iniciante` e `profissional` caíam os dois no mesmo fallback, tornando um
  treinador profissional indistinguível de um iniciante. Corrigido para usar
  o vocabulário real de tiers.
- **Não repetir a mesma dica em seguida**: além do cooldown por padrão já
  existente (`minimumGamesBetweenSimilarSuggestions`), a mesma categoria
  como sugestão consecutiva agora exige o dobro do cooldown, e o motor
  prefere um padrão diferente do último mostrado quando outro estiver
  disponível — sem impedir que um problema realmente persistente volte a
  ser mencionado mais adiante.
- **Diagnóstico beta** (`coach_advice_generated`): registrado só em memória
  via `registerBetaDiagnostic` quando uma sugestão nova aparece na UI real
  (dedup por id da sugestão). Nunca grava no save.

## Testes

- `test:live-coach-practice` — reproduz a regressão 1 contra o motor real,
  prova o fix, caminho feliz, cenário sem treinador e render real do
  componente.
- `test:live-coach-tournament` — mesmos cenários para o pipeline de torneio.
- `test:live-coach-realism` — calibração (quantas partidas reais ficam sem
  nenhuma orientação, média por partida, variedade) e integridade
  estatística de toda orientação gerada.
