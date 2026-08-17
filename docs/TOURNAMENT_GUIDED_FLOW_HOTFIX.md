# Hotfix UX — Tournament guided flow

Dois problemas reais de UX/navegação encontrados por QA no fluxo de torneio.
Este hotfix é sobre navegação, deep links, CTA contextual e prioridade de
ações — nenhuma mudança em Match Engine, ranking, bracket, regras de
inscrição, datas de torneio, entrevistas em treino, saves ou engine de
calendário.

## Problema 1 — CTA "Dar entrevista" não navegava

### Causa raiz

`ModalShell`/`useOverlayBehavior` (usado por `TournamentModal` e por todo
overlay do app) empurra uma entrada de histórico quando abre
(`registerOverlay`, `src/components/design-system/overlayBackStack.js`) —
estratégia padrão de SPA em WebView para o botão físico "Voltar" do Android
fechar o overlay em vez de sair do app. Quando o overlay desmonta,
`unregisterOverlay` **sempre** chamava `history.back()` para equilibrar essa
entrada, **mesmo quando o desmonte aconteceu porque algo dentro do overlay
já tinha navegado de verdade para outra rota**.

Era exatamente o caso do CTA: `openPostMatchInterview()` chama
`navigate('/press?...')` sem fechar o `TournamentModal` primeiro (item 4 do
enunciado: "não fechar primeiro e perder estado antes da navegação" — o
handler precisa do `lastResult`/`tournament` ainda em escopo). O `navigate()`
troca a rota, `Tournaments`/`TournamentModal` desmontam como consequência
natural da troca de rota, e o cleanup de `useOverlayBehavior` chama
`unregisterOverlay` → `history.back()` → **desfaz a navegação que acabou de
acontecer**, devolvendo o jogador para `/tournaments`. Por isso "o clique
navega, mas o jogador permanece na página do torneio."

### Correção

`unregisterOverlay` (`overlayBackStack.js`) só chama `history.back()` se a
entrada de histórico do overlay ainda for a atual (`window.history.state?.
plOverlay === id`). Se uma navegação real já aconteceu por cima dela (o
`state` mudou para o que o React Router gravou), a compensação é pulada —
a navegação real nunca é desfeita. Fechamento normal (X, backdrop, Escape,
Android Back físico) continua funcionando exatamente como antes; a correção
só evita compensar uma entrada que já foi "sobrescrita" por uma navegação
legítima.

Esta é uma correção de infraestrutura compartilhada — protege **qualquer**
CTA dentro de **qualquer** `ModalShell` que navegue sem fechar primeiro, não
só o de entrevista.

### Deep link reaproveitado, não recriado

`openPostMatchInterview` e a construção da `CareerMessage` da entrevista
(`buildRoundMediaOperations`) agora chamam o mesmo builder
(`buildInterviewRoute`, novo em `src/lib/tournamentNextAction.js`) —
`/press?tab=interviews&interview=<id>&source=<sourceId>&returnTo=<rota>`.
Não foi criado um segundo parser: a identidade da entrevista continua vindo
de `postMatchInterviewIdentity` (`src/lib/postMatchInterview.js`, já
existente), e o consumo em `Press.jsx` (aba/tab, seleção da entrevista pelo
id/source, `closeInterview()` navegando para `returnTo` ao concluir) já
estava correto e não precisou mudar.

## Problema 2 — dia de torneio sem condução

### Fonte canônica nova

`getTournamentNextAction`/`describeCalendarBlock`
(`src/lib/tournamentNextAction.js`) — pura, recebe dados já carregados por
quem chama (nunca busca nada sozinha, sem polling), reaproveita
`getTournamentRunPhase`/`getCurrentTournamentMatch`
(`TournamentRunManager.js`, já eram a fonte de fase usada pelo próprio
`TournamentModal`) em vez de recalcular fase de rodada do zero.

Prioridade implementada (determinística, sem pontuação nova):

1. Partida ativa interrompida → `continue_match`
2. Entrevista pós-jogo pendente e acionável (sempre opcional — nunca
   bloqueia nada) → `interview`
3. Partida de torneio disponível hoje (ou atrasada) → `play_match`
4. Próxima rodada futura → `advance_to_round`
5. Torneio encerrado → `tournament_complete`

### Onde foi conectada

- **`CareerDayControl.jsx`** (botão global "Avançar", item 10/11/28): o
  toast de bloqueio agora usa `describeCalendarBlock(error.blockingEvent)` —
  mesmo `blockingEvent` que `canAdvanceDay` já retornava, só a mensagem virou
  acionável ("Você precisa disputar Quartas de Final de Los Angeles Cup antes
  de avançar o dia" + botão "Ir para o torneio"). A regra de bloqueio em si
  (`canAdvanceDay`, `calendarSystem.js`) não foi tocada.
- **`CareerHub.jsx`** (Home, item 9): `ActiveTournamentBanner` e o card de
  próximo evento (`buildNextEvent`) trocaram `<Link to="/tournaments">`
  genérico por `buildTournamentPlayRoute(tournamentId)` — abre direto o
  torneio certo, não uma lista para o jogador procurar. Eyebrow vira "Dia de
  torneio" quando a partida é hoje (item 27). A hierarquia de prioridade que
  já existia em `CareerHub.jsx` (`ActiveMatchRecoveryBanner` > entrevista via
  `buildPriorityActions` > `ActiveTournamentBanner`) já era essencialmente
  correta — não foi redesenhada, só corrigido o destino do CTA.
- **`TournamentModal.jsx`** (item 17/18/19/20): a tela de resultado de rodada
  (`round_result`) agora distingue rodada seguinte hoje vs. futuro — hoje
  mostra `[Jogar {rodada} agora]` (transição direta de fase, sem fechar e
  reabrir o torneio); no futuro mantém `[Continuar no torneio]`. A entrevista
  continua como CTA primário (é a prioridade 2, acima de "jogar hoje"),
  nunca dois CTAs "iguais" competindo.

### Não conectado nesta fase (documentado, não bloqueante)

Calendário (`CalendarPage.jsx`) e o sino de notificações já tinham seus
próprios mecanismos de deep link corretos (`resolveNotificationDestination`,
validado por `test:notification-deep-links`, continua passando) — não foram
migrados para `getTournamentNextAction` nesta fase por não haver um bug
concreto relatado ali e para não arriscar uma refatoração ampla sem QA
específico. `getTournamentNextAction` está pronta para ser reaproveitada ali
quando isso for priorizado.

## Realismo e regressão

- `canAdvanceDay` continua bloqueando exatamente as mesmas situações de
  antes — só a mensagem mudou.
- Nenhuma dica/entrevista nova foi inventada: `getTournamentNextAction`
  nunca sintetiza uma entrevista — só repassa o que o caller já encontrou
  via `getPendingInterviews`.
- `test:tournament-guided-flow` prova, contra o pipeline real (`TournamentRunManager`,
  `postMatchInterviewIdentity`, `getPendingInterviews`, `canAdvanceDay`,
  motor real `createMatch`/`playPoint`), que a entrevista gerada pelo
  round-transition é a MESMA que `getPendingInterviews` encontra pela URL
  canônica, que o bloqueio de dia aponta para o torneio certo, e que a QF
  abre e joga o primeiro ponto de verdade.
- `test:overlay-back-stack` prova via fault injection (window/history fake,
  sem jsdom) que a causa raiz do Problema 1 está corrigida, sem quebrar
  fechamento normal nem Android Back físico.

## Arquivos modificados

- `src/components/design-system/overlayBackStack.js` — correção da causa raiz.
- `src/lib/tournamentNextAction.js` — novo (fonte canônica).
- `src/components/tournaments/TournamentModal.jsx` — reaproveita
  `buildInterviewRoute`; `round_result` distingue hoje/futuro.
- `src/components/career/CareerDayControl.jsx` — bloqueio acionável.
- `src/pages/CareerHub.jsx` — CTAs de torneio deep-linkados pelo id.

## Testes criados

- `test:overlay-back-stack` — fault injection na causa raiz do Problema 1.
- `test:tournament-guided-flow` — prioridade canônica + pipeline real
  (R16 → entrevista real → bloqueio acionável → QF → primeiro ponto real).
