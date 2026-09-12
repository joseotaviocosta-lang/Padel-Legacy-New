# Fase 6.6 — Fechar as runs, testar a redistribuição, e finalmente medir o calendário

> Pré-requisito: Fase 6.5 fechou a discrepância de espera (~365-400
> dias, 1.429 era artefato de método) e implementou prioridade
> estendida + fallback de tier nos tiers fechados, mas achou que o
> efeito líquido por dupla real PIOROU em vez de melhorar (cortada
> 22,2%→28,5%, jogou 18,9%→12,7%). Ver
> [FASE-6.5-RELATORIO.md](FASE-6.5-RELATORIO.md). Esta fase decide se
> essa piora é redistribuição de exclusão (resultado ruim, mecanismo
> funcionando como desenhado) ou algo mais, registra o padrão das três
> correções que não reverteram a tendência agregada, e finalmente mede
> a curva de expansão da base — o item que a Fase 6 abriu e que quatro
> sub-fases adiaram.

## 1 — Os ociosos a mais são os mesmos indivíduos, ou outros?

Não precisou de rodada nova — `item2-regime5`/`item23-regime5` (Fase
6.5, 5 temporadas completas cada) já guardam a lista NOMINAL de quem
ficou ocioso a cada temporada (`realAthletesNeverPlayedThisSeason`).

### 1.1 — Sobreposição temporada a temporada: sobe de 0% pra 84%

| Transição | item2-isolado (prev→cur, overlap) | item2+3 (prev→cur, overlap) |
|---|---|---|
| 2026→2027 | 0→18, overlap 0 (0,0%) | 0→12, overlap 0 (0,0%) |
| 2027→2028 | 18→46, overlap 13 (28,3%) | 12→37, overlap 7 (18,9%) |
| 2028→2029 | 46→65, overlap 42 (64,6%) | 37→58, overlap 33 (56,9%) |
| 2029→2030 | 65→68, overlap 57 (**83,8%**) | 58→65, overlap 52 (**80,0%**) |

A interseção across as 5 temporadas inteiras é 0 (ninguém ficou de fora
em TODAS as 5) — número que, sozinho, sugeriria rotação saudável. Mas
essa é a leitura errada: a sobreposição ENTRE TEMPORADAS ADJACENTES
sobe de forma constante e acentuada, de 0% (2026→2027) pra 84%
(2029→2030). **Isso significa que por volta da temporada 4-5, mais de
4 em cada 5 duplas ociosas de um ano já estavam ociosas no ano
anterior** — o grupo excluído não está mais rotacionando, está
CONVERGINDO pra um núcleo cada vez mais estável. A interseção-de-5-anos
ser 0 é um artefato de olhar só as pontas (2026, quando ninguém estava
ocioso ainda, força a interseção a 0 por construção) — a métrica certa
é a sobreposição consecutiva, não a interseção do período inteiro.

### 1.2 — É a MESMA composição em duas rodadas independentes

`item2-regime5` e `item23-regime5` são rodadas DIFERENTES (mesma seed
de partida, mas o fallback do item 3 numa delas muda o consumo de
`Math.random()` a partir do primeiro disparo — as duas divergem
estruturalmente depois disso, não são comparáveis passo a passo). Ainda
assim, os conjuntos de ociosos na temporada 5 se sobrepõem em **85,3%**
(58 de 68 nomes de `item2-regime5` também aparecem em `item23-regime5`).
Isso é forte demais pra ser coincidência de duas séries de números
aleatórios diferentes — indica que QUEM fica de fora é determinado
muito mais pela IDENTIDADE/CIRCUNSTÂNCIA do atleta (rank, se a parceria
sobreviveu, timing de calendário) do que pelo caminho específico do
PRNG depois da primeira correção aplicada.

### 1.3 — Quem são: não é só "os mais fracos" — o corte atravessa todo o espectro de rank

Cruzando os nomes ociosos da temporada 5 com `fip_rank` (registro
canônico, `realAthletesRegistry.json`, 1=melhor, 99=pior):

| Faixa de rank | item2-isolado: taxa de quem JOGOU | item2+3: taxa de quem JOGOU |
|---|---|---|
| 1-10 (elite) | 70,0% (7/10 jogaram) | 90,0% (9/10 jogaram) |
| 11-30 | 35,0% (7/20) | 40,0% (8/20) |
| 31-70 | 30,0% (12/40) | 35,0% (14/40) |
| 71-99 | 20,0% (6/30) | 13,3% (4/30) |

Existe um gradiente real por rank — o topo absoluto (1-10) ainda joga
na maioria das vezes — mas ele é muito mais raso do que "só os fracos
ficam de fora" sugeriria: **mesmo fora do top-10, a MAIORIA de cada
faixa de rank fica ociosa a temporada inteira**, incluindo duplas de
rank 11-30 que representam, no registro real (FIP), jogadores de
circuito profissional estabelecido, não iniciantes. 68/100 (item2) e
65/100 (item2+3) do elenco real INTEIRO ficou sem jogar UM torneio
sequer na temporada 5 — a maioria da população real, não uma franja.

### Veredito do item 1

**Não é rotação saudável — é convergência pra uma exclusão cada vez
mais estável, que atravessa a maior parte do espectro de rank.** A
"rotatividade" que a Fase 6 media originalmente nas primeiras
temporadas (2026-2027, quando a população/duplas ainda estavam se
formando) dá lugar, por volta da temporada 4, a um padrão onde a MESMA
maioria do elenco real fica de fora ano após ano — e essa maioria não é
definida só por ser "fraca": mesmo jogadores de meio de tabela alto
(rank 11-30) têm taxa de exclusão de 60-65%.

## 2 — Redistribuição ou redução? Composição de quem entra nos tiers fechados

Instrumentação nova (`DIAG_CAPACITY`, `WorldTourLifecycle.js`): por
tier, rastreia o CONJUNTO de duplas distintas que escolheram jogar
(antes de qualquer corte) e o conjunto que efetivamente entrou em pelo
menos uma chave, acumulado desde o início do processo — a mesma
métrica do achado #32 ("duplas distintas que escolheram X e nunca
entraram em nenhuma chave"), generalizada pra qualquer tier e com
composição real/bot + rank médio de cada lado. `DIAG_PRE_ITEM2`
(também novo, temporário) recria o mundo ANTES do item 2/3 da Fase
6.5 — só o gate `minRanking===0` da Fase 5.1 roda, fallback de tier
desligado — pra comparar com a MESMA instrumentação dos dois lados.
Duas rodadas, mesma seed, população oficial, 2 temporadas cada
(`pre-item2-regime2` = antes; recorte de 2 temporadas de
`base40-regime5` = depois, ambas cumulativas desde o início do
processo, ponto de comparação justo).

### 2.1 — A fração de admitidos que é real caiu em TODOS os 5 tiers fechados

| Tier | % de quem ENTROU que é real — ANTES | DEPOIS | Δ |
|---|---|---|---|
| Gold | 40,8% | 30,8% | **-10,0pp** |
| Platinum | 50,0% | 34,3% | **-15,7pp** |
| Masters | 64,9% | 46,8% | **-18,1pp** |
| Elite | 87,5% | 57,6% | **-29,9pp** |
| Crown | 78,9% | 51,6% | **-27,3pp** |

Em todo tier fechado medido, a fração de admitidos que é real caiu — em
Elite e Crown, caiu quase pela metade. Isso é o resultado líquido mais
direto possível da pergunta do pedido: sim, a composição de quem joga
nesses tiers mudou, e mudou na direção de MENOS reais.

### 2.2 — Duas causas, não uma: mais bots tentando E bots admitidos a taxas melhores

Parte da queda em 2.1 vem de mais bots ESCOLHEREM tentar esses tiers no
mundo "depois" (mais bots qualificados existem pra tentar, população
mais madura) — não é só um viés na hora de decidir quem entra. Mas
medindo a TAXA DE ADMISSÃO condicional (de quem escolheu, quantos %
entraram), o viés aparece em 3 dos 5 tiers:

| Tier | Taxa de admissão REAL: antes→depois | Taxa de admissão BOT: antes→depois | Leitura |
|---|---|---|---|
| Gold | 75,0%→68,8% (-6,2pp) | 50,8%→39,8% (-11,0pp) | Os dois pioram (demanda cresceu pros dois) — reais perdem MENOS que bots |
| Platinum | 82,0%→77,3% (-4,7pp) | 61,7%→66,5% (**+4,8pp**) | Bot melhora, real piora — redistribuição real |
| Masters | 78,7%→77,6% (-1,1pp) | 59,1%→69,8% (**+10,7pp**) | Bot melhora MUITO, real ~estável — redistribuição clara |
| Elite | 79,0%→72,1% (-6,9pp) | 53,8%→61,0% (**+7,2pp**) | Bot melhora, real piora — redistribuição clara |
| Crown | 52,6%→48,5% (-4,1pp) | 61,5%→51,7% (-9,8pp) | Os dois pioram (Crown já tinha bot > real antes, amostra pequena) |

Em **Platinum, Masters e Elite** — 3 dos 5 tiers fechados — a taxa de
admissão condicional de um BOT que escolhe o tier melhorou depois do
item 2, enquanto a de um real ficou estável ou piorou. Isso não é
"mais bots aparecendo" — é a fila de prioridade (por rank/menos-
torneios-jogados) favorecendo, EM TERMOS RELATIVOS, quem tenta entrar
vindo de fora do topo do ranking — que no jogo é maioria bot, porque a
maioria da população é bot. Em Gold e Crown, a demanda cresceu rápido
demais pros dois lados pra a fila sozinha compensar, mas mesmo aí reais
perdem PROPORCIONALMENTE menos que bots (não é uma exclusão que bate
mais em reais especificamente nesses dois).

### 2.3 — Nota sobre `rankMedioDeQuemEntrou`: melhora aparente é parcialmente artefato de medição

O rank médio de quem ENTRA caiu (melhorou) em todo tier depois do item
2 (ex.: Gold 141→108). Isso PARECE contradizer "a fila favorece quem
tem menos torneios jogados" — mas `pairEntryRank` (a métrica usada)
filtra fora pares com rank=0 (sem ranking ainda, típico de duplas
recém-formadas) ANTES de calcular a média. Se a fatia reservada do item
2 admite desproporcionalmente pares SEM ranking ainda (que ficam de
fora da média por construção), a média dos que SOBRAM no cálculo pode
subir mesmo que a "qualidade" real de quem entra tenha caído — não
investigado a fundo por falta de tempo, registrado como ressalva: não
tratar essa métrica isolada como prova de que "quem entra ficou mais
forte".

### Veredito do item 2

**As duas leituras são verdadeiras ao mesmo tempo, e a pergunta do
pedido ("redistribuição ou redução?") tem uma resposta de duas
partes.** Sim, o mecanismo está funcionando como desenhado — ele
prioriza por fila em vez de só por força, exatamente a mudança
pretendida pelo item 2 da Fase 6.5. E sim, o efeito líquido é
redistribuição de exclusão, não redução — em Platinum, Masters e Elite
isso é mensurável diretamente (bots ganham taxa de admissão condicional,
reais não); em Gold e Crown a demanda cresceu rápido demais pros dois
lados, mas reais ainda perdem PROPORCIONALMENTE menos que bots nesses
dois. A composição de quem joga os tiers fechados mudou visivelmente
(§2.1: -10 a -30pp na fração real dos admitidos) — isso não é "o
calendário é o gargalo" como conclusão isolada; é "o calendário é
pequeno demais E a fila de prioridade, ao redistribuir quem sofre a
falta de vagas, desloca uma fatia real da diferença especificamente
pra cima dos reais" — as duas coisas juntas, não uma no lugar da
outra. Isso não invalida o item 2 (a fila é mais justa POR DESENHO —
prioridade por rank/espera é como o circuito real aloca entry list, não
um capricho) — mas explica por que a métrica de reais ociosos PIOROU
apesar do corte por tier ter caído.

## 3 — Padrão das três correções

**Três correções seguidas, três mecanismos locais diferentes, uma
tendência agregada que nenhuma delas reverteu.**

| # | Correção | Fase | Onde atua | O que melhora | O que NÃO muda |
|---|---|---|---|---|---|
| 1 | Prioridade por espera (piso reservado de 20% pro par livre há mais tempo) | 6.2 | Mercado de parcerias (`aiPartnershipLifecycle.js`, `formNewPartnerships`) | Garante que a espera do pior caso NÃO cresce sem limite (~365-400d de teto, fechado no item 1 da Fase 6.5) | O throughput é uma FRAÇÃO de um alvo mensal já pequeno (3-4 pares/mês) contra um pool de ~250-280 atletas livres — não aumenta quantas parcerias o mercado consegue formar por mês |
| 2 | Prioridade de entrada estendida (fila por rank/menos-torneios-jogados, não só pairScore) | 6.5 | Montagem de campo nos tiers fechados (`applyEntryPriority`, `WorldTourLifecycle.js`) | Corte por tier cai bastante em todo tier fechado (Gold 79%→44%) | Não aumenta `drawSize` nem o número de torneios — só reordena quem entra dentro da mesma vaga fixa; efeito líquido por dupla real PIOROU (§1-2 desta fase, item 2 da Fase 6.5) |
| 3 | Fallback de tier na mesma semana | 6.5 | Resolução semanal (`pairOptionState`, mesmo arquivo) | Compensa parte da piora do item 2 (cortada -4,4pp, jogou +2,1pp, estável nos 3 checkpoints) | Não pode inventar uma opção que `chooseTournament` não ofereceu — inerte quando só 1 tier está elegível na semana (a maioria dos casos, achado #32) |

As três correções atacam o MESMO sintoma (duplas reais não jogando) por
três ângulos diferentes — fila de formação, fila de entrada, e
realocação de quem foi cortado — e as três, cada uma dentro do seu
escopo, funcionam como desenhadas (throughput garantido, corte por
tier reduzido, parte da exclusão revertida). **Nenhuma das três mudou
o sinal da tendência agregada**: `neverPlayedThisSeasonCount` continua
subindo temporada a temporada (Fase 6.5 §2.2), a maioria do elenco real
fica ociosa por temporada inteira a partir do ano 4-5 (§1 desta fase),
e o corte por dupla real (não por tier) terminou PIOR do que antes das
correções (Fase 6.5 §2.2: cortada 22,2%→28,5%).

**Leitura**: isso é evidência razoavelmente forte de que o gargalo está
no VOLUME do calendário, não na DISTRIBUIÇÃO das vagas existentes.
Cada correção redistribui um número fixo de vagas de forma mais justa
(por espera, por fila, por realocação) — mas nenhuma cria uma vaga
nova. Numa razão de demanda/capacidade de 12,6× (Fase 6.4, agregado
Bronze-Crown) ou 4,69× só em Gold, não existe redistribuição que
resolva a exclusão — só reduz QUEM especificamente é excluído a cada
rodada, sem reduzir QUANTOS são. Registrado como conclusão desta linha
de investigação (Fases 6.2 → 6.5 → 6.5): três correções de distribuição
esgotadas sem mover a métrica agregada é o sinal mais forte até agora
de que o item 2 original da Fase 6 (expansão da base) é onde a energia
da próxima rodada precisa ir — medido no item 4 abaixo.

## 4 — Curva de expansão da base (40 / 80 / 150)

Três rodadas completas de 5 temporadas, população oficial (900+100),
mesma seed (`official-900-100-s1`), mundo já limpo (item 2/3 da Fase
6.5 permanentes, mesma versão do código nos três cenários — só
`TIER_EVENTS_PER_YEAR.Bronze/Silver` muda). Instrumentação
`DIAG_CAPACITY`, generalizada por tier, acumulada desde o início do
processo.

### 4.1 — Ociosos reais por temporada e sua inclinação: melhora, mas com retornos decrescentes

| Temporada | 40 (atual) | 80 | 150 |
|---|---|---|---|
| 2026 | 0 | 0 | 0 |
| 2027 | 12 | 12 | 6 |
| 2028 | 42 | 27 | 15 |
| 2029 | 61 | 37 | 36 |
| 2030 | **63** | **51** | **49** |
| Incrementos (Δ por temporada) | 12,30,19,2 | 12,15,10,14 | 6,9,21,13 |

O NÍVEL final cai de 63→51→49 conforme o calendário cresce — melhora
real, mas com **retornos fortemente decrescentes**: dobrar o
calendário (40→80) reduz o pior caso em 19% (63→51); quase dobrar de
novo (80→150) reduz só mais 4% (51→49). A INCLINAÇÃO (o que o pedido
pediu pra medir separado do nível) muda de forma qualitativa: a série
de 40 desacelera bruscamente no fim (+19 depois +2 — quase achatando);
as séries de 80 e 150 NÃO mostram essa desaceleração (+10 depois +14;
+21 depois +13) — ainda subindo em ritmo similar na 5ª temporada. Isso
sugere que a série de 40 pode estar se aproximando de um teto
population-dependente (a maioria de quem PODE ficar ocioso já ficou),
enquanto 80/150 ainda não chegaram lá — mas certamente não é uma queda
proporcional ao tamanho do calendário.

### 4.2 — Por tier: a base responde, os tiers fechados não

A fração de exclusão (duplas distintas que escolheram e nunca entraram
em nenhuma chave, acumulado nas 5 temporadas) conta uma história bem
mais específica que o agregado:

| Tier | Exclusão (todos): 40/80/150 | Exclusão (só reais): 40/80/150 |
|---|---|---|
| **Bronze** | 44,7% / 27,7% / **19,0%** | 63,1% / 46,1% / **34,0%** |
| **Silver** | 56,1% / 37,3% / **14,7%** | 69,1% / 46,2% / **21,8%** |
| Gold | 51,2% / 52,5% / 53,8% | 45,1% / 31,3% / 36,1% |
| Platinum | 30,4% / 30,0% / 27,2% | 37,1% / 24,8% / 27,9% |
| Masters | 25,4% / 28,6% / **38,6%** | 29,8% / 30,3% / **38,8%** |
| Elite | 30,0% / 28,1% / 29,8% | 31,3% / 26,5% / 34,0% |
| Crown | 43,5% / 42,5% / 42,4% | 51,9% / 49,0% / 55,2% |

**Bronze e Silver — cuja capacidade é exatamente o que o experimento
mexeu — respondem de forma forte e monotônica**: exclusão cai pela
metade ou mais em ambos, pra reais e pro campo geral. Fora deles,
**nenhum tier fechado melhora de forma consistente** — Gold fica
estável (~52-54%), Platinum e Elite oscilam sem tendência clara,
Crown fica praticamente parado, e **Masters PIORA** conforme o
calendário cresce (25,4%→38,6% geral, 29,8%→38,8% só reais) — o
oposto do que "mais calendário ajuda" prediria.

### 4.3 — Por que os tiers fechados não respondem: `OPEN_TIER_CEILING` tranca a maioria dos reais fora da base

Não é um mistério: `OPEN_TIER_CEILING=150` (`EntryManager.js`) barra
qualquer dupla já ranqueada no top-150 do mundo de Bronze/Silver —
existe pra impedir que duplas fortes roubem vaga de entrada, mas como
efeito colateral, TRANCA a maioria das duplas reais estabelecidas fora
da base, não importa o tamanho dela. Confirmado pelo próprio dado desta
rodada: das duplas reais distintas que alguma vez ESCOLHERAM cada tier
em 5 temporadas inteiras (`base40-regime5`), só **34** tentaram Bronze
e **34** tentaram Silver — contra **77 (Gold), 76 (Masters), 75
(Platinum), 68 (Elite), 66 (Crown)**. A maioria esmagadora das duplas
reais nunca considera a base como opção — o ranking delas já as
qualifica (ou as tranca) pra cima. **Expandir Bronze/Silver ajuda quem
JÁ PODE jogar lá — bots novos e a fatia pequena de reais ainda sem
ranking — mas não move a agulha pra maioria das duplas reais
estabelecidas, que competem inteiramente dentro de Gold-Crown, onde a
capacidade não mudou em nenhum dos 3 cenários (por desenho do
experimento).**

### 4.4 — Resposta à pergunta decisiva: a exclusão cede, ou fica travada como na Fase 5?

**Cede — mas só onde a capacidade realmente muda.** Na Fase 5, a
exclusão em Bronze/Silver ficou travada em ~67% apesar da capacidade
triplicar (40→150), porque o mecanismo de seleção (sort+slice sem
fila) sempre preenchia as vagas novas com a MESMA fatia de maior
`overall_rating` — o problema era seleção, não volume. Agora, com o
mundo limpo (fila por prioridade desde a Fase 6.5), a MESMA expansão de
capacidade em Bronze/Silver produz queda real e substancial na exclusão
(56%→15% em Silver) — confirma que ali, hoje, o calendário genuinamente
era o gargalo. **Mas nos tiers fechados — onde a maioria das duplas
reais realmente compete — a exclusão NÃO cede com calendário maior,
porque este experimento (por desenho, "Gold pra cima intocado") nunca
tocou a capacidade deles.** A pergunta "existe uma causa que ainda não
vimos" tem uma resposta parcial: não é uma causa nova — é a MESMA causa
(demanda/capacidade) atuando numa parte do calendário que a expansão da
base não alcança. Expandir só a base não é o mesmo experimento que
expandir TUDO — e este relatório não testou expandir Gold-Crown (fora
do escopo pedido, "Gold pra cima intocado nos 3 cenários").

### 4.5 — Outros efeitos observados (não pedidos, mas relevantes)

- **Chaves incompletas**: baixas e estáveis nos 3 cenários (0-2 por
  temporada em ~80-190 torneios), exceto um pico isolado no cenário 150
  na temporada 1 (12/189, bootstrap populacional, autocorrige a partir
  da temporada 2) — o preenchimento de campo nunca é o fator limitante
  em nenhum tamanho testado, mesma leitura do achado #32.
- **Dominância real cai com calendário maior**: títulos 100%-reais caem
  de 51,5% (40) pra 45,6% (80) pra 34,7% (150) do total; reais no
  Top 20 de fim de temporada caem de 14/20 (40) pra 12/20 (80 e 150).
  Calendário maior dá a BOTS mais chances de acumular pontos de
  ranking/títulos também — um trade-off que o pedido não pautou
  explicitamente, mas que qualquer decisão de expandir o calendário
  precisa considerar.
- **Custo por temporada**: as três rodadas foram lançadas ao mesmo
  tempo, concorrendo entre si pelos mesmos núcleos — tempo de parede
  não é comparável de forma limpa nesta medição (contenção de CPU
  variável). Achado #32 já mediu que 80→150 (quase dobrar Bronze+Silver)
  custa só ~+5% de tempo de parede numa rodada isolada — sem motivo pra
  achar que isso mudou.

### Veredito do item 4

**Não escolho o número — a curva mostra duas histórias diferentes
dependendo de qual parte do calendário se olha.** Pra Bronze/Silver, a
exclusão cede com calendário maior, de forma forte e monotônica — o
calendário GENUINAMENTE é o gargalo ali, hoje, com o mundo limpo. Pra
Gold-Crown — onde a maioria das duplas reais realmente compete, porque
`OPEN_TIER_CEILING` as tranca fora da base — a exclusão NÃO respondeu a
nenhum dos 3 cenários, porque a capacidade deles nunca mudou. O
agregado (ociosos reais por temporada) melhora com retornos
decrescentes (63→51→49) porque mistura as duas histórias — a maior
parte da melhora vem da fatia pequena de reais que consegue usar a base
expandida, não da maioria que não consegue. **Se a pergunta é "expandir
o calendário resolve o problema dos reais ociosos", a resposta correta
é: só parcialmente, e só se a expansão incluir os tiers fechados — não
só a base.**

## 5 — Verificação do teto de código

Confirmado por leitura de código ANTES de rodar qualquer cenário,
como pedido. O achado #32 (Fase 5) documentou o teto:
`resolveCompletedWorldTourEvents` busca torneios pendentes com
`entities.Tournament.list('-start_date', 300)` (`WorldTourLifecycle.js:224`
na numeração atual) — limite fixo de 300 linhas; `ensureFutureTournamentsInternal`
(`career.js`) cria calendário com 15 meses de antecedência a cada
virada de mês. Acima de ~240 torneios/temporada, os eventos FUTUROS
(ainda não pendentes, mas já criados pelo horizonte de 15 meses)
ocupam as 300 posições da consulta sozinhos e empurram os pendentes de
verdade pra fora da janela — a função retorna `{resolved:0}`
silenciosamente, todo santo dia, sem erro nem aviso.

`TIER_EVENTS_PER_YEAR` (`circuitCatalog.js`) hoje: `Bronze:24,
Silver:16, Gold:8, Platinum:6, Masters:10, Elite:10, Crown:4` — os
MESMOS valores medidos no achado #32 (nenhuma fase entre a 5 e a 6.6
mexeu nesse config). Total do topo (Gold-Crown): 8+6+10+10+4=**38**;
mais 2 eventos únicos de fim de temporada (Circuit Finals + Legacy
Finals) = 40 eventos fixos fora da base.

| Cenário | Base (Bronze+Silver) | Total/temporada (base+topo+finais) | Testar? |
|---|---|---|---|
| 40 (atual) | 24+16=40 | 40+38+2=**80** | Sim — dado já existe (`item23-regime5`, Fase 6.5) |
| 80 | 48+32=80 | 80+38+2=**120** | Sim |
| 150 | 90+60=150 | 150+38+2=**190** | Sim — acima disso o achado #32 já viu o cenário 250 (288/temporada) quebrar por completo (0 torneios resolvidos, qualquer tier, sem aviso) |
| 250 | 150+100=250 | 250+38+2=**290** | **Não** — muito acima do teto de ~240/temporada; repetiria o erro da Fase 5 (o cenário virou achado de teto de código em vez de dado de capacidade) |

Todos os 3 cenários testados (40/80/150) ficam abaixo do teto de ~240
torneios/temporada — dentro da margem seguro-por-código, não só por
extrapolação. Implementado como override temporário
(`DIAG_BASE_EVENTS=80|150` em `circuitCatalog.js`, reverter depois de
medir) que sobrescreve só `Bronze`/`Silver`, mantendo a MESMA proporção
3:2 já usada (24:16) e todo o resto do calendário intocado — Gold pra
cima nunca muda entre os 3 cenários, como pedido.

## 6 — Validação

Toda instrumentação temporária desta fase e da Fase 6.5 (que continuava
presente no código, ainda não revertida quando esta fase começou) foi
removida antes do commit: `DIAG_SELECT`/`diagChoiceByPair`
(`WorldTourLifecycle.js`), `DIAG_WAIT2`/`diagWaitTail`
(`aiPartnershipLifecycle.js`), `DIAG_CAPACITY`/`getDiagCapacitySnapshot`
(`WorldTourLifecycle.js` + import no harness), `DIAG_PRE_ITEM2`
(`WorldTourLifecycle.js`), `DIAG_BASE_EVENTS`/`DIAG_BASE_EVENTS_OVERRIDE`
(`circuitCatalog.js`) — `grep` confirma zero ocorrências restantes nos
4 arquivos tocados. As correções PERMANENTES da Fase 6.5
(`applyEntryPriority` sem gate, `pairOptionState`/fallback de tier) e o
mecanismo de retomada (`--resumeFrom`, `writeResumeState`) continuam
intactos — só a instrumentação de medição saiu.

- `node --check` nos 4 arquivos tocados — OK.
- `npm run lint` — limpo.
- `npm run build` — OK (mesmo aviso pré-existente de chunk >500kB, não
  relacionado).
- Suíte de regressão (`rc-qa-suite-v36.mjs`) — **33/36, score 92/100**,
  as MESMAS 3 falhas pré-existentes (`test:rc-gameplay-balance`,
  `test:career-pace`, `test:ui-quality`), nenhuma relacionada a este
  trabalho — confirmado por nome exato das falhas.
- `reports/BETA-AUDIT-v36.1.{json,md}`, `reports/rc-qa-latest.{json,md}`,
  `reports/rc-sprint-1/*.json` (auto-regenerados pela suíte) revertidos
  com `git checkout HEAD --` antes do commit.
- `src-tauri/` — intocado (`git status --porcelain -- src-tauri/`
  vazio).

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | FASE-6.5-RELATORIO.md completo, três runs em 5/5 | ✅ feito |
| 2 | Resposta do item 2 — redistribuição ou redução, com identidade | ✅ feito — as duas coisas ao mesmo tempo: fração de admitidos que é real cai em todo tier fechado (-10 a -30pp); em Platinum/Masters/Elite é redistribuição mensurável (bot melhora, real não); em Gold/Crown os dois pioram mas real perde proporcionalmente menos |
| 3 | Padrão das três correções registrado | ✅ feito — três correções de distribuição, nenhuma reverteu a tendência agregada, aponta pro volume do calendário |
| 4 | Curva de expansão nos três cenários, sem escolher o número | ✅ feito — Bronze/Silver respondem forte e monotonicamente (56%→15% exclusão em Silver); Gold-Crown não respondem (capacidade intocada por desenho); agregado melhora com retornos decrescentes (63→51→49) porque mistura as duas histórias |
| 5 | Suíte, lint, build, Tauri OK, commit | ✅ feito — 33/36 (92/100), mesmas 3 falhas pré-existentes; `src-tauri/` intocado |
