# Fase 5.5 — Verificar o resíduo de 8%, reabrir o teto, re-escalar a escada do topo

> Pré-requisito: Fase 5.4 entregue (teto=150, redistribuição de excedente,
> curva do topo). Ver [FASE-5.4-RELATORIO.md](FASE-5.4-RELATORIO.md).

**A verificação do item 1 achou uma brecha de elegibilidade:**
`chooseTournament` decidia a entrada da dupla pelo rank de *um* atleta
arbitrário (o `athlete_a` da Partnership), não da dupla. Corrigida
(`pairEntryRank`). Efeito na base: a dominância real cai de 8,8% pra
6,2%, e a decisão do teto **inverte** — teto=150 passa a ser claramente
melhor que 100 (§2). Efeito no topo: a demanda por tier **quase não
muda** (Gold 9,6×→9,6×) — a curva da Fase 5.4 §2 estava certa nesse
ponto; a escada continua mal distribuída (§3).

---

## 1 — De onde vêm os ~8% de dominância real na base

### 1.1 — Não é a redistribuição. É elegibilidade por atleta, não por dupla.

`resolveCompletedWorldTourEvents` chama, por dupla:
`chooseTournament(weekTournaments, { ...pair.athletes[0], overall_rating: <média> })`.
O `overall_rating` já era a média dos dois — mas o **rank** não: dentro de
`chooseTournament` → `evaluateTournamentEntry`, `resolveEntryRank` lia o
`ranking_position` do **primeiro atleta** da dupla (o `athlete_a` da
Partnership, ordem arbitrária de criação). O teto de acesso livre
(`rank <= OPEN_TIER_CEILING`) era testado contra esse rank individual, não
contra o da dupla.

**Consequência:** uma dupla `[#82, #189]` com o #82 gravado como
`athlete_b` passava o teto de 150 pelo rank 189 do `athlete_a` e entrava
em Bronze/Silver com um top-82 dentro.

### 1.2 — Medição nominal (regime, teto=150, seed `official-900-100-s1`)

Instrumentação `DIAG_ENTRY55`: registra todo entrante de Bronze/Silver
com o rank dos dois atletas, o rank da dupla, e a via de entrada.

| | antes da correção | depois (item 1) |
|---|---|---|
| Chaves B/S que rodaram (regime) | 40 | 40 |
| Entrantes 100% reais | 58 | 88 |
| — via escolha própria | **58** | **88** |
| — via redistribuição (Fase 5.4) | **0** | **0** |
| Campeões B/S 100% reais | 7 | 5 |
| — com um membro rankeado ≤ teto | **1** (Pineda/Piotto) | **0** |
| Dominância real B/S por título (2 temporadas) | 8,8% | **6,2%** (5/80) |

**A redistribuição da Fase 5.4 não é o caminho** — 0 de 58 (e 0 de 88
pós-correção) entrantes reais entraram por ela. Ela move os pares de
menor `pairScore` do Silver superlotado pro Bronze vazio, e esses são
majoritariamente bots.

(O nº de *entrantes* reais sobe 58→88 porque a correção também re-ordena
a escada inteira: duplas mistas `[decente, fraco]` que o `athlete_a`
decente puxava pra Masters/Elite agora são classificadas pela média e
caem na base. Elas entram mas não vencem — os *títulos* caem 7→5, e o
vazamento — rank-par ≤ teto na base — é 0.)

**Dos 7 títulos reais originais:** 6 eram duplas genuinamente elegíveis
(os dois membros rankeados 155-175 — Geens/Guichard, Abbate/Sánchez
Chamero, Rodríguez Martínez/Campagnolo), 1 era a brecha
(Pineda #189 / Piotto #82, elegível pelo #189).

### 1.3 — Correção aplicada

`WorldTourLifecycle.js` — o `representative` passado pro `chooseTournament`
agora carrega `pairEntryRank` (média dos dois, mesmo adaptador de
`applyOpenTierEntryPriority` e da redistribuição do item 1 da Fase 5.4)
como `rank`/`ranking_position`. A porta enxerga a dupla, não um membro
sorteado. Rede de segurança adicional na redistribuição: `barredFromOpen`
— nenhuma dupla com `pairEntryRank <= OPEN_TIER_CEILING` é movida pra um
evento de base, nem pra salvar um cancelamento.

**Verificação pós-correção:** `VAZAMENTO (rank do par ≤ teto mas entrou na
base) = 0` nas duas temporadas, teto 100 e 150. A brecha está fechada.

### 1.4 — O que sobra: ~6% é elenco real genuinamente fraco, não brecha

Os 5 títulos reais restantes (regime, teto=150) são de duplas com **os
dois membros rankeados 154-172** — Mena/Sans, Geens/Guichard,
Barahona/Martínez, González/Sánchez, Piotto/Cassetta. Não são top-100,
não são top-150: pelo próprio critério do teto, são elegíveis pra base.

**A premissa "os reais são top 100" é empiricamente falsa.** O elenco de
100 reais, distribuído num mundo de 1000, tem ~3 duplas reais rankeadas
151-250 em regime (pros de meio de tabela: Geens, Mena, Barahona...).
Elas jogam e às vezes vencem o tier de entrada — o que é discutivelmente
*correto*. **Nenhum teto na faixa utilizável leva isso a zero** porque o
elenco real não é todo de elite; ver §2 (teto=100 é PIOR).

Regra escolhida: `pairEntryRank` (média), não `min(ranks)`. `min` barraria
também as ~5 duplas com um membro ≤ teto e média > teto — mas essas não
ganham título nenhum (todos os 5 campeões têm os dois membros > teto), e
`min` puniria uma dupla fraca por ter um parceiro decentemente rankeado.
A média é o nível competitivo real da dupla.

---

## 2 — Teto 100 vs 150, com o mundo corrigido

**A curva da Fase 5.4 (100 → 7,5%, 150 → 8,8%) descrevia o mundo com a
brecha.** Re-medido com o item 1 corrigido:

| Métrica (regime = temporada 2, seed `official-900-100-s1`) | teto 100 | teto 150 |
|---|---|---|
| **Dominância real Bronze/Silver por título** (2 temporadas) | **13,8%** (11/80) | **6,2%** (5/80) |
| Razão demanda/capacidade Bronze+Silver (regime) | 13,23× | **12,63×** |
| Torneios Bronze/Silver cancelados / temporada | 0 | 0 |
| Chaves Bronze/Silver incompletas (regime) | 8/78 | 9/78 |
| Reais sem jogar (2026 / 2027) | 12 / 13 | 10 / 18 |
| Top 20 real em regime | 15/20 | 14/20 |
| Campeões do circuito — reais / bots / mista (2 temp.) | 82 / 49 / 26 | 76 / 72 / 9 |

**150 ganha no eixo que importa (dominância real da base): teto=100 dá
2,2× mais dominância real.** Motivo, nominal: há ~8 duplas reais
rankeadas 100-150 (Quílez/Mouriño ~105, Jofre/Sager ~110,
González/Sánchez ~125 — ovr 81-83), fortes o bastante pra dominar
Bronze/Silver contra bots de ovr ~45. O teto de 150 as barra; o teto de
100 as solta na base, e elas ganham 6 dos 11 títulos reais de base.

Nos eixos secundários é quase empate: teto=100 tem a base um pouco mais
oversubscrita (13,2× vs 12,6×) e um pouco menos reais ociosos em regime
(13 vs 18 — mas idêntico na temporada 1, 12 vs 10; dentro do ruído de
uma temporada com a rotatividade de parcerias que o motor tem). Nenhum
torneio de base cancela em nenhum dos dois.

**O argumento do pedido ("100 ganha nos dois eixos") vinha da curva
antiga** (Fase 5.4: 100→7,5%, 150→8,8%, medida com a brecha do item 1 e
antes da redistribuição un-cancelar as 16 chaves). Com a brecha fechada
os resultados deixam de ser um empate: **teto = 150 se mantém.**

---

## 3 — Escada do topo recalibrada (proposta, sem aplicar)

### 3.1 — A curva corrigida (antes) — igual à da Fase 5.4

Demanda naïve (escolha de dupla) / capacidade por tier, regime, teto=150,
elegibilidade já corrigida (`pairEntryRank`):

| Tier | `minRanking` | eventos/ano | draw | cap/temp. | razão (regime) |
|---|---|---|---|---|---|
| Gold | 800 | 8 | 24 | 192 | **9,6×** |
| Platinum | 500 | 6 | 32 | 192 | **4,7×** |
| Masters | 300 | 10 | 24 | 240 | 3,7× |
| Elite | 150 | 10 | 32 | 320 | **1,3×** |
| Crown | 80 | 4 | 32 | 128 | 1,4× |

A correção do item 1 **não moveu essa curva** (Gold 9,69×→9,61×) — a
elegibilidade por `athlete_a` vs. por dupla quase nunca diverge (os dois
atletas de uma dupla têm rank parecido; Pineda/Piotto era a exceção).

### 3.2 — Por que "recalibrar os cortes" sozinho não resolve

Medição da própria auditoria (Fase 5.4, varredura de `minRanking` do
Gold; confirmada pelo Candidato A abaixo): **a razão de regime segue
`razão ≈ k · (pares elegíveis até o corte) / drawSize` com k ≈ 0,5-0,7,
e é independente do número de eventos** (dobrar eventos dobra demanda e
capacidade juntas — achado #36). Três consequências:

1. **O pool do Gold é estrutural.** Com o teto de acesso livre em 150,
   ~335 dos ~366 pares ativos têm rank-par ≤ 800 e o Gold é a porta de
   entrada do topo pra todos eles. Baixar o corte do Gold é a única
   alavanca que mexe na razão — e joga os pares de rank 400-800 **de
   volta pra base** (já a 12,6×).
2. **Os drawSizes zigue-zagueiam** (Gold 24, Platinum 32, Masters 24,
   Elite 32, Crown 32) — um tier mais exclusivo tem chave MAIOR que o de
   baixo. Como `razão ∝ 1/drawSize`, nenhum conjunto de cortes monotônico
   achata a razão enquanto os draws não forem monotônicos (menores pra
   cima).
3. **A capacidade está invertida.** Elite tem a MAIOR capacidade da
   escada (320) e o menor pool (~65); Gold tem a menor (192) e o maior
   (~335). Os eventos e o tamanho de chave foram calibrados na Fase 3 pra
   uma pergunta diferente.

### 3.3 — Candidato A, medido (só cortes)

`DIAG_LADDER_CUTS` — Gold 800→450, Platinum 500→320, Masters 300→230,
Elite 150→140, Crown 80→75 (aperta Gold/Platinum/Masters, deixa
Elite/Crown ~como estão). Monotônico. Medido, regime, mesma seed:

| Tier | corte → | razão antes | **razão depois** | chaves < draw |
|---|---|---|---|---|
| Gold | 800 → **450** | 9,6× | **5,1×** | 0 |
| Platinum | 500 → **320** | 4,7× | **2,8×** | 0 |
| Masters | 300 → **230** | 3,7× | **2,6×** | 0 |
| Elite | 150 → **140** | 1,3× | **1,2×** | 2 |
| Crown | 80 → **75** | 1,4× | **1,4×** | 0 |
| Bronze+Silver | teto 150, inalterado | 12,6× | **12,9×** | 8 (rescatadas) |

**Leitura:** apertar os três tiers do meio funciona — Gold cai pela
metade, a faixa Gold/Platinum/Masters converge pra 2,6-5,1×. Custos:
(1) a base sobe 12,6×→12,9× (os ~140 pares de rank 450-800 empurrados
pra lá — irrelevante numa base já a 12,6×); (2) **Elite e Crown continuam
ralos** (~1,3×, Elite com 2 chaves abaixo do tamanho) — os cortes não os
alcançam porque o problema deles é a chave de 32, grande demais pro pool
de ~30-65 pares elegíveis. Sem regressão nova (0 cancelamentos; reais
ociosos e top-20 dentro do ruído).

### 3.4 — Candidato B, modelado (cortes do A + draws menores no topo)

O modelo `razão ≈ k · pool / drawSize` (k≈0,6 no Candidato A, medido)
permite estimar o efeito de encolher as chaves de
Elite e Crown — os únicos tiers cuja capacidade está claramente grande
demais:

| Tier | corte | draw 24/32… → | eventos → | razão modelada |
|---|---|---|---|---|
| Gold | 450 | 24 (=) | 8 → 10 | ~5,0× |
| Platinum | 320 | 32 → 28 | 6 → 8 | ~2,8× |
| Masters | 230 | 24 (=) | 10 → 8 | ~2,6× |
| Elite | 140 | 32 → **20** | 10 → 8 | ~**1,9×** |
| Crown | 75 | 32 → **20** | 4 (=) | ~**2,3×** |

Isso achata a escada inteira em **~2-5×** (de 9,6-1,3× hoje), monotônica,
sem cancelar nada. O Gold segue sendo o mais alto (~5×) — **é
estrutural**: com o teto de acesso livre em 150, ~330 pares têm rank-par
≤ 450-800 e o Gold é a porta de entrada do topo pra todos. Derrubar o
Gold pra ~3× exige ou cortar pra ~350 (mais transbordo pra base) ou
**criar mais eventos de Gold** — e aí o teto de código (achado #32) ainda
tem folga larga: 78 eventos/temporada hoje, ~240 no limite.

**Nada disto foi aplicado.** É a escada pra o usuário decidir: o Candidato
A (só cortes) é a mudança mínima que resolve o meio; o B acrescenta o
lever de capacidade pra Elite/Crown; qualquer um deles precisa dos
`roundLabels`/`roundPoints` recalculados pro novo `mainDrawSize`
(`buildTier` já faz isso — é editar `TOURNAMENT_TIER_CONFIG`).

---

## 4 — Correção no registro: número publicado sobre mecanismo que não fazia o que parecia — três instâncias

### 4.1 — A classe

Três achados desta auditoria, de três fases, são a mesma coisa: **um
número foi medido e publicado enquanto uma parte do circuito não estava
executando como o número supunha.**

| # | Fase | O número publicado | O que não estava rodando | Corrigido para |
|---|---|---|---|---|
| #33 item 0 | 5.1 | mediana de bots "torneios jogados" ≈ 18 (faixa 6-33) | a resolução do World Tour nunca tinha rodado; `tournaments_played` era um valor estático de história de fundo, nunca incrementado | mediana **0-1** (campo separado `backstory_tournaments_played`) |
| #35 / #36 | 5.3 / 5.4 | dominância real de Bronze/Silver ≈ 0-1,6% a partir do teto 150; "top 20 real 18-20/20 em regime" | 8 chaves de Bronze/temporada cancelavam por herding de `chooseTournament` — não distribuíam título nem pontos; denominador 64, não 80 | dominância **~9%**; top 20 real de regime **~14/20** (redistribuição da Fase 5.4) |
| **#37** | **5.5** | dominância real de Bronze/Silver 8,8% (teto 150); curva de teto 17,5/7,5/8,8 | a elegibilidade da dupla era decidida pelo rank de **um** atleta (o `athlete_a`), não da dupla — uma dupla com um top-82 dentro passava o teto pelo parceiro rank-189 | dominância **6,2%**; teto=100 (13,8%) > teto=150 (6,2%), a decisão do teto **inverte** |

Não são erros de aritmética — são medições honestas de um mundo que
tinha um mecanismo silenciosamente quebrado. Cada correção **fortaleceu**
a leitura qualitativa (os reais dominam menos a base do que parecia; os
bots jogam menos do que parecia) e **mudou um número que decidia um
parâmetro** (o teto).

### 4.2 — Correções pontuais no registro

- **Achado #35 / FASE-5.3 (curva do teto):** a coluna "dominância real de
  Bronze/Silver por título" — já corrigida uma vez na Fase 5.4 (1,6% →
  8,8% a teto=150, pelo denominador) — cai de novo pra **6,2%** com a
  brecha de elegibilidade fechada. A razão demanda/capacidade da mesma
  tabela segue válida (não muda com nenhuma das duas correções).
- **Curva de teto (FASE-5.4 §4):** era 17,5 / 7,5 / 8,8 (tetos 50/100/150)
  com a brecha. Pós-correção, teto 100 → **13,8%**, teto 150 → **6,2%**
  (teto 50 não re-medido — fora da faixa de decisão). **A monotonicidade
  se inverteu: teto mais baixo agora dá MAIS dominância real**, porque
  solta as duplas reais rank 100-150 (fortes) na base.
- **"Top 20 real em regime":** confirmado **~14/20** (era 18-20/20 pré-
  Fase-5.4). Não muda com a correção do item 1 (14/20 nas duas medições).
- **Fase 5.4 §2 (curva de demanda do topo):** **NÃO precisa de correção** —
  Gold 9,69×→9,61×, resto idêntico. A elegibilidade por dupla vs. por
  `athlete_a` quase nunca diverge.

---

## 5 — Validação

- Instrumentação temporária (`DIAG_ENTRY55`, `DIAG_LADDER_CUTS`,
  `DIAG_CEILING`) revertida integralmente — `grep` zero em
  `src/`/`scripts/`, `git diff` do harness vazio.
- `npx eslint . --quiet` — **exit 0**.
- `npm run build` — **OK** (`✓ built in 41.82s`; só o aviso de tamanho de
  chunk, pré-existente).
- Suíte (`rc-qa-suite-v36.mjs`, perfil `core`) — **33/36, score 92/100**.
  As 3 falhas (`test:rc-gameplay-balance`, `test:career-pace`,
  `test:ui-quality`) são pré-existentes e datadas (FASE-5.1 §3.1 /
  FASE-5.4 §5, idêntico a todas as fases da Fase 5); nenhuma regressão
  nova, e o único arquivo tocado (`WorldTourLifecycle.js`) não é
  mencionado por nenhuma das 3 falhas.
- `git status --short -- src-tauri/` — **vazio** (efeito contido na
  simulação de fundo).

### Mudança permanente

| Arquivo | Mudança |
|---|---|
| `WorldTourLifecycle.js` | item 1 — o `representative` passado pro `chooseTournament` carrega `pairEntryRank` (rank da dupla, média dos dois) em vez do rank do `athlete_a` sozinho; `barredFromOpen` na redistribuição garante que nenhuma dupla `pairEntryRank ≤ OPEN_TIER_CEILING` seja movida pra base |

Item 0 (teto): **150 mantido** — a comparação com o mundo corrigido (§2)
confirma; nenhuma mudança de código. Item 3 (escada): **proposta apenas,
nada aplicado.**

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Caminho de entrada dos reais em Bronze/Silver, nominal | ✅ **não é a redistribuição** (0 de 58 entrantes reais); brecha de elegibilidade — `chooseTournament` lia o rank do `athlete_a`, não da dupla; 6/7 títulos eram elenco real genuinamente fraco (rank 155-175), 1/7 era a brecha (Pineda #189 / Piotto #82). Corrigido (`pairEntryRank`); vazamento re-medido = **0**. Resíduo de 6,2% = cauda fraca do elenco real, sem teto que zere |
| 2 | Comparação 100 vs 150 com o mundo corrigido | ✅ **150 vence** — dominância real 6,2% (150) vs 13,8% (100); base 12,6× vs 13,2×; cancelamentos 0/0; reais ociosos e top-20 empatados no ruído. Teto 100 solta ~8 duplas reais rank 100-150 (fortes) na base. **A curva antiga (100 melhor) descrevia o mundo com a brecha** |
| 3 | Proposta da escada recalibrada, razão por tier antes/depois, sem aplicar | ✅ curva corrigida = a da Fase 5.4 (Gold 9,6× → Crown 1,4×); cortes sozinhos não achatam (drawSize zigue-zague, pool do Gold estrutural); **Candidato A medido** (só cortes: 9,6/4,7/3,7 → 5,1/2,8/2,6, Elite/Crown intactos); Candidato B modelado (+ draws menores → escada em ~2-5×). Nada aplicado |
| 4 | Achados #35 e "18/20" corrigidos no registro + nota de classe | ✅ #35 dominância 8,8% → 6,2%; curva de teto inverteu (100 > 150); top-20 confirmado ~14/20; **classe compartilhada com #33 (`tournaments_played`) documentada** — número publicado sobre mecanismo silenciosamente quebrado, agora 3ª instância (achado #37) |
| 5 | Suíte, lint, build, Tauri, commit | ✅ lint 0 · build OK · suíte 33/36 (92/100, mesmas 3 falhas pré-existentes) · `src-tauri/` vazio · commit em `feature/live-coach-dynamic-adaptation` |

### Resumo executivo

1. **Item 1 — de onde vêm os ~8%.** Não é a redistribuição da Fase 5.4
   (0 de 58 entrantes reais de Bronze/Silver vieram por ela). É uma
   brecha: `chooseTournament` testava o teto de acesso livre contra o
   rank de **um** atleta da dupla (o `athlete_a`, ordem arbitrária de
   criação da Partnership), não o da dupla. Uma dupla `[#82, #189]`
   passava pelo rank 189 e entrava na base com um top-82 dentro. **Só 1
   dos 7 títulos reais de base em regime era essa brecha** — os outros 6
   eram duplas reais com os *dois* membros rankeados 155-175, elegíveis
   pelo próprio critério do teto.
2. **Correção:** o `representative` do `chooseTournament` agora carrega
   `pairEntryRank` (média dos dois). Rede de segurança na redistribuição
   (`barredFromOpen`). Vazamento re-medido = **0**. O resíduo (6,2% de
   dominância real na base) é a cauda fraca genuína do elenco real —
   **nenhum teto na faixa utilizável zera isso**, porque o elenco de 100
   reais tem ~3 duplas de meio de tabela (rank 151-250) num mundo de
   1000.
3. **Item 2 — o teto.** A curva da Fase 5.4 (teto 100 melhor: 7,5% vs
   8,8%) descrevia o mundo com a brecha. Re-medido: **teto 150 → 6,2%,
   teto 100 → 13,8%** — a monotonicidade inverteu. Teto 100 solta as ~8
   duplas reais rank 100-150 (fortes, ovr 81-83) na base. Nos eixos
   secundários é empate. **150 se mantém.**
4. **Item 3 — a escada.** A curva de demanda do topo corrigida é
   idêntica à da Fase 5.4 (Gold 9,6× → Crown 1,4×) — a brecha não a
   afetava. Recalibrar os cortes sozinho **não achata** a razão: os
   drawSizes zigue-zagueiam (tier mais alto com chave maior) e o pool do
   Gold é estrutural (~330 pares, 1 porta de entrada). Candidato A
   medido (só cortes) traz Gold/Platinum/Masters de 9,6/4,7/3,7× pra
   5,1/2,8/2,6× e deixa Elite/Crown ralos; Candidato B (modelado)
   acrescenta chaves menores no topo e achata tudo em ~2-5×. **Proposta,
   nada aplicado.**
5. **Item 4 — o registro.** Terceira instância da mesma classe (após
   `tournaments_played` na Fase 5.1 e as chaves canceladas na 5.3/5.4):
   um número publicado enquanto um mecanismo do circuito fazia
   silenciosamente outra coisa. Todas as três correções *fortaleceram* a
   leitura qualitativa e *mudaram* um número que decidia um parâmetro.
6. Validação: ✅ lint 0 · build OK · suíte 33/36 (92/100, mesmas 3 falhas pré-existentes) · `src-tauri/` vazio · commit em `feature/live-coach-dynamic-adaptation`.
