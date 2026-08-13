# Redesign Checkpoint — Polish 2.1 + Windows App Icon Hotfix

Hotfix cirúrgico pós-QA visual real da versão Windows instalada (Polish 2 +
M1/M1.1/M2 já commitados como `v70`, exceto M2 que seguiu sem commit
separado). Corrige apenas os 4 problemas confirmados pelo QA — não é
Polish 3, não é Fase 9.

## Aprovado (não tocado)

Treinos, `TrainingActivityCard` (atributo atual + ganho, linha compacta
Duração/Fadiga/Energia), Tutorial (introdução recolhida, "Por que usar?",
minimizar), redimensionamento de janela, branding/logo dentro do jogo,
`trainingSystemV2.js` (fórmulas), rotas, engine.

---

## HOME — redundância do torneio

### 1. Causa exata da repetição

`src/lib/dailyCareerBriefing.js` gera um item `{ id: 'tournament', title:
'Los Angeles Cup em 2 dia(s)', route: '/tournaments' }` sempre que há um
torneio em até 7 dias. Esse item alimenta `PriorityActionsPanel` ("O que
fazer agora") como uma badge compacta — ao mesmo tempo que `NextEventCard`
(sempre renderizado, card completo com ícone/eyebrow/CTA) já mostra
exatamente a mesma informação, mais completa. O Polish 2 já tinha suprimido
duas outras fontes do mesmo dado (`CareerMomentStrip` tipo `tournament` e o
aviso interno do `CareerCalendar`) — essa terceira, no briefing diário,
tinha escapado da auditoria anterior.

### 2. Renderizações redundantes removidas

Em `buildPriorityActions` (`src/pages/CareerHub.jsx`): o item `id ===
'tournament'` do briefing diário agora é descartado antes de entrar na
lista de `priorityActions` — o mesmo padrão já usado para `injury`. Nenhuma
outra renderização foi tocada.

### 3. Regra final — informativo vs. acionável

Aplicada meramente como critério de decisão (não uma função nova):
**informação sem ação própria não ganha uma segunda apresentação quando já
existe uma fonte mais completa e sempre visível** (`NextEventCard`). Uma
decisão de torneio genuinamente acionável (`careerDecisionCenter.js`, id
`tournament-{id}`, `actionLabel: 'Preparar torneio'`, só aparece quando
faltam ≤1 dia, prioridade alta) continua podendo surgir — tem contexto
próprio (revisar tática/condição/dupla antes do jogo) que `NextEventCard`
não cobre.

### 4. Antes/depois

**Antes** (torneio em 2 dias): `NextEventCard` ("Em 2 dias · Los Angeles
Cup · Inscrição aberta") **+** badge "Los Angeles Cup em 2 dia(s)" dentro de
"O que fazer agora".

**Depois**: só `NextEventCard`. "O que fazer agora" mostra as próximas
prioridades reais (decisões pendentes, mensagens, etc.), sem repetir o
torneio.

---

## CALENDÁRIO — legibilidade

### 5. Estrutura final da faixa operacional

`Surface` com 3 colunas no desktop (`lg:grid-cols-[auto_1fr_auto]`): **Data**
| **Status do dia** | **Ações**. "Status do dia" é uma grade 2×2 (Energia,
Fadiga, Agenda, Próximo torneio) de linhas `label + valor + detalhe` — não
mais 4 `StatCard` disputando espaço com data e botões na mesma linha
(causa raiz do truncamento "Dispo...", "Los A..." reportado). `StatCard` foi
removido da faixa operacional (o próprio componente não é mais importado
nesse contexto).

### 6. Confirmação — Energia/Fadiga/Agenda/Torneio totalmente legíveis

Nenhum truncamento no novo `DayStatusRow` (nem no rótulo, nem no valor, nem
no detalhe). "Próximo torneio" mostra o resumo curto ("2 dias"/"Hoje") como
valor principal e o **nome completo do torneio, sem truncate, quebrando
linha se precisar** como detalhe — nunca mais "Los A...".

### 7. Comportamento desktop

`lg:` (1024px+): 3 colunas lado a lado, uma única `Surface`, calendário
ainda aparece logo em seguida (ganho de altura do Polish 2 preservado).

### 8. Comportamento mobile

Abaixo de `lg:`, o `grid` (sem `lg:grid-cols-[...]`) empilha naturalmente:
Data → Status do dia → Ações → Tabs → calendário. Nenhuma informação
truncada, nenhuma tentativa de caber tudo numa linha só.

Lógica de avanço (`handleAdvanceDay`/`handleAdvancePeriod`,
`advanceCareerDayOnce`/`advanceCareerDays`), safe-area, `dvh`, touch
targets, Android Back — nenhum tocado.

---

## FLOATING ACTIONS

### 9. Como os botões individuais foram restaurados

`src/components/system/FloatingUtilityRail.jsx` deixou de renderizar um
gatilho único + `BottomSheet` "Ferramentas" (Polish 2) e voltou a renderizar
4 botões individuais empilhados (Guia → BETA → Carreiras → Som), cada um
com sua própria ação de 1 clique. O ranking/moedas/energia/fadiga que o M2
tinha colocado dentro do dock (via `CareerHud`) saiu junto — não tinha
outro lugar coordenado para ir sem inventar uma solução nova fora do
escopo deste hotfix (documentado como pendência, seção "Dívidas").

### 10. Como colisões foram evitadas

Não foi um retorno ao código pré-M1.1: o `<aside>` continua com o offset
derivado de `--pl-header-h`/`--pl-safe-t` + a folga de `1.5rem` que o
hotfix do sino do M2 estabeleceu, e `pointer-events-none` no container +
`pointer-events-auto` em cada botão — agora protegendo 4 botões com `gap-2`
entre eles (o cenário em que essa defesa realmente importa, diferente do
dock de 1 botão só).

### 11. Comportamento do Assistente

Inalterado — `CareerAssistant.jsx` continua um componente 100% separado
(FAB verde, badge de prioridades, drawer próprio), nunca fez parte do
`FloatingUtilityRail`.

### 12. Confirmação da remoção do dock rejeitado

`FloatingUtilityRail.jsx` não importa mais `BottomSheet` nem `CareerHud`;
`aria-haspopup="dialog"` e o componente local `DockRow` foram removidos.
Nenhum código morto: o `BottomSheet` do Design System continua existindo e
é usado normalmente em outros lugares (`BottomNav`'s "Mais", por exemplo) —
só a implementação específica de "Ferramentas" foi removida.

---

## FREEZES

### 13. Treinos

`TrainingActivityCard.jsx` não foi tocado nesta fase. `getPredictedGain`,
`distributeTrainingGain`, `previewTraining` continuam exportadas de
`trainingSystemV2.js` sem alteração.

### 14. Tutorial

`OnboardingGuide.jsx` não foi tocado nesta fase.

### 15. Fundação responsiva

`Page.jsx`, `useOverlayBehavior.js`, `overlayBackStack.js`, tokens de
safe-area/`dvh` em `index.css`, `AppLayout.jsx` (só a chamada a
`FloatingUtilityRail` mudou, removendo os props `profile`/`ranking` que não
existem mais no componente) — nenhuma alteração de fundação.

---

## WINDOWS ICON

### 16. Causa raiz encontrada

**Não era o master, nem o `icon.ico`, nem `tauri.conf.json`.** Extraí e
inspecionei visualmente cada frame do `icon.ico` atual (nenhuma alteração
desde o Hotfix 1) — todos corretos, símbolo "P." nítido e completo em todos
os tamanhos. Em seguida extraí o ícone **realmente embutido no
`padel-legacy.exe`** compilado (não o arquivo `.ico` em disco, o recurso
Win32 dentro do binário) e o resultado era **visivelmente diferente**: só o
fundo verde, sem o símbolo "P." (um resquício ilegível). O `.exe` **não
usava o `icon.ico` atual** — usava um recurso de ícone de uma build muito
mais antiga, preso em cache de compilação do Cargo
(`src-tauri/target/release/build/padel-legacy-*`), nunca invalidado apesar
de múltiplos `npm run app:build` bem-sucedidos ao longo do Hotfix 1 →
Polish 2 → M1 → M1.1 → M2. "`icon.ico` está correto" e "`app:build` passou"
nunca provaram, sozinhos, que o `.exe` usa esse ícone — e não usavam.

### 17. Asset master utilizado

`src/assets/brand/logo-mark.svg` (o mesmo master do Hotfix 1) — nenhuma
alteração. Já era adequado.

### 18. app-icon.svg separado?

**Não foi criado.** Como a causa raiz era 100% de cache de build (não do
design/composição do símbolo), criar um master dedicado teria sido uma
mudança sem necessidade técnica real — exatamente o que o enunciado pede
para evitar. `logo-mark.svg` continua sendo o único master, para dentro do
jogo e para o ícone do app.

### 19. Safe-area aplicada

Nenhuma alteração de geometria do símbolo — não fazia parte do problema
real (ver seção 16).

### 20. Tamanhos gerados

`icon.ico`: 16, 24, 32, 48, 64, 256px (6 frames). 128px não está presente
(o gerador do Tauri não incluiu por padrão) — documentado como item menor,
não relacionado ao bug real, não corrigido nesta fase por não ser
cirúrgico ao problema confirmado.

### 21. Frames encontrados no icon.ico

6 frames PNG, todos com dimensões de `IHDR` batendo com o diretório do
`.ico`, nenhum vazio/cor sólida (verificação estrutural automatizada em
`scripts/test-app-icon-pipeline.mjs`, 34 checks).

### 22. Resultado da validação dos frames

Todos válidos. Extraídos e visualizados manualmente nesta sessão — símbolo
"P." nítido, centralizado, sem corte, em 32×32, 48×48 e 256×256.

### 23. Configuração relevante do tauri.conf.json

```json
"bundle": { "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.ico"] }
```

Sem alteração — já apontava para os arquivos corretos. Confirmado que
`icons/icon.ico` está na lista (é a fonte do ícone do `.exe`/atalho no
Windows).

### 24. Resultado da inspeção do padel-legacy.exe

**Antes da correção**: ícone embutido não correspondia a nenhum arquivo em
disco (nem `icon.ico`, nem os PNGs individuais) — só o fundo verde visível,
símbolo ausente/ilegível. **Depois**: os 6 frames do `icon.ico` aparecem
**byte a byte, verbatim**, dentro do `.exe` recompilado (confirmado via
busca binária, não só visual) — ver `scripts/verify-exe-icon.mjs`.

### 25. Comportamento/configuração do NSIS

Não precisou de alteração — o NSIS/instalador usa o ícone do `.exe` que ele
empacota; corrigido o `.exe`, o instalador (e o atalho que ele cria) herdam
a correção automaticamente. Não há configuração de ícone separada e
incorreta no NSIS deste projeto.

### 26. Destino real do atalho

Não auditado via instalação real nesta sessão (sem ambiente para instalar
de fato) — o atalho do NSIS aponta para o `.exe` empacotado por padrão
(comportamento padrão do `tauri-plugin-nsis`, sem override neste projeto).
Recomenda-se confirmar após reinstalar (seção 28).

### 27. Cache do Windows envolvido?

**Causa raiz não foi cache do Windows** — foi cache do Cargo (Rust), um
passo *antes* de qualquer coisa chegar ao Explorer. Depois de corrigido o
`.exe`, é possível que o **Explorer** ainda mostre o ícone antigo em cache
para instalações já existentes — para isso, o procedimento seguro é
desinstalar a versão antiga antes de instalar a nova (seção 28), não
limpar cache do Windows manualmente.

### 28. Procedimento para instalação limpa

1. Desinstalar qualquer "Padel Legacy" já instalado (Painel de
   Controle/Configurações → Apps).
2. Instalar `Padel Legacy_0.9.0_x64-setup.exe` (ou o `.msi`) gerado por
   esta sessão.
3. Se o ícone do atalho recém-criado ainda parecer o antigo, reiniciar o
   Explorer (`taskkill /f /im explorer.exe` seguido de `start explorer.exe`)
   antes de suspeitar de qualquer outra causa.

### 29. Saves protegidos?

Sim — desinstalar o aplicativo Windows não apaga os saves (persistidos via
`tauri-plugin-fs`/`BaseDirectory.AppData`, fora do diretório de instalação
do programa). Nenhum comando de limpeza de dados foi executado nesta
sessão.

### 30. O ícone efetivamente usado pelo Windows foi validado?

**Parcialmente.** Validado com certeza técnica: o `.exe` agora embute
byte-a-byte o `icon.ico` correto (verificação binária, não visual/subjetiva).
**Não validado nesta sessão**: a renderização final no Explorer/Área de
Trabalho/Menu Iniciar de uma instalação real (depende de QA manual do
usuário, sem ambiente para instalar aqui). Ver checklist na seção de
encerramento.

---

## QUALIDADE

### 31-33. Performance / bundle / testes

Nenhum polling/fetch novo. Delta de bundle (gzip, build web): CalendarPage
+0,62kB (nova estrutura de 3 colunas), CareerHub +0,03kB (1 linha de
supressão), entrypoint (`index-*.js`, inclui `FloatingUtilityRail`)
**-0,28kB** (menos código que o dock removido). Testes: ver relatório de
encerramento (chat).

### 34-37. Lint / typecheck / build

`lint` limpo. `typecheck`: 2527 linhas (M2: 2528) — uma a menos, mesmas
categorias pré-existentes, nenhuma nova. `build` web ✅.

### 38. app:build

✅ — build final (JS desta fase + ícone corrigido juntos), 3m28s, só o
warning pré-existente de `linker_messages`. `node scripts/verify-exe-icon.mjs`
confirma os 6 frames do `icon.ico` byte a byte dentro do `.exe` final.

### 39. Instaladores produzidos

`Padel Legacy_0.9.0_x64_en-US.msi`, `Padel Legacy_0.9.0_x64-setup.exe`.

### 40. Regressões encontradas

Nenhuma.

### 41. Arquivos modificados

Ver relatório de encerramento (chat) e `git diff --stat`.

### 42. Dívidas técnicas restantes

- Ranking/Moedas/Energia/Fadiga (M2, seção "informações que somem no
  mobile") não têm mais um segundo nível de acesso no mobile depois da
  remoção do dock — ficam para uma fase futura decidir onde reaparecem
  (não fazia parte dos 4 problemas confirmados desta vez).
- `icon.ico` sem frame nativo de 128px (usa interpolação do Windows nesse
  tamanho específico).
- Validação final do ícone no Explorer/Desktop real depende de QA manual
  (seção 30).
- `test:premium-home-v33` continua obsoleto (já documentado no M2).
