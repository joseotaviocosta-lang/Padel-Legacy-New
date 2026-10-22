# LOCAL-9C.2 — Plano de implementação proposto (Modelo B)

> Proposta para aprovação. Nada aqui foi implementado. Valores de balanceamento são alvos
> **[sugerido]**, a validar pelo simulador da 9E.1 antes de virar regra.
> Base: `docs/LOCAL_9C1_LIVE_MARKET_DESIGN_AUDIT.md` e os JSONs desta pasta.

## Princípios de ordem

1. **Defeitos antes de balanceamento.** Nenhum número muda enquanto a compra não for uma operação de domínio que a tela, o simulador e os testes usam igual.
2. **Dados antes de interface.** O catálogo novo entra pelo caminho de reconciliação que já existe (`ensureExpandedShopCatalog`, por nome). A tela só muda depois.
3. **Uma medição por etapa.** Cada etapa de balanceamento termina com o driver da 9E.1 (mesmos perfis e seeds) e compara com a baseline.
4. **Nada da 9D.** Pontos de integração com patrocínio ficam como contratos de dados (campos e funções), sem regra contratual nova.

## Etapas

| Etapa | Tipo | Escopo | Depende de | Risco |
|---|---|---|---|---|
| **9C.2-A** Serviço canônico de compra e venda | Correção de defeito | `buyShopItem` e `sellInventoryItem` no domínio; Shop, Inventory e simulador passam a usá-los | — | Baixo |
| **9C.2-B** Contagem de inventário nas conquistas | Correção de defeito | Linhas compradas passam a contar (`quantity`) | A | Baixo, mas libera moedas (ver economia) |
| **9C.2-C** Higiene do catálogo | Correção de dados | Chaves de bônus órfãs, itens de demonstração, comentários de preço desatualizados | A | Médio: muda o bônus de 31 itens |
| **9C.2-D** Escada de raridade e preços | Balanceamento | Bônus e preço por raridade e categoria; incomum com degrau próprio | C | Alto |
| **9C.2-E** Papéis das categorias, colecionáveis e relíquias | Balanceamento + decisão de produto | Peso por categoria; colecionáveis e relíquias fora da força esportiva (ou dentro da escala) | D, decisão D4 | Alto |
| **9C.2-F** Registro de marcas e identidade | Nova funcionalidade (dados) | `BRAND_REGISTRY` com arquétipo, linhas e vínculo com o patrocinador | C, decisão D1 | Médio |
| **9C.2-G** Mercado por estágio de carreira | Nova funcionalidade | Vitrine do estágio atual + prévia do próximo; destaques mensais determinísticos | D, F | Médio |
| **9C.2-H** Interface da Loja | Melhoria de interface | Abas por estágio, comparação com o equipado, "base + equipamento" na ficha do item | G | Baixo |
| **9C.2-I** Validação econômica | Simulação | Driver 9E.1 com a compra canônica; 3 perfis × 3 seeds × 365/730 d | A–H | — |

Ordem segura: **A → B → C → D → E → (F ∥ G) → H → I**. F e G podem andar juntas. B pode ir junto com A se aprovado.

---

### 9C.2-A — Serviço canônico de compra e venda (defeito)

**Problema** (sondas A–G em `tests.json`): `Shop.jsx buy()` e `Inventory.jsx sellItem()` gravam em passos separados e com saldo absoluto do perfil em memória.

**Proposta**
- `src/game-core/shopLifecycle.js` (I/O) + regras puras em `src/lib/shopRules.js`:
  - `getPurchaseEligibility(profile, item, { inventory, marketState, stock, price })` → `{ ok, code, reason }`, códigos: `unknown-item`, `unavailable`, `out-of-rotation`, `locked`, `already-owned`, `out-of-stock`, `insufficient-funds`, `price-changed`.
  - `buyShopItem(profileId, itemId, { expectedPrice })`: relê perfil, item, inventário, contratos e histórico; calcula preço por `computeItemPrice` com a data da carreira; grava num único `localGame.batch` com `idempotencyKey: shop-purchase:<item>:<n>` (mesmo padrão da H1-R1): `PlayerInventory.create` (com `quantity: 1`, `purchase_price`), `playerIncrement coins −preço`, extrato e atualização de estoque/demanda.
  - `sellInventoryItem(profileId, inventoryId)`: relê; recusa equipado ou inexistente; `delete` + `playerIncrement +valor` + extrato no mesmo lote.
- Shop, Inventory e `scripts/lib/v526Actions.buyAndEquip` chamam o serviço. O simulador deixa de replicar a compra (pendência 9B/9E.1).
- **Sem mudar valores:** preço, multiplicador, desconto, venda a 30% do preço gravado continuam iguais nesta etapa.

**Decisões pendentes**: (a) comprar de novo um item já possuído: recusar (recomendado) ou permitir cópia; (b) base da venda: manter 30% do preço gravado (= 25% do preço de lista) ou usar o `purchase_price`.

**Critérios de aceite**
- Sondas A–F invertidas: dois cliques → 1 item e 1 débito; item possuído recusado; estoque 0 recusado; falha dentro do lote → nenhum efeito; crédito concorrente preservado.
- Simulador da 9E.1 com a compra canônica: 30 dias com resultado econômico igual ao da baseline (mesmos itens, mesmos preços); diferenças só onde o duplicado ou o estoque eram explorados (não eram).
- `test-local-9b-*`, `test-local-8e-shop-integrity`, `test-shop-*` sem regressão.

### 9C.2-B — Conquistas de coleção (defeito)

**Problema** (`inventory-achievement-probe.json`): `fetchInventoryStats` só conta linhas com `quantity > 0`; a compra não grava `quantity`. 14 conquistas de coleção (79.100 moedas de recompensa somadas) nunca avançam com compras.

**Proposta**: a compra canônica grava `quantity: 1`; a leitura trata ausência como 1 (saves existentes). Sem migração de save.

**Atenção econômica**: libera recompensas que hoje ninguém recebe (Colecionador 1.000, Toque de Midas 1.000, Mito Vivo 10.000, Exclusividade 10.000, Rainbow 4.000…). Medir no simulador junto da etapa D. Mesmo corrigido, três conquistas continuam inalcançáveis sem duplicados: Guarda-Roupa (15 roupas; o catálogo tem 8), Sapateiro (10 tênis; tem 9) e Arsenal Completo (250 itens; tem 125). Decidir se o limiar muda ou se a 9C.2 acrescenta itens.

**Critérios de aceite**: comprar 1 item de cada raridade move `totalOwned`, `legendary`, `mythic`, `exclusive`, `categories`, `rarities`; carreira antiga sem `quantity` conta igual; desbloqueio pago uma vez.

### 9C.2-C — Higiene do catálogo (dados)

- **Chaves órfãs**: 31 itens declaram `positioning`, `strength`, `control`, `reflexes`, `stamina`, `speed`, `reputation`, `concentration`, `tactics`. `scaleBonus` as descarta: as linhas Control One, Power Entry, Soft Touch e Pro Staff têm **metade** do bônus das outras linhas. Proposta: trocar cada chave órfã por um atributo real coerente com o item (ex.: `positioning` → `defense`, `strength` → `smash`, `control` → `volley`) **ou** dobrar o atributo restante. Decisão de design, ver D-C1.
- **Itens de demonstração** (`localSeed`, 4 itens, 3 sem bônus, marcas Court Labs e Padel Legacy): retirar do catálogo de carreira nova; em saves existentes, manter (são possuíveis) com `is_available: false`.
- Comentários de preço desatualizados em `storeCatalog.js` (título de Crown = 30.000; o real é 90.000) e em `marketEngine.js` (teto 90.000; o real é 108.000 com ×1,2).
- **Identidade estável**: `ensureExpandedShopCatalog` reconcilia por **nome**. Renomear item cria um novo e deixa o antigo órfão. Antes de qualquer renomeação: introduzir `catalog_key` estável (ou proibir renomeação nesta fase).

**Critérios de aceite**: 0 chaves órfãs declaradas; nenhum item sem bônus à venda; carreira antiga reconcilia sem duplicar (abrir a Loja 10× não cria nada — gate da 8E).

### 9C.2-D — Escada de raridade e preços (balanceamento)

Alvo **[sugerido]** (ver §16 do documento principal): bônus da raquete 2 / 3 / 4 / 6 / 8 / 10 / 12; demais categorias metade, arredondada; custo por ponto crescendo ~1,6–2× por degrau (hoje: 255 → 612 → 771 → 1.788 → 3.956 → 5.955 por ponto no kit); sem degrau "dominado" (incomum = comum).

- Um preço por (categoria, raridade), com variação de marca de ±15%, em vez de dois catálogos sobrepostos (itens antigos no piso × itens da Fase 1 com o dobro do bônus).
- Pisos de `SHOP_PROGRESSION` revistos junto, porque hoje 39 itens estão no piso e o preço não diz nada do item.

**Critérios de aceite**: em toda categoria, raridade maior ⇒ bônus ≥ e preço >; 0 inversões; custo marginal por ponto monotônico; driver 9E.1: equilibrado compra até raro no ano 1 e pelo menos 1 épico no ano 2; competitivo não termina negativo só por equipamento; econômico continua viável.

### 9C.2-E — Categorias, colecionáveis e relíquias (balanceamento + produto)

- Peso por categoria **[sugerido]**: raquete ~35% do bônus do kit, tênis ~20%, grip ~15%, as demais repartem o resto (hoje: cada categoria de suporte tem o mesmo teto da raquete, 10).
- Colecionáveis: sem bônus esportivo (prestígio) **ou** bônus pequeno e fixo. Relíquias: sistema próprio (§14 do documento principal). Decisão D4.

**Critérios de aceite**: kit topo do catálogo dentro do teto aprovado (ex.: ≤ +5 OVR declarados, ≤ ~+15 pp em partida equilibrada no motor); relíquia nunca melhor que o melhor item da Loja da mesma categoria, se tiver bônus.

### 9C.2-F — Registro de marcas (dados)

- `BRAND_REGISTRY` (`src/lib/brandRegistry.js`): `brandId`, nome de exibição, arquétipo, atributos de assinatura, faixa de preço (−15% a +15%), categorias atendidas, `sponsorId`.
- Os itens passam a apontar `brand_id`; `findSponsorIdByManufacturer` vira consulta ao registro. Troca de nome (licenciamento, D1) vira troca de dado.

**Critérios de aceite**: toda marca com item tem arquétipo; nenhuma marca com 1 item só por acaso (fundir ou completar); desconto e rotação de patrocínio continuam iguais (é contrato para a 9D).

### 9C.2-G — Mercado por estágio (funcionalidade)

- Vitrine = itens do estágio econômico atual (`getCareerEconomyStage`) + até 2 degraus abaixo, e **prévia** do próximo estágio (bloqueada, sem botão de compra). O catálogo completo fica num filtro secundário.
- Rotação mensal continua `getEquipmentMarketState` (determinística, sem tick diário). Acrescenta 3–4 "destaques do mês" determinísticos por `career_id + mês` (sem `Math.random`).
- Eventos de mercado (`processMarketTick`, sem chamador): decidir remover o código morto ou trocá-lo por 1 evento mensal determinístico. Nada diário.

**Critérios de aceite**: carreira nova vê ≤ 25 itens na vitrine; estágio profissional vê 30–50; zero gravação ao abrir a Loja (gate da 8D/8E); mesmo `career_id` e mês → mesma vitrine.

### 9C.2-H — Interface (melhoria)

- Card: preço, "+X sobre o que você usa" (ganho efetivo pela fonte canônica, igual ao do simulador), selo de marca.
- Ficha do item: atributo `base +bônus = efetivo` (já existe no Perfil).
- Mobile 390 px: uma coluna de filtros, sem tabela larga. Sem nova chamada de I/O por card.

**Critérios de aceite**: Loja abre em ≤ o tempo atual (benchmark da 8G); captura 390 px sem rolagem horizontal; nenhuma regra na tela (só chama o domínio).

### 9C.2-I — Validação

Driver `sim-local-9e1-decisions.mjs` com a compra canônica. Mesmos perfis, seeds 1–3, 365 e 730 dias. Comparar com a baseline (marcando o que é pós-H1). Métricas: moedas por ponto efetivo por raridade, meses até cada kit, patrimônio, OVR natural × efetivo, ranking, gasto com equipamento na despesa.

## Persistência e saves

- Mudanças de bônus e preço chegam aos saves existentes pela reconciliação por nome (já sincroniza `price` e `attribute_bonus`). Itens equipados mudam de efeito imediatamente (o modificador é derivado, 9B). Nada a migrar.
- Remoção de item: `is_available: false`, nunca `delete` (há inventários que o referenciam).
- Campos novos (`quantity`, `purchase_price`, `brand_id`, `catalog_key`) são opcionais; schema 22 mantido. Se a etapa D ou E exigir invalidar saves de desenvolvimento, seguir a política do projeto: versão registrada, aviso, nada apagado automaticamente.

## Dependências da LOCAL-9D

- 9D consome: `brandId`/`sponsorId` do registro (F); `buyShopItem` com `source` (`shop` | `sponsor`) para itens concedidos por contrato; o desconto continua em `computeItemPrice`.
- 9C.2 não implementa: item concedido, exigência de uso, exclusividade de marca, desconto por tier de contrato, linha Signature.
- E1-08 (todo contrato fica no Bronze) limita qualquer efeito de patrocínio na Loja: hoje só Babolat, Siux e Asics (Bronze) têm itens com desconto alcançável.
