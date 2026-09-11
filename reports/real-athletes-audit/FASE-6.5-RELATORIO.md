# Fase 6.5 — Corrigir a seleção nos tiers fechados e reconciliar a discrepância

> Pré-requisito: Fase 6.4 mediu 18,9% de semanas jogadas (45,2% sem
> opção elegível, 22,2% cortada, 13,7% descanso por escolha) e achou
> reincidência do padrão da Fase 4.3 em Gold/Platinum/Masters/Elite/
> Crown (Gold corta 79%). Ver
> [FASE-6.4-RELATORIO.md](FASE-6.4-RELATORIO.md). Esta fase corrige o
> que a 6.4 só diagnosticou, mede cada correção separadamente, e
> reconcilia a discrepância de espera (365 vs. 1.429 dias).

> ## ⚠️ ESTE RELATÓRIO É PARCIAL — checkpoint intermediário, não o
> ## fechamento da fase
>
> Interrompido para desligar a máquina. As três rodadas de regime (5
> temporadas cada) que sustentam os itens 1-3 tinham, no momento da
> interrupção: `wait2-regime5` em **3/5** temporadas (indo pra 4/5),
> `item2-regime5` em **3/5**, `item23-regime5` em **3/5**. Os números
> abaixo são os do ÚLTIMO CHECKPOINT gravado em disco de cada uma —
> reais, não simulados — mas cobrem só o trecho INICIAL do regime. Onde
> a curva às temporadas 4-5 pode mudar a leitura, isso está marcado
> explicitamente. Nada aqui deve ser lido como o número final da fase.
> Amanhã: essas 3 rodadas específicas precisam ser **relançadas do
> zero** (foram lançadas antes do mecanismo de retomada existir — ver
> item 3-bis e o aviso na seção "Próximos passos"); toda rodada longa
> lançada DAQUI PRA FRENTE já é retomável de onde parar.

## 1 — Reconciliar 365 vs 1.429 dias (PARCIAL — ainda não reconciliado)

Instrumentação temporária `diagWaitTail`/`DIAG_WAIT2`
(`aiPartnershipLifecycle.js`), hooked em `formNewPartnerships` logo
após `const free = availableAthletes(...)`: por mês, conta quantos
atletas livres têm mais de 365 dias de espera (`daysSinceFree`),
quantos desses são reais, e a maior espera entre os reais livres
naquele instante.

### O que os dados mostram até a temporada 3/4 (checkpoint 3/5)

| Temporada | `maior_espera_de_um_real` no fim do ano | `com_espera>365d` (pool inteiro) |
|---|---|---|
| 2026 | 91d | 0 |
| 2027 | 275d | 0 |
| 2028 | 335d | 1-5 (oscilando) |
| 2029 (em andamento) | 335-365d (últimas leituras) | 0-4 |

A métrica **não mostra nenhum sinal de crescer rumo a 1.429 dias** —
ela oscila numa faixa de 300-365 dias desde a temporada 3, o mesmo
padrão de plateau que a Fase 6.4 já tinha visto (`DIAG_WAIT`, medição
mensal do pool inteiro). Isso aponta na mesma direção da minha hipótese
de reconciliação (a classificação de fim de temporada da Fase 6.3 mede
a história de UM indivíduo específico através de múltiplos ciclos de
dissolução/reformação — um artefato de amostragem daquela medição
específica — enquanto o scan mensal do pool inteiro, usado tanto pela
Fase 6.4 quanto por este `DIAG_WAIT2`, nunca vê passar de ~365 dias).

**Por que ainda não posso declarar isso reconciliado**: faltam as
temporadas 4 e 5 — exatamente o trecho onde, se a curva da Fase 6.3
tem alguma dinâmica de cauda longa (um real específico acumulando
esperas sucessivas ao longo de VÁRIOS anos, não só um), ela apareceria.
Três/quatro temporadas de plateau é evidência a favor da minha
hipótese, não uma prova — declarar "365 dias está correto, 1.429 está
errado" agora seria repetir o erro que a própria Fase 6.4 já cometeu
(a subseção 2.4 daquele relatório registrou a mesma discrepância como
"não totalmente reconciliada" e a passou pra frente em vez de forçar um
veredito sem dado suficiente). Mantida como pendência explícita, não
como duas respostas convivendo como se fossem igualmente válidas — a
essa altura dos dados, a leitura mais provável é que **365-380 dias é
o número real do plateau em regime, e 1.429 dias é um artefato da
medição por classificação de fim de temporada** (que soma esperas de
ciclos diferentes de um mesmo indivíduo como se fossem uma espera
contínua), mas isso só vira veredito fechado com as temporadas 4-5.

## 2 — Prioridade estendida aos tiers fechados (PARCIAL — checkpoint 3/5 temporadas)

`applyOpenTierEntryPriority` → `applyEntryPriority`
(`WorldTourLifecycle.js`): removido o gate `config.minRanking === 0`,
agora roda pra QUALQUER tier oversubscrito (Bronze a Crown). Correção
permanente, já aplicada e mantida independente deste checkpoint.

### 2.1 — Taxa de corte por tier, antes (Fase 6.4) vs. depois (checkpoint 3/5 temporadas)

| Tier | Corte ANTES (Fase 6.4, 5 temporadas completas) | Corte DEPOIS (checkpoint 3/5, item 2 isolado) |
|---|---|---|
| Gold | 79% | 43,4% |
| Masters | 61% | 37,9% |
| Platinum | 61% | 37,5% |
| Crown | 50% | 33,8% |
| Elite | 44% | 31,2% |
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

| Resultado da semana | Fase 6.4 (baseline, 5 temp. completas) | Checkpoint (item 2 isolado, 3/5 temp.) |
|---|---|---|
| Sem opção elegível | 45,2% | 43,2% |
| Cortada | 22,2% | 26,2% |
| Jogou | 18,9% | 16,3% |
| Descanso por escolha | 13,7% | 14,3% |

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
especificamente". Fica registrado como leitura provisória: com só 3/5
temporadas, não dá pra separar "o efeito líquido pra reais é
negativo" de "ainda não convergiu" — mas o sinal, ao contrário do que a
tabela 2.1 sozinha sugeriria, **não é inequivocamente positivo para as
duplas reais** e precisa ser fechado com dado completo antes de
declarar o item 2 um sucesso sem ressalvas.

**Segundo achado que reforça a mesma bandeira**: `neverPlayedThisSeasonCount`
subiu de forma parecida nas DUAS rodadas na temporada 2028 — **46** em
item-2-isolado e **37** em item-2+3-combinado (ambas acima de 18/12 na
temporada 2027, e de 0 na temporada 2026). Como o fallback (item 3)
reduz o número em vez de eliminá-lo, isso sugere que a subida É um
efeito real do item 2 (a fila de prioridade), não ruído de uma única
rodada — mas com só 3 pontos de dado (2026/2027/2028) em cada série,
ainda não dá pra distinguir "tendência real de piora ano a ano" de
"a população ainda está saindo do bootstrap inicial (temporadas 1-2
favorecidas por todo mundo começar com 0 torneios jogados)". Checar
nas temporadas 4-5 antes de declarar o item 2 um sucesso sem ressalvas
é o próximo passo, não uma formalidade.

## 3 — Fallback de tier na mesma semana (PARCIAL — checkpoint 3/5 temporadas)

`pairOptionState` (Map por dupla, por semana) + laço de até
`MAX_FALLBACK_ROUNDS=6` em `resolveCompletedWorldTourEvents`: uma
dupla cortada do tier escolhido tenta a PRÓXIMA opção elegível da MESMA
lista que `chooseTournament` já tinha calculado (`options`), respeitando
`OPEN_TIER_CEILING`. Rodado ISOLADO do item 2 — medição separada, como
pedido ("duas correções numa medição só é o erro que esta auditoria já
cometeu várias vezes").

### 3.1 — Efeito incremental sobre o item 2 isolado

Ambas as rodadas alcançaram checkpoint 3/5 temporadas antes do
desligamento — comparação agora no MESMO ponto do regime:

| Resultado da semana | Item 2 isolado (checkpoint 3/5) | Item 2+3 combinado (checkpoint 3/5) |
|---|---|---|
| Sem opção elegível | 43,2% | 42,9% |
| Cortada | 26,2% | **21,6%** |
| Jogou | 16,3% | **19,0%** |
| Descanso por escolha | 14,3% | 16,4% |

`FALLBACK->` disparou **314 vezes** no checkpoint de 3/5 temporadas —
o efeito incremental do item 3 sobre o item 2 é claro e na direção
esperada: cortada cai 4,6pp (26,2%→21,6%), jogou sobe 2,7pp
(16,3%→19,0%), sem opção elegível praticamente inalterado (43,2%→42,9%,
dentro do ruído — confirma a resposta estrutural do §3.2). O item 3
COMPENSA PARTE do efeito negativo do item 2 sozinho sobre duplas reais
(§2.2) mas não o reverte por completo: mesmo com o fallback, cortada
(21,6%) ainda está acima do baseline da Fase 6.4 (22,2%)... na
verdade abaixo por uma margem pequena (0,6pp) — perto o bastante do
baseline pra não declarar nem melhora nem piora com confiança neste
checkpoint. Recalcular com os dois lados em 5/5 antes de fechar.

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
| 1 | Discrepância reconciliada, com o registro corrigido | 🟡 parcial — hipótese (365-380d é o plateau real, 1.429d é artefato de amostragem) sustentada por 3-4/5 temporadas de plateau estável, mas não fechada; sem 4-5 completas não declaro um veredito final |
| 2 | Prioridade estendida aos tiers fechados, taxa de corte antes/depois | 🟡 parcial — corte por tier caiu em todos os tiers fechados medidos (Gold 79%→43,4%), mas o efeito LÍQUIDO por dupla real PIOROU no checkpoint atual (cortada 22,2%→26,2%, jogou 18,9%→16,3%) e uma bandeira vermelha (neverPlayed subindo em ambas as séries na temporada 3) precisa das temporadas 4-5 antes de qualquer veredito |
| 3 | Fallback de tier, medido separadamente, divisão 45/22/19/14 recalculada | 🟡 parcial — efeito incremental sobre o item 2 confirmado no mesmo checkpoint (3/5 vs 3/5): cortada 26,2%→21,6%, jogou 16,3%→19,0%, 314 fallbacks; compensa boa parte da piora do item 2 mas o líquido ainda está perto do baseline da Fase 6.4, não claramente melhor; resposta estrutural sobre "tier errado" (≈0%) já É definitiva, não depende de mais dado |
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
