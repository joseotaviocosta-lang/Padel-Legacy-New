# Auditoria UI/UX — Fase 1 (Redesign Visual 2.0)

Data: 2026-08-12
Versão auditada: `0.9.0-rc.1.9` (branch `feature/live-coach-dynamic-adaptation`)
Escopo: somente diagnóstico. Nenhum arquivo de produto foi alterado nesta fase.

## 0. Achado mais importante: isto não é um projeto greenfield

Antes de qualquer recomendação, o ponto central desta auditoria: **o Padel Legacy já passou por várias rodadas de trabalho de UI premium** (`test:design-system-v33`, `test:premium-*-v33`, `test:ux-home-v36-3-1`, `test:ux-interfaces-v36-3-2`, `test:polish-ui-v36-4-1`, `test:motion-v36`, `test:performance-responsive-v36-4-3`) e por duas auditorias de performance/arquitetura anteriores (`docs/AUDITORIA-DESEMPENHO-ARQUITETURA-FLUXO-DADOS.md`, 2026-08-03; `docs/PROJECT-CLEANUP-AUDIT-RC.md`, 2026-08-10). Já existem:

- Design tokens centralizados (`src/design/tokens.js`) e uma pasta `src/components/design-system/` com 16 componentes reutilizáveis.
- Navegação já agrupada em macroáreas (`src/navigation/navigationConfig.js`, 6 áreas) com sidebar retrátil, drawer mobile e header dividido em hubs (`NavigationHub.jsx`, `WorldHub.jsx`).
- Lazy loading por rota (`src/lib/routeModules.js`), redução de bundle de 2.294 kB → atual ~1.218 kB, remoção completa do 2D/replay antigo.
- Um hook de performance adaptativa (`useAdaptivePerformance`) que já desliga animações decorativas e preload em dispositivos fracos.
- Um `ModalShell`/`DrawerShell` com `max-height`/`overflow-y` seguros por padrão — o incidente antigo da Central BETA subindo para fora da tela **já foi corrigido** ao migrar `BetaTools.jsx`/`BetaWelcome.jsx` para `ModalShell`.

**Implicação prática:** a Fase 3 (Shell) e boa parte da Fase 2 (Design System) do pedido original não partem do zero — partem de uma reforma incompleta. O trabalho real não é "criar" essas camadas, é **consolidar duas implementações concorrentes em uma só** e **estender a cobertura** a páginas que ficaram de fora da rodada v33/v36. Isso muda a ordem de prioridade das fases seguintes (ver seção 8).

---

## 1. Problema #1: dois (na prática três) design systems convivendo

| Biblioteca | Local | Linhas | Adoção | Papel pretendido |
|---|---|---:|---:|---|
| **Oficial** — `design-system/` | `src/components/design-system/*.jsx` | 1004 | ~73 arquivos (29%) | Fonte única (Page, PageHeader, StatCard, StatusBadge, Surface, EmptyState, LoadingState, ModalShell, DrawerShell, ProgressBar…) |
| **Sombra** — `padel/ui.jsx` | `src/components/padel/ui.jsx` | 281 | ~62 arquivos (24%) | Reimplementa `LoadingScreen`, `PageHeader`/`SimpleHeader`, `PageContainer`, `GlassCard`, `EmptyStateCard`, `TabBar`/`FilterPills`, `PrimaryButton`/`GhostButton`/`LinkPill`, `InfoBanner` |
| **Sombra 2** — `padel/GameShared.jsx` + `padel/Shared.jsx` | `src/components/padel/*.jsx` | 195 | dezenas | `SectionCard`, `EmptyState`, `ProgressBar`, `StatCard`, ícones de atributo — dupes diretos de peças do design-system |

36 arquivos importam **das duas** ao mesmo tempo. O exemplo mais claro é a própria Home:

```
src/pages/CareerHub.jsx
  import { StatCard, getAttributeIcon } from '@/components/padel/Shared';
  import { Page, PageContent, PageHeader, StatCard as PremiumStatCard, StatusBadge } from '@/components/design-system';
  import { SectionCard, EmptyState, ProgressBar } from '@/components/padel/GameShared';
  import { LoadingScreen, EmptyStateCard, GlassCard } from '@/components/padel/ui';
```

Um único arquivo usa **dois `StatCard` diferentes** (um deles renomeado para não colidir), dois conceitos de `EmptyState` e dois de `Card`. Isso não é um problema cosmético isolado — é a causa raiz de boa parte da inconsistência visual que o pedido de redesign descreve ("caixas dentro de caixas", "aparência de dashboard administrativo"): páginas que só tiveram acesso ao `padel/ui.jsx` nunca receberam o tratamento visual premium que o design-system oficial já oferece.

Outros duplicados pontuais encontrados:
- `src/components/coaches/CoachCard.jsx` — define seu próprio `Badge({ children, tone })` em vez de `StatusBadge`.
- `src/components/system/BetaTools.jsx` (706 linhas, o maior componente do projeto) não usa nenhuma peça do design-system além do `ModalShell` que o envolve.

**Correção proposta (Fase 2):** aposentar `padel/ui.jsx`, `padel/GameShared.jsx` e `padel/Shared.jsx`, migrando cada consumidor para o equivalente oficial (mapa 1:1 abaixo), e não criar nenhum componente novo fora de `design-system/`.

| Sombra | Substituir por |
|---|---|
| `LoadingScreen` | `LoadingState` / `PageSkeleton` |
| `PageContainer`, `SimpleHeader` | `Page`, `PageHeader` |
| `GlassCard` | `Surface` |
| `EmptyStateCard` | `EmptyState` |
| `TabBar`, `FilterPills` | `ui/tabs.jsx` (padronizado) |
| `PrimaryButton`, `GhostButton`, `LinkPill` | `ui/button.jsx` (variants primary/secondary/ghost) |
| `InfoBanner`, `ResultFeedback` | `ActionFeedback` |
| `SectionCard` (GameShared) | `Surface` + `PageHeader` de seção |

---

## 2. Páginas mais distantes do design system (candidatas prioritárias)

Ranqueadas pela distância real ao sistema oficial (uso só de bibliotecas-sombra ou nenhuma):

1. `src/pages/CareerManager.jsx` (627 linhas, a maior página do projeto) — só `padel/ui`
2. `src/pages/Admin.jsx` — só `padel/ui`
3. `src/pages/DatabaseManager.jsx` — só `padel/ui`
4. `src/pages/TrainingCenter.jsx` — só `padel/ui`
5. `src/pages/Season.jsx` — só `padel/ui`
6. `src/pages/Weather.jsx`, `src/pages/NavigationHub.jsx` — só `padel/ui`
7. `src/pages/Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx` — nenhum dos dois sistemas (visual pré-DS)
8. `src/pages/Tournaments.jsx` (626 linhas), `src/pages/PartnerHub.jsx` (571), `src/pages/Shop.jsx` (558) — densas, muitas abas, sistemas misturados

Essas são exatamente as telas que hoje mais "parecem administrativas" — confirmando o diagnóstico do pedido original, mas por uma causa concreta e corrigível (acesso à biblioteca errada), não por falta de um design system.

---

## 3. Mapa de navegação atual

### Rotas → macroáreas (já existente em `navigationConfig.js`)

| Área (id) | Rota do hub | Itens |
|---|---|---|
| **Início** (`career`) | `/game` (`CareerHub`, é a Home) | Comunicações, Perfil, Missões, Aparência, Conquistas, Estatísticas, Legado |
| **Desenvolvimento** (`development`) | `/development` (`NavigationHub`) | Treinos, Centro de treinamento, Equipamentos, Loja |
| **Dupla e relações** (`team`) | `/team-hub` (`NavigationHub`) | Dupla/propostas, Treinador, Comissão técnica, Relacionamentos, Imprensa, Fãs |
| **Competições** (`competition`) | `/competitions` (`NavigationHub`) | Torneios, Calendário, Partidas, Ranking, Temporada |
| **Mundo** (`world`) | `/world` (`WorldHub`) | Notícias, Eventos mundiais, Mercado mundial, Clima, Atletas, Clubes, Comunidade, Enciclopédia, História, Hall da fama |
| **Gestão** (`management`) | `/management` (`NavigationHub`) | Economia, Administração, Banco de dados |

Isso já é essencialmente a "macroárea" pedida no briefing (Início/Carreira/Competir/Mundo/Mais), só com nomes e contagem ligeiramente diferentes (6 áreas em vez de 4-5, "Mais" fica dividido entre Gestão + itens secundários dentro de cada área).

### Inconsistência real encontrada: BottomNav ≠ navigationConfig

`src/components/BottomNav.jsx` (mobile) hard-codeia **5 itens**: Carreira, Evoluir, Dupla, Competir, Mundo — mas `navigationConfig.js` tem **6 áreas**. A área **Gestão** (Economia, Admin, Banco de dados) não existe na barra inferior; só é alcançável a partir de um hub. Em desktop a sidebar mostra as 6; em mobile faltam 3 telas inteiras da navegação persistente. Isso é uma quebra de paridade desktop/mobile que o pedido pede explicitamente para evitar ("não apenas diminuir a versão desktop").

### Rotas confirmadas ativas (fonte: `docs/PROJECT-CLEANUP-AUDIT-RC.md`, auditado há 2 dias)

47 rotas ativas, sem rotas órfãs relevantes; `/world-tour/live`, `/live-circuit` e `/social` já são redirects de compatibilidade — não remover. `/career-hub` é alias antigo mantido por compatibilidade, marcado "REVIEW" na auditoria anterior — decisão de mantê-lo ou não é do usuário, não desta fase.

---

## 4. Home (`CareerHub.jsx`) — já premium, mas sobrecarregada

A Home já usa o design-system oficial (`PageHeader`, `StatusBadge`, `StatCard`) e tem componentes bem construídos individualmente. O problema não é falta de polish — é **volume**. Em uma única rolagem, a Home empilha, em sequência:

`CareerCommandHeader` → banner de torneio ativo (condicional) → card de relatório anual (condicional) → card de relatório mensal (condicional) → `MyJourneyPanel` → `CareerFeed` → `CareerMomentBanner` → `DailyCareerBriefing` → `CareerDecisionCenter` → `WeeklyCareerReview` → `SeasonCareerPlan` → `StrategicCareerPanel` → `PremiumQuickStats` (5 stat cards) → `StatusStrip` → aviso de tutorial (condicional) → `MedicalStatusPanel` → `MedicalCenterPanel` → grid de 2 colunas com `NextStepCard` + `SmartAgenda` + `CareerCalendar` + `WorldPulse` + `TournamentAndNews` + `RecentActivity` na coluna principal, e `InboxControl` + `EvolutionPanel` + `ActiveMissionPanel` + `CareerSnapshot` na lateral → `CareerStatusBar`.

Isso é ~20 seções/painéis distintos. É exatamente o antipadrão descrito na seção 9 do pedido ("hoje ela não deve simplesmente mostrar vários cards") — só que aqui cada card individual já é bonito; o problema é a ausência de hierarquia entre eles. Um jogador não consegue responder "o que eu faço agora?" em 3 segundos porque tudo compete pela mesma atenção.

**Direção recomendada para a Fase 4 (não implementar ainda):** manter os componentes existentes (são funcionalmente ricos e testados — `WeeklyCareerReview`, `SeasonCareerPlan`, `StrategicCareerPanel`, `CareerDecisionCenter` etc. representam lógica de carreira real, não apenas UI), mas reorganizá-los sob progressive disclosure: 1 header de comando + 1 bloco "próxima ação" + 1 feed unificado acima da dobra, com os painéis analíticos (Weekly Review, Season Plan, Strategic Panel, Monthly/Annual reports) movidos para abas/seções expansíveis ou para dentro de `/game/stats` e `/game/legacy`, que já existem como destinos dedicados.

---

## 5. Problemas de desktop

- Nenhum problema crítico de layout foi encontrado na sidebar/header atuais — já são responsivos, com collapse persistido em `localStorage` e breakpoint `md:` consistente.
- O maior problema de desktop é de **densidade de conteúdo por página** (seção 4) e de **inconsistência visual entre páginas** (seção 1-2), não de quebra estrutural.
- Página de auth (`Login`/`Register`/etc.) está fora do design-system — provavelmente ainda no visual pré-v33.

## 6. Problemas de mobile

- **BottomNav incompleto** (seção 3) — área Gestão inacessível pela navegação persistente.
- Nenhum componente `BottomSheet` existe no projeto. `DrawerShell` cobre parte do caso de uso (menu lateral em drawer), mas ações contextuais (ex.: detalhe de item, confirmação) que no desktop abrem `ModalShell` centralizado, em mobile continuam abrindo o mesmo modal centralizado — não há um padrão de "sheet de baixo para cima" para mobile, que o pedido pede explicitamente (seção 7).
- `src/components/ui/sheet.jsx` existe (primitiva shadcn com variante `side="bottom"`) mas **não é usado por nenhum componente de feature** — está disponível, não adotado.

## 7. Problemas de performance visual (Gate de Performance)

Resumo — nenhum item é crítico hoje, mas há riscos claros para o que vem a seguir:

| Item | Estado atual | Risco para o redesign |
|---|---|---|
| Lista de Ranking (`Ranking.jsx`) | Paginada em lotes de 50 com "carregar mais", sem virtualização | OK hoje; se o redesign adicionar avatar/sparkline/motion por linha, 50 nós DOM decorados pode pesar — decidir por página antes de enriquecer visualmente |
| Polling | Só `CommunicationBell` roda para sempre (60s); `BetaTools` só faz polling com o painel aberto (15s) | Nenhuma ação necessária |
| `framer-motion` | Só 3 arquivos importam a lib; a única animação contínua (`repeat: Infinity`) é em `TrainingTimerModal.jsx`, escopada a um modal fechável | `allowDecorativeMotion`/`lowPower` (`useAdaptivePerformance`) só é consumido por `AppLayout.jsx` hoje — **nenhum outro componente respeita o modo de baixa performance**. Qualquer animação decorativa nova (glow pulsante na Home, brilho no pódio do Ranking) precisa ser explicitamente ligada a esse hook, ou dispositivos fracos herdam animação cara por padrão |
| Imagens/assets | Não existe `public/` nem `src/assets/` — zero imagens hoje, só ícones vetoriais `lucide-react` | O redesign de branding será a **primeira vez** que imagens reais entram no bundle. Precisa de orçamento de tamanho definido antes, não depois |
| `recharts` (374 kB) | Só importado dentro de rotas já lazy (`/game/stats`, `/game/training`, `/admin`) | OK, nenhuma ação necessária |
| `ModalShell`/`DrawerShell` | Já garantem `max-height` seguro | OK |
| `ui/dialog.jsx` (`DialogContent`) e `ui/sheet.jsx` (`SheetContent`) | **Sem** `max-height`/`overflow-y` embutidos | Risco latente: nenhum componente de feature usa essas primitivas diretamente hoje (tudo passa por `ModalShell`/`DrawerShell`), mas se a Fase 2/8 introduzir um novo BottomSheet sobre `sheet.jsx` sem herdar a mesma trava de altura, o bug antigo da Central BETA pode se repetir em um componente novo |

---

## 8. Proposta conceitual — Design System 2.0

Não é uma reconstrução do zero; é uma consolidação + preenchimento de lacunas sobre o que já existe em `src/design/tokens.js` e `src/components/design-system/`.

- **Tokens**: já cobrem cor, espaçamento, raio, motion, breakpoints e tipografia. Falta apenas formalizar a escala tipográfica para números esportivos grandes (ranking, dinheiro, XP) — hoje cada página escolhe seu próprio `text-2xl font-black tabular-nums` manualmente; vale promover isso a um token/variante nomeada (`typography.statLarge`) em vez de repetir a classe.
- **Componentes**: manter o inventário atual (`Page`, `PageHeader`, `Surface`, `StatCard`, `StatusBadge`, `EmptyState`, `LoadingState`, `PageSkeleton`, `ProgressBar`, `ModalShell`, `DrawerShell`, `ActionFeedback`, `IconFrame`, `TooltipHint`, `Motion`) e **adicionar** o que falta explicitamente no pedido e não existe hoje: `Button`/`IconButton` com níveis Primary/Secondary/Ghost/Danger formalizados (hoje `ui/button.jsx` existe mas convive com `PrimaryButton`/`GhostButton` da biblioteca-sombra), `Badge` unificado (hoje `ui/badge.jsx` + `StatusBadge` + `Badge` local do CoachCard fazem a mesma coisa), `BottomSheet` para mobile (compor sobre `ui/sheet.jsx`, herdando a mesma trava de altura do `ModalShell`), `Dropdown`/`Tabs` padronizados substituindo `TabBar`/`FilterPills`.
- **Não remover** nada da lógica de carreira/gameplay que essas peças encapsulam — a consolidação é só na camada visual (className/markup), os componentes de feature (`CareerDecisionCenter`, `SmartAgenda`, etc.) continuam recebendo os mesmos dados e chamando as mesmas funções de `src/lib`/`src/game-core`.

## 9. Proposta conceitual — Logo

Estado atual: **não existe logo real**. A marca hoje é (a) um "P" maiúsculo dentro de um quadrado colorido, renderizado inline em `AppLayout.jsx` (não é SVG, é `<span>` com CSS), e (b) o favicon do `index.html` aponta para um SVG de terceiros (`https://base44.com/logo_v2.svg`) — ou seja, o app hoje usa a marca da plataforma de hospedagem como ícone, não a própria. Os ícones do Tauri (`src-tauri/icons/`) têm só 4 arquivos, faltando os tamanhos 16/64/256/512, com pesos de 353B–6.6KB que sugerem placeholders gerados automaticamente, não arte real.

Conceito proposto para a Fase 9 (não implementar agora):
- Símbolo abstrato combinando um "P" anguloso com a diagonal de uma raquete de padel e um ponto (bola) — construível em SVG puro, sem gradientes complexos, reconhecível em 16px.
- Versão "L" de legado incorporada como uma pequena barra/degrau ascendente sob o símbolo, reforçando "progressão/carreira" sem virar um segundo elemento concorrente.
- Entregáveis: `symbol.svg` (mark sozinho), `wordmark-horizontal.svg` ("PADEL LEGACY" ao lado do symbol), `wordmark-compact.svg`, versão monocromática (para watermarks/impressão), versão para fundo escuro (a atual, já que o app é dark-first) e versão para fundo claro (para materiais externos).
- Pipeline de ícones: gerar os PNG/ICO faltantes (16/32/64/128/256/512 + `icon.ico` multi-resolução) a partir do SVG mestre; **manter os 4 ícones atuais como fallback** até os novos serem validados, exatamente como o pedido exige — nunca quebrar `tauri build` por causa disso.
- Favicon: substituir a referência externa `base44.com/logo_v2.svg` por um `favicon.svg`/`favicon.ico` próprio versionado no repo; criar o `public/manifest.json` que hoje é referenciado no `index.html` mas não existe no código-fonte (só existe como artefato gerado em `dist/`).

## 10. Arquivos que a Fase 2 em diante deve tocar (não nesta fase)

Infraestrutura de design system:
- `src/design/tokens.js` — extensão pontual (tipografia de stats).
- `src/components/design-system/*` — novos: `Button.jsx`/`IconButton.jsx`, `Badge.jsx`, `BottomSheet.jsx`, `Tabs.jsx`, `Dropdown.jsx`.
- `src/components/padel/ui.jsx`, `padel/GameShared.jsx`, `padel/Shared.jsx` — migração e remoção gradual (não deletar de uma vez; migrar consumidor por consumidor).
- `src/components/ui/dialog.jsx`, `src/components/ui/sheet.jsx` — adicionar trava de `max-height`/`overflow-y` nas primitivas base, para que qualquer uso futuro herde segurança mesmo sem passar por `ModalShell`.

Shell/navegação (Fase 3):
- `src/components/BottomNav.jsx` — resolver paridade com as 6 áreas de `navigationConfig.js`.
- `src/navigation/navigationConfig.js` — possível renomeação/reagrupamento (decisão do usuário antes de mexer, já está estruturalmente próximo do pedido).
- `src/components/AppLayout.jsx` — trocar o "P" em `<span>` pelo SVG real assim que existir (Fase 9), sem alterar a lógica de collapse/drawer.

Home (Fase 4):
- `src/pages/CareerHub.jsx` e os ~20 subcomponentes que ele importa — reorganizar hierarquia visual, não a lógica de dados.

Páginas prioritárias de consolidação visual (Fase 6-8, ordem sugerida pela distância ao DS):
- `src/pages/CareerManager.jsx`, `Admin.jsx`, `DatabaseManager.jsx`, `TrainingCenter.jsx`, `Season.jsx`, `Weather.jsx`, `NavigationHub.jsx`, `Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `Tournaments.jsx`, `PartnerHub.jsx`, `Shop.jsx`.

Branding (Fase 9):
- Novo: `src/assets/brand/*.svg` (mestre), `public/` (criar — não existe hoje), `public/favicon.svg`, `public/manifest.json`.
- `index.html` — favicon local, `theme-color`, `apple-touch-icon`.
- `src-tauri/icons/*`, `src-tauri/tauri.conf.json` — regenerar ícones a partir do SVG mestre, mantendo fallback.

Testes/gates (Fase 8/final, conforme pedido original):
- Novo `scripts/test-ui-redesign.mjs` (→ `npm run test:ui-redesign`).
- Novo `scripts/test-ui-performance.mjs` (→ `npm run test:ui-performance`), reaproveitando os scripts de performance já existentes (`test:performance-responsive-v36`, `test:runtime-performance-rc1`, `test:performance-deep-rc1`) como base em vez de duplicar medições.

---

## 11. O que esta auditoria explicitamente NÃO recomenda

- Não recomendo reescrever `NAVIGATION_AREAS`/sidebar/BottomNav do zero — a estrutura já atende ao objetivo de "reduzir decisões visíveis simultaneamente"; o ajuste é paridade mobile/desktop, não redesenho estrutural.
- Não recomendo remover nenhum dos ~20 painéis da Home — eles encapsulam lógica de carreira real (`WeeklyCareerReview`, `SeasonCareerPlan`, `StrategicCareerPanel`, `CareerDecisionCenter`); a mudança é de exibição/hierarquia, não de exclusão de funcionalidade.
- Não recomendo tocar em `ModalShell`/`DrawerShell` além de extensões — já resolvem o requisito de segurança de altura.
- Não recomendo migrar `Ranking.jsx` para virtualização agora — o padrão de paginação em lotes de 50 já é a mesma solução usada e validada no Mercado Mundial; só revisitar se o redesign visual das linhas ficar significativamente mais pesado.

---

## Próximo passo

Aguardando autorização para iniciar a **Fase 2 — Design System 2.0**, cujo primeiro passo prático seria a consolidação `padel/ui.jsx` → `design-system/` descrita na seção 1, por ser a mudança de maior alavancagem (afeta ~24% dos arquivos do projeto) e pré-requisito para qualquer trabalho visual nas fases seguintes.
