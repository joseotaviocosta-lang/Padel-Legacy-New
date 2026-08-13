# Redesign Checkpoint — Polish 2

Segunda rodada de polish sobre a identidade já aprovada (Fases 1–8 +
Hotfix 1 + Mobile M1/M1.1). Foco: densidade de informação, hierarquia,
redução de redundância, aproveitamento vertical em 1366×768 e consolidação
dos floating actions — sem tocar Design System, cores, tipografia, gameplay
ou navegação.

## 1. Problemas encontrados na auditoria

- **Home**: a mesma informação de "torneio chegando" e "lesionado, X dias"
  podia aparecer em até 3–5 lugares na mesma viewport (`CareerMomentStrip`,
  `NextEventCard`, `MedicalStatusPanel`, o item "injury" das prioridades, e
  o próprio widget `CareerCalendar`).
- **Onboarding global** (`OnboardingGuide.jsx`, montado em `AppLayout` antes
  de qualquer página): a introdução de página reabria expandida a cada
  visita, e o card verde "Próximo passo" sempre mostrava um parágrafo extra
  ("Por que usar") — dois blocos permanentemente grandes no topo de toda
  página, não só da Home.
- **Calendário**: data grande + texto auxiliar + grid de 4 `StatCard` eram 3
  blocos empilhados antes das Tabs/calendário real aparecerem.
- **Treinos**: Duração/Fadiga/Energia ocupavam 3 caixas verticais por card,
  multiplicado pelo número de cards na grade.
- **Floating actions**: até 5 controles flutuantes simultâneos (BETA,
  Carreiras, Som, "?" do guia, Assistente da carreira) — e dois deles
  (o "?" e o pill minimizado do tutorial) usavam exatamente as mesmas
  coordenadas no mobile, um escondendo o outro.

## 2. Alterações realizadas

| Área | Arquivo | Mudança |
|---|---|---|
| Home | `src/pages/CareerHub.jsx` | `CareerMomentStrip` some quando `type` é `tournament`/`injury` (coberto por `NextEventCard`); prioridade "injury" do briefing diário some quando lesionado (coberto por `MedicalStatusPanel`) |
| Home | `src/components/career/CareerCalendar.jsx` | Removidos os avisos internos de torneio/lesão (duplicados) e a consulta de torneios que só alimentava esse aviso |
| Global | `src/components/onboarding/OnboardingGuide.jsx` | Introdução de página recolhe por padrão após a 1ª visita (reaproveita `pageIntroductionsSeen`); "Por que usar" virou disclosure sob demanda; fab "?" removido (relocado ao dock); pill minimizado reposicionado para não sobrepor o Assistente no mobile |
| Calendário | `src/pages/CalendarPage.jsx` | Data + 4 `StatCard` + botões de avanço + texto auxiliar viraram uma única `Surface` compacta |
| Treinos | `src/components/training/TrainingActivityCard.jsx` | Duração/Fadiga/Energia viraram uma linha compacta (era grid de 3 caixas) |
| Global | `src/components/system/FloatingUtilityRail.jsx` | Vira um dock: 1 gatilho fixo + `BottomSheet` com Guia/Carreiras/Som/BETA |
| Teste desatualizado | `scripts/test-global-header-overlay-rc.mjs` | Asserção que proibia `pl-auto-contain` em `Page.jsx` (decisão do M1, não desta fase) atualizada para validar a proteção real (guard CSS + portal) |

Nenhuma alteração em `src/lib/trainingSystemV2.js`, `src/game-core/*`,
`src/App.jsx`, `BottomNav.jsx`, `BrandMark.jsx` ou qualquer arquivo de
engine/balance/rotas.

## 3. Decisões de design

- **Regra de dedup aplicada**: uma mesma informação temporal (torneio em
  X dias, lesão com Y dias restantes) só permanece no painel mais
  *acionável* da viewport (o que tem CTA/skip-recovery), não em todos os
  painéis que a mencionam. Painéis sem sobreposição real (título, ranking,
  sequência, dupla) não foram tocados.
- **OnboardingGuide é global, não só da Home**: por estar montado em
  `AppLayout` antes do `Outlet`, a compactação da introdução de página e do
  card de tutorial beneficia todas as páginas, não só o Hub — e reduz o
  "topo pesado" que o brief descreveu especificamente para a Home.
- **Utility Dock via `BottomSheet` (não um dropdown novo)**: em vez de
  construir um segundo padrão de overlay (dropdown desktop + sheet mobile),
  o dock reusa `BottomSheet` em qualquer largura — Android Back, Escape,
  foco e safe-area já vêm de `useOverlayBehavior` de graça, sem reimplementar
  nada. O Assistente da carreira (`CareerAssistant`) continua separado,
  como o enunciado permite ("pode permanecer separado se for considerado
  ação principal") — é o único com badge de prioridades e engajamento
  contínuo.
- **`window.dispatchEvent`/`addEventListener` para o gatilho do Guia**: o
  dock não tem acesso direto ao estado do `OnboardingGuide` (donos de
  estado diferentes). Em vez de subir `helpOpen` para `AppLayout` (prop
  drilling), reusou-se o padrão já estabelecido no projeto de eventos
  `padel:*` (usado por `padel:mission-completed`, `padel:onboarding-refresh`
  etc.) — menor diff, nenhuma reestruturação de dono de estado.

## 4. Home — antes/depois conceitual

**Antes** (1366×768, cenário com torneio a 2 dias): Relatório
mensal/anual (se aplicável) → Banner de torneio ativo (se aplicável) →
**CareerMomentStrip: "Los Angeles Cup está chegando... faltam 2 dias"** →
Identidade → Próximo objetivo + **NextEventCard: "Em 2 dias · Los Angeles
Cup · Inscrição aberta"** → "O que fazer agora" (pode incluir uma 3ª menção
via prioridades) + **CareerCalendar: "Los Angeles Cup em 2 dias. Planeje sua
semana!"** → ...

**Depois**: `CareerMomentStrip` não aparece para esse cenário (o tipo
`tournament` é suprimido); `NextEventCard` continua sendo a única menção
"em X dias" com CTA; `CareerCalendar` mostra só progresso diário/energia/
química/avançar, sem repetir o torneio. A mesma lógica vale para lesão
(`MedicalStatusPanel` vira a única fonte com ação, `NextEventCard` mostra o
resumo, os outros 2–3 lugares somem).

## 5. Calendário — nova hierarquia / redução de altura

**Antes**: `PageHeader` → `Surface` (data grande + botões) → parágrafo
auxiliar → grid de 4 `StatCard` → `Tabs` → calendário.

**Depois**: `PageHeader` (inalterado) → uma `Surface` compacta (data +
4 `StatCard` + botões + texto auxiliar, lado a lado em `lg:` e acima disso)
→ `Tabs` → calendário. Em 1366×768 (bem acima do breakpoint `lg` de
1024px) a barra fica numa única linha; abaixo de `lg` continua empilhando
verticalmente (comportamento idêntico ao anterior nesses tamanhos, sem
regressão em notebooks pequenos/tablets).

## 6. Treinos — alterações nos cards

A caixa de "ganho previsto" (atributo atual + ganho, do Hotfix 1) não foi
tocada. Duração/Fadiga/Energia, que eram 3 caixas `glass` empilhadas
(ícone + rótulo + valor cada), viraram uma única linha
`Duração 50min · Fadiga +7 · Energia 90`, com as mesmas cores condicionais
(fadiga ≥12 vermelho, energia baixa vermelho) e os mesmos valores — nenhuma
fórmula tocada (`getPredictedGain`, `distributeTrainingGain`,
`previewTraining` continuam exportadas de `trainingSystemV2.js`
inalteradas).

## 7. Confirmação — atributo atual + ganho

`TrainingActivityCard.jsx` continua lendo `profile?.[attribute]` diretamente
do profile já carregado (nenhum estado duplicado, nenhum fetch por card) e
mostrando `{currentAttrVal}` e `+{gain.toFixed(2)}` lado a lado, exatamente
como o Hotfix 1 deixou. `test:redesign-polish2` trava isso.

## 8. Floating actions — solução adotada

Antes: até 5 controles flutuantes (BETA + Carreiras + Som no rail top-right,
"?" do guia e Assistente no bottom-right, mais o pill do tutorial quando
minimizado — 2 deles nas mesmas coordenadas no mobile).

Depois: 1 gatilho discreto (ícone "mais") no lugar do antigo rail, abrindo
um `BottomSheet` com Guia da carreira / Gerenciar carreiras / Som / BETA.
O Assistente da carreira continua como FAB separado (ação primária,
badge de prioridades). O pill do tutorial minimizado assumiu o "slot"
vertical que o fab do guia deixou vago, para nunca mais coincidir com o
Assistente.

## 9. Desktop 1366×768

Barra operacional do Calendário cabe numa única linha (breakpoint `lg` =
1024px, bem abaixo de 1366). Home ganha altura livre com a supressão das
strips redundantes. Nenhum componente foi redesenhado especificamente para
esta resolução — o ganho vem de remover blocos duplicados, não de layouts
condicionais por tamanho de tela.

## 10. Desktop 1920×1080

Nenhuma mudança estrutural nos breakpoints `xl`/`2xl` já existentes
(colunas 7/5 e 8/4 da Home, `xl:block` do bloco de contexto no
`AppLayout`). Como as mudanças são compactação/remoção de duplicidade
(não reflow), o comportamento em telas grandes é estritamente "menos altura
total", sem novo comportamento a validar.

## 11. Mobile

Toda a infraestrutura do M1/M1.1 (`dvh`, safe-area, `pl-auto-contain`,
touch targets, Android Back stack, overscroll, touch-action, `BottomNav`,
`BottomSheet`, `ModalShell`, offsets do toast) foi reaproveitada, não
recriada. O novo dock usa exatamente os mesmos tokens de posicionamento
(`--pl-header-h`, `--pl-safe-t`) que o M1.1 corrigiu, e herda Android
Back/Escape/foco/safe-area do `BottomSheet` sem nenhum código novo de
overlay. A correção do overlap pill-vs-Assistente é especificamente uma
melhoria mobile (o bug só existia abaixo de `md`).

## 12. Acessibilidade

- Gatilho do dock: `aria-label="Abrir ferramentas"`, `aria-haspopup="dialog"`,
  `aria-expanded`.
- Itens do dock são `<button>` reais (não `<div onClick>`), com texto
  visível (não dependem só de `aria-label`).
- "Por que usar" do card de tutorial: `aria-expanded` no toggle.
- Introdução de página: `aria-expanded`/`aria-label` do chevron preservados
  (só o valor padrão inicial mudou, não a mecânica).
- Nenhum `<button>` virou `<div>`; nenhum `window.confirm` nativo
  reintroduzido (`ConfirmDialog`/ModalShell seguem sendo o único padrão).

## 13. Performance

Nenhum polling/interval/observer novo. Nenhuma dependência nova
(`package.json` só ganhou entradas em `scripts`, não em `dependencies`).
Uma consulta de rede foi **removida** (a busca de torneios que só
alimentava o aviso duplicado do `CareerCalendar`) — redução líquida de uma
chamada por carregamento da Home, não aumento.

## 14. Delta aproximado dos bundles (build web, gzip)

| Chunk | Antes (M1.1) | Depois (Polish 2) | Delta |
|---|---|---|---|
| `CareerHub` | 68,97 kB | 68,03 kB | **-0,94 kB** |
| `CalendarPage` | 59,47 kB | 59,60 kB | +0,13 kB |
| `Training` | 42,05 kB | 42,08 kB | +0,03 kB |
| `index` (entrypoint, inclui `AppLayout`/dock/guide) | 1.228,67 kB | 1.229,46 kB | +0,79 kB |

Nenhum crescimento relevante; a Home até encolheu (menos JSX renderizado
condicionalmente).

## 15. Testes executados e resultados

Todos passaram — sem exceções nesta fase:

`lint`, `typecheck` (2526 linhas vs. baseline de 2527 — mesmas categorias
pré-existentes: props do design-system sem `className` explícito,
`localGame.entities.X` tipado como `{}`; nenhuma categoria nova), `build`
web, `test:redesign-polish2` (43/43, novo), `test:home-redesign` (37/37),
`test:core-gameplay-ui` (73/73), `test:calendar-advance` (4/4),
`test:training-v2` (exit 0 — script de relatório de balanceamento, não
alterado), `test:ui-redesign` (181/181), `test:ui-shell` (89/89),
`test:ui-performance` (16/16), `test:modal-safety` (34/34),
`test:mobile-foundation` (68/68), `test:mobile-m1-hotfix` (27/27),
`test:global-header-overlay` (19/19, 1 asserção atualizada — ver seção 2),
`test:global-header-calendar` (18/18), `test:global-overlays` (88/88),
`test:viewport-overlays-rc1` (9/9), `test:onboarding-v2`,
`test:secondary-ui-v2` (57/57).

`test:tutorial-chronology` continua falhando com o mesmo diff (8 !== 6)
documentado como baseline pré-existente desde a Fase 8 — nenhum arquivo de
missão/tutorial foi tocado nesta fase.

`app:build` (Windows/Tauri): ver relatório de encerramento (chat) — build
executado ao final desta fase.

## 16. Regressões encontradas

Nenhuma introduzida por esta fase. Uma regressão **pré-existente do M1**
(não desta fase) foi descoberta durante a varredura de testes:
`test:global-header-overlay-rc.mjs` continha uma asserção anterior ao M1
que proibia `pl-auto-contain` em `Page.jsx` — mas o M1 conectou isso de
propósito (era a causa raiz do baseline de `test:performance-responsive-v36`).
A asserção foi corrigida para validar a proteção real em vez da decisão já
autorizada (ver seção 2 e docs/MOBILE_M1_1_DEVICE_HOTFIX.md).

## 17. Dívidas técnicas restantes

- QA visual real (screenshots/browser automation) não foi possível neste
  ambiente — ver seção "QA visual" abaixo.
- `CareerMomentStrip`/`buildNextEvent`/`dailyCareerBriefing` continuam como
  três fontes independentes que happen to overlap em 2 de 6 tipos de
  momento — funcional e testado, mas uma consolidação mais profunda (uma
  única fonte de "o que está acontecendo agora") ficaria para uma fase
  futura de arquitetura, não de polish visual.
- O entrypoint principal (`index-*.js`) continua acima de 500kB (aviso do
  Rollup, pré-existente, não relacionado a esta fase) — code-splitting mais
  agressivo não estava no escopo autorizado.
- `PageIntroduction`'s novo esquema de override (`path`/`!path` no mesmo
  array `collapsedIntroductions`) é compatível com saves antigos, mas é uma
  convenção um pouco menos óbvia que dois arrays separados — trade-off
  deliberado para não mudar o formato salvo no perfil.

## 18. QA visual

**QA visual manual pendente.** Este ambiente não tem ferramenta de
browser/screenshot disponível — nenhuma validação visual real foi feita em
1366×768, 1920×1080 ou 390×844. Recomenda-se conferir manualmente, em
especial: a barra operacional do Calendário em `lg:` (1024–1366px), o
BottomSheet do dock de utilidades em mobile real, e o card de tutorial
compactado (toggle "Por que usar?") em pelo menos uma página com introdução
de página cadastrada.
