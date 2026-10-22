# LOCAL-9C.2-A — Integridade transacional da Loja

Primeira etapa técnica do Mercado Vivo (Modelo B, aprovado na LOCAL-9C.1).
Escopo: só integridade de compra, venda e inventário. Nenhum preço, bônus,
raridade, desbloqueio, rotação, estoque inicial ou porcentagem de revenda foi
alterado.

Base: `integracao/cloud-6o` @ `173562e`. Evidências:
`reports/local-9c2-a-shop-transaction-integrity/`.

## 1. Resumo

| Defeito (9C.1) | HEAD `173562e` | Corrigido |
|---|---|---|
| C2A-01 dois cliques | 2 itens entregues, 1 débito (346), 2 linhas de extrato | 1 item, 1 débito, 1 linha; 2º clique = `duplicate` |
| C2A-02 estoque zero | relíquia vendida por 178.417 com estoque 0 | `out-of-stock`, nada aplicado |
| C2A-03 falha parcial | item entregue, 0 debitado | nada aplicado; retry conclui uma vez |
| C2A-04 crédito sobrescrito | luvas de 372 perdidas pela venda | saldo = inicial + luvas + revenda |

Compra e venda agora são operações de domínio (`src/game-core/shopTransactions.js`)
usadas pela Loja, pelo Inventário, pelo simulador e pelos testes.

## 2. Causa-raiz

| Defeito | Causa |
|---|---|
| C2A-01 | `Shop.jsx buy()` validava e gravava a partir do perfil em memória do React; `buying` só bloqueia depois do re-render. Duas chamadas liam o mesmo saldo, criavam duas linhas de inventário e gravavam o MESMO saldo absoluto (`coins = perfil − preço`). |
| C2A-02 | `buy()` nunca lia `MarketPriceHistory.stock_remaining`; só decrementava depois, sem `await`, com `Math.max(0, …)` escondendo o estoque negativo. |
| C2A-03 | Quatro gravações independentes (inventário → saldo → extrato → histórico). Uma falha após a primeira deixava o item entregue. |
| C2A-04 | `Inventory.jsx sellItem()` gravava `coins = perfil_em_memória + revenda`, apagando qualquer crédito gravado depois de a tela carregar. |

## 3. Reprodução no HEAD

`tools/repro-c2a-defects.mjs` replica, passo a passo, `Shop.jsx buy()` e
`Inventory.jsx sellItem()` do HEAD (componentes React não rodam em Node). A
falha do C2A-03 é injetada na gravação real do débito (`PlayerAdapter.update`);
o crédito do C2A-04 é uma assinatura real de patrocínio
(`signSponsorContract`). Resultado: `repro-head-173562e.json`, gerado antes de
qualquer mudança em `src/`. Os mesmos cenários pela operação canônica:
`repro-defects.json › canonical`.

## 4. Arquitetura

**Antes.** Componente lê perfil, catálogo e histórico uma vez; na compra faz
`PlayerInventory.create` → `PlayerProfile.update({ coins })` →
`recordFinancialEntry` → `MarketPriceHistory.update` (sem `await`). Simulador
(`v526Actions.buyAndEquip`) replicava só as duas primeiras gravações.

**Depois.**

```
Loja / Inventário / simulador / testes
        │  purchaseShopItem(profileId, itemId, { operationId, expectedPrice })
        │  sellInventoryItem(profileId, inventoryItemId)
        ▼
shopTransactions.js ── planejador puro (regras) ──┐
        │                                          │ chamado DENTRO da gravação
        ▼                                          ▼
localGame.batch(planner) → CareerEntityRepository.batch → mutateActiveCareer
                           (fila serializada, rascunho clonado, 1 gravação)
```

Mudança de infraestrutura (mínima): `CareerEntityRepository.batch` aceita, além
da lista de operações, um **planejador** `(view) => ({ operations, outcome })`
ou `({ rejected })`, chamado dentro de `mutateActiveCareer`. `view` expõe só
cópias (`player`, `get`, `filter`). Lista de operações continua idêntica para
todos os chamadores antigos. Uma recusa não aplica nada e **não lança** —
lançar dentro de uma transação de avanço de dia invalidaria a transação
inteira.

R1: antes da gravação, o planejador (puro) roda uma vez numa **leitura**
(`withCareer({ save: false })`, que espera as gravações já enfileiradas e,
dentro de uma transação, vê o rascunho). Se recusa ali, a operação termina
sem `saveCareer` — nenhuma gravação física nem lógica. Se aceita, é
reavaliado dentro da gravação serializada, que continua sendo a autoridade
(pode ainda recusar, e então grava sem mudança — só em corrida real). A
recusa da leitura é correta: reflete um estado confirmado que inclui todas as
gravações anteriores; nada é aplicado com base nela.

## 5. Operações canônicas

`purchaseShopItem(profileId, itemId, options)` e
`sellInventoryItem(profileId, inventoryItemId)` devolvem
`{ ok: true, code, …, profile }` ou `{ ok: false, code, title, message, profile }`.
Só lançam quando a gravação falha (e então nada foi aplicado).

Funções puras exportadas e compartilhadas com a tela e o simulador:
`quoteShopItem`, `selectShopEvents`, `selectItemPriceHistory`,
`stockRemaining`, `sponsorRefsFromContracts`, `shopMarketState`,
`computeResalePrice`.

## 6. Validação da compra (no domínio, sobre o save atual)

Ordem: perfil ativo = `profileId` → item existe no catálogo do save → item à
venda (`is_available`) → operação já processada (`duplicate`) → item já
possuído (`already-owned`) → rotação mensal (`out-of-rotation`, regra
`getEquipmentMarketState` inalterada) → requisitos (`locked`,
`getShopItemAccess` inalterado) → estoque (`out-of-stock`) → preço →
saldo (`insufficient-funds`).

**Preço.** Calculado no planejador com a mesma fonte da tela: eventos ativos
(mesmo recorte: `is_active`, `-priority`, 20, vigentes na data da carreira),
histórico mais recente do item, contratos ATIVOS do perfil, data da carreira →
`computeItemPrice` (inalterado). `options.expectedPrice` (preço exibido) é só
um teto: se o mercado subiu, recusa `price-changed`; se baixou, cobra o atual.
Qualquer outro campo de preço, estoque ou desconto enviado é ignorado.

**Descontos.** Só os de `computeItemPrice` (15% por `sponsor_id` de contrato
ativo; 10% por nome sem `sponsor_id`), a partir dos contratos do save.

## 7. Estoque

Fonte: `MarketPriceHistory` do item (relíquias: `stock-<id>`,
`is_limited_stock`, 1–5 unidades da LOCAL-8F). Mesma definição de "limitado"
que a tela usa no selo "N restam" (`is_limited_stock && stock_remaining >= 0`).
Estoque < 1 recusa; a compra decrementa no MESMO lote, então duas compras da
última unidade produzem uma aprovação e estoque 0. Nada mudou em estoque
inicial, rotação ou reposição (não há reposição).

## 8. Idempotência e compras distintas

- **Identidade da operação:** `options.operationId` (a Loja gera um por
  intenção de compra; retry/clique duplo reusa o mesmo). Sem id, o domínio usa
  `<item>-<data>-<n>` (n-ésima compra deste item na data, calculado dentro da
  gravação; determinístico, sem RNG).
- **Marcadores duráveis:** a linha de extrato `shop-purchase-<op>` e a linha de
  inventário `inventory-shop-<op>`, gravadas no mesmo lote. Sobrevivem a
  save/load, não expiram e não usam `processed_match_finalizations` (lista
  limitada a 250 compartilhada com partidas e patrocínios).
- **Item único:** nenhum item do catálogo atual é empilhável/consumível (o
  inventário não tem `quantity` nas compras e a Loja já esconde "Comprar" de
  item possuído). Possuir bloqueia nova compra (`already-owned`), mesmo com
  outra intenção. Depois de vender, uma nova intenção compra de novo
  (compra distinta legítima, teste X6).
- **Venda:** a unidade é a linha; o extrato `inventory-sale-<linha>` (id já
  usado pelo Inventário desde a 5.27-M) marca a venda. Linha ausente + extrato
  presente = `duplicate`.
- Nenhuma deduplicação por data, item ou descrição.

## 9. Atomicidade

Compra: `create PlayerInventory` + `playerIncrement coins −preço` +
`upsert FinancialTransaction` + `update MarketPriceHistory` (demanda +5,
`purchase_count` +1, estoque −1 — mesmos efeitos de antes) num único lote.
Venda: `delete PlayerInventory` + `playerIncrement coins +revenda` +
`upsert FinancialTransaction`.

`mutateActiveCareer` aplica o lote num rascunho clonado e só o adota depois
de `saveCareer`; dentro de uma transação de persistência ativa, qualquer erro
descarta o rascunho. Testado com falha no meio do lote (depois do débito e da
entrega no rascunho) e com falha da gravação do save (P11, S23): nada aplicado.

## 10. Saldo

`playerIncrement` sozinho não garante saldo. A checagem `coins >= preço` roda
no planejador sobre o saldo do rascunho, na mesma gravação serializada que
aplica o incremento; nenhuma outra gravação intercala. P8: saldo = preço do
item mais caro de um par cuja soma excede o saldo; as duas compras
simultâneas → uma aprovada, outra `insufficient-funds`, saldo final =
saldo − preço aprovado (≥ 0), uma entrega (equivalente ao exemplo 500 / 2×400
→ 100, com preços reais do catálogo). Dívidas de outros sistemas não mudaram: só
compra e venda passaram a usar o planejador.

## 11. Venda

Valida perfil, linha existente e do próprio perfil, não equipada (regra atual
preservada: o Inventário só mostra "Vender" para não equipado), item de
catálogo com revenda > 0. Revenda: `floor(ShopItem.price gravado × 0,3)`,
inalterada (a tela exibe pela mesma função). Mudança de comportamento: uma
linha cujo item não existe mais no catálogo é recusada (`not-sellable`) em vez
de sumir por 0 moedas.

## 12. Inventário e extrato

- Uma linha por compra, com id da operação; uma remoção por venda.
- Uma linha de extrato por operação, valor = débito/crédito real, data = data
  da carreira; a repetição não duplica (upsert por id estável).
- Compras antigas (ids aleatórios, `inventory-…`) continuam válidas e
  vendáveis; nenhum histórico antigo é reescrito.

## 13. Compatibilidade de saves

Sem migração e sem campo novo. Saves antigos: linhas de inventário e extrato
existentes funcionam como antes; o marcador de venda usa o formato antigo.
Compras novas usam ids com prefixo `inventory-shop-` e `shop-purchase-` em
entidades já existentes.

## 14. Interface

Layout, filtros, cores e navegação inalterados. A Loja:
- calcula o preço exibido com `quoteShopItem` + `selectItemPriceHistory` (o
  mesmo da compra; só diferiria se houvesse dois históricos para o mesmo item,
  o que não ocorre: 14 históricos, 0 duplicados);
- mantém os avisos prévios (rotação, bloqueio, saldo) como proteção visual;
- trava síncrona (`useRef`) contra clique duplo antes do re-render;
- identidade da intenção de compra (retry da mesma intenção = `duplicate`);
- mensagens do domínio para recusa (`already-owned`, `out-of-stock`,
  `price-changed`, `insufficient-funds`, `duplicate`…);
- atualiza saldo, inventário e o selo de estoque com o resultado.

O Inventário vende pela operação de domínio, com trava síncrona, e exibe a
revenda por `computeResalePrice`. Missões (`buy_item`) continuam disparadas
pela tela após o sucesso, como antes.

## 15. Simulador LOCAL-9E.1

`v526Actions.buyAndEquip` chama `purchaseShopItem` (sem réplica);
`shopOptions` cota com as mesmas funções da Loja. Diferenças em relação ao
HEAD, por eliminação de divergências: o simulador cotava com todos os eventos
`is_active` sem checar a vigência e sem a data da carreira (dia 1 fixo), não
gravava extrato `loja` nem demanda/estoque. Resultados: §17.

## 16. Testes direcionados

`scripts/test-local-9c2a-shop-transaction-integrity.mjs` — **47/47 PASS**
(`reports/…/tests.json`). Falhas injetadas de dois tipos: exceção no meio do
lote (depois do débito e da entrega no rascunho) e falha de `saveCareer`.

| Grupo | Casos |
|---|---|
| Compra | P1 legítima · P2 saldo · P3 inexistente · P4 bloqueado · P5 estoque 0 · P6 última unidade · P7 simultâneas · P8 saldo para uma · P9 repetição · P10 repetição após recarga · P11 falha no lote / no save + retry · P12 preço forjado · P13 estoque forjado · P14 desconto legítimo · P15 desconto forjado · P16 único já possuído |
| Venda | S17 legítima · S18 inexistente · S19 duplicada · S20 simultânea · S21 venda + luvas + crédito · S22 venda + compra, venda + venda · S23 falha · S24 equipado · S25 não vendável · S26 revenda |
| Persistência | R27 após compra · R28 após venda · R29 idempotência após recarga · R30 inventário · R31 saldo · R32 extrato |
| Integração | I33 tela usa domínio · I34/I34b simulador usa domínio · I35 comprado equipa · I36 vendido não fica ativo · I37 bônus 9B · I38 atributos naturais · I39 desconto de patrocínio = tela · I40 conquistas inalteradas |
| Extras | X1 fora da rotação · X2 fora de venda · X3 sem chave em `processed_match_finalizations` · X4 última unidade disputada · X5 linha de outro perfil · X6 recompra após venda · X7 determinismo |

## 17. Regressões

Detalhe: `reports/…/regressions.md`. Working tree × HEAD `173562e`.

- Passam: 9C.1 (13/13 sem motor, catálogo/preços/bônus idênticos), 9E.1
  (48/48), 9E.1-H1 (31/31), 9E.1-H1-R1 (19/19), 9B (71/71), 9B-R1 (25/25),
  8E shop (52/52), 8E market (41/41), `shop-tier-unlock` (5/5),
  `character-equipment-overrides` (19/19), `equipment-bonus-integrity`
  (12/12), `shop-phase1` (27/27), `career-persistence-integrity` (53/53),
  `achievement-save-migration` (27/27), `cloud-7b2a-determinism` (10/10),
  lint, build, arquitetura, `git diff --check`.
- Preexistentes (mesma falha no HEAD): `cloud-7b1-save-pipeline`,
  `tier-ladder-migration-fase3`, `sports-economy-v26`.
- H1-R1 T12 falhou uma vez sob carga concorrente de CPU (determinismo de ids
  de contrato de patrocínio); isolado, passa no working tree e no HEAD.
- Regressões novas: nenhuma.

**Simulador LOCAL-9E.1, 30 dias** (`simulator-30d.json`, 3 perfis × 3 seeds,
HEAD × working tree): 0 erros, 0 violações, save/load idêntico nas 18
carreiras. Hashes diferentes, explicados: (1) preço — o evento semeado
"Semana de lançamento" (−10%, 01–07/jan) continuava valendo no simulador
antigo depois do dia 7; agora o simulador cobra o mesmo que a Loja (ex.:
Tour Grip Dry Start 59 → 66); (2) RNG — a compra canônica usa id explícito
no inventário, sem `Math.random`, e desloca a sequência determinística
(partidas e treinos seguintes mudam). Mesmos itens escolhidos, salvo
competitivo s1 (+1 grip). A baseline versionada da 9E.1 não foi regravada.

## 18. Limitações

- Identidade do item = `ShopItem.id` do save; o catálogo é reconciliado por
  nome a cada ativação (9C-09). Ids estáveis entre saves: LOCAL-9C.2-C.
- `PlayerInventory.quantity` só existe na linha de demonstração
  (`inventory-001`, quantidade 2). A venda remove a linha inteira, como antes.
- A tela carrega no máximo 200 históricos de preço; o domínio lê todos. Hoje
  há 14; acima de 200 a tela poderia exibir preço sem histórico e a compra
  recusaria `price-changed` em vez de cobrar mais.
- (R1: resolvido) recusa não passa mais por `saveCareer`, salvo quando o
  estado muda entre a leitura e a gravação.
- A Loja mostra "0 restam" no card de item esgotado, mas o botão do modal
  continua habilitado; o clique é recusado pelo domínio ("Item esgotado").
  Desabilitar o botão é melhoria de UX, não feita (sem funcionalidade nova).
- `toggleEquipItem` não confere o dono da linha (9C.1, risco baixo; fora do
  escopo).

## 19. Riscos residuais

- Outros fluxos ainda gravam `coins` absoluto a partir de perfil lido antes
  (`PlayerAdapter.update`): investimentos, staff, treinador, entrevistas,
  partes de `padel.js`. Uma compra/venda concorrente com eles não perde valor
  (incremento sobre o atual), mas esses fluxos podem sobrescrever uma
  compra/venda gravada entre a leitura e a escrita deles. Não refatorado.
  R1 E1 reproduz: `makeInvestment` com o perfil lido antes de uma compra
  apaga o débito dessa compra (item entregue, preço perdido). Exige dois
  fluxos de dinheiro intercalados na mesma sessão (outra tela/aba aberta com
  perfil antigo); a correção é migrar esses fluxos para `playerIncrement` /
  planejador — fora do escopo, sem autorização.
- `incrementMissionProgress('buy_item')` continua fora do lote (falha não
  desfaz a compra, como antes).

## 20. Dependências

**LOCAL-9C.2-B (conquistas de coleção).** Não corrigido aqui: compras não
gravam `quantity` e o progresso não muda (I40). A compra canônica é o ponto
único para a correção: o `outcome` traz `operationId`, `itemId`, `price` e o
id da linha criada; `inventory-shop-<op>` ↔ `shop-purchase-<op>` liga unidade,
data e preço pago (base para revenda sobre o preço pago e para contagem sem
pagamento retroativo: só ids `inventory-shop-` nasceram depois desta fase).

**LOCAL-9C.2-C (ids estáveis).** As operações recebem `itemId` e leem o
`ShopItem` do save; trocar a identidade exige só um adaptador no planejador.

## 21. LOCAL-9C.2-A-R1 — validação final

### 21.1 Interface no navegador real

`reports/…/tools/ui-shop-flow.mjs` dirige o **Chrome instalado** por
`puppeteer-core` (driver existente `scripts/lib/visualAuditDriver.mjs`) contra
um Vite local, viewport 390×844 mobile, perfil de navegador temporário e o
shim de storage do Tauri injetado pelo driver: a carreira é criada pela UI e
vive só nesse perfil (nenhum save real). Cliques reais em cards, modal e
botões; fixture (saldo, XP, estoque, data) pela API do próprio app na página,
sempre seguida de recarga. **20/20** (`ui-flow.json`, capturas em `ui/`).

| # | Fluxo | Resultado |
|---|---|---|
| 1 | comprar item disponível | toast "Compra realizada!", modal fecha, botão "Comprando" desabilitado durante a operação |
| 2 | débito | = preço do botão do modal (59, com o evento do dia 1); saldo do topo atualizado sem recarregar |
| 3 | entrega | linha `inventory-shop-ui-…` + 1 linha de extrato de mesmo valor; card passa a "Adquirido" |
| 4–5 | equipar e bônus | "Equipar" no Inventário; bônus efetivo = catálogo (+1), atributo natural intacto, "Bônus total +1" |
| 6 | item já possuído | modal mostra "✓ Adquirido" sem botão; tela desatualizada (compra feita em outro fluxo) → toast "Item já adquirido", sem débito |
| 7 | sem dinheiro | botão desabilitado com cadeado; saldo gasto em outro fluxo depois de abrir a tela → toast "Moedas insuficientes", saldo não negativo |
| 8 | sem estoque | relíquia com estoque 0 → toast "Item esgotado", sem débito/entrega, estoque 0 |
| 9 | dois cliques rápidos (mesmo tick) | 1 unidade, 1 débito, 1 linha de extrato, 1 toast |
| 10–12 | vender | toast "Item vendido!", linha removida (dados e tela), crédito = valor exibido no botão (30% do preço gravado); item equipado não oferece "Vender" |
| 13–14 | recarregar | saldo, inventário, item equipado, bônus e extrato idênticos |

Observação de UX (não corrigida, sem funcionalidade nova): item esgotado
mostra "0 restam" no card, mas o botão do modal fica habilitado; a recusa vem
do domínio.

### 21.2 `localGame.batch`

28 chamadas em `src/` passam lista de operações e leem `records`, `player`,
`skipped` (patrocínios, partidas, torneios, conquistas, treinador…). Testado
em `r1-batch-concurrency.json`:

- B1/B2 lista: ordem preservada (create → update → incremento → upsert →
  delete) numa gravação; formato do resultado igual, com `outcome: null`
  apenas aditivo (nenhum chamador o lê).
- B3 erro no meio da lista: propaga e nada é aplicado.
- B4 `idempotencyKey`: 2ª execução `skipped`, sem efeito e sem gravação.
- B5 recusa do planejador: nenhuma mutação e **zero gravações** (física e
  lógica) — saldo insuficiente, item inexistente, venda inexistente.
- B6 compra aceita = exatamente 1 gravação; repetição = `duplicate` sem
  gravação.
- B7 dentro de `withPersistenceTransaction` (avanço de dia): a recusa não
  invalida a transação; compra e gravações seguintes são confirmadas.
- B8 assinatura de patrocínio concorrente: 1 contrato, 1 pagamento de luvas.

Mudança da R1 (só no ramo do planejador): pré-avaliação em leitura antes da
gravação (§4). Chamadores com lista não passam por ela.

### 21.3 Concorrência financeira

| Caso | Saldo final | Inventário | Extrato | Estoque |
|---|---|---|---|---|
| C1 compra + compra | início − p1 − p2 | +2 | +2 | — |
| C2 compra + venda | início − preço + revenda | +1 −1 | +2 | — |
| C3 compra + luvas | início − preço + luvas | +1 | +1 | — |
| C4 venda + luvas | início + revenda + luvas | −1 | +1 | — |
| C5 venda + venda (+ repetição) | início + r1 + r2 | −2 | +2 | — |
| C6 última unidade ×2 + outra compra | início − Σ pagos | +2 | +2 | 1 → 0 |
| C7 falha de persistência na compra + venda concorrente | início + revenda; retry da compra cobra 1× | venda aplicada; compra não | só a venda; depois o retry | — |

Risco externo separado (E1): §19.

### 21.4 Regressões

`reports/…/regressions-r1.md`, execução sequencial: 9C.2-A 47/47, R1 18/18,
UI 20/20, 9E.1 48/48, H1 31/31, H1-R1 19/19 (T12 incluído), 9B 71/71,
9B-R1 25/25, 8E shop 52/52, 8E market 41/41, `shop-tier-unlock` 5/5,
`character-equipment-overrides` 19/19, `equipment-bonus-integrity` 12/12,
`shop-phase1` 27/27, `career-persistence-integrity` 53/53,
`cloud-7b2a-determinism` 10/10, lint, build, arquitetura, `git diff --check`.
Nenhuma falha nova em relação ao HEAD `173562e`.
