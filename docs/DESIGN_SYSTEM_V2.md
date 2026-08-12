# Design System 2.0 — Fase 2 (Consolidação)

Data: 2026-08-12
Baseado em: `docs/UI_UX_AUDIT.md` (Fase 1, mesma data)

## Princípio da fase

> O problema do Padel Legacy não era ausência de Design System — era fragmentação
> entre sistemas concorrentes.

Esta fase **não criou uma quarta biblioteca de UI**. Ela:

1. Preencheu lacunas reais em `src/components/design-system/` (Button, IconButton,
   Badge, Tabs, Dropdown, BottomSheet, PlayerAvatar, CountryFlag, RankingPosition,
   NotificationBadge, Section, BrandMark, política de motion).
2. Converteu `src/components/padel/ui.jsx`, `padel/GameShared.jsx` e `padel/Shared.jsx`
   de implementações paralelas em **adapters finos** sobre o design-system oficial —
   mesma API pública (nenhum dos ~150 call sites existentes precisou mudar), mas
   renderizando com os componentes oficiais por baixo.
3. Migrou 3 páginas piloto (simples/média/densa) diretamente para os imports
   oficiais, sem passar pelos adapters.

`src/components/design-system/` é agora a fonte oficial. As três bibliotecas-sombra
seguem instaladas — marcadas `@deprecated` — em processo controlado de aposentadoria
(ver seção "Dívida técnica restante").

## Matriz de migração

Contagens de uso via grep por arquivos que importam de cada módulo e citam o
símbolo (aproximado — mede consumidores reais, não ocorrências textuais soltas).

### `src/components/padel/ui.jsx`

| Componente atual | Usos | Equivalente oficial | Diferenças de API | Estratégia | Status |
|---|---:|---|---|---|---|
| `LoadingScreen` | 34 | `PageSkeleton` | Propósito diferente (spinner de tela cheia vs. esqueleto estruturado) | Mantido como está, marcado `@deprecated` — trocar por `PageSkeleton` teria mudado o comportamento visual de 34 telas de uma vez; migração feita caso a caso nas fases seguintes (2 dos 3 pilotos já trocaram para `PageSkeleton`) | MANTIDO (deprecated) |
| `PageContainer` | 5 | `Page` + `PageContent` | Padding/max-width levemente diferentes | Adapter: `PageContainer` agora renderiza `<Page size="default">` | ADAPTER |
| `PageHeader` | 39 | `PageHeader` (design-system) | Props incompatíveis: `subtitle`→`description`, `children`→`action`, `accent`(cor livre)→`tone`(enum semântico) | Adapter com mapa `ACCENT_TONE` (`primary→brand`, `amber→warning`, `cyan→info`, `purple→team`, `green→success`) | ADAPTER |
| `SimpleHeader` | 0 | `PageHeader` | — | **Removido** (0 usos confirmados, duplicata direta) | REMOVIDO |
| `GlassCard` | 28 | `Surface` | Nenhuma diferença relevante | Adapter: `variant={hover ? 'interactive' : 'default'}` | ADAPTER |
| `EmptyStateCard` | 34 | `EmptyState` | `message`→`description`, `title` opcional em ambos | Adapter direto | ADAPTER |
| `TabBar` | 7 | `Tabs` (novo) | Nenhuma — mesma forma `{tabs, activeTab, onTabChange, variant}` | Adapter direto | ADAPTER |
| `FilterPills` | 8 | — (sem 1:1) | Pílulas de filtro multi-seleção, não abas | Mantido com implementação própria; considerar `Tabs` variant="buttons" caso a caso | MANTIDO |
| `InfoBanner` | 3 | — (sem 1:1; `ActionFeedback` é para estado assíncrono, não aviso estático) | — | Reconstruído sobre `Surface` + `IconFrame` oficiais (mesma API, novo motor visual) | RECONSTRUÍDO |
| `PrimaryButton` | 2 | `Button` (`level="primary"`) | Nenhuma | Adapter direto | ADAPTER |
| `GhostButton` | 0 | `Button` (`level="ghost"`) | — | **Removido** | REMOVIDO |
| `SectionTitle` | 0 | `SurfaceHeader` | — | **Removido** | REMOVIDO |
| `LinkPill` | 0 | `Button` (`asChild`) | — | **Removido** | REMOVIDO |
| `ResultFeedback` | 0 | `ActionFeedback` | — | **Removido** | REMOVIDO |

### `src/components/padel/GameShared.jsx`

| Componente atual | Usos | Equivalente oficial | Estratégia | Status |
|---|---:|---|---|---|
| `RarityBadge` | 2 | — (tiers de raridade não mapeiam para os tons semânticos do `StatusBadge`) | Realinhado ao mesmo formato de pílula do `StatusBadge` (`h-6 rounded-full ... text-[10px] uppercase`), cores próprias mantidas | RECONSTRUÍDO (visual alinhado) |
| `CoinBadge` | 1 | — | Mantido (uso único, específico de moeda) | MANTIDO |
| `ProgressBar` | 3 | `ProgressBar` (design-system) | Adapter direto (prop `barClassName` era código morto — nunca recebia valor customizado, confirmado por grep) | ADAPTER |
| `XpBar` | 0 | — | Não é duplicata de nenhum primitivo oficial (composto específico de XP de carreira); fora do escopo desta consolidação | MANTIDO (fora de escopo) |
| `SectionCard` | 3 | `Section` (novo) | Adapter direto | ADAPTER |
| `EmptyState` | 4 | `EmptyState` (design-system) | Adapter (`message`→`title`, `compact`) | ADAPTER |
| `QuickLink` | 0 | — | Não é duplicata 1:1; fora do escopo | MANTIDO (fora de escopo) |
| `RARITY_STYLES` (dados) | usado por `Inventory.jsx`, `EquippedView.jsx` | — | Export de dados, não de componente — inalterado | MANTIDO |

### `src/components/padel/Shared.jsx`

| Componente atual | Usos | Equivalente oficial | Estratégia | Status |
|---|---:|---|---|---|
| `getAttributeIcon` | 6 (função utilitária) | — | Não é componente visual — inalterado | MANTIDO |
| `LevelBadge` | 2 | — | Pílula de nível sem tom semântico equivalente; fora do escopo | MANTIDO (fora de escopo) |
| `StatCard` | 3 (só `CareerHub.jsx`) | `StatCard` (design-system) | **Este é o caso citado na auditoria**: `CareerHub.jsx` usava este `StatCard` (ícone centralizado acima do valor) lado a lado com o `StatCard` premium do design-system (rótulo/valor/ícone horizontal) na mesma tela. Adapter traduz `accent` (classe de cor livre, ex. `text-cyan-400`) → `tone` semântico via heurística de substring | ADAPTER — **resolve a duplicação-bandeira da auditoria sem tocar em `CareerHub.jsx`** |
| `AttributeBar` | 2 | `ProgressBar` (com `label`/`valueLabel`) + `IconFrame` | Adapter compõe os dois primitivos oficiais | ADAPTER |
| `ProfileMini` | 0 | — | Widget composto, não duplicata 1:1; fora do escopo | MANTIDO (fora de escopo) |
| `AchievementBadge` | 0 | — | Específico de raridade de conquista; fora do escopo | MANTIDO (fora de escopo) |

**Critério usado para remover vs. manter um export com 0 usos:** só foi removido
quando (a) zero consumidores confirmados **e** (b) duplicava diretamente um
primitivo oficial já existente. Exports com zero uso mas sem duplicata 1:1
(`XpBar`, `QuickLink`, `ProfileMini`, `AchievementBadge`, `LevelBadge`) foram
mantidos intactos — não é escopo desta fase fazer limpeza geral de código morto,
só consolidar sistemas de UI concorrentes.

## Componentes fundamentais — novos nesta fase

Construídos em `src/components/design-system/`, todos life sobre primitivos já
existentes (Radix via `src/components/ui/*`) em vez de reinventar:

| Componente | Base | Notas |
|---|---|---|
| `Button` | `ui/button.jsx` | Formaliza os 4 níveis pedidos: `level="primary\|secondary\|ghost\|danger"` → mapeia para as variants já existentes do primitivo shadcn |
| `IconButton` | `Button` | Alvo de toque garantido; `size="touch"` = 44px |
| `Badge` | `StatusBadge` (alias) | Mesmo componente, nome genérico — não duplica |
| `Tabs` | `ui/tabs.jsx` (Radix) | Formaliza o padrão "pílula segmentada" antes duplicado em `TabBar`/`FilterPills`; navegação por teclado/ARIA de graça |
| `Dropdown` | `ui/dropdown-menu.jsx` (Radix) | Composição `{trigger, items}` em vez de recompor `DropdownMenuContent`/`Item` toda vez |
| `BottomSheet` | `useOverlayBehavior` (mesmo hook do `ModalShell`/`DrawerShell`) | Painel mobile que sobe do rodapé — herda scroll-lock/focus-trap/ESC/`max-height` automaticamente, não é um 4º sistema de overlay |
| `PlayerAvatar` | `ui/avatar.jsx` (Radix) | Consolida o padrão "círculo com gradiente + inicial" repetido em Ranking/PlayerProfile |
| `CountryFlag` | `FLAGS` de `src/lib/characterCatalog.js` | Reaproveita o mapa de bandeiras já usado na criação de personagem — não duplica dados |
| `RankingPosition` | — | Extrai o cálculo de posição/variação hoje duplicado em cada aba de `Ranking.jsx` |
| `NotificationBadge` | — | Formaliza o contador hoje hardcoded em `CommunicationBell.jsx` (ainda não trocado lá — ver dívida técnica) |
| `Section` | `Surface` + `SurfaceHeader` | Formaliza o padrão hoje duplicado como `SectionCard` |
| `BrandMark` | `src/assets/brand/logo-mark.svg` | Símbolo oficial — ver `docs/BRANDING.md` |

## Tokens

`src/design/tokens.js` ganhou `zIndex`, `shadows`, `transitions` e
`typography.statLarge`/`statHuge`, espelhando os valores que já existiam como
CSS custom properties em `src/index.css` (`--z-*`, `--shadow-color`,
`--motion-*`, `--ease-premium`). **Fonte de runtime continua sendo o CSS** — as
classes `pl-layer-*`, `pl-modal-*`, `pl-tone-*` etc. já aplicam esses valores
em todo o app. `tokens.js` existe para código JS que precisa do valor bruto
(ex.: um gráfico Recharts, ou lógica que decide comportamento por breakpoint).
Confirmado por grep: `tokens.js` não tinha nenhum consumidor antes desta fase —
mantido e estendido mesmo assim, como documentação JS-side de referência única,
não como sistema de geração de CSS.

## Política de motion — agora aplicada, não só medida

A auditoria encontrou que `allowDecorativeMotion`/`lowPower`
(`useAdaptivePerformance`) só era consumido por `AppLayout.jsx` — nenhum outro
componente respeitava o modo de baixa performance.

- Novo `src/components/design-system/MotionPolicy.jsx`: `MotionPolicyProvider`
  (montado em `AppLayout`, recebe o `performanceProfile` já calculado — não
  assina uma segunda vez as media queries) + `useMotionPolicy()` (com fallback
  para `prefers-reduced-motion` puro quando não há provider montado, ex. telas
  de auth fora do `AppLayout`).
- `MotionReveal`, `AnimatedNumber` e `ChangePulse` (`design-system/Motion.jsx`)
  agora consultam `useMotionPolicy()` e pulam a animação/timer quando
  `!allowDecorativeMotion`.
- `TrainingTimerModal.jsx` — o único precedente de animação contínua
  (`repeat: Infinity`, 3 elementos) encontrado na auditoria — agora usa a mesma
  política: em `lowPower`/`prefers-reduced-motion`, renderiza a pose estática
  em vez de repetir infinitamente.
- CSS: alvo de toque mínimo em botões sem classe de tamanho explícita subiu de
  `2.5rem` (40px) para `2.75rem` (44px) em mobile — alinhando com a meta
  explícita de acessibilidade da auditoria.

**Regra para as próximas fases:** qualquer animação decorativa nova
(`repeat: Infinity`, glow pulsante, shimmer contínuo) deve consultar
`useMotionPolicy()` antes de animar. `prefers-reduced-motion` continua coberto
globalmente por CSS (`@media (prefers-reduced-motion: reduce)` em
`src/index.css`) — a política JS cobre o caso adicional de `lowPower` (CPU/RAM
limitada, save-data) que o CSS sozinho não alcança.

## Modais — ModalShell/DrawerShell viram padrão oficial, primitivos base endurecidos

- `ModalShell`/`DrawerShell` já garantiam `max-height` + `overflow-y` + scroll-lock
  + focus-trap + ESC (via `useOverlayBehavior`, compartilhado). Nenhuma mudança
  de comportamento — apenas confirmados como o padrão oficial nesta fase.
- **Novo `BottomSheet`** reusa o mesmo `useOverlayBehavior`, preenchendo a
  lacuna de mobile pedida na auditoria (seção 7/21) sem criar um 4º sistema de
  overlay.
- `src/components/ui/dialog.jsx` (`DialogContent`) e `src/components/ui/sheet.jsx`
  (`SheetContent`) — os dois primitivos Radix crus que **não** tinham
  `max-height`/`overflow-y` embutidos — ganharam essas travas. Confirmado por
  grep: **zero consumidores** desses dois arquivos em `src/` fora de si mesmos
  antes desta mudança (todo modal de feature já passa por `ModalShell`/
  `DrawerShell`), então o endurecimento é risco zero hoje e uma rede de
  segurança para quem os usar diretamente no futuro — exatamente o cenário que
  causou o incidente antigo da Central BETA.

## Branding — fundação (não o pacote final)

Documentado em detalhe em `docs/BRANDING.md`. Resumo:

- Símbolo oficial criado em `src/assets/brand/` (`logo-mark.svg`,
  `logo-horizontal.svg`, `logo-monochrome.svg`) — geometria só com
  retângulos/arcos de raio fixo (sem curvas livres), legível em 16px.
- `AppLayout.jsx` — os dois lugares que renderizavam um "P" solto em `<span>`
  (sidebar desktop e drawer mobile) agora usam `<BrandMark>`.
- `index.html` — favicon local (`/favicon.svg`), sem depender mais de
  `base44.com/logo_v2.svg`; `theme-color` adicionado.
- `public/manifest.json` — criado (antes só existia como artefato de build,
  quebrado na árvore de código-fonte).
- Ícones do Tauri (`src-tauri/icons/`) **não foram tocados** — permanecem como
  fallback até os PNG/ICO finais serem exportados a partir do SVG mestre
  (Fase 9), conforme exigido: nunca quebrar `tauri build` por causa do logo.

## Páginas piloto migradas

Uma simples, uma média, uma densa — prova de que o sistema funciona em
diferentes perfis de tela, sem tentar migrar tudo de uma vez:

- **Simples** — `src/components/AuthLayout.jsx` (compartilhado por `Login`,
  `Register`, `ForgotPassword`, `ResetPassword` — migrar o layout resolveu as
  4 telas de auth de uma vez, que eram as únicas do projeto sem nenhum
  tratamento visual do jogo). Trocado de markup próprio para `Surface`
  + fundo `app-shell` (mesmo gradiente ambiente do resto do app).
- **Média** — `src/pages/TrainingCenter.jsx`. Trocado `padel/ui` → imports
  diretos de `design-system` (`Page`, `PageContent`, `PageHeader`,
  `PageSkeleton`, `Surface`, `Tabs`). Filtro de categorias (antes botões
  soltos) agora usa `Tabs`.
- **Densa** — `src/pages/Tournaments.jsx` (626 linhas, já parcialmente no
  design-system). As 3 barras de abas/filtros/toggle (View toggle,
  Calendário/Estatísticas/Circuito/Notícias, tiers Crown–Silver) trocadas por
  `Tabs`; pílulas de status (`Concluído`/`Encerrado`/`Escolha estratégica`) no
  card de torneio trocadas por `StatusBadge`; os dois botões pequenos
  (`Ver detalhes`/`Ver chave`) trocados por `Button`. **Toda a lógica de
  dados, filtros, inscrição, cancelamento e navegação por deep-link ficou
  intocada** — só a camada de apresentação mudou.

## Dívida técnica restante

- `LoadingScreen` (34 usos) segue com implementação própria — trocar por
  `PageSkeleton` muda o comportamento visual (spinner → esqueleto
  estruturado) de 34 telas simultaneamente; melhor migrar caso a caso nas
  próximas fases (2 dos 3 pilotos já adotaram `PageSkeleton` diretamente).
- `FilterPills` (8 usos), `CoinBadge` (1), `LevelBadge` (2), `XpBar`,
  `QuickLink`, `ProfileMini`, `AchievementBadge` seguem com implementação
  própria — nenhum tem duplicata 1:1 no design-system hoje; avaliar caso a
  caso se merecem virar componente oficial ou continuam específicos.
- `CommunicationBell.jsx` ainda renderiza seu contador manualmente — não foi
  trocado por `NotificationBadge` nesta fase (fora do escopo de
  "consolidar duplicação"; é candidato natural para a Fase 3, já que o header
  global será revisado ali).
- 44 páginas ainda não migradas para os componentes oficiais (10 delas usando
  só a biblioteca-sombra, ver `docs/UI_UX_AUDIT.md` seção 2) — migração
  incremental nas Fases 5–8, conforme cada área é redesenhada.
- Ícones PNG/ICO finais (16/32/64/128/256/512) pendentes — ver
  `docs/BRANDING.md`.

## Testes e validação desta fase

- `npm run test:ui-redesign` (novo) — valida presença do design-system, dos
  novos componentes, do branding local, ausência de dependência do favicon
  Base44, política de motion e adapters documentados.
- `npm run test:ui-performance` (novo) — detecta regressões óbvias
  introduzidas por este tipo de mudança (imports eager, listas sem paginação,
  animação contínua sem guarda de `lowPower`, polling novo).
- `npm run lint`, `npm run typecheck`, `npm run build` — executados ao final
  desta fase (ver relatório de conclusão).

## Fase 3 — Shell (adendo)

Data: 2026-08-12. Detalhes completos em `docs/NAVIGATION_ARCHITECTURE.md` e
`docs/RESPONSIVE_GUIDELINES.md`. Componentes do design-system que a Fase 3
passou a consumir de fato:

- `BottomSheet` (criado na Fase 2, sem uso real até agora) — painel "Mais"
  do `BottomNav.jsx` mobile, primeira aplicação prática.
- `NotificationBadge` — substituiu o contador com `<span>` hardcoded do
  `CommunicationBell.jsx` (item de dívida técnica listado acima, resolvido
  nesta fase).
- `Page`/`PageContent`/`PageHeader`/`Surface` — `NavigationHub.jsx` migrado
  de `padel/ui.jsx` para o design-system oficial.
- `BrandMark` — já em uso desde a Fase 2, inalterado.

Nenhum componente novo do design-system foi necessário para a sidebar/
BottomNav em si — permanecem compostas diretamente com Tailwind, como já
era o padrão em `AppLayout.jsx`.

## Próximo passo

Aguardando autorização para iniciar a **Fase 4 — Redesign completo da Home
/ Centro da Carreira**.
