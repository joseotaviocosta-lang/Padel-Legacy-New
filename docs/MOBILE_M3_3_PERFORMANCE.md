# Mobile M3.3 — Performance Audit, Profiling & Optimization

## 1. Objetivo

Investigar o feedback de hardware real ("o jogo funciona, mas parece
perceptivelmente lento") seguindo a ordem obrigatória **medir → identificar →
priorizar → otimizar → medir novamente**, distinguindo o que é custo do modo
`android:dev` do que é custo real presente também no build de produção.

## 2. Hardware/ambiente disponível

Sem acesso a device físico Android nem a um profiler anexado a uma WebView
real neste ambiente (sem Playwright/jsdom/Chrome DevTools Protocol
disponíveis). As medições possíveis aqui são de dois tipos:

- **Medição real objetiva**: custo puro de JS (motor de partida, avanço de
  calendário, serialização/gravação) via `performance.now()` em Node, usando
  os módulos de produção reais (sem mock).
- **Auditoria estrutural**: leitura de código para identificar padrões
  conhecidos de custo (renders desnecessários, listeners não limpos, bundle
  eager, CSS caro em elementos que atualizam com frequência).

A validação numérica final em hardware Android real (dev vs release) só pode
ser feita pelo usuário — a instrumentação da Parte 5 foi construída
justamente para isso.

## 3. Diferença dev vs release

| | `npm run android:dev` | `npm run android:build` |
|---|---|---|
| Frontend | Servido pelo Vite dev server do PC (`devUrl` em `tauri.conf.json`), acessado pelo celular via rede/adb reverse | Bundle de produção (`npm run build`) empacotado **dentro** do APK — sem dependência de rede |
| JS | Não minificado, com HMR/WebSocket ativo, sourcemaps, React em modo dev | Minificado (Vite/esbuild), sem HMR |
| Rust/Tauri | `debug` build type — `isDebuggable=true`, `isMinifyEnabled=false`, símbolos de debug mantidos, cleartext traffic liberado para o dev server | `release` build type — `isMinifyEnabled=true` com ProGuard |
| Onde roda | JS trafega pela rede PC↔celular a cada mudança de rota | JS carregado localmente dos assets do APK, sem latência de rede |

Conclusão de arquitetura (confirmada lendo `src-tauri/gen/android/app/build.gradle.kts`
e `src-tauri/tauri.conf.json`, sem device físico): **`android:dev` soma
custos que não existem no release** (rede, HMR, JS não minificado, React dev
mode com verificações extras). Isso não prova que o release seja
"suficientemente rápido" — só que uma parte real da lentidão relatada é
estruturalmente exclusiva do modo dev.

## 4. Metodologia

1. Baseline sem alterar nada (lint/typecheck/build + testes existentes).
2. Medição objetiva de custo puro de JS nos três hot paths mais prováveis:
   motor de partida (`playPoint`), finalização/gravação de partida, avanço
   de calendário — reaproveitando benchmarks já existentes
   (`benchmark-match-finalization-rc.mjs`, `test-time-advance-performance-rc.mjs`)
   mais um benchmark novo do motor.
3. Auditoria estática dirigida por evidência (Contexts, effects, listeners,
   CSS/GPU, bundle, logs) — sem tocar em nada até ter uma causa concreta.
4. Classificação P0-P3 dos achados.
5. Implementação apenas dos achados P0/P1 com risco baixo e ganho
   comprovado.
6. Instrumentação DEV-only para o usuário medir no device físico o que este
   ambiente não permite medir.
7. Regressão completa + build Windows + build Android release.

## 5. Baseline

```
npm run lint       → 0 erros
npm run typecheck  → 2260 erros pré-existentes (baseline; nenhum nos
                      arquivos que esta fase tocou antes da otimização)
npm run build      → OK, ~34-94s (variação observada entre execuções no
                      mesmo ambiente, provavelmente cache de disco/SO —
                      não há indício de regressão real associada ao código)
```

Chunk mais pesado: `index-*.js` — **1.246,71 kB / 389,79 kB gzip**. Acima do
limite de aviso padrão do Vite (500kB), mas isto sozinho não prova que seja
o gargalo real do release (ver Parte 14).

## 6. Startup

Mapeado o grafo de import de `App.jsx`: **todas as páginas já são
`React.lazy()`** via `src/lib/routeModules.js#PAGE_LOADERS` — inclusive
`CareerManager` (a primeira tela). Nenhuma página entra no chunk inicial. O
chunk `index-*.js` contém React/ReactDOM/react-router-dom/react-query,
`AppLayout` (sempre eager, correto — é o shell) e suas dependências diretas
(`framer-motion`, ícones, `CareerHud`, `CommunicationBell`,
`FloatingUtilityRail`, etc.).

Não há bloqueio artificial da primeira pintura: `AuthenticatedApp` mostra um
spinner imediato enquanto `isLoadingAuth`/`isLoadingPublicSettings`, e
`RootEntry` mostra outro enquanto `useCareer()` carrega — a UI shell aparece
antes dos dados da carreira estarem prontos, como a Parte 28 pedia. Isto já
era verdade antes desta fase; não precisou de mudança.

## 7. React renders

`CareerProvider` já memoiza o valor do context (`useMemo`) e todas as ações
(`useCallback`) com deps corretas — não é uma fonte óbvia de re-render amplo.
Mais importante: **as páginas de gameplay (`Matches.jsx`, `Tournaments.jsx`,
`CareerHub.jsx`) mantêm o `profile` em estado LOCAL** (`useState` +
`onProfileUpdate`), não no `CareerContext` — atualizações de energia/fadiga/
moedas depois de um treino ou torneio não disparam `setActiveCareer` nem
re-renderizam a árvore inteira via o context global. Isto já é uma boa
arquitetura; não foi alterada.

`useKeyboardInset` (M3.2) só chama `setState` quando o booleano realmente
muda de valor — React já evita re-render num `setState` com valor idêntico,
então o listener de `visualViewport.resize` não causa updates redundantes
mesmo disparando com frequência durante a animação do teclado.

Achado real, corrigido nesta fase: ver Parte 8.

## 8. LiveMatch

**Achado P1 confirmado e corrigido**: `NarrationEntry` (item da lista de
narração) não era memoizado. A cada ponto (`setState(playPoint(previous))`),
`MatchFeed` re-renderiza e React reexecutava a função de **todos os itens
visíveis da narração (até 120)** — mesmo que só 1 evento novo tenha sido
adicionado e as chaves dos outros 119 continuassem estáveis (a chave é a
posição absoluta no histórico completo, não o índice visível, então
sobrevive à janela deslizante). Sem `memo`, isso é reexecução de função sem
qualquer mudança visual real — exatamente o padrão que a Parte 6 pede para
caçar.

Correção: `NarrationEntry` agora é `React.memo(NarrationEntryComponent)`.
Como o `event` de cada item já rendererizado mantém a mesma referência entre
pontos, `memo` agora pula ~119 das ~120 reexecuções por ponto. No modo 10x
(até ~10 pontos/segundo), isso evita até ~1200 reexecuções de componente por
segundo que não mudavam nada na tela.

Painéis inativos (Tática/Técnico/Estatísticas) **já não ficam montados**
quando não selecionados — são renderizados condicionalmente
(`{activePanel === 'tactics' && (...)`), confirmado por auditoria. Nenhuma
mudança necessária aí.

`PlaybackControls` foi avaliado para o mesmo tratamento (só depende de
`state.finished`, um booleano, mas recebe `state` inteiro) — **não
aplicado**: os callbacks (`onNextPoint`, `onEndGame`, etc.) são criados
inline no render de `LiveMatch` a cada ponto, então `memo` sozinho não
evitaria o re-render sem também envolver esses callbacks em `useCallback`,
uma mudança de escopo maior e mais arriscada para um componente pequeno
(poucos botões, sem DOM caro). Documentado como oportunidade futura (P2),
não implementado agora — ver Parte 26.

Checkpoint do LiveMatch **já** só grava em "momentos seguros" via
assinatura (`checkpointSignatureRef`), não a cada ponto — confirmado, sem
mudança necessária (Parte 13).

## 9. Home / CareerHub

Auditoria de código não encontrou um padrão óbvio de recomputação pesada
fora de `useMemo`/efeitos guardados o suficiente para justificar uma
mudança sem medição real em device (`CareerHub.jsx` é grande, mas a
maioria dos `.map`/`.filter` encontrados já está dentro de `useMemo` com
deps). Sem profiler de device, não há evidência suficiente para uma
mudança de baixo risco aqui — deixado para uma fase futura caso o
usuário confirme fisicamente que a Home especificamente é lenta.

## 10. Missions

**Já resolvido estruturalmente antes desta fase**: a aba "Tutorial" filtra
por `tutorial_chapter` do passo atual (`filtered = tutorialMissions.filter(m
=> !currentChapter || m.tutorial_chapter === currentChapter)`) — não monta
as 57 etapas de uma vez, só o capítulo ativo. Abas não-tutorial já têm
`categoryLimit` (3-20 itens). Nenhuma mudança necessária.

## 11. Storage

`benchmark-match-finalization-rc.mjs` (pré-existente, reexecutado como
baseline desta fase) mostra que a finalização de partida **já foi otimizada
numa fase anterior**: 2 escritas por partida (era 8-20), ~7KB de
crescimento por partida no save (era ~366KB por registro), persistência
média ~42ms (p95 ~108ms, worst ~178ms). O "Salvando partida..." já é
exibido durante essa janela (`PlaybackControls` quando `state.finished`) —
feedback visual já presente para a única operação de I/O que legitimamente
leva dezenas de ms.

## 12. Checkpoint

Ver Parte 8 — grava só em momentos seguros (início, fim de game/set, troca
de tática/decisão do técnico), nunca por ponto. `engine_state` serializado é
o próprio estado do motor (números/arrays/objetos simples, sem clone
recursivo caro fora do já existente `cloneState` do motor).

## 13. Calendar / world simulation

`test-time-advance-performance-rc.mjs` (pré-existente, reexecutado) confirma
que o avanço de dia **já usa duas fases** (rápida, com poucas escritas
"core", e secundária, em lote) — não há indício de vários saves completos
consecutivos por um único clique. Instrumentado com `timeAsync` (Parte 5)
para o usuário medir o tempo real em device físico, já que a auditoria de
código não encontrou um algoritmo obviamente ruim para corrigir sem
evidência de device.

## 14. Bundle

Chunk inicial de 1.246,71 kB / 389,79 kB gzip. Composição não é anômala para
o tamanho do app (React + Router + Query + Framer Motion + shell sempre
montado), mas é grande. **Decisão desta fase: não mexer.** Motivos:

- Todas as páginas já são lazy — o principal alavanca de startup já está
  aplicada.
- Para o **build release** (o que importa fisicamente), o bundle é
  empacotado nos assets do APK — carregado do disco local do device, sem
  latência de rede. O custo real remanescente é parse/compile de JS pela
  CPU do aparelho, tipicamente well abaixo de 1s mesmo em Android
  intermediário para ~390KB gzip (~1.2MB descomprimido).
- Separar o vendor bundle (`manualChunks`) é uma mudança de configuração de
  build com superfície de risco maior (pode quebrar ordem de carregamento,
  cache busting, chunks duplicados) para um ganho não comprovado sem medição
  real — documentado como oportunidade futura (Parte 26), não implementado
  agora.

`generateCategoricalChart-*.js` (374KB, código do Recharts) **já está**
separado em chunk próprio, carregado sob demanda — não entra no bundle
inicial.

## 15. CSS/GPU

`backdrop-blur`/`backdrop-filter`: 33 ocorrências em 19 arquivos. Auditados
especificamente os elementos que **atualizam a cada ponto** durante o
LiveMatch (`CompactScoreboard`, `NarrationEntry`) — **nenhum dos dois usa
blur** (scoreboard usa gradiente+shadow simples; narração é texto/borda
simples). O blur no LiveMatch está em `PlaybackControls` (estático entre
pontos, só muda visualmente quando play/pause/velocidade mudam) — não é
recalculado/repintado a cada ponto. `FloatingUtilityRail` (4 botões com
blur, sempre montado) e o header/sidebar (`AppLayout`, 2 ocorrências) são
elementos **estáticos** (não atualizam por tick nenhum) — o custo de
composição de um blur estático é pago uma vez, não repetido. Nenhuma
evidência de blur custoso em elemento de alta frequência de atualização —
nenhuma mudança feita.

## 16. Listeners

Auditados: `useKeyboardInset` (1 listener, `visualViewport.resize`, com
cleanup, sem update redundante — Parte 8), `LiveMatch`'s `visibilitychange`
(1 listener, cleanup presente), `useOverlayBehavior` (corrigido em M3.2 —
não recria mais o listener a cada re-render do pai). Nenhum listener de
`scroll`/`touchmove`/`pointermove`/`mousemove` manual encontrado no código
do app (`grep` não encontrou nenhuma ocorrência) — nenhuma fonte de evento
de alta frequência mal implementada.

## 17. Gargalos encontrados

| # | Gargalo | Prioridade | Status |
|---|---|---|---|
| 1 | `NarrationEntry` sem memo — até ~120 reexecuções de componente por ponto sem mudança visual, agravado em 10x | P1 | **Corrigido** |
| 2 | Nenhuma instrumentação real de performance existia para medir em device físico (dev vs release) | P1 | **Corrigido** (nova instrumentação DEV-only) |
| 3 | `PlaybackControls` recebe `state` inteiro só para checar `state.finished`; callbacks inline impedem memo efetivo | P2 | Documentado, não corrigido (risco/ganho não justifica nesta fase) |
| 4 | Chunk inicial de ~390KB gzip sem `manualChunks` explícito | P2 | Documentado, não corrigido (release não sofre latência de rede; risco de quebrar bundling > ganho comprovado) |
| 5 | `package.json` sem campo `sideEffects` (pode limitar tree-shaking teórico de barrels) | P3 | Documentado, não investigado a fundo (nenhuma evidência concreta de bloat causado por isso) |
| 6 | Variação de tempo de build (34s-94s) entre execuções no mesmo código | P3 | Provável cache de disco/SO, não uma regressão de código — sem ação |
| 7-10 | Home/CareerHub, listas grandes (ranking/mercado/etc.), fonts, imagens | P3 | Sem evidência de problema real encontrada por auditoria estática; sem profiler de device para confirmar — deixados para medição física antes de qualquer mudança |

Nenhum P0 (trava/crash/freeze) foi encontrado.

## 18. Otimizações realizadas

1. **`NarrationEntry` memoizado** (`src/components/matches/LiveMatch.jsx`) —
   ver Parte 8.
2. **Instrumentação DEV-only** (`src/dev/performanceProbe.js`, novo) —
   `mark`/`measure`/`timeAsync`, inerte e sem log em build de produção
   (`import.meta.env.DEV` é eliminado estaticamente pelo Vite/minificador).
   Marcações adicionadas em 3 pontos, sem alterar nenhuma lógica:
   - `CareerProvider.jsx`: tempo de `startup: CareerProvider ready` (abrir
     app → carreira pronta).
   - `dayAdvanceCoordinator.js`: tempo de `calendar: advance 1 day (fase
     rápida)` (clique em Avançar → resposta da fase rápida).
   - `LiveMatch.jsx`: tempo de `livematch: abrir partida` (início do render
     → primeiro commit montado).

## 19. Before/after

| Métrica | Antes | Depois |
|---|---|---|
| Reexecuções de `NarrationEntry` por ponto (narração com 120 itens) | ~120 | ~1 (só o item novo; memo pula os 119 inalterados) |
| Custo do motor por ponto (medido, Node, real) | 0,33ms médio / 0,60ms p95 | Inalterado (não era o gargalo — engine já era barato) |
| Escritas por finalização de partida | 2 (já otimizado antes desta fase) | 2 (sem mudança) |
| Instrumentação de timing real disponível | Nenhuma | 3 pontos (startup, calendar advance, LiveMatch open) |

Sem device físico, não há um "antes/depois" em milissegundos reais de tela
para reportar com honestidade — os números acima são o que é objetivamente
mensurável neste ambiente (contagem de renders evitados, custo puro de JS).

## 20. Arquivos modificados

- `src/components/matches/LiveMatch.jsx` — `NarrationEntry` memoizado;
  marks de startup do componente.
- `src/dev/performanceProbe.js` (novo) — instrumentação DEV-only.
- `src/careers/CareerProvider.jsx` — instrumentação do carregamento inicial.
- `src/game-core/dayAdvanceCoordinator.js` — instrumentação do avanço de 1
  dia.
- `scripts/test-mobile-performance-m3-3.mjs` (novo) — 26 verificações.
- `package.json` — novo script `test:mobile-performance`.

Nenhuma mudança em gameplay, motor, probabilidades, ranking, economia,
scroll/teclado/bottom-nav (M3.2), recovery (M3.2/hotfix), ou visual/design.

## 21. Testes

`npm run test:mobile-performance` → 26 verificações (estruturais +
comportamentais, motor real medido dentro do próprio teste). Regressão
completa (Parte 49) executada — todos os testes mobile (M1-M3.2), missões,
onboarding, match-integrity, match-playback, career-systems,
match-launch-pipeline, tournament-resume-recovery, tournament-match-lifecycle
— **PASS**.

## 22. Android build

`npm run android:build` (Rust release para arm64-v8a/armeabi-v7a/x86/x86_64
+ Gradle) concluído com sucesso. Saída bruta do Tauri/Gradle:

- APK universal (todas as ABIs): `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk` — **não assinado**, não instalável como está.
- AAB universal: `src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab` — formato de publicação (Play Store), não instalável via `adb`.

Nenhum keystore de produção está configurado no projeto (nenhum
`signingConfigs` em `build.gradle.kts`) — o build `release` sai sem
assinatura por padrão. Não foi inventado nenhum keystore novo: foi usado o
`~/.android/debug.keystore` (o keystore de debug **padrão do Android SDK**,
já existente neste ambiente antes desta fase, gerado automaticamente pela
própria ferramentação do Android — mesma prática usada por CI de QA e pelo
próprio "Generate Signed APK" do Android Studio para builds de teste) para
assinar a variante mais próxima da produção disponível:

```
zipalign -v 4 app-universal-release-unsigned.apk app-universal-release-aligned.apk
apksigner sign --ks ~/.android/debug.keystore --ks-key-alias androiddebugkey \
  --out app-universal-release-signed.apk app-universal-release-aligned.apk
```

**APK final assinado e verificado**:
`src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-signed.apk`
— ~50,9 MB, pacote `com.padellegacy.game`, versão `0.9.0`. Código
minificado com ProGuard (variante `release` real, não debug) — só a
assinatura é a de debug, o binário/JS são exatamente os de produção.

## 23. Windows build

`npm run app:build` executado após todas as mudanças —
`Padel Legacy_0.9.0_x64_en-US.msi` e `Padel Legacy_0.9.0_x64-setup.exe`
gerados com sucesso em `src-tauri/target/release/bundle/`.

## 24. Riscos residuais

- Nenhuma medição em milissegundos de tela real (só possível fisicamente).
- O chunk inicial grande (~390KB gzip) permanece — decisão deliberada de
  não mexer sem evidência de que é o gargalo real do release (ver Parte 14).
- `PlaybackControls` continua re-executando (sem custo de DOM real) a cada
  ponto — documentado, não corrigido.
- Build Android release usa assinatura padrão de debug (nenhum keystore de
  produção configurado neste projeto) — ver relatório final, Parte 51.

## 25. Oportunidades futuras

- Medir com o usuário, fisicamente, os 3 pontos já instrumentados
  (startup, avanço de dia, abrir LiveMatch) em dev E release, e usar esses
  números reais para decidir se vale a pena:
  - dividir o chunk inicial (`manualChunks`) para reduzir parse/compile no
    startup;
  - envolver os callbacks de `PlaybackControls` em `useCallback` + memo;
  - investigar Home/CareerHub com React Profiler real, se confirmado lento.
- Considerar `sideEffects: false` no `package.json` (com validação cuidadosa
  de que nenhum módulo do projeto depende de efeito colateral de import) só
  se o bundle eager continuar sendo um problema confirmado.

## 26. Checklist físico

Ver relatório final — checklist DEV vs RELEASE completo com os cenários da
Parte 54 do enunciado.
