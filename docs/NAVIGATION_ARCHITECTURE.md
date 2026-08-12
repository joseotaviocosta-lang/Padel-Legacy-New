# Arquitetura de navegação (Fase 3 — Shell)

Data: 2026-08-12
Baseado em: `docs/UI_UX_AUDIT.md` (achado central: sidebar desktop com 6
macroáreas, BottomNav mobile com 5 — a área Gestão ficava inacessível pela
navegação persistente no mobile).

## Princípio da fase

> Desktop e mobile devem representar a mesma arquitetura conceitual, ainda
> que visualmente diferente. Nenhuma funcionalidade pode desaparecer no
> mobile.

E, tão importante quanto:

> Preservar todas as rotas atuais. Não quebrar deep links.

## Decisão de arquitetura: zero rotas novas, zero redirects

A tentação óbvia seria criar hubs novos (`/career`, `/more`) e redirecionar
`/development` → `/career`, `/team-hub` → `/career`. **Isso foi
deliberadamente evitado.** O motivo: `src/onboarding/tutorialSteps.js` tem
duas etapas de tutorial distintas (`visit_development` e `visit_team_hub`)
que exigem o jogador **visitar literalmente `/development` e `/team-hub`**
para confirmar entendimento (`completionType: 'confirm_understanding'`), e
`src/components/missions/MissionNotificationBridge.jsx` tem um mapa
`ROUTE_OBJECTIVES` que credita essas duas missões por `pathname` exato. Se
essas rotas virassem redirects para uma única `/career`, `location.pathname`
nunca mais seria `/development` nem `/team-hub` — o jogador ficaria
permanentemente incapaz de confirmar essas duas etapas do tutorial, e (pior)
o mapa `ROUTE_OBJECTIVES` teria duas chaves colidindo no mesmo objeto
JavaScript (`'/career': 'visit_development'` sobrescrita silenciosamente por
`'/career': 'visit_team_hub'` logo em seguida), quebrando o crédito
automático de uma das duas missões para sempre — inclusive em carreiras já
salvas com o tutorial em andamento.

**Solução adotada:** a reorganização visual vive inteiramente em
`src/navigation/navigationConfig.js`, numa camada nova (`NAV_GROUPS`)
independente das rotas em si. Nenhuma rota de `src/App.jsx` foi criada,
renomeada ou redirecionada nesta fase. `/development` e `/team-hub`
continuam existindo, funcionando e sendo usadas pelo tutorial exatamente
como antes — só deixaram de ser o link de topo clicável da sidebar, sendo
substituídas ali por um grupo "Carreira" que as engloba conceitualmente (ver
`aliases` abaixo).

## A nova arquitetura: 6 grupos

`NAV_GROUPS` (`src/navigation/navigationConfig.js`) substitui a antiga
`NAVIGATION_AREAS`:

| Grupo | Rota de topo | Itens | Observação |
|---|---|---:|---|
| **Início** | `/game` | 0 | Link direto, sem expandir — é a própria Home |
| **Carreira** | `/development` | 12 | Funde as antigas áreas "Desenvolvimento" + "Dupla e relações" + itens de identidade (Atleta, Aparência, Missões) que estavam em "Início" |
| **Competir** | `/competitions` | 5 | Inalterado |
| **Mundo** | `/world` | 7 | Ganhou Imprensa (antes em "Dupla"); perdeu Mercado mundial (→ Gestão), Enciclopédia/História/Hall da fama (→ Mais) |
| **Gestão** | `/management` | 4 | Ganhou Mercado mundial |
| **Mais** | *(nenhuma — `to: null`)* | 7 | Novo bucket para conteúdo de referência/secundário: Estatísticas, Legado, Conquistas, Comunicações, História, Hall da fama, Enciclopédia |

Total: 35 itens de conteúdo — o mesmo número que existia antes da
reorganização (12+5+7+4+7=35), confirmando que nenhuma rota foi perdida, só
reagrupada. `scripts/test-ui-shell.mjs` verifica essa lista item a item.

### `aliases`: como `/team-hub` continua reconhecido pelo shell

O grupo `career` declara `aliases: ['/team-hub']`. Isso não cria uma rota
nem um redirect — é consumido só por `groupForPath()` para que, se o jogador
chegar em `/team-hub` (por exemplo, pelo link do tutorial), o shell ainda
saiba destacar "Carreira" como o grupo ativo na sidebar/BottomNav, em vez de
não reconhecer nenhum grupo.

### Compatibilidade das páginas de hub

As 4 rotas que renderizam `<NavigationHub areaId="..." />` (`/development`,
`/team-hub`, `/competitions`, `/management`) não mudaram em `App.jsx` — o
prop `areaId` continua exatamente o mesmo. `NavigationHub.jsx` agora traduz
esse identificador histórico para o grupo novo via `LEGACY_AREA_TO_GROUP`
(`{ development: 'career', team: 'career', competition: 'competition',
management: 'management' }`) e renderiza a partir de `NAV_GROUPS` — ou seja,
visitar `/development` OU `/team-hub` mostra a mesma lista completa e
atualizada de 12 itens de "Carreira", em vez de duas listas menores e
desatualizadas.

## Desktop — sidebar

`src/components/AppLayout.jsx`. Cada grupo com `to` definido (Início,
Carreira, Competir, Mundo, Gestão) é um `NavLink` clicável com um botão de
expandir/recolher ao lado (estado único `expandedGroup`, um grupo aberto por
vez, persistido em `localStorage`). Início não tem itens, então nunca mostra
o botão de expandir — é só um link. "Mais" não tem `to`: a linha inteira do
cabeçalho é um `<button>` que alterna expandir/recolher (não há para onde
navegar diretamente).

Largura reduzida de `17rem` para `16rem` (mais compacta, pedido explícito da
fase). Recolhida, cai para `4.5rem` e mostra só os ícones com `title`
(tooltip nativo do navegador) — preferência salva em
`localStorage` (`padel:sidebar-collapsed`), **não no save da carreira**.

### Caso especial: "Mais" com a sidebar recolhida

Como "Mais" não tem rota própria, clicar no ícone recolhido não pode
navegar para lugar nenhum. Em vez de um clique sem efeito, ele chama
`onRequestExpandSidebar`, que reabre a sidebar **e** já expande "Mais" —
o grupo nunca fica preso atrás de um ícone morto.

## Mobile — bottom nav

`src/components/BottomNav.jsx`. Cinco abas: Início, Carreira, Competir,
Mundo (links diretos, mesmas rotas da sidebar) + **Mais**, que não navega —
abre um `BottomSheet` (`src/components/design-system/BottomSheet.jsx`, o
mesmo padrão seguro de altura/scroll do `ModalShell`/`DrawerShell`) com duas
seções: os 7 itens de "Mais" e, **explicitamente**, os 4 itens de "Gestão".

Isso é a correção direta do achado da auditoria: antes, a área Gestão
(Economia, Mercado, Admin, Banco de dados) não tinha *nenhum* caminho a
partir da navegação persistente no mobile. Agora está a um toque de
distância (Mais → seção Gestão), igual à sidebar do desktop, só que
apresentada como *sheet* em vez de submenu inline — a mesma arquitetura
conceitual, adaptada à plataforma (pedido explícito da fase, seção 7).

Cinco é o máximo recomendável para uma bottom nav; dobrar Gestão dentro de
Mais evita uma 6ª aba espremida sem violar "nenhuma funcionalidade
desaparece".

## Estado ativo

`groupForPath(pathname)` (nova, substitui `areaForPath`) determina qual dos
6 grupos está ativo, considerando: a rota de topo do grupo, seus `aliases` e
todos os seus itens (com correspondência de prefixo para sub-rotas como
`/clubs/:clubId`). Usado tanto na sidebar/BottomNav (destaque visual) quanto
no header (breadcrumb "Carreira / Atleta").

## Header, sino e FABs — em grande parte já corretos

A auditoria (Fase 1) apontou a data cortada como um risco: verificado nesta
fase, **já estava corrigido** — `getCareerDatePresentation()`
(`src/lib/careerDatePresentation.js`) já produz `fullDate` (`12/08/2026`,
desktop) e `compactDate` (`12/08`, mobile), sempre com o dia visível.
Nenhuma mudança foi necessária ali; `scripts/test-ui-shell.mjs` agora trava
esse comportamento.

`CareerHud.jsx` já mostrava Ranking, Moedas, Energia e Fadiga de forma
compacta e tonal (verde/amarelo/vermelho conforme o valor) — mantido sem
alterações estruturais. **Variação de ranking (`#842 ↑12`) não foi
implementada**: `getWorldRank()` não calcula nem armazena uma posição
anterior para o próprio jogador (só existe esse dado para outros atletas do
circuito, numa estrutura diferente, usada em `Ranking.jsx`); construir isso
exigiria lógica nova de rastreamento de ranking — explicitamente fora do
escopo desta fase ("não alterar... ranking").

O sino (`CommunicationBell.jsx`) foi migrado para usar
`NotificationBadge` (`src/components/design-system/NotificationBadge.jsx`)
em vez do contador com `<span>` hardcoded — mesmo comportamento (desaparece
ao zerar, mesma cor), agora a partir do componente oficial. Ganhou também
`title="Comunicações"` (tooltip nativo) e `aria-label` dinâmico anunciando a
contagem de não lidas.

Guia da carreira (`OnboardingGuide.jsx`, botão "?") e Assistente
(`CareerAssistant.jsx`, FAB do robô) já usavam
`bottom-[calc(...+env(safe-area-inset-bottom))]` com deslocamentos
diferentes para não colidir entre si nem com o BottomNav, e já ficavam
ancorados no canto inferior direito no desktop (`md:right-5`). Nenhuma
mudança foi necessária — apenas confirmado por `test:ui-shell`.

## O que NÃO mudou nesta fase

- `src/pages/WorldHub.jsx` (conteúdo da rota `/world`) — painel autocontido
  do Living World Engine, não consome `navigationConfig.js`; suas abas
  internas (Hoje/Circuito/Mercado/História) são conteúdo, não navegação, e
  ficam para a Fase 7 (Mundo).
- Conteúdo interno de qualquer página de destino (Training, Ranking,
  Tournaments etc.) — só o encaixe no shell.
- `CareerHub.jsx` (Home) — adaptação profunda pertence à Fase 4.
