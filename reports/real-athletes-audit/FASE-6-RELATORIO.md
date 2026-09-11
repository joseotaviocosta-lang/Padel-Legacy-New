# Fase 6 — A base, agora que dá para medir

> Pré-requisito: Fase 5 fechada (commit `fdccbbb`). Gargalo mais claro
> remanescente: a base (Bronze/Silver) em razão de regime 12,6× com
> 50,7% das duplas que tentam nunca entrando numa chave. Toda medição
> anterior dessa razão tinha um mecanismo quebrado no meio
> (preenchimento forçado, vazamento de elite, chaves canceladas, brecha
> do `athlete_a`) — nenhum existe mais depois da Fase 5.5/5.6.

## 1 — Regime-check de 5 temporadas: **interseção subiu — cláusula de parada acionada**

> O processo da sessão anterior morreu junto com a sessão (log parado
> na linha do elenco, sem `node.exe` vivo) — relançado do zero nesta
> sessão, mesmo comando, mesma seed (`official-900-100-s1`, 900
> procedurais + 100 reais). Rodou as 5 temporadas completas.

### 1.1 — Heap e população: sem risco de OOM, banda mais alta e mais ruidosa que a Fase 4.2

| Temporada | Heap pico (Fase 6, Candidato B) | Heap pico (Fase 4.2, pré-Fase-5) |
|---|---|---|
| 1 | 749,6MB | 673,3MB |
| 2 | 944,2MB | 766,1MB |
| 3 | 887,8MB | 831,9MB |
| 4 | 918,3MB | 830,2MB |
| 5 | 942,1MB | 831,5MB |

Sem crescimento sem limite (temporada 5 não é maior que a 2) — **OOM
continua refutado**. Mas a Fase 4.2 tinha um platô limpo a partir da
temporada 3 (~830MB, desvio de ~2MB entre temporadas 3-5); aqui a banda
é mais alta (880-945MB) e mais ruidosa (oscila ±55MB sem convergir). Não
é um risco por si só, mas é consistente com mais estado por atleta
acumulando (mais fases de código desde a Fase 4.2) — não investigado
mais fundo aqui, fora do escopo do item 1.

### 1.2 — Rotatividade dos reais ausentes: a interseção SUBIU

| Métrica | Fase 4.2 (pré-Fase-5, 27 eventos/temporada) | Fase 6 (Candidato B, 23 eventos/temporada) |
|---|---|---|
| Reais que não jogaram, por temporada | 12, 16, 20, 17, **19** (oscila) | 13, 21, 29, 32, **42** (sobe monotonicamente) |
| União (reais ausentes em alguma temporada) | 57/100 | 64/100 |
| **Interseção (ausentes em TODAS as 5)** | **0 reais (0% da união)** | **2 reais (3,1% da união)** |
| Cumulativo "nunca apareceram em nenhuma chave" | 0/100 | 2/100 (nomes abaixo) |

Os 2 reais que nunca jogaram uma única chave em nenhuma das 5
temporadas: **Álvaro Montiel Caruso** e **Maximiliano Sánchez** — ambos
já aparecem na lista de ausentes da temporada 1 e nunca saem dela em
nenhuma das 4 seguintes.

**Isso é exatamente o que o pedido definiu como regressão**: "se os
mesmos reais ficam de fora ano após ano, voltou a exclusão permanente
— e isso é regressão do que a Fase 4.2 tinha zerado." A interseção não
ficou em 0 — subiu para 2. **Cláusula de parada acionada: item 2
suspenso** (seção abaixo).

*Nota de precisão*: o harness também expõe um campo cumulativo
diferente, `realAthletesNeverPlayedSoFar`, que estabiliza em **5**
atletas a partir da temporada 3 (não 2) — 3 atletas a mais que a
interseção final. A diferença provavelmente vem de critérios distintos
("nunca jogou uma partida" vs. "nunca apareceu num sorteio de chave");
não investigada a fundo aqui porque não muda a conclusão (subiu de 0
em qualquer uma das duas leituras) — registrada para quem for medir
isso de novo não estranhar o número batendo diferente conforme o
campo.

### 1.3 — Deriva de títulos: declínio do Top 20 mais acentuado, sem platô

| Temporada | Top 20 reais — Fase 6 (Candidato B) | Top 20 reais — Fase 4.2 (pré-Fase-5) |
|---|---|---|
| 1 | 20/20 | 20/20 |
| 2 | 16/20 | 20/20 |
| 3 | 12/20 | 19/20 |
| 4 | 11/20 | 16/20 |
| 5 | **10/20** | **15/20** |

A Fase 4.2 media um declínio gradual (100%→100%→95%→80%→75%) e o
atribuía com razoável confiança a envelhecimento/aposentadoria — as
mesmas 3 duplas de elite (Coello&Tapia, Galán&Chingotto,
Lebrón&Augsburger) mantendo 100% de pareamento o tempo todo, "o topo
persiste, o meio da tabela rotaciona". Aqui o declínio é **mais
acentuado (100%→50%) e ainda caindo na temporada 5, sem sinal de
platô** — a curva não desacelera como a da Fase 4.2 desacelerava perto
de 75-80%.

### 1.4 — Hipótese: dissolução de parceria real sem reformação (não confirmada como causa única)

A tabela de pareamento histórico (`season-tier-table.md`) explica o
padrão acima com bastante força circunstancial. Das 27 duplas reais
históricas rastreadas, **só as mesmas 3 de elite mantêm 100% de
pareamento nas 5 temporadas**; todas as outras 24 despencam para 0% em
algum ponto — e **nenhuma delas volta a subir depois de chegar a 0%**
(amostra: Jairo Bautista & Maximiliano Arce Simo 100%→25%→0%→0%→0%;
Clément Geens & Dylan Guichard 100%→100%→100%→91,7%→**0%**; Antonio
Fernández & Francisco Manuel Gil 100%→100%→100%→58,3%→**0%**). Isso é
uma dupla ORIGINAL se desfazendo (dissolução normal — chemistry/forma/
contrato, mesma regra pra bots, `aiPartnershipLifecycle.js:284-290`),
não necessariamente o atleta ficando sem jogar pra sempre — MAS o fato
de nenhuma reformar sugere que o mercado de reposição
(`formNewPartnerships`, mesmo arquivo) não está re-emparceirando esses
reais depois da dissolução, e o crescimento MONOTÔNICO da contagem de
ausentes por temporada (13→21→29→32→42, nunca cai) é consistente com
um backlog de reais "livres" que se acumula em vez de escoar.

`formNewPartnerships` inclui reais no pool `free` sem distinção
(`availableAthletes`, linha 133-141, não filtra por `is_real`) e usa
peso de compatibilidade + proximidade de ranking
(`rankGapWeight`, Fase 2H) para escolher o segundo membro de cada novo
par — **não identifiquei, dentro do orçamento deste item, se/por que
esse mecanismo despriorizaria reais especificamente**; a hipótese mais
provável é que a combinação "ranking real mais volátil pós-Candidato B
+ peso por proximidade de ranking" deixa reais cuja posição caiu numa
faixa mal povoada do ranking com poucos candidatos de peso alto — mas
isso é uma hipótese, não uma causa confirmada por instrumentação. Não
investigado mais fundo aqui porque o pedido pede para PARAR e reportar
neste ponto, não para corrigir.

**De passagem**: a dominância real na base (Bronze+Silver), agregada
nas 5 temporadas completas, é **12,5%** (25 títulos 100%-reais em 200
torneios de base) — mais alta que os 8,8% medidos na Fase 5.6 (regime
de 2 temporadas). Consistente com a mesma história: reais cujo ranking
cai (por dissolução + não-reformação, não só por idade) vão parar na
base com mais frequência à medida que os anos passam — um horizonte de
5 temporadas capta mais disso que um de 2.

### 1.5 — Chaves canceladas por campo insuficiente

Baixo e estável nas 5 temporadas: Gold 1/8 (T1), Platinum 1/6 (T1),
Silver 1/16 (T3, T4, T5) — nunca mais de 1 chave incompleta por tier
por temporada, todas em tiers de acesso livre ou próximos. Não é o
sintoma dominante aqui; a base (Bronze) não teve NENHUMA chave
incompleta nas 5 temporadas — o problema da base continua sendo
EXCLUSÃO de duplas, não CANCELAMENTO de torneio (achado #32,
reconfirmado).

### 1.6 — Decisão: item 2 suspenso

Por instrução explícita do pedido ("se a interseção subiu, pare e
reporte antes do item 2 — corrigir isso vem antes de dimensionar
calendário"), **a curva de expansão da base (item 2) não foi medida
nesta entrega.** O mecanismo mais provável (mercado de reposição de
parceria não reabsorvendo reais dissolvidos) é uma superfície nova,
não coberta por nenhuma fase anterior — teria escopo de fase própria
(diagnóstico + instrumentação de `aiPartnershipLifecycle.js`, no
padrão das Fases 4/5). Aguardando decisão sobre como prosseguir.

## 2 — Curva de expansão da base

**Suspenso — ver item 1.6.** Medir capacidade de calendário antes de
entender por que duplas reais inteiras somem do circuito sem
reaparecer mediria uma base cujo lado da demanda ainda está se
movendo por um motivo não relacionado a calendário nenhum.

## 3 — Item 3 da Fase 5.6: o padrão "cálculo certo, consumidor que não usa"

O achado #38(item 3) desta auditoria registrou três ocorrências novas do
padrão (além das três já conhecidas: #16 `resolveEntryRank`, #33
`calculatePartnershipInterest`, #37 `pairEntryRank`). Esta fase pediu
para corrigir a (b), e reportar — sem corrigir — a (c) e a (a). A
investigação abaixo muda a conclusão da (b) e precisa a (c).

### 3.1 — (b) `TeamRanking` de IA: consumidor confirmado, **NÃO removido**

O achado #38 dizia: "`circuitLifecycle.js:updateTeamRankings` mantém um
`TeamRanking` de IA que `WorldTourLifecycle` não lê" — isso é
literalmente verdade (`WorldTourLifecycle.js` deriva o rank da dupla
ad-hoc via `pairEntryRank`, nunca lê a coleção `TeamRanking`). Mas o
pedido desta fase generalizou para "um dado que ninguém consome" — essa
generalização é **falsa**, e o grep pedido no item 1 do pedido
("confirme que nenhum consumidor lê esse dado — inclusive UI") a
refuta antes de qualquer remoção.

**Consumidores confirmados, dois deles UI, lendo exatamente as linhas
que `updateTeamRankings` grava para a população inteira de duplas de
IA (não só a do jogador):**

| Consumidor | Tipo | O que lê/faz |
|---|---|---|
| [`src/pages/Ranking.jsx:67`](../../src/pages/Ranking.jsx) | **UI, rota `/ranking`** | Aba "Duplas" — `TeamRanking.list('-ranking_points', 600)`, renderizada direto como lista (linhas 243-253). Rota ativa, linkada por `RankingCards.jsx` (Home) e `WorldHub.jsx`. |
| [`src/game-core/globalMarketLifecycle.js:99`](../../src/game-core/globalMarketLifecycle.js) | **UI, rota `/world-market`** | `getGlobalMarketSnapshot` — mesmo `TeamRanking.list('-ranking_points', 600)`, normalizado e ordenado em `teams` com `ranking_position` calculada. Consumido por `src/pages/WorldMarket.jsx`. |
| `src/game-core/tournamentLifecycle.js` (`prepareTournamentFinalization`) | Gameplay | Lê/grava a linha da dupla do JOGADOR (`team_key` do par jogador+parceiro) ao finalizar um torneio — precisa que a coleção exista e siga o mesmo padrão de recálculo rolling que as duplas de IA já seguem. |
| `src/components/tournaments/TournamentModal.jsx:627` | Gameplay | Mesmo padrão, no fim de cada partida (não só no fim do torneio) — upsert incremental da dupla do jogador. |
| `src/game-core/seasonLifecycle.js` | Gameplay | `getSeasonSnapshot` lista até 500 linhas (para o resumo de temporada); `finalizeSeason` recalcula a linha da dupla do jogador. |
| `src/lib/partnershipSystem.js` / `src/game-core/aiPartnershipLifecycle.js` | Gameplay | Removem a linha de `TeamRanking` quando a dupla (jogador ou IA) se desfaz — comportamento deliberado (achado #21), não faxina. |
| `src/lib/teamRanking.js` (`getTeamRank`, `getTeamRankings`) | Helper | Usado por telas de parceria/torneio para mostrar o rank da dupla do jogador dentro de até 600 duplas. |

**Conclusão: não removido.** A escrita semanal sobre a população de IA
alimenta duas telas reais (Ranking "Duplas" e Mercado Global) — remover
`updateTeamRankings` deixaria as duas com dados congelados/vazios para
qualquer dupla de IA, silenciosamente, sem erro. Não há efeito de custo
para medir porque não há remoção.

*Achado incidental, fora do escopo desta fase:* `src/game-core/ranking.js`
exporta `updateLocalTeamRanking`, que **não tem nenhum chamador** no
repositório (grep confirmado) e além disso deriva `team_key` a partir
de nomes normalizados (`sport_name`/`partnerName` em minúsculas), não
dos ids canônicos que `teamKey(id1, id2)` usa em todo o resto do
código — uma segunda linha para a mesma dupla se algum dia for chamada.
Esse sim é candidato a remoção limpa, mas é um achado separado da (b)
pedida; registrado, não corrigido.

### 3.2 — (c) "Força da dupla = média" — o achado precisa de correção

O achado #38 apontava três sites de "força da dupla = média do
overall": `pairScore`, `lib/bots.js:strength`, `teamRanking.js`. A
inspeção linha a linha desta fase mostra que **isso mistura dois
conceitos diferentes** — a lista precisa de correção antes de qualquer
proposta de unificação fazer sentido:

- **`teamRanking.js` não calcula média de `overall_rating`.** Os locais
  que fazem médias na família "ranking" (`circuitLifecycle.js:109`,
  `tournamentLifecycle.js`, `seasonLifecycle.js`) calculam a média de
  **`world_ranking_points`** (pontos de ranking acumulados) — uma
  grandeza diferente de "quão bom o atleta é agora". É o MESMO padrão
  estrutural (média de dois valores de uma dupla) mas um conceito
  diferente do que decide quem vence uma partida.
- O terceiro site real de "média de `overall_rating`" é
  [`WorldTourLifecycle.js:253-255`](../../src/gameplay/worldTour/WorldTourLifecycle.js#L253-L255)
  (o `representative` construído para `chooseTournament`), não
  `teamRanking.js`.

**Os três sites de "média/composto de `overall_rating`" (força de
jogo), com o que cada um decide:**

| Site | Fórmula | O que decide |
|---|---|---|
| `WorldTourLifecycle.js:pairScore` (via `athleteScore`) | `rating×1,8 + form×0,25 + energy×0,12 + hash` por atleta, média dos 2 | **Quem entra** quando a chave está lotada (`applyOpenTierEntryPriority`) e **quem avança/vence** na resolução da chave (`.sort((a,b) => pairScore(...))`, linhas 310/359) — motor de resultado do World Tour em segundo plano (bots e IA). |
| `WorldTourLifecycle.js:253-255` (`representative.overall_rating`) | Média simples de `overall_rating` dos 2 atletas | **Nada, aparentemente.** `representative` só é passado para `chooseTournament` → `evaluateTournamentChoice` → `getTournamentChoiceProfile(tournament, rank)`, nenhum dos quais lê `overall_rating`/`overall` (grep confirmado em `TournamentSelectionAI.js` e `circuitCatalog.js`). Isto é uma variação **inversa** do padrão da fase: não é "cálculo certo que ninguém usa por engano" (a #16/#33/#37) — é um cálculo correto e mantido a cada iteração que genuinamente **não tem consumidor**, ao lado, no mesmo objeto, de um campo (`rank`) que passou 5 fases sendo a fonte real do bug. |
| `src/lib/bots.js:39-46` (`simulateMatch`/`strength`) | Média simples de `overallRating(player)` dos 2 jogadores | Resultado de partida no simulador **legado** (`teamRanking.js:simulateTournamentBracket`, chamado só por `simulatePastTournaments` — torneios antigos sem marca `world_tour_event`). Não é chamado pelo World Tour atual nem, pelo grep, por nenhum motor de partida do jogador — só esse caminho legado e um script de teste. |

**Correção ao achado #38:** a frase "é provavelmente a origem da
brecha do `athlete_a` e vai gerar a próxima" não se sustenta para esta
família. A brecha do `athlete_a` (achado #37, Fase 5.5) foi sobre a
família de **rank/ranking** (`pairEntryRank`, só implementada em UM
lugar — `WorldTourLifecycle.js`), não sobre a família de
`overall_rating`, que já vinha calculada como média desde antes da
Fase 5.5 ("o `overall_rating` já era a média dos dois aqui", comentário
na própria correção). As duas famílias têm o mesmo formato estrutural
(N implementações do mesmo tipo de conta), mas famílias diferentes —
unificá-las numa função só não faz sentido; **cada família teria a sua
própria função, se for unificar.**

**Proposta de unificação — não implementada, com impacto por par:**

1. **Família `overall_rating`** (`pairScore`'s composto vs. `bots.js`'s
   média pura vs. o `representative.overall_rating` não consumido):
   unificar `pairScore` e `bots.js:strength` na mesma função **mudaria
   comportamento** — não é neutro. `pairScore` inclui `form`, `energy` e
   um componente de hash (imprevisibilidade determinística por
   semana/torneio); `strength` é pura média de `overall_rating`, sem
   ruído algum. Se a unificação adotar o composto do World Tour, o
   simulador legado (hoje sem forma/energia/aleatoriedade) passa a
   variar por forma e energia — pode mudar quem ganha torneios antigos
   recém-simulados. Se adotar a média pura do legado, o World Tour perde
   a variância de forma/energia que hoje mistura o campo (achado #32
   já mede que a demanda concentra na "mesma fatia de maior
   `overall_rating`" — reduzir a variância tenderia a concentrar
   ainda mais, na direção errada). **Antes de unificar, medir se o
   resultado do World Tour muda de forma perceptível com o composto vs.
   a média pura** — não deveria ser feito às cegas.
2. O campo `representative.overall_rating` sem consumidor (o achado
   novo desta fase) é o candidato mais simples: ou passa a ser
   realmente usado em algum critério de escolha (ex.: preferir torneios
   onde a dupla tem mais chance dado seu nível — hoje `titleChance` só
   olha `rank`, não `overall_rating`), ou é removido do objeto
   `representative` sem trocar nada — não precisa de uma função
   unificada para isso, só uma decisão de manter ou cortar.
3. **Família `ranking_points`** (`circuitLifecycle.js:updateTeamRankings`,
   `tournamentLifecycle.js`, `seasonLifecycle.js`, `teamRanking.js`):
   já é estruturalmente parecida entre si (todas fazem
   `Math.round((a+b)/2)` sobre `world_ranking_points`/`ranking_points`),
   e diferente da família acima. Unificar SÓ dentro desta família é
   mais seguro (mesma fórmula, mesmos nomes de campo já usados em todo
   lugar) — mas ainda muda 4 pontos de escrita simultaneamente; o
   impacto a medir aqui não é comportamento de partida, é risco de
   regressão de escrita (uma função central errada quebra ranking do
   jogador E das duplas de IA de uma vez, em vez de um de cada vez).

Nenhuma das duas unificações foi implementada, conforme pedido.

### 3.3 — (a) `representative` ainda usa `athlete_a` para 4 campos

`WorldTourLifecycle.js:253-257` monta `representative` espalhando
`...pair.athletes[0]` (o `athlete_a` da `Partnership`, ordem arbitrária
de criação) e só sobrescreve `overall_rating` (média) e,
condicionalmente, `rank`/`ranking_position` (Fase 5.5). Os quatro
campos que ficam com o valor de `athlete_a` sem serem combinados com
`athlete_b`, e o que cada um afeta:

| Campo | Onde é lido | Efeito real |
|---|---|---|
| `careerStrategy` | `TournamentSelectionAI.js:38` — escolhe o perfil de pesos (`money`/`ranking`/`prestige`/`experience`/`balanced`) usado em `scoreOption` | **Afeta seleção de torneio.** A dupla inteira decide qual torneio jogar pela filosofia de carreira só de `athlete_a` — se `athlete_b` tem estratégia diferente, seu voto nunca conta. Sobe de prioridade: influencia diretamente qual torneio (logo, qual resultado) a dupla persegue. |
| `currentRegion` | `TournamentSelectionAI.js:28` — `travelLoad` (7 se sai da região do `context.currentRegion`, 2 se fica) → entra em `fatigueIncrease` → entra em `scoreOption` | **Afeta seleção, em segunda ordem.** Se `athlete_a` está numa região e `athlete_b` noutra, o cálculo de fadiga de viagem representa só a posição de um dos dois. Efeito menor que `careerStrategy` (um termo entre vários no score), mas real. |
| `age` | `EntryManager.js:122` — só importa combinado com `athlete.juniorInvite` (booleano) | **Sem efeito, nesta chamada.** `juniorInvite`/`nationalInvite`/`wildcard`/`specialExempt`/`protectedRanking` só existem quando `buildAthleteEntryContext` roda (caminho do jogador); `normalizeAthlete` (caminho do World Tour de IA) nunca define esses booleanos — ficam `undefined`, e `undefined` é falsy em todas as checagens (`EntryManager.js:119-123`). Para pares de IA, o convite júnior NUNCA dispara, com `age` de quem for. Cosmético neste caminho — registrado, não sobe de prioridade. |
| `nationality` | `EntryManager.js:123` — mesma dependência de `athlete.nationalInvite` | **Sem efeito, mesma razão do `age`.** `nationalInvite` nunca é `true` para pares de IA. Cosmético. |

**Prioridade sugerida (não implementada): `careerStrategy` e
`currentRegion` merecem um `pairRepresentative(pair)` que combine os
dois membros (ex.: sorteio ponderado por `overall_rating`, ou a
estratégia mais "extrema" dos dois, a decidir); `age`/`nationality`
podem ficar como estão até o dia em que o caminho de IA também passar
por `buildAthleteEntryContext`.**

## 4 — Validação

Nenhum código de produção mudou nesta fase (item 3(b) concluiu "não
remover"; itens (a)/(c) são propostas, não implementações; item 2 foi
suspenso) — só este relatório é novo. Ainda assim, suíte/lint/build
completos, por hygiene:

- `npm run lint` — limpo, sem avisos.
- `npm run build` — OK (mesmo aviso pré-existente de chunk >500kB em
  `index-*.js`, não relacionado a esta fase).
- Suíte de regressão (`rc-qa-suite-v36.mjs`) — **33/36, score 92/100**,
  as mesmas 3 falhas pré-existentes e já conhecidas (`test:rc-gameplay-
  balance`, `test:career-pace`, `test:ui-quality` — mojibake UTF-8 e
  regex desatualizada, nenhuma relacionada a `circuitCatalog`/
  `EntryManager`/`WorldTourLifecycle`/`aiPartnershipLifecycle`).
- `src-tauri/` intocado.
- Arquivos auto-regenerados pela suíte (`rc-qa-latest.*`,
  `BETA-AUDIT-v36.1.*`, `rc-sprint-1/*`) revertidos antes do commit.

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Regime-check lido (rotatividade + deriva de títulos) | ✅ lido — **interseção subiu 0→2 reais (3,1% da união), cláusula de parada acionada**; Top 20 real declina mais forte e sem platô (100%→50%, vs. 100%→75% da Fase 4.2); hipótese: dissolução de parceria real sem reformação no mercado (`aiPartnershipLifecycle.js`), não confirmada por instrumentação |
| 2 | Curva de expansão da base (40/80/150, sem escolher) | ⏸️ **suspenso por instrução do próprio pedido** — item 1 mostrou regressão |
| 3 | (b) corrigido com efeito medido; (c) e (a) reportados | ✅ **(b) não removido — consumidor confirmado, sem efeito a medir**; (c) achado corrigido (2 famílias, não 1) e proposta de unificação sem implementar; (a) reportado, `careerStrategy`/`currentRegion` sobem de prioridade, `age`/`nationality` cosméticos no caminho de IA |
| 4 | Suíte, lint, build, Tauri OK, commit | ✅ lint 0 · build OK · suíte 33/36 (92/100, mesmas 3 falhas pré-existentes) · `src-tauri/` intocado · nenhum código de produção alterado nesta fase |
