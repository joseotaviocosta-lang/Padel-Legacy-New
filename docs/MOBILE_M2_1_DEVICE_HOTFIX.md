# Mobile M2.1 — Device Hotfix

Hotfix cirúrgico pós-teste em Android físico, fechando o M2 (docs/MOBILE_M2_SHELL.md).
Corrige exatamente dois problemas confirmados no aparelho real:

1. o menu do hamburger (drawer de navegação mobile) invade a área segura no topo;
2. o sino de comunicações não responde ao toque em landscape.

Não inicia M3, não redesenha páginas, não altera gameplay/economia/tutorial/progressão.

---

## 1. Sino em landscape — causa raiz real

### 1.1 O que estava quebrado

Portrait: sino funciona. Landscape: Avançar, Carreira e os demais controles
funcionam, mas o sino não responde ao toque.

### 1.2 Por que a hipótese do M2 (folga do `FloatingUtilityRail`) nunca poderia ter resolvido isso

O M2 diagnosticou "colisão geométrica entre o dock (`FloatingUtilityRail`) e
o header" e aumentou a folga vertical de 0,75rem para 1,5rem. Essa correção
é legítima para o que ela protege — mas **o `CommunicationBell` (sino) nunca
foi renderizado dentro do `FloatingUtilityRail`**. São dois componentes
diferentes:

- `FloatingUtilityRail.jsx` — Guia da Carreira, BETA, Carreiras, Som;
- `CommunicationBell` (sino) — renderizado dentro do `<header>` fixo do
  `AppLayout.jsx` (versão `compact`, mobile) e dentro da `app-desktop-bar`
  (versão normal, desktop/landscape largo).

Aumentar a folga de um componente que não contém o elemento quebrado não
podia, estruturalmente, ter efeito nenhum sobre ele. Isso já explica por que
o teste físico continuou reproduzindo o bug depois do "fix" do M2.

### 1.3 Causa raiz real

O `<header>` mobile fixo (`AppLayout.jsx`) sempre teve `pl-safe-t` (respeita
a área segura no topo — status bar/notch), mas **nunca teve nenhum
tratamento de safe-area lateral** (`env(safe-area-inset-left)` /
`env(safe-area-inset-right)`). Ele usava apenas um padding fixo (`px-2.5` =
0,625rem) dos dois lados.

Em portrait, os insets laterais são tipicamente ~0 (não há recorte de
câmera/notch nas bordas esquerda/direita), então essa lacuna nunca se
manifestava. Em landscape, é comum o recorte de câmera/o arredondamento de
cantos do display "migrar" para uma borda lateral — os insets
esquerdo/direito deixam de ser 0. O sino é o controle mais à direita do
header (`justify`-end implícito pelo `flex-1` do título), a apenas 0,625rem
fixos da borda física — exatamente a região mais exposta a esse inset lateral
crescente. Avançar e Carreira ficam mais centrais na fileira e escapam do
mesmo efeito.

Essa é uma causa estruturalmente diferente de "faltou folga": não é uma
questão de aumentar um número, é uma dimensão inteira (safe-area lateral)
que nunca foi implementada nesse componente específico — ao contrário do
`BottomNav` (que já tinha `env(safe-area-inset-bottom)`) e das overlays do
design system (`pl-safe-t`/`pl-safe-b` desde o M1.1).

### 1.4 Elemento/regra que impedia o toque

Não é um elemento *sobrepondo* o sino (não há overlay transparente, backdrop
órfão ou trigger duplicado interceptando o toque — auditados e descartados:
nenhum `fixed inset-0` global persiste condicionalmente por orientação, o
dropdown do sino só existe no DOM quando `open=true`, e `FloatingUtilityRail`
já tinha a defesa `pointer-events-none` no container + `pointer-events-auto`
nos botões, então não é um problema de captura de eventos por um irmão).
É a **posição geométrica do próprio botão**, empurrada para dentro (ou muito
perto) do inset direito não protegido, na borda onde alguns
Android/fabricantes reduzem a sensibilidade de toque ou onde o recorte físico
da câmera efetivamente ocupa a área.

### 1.5 Por que os testes do M2 continuaram verdes com o bug ainda presente

`scripts/test-mobile-m2-shell.mjs` checks 6/7 ("Sino permanece acionável na
estrutura landscape/breakpoints") verificavam apenas:

- a fórmula de offset do `FloatingUtilityRail` (`--pl-header-h` + `--pl-safe-t` + Xrem);
- que esse valor não regrediu para 0,75rem;
- que `CommunicationBell` aparece 2x no arquivo (mobile + desktop).

Nenhum desses checks olha para o padding lateral do `<header>` em si — o
teste provava que o **componente errado** continuava com a correção
aplicada, nunca que o **sino** era clicável. Testes estruturais (regex sobre
código-fonte) não conseguem simular geometria real de notch/safe-area por
orientação; eles só provam "a string X ainda está no arquivo", não "o pixel
Y responde ao toque". O comentário desse bloco em
`test-mobile-m2-shell.mjs` foi reescrito para deixar isso explícito, e a
correção real ganhou cobertura própria em
`scripts/test-mobile-m2-1-device-hotfix.mjs`.

### 1.6 Correção aplicada

`src/components/AppLayout.jsx` — `<header>` mobile:

```diff
- className="... px-2.5 md:hidden"
+ className="... pl-[calc(0.625rem+var(--pl-safe-l))] pr-[calc(0.625rem+var(--pl-safe-r))] md:hidden"
```

Mesmo tratamento aplicado, por simetria e defesa em profundidade, na barra
desktop (`app-desktop-bar`) — que passa a ser a barra ativa sempre que um
Android landscape largo cruza o breakpoint `md` (768px):

```diff
- className="... px-4 ... md:flex lg:px-5"
+ className="... pl-[calc(1rem+var(--pl-safe-l))] pr-[calc(1rem+var(--pl-safe-r))] ... md:flex lg:pl-[calc(1.25rem+var(--pl-safe-l))] lg:pr-[calc(1.25rem+var(--pl-safe-r))]"
```

O padrão `calc(base + var(--pl-safe-*))` já existia no projeto (M1.1,
`pl-modal-footer`) e foi reaproveitado em vez de duas classes utilitárias
concorrentes na mesma propriedade CSS (ordem de cascata entre `px-2.5` e uma
hipotética `pl-safe-x` seria ambígua e frágil).

`FloatingUtilityRail.jsx` **não foi tocado** — nem a folga, nem o offset —
porque a causa raiz não estava lá e o enunciado explicitamente pediu para
não repetir uma correção por tentativa.

---

## 2. Drawer / hamburger — causa raiz real

### 2.1 O que estava quebrado

Ao tocar no ícone de três linhas, o drawer de navegação abre, mas o botão
**X** no canto superior ultrapassa a área segura — fica parcialmente
escondido atrás da status bar/notch.

### 2.2 O drawer usava `DrawerShell`?

**Não.** `AppLayout.jsx` sempre teve sua própria implementação
(`motion.aside` com `AnimatePresence`, animação de `x: '-100%'` para `x: 0`)
— nunca importou nem usou `src/components/design-system/DrawerShell.jsx`.
Por isso a correção de safe-area que o `DrawerShell` ganhou no M1.1
(`pl-safe-t pl-safe-b` no painel) nunca chegou a este menu: são dois
componentes de código completamente diferentes que só parecem o mesmo tipo
de UI.

Confirmado também: essa implementação própria não usava o hook
compartilhado `useOverlayBehavior` (scroll-lock, focus-trap, ESC,
Android-Back via `overlayBackStack`) — cada overlay do design system
(`ModalShell`/`DrawerShell`/`BottomSheet`) usa esse hook; o drawer do
hamburger, não.

### 2.3 Correção de safe-area

Em vez de migrar para o `DrawerShell` (que é ancorado à direita — o
hamburger abre pela esquerda; adaptar o componente compartilhado para
suportar os dois lados seria uma refatoração maior que o escopo deste
hotfix pede para evitar), a mesma classe de correção foi aplicada
diretamente ao `motion.aside` existente:

```diff
- <motion.aside id="mobile-navigation-drawer" aria-label="Navegação principal"
-   className="glass fixed inset-y-0 left-0 z-[70] flex w-[min(88vw,20rem)] flex-col border-r border-border md:hidden" ...>
+ <motion.aside ref={mobileDrawerPanelRef} id="mobile-navigation-drawer" role="dialog" aria-modal="true" aria-label="Navegação principal"
+   className="glass pl-safe-t pl-safe-b fixed inset-y-0 left-0 z-[70] flex w-[min(88vw,20rem)] flex-col border-r border-border pl-[var(--pl-safe-l)] md:hidden" ...>
```

- `pl-safe-t` empurra o cabeçalho (logo + X) para baixo da status bar/notch;
- `pl-safe-b` protege as ações do rodapé (Gerenciar carreiras / Sair) da
  gesture bar/inset inferior;
- `pl-[var(--pl-safe-l)]` protege a borda esquerda (onde o drawer é
  ancorado) do mesmo tipo de inset lateral do item 1, relevante em landscape.

Como o padding fica no `<aside>` (que é `flex flex-col`, `inset-y-0`), o
conteúdo interno se redistribui sozinho: o cabeçalho não cresce, a `<nav>`
(que já tinha `flex-1 overflow-y-auto`) simplesmente recebe menos altura
disponível e continua rolável. Não foi necessário `dvh`: como o container já
é `fixed` com `inset-y-0` (ambas as bordas verticais ancoradas ao viewport),
ele já é imune ao problema clássico de `100vh` incluir a barra de endereço do
navegador.

### 2.4 Android Back

O drawer não integrava com `overlayBackStack`. Corrigido reaproveitando o
hook compartilhado em vez de duplicar a lógica:

```js
const { closeRef: mobileDrawerCloseRef, panelRef: mobileDrawerPanelRef } = useOverlayBehavior({
  open: mobileOpen,
  onClose: () => setMobileOpen(false),
});
```

com `panelRef` no `motion.aside` e `closeRef` no botão X. Isso dá ao drawer,
de graça, os mesmos três comportamentos que `ModalShell`/`DrawerShell`/
`BottomSheet` já garantem: Android Back fecha o drawer (via
`registerOverlay`/`popstate`), Tab fica preso dentro do painel (focus-trap),
e o scroll do body é bloqueado enquanto o drawer está aberto — esse último é
um bônus (o comportamento anterior não bloqueava o scroll de fundo), não uma
mudança de escopo: é exatamente o que o hook compartilhado já faz para todo
overlay do app.

---

## 3. Diagnóstico controlado (Parte 3 do enunciado)

Como não foi possível reproduzir a geometria exata de um notch/recorte de
câmera Android real neste ambiente, além da correção acima (com causa raiz
comprovável por análise de código, não por tentativa), foi adicionada uma
ferramenta de diagnóstico opcional para o **próximo teste físico**, caso o
sino ainda precise de investigação adicional:

`src/lib/hitTestProbe.js` — ao ser ativado, registra um listener global
(`pointerdown`/`click`, fase de captura) que compara `event.target` com
`document.elementFromPoint(x, y)` e mostra o resultado tanto no console
quanto em um pequeno badge fixo na tela (não depende de USB
debugging/`chrome://inspect`).

- **Inativo por padrão** — custo de inicialização é só ler uma flag.
- **Ativar**: abrir o app com `?hitdebug=1` na URL uma vez (persiste via
  `localStorage`) ou, com o console disponível, `localStorage.setItem('padel:hit-test-probe', '1')`.
- **Desativar**: `?hitdebug=0` ou `localStorage.removeItem('padel:hit-test-probe')`.

Não fica "ligado" em produção — é opt-in explícito, então não é telemetria
nem debug permanente, mas continua disponível no build real instalado no
aparelho (diferente de um gate `import.meta.env.DEV`, que ficaria
indisponível justamente no build que o usuário instala para testar).

---

## 4. Arquivos modificados

- `src/components/AppLayout.jsx` — header mobile e barra desktop com
  padding lateral combinado com `--pl-safe-l`/`--pl-safe-r`; drawer do
  hamburger com `pl-safe-t`/`pl-safe-b`/`pl-[var(--pl-safe-l)]` e integração
  com `useOverlayBehavior`.
- `src/lib/hitTestProbe.js` (novo) — diagnóstico opt-in de hit-test.
- `src/main.jsx` — inicializa `initHitTestProbe()` (inerte por padrão).
- `scripts/test-mobile-m2-1-device-hotfix.mjs` (novo) — 23 verificações.
- `scripts/test-mobile-m2-shell.mjs` — comentário do bloco 6/7 corrigido
  para não afirmar que protege o sino (ele protege o `FloatingUtilityRail`,
  que é outro componente); nenhuma assertion removida.
- `package.json` — novo script `test:mobile-m2-device-hotfix`.

**Não alterados** (fora de escopo, confirmado por auditoria): `CommunicationBell.jsx`
(handler/deep-link/dropdown continuam exatamente como no M2),
`careerCommunications.js`, `notificationDestinations.js`, `BottomNav.jsx`,
`FloatingUtilityRail.jsx`, `DrawerShell.jsx`/`ModalShell.jsx`/`BottomSheet.jsx`,
`overlayBackStack.js`.

---

## 5. Testes

Novo: `npm run test:mobile-m2-device-hotfix` — 23 verificações, cobrindo a
causa raiz real do sino (padding lateral do header), a causa raiz real do
drawer (safe-area + `useOverlayBehavior`), regressões de Android Back e de
deep-links, e o diagnóstico opt-in.

Regressão executada (Parte 13 do enunciado) — todos passando:
`lint`, `typecheck`, `build`, `test:mobile-foundation`, `test:mobile-m1-hotfix`,
`test:mobile-m2-shell`, `test:viewport-overlays-rc1`, `test:global-overlays`,
`test:global-header-calendar`, `test:global-header-overlay`,
`test:notification-deep-links`, `test:notification-system-audit`,
`test:modal-safety`, `test:ui-quality`, `test:performance-responsive-v36`.
Também reexecutados por precaução (tocam `AppLayout.jsx`/mesma área):
`test:redesign-polish2`, `test:redesign-polish21`.

## 6. Regressões encontradas

Nenhuma.

## 7. Checklist Android físico

### Portrait
- [ ] abrir app
- [ ] tocar Sino — abre e fecha normalmente
- [ ] tocar Avançar
- [ ] tocar Carreira
- [ ] tocar hamburger
- [ ] confirmar X completamente visível (abaixo da status bar/notch)
- [ ] fechar menu pelo X
- [ ] abrir novamente
- [ ] fechar com Android Back

### Landscape
- [ ] girar o aparelho
- [ ] tocar Sino — **teste obrigatório**, deve abrir o painel
- [ ] abrir e fechar o painel do sino algumas vezes
- [ ] tocar Avançar
- [ ] tocar Carreira
- [ ] tocar hamburger
- [ ] confirmar safe-area lateral/superior do drawer
- [ ] fechar pelo X
- [ ] fechar com Android Back

### Rotação
- [ ] portrait → landscape → portrait → landscape, testando o Sino a cada
      estado

Se o sino ainda falhar em algum desses passos, ativar o diagnóstico
(`?hitdebug=1`) antes de repetir o toque e reportar o texto exibido no badge
(mostra `event.target` vs `elementFromPoint` na coordenada exata do toque).

---

**PARE.** Não iniciar M3. Não iniciar LiveMatch. Não iniciar nenhuma outra
melhoria mobile. Aguardando validação física do usuário.
