# Mobile M1.1 — Hotfix pós-teste em Android real

Segue `docs/MOBILE_AUDIT.md` (auditoria) e `docs/MOBILE_M1_FOUNDATION.md` (M1
implementado). M1 passou em todos os testes automatizados, mas o teste em
dispositivo Android físico revelou 3 problemas de interação reais que os
testes de string/CSS não conseguem detectar (comportamento de `:hover` em
touchscreen, geometria real de `env(safe-area-inset-*)`, containers vazios
com padding). Este documento cobre **apenas** essas correções — nenhuma
página do escopo proibido (Home, LiveMatch, Ranking, StaffPanel,
PartnerOffersPanel, TrainingCenter, páginas legadas, persistência de partida)
foi tocada.

## 1. Resumo dos problemas e causas raiz

| # | Sintoma relatado | Causa raiz | Componente |
|---|---|---|---|
| 1 | X do toast "Missão concluída" não responde ao toque | `opacity-0` só revelado por `:hover`/`group-hover`, que nunca dispara em touchscreen (não há dispositivo apontador). Hitbox real de ~24px, abaixo do alvo mínimo. | `src/components/ui/toast.jsx` (`ToastClose`) |
| 2 | Sino, Avançar e "Carreira" não respondem ao toque no header mobile (portrait) | O container do toast (`ToastProvider`/`ToastViewport`) fica sempre montado, mesmo sem nenhum toast ativo. Como reserva `padding-top: header+safe-area+1rem` diretamente na caixa (não no conteúdo), a caixa **vazia** ocupava ~header+safe-area de altura no topo da tela, em `--z-toast` (120 — acima até de modais) — interceptando o toque mesmo invisível. | `src/components/ui/toast.jsx` (`TOAST_VIEWPORT_CLASS`) |
| 3 | Avançar volta a funcionar em landscape, mas o sino continua quebrado em ambas as orientações | Duas causas empilhadas: (a) o problema #2 é só portrait (o toast reancora para `bottom-right` a partir de `sm:` 640px, que landscape sempre cruza); (b) `FloatingUtilityRail` usa um offset solto (`top-[4.25rem]`/`md:top-20`) sem relação com a altura real do header, deixando ~4px de folga assumida — no sino, que é sempre o controle mais à direita do header/barra desktop (mesma borda onde o rail se ancora), essa folga insuficiente permite sobreposição em Android real (status bar mais alta que a assumida) em **ambas** as orientações. | `src/components/system/FloatingUtilityRail.jsx` |
| 4 | Guia da Carreira (botão "?"): conteúdo grande demais e X escondido atrás da status bar/bateria | `DrawerShell` é um painel `h-full`, ponta a ponta, sem nenhum `padding` de safe-area — o cabeçalho (com o X) renderiza colado ao topo real do viewport, atrás da status bar/notch do Android. | `src/components/design-system/DrawerShell.jsx` |

## 2. Por que funcionava em landscape e não em portrait (item 2/3)

O viewport do toast usa breakpoints Tailwind: abaixo de `sm` (640px) fica
ancorado no topo (`top-0`, `w-full`, `pt-[calc(header+safe-t+1rem)]`); a
partir de `sm` ele reancora para `bottom-0 right-0` com `pt-4`. Qualquer
landscape de celular (mesmo os mais estreitos, ~700-915px de largura CSS)
cruza tanto `sm` (640px) quanto `md` (768px, que troca o header mobile pela
barra desktop). Então, em landscape, a caixa do toast já não cobre mais o
topo — o que libera Avançar (mais à esquerda no header/barra). O sino, por
ser o controle mais à direita, continuava dependente da folga do
`FloatingUtilityRail` (item 3b), que existe em **ambas** as orientações — daí
continuar quebrado mesmo girando a tela.

## 3. Correções aplicadas

### 3.1 Toast — `pointer-events-none` no container vazio

```
TOAST_VIEWPORT_CLASS = "pl-layer-toast pointer-events-none fixed top-0 ..."
```

`ToastProvider`/`ToastViewport` (ambos usam essa mesma constante) agora não
interceptam toque quando vazios. Cada `Toast` individual já tinha
`pointer-events-auto` em `toastVariants` (pré-existente) — só ele
reativa o clique quando um toast está realmente visível. Não foi necessário
mudar nenhum z-index: a escala (`--z-header: 40`, `--z-floating: 50`,
`--z-dropdown: 60`, `--z-modal: 100`, `--z-toast: 120`, `--z-critical: 200`)
permanece idêntica — o teste `test:mobile-m1-hotfix` trava isso
explicitamente.

### 3.2 Toast — X sempre visível + hitbox de 44px

`ToastClose` deixou de depender de `opacity-0`/`:hover`/`group-hover`
(padrão que, sozinho entre todos os botões de fechar do app — `ModalShell`
e `DrawerShell` já eram sempre visíveis — só existia no toast). Agora fica
sempre visível (`opacity-100`), com hitbox ampliada via `pl-icon-tap` (o
mesmo token de 44px que M1 já usa em `Button`/`IconButton`, escopado a
`@media (max-width: 767px)` — não muda o desktop). `toastVariants` ganhou
`pr-12` (era `pr-10`) para reservar espaço para a hitbox maior sem cobrir o
texto do toast.

### 3.3 FloatingUtilityRail — offset derivado do token real + pointer-events em profundidade

```
top-[calc(var(--pl-header-h)+var(--pl-safe-t)+0.75rem)]
```

Substitui os números soltos (`top-[4.25rem]` mobile / `md:top-20` desktop)
por um cálculo que deriva da **mesma** altura que o header/barra desktop
realmente usam (`--pl-header-h`, já usado por `AppLayout`/toast/`.app-route-stage`),
mais uma folga deliberada de `0.75rem` (12px) em vez dos ~4px anteriores.
Além disso, o `<aside>` do rail ganhou `pointer-events-none`, com
`pointer-events-auto` nos 3 filhos (o wrapper do `BetaTools` e os dois
botões) — defesa em profundidade: mesmo que a caixa do rail (flex, com
`gap-2` entre os botões) ainda encoste no header em algum aparelho real, só
os botões de verdade continuam clicáveis, nunca o espaço vazio ao redor.

### 3.4 DrawerShell — safe-area no painel

```
className="pl-modal-panel pl-drawer-enter pl-safe-t pl-safe-b ..."
```

`pl-safe-t`/`pl-safe-b` (tokens já existentes desde M1,
`padding-top/bottom: env(safe-area-inset-*)`) aplicados diretamente na
`<section>` do painel (que é `h-full`, box-sizing border-box) — isso insere
todo o conteúdo (header com X, corpo, rodapé) dentro da área segura sem
tocar no padding interno de cada um. Resolve tanto o X escondido quanto,
indiretamente, a sensação de "conteúdo grande demais": o corpo
(`overflow-y-auto`) agora tem menos altura disponível (a área segura foi
descontada), então rola em vez de parecer estourar a tela.

### 3.5 ModalShell — mesma lacuna, fechada preventivamente

A auditoria (`docs/MOBILE_AUDIT.md`) já apontava `ModalShell` sem safe-area
explícita como risco conhecido (não bloqueante, pois o painel é centralizado
com margem, não ponta a ponta). Como a causa é a mesma classe de bug e o
componente é compartilhado, os mesmos `pl-safe-t pl-safe-b` foram aplicados
ao painel do `ModalShell`, preservando `max-h-[calc(100dvh-1rem)]` /
`sm:max-h-[calc(100dvh-2rem)]` (nenhuma página específica foi alterada).

### 3.6 Regressão descoberta durante a verificação: `test:global-header-overlay`

Ao rodar a suíte pedida, `test:global-header-overlay` falhou em
`'PageSection não cria containing block'` — um teste anterior ao M1 que
proibia `pl-auto-contain` em `Page.jsx`. M1 conectou `pl-auto-contain` a
`Page.jsx` de propósito (era a causa raiz do baseline de
`test:performance-responsive-v36`), então essa asserção ficou desatualizada
em relação a uma decisão já autorizada — não é um problema novo desta fase.
A asserção foi atualizada para validar a proteção real (o guard CSS
`.pl-auto-contain:has(.fixed.inset-0) { contain: none !important; }` e o
fato de `ModalShell`/`DrawerShell` usarem `createPortal` para
`document.body`, escapando de qualquer containment de `Page.jsx`), em vez de
proibir `pl-auto-contain` por completo.

## 4. Arquivos alterados

- `src/components/ui/toast.jsx`
- `src/components/system/FloatingUtilityRail.jsx`
- `src/components/design-system/DrawerShell.jsx`
- `src/components/design-system/ModalShell.jsx`
- `scripts/test-global-header-overlay-rc.mjs` (asserção desatualizada por uma decisão já autorizada do M1)
- `scripts/test-mobile-m1-hotfix.mjs` (novo)
- `package.json` (novo script `test:mobile-m1-hotfix`)

Nenhuma alteração em `Home`, `LiveMatch`, `Ranking`, `StaffPanel`,
`PartnerOffersPanel`, `TrainingCenter`, páginas legadas ou persistência de
partida. `CommunicationBell.jsx`/`CareerDayControl.jsx` (sino/avançar) não
foram alterados — a causa não estava neles.

## 5. Testes executados

Pedidos explicitamente: `lint`, `typecheck`, `build`, `test:mobile-foundation`,
`test:viewport-overlays-rc1`, `test:global-overlays`, `test:ui-quality`,
`test:performance-responsive-v36`, mais notificações
(`test:notification-deep-links`, `test:notification-system-audit`), missões
(`test:missions`), tutorial (`test:tutorial-chronology`), header global
(`test:global-header-overlay`, `test:global-header-calendar`) e overlays
(`test:modal-safety`). Também rodada uma varredura extra:
`test:onboarding-v2`, `test:secondary-ui-v2`, `test:world-ui-v2`,
`test:ui-redesign`. Novo: `test:mobile-m1-hotfix` (27 verificações,
específico desta fase).

Resultados: todos os testes listados acima passaram, incluindo o novo
`test:mobile-m1-hotfix` (27/27). `lint` limpo, `typecheck` com 2527 linhas
de saída — idêntico à contagem baseline do M1 (os únicos erros em
`toast.jsx` são o padrão pré-existente de `React.forwardRef` sem genéricos,
presente em todo o arquivo desde antes desta fase, só em linhas deslocadas
pelos comentários novos). `build` web e `app:build` (Windows/Tauri) concluídos
com sucesso — `Padel Legacy_0.9.0_x64_en-US.msi` e
`Padel Legacy_0.9.0_x64-setup.exe` regenerados (3m35s, só o warning
pré-existente de `linker_messages`).

`test:tutorial-chronology` falha com o mesmo diff (8 !== 6) documentado como
baseline pré-existente desde a Fase 8 — não relacionado a esta fase (nenhum
arquivo de missão/tutorial foi tocado).

## 6. O que precisa ser reverificado no Android físico

1. Sino, Avançar e "Carreira" respondendo ao toque no header mobile, em
   portrait E landscape.
2. Toque no espaço vazio ao redor do `FloatingUtilityRail` (entre os
   botões, ou logo abaixo dele) não deve mais roubar toque — mas o clique
   nos 3 botões do rail em si continua funcionando normalmente.
3. Um toast aparecendo (ex.: completar uma missão) e sendo fechado com um
   toque no X — deve fechar imediatamente, com o X visível desde o
   primeiro instante (sem precisar de touch-and-hold).
4. Guia da Carreira (botão "?"): X do canto superior totalmente visível e
   clicável, sem ficar atrás da status bar, em pelo menos um aparelho real
   em portrait.
5. Repetir a rotação portrait↔landscape algumas vezes para garantir que
   nenhum dos ajustes de safe-area ficou "preso" num valor errado.
