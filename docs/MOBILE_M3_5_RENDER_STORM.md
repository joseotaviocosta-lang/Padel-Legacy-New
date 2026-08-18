# Mobile M3.5 — Render storm + long tasks

## Evidência do Android físico (ponto de partida)

Home estabilizada: 75-91 FPS, frame médio 11-13.3ms, DOM ~861-867. Missões: 14 FPS, frame médio 73.5ms, pior frame 1697.7ms, DOM 606. Partidas de treino: 8 FPS, frame médio 132.2ms, pior frame 1806.4ms — com `CommunicationBell` renderizando 80×, `BottomNav` 43×, `AppLayout` 40×, `CareerHud` 37× numa única sessão parada. Também: long tasks até ~1959ms, um `navigate-route` de ~2067.7ms.

## Causa raiz

**Render storm** (explica 1-6 e boa parte de Missions/Matches): `AppLayout.jsx`'s `useCareerHeaderData()` escuta `padel:profile-updated`/`padel:career-advanced`/`padel:onboarding-refresh`, debounced 150ms; a cada disparo, `applyProfile()` fazia `setProfile(nextProfile)` **síncrono** seguido de `getWorldRank(nextProfile).then(setRanking)` **assíncrono** — dois commits separados por evento (React não agrupa updates em ticks diferentes). Nenhum filho do shell era memoizado — incluindo a **página roteada via `<Outlet/>`** — então cada um desses re-renders de `AppLayout` recalculava a árvore inteira, inclusive trabalho não-memoizado dentro de `Missions.jsx` (`categoryPool`/`filtered`/`anticipatedCompleted`, refeitos do zero a cada chamada). `Matches.jsx` é fino (sem computação pesada própria) — sua lentidão é majoritariamente herdada da mesma cascata.

Descartado explicitamente (com evidência, não suposição): `useAdaptivePerformance()` só reage a mudanças reais de media query/visibilidade; `MobilePerformanceMonitor`/`useRenderCounter` têm estado inteiramente próprio (`bumpRenderCount` é só um incremento de `Map`, sem `setState`) — não causam o storm nos componentes que medem.

**LiveMatch em velocidades altas**: o autoplay chamava exatamente 1 `playPoint` por `setState`, a cada `1000/speed` ms — em 10x, ~10 commits completos de React por segundo, sem nenhum agrupamento.

**Storage/IPC**: já razoavelmente otimizado — `ActiveCareerAdapter.getActiveCareer({fresh:false})` já cacheia em memória e só relê o disco quando `fresh:true` é pedido explicitamente; `CareerEntityRepository` já tem cache próprio por consulta. Não era o gargalo principal — só faltava visibilidade.

**advance-day**: `processGameStateDay` já tinha um parâmetro `profiler` opcional (`stage(name, task)`), nunca usado — `dayAdvanceCoordinator.js` nunca passava um profiler real.

## Correções aplicadas

### Shell (Ação — item 4 do brief)
- `React.memo` em `CommunicationBell`, `BottomNav`, `FloatingUtilityRail` — suas props reais já eram estáveis (booleano estático, referência de módulo), sem precisar corrigir identidade antes.
- `React.memo(CareerHud, areEqual)` com comparador dedicado aos 4 campos que o componente realmente exibe (`energy`, `fatigue`, `coins`, `ranking.rank`) — evita re-render por qualquer outro campo do perfil mudar.
- `useCareerHeaderData()`: `applyProfile` agora aguarda `getWorldRank` antes de gravar `profile`/`ranking`, deixando os dois no mesmo commit em vez de dois separados.
- `React.memo(Missions)` e `React.memo(Matches)` — páginas roteadas via `<Outlet/>`; sem props reais do pai e com o contexto de carreira já memoizado (`CareerProvider.jsx`, confirmado sem alteração), o memo evita que a página seja re-executada por um re-render do shell alheio ao seu próprio estado.

### Missions.jsx (item 6)
`categoryPool`, `filtered` (a chamada a `deterministicMissionSelection`) e `anticipatedCompleted` viraram `useMemo` com dependências corretas — o algoritmo de seleção determinística em si não foi alterado, só parou de rodar em toda renderização.

### LiveMatch (item 11)
Em vez de 1 ponto por commit a `1000/speed`ms, o autoplay agora processa `pointsPerTick` pontos por commit sempre que o intervalo natural cairia abaixo de `MIN_TICK_MS` (150ms) — mantendo a MESMA taxa de pontos-por-segundo (e portanto a mesma duração total da partida) de antes, só reduzindo commits de React. Em velocidades baixas (1x-4x, intervalo já ≥150ms), `pointsPerTick=1` e o comportamento é idêntico ao anterior. Verificado por teste comportamental: mesma seed, lotes de 1/2/5/10 pontos por commit produzem placar final e narração **idênticos**.

### Instrumentação (itens 9/10/13 — visibilidade, não redesenho)
- `CareerEntityRepository`: `careerIOStats` (`reads`/`writes`/`totalMs`/`maxMs`) no chokepoint único (`withCareer`) por onde toda entidade passa.
- `performanceProbe.js`: `createStageProfiler()`/`getLastAdvanceDayBreakdown()` — reaproveita o `stage(name, task)` que `processGameStateDay` já tinha.
- `dayAdvanceCoordinator.js`: passa um `createStageProfiler()` real para `processGameStateDay`.
- `AppLayout.jsx`: marks DEV-only (`mark`/`measure`, cortados do bundle release) dividem o `navigate-route` em "até commit do frame anterior" e "pintura da nova rota" — o total (`recordAction`, ativo em release) continua medido como antes.
- `MobilePerformanceMonitor`: novas linhas para storage IO e breakdown do último advance-day; "zerar contadores" agora zera também o IO.

## O que NÃO foi feito (e por quê)

- **Blur**: não mexido. 14→15 FPS sem blur (medido antes desta fase) já provou que não é o driver — brief explícito para não continuar sacrificando visual nessa hipótese.
- **Matches.jsx**: sem mudança própria além do memo — o componente já era fino; a hipótese é que sua lentidão era majoritariamente herdada da cascata do shell. Recomendo remedir no Android físico após esta correção antes de investir mais ali.
- **navigate-route**: breakdown parcial (2 sub-trechos via marks DEV-only), não a cadeia completa de 9 estágios do enunciado (career-read/storage-read/missions-reconcile/etc.) — essas etapas acontecem dentro de cada página individualmente (não em `AppLayout`), e instrumentá-las todas exigiria tocar em cada página separadamente. Escopo deliberadamente contido nesta passagem.
- **Storage/IPC**: nenhuma mudança de estratégia de cache — já estava correta; só ganhou visibilidade.

## Build

`npm run android:build` (Rust release + Gradle) seguido do procedimento já documentado em `docs/MOBILE_M3_3_PERFORMANCE.md`: `zipalign` + `apksigner sign --ks ~/.android/debug.keystore --ks-key-alias androiddebugkey` (sem keystore de produção configurado neste projeto — mesma prática de antes). Caminho final e resultado no relatório desta sessão.

## Testes

`npm run test:mobile-performance-m3-5` (novo) — estrutural (memo/useMemo/instrumentação no lugar) + comportamental real (engine): determinismo do lote de pontos do LiveMatch (placar e narração idênticos para 1/2/5/10 pontos por commit), profiler real de advance-day mede todas as ~11 etapas com durações coerentes, contadores de storage IO reais via `CareerEntityRepository`.

Regressão completa: as 9 suítes `test:mobile-*` já existentes, `test:career-atomicity`, `test:calendar-advance`, `test:missions`, `test:notification-center-consolidation`, `test:communication-deduplication`, `test:career-systems`, `test:match-launch-pipeline`, `test:tournament-resume-recovery`, e `test:beta-candidate` (14 pilares) — todas passando sem alterar comportamento esperado. Três testes estruturais pré-existentes (`test-mobile-m3-live-match.mjs`, `test-mobile-m3-2-android-ux.mjs`, `test-mobile-performance-m3-3.mjs`, `test-career-systems.mjs`) tinham regex/checagens amarradas à forma exata do código anterior (ex.: `export default function BottomNav(...)` como string literal) — atualizadas para continuar verificando a MESMA propriedade real (prop `hidden` existe, cleanup do timer existe, export é um componente válido) sob a nova forma (memo), não enfraquecidas.

## Validação final pendente

Esta suíte não mede FPS real de WebView Android — isso não é possível em Node. A validação definitiva é reinstalar o APK assinado no aparelho físico e reabrir o `MobilePerformanceMonitor` (`?perfdebug=1` ou toggle em Configurações) nas mesmas telas medidas antes (Home, Missões, Partidas de treino) para comparar os números.
