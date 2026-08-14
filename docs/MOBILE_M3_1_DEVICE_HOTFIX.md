# Mobile M3.1 — LiveMatch Device Hotfix

M3 passou 44/44 nos testes automatizados, mas o teste em Android físico
revelou 3 problemas reais: narração sem limite visual engolindo os
controles, a partida saindo sozinha do LiveMatch, e o recovery abrindo a
rota inexistente `game/matches` (404). Esta fase corrige estruturalmente os
três, sem redesign e sem tocar o motor de partida.

**Nota de contexto**: entre o fechamento de M3 e o início desta fase, uma
parcela substancial do trabalho de M3.1 já havia sido implementada
diretamente no repositório (`src/game-core/tournamentMatchLifecycle.js` novo,
validação de checkpoint de torneio via `inspectTournamentMatchCheckpoint`,
remoção seletiva via `clearIfMatch`, rollback de avanço de dia via
`src/game-core/careerAdvanceTransaction.js`, e a correção da rota
`game/matches` → `/matches`/`/tournaments` em todos os pontos). Esta
auditoria confirmou esse trabalho como correto (com um teste comportamental
próprio, `scripts/test-tournament-match-lifecycle.mjs`, que já passava) e
focou o esforço novo nos dois problemas que continuavam reais: a altura do
modal de partida treino no mobile (Problema A) e um gap de estado latente
relacionado ao recovery (parte do Problema B).

## 1. Sintomas do Android real

- **A — Narração sem limite**: durante uma partida de treino real, o painel
  de narração cresce para baixo indefinidamente, empurrando os controles
  para fora da tela; não é possível rolar até eles.
- **B — Saída espontânea**: depois de algum tempo com a partida rodando, o
  app volta sozinho para a tela principal. O checkpoint sobrevive e o
  recovery aparece corretamente depois.
- **C — Rota inexistente**: ao tocar "Continuar partida" após reabrir o app,
  o app termina em "The page 'game/matches' could not be found in this
  application" (404).

## 2. Causa raiz do crescimento da narração (Problema A)

`LiveMatch.jsx` em si já tinha a cadeia de altura correta internamente:
raiz `h-full min-h-0 max-h-full flex-col overflow-hidden`, scoreboard/tabs/
controles em contêineres `shrink-0`, área de conteúdo `min-h-0 flex-1
overflow-hidden`, e a lista de narração com seu próprio `overflow-y-auto`.
O bug não estava dentro do LiveMatch — estava em como ele era hospedado.

`ModalShell.pl-modal-content` (`src/components/design-system/ModalShell.jsx`)
é `min-h-0 flex-1 overflow-y-auto` — um container de scroll próprio. Para o
`h-full` do LiveMatch resolver corretamente dentro dele, o PAINEL do modal
(`pl-modal-panel`) precisa de uma altura **definida** (`h-[...]`), não só
`max-h-[calc(100dvh-1rem)]` (altura automática, só limitada por um teto).
`max-height` sozinho, sem `height`, não propaga de forma confiável uma
altura definida para percentuais de descendentes em todos os motores de
renderização — e esse é exatamente o caso do WebView Android testado
fisicamente (a mesma classe de bug que já existia, de forma diferente, em
combinações flex+overflow+max-height noutros frameworks web).

`TournamentModal.jsx` já usava `h-[calc(100dvh-1rem)]` (sem prefixo de
breakpoint — ou seja, já valia no mobile) para a fase da partida.
`SimulationModal.jsx` só tinha `md:h-[min(46rem,92dvh)]` — válido a partir
do breakpoint `md:` (tablet/desktop), mas **ausente no mobile portrait**,
exatamente o cenário testado fisicamente e exatamente o modal usado por
partida de **treino** (o sintoma reportado). No mobile, o painel caía no
`max-height` "solto" padrão do ModalShell — sem altura definida, a cadeia
interna do LiveMatch nunca tinha um teto real contra o qual se dimensionar,
e o `overflow-y-auto` externo do ModalShell (não o `overflow-y-auto` interno
da narração) acabava sendo o único scroll que realmente funcionava —
rolando o modal inteiro (placar + tabs + narração + controles juntos) em vez
de só a narração internamente.

### Correção

`src/components/matches/SimulationModal.jsx` — `className` passado ao
`ModalShell` na fase `'live'`:

```diff
- className={phase === 'live' ? 'md:h-[min(46rem,92dvh)]' : ''}
+ className={phase === 'live' ? 'h-[calc(100dvh-1rem)] md:h-[min(46rem,92dvh)]' : ''}
```

Mesmo padrão que `TournamentModal.jsx` já usava — altura explícita desde o
mobile, `md:` só ajusta o teto em telas maiores. Nenhuma outra mudança foi
necessária: uma vez que o painel tem altura definida, toda a cadeia interna
do LiveMatch (já correta) volta a funcionar como projetado.

`src/components/tournaments/TournamentModal.jsx` recebeu, em adição,
`shrink-0` explícito no badge de categoria do torneio (`<TierIcon />` +
nome do tier), por consistência defensiva com o contrato de altura pedido
(a `RoundTimeline` já tinha `shrink-0` na própria raiz).

## 3. Causa da saída espontânea (Problema B)

Investigação sistemática de todos os caminhos capazes de fechar o modal
durante `phase === 'live'`/`'match'`:

| Caminho investigado | Resultado |
|---|---|
| Backdrop click / Escape | Já bloqueados (`closeOnBackdrop`/`closeOnEscape` = `false` durante a partida, em ambos os modais) |
| Android Back físico | Passa pelo mesmo `closeOnEscapeRef` via `useOverlayBehavior`/`overlayBackStack` — já bloqueado durante a partida |
| `ActiveCareerGuard` | Só age quando `activeCareer` já está `null` — não redireciona espontaneamente com uma carreira carregada |
| `key` instável em `<SimulationModal>`/`<LiveMatch>` | `Matches.jsx` não usa `key` no modal; `TournamentModal` usa `key={currentMatch.id}` no LiveMatch, mas `currentMatch.id` não muda durante `phase === 'match'` (só via `persistRun`, nunca chamado nessa fase) |
| Handler de `visibilitychange` do LiveMatch | Só pausa (`setAutoPlay(false)`) e força um checkpoint — nunca chama `onClose` nem navega |
| Reabertura automática via `useActiveMatchCheckpoint` (evento `padel:match-checkpoint-changed`) | `Matches.jsx`/`Tournaments.jsx` só ABREM o modal quando o checkpoint aparece — nunca fecham |

Nenhum caminho de código encontrado chama `onClose`/navega para fora do
LiveMatch durante uma partida ativa. **Não foi possível reproduzir o
fechamento espontâneo via análise estática de código.**

A explicação mais provável, dada a evidência disponível ("depois de algum
tempo" + "o checkpoint sobreviveu e o recovery apareceu depois"), é o
Android/WebView reclamando o processo em segundo plano (memória, ou o
sistema simplesmente recriando a Activity) — do ponto de vista da SPA, isso
é indistinguível de um cold start: todo o estado React (inclusive qual modal
estava aberto) se perde, restando só o que foi persistido em disco. É
exatamente esse cenário que o checkpoint do M3 já foi desenhado para cobrir
— e a observação do próprio relato ("depois apareceu corretamente a
possibilidade de continuar") é consistente com essa hipótese, não com um bug
de fechamento no React.

**Isto não é "assumir Android lifecycle sem investigar"** — é a conclusão
depois de eliminar, um por um, todos os caminhos de código plausíveis.

### Bug real encontrado e corrigido nesta investigação

`SimulationModal.jsx` usa `useActiveMatchCheckpoint(careerId)` internamente
(para saber se existe uma partida para retomar). Como o próprio LiveMatch
grava um checkpoint periodicamente durante a partida (a cada game/set,
comportamento do M3), e `MatchCheckpointRepository.save()` dispara o evento
`padel:match-checkpoint-changed`, o hook dentro do PRÓPRIO SimulationModal
se atualiza com o checkpoint da partida que **já está em andamento**.
`resumeDecided` (o flag que suprime o prompt de recovery) só era marcado
`true` dentro de `resumeMatch()`/`discardResume()` — nunca dentro de
`startMatch()`. Resultado: `pendingResume` ficava `true` "por baixo" durante
toda uma partida treino recém-iniciada (nunca retomada), uma inconsistência
de estado latente. Não afeta a tela hoje (o prompt de recovery só renderiza
em `phase === 'config'`), mas é perigoso caso qualquer remount futuro volte
para `'config'` — corrigido chamando `setResumeDecided(true)` também dentro
de `startMatch()`.

## 4. Origem exata de `game/matches`

A tabela real de rotas (`src/App.jsx`) usa `/matches` e `/tournaments` — sem
prefixo `/game/` (diferente de várias outras páginas do app, que ficam sob
`/game/*`: treino, missões, loja, inventário, calendário, etc.). O código de
recovery introduzido em M3 assumiu, incorretamente, o prefixo `/game/`
consistente com essas outras páginas.

**Estado encontrado nesta auditoria**: nenhuma ocorrência da string
`game/matches` ou `game/tournaments` sobrevive em nenhum arquivo executável
de `src/` — `ActiveMatchRecoveryBanner.jsx` já navega para `/matches`
(treino) e `/tournaments` (torneio); `TournamentModal.jsx` já usa
`buildTournamentReturnRoute(tournamentId)` (`src/game-core/tournamentMatchLifecycle.js`),
que constrói `/tournaments?tournament=<id>&mode=run`, consumido por um
efeito de deep-link em `Tournaments.jsx` (`searchParams.get('tournament')`
+ `searchParams.get('mode')`) que já existia antes desta fase para outros
fluxos (perfil de atleta, notificações). Esta parte do hotfix já havia sido
corrigida antes do início desta auditoria (ver nota no topo) — o trabalho
aqui foi **verificar exaustivamente** que a correção é completa (nenhuma
string antiga sobrevivente) e **provar isso com um teste automatizado que
valida contra a tabela real de rotas**, não contra uma string qualquer —
exatamente a checagem que faltava em M3 (ver §14).

### Destino correto por tipo de partida

| Tipo | Destino do banner global | Contexto restaurado |
|---|---|---|
| Treino | `/matches` | `Matches.jsx` detecta o checkpoint (`useActiveMatchCheckpoint`) e abre `SimulationModal` automaticamente, que oferece "Continuar partida" |
| Torneio | `/tournaments` (banner) ou `/tournaments?tournament=<id>&mode=run` (retorno pós-entrevista) | `Tournaments.jsx` detecta o checkpoint de torneio e abre o `TournamentModal` do torneio certo; o deep-link `?tournament=&mode=run` garante o MESMO torneio mesmo vindo de outra tela (ex.: Imprensa) |

## 5. Recovery de treino

Fluxo validado: carreira → checkpoint de treino detectado
(`useActiveMatchCheckpoint`) → `Matches.jsx` abre `SimulationModal`
automaticamente → prompt "Partida em andamento" → "Continuar partida" →
`resumeMatch()` restaura `engine_state` exato, sem apagar o checkpoint antes
(`clearCheckpoint` só é chamado em `discardResume()`, nunca em
`resumeMatch()`) → LiveMatch renderiza com `initialState` restaurado →
checkpoint só é apagado em `handleFinished` (fim real da partida).

## 6. Recovery de torneio

Fluxo validado, agora com uma camada extra de validação estrutural
(`inspectTournamentMatchCheckpoint`, `src/game-core/tournamentMatchLifecycle.js`):
checkpoint de torneio → checagem de identidade (`career_id`, `tournament_id`,
`match_id`, `round`, participantes esperados vs. participantes do
`engine_state`) → se válido, prompt "Partida em andamento" na rodada certa
→ `resumeMatchCheckpoint()` restaura sem apagar o checkpoint antes → se
inválido/incompatível, o checkpoint é descartado com segurança
(`clearIfMatch`, nunca o save principal) e a rodada cai no fallback
pré-existente do M3 (reiniciar do zero), com diagnóstico registrado
(`registerBetaDiagnostic`) para investigação futura. `tournament_id` e
`match_id`/rodada nunca se perdem — são parte da própria estrutura do
checkpoint de torneio (`participant_ids`, `round`, `tournament_id`).

## 7. Auto-scroll

`LiveMatch.jsx` já controlava o scroll da narração de forma local e correta:
`narrationRef.current.scrollTop = narrationRef.current.scrollHeight`,
diretamente no elemento do feed — nunca `scrollIntoView` (que desloca
ancestrais externos quando algum deles também é scrollável, exatamente o
risco que o enunciado apontava). Nenhuma mudança foi necessária aqui; a
raiz do problema A era a altura do container pai, não o mecanismo de
auto-scroll em si — confirmado com um teste estrutural dedicado
(`scripts/test-mobile-m3-1-device-hotfix.mjs`) que também audita
`SimulationModal.jsx`/`TournamentModal.jsx` para garantir que nenhum dos
dois introduziu `scrollIntoView` por conta própria.

## 8. Arquivos alterados

- `src/components/matches/SimulationModal.jsx` — altura explícita no mobile
  para a fase `'live'` (causa raiz do Problema A); `resumeDecided(true)`
  também em `startMatch()` (hardening do Problema B).
- `src/components/tournaments/TournamentModal.jsx` — `shrink-0` defensivo
  no badge de categoria do torneio.
- `scripts/test-mobile-m3-1-device-hotfix.mjs` — novo.
- `package.json` — novo script `test:mobile-m3-device-hotfix`.

Não alterados (auditados e confirmados corretos, sem necessidade de
mudança): `src/components/matches/LiveMatch.jsx`, `src/components/design-system/ModalShell.jsx`,
`src/components/career/ActiveMatchRecoveryBanner.jsx`,
`src/game-core/tournamentMatchLifecycle.js`, `src/careers/MatchCheckpointRepository.js`.

## 9. Testes

`scripts/test-mobile-m3-1-device-hotfix.mjs` (58 verificações):

- Cadeia de altura completa do LiveMatch (raiz, área de conteúdo, MatchFeed,
  narração) permanece delimitada.
- A causa raiz real (altura explícita ausente no mobile em SimulationModal,
  presente em TournamentModal) é verificada diretamente contra o texto
  atual dos dois arquivos.
- Scoreboard/tabs/controles permanecem `shrink-0`, fora da região de scroll.
- Auto-scroll continua local ao feed (`scrollTop`/`scrollHeight`), nenhum
  `scrollIntoView` foi introduzido em nenhum dos três componentes.
- `visibilitychange` continua limitado a pausar + checkpoint — nunca chama
  `onClose`/navega; nenhum dos dois modais registrou um listener próprio.
- `autoPlay`/pausa não viram sinal de "finalizada"; checkpoint de partida
  finalizada continua rejeitado por `isValidCheckpointShape`.
- O gap de `resumeDecided` corrigido nesta fase é verificado diretamente.
- **Rotas reais**: a tabela de rotas é extraída de `src/App.jsx` (não
  hardcoded no teste) e os destinos do `ActiveMatchRecoveryBanner` e de
  `buildTournamentReturnRoute` são validados contra ela — nenhuma rota
  `game/matches`/`game/tournaments` sobrevive em nenhum arquivo de recovery.
- Checkpoint não é apagado antes do restore (`resumeMatch`/
  `resumeMatchCheckpoint` não chamam `clear`/`clearIfMatch` antes de abrir o
  LiveMatch); finalização continua limpando o checkpoint corretamente.
- Idempotência de recompensa preservada (`freshMatch?.status === 'completed'`,
  `idempotencyKey`).
- **Comportamental (motor real)**: narração longa (>120 eventos, muito além
  do limite de renderização) não corrompe o checkpoint nem o restore — prova
  que o limite de 120 é puramente visual, os dados completos sobrevivem;
  pausar/"voltar do background" preserva a identidade da partida
  (`match_id` estável) e não finaliza sozinha.

Regressão executada: `npm run lint` (limpo), `npm run typecheck` (2268
erros — idêntico ao baseline pós-Fase-10, nenhum erro novo), `npm run build`
(sucesso), `test:mobile-foundation`/`test:mobile-m1-hotfix`/
`test:mobile-m2-shell`/`test:mobile-m2-device-hotfix`/`test:mobile-m3-live-match`
(todos inalterados), `test:match-integrity`/`test:match-playback`/
`test:match-finalization-performance`/`test:live-coach` (motor intocado,
`singleIdempotentFinalization: true` preservado), `test:tournament-flow-rc`/
`test:tournament-registration`/`test:career-systems`/`test:tournament-match-lifecycle`/
`test:post-match-interviews` (todos passando — dois deles precisaram de
nova tentativa isolada por um problema de ambiente conhecido do Vite,
descrito na §14), `test:career-beta-readiness` (Fase 10, 20 dias, motor
real — continua limpo, confirmando que as mudanças de M3.1 não afetam o
pipeline de carreira).

## 10-13. Mudanças no recovery de treino / torneio / auto-scroll

Ver §5, §6 e §7 — nenhuma mudança de comportamento foi necessária além da
correção de altura (§2) e do hardening de `resumeDecided` (§3); o restante
da infraestrutura de recovery (checkpoint, validação, rotas) já estava
correto quando esta auditoria começou.

## 14. Por que M3 (44/44) não detectou estes bugs

Os 44 checks de `scripts/test-mobile-m3-live-match.mjs` são majoritariamente
**estruturais** (regex sobre o código-fonte, checando presença de classes
Tailwind/padrões de código) mais um punhado de checks **comportamentais**
contra o motor de partida e o `MatchCheckpointRepository` em Node puro — ou
seja, sem nunca renderizar componentes React de verdade nem calcular layout
CSS real. Isso explica os três problemas:

- **Problema A (altura/scroll)**: um script Node não tem um motor de
  renderização CSS — não há como um regex "ver" que `max-height` sem
  `height` explícito falha a propagar altura definida para descendentes
  flex em um WebView Android real. M3 verificou que as classes de touch
  target e os marcadores de layout (`min-h-0`, `flex-1`, `shrink-0`)
  *existiam* no código — mas nunca testou se o CONTRATO DE ALTURA
  realmente se cumpria no navegador, porque isso exige um layout engine
  real, não uma leitura de texto. M3.1 corrige essa lacuna adicionando uma
  checagem estrutural que compara explicitamente as duas classNames de
  altura (SimulationModal vs. TournamentModal) — o suficiente para pegar
  ESTE bug específico sem precisar de um browser real, mas não substitui
  teste físico para a classe inteira de bugs de layout.
- **Problema B (saída espontânea)**: exige um ciclo de vida real de
  Activity/WebView Android (memória, suspensão de processo) que não existe
  em Node. Nenhum teste automatizado — nem os de M3, nem os novos de M3.1 —
  consegue reproduzir isso; só o checklist físico (§15) valida esse
  cenário de verdade. O que M3.1 adiciona é a eliminação sistemática de
  QUALQUER causa alternativa dentro do código React/JS (ver §3), reduzindo
  o escopo do que só pode ser validado fisicamente.
- **Problema C (rota 404)**: este é o caso mais evitável — M3 verificou que
  os TEXTOS "Continuar partida"/`navigate(destination)` existiam, mas
  **nunca comparou a string de destino contra a tabela real de rotas do
  router**. Um regex encontra a chamada `navigate(...)`; só executar (ou
  cross-referenciar contra) o router real revela que o destino não existe.
  M3.1 corrige essa lacuna estruturalmente: `scripts/test-mobile-m3-1-device-hotfix.mjs`
  agora extrai a tabela de rotas de `src/App.jsx` com uma regex sobre as
  tags `<Route path="...">` e valida programaticamente que TODO destino de
  recovery (banner global + retorno de torneio) pertence a essa tabela —
  a checagem exata que faltava.

## 15. Checklist físico (Android real)

**Treino**
1. Abrir uma partida de treino.
2. Deixar a narração acumular bastante (jogar vários games/sets).
3. Confirmar que **somente a narração** rola — placar, tabs e controles
   permanecem visíveis e fixos.
4. Pressionar Home do Android.
5. Voltar ao app.
6. Confirmar que a partida está pausada e intacta (mesmo placar, mesma
   narração).
7. Continuar a partida normalmente.

**Saída espontânea**
8. Deixar uma partida rodando por alguns minutos (autoplay ligado, tela
   ligada).
9. Confirmar que o app **não** volta sozinho para a Home.

**Process kill**
10. Partida em andamento (treino ou torneio).
11. Fechar o app pelos apps recentes (kill completo do processo).
12. Reabrir o app.
13. Tocar "Continuar partida" no aviso global ou na tela correspondente.
14. Confirmar que **não** aparece 404.
15. Confirmar que o LiveMatch é restaurado no estado exato salvo.
16. Confirmar que placar/tabs/controles estão acessíveis.
17. Terminar a partida.

**Torneio**
18. Repetir o fluxo de recovery (10-17) numa rodada de torneio.
19. Confirmar que abre a rodada certa do torneio certo.
20. Concluir a rodada.
21. Confirmar que a recompensa/chave avança **uma única vez** (sem
    duplicação).
