# Fase 8.5 — Teto por tier de destino: contém o vazamento quase por completo, mas não fecha o gap — recomendação: abandonar esta linha

> **COMPLETA — medição pontual, nada implementado em escala**, conforme
> pedido. O mecanismo do item 1 (teto de OVR travado no tier de destino,
> em vez de `potential` numérico aberto) é tecnicamente viável e **mais
> simples e mais previsível** que os dois ajustes de faixa/fração
> anteriores — foi implementado só para esta medição e já revertido.
> **Resultado**: dos 3 critérios de sucesso definidos ANTES da medição
> (conforme pedido), 2 são atingidos com folga — títulos de Elite/Masters/
> Crown ficam em 1/0/0 (o melhor resultado das 3 rodadas) e a presença de
> reais no Top 20 **replica a produção atual temporada a temporada,
> exatamente** (20/18/17/12/14 nas duas). Mas o terceiro critério, o mais
> importante — **gap médio cair de forma sustentada em Gold/Platinum/
> Masters — falha**: o gap não cai, ele OSCILA e no fim das 5 temporadas
> está **igual ou pior** do que no início (Crown: 7,1→19,1; Masters:
> 11,7→19,0). Pior ainda: ao checar a meta ORIGINAL da Fase 0
> (`docs/tournament-targets.md`: Gold/Platinum deveriam ter **≤15% de
> títulos reais**, ou seja, bots deveriam vencer ≥85% ali), **nenhuma das
> quatro rodadas medidas até hoje — produção, Fase 8.3, 8.4 ou 8.5 — chega
> perto**: o melhor resultado em qualquer rodada é 23,3% de títulos de bot
> em Platinum (Fase 8.3), a 62 pontos percentuais do alvo. **Recomendação
> final: abandonar a correção via geração/evolução de atributo de bot** —
> ver §4.

## 1 — Viabilidade do teto por tier de destino

### 1.1 — Mecanismo

Em vez de dar um `potential` numérico aberto (70-96) a uma fatia da
população (Fase 8.3: toda ela; Fase 8.4: uma faixa de rank), o bot
recebe, na geração, um **teto de OVR travado exatamente no valor do tier
de destino pretendido** — 85 pra Gold, 87 pra Platinum, 90 pra Masters.
Reutilizando o mecanismo de rank efetivo já criado na Camada 1 da Fase
8.4 (sem estrutura nova, conforme pedido): uma fração fixa e pequena (25
bots por destino, 75 no total — mesma ordem de grandeza da Camada 1)
recebe um rank efetivo amostrado dentro da própria faixa de rank do tier
alvo (`minRanking` de cada tier já definido em `circuitCatalog.js`), e o
`potential` é travado no teto — não computado por fórmula aberta.
Deliberadamente **sem** fração voltada a Elite/Crown desta vez, pra não
reintroduzir o vazamento medido nas duas rodadas anteriores.
`absoluteRank`/`ranking_position`/pontos/país/idade permanecem
intocados — mesmo princípio de isolamento das rodadas anteriores.

### 1.2 — É mais simples ou mais complexo que ajustar fração/faixa?

**Mais simples e mais previsível.** A Fase 8.4 tentou controlar o
TAMANHO do efeito colateral cortando por FAIXA DE RANK — e isso falhou
porque o tamanho da população dentro de uma faixa de rank não é uma
variável que se define diretamente (depende da largura numérica entre os
`minRanking` dos tiers, que já não foi escolhida pensando nisso). O teto
por tier de destino elimina esse problema de raiz: **a contenção não
depende de quantos bots estão numa faixa — está embutida no próprio
valor do teto**, bot por bot. Um bot com potential travado em 85 NUNCA
ultrapassa 85, não importa quantos meses de evolução ou quantos bots
compartilham esse destino. Não há necessidade de calibrar população — só
de decidir os valores de teto e o tamanho da fração, dois parâmetros
diretos, não um efeito colateral de uma escolha de rank.

**Confirmação empírica**: o `max` de OVR de bot em QUALQUER tier, em
QUALQUER das 5 temporadas medidas, nunca ultrapassou 92 (contra 96 — o
teto absoluto do jogo — atingido já na T1-T2 nas duas rodadas
anteriores). O mecanismo se comportou exatamente como desenhado.

## 2 — Medição: os 4 sinais, critérios definidos antes de medir

### 2.1 — Critério 1 (o principal): gap médio cai de forma sustentada em Gold/Platinum/Masters — **NÃO ATINGIDO**

| Tier | T1 | T2 | T3 | T4 | T5 | T5 vs. T1 |
|---|---|---|---|---|---|---|
| Gold | 20,0 | 21,4 | 20,8 | 21,9 | 19,4 | -0,6 (~estável) |
| Platinum | 15,9 | 21,5 | 18,6 | 21,4 | 18,7 | **+2,8 (pior)** |
| Masters | 11,7 | 18,8 | 19,6 | 20,1 | 19,0 | **+7,3 (pior)** |
| Elite | 9,0 | 16,8 | 17,3 | 18,5 | 19,3 | **+10,3 (pior)** |
| Crown | 7,1 | 20,7 | 15,3 | 21,9 | 19,1 | **+12,0 (pior)** |

O gap não cai — ele SOBE na maioria dos tiers, porque o teto trava o
crescimento do bot num valor fixo enquanto os reais continuam evoluindo
livremente (real médio em Crown, por exemplo, sobe de 86,4 pra 89,4 na
mesma janela). Travar o teto do bot resolve o vazamento (§2.2) mas ao
preço de eliminar quase toda a capacidade de fechamento de gap que a
Fase 8.3/8.4 tinham (mesmo com os problemas delas). **Este é o critério
mais importante do pedido e ele falha.**

### 2.2 — Critério 2: títulos de Elite/Masters/Crown ficam em 0 (ou muito perto) — **ATINGIDO, o melhor resultado das 3 rodadas**

| Tier | Total | Produção | Fase 8.3 | Fase 8.4 | Fase 8.5 |
|---|---|---|---|---|---|
| Elite (50) | 50 | 0 | 4 (8%) | 5 (10%) | **1 (2%)** |
| Masters (50) | 50 | 0 | 3 (6%) | 2 (4%) | **0 (0%)** |
| Crown (20) | 20 | 0 | 1 (5%) | 1 (5%) | **0 (0%)** |

Masters e Crown replicam produção exatamente (0 títulos de bot); Elite
tem 1 único título de bot em 50 — o resultado mais próximo de zero das
três rodadas. Confirma a hipótese do pedido: um teto rígido por destino
contém o vazamento muito melhor que um corte por faixa de rank ou um
potential aberto pra toda uma banda.

### 2.3 — Critério 3: Top 20 não cai abaixo da produção em nenhuma temporada — **ATINGIDO, replica produção exatamente**

| Temporada | Produção | Fase 8.3 | Fase 8.4 | Fase 8.5 |
|---|---|---|---|---|
| T1 | 20/20 | 20/20 | 20/20 | **20/20** |
| T2 | 18/20 | 18/20 | 16/20 | **18/20** |
| T3 | 17/20 | 13/20 | 13/20 | **17/20** |
| T4 | 12/20 | 12/20 | 6/20 | **12/20** |
| T5 | 14/20 | 13/20 | 9/20 | **14/20** |

**A sequência inteira é idêntica à produção, temporada a temporada.** Ao
restringir o efeito a uma fração pequena e travada, a correção não
desloca reais de nível médio pra fora do Top 20 — o problema mais grave
encontrado na Fase 8.4.

### 2.4 — Sinal adicional (contagem de reais por campo): saudável, sem sinal de deslocamento

Contagens de reais no campo de Elite/Crown se mantêm na faixa normal em
todas as 5 temporadas (Elite: 305→218→191→138→123; Crown: 136→87→82→58→52
— trajetória de queda suave e comparável à produção, sem o colapso
abrupto visto na Fase 8.4 em T4, achado #2B). Dados completos por tier em
`f85-tier-cap/field-ovr-diagnostic-output.md`.

## 3 — Achado que muda a conclusão: mesmo o "sucesso" está longe do alvo real

Ao checar as quatro rodadas contra a meta LITERAL da Fase 0
(`docs/tournament-targets.md`: Gold/Platinum devem ter **≤15% de títulos
100% reais** — ou seja, bots deveriam vencer **≥85%** desses títulos;
Masters deveria ficar em 40-60% real):

| Rodada | Gold — % títulos de bot | Platinum — % títulos de bot | Masters — % títulos de bot |
|---|---|---|---|
| Produção | 10,0% | 13,3% | 0,0% |
| Fase 8.3 | 10,0% | 23,3% | 6,0% |
| Fase 8.4 | 5,0% | 10,0% | 4,0% |
| Fase 8.5 | 12,5% | 13,3% | 0,0% |
| **Alvo (Fase 0)** | **≥ 85%** | **≥ 85%** | **40-60%** |

**Nenhuma das quatro rodadas chega perto — nem de longe.** O melhor
resultado em qualquer rodada, em qualquer tier, é 23,3% (Platinum, Fase
8.3) — ainda **62 pontos percentuais abaixo** dos 85% que o alvo original
pede. Masters está entre 0% e 6% quando o alvo é 40-60%. Isto muda a
natureza da conclusão: não é que uma das três abordagens "quase resolveu"
e precisa de mais um ajuste fino — **nenhuma chegou perto o bastante pra
sequer começar a validar a direção**. Fechar esse tipo de distância
exigiria bots competitivos o bastante pra VENCER a maioria das vezes em
Gold/Platinum, não só "não ficar tão atrás na média" — uma mudança de
magnitude muito maior do que qualquer uma das três rodadas testou, e as
três já mostraram que magnitudes bem menores que essa produzem vazamento
pro topo (Fase 8.3/8.4) ou estagnação total do gap (Fase 8.5). É razoável
supor que uma correção forte o bastante pra realmente aproximar do alvo
de 85% recriaria o vazamento de forma ainda mais severa.

## 4 — Recomendação: abandonar a correção via geração/evolução de bot

Três abordagens tentadas, cada uma atacando a causa estrutural
identificada na Fase 8.3 (teto de geração ~85 + potential estreito) de um
jeito diferente:

1. **Fase 8.3 — potential aberto pra toda a população**: fecha o gap
   moderadamente, mas vaza pro topo (Elite/Masters/Crown deixam de ter
   0 títulos de bot) e ainda fica a 62+ pontos do alvo real.
2. **Fase 8.4 — potential aberto só numa faixa de rank + fração
   boosted**: fecha o gap mais e de forma mais sustentada que a 8.3, mas
   vaza pro topo de forma igual ou pior E derruba a presença de reais no
   Top 20 pela metade em relação à produção.
3. **Fase 8.5 — teto travado no tier de destino**: contém o vazamento
   quase por completo (o melhor das três) e não mexe no Top 20, mas o
   gap não fecha — na prática, fica do tamanho que estava ou pior.

**Nenhuma resolve sem um efeito colateral maior que o problema original,
e mesmo a menos ruim (8.5) não avança de forma mensurável em direção ao
alvo real.** Por instrução do pedido, registro esta conclusão em vez de
propor mais uma rodada de ajuste fino.

### 4.1 — O problema é aceitável como está?

**Não, tecnicamente** — a meta original da Fase 0 (`Gold/Platinum ≤15%
reais`) segue formalmente não atingida (produção está em 86,7-90% real,
muito acima do teto de 15%). Mas nenhuma tentativa de fechar essa
distância via atributo de bot chegou perto sem reabrir um problema pior
(vazamento pro topo, que quebraria a meta MAIS crítica — Major/P1 ≥70%
real — ou expulsão de reais do Top 20, que não tem meta formal mas foi
tratada como sinal crítico desde a Fase 5.6). Entre uma meta secundária
não atingida e o risco medido e repetido de quebrar uma meta primária,
a recomendação é aceitar o estado atual de Gold/Platinum/Masters como
está, e não perseguir mais correção via bot, pelo menos não nesta linha.

### 4.2 — Caminho alternativo, não testado: volume de calendário no meio da tabela

A Fase 8.2 testou expandir calendário no TOPO (Elite/Crown 2×) e mostrou
efeito nulo/pior na dominância agregada — mas nunca testou expandir
**Gold/Platinum/Masters especificamente**, nem uma exclusão de reais de
alto nível desses tiers via seleção (não força bruta de atributo). Duas
ideias não testadas, citadas no pedido:

- **Mais volume de Gold/Platinum/Masters** (não do topo) poderia diluir
  a concentração de reais por evento sem depender de fortalecer bot
  algum — mas o mesmo padrão da Fase 6.7 (mais calendário nem sempre
  ajuda a métrica que importa) se aplicaria; precisaria de medição
  própria, não coberta aqui.
- **Exclusão por seleção**: em vez de fortalecer bots pra vencerem
  reais, fazer reais de nível alto **preferirem menos** Gold/Platinum
  quando head-to-head — mas a Fase 8.2 já mostrou que a IA de reais só
  tem 3,8% das semanas com escolha real de qualquer forma (calendário
  escasso no topo é que os empurra pra baixo); uma regra de exclusão
  ativa mudaria essa dinâmica e teria os mesmos riscos de design que a
  Fase 8.2 já alertou (regra sem defeito correspondente pra corrigir).

Nenhuma dessas é recomendada nesta fase — são registradas como as
próximas hipóteses caso a decisão seja continuar buscando o alvo da Fase
0 por outra via, fora do escopo desta rodada.

## 5 — Validação

- Nenhum código de produção alterado. Mecanismo de teto por destino +
  instrumentação de OVR de campo implementados em 3 arquivos
  (`rankingPopulation.js`, `WorldTourLifecycle.js`,
  `audit-real-athletes-simulation.mjs`) só para esta medição e revertidos
  antes do commit — `git diff` dos três arquivos fica vazio contra o
  commit da Fase 8.4.
- `npm run lint` — limpo.
- `npm run build` — limpo.
- `node scripts/rc-qa-suite-v36.mjs` — mesmas 3 falhas pré-existentes
  (`test:rc-gameplay-balance`, `test:career-pace`, `test:ui-quality`), sem
  regressão nova.
- Scratch descartado: `resume-state.json`; mantidos `summary.json`/
  `tournament-results.csv`/`season-tier-table.md` em
  `reports/real-athletes-audit/f85-tier-cap/` como evidência. Saída bruta
  de `[DIAG_FIELD_OVR]` (não persistida em `summary.json`, `run.log`
  ignorado pelo git) copiada pra `field-ovr-diagnostic-output.md` no
  mesmo diretório.
- `reports/BETA-AUDIT-v36.1.{json,md}`, `reports/rc-qa-latest.{json,md}`,
  `reports/rc-sprint-1/*.json` revertidos via `git checkout --`.
- `src-tauri/` — sem alterações.

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Viabilidade do teto por tier de destino | ✅ viável — mais simples e mais previsível que corte por faixa de rank (Fase 8.4), contenção embutida no valor do teto em vez de depender de tamanho de população |
| 2 | Medição pontual com os 4 critérios pré-definidos | ✅ medida — Top 20 replica produção exatamente e Elite/Masters/Crown chegam a 1/0/0 títulos de bot (melhor resultado das 3 rodadas), mas o critério principal (gap cai sustentado) **falha** — gap oscila e termina igual ou pior que no início |
| 3 | Recomendação final | ⚠️ **abandonar a correção via geração/evolução de bot** — três abordagens tentadas, nenhuma resolve sem efeito colateral maior, e mesmo o melhor resultado medido fica a 62+ pontos percentuais do alvo literal da Fase 0. Aceitar o estado atual de Gold/Platinum/Masters ou explorar volume de calendário/exclusão por seleção — não testado, fora do escopo desta fase |

**Esta é a conclusão da linha de investigação Fase 8.2 → 8.5** sobre
dominância de tier por composição de força. Aguardo decisão sobre qual
caminho seguir (aceitar como está, ou abrir uma nova linha de
investigação pelo ângulo de calendário/seleção).
