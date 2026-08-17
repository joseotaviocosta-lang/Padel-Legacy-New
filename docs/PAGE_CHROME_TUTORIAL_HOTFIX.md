# Polish pré-beta — Page chrome cleanup + Tutorial flutuante

QA visual real: o hotfix anterior (`docs/PAGE_HIERARCHY_ATHLETES_HOTFIX.md`)
parou de repetir o título da página, mas ainda sobrava excesso de "chrome"
antes do conteúdo útil — na tela de Treinos, por exemplo: cabeçalho
operacional, uma faixa inteira "Como usar esta página", uma segunda faixa
inteira "Próximo passo · Mundo do padel", e só então "Centro de treino".

## Decisão de produto

Página comum passa a ter só: **A)** cabeçalho operacional global, **B)**
`PageHeader` da própria página, **C)** conteúdo. O tutorial deixa de ocupar
espaço permanente — vira uma ferramenta separada, acionada por um botão
flutuante.

## O que gerava as duas faixas

`OnboardingGuide.jsx` (montado uma vez em `AppLayout.jsx`, acima do
`<Outlet/>`, em toda rota) renderizava dois componentes diretamente no
fluxo normal de layout:

- `PageIntroduction` — a faixa "Como usar esta página" (já sem o título
  duplicado desde o hotfix anterior, mas ainda uma seção fixa acima da
  página).
- `NextStepCard` — o card "Próximo passo · {fase}" com título, explicação,
  CTA, "Minimizar" e "Pular guia", sempre visível enquanto o onboarding
  estava em andamento.

## Correção

Os dois viraram **seções dentro de um único painel** (`GuidePanel`),
acionado por um **botão flutuante verde** (`GuideButton`) no canto
inferior direito — o mesmo espaço que o antigo Assistente de carreira
ocupava antes de ser removido por decisão de produto anterior (o Assistente
**não** voltou; o botão é só tutorial/guia contextual, nunca IA/chatbot).

`OnboardingGuide.jsx` (`src/components/onboarding/OnboardingGuide.jsx`)
agora tem duas responsabilidades separadas no mesmo arquivo, como pedido:
o `export default function OnboardingGuide()` é o controller (busca/persiste
o estado do tutorial, calcula a etapa atual — nada disso mudou), e ele só
devolve `<GuideButton/>` + `<GuidePanel/>`. Nenhum dos dois ocupa espaço no
fluxo de documento: o botão é `fixed`, e o painel é um `DrawerShell`
(`createPortal` para `document.body`) — não sobra nenhum espaço vazio onde
as faixas antigas estavam, porque elas nunca entram no layout normal para
começar.

`GuidePanel` centraliza tudo numa única ferramenta (item 9 do hotfix):
introdução da página (`PageIntroductionSection`, contextual via
`getPageIntroduction(pathname)` — mesma fonte de dados de sempre, nenhum
mapa novo), próximo passo do tutorial (`NextStepSection`, com CTA/"Pular
guia"), recomendação de carreira quando o tutorial já terminou
(`RecommendationSection`), e o conteúdo que já existia no antigo
`HelpCenter` (Ciclo principal, lista completa do tutorial, Glossário).
Reaproveita `DrawerShell`, que já resolve Android Back via
`useOverlayBehavior`/`overlayBackStack` — nenhum overlay novo.

O botão antigo "Guia" que vivia em `FloatingUtilityRail.jsx` (topo direito,
ao lado de BETA/Carreiras/Som) foi removido de lá — só existia porque não
havia mais espaço embaixo (ocupado pelo Assistente). Com o Assistente
removido, o Guia ganhou seu próprio botão dedicado embaixo; o evento
`padel:open-career-guide` que os conectava também foi removido (sem
gatilho duplicado).

Badge no botão (ponto verde) só aparece com o onboarding realmente em
andamento (`state.status === 'in_progress' && step`); tutorial concluído ou
pulado deixa o botão sem badge, mas continua útil como guia contextual da
página (a introdução e a recomendação continuam disponíveis dentro do
painel). Não foi criado nenhum "pulse" de primeira visita — o badge do
onboarding ativo já cobre "há algo para ver aqui" sem bloquear a tela;
`pageIntroductionsSeen` continua sendo gravado (bookkeeping preservado),
só não controla mais recolher/expandir, porque abrir o painel já é uma
decisão deliberada do jogador — mostrar o conteúdo completo sempre que
abre é mais simples do que reintroduzir um toggle.

O botão "Minimizar" do card de próximo passo foi removido: ele existia
para recolher a faixa permanente sem perder o lembrete; sem faixa
permanente (o botão flutuante já é esse lembrete, sempre visível), fechar
o painel tem o mesmo efeito. "Pular guia" continua — é uma ação diferente
(dispensa o tutorial de verdade). O campo `state.minimized` continua
existindo nos dados salvos (compatibilidade com saves antigos), só não é
mais gravado como `true` por nenhuma ação nova.

## Header — chip "Próximo torneio"

O chip de contexto do cabeçalho global (`CareerHeaderContext.jsx`) mostrava
só "Nome · Xd", sem deixar claro o que representava. A lógica de decisão
(qual estado mostrar, texto exato, dias) foi extraída para
`src/lib/careerHeaderContext.js` (`buildCareerHeaderContext`) — pura,
testável sem jsdom, mesmo padrão de `tournamentNextAction.js`. Estados:

- Sem torneio: "Semana de desenvolvimento" (comportamento existente
  preservado, sem inventar um estado novo).
- Torneio distante ou dentro de 5 dias: compacto `Nome · Xd`, completo
  `Próximo torneio · Nome · Xd`.
- Torneio hoje: `Hoje · Nome` (compacto e completo).
- Lesão/fadiga alta/energia baixa continuam com prioridade sobre o
  torneio distante — comportamento existente, não tocado.

O chip virou clicável quando há um torneio associado (não para
lesão/fadiga/energia, que não têm um destino único): reaproveita
`buildTournamentPlayRoute` (`src/lib/tournamentNextAction.js`, já
existente) — o mesmo deep link do bloqueio de avanço e do CTA "Ir para o
torneio". Nenhuma lógica de roteamento nova: `Tournaments.jsx` já cai em
"detalhes" quando não há campanha ativa (`resolveTournamentOpenMode`), então
o link funciona certo tanto para torneios com inscrição confirmada quanto
para os que ainda não têm.

## Testes

- `npm run test:tutorial-floating-guide` (31 gates): confirma que o
  controller não renderiza mais as seções inline, que o botão existe com
  safe-area/z-index corretos, que o Assistente não voltou, que
  `FloatingUtilityRail` não duplica o gatilho, que o painel reaproveita
  `DrawerShell` (Android Back), que a ajuda contextual continua acessível
  pós-onboarding, e — com o pipeline real — que `TUTORIAL_VERSION`,
  `TUTORIAL_STEPS` e `getNextTutorialStep`/`reconcilePersistedTutorial`
  não foram alterados.
- `npm run test:page-hierarchy` (31 gates, atualizado): adiciona a
  verificação de que o controller do Guia não injeta mais
  `PageIntroductionSection`/`NextStepSection` no fluxo da página.
- `npm run test:header-next-tournament` (29 gates): cobre os estados do
  chip (sem torneio / distante / urgente / hoje / lesão / fadiga /
  energia / múltiplos torneios), prioridades preservadas, e que o
  componente ficou clicável via `buildTournamentPlayRoute`.

Confirmado via `git stash` que os três falham contra o código pré-correção
e passam com a correção restaurada.
