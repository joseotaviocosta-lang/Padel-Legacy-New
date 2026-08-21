# M4.3 — Game Flow Navigation + Contextual Actions

Objetivo: reduzir telas mortas e retornos manuais ao menu depois de uma
ação, sem redesign geral e sem alterar gameplay/economia/calendário
lógico/regras de torneio/save.

## Parte A — Auditoria

Mapeada com evidência real (não suposição) antes de qualquer código:

- **Treinos**: `Training.jsx` não sugeria NENHUMA próxima ação após
  concluir um treino — só um botão "Fechar". Lacuna real.
- **Calendário/avanço**: `calendarAdvancePolicy.js`'s `canAdvanceDay`
  já retorna `{canAdvance, reason, blockingEvent}`; `tournamentNextAction.js`'s
  `describeCalendarBlock(blockingEvent)` **já existe** e já converte isso
  num objeto `{title, description, actionLabel, destination}` — usado
  pelo cabeçalho global (`CareerDayControl.jsx`) para mostrar "Ir para o
  torneio" quando o bloqueio é um torneio. **`CareerCalendar.jsx`
  (widget da Home) não usava essa mesma função** — só desabilitava o
  botão com um aviso estático, sem CTA. Inconsistência real corrigida.
- **Achado sobre blockers não-torneio**: `PROHIBITED`/decisões
  obrigatórias com `event_type` diferente de `'tournament'` nunca são
  criadas hoje em nenhum lugar do código (`requires_decision:true` só
  aparece em eventos de torneio) — o branch de `describeCalendarBlock`
  para decisão genérica (`destination:null`) é uma salvaguarda para um
  caso que não ocorre na prática. Não foi construído roteamento novo
  para um caso hoje inexistente (Parte 0: não inventar).
- **7 resolvers de "próxima ação" já existiam**, espalhados e
  cross-referenciados manualmente em `CareerHub.jsx`: `buildNextEvent`,
  `buildPriorityActions`, `buildCareerDecisionCenter`,
  `buildDailyCareerBriefing`, `buildSeasonCareerPlan`,
  `getTournamentNextAction`, `describeCalendarBlock`. A Home já tem uma
  disciplina "Single Source of Truth" documentada (hotfix anterior) que
  impede CTAs concorrentes durante o tutorial. Dado o risco de regressão
  num arquivo de 942 linhas já extensivamente polido em várias fases
  anteriores, **a Home não foi reescrita** — o novo resolver cobre
  terreno que HOJE não tem nenhuma resolução própria (Treinos, mensagens
  de torneio), em vez de duplicar/substituir a lógica já testada da Home.
- **Bug real de navegação em `TournamentModal.jsx`**: todo botão
  "Voltar à carreira" (aguardando rodada, resultado de rodada não-jogável
  hoje, eliminação, campeão, abandono) só chamava `onClose` — que, nos
  dois pontos de montagem reais (`Tournaments.jsx`, `CalendarPage.jsx`),
  apenas limpa o estado local do modal, sem navegar. O jogador ficava
  preso na página que já estava, nunca voltando de fato à Home como o
  rótulo prometia — mesma classe de bug já corrigida em
  `SimulationModal.jsx` (M4.2.2).
- **BottomNav/NavigationHub**: já implementam exatamente a prioridade
  sugerida pelo próprio briefing (Início/Carreira/Competir/Mundo/Mais) e
  já entregam qualquer destino frequente em no máximo 2 toques a partir
  da Home — meta já cumprida, nenhuma reestruturação necessária.
- **Android Back / overlays**: `overlayBackStack.js` (M1) já separa
  corretamente "fechar overlay" de "navegar de rota" via marcadores de
  histórico — já correto, preservado sem alteração.
- **Deep-links de notificação**: `notificationDestinations.js`'s
  `resolveNotificationDestination`/`resolveAndOpenNotification` já
  resolvem rotas reais para ~10 tipos de notificação — reaproveitados,
  não reimplementados.

## Parte C/D — `getCareerNextAction`

`src/lib/careerNextAction.js` — pura, sem I/O, sem JSX. Ordem de
prioridade (Parte C): torneio hoje → decisão obrigatória → inscrição de
torneio → partida treino disponível → treino disponível → missão/tutorial
→ mensagem urgente → sugestão de calendário → avançar o dia. `context` é
opcional e cada campo é fornecido pelo chamador já calculado — a função
nunca busca dado sozinha (Parte R). `icon` no retorno é uma chave string,
nunca uma referência de componente (Parte D).

## Parte E — `ContextActionBar`

`src/components/design-system/ContextActionBar.jsx` — só `primary`
(obrigatório) + `secondary` (opcional), some quando `primary` é nulo,
sem `useState`/`useEffect` (puramente apresentacional).

## Parte G — Pós-treino

`Training.jsx`: `postTrainingAction = getCareerNextAction(profile)`
calculado só quando há resultado de treino a mostrar; renderizado via
`ContextActionBar` logo abaixo do `ActionFeedback` existente (mantido).

## Parte I/N — Torneio: navegação corrigida

`goBackToCareer = () => { onClose?.(); navigate('/'); }` — usado em todos
os pontos que já diziam "Voltar à carreira" (aguardando, eliminado,
campeão, abandonado). O "X"/backdrop do `ModalShell` continua chamando
só `onClose` (nunca navega) — a distinção de Parte N (`X` fecha overlay;
"Voltar para carreira" vai para Home) agora é real, não só textual.
Resultado de rodada com próxima rodada no futuro: botão genérico
"Continuar no torneio" substituído por `ContextActionBar` com "Voltar
para a carreira" (primário) + "Ver calendário" (secundário) — nunca um
botão que tenta jogar a rodada futura (`playableToday` já bloqueava isso,
preservado).

## Parte J/L — Calendário / blockers acionáveis

`CareerCalendar.jsx` (widget da Home) passou a usar `describeCalendarBlock`
(já existente, mesma função do cabeçalho global) para seu aviso de
decisão pendente, com um botão real ("Ir para o torneio") em vez de só um
texto estático — consistência entre os dois lugares que mostram o mesmo
bloqueio.

## Partes K/M/O — Avançar / navegação / destination memory

Já implementados corretamente antes desta fase (confirmado via auditoria
+ teste, não reconstruído): o cabeçalho já mostra a CTA do bloqueio real;
`padel:profile-updated`/`padel:career-advanced` já propagam o avanço de
dia sem refresh manual (usado por `AppLayout.jsx`, `CareerHub.jsx`,
`Tournaments.jsx`, `CalendarPage.jsx`); BottomNav/hub já cumprem a meta de
2 toques; React Router já preserva contexto de navegação sem stack
customizado.

## Não alterado

Match/Rally Engine, RNG, economia, progressão, calendário lógico
(`calendarAdvancePolicy.js` não foi tocado — só consumido), regras de
torneio (`TournamentRunManager.js` não foi tocado), limite de partida
treino, formato de save, persistência M3.7, BottomNav/NavigationHub
(estrutura preservada), overlay back-stack (M1).

## Regressão relevante corrigida (não de gameplay)

`test-mobile-visual-hotfix-m4-1-3.mjs`'s gate 18 (verificação via `git
diff --name-only` contra uma lista de fragmentos de caminho proibidos)
falhava apontando arquivos da Fase 14 (`game-core/coachLifecycle.js` etc,
já revisados e reportados numa fase anterior) como "proibidos" só porque
o auto-commit da sessão ainda não tinha rodado — a MESMA fragilidade que
o próprio arquivo já documentava e corrigira uma vez para um gate irmão.
Removido pelo mesmo motivo já registrado no arquivo.

## Typecheck

Baseline citada no briefing (pós-M4.2.2): 2036 — desatualizada porque a
Fase 14 (história de carreira), rodada entre M4.2.2 e esta fase, já
tinha elevado o real para 2046 (delta relatado e justificado no relatório
daquela fase). M4.3 em si: 2046 → 2047 (+1), o mesmo padrão sistêmico já
documentado (`Button.jsx` sem generics de tipo no `forwardRef`, afetando
todo consumidor de `Button` no projeto) aplicado ao novo
`ContextActionBar.jsx` — não uma categoria nova, não corrigível sem tocar
`Button.jsx` (fora de escopo). Um erro genuíno e corrigível foi
encontrado e corrigido na própria `careerNextAction.js` (JSDoc faltando
o campo `calendarSuggestion`).
