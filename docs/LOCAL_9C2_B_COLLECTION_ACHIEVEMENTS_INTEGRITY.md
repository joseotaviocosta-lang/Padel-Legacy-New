# LOCAL-9C.2-B — Conquistas de coleção: progresso e integridade das recompensas

Segunda etapa técnica do Mercado Vivo (Modelo B). Base:
`integracao/cloud-6o` @ `0fbd969`. Evidências:
`reports/local-9c2-b-collection-achievements/`.

Nenhuma meta, recompensa, preço, raridade ou item do catálogo foi alterado.

## 1. Resumo

| | Antes (HEAD `0fbd969`) | Depois |
|---|---|---|
| Compra conta para coleção | **não** (só `quantity > 0`; a Loja nunca grava `quantity`) | sim: linha sem `quantity` = 1 unidade |
| Itens "diferentes" | contava linhas (duplicadas legadas inflavam) | conta `item_id` distintos |
| Pagamento de conquista | lote atômico, mas saldo/XP **absolutos** lidos antes do lote | `playerIncrement` dentro de lote com planejador |
| Idempotência | `create` duplicado abortava o lote (dentro do avanço de dia invalidaria a transação) | conquistas existentes decididas dentro da gravação serializada |
| Saves antigos | — | reconciliação única **sem recompensa** do que o inventário já prova |
| Liberação das 14 recompensas | inalcançáveis por defeito | **ligada** (`COLLECTION_REWARDS_RELEASED = true`, aprovada e validada na R1, §18) |

## 2. Auditoria das conquistas (`repro-head-0fbd969.json › audit`)

Exatamente **14** conquistas avaliáveis, todas na categoria "coleção", soma
**79.100** moedas. Todas medem **posse atual** do inventário
(`achievementContext.fetchInventoryStats`), avaliadas no fechamento de cada dia
(`achievementLifecycle.processAchievementsDay`) e no fim de partida de torneio
(`TournamentModal`). Conclusão = registro `PlayerAchievement`
`pa-<conquista>-<perfil>` (id determinístico); pagamento no mesmo lote, com
extrato `reward-pa-…`. Não repetíveis; não revogadas ao vender.

| Conquista | Descrição | Métrica | Meta | Moedas | Itens no catálogo | Alcançável |
|---|---|---|---|---|---|---|
| Colecionador | Possua 25 itens diferentes | itens distintos | 25 | 1.000 | 125 | sim |
| Acumulador | Possua 50 itens diferentes | itens distintos | 50 | 3.000 | 125 | sim |
| Museu Pessoal | Possua 100 itens diferentes | itens distintos | 100 | 8.000 | 125 | sim |
| Arsenal Completo | Possua 250 itens diferentes | itens distintos | 250 | 30.000 | 125 | **não** |
| Toque de Midas | Possua 1 item lendário | `rarity = lendario` | 1 | 1.000 | 19 | sim |
| Rei Mida | Possua 10 itens lendários | idem | 10 | 5.000 | 19 | sim |
| Mito Vivo | Possua 1 item mítico | `rarity = mitico` | 1 | 10.000 | 13 | sim |
| Exclusividade | Possua 1 item exclusivo | `is_exclusive` (relíquias e históricos) | 1 | 10.000 | 14 | sim |
| Armeiro | Possua 20 raquetes diferentes | `category = raquete` | 20 | 1.500 | 60 | sim |
| Sapateiro | Possua 10 pares de tênis diferentes | `category = tenis` | 10 | 1.200 | 9 | **não** |
| Guarda-Roupa | Possua 15 peças de vestuário | `category = roupa` | 15 | 1.200 | 8 | **não** |
| Tecnólogo | Possua 5 acessórios tecnológicos | `category = acessorio_tec` | 5 | 2.000 | 8 | sim |
| Pau para Toda Obra | 1 item de cada categoria | 9 categorias | 1 | 1.200 | 9 cat. | sim |
| Rainbow Collection | 1 item de cada raridade | 7 raridades (catálogo canônico) | 1 | 4.000 | 7 rar. | sim |

Raridades e categorias gravadas já estão na forma canônica (contagem igual à
normalizada). Fora do grupo, também "coleção" mas **não avaliáveis** pelo
motor (fora de `EVALUABLE_TRIGGER_TYPES`, inalteradas): Primeira Compra
(`buy_item`), Fabricante Fiel (`brand_loyalty`), Durabilidade Zero
(`item_broken`), Veterano de Equipamentos (`long_equipped`).

Interpretações (§3 da missão): nenhuma das 14 usa aquisição acumulada,
histórico ou marca. Usadas: coleção atual, itens distintos, categorias
distintas, raridades (e o atributo `is_exclusive`). Marcas e aquisição
histórica: **não aplicáveis** a nenhuma conquista avaliável.

## 3. Causa-raiz e reprodução no HEAD

`fetchInventoryStats` filtrava `inventory.filter((row) => Number(row.quantity) > 0)`.
O schema de `PlayerInventory` não tem `quantity`; `Shop.jsx` (até a 9C.2-A) e
`purchaseShopItem` (9C.2-A) criam uma linha por equipamento, sem o campo. Só a
linha de demonstração do kit inicial (`inventory-001`, `quantity: 2`) contava.
Afeta **todas** as categorias e raridades, compra antiga ou canônica.

Reprodução (`repro-head-0fbd969.json`, gerada antes de qualquer mudança em
`src/`): 15 compras canônicas (6 raridades, 9 categorias, uma relíquia
exclusiva) → contexto `totalOwned 1, categories 1, rarities 1, legendary 0,
mythic 0, exclusive 0`; fechamento do dia: nenhuma conquista de coleção;
após save/load, idêntico. Linhas compradas: `quantity` ausente.

## 4. Fonte canônica do progresso

O próprio inventário canônico (escrito só por `purchaseShopItem` /
`sellInventoryItem`, atômicos e idempotentes desde a 9C.2-A). As 14 conquistas
são de **posse atual**, então o progresso é derivado do inventário a cada
avaliação; **nenhum contador paralelo** foi criado. Histórico de aquisições
não é necessário para nenhuma delas (e não existe de forma confiável para
compras anteriores à 9C.2-A).

## 5. `quantity`

`achievementContext.inventoryRowUnits(row)`:

| `quantity` | unidades | motivo |
|---|---|---|
| ausente / `null` / `''` | 1 | equipamento único (forma de toda compra) |
| número finito > 0 | parte inteira | pilha (só a linha de demonstração hoje) |
| 0, negativo, inválido | 0 | consumido/corrompido, nunca conta |

Contagens por **`item_id` distinto** (as descrições dizem "itens diferentes",
"raquetes diferentes"): linhas duplicadas do mesmo item (saves anteriores à
9C.2-A) contam uma vez. `totalUnits` fica disponível no contexto, sem uso por
conquista. Nada é gravado: nenhum `quantity = 1` atribuído a registro algum,
nenhuma migração.

Formatos encontrados: equipamentos e colecionáveis comprados (sem
`quantity`), relíquias compradas (idem, `is_exclusive` no catálogo), linha de
demonstração (`quantity 2`, `starter_seed`), linhas legadas (id aleatório,
sem `quantity`). Não há itens empilháveis no catálogo nem itens concedidos por
recompensa.

## 6. Idempotência, compra, venda e recompra

- Progresso só existe quando a linha existe: compra recusada (saldo,
  estoque), duplicada (mesma operação, clique duplo), com falha injetada ou
  repetida após save/load não muda nada (A5–A9).
- Venda remove a linha → posse atual cai; recompra restaura; nada duplica
  (A10).
- Conquista registrada não é revogada ao vender e não paga de novo ao
  recomprar (id `pa-<conquista>-<perfil>`). Comprar → receber → vender não dá
  lucro em nenhuma das 14 (§10). Repetir compra e venda não gera nova
  recompensa.
- Equipar/desequipar não afeta a contagem (A4). Não existe item gratuito,
  relíquia concedida ou item consumível no jogo hoje.

## 7. Recompensas: atomicidade e idempotência

`syncPlayerAchievements` passa a usar `localGame.batch` com planejador (9C.2-A):

- quais conquistas já existem é lido **dentro da gravação serializada**;
- registro `PlayerAchievement` + extrato `reward-pa-…` + `playerIncrement`
  de moedas e XP no **mesmo lote** (sem saldo absoluto);
- sincronizações concorrentes: cada conquista registrada e paga uma vez,
  sem depender de um `create` duplicado abortar o lote (C6);
- falha no meio do lote: nem registro, nem moedas, nem extrato; a próxima
  avaliação conclui e paga uma vez (C5);
- recusa (nada a registrar): sem gravação física (pré-avaliação da 9C.2-A-R1).

Valores das recompensas inalterados.

## 8. Saves antigos e conquistas preexistentes

Política: **nenhuma recompensa retroativa** por histórico incompleto.

- Flag `collection_achievements_v1_reconciled` no perfil (mesmo padrão de
  `achievements_v2_reconciled` da Fase 12; sem mudança de schema — o perfil é
  livre no validador). Perfil novo nasce com ela (`padel.js ensureMyProfile`).
- Save sem a flag: na primeira sincronização com a liberação ligada, as
  conquistas de coleção que o inventário **já prova** são registradas como
  desbloqueadas **sem recompensa** (`reconciled: true`,
  `reward_delivered: false`); a flag é gravada no mesmo lote. Depois disso,
  aquisições novas pagam normalmente (D1, D5).
- Conquista antiga paga: preservada, sem estorno (D3/D4). Antiga ambígua
  (reconciliada sem pagamento): continua sem pagamento. Save anterior à
  Fase 12: reconciliação antiga continua 100% silenciosa (D7).
- Inventário (inclusive duplicadas), conquistas e atributos naturais
  intactos (D2/D6). Nenhuma migração destrutiva.
- Limitação: compras feitas por um save antigo entre a atualização e a
  primeira sincronização com a liberação ligada também entram na
  reconciliação (conservador: não paga a mais).

## 9. Três metas inalcançáveis (não alteradas)

| Conquista | Meta | Elegíveis | Por quê | Proposta (para aprovação) |
|---|---|---|---|---|
| Arsenal Completo | 250 itens | 125 (10 relíquias com 1–5 unidades, Top 10) | catálogo tem metade; item único não repete | A) 120 (todo o catálogo menos 5); B) 115 (todo o catálogo sem relíquias); C) "todos os itens do catálogo" (meta derivada do catálogo) |
| Sapateiro | 10 tênis | 9 | falta 1 | A) 9 (todos); B) 8 |
| Guarda-Roupa | 15 peças | 8 | faltam 7 | A) 8 (todas); B) 6 |

Nenhum evento, recompensa ou item gratuito oferece caminho alternativo. Com
"itens diferentes", duplicar não ajudaria (e a Loja não vende duplicado).
32.400 moedas (41% do total) estão nessas três.

## 10. Impacto econômico (`economic-impact.json`, `simulator-365d.json`)

| | Moedas |
|---|---|
| Máximo teórico | 79.100 |
| Alcançável (catálogo atual) | **46.700** |
| Em metas inalcançáveis | 32.400 |
| Esperado nas simulações 9E.1 (1 ano, seed 1) | 0 / 0 / **1.200** (econômico / equilibrado / competitivo) |

Conjunto mais barato que cumpre cada conquista (preço de lista, sem eventos):

| Conquista | Custo | Revenda | Recompensa / custo | Estágio exigido |
|---|---|---|---|---|
| Pau para Toda Obra | 4.044 | 1.010 | 29,7% | nível 8, Top 500 |
| Colecionador | 12.337 | 3.079 | 8,1% | nível 3 |
| Armeiro | 22.304 | 5.567 | 6,7% | nível 8, Top 500 |
| Toque de Midas | 19.200 | 4.800 | 5,2% | nível 25, Top 100 |
| Tecnólogo | 42.840 | 10.710 | 4,7% | nível 25, Top 100 |
| Mito Vivo | 42.000 | 10.500 | 23,8% | nível 35, Top 40 |
| Acumulador | 58.740 | 14.673 | 5,1% | nível 8, Top 500 |
| Exclusividade | 78.000 | 19.500 | 12,8% | nível 45, Top 10 (relíquia) |
| Rainbow Collection | 146.994 | 36.748 | 2,7% | nível 45, Top 10 |
| Rei Mida | 192.000 | 48.000 | 2,6% | nível 25, Top 100 |
| Museu Pessoal | 821.329 | 205.313 | 1,0% | nível 35, Top 40 |

- **Nenhum exploit**: em todas, recompensa < custo − revenda (comprar →
  receber → vender sempre perde dinheiro). Repetir não paga de novo.
- Início de carreira: só Pau para Toda Obra e Colecionador são realistas
  (Top 500 / nível 3). Baseline 9E.1: ranking ~250–370 em 1 ano e ~100–300 em
  2 anos, ≤ 16 compras em 2 anos, renda total ~45 mil/ano.
- Médio prazo (Top 100): Midas, Tecnólogo, Rei Mida — recompensas de 1–5 mil,
  pequenas diante de compras de 19–192 mil.
- Elite (Top 40/Top 10): Mito Vivo e Exclusividade (10 mil cada) — 24% e 13%
  de desconto efetivo sobre a compra; Rainbow e Museu, irrelevantes frente ao
  custo.
- Acúmulo simultâneo possível em compras de catálogo inteiro, sempre como
  fração do gasto. Efeito sobre staff/treinador: no competitivo, +1.200 em
  1 ano levou a +1 compra; sem efeito nos outros perfis.

## 11. Controle de liberação

A correção torna alcançáveis recompensas que nenhuma carreira jamais recebeu.
Na 9C.2-B o pagamento ficou desligado; na **R1** foi aprovado e, depois da
validação (§18), **ligado**: `achievementEngine.COLLECTION_REWARDS_RELEASED = true`
(harness/testes: `globalThis.__PL9C2B_COLLECTION_REWARDS`).

- Ligado (estado atual): reconciliação única sem recompensa para saves
  antigos; pagamento atômico e único para aquisições.
- `false` continua sendo um desligamento seguro: progresso visível, nada
  registrado nem pago, flag de saves antigos não gravada (testado em G1/G2 e
  no Chrome).

## 12. Interface

Sem mudança de layout, cor ou navegação; nenhuma notificação nova
(reconciliadas são silenciosas, como na Fase 12). Chrome real
(`ui-achievements.json`, 7/7, capturas em `ui/`): progresso correto com a
liberação desligada (1/1 em andamento, "Colecionador 10/25"); com a liberação
ligada, conquistas concluídas (lista "Concluídas" / escada avança para "Rei
Mida 1/10"), pagas uma vez, iguais após recarregar.

## 13. Simulador

Sem regra de conquista nos scripts: o simulador já usa
`processAchievementsDay` (fechamento do dia real). `tools/sim-collection-wrapper.mjs`
liga/desliga a chave sem tocar o simulador. 365 dias, 3 perfis, seed 1: ver
§10. Baseline versionada da 9E.1 não regravada. Limitação: uma seed por
perfil, 1 ano; políticas da 9E.1 compram por ROI esportivo, não por coleção.

## 14. Testes

`scripts/test-local-9c2b-collection-achievements.mjs` — **32/32**
(`tests.json`). Grupos A progresso (unidades, compra, equipado, recusada,
duplicada, concorrente, falha, save/load, venda/recompra), B coleção (legado,
duplicadas, categorias, colecionáveis, raridades, relíquia, demonstração,
posse atual), C recompensas (concluída, incompleta, uma vez, repetição,
save/load, falha, concorrência + luvas, extrato, XP), D compatibilidade
(save antigo, paga, ambígua, duplicadas, parcial, Fase 12, atributos), G
liberação (padrão desligado, progresso visível, ligar). Marcas e aquisição
histórica: não aplicáveis (nenhuma conquista avaliável as usa).

## 15. Regressões

Detalhe: `reports/…/regressions.md` (working tree × HEAD `0fbd969`).

- Passam: 9C.2-A-R1 18/18, 9E.1 48/48, H1 31/31, H1-R1 19/19, 9B 71/71,
  9B-R1 25/25, 8E 52/52 e 41/41, suítes de Loja/inventário, persistência
  53/53, determinismo 10/10, 17 suítes de conquistas (inclui
  `achievement-save-migration` 27/27 e `achievements-audit` 180/180), lint,
  build, arquitetura, `git diff --check`.
- Preexistentes (mesmas mensagens no HEAD): `achievement-career-progression`,
  `achievements-ui-v2`, `sports-economy-v26`.
- **Duas mudanças esperadas em testes antigos** — na 9C.2-B não alterados;
  **atualizados na R1** (§18.4), ambos passando:
  - 9C.2-A **I40** (46/47): afirmava que a compra não alterava a contagem
    ("fica para a 9C.2-B"). Agora altera (1 → 2) e não registra/paga
    (liberação desligada).
  - `achievement-reward-atomicity-v524e`: a checagem **estática** da linha 13
    exige o texto `localGame.batch(operations`; o lote agora recebe planejador.
    Cópia temporária com só essa linha aceitando o planejador: 7/7 (uma
    escrita, nunca conquista paga sem saldo, restart sem repagar).
- Regressões comportamentais novas: nenhuma.

## 16. Riscos residuais

- Linha cujo item sumiu do catálogo (renomeado: catálogo reconcilia por nome)
  conta em "itens diferentes" junto com o item novo — dependência da
  LOCAL-9C.2-C (ids estáveis).
- Janela de reconciliação de saves antigos (§8).
- Entre a compra e o fechamento do dia, o card mostra 100% (1/1) em andamento;
  a conclusão e o pagamento acontecem no fechamento do dia (comportamento de
  todas as conquistas desde a LOCAL-8F).
- Kit inicial conta como posse atual (item legítimo, §18.3).
- `buy_item`, `brand_loyalty`, `item_broken`, `long_equipped` continuam não
  avaliáveis (fora do escopo).

## 17. Decisões (resolvidas na R1, salvo a 2)

1. Liberação das recompensas de coleção — **aprovada e ligada** (§18.1).
2. **Metas inalcançáveis — PENDENTE**: propostas com custo em §18.2, nenhuma
   alteração aplicada.
3. "Itens diferentes" = `item_id` distinto para todas as 14 (inclui
   Guarda-Roupa, Tecnólogo e raridades) — **confirmado**; já era a
   implementação. Ids estáveis entre saves: LOCAL-9C.2-C.
4. Kit inicial — **continua contando** (item legítimo; §18.3).
5. Testes antigos — **atualizados** (§18.4).

## 18. LOCAL-9C.2-B-R1 — encerramento

### 18.1 Liberação das recompensas

Validação **antes** de ligar (`PL9C2B_FORCE_RELEASE=1`,
`r1-release-prevalidation.json`, 12/12) e **depois** com o padrão do código
(`r1-release.json`, 12/12) — `scripts/test-local-9c2b-r1-release.mjs`:

| Caso | Resultado |
|---|---|
| E1 comprar → receber → vender → recomprar, 3 ciclos | "Toque de Midas" paga **uma** vez (1.000); cada ciclo perde dinheiro; saldo = extrato |
| E1 save/load + 2 fechamentos | nada pago de novo, registro único |
| L1 save antigo, duas avaliações **concorrentes** no 1º contato | Midas e Pau para Toda Obra registradas uma vez, reconciliadas, **0 moeda e 0 extrato** de coleção; flag gravada; saldo = extrato |
| L1 duas recargas + fechamentos | reconciliação não se repete, nada pago, nada duplica |
| L3 após reconciliação, aquisição nova (mítico) | "Mito Vivo" paga 10.000 uma vez |
| F1 falha no lote da reconciliação | nem registro nem flag; a próxima avaliação reconcilia uma vez, sem pagar |
| L2 save antigo sem nada a provar | flag gravada sem registro; 1ª conquista real paga normalmente |

Mais a suíte 9C.2-B (32/32: atomicidade C5, concorrência + luvas C6, saldo ×
extrato C9, saves antigos D1–D8) com a liberação ligada. Nenhum risco
financeiro novo ⇒ `COLLECTION_REWARDS_RELEASED = true`.

### 18.2 Metas inalcançáveis — propostas (NÃO aplicadas)

Custo do conjunto mais barato (preço de lista, `economic-impact.json ›
proposalsNotApplied`):

| Conquista (moedas) | Proposta | Custo mínimo | Recompensa/custo | Estágio | Recomendação |
|---|---|---|---|---|---|
| Arsenal Completo (30.000), meta 250 | A) 120 itens | 2.159.220 | 1,4% | nível 45, Top 10 (relíquias) | — |
| | B′) 115 itens sem relíquias | 1.742.820 | 1,7% | nível 45, Top 10 | **B′**: todo o catálogo regular, sem depender de estoque limitado de relíquia |
| | C) todos os 125 | 2.651.220 | 1,1% | nível 45, Top 10 | "completar o catálogo" literal, mas exige as 10 relíquias (1–5 unidades, rotação de 20%) |
| Sapateiro (1.200), meta 10 | A) 9 (todos os tênis) | 142.176 | 0,8% | nível 35, Top 40 | **A** ("todos os tênis"; nome continua verdadeiro) |
| | B) 8 | 76.176 | 1,6% | nível 25, Top 100 | — |
| Guarda-Roupa (1.200), meta 15 | A) 8 (todo o vestuário) | 144.408 | 0,8% | nível 35, Top 40 | **A** |
| | B) 6 | 38.808 | 3,1% | nível 25, Top 100 | alternativa de médio prazo |

Nenhuma opção permite lucro (recompensa < custo − revenda em todas). Exige
nova aprovação explícita; a liberação não dependeu disto.

### 18.3 Kit inicial

Origem: `localSeed.PlayerInventory` `inventory-001` ("Grip Performance",
`shop-003`, `quantity: 2`), materializada por
`CareerInitialDataService.remapSeedRow`, que a marca `starter_seed`. A decisão
documentada da 5.27-M (comentário em `remapSeedRow`) a descreve como **"linha
PESSOAL de partida (… grip inicial …) — continua existindo (é o estado inicial
da economia validada)"**; a marca só a exclui de conquistas que medem
**ações** do jogador (patrocínio, investimento). O produto existe no catálogo e
é vendido na Loja; a linha equipa e vende pela regra normal (K1).

| Classe | Esta linha? |
|---|---|
| Item legítimo concedido | **sim** (kit de partida validado) |
| Registro técnico de demonstração | não comprovado (vem do seed, mas foi mantido de propósito como estado inicial) |
| Item legado / de teste | não |

Decisão: **continua contando**, como 1 produto (o `quantity: 2` não vira dois
produtos). Nenhum critério por nome, quantidade ou raridade.

### 18.4 Testes antigos atualizados

- 9C.2-A **I40**: agora verifica que a compra legítima atualiza o progresso
  (+1 produto, sem gravar `quantity`), que repetir a mesma operação não conta
  de novo (`duplicate`) e que a compra em si não registra conquista.
- `achievement-reward-atomicity-v524e`: a checagem textual
  `localGame.batch(operations` virou validação estrutural compatível com o
  planejador — **uma** chamada a `localGame.batch`, planejador `(view) =>`,
  registro `PlayerAchievement` e crédito `playerIncrement` no lote, e **nenhum
  saldo absoluto** (`coins = (Number(…` / `coins: (Number(…`). A nova regra
  reprova o código do HEAD (saldo absoluto) — mais rígida que a anterior. Os 6
  casos de comportamento (1 escrita, nunca conquista paga sem saldo, restart
  sem repagar) não mudaram.
- 9C.2-B grupo G: padrão agora ligado (G0); `false` testado como
  desligamento (G1/G2).

### 18.5 Chrome real

`tools/ui-r1-release.mjs` (`ui-r1-release.json`, **9/9**, capturas
`ui/r1-*.png`), liberação no padrão: compra pelo modal da Loja → 1/1 em
andamento; fechamento do dia → concluída, +1.000 no saldo e no extrato;
recarga idêntica; dois fechamentos sem repagar; venda pelo Inventário e
recompra pela Loja sem nova recompensa (saldo cai: sem lucro); save legado
(sem flag, inventário que prova "Pau para Toda Obra") reconciliado **sem
pagamento** e exibido como concluído. `tools/ui-achievements.mjs` (7/7)
continua validando o desligamento (`false` na página).

### 18.6 Regressões da R1

`reports/…/regressions-r1.md`, liberação **ligada**, execução sequencial × HEAD
`0fbd969`: 9C.2-A 47/47 (I40 novo), 9C.2-A-R1 18/18, 9C.2-B 32/32, 9C.2-B-R1
12/12, Chrome 9/9 e 7/7, `reward-atomicity` 7/7 (checagem estrutural), demais
suítes de recompensas, migração 27/27, persistência 53/53, 9E.1 48/48, H1
31/31, H1-R1 19/19, 9B 71/71, 9B-R1 25/25, 8E, Loja/inventário, determinismo
10/10, lint, build, arquitetura, `git diff --check`. Falhas: só as 3
preexistentes do HEAD (`achievement-career-progression`, `achievements-ui-v2`,
`sports-economy-v26`), com as mesmas mensagens. **Regressões novas: nenhuma.**

Estado final da flag: `COLLECTION_REWARDS_RELEASED = true`.

## 19. LOCAL-9C.2-B-R2 — proposta 75/6/5 (SUBSTITUÍDA — não aplicar como final)

> Estado histórico preservado: a R2 documentou 75/6/5 e gerou
> `r2-goals-validation.json` e `economic-impact.json` com esses valores, mas o
> código nunca convergiu para 75 (a árvore manteve 115/9/8 da LOCAL-9C.2-C e a
> validação R2 registra 6/16). Não usar §19 como meta final — ver §20 (R4,
> 60/6/5, aprovada).

### 19.1 Metas aplicadas

| Conquista | Meta anterior | Meta final | Critério |
|---|---:|---:|---|
| Arsenal Completo | 250 | **75** | 75 identidades distintas de equipamento elegível; relíquias não contam |
| Sapateiro | 10 | **6** | 6 pares de tênis distintos |
| Guarda-Roupa | 15 | **5** | 5 peças de vestuário distintas |

As recompensas não foram alteradas: Arsenal Completo mantém 30.000 moedas / 15.000 XP; Sapateiro e Guarda-Roupa mantêm 1.200 moedas / 600 XP cada. A contagem continua por identidade distinta, não por quantidade de linhas ou unidades; duplicatas não progridem. O Grip Performance inicial continua sendo um item legítimo e conta uma vez.

### 19.2 Coerência econômica

`tools/economic-impact.mjs` foi atualizado para usar o mesmo critério do Arsenal (`own_equipment`, sem relíquias) e regenerou `economic-impact.json`.

| Conquista | Custo mínimo | Revenda | Custo líquido após recompensa e venda | Estágio mínimo | Recompensa/custo |
|---|---:|---:|---:|---|---:|
| Arsenal Completo | 234.130 | 58.516 | 145.614 | nível 15, Top 200, reputação 20 | 12,8% |
| Sapateiro | 20.976 | 5.244 | 14.532 | nível 15, Top 200, reputação 20 | 5,7% |
| Guarda-Roupa | 19.608 | 4.902 | 13.506 | nível 15, Top 200, reputação 20 | 6,1% |

Nenhuma das 14 conquistas de coleção tem exploração lucrativa: comprar, receber e revender ainda reduz o saldo. As reduções não mudam a política do simulador.

### 19.3 Compatibilidade e testes R2

`scripts/test-local-9c2b-r2-goals.mjs` — **16/16 PASS** (`r2-goals-validation.json`): 74/75 e 75/75; 5/6 e 6/6; 4/5 e 5/5; compra duplicada; venda/recompra; save/load; pagamento prévio; save antigo reconciliado; duas avaliações simultâneas; falha do lote e recuperação. Cada caso verifica conquista, saldo, extrato e inventário.

Saves antigos continuam carregando: a primeira reconciliação registra as metas já provadas como `reconciled=true`, `reward_delivered=false`, sem crédito de moedas/XP e sem transação. Saves já pagos mantêm o registro idempotente e não recebem nada novamente. Como a reconciliação é anterior ao pagamento e gravada no mesmo lote, reduzir a meta não cria pagamento retroativo em carreira antiga.

### 19.4 Simulações e risco residual

A baseline LOCAL-9E.1 não foi regravada. A tentativa de executar os cenários de 365 e 730 dias, para os perfis econômico, equilibrado e competitivo, parou antes da criação da carreira: `Save Foundation` tentou usar o armazenamento nativo Tauri e o harness Node retornou `TAURI_UNSUPPORTED`. A repetição de 30 dias confirmou o mesmo bloqueio. Não há resultado de simulação novo a interpretar; a comparação previamente versionada permanece apenas como referência histórica, não como evidência R2.

Risco residual: executar a matriz de simulações em um runtime Tauri configurado (ou ajustar o harness para suprimir o backup nativo em `MemoryStorage`) antes do commit. A alteração de meta e sua validação de integridade não dependem desse runtime.

Arquivos R2 alterados: `src/lib/achievementsData.js`, `reports/local-9c2-b-collection-achievements/tools/economic-impact.mjs`, `reports/local-9c2-b-collection-achievements/economic-impact.json`, `reports/local-9c2-b-collection-achievements/r2-goals-validation.json` e este documento.

## 20. LOCAL-9C.2-B-R4 — metas moderadas finais 60/6/5 e reconciliação V2

Metas finais implementadas (código, testes e evidências convergem):

| Conquista | Meta anterior (C) | Meta final R4 | Critério |
|---|---:|---:|---|
| Arsenal Completo | 115 | **60** | 60 identidades distintas elegíveis (`own_equipment`); relíquias não contam |
| Sapateiro | 9 | **6** | 6 pares de tênis distintos |
| Guarda-Roupa | 8 | **5** | 5 peças de vestuário distintas |

Recompensas inalteradas: Arsenal 30.000 moedas / 15.000 XP; Sapateiro e Guarda-Roupa 1.200 / 600. `COLLECTION_REWARDS_RELEASED = true` mantido. Contagem por identidade canônica (LOCAL-9C.2-C): duplicatas, renomeações e IDs antigos/novos não inflam; kit inicial conta uma vez; relíquias fora do Arsenal. Demais conquistas inalteradas.

### 20.1 Custo mínimo exato (R4)

`tools/economic-impact.mjs` regenerado sob as metas 60/6/5 (mesmo critério do Arsenal, sem relíquias):

| Conquista | Custo mínimo | Revenda (30%) | Líquido após revenda e recompensa | Estágio mínimo | Recompensa/custo |
|---|---:|---:|---:|---|---:|
| Arsenal Completo (60) | 113.679 | 28.406 | 55.273 | nível 15, Top 200, reputação 20 | 26,4% |
| Sapateiro (6) | 20.976 | 5.244 | 14.532 | nível 15, Top 200, reputação 20 | 5,7% |
| Guarda-Roupa (5) | 19.608 | 4.902 | 13.506 | nível 15, Top 200, reputação 20 | 6,1% |

Referências: Arsenal 50 = 58.740; Arsenal 75 = 234.130; recompensa Arsenal 60 = 30.000. Nenhuma combinação lucrativa: recompensa < custo − revenda em todas as 14 (comprar → receber → revender sempre perde; repetir não paga de novo). Sapateiro 6 e Guarda-Roupa 5 confirmados acima, sem exploit.

### 20.2 Reconciliação V2 — regras

Nova flags: `collection_achievements_v2_reconciled` + `collection_achievements_goals_version = 2` (`achievementEngine.js`). Carreiras novas nascem com V1=true, V2=true e versão 2 (`padel.js ensureMyProfile`, escrita única). Saves preexistentes não têm o campo de versão.

1. Vale para saves novos e antigos, inclusive já reconciliados na V1.
2. Na primeira avaliação sob as metas novas, o que já está satisfeito (60/60, 6/6, 5/5 ou qualquer coleção já provada) é registrado com `reconciled:true`, `reward_delivered:false`, `reward_coins/xp = 0`, sem extrato.
3. Conquistas já pagas são preservadas (id `pa-<id>-<perfil>`), sem estorno e sem repagar.
4. O que for alcançado depois da V2 paga normalmente, uma vez.
5. Sem pagamentos duplicados (decisão dentro do lote serializado; `playerIncrement`).
6. Idempotente (reavaliar não muda nada), atômica (lote único ou nada), resiste a avaliações simultâneas e a falhas (nada gravado; próxima avaliação conclui).
7. Preserva saldo, XP, extrato e inventário no caminho silencioso.
8. V2 é aplicada antes de qualquer pagamento da redução, no mesmo lote.
9. Distinção explícita: ausência da flag V2 sozinha não decide; exige `versão !== 2` para reconciliar silenciosamente. Só limpar a flag sem limpar a versão não simula save antigo. Sem forma segura, o trabalho pararia — a forma acima foi considerada segura e implementada.

### 20.3 Testes R4

`scripts/test-local-9c2b-r4-goals.mjs` — **25/25 PASS** (`r4-goals-validation.json`): 59/60 e 60/60; 5/6 e 6/6; 4/5 e 5/5; duplicados; IDs antigos/novos; renomeações com/sem alias; relíquias excluídas; kit inicial; compra recusada; venda/recompra; save/load; conquista previamente paga; save antigo não reconciliado; save antigo já V1; save novo (nasce com V1+V2+versão); concorrência; falha e recuperação; atomicidade; integridade de moedas/XP/extrato; conquista obtida após a V2.

Save antigo com 60/60, 6/6 ou 5/5 não recebe pagamento retroativo; carreira nova conquista e recebe normalmente as três recompensas.

Identidade estável (LOCAL-9C.2-C) verificada em `scripts/test-local-9c2c-collection-identity.mjs` — **46/46 PASS** (`reports/local-9c2-c-collection-identity/identity-tests.json`), atualizado para metas 60/6/5 com censo preservado (125 identidades, 115 elegíveis, 9 tênis, 8 vestuário, 10 relíquias).

### 20.4 Arquivos R4

Alterados: `src/lib/achievementsData.js` (60/6/5), `src/lib/achievementEngine.js` (V2), `src/lib/padel.js` (nascimento com V2+versão), `scripts/test-local-9c2b-r4-goals.mjs` (novo), `scripts/test-local-9c2c-collection-identity.mjs` (metas 60/6/5), `reports/local-9c2-b-collection-achievements/tools/economic-impact.mjs` + `economic-impact.json` (60/6/5), `reports/local-9c2-b-collection-achievements/r4-goals-validation.json` (novo), `reports/local-9c2-c-collection-identity/identity-tests.json` e este documento. Baselines históricas não regravadas; backup Tauri de produção intocado.

## 21. LOCAL-9C.2-C — identidade estável de coleção + metas 115/9/8

Decisão do owner (final): Arsenal Completo = 115 itens (relíquias não contam),
Sapateiro = 9 pares, Guarda-Roupa = 8 peças. Recompensas inalteradas
(30.000 / 1.200 / 1.200). As metas 60/6/5 da seção 20 eram proposta
intermediária de trabalho e ficam substituídas por esta seção.

### 21.1 Identidade estável (`src/lib/collectionIdentity.js`, novo, puro)

Separação entre identidade de catálogo e identidade de conquista:

- Regra anterior: uma linha por `item_id`. Como o catálogo reconcilia por
  NOME, renomear/substituir um produto criava uma linha nova e o save antigo
  + produto novo contavam 2 (risco residual da R1, §16).
- Regra nova: `resolveCollectionId(linha, shopItem)` →
  `relic:ano:categoria` (relíquia verdadeira, match estrutural contra
  HISTORICAL_RARE_ITEMS: ano+categoria+raridade, sem `catalog_order`) ou
  `catalog:chave` (nome normalizado resolvido pelo mapa
  COLLECTION_ALIASES, vazio no embarque).
- display-name nunca é identidade; sem hash de nome; desconhecido nunca vira
  conhecido (retorna null, não conta, não quebra); genuinamente distintos
  nunca colapsam (só alias explícito funde).
- Relíquia renomeada mantém a identidade sem alias (caso real: rename da
  Fase 0 preservou id estrutural e modelo).

Elegibilidade do Arsenal (`isArsenalEligible`): toda identidade resolvida,
exceto relíquias. Colecionáveis contam (catálogo regular).

### 21.2 Contagem por identidades (achievementContext.js)

`fetchInventoryStats` deduplica por identidade canônica (antes: por
item_id), mantendo "primeira linha com ShopItem wins". Novos campos no
contexto: `equipmentOwned` (distintos não-relíquia, para o Arsenal).
`totalOwned` = distintos totais. Semântica de posse atual preservada
(venda reduz, recompra restaura, unlock nunca revoga); starter kit conta 1.

### 21.3 Novo trigger (`own_equipment`)

Arsenal Completo usa `own_equipment` → `context.inventory.equipmentOwned`
(threshold 115). `own_items` (25/50/100) inalterado. Trigger registrado em
EVALUABLE_TRIGGER_TYPES, COLLECTION_ACHIEVEMENT_TRIGGERS e no peso de
relevância (55, igual a own_items). Nenhum nome de conquista foi alterado;
a descrição do Arsenal agora diz "115 itens (relíquias não contam)".

### 21.4 Censo de alcançabilidade (programático, não manual)

Via harness real sobre carreira em memória (seed + catálogo + relíquias):

| Conjunto | Identidades | Meta | Veredito |
|---|---:|---:|---|
| Catálogo próprio total | 125 | — | = R1 §2 |
| Relíquias (template canônico) | 10 | — | estrutural |
| Elegíveis Arsenal (total − relíquias) | 115 | 115 | alcançável |
| Tênis distintos | 9 | 9 (Sapateiro) | alcançável |
| Vestuário distinto | 8 | 8 (Guarda-Roupa) | alcançável |

Todas as 115 elegíveis são compráveis com perfil no teto (ou seed inicial);
gating (nível/rank/reputação) e estoque limitado de relíquia verificados por
`getShopItemAccess` + disponibilidade de mercado.

### 21.5 Economia (sem exploit)

Conjuntos mínimos (preço de lista canônico, revenda = 30%):

| Conquista | Custo | Revenda | Líquido (recompensa) |
|---|---:|---:|---|
| Arsenal 115 | 1.742.820 | 435.705 | +1.189.992 (recompensa 30.000) |
| Sapateiro 9 | 142.176 | 35.544 | +98.324 (recompensa 1.200) |
| Guarda-Roupa 8 | 144.408 | 36.102 | +98.988 (recompensa 1.200) |

Idênticos aos projetados na R1 §18.2 (B′/A/A). Ciclo comprar→receber→vender→
recomprar perde dinheiro; repetir não paga de novo.

### 21.6 Saves legados e idempotência

- Save antigo com duplicatas/órfãs: reconcilia sem quebrar nem inflar.
- Save já recompensado: nunca pago de novo (registro idempotente).
- Save da era R1 (flag V1, sem versão) com 9 tênis: reconcilia Sapateiro em
  silêncio na primeira avaliação (sem pagar), gravando flag V2 + versão 2 —
  mesma política da R1 para transições de regra. Carreiras novas (V2 na
  origem) pagam normalmente.
- Kill switch: `false` mostra progresso sem registrar nem pagar;
  `true` volta a registrar e pagar.
- Determinismo: censo idêntico entre carreiras. I40 inalterado e verde.

### 21.7 Validação

`scripts/test-local-9c2c-collection-identity.mjs` — 47/47 PASS
(`reports/local-9c2-c-collection-identity/identity-tests.json`): U (9),
A (6), B (10), C (6), D (4), E (5: E1/E2/E3/E3b/E4), F (2), G (1), H (2).
Chrome real (`tools/ui-9c2c-goals.mjs`) — 9/9: compra pelo modal da Loja →
progresso 2/9 → sem unlock parcial → reload estável; alias funde 2 em 1
(sem alias, fratura em 2); aba Conquistas exibe 115/9/8; zero erros de página.
Regressões: 9C.2-A 47/47, 9C.2-A-R1, 9C.2-B 32/32, 9C.2-B-R1, atomicidade,
recompensas, migração 27/27, persistência 53/53, 9E.1, H1/H1-R1, 9B/9B-R1,
8E, loja/inventário, determinismo, lint, arquitetura, build,
`git diff --check` — sem regressões novas (só as 3 preexistentes do HEAD).

### 21.8 Arquivos 9C.2-C

Novos: `src/lib/collectionIdentity.js`,
`scripts/test-local-9c2c-collection-identity.mjs`,
`reports/local-9c2-c-collection-identity/` (identity-tests.json,
ui-9c2c-goals.json, tools/ui-9c2c-goals.mjs, ui/*.png).
Alterados: `src/lib/achievementsData.js` (metas 115/9/8 + own_equipment +
copy), `src/lib/achievementContext.js` (dedup por identidade +
equipmentOwned), `src/lib/achievementEngine.js` (case own_equipment +
trigger sets), `src/lib/achievementRelevance.js` (peso own_equipment),
mais §18.4/§20.4 pontuais onde a mecânica V2 exigiu neutralidade de metas
(comentários; sem mudança de comportamento).
Nada foi removido: arquivos e evidências R2/R4 permanecem intactos no
worktree; as metas 60/6/5 estão substituídas por decisão do owner.
