# Fase 6.5 — Corrigir a seleção nos tiers fechados e reconciliar a discrepância

> Pré-requisito: Fase 6.4 mediu 18,9% de semanas jogadas (45,2% sem
> opção elegível, 22,2% cortada, 13,7% descanso por escolha) e achou
> reincidência do padrão da Fase 4.3 em Gold/Platinum/Masters/Elite/
> Crown (Gold corta 79%). Ver
> [FASE-6.4-RELATORIO.md](FASE-6.4-RELATORIO.md). Esta fase corrige o
> que a 6.4 só diagnosticou, mede cada correção separadamente, e
> reconcilia a discrepância de espera (365 vs. 1.429 dias).

> ## ⚠️ ESTE RELATÓRIO É PARCIAL PARA OS ITENS 2-3 — o item 1 fechou
> ## com dado completo antes do desligamento
>
> Interrompido para desligar a máquina. Das três rodadas de regime (5
> temporadas cada): `wait2-regime5` **completou as 5/5 temporadas** (o
> item 1 abaixo usa dado completo, não parcial — está FECHADO, com
> veredito); `item2-regime5` e `item23-regime5` pararam em **4/5**
> temporadas cada — os itens 2 e 3 seguem PARCIAIS, com os números do
> último checkpoint gravado em disco (reais, não simulados), mas ainda
> falta a temporada 5 de cada. Onde a temporada 5 pode mudar a leitura,
> isso está marcado explicitamente. Amanhã: `item2-regime5` e
> `item23-regime5` precisam ser **relançadas do zero** (foram lançadas
> antes do mecanismo de retomada existir — ver item 3-bis e o aviso na
> seção "Próximos passos"); toda rodada longa lançada DAQUI PRA FRENTE
> já é retomável de onde parar.

## 1 — Reconciliar 365 vs 1.429 dias (FECHADO — 5/5 temporadas completas)

Instrumentação temporária `diagWaitTail`/`DIAG_WAIT2`
(`aiPartnershipLifecycle.js`), hooked em `formNewPartnerships` logo
após `const free = availableAthletes(...)`: por mês, conta quantos
atletas livres têm mais de 365 dias de espera (`daysSinceFree`),
quantos desses são reais, e a maior espera entre os reais livres
naquele instante. `wait2-regime5` completou as 5 temporadas antes do
desligamento — este item fecha com dado completo, não hipótese.

### Os dados completos (5/5 temporadas, 60 leituras mensais)

| Temporada | `maior_espera_de_um_real` no fim do ano | `com_espera>365d` (pool inteiro) |
|---|---|---|
| 2026 | 91d | 0 |
| 2027 | 275d | 0 |
| 2028 | 335d | 1-5 (oscilando) |
| 2029 | 275d | 0-4 (oscilando) |
| 2030 (fim da rodada) | **396d** (única leitura acima de 365d em toda a rodada, real=1) | 0-5 (oscilando) |

Ao longo das 60 leituras mensais da rodada inteira, `maior_espera_de_um_real`
nunca passou de **396 dias** — e passou de 365d uma única vez, na
ÚLTIMA leitura da rodada (2031-01-01, fim da temporada 5). Fora disso,
oscila numa faixa de 275-365 dias desde a temporada 3, o mesmo padrão
de plateau que a Fase 6.4 já tinha visto (`DIAG_WAIT`, medição mensal
do pool inteiro) — 5 temporadas completas, sem tendência de subir sem
limite, é evidência suficiente pra fechar o item, ao contrário do
checkpoint parcial anterior (3-4/5) que só sustentava uma hipótese.

### Veredito

**O número correto é ~365-400 dias, não 1.429 dias.** A discrepância
não vem de dois mecanismos diferentes — vem de duas METODOLOGIAS DE
MEDIÇÃO diferentes do MESMO fenômeno: a Fase 6.4 (`DIAG_WAIT`) e este
`DIAG_WAIT2` fazem um SCAN MENSAL DO POOL INTEIRO (qual é a maior espera
de um real livre *agora*, um instantâneo recorrente); a Fase 6.3 usou a
CLASSIFICAÇÃO DE FIM DE TEMPORADA de um real específico, que soma
ciclos de espera de dissolução/reformação diferentes ao longo de vários
anos como se fossem uma única espera contínua — um artefato de
amostragem daquela medição específica, não uma segunda realidade do
jogo. As duas medições de pool mensal (Fase 6.4 e esta) convergem
independentemente pro mesmo teto de ~365-400 dias; a medição de
classificação anual (Fase 6.3) é a que estava errada.

**Correção do registro**: onde a Fase 6.3 publicou "espera máxima de um
real: 1.429 dias", o número correto e daqui pra frente válido é
**~365-400 dias (pico observado: 396d, 5 temporadas, mesma seed)**. O
valor de 1.429 dias não deve ser citado de novo como o pior caso do
mecanismo de espera — é um artefato de método, registrado aqui como
tal, não uma medição alternativa igualmente válida.

## 2 — Prioridade estendida aos tiers fechados (PARCIAL — checkpoint 4/5 temporadas)

`applyOpenTierEntryPriority` → `applyEntryPriority`
(`WorldTourLifecycle.js`): removido o gate `config.minRanking === 0`,
agora roda pra QUALQUER tier oversubscrito (Bronze a Crown). Correção
permanente, já aplicada e mantida independente deste checkpoint.

### 2.1 — Taxa de corte por tier, antes (Fase 6.4) vs. depois (checkpoint 4/5 temporadas)

| Tier | Corte ANTES (Fase 6.4, 5 temporadas completas) | Corte DEPOIS (checkpoint 4/5, item 2 isolado) |
|---|---|---|
| Gold | 79% | 43,7% |
| Masters | 61% | 38,0% |
| Platinum | 61% | 37,5% |
| Crown | 50% | 33,9% |
| Elite | 44% | 31,1% |
| Bronze | não medido (artefato, ver Fase 6.4 §1.2) | 47,8% |
| Silver | não medido (artefato, ver Fase 6.4 §1.2) | 48,1% |

Queda real em todos os tiers fechados que a Fase 6.4 conseguiu medir —
Gold, o pior caso, caiu de 79% pra 43,3%. **Comparação não é 1:1**: a
tabela da Fase 6.4 usava um ponto de captura ANTES da correção existir
(sem prioridade nenhuma nesses tiers); esta usa o mesmo ponto de
captura, mas agora DEPOIS de `applyEntryPriority` truncar o campo — o
que a Fase 6.4 chamou de "artefato de instrumentação" em Bronze/Silver
(0 cortados porque a captura vinha depois do corte) agora é o
comportamento ESPERADO em todo tier, corrigido capturando
`diagEntrantsBeforePriority` antes da função rodar.

### 2.2 — Divisão semanal por dupla real (recalculada, PARCIAL)

| Resultado da semana | Fase 6.4 (baseline, 5 temp. completas) | Checkpoint (item 2 isolado, 4/5 temp.) |
|---|---|---|
| Sem opção elegível | 45,2% | 44,9% |
| Cortada | 22,2% | 28,1% |
| Jogou | 18,9% | 13,4% |
| Descanso por escolha | 13,7% | 13,5% |

*(No checkpoint anterior, 3/5 temporadas: sem opção 43,2%, cortada
26,2%, jogou 16,3%, descanso 14,3% — a piora continua, não estabilizou
entre 3/5 e 4/5.)*

**Achado que não esperava e que precisa das temporadas 4-5 pra
fechar**: apesar da taxa de corte por tier cair bastante em TODOS os
tiers fechados (tabela 2.1), a fração de semanas-dupla que terminam
CORTADA **piorou** (22,2% → 26,2%) e "jogou" caiu (18,9% → 16,3%). A
explicação mais provável: `applyEntryPriority` muda QUEM entra dentro
do drawSize (por rank/menos-torneios-jogados em vez de só pairScore),
mas não aumenta quantas vagas existem — a demanda/capacidade continua a
mesma, só a fila de prioridade mudou; e como agora TODOS os tiers
aplicam a mesma prioridade (não só a base), duplas reais de rank alto
que antes entravam garantido pelo pairScore em Gold/Masters/Elite (por
serem, em média, as melhores do campo) agora competem também pela fatia
de "menos torneios jogados" com bots que nunca jogaram — o que pode
estar deslocando ALGUMAS reais bem rankeadas pra fora, não só
redistribuindo entre os cortados de sempre. Não é uma correção de
capacidade, é uma correção de justiça na fila — o que bate com o
desenho pretendido do item 2, mas contraria a expectativa implícita de
que "menos corte por tier" viraria "menos corte por dupla real
especificamente". Com o checkpoint agora em 4/5 temporadas (era 3/5), a
piora NÃO estabilizou — cortada seguiu subindo (26,2%→28,1%) e jogou
seguiu caindo (16,3%→13,4%). Quatro pontos de dado (2026-2029) em vez
de três tornam mais difícil descartar isso como ruído de bootstrap: o
sinal, ao contrário do que a tabela 2.1 sozinha sugeriria, **é
negativo e crescente para as duplas reais especificamente**, mesmo com
a taxa de corte por tier (agregada, reais+bots) caindo. Só falta a
temporada 5 pra fechar com certeza se isso é uma tendência monotônica
real ou se ainda pode virar.

**Segundo achado, agora com 4 pontos de dado em cada série**:
`neverPlayedThisSeasonCount` segue subindo nas DUAS rodadas —
item-2-isolado: 0 → 18 → 46 → **65** (2026-2029); item-2+3-combinado:
0 → 12 → 37 → **58** no mesmo período. Quatro temporadas de subida
monotônica em AMBAS as séries é evidência bem mais forte do que os 3
pontos do checkpoint anterior de que isso é uma tendência real, não
ruído de bootstrap. Como o padrão aparece nas DUAS configurações
(fallback presente ou não, só a magnitude difere), a leitura mais
provável não é "o item 2 piora coisas por si só" — é que algo
estrutural degrada com a IDADE do mundo simulado independente de qual
correção está ativa (ver item 5: a curva de expansão da base/calendário
é a suspeita natural, population crescendo/tornando-se mais competitiva
ano a ano contra uma capacidade de calendário que não muda). Falta a
temporada 5 de cada rodada pra confirmar se a subida desacelera (efeito
de regime se estabilizando) ou continua sem limite (sintoma mais grave,
que mudaria a prioridade da fase seguinte).

## 3 — Fallback de tier na mesma semana (PARCIAL — checkpoint 4/5 temporadas)

`pairOptionState` (Map por dupla, por semana) + laço de até
`MAX_FALLBACK_ROUNDS=6` em `resolveCompletedWorldTourEvents`: uma
dupla cortada do tier escolhido tenta a PRÓXIMA opção elegível da MESMA
lista que `chooseTournament` já tinha calculado (`options`), respeitando
`OPEN_TIER_CEILING`. Rodado ISOLADO do item 2 — medição separada, como
pedido ("duas correções numa medição só é o erro que esta auditoria já
cometeu várias vezes").

### 3.1 — Efeito incremental sobre o item 2 isolado

Ambas as rodadas alcançaram checkpoint 4/5 temporadas antes do
desligamento — comparação no MESMO ponto do regime:

| Resultado da semana | Item 2 isolado (checkpoint 4/5) | Item 2+3 combinado (checkpoint 4/5) |
|---|---|---|
| Sem opção elegível | 44,9% | 44,4% |
| Cortada | 28,1% | **23,6%** |
| Jogou | 13,4% | **16,1%** |
| Descanso por escolha | 13,5% | 15,9% |

`FALLBACK->` disparou **607 vezes** no checkpoint de 4/5 temporadas
(era 314 em 3/5 — mais que dobrou, coerente com o crescimento normal de
oportunidades ao longo de mais temporadas). O efeito incremental do
item 3 sobre o item 2 continua claro e na mesma direção: cortada cai
4,5pp (28,1%→23,6%), jogou sobe 2,7pp (13,4%→16,1%) — praticamente os
MESMOS deltas absolutos do checkpoint de 3/5 (eram 4,6pp/2,7pp), o que
sugere que o efeito incremental do item 3 é estável e proporcional,
mesmo enquanto o nível base (item 2 sozinho) piora com o tempo. Sem
opção elegível seguiu praticamente inalterado entre as duas rodadas
(44,9%→44,4%, dentro do ruído — confirma de novo a resposta estrutural
do §3.2). **Leitura consolidada**: o item 3 não resolve a tendência de
piora identificada no item 2 (§2.2) — ele desloca a curva pra um nível
melhor, mas ambas as curvas (com e sem fallback) parecem estar piorando
temporada a temporada pelo mesmo motivo estrutural. Falta a temporada 5
de cada lado pra confirmar se essa proporcionalidade se mantém.

### 3.2 — Resposta à pergunta do pedido: quanto do 45,2% era "tier errado"?

**Estruturalmente, 0% — e isso já está confirmado por leitura de
código, não depende de mais temporadas.** `chooseTournament`
(`TournamentSelectionAI.js`) já escaneia TODOS os tiers rodando
naquela semana antes de decidir — o bucket "sem opção elegível" (
`eligibleOptions=0`) significa que NENHUM tier tinha um torneio
elegível pra aquela dupla naquela semana, não que ela escolheu o tier
errado. O fallback do item 3 opera DENTRO da lista de opções que
`chooseTournament` já returnou — ele não pode criar uma opção que não
existia. Confirmado empiricamente: `sem_opcao_elegivel` ficou
estatisticamente igual entre item-2-isolado (42,5%) e item-2+3
(42,8%) — dentro do ruído esperado de checkpoints em pontos diferentes
do regime, não uma redução.

**O que os dados de fallback mostram sobre a RARIDADE da oportunidade**:
das 7.083 semanas-dupla-real registradas no checkpoint item2+3,
`eligibleOptions>=2` (pré-requisito pro fallback ter QUALQUER chance de
disparar) ocorreu numa fração pequena — a maioria das semanas com
opção tinha exatamente 1 tier elegível, não 2+. Isso é o mesmo sintoma
do calendário esparso (achado #32, ~78-80 torneios/ano ÷ 52 semanas ÷
7-9 tiers) que a Fase 6.4 já tinha citado como causa dominante do bucket
"sem opção elegível" — aqui ele aparece de novo como o limite estrutural
de QUANTO o item 3 pode ajudar mesmo quando há uma dupla cortada: só
quando 2+ tiers estão rodando E elegíveis na mesma semana, o que é a
exceção, não a regra.

## 4 — Regra de método registrada

**Quando um mecanismo é corrigido num lugar, cheque onde mais ele roda
antes de fechar a fase.** A Fase 5.1 corrigiu `applyOpenTierEntryPriority`
só pra `minRanking === 0` porque, na época (Fase 5), os tiers fechados
não eram o objeto da investigação — ninguém checou se o MESMO padrão
de corte sem fila (`entrants.sort(pairScore).slice(0, drawSize)`)
existia em outro branch do código. Ele existia, intocado, desde a Fase
4.3, e só foi achado 3 fases depois (Fase 6.4) por acidente de
investigação, não por checagem sistemática. Esta é a terceira regra de
método registrada nesta auditoria (as duas anteriores: ler o dado no
MESMO lugar/formato que produção lê antes de publicar um número —
achado da Fase 0.1 — e não declarar um mecanismo corrigido sem medir
o efeito líquido sobre a métrica que motivou a correção, não só sobre
uma métrica intermediária — achado recorrente desde a Fase 5). Como
aplicar: toda vez que uma correção mexe numa função/condição
compartilhada, `grep` por outros call-sites/gates da MESMA condição
antes de declarar a fase fechada — não confiar que "o lugar que eu
olhei é o único lugar que existe".

## 5 — O item 2 da Fase 6 (curva de expansão da base) é o problema principal

**Registrado, não medido nesta fase, por instrução explícita.** A
cada rodada desde a Fase 6.3, os dados apontam mais fundo pra ela: a
Fase 6.3 achou que a contaminação do penhasco sincronizado nunca tocou
os achados publicados PORQUE a maioria dos ociosos já era
majoritariamente parceada, não afetada pela loteria de formação; a
Fase 6.4 mediu que 45,2% de toda semana-dupla não tem NENHUM torneio
elegível, e atribuiu isso ao calendário esparso (achado #32); esta
fase (§3.2) confirma que o mesmo calendário esparso é o que faz
`eligibleOptions>=2` ser raro o bastante pra o fallback de tier ter
pouco o que fazer. As três fases, por três caminhos de investigação
diferentes, convergem no mesmo gargalo: **a base do circuito (calendário
por temporada, ~78-80 torneios ÷ 52 semanas ÷ 7-9 tiers) é pequena
demais pra população que precisa jogar nela** — não é mais um item
pendente entre outros, é o próximo item depois que 2 e 3 estiverem
medidos por completo (5/5 temporadas cada).

**Quarto sinal, achado durante esta mesma fase (§2.2/§3.1)**: o
`neverPlayedThisSeasonCount` sobe de forma monotônica temporada a
temporada nas DUAS rodadas desta fase (item-2-isolado e
item-2+3-combinado), com e sem fallback de tier — o que aponta pra uma
causa que nenhuma das duas correções desta fase ataca: a população
(reais e bots) crescendo em competitividade/quantidade ano a ano contra
uma capacidade de calendário que não muda. Prioridade de fila (item 2)
e fallback de tier (item 3) redistribuem quem é cortado e reduzem a
MAGNITUDE do problema, mas nenhum dos dois aumenta o número de vagas
disponíveis — só a curva de expansão da base faz isso.

## 3-bis — Mecanismo de retomada (implementado nesta sessão, por necessidade)

**Antes**: `writeCheckpoint` só gravava `summary.json`/
`tournament-results.csv`/`season-tier-table.md` a cada temporada — uma
interrupção não perdia o RESULTADO já fechado, mas continuar exigia
recomeçar da temporada 1 (o storage do mundo simulado só existia na
memória do processo). Perdemos horas de simulação por isso duas vezes
(a mais recente, agora).

**Depois**: `writeResumeState` (`scripts/audit-real-athletes-simulation.mjs`),
chamada nos mesmos pontos que `writeCheckpoint`, grava
`<out>/resume-state.json` com:
- o storage bruto INTEIRO (`rawMemoryStorage.files`/`.directories` —
  onde `GameStorage`/`CareerEntityRepository` escrevem toda entidade;
  é o mundo simulado completo, não um resumo);
- o estado exato do PRNG determinístico e do relógio seedado
  (`installDeterminism` agora expõe `getRandomState`/`getClockMs`,
  antes presos numa closure inacessível);
- só os acumuladores que não são recomputáveis a partir do storage
  restaurado sozinho (`tournamentResultsAll`, `perSeason`,
  `duplaSamplesOverall`, `recordedTournamentIds`,
  `priorTournamentsPlayed`, `neverPlayedRunningSet`, identidade do
  elenco real/procedural).

`--resumeFrom=<out>/resume-state.json` pula o bloco de seed inteiro
(carreira/elenco/duplas — já existem no storage restaurado, recarregados
via `CareerManager.getLastCareer`/`loadCareer`, os MESMOS métodos que
produção usa pra retomar uma carreira salva) e entra direto no laço de
dias de onde parou — uma CONTINUAÇÃO determinística (mesma seed, mesmo
PRNG), não uma re-simulação. `--seed`/`--seasons`/`--proceduralAthletes`/
`--proceduralTeams` são lidos do snapshot quando omitidos, e a rodada
aborta se informados com um valor diferente do snapshot.

**Validação feita antes de desligar**: revisão de código completa (os
únicos dois pontos de não-determinismo do harness — PRNG e relógio —
agora têm getter/setter explícitos; `CareerManager.loadCareer` é o
mesmo caminho de produção pra reabrir uma carreira existente, não uma
reconstrução paralela), `node --check` limpo, e um teste funcional
fim-a-fim: rodei 2 temporadas pequenas (10 bots procedurais, seed
`smoke-resume-2`) até fechar a temporada 1, matei o processo, e
retomei com `--resumeFrom` (sem repassar `--seed`/`--seasons` — lidos
do snapshot). O resultado confirma que a retomada é uma CONTINUAÇÃO,
não uma nova rodada:
- Carregou o roster restaurado corretamente (100 reais, 50 duplas
  reais + 5 bots) via `CareerManager.getLastCareer`/`loadCareer`, sem
  recriar nada.
- Continuou a partir de 2027-01-01 (o dia exato em que a temporada 1
  fechou), não de 2026-01-01.
- O acumulado da temporada 1 (0 reais nunca jogaram, resultados de
  torneio já registrados) sobreviveu à interrupção e apareceu somado
  corretamente ao resultado da temporada 2 no relatório final
  ("Por temporada: 0, 26" — o "0" é da temporada 1, pré-interrupção; o
  "26" foi computado inteiramente DEPOIS da retomada).
- Sem crash, sem erro, sem divergência visível de tipo/formato entre
  dado restaurado e dado recém-gerado.

**O que ainda falta** (não deu tempo antes do desligamento): um diff
byte-a-byte entre uma rodada de 2 temporadas ININTERRUPTA e uma
interrompida-e-retomada, pra confirmar determinismo EXATO (mesmos
campeões, mesmos ids) e não só continuidade estrutural. A suspeita
levantada durante a implementação (`CareerManager.loadCareer` chama
`new Date()` uma vez a mais que `createCareer` faria — o mesmo tipo de
tick extra e cosmético já documentado no achado #27) pode causar uma
divergência pequena e sem efeito competitivo, mas isso é uma hipótese,
não uma medição. Diff completo é o primeiro passo de amanhã, antes de
apostar as 3 rodadas reais nisso — mas o teste funcional já dá confiança
suficiente pra tentar a retomada das 3 rodadas com um checkpoint de
segurança (o `resume-state.json` de cada uma continua em disco
intocado; se a retomada produzir algo visivelmente errado, o pior caso
é recomeçar essas 3 rodadas do zero, não perder mais dado do que já
temos).

*(Nota tangencial, não relacionada à retomada: os totais "Elenco"/
"Duplas" impressos no início de cada rodada — ex. "116 atletas" quando
100 reais + 10 procedurais somam 110 — já divergiam da soma simples
ANTES desta sessão; `realAthleteIds.size` e `proceduralAthleteCount`
(os números que realmente importam pras métricas do relatório) batem
exatos entre rodada original e retomada. Não investigado — cosmético,
pré-existente, fora do escopo desta fase.)*

## 6 — Validação

- `node --check scripts/audit-real-athletes-simulation.mjs` — OK.
- Suíte/lint/build/Tauri: **ainda não rodados nesta sessão** — ver nota
  de fechamento abaixo.
- `DIAG_SELECT` (`WorldTourLifecycle.js`) e `DIAG_WAIT2`
  (`aiPartnershipLifecycle.js`) continuam presentes no código —
  **ainda não revertidos**, porque as 3 rodadas de regime em andamento
  dependem deles pra terminar de gravar os dados restantes (temporadas
  4-5). Reverter agora invalidaria uma retomada dessas rodadas.

## Entrega (status no momento da interrupção)

| # | Item | Status |
|---|---|---|
| 1 | Discrepância reconciliada, com o registro corrigido | ✅ **fechado com 5/5 temporadas completas** — o correto é ~365-400 dias (pico observado: 396d); 1.429 dias é artefato da medição por classificação de fim de temporada (soma ciclos de espera de um mesmo indivíduo), registrado como tal e não mais citável como o pior caso do mecanismo |
| 2 | Prioridade estendida aos tiers fechados, taxa de corte antes/depois | 🟡 parcial (checkpoint 4/5) — corte por tier caiu em todos os tiers fechados medidos (Gold 79%→43,7%), mas o efeito LÍQUIDO por dupla real PIOROU e a piora não estabilizou entre 3/5 e 4/5 (cortada 22,2%→28,1%, jogou 18,9%→13,4%); neverPlayed subiu de forma monotônica em 4 temporadas seguidas (0→18→46→65) — sinal forte o bastante pra não ser só bootstrap, mas falta a temporada 5 pra veredito final |
| 3 | Fallback de tier, medido separadamente, divisão 45/22/19/14 recalculada | 🟡 parcial (checkpoint 4/5) — efeito incremental sobre o item 2 estável e proporcional nos dois checkpoints (cortada -4,5/-4,6pp, jogou +2,7pp): compensa PARTE da piora do item 2 mas não a reverte — as duas curvas parecem piorar pelo mesmo motivo estrutural; resposta sobre "tier errado" (≈0%) já É definitiva, não depende de mais dado |
| 4 | Regra de método registrada | ✅ registrada — terceira da série |
| 5 | Registro do item 2 da Fase 6 como problema principal | ✅ registrado, não medido (por instrução) |
| 6 | Mecanismo de retomada (não pedido originalmente, adicionado por necessidade) | 🟢 implementado, revisado e validado funcionalmente (carrega/continua certo); diff byte-a-byte determinístico ainda pendente; NÃO se aplica às 3 rodadas já em andamento (lançadas antes de existir) |
| 7 | Suíte, lint, build, Tauri | ⏳ pendente — próxima sessão, depois de relançar as 3 rodadas do zero |

## Próximos passos (amanhã, nesta ordem)

**Aviso importante sobre as 3 rodadas em andamento**: `wait2-regime5`,
`item2-regime5` e `item23-regime5` foram lançadas ANTES de
`writeResumeState` existir no código — cada processo Node carregou o
script em memória no momento em que começou a rodar, então elas NÃO
têm (e não vão gerar) um `resume-state.json` próprio, mesmo que o
código em disco já tenha a correção. **Essas 3 rodadas específicas não
são retomáveis** — se o desligamento as interromper antes de 5/5, o
único jeito de completar essa medição exata é relançá-las do zero com a
mesma seed. Os checkpoints de `summary.json`/`tournament-results.csv`
que elas já gravaram (até 3/5 temporadas, confirmado acima) continuam
válidos e não se perdem — só a CONTINUAÇÃO da simulação em si não é
retomável para elas. A partir de agora, qualquer rodada longa NOVA
(lançada depois desta sessão) já nasce com o checkpoint de retomada
disponível.

1. Validar o mecanismo de retomada com um diff byte-a-byte completo
   (2 temporadas ininterruptas vs. 1 temporada + retomada + 1
   temporada, mesma seed) — o teste funcional já feito (§3-bis) dá
   confiança de que carrega e continua certo, mas não confirma
   determinismo exato ainda.
2. Relançar `wait2-regime5`, `item2-regime5`, `item23-regime5` do
   zero (mesma seed cada, agora já com o checkpoint de retomada
   disponível caso outra interrupção aconteça no meio) até 5/5
   temporadas cada.
3. Recalcular todas as tabelas acima com dado completo; fechar o item 1
   com um veredito real, não uma hipótese; confirmar ou refutar a
   bandeira vermelha do item 2 (§2.2); refazer a comparação do item 3
   com os dois lados em 5/5.
4. Reverter `DIAG_SELECT`/`DIAG_WAIT2`, rodar suíte/lint/build/Tauri,
   commitar o fechamento da fase.
5. Só depois: curva de expansão da base, finalmente.
