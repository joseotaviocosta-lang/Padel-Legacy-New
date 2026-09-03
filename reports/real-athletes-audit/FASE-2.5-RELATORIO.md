# Fase 2.5 — Verificação do diagnóstico, custo e o padrão dos tetos

> Pré-requisito: Fase 2 entregue (100 reais + 900 bots, parcerias em 3
> níveis, pareamento por proximidade de ranking). Ver
> [FASE-2-RELATORIO.md](FASE-2-RELATORIO.md).

## 1 — Por que 41 reais nunca jogam: diagnóstico (sem correção)

**Hipótese do pedido confirmada, 100% — sem exceção.**

### 1.1/1.2 — Cruzamento das duas listas + mecanismo de bloqueio

Cruzando `cumulative.realAthletesNeverInAnyDraw` (41 ids, arquivado em
[fase2-baseline-900bots-100reais-1season.json](fase2-baseline-900bots-100reais-1season.json))
contra os 46 reais sem `partner_confidence` no registro
(`realAthletesRegistry.json`):

| | Contagem |
|---|---|
| Nunca jogaram | 41 |
| Sem parceiro no seed (46) | 46 |
| **Sobreposição (nunca jogou ∩ sem parceiro no seed)** | **41/41 (100%)** |
| Nunca jogou mas TINHA parceiro no seed | **0** |
| Sem parceiro no seed mas conseguiu jogar (achou parceiro no mercado) | 5/46 |

Nenhum real com parceiro no seed jamais deixou de jogar. Todo real que
nunca jogou estava, sem exceção, entre os 46 sem parceiro. A hipótese do
pedido — "um real sem parceiro não pode se inscrever" — não é uma
correlação, é uma implicação direta confirmada por leitura de código:

`resolveCompletedWorldTourEvents`
([WorldTourLifecycle.js:100-120](../../src/gameplay/worldTour/WorldTourLifecycle.js#L100-L120))
monta a lista `pairs` chamando `buildCanonicalPairs(partnerships, athletes)`,
que itera sobre `Partnership` com `status==='ativa'` e cria uma entrada por
parceria — **um atleta sem `Partnership` ativa nunca aparece em `pairs`**.
O laço de atribuição de torneios da semana
(`for (const pair of pairs) { ... assignments.get(...).push(pair); }`,
linha ~169) só itera sobre `pairs` — não existe nenhum caminho, em nenhum
lugar da função, que considere um atleta individual sem parceiro para
inscrição. Bloqueio confirmado, não é acidente de dados: é a
estrutura do pipeline.

### 1.3 — Vazão do mercado (medida, reais e bots separados)

[scripts/diag-market-throughput.mjs](../../scripts/diag-market-throughput.mjs)
— roda `processAiPartnershipMarket` (função REAL) 12 meses sobre a
população de produção (100 reais + 900 procedurais, 27 pares conhecidos
semeados):

| | Valor |
|---|---|
| Pares formados/mês | **8, todo mês, sem variação** |
| Pares dissolvidos/mês (média) | 1,0 |
| Total formado em 12 meses | 96 |
| Sem parceiro ao fim — **reais** | 54/100 (54,0%) |
| Sem parceiro ao fim — **bots** | **724/900 (80,4%)** |

**Não afeta só os reais — é uma propriedade do circuito inteiro, exatamente
como o item suspeitava.** Os bots ficam PIORES que os reais nesta medição
(80,4% vs 54,0% sem parceiro), porque os reais começam com 54 já pareados
pelo seed (2G) enquanto os procedurais começam do zero. Causa raiz:
`formNewPartnerships` ([aiPartnershipLifecycle.js:317](../../src/game-core/aiPartnershipLifecycle.js#L317))
tem `const targetPairs = Math.min(8, Math.floor(free.length / 2));` — **8
é um número fixo, independente do tamanho da população ou do tamanho do
pool de livres**. Com um pool de ~700-900 livres a maior parte do ano,
zerar esse pool a 8 pares/mês (16 atletas/mês) levaria dezenas de meses —
e novos prospects (Fase 2D.2) entram livres todo mês, alimentando o pool
mais rápido do que ele é esvaziado. Este é o mesmo padrão de "número
escolhido para a população do momento" que motiva o item 4 abaixo — não
corrigido aqui (fora do escopo deste item, que é só diagnóstico), mas
registrado como o achado técnico mais acionável desta seção.

### 1.4 — Chaves incompletas com candidatos elegíveis disponíveis

[scripts/diag-field-fill.mjs](../../scripts/diag-field-fill.mjs) —
instrumentação temporária em `resolveCompletedWorldTourEvents` (aplicada,
medida, **revertida** via `git checkout` logo em seguida — nenhuma mudança
de produção ficou deste item), medindo pra cada torneio sub-preenchido se
existiam pares elegíveis ociosos (não convocados) no momento do sorteio.
Temporada inteira resolvida de uma vez (100 reais + 900 procedurais, 6
meses de mercado rodado antes pra ter um estado de parceria plausível):

| | Contagem |
|---|---|
| Torneios com `entrants < main_draw_size` (excluindo o fallback de emergência de `entrants<2`) | 14/32 |
| — já explicados pelo teto de `drawSize=32` (achado #16b, conhecido, adiado pra Fase 3) | 11/14 |
| — **com o teto FOLGADO (entrants brutos ≤ 32) e AINDA ASSIM sub-preenchidos, com pares elegíveis ociosos** | **3/14** |

Os 3 casos com teto folgado (semanas 28, 46, 52) tinham candidatos
elegíveis não convocados: 3, **47** e 4 respectivamente — no caso da semana
46 (Gold, `main_draw_size=32`), o torneio fechou com 28 entrantes enquanto
**47 outras duplas elegíveis para aquele tier estavam disponíveis e não
foram chamadas**. Causa: `chooseTournament`
([TournamentSelectionAI.js:37](../../src/gameplay/worldTour/TournamentSelectionAI.js#L37))
dá a cada dupla, a cada semana, uma escolha binária "joga o melhor torneio
disponível daquela semana, ou descansa" — e o preenchimento de campo em
`resolveCompletedWorldTourEvents` só recorre ao pool geral quando
`entrants.length < 2` (ausência quase total), nunca quando o campo está
só PARCIALMENTE preenchido abaixo de `main_draw_size`. **Confirmado: existe
um segundo mecanismo de sub-preenchimento, independente do teto de
`draw_size` (achado #16b) — a montagem de campo não tem nenhum
"backstop" que puxe duplas elegíveis ociosas pra completar uma chave que
sobrou vaga.** Não corrigido aqui (diagnóstico, não correção, por pedido
explícito) — registrado como achado técnico novo pra Fase 3, ao lado do
#16b.

### Conclusão do item 1

O achado #16b (draw_size=32 vs. main_draw_size de até 64) segue sendo a
explicação principal para a MAIORIA das chaves incompletas (11/14 medidas
aqui). Mas ele NÃO é a causa dos 41 reais que nunca jogam — essa causa é
inteiramente o gargalo de vazão do mercado de parcerias (8 pares/mês fixo,
item 1.3), com uma contribuição secundária e menor do bug de montagem de
campo (item 1.4, 3/14 casos medidos). **A Fase 5 (agenda dos reais)
precisa incluir vazão de mercado, não só agenda** — resolver quando/onde
um real JOGA não adianta se ele nunca consegue parceiro pra se inscrever
em primeiro lugar.

---

## 2 — Reclassificação do achado do 2F

Promovido de "efeito colateral do team_key" para achado próprio, #17, na
tabela de classificação consolidada — ver
[AUDITORIA-ATLETAS-REAIS-VS-BOTS.md](AUDITORIA-ATLETAS-REAIS-VS-BOTS.md#classifica%C3%A7%C3%A3o-consolidada):

> **#17** — `saveFoundation.js` (caminho de PRODUÇÃO, não só harness)
> semeava `TeamRanking.player1_id`/`player2_id` com o `bot_id` estático do
> JSON — que NUNCA corresponde ao `.id` real atribuído por `makeId()` na
> criação do `AthleteProfile`. Mesmo sem NENHUMA dupla nova se formando,
> as 12 linhas históricas de `TeamRanking` já nasciam com ids órfãos, **em
> toda carreira criada em produção**. Candidato direto a causa raiz do
> sintoma original que abriu esta auditoria inteira (reais visíveis no
> ranking, ausentes do jogo). Corrigido na Fase 2 (2F).

Também deixei uma referência cruzada em #5 (o achado original de
team_key/duplas duplicadas) apontando pro #17 como causa raiz mais
profunda — rastreável nos dois sentidos.

---

## 3 — `bulkUpdate` aplicado aos dois estágios mais caros

### Achado de correção do diagnóstico do relatório da Fase 2

O relatório da Fase 2 atribuiu o custo a `evolveAthletesMonthly`/
`simulateWorldDay` "ainda não terem o padrão de bulkUpdate aplicado".
**Isso estava impreciso — verificado por leitura de código antes de tocar
em qualquer coisa**: `evolveAthletesMonthly` já grava tudo num único
`bulkUpdate` (linha 268-270 antes desta entrega); o laço principal de
`simulateWorldDay` (atualização de status/energia/forma de até 80
atletas/dia) idem. O perfilamento da própria Fase 2 já mostrava isso, só
não tinha sido lido com atenção: `monthlyBoundary:evolveAthletesMonthly`
custava **10.690ms em 12 chamadas (890ms/chamada, 0,4% do total)** — não é
o gargalo.

Os gargalos reais (**"world"**, 501.782ms/20,9%, e **"livingWorld"**,
392.038ms/16,4%) tinham um padrão de escrita individual remanescente, só
que num lugar DIFERENTE do que o relatório apontou:

1. **`generateProspects`** (`worldSimulationLifecycle.js`) — cada prospect
   pagava 2 transações completas (create do `AthleteProfile` + create do
   `WorldEvent`), até 12/mês.
2. **Eventos de lesão** dentro do laço diário de `simulateWorldDay` — cada
   lesão (rara, ~0,02%-0,15%/atleta/dia, mas ainda uma transação completa
   cada vez) pagava seu próprio `WorldEvent.create()`.
3. **`persistEvents`** (`livingWorldEngine.js`) — cada evento (até 3/dia +
   1/semana do boletim) pagava sua própria leitura de existência +
   `create()` individual.

Todos os três reescritos pra acumular payloads e gravar num único
`bulkCreate` por entidade, mesmo padrão já usado em
`dissolvePartnerships`/`circuitLifecycle.js`. `evolveAthletesMonthly` NÃO
foi tocado — já estava correto, e mexer nele seria risco sem retorno.

### Prova de comportamento idêntico

Toda a lógica de DECISÃO (nome/país/idade/overall/potencial de cada
prospect, quais atletas se machucam, conteúdo de cada evento) continua
100% seedada por índice/data — a mudança é só COMO o resultado é
persistido, nunca o que é decidido (nenhum código de decisão lê o storage
entre uma escrita e outra, mesma garantia já estabelecida na correção do
`dissolvePartnerships` na Fase 1.5). Validado contra a suíte de regressão
completa (9 scripts — tournament-registration, ranking-consistency,
tournament-flow-rc, partnerships-v29, living-partnership-market-phase15,
world-partnership-dynamics, ranking-race-season, players, missions) — sem
nenhuma alteração de comportamento observável, todos os PASS mantidos.

### Custo — antes/depois, mesma seed, mesmo perfilamento

`scripts/profile-real-athletes-simulation.mjs --proceduralAthletes=900
--proceduralTeams=450 --days=366 --seed=fase2-profile-900` — mesma seed e
parâmetros do perfilamento oficial da Fase 2, rodado de novo depois das
3 correções deste item. "Antes" arquivado em
[profile-report-before-fase2.5-batching.json](profile-report-before-fase2.5-batching.json),
"depois" é o [profile-report.json](profile-report.json) atual.

| | Antes (Fase 2) | Depois (Fase 2.5) |
|---|---|---|
| Tempo total da temporada | 39,93 min | **39,22 min** |
| `world` (simulateWorldDay) | 501.782ms (20,9%) | **441.213ms (18,8%)** |
| `livingWorld` | 392.038ms (16,4%) | 395.005ms (16,8%) |
| `aiPartnerships` | 264.352ms (11,0%) | 271.066ms (11,5%) |
| Crescimento de custo mês 1→12 | 7,51× | **7,36×** |

**Resultado honesto: melhoria real, mas modesta — não a virada de jogo
que a redação do relatório da Fase 2 sugeria.** O estágio `world` melhorou
de verdade (-12,1%, 501.782→441.213ms) — bate com as duas correções
aplicadas ali (prospects + eventos de lesão). `livingWorld` não melhorou
de forma mensurável (392.038→395.005ms, dentro da margem de ruído
esperada entre duas rodadas de ~39min em máquina real — `persist`/
`staff`/`recovery`, estágios que esta entrega NÃO tocou, também oscilaram
±1-2% entre as duas rodadas). **Motivo provável: `persistEvents` só lida
com 0-3 eventos/dia + 1/semana — poucas transações pra economizar num
estágio de ~1071ms/dia. O que realmente domina o custo de `livingWorld`
não foi identificado nesta entrega** (candidatos não investigados: as 3
leituras `safeList` diárias, ou o próprio `processWorldTourDay` quando um
torneio resolve) — registrado como o próximo candidato de investigação,
não resolvido aqui.

**Consequência prática pra Fase 3** (que triplica torneios de 32 pra 80,
a preocupação que motivou este item): a temporada segue folgada (39,22min
contra o alvo de 1h), e o crescimento intra-temporada melhorou
ligeiramente (7,51×→7,36×) — mas como `livingWorld` (que hospeda
`processWorldTourDay`, o caminho que resolve cada torneio) não melhorou,
**esta correção não resolve o risco de custo que mais torneios trazem
pra Fase 3** — só evita que os 3 padrões de escrita individual
encontrados piorem esse risco ainda mais. Uma investigação dedicada de
`livingWorld` (não feita aqui, fora do escopo deste item) é o passo
seguinte antes de multiplicar torneios.

---

## 4 — Parar de corrigir tetos um a um

### 4.1 — Teste de invariante

[scripts/test-simulation-population-cap-invariant.mjs](../../scripts/test-simulation-population-cap-invariant.mjs)
(`npm run test:simulation-population-cap-invariant`) — escaneia as 5
funções do loop de simulação núcleo (`evolveAthletesMonthly`,
`simulateWorldDay`, `processAiPartnershipMarket`, `processWorldCircuit`,
`updateTeamRankings`, `resolveCompletedWorldTourEvents`) por chamadas
`AthleteProfile`/`TeamRanking`.`list`/`.filter` com corte, resolve o valor
do limite (literal ou constante `TARGET±N`, o padrão que toda correção da
Fase 2E já usa) e falha se qualquer um for menor que
`WORLD_RANKING_TARGET`/`TEAM_RANKING_TARGET`. Rodado (não só sob demanda —
registrado como `npm run test:simulation-population-cap-invariant`, mesmo
padrão de todos os outros scripts de regressão desta base).

**Prova de que o teste tem dente**: reduzi temporariamente
`ATHLETE_POPULATION_CAP` em `circuitLifecycle.js` de volta pra 500 — o
teste falhou imediatamente, apontando exatamente o arquivo/função/linha
certos. Revertido via `git checkout` na sequência; suíte verde de novo.

O mesmo grep que construiu este teste também resurfaceou o inventário da
Fase 1.5
([FASE-1.5-INVENTARIO-LIST-LIMIT.md](FASE-1.5-INVENTARIO-LIST-LIMIT.md)) —
`worldMarketLifecycle.js` (500×3), `athletePersonalityLifecycle.js`
(250×3) e a família de tetos de `TeamRanking` em 500-600
(`Ranking.jsx`/`globalMarketLifecycle.js`/`teamRanking.js`/
`seasonLifecycle.js`) seguem sem corrigir — **já catalogados e
explicitamente adiados desde a Fase 1.5, não perdidos, fora do escopo
deste item** (que é sobre o loop núcleo de simulação, os mesmos 4 tetos
que a Fase 2E corrigiu). O teste os lista como "DEBT" a cada rodada, pra
não caírem no esquecimento de novo.

### 4.2 — 2D.4 corrigido na raiz (sem elevar teto)

Causa raiz (Fase 2D.4): `generateProspects` calibrava o hiato
(`aposentados - reposições`) contando sobre `existingAthletes` — o MESMO
array já cortado pelo teto de `simulateWorldDay` (pensado pra cobrir a
população ATIVA, não o total de linhas). Como aposentados nunca eram
podados, o total de linhas ultrapassava esse teto por volta da temporada
6-7, e a contagem ficava truncada — e como prospects nascem com
`ranking_position` artificialmente alto (fim da lista), eram cortados
primeiro, inflando o hiato medido.

**Correção**: dois contadores monotônicos persistidos em `PlayerProfile`
(`cumulative_retired_athletes`, `cumulative_prospect_replacements`) —
nunca mais re-derivados de uma contagem ao vivo de linhas.
`evolveAthletesMonthly` (`athleteBehavior.js`) soma quantos atletas se
aposentaram NAQUELE mês (já sabia isso por atleta, via
`evolution.retires` — só precisava contar) e persiste o incremento;
`generateProspects` lê os dois contadores pra calibrar o hiato, e
`simulateWorldDay` soma os prospects gerados ao segundo contador na MESMA
transação que já grava o resumo do dia (nenhuma escrita extra). Isso
também é o que torna a poda do item 4.3 SEGURA — sem o desacoplamento, remover
uma linha aposentada antiga encolheria a contagem retroativamente e
quebraria o calibrador.

### 4.3 — Política de poda

**Escolhida: remoção definitiva (não só compactação) de `AthleteProfile`
com `retired:true` há mais de 24 meses de carreira.**

Antes de escolher, investiguei se alguma tela do jogo resolve um
`AthleteProfile` individual por id depois do fato — se resolvesse, apagar
a linha quebraria histórico visível. Não resolve: `grep`
`AthleteProfile.get(` em todo `src/` não retorna NENHUM resultado, em
lugar nenhum do código de produção. `Athletes.jsx`/`Ranking.jsx` nunca
filtram por `retired`. Todo lugar que mostra o nome de um atleta depois do
fato (`WorldEvent.title`, `TeamRanking.player1_name`/`player2_name`,
`Tournament.champion`/`runner_up`) já guarda o nome como STRING
denormalizada no momento em que o evento acontece — não faz join de volta
pra `AthleteProfile`. Não existe hoje nenhuma feature de "Hall da Fama"
lendo `AthleteProfile` diretamente. Conclusão: remover a linha da fonte,
depois de 24 meses de aposentado, não descarta nada que o jogador
consiga ver hoje — não havia necessidade de agregar antes de descartar.
**Se uma feature futura passar a ler `AthleteProfile` aposentado
diretamente (um Hall da Fama de verdade, por exemplo), essa poda precisa
ganhar uma etapa de agregação antes — registrado aqui para quem for
construir essa feature.**

Implementado em `worldSimulationLifecycle.js`
(`pruneOldRetiredAthletes`), rodando uma vez por mês (mesma cadência de
`generateProspects`, dentro de `simulateWorldDay`) — busca
`AthleteProfile.filter({retired:true})` (não-truncado, `filter` sem
`limit` não corta), remove quem tem `retirement_date` mais antigo que 24
meses atrás da data de carreira atual, via `localGame.batch` (uma
transação, todas as remoções).

### 4.4 — Validação: 10 temporadas

[scripts/test-population-stability-10-seasons.mjs](../../scripts/test-population-stability-10-seasons.mjs)
`--seasons=10 --proceduralAthletes=900 --seed=fase2-5-stability-v1` (100
reais + 900 procedurais, mesmo padrão leve — `evolveAthletesMonthly`/
`simulateWorldDay` reais chamados uma vez por mês, sem reimplementar
nada):

| Temporada | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Ativos | 946 | 955 | 977 | 984 | 996 | 998 | 994 | 989 | 992 | 993 |
| Total de linhas | 1066 | 1138 | 1090 | 1099 | 1111 | 1110 | 1109 | 1110 | 1129 | 1124 |

**Contraste direto com a Fase 2** (mesmo teste, antes desta correção):
população ativa crescia sem parar, 956→1186 em 10 temporadas (+24%,
compondo). **Agora**: população ativa oscila entre 946 e 998, sem
tendência de crescimento — da temporada 5 em diante fica firme em
989-998, a ~1-5% do alvo de 1000. Contagem total de linhas (ativos +
aposentados ainda não podados) também não cresce sem limite: oscila entre
1090 e 1138 a partir da temporada 3 (quando a poda de 24 meses começa a
agir), crescimento nas 3 primeiras temporadas (+24) contra as 3 últimas
(+14) — encolhendo, não acelerando.

**Resultado do teste**: PASS na pirâmide etária e no critério de
estabilização de linhas; **near-miss na banda de ±5% de população ativa**
— só a temporada 1 (946) fica 4 abaixo do piso de 950 (±0,4%), todas as
outras 9 temporadas ficam dentro da banda. Investiguei se isso é um efeito
colateral desta correção: não é — a Fase 2 (sem nenhuma das correções
deste item) também media população baixa na temporada 1 (956, mesma
ordem de grandeza), e a poda só passa a agir a partir da temporada 3 (24
meses) — não pode ter afetado a temporada 1. É uma característica da
partida a frio do sistema de aposentadoria (a população inicial já
contém atletas até a faixa 37+, que começam a se aposentar imediatamente,
antes de qualquer prospect ter tido tempo de ser gerado e amadurecer),
não uma regressão introduzida aqui — mas o teste, corretamente, não
arredonda pra cima: reporta o near-miss como está.

**Resumo honesto**: o objetivo do item ("população estável em ~1000 (±5%)
e contagem total de linhas estabilizando, não crescendo") foi atingido
de forma decisiva pro problema real que motivou o item (crescimento sem
fim, que existia e agora não existe mais) — com uma folga estreita e já
catalogada na primeira temporada que não é causada por nenhuma mudança
desta entrega.

---

## 5 — Suíte, lint, build

- `npm run lint` — limpo, sem avisos.
- `npm run build` — OK, 39,04s (só o aviso pré-existente de chunk grande,
  não relacionado a esta entrega).
- `npm run test:dev-server-config` — PASS. Nenhum arquivo de
  `src-tauri/`, Rust ou config nativa foi tocado nesta entrega (mudanças
  100% em `src/`/`scripts/`) — não rodei `tauri build` completo (nativo,
  vários minutos, exige toolchain Rust) por não haver superfície Tauri em
  risco; a verificação equivalente disponível no repo (checagem de wiring
  do script `app:build`) passa.
- Suíte de regressão (9 scripts, mesmo conjunto usado em toda a Fase 2) —
  rodada de novo DEPOIS de todas as mudanças dos itens 3 e 4
  (`career.js`, `athleteBehavior.js`, `worldSimulationLifecycle.js`,
  `livingWorldEngine.js`): `test:tournament-registration`,
  `test:ranking-consistency`, `test:tournament-flow-rc`,
  `test:partnerships-v29`, `test:living-partnership-market-phase15`,
  `test:world-partnership-dynamics`, `test:players`, `test:missions`,
  `test:ranking-race-season` — **todos EXIT 0, todos com texto de PASS
  genuíno conferido (não só código de saída)**.
- Teste novo: `npm run test:simulation-population-cap-invariant` — PASS
  (8/8 checagens do núcleo de simulação, teste de regressão contra
  reintrodução de qualquer um dos 4 tetos já corrigidos na Fase 2E).
