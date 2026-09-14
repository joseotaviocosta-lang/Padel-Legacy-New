# Fase 8.1 — Confirmar aposentadoria, corrigir acesso do jogador

> **COMPLETA.** Item 1: colapso das 3 duplas confirmadas como aposentadoria por
> idade — não é bug, nenhuma correção necessária. Item 2: qualifying/janela de
> prioridade estendidos ao caminho do jogador, reaproveitando a mesma constante e
> o mesmo campo persistido já validados pra IA (Fase 7.3/7.4), sem segunda
> implementação. Item 3: wildcard implementada e concedida de fato (sequência de
> 5 vitórias oficiais) — a primeira das portas de exceção do jogador que deixa de
> ser um interruptor morto. Testado especificamente o cenário do pedido (rank
> ruim, sem nenhuma outra exceção): antes, sem caminho nenhum; agora, resolvido
> numa única inscrição via qualifying ou janela.

## 1 — Colapso das 3 duplas: confirmado como aposentadoria, não bug

**Hipótese confirmada — encerrado, nenhuma correção feita.**

Rodado o regime-check (mesma seed/população/config de produção da Fase 8) com um
log temporário de aposentadoria de reais (removido depois de confirmar). As 3
duplas identificadas na Fase 8 §2.3/§5 como colapsando a 0% de pareamento têm,
cada uma, exatamente um membro aposentando na data que precede o colapso:

| Dupla | Membro aposentado | Data de aposentadoria | Pareamento antes → depois |
|---|---|---|---|
| Marc Quílez & Federico Mouriño | **Marc Quílez** | 2029-01-01 (fim da T3) | 91,7% (T3) → **0%** (T4) |
| Juanlu Esbrí & Alejandro Ruiz | **Juanlu Esbrí** | 2029-02-01 (T4) | 100% (T3) → **0%** (T4) |
| Clément Geens & Dylan Guichard | **Dylan Guichard** | 2030-01-01 (fim da T4) | 91,7% (T4) → **0%** (T5) |

As 3 datas precedem exatamente a temporada em que o pareamento cai a zero — não
uma coincidência aproximada, uma correspondência direta. Uma dupla não pode
continuar jogando junta depois que um dos dois se aposenta
(`WorldTourLifecycle.js` filtra `!athlete.retired` antes de montar pares); a
flag `ai_partnership_protected:true` protege a parceria de DISSOLUÇÃO POR
MERCADO (o motivo que a Fase 6.1/6.2 corrigiu), não de aposentadoria — as duas
coisas nunca competiam entre si, e não há inconsistência a corrigir.

**Por que "idêntico nos dois calendários" (achado da Fase 8) fazia sentido**:
aposentadoria por idade (Fase 2D) depende só da idade sintética do atleta
(distribuída em torno de 26-28 anos, Fase 2), nunca do volume de torneios
disputados — o mesmo seed produz as mesmas datas de aposentadoria
independentemente de quantos eventos o calendário tem. Confirmado, não só
plausível.

## 2 — Qualifying e janela de prioridade estendidos ao jogador

### 2.1 — Reaproveitamento, não duplicação

`PRIORITY_WINDOW_N` (a constante que zera a reincidência da IA, Fase 7.3/7.4)
foi movida pra `EntryManager.js` (de onde `WorldTourLifecycle.js` já importava
`resolveEntryRank`/`OPEN_TIER_CEILING` — mover pro sentido contrário evitaria
um ciclo de import) e agora é importada pelos DOIS caminhos de entrada. Uma
constante só; os dois lados sempre concordam no tamanho da janela.

`Partnership.priority_window_remaining` (campo persistido desde a Fase 7.4,
usado até agora só por parcerias de IA) passa a ser lido e escrito também pra
parcerias do jogador (`partnership_type:'player'`) — mesmo schema, mesmo
campo, sem um segundo mecanismo paralelo.

### 2.2 — O que mudou

- **`EntryManager.js`**: novo `ENTRY_PATHS.PRIORITY_WINDOW`; `evaluateTournamentEntry`
  checa `priorityWindowRemaining > 0` ANTES de qualquer outro critério (mesma
  prioridade que a IA dá ao mesmo campo) — entra garantido, fora de qualquer
  corte de rank. `buildAthleteEntryContext` lê `profile.priority_window_remaining`
  (mesma convenção de todo outro campo de exceção que já lia de `profile`).
- **`circuitCatalog.js`**: `qualifyingSize:16` adicionado a Gold, Platinum,
  Masters e Elite (antes só Crown tinha) — mesmo valor de Crown, 3 rodadas de
  qualifying (`getTournamentQualifyingRoundCount`). Bronze/Silver (`minRanking:0`)
  e as duas Finals (convite por top do ranking) não precisam — nenhuma delas é
  onde um rank ruim trava o jogador.
- **`tournamentRegistration.js`**: `registerTournament` busca a parceria ativa
  do jogador (`getActivePartnership`, já existente) e passa
  `priority_window_remaining` pra `evaluateTournamentRegistration`; ao usar
  esse caminho pra entrar, desconta 1 (mesmo desenho da IA: desconta a cada
  aparição efetiva, não só ao vencer de novo).
- **`TournamentModal.jsx`**: ao vencer a ÚLTIMA rodada de qualifying (a próxima
  rodada da campanha já é `stage:'main'`), concede `priority_window_remaining =
  PRIORITY_WINDOW_N` na mesma operação de `Partnership.update` que já existia
  pra atualizar química/confiança/moral pós-partida — nenhuma escrita nova.

### 2.3 — Achado no caminho: `current_win_streak` nunca era persistido

Ao instrumentar o gatilho da wildcard (item 3, que depende deste campo),
descoberto que `TournamentModal.jsx` calculava `current_win_streak` em memória
(`updatedDraft`) mas nunca o incluía no `playerPatch` realmente gravado —
gravação silenciosa no vazio, contador sempre lido como 0 por qualquer
consumidor (inclusive `achievementEngine.js:110`, que já lia esse campo pra um
achievement de sequência de vitórias, também silenciosamente quebrado).
Corrigido junto — sem isso, a concessão de wildcard por sequência (item 3)
nunca teria disparado de verdade.

## 3 — Wildcard: primeira porta de exceção concedida de fato

**Proposta**: sequência de **5 vitórias oficiais seguidas** — a mais natural
pro jogador humano por ser inteiramente sobre desempenho recente, sem exigir
nenhuma simulação que a IA não precisa (junior/national invite dependem de
idade/reputação nacional, sistemas que não existem hoje; protected ranking
exigiria uma trilha de decaimento própria). Concedida em `TournamentModal.jsx`,
no momento em que a sequência CRUZA o limiar (não a cada vitória depois disso,
e não se já houver uma wildcard parada — sem acumular). Consumida em
`registerTournament` quando de fato usada pra entrar (`wildcard_tokens -= 1`),
nunca no caminho `tournament.player_wildcard` (que não é um recurso do
jogador).

Antes desta fase, `wildcard_tokens`/`protected_ranking`/`special_exempt_until`/
`junior_reputation`/`national_reputation` eram todos verificados em
`EntryManager.js` mas nunca concedidos por nenhum sistema (achado da Fase 8
§3, confirmado por grep). Só `wildcard_tokens` foi implementado nesta fase —
as outras 3 continuam mortas, registradas para decisão futura se algum dia
fizerem falta (não fazem, com qualifying+janela cobrindo o caso geral e
wildcard cobrindo o caso de forma recente).

## 4 — Teste específico do cenário do jogador

`WorldTourEntryFlowTest.js` estendido (rodado via SSR do Vite, mesma via do
harness — não há execução automatizada prévia deste arquivo em nenhum script
de CI; permanece disponível também via `window.PadelWorldTourEntryFlowTest`
pra checagem manual em devtools):

| Cenário | Antes da Fase 8.1 | Depois |
|---|---|---|
| Rank 5000 (muito abaixo de qualquer corte), sem nenhuma exceção | `INELIGIBLE` — sem caminho nenhum | `INELIGIBLE` — **continua correto** (não deveria haver entrada garantida sem mérito nem janela ativa) |
| MESMO rank 5000, com `priority_window_remaining` ativo | não existia | `PRIORITY_WINDOW`, elegível — **resolve numa única inscrição** |
| Gold (catálogo real, não mock), rank 500 (acima do corte direto 450) | `INELIGIBLE` (`qualifyingSize` não configurado) | `QUALIFYING`, elegível |

Os 4 cenários pré-existentes (`direct`/`qualifying`/`blocked`/`wildcard`, usando
o mock `elite` original) continuam passando sem alteração — a extensão não
mudou nenhum comportamento anterior, só adicionou os que faltavam. 9/9 checks
passam.

**Sobre "tempo razoável"**: uma vitória de qualifying garante 4 inscrições
seguidas (mesma janela da IA) — o jogador não precisa vencer de novo pra
manter o acesso por um ciclo inteiro de torneios, exatamente o desenho que a
Fase 7.3 mediu como suficiente pra reduzir reincidência de 90-100% pra 0% na
IA. Não medido em regime pro jogador nesta fase (exigiria simular uma
carreira jogável inteira, fora do escopo do harness de fundo) — a validação
aqui é estrutural (o caminho existe e usa a mesma lógica já provada), não uma
nova medição de regime.

## 5 — O que fica pendente (fora do escopo desta fase)

- **"Sem parceiro" continua sem solução** — `PARTNER_UNAVAILABLE` é um gate
  totalmente separado de elegibilidade esportiva (mercado de parcerias, não
  entrada em torneio); o pedido descreve os dois sintomas juntos
  ("rank baixo/sem parceiro"), mas só o de rank foi corrigido aqui. Se um
  jogador ficar sem parceiro, o problema é de outro sistema.
- **Protected ranking / special exempt / junior / national invite** seguem
  mortos (nunca concedidos) — registrado, não implementado (item 3 pedia
  "pelo menos uma").
- **Dominância de tier (P2/Gold/Platinum) e a decisão de topo-120** — item 3
  original da Fase 8, explicitamente adiado pra depois desta ("investigação
  própria antes de decidir"). Não tocado nesta fase.

## 6 — Validação

- `npm run lint` — limpo.
- `npm run build` — sucesso.
- `node scripts/rc-qa-suite-v36.mjs` — 33/36, score 92/100, as mesmas 3 falhas
  pré-existentes (`test:rc-gameplay-balance`, `test:career-pace`,
  `test:ui-quality`), sem regressão.
- `WorldTourEntryFlowTest.js` estendido — 9/9 checks, rodado via SSR do Vite.
- Diagnóstico temporário do item 1 (`DIAG_RETIREMENT`,
  `scripts/audit-real-athletes-simulation.mjs`) revertido — `git diff` do
  arquivo fica vazio contra o commit da Fase 8, confirmando reversão completa.
- `reports/BETA-AUDIT-v36.1.{json,md}`, `reports/rc-qa-latest.{json,md}`,
  `reports/rc-sprint-1/*.json` (auto-regenerados) revertidos com
  `git checkout HEAD --` antes do commit.
- `src-tauri/` — sem alterações.
- Scratch descartado: `resume-state.json`/`run.log` da rodada de confirmação
  de aposentadoria; `summary.json`/`tournament-results.csv`/
  `season-tier-table.md` mantidos em
  `reports/real-athletes-audit/f81-retirement-check/`.

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Confirmação da hipótese de aposentadoria | ✅ confirmado com correspondência exata de datas nas 3 duplas — não é bug, nenhuma correção |
| 2 | Qualifying/janela estendidos ao jogador, reaproveitando o mecanismo de IA | ✅ feito — `PRIORITY_WINDOW_N` e `Partnership.priority_window_remaining` compartilhados, sem segunda implementação; qualifying habilitado em Gold/Platinum/Masters/Elite |
| 3 | Pelo menos uma porta de exceção implementada e testada | ✅ wildcard (5 vitórias seguidas), concedida e consumida de fato; achado no caminho (`current_win_streak` nunca persistido) corrigido junto |
| 4 | Suíte, lint, build, commit | ✅ 33/36 (92/100), mesmas 3 falhas pré-existentes; lint/build OK |
