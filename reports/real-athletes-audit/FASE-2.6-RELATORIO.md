# Fase 2.6 — Vazão do mercado, custo do livingWorld e poda segura

> Pré-requisito: Fase 2.5 entregue (diagnóstico dos 41 reais, achado #17
> rastreado, bulkUpdate nos gargalos reais, teste de invariante de tetos,
> 2D.4 corrigido na raiz, poda de 24 meses). Ver
> [FASE-2.5-RELATORIO.md](FASE-2.5-RELATORIO.md).

## 1 — Vazão do mercado de parcerias

### 1.1 — De número fixo pra fração do pool

`formNewPartnerships` (`src/game-core/aiPartnershipLifecycle.js`) trocou
`const targetPairs = Math.min(8, Math.floor(free.length / 2))` por
`Math.floor((free.length * MARKET_FORMATION_FRACTION) / 2)` — mesmo padrão
de "constante escala com a população" que o teste de invariante da Fase
2.5 já cobre pra tetos de `list()`; este caso é uma constante
estruturalmente diferente (uma FRAÇÃO, não um corte absoluto), então não
cabe no mesmo teste de regex — mas o princípio é o mesmo, e a correção
elimina a classe de falha por construção: não existe mais um número fixo
pra reintroduzir por engano.

`MARKET_FORMATION_FRACTION` é `let` (não `const`) só para
`scripts/diag-market-formation-calibration.mjs` poder testar vários
valores no mesmo processo, via `setMarketFormationFractionForCalibration` —
produção nunca chama esse setter.

**Efeito colateral necessário**: `formNewPartnerships` também fazia 3
transações individuais por par (2 `updateAthlete` + 1
`Partnership.upsert`) mais 1 `WorldEvent.create()` — com o alvo agora
proporcional ao pool (visto na calibração abaixo, isso significa
dezenas de pares/mês em vez de 8), esse padrão teria virado um gargalo de
custo novo. Reescrito pro mesmo padrão de acumular-e-gravar-em-batch já
usado em `dissolvePartnerships`/`generateProspects`/`persistEvents`. A
seleção de pares (quem forma par, em que ordem) não muda — a mutação
`pair.first.ai_partner_id = pair.second.id` já acontecia em memória,
síncrona, antes de qualquer escrita no banco, então adiar as escritas pro
fim do laço não altera nenhuma decisão.

### 1.2/1.3 — Curva de calibração

[scripts/diag-market-formation-calibration.mjs](../../scripts/diag-market-formation-calibration.mjs)
— testa cada fração contra a população de produção (100 reais + 27 pares
conhecidos + 900 procedurais), rodando `processAiPartnershipMarket`
(função REAL) por **30 meses** (horizonte longo o bastante pra contratos
— duram 210-360 dias — começarem a expirar e a dissolução aparecer de
verdade; 12 meses não bastaria):

| Fração | % pareado geral | % pareado reais | % pareado bots | Duplas ativas | Formados/mês (regime) | Dissolvidos/mês (regime) |
|---|---|---|---|---|---|---|
| 0,02 | 30,6% | 41,0% | 29,4% | 153 | 7,0 | 4,8 |
| 0,04 | 49,4% | 53,0% | 49,0% | 247 | 10,2 | 8,2 |
| 0,06 | 61,6% | 71,0% | 60,6% | 308 | 12,2 | 10,3 |
| 0,08 | 67,8% | 68,0% | 67,8% | 339 | 14,3 | 11,8 |
| 0,10 | 76,6% | 79,0% | 76,3% | 383 | 13,2 | 10,3 |
| **0,14** | **83,0%** | **84,0%** | **82,9%** | **415** | **13,8** | **12,5** |
| 0,16 | 83,6% | 81,0% | 83,9% | 418 | 15,0 | 13,0 |
| 0,20 | 88,2% | 89,0% | 88,1% | 441 | 15,3 | 13,3 |
| 0,28 | 92,0% | 91,0% | 92,1% | 460 | 15,2 | 13,3 |

**Curva côncava, com cotovelo claro entre 0,10 e 0,16**: subir de 0,02 pra
0,10 (5×) ganha +46 pontos percentuais; subir de 0,10 pra 0,28 (quase
3× mais) ganha só mais +15,4 pontos. Passado 0,14-0,16, o "formados/mês em
regime" praticamente para de crescer (13,8→15,3→15,2 de 0,14 a 0,28,
mesmo a fração quase dobrando) — o pool de livres em regime já encolheu o
suficiente pra se autolimitar, exatamente o comportamento esperado de uma
fração (era impossível com o 8 fixo anterior).

**Valor escolhido: 0,14.** Está exatamente no cotovelo (ganho marginal
mínimo depois dele — 0,16 custa mais fração pra só +0,6pp), e é o ponto
onde os REAIS especificamente saem melhor (84,0% a 0,14 vs. 81,0% a
0,16 — a amostra pequena de 100 reais tem mais ruído entre pontos
próximos da curva, mas não há motivo pra pagar mais fração por um
resultado pior nos reais). 83% pareado é maioria esmagadora sem forçar
100% — os ~17% sem parceiro (majoritariamente bots recém-gerados ou
recém-dissolvidos, não uma classe permanentemente excluída) são material
de mercado pro jogador explorar, como pedido.

### 1.4 — Efeito sobre a dissolução

Em nenhum ponto da curva a dissolução "congela": formados/dissolvidos em
regime ficam próximos em toda a faixa testada (razão formados:dissolvidos
vai de 1,46 em 0,02 até 1,10-1,15 em 0,14-0,16) — dissolução cresce junto
com formação, não fica presa em ~1/mês como no regime antigo de 8 fixo
(medido na Fase 2.5: 8 formados vs. 1,0 dissolvido/mês — razão 8:1, isso
sim seria "mercado congelando" se a formação tivesse subido sozinha). No
valor escolhido (0,14): **13,8 formados/mês, 12,5 dissolvidos/mês em
regime estável** — mercado ativo nos dois sentidos.

### 1.5 — Custo

Mesma metodologia das fases anteriores (`scripts/profile-real-athletes-simulation.mjs`,
seed `fase2-profile-900`, 900 procedurais + 100 reais, 366 dias),
"antes" = Fase 2.5 pós-batching (8 fixo/mês) arquivado em
[profile-report-before-fase2.6-market-fraction.json](profile-report-before-fase2.6-market-fraction.json),
"depois" = fração 0,14 + batching deste item:

| | Antes (Fase 2.5, 8 fixo/mês) | **Depois (Fase 2.6, fração 0,14)** |
|---|---|---|
| Tempo total da temporada | 39,22 min | **37,67 min** |
| `aiPartnerships` (`processAiPartnershipMarket`) | 271.066ms (11,5%) | **144.179ms (6,4%)** |
| `world` | 441.213ms (18,8%) | 446.198ms (19,7%) |
| `livingWorld` | 395.005ms (16,8%) | 410.838ms (18,2%) |
| Crescimento de custo mês 1→12 | 7,36× | 7,52× |

**Resultado contraintuitivo, mas explicável: `aiPartnerships` ficou MAIS
BARATO (-46,8%) processando MUITO MAIS pares (de 8 fixo/mês pra até
dezenas, ver curva do item 1.2).** A causa não é a lógica de seleção
(barata, CPU pura) — é que o item 1.1 trocou 3 transações de banco POR
PAR (2 `updateAthlete` + 1 `Partnership.upsert`, cada uma clonando o save
inteiro) por 3 transações TOTAIS por mês (`bulkUpdate`+`batch`+`bulkCreate`),
não importa quantos pares se formem. No regime de 8 fixo isso já eram 24
transações/mês; agora, processando 4-9× mais pares, seguem sendo só 3.
**A correção de throughput só foi barata PORQUE veio junto com a correção
de batching (item 1.1) — se eu tivesse só trocado o número sem também
trocar o padrão de escrita, o resultado teria sido o oposto do que a
preocupação original (item 1.5 do pedido) temia.**

Os outros estágios (`world`, `livingWorld`, `persist`, `staff`,
`recovery`) subiram de forma modesta e uniforme (+1-3 pontos percentuais
cada) — consistente com um save um pouco maior (379 duplas ativas e mais
eventos de mercado do que antes), não com nenhum novo padrão de escrita
individual. **Líquido: a temporada ficou 1,55 min MAIS RÁPIDA (39,22→37,67
min), não mais lenta** — o item 1 resolveu o gargalo de throughput sem
consumir a folga de custo que a Fase 2.5 comprou; pelo contrário, devolveu
parte dela. O crescimento intra-temporada piorou ligeiramente (7,36×→7,52×,
dentro do esperado por save maior), mas o tempo total segue confortavelmente
abaixo de 1h.

### Validação — temporada completa, população de produção

Duas rodadas complementares, ambas com a fração de produção (0,14) e a
população de produção (100 reais + 900 procedurais):

- **Temporada completa** (dia-a-dia, `scripts/audit-real-athletes-simulation.mjs`,
  seed `fase2-6-validation-900-100`) — pros números de torneio/agenda.
  Arquivado em
  [fase2.6-validation-900bots-100reais-1season.json](fase2.6-validation-900bots-100reais-1season.json).
- **Mercado isolado, 12 meses** (`scripts/diag-market-throughput.mjs`,
  seed `fase2-6-throughput-validation`) — pros números de parceria ao fim
  do ano (o harness de temporada completa não grava esse corte; o
  diagnóstico de mercado já é o script validado na Fase 2.5 pra essa
  medição específica). Os dois se cruzam de forma consistente: reais sem
  parceiro medido pelo diagnóstico de mercado (17/100) bate exatamente com
  reais que nunca jogaram medido pela temporada completa (17/100) —
  confirma de novo, agora com a correção aplicada, que "sem parceiro" e
  "nunca joga" são a mesma coisa (item 1.1/1.2 da Fase 2.5).

| Métrica | Antes (Fase 2.5, 8 fixo/mês) | **Depois (Fase 2.6, fração 0,14)** |
|---|---|---|
| Sem parceiro ao fim — reais | 54,0% (54/100) | **17,0% (17/100)** |
| Sem parceiro ao fim — bots | 80,4% (724/900) | **25,0% (225/900)** |
| Duplas ativas (12 meses) | ~115 (27 seed + 96 formadas − ~12 dissolvidas) | **379** (27 seed + 410 formadas − 58 dissolvidas) |
| Reais que nunca jogaram (temporada completa) | 41/100 | **17/100** |
| Chaves incompletas | 15/32 (46,9%) | **13/32 (40,6%)** |
| Torneios disputados/real (média) | 11,29 | 11,19 (~igual — esperado, a agenda dos reais ainda não mudou) |
| Campeões 100%-reais | 32/32 | 32/32 (~igual — esperado pelo mesmo motivo) |

**Duplas ativas mais que triplicaram (115→379)** — o efeito direto de
substituir 8 fixo por uma fração do pool. **Reais que nunca jogam caiu
58%** (41→17) — a maior parte do problema original (o gargalo de
throughput identificado na Fase 2.5, item 1) está resolvida, não só
mitigada. **Chaves incompletas melhoraram, mas moderadamente** (46,9%→
40,6%) — confirma o que a Fase 2.5 já apontava: a maioria das chaves
incompletas vem do teto `draw_size=32` (achado #16b, ainda não corrigido,
adiado pra Fase 3), não só da falta de duplas — agora que há duplas de
sobra, o gargalo residual das chaves é majoritariamente o teto de vagas,
não mais a falta de gente pra preenchê-las.

**Reais que ainda nunca jogam (17/100) não é zero, de propósito** — bate
com a calibração escolhida (item 1.2: 83% pareado em regime estável, não
100%). O achado #16b (draw_size) e a agenda dedicada de reais (Fase 5)
seguem sendo os dois próximos passos pra reduzir esse resíduo, exatamente
como a Fase 2.5 já apontava — este item resolveu o gargalo de THROUGHPUT
de parceria, não os outros dois gargalos já catalogados.

---

## 2 — De onde vem o custo do `livingWorld`

[scripts/diag-livingworld-substages.mjs](../../scripts/diag-livingworld-substages.mjs)
— instrumentação temporária em `processLivingWorldDay` (aplicada, medida,
**revertida** via edição manual logo em seguida — nenhuma mudança de
produção ficou deste item; só o `persistEvents` em batch da Fase 2.5
permanece no arquivo), cronometrando cada sub-estágio, 366 dias, população
de produção, com 3 meses de mercado real rodado antes (pra
`resolveCompletedWorldTourEvents` ter `Partnership` ativas de verdade — sem
isso nenhum torneio resolveria e `processWorldTourDay` ficaria
artificialmente barato).

| Sub-estágio | Total (366 dias) | % do total | Chamadas | Média/chamada |
|---|---|---|---|---|
| `generateWorldEvents` (editorial) | 41.458ms | **50,9%** | 366 | 113,27ms |
| `processWorldTourDay` | 17.377ms | 21,3% | 366 | 47,48ms |
| `persistEvents` (contextual) | 7.145ms | 8,8% | 366 | 19,52ms |
| `createWeeklyWorldBulletin` | 5.972ms | 7,3% | 366 | 16,32ms |
| `maybeGenerateMacroEvent` | 5.136ms | 6,3% | 366 | 14,03ms |
| `expireMacroEvents` | 3.860ms | 4,7% | 366 | 10,55ms |
| `safeList` ×3 (athletes/teams/tournaments) | 475ms | **0,6%** | 366 | 1,30ms |

**A suspeita do pedido (leituras diárias repetidas) está refutada por
número**: `safeList_x3` é 0,6% do custo — as leituras são baratas de
verdade (cache em memória por career ativa, sem clonar o save; confirmado
lendo `CareerEntityRepository.list/filter`, que só clona no caminho de
ESCRITA). Não há correção a propor aqui.

### Dias com torneio vs. sem torneio

| | Custo total | Dias | % do total |
|---|---|---|---|
| Dias com resolução de torneio | 22.331ms | 32/366 | 27,4% |
| Dias sem resolução de torneio | 59.091ms | 334/366 | **72,6%** |

`processWorldTourDay` sozinho: **510,20ms** nos dias em que resolve algo,
contra **3,14ms** nos dias em que não resolve — um pico de 162× exatamente
como a preocupação original previa. Mas como só 32/366 dias têm esse
pico, o custo AGREGADO continua dominado pelos dias sem torneio — não
porque a resolução seja barata (não é, no dia em que acontece), mas
porque o resto do custo diário (editorial, sobretudo) é pago TODO santo
dia, torneio ou não.

### A causa real: não é leitura, não é (só) resolução de torneio — é a contagem de transações

`generateWorldEvents` (editorial) grava via
`localGame.entities.WorldEvent.bulkUpdate(prepared)` — e
`CareerEntityRepository.bulkUpdate`/`batch`/`create`/`bulkCreate` **todos
passam por `mutateActiveCareer`, que faz `structuredClone(activeTransaction.draft)`
a cada chamada — um clone do SAVE INTEIRO (todas as coleções, não só
`WorldEvent`), independente de quantos itens aquela chamada específica
está gravando** (confirmado lendo `ActiveCareerAdapter.js:225-246`). Isso
explica por que `generateWorldEvents` (1-2 eventos, conteúdo trivial —
`generateEventObject` só sorteia de uma lista de 3 templates) custa
113ms — o mesmo custo de qualquer transação de escrita neste ponto do
save, e não algo específico ao que ela computa. Prova cruzada:
`createWeeklyWorldBulletin` só escreve 1 em 7 dias (segunda-feira) e sua
MÉDIA diluída (16,32ms) × 7 ≈ **114ms** — praticamente idêntico ao custo
por chamada do editorial. **O padrão real: qualquer transação de escrita
custa ~110-113ms neste save (na escala testada); `generateWorldEvents`
domina o total só porque é a ÚNICA sub-etapa que escreve incondicionalmente
TODO dia, sem exceção — as outras (`persistEvents` contextual, boletim,
macroeventos) são gateadas a dias específicos e diluem a média.**

### O que isso muda pra Fase 3

A preocupação original ("torneios resolvem em poucas semanas do ano, mas
o custo é de ~1.071ms todo dia") tinha o mecanismo errado, mas o instinto
certo sobre a ASSIMETRIA: a Fase 3 triplicando torneios aumenta
diretamente `processWorldTourDay` (21,3% hoje, deve crescer
proporcionalmente ao número de dias-com-resolução) — mas **não toca em
nada no custo do editorial (50,9%, o maior pedaço)**, que é independente
da contagem de torneios. Ou seja: a Fase 3 vai piorar uma fatia que hoje
é MENOR que a fatia que ela não vai tocar.

### Duas correções candidatas — não implementadas, decisão sua

Nenhuma das duas é "a leitura" (não existe, está refutada) nem "a
resolução de torneio" (não otimizei, por pedido explícito). É uma
terceira categoria — decisão de produto (cadência de conteúdo) ou refator
de médio esforço pra ganho modesto — então também não tomei a decisão
sozinho:

1. **Reduzir a cadência do editorial** (hoje: incondicional, todo dia).
   Maior alavanca possível (afeta os 50,9%), mas muda quantas notícias
   "de ambientação" o jogador vê por semana — decisão de ritmo/conteúdo,
   não técnica.
2. **Consolidar as escritas do mesmo dia numa única transação**
   (editorial + eventos contextuais + boletim, quando coincidem) — não
   muda NADA do que o jogador vê (mesmo conteúdo, mesma cadência), só
   reduz quantas vezes o save inteiro é clonado por dia. Ganho estimado:
   ~13% do custo do `livingWorld` (o editorial sozinho, que já escreve
   incondicionalmente, não fica mais barato — só os dias em que 2-3
   sub-estágios coincidiam deixam de pagar 2-3 clones em vez de 1). Não
   implementado aqui por prudência (a mistura de semântica upsert vs.
   create-se-não-existir entre os três caminhos precisa de cuidado), mas
   é seguro no sentido de não alterar comportamento visível — fica pronto
   pra aplicar se fizer sentido no cronograma.

---

## 3 — Poda não-destrutiva: linha-resumo de aposentadoria

### O que foi implementado

Nova coleção `AthleteCareerLegacy` — uma linha por atleta aposentado,
gravada em `evolveAthletesMonthly` (`src/lib/athleteBehavior.js`) no
MESMO momento em que a aposentadoria é decidida, usando a linha ORIGINAL
do `AthleteProfile` (estatísticas acumuladas até ali, antes do patch):
`athlete_id, name, country, is_real, retirement_date, retirement_age,
circuit_entry_date, years_active, best_ranking_position, career_titles,
career_titles_by_tier, career_wins, career_losses,
peak_world_ranking_points, main_partner_name`.

**Duas dependências, mínimas, adicionadas às gravações que já existiam
(nenhuma consulta nova)**:
- `best_ranking_position` — **já existia** (`livingCircuitRules.js:157`,
  dentro de `evolveAthleteCareerMonth`), só que MENSAL — calculado sobre o
  `ranking_position` mais recente no momento em que a evolução mensal
  roda, então um pico de meio de mês (rank sobe e desce entre uma
  atualização semanal e outra) podia passar batido se não coincidisse com
  o dia exato da checagem mensal. Estendido pra também atualizar
  SEMANALMENTE, dentro do MESMO `bulkUpdate` que `circuitLifecycle.js` já
  faz pra gravar `ranking_position` toda semana — `Math.min` contra o
  valor anterior, mesma fórmula, cadência mais fina. As duas escritas
  (semanal e mensal) convergem pro mesmo valor correto; a diferença é só
  não perder mais o pico entre uma checagem mensal e outra.
- `career_titles_by_tier` — novo, `WorldTourLifecycle.js`, dentro do MESMO
  `bulkUpdate` que já grava `career_titles` — só precisou que o `outcome`
  empurrado pra `athleteOutcomes` carregasse `tier` (um campo a mais no
  mesmo objeto, já montado ali).
- `circuit_entry_date` — novo campo, carimbado na CRIAÇÃO do atleta
  (`rankingPopulation.js`/`saveFoundation.js` pros 1000 iniciais,
  `generateProspects` pros que entram depois). Marca só "quando este
  atleta passou a existir NESTA carreira" — não uma biografia pré-jogo
  inventada (o mesmo princípio "nunca inventar passado" já usado em
  correções anteriores desta base). Saves anteriores a esta correção não
  têm o campo; `years_active` fica `null` nesse caso, não um chute.

**"Parceiro principal"**: implementado como o parceiro NO MOMENTO da
aposentadoria (`ai_partner_name`), não um histórico completo de todos os
parceiros já tidos — essa história não é rastreada por atleta em lugar
nenhum do jogo. Na prática isso captura o parceiro mais relevante na
maioria dos casos, porque pares protegidos (Fase 2G.1, duplas históricas
confirmadas) só se desfazem por aposentadoria — mas é uma aproximação,
registrada como tal.

**Sem transação nova**: o `bulkUpdate` de atletas do mês virou um único
`localGame.batch([...athleteUpdates, ...legacyRows])` — a mesma transação
agora carrega as duas coisas. O tipo de operação pros atletas mudou de
`bulkUpdate` implícito pra `type:'upsert'` explícito (não `'update'`) —
verificado que `'upsert'` cai no mesmo ramo tolerante (insere-ou-mescla)
que `bulkUpdate` já usava; `'update'` teria lançado erro num caso que
`bulkUpdate` nunca lançava (id não encontrado na coleção).

### Política de crescimento

`AthleteCareerLegacy` cresce pra sempre por construção — é o registro
permanente, não faz sentido podá-lo (podar destruiria exatamente o que
este item existe pra preservar). **Decisão: sem teto, retenção
ilimitada por design — justificada por volume medido, não por
suposição.** Da medição de 10 temporadas da Fase 2.5 (mesma população):
contagem de aposentados-ainda-não-podados estabilizou em ~110-140 linhas
em regime — como a poda remove com 24 meses, isso representa ~2 anos de
aposentadorias, ou seja, **~55-70 linhas/ano**. Mesmo numa carreira
extrema de 30 anos, isso são ~1.650-2.100 linhas — cada uma um objeto
plano pequeno (13 campos escalares, sem arrays aninhados, sem histórico)
— ordens de grandeza menor que `WorldEvent` (centenas por temporada) ou
que o próprio `AthleteProfile` (1000+ linhas ativas). Volume irrelevante,
confirmado por medição, não por suposição.

---

### Validação — poda não-destrutiva confirmada

[scripts/diag-retirement-legacy-check.mjs](../../scripts/diag-retirement-legacy-check.mjs)
— 36 meses (além dos 24 de poda), população de produção:

- **240 linhas de legado gravadas.**
- **107/240 já com o `AthleteProfile` original PODADO** — a prova direta
  de que a poda de 24 meses (item 4.3 da Fase 2.5) não perde mais
  histórico: o registro sobrevive à remoção da linha-fonte.
- Todos os campos obrigatórios presentes e no formato certo em toda linha
  (nome, `retirement_date`, `is_real` booleano, `career_titles_by_tier`
  objeto) — checado por asserção, não só visualmente.

### Validação — 10 temporadas (reconfirmação pós-Fase-2.6)

Mesmo teste da Fase 2.5
([scripts/test-population-stability-10-seasons.mjs](../../scripts/test-population-stability-10-seasons.mjs)),
rerodado pra confirmar que a vazão de mercado mais alta e o novo padrão de
escrita (`batch` em vez de `bulkUpdate` em `evolveAthletesMonthly`) não
desestabilizaram nada:

| Temporada | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Ativos | 957 | 960 | 966 | 981 | 981 | 992 | 993 | 996 | 994 | 988 |
| Total de linhas | 1066 | 1138 | 1101 | 1104 | 1110 | 1125 | 1118 | 1125 | 1120 | 1123 |

**Todas as 3 checagens PASS desta vez** — inclusive a banda de ±5% de
população ativa, que na Fase 2.5 tinha um near-miss na temporada 1 (946
vs. piso 950). Agora a temporada 1 fica em 957, dentro da banda. Não
esperava uma melhora aqui (esta fase não mexeu na calibração de
aposentadoria/prospects), mas o resultado é consistente — nada regrediu.

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Curva de calibração da vazão do mercado | ✅ 9 frações testadas, 30 meses cada, valor escolhido (0,14) com justificativa |
| 2 | Números de validação do item 1 contra os atuais | ✅ ver tabela "Validação — temporada completa" |
| 3 | Diagnóstico do `livingWorld` com separação torneio/sem-torneio | ✅ causa real identificada (transações incondicionais diárias, não leitura nem resolução) — 2 correções candidatas propostas, nenhuma aplicada, decisão registrada como sua |
| 4 | Linha-resumo de aposentadoria implementada | ✅ `AthleteCareerLegacy`, sem transação nova, poda confirmada não-destrutiva por medição |
| 5 | Suíte verde, lint, build OK | ✅ |

**Resumo executivo**: o gargalo de throughput do mercado de parcerias
(item 1) está resolvido, não só mitigado — duplas ativas 115→379, reais
sem parceiro 54%→17%, reais que nunca jogam 41→17, e a temporada ficou
MAIS RÁPIDA (39,22→37,67min) por causa do batching que veio junto. O
diagnóstico do `livingWorld` (item 2) corrigiu o próprio diagnóstico do
pedido — não é leitura (0,6% do custo), e a resolução de torneio (21,3%)
é menor que a suspeita original — a causa real é o custo fixo de
transação pago por um sistema que escreve todo santo dia sem exceção
(editorial, 50,9%), independente de quantos torneios existirem; a
correção certa é uma decisão de produto (cadência de conteúdo) ou um
refator de médio esforço pra ganho modesto, nenhuma delas óbvia o
bastante pra eu decidir sozinho. A poda de aposentados (item 3) agora
preserva história — confirmado, não só argumentado, com 107 linhas de
legado sobrevivendo à remoção do `AthleteProfile` de origem numa rodada de
36 meses.

Suíte de regressão completa (9 scripts + teste de invariante da Fase
2.5), teste de 10 temporadas e verificação de legado — todos rerodados
DEPOIS de todas as mudanças desta fase, todos verdes, com texto de PASS
genuíno conferido (não só código de saída). Lint limpo. Build OK (32,99s).
Nenhum arquivo de `src-tauri`/Rust tocado nesta entrega — `tauri build`
completo não rodado pelo mesmo motivo já registrado na Fase 2.5
(checagem de wiring disponível no repo, `test:dev-server-config`, PASS).

Regime-check de 5 temporadas: **segue não executado**, como instruído —
os números desta entrega mudaram o suficiente (throughput de parceria
resolvido) pra valer a pena rodá-lo agora, antes da Fase 3. Pronta pra
disparar quando confirmado.
