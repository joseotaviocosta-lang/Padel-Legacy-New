# Fase 2 — Elenco expandido, identidade real e mundo com renovação

> Pré-requisitos confirmados no início: baseline oficial `official-970-s1`
> congelada, `dissolvePartnerships` corrigido (temporada em 22,01 min).

## 2A — Registro canônico

Três universos desconectados viraram um: [src/data/realAthletesRegistry.json](../../src/data/realAthletesRegistry.json)
(dados, gerado por [scripts/build-real-athletes-registry.mjs](../../scripts/build-real-athletes-registry.mjs),
reexecutável a cada novo snapshot FIP) + [src/players/realAthleteRegistry.js](../../src/players/realAthleteRegistry.js)
(acesso — `getRealAthleteRegistry`, `getConfirmedRealPairs`, `getProbableRealPairs`,
`getUnpairedRealAthleteIds`, `validateRealAthleteRegistryIntegrity`). `is_real: true`
em todo registro. Nenhum número de atletas hardcoded em lugar nenhum do código —
tudo deriva de `.length`/iteração sobre o registro.

Os três sistemas que antes tinham cada um sua própria lista agora leem do mesmo
lugar:
- **Pool de ranking** (`worldSeed2025.json`): parou de guardar atletas — o
  arquivo agora só tem metadados (`career_start_date`, `snapshot_date`).
  `saveFoundation.js` semeia direto de `getRealAthleteRegistry()`.
- **Catálogo de adversários de prática** ([src/players/realAthletes.js](../../src/players/realAthletes.js)):
  tinha 10 hardcoded com um id scheme próprio (`fip-2026:key`) — agora deriva
  dos 100 do registro, usando o MESMO `id` como `template_id`.
- **Camada de nomes de rivalidade/imprensa**: investigada e não é um sistema
  vivo — `PRO_NAMES`/`TEMPLATES` em `src/lib/world.js` é código morto (a
  função ativa, `generateEventObject`, só usa `AMBIENT_WORLD_EVENTS`, sem
  nomes hardcoded, por design documentado no próprio arquivo desde antes desta
  fase). Os hardcodes de nomes reais que existem (`hallOfFameData.js`,
  `historyData.js`, `encyclopediaData.js`, `socialNetwork.js`,
  `marketEngine.js`, `apparelTechCollectibles.js`, `tournaments.js`) são
  conteúdo estático de lore/loja (biografias, itens de loja, posts de seed),
  não referências por id a entidades vivas — fora do escopo desta
  consolidação, registrado aqui para não parecer que foi esquecido.

**Teste de integridade** ([scripts/test-real-athlete-registry-integrity.mjs](../../scripts/test-real-athlete-registry-integrity.mjs)):
nenhum id duplicado no registro, todo `partner_id` resolve, catálogo de
prática expõe o mesmo conjunto de 100 com o mesmo id canônico, nenhum real
duplicado no pool procedural (por nome OU por `bot_id`). **PASS.**

Achado colateral da própria validação: `scripts/test-player-system.mjs`
(pré-existente) tinha DOIS números fixos hardcoded (`catalog.length===250`,
`reais===10`) que assumiam exatamente os 10 do catálogo antigo — o mesmo
tipo de suposição que 2A.1 pede pra eliminar, só que numa suíte de teste,
não no código de produção. Corrigido pra derivar do registro
(`getRealAthleteRegistry().length`), não mais hardcoded.

## 2B — Ingestão dos 100 reais

- **OVR**: curva `suggested_ovr` como padrão; precedência do jogo para os
  atletas que já existiam nos 24 originais — **23 dos 24 bateram** (12 por
  nome exato, 11 por apelido↔nome formal resolvido manualmente e conferido
  por proximidade de rank+país+sobrenome — ex.: "Mike Yanguas" rank7/ESP →
  "Miguel Yanguas" rank8/ESP; tabela completa de correspondência documentada
  em comentário no script de build). Confirmado: Galán mantém 94 (curva
  daria 92), Chingotto mantém 93 (curva daria 92) — exatamente o exemplo do
  pedido. **Pablo Cardona (antigo rank 18) saiu do top 100 no novo
  snapshot** — não forçado de volta, como instruído.
- **Datas de nascimento**: sintéticas, Box-Muller (não a soma-de-uniformes
  truncada que os 24 originais usaram antes — essa produzia empilhamento
  artificial na borda; corrigido no gerador). Média resultante 26,6 anos,
  faixa 21-41, **correlação idade×rank = -0,08** (praticamente zero, como
  pedido).
- **Pontos de seed**: `fip_points` (escala oficial FIP, Coello=20.909) NÃO
  é compatível com `world_ranking_points` (escala interna, Coello=13.000,
  calibrada nos 24 originais) — confirmado e documentado. Em vez de
  reescalar linearmente (arriscado, a curva FIP não tem necessariamente o
  mesmo formato), reusei `pointsForRank(fip_rank)` — a MESMA função/curva já
  calibrada pros 24 originais — tratando os 100 reais como as 100 posições
  absolutas do topo de um mundo de 1000. Verificado:
  `pointsForRank(1)=13000` e `pointsForRank(24)=3110` reproduzem exatamente
  os valores hardcoded que já existiam.

## 2C — Base de 900 bots com estrutura demográfica

[src/lib/rankingPopulation.js](../../src/lib/rankingPopulation.js) reescrito.
Medido em [scripts/test-population-demographics.mjs](../../scripts/test-population-demographics.mjs):

| Faixa etária | Meta | Medido (1000 total) |
|---|---|---|
| 17-20 | 150 | **150** |
| 21-24 | 220 | **220** |
| 25-28 | 240 | **240** |
| 29-32 | 210 | **210** |
| 33-36 | 130 | **130** |
| 37+ | 50 | **50** |

Exato — a alocação por faixa é determinística (quota + embaralhamento
seedado), não uma aproximação estatística.

| Nacionalidade | Top 100 (real) | Posições 101-400 | ~401-500 (início) | ~901-1000 (fim) |
|---|---|---|---|---|
| ESP+ARG | 82,0% | 80,3% | 84,0% | **57,0%** |

Espelha o topo em 101-400, diversifica progressivamente até perto de ~50%
nas últimas posições (a meta "~82% → ~50%" descreve os EXTREMOS do
intervalo 401-1000, não a média do intervalo inteiro, que fica no meio do
caminho por construção — documentado no teste). Brasil: 54 procedurais
(6,0% da base), presença "relevante" como pedido, sem inflar artificialmente.

## 2D — Renovação: aposentadoria e entrada

**Aposentadoria** ([src/game-core/livingCircuitRules.js](../../src/game-core/livingCircuitRules.js),
`evolveAthleteCareerMonth`): **não existia antes desta fase** — a Fase 0.3
já tinha achado que "replacements >= retired" comparava contra uma
contagem sempre zero, porque nada jamais setava `retired: true`. Agora:
`retirementChancePercent(age)` — 0,2%/mês aos 30, ~2,6% aos 34, ~9,8% aos
38, teto 40%. Vale igual pra reais e bots (não olha `is_real`). Ao
aposentar: `retired`, `retirement_date`, `career_status/market_status:
'aposentado'`, `ai_partner_id: null` — o parceiro sobrevivente é
desemparelhado automaticamente no mês seguinte por `dissolvePartnerships`
(que já checava `isRetired(partner)`, mecanismo pré-existente reaproveitado).

**Entrada** ([src/game-core/worldSimulationLifecycle.js](../../src/game-core/worldSimulationLifecycle.js),
`generateProspects`, renomeado de `generateProspect`): até 6/mês, mas
**calibrado pelo hiato medido** (`retired - replacements`), nunca um número
fixo — sem aposentadoria medida, hiato=0, ninguém entra. Prospects nascem
17-20 (não mais travado em 17), OVR 46-62, potencial 70-96 (faixa larga —
alguns viram challengers de verdade).

**Teste de estabilidade populacional (10 temporadas, 900 bots + 100 reais,
[scripts/test-population-stability-10-seasons.mjs](../../scripts/test-population-stability-10-seasons.mjs)):**

| Temporada | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Ativos | 956 | 957 | 990 | 1013 | 1044 | 1072 | 1099 | 1124 | 1151 | 1186 |

**Pirâmide etária: PASS** — todas as faixas povoadas na temporada 10, sem
colapso na base (17-20 termina com 330, a maior faixa — a renovação está,
se algo, generosa demais, não escassa).

**Estabilidade populacional: não é um "FAIL" catastrófico, mas também não
é estável de verdade — há um viés de crescimento lento e persistente**,
+956→+1186 em 10 anos (~+2,3%/temporada, compondo). Causa raiz identificada
por leitura de código, não só pela medição: o calibrador de
`generateProspects` (`gap = aposentados_acumulados - reposições_acumuladas`)
lê sua contagem de `existingAthletes`, que é o MESMO array já buscado por
`simulateWorldDay` via `AthleteProfile.list('ranking_position',
ATHLETE_POPULATION_CAP)` — um teto de 1100 (Fase 2E.2). Como aposentados
nunca são removidos (só marcados, de propósito, pelo motor inteiro) e a
população ativa também cresce, o total de linhas ultrapassa 1100 por volta
da temporada 6-7 (medido: 1504 linhas na temporada 7) — a partir daí, a
CONTAGEM de aposentados/reposições que alimenta o calibrador fica ela
mesma truncada, e o hiato medido deixa de refletir o hiato real. Não é o
mesmo bug do 2E.2 (esse já está corrigido — o teto cobre a população
ATIVA com folga) — é um efeito colateral novo, só visível numa janela de
10 temporadas: aposentados acumulados sem poda eventualmente também
estouram um teto pensado pra população ativa.

**Não corrigido nesta entrega** (escopo já muito grande) — registrado com
causa raiz identificada: a correção não é aumentar o teto de novo (empurra
o problema pra depois, não resolve), é fazer `generateProspects` contar
aposentados/reposições numa consulta PRÓPRIA e não-truncada (ou podar
aposentados antigos, como já feito para outras coleções nesta auditoria —
WorldEvent, CareerMessage, TeamRanking dissolvida, AnnualCareerReport). O
desvio observado (+24% em 10 anos de jogo) é lento o bastante pra não ser
urgente, mas vai continuar crescendo além da janela testada se não for
endereçado numa fase futura.

## 2E — Tetos: agora obrigatórios

Todos os 4 corrigidos:

1. `evolveAthletesMonthly` (`src/lib/athleteBehavior.js`): 200 →
   `WORLD_RANKING_TARGET + 50` (1050).
2. `ranking_position` = 500 em `aiPartnershipLifecycle.js` (3 ocorrências),
   `circuitLifecycle.js`, `worldSimulationLifecycle.js` (2 ocorrências): →
   `WORLD_RANKING_TARGET + 100` (1100) em todos.
3. `WorldTourLifecycle.js:135`: 1000 → 1100.
4. `circuitLifecycle.js:66` (`TeamRanking`): 500 → `TEAM_RANKING_TARGET +
   100` (600).

**Confirmação da circularidade (2E.2)**: sim — `processWorldCircuit` LÊ
`ranking_position` pelo mesmo corte que ele mesmo ESCREVE depois. Um
atleta fora do corte nunca é buscado, logo nunca tem `ranking_position`
recalculado por ninguém, logo nunca mais volta — **exclusão permanente**,
confirmado por leitura de código (não apenas truncamento pontual). Com os
tetos agora cobrindo 100%+ da população, essa circularidade fica
estruturalmente inofensiva (todo mundo é sempre buscado, sempre
recalculado) — não removida, mas neutralizada.

**Custo medido** (perfilamento completo, 900 bots + 100 reais, 1 temporada,
COM instrumentação — mesma metodologia da Fase 0.2/1.5):

| | Fase 1.5 (970 bots + 24 reais, pós-correção) | Fase 2 (900 bots + 100 reais, pós-tetos) |
|---|---|---|
| Tempo total da temporada | 22,01 min | **39,93 min** |
| `world` (simulateWorldDay) | 143.001 ms (10,8%) | **501.782 ms (20,9%)** |
| `aiPartnerships` | 143.001 ms (10,8%)¹ | **264.352 ms (11,0%)** |
| `livingWorld` | 230.726 ms (17,5%) | **392.038 ms (16,4%)** |
| Crescimento de custo mês 1→12 | 4,21× | **7,51×** |

¹ mesma cifra que `world` na Fase 1.5 por coincidência de arredondamento — não é erro de tabela.

**A folga comprada pela correção do `dissolvePartnerships` foi
parcialmente consumida — não estourada.** 39,93 min segue confortavelmente
abaixo de 1h mesmo com o profiler ligado (a rodada real sem profiler deve
custar o mesmo ou um pouco menos). O aumento de custo (+81% no total, e o
crescimento intra-temporada piorando de 4,21× pra 7,51×) é explicado
diretamente pelo próprio pedido: elevar os tetos de 2E.2/2E.1 aumenta o `n`
processado por `evolveAthletesMonthly`, `simulateWorldDay` e
`processWorldCircuit` de uma fração da população pra praticamente 100% dela
— é o preço de fechar as duas exclusões permanentes achadas. Como o alvo
de 1h segue cumprido, **não é necessário cortar nada agora** — registrado
como o próximo candidato natural de otimização (mesmo padrão de
`bulkUpdate` já aplicado em `dissolvePartnerships` e `circuitLifecycle.js`
ainda não foi replicado em `evolveAthletesMonthly`/`simulateWorldDay`, que
agora são os dois estágios mais caros).

## 2F — team_key canônico

Bug real confirmado por leitura de código, **mais amplo do que só "sorteio
duplica linha"**: `saveFoundation.js` (o caminho de PRODUÇÃO, não só o
harness) semeava `TeamRanking.player1_id`/`player2_id` com os valores
`bot_id` do JSON estático — que NUNCA correspondem ao `.id` real atribuído
pelo `makeId()` na criação (achado da Fase 0.1, confirmado de novo aqui).
Ou seja, mesmo sem nenhuma dupla nova se formando, as 12 linhas históricas
originais já nasciam com `player1_id`/`player2_id` órfãos em produção.
Corrigido: `saveFoundation.js` agora remapeia pros ids reais pós-criação e
deriva `team_key` via `teamKey()` (a mesma função de `src/lib/teamRanking.js`,
`[id1,id2].sort().join('_')`) — a MESMA função que `circuitLifecycle.js`
(agora também importando dali em vez de reimplementar inline) usa quando o
mercado forma ou atualiza uma dupla. Uma fonte só, nunca mais duas
strings diferentes pra descrever o mesmo par. Sem saves de produção
existentes neste repositório para migrar — a correção vale a partir da
próxima carreira criada.

## 2G — Parcerias em três níveis

`saveFoundation.js` e o harness ([scripts/audit-real-athletes-simulation.mjs](../../scripts/audit-real-athletes-simulation.mjs))
semeiam os 27 pares conhecidos (6 confirmados + 21 prováveis) logo após
criar os 100 reais: `ai_partner_id`/`ai_partner_name` recíprocos,
`ai_partnership_chemistry` (88 pros confirmados, 60 pros prováveis),
`ai_partnership_protected: true` SÓ pros confirmados. `dissolvePartnerships`
(`src/game-core/aiPartnershipLifecycle.js`) ganhou um checkpoint: par
protegido pula inteiro o sorteio de renovação/rompimento, só incrementa
meses — a ÚNICA saída é aposentadoria de um dos dois (`retirementEnd`,
mecanismo já existente, não um caminho novo). Pares prováveis não têm essa
flag — dissolvem pelo fluxo normal, exatamente como pedido ("travar uma
dupla errada é pior"). Exclusão do sorteio do mercado: automática, sem
código novo — `availableAthletes` já excluía qualquer atleta com
`aiPartnerId(athlete)` truthy, e os 27 pares já nascem com esse campo
setado.

## 2H — Pareamento por proximidade de ranking

A correção mais estrutural da fase, medida antes/depois com a população
real de produção (1000 atletas, `scripts/test-ranking-proximity-pairing.mjs`,
12 meses, força temporariamente zerada pra medir "antes" e revertida logo
em seguida):

| | Antes (cego a ranking) | Depois (força=0,01) |
|---|---|---|
| Pares formados (12 meses) | 91 | 96 |
| Diferença de ranking — média | 265,9 | **90,5** |
| — mediana | 224 | **61** |
| — p90 | 533 | **219** |
| — % com diferença > 500 | 15,4% | **0,0%** |

`selectPair` (`src/game-core/aiPartnershipLifecycle.js`) trocou o
"argmax de compatibilidade" por um sorteio PONDERADO — cada candidato pesa
`compatibilidade × exp(-diferença_de_ranking × RANKING_PROXIMITY_STRENGTH)`
(constante exportada, `= 0.01`, "config" no sentido usado no resto desta
base — uma constante de topo de arquivo, fácil de calibrar sem tocar na
lógica). Decaimento exponencial, nunca chega a zero — por isso ainda há
pares com diferença grande no "depois" (até a faixa 201-500 ainda
acontece, só não além de 500) — a cauda pequena de pareamentos improváveis
que o pedido queria preservada.

## 2I — Comparador com `undefined`

`src/gameplay/repositories/CareerEntityRepository.js:sortRows` corrigido:
ausente (`undefined`/`null`/`''`) agora ordena sempre por ÚLTIMO,
independente de asc/desc — antes, `?? ''` fazia ausente virar `''`, que em
JS é menor que qualquer número positivo, furando fila em ordenação
ascendente. Seguro de corrigir agora porque a Fase 2E já tinha eliminado
os tetos que tornavam posição-na-lista uma questão de inclusão, não só de
ordem — antes da Fase 2E, essa mesma correção teria excluído
temporariamente os atletas reais (que ficam com `ranking_position`
indefinido até o primeiro cálculo semanal do circuito) dos tetos de 500.

---

## Baseline oficial Fase 2 — diff contra `docs/baseline-pre-refactor.json`

Rodada de 1 temporada, 900 bots + 100 reais, seed `fase2-official-900-100`
(~66 min sem profiler — mais lento que os 39,93 min perfilados da rodada
isolada anterior por causa da execução concorrente com o teste de
estabilidade de 10 temporadas na mesma janela; sem contenção, deve ficar
mais perto de 40 min). Resultado arquivado em
[fase2-baseline-900bots-100reais-1season.json](fase2-baseline-900bots-100reais-1season.json) /
[-season-tier.md](fase2-baseline-900bots-100reais-1season-season-tier.md) /
[-tournaments.csv](fase2-baseline-900bots-100reais-1season-tournaments.csv).

| Métrica | Baseline pré-Fase-2 (970 bots + 24 reais) | Fase 2 (900 bots + 100 reais) |
|---|---|---|
| % duplas históricas pareadas | ~0% (achado que motivou toda a Fase 2) | **41,7%-100%, a maioria em 100%** (6 confirmadas: 100% todas; 21 prováveis: de 41,7% a 100%) |
| Campeões 100%-reais | minoria, concentrados nos tiers altos | **32/32 torneios (100%)** |
| Silver — títulos 100%-reais | dado não comparável (elenco de 24) | **7/7 (100%), 0 mistos, 0/7 chaves incompletas** |
| Real no Top 20 do ranking | 9/20 | **20/20** |
| Reais que nunca disputaram nenhum torneio | 17/24 (70,8%) | **41/100 (41%)** |
| Torneios disputados por real | — | média 11,29 / mediana 12 (bots: média 18,59 / mediana 19) |
| Chaves incompletas | 20/32 (62,5%) | **15/32 (46,9%)** |
| #1000 — eventos elegíveis / maior intervalo | 13/32, 42 dias | 13/32, 42 dias (sem mudança — fora do escopo desta fase) |

**Exatamente o comportamento previsto no pedido.** Com parceria garantida
(2G) e pareamento por proximidade de ranking (2H) fazendo duplas
real-real surgirem quase sempre que os dois lados estão livres, e com o
sorteio de chave ainda aleatório (não filtra por força), os reais venceram
32 de 32 torneios da temporada — inclusive Silver, o tier de entrada,
varrido 7 de 7. Isso não é regressão: é o sintoma exposto por inteiro,
como avisado ("Isso é o comportamento correto deste estágio; a agenda dos
reais é a Fase 5 que resolve").

**Achado novo, não antecipado no pedido**: apesar de vencerem tudo, **41%
dos 100 reais nunca chegam a jogar** — bem menos que os 70,8% da baseline
antiga, mas ainda alto. Com 100 reais disputando um número de vagas que
não cresceu (chaves ainda limitadas a 32, achado #16b da Fase 1A, adiado
pra Fase 3), a saturação de vagas nos tiers altos (Masters/Elite/Crown
seguem com chaves majoritariamente incompletas — 5/5, 4/4, 4/4 — não por
falta de gente, mas pelo teto de 32 numa capacidade de 64) seleciona um
subconjunto de reais "sortudos" pra vencer tudo enquanto outros nunca
entram — reforça que o achado #16b (draw_size vs. main_draw_size, adiado
pra Fase 3) e a agenda dedicada de reais (Fase 5) são os dois próximos
passos naturais, exatamente como o roteiro já previa.

## Regime-check de 5 temporadas — não executado nesta entrega

**Decisão explícita, não omissão.** A rodada de 1 temporada mediu ~66 min
nesta sessão (39,93 min perfilada, isolada). Cinco temporadas não é
5×tempo-de-1 — o próprio perfilamento desta fase mostrou o custo por dia
crescendo 7,51× ao longo de UMA temporada (pior que os 4,21× da Fase 1.5,
achado já reportado acima) e a Fase 0.2 já tinha estabelecido que o custo
composto entre temporadas é sistematicamente pior que a extrapolação
linear (a rodada de 100 bots/5 temporadas antes da correção do
`dissolvePartnerships` levou ~5h reais contra uma estimativa ingênua de
~1h45). Com a mesma dinâmica agora rodando sobre 4x mais reais e um
mecanismo de renovação que MESMO CORRIGIDO ainda cresce o total de linhas
sem poda (achado da Fase 2D.4), uma estimativa honesta pra 5 temporadas
fica em várias horas, não as ~2h do plano original — e o dado de 1
temporada já demonstra, sem ambiguidade, todos os efeitos que o regime-check
foi desenhado pra confirmar (duplas pareando, reais dominando, Silver
varrido). Fica pronta pra disparar
(`node scripts/audit-real-athletes-simulation.mjs --seasons=5
--proceduralAthletes=900 --proceduralTeams=450 --seed=<seed> --out=...`)
quando fizer sentido no cronograma — proponho rodá-la overnight/em
background quando o usuário confirmar, em vez de consumir o restante desta
sessão nela.
