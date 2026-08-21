# Hotfix 14.1 — Match UX + Entrevistas 2.0 + Atalho de Calendário

Polish focado em 4 problemas reais de QA: partida desktop comprimida,
entrevista pós-partida sombreada, repetição nas entrevistas, e data do
header sem atalho para o Calendário.

## Parte A — Auditoria

- **LiveMatch.jsx** já usava `flex`/`min-h-0`/`flex-1`/`overflow-y-auto`
  corretamente — nenhum bug ali. A causa raiz real estava nos DOIS HOSTS
  (`TournamentModal.jsx`/`SimulationModal.jsx`), que capavam a altura
  desktop num teto artificial em rem (`min(48rem,...)`/`min(46rem,92dvh)`)
  independente da altura real da tela.
- **Técnico**: indicador (badge na aba) e conteúdo completo (recomendação/
  contexto/confiança/ações) já existiam. Faltava só "esquecer" o estado de
  nova sugestão depois de visualizada — não existia essa distinção.
- **Entrevista sombreada**: `openPostMatchInterview()` (`TournamentModal.jsx`)
  nunca chamava `onClose()`, só `navigate()`. Como `/press` é uma rota lazy
  dentro de `<Suspense>` com `future.v7_startTransition:true`, a árvore
  anterior (TournamentModal, com seu próprio backdrop) ficava montada
  durante a espera do chunk — coexistindo com o backdrop do
  `InterviewModal` (que monta depois, quando `Press.jsx` termina seu
  próprio `load()`). "Clicar numa resposta corrige" era coincidência de
  tempo (a árvore antiga já tinha desmontado sozinha), não uma consequência
  da resposta.
- **Entrevistas**: 11 perguntas, 39 respostas, só 6 categorias, seleção
  100% sequencial (sempre as mesmas 2 perguntas de cada categoria, na
  mesma ordem) e `pickJournalist` sempre pegava `[0]` do filtro (todo
  post_loss/rumor caía no mesmo jornalista). Bug real de rótulo: tom
  `fechado` (respostas reservadas/"sem comentários") exibia rótulo
  "Festivo".
- **Data do header**: `CareerDayControl.jsx` já tinha o layout certo, só
  faltava ser clicável — rota canônica `/game/calendar` já existente e já
  usada por `describeCalendarBlock`/`CareerCalendar.jsx`.

## Partes 1-6 — Layout desktop

`TournamentModal.jsx`/`SimulationModal.jsx`: `sm:h-[min(48rem,calc(100dvh-2rem))]`/
`md:h-[min(46rem,92dvh)]` → `sm:h-[calc(100dvh-2rem)]` nos dois (breakpoint
unificado). Mobile preserva exatamente `h-[calc(100dvh-1rem)]` sem
prefixo — zero mudança mobile. Nenhuma outra linha de `LiveMatch.jsx`
precisou mudar — a cadeia flex já cascata o espaço extra corretamente.

## Parte 2/3 — Técnico sempre acessível, indicador "visto"

`LiveMatch.jsx`: novo estado `seenSuggestionId`, marcado quando
`activePanel==='coach' && coachSuggestion` (abrir a aba = ver a sugestão).
`hasAlert` agora é `Boolean(coachSuggestion) && coachSuggestion.id !== seenSuggestionId`
— uma sugestão nova (id diferente) volta a acender o indicador mesmo
depois da aba já ter sido aberta antes. Lógica de QUANDO o treinador
sugere (`state.liveCoach.pendingSuggestion`) intocada.

## Parte 7/8 — Entrevista sombreada

`openPostMatchInterview()`: adicionado `onClose?.()` ANTES de `navigate(...)`
— fecha o overlay do torneio de forma síncrona, desacoplando o desmonte
do modal da espera pelo chunk lazy de `/press`. Nenhum z-index alterado
(a causa raiz era stacking/timing, não prioridade de camada).
`overlayBackStack.js`/`ModalShell.jsx` (M1) não foram tocados.

## Partes 9-16 — Entrevistas 2.0

- **Bugs corrigidos**: rótulo `fechado`→"Reservado"; `pickJournalist`
  sorteia entre candidatos elegíveis (nunca mais sempre `[0]`).
- **`TONE_EFFECT_PRESETS`** (3 grupos: positive/negative/neutral) +
  `presetEffects(grupo, postura)`: todo conteúdo NOVO usa isso — mesma
  postura no mesmo grupo sempre recebe o efeito idêntico, por construção.
  As 11 perguntas originais mantêm seus efeitos manuais (nenhum
  rebalanceamento retroativo).
- **40 templates de pergunta, 128 respostas** (era 11/39) — 14 famílias
  contextuais novas (vitória apertada/dominante/upset/título/semifinal/
  estreia/sequência/marco de ranking/rivalidade/pressão de palco; derrota
  apertada/clara/final/má fase), todas gatilhadas por dado real
  (`score_a`/`score_b`, `opponent_rank`, `tournament_outcome`,
  `tournament_round`, contagem de `ownMatches`, ranking atual,
  `getTopRivalry` da Fase 14, `press_importance`, `partner_chemistry`,
  `coach_trust`) — nunca inventado.
- **`selectInterviewQuestions(categoria, contexto, recentIds, count)`**:
  filtra pelo pool elegível (sem `when` ou `when` bate), exclui IDs
  recentes quando há alternativa, só repete quando o pool se esgota.
  `recent_interview_question_ids` (últimas 20) persistido em
  `PlayerProfile`, gravado só uma vez por entrevista (mesmo bloco
  idempotente de `processed_press_interview_sources`).
- **`partner_positive`/`coach_positive`** (novas categorias): contraparte
  positiva do `rumor` existente — química/confiança ALTA, não só em risco.

## Partes 17-21 — Atalho de calendário

`CareerDayControl.jsx`: a data virou um `<button>` real (era `<div>`),
navegando para `/game/calendar` (rota canônica, nenhuma nova). Hover
discreto (`hover:bg-secondary/60`), `aria-label`/`title="Abrir calendário"`,
foco visível. "Avançar" continua um botão totalmente separado, mesmo
handler de sempre. Recovery de partida: nenhum item de navegação do shell
(BottomNav/hamburger) já bloqueia navegação durante recovery hoje — o
atalho não introduz um bypass novo, só mais um caminho para uma rota já
livremente navegável.

## Não alterado

Match Engine, IA tática, impacto do treinador, stamina/energia, ranking,
pontos, bracket de torneio, calendário lógico (`calendarAdvancePolicy.js`),
progressão, economia, conquistas, tutorial, Career Story.

## Regressões pré-existentes encontradas (não corrigidas, fora de escopo)

- `test:tournament-notification-deeplink`: falha em `CommunicationBell.jsx`
  (não tocado por esta fase, último commit anterior a esta sessão).
- `test:global-overlays`: script tenta ler `CareerAssistant.jsx`, um
  arquivo removido numa fase anterior — teste nunca atualizado.

## Typecheck

2047 → 2047 (delta líquido zero). `pressData.js` (todo o conteúdo novo)
não introduz nenhum erro.
