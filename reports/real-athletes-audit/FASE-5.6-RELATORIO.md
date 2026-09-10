# Fase 5.6 — Candidato B aplicado, Fase 5 fechada

> Fecha a Fase 5. Pré-requisito: FASE-5.5-RELATORIO.md (brecha de
> elegibilidade fechada, teto 150 confirmado, escada proposta).

## Decisões aplicadas

- **Teto = 150** (mantido — `OPEN_TIER_CEILING`, sem mudança de código).
- **Escada — Candidato B** (`circuitCatalog.js`):

| Tier | `minRanking` | `mainDrawSize` |
|---|---|---|
| Gold | 800 → **450** | 24 (=) |
| Platinum | 500 → **320** | 32 (=) |
| Masters | 300 → **230** | 24 (=) |
| Elite | 150 → **140** | 32 → **20** |
| Crown | 80 → **75** | 32 → **20** |

Eventos por tier **inalterados** (o Candidato B modelado propunha mexer
neles; a decisão aprovada foi só cortes + chaves de Elite/Crown).

---

## 1 — Verificação: os reais no topo depois da chave menor

`DIAG_LADDER56`, regime (temporada 2), mesma seed `official-900-100-s1`.
"Antes" = escada da Fase 5.5 (Gold 800 … Elite/Crown draw 32). "Depois"
= Candidato B.

### 1.1 — Razão demanda/capacidade por tier (a escada achatou)

| Tier | corte | draw | cap/temp | razão ANTES | **razão DEPOIS** | chaves < draw |
|---|---|---|---|---|---|---|
| Bronze | 0 | 16 | 384 | 10,5× | 10,6× | 8 (rescatadas, Fase 5.4) |
| Silver | 0 | 16 | 256 | 15,8× | 16,0× | 0 |
| Gold | 450 | 24 | 192 | **9,6×** | **5,0×** | 0 |
| Platinum | 320 | 32 | 192 | **4,7×** | **2,8×** | 0 |
| Masters | 230 | 24 | 240 | 3,7× | **2,7×** | 0 |
| Elite | 140 | **20** | **200** | **1,3×** | **1,8×** | **1 → 0** |
| Crown | 75 | **20** | **80** | 1,4× | **2,0×** | 0 |

**A faixa Gold→Crown foi de 9,6-1,3× para 5,0-2,0×** — achatada, como
pedido. Gold segue o mais alto (~5×), de propósito. **A escada de ACESSO
é estritamente monotônica** (450 > 320 > 230 > 140 > 75) — nenhuma
inversão. Elite deixou de rodar abaixo do `drawSize` (tinha 1 chave
incompleta antes; a chave de 20 casa com a demanda real).

### 1.2 — Presença real em Elite e Crown (a verificação obrigatória)

| | Elite ANTES | **Elite DEPOIS** | Crown ANTES | **Crown DEPOIS** |
|---|---|---|---|---|
| cap/temporada | 320 | 200 (−37%) | 128 | 80 (−37%) |
| **títulos** (R / mista / bot) | **9 / 0 / 1** | **9 / 0 / 1** | **4 / 0 / 0** | **4 / 0 / 0** |
| entradas de duplas 100% reais | 130 | **106** (−18%) | 58 | **45** (−22%) |
| duplas reais distintas | 24 | **24** | 25 | **21** (−4) |
| atletas reais distintos | 48 | **47** | 50 | **41** (−9) |
| fração real do campo | ~41% | **~53%** | ~45% | **~56%** |

**Leitura — presença essencial MANTIDA, presença marginal caiu com a
capacidade:**

- **Títulos: idênticos.** Os reais ganham 9/10 Elite e 4/4 Crown antes e
  depois. A elite real não perdeu nada.
- **Duplas reais distintas: Elite igual (24), Crown −4** (25→21) — as 4
  são duplas de rank ~130-155 que entravam no Crown pelo qualifying
  (`qualifyingSize:16`, limite rank 155) e não cabem mais na chave de 20.
- **Fração real do campo SUBIU** (41→53% Elite, 45→56% Crown) — a chave
  menor cortou mais bot que real, porque o corte é por `pairScore` e os
  reais têm skill mais alto. O topo ficou MAIS real, não menos.
- **Entradas −18/−22%**, acompanhando a redução de capacidade (−37%) mas
  amortecida. `−9` atletas reais distintos no Crown são os marginais.

### 1.3 — O custo agregado (fora de Elite/Crown)

| Métrica (regime) | antes | depois |
|---|---|---|
| Campeões do circuito — reais / bots / mista | 76 / 72 / 9 | **78 / 63 / 16** |
| Reais — torneios disputados (média / mediana) | 27,1 / 29 | **23,4 / 22** |
| Reais sem jogar (2026 / 2027) | 10 / 18 | **13 / 21** |
| Dominância real Bronze/Silver por título (2 temp.) | 6,2% | **8,8%** |
| Top 20 real em regime | 14/20 | **16/20** |

**Candidato B tira ~9 títulos de bot** (72→63) e dá 2 a mais pros reais —
o topo mais apertado concentra as duplas fortes, e os reais ganham. Top
20 real de regime melhora (14→16).

**O custo:** os reais jogam ~4 torneios a menos por temporada (27→23) e
+3 ficam de fora em regime (18→21). Os ~168 lugares/temporada que
Elite+Crown perderam não são recuperados noutro tier — a escada mais
apertada + as chaves menores reduzem a oferta total do topo, e como o
topo é majoritariamente real, os reais absorvem a maior parte. Os que
ficam de fora são a cauda fraca (rank 400-800), que só tem a base — já a
12,6×; problema de capacidade da base, não criado por esta fase (era 18
antes).

### 1.4 — Cláusula de parada do pedido

> "Meça a presença dos reais em Elite e Crown antes e depois — títulos,
> entradas, e quantos reais distintos aparecem em cada um. **Se cair,
> pare e reporte antes de commitar.**"

**Caiu, parcialmente:** entradas (−18/−22%) e atletas reais distintos no
Crown (50→41). **NÃO caiu:** títulos (idênticos), duplas reais distintas
(Elite igual, Crown −4), fração real do campo (subiu). Bots perderam 9
títulos no circuito todo.

**Reportado ao usuário com três opções** (Candidato B como está / chaves
em 24 / só cortes). **Decisão: Candidato B como está (chave 20).**
Justificativa aceita: a presença ESSENCIAL se mantém (títulos, duplas
distintas, fração real), o que cede é presença marginal acompanhando o
corte de capacidade que a própria decisão da escada aprovou; os atletas
cortados são cauda de chave (perderiam na 1ª rodada), e o topo ficou
mais real, não menos.

---

## 2 — Registro: "dominância real na base" não tem alvo zero

A dominância real de Bronze/Silver por título em regime é **8,8%** com o
Candidato B (era 6,2% na Fase 5.5 — a escada mais apertada empurra
algumas duplas reais de rank 230-450 pra base). **Esse número não é erro
a perseguir, e o alvo nunca deveria ter sido zero.**

Os 100 atletas reais entraram pelo ranking FIP de agosto de 2026. Dentro
do mundo simulado eles têm ranking próprio, que evolui com os resultados
— e ~3-5 duplas reais caem pra faixa 151-450 em regime (Geens/Guichard,
González/Patiniotis, Rubio/Jiménez — pros de meio de tabela, ovr 79-84;
a elite real (Galán, Tapia, Coello) nunca aparece na base). **Elas não
estão lá por brecha** — a brecha foi fechada na Fase 5.5 (vazamento
re-medido = 0). Estão porque o teto de 150 diz que podem, e podem.

Uma dupla real que caiu no ranking disputando a base é **o circuito
funcionando.** O objetivo do teto, desde a Fase 5.2, sempre foi barrar a
**elite** real da base — não zerar a presença real. Um alvo de "0%"
exigiria ou um teto ≥ 350 (que colapsa a capacidade da base — Fase 5.3) ou
tratar o ranking dinâmico dos reais como bug (não é).

**Redação corrigida no registro:**

- `EntryManager.js`, comentário do `OPEN_TIER_CEILING` — reescrito: a
  dominância residual é o sistema funcionando, não defeito.
- Achado #37 / FASE-5.5 §1.4 já dizia "discutivelmente correto"; esta
  fase torna explícito que **não é discutível — é o desenho.**
- Nenhuma fase anterior tratou a dominância real como defeito *por
  definição* — o alvo sempre foi implícito ("tirar a elite"), e as Fases
  5.2-5.4 falavam em "dominância real cai pra ~0%" como *observação da
  curva*, não como meta. A única frase que precisava de ajuste era o
  comentário de código acima (que dizia "150 zera a dominância real").

---

## 3 — Grep: o padrão "cálculo certo, consumidor que não usa"

Classe **diferente** das contaminações de dado (#33/#35/#37): não é
número errado, é lógica certa desconectada do consumidor. Três
ocorrências conhecidas:

| Fase | O cálculo certo | O consumidor que não usava |
|---|---|---|
| 1A (#16) | `resolveEntryRank` (adaptador central: lê `rank`→`teamRank`→`ranking_position`→`ranking`→`world_ranking`) | `evaluateTournamentEntry` lia só `rank`/`teamRank` — nenhuma dupla do World Tour de fundo era "com ranking", elegibilidade por tier não filtrava nada |
| 5.1 (#33 item 2) | `calculatePartnershipInterest(...).available` (score de reputação/ranking, 3 faixas) | `PartnerHub.jsx:handleInvite` ia direto a `startPartnership` — só o portão de XP checava; reputação zero contratava o melhor atleta do jogo |
| 5.5 (#37) | `pairEntryRank(pair)` (média do rank dos dois) | `chooseTournament` recebia `pair.athletes[0]` — elegibilidade decidida pelo rank do `athlete_a` |

### 3.1 — O que o grep desta fase achou (reportado, NÃO corrigido)

**(a) O `representative` do `chooseTournament` ainda é `athlete_a` pra
tudo menos o rank e o overall.** `WorldTourLifecycle.js:254` —
`{ ...pair.athletes[0], overall_rating: <média>, rank: pairEntryRank, ... }`.
Os campos `careerStrategy` e `currentRegion` (que decidem os PESOS de
estratégia e o custo de viagem no `scoreOption`) e `age`/`nationality`
(convites junior/nacional) continuam sendo do primeiro atleta. Impacto
baixo: os convites são flags que o NPC nunca tem; a estratégia/região da
dupla "seguir o `athlete_a`" é uma escolha de modelagem defensável, não
uma brecha de elegibilidade. **Mas é o mesmo padrão** — merece um
`pairRepresentative(pair)` único em vez de `{...athletes[0]}` espalhado.

**(b) Existe um `TeamRanking` de IA mantido que o World Tour não lê.**
`circuitLifecycle.js:updateTeamRankings` cria/atualiza uma linha
`TeamRanking` por dupla de IA (`ai_partner_id`), com
`ranking_points = média(world_ranking_points dos dois)` — **o mesmo
método** que `getTeamRank` usa pro jogador e que `pairEntryRank` agora
usa. Mas `WorldTourLifecycle.js` monta as duplas a partir de
`Partnership` (não de `ai_partner_id`) e deriva o rank da dupla na hora,
por `ranking_position` individual. São duas fontes do mesmo conceito
("qual é o rank desta dupla"), mantidas em paralelo, com chaves
diferentes (`ai_partner_id` × `Partnership`) e grandezas diferentes
(pontos × posição). Unificar não é trivial (cobertura de população,
cadência de escrita) — **registrado pra uma rodada futura, não corrigido
aqui.**

**(c) "Força da dupla = média do overall" está implementado 3+ vezes.**
`WorldTourLifecycle.js:pairScore`/`athleteScore`, `lib/bots.js:40`
(`strength`), `teamRanking.js` (comentário: "média dos dois totais
rolling") — cada domínio (sorteio de fundo, simulação de partida do
jogador, ranking de duplas) tem a sua. Todas usam a média, então não há
divergência de resultado hoje — mas são N implementações de um conceito.
Contexto, não bug.

---

## 4 — Fechamento da Fase 5

A Fase 5 começou pra achar "calendário faltando na base" (achado #32:
razão de regime 15,3×, ~67% das duplas nunca entram numa chave). Terminou
tendo re-medido três vezes um mundo que não estava rodando inteiro
(#33/#35/#37), corrigido o mecanismo de seleção, fixado o teto de acesso
livre e recalibrado a escada do topo.

### 4.1 — Antes/depois, contra a baseline pré-Fase-3

Pré-Fase-3: seed `official-900-100-s1`, 900+100, **1 temporada**, escada
antiga de 6 tiers (chave 64). Fase 5.6: mesma seed/escala, **regime
(temporada 2)**, escada de 9 tiers recalibrada.

| Métrica | pré-Fase-3 | início da Fase 5 | **Fase 5.6** |
|---|---|---|---|
| Torneios/temporada | 32 | 80 | 78 |
| Dominância real — **todos** os títulos | **31/32 = 97%** (0 bot em qualquer tier) | ~93% | **78/157 = 50%** (63 bot · 16 mista) |
| Chaves incompletas | 13/32 (40,6%, chave 64 nunca enchia) | 0/80 (mascarado pelo preenchimento) | 8/78 (8 Bronze rescatados p/ 8) |
| Torneios cancelados por campo | — (não existia; preenchimento) | — | 0 na base · 1 Circuit Finals/temp (pool top-8) |
| Exclusão de duplas (escolheram B/S, nunca entraram numa chave B/S) | não medida | **67,5%** (349/517) | **50,7%** (228/450) |
| Bots — torneios por escolha própria (mediana/média) | mascarado (valor estático 18,8) | 0 / ~1,9 | **1 / 3,6** |
| Reais no top 20 (regime) | 19/20 | 20/20 (T1) · ~18/20 (T2) | **16/20** |
| Reais sem jogar / temporada | 13/100 | ~16-18/100 | **13 (T1) / 21 (T2)** · interseção 2 temp: **6** |

### 4.2 — Dominância real por tier (regime)

| Tier | pré-Fase-3 (títulos R/mista/bot) | **Fase 5.6** (R/mista/bot) |
|---|---|---|
| Bronze | *(não existia)* | 3 / 5 / 16 |
| Silver | 6 / 1 / 0 | 4 / 6 / 6 |
| Gold | 6 / 0 / 0 | 6 / 0 / 2 |
| Platinum | 6 / 0 / 0 | 6 / 0 / 0 |
| Masters | 5 / 0 / 0 | 10 / 0 / 0 |
| Elite | 4 / 0 / 0 | 9 / 0 / 1 |
| Crown | 4 / 0 / 0 | 4 / 0 / 0 |

**A base (Bronze/Silver) foi de 100% real pra ~40% real** — os bots agora
disputam e ganham o tier de entrada, que é o comportamento certo. **O
topo (Masters/Elite/Crown) segue ~100% real** — os reais dominam onde
devem. Gold/Platinum quase-100% real com uma fresta de bot forte.

### 4.3 — Razão demanda/capacidade por tier

Não medida pré-Fase-3 nem no início da Fase 5 (só o agregado da base:
15,3×). Primeira medição por tier: Fase 5.4.

| Tier | Fase 5.4 (1ª medição) | **Fase 5.6** |
|---|---|---|
| Bronze+Silver | 12,6× | 12,6× |
| Gold | 9,6× | **5,0×** |
| Platinum | 4,7× | **2,8×** |
| Masters | 3,7× | **2,7×** |
| Elite | 1,3× | **1,8×** |
| Crown | 1,4× | **2,0×** |

A base segue a 12,6× — **oversubscrição estrutural de um mundo de 1000
atletas contra um calendário de base de 40 eventos** (achado #32: teto de
código ~240 eventos/temporada, folga larga, mas expandir não move a
razão — #36). O topo foi de 9,6-1,3× (invertido, Gold entupido / Elite
ocioso) pra 5,0-2,0× (Gold ainda o mais alto de propósito).

### 4.4 — O que a Fase 5 fez e o que ficou pra depois

**Feito:** seleção de base por prioridade + piso (5.1); teto de acesso
livre fixado em 150 (5.2/5.4/5.5); preenchimento de reserva removido,
chave de tamanho variável (5.3); redistribuição de excedente entre tiers
livres (5.4); elegibilidade por dupla, não por atleta (5.5); escada do
topo recalibrada (5.6).

**Fica pra depois (registrado, fora do escopo):**
- A **base a 12,6×** — o calendário de base é pequeno pra a população; a
  Fase 5 confirmou que expandir não move a razão (#36) e que o gargalo é
  o mecanismo de escolha (`chooseTournament` não modela lotação — #35).
- Os **três achados de padrão "cálculo certo, consumidor que não usa"**
  (§3) — um `pairRepresentative` único, o `TeamRanking` de IA não lido.
- `chooseTournament` **não distribui entre eventos concorrentes** — a
  redistribuição da Fase 5.4 é um paliativo pros cancelamentos, não a
  correção da IA de seleção.

---

## 5 — Validação

- Instrumentação temporária (`DIAG_LADDER56`) revertida integralmente —
  `grep` zero em `src/`/`scripts/`, `git diff` do harness vazio.
- `npx eslint . --quiet` — **exit 0**.
- `npm run build` — **OK** (`✓ built in 1m47s`; só o aviso de chunk).
- Suíte (`rc-qa-suite-v36.mjs`, perfil `core`) — ****33/36, score 92/100**. As 3 falhas (`test:rc-gameplay-balance` — cenário `aggressive-tactic` do motor de partida; `test:career-pace` — regex que procura um `const WEEK_PROGRAM` que virou função na Fase 3; `test:ui-quality` — mojibake pré-existente) são datadas de commits meses antes e **não tocam `circuitCatalog.js` nem a elegibilidade** — nenhuma regressão nova**.
- `git status --short -- src-tauri/` — ****vazio****.

### Mudanças permanentes

| Arquivo | Mudança |
|---|---|
| `circuitCatalog.js` | escada recalibrada (Candidato B): `minRanking` Gold 800→450, Platinum 500→320, Masters 300→230, Elite 150→140, Crown 80→75; `mainDrawSize` Elite/Crown 32→20; entrada `20` em `DISPLAY_ROUNDS_BY_DRAW_SIZE` |
| `EntryManager.js` | comentário do `OPEN_TIER_CEILING` reescrito (dominância real residual = sistema funcionando, sem alvo zero) — só comentário, `OPEN_TIER_CEILING = 150` inalterado |

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Candidato B aplicado + verificação de presença real em Elite/Crown | ✅ aplicado; verificação: **títulos idênticos** (Elite 9/10, Crown 4/4), fração real do campo **sobe**, entradas −18/−22% e atletas distintos Crown −9 (acompanham o corte de capacidade); cláusula de parada acionada → reportado → **decisão do usuário: manter Candidato B (chave 20)** |
| 2 | Nota "sem alvo zero" no registro | ✅ §2 + comentário do `OPEN_TIER_CEILING` reescrito; a dominância real da base (8,8% regime) é a cauda fraca do elenco real, não erro |
| 3 | Resultado do grep do padrão `athlete_a`, sem correções | ✅ §3 — classe registrada com 3 ocorrências (#16 / #33 / #37) + 3 achados novos reportados (representative athlete_a residual, `TeamRanking` de IA não lido, "força = média" implementado 3×); **nada corrigido** |
| 4 | Relatório de fechamento da Fase 5 | ✅ §4 — base 100%→~40% real, topo ~100% real, bots por escolha própria de estático mascarado (18,8) pra mediana 1; razão do topo 9,6-1,3× → 5,0-2,0× |
| 5 | Suíte, lint, build, Tauri, commit | ✅ lint 0 · build OK · suíte 33/36 (92/100, mesmas 3 falhas pré-existentes) · `src-tauri/` vazio · commit + regime-check de 5 temporadas |

### Resumo executivo

1. **Candidato B aplicado** (`circuitCatalog.js`): cortes
   450/320/230/140/75, chaves de Elite/Crown 32→20. A razão de regime do
   topo foi de **9,6-1,3× para 5,0-2,0×** (Gold ainda o mais alto, de
   propósito). Escada de acesso estritamente monotônica.
2. **Verificação obrigatória de presença real em Elite/Crown:** a chave
   menor **NÃO** tira os reais do topo. Títulos idênticos (Elite 9/10,
   Crown 4/4), duplas reais distintas ~iguais, **fração real do campo
   subiu** (a chave menor corta mais bot que real). Bots perderam 9
   títulos no circuito. O que caiu é presença marginal — entradas −20%,
   Crown −9 atletas distintos — acompanhando o corte de capacidade de
   −37%. **Cláusula de parada acionada e reportada; decisão do usuário:
   manter Candidato B (chave 20).**
3. **"Dominância real na base" registrada sem alvo zero.** 8,8% em
   regime = a cauda fraca do elenco real (rank 151-450, ovr 79-84)
   disputando o tier de entrada — o circuito funcionando, não erro. A
   elite real nunca aparece na base. Comentário do `OPEN_TIER_CEILING`
   reescrito.
4. **Grep do padrão "cálculo certo, consumidor que não usa"** (classe
   diferente de #33/#35/#37): 3 ocorrências conhecidas (#16, #33 item 2,
   #37) + 3 novas reportadas — o `representative` ainda usa `athlete_a`
   pra estratégia/região; um `TeamRanking` de IA mantido que o World Tour
   não lê; "força = média do overall" implementado 3×. **Nada corrigido.**
5. **Fase 5 fechada.** Contra a baseline pré-Fase-3: a base foi de 100%
   real pra ~40%, o topo segue ~100% real; a participação de bots por
   escolha própria de "estático mascarado (18,8)" pra "mediana 1"; a
   exclusão de duplas B/S de 67,5% pra 50,7%. O que fica: a base a 12,6×
   (calendário pequeno pra a população), os achados de padrão do item 3,
   e `chooseTournament` não distribuir entre eventos concorrentes.
6. Validação: lint 0, build OK, suíte 33/36 (92/100), `src-tauri`
   intocado, `DIAG_LADDER56` revertido.

### Regime-check de 5 temporadas

<!-- PREENCHER: disparado após o commit (recomendação do pedido) -->

---

## Achado que precisa de correção no registro

Nenhum. A dominância real da base já era descrita como "reais disputam a
base legitimamente abaixo de ~150" (achado #35); esta fase só torna
explícito que **não há alvo zero** e reescreve o comentário de código do
`OPEN_TIER_CEILING` que dizia "150 zera a dominância real". A razão
demanda/capacidade por tier (Fase 5.4) muda com o Candidato B — mas isso
é a mudança desta fase, não correção de leitura anterior.

