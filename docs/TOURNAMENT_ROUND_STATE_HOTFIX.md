# Hotfix crítico pré-beta — Tournament round state ("agendada" não vira "jogável")

QA real: jogador vence R32, dá entrevista, avança o dia até a data da
próxima rodada (R16), tenta avançar de novo — o bloqueio funciona
corretamente ("Você precisa disputar R16 de Doha Platinum Open antes de
avançar o dia") e o CTA "Ir para o torneio" abre o torneio certo, mas o
`TournamentModal` continua mostrando "R16 agendada" / "17 de abr. de 2026"
sem nenhum botão para jogar, mesmo com a data já tendo chegado.

## Causa raiz

Não é comparação de data errada, timezone ou off-by-one — `getTournamentRunPhase`
(`src/gameplay/worldTour/TournamentRunManager.js`) já compara `careerDate`
com `match.date` corretamente, sempre como string `YYYY-MM-DD` (formato
date-only produzido por `addTournamentDays`, sem `new Date()`/`toISOString()`
espalhados). Confirmado por teste direto: data futura → `waiting`, data
igual → `playable`, data passada → `missed` — os três já funcionavam.

A causa real é **um perfil desatualizado sendo usado como entrada** dessa
comparação, correta em si:

1. O efeito de montagem do `TournamentModal` nunca busca o perfil de novo no
   storage — usa inteiramente a prop `profile` (`initialProfile`), só
   decorada por `ensureStarterCoach(initialProfile)`.
2. `ensureStarterCoach` (`src/game-core/coachLifecycle.js`), quando o
   jogador já tem treinador ativo (`isCoachActive`), devolve
   `{ profile, ... }` com a **mesma referência recebida** — nunca relê o
   storage.
3. `initialProfile` vem de qualquer página-pai que renderiza o modal
   (`Tournaments.jsx`, `CareerHub.jsx`) — essas páginas buscam o perfil
   **uma única vez no mount** (`useEffect(..., [])`) e não escutavam o
   evento global `padel:profile-updated` que `CareerDayControl` (cabeçalho
   global, sempre montado em `AppLayout`, `dayAdvanceCoordinator.js`)
   dispara a cada avanço de dia.
4. Se o jogador avança o dia pelo controle **global** enquanto permanece na
   mesma rota — e a navegação do CTA "Ir para o torneio" é só troca de
   query string (`/tournaments?tournament=X&mode=run`), que o React Router
   não remonta — o `career_date` local da página-pai fica preso na data de
   quando a página carregou, mesmo com o storage já correto. O modal herda
   essa data velha, `getTournamentRunPhase` compara corretamente, mas com
   uma `careerDate` errada, e a rodada continua parecendo futura.

O mecanismo foi reproduzido diretamente com as funções reais do pipeline
(sem mocks): `ensureStarterCoach(perfilDesatualizado)` devolve a mesma
referência; `getTournamentRunPhase(run, perfilDesatualizado.career_date)`
retorna `waiting` mesmo com o storage já tendo o `career_date` real igual à
data da rodada.

## Correção

**`TournamentModal.jsx`** (raiz do bug — corrige mesmo com qualquer
página-pai desatualizada): o efeito de montagem agora busca o perfil fresco
do storage (`localGame.entities.PlayerProfile.get(initialProfile.id)`,
mesmo padrão já usado em `handleMatchFinished` neste arquivo e em
`calendarLifecycle.js`/`dayAdvanceCoordinator.js`) **antes** de chamar
`ensureStarterCoach` e calcular qualquer coisa dependente de `career_date`.

**`CareerHub.jsx`, `Tournaments.jsx`, `CalendarPage.jsx`** (consistência —
Home/lista de torneios/calendário paravam de refletir o avanço de dia feito
pelo cabeçalho global): cada uma ganhou um listener leve para
`padel:profile-updated`/`padel:career-advanced` que atualiza só o `profile`
local a partir do perfil já incluído no evento (`event.detail.profile`,
sem round-trip extra) — mesmo padrão já usado por `AppLayout.jsx`
(`useCareerHeaderData`) e por `CommunicationBell.jsx` (que já escutava
corretamente antes deste hotfix). Não recarrega a carga pesada de dados de
cada página nem reposiciona a semana/dia selecionado no Calendário — só a
identidade/data do jogador, que é o que os badges de "jogável"/"hoje"
dependem.

`getTournamentNextAction`/`describeCalendarBlock`
(`src/lib/tournamentNextAction.js`) e `canAdvanceDay`
(`src/lib/calendarSystem.js`) não precisaram de mudança — já eram
consistentes entre si e com `getTournamentRunPhase` uma vez alimentados com
a `careerDate` correta; confirmado por teste que os três concordam.

## Testes

`npm run test:tournament-round-availability`
(`scripts/test-tournament-round-availability.mjs`, 25 gates, pipeline real
sem mocks): comparação de data em `getTournamentRunPhase` (futura/igual/
passada); reprodução direta do mecanismo do bug com `ensureStarterCoach` +
perfil desatualizado; confirmação da correção com perfil fresco; cadeia
`canAdvanceDay` → `describeCalendarBlock` → destino do CTA;
`getTournamentNextAction` consistente nos dois cenários; reload preserva
"jogável"; guardas estáticas confirmando que `TournamentModal.jsx` busca o
perfil fresco antes de `ensureStarterCoach`, e que `CareerHub.jsx`/
`Tournaments.jsx`/`CalendarPage.jsx` escutam os eventos de avanço.
Confirmado via `git stash` que o teste falha contra o código pré-correção
(a guarda estática do `TournamentModal.jsx`) e passa com a correção
restaurada.
