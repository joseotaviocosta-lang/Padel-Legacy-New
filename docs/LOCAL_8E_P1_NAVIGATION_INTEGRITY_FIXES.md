# LOCAL-8E — Correção dos três P1 de integridade na navegação

Branch `integracao/cloud-6o` · base `4226055` (LOCAL-8D) · **sem commit** (aguardando validação).

Regra: **abrir Mercado Mundial, Jornal ou Loja quantas vezes o jogador quiser não pode modificar indevidamente a carreira.**

Os três defeitos vêm da auditoria LOCAL-8D (`docs/LOCAL_8D_NAVIGATION_PERSISTENCE_AUDIT.md`, achados 8D-01..03). Cada um tem um teste de reprodução que falha no código do HEAD e passa com a correção. As evidências estão em `reports/local-8e-p1-navigation-integrity/` (`*-before-fix.json` e `*-after-fix.json`).

## 1. Mercado Mundial (8D-01)

### Causa raiz

`WorldMarket.jsx` chama `getGlobalMarketSnapshot()` (`src/game-core/globalMarketLifecycle.js`) a cada abertura. A função executava dois passos de escrita:

```
getGlobalMarketSnapshot
 ├─ ensureWorldMarket(careerDate)        worldMarketLifecycle.js
 │    initializeWorldMarket: ordena os 500 atletas de maior OVR por OVR×2+forma e, a
 │    quem falta market_value/expected_salary/world_rank/market_status, grava
 │    normalizeAthlete(): age, potential e current_form semeados quando ausentes,
 │    world_rank = posição nessa ordenação, career_status 'ativo', market_* …
 │    (AthleteProfile.bulkUpdate de 500 registros)
 └─ updateCoachMarket(careerDate)
      cria os treinadores do catálogo que faltam (Coach.bulkCreate) e regrava
      market_available/market_month/market_demand/market_salary/market_signing_bonus
      de TODOS os treinadores (Coach.bulkUpdate) a cada visita
```

O motor nunca chama `ensureWorldMarket` no avanço diário. Por isso o avanço do dia seguinte divergia entre quem visitou o Mercado e quem não visitou: a LOCAL-8D mediu 500 atletas diferentes no determinismo A×B.

### Correção

- `readWorldMarketSnapshot(careerDate)` (novo, em `worldMarketLifecycle.js`) aplica a mesma regra de `initializeWorldMarket` em memória: mesmos 500 atletas, mesma ordenação, mesmo `normalizeAthlete` e a mesma lista final dos 500 maiores `market_value`. Não grava nada.
- `readCoachMarket()` (novo, em `globalMarketLifecycle.js`) lista os treinadores. Os do catálogo que faltam entram só na projeção, sem id; a criação deles continua com a tela de Treinadores (`coachLifecycle.ensureCoachCatalog`).
- `getGlobalMarketSnapshot` usa as duas leituras. Disponibilidade, salário e demanda dos treinadores continuam calculados por `normalizeCoachMarket` e `guaranteeCoachAvailability`, como antes.
- `processGlobalMarketMonth` (botão "Processar mês") continua gravando atletas e treinadores. Nada foi movido para o avanço diário. `world_rank` não foi apagado nem virou fonte nova de ranking: é a mesma projeção de exibição de antes.

### Antes × depois (`scripts/test-local-8e-market-readonly.mjs`)

| Save | Registros alterados por 3 aberturas (antes → depois) | Abertura (ms, 1ª/2ª/3ª): antes → depois |
|---|---|---|
| carreira nova | 618 (500 atletas + 118 treinadores criados) → **0** | 159/53/42 → 11/6/5 |
| t5-com-dupla | 618 → **0** | 2161/670/720 → 56/48/26 |
| temporada 1 | 618 → **0** | 793/385/239 → 35/29/18 |
| temporada 5 | 618 → **0** | 2341/731/678 → 38/33/25 |
| temporada 10 | 618 → **0** | 3445/1178/1345 → 48/32/26 |

Resultado: 26 PASS e 15 FAIL antes; **41 PASS e 0 FAIL** depois.

A lista exibida é idêntica à do caminho antigo. O teste compara `id:market_value:expected_salary:world_rank:market_status:career_status` dos 500 atletas da projeção com o que `ensureWorldMarket` gravava num save gêmeo e encontra 0 divergências em todos os saves. Os atletas exibidos sem valor, salário ou rank (21/28/21/31, fora do top 500 por OVR) também são os mesmos do caminho antigo. A busca por nome e a disponibilidade de treinadores por nível continuam funcionando. O ciclo save → load → Mercado → save é idêntico.

## 2. Jornal (8D-02)

### Causa raiz

Em `generateJournal()` (`src/lib/journal.js`), as rivalidades usavam `(m.team_a || []).sort()` e `(m.team_b || []).sort()`. O repositório devolve cópias **rasas** dos registros, então o `.sort()` reordenava os arrays da própria partida salva. Torneios reconhece as partidas do jogador por `team_a[0]`, e por isso deixava de reconhecê-las.

### Correção

A ordenação passou a ser feita sobre uma cópia (`[...(m.team_a || [])].sort()`). A ordem alfabética continua só na apresentação e no agrupamento de rivalidades. Esses eram os únicos `.sort()` in-place sobre `team_a`/`team_b` no código (verificado por grep).

### Antes × depois (`scripts/test-local-8e-journal-integrity.mjs`)

| Save | Partidas alteradas por 3 aberturas | Partidas do jogador reconhecidas (30 recentes) |
|---|---|---|
| t5-com-dupla | 23 de 258 → **0** | 23 → 0 antes · **23 → 23** depois |
| temporada 1 | 12 de 73 → **0** | 12 → 0 · **12 → 12** |
| temporada 5 | 23 de 258 → **0** | 23 → 0 · **23 → 23** |
| temporada 10 | 23 de 485 → **0** | 23 → 0 · **23 → 23** |

Resultado: 13 PASS e 9 FAIL antes; **22 PASS e 0 FAIL** depois. O teste também cobre:

- manchete e rivalidades geradas;
- ciclo save → load → Jornal → save idêntico;
- duplas com nomes iguais e ordem invertida: os registros ficam intactos e a mesma dupla em ordens diferentes conta como uma única rivalidade.

Não há reparo retroativo: partidas já reordenadas em saves antigos continuam como estão.

## 3. Loja (8D-03)

### Respostas da auditoria

1. **Catálogo canônico.**
   - `EXPANDED_ITEMS` em `src/lib/storeCatalog.js`: 111 itens com `catalog_order`.
   - Os 4 itens de demonstração de `src/local/localSeed.js` (ids fixos `shop-001..004`).
   - As 10 relíquias `HISTORICAL_RARE_ITEMS` (`src/lib/marketEngine.js`, "Padel Heritage", raridade `exclusivo`, sem `catalog_order`).
2. **Identidade.** Ids gerados na criação (`shopitem-<ms>-<6>`), estáveis depois disso. O catálogo ampliado reconcilia por nome normalizado (`cleanKey`). O reparo das relíquias casava por `release_year:category`.
3. **Estáticos e dinâmicos.**
   - Os três catálogos são estáticos.
   - O dinâmico é o preço exibido (`computeItemPrice`: eventos, demanda, desconto de patrocínio) e o multiplicador de balanceamento aplicado em `normalizeShopItem`. Nenhum dos dois é persistido no item.
4. **Exclusivos e históricos.** Exclusivos: `rarity === 'exclusivo'` (3 raquetes Legacy, a "Coroa do Grand Slam" e as relíquias). Históricos: as 10 relíquias.
5. **Estoque e compras.**
   - Compra cria `PlayerInventory` (`item_id`, `equipped`, durabilidade), debita `PlayerProfile.coins` e registra lançamento financeiro (`recordFinancialEntry`).
   - O estoque limitado (`MarketPriceHistory`) só existe para as relíquias criadas por `seedMarket`.
6. **Bônus e preço.** O bônus é `attribute_bonus` do item. O preço é `normalizeShopItem` (piso da raridade × `shopPriceMultiplier`) mais `computeItemPrice`.
7. **Inicialização.** Na montagem da Loja: `seedMarket()` seguido de `ensureExpandedShopCatalog()`. A primeira abertura cria legitimamente os 111 itens do catálogo ampliado (uma vez) e repara `shop-001..004`.
8. **Referências externas a ids.** `PlayerInventory.item_id` e `MarketPriceHistory.item_id`. Por isso nada pode ser apagado nem recriado.
9. **Mesmo nome legítimo.** No catálogo canônico não há dois itens com o mesmo nome. Em saves já afetados existem cópias com nome de relíquia, que podem estar no inventário do jogador.

### Causa raiz (por que +2 itens a cada visita)

1. `seedMarket()` "repara" relíquias filtrando todo item `manufacturer: 'Padel Heritage'` e casando por `release_year:category`. Os colecionáveis do catálogo ampliado também são "Padel Heritage", e o `release_year` deles vem da raridade (`TIERS`):
   - "Medalha Circuito Local" (raro → 2023:colecionavel) casa com "Bola Dourada WPT Final (2023)";
   - "Réplica Troféu Major" (épico → 2024:colecionavel) casa com "Raquete Dourada do Circuito (2024)".

   Os dois eram renomeados e recebiam preço, descrição, história e coleção de relíquia (1.100 → 73.000; 3.200 → 81.000).
2. `ensureExpandedShopCatalog()` reconcilia por nome, não encontrava mais os dois e os recriava. Na visita seguinte o ciclo se repetia: **+2 itens por abertura** e 2 cópias renomeadas novas.
3. Gravação redundante: o catálogo comparava o template com o item **normalizado**. Como `normalized.price` inclui o multiplicador ×1,15–1,3, nunca batia com o template, e o mesmo preço já salvo era regravado nos 111 itens a cada abertura. Cada `update` serializa o save inteiro, o que torna a abertura muito cara em saves grandes.

### Correção (mínima, sem migração)

- **`seedMarket`:** pula itens com `catalog_order` (catálogo ampliado) e itens cuja raridade difere da relíquia-modelo (todas são `exclusivo` desde a primeira versão, verificado no histórico do git). As relíquias verdadeiras continuam recebendo o reparo legítimo; o teste prova que o preço legado 250.000 vira 84.000.
- **`ensureExpandedShopCatalog`:** só grava um campo quando o valor **salvo** difere do template. Mantém a condição antiga (normalizado ≠ template) e acrescenta a nova; com isso, todo reparo que antes mudava um valor continua igual e só some a regravação do valor que já estava no save.
- **Preservado sem mudança:** nada é apagado, deduplicado por nome, repreçado ou recriado. Cópias renomeadas que já existem em saves antigos ficam como estão, inclusive se estiverem no inventário. Raridade, efeitos, disponibilidade e regras de desbloqueio não foram tocados.

### Antes × depois (`scripts/test-local-8e-shop-integrity.mjs`, 10 aberturas)

| Save | Itens após 10 aberturas | Criados após a 1ª | Regravados após a 1ª | Cópias renomeadas como relíquia |
|---|---|---|---|---|
| carreira nova | 133 → **115** | 18 → **0** | 999 → **0** | 18 → **0** |
| temporada 1 | 133 → **115** | 18 → **0** | 999 → **0** | 18 → **0** |
| temporada 5 | 133 → **115** | 18 → **0** | 999 → **0** | 18 → **0** |
| temporada 10 | 133 → **115** | 18 → **0** | 999 → **0** | 18 → **0** |
| fixture legado contaminado | 124→142 antes · **120 estável** depois | 18 → **0** | 999 → **0** | 5→25 antes · **3 → 3** depois (preservadas byte a byte) |

O número de regravações conta registros com JSON diferente, inclusive `updated_date`: 111 por abertura × 9 aberturas.

Tempo por abertura (ms, SSR em memória):

| Save | Antes | Depois |
|---|---|---|
| carreira nova | 2ª abertura ≈ 3.100 | 15–38 |
| temporada 1 | ≈ 24.000 | 96–147 |
| temporada 5 | ≈ 81.000 | 337–633 |
| temporada 10 | ≈ 138.000 | 653–784 |

A 1ª abertura (inicialização legítima e única do catálogo) leva 151 ms na carreira nova e 6.894 ms na temporada 10 depois da correção; antes, 147 ms e 7.036 ms. O custo das aberturas seguintes antes da correção vinha da serialização do save inteiro a cada `update` redundante (111 por abertura); na temporada 10, 10 aberturas somaram 1.247.615 ms (≈ 21 min) antes e 13.158 ms depois. A ferramenta da LOCAL-8D (`test-local-8d-shop-catalog-probe.mjs`) agora mostra 115 itens estáveis, com 0 criados e 0 reescritos nas aberturas 2–4 (`shop-catalog-probe-8d-tool-after-fix.json`).

A **fixture sintética** (documentada no teste; não existe save real equivalente) parte da temporada 5 e contém:

- o catálogo já contaminado como o código antigo deixava: 3 cópias renomeadas, 2 da "Medalha" e 1 da "Réplica";
- 2 relíquias sintéticas: 1969, com preço legado, e 2023 colecionável, a mesma chave da colisão;
- `PlayerInventory` com uma raquete rara equipada, uma relíquia comprada, uma cópia renomeada comprada e a "Medalha" equipada.

Em 10 aberturas, nada foi criado, regravado ou removido. O inventário, os ids referenciados e o saldo ficaram intactos, e o ciclo save/load também.

Resultado: 21 PASS e 31 FAIL antes; **52 PASS e 0 FAIL** depois.

## 4. Determinismo do avanço diário

Ferramenta: `reports/local-8e-p1-navigation-integrity/tools/determinism.mjs`, cópia da ferramenta da LOCAL-8D que também compara `Coach` e `ShopItem` por id. Roda no Chrome real com o save carregado em memória.

- **A:** carregar e avançar 1 dia.
- **A':** repetir A, para medir o ruído do próprio avanço.
- **B:** carregar, abrir Mercado Mundial (`/world-market`), Jornal (`/world/circuit`, aba Notícias) e Loja (`/career/training?tab=shop`), e então avançar 1 dia.

A assinatura cobre todas as entidades do save (atletas e relacionamentos, treinadores, ranking, contratos, parcerias, partidas, torneios, finanças, inventário e itens) e o jogador. Ids gerados por relógio ou `Math.random` e carimbos de data são neutralizados.

| Cenário | Ruído A×A' | Diferença A×B atribuível à navegação | Campos de atletas / treinadores / partidas / missões |
|---|---|---|---|
| t5-com-dupla | nenhum | só `ShopItem` (4 → 115) | 0 / 0 / 0 / 0 |
| temporada 1 | `MissionProgress` (também em A×A') | só `ShopItem` (4 → 115) | 0 / 0 / 0 / 0 |

A única diferença é a **inicialização legítima e única do catálogo da Loja**: os 111 itens do catálogo ampliado são criados e os 4 itens de `localSeed` recebem `image_url`. Isso não afeta o avanço esportivo. Na LOCAL-8D, a mesma comparação com 56 rotas apontava 500 atletas com campos diferentes, além de `Coach`, `Match` e outros. Agora atletas, treinadores, relacionamentos, ranking, contratos, partidas, torneios, finanças e o RNG do avanço saem idênticos (o `MissionProgress` é ruído do próprio avanço, presente também em A×A'). Nenhuma alteração foi feita no motor.

## 5. Gravações do save no navegador (Chrome real, `route-audit`)

Ferramenta: `reports/local-8e-p1-navigation-integrity/tools/route-audit.mjs`, cópia da LOCAL-8D. Cada rota é aberta duas vezes a partir de uma rota neutra; "gravações" conta as escritas distintas do save da carreira.

| Rota | LOCAL-8D (antes): 1ª / 2ª abertura | LOCAL-8E (depois): 1ª / 2ª abertura |
|---|---|---|
| Mercado | 618 registros (500 atletas + 118 treinadores), 3 gravações / 118 treinadores, 1 gravação | **0 registros**, 1 gravação (só onboarding) / **0 / 0** |
| Jornal | 23 partidas, 1 gravação / 0 | **0 registros**, 1 gravação (só onboarding) / **0 / 0** |
| Loja | 115 registros, 5 gravações / 111 regravados + 2 criados, 5 a 14 gravações | 115 registros, 6 gravações (inicialização única) / **0 / 0** |

Valores medidos em carreira nova, t5-com-dupla e temporada 10, idênticos nos três cenários. A gravação da 1ª abertura de Mercado e Jornal é só a introdução da página do onboarding (`tutorial.pageIntroductionsSeen`), legítima e verificada pelo conteúdo. Os dados estão em `reports/local-8e-p1-navigation-integrity/dynamic/`.

### Custo no save (SSR, 3 aberturas por tela)

Ferramenta: `tools/save-cost.mjs`.

| Save (tamanho) | Tela | Aberturas (ms) antes → depois | Gravações antes → depois | Bytes serializados antes → depois | Variação do save antes → depois |
|---|---|---|---|---|---|
| carreira-nova (2 MB) | mercado | 165/63/47 → 14/8/5 | 6 → 0 | 11,2 MB → 0 MB | +264 KB → +0 KB |
| carreira-nova (2 MB) | jornal | 3/1/1 → 4/1/1 | 0 → 0 | 0 MB → 0 MB | +0 KB → +0 KB |
| carreira-nova (2 MB) | loja | 138/3431/3499 → 358/14/2 | 229 → 6 | 481,8 MB → 10,2 MB | +92 KB → +88 KB |
| t1 (12,4 MB) | mercado | 639/260/209 → 43/19/55 | 5 → 0 | 62,8 MB → 0 MB | +220 KB → +0 KB |
| t1 (12,4 MB) | jornal | 5/2/2 → 9/4/4 | 0 → 0 | 0 MB → 0 MB | +0 KB → +0 KB |
| t1 (12,4 MB) | loja | 912/22617/22529 → 968/2/1 | 232 → 5 | 2.856,2 MB → 62 MB | +92 KB → +88 KB |
| t5 (36,8 MB) | mercado | 2236/897/889 → 65/21/29 | 6 → 0 | 184,9 MB → 0 MB | +220 KB → +0 KB |
| t5 (36,8 MB) | jornal | 9/4/5 → 15/6/6 | 0 → 0 | 0 MB → 0 MB | +0 KB → +0 KB |
| t5 (36,8 MB) | loja | 6713/1044248/65250 → 3562/1/1 | 241 → 6 | 8.449,5 MB → 184,1 MB | +92 KB → +88 KB |
| t10 (64 MB) | mercado | 3458/1104/1312 → 61/30/34 | 6 → 0 | 320,8 MB → 0 MB | +220 KB → +0 KB |
| t10 (64 MB) | jornal | 43/6/8 → 26/25/10 | 0 → 0 | 0 MB → 0 MB | +0 KB → +0 KB |
| t10 (64 MB) | loja | 6231/164559/299736 → 5772/1/1 | 258 → 6 | 14.672,8 MB → 320 MB | +92 KB → +88 KB |

Observações:

- **Jornal:** grava 0 vezes e não muda o tamanho do save nem antes da correção. A reordenação acontecia no objeto em memória (cópia rasa) e ia para o disco na próxima gravação de qualquer outra tela. Por isso o defeito aparece como partidas alteradas, não como gravações. Agora as partidas não mudam.
- **Loja depois da correção:** as gravações e os +88 KB são da 1ª abertura (inicialização única do catálogo). A 2ª e a 3ª aberturas não gravam nada (1–2 ms).
- **Loja antes da correção:** cada `update` redundante serializava o save inteiro. Na temporada 10 foram 258 gravações e cerca de 14,3 GB serializados em 3 aberturas. A medida de ≈ 1.044 s na temporada 5 é um ponto fora da curva (a mesma abertura mediu cerca de 65–81 s nas outras execuções), mas a ordem de grandeza é a mesma.
- **Custo de serializar o save exportado uma vez:** carreira-nova 22 ms, t1 113 ms, t5 370 ms, t10 611 ms.

## 6. Compatibilidade com saves antigos

- **Temporadas 1, 5 e 10:** testadas nas três correções. Nenhuma limpeza retroativa foi feita.
- **Partidas já reordenadas pelo Jornal antigo:** continuam reordenadas. A correção só impede dano novo.
- **Itens duplicados ou renomeados pela Loja antiga:** continuam no save, com o mesmo id, nome e preço, e não são mais multiplicados.
- **Atletas e treinadores já normalizados por visitas antigas ao Mercado:** continuam como estão. A projeção só preenche em memória o que falta.
- A recuperação de dados já alterados exige uma fase própria, com identificação inequívoca, backup, plano de migração, testes, reversão e autorização.

## 7. Riscos residuais e pendências

1. **Treinadores (P2, decisão de produto).** A contratação na tela de Treinadores lê `market_available`, `market_salary` e `market_signing_bonus` **persistidos** (`src/lib/coaches.js`, `coachLifecycle.js`). Antes, esses campos só eram atualizados quando alguém abria o Mercado (ou apertava "Processar mês"), ou seja, o efeito colateral da navegação decidia preço e disponibilidade na contratação. Agora eles só mudam pelo botão. Em consequência, o Mercado pode exibir a projeção do mês (salário com oscilação mensal) enquanto Treinadores usa o valor persistido ou o `monthly_cost` do catálogo. Essa divergência já existia antes sempre que o mês virava sem visita ao Mercado. Definir uma fonte única é tarefa de fase futura; mover para o avanço diário não foi feito, conforme a restrição.
2. **Relíquias nunca semeadas (P2, preexistente).** `localSeed.js` cria um `MarketEvent` ativo ("Semana de lançamento"), então `seedMarket()` sai antes de criar as 10 relíquias. Nenhum save auditado tem relíquias. O que o jogador via com nome de relíquia eram as cópias renomeadas do defeito. Sem a correção, cada visita gerava 2 "relíquias" falsas com preço de relíquia; com ela, deixam de aparecer em carreiras novas. Isso não altera a disponibilidade de relíquias verdadeiras, que já não eram criadas.
3. **Saves já contaminados** mantêm cópias renomeadas (preço de relíquia, raridade de colecionável). Preservadas por regra; a recuperação fica para uma fase separada.
4. **Inicialização da Loja na 1ª abertura** (111 itens) continua sendo uma escrita única e legítima, idempotente depois disso. Antecipá-la para a criação da carreira seria mudança de arquitetura e ficou fora do escopo.

## 8. Arquivos

Produção:

- `src/lib/journal.js`
- `src/game-core/worldMarketLifecycle.js`
- `src/game-core/globalMarketLifecycle.js`
- `src/game-core/index.js` (export)
- `src/lib/marketEngine.js`
- `src/lib/storeCatalog.js`

Testes:

- `scripts/test-local-8e-journal-integrity.mjs`
- `scripts/test-local-8e-market-readonly.mjs`
- `scripts/test-local-8e-shop-integrity.mjs`

Ferramentas (cópias das da LOCAL-8D, com saída própria):

- `reports/local-8e-p1-navigation-integrity/tools/determinism.mjs`
- `reports/local-8e-p1-navigation-integrity/tools/route-audit.mjs`

Backlog de produto (apenas documentação):

- `docs/FUTURE_LIVE_BRANDS_SPONSORSHIP_MARKET.md`

## 9. Regressões

Testes da LOCAL-8E: Jornal 22/22, Mercado 41/41, Loja 52/52.

| Grupo | Testes | Resultado |
|---|---|---|
| LOCAL-8C | save-integrity (22) · directory-readonly no navegador (35) | PASS |
| LOCAL-8D | shop-catalog-probe (agora estável: 115 → 115 → 115 → 115, 0 criados, 0 reescritos) · partner-offers-probe (6 PASS + 4 achados documentados na 8D, inalterados) | PASS |
| 5.32-A/A.1 | ranking-views (64) · ranking-ladder (18) · ranking-mobile-containment (164) | PASS |
| 5.32-B | world-circuit (69) · world-mobile-containment (162) | PASS |
| 5.32-C/C.1 | athletes-profile (58) · athletes-mobile-containment (160) · partner-choice-age (49) | PASS |
| LOCAL-7D / 7E / 7G / 7G.1 / 7H / 7H.1 | 33 · 38 · 24 · 18 · 23 · 15 verificações | PASS |
| CLOUD-7D1 | world-tournament-continuity (38) | PASS |
| Mercado e treinadores | global-market-v25 · coach-market-curation (29) · coach-market-compact-layout · coach-system-v28 · coach-salary-consistency (34) · coach-discovery-rc | PASS |
| Partidas históricas e notícias | match-integrity · historical-bracket-integrity (16) · historical-bracket-after-reload (8) · journal-integrity da 8E | PASS |
| Loja e equipamentos | shop-phase1 (27) · shop-tier-unlock (5) · equipment-bonus-integrity (14) · character-equipment-overrides (19) | PASS |
| Finanças | financial-flow-dates (14) · financial-flow-reconciliation (11) | PASS |
| Patrocínios | sponsor-scaling (5) · all-sponsors-reachable (23) | PASS |
| Patrocínios | sponsor-eligibility-authority-v526c: 3/7 | **FAIL preexistente**: 3/7 idêntico com os 6 arquivos de produção do HEAD |
| Mercado premium | premium-market-v33-4 | **FAIL preexistente**: o teste exige `version === '0.9.0-beta.8'` e o pacote é `0.9.0-rc.1.9`; não chega a executar nada da 8E |

Gates: `npm run lint` OK, `npm run build` OK, `npm run validate:architecture` OK, `git diff --check` OK.

Relatórios versionados regenerados pelos testes foram restaurados com `git checkout`:

- `reports/local-8c-directory-save-integrity/save-integrity.json`
- `reports/local-8d-navigation-persistence-audit/shop-catalog-probe.json` (a saída nova foi copiada como evidência para `shop-catalog-probe-8d-tool-after-fix.json`)
- `reports/progression-clean-526c/sponsors-reachability.json`
