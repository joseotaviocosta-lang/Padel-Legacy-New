# Fase 6.5 — Corrigir a seleção nos tiers fechados e reconciliar a discrepância

> Pré-requisito: Fase 6.4 mediu 18,9% de semanas jogadas (45,2% sem
> opção elegível, 22,2% cortada, 13,7% descanso por escolha) e achou
> reincidência do padrão da Fase 4.3 em Gold/Platinum/Masters/Elite/
> Crown (Gold corta 79%). Ver
> [FASE-6.4-RELATORIO.md](FASE-6.4-RELATORIO.md). Esta fase corrige o
> que a 6.4 só diagnosticou, mede cada correção separadamente, e
> reconcilia a discrepância de espera (365 vs. 1.429 dias).

> **Nota de fechamento (Fase 6.6, item 1)**: este relatório teve uma
> versão intermediária, escrita no meio de um desligamento de máquina,
> com os itens 2 e 3 marcados PARCIAIS (checkpoints de 3/5 e 4/5
> temporadas). As três rodadas de regime (`wait2-regime5`,
> `item2-regime5`, `item23-regime5`) terminaram as 5/5 temporadas antes
> do desligamento acontecer de fato — este documento já reflete o dado
> COMPLETO das três. A leitura sobre se o item 2 piorou o mecanismo por
> redistribuição em vez de reduzir a exclusão está em
> [FASE-6.6-RELATORIO.md](FASE-6.6-RELATORIO.md), que também traz o
> padrão das três correções e a curva de expansão da base.

## 1 — Reconciliar 365 vs 1.429 dias (FECHADO — 5/5 temporadas completas)

Instrumentação temporária `diagWaitTail`/`DIAG_WAIT2`
(`aiPartnershipLifecycle.js`), hooked em `formNewPartnerships` logo
após `const free = availableAthletes(...)`: por mês, conta quantos
atletas livres têm mais de 365 dias de espera (`daysSinceFree`),
quantos desses são reais, e a maior espera entre os reais livres
naquele instante. `wait2-regime5` completou as 5 temporadas — este
item fecha com dado completo, não hipótese.

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
oscila numa faixa de 275-365 dias desde a temporada 3. Cinco
temporadas completas, sem tendência de subir sem limite, é evidência
suficiente pra fechar o item.

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

## 2 — Prioridade estendida aos tiers fechados (FECHADO — 5/5 temporadas completas)

`applyOpenTierEntryPriority` → `applyEntryPriority`
(`WorldTourLifecycle.js`): removido o gate `config.minRanking === 0`,
agora roda pra QUALQUER tier oversubscrito (Bronze a Crown). Correção
permanente.

### 2.1 — Taxa de corte por tier, antes (Fase 6.4) vs. depois (5/5 temporadas, item 2 isolado)

| Tier | Corte ANTES (Fase 6.4) | Corte DEPOIS (item 2 isolado) |
|---|---|---|
| Gold | 79% | 43,7% |
| Masters | 61% | 38,2% |
| Platinum | 61% | 37,9% |
| Crown | 50% | 34,0% |
| Elite | 44% | 31,4% |
| Bronze | não medido (artefato, ver Fase 6.4 §1.2) | 47,8% |
| Silver | não medido (artefato, ver Fase 6.4 §1.2) | 48,1% |

Queda real em todos os tiers fechados que a Fase 6.4 conseguiu medir —
Gold, o pior caso, caiu de 79% pra 43,7%. **Comparação não é 1:1**: a
tabela da Fase 6.4 usava um ponto de captura ANTES da correção existir
(sem prioridade nenhuma nesses tiers); esta usa o mesmo ponto de
captura, mas agora DEPOIS de `applyEntryPriority` truncar o campo — o
que a Fase 6.4 chamou de "artefato de instrumentação" em Bronze/Silver
(0 cortados porque a captura vinha depois do corte) agora é o
comportamento ESPERADO em todo tier, corrigido capturando
`diagEntrantsBeforePriority` antes da função rodar.

### 2.2 — Divisão semanal por dupla real (recalculada, dado completo)

| Resultado da semana | Fase 6.4 (baseline) | Item 2 isolado (5/5 temp.) |
|---|---|---|
| Sem opção elegível | 45,2% | 45,6% |
| Cortada | 22,2% | **28,5%** |
| Jogou | 18,9% | **12,7%** |
| Descanso por escolha | 13,7% | 13,2% |

Com as 5 temporadas completas, a leitura NÃO muda de direção em
relação aos checkpoints parciais anteriores (3/5: cortada 26,2%/jogou
16,3%; 4/5: cortada 28,1%/jogou 13,4%) — se algo, piora ainda mais no
fechamento. Apesar da taxa de corte por tier cair bastante em TODOS os
tiers fechados (tabela 2.1), a fração de semanas-dupla real que
terminam CORTADA **piorou** em relação ao baseline da Fase 6.4 (22,2%
→ 28,5%) e "jogou" caiu quase à metade (18,9% → 12,7%). Isso é o
resultado líquido mais importante do item 2 sozinho: uma correção que
reduz o corte AGREGADO (reais+bots) pode, ao mesmo tempo, piorar o
resultado ESPECÍFICO das duplas reais — porque muda QUEM entra
(prioridade por rank/menos-torneios-jogados) sem aumentar QUANTAS
vagas existem. Ver
[FASE-6.6-RELATORIO.md](FASE-6.6-RELATORIO.md) §2 pra a investigação
completa de se isso é redistribuição (quem se beneficia são bots,
quem perde são reais) ou só uma coincidência de composição do checkpoint.

**`neverPlayedThisSeasonCount` — a série completa (5 temporadas)**:
0 → 18 → 46 → 65 → **68**. O incremento DESACELERA no fechamento (a
temporada 5 soma só +3, contra +19 da temporada anterior e +28 antes
dela) — ao contrário do que os checkpoints parciais de 3/5 e 4/5
indicavam ("incremento não desacelera"), a série completa mostra uma
curva que começa a achatar. Mas a persistência dos MESMOS indivíduos
entre temporadas adjacentes sobe continuamente (28,3% → 64,6% → 83,8%
de sobreposição temporada-a-temporada, ver
[FASE-6.6-RELATORIO.md](FASE-6.6-RELATORIO.md) §1) — a desaceleração do
NÍVEL não significa que a composição parou de piorar; significa que o
grupo excluído está convergindo pra um núcleo cada vez mais estável dos
MESMOS atletas, não que a exclusão está desaparecendo.

## 3 — Fallback de tier na mesma semana (FECHADO — 5/5 temporadas completas)

`pairOptionState` (Map por dupla, por semana) + laço de até
`MAX_FALLBACK_ROUNDS=6` em `resolveCompletedWorldTourEvents`: uma
dupla cortada do tier escolhido tenta a PRÓXIMA opção elegível da MESMA
lista que `chooseTournament` já tinha calculado (`options`), respeitando
`OPEN_TIER_CEILING`. Rodado ISOLADO do item 2 — medição separada, como
pedido ("duas correções numa medição só é o erro que esta auditoria já
cometeu várias vezes").

### 3.1 — Efeito incremental sobre o item 2 isolado (dado completo)

| Resultado da semana | Item 2 isolado (5/5 temp.) | Item 2+3 combinado (5/5 temp.) |
|---|---|---|
| Sem opção elegível | 45,6% | 45,2% |
| Cortada | 28,5% | **24,1%** |
| Jogou | 12,7% | **14,8%** |
| Descanso por escolha | 13,2% | 15,9% |

`FALLBACK->` disparou **755 vezes** ao longo das 5 temporadas completas
(314 em 3/5, 607 em 4/5 — cresce de forma aproximadamente linear com o
tempo decorrido, sem sinal de saturação nem de disparada). O efeito
incremental do item 3 sobre o item 2 se manteve estável nos três
checkpoints (3/5, 4/5, 5/5): cortada cai ~4,4-4,6pp, jogou sobe
~2,1-2,7pp, toda vez. **Leitura final**: o item 3 compensa
consistentemente PARTE do efeito negativo do item 2 sozinho sobre
duplas reais, mas não o reverte — mesmo com o fallback, cortada
(24,1%) ainda termina acima do baseline da Fase 6.4 (22,2%) e jogou
(14,8%) ainda termina abaixo (18,9%). O item 3 desloca o nível da curva
pra melhor; não muda a tendência de fundo.

### 3.2 — Resposta à pergunta do pedido: quanto do 45,2% era "tier errado"?

**Estruturalmente, 0% — confirmado por leitura de código, não dependia
de mais temporadas.** `chooseTournament` (`TournamentSelectionAI.js`)
já escaneia TODOS os tiers rodando naquela semana antes de decidir — o
bucket "sem opção elegível" (`eligibleOptions=0`) significa que NENHUM
tier tinha um torneio elegível pra aquela dupla naquela semana, não que
ela escolheu o tier errado. O fallback do item 3 opera DENTRO da lista
de opções que `chooseTournament` já retornou — ele não pode criar uma
opção que não existia. Confirmado empiricamente com dado completo:
`sem_opcao_elegivel` ficou estatisticamente igual entre item-2-isolado
(45,6%) e item-2+3 (45,2%) nas 5 temporadas inteiras — dentro do ruído
normal de duas rodadas com seeds de PRNG que divergem a partir do
primeiro fallback, não uma redução.

**O que os dados de fallback mostram sobre a RARIDADE da oportunidade**:
`eligibleOptions>=2` (pré-requisito pro fallback ter qualquer chance de
disparar) ocorreu numa fração pequena das semanas-dupla-real ao longo
de toda a rodada — a maioria das semanas com opção tinha exatamente 1
tier elegível, não 2+. Isso é o mesmo sintoma do calendário esparso
(achado #32) que a Fase 6.4 já tinha citado como causa dominante do
bucket "sem opção elegível" — aqui ele aparece de novo como o limite
estrutural de QUANTO o item 3 pode ajudar mesmo quando há uma dupla
cortada: só quando 2+ tiers estão rodando E elegíveis na mesma semana,
o que é a exceção, não a regra.

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

**Registrado nesta fase; medido na Fase 6.6.** A cada rodada desde a
Fase 6.3, os dados apontaram mais fundo pra ela: a Fase 6.3 achou que a
contaminação do penhasco sincronizado nunca tocou os achados publicados
PORQUE a maioria dos ociosos já era majoritariamente parceada, não
afetada pela loteria de formação; a Fase 6.4 mediu que 45,2% de toda
semana-dupla não tem NENHUM torneio elegível, e atribuiu isso ao
calendário esparso (achado #32); esta fase (§3.2) confirmou que o
mesmo calendário esparso é o que faz `eligibleOptions>=2` ser raro o
bastante pra o fallback de tier ter pouco o que fazer, e (§2.2) que
`neverPlayedThisSeasonCount` sobe de forma persistente nas duas
configurações medidas mesmo com as duas correções ativas. As três
fases, por três caminhos de investigação diferentes, convergem no
mesmo gargalo: **a base do circuito é pequena demais pra população que
precisa jogar nela.** Ver [FASE-6.6-RELATORIO.md](FASE-6.6-RELATORIO.md)
§4 pra a curva de expansão medida em 3 cenários de calendário.

## 3-bis — Mecanismo de retomada (implementado nesta fase, por necessidade)

**Antes**: `writeCheckpoint` só gravava `summary.json`/
`tournament-results.csv`/`season-tier-table.md` a cada temporada — uma
interrupção não perdia o RESULTADO já fechado, mas continuar exigia
recomeçar da temporada 1 (o storage do mundo simulado só existia na
memória do processo). Perdemos horas de simulação por isso duas vezes.

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

**Validação**: revisão de código completa (os únicos dois pontos de
não-determinismo do harness — PRNG e relógio — agora têm getter/setter
explícitos; `CareerManager.loadCareer` é o mesmo caminho de produção
pra reabrir uma carreira existente, não uma reconstrução paralela),
`node --check` limpo, e um teste funcional fim-a-fim: rodei 2
temporadas pequenas até fechar a temporada 1, matei o processo, e
retomei com `--resumeFrom` (sem repassar `--seed`/`--seasons` — lidos
do snapshot). Carregou o roster restaurado corretamente, continuou a
partir do dia exato em que a temporada 1 fechou, e os acumulados da
temporada 1 sobreviveram à interrupção e apareceram somados
corretamente ao resultado da temporada 2. Sem crash, sem erro.

**O que ainda falta**: um diff byte-a-byte entre uma rodada ininterrupta
e uma interrompida-e-retomada, pra confirmar determinismo EXATO (mesmos
campeões, mesmos ids) e não só continuidade estrutural — não bloqueia o
uso do mecanismo (o pior caso de uma divergência pequena é cosmético,
mesma classe do achado #27), mas fica como validação pendente pra uma
sessão futura. As 3 rodadas de regime desta fase (`wait2-regime5`,
`item2-regime5`, `item23-regime5`) foram lançadas ANTES deste mecanismo
existir e não se beneficiaram dele — completaram as 5/5 temporadas
porque o desligamento da máquina não aconteceu no meio, não porque
foram retomadas.

## 6 — Validação

- `node --check scripts/audit-real-athletes-simulation.mjs` — OK.
- `DIAG_SELECT` (`WorldTourLifecycle.js`) e `DIAG_WAIT2`
  (`aiPartnershipLifecycle.js`) revertidos — ver
  [FASE-6.6-RELATORIO.md](FASE-6.6-RELATORIO.md) §6 pra a validação
  final de suíte/lint/build/Tauri (feita junto com o fechamento da
  Fase 6.6, já que as duas fases compartilham a mesma janela de
  instrumentação temporária ainda ativa no código).

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Discrepância reconciliada, com o registro corrigido | ✅ fechado com 5/5 temporadas completas — o correto é ~365-400 dias (pico observado: 396d); 1.429 dias é artefato da medição por classificação de fim de temporada, registrado como tal |
| 2 | Prioridade estendida aos tiers fechados, taxa de corte antes/depois | ✅ fechado com 5/5 temporadas — corte por tier caiu em todos os tiers fechados (Gold 79%→43,7%), mas o efeito líquido por dupla real piorou (cortada 22,2%→28,5%, jogou 18,9%→12,7%); ver Fase 6.6 §2 pra o veredito redistribuição-vs-reducão |
| 3 | Fallback de tier, medido separadamente, divisão 45/22/19/14 recalculada | ✅ fechado com 5/5 temporadas — efeito incremental estável nos 3 checkpoints (cortada -4,4pp, jogou +2,1pp): compensa parte da piora do item 2 mas não a reverte; resposta sobre "tier errado" (0%) confirmada |
| 4 | Regra de método registrada | ✅ registrada — terceira da série |
| 5 | Registro do item 2 da Fase 6 como problema principal | ✅ registrado nesta fase, medido na Fase 6.6 |
| 6 | Mecanismo de retomada (adicionado por necessidade) | ✅ implementado e validado funcionalmente; diff byte-a-byte determinístico fica como validação pendente futura |
| 7 | Suíte, lint, build, Tauri | Ver [FASE-6.6-RELATORIO.md](FASE-6.6-RELATORIO.md) §6 |
