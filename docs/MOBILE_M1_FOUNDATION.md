# Mobile M1 — Foundation

Primeira fase de implementação da auditoria mobile (`docs/MOBILE_AUDIT.md`).
Escopo: infraestrutura técnica compartilhada entre Windows, Android e futuro
iOS — Android Back, safe areas, `dvh`, containment de performance, alvos de
toque e posicionamento de toast. **Nenhuma página específica foi redesenhada**
(LiveMatch, StaffPanel, PartnerOffersPanel, TrainingCenter, Ranking, Home,
Calendário, Torneios e as 14 páginas legadas ficam para fases seguintes).

---

## 1. Problemas da auditoria resolvidos nesta fase

| Achado (`docs/MOBILE_AUDIT.md`) | Prioridade | Status |
|---|---|---|
| Android Back sem tratamento em lugar nenhum do código | P1 | ✅ Resolvido — infraestrutura central |
| Toast cobre o header mobile fixo | P1 | ✅ Resolvido |
| Toast sobrepõe a bottom nav na faixa 640–767px | P1 | ✅ Resolvido |
| `pl-auto-contain` existe mas nunca é aplicado (causa raiz do `test:performance-responsive-v36` falho) | P2 | ✅ Resolvido |
| `100vh` bruto em vez de `dvh` (`body`, `.app-route-stage`) | P2 | ✅ Resolvido (progressive enhancement) |
| Header mobile fixo sem `env(safe-area-inset-top)` | P2 | ✅ Resolvido |
| Botão "default"/"sm" do Design System abaixo de 44px em mobile | — (achado novo desta fase, ao auditar Button/IconButton/Tabs conforme pedido) | ✅ Resolvido |
| Números "mágicos" de header/bottom-nav/safe-area/touch-target espalhados | requisito 8 do brief | ✅ Documentados como tokens CSS |

Fora de escopo desta fase (ver seção 9 e `docs/MOBILE_AUDIT.md`): touch
targets específicos do `LiveMatch` (P1), `StaffPanel.jsx`/`PartnerOffersPanel.jsx`
overflow (P1), persistência de partida em andamento (P1), as 14 páginas `⚠`.

---

## 2. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/design-system/overlayBackStack.js` (novo) | Pilha global de overlays + integração com History API para Android Back |
| `src/components/design-system/useOverlayBehavior.js` | Registra/desregistra o overlay na pilha; Back respeita `closeOnEscape` igual ao Escape |
| `src/index.css` | Tokens CSS, `dvh` progressive enhancement, `pl-auto-contain` já existente (só passou a ser usado), marcadores de toque, `touch-action`/`overscroll-behavior` globais, safe-area utilities |
| `src/components/design-system/Page.jsx` | Aplica `pl-auto-contain` |
| `src/components/ui/toast.jsx` | Offset de header/bottom-nav/safe-area centralizado em `TOAST_VIEWPORT_CLASS` |
| `src/components/AppLayout.jsx` | `pl-safe-t` no header mobile e na barra desktop; `main` compensa a nova altura |
| `src/components/ui/button.jsx` | Marcadores `pl-btn-tap`/`pl-icon-tap` nos tamanhos `default`/`sm`/`icon` |
| `src/components/design-system/IconButton.jsx` | Marcador `pl-icon-tap` no tamanho `default` |
| `src/components/design-system/Tabs.jsx` | Marcador `pl-tab-trigger` |
| `scripts/test-mobile-foundation.mjs` (novo) | 68 verificações desta fase |
| `scripts/test-ui-redesign.mjs` | Assertion do alvo de toque atualizada para o novo token (ver seção 8) |
| `package.json` | Registra `test:mobile-foundation` |

Nenhuma página em `src/pages/` foi tocada.

---

## 3. Decisões arquiteturais

### 3.1 Android Back — pilha central via History API

**Como funciona:** ao abrir, todo overlay chama `history.pushState({ plOverlay: id }, '')` — uma entrada de histórico marcadora, sem navegar de fato — e se registra numa pilha (`overlayBackStack.js`). O Android consome exatamente essa entrada ao voltar, disparando `popstate`; um único listener global (ligado uma vez, nunca duplicado — guardado por uma flag `bound`) fecha o overlay do **topo** da pilha nesse evento. Fechar pela UI (X, backdrop, Escape) faz o caminho inverso: `history.back()` consome a mesma entrada, mantendo o histórico balanceado — sem isso, um usuário precisaria apertar Voltar duas vezes para realmente sair da tela depois de fechar um modal pela UI.

**Por que não um listener por componente:** os três overlays compartilhados (`ModalShell`, `BottomSheet`, `DrawerShell`) e os dois overlays de onboarding obrigatório (`PositionSelection`, `OnboardingAttributes`) já passam por `useOverlayBehavior` — a integração fica num único lugar, e todos herdam automaticamente. `TournamentModal.jsx` (sensível, não tocado) também herda, porque só usa `ModalShell` por baixo — nada nele precisou mudar.

**Pilha, não closure única:** overlays podem se empilhar de verdade (ex.: `ConfirmDialog` sobre outro modal). A pilha (array `stack`) garante que só o overlay do **topo** feche por Back — `handlePopState` sempre faz `stack.pop()`, nunca esvazia tudo de uma vez.

**`pendingProgrammaticPops` — o detalhe que evita fechar dois overlays de uma vez:** fechar o overlay do topo pela UI dispara `history.back()` programaticamente, que por sua vez dispara um `popstate` assíncrono. Sem tratamento, esse `popstate` "extra" seria confundido com um Back físico e fecharia o overlay de baixo também — dois overlays fechando com um clique. O contador `pendingProgrammaticPops` marca esse `popstate` como já tratado e o ignora.

**Passos obrigatórios de onboarding (`closeOnEscape: false`):** o overlay ainda entra na pilha (protege contra um Back físico navegar para fora da tela ou sair do app por baixo dele), mas o handler de Back só chama `onClose` **se `closeOnEscape` permitir** — exatamente a mesma regra que já existia para a tecla Escape. Um Back físico num passo obrigatório é absorvido sem efeito, igual ao Escape hoje.

**Garantias explícitas do brief, verificadas:**
- Escape continua funcionando (checado por teste — a lógica do Escape não foi tocada, só a de Back foi adicionada ao lado).
- Backdrop click continua funcionando (não tocado).
- React Router não foi alterado — `pushState`/`history.back()` não navegam para nenhuma rota, só empilham/desempilham marcadores acima da entrada de histórico da rota atual.
- Sem listener duplicado — um único `addEventListener('popstate', ...)` para o app inteiro, guardado por `bound`.
- Sem memory leak — cada overlay desregistra no cleanup do `useEffect` (fechamento pela UI *ou* desmontagem do componente).

### 3.2 Safe area — tokens centralizados, não hack por página

`src/index.css` define `--pl-safe-t/b/l/r` (com fallback `0px` explícito),
`--pl-header-h` (4rem) e `--pl-bottom-nav-h` (4.35rem) — os mesmos valores já
usados em `AppLayout.jsx`/`BottomNav.jsx`, agora documentados como tokens em
vez de reescritos. Utilitários `.pl-safe-t/b/l/r/x/y` ficam disponíveis para
qualquer componente novo. O header mobile e a barra desktop (`AppLayout.jsx`)
passaram a usar `pl-safe-t`; como ambos tinham altura fixa (`h-16`, `border-box`
por padrão do Tailwind), adicionar `padding-top` diretamente **comprimiria**
o conteúdo em vez de estender a área visível — por isso a mudança foi
`h-16` → `min-h-16` (a caixa cresce para acomodar o inset, o conteúdo não é
espremido) e o `main` (que precisa saber a altura real do header fixo para
não ficar coberto) passou a compensar `calc(4rem + env(safe-area-inset-top))`
em vez de `pt-16` fixo.

Bottom nav, `BottomSheet`, `FloatingUtilityRail` e os dois FABs (Guia da
carreira, Assistente) já tinham `env(safe-area-inset-bottom)`/`-top` corretos
antes desta fase — não foram tocados, só confirmados intactos pelo teste.

### 3.3 Viewport height — `dvh` como *progressive enhancement*

Nenhum uso de `100vh`/`h-screen`/`min-h-screen`/`max-h-screen` foi
substituído — todos ganharam uma declaração `dvh` **depois** da declaração
`vh` original (cascata CSS: navegadores sem suporte a `dvh` simplesmente
ignoram a segunda linha e mantêm o comportamento de sempre). Para as classes
utilitárias do Tailwind (`.min-h-screen`, `.h-screen`, `.max-h-screen`, que
compilam para uma única declaração e não permitem duas no mesmo lugar), a
correção foi um `@supports (height: 100dvh) { ... }` central que reescreve
essas três classes — cobre AppLayout, AuthLayout, CareerManager, Landing,
PageNotFound, BetaErrorBoundary, UserNotRegisteredError e o toast de uma vez,
sem tocar nenhum desses arquivos individualmente. Em desktop Windows (sem
chrome de navegador dinâmico) o valor computado de `dvh` é idêntico a `vh` —
zero mudança visual.

### 3.4 `pl-auto-contain`

A classe já existia em `index.css` com a implementação completa
(`content-visibility: auto` + a exceção `:has(.fixed.inset-0)` que impede
containment de quebrar overlays abertos) desde a v36.4.3, mas nunca tinha
sido aplicada a nenhum componente. A correção foi de uma linha: `Page.jsx`
passou a incluir `pl-auto-contain` no container raiz. É exatamente a causa
que fazia `test:performance-responsive-v36` falhar desde antes da Fase 7 —
confirmado corrigido rodando o teste (`PASS 5/5`).

### 3.5 Alvos de toque — marcadores do design system, não CSS solto

A auditoria pediu para auditar `Button`, `IconButton` e `Tabs` e garantir
tamanho apropriado para toque **sem** aumentar todo botão do desktop
indiscriminadamente. Já existia uma rede de segurança em `index.css` (desde
antes desta fase) para botões *sem* classe de altura/largura explícita
(`:not([class*="w-"]):not([class*="h-"])`) — mas essa regra nunca protegia
instâncias reais de `Button`/`IconButton`, porque esses componentes **sempre**
têm uma classe `h-`/`w-` explícita vinda da variante de tamanho (`h-10`,
`h-8` etc.) — o próprio seletor de exclusão as filtrava para fora.

A correção: cada tamanho do `Button`/`IconButton`/`TabsTrigger` que fica
abaixo de 44px ganhou um marcador estável (`pl-btn-tap`, `pl-icon-tap`,
`pl-tab-trigger`) aplicado **pelo próprio componente**, não por nenhuma
página. A regra CSS que usa esse marcador (`min-height: var(--pl-touch-min)`)
só existe dentro do `@media (max-width: 767px)` já existente — então o efeito
é zero no desktop e automático em qualquer lugar do app que já use esses
componentes oficiais, sem precisar tocar página nenhuma. Tamanhos que já são
≥44px (`lg`, `touch`) não ganharam marcador — não há aumento indiscriminado.
A rede de segurança antiga também passou a cobrir overlays (`.pl-modal-panel`,
compartilhada por `ModalShell`/`BottomSheet`/`DrawerShell`), que antes só
protegiam conteúdo de página.

### 3.6 Toast — offset central, não número mágico duplicado

`ToastProvider`/`ToastViewport` agora compartilham uma única constante
(`TOAST_VIEWPORT_CLASS`) em vez de duas strings de classe idênticas copiadas
(o bug original nasceu justamente de haver dois lugares para esquecer de
atualizar). Abaixo de `sm` (mobile, header fixo visível) o toast reserva
`var(--pl-header-h) + var(--pl-safe-t)` no topo. Entre `sm` e `md`
(640–767px — a faixa onde o toast já ancora embaixo mas a bottom nav ainda
aparece) reserva `var(--pl-bottom-nav-h) + var(--pl-safe-b)` embaixo. A
partir de `md` (bottom nav some via `md:hidden`) o offset extra é removido.

### 3.7 CSS mobile — revisão geral (requisito 9 do brief)

- **`touch-action: manipulation`**: já existia, mas só dentro de
  `.app-route-stage` sob `max-width:767px` (só conteúdo de página). Promovido
  para a regra base `button, a, [role="button"]` — cobre header, sidebar,
  overlays e bottom nav também, sem condição de largura (o efeito só existe
  em telas de toque de qualquer forma; em mouse não muda nada). A regra
  antiga, agora redundante, foi removida.
- **`overscroll-behavior-y: contain`** adicionado ao `body` — evita o bounce/
  pull-to-refresh nativo do Android vazar do scroll interno do app.
- **`overflow-x`**: já havia `overflow-x: hidden` no `body` e `.pl-no-horizontal-overflow`
  disponível — nenhuma mudança necessária, nada de novo encontrado pela
  auditoria além do que M1 já resolveu.
- **z-index**: escala já organizada (`--z-header:40 < --z-floating:50 <
  --z-dropdown:60 < --z-modal:100 < --z-toast:120 < --z-critical:200`) —
  confirmada consistente, sem conflito, nada alterado.
- **containment**: ver 3.4.

---

## 4. Resultado dos testes

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ limpo |
| `npm run typecheck` | 2527 linhas de diagnóstico — idêntico ao baseline (nenhum erro novo) |
| `npm run build` | ✅ sucesso |
| `npm run test:ui-quality` | ✅ PASS |
| `npm run test:performance-responsive-v36` | ✅ **PASS 5/5** (baseline falhava por causa do `pl-auto-contain`, ver 3.4) |
| `npm run test:viewport-overlays-rc1` | ✅ PASS 9/9 |
| `npm run test:global-overlays` | ✅ PASS 88/88 |
| `npm run test:vite-config` | ✅ PASS |
| `npm run test:dev-server-config` | ✅ PASS |
| `npm run test:mobile-foundation` (novo) | ✅ PASS 68/68 |
| `npm run test:ui-redesign` | ✅ PASS 181/181 (assertion do alvo de toque atualizada — ver seção 8) |
| `npm run test:ui-shell` | ✅ PASS 89/89 |
| `npm run test:ui-performance` | ✅ PASS 16/16 |
| `npm run test:modal-safety` | ✅ PASS 34/34 |
| `npm run test:secondary-ui-v2` | ✅ PASS 57/57 |
| `npm run test:world-ui-v2` | ✅ PASS 72/72 |
| `npm run test:visual-checkpoint-hotfix1` | ✅ PASS 36/36 |
| `npm run test:core-gameplay-ui` | ✅ PASS 73/73 |
| `npm run test:training-v2` | ✅ (fórmulas intocadas, não é o escopo desta fase) |
| `npm run test:onboarding-v2`, `test:tournament-flow-rc`, `test:tournament-registration`, `test:career-systems`, `test:missions`, `test:partner-offers`, `test:live-coach` | ✅ todos PASS (varredura extra — `useOverlayBehavior.js` é usado por todo modal do app) |
| `npm run app:build` (Windows) | ✅ ver seção 6 |

Nenhuma falha nova. Nenhuma falha baseline pré-existente (`test:tutorial-chronology`/`test:beta`) foi reintroduzida nem tocada — fora do escopo desta fase, como já documentado na Fase 8.

---

## 5. Baseline preservado

- `typecheck`: 2527 linhas de diagnóstico antes e depois — nenhum erro novo introduzido.
- `test:tutorial-chronology`/`test:beta`: continuam com a falha pré-existente já documentada (Fase 8) — não relacionados a este trabalho, não tocados.

---

## 6. Build Windows/Tauri

`npm run app:build` executado após todas as mudanças. ✅ Sucesso — Rust
recompilou em 3m30s (dependências já em cache), único aviso pré-existente de
`linker_messages` (informativo, não bloqueia). Dois instaladores gerados:
- `src-tauri/target/release/bundle/msi/Padel Legacy_0.9.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Padel Legacy_0.9.0_x64-setup.exe`

---

## 7. Comportamento esperado no Android real

- Pressionar o botão/gesto voltar com um `ModalShell`/`BottomSheet`/`DrawerShell`/`ConfirmDialog` aberto deve fechar **só esse overlay**, sem navegar a rota por baixo nem sair do app.
- Com dois overlays abertos (ex.: `ConfirmDialog` sobre um modal), o primeiro Back fecha só o de cima; um segundo Back fecha o de baixo.
- Nos dois passos obrigatórios de onboarding (`PositionSelection`, `OnboardingAttributes`), Back não faz nada visível — nem fecha, nem sai da tela, nem navega — igual ao comportamento já existente do Escape.
- Fechar um modal pela UI (X, backdrop, botão de ação) e *depois* pressionar Back deve navegar a rota normalmente (sair da tela), não precisar de dois Backs.
- Toast não deve mais cobrir o header no topo em nenhuma largura de tela, nem a bottom nav entre 640–767px de largura.
- Header mobile deve reservar espaço para a status bar/notch em vez de o conteúdo ficar atrás dela.

Nenhum destes comportamentos foi validado em dispositivo físico nesta sessão
(ambiente de desenvolvimento é Windows) — a lógica foi verificada por leitura
de código e pelos testes automatizados listados na seção 4, que replicam as
condições via assertions sobre o código-fonte, não emulação real de WebView/
Android. **Recomenda-se validação em dispositivo Android real antes de M2.**

---

## 8. Riscos restantes / notas para M2+

- **Verificação em dispositivo real pendente** (seção 7) — maior risco residual desta fase.
- **`ModalShell` sem safe-area explícita nas bordas**: mitigado parcialmente por já usar `dvh` e padding de backdrop generoso (`p-2 sm:p-4`), mas não foi instrumentado com `env(safe-area-inset-*)` como o header/toast/BottomSheet foram — baixo risco (conteúdo sempre centralizado, longe das bordas), mas não confirmado em paisagem com notch lateral.
- **14 páginas `⚠` continuam não verificadas** para mobile (fora de escopo desta fase).
- **Touch targets específicos do `LiveMatch`** (controles de velocidade/pular, P1 da auditoria) não foram tocados — pertencem a uma fase de gameplay (M7 na numeração sugerida).
- **`StaffPanel.jsx`/`PartnerOffersPanel.jsx`** (overflow horizontal confirmado, P1) não foram tocados.
- **Persistência de partida em andamento** (P1, maior risco de produto da auditoria) não foi tocada — fora de escopo desta fase por instrução explícita.
- A assertion de `scripts/test-ui-redesign.mjs` para o alvo de toque de 44px foi atualizada para checar o novo token `--pl-touch-min` em vez do literal `2.75rem` solto — mesmo valor computado, só expressa via token (motivo: essa tokenização foi pedida explicitamente pelo requisito 8 desta fase).
