# LOCAL-9C.1 — Mercado Vivo: auditoria da Loja, marcas e equipamentos e proposta de design

Branch `integracao/cloud-6o` · HEAD `b24eef3` · **sem commit** (aguardando aprovação).

Fase só de auditoria, medição e proposta. Nenhum arquivo de `src/` foi alterado. Os diagnósticos rodam sobre os módulos reais do jogo em carreiras de **memória** (`scripts/lib/v526bTestKit.mjs`), sem IndexedDB e sem saves do usuário. Evidências e ferramentas em `reports/local-9c1-live-market-design/`.

**Convenções.** **[atual]** = medido no HEAD. **[sugerido]** = hipótese de design, a validar no simulador antes de virar regra. "Preço de lista" = preço gravado × `shopPriceMultiplier` (1,2, preset `balanced`), o que a Loja exibe sem eventos.

## Resumo

| Pergunta | Resposta |
|---|---|
| Catálogo | **125 itens, 9 categorias, 24 marcas** (confirmado): 111 do `storeCatalog`, 10 relíquias, 4 de demonstração |
| A Loja acompanha a carreira? | **Não. É um catálogo estático** de 125 itens com cadeados. O freio real é o dinheiro. A rotação mensal é um sorteio fixo por item e mês |
| Raridade faz sentido? | **Não.** Incomum = comum nas 7 categorias; 20 inversões de raridade; dois catálogos sobrepostos na mesma raridade; custo do kit sobe 2,7–4,7× por degrau |
| Marcas diferem? | **Por acidente.** O perfil de atributos vem da linha; o preço da linha vem da ordem na lista. 31 itens perderam metade do bônus por chave órfã, inclusive 4 linhas de raquete |
| Valor esportivo | Kit comum +3 a +4 pp (não significativo); épico +10 a +12 pp; mítico +17 a +25 pp; relíquias +30 a +37 pp. **Agilidade não tem efeito nenhum na partida** e controle emocional quase nenhum: 36% dos pontos de bônus do catálogo |
| 9B íntegra? | **Sim.** 71/71 e 25/25; comprar e equipar o melhor kit não altera a base; save/load idêntico |
| Fluxo de compra | **Defeitos confirmados:** dois cliques → 2 itens e 1 débito; estoque 0 vendido; falha no meio → item sem pagamento; venda sobrescreve crédito concorrente |
| Conquistas de coleção | **Defeito novo (P2):** itens comprados não contam (linha sem `quantity`). 14 conquistas, 79.100 moedas, nunca avançam por compra |
| Relíquias | Fora da escala (+12 a +43 por item; Loja até +12). Recomendação: sistema próprio de Legado, fora do Mercado Vivo |
| Modelo recomendado | **B — Mercado Vivo Equilibrado**, com 9 etapas pequenas |

**Veredito: PASS COM RESSALVAS.** A auditoria cobriu todos os pontos pedidos com evidência medida. As ressalvas são decisões de produto que precisam de aprovação antes da 9C.2 (§20) e dois defeitos de motor e conquistas fora do escopo da Loja.

---

## 1. Estado inicial e método

- Diretório `C:\Projetos\Padel-Legacy-Integracao`, branch `integracao/cloud-6o`, HEAD `b24eef3`.
- `git status --short` inicial: os 5 falsos positivos de CRLF em `src-tauri` e os 5 não rastreados preexistentes (8C, 8F, 8G e duas imagens do redesign). Hashes registrados antes dos testes e conferidos no fim.
- Ferramentas:
  - `tools/live-market-audit.mjs` — catálogo, categorias, marcas, raridades, disponibilidade, sondas de compra, persistência, motor de partida, equivalência com treino, economia. Reutiliza `normalizeShopItem`, `getShopItemAccess`, `computeItemPrice`, `getEquipmentMarketState`, `findSponsorIdByManufacturer`, `equipmentModifiers` (fonte canônica da 9B), `createMatch`/`playPoint`, `previewTraining`/`applyAttributeGains`. **Única réplica:** compra e venda, porque ainda vivem em `Shop.jsx`/`Inventory.jsx`.
  - `tools/inventory-achievement-probe.mjs` — itens comprados × contexto de conquistas.
- Economia: nenhuma carreira nova. Uso a baseline da 9E.1 e a comparação da H1 (§10).

## 2. Divergências entre documentação e código

| Documento | Diz | HEAD |
|---|---|---|
| Comentário de `SHOP_PROGRESSION` (`storeCatalog.js`) | título de Crown = 30.000 moedas | 90.000 (`prizeMultiplier`) |
| Comentário das relíquias (`marketEngine.js`) | teto de 90.000 | 108.000 de lista (×1,2 aplicado depois) |
| Comentário dos colecionáveis | "não atalho para força esportiva" | equipáveis, com bônus até +12 (relíquias +43) |
| 9A §2.2 | comum 0–2 de bônus | comum 1–2 (os 0 são itens de demonstração) |
| 9A §9 (9A-08) | `buy()` sem checagem de estoque e duplicado | confirmado no HEAD, sem mudança |
| `FUTURE_LIVE_BRANDS…`, `PADEL_LEGACY_LIVE_MARKET_DESIGN_PROPOSAL.md` | proposta pré-9B | a separação base + modificador já existe (9B); vários itens daquela proposta já foram feitos ou mudaram de premissa |

## 3. Catálogo (§4 do pedido)

Inventário completo, item a item: `catalog-audit.json › items` (identificador, nome, marca, categoria, subcategoria, raridade, preço gravado, de lista, com eventos do dia 1 e com desconto de patrocínio, bônus por atributo e soma, chaves descartadas, requisitos, disponibilidade mensal, estoque, patrocinador e slot, slot de equipamento, preço de venda e propriedades extras).

### 3.1 Contagens [atual]

| Origem / classe | Itens | | Categoria | Itens | | Raridade | Itens |
|---|---:|---|---|---:|---|---|---:|
| Normal (`storeCatalog`) | 103 | | raquete | 60 | | comum | 20 |
| Colecionável (`storeCatalog`) | 5 | | grip | 9 | | incomum | 17 |
| Exclusivo (raquetes) | 3 | | bola | 6 | | raro | 18 |
| Relíquia (`HISTORICAL_RARE_ITEMS`) | 10 | | roupa | 8 | | épico | 24 |
| Demonstração (`localSeed`) | 4 | | tênis | 9 | | lendário | 19 |
| | | | mochila | 9 | | mítico | 13 |
| | | | tecnologia | 8 | | exclusivo | 14 |
| | | | acessório | 8 | | | |
| | | | colecionável | 8 | | | |

Todos os 125 são equipáveis (cada categoria é um slot). Nenhum nome duplicado, nenhuma chave de bônus inválida chega ao `attribute_bonus`, nenhum item abaixo do piso da raridade, `is_exclusive` coerente com a raridade.

### 3.2 Classes de item

| Classe | Regras distintas [atual] |
|---|---|
| Normal | `catalogItem()`: bônus = linha × multiplicador da raridade; preço ≥ piso; sempre `is_available` |
| Colecionável | Mesmas regras do normal. Ocupa o slot "colecionável" e dá bônus esportivo |
| Exclusivo (3 raquetes) | Normal com raridade exclusivo (nível 45, Top 10, reputação 85) |
| Relíquia | Bônus bruto (não passa por `scaleBonus`), preço fixo ≥ piso, estoque limitado 1–5 (determinístico), id estável por ano + categoria |
| Demonstração | 4 itens de `localSeed`, comuns, 3 sem bônus, marcas Court Labs e Padel Legacy |
| Patrocinado | Não existe como classe. Só o desconto (15% com `sponsor_id`) e a garantia de rotação |
| Recompensa | Não existe. Nenhum sistema concede item |

### 3.3 Problemas do catálogo

| ID | Sev. | Problema | Evidência |
|---|---|---|---|
| 9C-01 | **P2** | **Chaves órfãs cortam metade do bônus de 31 itens.** `scaleBonus` descarta `positioning`, `strength`, `control`, `reflexes`, `stamina`, `speed`, `reputation`, `concentration`, `tactics`. As linhas de raquete Padel Start Control One, Padel Start Power Entry, Joma Soft Touch e Wilson Pro Staff dão +1/+2/+3… onde as outras dão +2/+4/+6…; a Wilson Heritage Control (exclusiva) dá +6 contra +12 das outras exclusivas. Wilson Pro Staff é a 2ª linha mais cara e a pior por ponto (1.394 moedas/ponto no comum) | `issues.droppedSourceKeys` |
| 9C-02 | P2 | **Incomum dominado** nas 7 categorias em que existe: mesmo bônus máximo do comum, 1,8× a 4,5× o preço | `issues.incomumNoBetterThanComum` |
| 9C-03 | P2 | **20 inversões de raridade**: item mais raro com bônus menor que o melhor da raridade anterior (ex.: Padel Start Power Entry Mythic +5 contra +8 do melhor lendário) | `issues.rarityInversions` |
| 9C-04 | P2 | **Dois catálogos sobrepostos.** Itens de suporte antigos têm preço-base abaixo do piso e caem nele (39 itens no piso: todo épico antigo custa 6.000, todo lendário antigo 19.200), com 1 atributo. Os itens da "Fase 1" têm 2 atributos e preço próprio. Na mesma categoria e raridade, o bônus dobra e o preço sobe 1,7–2× | `priceAtFloor`, `sameRaritySamePriceBandSpread` |
| 9C-05 | P2 | **Relíquias fora da escala** (§14) | `relicsOutOfScale` |
| 9C-06 | P3 | **Colecionáveis com força esportiva**: 8 itens, até +12 no catálogo e +43 nas relíquias | `collectiblesWithSportBonus` |
| 9C-07 | P3 | **Itens de demonstração** à venda: 3 sem bônus; marcas Court Labs e Padel Legacy só existem por eles | `zeroBonus` |
| 9C-08 | P3 | Saque em 2 itens (3 pontos de 726) | `counts.attributeUsage` |
| 9C-09 | P3 | Identidade do item é o **nome**: `ensureExpandedShopCatalog` reconcilia por nome. Renomear um item cria outro e deixa o antigo órfão | `storeCatalog.js:355` |

## 4. Categorias (§5)

Detalhe: `category-analysis.json`. Preço e custo por ponto em preço de lista; "teto" = melhor item da Loja (sem relíquias).

| Categoria | Itens | Marcas | Preço (mín · mediana · máx) | Teto de bônus | Atributos [atual] | Melhor custo/ponto | Pior |
|---|---:|---:|---|---:|---|---|---|
| Raquete | 60 | 11 | 384 · 5.788 · 100.800 | 12 (relíquia 40) | smash, emocional, forehand, voleio, defesa | Head Flash Motion Club 349 | Wilson Heritage Control 13.000 |
| Grip | 9 | 7 | 66 · 6.000 · 69.600 | 10 | revés, voleio, estratégia, forehand | Tour Grip Dry Start 66 | Bullpadel Master Grip Pro 6.960 |
| Bola | 6 | 6 | 54 · 3.720 · 78.000 | 4 (relíquia 12) | estratégia, emocional, agilidade, saque | Padel Start Training 54 | Premier Championship Case 4.800 |
| Roupa | 8 | 5 | 264 · 8.700 · 72.000 | 10 | emocional, agilidade | Joma Training Tee 264 | Bullpadel Champion Series 7.200 |
| Tênis | 9 | 6 | 420 · 6.000 · 66.000 | 10 | **agilidade** (23 de 35 pontos), smash | Joma Court Basic 576 | Adidas Master Series 6.600 |
| Mochila | 9 | 6 | 264 · 6.000 · 62.400 | 10 | emocional, estratégia | Padel Start Compact 312 | Bullpadel Master Pro 20 6.240 |
| Tecnologia | 8 | 6 | 1.080 · 16.200 · 64.800 | 10 | estratégia | Pulse Training Band 1.080 | NeuroCourt 8.400 |
| Acessório | 8 | 5 | 72 · 7.320 · 57.600 | 10 | emocional, defesa, agilidade | Joma Wristband Base 72 | Therabody Recovery Master 5.760 |
| Colecionável | 8 | 1 | 1.440 · 60.000 · 108.000 | 12 (relíquia 43) | emocional, estratégia | Medalha Circuito Local 720 | Coroa do Grand Slam 6.500 |

Respostas:

- **Função esportiva relevante?** Só onde o bônus cai em atributo que o motor lê (§8.2). Raquete e grip sim. **Tênis, roupa e acessório quase não**: agilidade não é lida pelo motor, controle emocional entra só num modificador de pressão. Mochila e tecnologia, em parte (estratégia).
- **Bônus desproporcionais?** Sim, por categoria: cada uma das 7 de suporte tem o **mesmo teto (+10) da raquete**. Raquete é só 14% do bônus do kit topo. Colecionável e relíquias dão o maior bônus do jogo.
- **Categoria que o jogador racional nunca compraria?** Incomum em qualquer categoria (9C-02); tênis e roupa acima do comum (pagam por agilidade e controle emocional); bola acima do raro (só 4 de teto).
- **Categoria obrigatória?** Não há. O mais próximo é o "comprar os 7 comuns baratos no 1º mês": 2.042 moedas por +8 nominal, que o simulador econômico sempre faz.
- **Slots incentivam decisão ou acúmulo?** Acúmulo: os slots são independentes, um item por categoria, e o melhor de cada um é quase sempre o mais raro acessível. A única escolha real dentro da categoria é o atributo da raquete (linha), e mesmo ela é distorcida por 9C-01.
- **Progressão real?** Raquete tem 7 degraus completos (2/2/4/6/8/10/12, com o incomum parado). Bola e colecionável têm escada curta ou incompleta; tecnologia começa no incomum.
- **Opções equivalentes entre marcas?** Só na raquete (9–10 modelos por raridade até o épico, 5 no lendário e no mítico). Nas outras categorias há **1 item por raridade** até o raro: sem escolha de marca.
- **Substituição esperada:** o simulador competitivo trocou 7 comuns por 6–9 raros em 2 anos e comprou 1 épico. O épico e acima, como kit, leva de 27 a 390 meses de sobra de caixa (§10).

## 5. Marcas (§6)

Detalhe: `brand-analysis.json`. Perfil = participação de cada atributo nos pontos de bônus da marca.

| Marca | Itens | Categorias | Raridades | Perfil dominante [atual] | Custo/ponto (mediana) | Patrocinador |
|---|---:|---|---|---|---:|---|
| Padel Heritage | 15 | colecionável, raquete, bola | quase só exclusivo | emocional 48%, estratégia 24% | 3.857 | — |
| Bullpadel | 13 | raquete, grip, bola, roupa, mochila | comum→exclusivo | smash 23%, bandeja 23% | 2.000 | Ouro · raquete |
| Padel Start | 12 | raquete, bola, mochila | comum→mítico | smash 48%, voleio 44% | 811 | — |
| Nox | 12 | raquete, grip, roupa, mochila, acessório | comum→exclusivo | voleio 31%, defesa 24% | 1.577 | Prata · raquete |
| Wilson | 12 | raquete, grip, bola, roupa, mochila | comum→exclusivo | emocional 26%, voleio 23% | 3.825 | Prata · raquete |
| Adidas | 11 | raquete, roupa, tênis, acessório | comum→mítico | agilidade 38%, forehand 22% | 1.426 | Prata · vestuário |
| Joma | 9 | raquete, roupa, tênis, acessório | comum→lendário | defesa 70% | 1.003 | Prata · vestuário |
| Head | 9 | raquete, grip, bola, mochila | comum→mítico | revés 39%, forehand 36% | 699 | Ouro · raquete |
| Babolat | 7 | raquete, grip, tênis | comum→mítico | defesa 35%, smash 35% | 1.700 | Bronze · raquete |
| Siux | 5 | raquete | comum→mítico | smash 50%, forehand 50% | 1.534 | Bronze · raquete |
| 14 marcas com 1–3 itens | 18 | tecnologia, acessório, tênis, bola, grip, demonstração | — | um atributo cada | — | Asics, Garmin, Therabody, Playtomic, Movistar |

Diferenças reais [atual]:

- **Identidade visual**: nenhuma por marca. O ícone é por categoria × raridade (`getCategoryRarityIconAssetPath`). A Loja mostra o nome do fabricante e um filtro.
- **Atributo**: há um embrião coerente nas raquetes, definido pela linha (`RACKET_LINES`): Bullpadel potência, Nox controle, Head híbrida de fundo, Siux ofensiva, Joma defensiva. Mas o mesmo total de bônus vale para todas as linhas da mesma raridade (exceto as cortadas por 9C-01) e **a diferença de atributo quase não muda o resultado** (§8.2: +5 num único atributo fica dentro do ruído em quase todos os casos).
- **Preço**: não há posicionamento. O preço-base da linha cresce com a **posição na lista** (`basePrice × (1 + 0,04 × índice)`), de Padel Start (mais barata) a Siux (mais cara). Nos suportes, o preço é o piso da raridade. Uma marca "premium" não custa mais por ser premium.
- **Desbloqueio**: nenhuma marca tem regra própria; tudo vem da raridade.
- **Patrocínio**: 13 das 21 marcas patrocinadoras têm item; 8 não têm (Varlion, Red Bull, Decathlon, Estrella Damm, Cupra, Padel League, Iberdrola, LocalFit). 11 marcas da Loja não patrocinam. Na baseline da 9E.1 todos os contratos ficam no Bronze (E1-08): o desconto só é alcançável em Babolat, Siux e Asics.

**Conclusão:** as marcas não diferem de forma significativa. Existem sementes de identidade (atributo da linha de raquete, slot do patrocinador) que podem virar arquétipos sem inventar marcas (`design-options.md`).

## 6. Raridades e progressão (§7)

Detalhe: `rarity-economics.json`. Kit = melhor item da Loja de cada categoria naquela raridade.

| Raridade | Requisito [atual] | Mult. bônus | Itens | Preço de lista (mediana) | Custo/ponto (mediana) | Disponível no mês | Kit: custo | Kit: bônus | Custo do kit × anterior | Bônus × anterior |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| comum | nível 1 | 1 | 16 | 567 | 446 | 100% | 2.042 | 8 | — | — |
| incomum | nível 3 | **1** | 17 | 1.020 | 853 | 100% | 5.506 | 9 | 2,7 | 1,1 |
| raro | nível 8 · Top 500 · rep 8 | 2 | 18 | 2.195 | 895 | 88% | 16.956 | 22 | 3,1 | 2,4 |
| épico | nível 15 · Top 200 · rep 20 | 3 | 24 | 6.904 | 2.000 | 73% | 80.450 | 45 | **4,7** | 2,0 |
| lendário | nível 25 · Top 100 · rep 40 | 4 | 19 | 19.200 | 4.800 | 48% | 253.200 | 64 | 3,1 | 1,4 |
| mítico | nível 35 · Top 40 · rep 65 | 5 | 13 | 49.091 | 6.240 | 30% | 476.400 | 80 | 1,9 | 1,3 |
| exclusivo | nível 45 · Top 10 · rep 85 | 6 | 4* | 78.000 | 6.500 | 19% | 156.000 (2 categorias) | 24 | — | — |

\* Sem relíquias. Amplitude da oscilação diária de preço no mês: 0% no comum, até 40% no exclusivo (`volatilityDailySwingPct`).

### 6.1 A distorção da 9E.1 (58 × 676–815 moedas por ponto)

Confirmada e decomposta:

1. **Itens comuns muito baratos.** Os três mais baratos (bola 54, grip 66, pulseira 72) custam ~1/8 da mediana do comum. O econômico só compra esses três: 58/ponto.
2. **Piso de preço 30× para bônus 2×.** Piso do raro 1.200 contra 40 do comum; o multiplicador de bônus é 2.
3. **Troca no mesmo slot.** O raro substitui o comum: o ganho marginal é +1, não +2. Custo marginal mediano comum → raro = **1.440 moedas por ponto** (`upgradeComumToRaro`).
4. **Métrica cumulativa.** A 9E.1 divide o gasto total (inclusive itens depois substituídos) pelos pontos efetivos finais.

Os quatro juntos explicam ~12×. Só o item 2 é de raridade; os itens 1 e 3 são de catálogo e de slot.

### 6.2 Raridade × outras dimensões [atual]

- **Disponibilidade**: cai com a raridade (100% → 19% dos meses). Com contrato ativo da marca, o item fica sempre na rotação.
- **Ranking e estágio**: o requisito existe, mas a 9E.1 mostra que, aos 365 dias (nível 17, ranking 163–378), raro está liberado e épico só para quem passou do Top 200. O que segura é o preço.
- **Utilidade esportiva**: não acompanha a raridade de forma limpa (§8): o kit raro rende +3 a +12 pp e o épico +10 a +12 pp, por causa do peso de agilidade e controle emocional nos itens de suporte.
- **Revenda**: 30% do preço **gravado**, que é o preço sem o ×1,2. Na prática, 25% do preço de lista, igual em todas as raridades.

### 6.3 Proposta de progressão por raridade [sugerido]

| Raridade | Bônus da raquete | Bônus dos demais (média) | Custo por ponto alvo | Degrau de custo | Papel |
|---|---:|---:|---:|---:|---|
| comum | 2 | 1 | ~250 | — | Primeiro kit no 1º mês |
| incomum | 3 | 1–2 | ~400 | 1,6× | Primeira escolha de marca (deixa de ser dominado) |
| raro | 4 | 2 | ~650 | 1,6× | Kit do 1º ano |
| épico | 6 | 3 | ~1.100 | 1,7× | Primeira compra cara (2º ano) |
| lendário | 8 | 4 | ~1.800 | 1,6× | Profissional internacional |
| mítico | 10 | 5 | ~2.800 | 1,6× | Elite |
| exclusivo | 12 | 6 | ~4.000 | 1,4× | Topo; só raquete e poucos itens |

Justificativa: o retorno por moeda cai em todo degrau (premium é menos eficiente), mas cada degrau custa ~1,6× o anterior por ponto, não 2,3× a 4,7× por kit como hoje. Os bônus só entram em atributos que o motor lê (§8.2). O alvo absoluto do kit topo é ≤ +5 OVR declarado (≈ +15 pp), a validar.

## 7. Equipamentos e desenvolvimento natural (§9)

A 9B continua íntegra:

| Verificação | Resultado |
|---|---|
| `test-local-9b-attribute-equipment-foundation` | **71/71** (impacto em partida idêntico ao documentado: kit D +16,8 pp, relíquias +39,3 pp no fixture 60) |
| `test-local-9b-r1-validation` | **25/25** |
| Comprar e equipar o melhor kit da Loja (9 itens) | base inalterada (OVR 50); efetivo 58,8; aplicado = declarado (88) |
| Save → load | inventário, flags, base, saldo e efetivo idênticos |
| Teto de treino | não lê equipamento (sem mudança desde a 9B) |

Nenhum defeito encontrado. Nada da 9B foi alterado.

## 8. Valor esportivo real (§8 e §18)

Ferramenta: `tools/live-market-audit.mjs`, seção do motor. Resultado: `equipment-impact.json`.

**Desenho.** Motor real (`createMatch` + `playPoint`). Atleta com atributos planos no nível do fixture, parceiro e adversários idênticos no mesmo nível, energia 100, química 0. **300 partidas por cenário, as mesmas seeds em todos**; diferença pareada com IC de 95%. Só o modificador do jogador muda. O efetivo passa pela fonte canônica da 9B (limite 100). Determinismo verificado (mesmas seeds → mesmos 300 resultados).

### 8.1 Kits

| Kit | Itens | Custo | Bônus declarado | Δ vitórias iniciante (30) | intermediário (50) | avançado (75) | Moedas por pp (50) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Comum (K1) | 7 | 2.042 | +0,8 OVR | +3,3 [−1,3; 7,9] | +3,7 [−0,9; 8,2] | +4,3 [−0,9; 9,6] | 552 |
| Raro (K2) | 9 | 16.956 | +2,2 | +5,3 [−1,0; 11,6] | +3,0 [−3,5; 9,5] | +12,3 [5,7; 19,0] | 5.652 |
| Épico (K3) | 9 | 80.450 | +4,5 | +12,0 [4,6; 19,4] | +10,0 [3,5; 16,5] | +11,7 [4,5; 18,8] | 8.045 |
| Mítico (K4) | 8 | 476.400 | +8,0 | +20,7 [13,1; 28,2] | +16,7 [9,6; 23,7] | +25,0 [18,1; 31,9] | 28.527 |
| Topo do catálogo (K5) | 9 | 567.600 | +8,8 | +23,0 [15,3; 30,7] | +14,3 [6,9; 21,7] | +23,3 [16,1; 30,5] | 39.692 |
| Com relíquias (K6) | 9 | 662.400 | +15,5 | +34,7 [27,5; 41,8] | +29,7 [22,8; 36,5] | +37,3 [30,3; 44,4] | 22.303 |
| Só raquete mítica (K7) | 1 | 42.000 | +1,0 | +2,3 [−3,6; 8,3] | +0,3 [−5,4; 6,1] | +14,7 [8,3; 21,1] | — |

Referência — **OVR natural** (todos os atributos +k, como o treino daria):

| | iniciante (30) | intermediário (50) | avançado (75) |
|---|---:|---:|---:|
| +1 | +3,0 | +3,0 | +4,3 |
| +2 | +3,7 | +4,3 | +10,0 |
| +4 | +5,3 | +7,3 | +18,7 |
| +8 | +22,0 | +19,0 | +26,7 |

Leituras:

- O kit comum não tem efeito estatisticamente distinguível de zero em nenhum nível. O raro só no avançado.
- O ponto declarado de equipamento vale **menos** que o ponto natural: o kit mítico (+8,0) rende +20,7 / +16,7 / +25,0 pp contra +22,0 / +19,0 / +26,7 do +8 natural; o kit topo (+8,8) rende +14,3 pp no intermediário, contra +19,0 do +8 natural. Causa: §8.2.
- **Relíquias são as mais baratas por pp** no topo (22 mil contra 40 mil do kit topo no fixture 50).
- O retorno por moeda cai 11–15× do comum ao épico e ~3,5× do épico ao mítico.

### 8.2 Valor por atributo (+5 num único atributo)

| Atributo | iniciante | intermediário | avançado | Lido pelo motor de rali? |
|---|---:|---:|---:|---|
| saque | +1,0 | +0,3 | 0,0 | sim (saque) |
| forehand | +2,3 | −3,3 | **+8,7** | sim (drive, chiquita) |
| revés | +2,3 | +3,0 | +4,3 | sim |
| voleio | −1,7 | −0,7 | −0,3 | sim |
| bandeja | +0,3 | −1,3 | +4,0 | sim |
| smash | −1,0 | 0,0 | −0,3 | sim |
| defesa | 0,0 | +1,3 | **+4,7** | sim (lob) |
| **agilidade** | **0,0** | **0,0** | **0,0** | **não** |
| estratégia | +4,3 | −3,0 | **+5,7** | sim (lob, chiquita) |
| controle emocional | +1,0 | 0,0 | +1,3 | só via resistência à pressão em ponto importante |

Com 300 partidas, um único +5 fica dentro do ruído (IC ±4 a 6 pp) na maioria dos casos. **O que não é ruído:** agilidade produziu **exatamente** os mesmos 300 resultados nos três níveis. No código, `playerModel` copia `agility` para o jogador, mas `RallyEngine.skill` e `DecisionEngine` nunca o leem; controle emocional entra só em `PersonalityModel` (estabilidade emocional → modificador de pontos importantes, × 0,22).

Consequência para a Loja: **66 pontos de agilidade (9%) e 194 de controle emocional (27%) — 36% de todo o bônus do catálogo — não têm efeito ou têm efeito mínimo na partida.** No kit topo, 40 dos 88 pontos estão nesses dois atributos. Tênis, roupa e boa parte de acessório e mochila vendem quase nada esportivamente. A interface e o OVR (média dos 10) mostram esses pontos como se valessem igual.

Isto é **regra do motor**, fora do escopo da Loja e desta fase. O mesmo vale para o treino de agilidade. Registrado como decisão pendente D-M1 (§20).

### 8.3 Equipamento × treino

Sessões de treino (funções puras reais, intensidade moderada, potencial 75) para ganhar OVR natural:

| OVR inicial | +1 | +2 | +4 | +8 |
|---:|---:|---:|---:|---:|
| 22 | 23 | 40 | 77 | 161 |
| 40 | 35 | 66 | 130 | 272 |
| 60 | 76 | 133 | 251 | 509 |

O simulador equilibrado da 9E.1 fez ~394 sessões no ano 1 (+21 OVR) e ganhou +7 OVR no ano 2. Assim, um kit épico (+10 a +12 pp, entre +4 e +8 natural nos níveis 30 e 50) equivale a 2–8 meses de treino e custa 80 mil (27–124 meses de sobra de caixa). **Hoje o equipamento não ameaça o treino:** é caro demais para isso. O risco aparece só com relíquias (+30 a +37 pp, mais que +8 natural) ou se a 9C.2 baratear o topo sem limitar o kit.

## 9. Economia da Loja (§10)

Fonte: `economy-progression.json` (baseline 9E.1, médias por perfil; 3 seeds em 365 d e 2 em 730 d).

| Perfil, horizonte | Receita/mês | Sobra/mês antes do equipamento | Gasto com equipamento | Compras (raridades) | Moedas por ponto efetivo |
|---|---:|---:|---:|---|---:|
| Econômico 365 d | 3.702 | 3.010 | 173 | 3 comuns | 58 |
| Equilibrado 365 d | 3.786 | 2.159 | 1.320 | 6 comuns | 189 |
| Competitivo 365 d | 3.648 | 1.428 | 13.379 | 7 comuns, 1 incomum, 5–8 raros | 676 |
| Econômico 730 d | 3.781 | 2.914 | 173 | 3 comuns | 58 |
| Equilibrado 730 d | 4.627 | 2.072 | 1.320 | 6 comuns | 189 |
| Competitivo 730 d | 4.064 | 647 | 17.505 | + 6–9 raros, 1 épico | 815 |

Receita dos 2 anos (média): salário de patrocínio ~34 mil, prêmios 15–37 mil, conquistas 18–33 mil, renovações ~6 mil. Despesa: treino 11–36 mil, folha (treinador e staff) 5–36 mil, equipamento 0,2–17,5 mil.

**Meses de sobra para comprar cada kit** (sobra antes do equipamento):

| Kit | Custo | Econômico | Equilibrado | Competitivo (730 d) |
|---|---:|---:|---:|---:|
| comum | 2.042 | 0,7 | 0,9–1,0 | 3,2 |
| incomum | 5.506 | 1,8 | 2,6 | 8,5 |
| raro | 16.956 | 5,6 | 7,9 | 26 |
| épico | 80.450 | 27 | 37–39 | 124 |
| lendário | 253.200 | 84 | 117–122 | 391 |
| mítico | 476.400 | 158 | 221–230 | 736 |

- O jogador pode acumular sem gastar: o econômico chega a 70,7 mil de patrimônio em 2 anos (E1-03).
- Um épico avulso (6.000–13.800) custa 3–6 meses de sobra do equilibrado: a compra cara possível no 2º ano é **um item**, não o kit.
- Renda de elite: **sem medição**. Nenhuma carreira da 9E.1 passou do Top 83 nem saiu do Bronze no patrocínio (E1-08). Os custos de lendário, mítico e exclusivo não podem ser calibrados com dados atuais.
- Manutenção: zero. Durabilidade e uso nunca mudam (9A-10); não há custo de reposição.

### 9.1 Comparabilidade pré/pós-hotfix

A baseline é do `633298b` (pré-H1). A H1/H1-R1 limitou a renovação à janela de 30 dias, tornou a assinatura idempotente e criou carência de 90 dias após rescisão voluntária.

- **Comparáveis:** receita por categoria (ordem de grandeza), gasto com equipamento, moedas por ponto efetivo, raridades compradas e participação do patrocínio. A política do simulador já renovava só nos últimos 30 dias e nunca rescindia: o exploit não entrou na baseline. 30 dias: hashes idênticos; 365 dias: renovações 69 → 67, mesmos valores.
- **Não comparáveis exatamente:** hashes e números exatos de 365/730 d (o id determinístico desloca o RNG), ranking final por seed e o patrimônio do equilibrado em 365 d (−2,4 mil, quase todo da seed 3).
- Nenhum número desta auditoria mistura as duas versões sem indicação: as tabelas de economia são todas da baseline 9E.1; as de catálogo e motor são do HEAD `b24eef3` (a H1 não tocou Loja, catálogo nem motor).

## 10. Disponibilidade e desbloqueios (§11)

| Regra | [atual] |
|---|---|
| Catálogo inteiro desde o início | **Sim.** A Loja lista os 125 itens (`ShopItem.filter({ is_available: true })`); os bloqueados aparecem com cadeado |
| Requisito de ranking | Sim, a partir do raro (Top 500 → Top 10) |
| Nível de carreira | Sim (1 → 45) |
| Idade / temporada | Não. `release_year` ≤ 2026 em todo item: o filtro de lançamento nunca bloqueia |
| Reputação | Sim, a partir do raro (8 → 85) |
| Patrocínio | Só garante rotação e desconto; não desbloqueia |
| Rotação de estoque | Mensal, `seeded01(mês:item)` ≤ limiar da raridade. Comum e incomum sempre. Determinística, sem tick |
| Itens esgotam | Só relíquias têm estoque (1–5), e a compra **não** verifica |
| Produtos novos com a carreira | Não. Nada nasce depois da ativação |
| Eventos de mercado | Só "Semana de lançamento" (dias 1–7). `processMarketTick` não tem chamador; os 6 eventos iniciais nunca nascem (9A-05) |

Visão do jogador por estágio (fixtures, média de 12 meses; `economy-progression.json › availabilityByStage`):

| Fixture | Estágio econômico | Liberados | Liberados e na rotação | Raridades liberadas |
|---|---|---:|---:|---|
| início (nível 1) | beginner | 20 | 20 | comum |
| amador (nível 5) | regional | 37 | 37 | + incomum |
| ~1º ano (nível 17, #300) | professional | 55 | 53 | + raro |
| ~2º ano (nível 28, #110) | professional | 79 | 70 | + épico |
| internacional (#80, rep 45) | international | 98 | 79 | + lendário |
| elite (#30, rep 70) | elite | 111 | 82 | + mítico |
| lenda (#5, rep 90) | elite | 125 | 84 | + exclusivo |

**Resposta: a Loja funciona como um catálogo estático.** Os requisitos mudam o cadeado, não o que o jogador vê; a rotação esconde ~1/3 dos raros para cima, sem relação com a carreira. Proposta de disponibilidade progressiva: Modelo B (§15).

## 11. Compra, inventário e equipamento (§12)

| Passo | Onde está [atual] | Tipo |
|---|---|---|
| 1 Abrir Loja | `Shop.jsx` (`loadModuleTasks`) | componente, só leitura (8F) |
| 2 Consultar item | `ItemDetailModal.jsx` | componente |
| 3 Disponibilidade | `getEquipmentMarketState` + `getShopItemAccess` | domínio, chamado pelo componente |
| 4 Dinheiro | `profile.coins` do estado React | **componente** |
| 5–8 Comprar, debitar, registrar, inventário | `Shop.jsx buy()`: `PlayerInventory.create` → `PlayerProfile.update({ coins: perfil_em_memória − preço })` → `recordFinancialEntry` → histórico de preço | **componente**, 4 gravações separadas |
| 9 Equipar | `toggleEquipItem` → `planEquipToggle` | domínio (9B) |
| 10 Bônus | `computeEquipmentModifiers` | domínio (9B) |
| 11–12 Persistir, recarregar | repositório | domínio |
| 13 Substituir | `planEquipToggle` desequipa a mesma categoria | domínio (9B) |
| Vender | `Inventory.jsx sellItem()`: `delete` → `update({ coins: perfil_em_memória + 30% })` → extrato | **componente** |

Sondas (réplica fiel dos passos de `buy()`/`sellItem()`, carreira de memória; `tests.json`):

| Sonda | Resultado [atual] | Risco |
|---|---|---|
| A — dois cliques antes do re-render | **2 itens entregues, 1 débito** | compra duplicada / item sem pagamento |
| B — comprar de novo item possuído | aceito pela lógica (a tela só esconde o botão) | inventário duplicado |
| C — relíquia com estoque 0 | **vendida** | item indisponível vendido |
| D — falha entre criar e debitar | **item entregue, 0 debitado** | entrega sem pagamento |
| E — item possuído fora da rotação | compra de novo aceita (`owned` pula a rotação) | — |
| F — venda com crédito concorrente | **crédito de 500 perdido** (saldo absoluto) | saldo desatualizado |
| G — base da venda | 30% do preço gravado = 25% do preço de lista | regra implícita |
| Equipar item não possuído | `toggleEquipItem` não verifica o dono da linha; o modificador só lê o inventário do próprio perfil | baixo (jogo de um jogador) |
| Bônus duplicado / equipamento perdido no save | não ocorre (9B, I4/I5) | — |

Simulador: `v526Actions.buyAndEquip` **replica** a compra e ainda difere da tela: não grava o extrato `loja`, não atualiza demanda/estoque. Os testes da 9B compram com `quantity: 1`, a tela não.

**Recomendação:** operação canônica `buyShopItem` / `sellInventoryItem` no domínio, num único `localGame.batch` com `playerIncrement` e chave de idempotência (padrão já validado na H1-R1), usada pela tela, pelo simulador e pelos testes (`implementation-plan.md`, 9C.2-A). Não corrigido nesta fase.

### 11.1 Conquistas de coleção (defeito novo)

`achievementContext.fetchInventoryStats` só conta linhas com `quantity > 0`. `Shop.jsx buy()` não grava `quantity` (o campo nem existe no schema da entidade). Sonda: comprar 14 itens (todas as raridades e categorias) deixa `totalOwned`, `legendary`, `mythic`, `exclusive`, `categories` e `rarities` **iguais** (só a linha de demonstração, com `quantity: 2`, conta). 14 conquistas (Colecionador, Acumulador, Museu Pessoal, Arsenal Completo, Toque de Midas, Rei Mida, Mito Vivo, Exclusividade, Armeiro, Sapateiro, Guarda-Roupa, Tecnólogo, Pau para Toda Obra, Rainbow Collection; 79.100 moedas somadas) nunca avançam por compra. Mesmo corrigido, Guarda-Roupa (15 roupas; há 8), Sapateiro (10 tênis; há 9) e Arsenal Completo (250; há 125) ficam inalcançáveis sem duplicados. Severidade P2. Corrigir libera moedas: medir junto com o rebalanceamento.

## 12. Persistência (§12)

- `ShopItem`, `PlayerInventory`, `MarketPriceHistory`, `MarketEvent` persistem; save → load idêntico (sonda I e 9B I5).
- Catálogo reconciliado **por nome** a cada ativação: preço e bônus mudados no código chegam aos saves sozinhos; renomear não (9C-09).
- `applied_bonus` continua no schema, sempre `null` (9B).
- Riscos: 4 gravações separadas por compra (sondas A, D, F); estoque de relíquia decrementado fora de lote; nenhum risco de bônus duplicado ou equipamento perdido.

## 13. Loja × patrocínios (§13)

| Ponto [atual] | Estado |
|---|---|
| Marca no catálogo e no patrocínio | 13 marcas (Babolat, Siux, Nox, Wilson, Adidas, Bullpadel, Head, Joma, Asics, Garmin, Playtomic, Therabody, Movistar) |
| Contrato exige ou oferece equipamento | Não. `marketing_requirements: equipment_usage` é só exibição |
| Desconto | 15% com `sponsor_id` exato; 10% por nome aproximado sem `sponsor_id` |
| Rotação | Item da marca patrocinadora sempre disponível |
| Exclusividade de marca | Só por slot de contrato; nada impede equipar a concorrente |
| Item grátis / especial / recompensa | Não existe |

Dependências que a 9C.2 deve respeitar: (1) não mudar `computeItemPrice` nem a regra de rotação por patrocínio sem a 9D; (2) expor `brandId`/`sponsorId` num registro de marca; (3) a compra canônica aceitar `source` (`shop` | `sponsor`) para itens concedidos depois; (4) E1-08 (todo contrato no Bronze) torna qualquer benefício de Prata ou Ouro inalcançável hoje — a 9D precisa resolver antes de a Loja depender disso.

## 14. Relíquias (§14)

| Aspecto | [atual] |
|---|---|
| Origem | `ensureHistoricalRelics` na ativação da carreira (`careerSystemsInitialization`), ids estáveis `historical-relic-<ano>-<categoria>` |
| Obtenção | Loja: raridade exclusivo (nível 45, Top 10, reputação 85), 19–20% dos meses na rotação |
| Estoque | 1–5 por relíquia (determinístico); a compra **não** verifica |
| Preço | 78.000–108.000 de lista; oscilação diária com amplitude de até 40% |
| Bônus | +12 a +43 por item (até +20 num atributo). Melhor item da Loja: +12 |
| Acúmulo | Raquete, bola e 2 colecionáveis disputam slots; kit com relíquias +15,5 OVR declarado |
| Impacto | +30 a +37 pp no motor; mais barato por pp que o kit topo |
| Persistência | Sem problema; estoque no `MarketPriceHistory` |

**Diagnóstico:** as relíquias são o item mais forte do jogo, ao alcance só de quem já é Top 10 — reforçam quem já venceu, sem decisão. **Recomendação: sistema independente de Legado/Museu**, fora do Mercado Vivo esportivo: sem bônus de atributo (ou, no máximo, dentro da escala do exclusivo), obtidas por marcos de carreira ou compradas como prestígio (fãs, reputação, exibição no Legado). Alternativas na decisão D4 (§20).

## 15. Modelos A, B e C

Detalhe com todos os critérios: `reports/local-9c1-live-market-design/design-options.md`.

| | A Conservador | B Equilibrado | C Avançado |
|---|---|---|---|
| Escopo | defeitos + números | A + vitrine por estágio, papéis de categoria, arquétipos de marca, destaques mensais, relíquias fora | B + coleções, lançamentos, estoque variável, ofertas, usados, exclusivos de contrato |
| Resolve catálogo estático | Parcial | Sim | Sim |
| Marcas com escolha | Não | Sim | Sim |
| Microgestão | Nenhuma | Baixa | Alta |
| Gravação por dia avançado | 0 | 0 | > 0 |
| Mobile | igual | melhor (vitrine menor) | pior |
| Saves | sem migração | sem migração obrigatória | provável invalidação de dev |
| Dependência da 9D | nenhuma | dados (registro de marca) | total |
| Risco / escopo | baixo / ~3 etapas | médio / 9 etapas pequenas | alto / ≥ 2× o B |

## 16. Modelo recomendado

**Modelo B**, que a análise confirma como viável:

- os defeitos de compra e de catálogo exigem o trabalho do A de qualquer forma;
- os dados já sustentam a vitrine por estágio (`getCareerEconomyStage`, requisitos por raridade, rotação determinística) sem tick diário;
- as marcas têm sementes reais de identidade nas linhas de raquete;
- o C reativa mecanismos que o jogo já abandonou (eventos aleatórios, durabilidade) e depende da 9D por inteiro.

Princípios atendidos: equipamento por cima da base (9B) e limitado; marcas com escolha de atributo × preço; raridade com custo por ponto crescente e sem degrau morto; produto caro com justificativa (degrau de bônus em atributo útil); início com 20–25 itens; novidade a cada estágio; nenhuma compra obrigatória; interface menor; simulador usando a mesma compra.

### 16.1 Progressão por estágio [sugerido]

| Estágio (`getCareerEconomyStage`) | Quando (9E.1) | Vitrine | Kit alvo | Custo alvo do kit | Meses de sobra (equilibrado) | Bônus declarado do kit | Efeito alvo |
|---|---|---|---|---:|---:|---:|---:|
| Iniciante (nível < 5) | 1º–2º mês | comum | 1º kit | 1,5–2,5 mil | ≤ 1 | +1 OVR | +3 pp |
| Regional (nível ≥ 5) | 2º–6º mês | comum, incomum; prévia do raro | troca de marca | 5–8 mil | 2–3 | +2 | +5 pp |
| Profissional (nível 12, Top 500, rep 15) | 1º ano | incomum, raro; prévia do épico | kit raro | 15–25 mil | 6–10 | +3 | +8 pp |
| Internacional (nível 22, Top 150, rep 35) | 2º ano (Top ~100) | raro, épico; prévia do lendário | 1–3 épicos | 30–60 mil | 12–25 | +4 | +11 pp |
| Elite (nível 35, Top 40, rep 65) | sem dado | épico → mítico | kit lendário/mítico | a calibrar | a calibrar | +5 (teto) | ≤ +15 pp |
| Topo (Top 10) | sem dado | exclusivo (só raquete) | 1 raquete | a calibrar | — | +5 (teto) | ≤ +15 pp |

Elite e topo **não têm renda medida** (E1-08 e falta de carreira longa): ficam para a 9E.2.

## 17. Plano de implementação

Detalhe e critérios de aceite por etapa: `reports/local-9c1-live-market-design/implementation-plan.md`.

| Etapa | Tipo |
|---|---|
| 9C.2-A serviço canônico de compra e venda | correção de defeito |
| 9C.2-B contagem de inventário nas conquistas | correção de defeito |
| 9C.2-C higiene do catálogo (chaves órfãs, demonstração, `catalog_key`) | correção de dados |
| 9C.2-D escada de raridade e preços | balanceamento |
| 9C.2-E papéis de categoria, colecionáveis, relíquias | balanceamento + produto |
| 9C.2-F registro de marcas | nova funcionalidade (dados) |
| 9C.2-G vitrine por estágio, destaques mensais | nova funcionalidade |
| 9C.2-H interface | melhoria de interface |
| 9C.2-I validação no simulador | simulação |

Ordem: A → B → C → D → E → (F ∥ G) → H → I.

## 18. Testes e validações

| Comando | Resultado |
|---|---|
| `tools/live-market-audit.mjs --matches=300` | **15/15** (`tests.json`; 495 s; idêntico entre duas execuções) |
| `tools/inventory-achievement-probe.mjs` | defeito confirmado (`inventory-achievement-probe.json`) |
| `scripts/test-local-9b-attribute-equipment-foundation.mjs` | 71/71 |
| `scripts/test-local-9b-r1-validation.mjs` | 25/25 |
| `scripts/test-local-8e-shop-integrity.mjs` | 52 PASS · 0 FAIL |
| `scripts/test-equipment-bonus-integrity.mjs` | ok (0 chaves órfãs no `attribute_bonus`) |
| `scripts/test-shop-tier-unlock-v526b.mjs` | 5/5 |
| `scripts/test-shop-phase1.mjs` | ok |
| `scripts/test-character-equipment-overrides.mjs` | 19/19 |

Os testes da 9B regravam `results.json` e `r1-validation.json` (versionados): copiados antes e restaurados depois. O da 8E rodou com rótulo próprio e o artefato foi removido. Nenhum arquivo de `src/` alterado.

**Limitações estatísticas.** 300 partidas por cenário: IC de ±4 a 8 pp. Bom para kits e para a prova da agilidade (resultado idêntico, não estatístico); fraco para comparar atributos com efeito real entre si. Adversários com atributos planos; sem fadiga, química ou estilo. A economia é a baseline da 9E.1 (3 e 2 seeds), ordem de grandeza.

## 19. Riscos

- **Motor (D-M1):** enquanto agilidade não for lida e controle emocional quase não for, qualquer escada de bônus nesses atributos é cosmética, e o OVR exibido superestima o equipamento (e o treino desses atributos).
- **Liberar moedas:** corrigir as conquistas de coleção injeta até 79 mil moedas ao longo da carreira.
- **Balanceamento cruzado:** baratear o topo sem teto de kit pode tornar equipamento mais eficiente que treino (o kit mítico já quase iguala +8 natural).
- **Elite sem dados:** os degraus lendário, mítico e exclusivo não podem ser calibrados até a 9E.2 alcançar a elite.
- **Identidade por nome:** renomear itens na 9C.2 sem `catalog_key` duplica o catálogo nos saves.
- **Licenciamento:** dar personalidade a marcas reais (D1 da proposta da 9A) é decisão de produto e jurídica.

## 20. Decisões pendentes

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D-M1 | Atributos sem efeito na partida | (a) motor passa a ler agilidade e a pesar controle emocional (fase de motor separada); (b) a Loja para de dar bônus nesses atributos; (c) manter | (b) na 9C.2; (a) avaliada em fase própria |
| D-C1 | Chaves órfãs | trocar por atributo real coerente / dobrar o atributo restante | trocar por atributo real |
| D-C2 | Comprar de novo item possuído | recusar / permitir cópia | recusar |
| D-C3 | Base da venda | 30% do gravado (25% da lista) / % do pago | % do pago, registrado na compra |
| D3 | Categorias com efeito esportivo | 9 / raquete + tênis + grip com peso / só raquete | 9 com pesos (raquete ~35%) |
| D4 | Colecionáveis e relíquias | sem bônus (prestígio) / bônus dentro da escala / manter | sem bônus esportivo; relíquias em sistema de Legado |
| D-A1 | Vitrine | só o estágio + prévia / catálogo completo com filtro | estágio + prévia; catálogo completo como filtro |
| D-A2 | Eventos de mercado | remover código morto / 1 evento mensal determinístico | 1 evento mensal determinístico, ou remover |
| D-Q1 | Conquistas de coleção inalcançáveis | baixar limiar / acrescentar itens / manter | baixar limiar |
| D1 | Marcas reais | (da 9A) | decidir antes da 9C.2-F |

## 21. Veredito

**PASS COM RESSALVAS.** Branch e HEAD confirmados; 125 itens, 9 categorias e 24 marcas confirmados; 9B íntegra; três alternativas comparadas e o Modelo B recomendado com plano em 9 etapas. As ressalvas: decisões D-M1, D-C1–C3, D3, D4, D-A1, D-A2, D-Q1 e D1 antes da 9C.2; a calibração de elite depende da 9E.2.
