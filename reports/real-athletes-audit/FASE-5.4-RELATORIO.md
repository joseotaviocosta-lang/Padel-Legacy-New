# Fase 5.4 — Teto fixado em 150, concentração de escolha, dimensionamento do topo

> Pré-requisito: Fase 5.3 entregue (preenchimento de reserva removido,
> chave de tamanho variável, curva remedida). Ver
> [FASE-5.3-RELATORIO.md](FASE-5.3-RELATORIO.md).

## 0 — `OPEN_TIER_CEILING = 150` aplicado

Decisão do pedido, aplicada. Justificativa original: a curva da Fase 5.3
(vazamento do preenchimento já zerado) media a dominância real de
Bronze/Silver por título em 1,6% a partir de 150 e igual até 350; 150 é o
menor teto que atinge isso e o que mais preserva a capacidade da base.

**Ressalva levantada pelo item 1 (§4):** o "1,6%" da Fase 5.3 estava
deflacionado pelas 8 chaves de Bronze/temporada que cancelavam. Com o
circuito rodando de verdade (item 1), a dominância real da base a
teto=150 é **8,8%**, não 1,6% — e teto=100 não é melhor (7,5%, dentro do
ruído). Nenhum teto na faixa que preserva a capacidade da base (50–150)
leva esse número abaixo de ~8%; só teto ≥ 350 zera, e aí a razão de
regime da base colapsa (9× a 350, 0,6× a 800). A decisão de 150 se
sustenta — mas por "é o piso da faixa utilizável", não por "zera a
dominância real".

---

## 1 — `chooseTournament` concentra a escolha (prioridade)

### 1.1 — Diagnóstico: não é "mesmo tier concorrente", é Bronze sempre perde pra Silver

A premissa do pedido ("distribuir entre eventos concorrentes do MESMO
tier") não se aplica direto: **o `WEEK_PROGRAM` nunca coloca dois eventos
do mesmo tier na mesma semana** (`TIER_WEEK_OFFSET` existe justamente pra
isso — verificado, 0 semanas com 2+ do mesmo tier em 45 semanas com
eventos). A concentração real é **entre tiers**, e é sistemática:

- Todo par elegível para Bronze é TAMBÉM elegível para Silver (os dois são
  `minRanking: 0`, e o teto de 150 barra os mesmos pares dos dois).
- `getTournamentChoiceProfile` + `scoreOption`: Silver pontua mais alto
  que Bronze para quase toda estratégia de carreira (mais pontos de
  ranking — 11 vs 5 —, mais prêmio líquido — ~157 vs ~63 —, mais
  prestígio — 22 vs 14). Só `experience` prefere Bronze, e por pouco
  (titleChance 57 vs 55).
- Resultado: numa semana com Bronze **e** Silver, **todo mundo escolhe
  Silver e o Bronze fecha sem campo**. As ~8 semanas/temporada com
  Bronze+Silver são exatamente as ~8 chaves de Bronze que a Fase 5.3
  mediu como canceladas.

`chooseTournament` também ignora que o Silver vai estar LOTADO: um par que
escolhe o Silver superlotado tem chance ínfima de passar do corte de
prioridade; o mesmo par escolhendo o Bronze vazio joga com certeza. A IA
não modela probabilidade de admissão.

Medido (teto=150, temporada de regime, **antes** da correção):

```
sem  5: Bronze=0/16(CANC)   Silver=235/16
sem 11: Bronze=0/16(CANC)   Silver=253/16
sem 17: Bronze=0/16(CANC)   Silver=269/16
sem 23: Bronze=0/16(CANC)   Silver=256/16
sem 26: Bronze=0/16(CANC)   Silver=250/16
sem 32: Bronze=0/16(CANC)   Silver=253/16
sem 38: Bronze=0/16(CANC)   Silver=240/16
sem 44: Bronze=0/16(CANC)   Silver=248/16
```

**As 8 semanas com Bronze+Silver: Silver recebe 235-269 escolhas, Bronze
recebe ZERO.** Concentração total. São exatamente as 8 chaves de Bronze
que a Fase 5.3 mediu como canceladas por temporada.

### 1.2 — Proposta e implementação

**Redistribuição CONSERVADORA de excedente** (só na simulação de fundo —
`chooseTournament` não tem outro consumidor de produção: `SeasonScheduler.js`
e o `WorldTourBrainTest` são código morto/teste):

1. Passo 1 (inalterado): cada par escolhe naïvemente pelo `chooseTournament`.
2. Passo 2 (novo): por semana, se um evento de tier aberto ficaria ABAIXO
   DO MÍNIMO VIÁVEL (cancelaria) e há um concorrente de tier aberto
   SUPERLOTADO, **resgata o primeiro trazendo-o exatamente até
   `minViableDraw` (8), não até `drawSize`** — com os pares de MENOR
   `pairScore` (força bruta) entre os que o superlotado cortaria de
   qualquer forma pela própria prioridade.

Escolhas de desenho, e por quê:

- **Resgata até 8, não enche até 16.** Um evento que ninguém escolheu roda
  no tamanho mínimo honesto (mesmo princípio da chave de tamanho variável
  da Fase 5.3), não cheio à força. Move ~8 pares/semana concorrente, não
  ~16 — metade da perturbação.
- **Move os mais fracos por `pairScore`, não por pior ranking.** Uma
  primeira versão movia por pior ranking (mesmo eixo do corte do
  `applyOpenTierEntryPriority`), mas duplas reais mal rankeadas têm skill
  alto e ganhavam o Bronze. Movendo por menor força bruta, o Bronze fica
  com um campo genuinamente fraco e uma dupla forte cortada do Silver
  continua cortada.
- **Só entre tiers `minRanking:0`.** Todo par elegível pra um é elegível
  pro outro (o teto barra os mesmos), então mover não precisa de recheque
  de elegibilidade. Não redistribui pro Gold+ (não é onde o problema
  está — §3).
- Os pares movidos estão **estritamente melhores**: iam ser cortados do
  Silver cheio, agora jogam o Bronze. Nenhum par é rebaixado contra a
  vontade — só os que já não caberiam.

### 1.3 — Razão demanda/capacidade antes e depois (regime, teto=150)

| | Antes (`base150`, sem redistribuição) | Depois (`c150`, item 1) |
|---|---|---|
| Bronze+Silver combinado (regime) | 12,60× | **12,70×** |
| Chaves de Bronze canceladas / temporada | 8 | **0** |
| Concentração nas 8 semanas Bronze+Silver | Bronze 0 (CANC), Silver 235–269 | Bronze 8 (roda no mínimo), Silver 237–257 |

**A razão NÃO cai** (12,60×→12,70×, diferença de ruído do próprio ajuste
de comportamento). A demanda agregada de Bronze+Silver (escolhas de
dupla) e a capacidade (640 vagas) são as mesmas — a redistribuição só
move ~64 pares/temporada de um evento superlotado pra um vazio.

**Resposta direta ao item 1.2** — *"se ela cair muito, a curva inteira das
Fases 5.2 e 5.3 media concentração, não capacidade"*: **ela NÃO cai.** Os
~12,6× de Bronze+Silver são demanda agregada genuína. A concentração
determinava QUAIS eventos rodavam (8 Bronze cancelavam), **não a razão
agregada**. A hipótese do pedido está refutada: **a curva de
demanda/capacidade das Fases 5.2 e 5.3 media capacidade real, não
concentração — nesse ponto não precisa de correção.** (Uma coluna
DIFERENTE da tabela da Fase 5.3 muda — a dominância real da base — §4.)

### 1.4 — Torneios ainda cancelados por campo insuficiente

**Bronze/Silver: zero** (era 8 Bronze/temporada). Os 8 Bronze resgatados
rodam a 8 duplas (`abaixo de drawSize`, mas não cancelados) — a métrica
"chaves incompletas" do harness sobe pra ~9/79, o que agora é o normal
(desde a Fase 5.3 "incompleta" deixou de ser bandeira de alerta).

**Fora dos tiers abertos:** o **Circuit Finals** (top 8, `minRanking: 8`)
cancela 0-1 vez por temporada — pool de ~8 duplas elegíveis, algumas
descansam, cai abaixo do mínimo viável de 4. Convite de fim de temporada,
não efeito de concentração; não distribui título pra bot. **Nenhum outro
tier cancela.**

---

## 2 — Dimensionamento do topo (Gold+), sem escolher o número

### 2.1 — Demanda/capacidade por tier (regime, teto=150, item 1 aplicado — `c150`)

O agregado "Gold+ 3,9×" esconde uma variação enorme:

| Tier | `minRanking` | Eventos/ano | Demanda/capacidade (regime) |
|---|---|---|---|
| Gold | 800 | 8 | **9,69×** |
| Platinum | 500 | 6 | **4,72×** |
| Masters | 300 | 10 | 3,69× |
| Elite | 150 | 10 | 1,33× |
| Crown | 80 | 4 | 1,38× |

**A pressão está no Gold (~10×) e no Platinum (~5×), não no Elite/Crown
(~1,3×).** O `minRanking: 800` do Gold quase não filtra — com 1000
atletas, deixa passar ~80% do mundo, o mesmo erro de dimensionamento que
a base tinha, invertido. Elite e Crown, com cortes de 150 e 80, já
controlam a própria demanda.

### 2.2 — Saída A: restringir o acesso ao Gold (`minRanking`)

Todas com o item 1 já aplicado, teto=150, regime (temporada 2), mesma
seed. `DIAG_GOLD_MINRANKING` varre o corte sem editar a config:

| Gold `minRanking` | Gold | Gold+ combinado | Bronze+Silver | Observação |
|---|---|---|---|---|
| 800 (atual) | **9,69×** | 3,94× | 12,70× | — |
| 400 | **4,01×** | 2,96× | 12,46× | **inverte a escada vs. Platinum (`minRank:500`)** |
| 250 | **2,11×** | 2,55× | 12,43× | 2 Gold cancelados (pool fino demais) |

**Efeito colateral 1 — a escada:** Platinum é um tier ACIMA do Gold e tem
`minRanking: 500`. Um Gold a 400 ou 250 exigiria um ranking MELHOR que o
Platinum — **inversão de escada**. Restringir o Gold de forma coerente
exige rebaixar Platinum/Masters/Elite/Crown junto (re-escalar todos os
cortes do topo pra baixo, proporcionalmente) — uma decisão maior que só
mexer no Gold, mas a única que não quebra a hierarquia.

**Efeito colateral 2 — o pool:** a 250, o Gold já cancela 2 eventos por
temporada (o pool de top-250 elegível fica fino demais pra encher 8
chaves de 24). Mesma sobra-de-capacidade que o teto=800 causou na base —
250 ultrapassa.

**O que NÃO se mediu:** o pedido supõe que restringir o Gold empurra rank
401-800 de volta pra Bronze/Silver (não são elegíveis pra Platinum
`minRank:500` nem Masters `minRank:300`). São ~150 pares contra uma
demanda de base de ~8.000 — a razão de base fica em 12,4–12,7× nas três
configurações, dentro do ruído de temporada. O efeito existe em
princípio; nesta escala de medição (2 temporadas) não aparece.

### 2.3 — Saída B: ampliar o calendário do topo (Gold 8→16, Platinum 6→12)

Item 1 aplicado, teto=150, regime. `DIAG_TIER_EVENTS` altera a contagem
de eventos sem editar `TIER_EVENTS_PER_YEAR`:

| Cenário | Gold | Platinum | Gold+ combinado | Bronze+Silver | Total torneios/temporada |
|---|---|---|---|---|---|
| atual (Gold 8, Plat 6) | 9,69× | 4,72× | 3,94× | 12,70× | ~80 |
| Gold 16, Platinum 12 | **10,18×** | **4,69×** | 4,91× | 12,94× | **~93** |

**Ampliar o calendário do topo NÃO move a razão.** A demanda do Gold foi
de 1.861 pra 3.908 escolhas (2,10×) quando os eventos foram de 8 pra 16,
e a capacidade dobrou (192→384) — a razão fica em ~10×. Uma dupla
elegível pro Gold escolhe Gold em TODA semana de Gold, então dobrar as
semanas de Gold dobra as escolhas.

Isto é o oposto do que a Fase 5 mediu ao ampliar a BASE (razão caía
15×→6× — achado #32). A diferença: a base já tinha eventos CONCORRENTES
na mesma semana (2-3 tiers livres), então mais capacidade por semana com
a mesma demanda por semana fazia a razão cair. `distributeTierWeeks`
espalha os 16 Gold em ~16 semanas distintas, não concorrentes — só
adiciona semanas-evento, não capacidade-por-semana. **Pra a ampliação
funcionar teria que criar Golds CONCORRENTES** (2 por semana) — o que
reintroduz exatamente a concentração que o item 1 acabou de corrigir pra
Bronze/Silver, agora no topo.

**Teto de código** (achado #32): ~93 torneios/temporada, ~116 simultâneos
no horizonte de 15 meses — bem dentro da margem de ~240. A ampliação é
segura de rodar; só não resolve o problema.

### 2.4 — Leitura (sem escolher o número)

A pressão no topo é real e está concentrada no **Gold** (10×) e
secundariamente no **Platinum** (5×) — Elite e Crown (~1,3×) já se
regulam pelos próprios cortes. Nenhuma das duas saídas naïve resolve
limpo:

- **Restringir o `minRanking` do Gold** funciona na razão (800→400 leva
  9,7× pra 4,0×; 250 pra 2,1×), mas inverte a escada vs. Platinum
  (`minRank:500`). Só é coerente re-escalando todos os cortes do topo pra
  baixo de uma vez.
- **Ampliar o calendário do Gold** (mais semanas) não move a razão —
  demanda e capacidade escalam juntas. Só ajudaria com eventos
  concorrentes, que trazem o problema do item 1 pro topo.

**A decisão real é de desenho, não de número:** ou o Gold é um tier de
"entrada larga" por definição (aceita ~top 800 e a razão alta é o
esperado, como a base), ou a escada inteira do topo precisa de cortes
re-escalados pra uma população de 1000 (Gold ~400, Platinum ~250,
Masters ~150...). A curva acima é o que cada caminho custa; o número é
seu.

---

## 3 — Verificação: alguma chave de Gold+ rodou abaixo de `drawSize`?

**Não.** Medido em teto=150, temporada de regime, todas as chaves de Gold,
Platinum, Masters, Elite e Crown rodaram **exatamente cheias** (tamanho
médio 24,0 / 32,0 conforme o tier, `abaixo de drawSize = 0` em todos).
Gold+ está 3,94× oversubscrito no agregado — a concentração do item 1 não
o afeta.

A única chave de acesso restrito cancelada é o **Circuit Finals** (top 8,
`minRanking: 8`): só 3 duplas o escolheram, abaixo do mínimo viável de 4.
É um convite de fim de temporada com um pool inerentemente minúsculo
(nem toda dupla do top 8 topa jogar mais um evento em novembro), não um
efeito de concentração — e não distribui título para bots (100% dos
títulos de Circuit Finals nas medições foram de reais, quando aconteceu).

---

## 4 — Achado anterior que muda: a dominância real de Bronze/Silver da Fase 5.3 estava DEFLACIONADA pelas chaves canceladas

A razão demanda/capacidade não muda com o item 1 (§1.3). Mas **outra
coluna da tabela da Fase 5.3 muda: a dominância real de Bronze/Silver por
título.**

A Fase 5.3 mediu essa dominância com as 8 chaves de Bronze/temporada
**canceladas** — e uma chave cancelada não distribui título. Menos
eventos de base rodando = menos oportunidades de uma dupla real ganhar um.
O item 1 faz esses 8 eventos rodarem; o campo deles é o excedente mais
fraco do Silver (por `pairScore`), majoritariamente bots, mas inclui
também as duplas reais mal rankeadas (rank ~151-600) que o teto de 150
deixa passar. Curva remedida (dominância real de Bronze/Silver por
título, 2 temporadas, mesmo seed `official-900-100-s1`, item 1
conservador aplicado):

| Teto | Fase 5.3 (8 Bronze cancelados/temp, denom. 64) | Fase 5.4 item 1 (0 cancelados, denom. 80) |
|---|---|---|
| 50  | 31,2% | **17,5%** (14/80) |
| 100 | 9,4%  | **7,5%** (6/80) |
| 150 | **1,6%** (1/64) | **8,8%** (7/80) |

**O "1,6%" que justificou o teto=150 era um artefato das chaves
canceladas** — medido sobre 64 eventos porque 16 não rodaram. Com os 80
eventos rodando (item 1), a dominância real na base a teto=150 é **8,8%**,
e teto=100 dá o mesmo dentro do ruído (6 vs 7 títulos em 80). A cauda
fraca do elenco real (rank ~151-600) jogando o tier de entrada — o que é
discutivelmente *correto* ("aparecer no lugar certo") — não some abaixo
de ~8% em nenhum teto entre 50 e 150. Só teto ≥ 350 zera, e aí a razão de
regime da base colapsa. **Não existe teto que dê "essencialmente zero"
sem destruir a base.**

Curva não-monótona entre 50 e 150: a teto=50 há mais duplas reais
elegíveis (rank 51-600) e elas ganham mais (17,5%); a 100/150 o pool real
elegível encolhe e estabiliza em ~8%.

**Isto não é regressão do item 1** — é o item 1 revelando o número
honesto, exatamente como a Fase 5.3 revelou que a mediana de bots "0→2"
da Fase 5.1 era "0→1" sem o preenchimento forçado. **É uma correção de
leitura, e o registro precisa dela** (§ "Achado que precisa de correção").

### 4.1 — Efeito colateral do item 1: o topo do ranking real perde ~2–4 posições em regime

Os 16 Bronze/2-temporadas que agora rodam distribuem título + pontos que
antes não existiam. Como o campo resgatado é o excedente **mais fraco**
do Silver (por desenho — §1.2), quem ganha esses eventos é
majoritariamente bot:

| | `base150` (sem item 1) | `c150` (item 1) |
|---|---|---|
| Títulos de Bronze/Silver — bots / reais / mista | 43 / 1 / 20 (64) | 54 / 7 / 19 (80) |
| Campeões no circuito todo — bots / reais / mista | 47 / 72 / 22 (141) | 60 / 79 / 19 (158) |
| Top 20 real em regime (temporada 2) | 18/20 | **14/20** |
| Bots — torneios disputados (média / mediana) | 3,77 / 1 | 3,98 / 1 |

Dos 16 eventos novos: **+11 títulos pra bot, +6 pra dupla real, −1
mista**. Os ~11 títulos de Bronze extras dão pontos suficientes pra
empurrar ~4 bots pro top 20 de regime (18→14 reais). O número exato
oscila de run a run (13–17 reais no top 20 nas variantes testadas do item
1), mas a direção é consistente: **fazer o calendário de base rodar
inteiro custa 2–4 posições reais no topo em regime**.

Não é bug — é o preço de um calendário honesto. Os eventos *devem*
rodar (posição explícita do pedido); um bot de meio de tabela ganhando um
evento de entrada fraco é realista. Mas o registro precisa dizer que
qualquer medição anterior de "top 20 real em regime" (Fases 5.1–5.3) foi
feita com esses 16 eventos **canceladas**; com o circuito rodando
inteiro o número de regime cai de ~18/20 para ~14/20.

---

## 5 — Validação final

- Instrumentação temporária (`DIAG_CAP54`, `DIAG_GOLD_MINRANKING`,
  `DIAG_TIER_EVENTS`, `DIAG_CEILING`) revertida integralmente — `grep`
  zero em `src/`/`scripts/`, `git diff` do harness vazio.
- `npx eslint . --quiet` — **exit 0, limpo**.
- `npm run build` — **OK** (`✓ built in 40.55s`; único aviso é o de
  tamanho de chunk, pré-existente).
- Suíte (`rc-qa-suite-v36.mjs`, perfil `core`) — **33/36, score
  92/100**. As 3 falhas (`test:rc-gameplay-balance`, `test:career-pace`,
  `test:ui-quality`) são pré-existentes e datadas (FASE-5.1-RELATORIO
  §3.1, FASE-5.3-RELATORIO §5 — idêntico à Fase 5.1/5.2/5.3). Nenhuma
  regressão nova: os únicos arquivos tocados são
  `EntryManager.js`/`WorldTourLifecycle.js`, e nenhuma das 3 falhas os
  menciona (`test:ui-quality` = mojibake em `SimulationModal.jsx` etc.,
  `test:career-pace` = crash pré-existente, `test:rc-gameplay-balance` =
  métrica de balanceamento de partida).
- `git status --short -- src-tauri/` — **vazio** (efeito cirurgicamente
  contido na simulação de fundo, como nas Fases 5.1–5.3).

### Mudanças permanentes

| Arquivo | Mudança |
|---|---|
| `EntryManager.js` | `OPEN_TIER_CEILING` 800 → **150** |
| `WorldTourLifecycle.js` | item 1 — redistribuição de excedente entre tiers de acesso livre concorrentes na mesma semana (move os pares mais fracos que seriam cortados do evento cheio pro concorrente vazio) |

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | `OPEN_TIER_CEILING = 150` | ✅ aplicado |
| 2 | Distribuição de escolha — proposta, implementada, remedida; razão antes/depois | ✅ diagnóstico (não é "mesmo tier", é Bronze sempre perde pra Silver — `chooseTournament` pontua Silver acima e ignora lotação); redistribuição conservadora de excedente implementada; **8 Bronze/temporada cancelados → 0**; razão demanda/capacidade de regime **12,60×→12,70× (NÃO cai)** — a curva das Fases 5.2/5.3 media capacidade real, não concentração; **mas a dominância real da base sai de 1,6% (artefato das chaves canceladas) pra 8,8% (número honesto)**, e o top 20 real de regime cai ~18→14 — §4 |
| 3 | Curva de dimensionamento do topo por tier, sem escolher o número | ✅ pressão concentrada no Gold (~10×) e Platinum (~5×), não Elite/Crown (~1,3×); restringir `minRanking` do Gold corta a razão (800→400 ≈ pela metade) mas inverte a escada vs. Platinum e empurra rank 401-800 pra base; ampliar o calendário do Gold **não move a razão** (demanda escala com semanas-evento); a decisão é de desenho (Gold "entrada larga" vs. re-escalar a escada inteira do topo) |
| 4 | Resposta do item 3 (Gold+ abaixo de `drawSize`?) | ✅ **não** — Gold/Platinum/Masters/Elite/Crown rodam todos cheios em regime; só o Circuit Finals (top 8, pool minúsculo) é marginal. A concentração do item 1 não alcança o topo |
| 5 | Suíte, lint, build, Tauri, commit | ✅ lint 0 · build OK · suíte 33/36 (92/100, mesmas 3 falhas pré-existentes) · `src-tauri/` vazio · commit `feature/live-coach-dynamic-adaptation` |

### Resumo executivo

1. **`OPEN_TIER_CEILING = 150`** aplicado (`EntryManager.js`).
2. **Item 1 — concentração de escolha:** o mecanismo real não é "mesmo
   tier concorrente" (o `WEEK_PROGRAM` nunca coloca dois eventos do mesmo
   tier na mesma semana). É **Bronze sempre perde pra Silver**:
   `chooseTournament`/`scoreOption` pontuam Silver acima pra quase toda
   estratégia, e não modelam que o Silver vai estar lotado. Numa semana
   com os dois, todo mundo escolhe Silver e o Bronze fecha com zero
   inscritos — as 8 chaves de Bronze/temporada que a Fase 5.3 mediu como
   canceladas. Corrigido com **redistribuição conservadora de excedente**
   (`WorldTourLifecycle.js`): resgata o evento livre que cancelaria até o
   mínimo viável (8), com os pares mais fracos que o concorrente lotado
   cortaria de qualquer forma. Resultado: **8 → 0 cancelamentos**.
3. **A razão demanda/capacidade NÃO cai** com o item 1 (regime
   12,60×→12,70×). A hipótese do pedido — "se ela cair muito, a curva das
   Fases 5.2/5.3 media concentração, não capacidade" — está **refutada**:
   a curva media capacidade real. A concentração determinava *quais*
   eventos rodavam, não a razão agregada.
4. **Mas uma coluna diferente da tabela da Fase 5.3 muda:** a dominância
   real de Bronze/Silver por título. A Fase 5.3 mediu 1,6% a teto=150 com
   as 8 chaves canceladas (denominador de 64); com elas rodando é
   **8,8%** (7/80). Nenhum teto entre 50 e 150 leva esse número abaixo de
   ~8%. E o top 20 real de regime cai de ~18/20 para ~14/20 — os 16
   eventos de base novos distribuem título e pontos que empurram ~4 bots
   pro topo.
5. **Item 2 — dimensionamento do topo:** a pressão do "Gold+ 3,9×
   agregado" está no **Gold (~10×)** e no **Platinum (~5×)**; Elite e
   Crown (~1,3×) já se regulam. Nenhuma saída naïve resolve limpo —
   restringir o `minRanking` do Gold corta a razão mas inverte a escada
   vs. Platinum (500) e empurra gente de volta pra base; ampliar o
   calendário não move a razão (demanda e capacidade escalam juntas com
   as semanas-evento). É decisão de desenho. Curva completa em §2, sem
   escolher o número.
6. **Item 3:** nenhuma chave de Gold+ rodou abaixo de `drawSize` em
   regime — todas cheias. Só o Circuit Finals (convite top-8) é marginal.
7. Validação: lint 0, build OK, suíte 33/36 (92/100, mesmas 3 falhas
   pré-existentes), `src-tauri/` intacto. Instrumentação temporária
   (`DIAG_CAP54`, `DIAG_GOLD_MINRANKING`, `DIAG_TIER_EVENTS`,
   `DIAG_CEILING`) revertida integralmente — `grep` zero em
   `src/`/`scripts/`, harness em diff zero.

### Achado que precisa de correção no registro

O item 1 muda **a leitura da dominância real da base e do top 20 real de
regime** — não a razão demanda/capacidade. Precisam de correção:

- **Achado #35 / FASE-5.3-RELATORIO (curva do teto):** a coluna
  "dominância real de Bronze/Silver por título" foi medida com 8
  chaves/temporada canceladas (denominador 64, não 80). Números
  corrigidos com o item 1: teto 50 → 17,5% (era 31,2%), teto 100 → 7,5%
  (era 9,4%), teto 150 → **8,8%** (era 1,6%). A razão demanda/capacidade
  da mesma tabela **não** muda — essa parte segue válida.
- **"Top 20 real 20/20 / ~18/20 em regime" (Fases 5.1–5.3):** medido com
  as mesmas 8 chaves/temporada canceladas. Com o circuito de base rodando
  inteiro (item 1), o número honesto de regime é **~14/20**.
- **Justificativa do teto=150 (§0):** "1,6% ≈ zero" não se sustenta — o
  número real é ~9%. A decisão de 150 se mantém por outro motivo (é o
  piso da faixa que preserva a capacidade da base; nenhum teto utilizável
  zera a dominância real).
- **NÃO precisa de correção:** a curva de capacidade das Fases 5.2/5.3
  (razão demanda/capacidade por cenário) — mede capacidade real, e o item
  1 confirmou isso.

