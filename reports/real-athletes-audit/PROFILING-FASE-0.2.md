# Fase 0.2 — Parte 1: perfilamento (970 bots, 1 temporada)

> Rodado ANTES de qualquer nova baseline, como pedido. Instrumentação:
> `createStageProfiler()` já existente em produção (`src/dev/performanceProbe.js`),
> aplicada dia a dia via `advanceDay(profile,{profiler})` +
> `processGameStateDay(profile,oldDate,newDate,{profiler})` — o mesmo par de
> chamadas que a Fase 0.1 confirmou ser o caminho fiel ao jogo real. Script:
> [scripts/profile-real-athletes-simulation.mjs](../../scripts/profile-real-athletes-simulation.mjs).
> Dados brutos: [profile-report.json](profile-report.json) (seed `profile-970`,
> 970 bots procedurais, 486 duplas procedurais, 366 dias).

## Números centrais

- **Tempo total: 34,95 min** (2.097.268 ms) para 970 bots × 366 dias, COM o
  overhead da instrumentação. **Isso já fica abaixo da meta de 1h para a
  baseline oficial** — a rodada oficial (sem profiler) deve custar o mesmo
  ou um pouco menos.
- Custo médio por dia: 5.730 ms — mas essa média esconde uma curva forte de
  crescimento ao longo da temporada (ver abaixo).

## Custo por sistema (hipótese do pedido: `simulateWorldDay` domina?)

**Não confirmada.** `world` (=`simulateWorldDay`, até 80 atletas/dia) fica
em **2º lugar com 14,6%** do tempo total — quem domina é
**`aiPartnerships` (=`processAiPartnershipMarket`), com 32,3%** (677,8s
total, 1.852 ms por chamada em média — mais do que o dobro do custo médio
de `world`).

| Estágio | % do total | ms totais | ms/chamada |
|---|---|---|---|
| aiPartnerships | 32,3% | 677.846 | 1.852,0 |
| world (simulateWorldDay) | 14,6% | 305.390 | 834,4 |
| livingWorld (World Tour) | 13,3% | 278.064 | 759,7 |
| staff | 7,0% | 146.156 | 399,3 |
| recovery | 6,9% | 144.840 | 395,7 |
| persist | 6,8% | 143.031 | 390,8 |
| athleteIntelligence | 3,9% | 81.956 | 223,9 |
| circuit | 3,5% | 72.690 | 198,6 |
| circuitLife | 3,3% | 68.928 | 188,3 |
| relationships | 2,4% | 49.778 | 136,0 |
| (demais estágios diários) | <1,2% cada | — | — |
| eventos mensais/anuais (evolução, torneios futuros, finanças, fechamento) | ≤1% cada | — | — |

`aiPartnerships` + `world` + `livingWorld` = **60,2% do custo total** — os
três primeiros doze estágios somados (todo o resto) ficam abaixo de 40%.

**Consequência para a proposta do pedido:** como `world` não domina
isoladamente, a proposta original ("versão amostrada de `simulateWorldDay`
exclusiva do harness") não se justifica como está — o maior ganho estaria
em `aiPartnerships`, não em `world`. Dado que o custo total já fica sob a
meta de 1h sem precisar de nenhum atalho, **não estou propondo nem
validando uma versão amostrada agora** — seria otimização sem necessidade
comprovada. Fica registrado como opção se uma fase futura precisar de mais
margem (ex.: a regime-check de 5 temporadas, que cresce de forma não-linear
— ver abaixo).

## Dias de torneio vs. dias sem torneio

- 32 dias de torneio, 334 dias sem torneio nos 366 dias simulados.
- Custo médio por dia COM torneio: 12.349 ms. Sem torneio: 5.096 ms — um
  dia de torneio custa ~2,4x mais que um dia comum.
- **Mas em tempo total agregado, dias sem torneio dominam** (334 × 5.096ms
  ≈ 1.702s vs. 32 × 12.349ms ≈ 395s → sem-torneio = ~81% do tempo total),
  simplesmente porque são 10x mais numerosos. Essa é a otimização óbvia que
  o pedido antecipou caso dias-sem-torneio dominassem: eles dominam em
  volume agregado, não em custo unitário — qualquer atalho aplicável a dias
  comuns (não a dias de torneio) tem alavancagem maior que otimizar dias de
  torneio.

## Quanto a poda de memória economiza em TEMPO (não só heap)

**Pouco, diretamente — a poda em si é barata: 5.062 ms no total (12
chamadas, 422 ms/chamada em média), 0,24% do tempo total.** Ela não é, por
si, um gargalo de tempo. Só que ela também **não impede** o crescimento de
custo ao longo da temporada descrito abaixo — ou seja, a poda cumpre bem o
papel para o qual foi criada (evitar OOM, achado da rodada anterior), mas
não resolve o crescimento de custo por dia.

## Achado não previsto no pedido: o custo por dia CRESCE ao longo da temporada

- `firstMonthAvgMsPerDay` = 1.116 ms; `lastMonthAvgMsPerDay` = 16.643 ms —
  **~14,9x mais caro no último mês do que no primeiro**, mesmo com a poda
  ativa o tempo todo.
- Isso é mais visível nos dias de virada de mês (que rodam
  `evolveAthletesMonthly`, `ensureFutureTournaments`,
  `processAllClubsMonthly`, `processMonthlyFinances`,
  `finalizeClosedCareerMonth` — e, em dezembro, também os de virada de
  ANO): dia 30 (fev/2026) custou 14,2s; dia 272 (out/2026) custou 86,4s; o
  dia 364 (1º/jan/2027, fechamento de ano + torneio no mesmo dia) custou
  **228,4s sozinho** — o dia mais caro de toda a simulação, de longe.
- **Hipótese (não confirmada, fora do escopo desta medição):**
  `CareerEntityRepository` clona (`structuredClone`) o objeto `career`
  INTEIRO a cada transação de escrita, e cada um dos ~10 estágios diários
  faz sua própria escrita transacional — ou seja, o custo de CADA escrita
  cresce com o TAMANHO TOTAL do objeto `career`. A poda desta fase cobre só
  5 coleções (`WorldEvent`, `CareerMessage`, `TeamRanking`,
  `Partnership`-inativas, `AnnualCareerReport`); outras coleções crescem
  sem poda (`Tournament` recente, `HistoryEntry`, `FinancialTransaction`,
  `MonthlyCareerReport`, `CalendarEvent`, a própria `AthleteProfile` via
  `generateProspect`, legítimo). Se essa hipótese se confirmar, o efeito
  multiplicador (tamanho do objeto × número de escritas/dia) explicaria por
  que quase todo estágio fica mais caro ao longo do ano, não só os
  "grandes". **Não investigado a fundo aqui — registrado para uma fase de
  otimização dedicada**, já que a Parte 1 deste pedido é medir, não corrigir.

### Implicação direta para a regime-check (970 bots, 5 temporadas)

**Não vai custar ~5× o tempo da baseline de 1 temporada.** Se o padrão de
crescimento dentro da temporada 1 se repetir/compor nas temporadas 2-5 (a
maioria das coleções não reseta a cada ano, só `race_points`), o custo por
temporada tende a aumentar ano a ano — a regime-check pode facilmente levar
bem mais que 5×35min. Isso bate com a sensação relatada da rodada anterior
de 100 bots/5 temporadas (~5h percebidas). **Recomendo rodar a
regime-check em background, sem expectativa de tempo fixo, e tratá-la como
"dispara e esquece até terminar"** — exatamente como o pedido já props
("não é pra iterar").

## Proposta de baseline oficial (aguardando aprovação)

- **Baseline oficial: 970 bots, 486 duplas procedurais, 1 temporada, seed
  fixa.** Custo esperado: ~30-35 min (igual ou um pouco menor que a rodada
  de perfilamento, que já inclui overhead de instrumentação) — **dentro da
  meta de 1h sem precisar cortar nada.** Congela em
  `docs/baseline-pre-refactor.json` via `audit-real-athletes-simulation.mjs`
  (o script de conteúdo/resultado, não o de perfilamento).
- **Regime-check: 970 bots, 5 temporadas, mesma seed.** Custo real
  desconhecido a priori (ver hipótese de crescimento acima) — proponho
  rodar em background assim que a baseline oficial for aprovada e
  confirmada, sem compromisso de horário, só para ter o dado de referência
  para os marcos (fim da Fase 2, Fase 5, Fase 8).

**Aguardando aprovação explícita antes de disparar qualquer uma das duas
rodadas**, conforme pedido.
