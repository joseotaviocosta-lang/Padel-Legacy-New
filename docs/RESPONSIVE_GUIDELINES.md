# Diretrizes de responsividade

Data: 2026-08-12

## Breakpoints — fonte real vs. tokens declarativos

`src/design/tokens.js` declara `breakpoints` (`mobile:0, tablet:640,
notebook:1024, desktop:1280, wide:1536`), mas **nenhum componente consome
esse objeto em tempo de execução** (confirmado por grep — ver
`docs/DESIGN_SYSTEM_V2.md`). O que efetivamente controla o layout responsivo
do jogo são as classes utilitárias do Tailwind, na escala padrão do
framework:

| Prefixo Tailwind | Largura mínima | Uso predominante no shell |
|---|---:|---|
| *(nenhum)* | 0px | Mobile: header compacto, BottomNav, conteúdo full-width |
| `sm:` | 640px | Ajustes pontuais de grid/texto |
| `md:` | **768px** | **O corte real desktop/mobile do shell** — sidebar aparece (`md:flex`), header mobile some (`md:hidden`), BottomNav some (`md:hidden`) |
| `lg:` | 1024px | Densidade de conteúdo (mais colunas) |
| `xl:` | 1280px | Painéis largos, header desktop mostra contexto extra |
| `2xl:` | 1536px | Raramente usado |

**Isso é uma inconsistência de nomenclatura, não um bug de layout**:
`tokens.breakpoints.notebook` (1024) não corresponde a nenhum breakpoint do
Tailwind realmente usado para a troca sidebar/BottomNav — quem decide isso é
`md:` (768px), fixo no Tailwind, não configurável via `tokens.js`. Se uma
fase futura quiser que `tokens.breakpoints` seja a fonte real, é necessário
mapear esses valores para `tailwind.config.js` (`theme.screens`) — não feito
nesta fase para não arriscar reflow em todo o app por uma mudança de
configuração global. Por ora, trate `tokens.breakpoints` como documentação
de intenção, e as classes `sm:`/`md:`/`lg:`/`xl:` do Tailwind como a fonte
de verdade.

## Viewports de referência

O pedido original de QA lista estes viewports. Nesta fase **a validação foi
estática (revisão de código/CSS)**, não visual — este ambiente não tem
ferramenta de captura de tela/browser automatizado disponível. Trate a
tabela abaixo como checklist para uma sessão de QA manual antes do
lançamento, não como resultado já confirmado visualmente.

| Viewport | Classe | O que checar |
|---|---|---|
| 360×800 | smartphone pequeno | BottomNav 5 abas cabem sem cortar labels; header mobile não estoura altura; BottomSheet do "Mais" não ultrapassa a tela |
| 390×844 | smartphone padrão (iOS) | Idem + safe-area em dispositivos com notch |
| 412×915 | smartphone Android grande | Idem |
| 768×1024 | tablet retrato | **Fronteira exata do corte `md:`** — checar que a sidebar aparece corretamente e o BottomNav/header mobile desaparecem sem sobreposição no exato pixel 768 |
| 1366×768 | notebook comum | Sidebar expandida não deixa o conteúdo espremido; header desktop mostra contexto (`xl:` só liga a partir de 1280 — nesta largura o bloco de contexto do header fica oculto, comportamento esperado) |
| 1920×1080 | desktop grande | Conteúdo não fica solto/vazio nas laterais (`Page` usa `max-w-*` por `size`, ver `src/components/design-system/Page.jsx`) |

## Safe areas

Aplicadas via `env(safe-area-inset-*)` nos elementos que realmente tocam a
borda da tela:

- `BottomNav.jsx` — `pb-[env(safe-area-inset-bottom)]`
- `BottomSheet.jsx` (novo, Fase 3) — `pb-[env(safe-area-inset-bottom)]` no
  painel e no footer
- `OnboardingGuide.jsx` (botão "?") e `CareerAssistant.jsx` (FAB) —
  `bottom-[calc(...+env(safe-area-inset-bottom))]`
- `FloatingUtilityRail.jsx` — `top-[calc(...+env(safe-area-inset-top))]` e
  `right-[max(0.75rem,env(safe-area-inset-right))]`

Não aplicado (nem necessário) em elementos internos de página que já vivem
dentro do `<main>`, que por sua vez já respeita o header/BottomNav fixos via
padding (`pt-16`, `pb-[calc(5.6rem+env(safe-area-inset-bottom))]` em
`AppLayout.jsx`).

## Altura de viewport

`ModalShell`/`DrawerShell`/`BottomSheet` usam `100dvh` (`max-h-[calc(100dvh-...)]`),
não `100vh` — evita o bug clássico de mobile onde a barra de endereço do
navegador some/aparece e `100vh` fica maior que a área visível real. O
shell (`AppLayout.jsx`) usa `min-h-screen` (equivalente a `100vh`) no
container raiz, o que é aceitável ali porque é só um piso mínimo, não um
teto — não corta conteúdo mesmo se a métrica for imprecisa por alguns
pixels.

## Alvo de toque

Mínimo de 44px (`2.75rem`) em botões sem classe de tamanho explícita no
mobile — regra global em `src/index.css` (`@media (max-width: 767px)`),
consolidada na Fase 2. Componentes do design-system com controle de
tamanho explícito (`IconButton size="touch"`, `Button size="touch"`) usam
44–48px deliberadamente nas ações primárias mobile.

## Checklist por elemento do shell (Fase 3)

| Elemento | Mobile | Desktop |
|---|---|---|
| Navegação | BottomNav (5 abas) + drawer lateral (menu ☰) | Sidebar fixa, recolhível |
| Sino | `CommunicationBell compact` (36px) no header mobile | Tamanho padrão (40px) no header desktop |
| Data | `compactDate` (`12/08`) | `fullDate` (`12/08/2026`) |
| Ranking/dinheiro/energia/fadiga | Ocultos no header mobile (não cabem); disponíveis na Home | `CareerHud compact` no header desktop |
| Guia/Assistente | FABs empilhados acima do BottomNav, safe-area-aware | FABs no canto inferior direito, abaixo do header |
| "Mais" | BottomSheet (Gestão incluída) | Expande inline na sidebar |
