# Fase 0.3, item 2 — Diagnóstico de `processAiPartnershipMarket`

> Só diagnóstico — nenhum arquivo de jogo foi alterado nesta etapa. Método:
> interceptação no repositório-singleton (`CareerEntityRepository.prototype`,
> usado por todo adapter de entidade via `EntityAdapter.js` — `localGame.entities`
> é um Proxy que cria um adapter novo a cada acesso, não dá pra interceptar
> `entities.AthleteProfile.list` de fora dele) + `processAiPartnershipMarket`
> chamado isoladamente, mês a mês, contra a população real de produção (24
> reais + 970 bots procedurais, ids no formato real de `makeId()`). Script:
> [scripts/diag-partnership-market-mechanism.mjs](../../scripts/diag-partnership-market-mechanism.mjs).
> Dados brutos: [partnership-market-diagnostic.json](partnership-market-diagnostic.json)
> (seed `market-diag-970`, escala de produção completa).
>
> **Limitação explícita desta medição:** por isolar `processAiPartnershipMarket`
> das outras ~9 fases diárias, `processWorldCircuit` (`circuitLifecycle.js`)
> nunca roda aqui — `ranking_position` fica CONGELADO no valor do seed inicial
> a temporada inteira, em vez de ser recalculado semanalmente como em
> produção. Isso é uma simplificação deliberada (isola exatamente o sistema
> pedido, sem o custo de rodar os outros 9), mas significa que o "top 500"
> observado aqui é ESTÁTICO — em produção ele rotaciona semana a semana
> conforme resultados de torneio. Ver achado 3 e a ressalva no fim.

## 1. Complexidade — não é O(n²), é O(pares-alvo × população-elegível), com um teto de 500

`formNewPartnerships` (`aiPartnershipLifecycle.js:251`) forma no máximo
`targetPairs = Math.min(8, Math.floor(free.length/2))` pares por mês — **8**,
na prática, sempre que há gente livre suficiente. Para cada um desses até 8
pares, `selectPair` (`aiPartnershipLifecycle.js:136`) ordena o pool inteiro
por hash (`ordered = [...free].sort(...)`) e depois computa `compatibility()`
(`aiPartnershipLifecycle.js:100`) contra cada candidato restante — ou seja,
o custo por mês é **O(8 × n log n)**, não O(n²), e `n` já vem limitado a no
máximo 500 pelo achado 3 abaixo. Contagem real (não estimativa): instrumentei
`Array.prototype.sort` só durante a chamada — toda comparação de QUALQUER
sort interno (o de hash em `selectPair` e o de compatibilidade) foi contada.

| Escala | Comparações de sort — mês 1 | mês 12 | total na temporada |
|---|---|---|---|
| 970 bots (produção) | 64.223 | 42.472 | **638.541** |

Ordem de grandeza real: **~40-65 mil comparações de sort por mês, ~640 mil
na temporada inteira** — parecido em ORDEM DE GRANDEZA com a hipótese de
500 mil do pedido, mas por um mecanismo diferente (não é uma varredura
O(n²) de pares candidatos; é o custo natural de ordenar repetidamente um
pool de até 500 elementos, 8 vezes por mês) — **e, crucialmente, esse
número NÃO cresce ao longo da temporada — na verdade cai levemente**
(64.223 → 42.472). Isso já elimina o volume de comparação como explicação
para o crescimento de custo de 15× visto no perfilamento (achado 5).

## 2. Ordem de iteração — existe (ranking_position ascendente), mas não determina quem vira âncora

`processAiPartnershipMarket` (`aiPartnershipLifecycle.js:332` e `:335`) busca
atletas com `entities.AthleteProfile.list('ranking_position', 500)` — SEM
prefixo `-`, portanto ascendente (`CareerEntityRepository.js:sortRows`,
linha ~50-65: sem `-` = ascendente). Ou seja, a lista SEMPRE chega ordenada
do melhor pro pior ranking. Essa ordem, porém, é só o INPUT de `selectPair`
— que a ignora e reordena tudo por `hash(mês:pairIndex:id)`
(`aiPartnershipLifecycle.js:138-142`) antes de escolher a âncora. A ordem de
entrada não sobrevive a essa reordenação.

## 3. Consumo de disponibilidade — confirmado, mas o achado maior é OUTRO: um teto de 500 nunca antes documentado

`availableAthletes` (`aiPartnershipLifecycle.js:126`) é recalculada a cada
uma das até 8 iterações de `formNewPartnerships` (`remaining =
availableAthletes(free, currentDate)`, linha 259) — e como `pair.first`/
`pair.second` têm `ai_partner_id` setado NO PRÓPRIO OBJETO em memória
(linhas 297-298, mutação direta, não uma cópia), a próxima iteração já
enxerga essas duas entidades como indisponíveis. **Confirmado por leitura
de código** — quem é avaliado primeiro DENTRO de um mês pode sim fechar
parceria e sair do pool antes dos últimos dos 8 pares serem formados.

Mas o achado estrutural maior, que a pergunta 3 do pedido não antecipava:
`entities.AthleteProfile.list('ranking_position', 500)` — **o `500` é um
limite hardcoded**. Medido na escala real: **retornou exatamente 500 todo
mês, do mês 1 ao mês 12, sem exceção** (população total disponível: 994).
Isso significa que **quase metade da população (494 de 994 atletas) nunca
é sequer buscada por este sistema, mês após mês** — não é filtrada por
elegibilidade, retirement ou lesão; é simplesmente invisível para
`processAiPartnershipMarket` por estar abaixo da posição 500 no ranking.
Dado que os 24 reais têm `ranking_position` inicial 1-24 (`realAthletes.js:18`)
e os procedurais começam em 25+ (`rankingPopulation.js:72`,
`absoluteRank`), os reais estão bem dentro do corte — mas isso significa
que a AMPLITUDE do mercado de parcerias, do jeito que está, sempre exclui
a metade "de baixo" da tabela, independente de qualquer outra coisa. Não
estava no escopo da pergunta original, mas é um achado de arquitetura
relevante o bastante para registrar aqui.

## 4. Teste do mecanismo — ordem invertida/embaralhada NÃO muda o pareamento de forma significativa

Rodei o MESMO seed, a MESMA população (970 bots), a mesma temporada de 12
meses, três vezes — só mudando a ordem em que `AthleteProfile.list(...)`
entrega os atletas para `processAiPartnershipMarket` (interceptado no
repositório, sem tocar `aiPartnershipLifecycle.js`): ordem normal (a de
produção), invertida, e embaralhada com seed fixa.

| Variante | Reais pareados | Real-real | Escritas (mês 1→12) | Sort (mês 1→12) |
|---|---|---|---|---|
| Ordem normal (produção) | 4/24 | **2** | 24 → 205 | 64.223 → 42.472 |
| Ordem invertida | 4/24 | **2** | 24 → 199 | 64.310 → 42.727 |
| Ordem embaralhada | 6/24 | **3** | 24 → 198 | 64.373 → 43.598 |

**A ordem não é o mecanismo.** As três variantes produzem resultados quase
idênticos (2-3 pares real-real em 24, 4-6 reais pareados no total) — a
variação entre elas é da mesma magnitude que a variação natural do próprio
processo (formação depende de `compatibility()`, que é determinístico dado
quem está disponível, mas "quem está disponível" muda sutilmente com a
ordem por causa do consumo-durante-a-varredura do achado 3). Isso bate
exatamente com a previsão da Fase 1C: `selectPair` reordena tudo por hash
antes de escolher a âncora, então a ordem de ENTRADA não tem como
sobreviver a essa reordenação. **A questão em aberto desde a Fase 0.1 fica
encerrada: nem a distribuição do hash (achado 1C), nem a ordem de
iteração (achado 4 aqui) explicam o pareamento raro entre reais.**

Nota importante: esses números (2-3/24 real-real) são BEM diferentes do
"0/24" observado no harness completo dia-a-dia da Fase 0.1. A explicação
mais provável é a ressalva do topo deste relatório — aqui `ranking_position`
fica congelado no valor do seed a temporada toda (24 reais SEMPRE no topo
do corte de 500); no harness completo, `processWorldCircuit` recalcula
`ranking_position` toda semana a partir de resultados reais de torneio, o
que pode empurrar um real pra fora do corte de 500 em algum momento (achado
3) — um mecanismo adicional que este diagnóstico isolado não captura, por
desenho. Registrado como candidato a investigação futura, fora do escopo
de "só diagnóstico" desta entrega.

## 5. Por que o custo cresce 15× — não é o mercado ficando mais lento, é o mercado fazendo mais escritas individuais

Medido: **24 escritas individuais no mês 1 → 205 no mês 12** (970 bots,
ordem normal) — um crescimento de **~8,5×** na CONTAGEM de escritas, quase
exatamente na mesma faixa de ordem de grandeza do crescimento de 15× em
TEMPO visto no perfilamento (que também inclui o custo, crescente, de cada
escrita individual — ver abaixo).

Mecanismo, com citação exata: `dissolvePartnerships`
(`aiPartnershipLifecycle.js:151-249`) itera cada atleta com parceiro ativo
(`for (const athlete of athletes)`, filtrando por `aiPartnerId`) e, para
**TODO par ativo, TODO mês** — não só os que se rompem ou renovam — faz
pelo menos duas chamadas individuais a `updateAthlete()`
(`aiPartnershipLifecycle.js:121`, que chama `entities.AthleteProfile.update`
diretamente, uma entidade por vez):
- par que renova contrato: 2× `updateAthlete` + 1× `Partnership.update` (linhas 194-197)
- par estável, sem mudança: 2× `updateAthlete` só pra incrementar `ai_partnership_months` (linhas 204-207)
- par que se rompe: 2× `updateAthlete` + 1× `Partnership.update` (linhas 219-231)

**Não existe um branch que pule a escrita para um par ativo.** Como
`entities.AthleteProfile.update`/`Partnership.update` (`CareerEntityRepository.js:222-231`)
cada um dispara sua PRÓPRIA transação `withCareer` — que clona
(`structuredClone`) o objeto `career` INTEIRO a cada chamada — o custo de
CADA uma dessas escritas cresce com o tamanho total do save, que também
cresce ao longo da temporada (achado já reportado no perfilamento: coleções
como `Tournament`, `HistoryEntry`, `FinancialTransaction`,
`MonthlyCareerReport`, `CalendarEvent`, além do próprio `AthleteProfile`
via `generateProspect`, não são podadas). Contraste direto, já presente no
próprio código: `circuitLifecycle.js` (linha ~148-150) tem um comentário
explícito descrevendo e corrigindo EXATAMENTE esse mesmo padrão para o
sistema de ranking ("Uma gravação individual por atleta classificado gerava
até 160 escritas completas do save toda semana. Acumula os patches e grava
tudo em uma única `bulkUpdate`") — ou seja, este é um anti-padrão já
identificado e corrigido em OUTRO sistema da própria base; em
`aiPartnershipLifecycle.js` ele nunca foi.

**Isso é custo de produção também, não só do harness** — como o pedido
observou: um jogador em qualquer carreira em andamento paga esse mesmo
custo, todo mês, crescendo à medida que mais duplas de IA se acumulam ao
longo dos anos.

## Resumo para o desenho da Fase 2

1. **A causa do "0/24" não é a ordem de iteração** (achado 4, testado
   diretamente) **nem a distribuição do hash** (achado da Fase 1C) — dar
   `ai_partner_id` fixo aos 12 pares históricos resolve para os 24 reais
   sem deixar um viés estrutural não-corrigido nos 970 bots. Não é
   necessário desenhar uma correção adicional no mecanismo de seleção do
   mercado por causa deste ponto.
2. **Mas o teto de 500 (achado 3) é uma descoberta nova, fora do escopo
   original da pergunta**, que limita quem participa do mercado de
   parcerias independente de quem são os 12 pares fixados — vale registrar
   para uma fase futura de correção de mercado (não implementado aqui, por
   instrução explícita de só diagnosticar).
3. **O custo (achado 5) tem uma causa raiz clara e citável** — escritas
   individuais por par ativo, todo mês, sem batching — meta-observação
   para quando a Fase 2 mexer neste arquivo: se o formato de correção
   tocar em `dissolvePartnerships`, trocar as chamadas individuais por um
   único `bulkUpdate` (como `circuitLifecycle.js` já faz) reduziria tanto o
   número de escritas quanto, mais importante, o número de clones
   completos do save por mês — provável maior alavanca de performance
   deste sistema, independente da questão do pareamento real-real.
