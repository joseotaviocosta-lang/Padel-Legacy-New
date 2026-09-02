# Fase 1.5 — Teto de 500 e escritas do dissolvePartnerships

## Item 1 — o teto de 500 exclui os reais? Medido: **não, hipótese refutada**

> Script: [scripts/diag-ranking-cap-mechanism.mjs](../../scripts/diag-ranking-cap-mechanism.mjs).
> Caminho REAL e completo (`advanceDay`+`processGameStateDay`, todas as ~10
> fases diárias, incluindo `processWorldCircuit` — que precisa rodar de
> verdade pra este teste fazer sentido, ao contrário do diagnóstico
> isolado da Fase 0.3). Dados brutos:
> [ranking-cap-diagnostic-970bots.json](ranking-cap-diagnostic-970bots.json) /
> [-100bots.json](ranking-cap-diagnostic-100bots.json).

### 1.1/1.2 — quantos reais aparecem no top-500, mês a mês, e com qual ranking_position

**Os 24 reais aparecem no top-500 em TODOS os 13 meses amostrados da
temporada 1, sem exceção — 970 bots, seed `ranking-cap-970`.** E não por
pouco: no mês 1, eles ocupam exatamente as posições **1 a 24**, a própria
crista do ranking:

| Atleta | ranking_position (mês 1) | world_ranking_points |
|---|---|---|
| Arturo Coello | 1 | 13.000 |
| Agustín Tapia | 2 | 12.570 |
| Alejandro Galán | 3 | 12.140 |
| ⋮ | ⋮ | ⋮ |
| Gonzalo Alfonso (24º real) | 24 | 3.110 |

Essa posição se mantém 1-24 em todos os 13 meses verificados (jan/2026 a
jan/2027). A hipótese original — "a Race começa zerada, então eles caem
fora do top 500" — não se sustenta porque `ranking_position` **não é
calculado a partir de Race**: `processWorldCircuit`
(`circuitLifecycle.js:134`) usa `generalPoints = athlete.world_ranking_points
?? athlete.ranking_points` — e os 24 reais têm `world_ranking_points`
setado no seed (3.110-13.000, confirmado em `worldSeed2025.json`), muito
acima de qualquer bot procedural nesse estágio da temporada. Mesmo ANTES
do primeiro cálculo semanal do circuito (dia 0), o campo `ranking_position`
dos reais vem `undefined` do seed (confirmado: 0/24 têm o campo definido em
`worldSeed2025.json`) — e o comparador de `CareerEntityRepository.js:sortRows`
trata `undefined` como `''`, que em ordenação ascendente equivale a "menor
que qualquer número positivo" — ou seja, mesmo essa lacuna de dado
(candidata a bug) empurra os reais pra FRENTE da fila, não pra fora dela.

**Conclusão: os reais nunca estiveram "invisíveis" para o mercado de
parcerias por causa do teto de 500.** Eles estão estruturalmente
garantidos a ocupar o topo do ranking o ano inteiro, dado que
`world_ranking_points` do seed é muito mais alto que qualquer bot e nada
no código atual reduz esse valor ao longo da temporada.

### 1.3 — comparação com 100 bots (confirma densidade como pré-condição, não como causa)

A 100 bots (população 124, abaixo do teto), os 24 reais também aparecem em
100% dos 13 meses — resultado trivial, já que a população inteira cabe no
corte de 500. Isso bate com a expectativa: **a densidade é uma
pré-condição necessária pra o teto sequer entrar em jogo, mas na escala de
970 bots o teto continua não excluindo os reais** — a causa do baixo
pareamento/participação dos reais está em outro lugar, já mapeado pela
Fase 0.3 (ordem de iteração não é o mecanismo; ver achado #4 daquele
relatório) e não neste teto.

### O que isso muda para a Fase 2

**Nada precisa ser corrigido no teto de 500 por causa dos reais** — a
questão que motivou este item está fechada. O teto de 500 continua sendo
um achado de arquitetura válido e registrado (Fase 0.3/1.5 item 2), mas
seu impacto é sobre os ~494 bots procedurais abaixo da posição 500, não
sobre os reais. `ai_partner_id` fixo pros 12 pares históricos (Fase 2)
resolve o pareamento dos reais sem precisar de nenhuma mudança adicional
neste mecanismo.

---

## Item 2 — inventário de `list()` com limite

Ver relatório dedicado: [FASE-1.5-INVENTARIO-LIST-LIMIT.md](FASE-1.5-INVENTARIO-LIST-LIMIT.md).
Achado mais relevante lá: `evolveAthletesMonthly` (a função que envelhece
os reais, Fase 1B) usa `list('-overall_rating', 200)` — **~794 dos 994
atletas nunca evoluem atributo nenhum**, mês após mês.

---

## Item 3 — dissolvePartnerships corrigido (aplicado)

`src/game-core/aiPartnershipLifecycle.js`: as escritas individuais de
`updateAthlete()`/`entities.Partnership.update()` dentro de
`dissolvePartnerships` foram substituídas por acumulação em
`athleteUpdates`/`partnershipUpdates` e UM `bulkUpdate()` por entidade ao
final da função — mesmo padrão que `circuitLifecycle.js` já usa pro
sistema de ranking. Nenhuma outra função foi tocada (`formNewPartnerships`
não cresce ao longo da temporada, per achado da Fase 0.3 — fora do
escopo desta correção).

### Prova de comportamento idêntico

Mesma seed, mesmas três variantes de ordem (normal/invertida/embaralhada),
970 bots, 12 meses — script
[scripts/diag-partnership-market-mechanism.mjs](../../scripts/diag-partnership-market-mechanism.mjs):

| Métrica | Antes | Depois |
|---|---|---|
| Reais pareados (normal) | 4/24, real-real: 2 | 4/24, real-real: 2 |
| Reais pareados (invertida) | 4/24, real-real: 2 | 4/24, real-real: 2 |
| Reais pareados (embaralhada) | 6/24, real-real: 3 | 6/24, real-real: 3 |
| Comparações de sort (normal, 12 meses) | 638.541 | 638.541 |
| Comparações de sort (invertida) | 638.858 | 638.858 |
| Comparações de sort (embaralhada) | 641.230 | 641.230 |

Pareamentos, dissoluções e todo o volume de comparações de hash/compatibilidade
são **byte-idênticos** — a correção só muda COMO o resultado é persistido,
não o resultado em si, exatamente como esperado (nada no laço de decisão
lê o storage entre uma escrita e outra).

### Custo — antes/depois, medido isoladamente e depois na simulação completa

**Escritas (isolado, `processAiPartnershipMarket` sozinho, 970 bots, 12 meses):**

| | Antes | Depois |
|---|---|---|
| Total de escritas individuais/bulkUpdate na temporada | ~1.350-1.359 | **~303-304** |
| Escritas no mês 1 → mês 12 | 24 → ~199-205 (**8,5×**) | 24 → 26 (**1,08× — praticamente achatado**) |

**Perfilamento completo (`advanceDay`+`processGameStateDay`, todas as ~10
fases, 970 bots, 1 temporada, medido isolado — sem nenhum outro processo
concorrente rodando, pra não repetir o problema de contaminação de uma
medição anterior desta mesma sessão):**

| | Antes (`profile-report.json`, seed `profile-970`) | Depois (seed `profile-970-postfix-clean`) |
|---|---|---|
| Tempo total da temporada | 34,95 min | **22,01 min (-37%)** |
| Custo do estágio `aiPartnerships` | 677.846 ms (32,3% do total) | **143.001 ms (10,8% do total) — 4,7× menor** |
| `aiPartnerships` ms/chamada | 1.852,04 | **390,71 — 4,7× menor** |
| Custo médio por dia — mês 1 → último mês | 1.115,91 → 16.643,3 ms (**14,9×**) | 1.386,53 → 5.831,85 ms (**4,21×**) |

**O crescimento de custo ao longo da temporada caiu de 14,9× para 4,21× —
uma melhora grande, mas não total.** O resíduo de 4,21× confirma a
hipótese já registrada no perfilamento da Fase 0.2: o
`structuredClone`-por-escrita de `CareerEntityRepository.js` afeta
QUALQUER sistema que ainda escreve individualmente (world, livingWorld,
persist, staff, recovery continuam crescendo em custo absoluto no novo
perfil, embora `aiPartnerships` tenha parado de dominar). Corrigir só
`dissolvePartnerships` já rendeu a maior fatia disponível de melhoria
isolada; zerar o crescimento por completo exigiria o mesmo tratamento
(acumular + `bulkUpdate`) nos outros sistemas que fazem escrita individual
por atleta — fora do escopo pedido aqui, registrado como candidato de
uma fase de otimização futura.

### Suíte e build

Lint limpo, `npm run build` OK, suíte relevante
(`test:partnerships-v29`, `test:living-partnership-market-phase15`,
`test:world-partnership-dynamics`, `test:tournament-registration`,
`test:ranking-consistency`, `test:tournament-flow-rc`) toda verde — sem
nenhuma mudança de comportamento observável fora do custo de escrita.
