# Fase 8.4 — Duas camadas juntas: melhora dois sinais, piora um terceiro — não recomendado como está

> **COMPLETA — medição pontual, nada implementado em escala**, conforme
> pedido. As duas camadas (teto de geração por fração boosted + potential
> atrelado a faixa de tier) foram implementadas juntas só para esta medição
> e já revertidas. **Resultado misto**: o gap médio de OVR fecha mais e de
> forma mais sustentada do que a proposta isolada da Fase 8.3 em TODOS os
> tiers, e a dominância de bots em Gold/Platinum efetivamente CAI (o
> critério "Gold/Platinum/Masters melhoram" é parcialmente atingido). Mas
> o critério de sucesso explícito do pedido — "Elite/Masters/Crown
> continuam em 0 títulos de bot" — **não é atingido** (5/2/1 títulos,
> comparável ou pior que a Fase 8.3 isolada), e um quarto sinal não
> previsto no critério original piora de forma severa: **presença de reais
> no Top 20 despenca pra 6/20 na T4** (contra 12/20 na produção e na
> proposta isolada da 8.3 no mesmo checkpoint) — quase metade do já
> preocupante resultado da 8.3. Por instrução explícita do item 4 do
> pedido, este relatório reporta essa piora antes de qualquer
> recomendação de implementação. **Causa identificada**: a "faixa
> Gold-Masters" da Camada 2, definida por corte de rank (141-450), cobre
> ~310 bots — 35% da população procedural — não uma fração pequena e
> controlada; somada aos 75 boosted da Camada 1, **43% do elenco de bots
> passou a ter potential largo**, quase tão amplo quanto o alargamento
> cego da própria Fase 8.3 (100% dos bots). A tentativa de conter o
> vazamento por corte de RANK não conteve a POPULAÇÃO afetada, porque o
> intervalo numérico de rank entre os `minRanking` de Gold (450) e Masters/
> Elite (230/140) é, por si, muito largo.

## 1 — Mecanismo implementado (temporário, revertido)

### Camada 1 — teto de geração (fração boosted)

`src/lib/rankingPopulation.js`, sob `DIAG_TWO_LAYER_FIX`: 75 bots (fração
fixa, não a população inteira), selecionados deterministicamente por hash
espalhado por todo o elenco (não os primeiros 75 por rank), recebem um
"rank efetivo" amostrado de 1 a 150 — usado **somente** para computar
`overall`/`potential`. `absoluteRank` real (e, com ele, `ranking_position`,
`world_ranking_points`, país, idade, `circuit_category`) permanece
inalterado — os 100 reais não são deslocados e o bot boosted não entra na
disputa de ranking mundial real; ele só nasce estruturalmente mais forte
(OVR 81-95, média 87,6 na amostra), mas precisa subir o ranking de verdade,
jogando, pra chegar aos tiers que sua força permitiria.

### Camada 2 — potential atrelado a faixa de tier

Potential alargado (fórmula de `generateProspects`: `max(70,overall+8)` até
96) **apenas** para bots com rank de geração (efetivo, se boosted) em
`140 < rank ≤ 450` — banda escolhida pra cobrir Gold (minRanking 450)/
Platinum (320)/Masters (230) e excluir deliberadamente a zona já elegível
a Elite (140) e Crown (75) por rank — **ou** que fazem parte da fração
boosted da Camada 1 (incluídos explicitamente, conforme pedido, mesmo que
o rank efetivo caia abaixo de 140). Bots fora dessa faixa e não-boosted
mantêm o potential estreito atual, sem alteração.

## 2 — As três métricas, T1-T5, comparadas com produção e com a Fase 8.3

### 2.1 — Gap médio de OVR por tier (reais − bots)

| Tier | T1 | T2 | T3 | T4 | T5 | T5 — Fase 8.3 isolada | T5 — melhora vs. 8.3? |
|---|---|---|---|---|---|---|---|
| Gold | 18,9 | 22,5 | 18,5 | 18,4 | **14,0** | 15,5 | ✅ sim |
| Platinum | 14,0 | 19,9 | 16,4 | 19,7 | **14,1** | 14,5 | ✅ sim (marginal) |
| Masters | 10,7 | 16,5 | 15,2 | 15,0 | **11,5** | 14,5 | ✅ sim |
| Elite | 6,7 | 15,5 | 11,6 | 13,7 | **11,4** | 13,5 | ✅ sim |
| Crown | 9,6 | 13,4 | 10,9 | 15,1 | **10,0** | 12,5 | ✅ sim |

**Este critério é atingido — em todos os 5 tiers o gap final é menor do
que na proposta isolada da Fase 8.3**, e a trajetória não fica presa num
platô alto como a 8.3 (Gold, por exemplo, sai de 22,5 na T2 pra 14,0 na
T5 — queda sustentada, não estabilização). (T1 de produção sem alteração,
medido no baseline limpo da Fase 8.3, tinha gap de 24,5/16,2/13,1/9,3/10,3
nos mesmos 5 tiers — a T1 desta rodada já abre menor em quase todos.)

### 2.2 — Títulos 100%-bot por tier, cumulativo (5 temporadas)

| Tier | Total | Produção | Fase 8.3 isolada | Fase 8.4 (2 camadas) | Critério atingido? |
|---|---|---|---|---|---|
| Elite (50) | 50 | **0** | 4 (8%) | **5 (10%)** | ❌ não — pior que a 8.3 |
| Masters (50) | 50 | **0** | 3 (6%) | **2 (4%)** | ❌ não — ainda > 0, mas melhor que 8.3 |
| Crown (20) | 20 | **0** | 1 (5%) | **1 (5%)** | ❌ não — igual à 8.3 |
| Platinum (30) | 30 | 4 (13,3%) | 7 (23,3%) | **3 (10%)** | ✅ sim — melhor que produção E 8.3 |
| Gold (40) | 40 | 4 (10%) | 4 (10%) | **2 (5%)** | ✅ sim — melhor que produção E 8.3 |

**Resultado misto, conforme o critério de sucesso definido no próprio
pedido**: Gold e Platinum de fato melhoram — a dominância de bot CAI
abaixo até da produção atual nesses dois tiers, o que é um resultado novo
(nem a 8.3 isolada conseguia isso). Mas o critério explícito "Elite/
Masters/Crown continuam em 0" **não é atingido em nenhum dos três** —
Elite inclusive piora ligeiramente frente à 8.3 isolada (5 vs. 4 títulos).
A fração boosted (Camada 1), mesmo pequena (75 bots), é suficiente pra
produzir tantos títulos de Elite quanto o alargamento cego de potential
pra TODA a população na Fase 8.3.

### 2.3 — Presença de reais no Top 20 (por temporada)

| Temporada | Produção | Fase 8.3 isolada | Fase 8.4 (2 camadas) |
|---|---|---|---|
| T1 (2026) | 20/20 | 20/20 | 20/20 |
| T2 (2027) | 18/20 | 18/20 | **16/20** |
| T3 (2028) | 17/20 | 13/20 | 13/20 |
| T4 (2029) | 12/20 | 12/20 | **6/20** |
| T5 (2030) | 14/20 | 13/20 | **9/20** |

**Este sinal PIORA de forma severa em relação à produção atual** — o
critério de alerta do item 4 do pedido. Na T4, a presença de reais no
Top 20 cai pela metade frente à produção E frente à própria proposta
isolada da Fase 8.3 (6/20 contra 12/20 nas duas). T5 recupera parcialmente
(9/20) mas continua bem abaixo de ambas as referências (14/20 produção,
13/20 Fase 8.3).

**Diagnóstico do porquê**: os dados de campo (`[DIAG_FIELD_OVR]`, T4)
mostram que a CONTAGEM de reais aparecendo nos campos de Elite/Masters/
Crown despenca junto — Elite: 85 reais no campo (contra 170-210 nas
temporadas anteriores da mesma rodada), Crown: 32 (contra 70-140). Não é
que os reais estejam sumindo do jogo (nenhum real fica de fora de TODAS
as chaves nas 5 temporadas — achado #2B confirma 0/100), é que uma fatia
grande demais de bots agora compete de igual pra igual em pontos/ranking
ao longo de várias temporadas, empurrando reais de nível médio pra baixo
na classificação geral — não só perdendo títulos pontuais, mas perdendo
posição de ranking de forma ampla e cumulativa.

## 3 — Causa raiz do sinal negativo: a "faixa por rank" não limitou a POPULAÇÃO

O desenho da Camada 2 tentou conter o vazamento restringindo por FAIXA DE
RANK (141-450), presumindo que isso seria "uma fração pequena", análoga à
Camada 1. Não é:

```
Bots na faixa natural 141-450 (Camada 2, não-boosted): 450 - 140 = 310
Bots boosted (Camada 1):                                            75
Total com potential largo:                                         385
Proporção da população procedural (894 bots):                    43,1%
```

**43% da população de bots ganhou potential largo — quase tão amplo
quanto os 100% da Fase 8.3.** A intenção era limitar a Camada 2 a "bots
cujo rank de geração já cai historicamente em Gold-Masters" como uma
correção cirúrgica; na prática, o INTERVALO NUMÉRICO entre os
`minRanking` de Gold (450) e o de Masters/Elite (230/140) é, por
construção do próprio catálogo de tiers, largo o bastante pra cobrir mais
de um terço do elenco de bots. Corte por rank não é o mesmo que corte por
POPULAÇÃO — e foi a população afetada, não a faixa de rank em si, que
determinou o tamanho do efeito colateral.

Isso explica por que os títulos de Gold/Platinum caem (mais bots
competitivos "no meio" absorvem mais títulos ali mesmo, sem precisar subir
mais) mas Elite/Crown ainda vazam (a Camada 1, sozinha, com só 75 bots já
mostrou ser suficiente pra produzir vazamento comparável ao da 8.3) e o
Top 20 desaba (a massa de 385 bots mais fortes eleva a barra de
competitividade em quase todo o meio de tabela, empurrando reais médios
pra baixo na classificação cumulativa, não só nos tiers de topo).

## 4 — Recomendação: não implementar como está — ajustar parâmetro e remedir

**Não recomendado implementar em escala nesta configuração.** Dois dos
quatro sinais medidos pioram ou não atingem o critério pedido (títulos de
Elite/Masters/Crown não zeram; Top 20 piora bem abaixo da produção),
apesar dos ganhos reais em gap médio e em Gold/Platinum.

**Ajuste de parâmetro recomendado pra uma próxima rodada de medição** (não
implementar ainda — é uma hipótese pra testar, não uma correção validada):

1. **Redefinir a Camada 2 por CONTAGEM, não por faixa de rank** — por
   exemplo, sortear um número fixo de bots adicionais (análogo à Camada 1,
   talvez 100-150 no total somando as duas camadas) pra receber potential
   largo, em vez de qualquer bot cujo rank caia num intervalo numérico. Já
   demonstrado nesta fase que corte por rank não controla o tamanho do
   efeito.
2. **Reduzir ou eliminar a fração boosted da Camada 1** se o objetivo for
   realmente zerar Elite/Crown — 75 bots já bastou pra igualar/piorar o
   vazamento da 8.3 nesses dois tiers; um número menor (ex.: 30-40) ou uma
   banda de rank efetivo mais estreita (ex.: 50-150 em vez de 1-150,
   evitando a zona 1-75 que já é Crown-elegível por rank em qualquer bot
   futuro que suba até lá) provavelmente reduz esse vazamento específico.
3. **Medir Top 20 e contagem de reais por campo em CADA rodada futura**,
   não só gap e títulos — foi o sinal que mais piorou e o único que não
   tinha critério de sucesso explícito no pedido original; sem medi-lo
   apenas por hábito nesta fase, o resultado teria sido erroneamente
   classificado como "sucesso parcial claro" quando na verdade introduz um
   problema novo, maior que o que resolve.

## 5 — Validação

- Nenhum código de produção alterado. As duas camadas + a instrumentação
  de OVR de campo foram implementadas em 3 arquivos (`rankingPopulation.js`,
  `WorldTourLifecycle.js`, `audit-real-athletes-simulation.mjs`) só para
  esta medição pontual e revertidas antes do commit — `git diff` dos três
  arquivos fica vazio contra o commit da Fase 8.3.
- `npm run lint` — limpo.
- `npm run build` — limpo.
- `node scripts/rc-qa-suite-v36.mjs` — mesmas 3 falhas pré-existentes
  (`test:rc-gameplay-balance`, `test:career-pace`, `test:ui-quality`), sem
  regressão nova.
- Scratch descartado: `resume-state.json` da rodada de 5 temporadas;
  mantidos `summary.json`/`tournament-results.csv`/`season-tier-table.md`
  em `reports/real-athletes-audit/f84-two-layer/` como evidência. A saída
  bruta de `[DIAG_FIELD_OVR]` (não persistida em `summary.json`, e
  `run.log` é ignorado pelo git) foi copiada pra
  `field-ovr-diagnostic-output.md` no mesmo diretório.
- `reports/BETA-AUDIT-v36.1.{json,md}`, `reports/rc-qa-latest.{json,md}`,
  `reports/rc-sprint-1/*.json` revertidos via `git checkout --`.
- `src-tauri/` — sem alterações.

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Mecanismo das duas camadas implementado só para medição | ✅ implementado, medido, revertido — nenhum código de produção alterado |
| 2 | Três métricas comparadas contra produção | ✅ medidas — gap médio melhora em todos os tiers (vs. 8.3 isolada); títulos melhoram em Gold/Platinum mas NÃO zeram em Elite/Masters/Crown; Top 20 PIORA de forma severa vs. produção (6/20 na T4, metade do valor de produção/8.3) |
| 3 | Recomendação final | ⚠️ **não implementar como está** — ajustar parâmetro (Camada 2 por contagem fixa, não por faixa de rank; reduzir/estreitar a Camada 1) e remedir incluindo Top 20 como critério explícito de sucesso na próxima rodada |

**Aguardo decisão sobre os parâmetros ajustados antes de qualquer nova
medição ou implementação**, conforme a disciplina desta e das fases
anteriores.
