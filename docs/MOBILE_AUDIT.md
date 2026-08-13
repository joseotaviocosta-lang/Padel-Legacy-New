# Auditoria Mobile Completa — Padel Legacy

Auditoria somente-leitura. Nenhum código, UI ou gameplay foi alterado nesta
etapa. Objetivo: mapear riscos de responsividade/mobile em toda a aplicação
React/Vite/Tauri antes de qualquer redesenho mobile, preservando
integralmente a versão Windows. O app já roda em Android real via
`npm run android:dev` (Tauri v2 mobile) — o objetivo aqui é robustez e
polimento, não viabilizar o que já funciona.

Metodologia: 3 agentes de pesquisa paralelos concluíram integralmente
(gameplay core, persistência/lifecycle/Tauri, shell/design system). 3
agentes adicionais (inventário de telas, breakpoints/overflow,
touch/modais) atingiram o limite de sessão da conta antes de terminar; o
trabalho deles **não foi refeito do zero** — foi complementado diretamente
via grep/leitura direcionada, reaproveitando tudo que os 3 agentes
concluídos já haviam levantado, mais o inventário `docs/REDESIGN_STATUS.md`
já produzido na Fase 8 (base factual para o status de migração por página).

---

## 1. Resumo executivo

- **0 achados P0** (nada impede o uso do app no Android hoje — consistente
  com o fato de o app já rodar via `android:dev`).
- **7 achados P1**, **14 achados P2**, **7 achados P3** — total **28**
  achados classificados e evidenciados com `arquivo:linha`.
- Os dois maiores riscos estruturais são de **infraestrutura, não de
  página**: (a) não existe nenhum tratamento do botão/gesto voltar do
  Android em lugar nenhum do código (JS ou Rust), e (b) o sistema de toasts
  não reserva espaço para o header fixo nem para a bottom nav/safe-area —
  ambos afetam a aplicação inteira de uma vez, não uma tela isolada.
- O maior risco de gameplay é a **partida ao vivo**: o estado da partida em
  andamento vive só em `useState` React, sem checkpoint em disco — se o
  Android suspender/matar o app durante uma partida (cenário muito comum:
  notificação, troca de app, pressão de memória), a partida inteira é
  perdida sem possibilidade de retomada.
- A base de persistência (`TauriStorage` → `GameStorage` →
  `CareerRepository` → `CareerManager` → `ActiveCareerAdapter`) é **sólida
  e já mobile-corretas**: escreve via `@tauri-apps/plugin-fs` com
  `BaseDirectory.AppData` (abstração cross-platform do Tauri), rejeita
  ativamente caminhos absolutos/Windows-específicos, usa escrita atômica
  com verificação de round-trip, e persiste a maioria das mutações de
  gameplay de forma síncrona a cada ação — a exceção é justamente a partida
  ao vivo, acima.
- Nenhum plugin Tauri incompatível com Android/iOS foi encontrado
  (`tauri-plugin-fs` e `tauri-plugin-store` são suportados nas três
  plataformas). O `AndroidManifest.xml` é mínimo — só `INTERNET`.
- 14 páginas legadas (misturam Design System 2.0 + `padel/ui.jsx` antigo)
  seguem como zona de risco desconhecido para mobile — já estavam
  sinalizadas como `⚠` em `docs/REDESIGN_STATUS.md` (Fase 8) e não foram
  reabertas nesta auditoria.

---

## 2. Estado atual

- App roda em Android real hoje (`npm run android:dev`), gerado via
  `tauri android init` (`src-tauri/gen/android/` existe e está completo).
- Build Windows (`npm run app:build`, Fase 8) segue funcionando e não foi
  tocado nesta auditoria — zero arquivos foram modificados.
- Viewport meta tag correta: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
  (`index.html:7`), sem `maximum-scale`/`user-scalable=no` — não bloqueia
  zoom por acessibilidade.
- Breakpoints Tailwind são os padrões (`tailwind.config.js` não sobrescreve
  `screens`): `sm=640`, `md=768`, `lg=1024`, `xl=1280`, `2xl=1536`. Não há
  breakpoints customizados nem conflitantes.
- Único hook de viewport em runtime é `useAdaptivePerformance`
  (`src/hooks/useAdaptivePerformance.js:11,34`), que usa
  `matchMedia('(max-width: 767px)')` — **consistente** com o `md` do
  Tailwind (768px), sem divergência. Usado para motion/perf
  (`allowDecorativeMotion`), não para decisões de layout.

---

## 3. Arquitetura mobile

- Não existe (e não deve existir) uma base de código mobile separada.
  Desktop, Android e futuro iOS compartilham 100% do React/Vite/Tauri.
- Diferenciação desktop↔mobile hoje é feita por 3 mecanismos, nenhum deles
  centralizado por completo:
  1. Classes Tailwind `hidden md:flex` / `md:hidden` por componente
     (sidebar, bottom nav, header mobile vs. desktop).
  2. `CardGrid` do Design System (`src/components/design-system/Page.jsx:35-42`)
     — única peça verdadeiramente centralizada de responsividade (mapa fixo
     de colunas por breakpoint).
  3. `Tabs` do Design System (`src/components/design-system/Tabs.jsx:17-47`)
     — scroll horizontal automático (`overflow-x-auto scrollbar-none`) para
     não quebrar layout com muitas abas.
- Fora desses dois componentes, responsividade é decidida página a página
  (`grid-cols-N sm:/md:/lg:grid-cols-M` copiado em dezenas de arquivos) —
  funciona, mas é um padrão descentralizado, não uma garantia de
  componente-base.

---

## 4. Inventário de telas

### 4.1 Rotas (fonte: `src/navigation/navigationConfig.js`, `src/lib/routeModules.js`, `docs/REDESIGN_STATUS.md`)

6 grupos de navegação, 36 itens-folha + 4 rotas de hub, 49 arquivos em
`src/pages/`. Tabela consolidada com status de migração (Fase 7/8) +
risco mobile específico desta auditoria:

| Página | Rota(s) | Status DS | Risco mobile específico desta auditoria |
|---|---|---|---|
| CareerHub.jsx | `/game` | ✓ | Baixo — `grid xl:grid-cols-12` colapsa para coluna única abaixo de `xl` |
| NavigationHub.jsx | `/development`,`/team-hub`,`/competitions`,`/management` | ✓ | Baixo — grid de cards, ponto de entrada extra que o mobile precisa (ver §9) |
| PlayerProfile.jsx | `/profile` | ✓ | Baixo |
| CharacterEditor.jsx | `/character` | ⚠ não verificada | Desconhecido |
| Missions.jsx | `/game/missions` | ⚠ não verificada | Desconhecido |
| Training.jsx | `/game/training` | ✓ | **Baixo-médio** — bem adaptado (tab bar `sticky`, cards em coluna única), ver §11 |
| TrainingCenter.jsx | `/training-center` | ✓ | **Médio** — barra de stats em `flex justify-between` sem grid responsivo (P2, único caso assim no app) |
| Inventory.jsx | `/game/inventory` | ✓ | Baixo |
| Shop.jsx | `/game/shop` | ✓ | Baixo |
| PartnerHub.jsx | `/partners` | ✓ | **Alto** — hospeda `PartnerOffersPanel` com tabela de comparação `min-w-[520px]` (P1, ver §10) |
| Coaches.jsx | `/coaches` | ✓ | Baixo |
| Staff.jsx | `/staff` | ✓ | **Alto** — `StaffPanel.jsx:84` grid `min-w-[420px]` (P1, ver §10) |
| Relationships.jsx | `/relationships` | ⚠ não verificada | Desconhecido |
| Fans.jsx | `/fans` | ⚠ não verificada | Desconhecido |
| Tournaments.jsx | `/tournaments` | ✓ | Baixo — cards em coluna única, chave em abas verticais (não é árvore horizontal) |
| CalendarPage.jsx | `/game/calendar` | ✓ | Baixo — grid `grid-cols-7` fluido, sem largura fixa; ver §8 |
| Matches.jsx | `/matches` | ✓ | Ver §11 (Partidas) |
| Ranking.jsx | `/ranking` | ✓ | **Médio** — sem busca por nome, truncamento agressivo no pódio de duplas |
| Season.jsx | `/game/season` | ✓ | Baixo |
| Journal.jsx | `/journal` | ✓ (Fase 7) | Baixo |
| WorldHub.jsx | `/world` | ✓ (Fase 7) | Baixo |
| WorldEvents.jsx | `/world-events` | ✓ (Fase 7) | Baixo |
| Press.jsx | `/press` | ✓ (Fase 7) | Baixo |
| Community.jsx / Social.jsx | `/community`, `/social`→`/community` | ✓ (Fase 7) | Baixo |
| Athletes.jsx | `/athletes` | ⚠ não verificada | Desconhecido |
| Clubs.jsx / ClubDetail.jsx | `/clubs`, `/clubs/:id` | ⚠ não verificada | Desconhecido |
| Weather.jsx | `/weather` | ✓ (Fase 8) | Baixo |
| Encyclopedia.jsx | `/encyclopedia` | ⚠ não verificada | Desconhecido |
| Economy.jsx | `/game/economy` | ⚠ não verificada | Desconhecido |
| WorldMarket.jsx | `/world-market` | ✓ (Fase 7/8) | Baixo |
| Admin.jsx | `/admin` | ✓ (Fase 8, técnica) | Baixo — não prioritária para mobile por natureza |
| DatabaseManager.jsx | `/database` | ✓ (Fase 8, técnica) | Baixo — idem |
| CareerStats.jsx | `/game/stats` | ✓ | Baixo |
| Legacy.jsx | `/game/legacy` | ⚠ não verificada | Desconhecido |
| Achievements.jsx | `/achievements` | ⚠ não verificada | Desconhecido |
| Communications.jsx | `/communications` | ✓ | Baixo |
| History.jsx | `/history` | ⚠ não verificada | Desconhecido |
| HallOfFame.jsx | `/hall-of-fame` | ⚠ não verificada | Desconhecido |
| Settings.jsx | `/settings` | ✓ (nova Fase 8) | Baixo |
| MonthlyReports.jsx | `/game/monthly-reports` | ⚠ não verificada | Desconhecido |
| AnnualReports.jsx | `/game/annual-reports` | ⚠ não verificada | Desconhecido |
| CareerManager.jsx | `/careers`, `/career-hub` | ✓ (Fase 8) | Baixo |
| Login/Register/ForgotPassword/ResetPassword.jsx | via `AuthLayout` | ✓ | Baixo |
| Landing.jsx | pública, pré-login | ~ parcial | Não verificada — fora de prioridade da Fase 8 |
| SeasonDashboard.jsx | **órfã, sem rota** | — | N/A |

As 14 páginas `⚠` (Achievements, AnnualReports, Athletes, CharacterEditor,
ClubDetail/Clubs, Economy, Encyclopedia, Fans, HallOfFame, History, Legacy,
Missions, MonthlyReports, Relationships) continuam como zona de risco
desconhecido — não foram reabertas nesta auditoria (ver §5.3/P2).

### 4.2 Componentes relevantes fora de `src/pages`

- `src/components/matches/LiveMatch.jsx` — motor de UI da partida ao vivo,
  ver §11 (prioridade máxima).
- `src/components/matches/SimulationModal.jsx`,
  `src/components/tournaments/TournamentModal.jsx` — hospedam `LiveMatch`
  dentro de `ModalShell`.
- `src/components/matches/MatchRecapPremium.jsx` — recap pós-partida.
- `src/components/calendar/CalendarWeekView.jsx`,
  `CalendarMonthView.jsx`, `DayEventList.jsx` — grids de calendário +
  modal de detalhe do dia.
- `src/components/economy/StaffPanel.jsx`,
  `src/components/partner/PartnerOffersPanel.jsx` — os dois arquivos com
  overflow fixo confirmado (P1, ver §10).
- `src/components/design-system/*` — `ModalShell`, `BottomSheet`,
  `DrawerShell`, `ConfirmDialog`, `useOverlayBehavior`, `Page`/`CardGrid`,
  `Tabs`, `Select` — base de UI compartilhada, ver §9/§12.
- `src/components/BottomNav.jsx`, `src/components/AppLayout.jsx` — shell
  completo (sidebar desktop, drawer mobile, headers, bottom nav).
- `src/careers/*`, `src/storage/*`, `src/gameplay/adapters/ActiveCareerAdapter.js`
  — pipeline de persistência, ver §17.
- `src/hooks/useAdaptivePerformance.js`,
  `src/components/design-system/MotionPolicy.jsx` — única infraestrutura
  de detecção de viewport/performance em runtime.

---

## 5. Achados por prioridade

### 5.1 P0 — impede uso do app

Nenhum. O app já roda em Android real hoje sem bloqueio conhecido.

### 5.2 P1 — quebra fluxo importante (7)

1. **Android back button sem nenhum tratamento** — nenhum ouvinte de
   `popstate`/back-press em JS, nenhum plugin/handler em
   `src-tauri/src/lib.rs` (arquivo inteiro tem 8 linhas, só registra
   `tauri-plugin-store`/`tauri-plugin-fs`). `useOverlayBehavior.js:22-27`
   só fecha overlays via `Escape`/clique no backdrop. Consequência: com um
   modal/bottom sheet/drawer aberto, o botão voltar do Android não fecha o
   overlay — ele cai no comportamento padrão do WebView (navegação de
   histórico ou saída do app), possivelmente deixando o overlay
   visualmente montado (é renderizado via portal, independente da rota)
   enquanto a rota por trás muda. Afeta **todo** modal do app de uma vez.
2. **Estado da partida ao vivo só em memória, sem checkpoint em disco** —
   `LiveMatch.jsx:46` guarda placar/sets/narração/tática/decisões do
   treinador em um único `useState`; só é persistido quando
   `state.finished` vira `true` (`LiveMatch.jsx:83-89` → `onFinished` →
   `finalizePracticeMatch`). Não há nenhum listener de
   `visibilitychange`/lifecycle Tauri (`appWindow`/`onResumed`) em lugar
   nenhum do código (grep confirmado: zero ocorrências, e o app não tem
   `@tauri-apps/api` nem `@tauri-apps/plugin-shell`/`-store` importados em
   JS). Se o Android suspender/matar o processo durante uma partida, ela é
   perdida por completo, sem retomada.
3. **Controles de partida abaixo do alvo de toque recomendado (44px), em
   fluxo de alta frequência** — botões de velocidade `min-h-8 min-w-8`
   (`LiveMatch.jsx:566`, 32px), botões de pular ponto/game/set/fim
   `min-h-9` (`LiveMatch.jsx:588`, 36px) e ações do treinador `py-2`
   (`LiveMatch.jsx:410-415`, ~32-36px), todos compactados lado a lado. É o
   ponto de maior densidade de toque do app.
4. **`StaffPanel.jsx:84` — `grid-cols-4 gap-2 min-w-[420px]`** — card de
   resumo (Vagas/Folha/Estrutura/Sinergias) no topo da tela de Comissão
   Técnica (`/staff`) força 420px mínimos de largura; qualquer phone
   ≤420px de viewport (praticamente todos em retrato, incl. os 360-412dp
   mais comuns em Android) sofre overflow horizontal ou clipping.
5. **`PartnerOffersPanel.jsx:70` — tabela de comparação `<table
   min-w-[520px]>`** — a função `Comparison` (comparar propostas de
   parceria) usa uma `<table>` HTML real (um dos únicos 2 casos no app,
   junto do componente-base não usado `ui/table.jsx`), envolta em
   `overflow-x-auto` — funciona, mas obriga rolagem horizontal numa
   decisão de gameplay em vez de virar cards, como o resto do app já faz
   em toda parte (Ranking, por exemplo, nunca usa `<table>`).
6. **Toast cobre o header fixo mobile** — `ToastViewport`/`ToastProvider`
   (`src/components/ui/toast.jsx:6-22`) usam `fixed top-0 ... p-4` abaixo
   de `sm:` (640px) — ou seja, na maioria dos phones em retrato. O header
   mobile fixo (`AppLayout.jsx:225`, `fixed inset-x-0 top-0 h-16`) não tem
   nenhum offset (`top-16`) nem o toast tem `safe-area-inset-top` — um
   toast some **sobre** o header em vez de abaixo dele.
7. **Toast sobre a bottom nav na faixa 640-767px** — o toast muda para
   `sm:bottom-0 sm:right-0` a partir de 640px, mas `BottomNav` (`fixed
   inset-x-0 bottom-0 z-50`) só some em `md:hidden` (768px). Entre 640 e
   767px de largura (phones grandes em paisagem, tablets pequenos em
   retrato) o toast (`z-120`) empilha diretamente sobre a bottom nav
   (`z-50`), sem padding/offset para liberar sua altura nem a safe-area.

### 5.3 P2 — UX ruim (14)

1. Tooltips nativos (`title=`) em 51 arquivos não funcionam em toque —
   exemplo concreto comprovado: `CalendarMonthView.jsx:41` usa
   `title={event.title}` como única forma de identificar um evento pelo
   ponto colorido; no mobile, só descobrindo ao tocar no dia.
2. `100vh` bruto em vez de `dvh` em `src/index.css:225` (`body`) e
   `src/index.css:276,311` (`.app-route-stage`) — risco latente de salto
   de layout se a UI de sistema do Android mudar de altura em runtime
   (o `ModalShell`/`BottomSheet` já usam `dvh` corretamente — só a camada
   base do body/rota não).
3. 14 páginas `⚠` (ver §4.1) seguem como zona de risco mobile desconhecida
   — misturam DS 2.0 e `padel/ui.jsx` legado, não verificadas nesta
   auditoria nem na Fase 7/8.
4. Assimetria de profundidade de navegação: a bottom nav linka para 4 rotas
   de **hub** (`/development`, `/competitions`, `/world`, e a home), exigindo
   um toque extra em `NavigationHub.jsx` para alcançar itens-folha; a
   sidebar desktop already mostra a lista plana de cada grupo diretamente.
5. O header desktop expõe 9 pontos de dado (breadcrumb, título, chip
   contextual, Ranking, Moedas, Energia, Fadiga, data completa, botão
   avançar, sino) via `CareerHud`/`CareerHeaderContext`
   (`AppLayout.jsx:288-300`); o header mobile (`AppLayout.jsx:225-235`) os
   **omite por completo** (não é `hidden`, é outro branch de render) —
   Ranking/Moedas/Energia/Fadiga só ficam visíveis fora do `CareerHub` no
   desktop.
6. Classe CSS de performance `pl-auto-contain` (`src/index.css:788,806`,
   `content-visibility: auto`) nunca é aplicada em nenhum componente —
   confirmado via grep (`Found 1 file: src\index.css`, zero usos em JSX).
   É a causa raiz da falha atual de `test:performance-responsive-v36` (ver
   §22) — otimização de performance escrita mas nunca conectada.
7. `TrainingCenter.jsx:120-137` — única barra de stats do app que usa
   `flex justify-between` (4 itens) em vez do padrão `grid-cols-2`
   consistente usado em todo o resto do app para stats no mobile.
8. `Ranking.jsx:227` — pódio da aba "Duplas" trunca nomes de dupla em
   `max-w-[80px]`, mais agressivo que o resto da tela.
9. `Ranking.jsx` não tem busca por nome — descoberta de um atleta
   específico depende só de paginação "carregar mais" em lotes de 50.
10. `localStorage` usado em 7 arquivos para preferências não-críticas
    (sidebar colapsada, som, flags de beta, insights dispensados) — mais
    frágil no WebView Android que o `$APPDATA` do Tauri usado pelos saves
    reais; documentado para que ninguém guarde dado real ali por engano.
11. `@tauri-apps/plugin-shell` não está instalado — hoje não há nenhum
    link externo no app (`window.open`/`target=_blank`/`shell.open`: zero
    ocorrências), mas se uma feature futura adicionar um, o caminho óbvio
    (`window.open`) não abre o navegador do sistema no Android/iOS.
12. `tauri-plugin-store` registrado em `Cargo.toml`/`capabilities/default.json`
    mas sem nenhum `@tauri-apps/plugin-store` no `package.json` nem
    import em JS — configuração morta, sem risco funcional, mas confusa.
13. Header mobile fixo (`AppLayout.jsx:225`) sem `env(safe-area-inset-top)`
    explícito — diferente do `FloatingUtilityRail.jsx:20` (que já usa
    `top-[calc(4.25rem+env(safe-area-inset-top))]`). Não confirmado se o
    WebView/Activity do Android já reserva a status bar nativamente;
    precisa validação em dispositivo real.
14. `ModalShell` não tem confirmação explícita de safe-area além do
    `.pl-modal-footer` compartilhado (`index.css:726`, só bottom); `dvh`
    no `max-h` mitiga parcialmente, mas não é o mesmo que reservar inset.

### 5.4 P3 — melhoria/polimento (7)

1. 845 ocorrências de `text-[8px]`/`text-[9px]`/`text-[10px]` no `src/` —
   densidade de texto muito pequena, pauta de legibilidade mobile.
2. `body { font-size: 0.9375rem }` (15px, `index.css:388-392`) — abaixo do
   baseline de 16px comumente recomendado para mobile.
3. 2 ocorrências de `group-hover:opacity-100` puramente cosméticas
   (`toast.jsx:60` botão fechar, `CareerDecisionCenter.jsx:46` label de
   seta) — não bloqueiam nenhuma função em toque.
4. Única permissão do `AndroidManifest.xml` (`INTERNET`) existe por causa
   de thumbnails remotas decorativas (Hall da Fama/Unsplash,
   `src/lib/hallOfFameData.js`; fallback Wix em `src/components/ui/image.jsx:6`)
   — poderia ser removida se essas imagens fossem empacotadas localmente.
5. Deriva de versão: `package.json` = `0.9.0-rc.1.9`,
   `src-tauri/Cargo.toml`/`tauri.conf.json` = `0.9.0` — inconsistência
   cosmética, sem relação direta com mobile.
6. Tiras de filtro/abas com scroll horizontal (7 filtros de tier em
   Tournaments, abas do World Market etc.) não têm nenhuma affordance
   visual de "há mais conteúdo" além do próprio scroll.
7. `DrawerShell` (painel lateral direito) não tem tratamento explícito de
   safe-area — prioridade menor que os bottom sheets, que já têm.

---

## 6. Shell / navegação

- **Sidebar desktop**: `hidden ... md:flex` (`AppLayout.jsx:261`) — some
  corretamente abaixo de 768px. Estados colapsado (4.5rem) / expandido
  (16rem) persistidos em `localStorage`.
- **Drawer mobile**: `framer-motion`, `md:hidden`, acionado pelo hambúrguer
  do header mobile — equivalente funcional da sidebar em telas estreitas.
- **Bottom nav**: 5 posições (`grid-cols-5`) — Início/Carreira/Competir/
  Mundo/Mais. Os 4 primeiros linkam para rotas de **hub**, não para
  itens-folha (ver P2 §5.3.4). "Mais" abre um `BottomSheet` com 12 itens
  (grupos Mais + Gestão combinados) em duas grades 2 colunas.
- Safe-area: `pb-[env(safe-area-inset-bottom)]` no `<nav>`
  (`BottomNav.jsx:62`) e padding de compensação equivalente no `<main>`
  (`AppLayout.jsx:287`, `pb-[calc(5.6rem+env(safe-area-inset-bottom))]`)
  — corretos.
- **Header mobile vs. desktop**: são dois componentes escritos à mão,
  não uma versão CSS-colapsada um do outro (ver P2 §5.3.5). Ambos `h-16`.
- Nenhum tratamento do botão voltar do Android em nenhum nível do shell
  (P1 §5.2.1).

---

## 7. Página por página

Ver tabela completa em §4.1. Destaques que não couberam na tabela:

- **CalendarPage.jsx** — contrário à hipótese inicial da auditoria, a grade
  semanal (`grid-cols-7`, sem largura fixa) já é fluida e funciona em
  375px sem precisar virar lista/agenda; eventos são pontos coloridos, não
  texto, então não há overflow de texto na célula. O risco real é outro:
  tooltip nativo (`title=`) inacessível em toque (P2 §5.3.1) e pouca
  distinção visual entre múltiplos eventos no mesmo dia.
- **Ranking.jsx** — já é 100% baseado em cards/linhas (nenhuma
  `<table>`), efetivamente já é "a alternativa mobile" que a auditoria
  original cogitava construir. Riscos reais são falta de busca e
  truncamento do pódio (P2 §5.3.8-9).
- **Tournaments.jsx** — uma das telas mais prontas para mobile: cards em
  coluna única abaixo de `sm`, chave de torneio como abas por rodada (não
  árvore horizontal), rodapé fixo genuíno (`shrink-0` fora da área de
  scroll do `ModalShell`) no modal de inscrição.
- **Training.jsx** — tab bar com `sticky top-2 z-20`
  (`Training.jsx:248`), um dos poucos `position: sticky` reais encontrados
  no app inteiro.

---

## 8. Calendário (detalhe adicional)

Ver §7. Navegação por ±7 dias/±1 mês via `IconButton`; separado disso, os
botões "+1 dia / +3 dias / +1 semana" de avanço de carreira usam
`flex-wrap`, então empilham corretamente em telas estreitas. Toque no dia
abre `ModalShell size="sm"` com `DayEventList` (lista vertical, com
`truncate`/`line-clamp-1`) — esse é o verdadeiro "modo lista" que a
auditoria original perguntava se seria necessário; já existe, só não é o
modo padrão de visualização.

---

## 9. Modais

Inventário: **40 arquivos** usam `ModalShell`/`BottomSheet`/`DrawerShell`/
`Dialog` diretamente. Classificação por padrão observado:

| Categoria | Exemplos | Classificação |
|---|---|---|
| Confirmação curta | `ConfirmDialog` (8 sites, Fase 8) | **A) manter modal** — conteúdo mínimo, já `ModalShell`-based |
| Seleção/lista média | `TournamentRegistrationModal`, `TournamentBracket`, Comunicações/Torneio/Mercado (portal global, `test:global-overlays` 88/88 ✓) | **A/B** — já funcionam bem como modal; `BottomSheet` já é o padrão em "Mais" |
| Partida ao vivo | `LiveMatch` dentro de `SimulationModal`/`TournamentModal` | **A) manter modal** — mas ver P1 §5.2.2-3 (persistência e touch targets, não a forma do overlay) |
| Detalhe extenso | `ItemDetailModal`, `CoachDetail`, `AthleteDetail`, `HallOfFameDetail`, `HistoryEntryModal`, `EncyclopediaDetail`, `FanBaseDetail`, `InterviewModal`, `RetirementModal`, `NewAthleteModal`, `SponsorNegotiationModal`, `PartnerNegotiationModal` (14 arquivos, não abertos individualmente nesta auditoria) | Não classificados item a item — recomenda-se uma passada dedicada verificando altura de conteúdo real antes de decidir A/B/C |
| Comparação tabular | `PartnerOffersPanel.jsx` `Comparison` | **B) bottom sheet com cards**, não tabela (ver P1 §5.2.5) |
| Onboarding obrigatório | `PositionSelection.jsx`, `OnboardingAttributes.jsx` | Já não usam `ModalShell` (decisão deliberada da Fase 8 — sem botão fechar); usam `useOverlayBehavior` direto |
| Sensível/não tocar | `TournamentModal.jsx` | Confirmado ainda em `ModalShell`, **não avaliado para mudança** por instrução explícita |

`ModalShell` já usa `max-h-[calc(100dvh-1rem)]`/`sm:max-h-[calc(100dvh-2rem)]`,
`overflow-y-auto overscroll-contain`, `role="dialog" aria-modal="true"` —
base de segurança de viewport já correta (herdada da Fase 8). `BottomSheet`
já reserva `env(safe-area-inset-bottom)` no painel e no rodapé.

---

## 10. Touch

Achado positivo: risco de interação exclusiva por mouse é **baixo** no
app inteiro. Grep de `onMouseEnter/Leave/Move`, `onDoubleClick`,
`onContextMenu`, `draggable`/`onDragStart` encontrou 40 arquivos com pelo
menos uma ocorrência, mas nenhuma delas gate uma função essencial atrás de
hover — as únicas duas ocorrências de `group-hover:opacity-100` são
cosméticas (P3 §5.4.3). O gap real de touch não é "handler de mouse", é
"tooltip nativo `title=` como única fonte de informação" (P2 §5.3.1) — 51
arquivos usam `title=`, caso concreto comprovado em `CalendarMonthView.jsx:41`.

Touch targets abaixo de 44px identificados: controles de velocidade/pular/
treinador da partida ao vivo (P1 §5.2.3) — não foi feita varredura
exaustiva de todos os botões pequenos do app fora do fluxo de partida
(ex.: `IconButton` variantes menores), recomenda-se checagem visual
dedicada na auditoria instalada.

---

## 11. Partidas (prioridade máxima)

- Layout **já é vertical de coluna única**, não painéis lado a lado —
  placar (`CompactScoreboard`) → 4 abas (Jogo/Tática/Treinador/Stats) →
  painel ativo (`flex-1 overflow-y-auto`) → controles de playback, tudo
  dentro de um `flex flex-col h-full` (`LiveMatch.jsx:122-220`).
- Narração **não cresce a página indefinidamente**: contêiner próprio
  `overflow-y-auto` com auto-scroll (`LiveMatch.jsx:313`) e limite de DOM
  renderizado (`.slice(-120)`, `LiveMatch.jsx:277-278`).
- Placar e controles de playback **não são `position: sticky` de verdade**
  — ficam visíveis porque são `shrink-0` dentro de uma coluna flex com
  altura contida pelo `ModalShell` pai, não por CSS sticky explícito. Hoje
  funciona, mas é um contrato implícito e frágil — uma mudança futura no
  `ModalShell`/altura do container pode quebrar isso silenciosamente sem
  nenhum teste acusando.
- No fluxo de partida de treino (`SimulationModal.jsx:124`), o override de
  altura da fase "live" é `md:`-only — mobile recebe só o `max-h` padrão
  do `ModalShell`. No fluxo de torneio (`TournamentModal.jsx:531`) o
  override já é explícito sem gate de breakpoint. Duas rotas de código
  diferentes para o mesmo problema — vale conferir em dispositivo real que
  ambas mantêm os controles ao alcance do polegar em 375-414px.
- Tática/Treinador/Stats já são abas inline (não modais aninhados), então
  não competem por espaço de overlay dentro de overlay.
- Recap pós-partida (`MatchRecapPremium.jsx`) é coluna única, larguras
  fixas pequenas (`4rem`/`4.5rem`), seguro em 375px.
- **Achado central**: os problemas de Partidas não são de layout — são de
  **touch target** (P1 §5.2.3) e de **persistência/lifecycle** (P1
  §5.2.2). O formato geral (coluna única, abas, narração contida) já está
  correto para mobile.

---

## 12. Modais — ver §9.

## 13. Touch — ver §10.

## 14. Safe areas

Cobertura confirmada via grep de `env(safe-area-inset-*)` em todo `src/`:

| Elemento | Safe-area? | Evidência |
|---|---|---|
| Bottom nav | ✓ bottom | `BottomNav.jsx:62` |
| Conteúdo principal (compensação da bottom nav) | ✓ bottom | `AppLayout.jsx:287` |
| `BottomSheet` (painel + rodapé) | ✓ bottom | `BottomSheet.jsx:41,58` |
| `ModalShell`/`BottomSheet` rodapé compartilhado | ✓ bottom | `index.css:726` |
| FAB de ajuda/assistente (`OnboardingGuide`, `CareerAssistant`) | ✓ bottom+right | `OnboardingGuide.jsx:153,159`, `CareerAssistant.jsx:119` |
| `FloatingUtilityRail` (botão(ões) flutuantes utilitários) | ✓ top+right | `FloatingUtilityRail.jsx:20` |
| `sheet.jsx` (shadcn, não confirmado em uso) | ✓ bottom | `sheet.jsx:38` |
| **Header mobile fixo** | **✗ não encontrado** | `AppLayout.jsx:225` — P2 §5.3.13 |
| **Toast/notificações** | **✗ não encontrado** (nem top nem bottom) | `toast.jsx:6-22` — P1 §5.2.6-7 |
| `DrawerShell` | ✗ não encontrado | P3 §5.4.7 |

Padrão geral: tudo que foi construído considerando mobile desde a Fase 7/8
(bottom nav, bottom sheet, FABs) tem safe-area correta. As duas lacunas
reais (header mobile, toasts) são exatamente os dois componentes que
**não foram tocados** nas fases de redesign anteriores.

---

## 15. Teclado virtual

Não foi encontrado nenhum padrão de `position: fixed` centralizado
competindo com teclado, nem formulário com campo colado à borda inferior
sem margem. A maior parte dos formulários do app está dentro de
`ModalShell` (que já usa `dvh` e `overflow-y-auto`), o que empurra o
conteúdo para cima naturalmente quando o teclado abre. Não foi possível
validar isso em dispositivo real nesta auditoria (somente leitura de
código) — recomenda-se teste manual em Android real na auditoria visual
instalada, especialmente em modais de formulário mais longos (ex.:
`CharacterEditor`, negociações de parceiro/patrocínio).

---

## 16. Android Back

Ver P1 §5.2.1 — achado mais importante da auditoria em termos de
abrangência (afeta o app inteiro, não uma tela). Zero tratamento em JS
(`popstate`, `history.back`, `hardwareBackPress`) e zero em Rust
(`src-tauri/src/lib.rs` tem 8 linhas, sem listener de janela/back-press).
Hierarquia esperada pelo usuário Android (modal → fecha modal; bottom
sheet → fecha; subtela → volta; home → comportamento do sistema) **não
está implementada** — hoje o botão voltar cai no comportamento padrão do
WebView/histórico do `BrowserRouter`, que pode não coincidir com o overlay
visualmente aberto.

---

## 17. Persistência

Pipeline em camadas, todas verificadas:

```
TauriStorage (plugin-fs, BaseDirectory.AppData, rejeita paths absolutos/Windows)
  → GameStorage (JSON + escrita atômica com verificação de round-trip + lock por arquivo)
    → CareerRepository (careers/<id>.json, careers-index.json, backups/)
      → CareerManager (create/load/save/rename/duplicate/delete/archive/import/export)
        → ActiveCareerAdapter.mutateActiveCareer() (fila serializada, salva a cada mutação)
```

- **Nenhum caminho hardcoded de Windows** encontrado (`C:\`, `%APPDATA%`,
  `path.join` do Node) fora de scripts de teste que rodam via `node`, não
  dentro do runtime Tauri.
- `TauriStorage.normalizeRelativePath()` **rejeita ativamente** paths
  absolutos, letras de drive e `..` — defensivo por design, não por sorte.
- `mutateActiveCareer()` (`ActiveCareerAdapter.js:187-218`) persiste a
  maioria das mutações de gameplay de forma síncrona a cada ação —
  propriedade forte de resiliência a encerramento abrupto, **exceto** a
  partida ao vivo (P1 §5.2.2, que só persiste ao final).
- Versionamento de save via `CAREER_SAVE_SCHEMA_VERSION = 17`, migração
  automática sequencial (`CareerMigration.js:16-341`) a cada load — deve
  sobreviver normalmente a updates de app no Android (dado privado do app
  preservado em update in-place, desde que o `applicationId`
  `com.padellegacy.game` não mude).
- `tauri-plugin-store` está registrado mas não é usado do lado JS —
  configuração morta (P2 §5.3.12), não risco.
- `localStorage` usado só para preferências não-críticas (P2 §5.3.10) —
  nenhum dado de carreira depende dele.

---

## 18. Lifecycle

- Nenhum uso de `@tauri-apps/api` (lifecycle nativo do Tauri:
  `appWindow`, `onResumed`, `listen`) em lugar nenhum do código — toda
  consciência de lifecycle vem de APIs web padrão (`visibilitychange`,
  `beforeunload`, `focus`/`blur`).
- Listeners existentes (`BetaAnalyticsTracker.jsx:31-32`,
  `useAdaptivePerformance.js:41,47`, mais 3 pares de refresh-on-focus em
  Comunicações/Bell/Inbox) são todos de **telemetria ou refresh de
  leitura** — nenhum grava a carreira ativa.
- `beforeunload` (usado só para finalizar sessão de analytics) não tem
  garantia de disparo quando o Android mata um processo em background —
  convenção de navegador desktop, não uma garantia mobile.
- Risco central já coberto em P1 §5.2.2: nada no lifecycle flush a
  partida em andamento nem qualquer estado de formulário não commitado em
  um modal aberto no momento de um kill de processo.

---

## 19. Performance

- Listas grandes (Ranking, potencialmente Atletas) já usam paginação por
  lote (`LIST_PAGE_SIZE = 50` em `Ranking.jsx`) em vez de renderizar tudo.
- `LiveMatch` já limita narração renderizada a 120 eventos
  (`LiveMatch.jsx:277-278`) — proteção de perf já existente no fluxo mais
  sensível.
- `useAdaptivePerformance` já deriva `lowPower` de
  `hardwareConcurrency`/`deviceMemory`/`connection.saveData` e gate
  `allowDecorativeMotion`/`allowRoutePreload` — infraestrutura correta
  para smartphones intermediários, já existente antes desta auditoria.
- Achado negativo real: `pl-auto-contain` (`content-visibility: auto`)
  nunca é aplicado (P2 §5.3.6) — otimização de performance v36.4.3 morta,
  é a causa do `test:performance-responsive-v36` falhar hoje (ver §22).
- Não foi encontrada virtualização de lista (`react-window`/similar) em
  nenhuma tela — não é um problema hoje dado o paginado em lotes de 50,
  mas telas como Atletas/Enciclopédia (não verificadas, `⚠`) devem ser
  conferidas quanto ao tamanho de dataset antes de assumir que está OK.

---

## 20. Tauri / plugins

| Plugin | Windows | Android | iOS | Status |
|---|---|---|---|---|
| `tauri-plugin-fs` / `@tauri-apps/plugin-fs` | ✅ | ✅ | ✅ | **COMPATÍVEL** — em uso ativo, é a base de todo o save system |
| `tauri-plugin-store` | ✅ | ✅ | ✅ | **COMPATÍVEL** mas não usado do JS — configuração morta |

Nenhum plugin desktop-only (window-state, system-tray, global-shortcut,
updater etc.) está presente — base de plugins já é 100% portável.

`capabilities/default.json`: um único capability file (`default`), sem
split por plataforma, permissões todas escopadas a `$APPDATA`/`$APPDATA/**/*`
— resolve corretamente por plataforma via abstração do Tauri, sem
necessidade de arquivo separado para Android/iOS.

`AndroidManifest.xml`: única permissão é `INTERNET` (ligada a thumbnails
remotas decorativas, P3 §5.4.4) — manifest já é mínimo, nada para reduzir
além disso.

---

## 21. Regressões desktop

**Nenhuma** — esta auditoria foi 100% somente-leitura (grep/Read via
agentes `Explore`, sem `Edit`/`Write` em nenhum momento). `git status`
confirma zero arquivos modificados pela auditoria em si (o diff pendente
de 43 arquivos visto no repositório é integralmente da Fase 8, já
reportada e aprovada antes desta auditoria começar).

Pontos a vigiar quando as correções mobile forem implementadas (Fase
futura), para não regredir o Windows:
- Mudanças em `useOverlayBehavior`/`ModalShell` para tratar Android Back
  precisam ser condicionais por plataforma ou usar uma abstração que não
  afete o comportamento de teclado desktop (`Escape` já funciona hoje).
- Ajustes de toast (offset de header/bottom-nav) devem usar as mesmas
  classes `md:`/`sm:` já existentes para não alterar a posição no
  desktop (`sm:bottom-0 sm:right-0` já é o comportamento desktop atual e
  deve ser preservado).
- Aumentar touch targets em `LiveMatch` não deve mudar o layout/densidade
  visual no desktop — usar variantes responsivas (`sm:` menor, mobile
  maior), não um valor único.
- Trocar `min-w-[420px]`/`min-w-[520px]` (StaffPanel/PartnerOffersPanel)
  por layouts responsivos precisa preservar a densidade de informação
  atual no desktop acima de `sm`/`md`.

---

## 22. Validação executada

| Comando | Resultado |
|---|---|
| `npm run lint` | ✓ limpo (`eslint . --quiet`, sem output) |
| `npm run typecheck` | 2527 linhas de diagnóstico — **idêntico ao baseline** do fim da Fase 8 (nenhuma mudança, pois nenhum arquivo foi editado) |
| `npm run build` | ✓ sucesso, 49.5s, mesmo warning pré-existente de import misto em `MedicalCenterManager.js` |
| `npm run test:ui-quality` | ✓ PASS — 618 arquivos UTF-8 verificados |
| `npm run test:performance-responsive-v36` | ✗ **FAIL** (pré-existente) — `Page.jsx` não contém `pl-auto-contain`. Causa raiz identificada nesta auditoria: a classe existe em `index.css:788,806` mas nunca foi conectada a nenhum componente (P2 §5.3.6) — não é uma regressão desta sessão (`git status` confirma `Page.jsx` e o script de teste sem diff) |
| `npm run test:viewport-overlays-rc1` | ✓ PASS 9/9 |
| `npm run test:global-overlays` | ✓ PASS 88/88 |
| `npm run test:vite-config` | ✓ PASS |
| `npm run test:dev-server-config` | ✓ PASS |
| `npm run test:ui-shell` | ✓ PASS — 89 verificações (navegação, sidebar, bottom nav, header, sino, assistente, rotas) |
| `npm run test:ui-redesign` | ✓ PASS — 180 verificações |

**1 falha, pré-existente, causa raiz documentada** (não corrigida por
instrução explícita de não implementar nada nesta etapa). Nenhuma
regressão nova introduzida — confirmado tanto por `git status` (zero
arquivos alterados) quanto pelos números de typecheck idênticos ao
baseline pós-Fase 8.

---

## 23. Recomendações

1. **Resolver no nível de infraestrutura/design system, não página a
   página** (maior alavancagem):
   - Android Back: um hook central (ex. estender `useOverlayBehavior` ou
     um listener global de `popstate` coordenado com o estado de overlays
     abertos) resolve o P1 mais abrangente do relatório de uma vez para
     os 40 arquivos que usam `ModalShell`/`BottomSheet`/`DrawerShell`.
   - Toast: mover offset/safe-area para `toast.jsx`/`toaster.jsx` resolve
     2 P1 (header e bottom-nav) numa única mudança central.
   - Touch targets: um novo `size` no `Button`/`IconButton` do design
     system (ou elevar o mínimo do `size="touch"` existente) evita
     reinventar isso em cada tela.
   - `pl-auto-contain`: conectar a classe já escrita em `Page.jsx` resolve
     o P2 de performance e destrava o teste falho hoje.
   - `100vh` → `dvh`: 3 ocorrências pontuais em `index.css`, troca
     mecânica e de baixo risco.
2. **Resolver por página** (menor alavancagem, mas concentrados e
   específicos): `StaffPanel.jsx` (min-w-420px), `PartnerOffersPanel.jsx`
   (tabela → cards), `TrainingCenter.jsx` (stat bar), `Ranking.jsx`
   (busca + truncamento do pódio).
3. Abrir as 14 páginas `⚠` individualmente antes de assumir que estão OK
   para mobile — não foram tocadas em nenhuma fase até aqui.
4. Antes de investir em correção de UI, considerar uma correção de maior
   prioridade de produto: **checkpoint de partida ao vivo** — mesmo um
   snapshot leve a cada game/set já eliminaria o pior risco de perda de
   progresso do app em Android.
5. Validar em dispositivo Android real (não só leitura de código): teclado
   virtual em formulários longos, header mobile sob status bar/notch,
   comportamento de fato do botão voltar hoje (para confirmar a hipótese
   de "cai no histórico do WebView" descrita em §16).
6. Quando o alvo iOS existir, repetir a checagem de safe-area em
   dispositivo/simulador real — notch e Dynamic Island tornam a lacuna de
   toast (P1 §5.2.6) potencialmente mais visível no iOS do que em muitos
   Android.

---

## 24. Plano de implementação proposto (M1 → M13)

Não implementado nesta etapa — proposta de sequenciamento para quando a
correção for autorizada.

| Fase | Escopo | Por quê nesta ordem |
|---|---|---|
| **M1 — Foundation mobile** | Tokens/infra de baixo risco e alta alavancagem: `dvh` em vez de `100vh`, conectar `pl-auto-contain`, elevar touch-target mínimo no design system | Mudanças mecânicas, sem risco de regressão visual, destravam o teste já falho |
| **M2 — Shell/Header/Bottom Nav** | Android Back (infra central), safe-area no header mobile, safe-area + offset no toast | Maior alavancagem do relatório — 2 P1 que afetam o app inteiro de uma vez |
| **M7 — Partidas** *(recomendado antes de M3-M6, ver nota)* | Touch targets de `LiveMatch`, checkpoint de persistência da partida em andamento, sticky explícito para placar/controles | Maior risco de produto (perda de progresso) e maior densidade de interação do app |
| **M3 — Home** | CareerHub — já é `✓`, só QA visual | Baixo risco, confirma que a base está correta antes de seguir |
| **M4 — Carreira/Atleta** | Abrir as páginas `⚠` (CharacterEditor, Missions, Relationships, Fans) | Zona de risco desconhecida, precisa virar conhecida |
| **M5 — Treinos** | `TrainingCenter.jsx` stat bar | Achado específico já mapeado (P2) |
| **M6 — Competições** | `StaffPanel.jsx`, `PartnerOffersPanel.jsx`, `Ranking.jsx` (busca/pódio) | 2 dos 7 P1 do relatório, concentrados aqui |
| **M8 — Mundo/Gestão** | Abrir páginas `⚠` restantes (Athletes, Clubs/ClubDetail, Encyclopedia, Economy) | Idem M4, zona desconhecida |
| **M9 — Modais/Overlays** | Classificar item a item os 14 modais de detalhe não abertos nesta auditoria (§9); `PartnerOffersPanel` tabela → cards | Depende do Android Back de M2 já estar pronto |
| **M10 — Persistência/Lifecycle** | Se M7 não cobrir tudo: revisão geral de flush em `visibilitychange`/lifecycle Tauri | Pode ser absorvido em M7 se o checkpoint de partida for generalizado |
| **M11 — Performance** | Auditoria de dataset de Atletas/Enciclopédia, revisão de `text-[8-10px]` | Polimento, menor urgência |
| **M12 — QA Android real** | Validar em dispositivo físico tudo que só pôde ser inferido por leitura de código: teclado virtual, back button de fato, header sob status bar | Fecha as lacunas "não confirmado em dispositivo" desta auditoria |
| **M13 — Preparação iOS** | Repetir checagem de safe-area/plugins em simulador iOS | Nenhum bloqueador de plugin encontrado; só falta validação real |

**Recomendação de primeira fase a executar: M1 seguido de M2.** Justificativa: M1 é mecânico e de baixíssimo risco (destrava um teste, troca 3 unidades CSS, ajusta um token de tamanho), e M2 resolve os 2 achados P1 de maior abrangência (Android Back e Toast) numa única frente de trabalho, antes de qualquer correção página-a-página. M7 (Partidas) deve vir logo em seguida, antes de M3-M6, por ser o maior risco de produto (perda de progresso do jogador), mesmo não sendo o "M2" da numeração sugerida originalmente.
