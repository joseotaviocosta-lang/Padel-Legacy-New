# Fase 0.1 — Validação do harness (por que a baseline v1/v2 não representava o jogo)

**Resultado direto:** confirmado, o harness NÃO representava o jogo. Duas causas raiz distintas foram encontradas e corrigidas, nessa ordem de descoberta. A baseline anterior (v1, e depois v2) foi descartada nas duas vezes. Uma terceira rodada (v3), construída para chamar literalmente o mesmo par de funções que o "avançar dia" real do jogo chama, está em execução — ver seção final.

---

## 1. Rastreio da divergência

### 1.1 — Achado A: formato do `id` das entidades enviesa a seleção por hash

O harness original (Fase 0) forçava `id: athlete.bot_id` / `id: team.team_key` ao criar `AthleteProfile`/`TeamRanking`, achando isso "mais limpo e determinístico". **Isso é diferente do que produção faz.** Nem `src/data/worldSeed2025.json` nem `buildSupplementalRankingPopulation` (`src/lib/rankingPopulation.js`) incluem um campo `id` — confirmado por leitura direta:

```
athlete[0] has .id field? false [ 'bot_id', 'name', 'country', ... ]
```

Em produção, `saveFoundation.js` chama `create(athlete)`/`bulkCreate(supplemental.athletes)` sem `id` — caindo sempre no fallback de `CareerEntityRepository.js`:

```js
id: data.id || makeId(entityName.toLowerCase())   // `${prefix}-${Date.now()}-${Math.random()...}`
```

`bot_id`/`team_key` são só chaves de upsert (`upsertBy(entity, existing, 'bot_id', ...)`), nunca o `.id` real da entidade — **tanto para atletas reais quanto procedurais**.

**Por que isso importa:** `aiPartnershipLifecycle.js` (`selectPair`) ordena o pool de agentes livres por `hash(mês:índice:id)` para escolher quem "ancora" um novo par. O hash usado é uma variante FNV-1a — sensível ao COMPRIMENTO/FORMATO da string, não só ao seu valor semântico. Provado empiricamente (`scripts/diag-pairing-mechanism.mjs`, rastreio mês a mês, população de produção completa):

| Esquema de id (aplicado a reais E bots) | Reais pareados no mês 1 | Reais pareados no mês 12 |
|---|---|---|
| `bot_id`/`team_key` diretos (curto, mesmo padrão para todo real) | 6/24 | 21/24 |
| Formato de produção (`makeId()`-like, comprido, com timestamp+sufixo) | 0/24 | 8/24 |

**O MESMO código, a MESMA seed, só o formato do id muda** — de quase nenhum pareamento real para quase todos. Corrigido: o harness agora NUNCA passa `id` explícito para `AthleteProfile`/`TeamRanking` — deixa o próprio `makeId()` de produção rodar, com `Math.random`/relógio já seedados para reprodutibilidade (ver seção 3).

### 1.2 — Achado B: sistemas diários inteiros ficavam de fora

O harness original só chamava `processAiPartnershipMarket` + `resolveCompletedWorldTourEvents`, em lotes de 14 dias. Rastreando o "avançar dia" real (`game-core/dayAdvanceCoordinator.js` → `advanceCareerDayOnce` → `calendarLifecycle.js:advanceCareerDayWork`), o caminho de verdade é:

```
advanceDay(profile, ...)              // career.js — calendário, treino, ensureFutureTournaments (só na virada de mês)
  → processGameStateDay(profile, ...) // game-core/gameStateLifecycle.js — TODO santo dia, sem gate
      → simulateWorldDay              // world-simulation: overall_rating/form/energia/lesão de até 80 atletas/dia
      → processAiPartnershipMarket    // (o único que o harness já chamava)
      → processAiCareerStrategyMonth
      → processWorldCircuit
      → processCircuitLifeWeek
      → processAthletePersonalityWeek
      → processInjuryRecoveryDay
      → processRelationshipWeek
      → processStaffDay
      → processLivingWorldDay → processWorldTourDay → resolveCompletedWorldTourEvents  // (o outro que o harness já chamava)
```

`simulateWorldDay` (`game-core/worldSimulationLifecycle.js`) é o mais relevante: muda `overall_rating`/`form`/`energy` (e pode lesionar, `injured_until`) de até 80 atletas por dia, por rotação de "day bucket" — **entra direto em `athleteScore`/`pairScore`** (`WorldTourLifecycle.js`, os campos usados para decidir quem entra e quem vence cada torneio) e não tem equivalente algum rodando em lotes de 14 dias.

### 1.3 — Achado menor: calendário criado em lote vs. incremental

O harness antigo criava os 32 torneios do ano de uma vez (`buildSeasonTournaments` direto). Produção cria via `ensureFutureTournaments` (`career.js`), incremental, só na virada de mês, com um horizonte de 15 meses — mas como 15 meses > 12, o ano inteiro acaba existindo cedo de qualquer forma. Não é a causa principal da divergência, mas foi eliminado mesmo assim: o harness corrigido **não cria calendário nenhum** — `createPlayerProfile` já popula o primeiro ano (mesmo bootstrap de uma carreira real) e `advanceDay` estende sozinho, exatamente como em produção.

---

## 2. Teste de paridade

**Script:** `scripts/audit-parity-test.mjs` (novo, permanente). Roda a MESMA temporada, mesma seed, mesmo elenco, por dois caminhos:

- **Universo H** — o harness original (2 funções, lotes de 14 dias).
- **Universo P** — `advanceDay` + `processGameStateDay`, dia a dia (o caminho real).

**Resultado (seed `paritysmoke`, 80 bots procedurais, 1 temporada):**

```
Universo H (harness): 31 torneios finalizados.
Universo P (produção, dia a dia): 32 torneios finalizados.
Mesmo campeão (match): 10
Campeão diferente (differ): 21   ← 68% dos torneios comparáveis
Só finalizado em H: 0
Só finalizado em P: 1
```

**Interpretação:** o "achado A" (formato do id) já estava corrigido nos dois universos deste teste especificamente — a divergência de 68% aqui é **só** o efeito do achado B (sistemas diários ausentes). Coello/Tapia aparecem como campeão em MUITOS torneios nos dois universos (confirma que a super-dupla domina em ambos os caminhos), mas em torneios DIFERENTES — o ranking relativo de duplas em cada semana específica muda porque `simulateWorldDay` altera form/energia/overall de quem está competindo naquele dia específico, e o harness em lotes nunca vê essa variação.

**Conclusão exigida pela própria instrução:** como os campeões divergem, **o harness estava errado, não o jogo.** Corrigido — ver seção 4.

---

## 3. Reconciliação dos números

| Rodada | Ids | Sistemas diários | Resultado (1ª temporada, títulos 100% reais) | Status |
|---|---|---|---|---|
| **A** (primeira medição, `--seasons=1`) | Fallback `makeId()` REAL (não sobrescrito) | Só 2 funções, lotes | **1/30 (3%)** | Válido para o que media (achado A não existia ainda porque não havia sobrescrita de id) — mas acumula o achado B |
| **C** (`--seasons=5`, agregado) | Auto-gerado, mudava a CADA execução (não determinístico) | Só 2 funções, lotes | 82/158 (47,5%) acumulado, 1ª temp. isolada não registrada | Descartado — não reprodutível (confirmado: reexecutar com a mesma "seed" dava resultados diferentes, porque não havia seed real, só `Math.random()` puro) |
| **v1** (baseline congelada, seed determinística) | **Forçado para `bot_id`/`team_key`** (achado A introduzido aqui) | Só 2 funções, lotes | 30/31 (97%) | **Descartado** — achado A |
| **v2** (mesma correção de id que v1... espera, não) | idem v1 | idem | idem | **Descartado** junto com v1, mesma causa |
| **v3** (em execução) | Fallback `makeId()`, seedado e determinístico | `advanceDay`+`processGameStateDay`, DIA A DIA | *(ver seção 4)* | Candidata a baseline real |

**A pergunta do enunciado — "se a correção de ids explica tudo, mostre o mecanismo" — resposta: NÃO explica tudo sozinha.** Explica a diferença entre rodada A/C (ids "corretos", auto-gerados) e v1/v2 (ids forçados para `bot_id`) — mecanismo demonstrado na seção 1.1. Mas rodada A e C, mesmo com id no formato certo, **ainda tinham o achado B** (sistemas diários ausentes) — por isso não podem ser tratadas como baseline válida também, mesmo sem o problema de id. Os dois achados são independentes e os dois precisavam de correção.

---

## 4. Baseline

**Não congelada ainda.** `docs/baseline-pre-refactor.json` continua com o conteúdo antigo (de v1/v2, JÁ SABIDAMENTE INVÁLIDO) até a rodada v3 terminar. O harness (`scripts/audit-real-athletes-simulation.mjs`) foi reescrito para chamar `advanceDay`+`processGameStateDay` dia a dia — construído para ser correto por construção (mesma função que o jogo chama), não por eu ter adivinhado quais sistemas "provavelmente não importam".

**Custo:** rodar dia a dia é muito mais caro (a camada de persistência clona o save inteiro a cada escrita, e agora há ~10 sistemas escrevendo por dia em vez de 2 a cada 14 dias). Determinismo foi reconfirmado nesta versão também (mesma seed → saída idêntica, testado em escala reduzida). A rodada de produção completa (970 bots, 486 duplas, 5 temporadas, seed `baseline-v3`) está rodando em segundo plano — assim que terminar, `docs/baseline-pre-refactor.json` será substituído pelo resultado real e este relatório será atualizado com os números finais e uma nova rodada do teste de paridade nessa escala, para fechar o ciclo de validação pedido.
