# M3.4 — Physical Device Performance Profiling + Real Optimization

## 1. Resultado do teste físico que motivou esta fase

O APK RELEASE foi instalado e testado num Android físico após o M3.3. A
percepção de performance foi praticamente a mesma de `npm run android:dev`
— ou seja, a lentidão **não é** (só) Vite/HMR/rede em modo dev. Existe
gargalo real de runtime/renderização que sobrevive ao build de produção.
Consequência direta para esta fase: qualquer ferramenta de profiling
precisa **funcionar no bundle release**, não só em dev — `mark`/`measure`/
`timeAsync` (a instrumentação já existente, `src/dev/performanceProbe.js`)
são deliberadamente cortados do build de produção via
`import.meta.env.DEV` (o próprio Vite elimina o código morto). Tudo que
foi criado nesta fase (`isPerfDebugEnabled`, os monitores de FPS/long
task/lag, `profileAction`) usa um gate em **runtime** (`?perfdebug=1`,
persistido em `localStorage`) em vez de uma constante de build — por isso
sobrevive ao release e pode ser ativado no APK real sem precisar de um
build separado.

## 2. Metodologia

Regra desta fase: medir no runtime → localizar o custo → corrigir → medir
de novo. Sem dispositivo Android físico disponível neste ambiente, o
trabalho se dividiu em duas partes:

- **Instrumentação** (Partes 2–9, 41–42): ferramentas reais, testáveis,
  prontas para o jogador rodar no aparelho e nos mandar números.
- **Auditoria estática de alta confiança** (Partes 9, 12–13, 17–24): leitura
  de código para achar problemas comprovados pela própria fonte — sem
  depender de FPS real para serem válidos (ex.: uma regra CSS que
  deliberadamente aumenta o custo de blur só no mobile é uma regressão
  clara independente de medição).

Os dois achados corrigidos nesta fase (blur mobile e `CommunicationBell`
sem memo) são do segundo tipo — evidência de código, não suposição. O
resto do trabalho de otimização (Partes 28–34, desacoplar simulação de
render no modo 10x, etc.) fica para depois que os números reais do
aparelho confirmarem se são necessários — não foi implementado sem prova,
conforme a regra explícita desta fase.

## 3. `?perfdebug=1`

Ativa o overlay flutuante (`src/dev/MobilePerformanceMonitor.jsx`).
Persiste em `localStorage` (`padel:perfdebug`), então continua ativo em
navegações seguintes dentro do app sem precisar repetir o parâmetro.
`?perfdebug=0` desativa. Nunca aparece por padrão — só quando o jogador
pede.

## 4. FPS (Parte 3)

`createFrameMonitor` mede via `requestAnimationFrame`, janela móvel de 120
frames. Reporta no máximo 2x/segundo (o próprio monitor não pode virar
gargalo). `computeFrameStats` (função pura, testada em
`test:mobile-performance-device`) calcula fps médio, frame médio, pior
frame, e quantos frames passam de 16.7/33/50/100ms.

## 5. Long tasks (Parte 4)

`createLongTaskMonitor` usa `PerformanceObserver('longtask')` quando a
WebView suporta; a maioria das WebViews Android não suporta, então cai
para o fallback de lag do event loop (mesmo princípio da Parte 5).

## 6. React profiling (Partes 7–8)

Em vez de `React.Profiler` cego em cada componente (explicitamente
desencorajado pelo enunciado), foi criado `useRenderCounter(label)` — um
contador global leve (`Map`), ligado nos 4 componentes do shell que
renderizam em toda página: `AppLayout`, `CareerHud`, `CommunicationBell`,
`BottomNav`. O overlay mostra os 6 componentes com mais renders e um botão
para zerar o contador antes de repetir uma ação.

## 7. Render counts — leitura estrutural

`AppLayout`/`CareerHud`/`CommunicationBell`/`BottomNav` NÃO estão
envolvidos em `React.memo` — todos re-renderizam sempre que `AppLayout`
re-renderiza (mudança de `expandedGroup`/`sidebarCollapsed`/`mobileOpen`/
`headerProfile`/`headerRanking`/`performanceProfile`/`keyboardOpen`). Isso
é esperado do React sem memo explícito; não é por si só um bug — o número
real de renders por ação só sai com os contadores no aparelho.

## 8. CareerProvider (Parte 9, prioridade alta)

Auditado a fundo — **não** confirma a hipótese do enunciado. O
`contextValue` já é `useMemo`izado com dependência completa e correta;
todas as 8 ações (`selectCareer`, `createCareer`, etc.) já são
`useCallback` estabilizadas. Não há recriação de objeto solto invalidando
a árvore a cada render. O achado real: `AppLayout`/`CareerHud`/
`CommunicationBell` (o shell) **não consomem `useCareer()`** — usam uma
fonte de perfil paralela e independente (`useCareerHeaderData` em
`AppLayout.jsx`, orientada a eventos `padel:profile-updated`/
`padel:career-advanced`). Só 15 arquivos consomem `useCareer()` no total.
Conclusão: `CareerProvider` não precisou de nenhuma mudança nesta fase —
nem separação de contexts, nem reescrita. Só ganhou `profileAction` no
carregamento de carreira (`load-career`) para aparecer no overlay.

## 9. DOM sizes (Parte 23)

`getDomNodeCount()` existe e é amostrado pelo overlay a cada
~500ms na rota atual. `Missions.jsx` foi auditado especificamente (Parte
14): as abas já são lazy-mount (`filtered = tab === 'tutorial' ? ... :
deterministicMissionSelection(...)`, só o array da aba ativa é
`.map()`eado) — **não** tem o anti-padrão de abas ocultas continuarem
montadas (Parte 24). Números reais de nós por tela dependem do aparelho.

## 10. Storage IPC

Instrumentação de contagem de chamadas Tauri IPC (Parte 25) não foi
implementada nesta fase — ficou fora do orçamento de tempo desta rodada.
O `profileAction` em `load-career`/`advance-day` já mede o tempo total das
operações que fazem essas chamadas, que é o sinal mais direto de custo;
contar IPC calls individualmente é uma extensão natural do mesmo
`localGame`/`GameStorage`, recomendada para uma próxima rodada se os
números de `advance-day` no aparelho justificarem o detalhamento.

## 11. Advance day (Parte 27)

`advanceCareerDayOnce` (`src/game-core/dayAdvanceCoordinator.js`) agora é
medido por `profileAction('advance-day', ...)`, visível no overlay como
"Última ação" e no log (`getActionLog()`, até 50 entradas). Decompor em
sub-etapas (training/fatigue/world/ranking/news/save/render, como o
enunciado sugere como exemplo) não foi feito nesta rodada — o número total
já aparece; quebrar em sub-medidas é o próximo passo natural assim que o
total no aparelho mostrar se vale a pena.

## 12. LiveMatch (Parte 33)

Não precisou de nova correção — `NarrationEntry` já está memoizado
(`React.memo(NarrationEntryComponent)`, achado do M3.3, só reescrito como
função nomeada numa sessão anterior). O motor de simulação continua muito
rápido isoladamente (`test:mobile-performance` mede 1401 pontos, média
0.278ms, p95 0.515ms — bem abaixo do orçamento de 100ms/tick do modo
10x), reforçando que o gargalo suspeito não é a lógica da partida, é
render/CSS. Desacoplar simulação de atualização visual no modo 10x (Parte
34) não foi implementado — o enunciado exige não implementar sem
profiling comprovando necessidade, e isso requer medir FPS real do
LiveMatch em 1x/5x/10x no aparelho primeiro.

## 13. Blur/motion (Partes 18–22) — o achado principal

**Motion**: já existe uma política adaptativa (`useAdaptivePerformance` +
`MotionPolicyProvider`) que desliga animação decorativa em qualquer
viewport ≤767px (`allowDecorativeMotion: pageVisible && !lowPower &&
!compactViewport`) — ou seja, **todo celular já desliga motion
decorativo por padrão**, antes mesmo desta fase. Census confirma baixa
densidade: só 9 usos de `<motion.*>` em 3 arquivos. Motion não é um
candidato forte a gargalo.

**Blur**: `.glass`/`.glass-premium` (`backdrop-filter`) aparecem **~276
vezes** na árvore JSX — e a regra `@media (max-width: 767px)` em
`index.css` **aumentava** o blur especificamente no mobile (`blur(16px)
saturate(150%)`, contra `blur(12px)` sem saturate no desktop). Isso é uma
regressão clara e comprovada pela própria fonte, independente de medição:
o viewport com WebView mais restrito recebia o backdrop-filter mais caro,
não o mais barato. Corrigido para usar o mesmo valor do desktop
(`blur(12px)`, sem saturate extra) — nunca mais caro no mobile do que já
era. Além disso, o overlay ganhou dois toggles (`data-perf-no-blur`/
`data-perf-no-motion`) para o jogador comparar FPS ao vivo no aparelho —
zerar blur totalmente é um passo mais agressivo que só deve virar padrão
se o teste físico confirmar ganho real (regra explícita da Parte 19: não
sacrificar identidade visual sem evidência).

## 14. Gargalos identificados (ranking por evidência)

- **P1 — Blur mobile mais caro que o desktop** (evidência: código-fonte
  direto, `blur(16px)+saturate(150%)` vs `blur(12px)`, ~276 superfícies
  `.glass`). Corrigido nesta fase (restaura paridade com desktop); toggle
  "sem blur" disponível para medir se vale zerar de vez.
- **P2 — `CommunicationBell` recalculava "não lidas" sem memo, no shell
  global** (evidência: código-fonte, `countUnreadCareerMessages(messages)`
  chamado direto no corpo do componente, até 200 mensagens, componente
  presente em toda página). Corrigido (`useMemo`).
- **P3 — Shell (`AppLayout`/`CareerHud`/`CommunicationBell`/`BottomNav`)
  sem `React.memo`, re-renderiza a cada mudança de estado do AppLayout**
  (evidência: leitura estrutural — nenhum dos 4 usa `React.memo`).
  **Não corrigido nesta fase** — precisa dos contadores reais do aparelho
  (agora instrumentados) para confirmar se o volume de re-renders em ações
  reais (marcar missão, avançar dia) é realmente alto antes de decidir se
  compensa memoizar (risco de quebrar props que mudam de referência sem
  necessidade, ex. `ranking`/`profile` recriados a cada fetch).

`CareerProvider` (Parte 9, prioridade alta do enunciado) foi auditado e
**não é um gargalo** — já estava corretamente memoizado.

## 15. Alterações

- `src/dev/performanceProbe.js` — extensão (novo bloco perfdebug, runtime
  em vez de build-time; `mark`/`measure`/`timeAsync` originais intocados).
- `src/dev/MobilePerformanceMonitor.jsx` — novo, overlay `?perfdebug=1`.
- `src/components/AppLayout.jsx` — monta o overlay; mede navegação
  (Parte 6); conta renders.
- `src/components/career/CareerHud.jsx`, `src/components/BottomNav.jsx` —
  contam renders.
- `src/components/communications/CommunicationBell.jsx` — conta renders;
  `unread` agora memoizado (correção P2).
- `src/game-core/dayAdvanceCoordinator.js` — `advance-day` medido.
- `src/careers/CareerProvider.jsx` — `load-career` medido (sem outra
  mudança — auditoria não confirmou o anti-padrão suspeitado).
- `src/index.css` — correção P1 (blur mobile) + toggles de benchmark.
- `scripts/test-mobile-performance-m3-3.mjs` — 2 asserções por string
  literal ficaram obsoletas por refatorações anteriores (não deste hotfix)
  e por este hotfix (import de `CareerProvider`) — ajustadas para checar o
  padrão real em vez de uma string exata.

## 16. Before/After medido

Só o que dá para medir sem dispositivo físico:

- Motor de partida: **1401 pontos, média 0.278ms, p95 0.515ms**
  (`test:mobile-performance`, inalterado nesta fase — já era rápido).
- Bundle: `index` +7.48 kB raw / +2.61 kB gzip (ferramenta de profiling
  nova, sempre presente mas inerte sem `?perfdebug=1`).
- Typecheck: 0 erros novos líquidos.

FPS/long tasks/render counts reais **exigem o teste físico** — é
exatamente para isso que o overlay foi construído. Sem ele, qualquer
número aqui seria inventado (proibido pelo enunciado, Parte 43/47).

## 17. Testes

`npm run test:mobile-performance-device`
(`scripts/test-mobile-performance-m3-4.mjs`, 38 gates): matemática pura de
FPS/lag (buckets), action log, render counters, e guardas estáticas
confirmando que as duas correções (blur, memo do sino) e toda a
instrumentação estão realmente no código. Confirmado via `git stash` que
falha contra o código pré-fase e passa com a fase aplicada.

## 18. Riscos residuais

- Nenhum ganho de FPS real foi medido nesta fase — as correções (P1/P2)
  são de alta confiança por evidência de código, mas o "quanto" real só
  sai do teste físico.
- `React.memo` no shell (P3) foi identificado mas não aplicado — decisão
  correta é medir primeiro (ordens explícitas do enunciado).
- Contagem de chamadas Storage IPC (Parte 25) e decomposição de
  `advance-day` em sub-etapas (Parte 27) ficaram para uma próxima rodada.

## 19. Instruções para o teste físico

1. Instalar o novo APK release (Parte 21 abaixo).
2. Abrir o app, navegar até qualquer tela, adicionar `?perfdebug=1` na URL
   uma vez (ou usar um link/atalho que já inclua o parâmetro) — o overlay
   fica ativo daí em diante, mesmo navegando internamente.
3. Seguir o checklist físico (seção 20) anotando os números do overlay
   (FPS, frame médio, >33ms, long tasks, DOM nodes, última ação) em cada
   etapa.
4. Testar os toggles "sem blur"/"sem motion" durante scroll em telas com
   muitas superfícies `.glass` (Home, Missões) e comparar o FPS mostrado
   com e sem.
5. Mandar os números — não precisa interpretar, só copiar o que o overlay
   mostra.

## 20. Chrome DevTools (opcional, mais profundo)

Com o aparelho conectado por USB e depuração habilitada:

1. `npm run android:dev` (ou abrir o APK release instalado).
2. No desktop, abrir `chrome://inspect/#devices` no Chrome.
3. A WebView do app deve aparecer na lista (precisa estar "inspecionável"
   — builds debug/dev normalmente já são; o release pode exigir
   `webContentsDebuggingEnabled` habilitado no manifest, dependendo da
   config atual do projeto).
4. Abrir "inspect" → aba Performance → gravar uma ação (ex.: abrir
   Missões, fazer scroll) → parar → analisar o flame chart da main
   thread, FPS meter e Rendering (pode ativar "Paint flashing"/"Layer
   borders" no painel Rendering do próprio DevTools para ver
   repaint/composição em tempo real).
5. Aba Memory → snapshot antes/depois de navegar Home↔Missões 20x, para
   checar crescimento de heap.
