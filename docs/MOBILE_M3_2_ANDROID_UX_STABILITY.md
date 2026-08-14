# Mobile M3.2 — Android UX Stability / Onboarding + Recovery

Status: correções aplicadas e testadas em Node (estrutural + engine real).
**Validação definitiva ainda depende de teste físico em Android** — ver
checklist na seção 16. Não há Playwright/Puppeteer no projeto, então nenhuma
das correções de layout (scroll, teclado, bottom nav) pôde ser confirmada
contra um layout engine real neste ambiente.

Pré-requisitos: M1 Foundation, M1.1, M2 Shell, M2.1, M3 LiveMatch, M3.1
Device Hotfix (ver `docs/MOBILE_M3_1_DEVICE_HOTFIX.md`). Um novo teste em
Android físico, feito depois de M3.1, revelou 5 problemas novos apesar dos
44/58 testes automatizados de M3/M3.1 passando: recovery de treino ainda
fechava sem avançar, digitar nome de carreira/atleta podia fechar o teclado,
onboarding não rolava até o fim, bottom nav cobria conteúdo, e o teclado
Android quebrava o layout.

---

## 1. Causa raiz do scroll bloqueado

**Não havia** um container de scroll competindo com o documento. `main`
(AppLayout.jsx) não define `overflow`/altura fixa; `body` só tem
`overflow-x: hidden`; nenhum `#root { height/overflow }` existe em
`index.css`. O documento (`html`/`body`) sempre foi o único scroll container
em mobile — essa parte da arquitetura já estava correta.

O que realmente quebrava o scroll/CTA acessível não era o container, e sim
**o teclado Android mexendo no viewport de um jeito que o CSS do app não
declarava explicitamente** (seção 5) e **um bug de foco que fechava o
teclado no meio da digitação** (seção 7), fazendo o usuário nunca chegar a
interagir normalmente com o restante da página.

## 2. Qual era o scroll container real

Confirmado: o documento (`html`/`body`), não `main`, não `Page`, não nenhum
wrapper interno. Mantido como está — nenhuma mudança arquitetural de scroll
foi necessária ou feita.

## 3. Contrato novo de página

Não foi criado um contrato NOVO porque o existente (documento rola,
`main` reserva espaço para a bottom nav via padding-bottom) já era
correto na essência. O que faltava era **consolidar o número da reserva
num token único**, para nunca mais dessincronizar da altura real da nav:

- `--pl-bottom-nav-h` (já existia desde M1, `4.35rem`) passou a ser
  reutilizado tanto pela altura da própria `BottomNav` quanto pela reserva
  inferior de `main`, em vez de `main` usar um `5.6rem` solto e
  independente.
- Folga de segurança sobre a altura real da nav subiu de `1.25rem` para
  `1.75rem` (margem extra, já que o overlap foi reportado fisicamente).

```
main: pb-[calc(var(--pl-bottom-nav-h)+env(safe-area-inset-bottom)+1.75rem)]
BottomNav: h-[var(--pl-bottom-nav-h)] + pb-[env(safe-area-inset-bottom)]
```

## 4. Bottom nav

- Altura tokenizada (`--pl-bottom-nav-h`, seção 3).
- Ganhou a prop `hidden` (`<BottomNav hidden={keyboardOpen} />`), aplicada
  como `translate-y-full` com transição — a nav **não desmonta**, só sai da
  tela, preservando o estado interno (aba ativa, `MoreSheet`) e evitando
  reflow desnecessário.
- `aria-hidden`/`inert` aplicados junto com a ocultação visual, para leitores
  de tela e navegação por teclado não alcançarem uma nav invisível.

## 5. Teclado

Causa raiz real do Problema E: **`index.html` não declarava nenhum
comportamento explícito de teclado** (`<meta name="viewport" content="width=device-width, initial-scale=1.0">`, sem `interactive-widget`). Sem essa
diretiva, o comportamento de resize do WebView Android ao abrir o teclado é
implícito e varia por versão — em alguns casos o layout viewport (o que
`100dvh`, `min-height`, `position: fixed` usam) não acompanha o teclado,
deixando `fixed`/`dvh` "cegos" para o espaço realmente disponível.

Correção:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content" />
```
- `interactive-widget=resizes-content`: força o layout viewport a encolher
  junto com o teclado — todo `100dvh`/`fixed` do app passa a refletir o
  espaço real automaticamente, sem precisar recalcular nada em JS.
- `viewport-fit=cover`: necessário para `env(safe-area-inset-*)` resolver
  corretamente em telas com corte/gesture-nav (o app já usa `env()`
  extensivamente via os tokens `--pl-safe-*`, mas dependia implicitamente
  deste valor estar presente).

Sobre isso, foi adicionado `useKeyboardInset()` (`src/hooks/useKeyboardInset.js`)
— um único listener de `visualViewport.resize` que compara a altura atual
contra uma referência "teclado fechado" (recalculada sempre que o teclado
está fechado, o que também absorve rotação de tela sem um listener
separado — a heurística ignora resizes onde a *largura* mudou, já que
isso é rotação, não teclado). Usado só para **ocultar a bottom nav**
enquanto o teclado está aberto (seção 4) — não para recalcular altura, que já
é resolvida pelo meta viewport.

## 6. visualViewport

Ver seção 5 — `window.visualViewport.resize` é o único listener adicionado,
dentro de `useKeyboardInset`. Não foi criado nenhum token CSS
(`--pl-keyboard-offset` etc.) porque `interactive-widget=resizes-content` já
resolve o caso de uso principal (layout reagindo ao teclado) sem precisar
espelhar a altura em uma custom property.

## 7. Inputs

Causa raiz real do Problema B (a mais importante desta fase): o hook
compartilhado `useOverlayBehavior` (usado por `ModalShell`, `BottomSheet`,
`DrawerShell`, `PositionSelection`, `OnboardingAttributes`) tinha
`onClose`/`closeOnEscape` nas dependências do `useEffect` principal —
que faz scroll-lock, focus-trap e o `keydown` do Escape/Android-Back.

A maioria dos consumidores passa `onClose` como **arrow function inline**
(`onClose={() => { setShowCreate(false); setSaveName(''); }}`), uma
referência nova a cada re-render. Como digitar num `<input>` controlado
dentro do modal re-renderiza o componente pai a cada tecla, o efeito
inteiro **desmontava e remontava a cada caractere digitado**. O cleanup do
efeito chama `previousFocusRef.current?.focus?.()` — que devolve o foco
para o elemento que estava focado *antes* do modal abrir, arrancando o foco
do `<input>` no meio da digitação. Em Android, perder o foco do campo fecha
o teclado virtual — exatamente o sintoma relatado ("primeira letra ok,
segunda fecha").

Correção (`src/components/design-system/useOverlayBehavior.js`):
- `onClose`/`closeOnEscape` saíram das deps do efeito; o handler de Escape
  passou a ler `onCloseRef.current`/`closeOnEscapeRef.current` (já
  atualizados a cada render, fora do efeito) em vez dos valores capturados
  no closure. O efeito agora só roda quando `open` realmente muda.
- O timer que força foco no botão fechar (`closeRef.current?.focus()`,
  pensado para acessibilidade) passou a **checar primeiro se algo dentro do
  painel já está focado** (`panelRef.current.contains(document.activeElement)`)
  — antes ele sempre roubava o foco de volta de um `<input autoFocus>` logo
  após o mount.

Isso corrige o input de "Nova carreira" (`CareerManager.jsx`, dentro de
`ModalShell`) e qualquer outro formulário dentro de um overlay do design
system — sem precisar de nenhuma mudança por página.

O input de "nome do atleta" (`Missions.jsx`) não é um overlay — é conteúdo
de página normal, então não tinha esse bug específico. Mesmo assim, os dois
campos (`save-name`, `tutorial-athlete-name`) ganharam
`onFocus={(event) => event.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}`
(Parte 8) — usado **somente** nesses dois formulários de onboarding, nunca
na narração da partida (auditado explicitamente: `LiveMatch.jsx`,
`SimulationModal.jsx` e `TournamentModal.jsx` continuam sem
`scrollIntoView`).

## 8. Onboarding

Auditadas as etapas de nome do atleta, mão dominante, lado, dificuldade e
estilo (`Missions.jsx`) e as telas mais antigas de posição/atributos
(`PositionSelection.jsx`, `OnboardingAttributes.jsx`):

- As etapas em `Missions.jsx` são `<div>`s de página normal, sem
  `max-height`/`overflow-hidden` próprios — sempre herdaram o scroll do
  documento. Confirmado que nenhuma delas ganhou esse tipo de restrição.
- `PositionSelection.jsx`/`OnboardingAttributes.jsx` já usavam
  `max-h-[calc(100dvh-2rem)]`/`overflow-y-auto` no próprio painel — correto,
  e agora também se beneficiam do fix da seção 7 (usam
  `useOverlayBehavior` com `onClose: () => {}` inline, então também sofriam
  re-execução do efeito a cada re-render).

Nenhuma mudança estrutural foi necessária nessas telas — o bloqueio real era
o teclado (seção 5) e o foco (seção 7), não a arquitetura de scroll delas.

## 9. Nome da carreira

`CareerManager.jsx`, modal "Nova carreira": beneficia diretamente do fix da
seção 7 (estava dentro de `ModalShell` → `useOverlayBehavior`). Também
ganhou `scrollIntoView` no foco (seção 7).

## 10. Nome do atleta

`Missions.jsx`, etapa `set_player_name`: não estava dentro de overlay, então
não tinha o bug de foco da seção 7 — mas ganhou `scrollIntoView` no foco
como reforço (Parte 8), já que é exatamente o tipo de campo que fica coberto
pelo teclado em telas menores.

## 11. Lado/função

`Missions.jsx`, etapa `choose_court_side`: grade de mão dominante + lado
preferencial, sem `max-height`/`overflow-hidden` (auditado via regex sobre
o bloco isolado). Já era acessível via scroll normal do documento.

## 12. Estilo

`Missions.jsx`, etapa `choose_play_style`: mesma auditoria, mesmo resultado
— grade de estilos + preview do arquétipo, sem restrição de altura própria.

## 13. Causa raiz do recovery fechar (Problema A)

Este era o bug mais grave da leva: **"Continuar partida" (treino) abria e
fechava sozinho, sem avançar o placar**, mesmo depois do hotfix de M3.1.

Investigado o fluxo completo (`ActiveMatchRecoveryBanner` → `Matches.jsx` →
`SimulationModal.resumeMatch()` → `LiveMatch`) e comparado byte a byte com o
caminho equivalente de torneio (`TournamentModal.resumeMatchCheckpoint()`),
que **já não tinha esse bug**. A diferença exata:

- **Torneio** já validava o `engine_state` do checkpoint antes de montar o
  `LiveMatch` (`probeTournamentRecoverySession` — roda `playPoint` num
  clone do estado para garantir que ele realmente "engata" no motor) **e**
  envolvia o `<LiveMatch>` com `LiveMatchRecoveryBoundary`, um error boundary
  local. O comentário do próprio boundary já documentava exatamente este
  sintoma: *"impede que o erro derrube a rota inteira e devolva o jogador
  silenciosamente à Home"*.
- **Treino** (`SimulationModal.resumeMatch()`) confiava cegamente em
  `checkpoint.engine_state` — nenhuma validação de formato/compatibilidade,
  e o `<LiveMatch>` da fase `'live'` não tinha nenhum error boundary local.
  Qualquer exceção de render/runtime (checkpoint de um schema mais antigo,
  campo ausente, qualquer falha genuína do motor) subia direto para o
  `BetaErrorBoundary` **global** (montado uma única vez em `App.jsx`,
  envolvendo o app inteiro) — que substitui TODA a interface (header,
  sidebar, bottom nav, a própria página) por uma tela de erro. Ao usuário,
  isso aparece como "a partida abriu e fechou sozinha, sem avançar".

## 14. Correção

Trazido o caminho de treino para a mesma robustez que o de torneio já tinha,
reaproveitando a validação genérica existente em vez de duplicá-la:

- **`src/game-core/practiceMatchRecoveryEngine.js`** (novo arquivo):
  `probePracticeRecoverySession(checkpoint)` reaproveita
  `inspectResumableTournamentEngineState` (de `tournamentMatchLifecycle.js`
  — apesar do nome, é uma validação genérica de formato de `engine_state`,
  sem nada específico de torneio) e roda `playPoint` num clone do estado
  antes de confiar nele. Retorna `resumable` / `restart_required` /
  `orphaned`, nunca lança.
- **`SimulationModal.resumeMatch()`**: passou a chamar
  `probePracticeRecoverySession(checkpoint)` antes de montar o `LiveMatch`.
  Se o resultado não for `resumable`, descarta o checkpoint, avisa por
  toast e volta para a tela normal de configuração — em vez de tentar
  montar um estado quebrado.
- **`<LiveMatch>` da fase `'live'`** (treino) passou a ser envolvido por
  `LiveMatchRecoveryBoundary` (o mesmo componente já usado pelo torneio,
  reaproveitado sem alterações). Uma falha de render/runtime que escape da
  sonda (ex.: um bug real do motor, não um checkpoint velho) agora é
  capturada localmente: `handleLiveMatchCrash` limpa o checkpoint, avisa por
  toast, e volta o `SimulationModal` para `phase: 'config'` — o modal
  continua aberto, o app continua de pé.

Nada do motor de partida, probabilidades, pontuação ou balanceamento foi
alterado — a mudança é inteiramente de infraestrutura de recovery/UI.

## 15. Testes

**Novo:** `scripts/test-mobile-m3-2-android-ux.mjs`
(`npm run test:mobile-m3-android-ux`) — 56 verificações:
- Estruturais (regex sobre o código real): token de bottom nav, prop
  `hidden`, meta viewport, `useOverlayBehavior` sem `onClose`/`closeOnEscape`
  nas deps, `scrollIntoView` nos dois inputs de onboarding (e ausência dele
  na narração da partida), ausência de `max-height`/`overflow-hidden` nas
  etapas de lado/estilo, presença do probe + boundary em `SimulationModal`,
  tabela de rotas real (regressão do 404 de M3.1).
- Comportamentais (engine real via Vite SSR, mesmo padrão de
  `test-tournament-resume-recovery.mjs`): checkpoint de treino válido reabre
  e **avança de fato** o placar; checkpoint corrompido (`engine_state.stats`
  nulo) vira `restart_required` em vez de estourar exceção; checkpoint
  ausente nunca é tratado como retomável; partida retomada termina
  normalmente e limpa o checkpoint só no finish real.

**Regressão executada** (todos passando após esta fase):
```
npm run lint                          → 0 erros
npm run typecheck                     → 2260 erros pré-existentes, nenhum
                                         nos arquivos tocados nesta fase
                                         (WorldEvents/WorldHub/WorldMarket/
                                         athleteSchema/etc. — débito técnico
                                         anterior, não regressão)
npm run build                         → OK (33.4s)
npm run test:mobile-foundation        → 68 verificações
npm run test:mobile-m1-hotfix         → 27 verificações
npm run test:mobile-m2-shell          → 38 verificações
npm run test:mobile-m2-device-hotfix  → 23 verificações
npm run test:mobile-m3-live-match     → 44 verificações
npm run test:mobile-m3-device-hotfix  → 58 verificações (ver nota abaixo)
npm run test:onboarding-v2            → PASS
npm run test:tutorial-chronology      → PASS
npm run test:missions / validate:missions → PASS
npm run test:match-integrity          → PASS (determinístico)
npm run test:match-playback           → PASS
npm run test:career-systems           → PASS
npm run test:tournament-match-lifecycle    → PASS
npm run test:tournament-resume-recovery    → PASS
npm run test:tournament-flow-rc            → PASS
npm run test:tournament-registration       → PASS
npm run test:post-match-interviews         → PASS
npm run test:live-coach                    → PASS
npm run test:modal-safety                  → 34 verificações
npm run test:career-beta-readiness --days=10 → PASS
```

**Nota sobre `test:mobile-m3-device-hotfix`:** uma verificação estava
desatualizada (`tournamentModal.includes('inspectTournamentMatchCheckpoint(checkpoint')`)
— o `TournamentModal.jsx` atual valida o checkpoint através de
`probeTournamentRecoverySession(buildTournamentRecoverySession(checkpoint, ...))`
(que já chama `inspectTournamentMatchCheckpoint` internamente, mais o probe
de `playPoint`), uma API mais robusta introduzida depois que o teste de
M3.1 foi escrito. A verificação foi atualizada para refletir o formato
atual — mesma garantia, chamada indireta. Corrigido, não é regressão desta
fase.

**Descoberto e não tocado (fora de escopo desta fase):**
`npm run test:global-overlays` falha com `ENOENT` porque referencia
`src/components/career/CareerAssistant.jsx`, removido num commit anterior
(`v75`, antes desta sessão). Teste órfão pré-existente, não relacionado a
overlays/scroll — reportado para visibilidade, não corrigido.

## 16. Riscos residuais

- **Nenhuma correção de layout foi validada contra um layout engine real**
  (sem Playwright/Puppeteer no projeto). As mudanças de scroll/teclado/nav
  são estrutural e logicamente corretas e seguem prática padrão da
  plataforma web (`interactive-widget=resizes-content` é a forma
  recomendada atual para este exato problema), mas a confirmação final é o
  checklist físico abaixo.
- O `--pl-bottom-nav-h` + folga de `1.75rem` é uma margem de segurança, não
  uma medição exata do dispositivo que reportou o overlap — se o overlap
  físico persistir após esta correção, o próximo passo é capturar a altura
  real da nav via `getBoundingClientRect()` no device afetado.
- `useKeyboardInset`'s heurística (18% de redução de altura = teclado) é um
  limiar razoável, não uma certeza — teclados muito pequenos (alguns
  tablets Android) podem não cruzar esse limiar e a nav não vai se esconder;
  isso é um comportamento degradado aceitável (a nav não estava se
  escondendo antes de qualquer forma), não uma regressão.

---

## Checklist Android físico

**Carreira nova:**
1. Criar carreira.
2. Digitar o nome completo normalmente, sem pausas.
3. Apagar caracteres (backspace) no meio do nome.
4. Digitar novamente.
5. Confirmar criação.

**Tutorial:**
6. Preencher nome do atleta (múltiplos caracteres seguidos).
7. Com o teclado aberto, confirmar que a bottom nav some.
8. Fechar o teclado, confirmar que a bottom nav volta.
9. Rolar até o fim da etapa de lado/mão dominante e confirmar.
10. Repetir para a etapa de estilo.
11. Continuar o tutorial normalmente.

**Scroll:**
12. Abrir Missões.
13. Rolar do topo até o último conteúdo da página.
14. Confirmar que nada fica atrás da bottom nav (cards, CTAs, texto).

**Recovery (o mais crítico):**
15. Iniciar uma partida treino.
16. Jogar alguns games (avançar alguns pontos).
17. Colocar o app em segundo plano (não fechar).
18. Matar o processo do app (forçar parar / remover dos recentes).
19. Reabrir o app.
20. Confirmar que "Continuar partida" aparece.
21. Tocar em "Continuar partida".
22. Confirmar que o LiveMatch abre e **permanece aberto** (não fecha
    sozinho).
23. Tocar em "Continuar" (play) e confirmar que o placar **avança de
    verdade**.
24. Deixar a partida terminar normalmente.
25. Repetir 15-24 para uma rodada de torneio (fluxo já validado antes desta
    fase, mas revalidar não custa).

**Landscape:**
26. Repetir os passos de input (6) e scroll (13) em modo paisagem.
27. Confirmar safe-area (nada cortado pelas bordas/notch).

---

**PARO.** Não vou iniciar M4, redesign de Home ou outra página mobile.
Aguardando novo teste físico em Android.
