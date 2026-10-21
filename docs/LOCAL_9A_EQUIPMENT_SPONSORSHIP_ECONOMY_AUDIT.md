# LOCAL-9A — Auditoria de Loja, Equipamentos, Patrocínios e Economia da Carreira

Branch `integracao/cloud-6o` · base `b270e04` (LOCAL-8G consolidada) · **sem commit** (aguardando validação).

Fase somente leitura. Nenhum arquivo de `src/` foi alterado. Os diagnósticos rodam em carreiras de **memória** (`scripts/lib/v526bTestKit.mjs`), sem IndexedDB e sem saves do usuário. Ferramentas e evidências em `reports/local-9a-equipment-sponsorship-audit/`.

## Resumo

| Pergunta | Resposta | Evidência |
|---|---|---|
| O simulador compra equipamentos? | **Depende do harness.** O harness de decisões 5.26/5.27 compra; o CLOUD-7C (usado na LOCAL-8A e no longrun de prontidão externa) **não** compra | §7 |
| Equipa os itens? | 5.26/5.27: sim, na hora da compra. CLOUD-7C: não | §7 |
| Os bônus chegam ao motor? | **Sim.** O bônus é somado ao atributo-base do `PlayerProfile`, e o motor lê esse atributo | §4, §8 |
| Influenciam partidas? | **Sim, com força:** kit mítico do catálogo dá +15 a +21 pp de vitória; com relíquias, +30 pp | §8 |
| O efeito dura? | **Não, se o item for equipado cedo.** O bônus ocupa a margem do teto de treino: os +8,8 OVR declarados caem para +2,8 em 1.000 sessões e +1,0 em 6.000. O atleta perde 7,8 OVR de desenvolvimento-base | §4.3, §8.3 |
| Patrocínios pagam? | Sim. O salário mensal é pago no fechamento do mês. Metas, satisfação e rescisão só rodam se o jogador clicar em "Avaliar" | §5 |
| Dinheiro é usado com estratégia? | No harness 5.26/5.27, por regras fixas (gasta até 30% do caixa por compra, uma compra por semana). Não há uso de desconto, comparação de propostas nem renovação de patrocínio | §7 |
| `sponsor-eligibility-authority-v526c` | **Teste desatualizado, sem defeito no jogo.** As 4 falhas vêm do gate de prova de carreira da 5.27 (`tournaments_played ≥ 1`). Com esse campo no fixture: 7/7 | §5.4 |

**Veredito: PASS COM RESSALVAS.** A auditoria respondeu a todas as perguntas com evidência medida. As ressalvas são defeitos de design que invalidam conclusões de balanceamento tiradas até aqui (9A-01, 9A-02, 9A-03).

---

## 1. Inventário dos sistemas atuais

| Sistema | Arquivos | Estado |
|---|---|---|
| Catálogo da Loja | `src/lib/storeCatalog.js` (`RACKET_LINES`, `SUPPORT_ITEMS`, `EXCLUSIVE_RACKETS`, `SHOP_PROGRESSION`, `normalizeShopItem`, `getShopItemAccess`, `ensureExpandedShopCatalog`) | Completo |
| Relíquias históricas | `src/lib/marketEngine.js` (`HISTORICAL_RARE_ITEMS`, `ensureHistoricalRelics`) | Completo, mas fora da escala de bônus (9A-04) |
| Itens do seed local | `src/local/localSeed.js` (`shop-001..004`) | 3 dos 4 sem bônus (9A-09) |
| Preço dinâmico | `marketEngine.computeItemPrice` (eventos, demanda/oferta, desconto de patrocínio, volatilidade por raridade, estoque) | Parcial: demanda/oferta e eventos estão congelados (9A-05) |
| Eventos de mercado | `marketEngine.seedMarket`, `processMarketTick`, `marketPromotion.js` | **Inativos depois do dia 7** (9A-05) |
| Rotação mensal | `sportsEconomyV26.getEquipmentMarketState` | Completo e determinístico |
| Compra | `src/pages/Shop.jsx` `buy()` (lógica dentro do componente) | Completo; sem checagem de estoque nem de duplicado (9A-08) |
| Inventário e equipar | `src/pages/Inventory.jsx` `toggleEquip()` (lógica dentro do componente) | Completo; modelo "atributo gravado" (9A-01) |
| Venda | `Inventory.jsx` `sellItem()` (30% do preço base) | Completo |
| Durabilidade e uso | `PlayerInventory.current_durability`, `usage_count` | **Só gravados na compra; nada os altera** (9A-10) |
| Aparência | `src/lib/characterEquipmentOverrides.js`, `CharacterEditor.jsx` | Completo (cosmético) |
| Patrocínio: catálogo e regras | `src/lib/sponsors.js` | Completo |
| Patrocínio: mercado mensal | `sportsEconomyV26.getMonthlySponsorMarket` | Completo |
| Patrocínio: pagamento | `src/lib/economy.js` `processMonthlyFinances` ← `career.js` (virada de mês) | Completo |
| Patrocínio: metas e rescisão | `src/game-core/sponsorLifecycle.js` `evaluateSponsorContracts` ← só `Economy.jsx` (clique) | **Parcial** (9A-06) |
| Patrocínio: requisitos de marketing | `marketing_requirements` | **Só exibição** |
| Patrocínio ↔ Loja | `storeCatalog.catalogItem.sponsor_id`, desconto em `computeItemPrice`, rotação em `getEquipmentMarketState` | Parcial: desconto e rotação existem; nada concede itens |
| Finanças | `economy.js`, `financialLedger.js`, `financialFlow.js`, `balance527.js` | Completo |

**Persistência.** Entidades `ShopItem`, `PlayerInventory` (`equipped`, `applied_bonus`), `MarketEvent`, `MarketPriceHistory`, `PlayerContract`, `FinancialTransaction`. Save/load preserva tudo (§8.4).

**Dependência do avanço diário.** Só a virada de mês mexe na economia: `processMonthlyFinances` paga salários, cobra custos e expira contratos. A Loja não tem tick diário: `processMarketTick` não tem chamador. A rotação mensal é calculada na hora, a partir da data da carreira.

---

## 2. Catálogo real de equipamentos

Extraído da carreira de memória após a ativação real (`seedMarket` + `ensureExpandedShopCatalog`). Ferramenta: `tools/catalog-economy-extract.mjs`.

**Tabela completa (125 itens, com preço, bônus, requisito e disponibilidade):** `reports/local-9a-equipment-sponsorship-audit/catalog-table.md`.

### 2.1 Quantidades

| Origem | Itens |
|---|---:|
| `storeCatalog.js` | 111 |
| Relíquias (`HISTORICAL_RARE_ITEMS`) | 10 |
| `localSeed.js` | 4 |
| **Total** | **125** |

| Categoria | Itens | | Raridade | Itens |
|---|---:|---|---|---:|
| raquete | 60 | | comum | 20 |
| grip | 9 | | incomum | 17 |
| bola | 6 | | raro | 18 |
| roupa | 8 | | épico | 24 |
| tênis | 9 | | lendário | 19 |
| mochila | 9 | | mítico | 13 |
| tecnologia (`acessorio_tec`) | 8 | | exclusivo | 14 |
| acessório | 8 | | | |
| colecionável | 8 | | | |

**24 marcas.** Padel Heritage (15), Bullpadel (13), Nox (12), Wilson (12), Padel Start (12), Adidas (11), Joma (9), Head (9), Babolat (7), Siux (5), Court Labs (3), Asics, PlaySight, Garmin e Therabody (2 cada), e mais 9 marcas com 1 item.

**Licenciamento.** Muitas marcas usadas são reais, na Loja e nos patrocínios: Nox, Bullpadel, Adidas, Head, Wilson, Babolat, Siux, Joma, Asics, Mizuno, Garmin, Playtomic, Movistar, Therabody, Red Bull, Estrella Damm, Cupra, Iberdrola, Decathlon e Varlion. Isso exige decisão antes da distribuição pública (§11).

### 2.2 Progressão por raridade (valores do código)

`SHOP_PROGRESSION` (piso de preço e requisito) × `TIERS` (multiplicador de bônus). Preço final = preço do item (nunca abaixo do piso) × 1,2 (`shopPriceMultiplier` do preset `balanced`).

| Raridade | Requisito | Preço (faixa real) | Bônus por item | Mult. de bônus | Disponível |
|---|---|---:|---:|---:|---|
| comum | nível 1 | 54 – 1.534 | 0 – 2 | ×1 | 100% dos meses |
| incomum | nível 3 | 300 – 2.761 | 1 – 2 | ×1 | 100% |
| raro | nível 8 · Top 500 · rep 8 | 1.440 – 6.137 | 2 – 4 | ×2 | 83–92% |
| épico | nível 15 · Top 200 · rep 20 | 6.000 – 13.807 | 3 – 6 | ×3 | 63–82% |
| lendário | nível 25 · Top 100 · rep 40 | 19.200 – 38.400 | 4 – 8 | ×4 | 43–59% |
| mítico | nível 35 · Top 40 · rep 65 | 42.000 – 72.000 | 5 – 10 | ×5 | 27–39% |
| exclusivo | nível 45 · Top 10 · rep 85 | 78.000 – 108.000 | 6 – **43** | ×6 (relíquias: bônus bruto) | 9–23% |

A disponibilidade foi medida em 120 meses (2026–2035) com `getEquipmentMarketState`, sem patrocínio da marca. Com contrato ativo da marca, o item fica sempre na rotação.

### 2.3 Kit completo (melhor item de cada categoria, só `storeCatalog`)

| Raridade | Categorias cobertas | Custo do kit | Bônus somado | Efeito médio no OVR |
|---|---:|---:|---:|---:|
| comum | 7 (sem tecnologia e colecionável) | 2.042 | 8 | +0,8 |
| incomum | 8 | 5.506 | 9 | +0,9 |
| raro | 9 | 16.956 | 22 | +2,2 |
| épico | 9 | 80.450 | 45 | +4,5 |
| lendário | 9 | 253.200 | 64 | +6,4 |
| mítico | 8 (sem bola) | 476.400 | 80 | +8,0 |
| melhor de cada categoria, sem relíquias | 9 | — | 88 | +8,8 |
| melhor de cada categoria, com relíquias | 9 | — | 155 | +15,5 |

Preço por ponto de bônus (mediana): comum 474, incomum 853, raro 949, épico 2.000, lendário 4.800, mítico 6.240. Nas relíquias, 2.260 a 6.500.

### 2.4 Itens sem função ou dominantes

- **Sem bônus:** Tênis Court Pro, Grip Performance e Mochila Tour (`localSeed`).
- **Incomum dominado:** os multiplicadores de comum e incomum são iguais (×1). Um item incomum dá o mesmo +1 que o comum da mesma categoria e custa 2 a 5 vezes mais.
- **Relíquias dominantes:** "Raquete Dourada do Circuito (2024)" dá +43 e "Raquete Olímpica Paris 2024" dá +40. A melhor raquete exclusiva do catálogo dá +12. As relíquias não passam por `scaleBonus` e têm a melhor relação preço/ponto do topo (9A-04).
- **Colecionáveis equipáveis:** um troféu ocupa um slot e dá bônus esportivo, como uma raquete. O comentário do catálogo diz o contrário ("não atalho para força esportiva").
- **Atributos pouco usados:** saque aparece em só 2 itens. Controle emocional (32) e estratégia (31) dominam (`attributeUsage` no JSON).

### 2.5 A Loja acompanha a carreira?

Sim, no papel. Cada degrau de raridade exige nível, ranking e reputação, e o preço cresce com ele. Na prática, os requisitos não seguram nada. No harness 5.27 (perfil `normal`), o jogador comprou épicos a partir do dia 560 com caixa apertado (§6.2). O freio real é o dinheiro, não o requisito.

---

## 3. Bônus de atributos

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Atributos por categoria | Só as 10 chaves reais (`ATTRIBUTE_KEYS`). Chaves órfãs são filtradas em `scaleBonus`; nenhuma sobra no catálogo. Raquete: golpes (smash, bandeja, voleio, defesa, forehand/backhand). Tênis: agilidade. Roupa, mochila, acessório e colecionável: controle emocional e estratégia. Tecnologia: estratégia |
| 2 | Permanente enquanto equipado? | Sim. É gravado no atributo do perfil no ato de equipar e revertido ao desequipar (`applied_bonus`) |
| 3 | Limites | Piso 0 e teto 100 por atributo. **Não respeita o teto individual de desenvolvimento** (65–98) |
| 4 | Acumula? | Um item por categoria. Somam-se as 9 categorias |
| 5 | Categorias combinam bônus? | Sim, até 9 itens ao mesmo tempo |
| 6 | Duplicados acumulam? | **Não** (medido). `buy()` não impede comprar o mesmo item de novo (só a interface esconde o botão), mas equipar a segunda cópia desequipa a primeira |
| 7 | Bônus na interface | Card da Loja mostra 3 atributos. Inventário soma o bônus **declarado**, não o aplicado: perto de 100 a soma exibida é maior que a real |
| 8 | Atributo exibido = atributo do motor? | Sim, porque o bônus está gravado no próprio atributo. Em contrapartida, a interface não separa base e equipamento |
| 9 | Partidas simuladas automaticamente | Sim, se a partida for do jogador (`LiveMatch`, modo simulado). A IA não tem equipamento |
| 10 | Partida rápida e torneio | Os dois usam `{...profile}` (`practiceMatchSession.js:36`, `TournamentModal.jsx:1064`) |
| 11 | Save/load | Preserva atributos, `equipped` e `applied_bonus` (medido) |
| 12 | Troca de equipamento | Remove o bônus antigo e aplica o novo, sem resíduo (medido) |
| 13 | Snapshots | `createMatch` copia os atributos para o `engineState`. O checkpoint de partida guarda esse estado: trocar equipamento no meio de uma partida só vale na próxima |
| 14 | Quando o equipamento conta | Só na criação da partida. Inscrição e chave usam ranking, não OVR |

---

## 4. Integração com o motor

### 4.1 Cadeia de chamadas

1. `Shop.jsx buy()` cria `PlayerInventory` (`equipped:false`) e debita o preço do perfil.
2. `Inventory.jsx toggleEquip()` desequipa a mesma categoria (subtrai `applied_bonus`), soma `attribute_bonus` ao **atributo-base** do `PlayerProfile` (piso 0, teto 100) e grava o delta aplicado em `applied_bonus`.
3. `TournamentModal.jsx:1064` e `practiceMatchSession.js:36` montam `{...profile, _chemistryBonus, _coachMatchBonus, _partnerBondBonus}` e chamam `createMatch`.
4. `engine/match/playerModel.js normalizePlayer()`: `attributes.<k> = raw.<k>`; `overall = baseOverallRating(raw)` (média dos 10) mais química, treinador e vínculo.
5. `RallyEngine` usa os atributos golpe a golpe.

**Não há desconexão.** O bônus chega ao motor.

### 4.2 Modelo atual: bônus gravado no atributo

O jogo não tem "atributo-base + modificador". Existe um único número por atributo, já com o equipamento somado. Consequências:

- interface e motor sempre concordam;
- nenhum sistema distingue o que é do atleta e o que é do equipamento: treino, teto, bônus de vitória e conquistas de atributo máximo leem o valor somado.

### 4.3 Defeito: o teto de treino consome o bônus (9A-01)

`trainingSystemV2.applyAttributeGains` limita o ganho em `teto − valor gravado`. `getDevelopmentWindow` desacelera o treino conforme `teto − valor gravado`. `padel.js buildMatchRewardsPatch` limita o bônus de vitória pelo mesmo teto. Como o valor gravado já inclui o equipamento:

- **equipar cedo** antecipa pontos que o treino daria de qualquer forma. A vantagem some com o tempo e o desenvolvimento-base fica menor;
- **equipar depois de bater o teto** soma o bônus inteiro;
- **desequipar ou vender** depois de muito treino deixa o atleta abaixo de onde estaria sem nunca ter comprado.

Medição em §8.3. Isso não aparece em vitórias isoladas, só em carreira longa. Por isso conclusões de balanceamento tiradas de harness que equipa desde o dia 0 subestimam o treino e superestimam o equipamento no início, ou o contrário no fim.

---

## 5. Sistema atual de patrocínios

### 5.1 Matriz de regras (valores do código)

| Regra | Implementação | Estado |
|---|---|---|
| Catálogo | 21 marcas: 7 Bronze, 8 Prata, 6 Ouro (`SPONSOR_CATALOG`) | Completo |
| Propostas | Não há proposta ativa. Existe uma vitrine mensal determinística (`getMonthlySponsorMarket`): 6 a 14 marcas por estágio. Iniciante vê só Bronze; regional, até Prata; profissional em diante, até Ouro | Completo |
| Elegibilidade | `canSign`: `is_available !== false`; prova de carreira (`tournaments_played ≥ 1`, preset `balanced`); XP; títulos; apelo de fãs; idade pela data da carreira | Completo |
| Ranking mínimo | **Não existe.** A elegibilidade não olha ranking nem reputação. O estágio da vitrine olha nível, ranking e reputação | Parcial |
| Valor | `base × (0,7 a 1,3 pela compatibilidade de perfil) × (1 + poder de negociação ≤ 0,45) × 0,22` (mensal) ou `× 0,21` (luvas). Faixa real: 139 a 4.769/mês; luvas de 44 a 8.709 | Completo |
| Pagamento | Salário mensal em `processMonthlyFinances` (virada de mês), +18% com empresário | Completo |
| Duração | 4 a 24 meses; expira no fechamento do mês | Completo |
| Renovação | Manual (`renewContract`). Não revalida `canSign` nem preserva `sponsor_category`. Luvas × (1 + bônus de renovação) | Parcial (9A-07) |
| Rescisão | Voluntária, sem multa. Ou por satisfação abaixo do limiar, **só ao clicar "Avaliar"** | Parcial (9A-06) |
| Metas mensais | Partidas, vitórias, torneios, postagens. Avaliadas só no clique. Recompensa ou penalidade direta no caixa | Parcial (9A-06) |
| Meta de postagens | Lê `profile.monthly_social_posts`, que **nenhum código grava**: sempre 0, sempre penaliza | Defeito (9A-06) |
| Metas sazonais | Títulos (`win_tournament`, `seasonal`): filtradas na avaliação mensal e **nunca avaliadas** | Defeito (9A-06) |
| Cláusulas de desempenho | `min_win_rate`, `tournament_participation` e `termination_threshold` entram na satisfação (só no clique) | Parcial |
| Exclusividade | Só por slot: principal 1, raquete 1, vestuário 1, calçado 1, comercial 2. No máximo 6 contratos | Completo |
| Requisitos de marketing | `equipment_usage`, `logo_visibility` etc. | **Só exibição** |
| Relação com a Loja | 15% de desconto em itens da marca (`sponsor_id` exato), 10% por nome aproximado; item da marca sempre na rotação | Completo |
| Relação com equipamentos | Nenhuma. Não concede item, não exige uso, não muda bônus | Ausente |
| Persistência | `PlayerContract` | Completo |
| Calendário | Virada de mês | Completo |

13 das 21 marcas têm itens na Loja. Varlion, Red Bull, Decathlon, Estrella Damm, Cupra, Padel League, Iberdrola e LocalFit não têm, e por isso não dão desconto.

### 5.2 Completo, parcial, visual

- **Completo:** vitrine, elegibilidade, assinatura, slots, pagamento mensal, expiração, desconto na Loja.
- **Parcial:** metas, satisfação e rescisão (dependem de clique); renovação.
- **Só visual:** requisitos de marketing e uso de equipamento.

### 5.3 Interface × motor

Painel, modal de negociação, assinatura e harness usam a mesma regra (`canSign`) e a mesma vitrine. **Não há divergência.**

### 5.4 Falha preexistente `sponsor-eligibility-authority-v526c` (3/7)

Ferramenta: `tools/sponsor-eligibility-diagnosis.mjs`. Reexecuta as mesmas asserções sem alterar o teste.

| Asserção | Fixture original | Com `tournaments_played: 1` |
|---|---|---|
| 1. Os 9 originais são elegíveis | ✗ "Requer prova de carreira (1 torneios disputados)" | ✓ |
| 2. `is_available:false` bloqueia | ✓ | ✓ |
| 3. Limiares exatos | ✗ mesma razão, nas 21 marcas | ✓ |
| 4. Idade pela data da carreira | ✗ mesma razão | ✓ |
| 5. Assinatura recusa com o motivo do `canSign` | ✓ | ✓ |
| 6. Assinatura de um original | ✗ mesma razão | ✓ |
| 7. Tela, modal e harness usam `canSign` | ✓ | ✓ |

**Causa.** O teste é da 5.26-C. A 5.27 acrescentou o gate `hasSponsorProof` (`balance527.js`), e o perfil-fixture do teste não tem `tournaments_played`.

**Conclusão.** O teste está desatualizado. Não há defeito real, a elegibilidade é aplicada corretamente e não há divergência entre interface e motor. O teste não foi alterado. A correção é acrescentar `tournaments_played` ao fixture, e fica para quando houver autorização.

---

## 6. Economia da carreira

### 6.1 Regras atuais (preset `balanced`)

| Receita | Valor |
|---|---|
| Moedas iniciais | 900 |
| Prêmio por torneio (campeão; a 1ª rodada paga 9% no Bronze e no Silver e 4,5% do Gold em diante) | Bronze 450 · Silver 1.125 · Gold 4.500 · Platinum 9.000 · Masters 22.500 · Elite 45.000 · Crown 90.000 · Circuit Finals 6.750 · Legacy Finals 67.500 |
| Recompensa por partida | 30 (vitória) / 10 (derrota) |
| Patrocínio | 139 a 4.769/mês; luvas de 44 a 8.709 |
| Metas de patrocínio | De +120 a +1.800/mês ou penalidade, só no clique |
| Missões e conquistas | Moedas por marco |
| Investimentos | Taxa do catálogo × 0,23 |
| Venda de item | 30% do preço base |

| Despesa | Valor |
|---|---|
| Inscrição | Bronze 10 · Silver 20 · Gold 45 · Platinum 90 · Masters 180 · Elite 320 · Crown 500 |
| Treino por sessão | 20 / 30 / 45 / 65 / 90 por estágio (× 0,7 leve, × 1,4 intenso) |
| Treinador por mês | iniciante 224–458 · regional 510–949 · profissional 1.006–2.038 · elite 2.300–4.231 · lendário 4.800–7.435 |
| Staff por mês | 700–5.200 (base) × 1,25, com variação mensal |
| Centro médico | Contratação 2.500–15.000 e salário 450–2.200; tratamentos 350–1.800 |
| Equipamento | §2 |
| Salário do parceiro, clube | Por contrato |

### 6.2 Observado no harness de decisões (perfil `normal`)

Ferramenta: `tools/economy-observed.mjs`, sobre execuções já versionadas. **Atenção:** são execuções da era 5.27-J, anteriores às mudanças das CLOUD-6. Servem como ordem de grandeza da economia e do comportamento de compra, não da curva esportiva atual. A §7.3 traz a execução no HEAD.

| 527-J, seed 3 | Ano 1 | Ano 2 |
|---|---:|---:|
| Receita total | 46.416 | 70.975 |
| Patrocínio (mensal + luvas) | 36% | 36% |
| Prêmios | 21% | 37% |
| Conquistas | **39%** (18.000) | 25% (18.000) |
| Despesa total | 37.704 | 77.440 |
| **Equipamento** | **48%** (18.150) | **41%** (32.073) |
| Treino | 33% | 25% |
| Caixa no fim do ano | 9.612 | 3.147 |
| Meses com caixa negativo | 0 | 0 |

Comportamento observado na mesma execução: 23 itens comprados (7 comuns, 1 incomum, 9 raros, 6 épicos), 9 slots equipados a partir do dia ~364, primeiro épico no dia 560. 13 patrocínios assinados, 12 Bronze e 1 Prata (dia 490). Caixa no dia 730: **1.722**.

Referência histórica anterior à 5.27 (`526c-normal-008`, moedas iniciais 100, patrocínio sem redutor): patrocínio era 87% da receita no ano 1. Comprou 42 itens, até mítico (dia 798), e terminou com 123.012 de caixa.

### 6.3 Indicadores

| Indicador | Teórico (regras) | Observado (527-J) |
|---|---|---|
| Capacidade de compra no início | 900 moedas compram um kit comum inteiro (2.042) só depois das primeiras luvas e prêmios | Kit comum no 1º mês |
| Tempo até um kit épico (80 mil) | Mais que a receita total do ano 1 | 6 épicos em 2 anos, não o kit completo |
| Kit mítico (476 mil) | ~6,7 anos da receita do ano 2 de um profissional | Nunca |
| Elite | Um título Crown (90 mil) paga ~1 item exclusivo. Contratos Ouro pagam até ~4,8 mil/mês | Sem dado no HEAD |
| Participação do patrocínio | — | 36% (527-J); **49%** no HEAD, ano 1 |
| Risco de ficar sem dinheiro | Baixo: rescisão de staff vira dívida e nunca trava (5.27-B) | Caixa mínimo de 1.724 |
| Acúmulo excessivo | Antes da 5.27, sim (CLOUD-6A: 20–75 mil parado). Depois, o equipamento absorve o excedente | Caixa curto no fim do ano 2 |
| Investimento × evolução | O dinheiro vai para treino e equipamento. O efeito de longo prazo do equipamento comprado cedo é pequeno (9A-01) | 527-J: equipamento 48% da despesa do ano 1. HEAD: treino 60%, equipamento 18% |

---

## 7. Comportamento dos simuladores

### 7.1 Inventário

| Harness | Usado em | Decide como jogador? |
|---|---|---|
| `scripts/sim-progression-economy-v526.mjs` + `scripts/lib/v526Actions.mjs` (perfis casual, normal, optimizer) | 5.26, 5.27, CLOUD-6A, CLOUD-6D | **Sim:** treino, inscrição, parceiro, patrocínio, treinador, staff, Loja, investimento, imprensa |
| `scripts/cloud-7c-long-career.mjs` | CLOUD-7C, LOCAL-8A, longrun da prontidão externa | **Parcialmente:** treino (uma atividade, 40%), inscrição, partidas, 1 troca de parceiro por temporada. Sem Loja, patrocínio, treinador ou staff |
| `scripts/test-player-development-curve-6b.mjs` | CLOUD-6B | Não. Mede a curva de treino |
| LOCAL-7D…7H.1, CLOUD-7D1 | Integridade | Não. Cenários pontuais de torneio e ranking |
| `scripts/simulate-equipment-progression.mjs` (15.5.3) | Antigo | Não. Só injeta o bônus no atributo inicial |

### 7.2 Ações

| Ação | Implementada no simulador? | Executada nos testes anteriores? | Evidência |
|---|---|---|---|
| Comprar equipamentos | Sim no 5.26 (`buyAndEquip`, réplica declarada de `Shop.jsx`). Não no 7C | Sim nas execuções 5.26/5.27, CLOUD-6A e 6D. **Não** na LOCAL-8A nem no longrun externo | `purchases` em `rebalance-527j/.../normal-003.json` (23 itens) e `progression-clean-526c/.../normal-008.json` (42); `PlayerInventory` ausente do hash do save do longrun |
| Equipar itens | Sim, no mesmo passo da compra | Idem | `gearEquipped` = 9 nos registros semanais |
| Trocar por outro melhor | Sim: só compra quando o bônus total supera o equipado na categoria | Sim no 5.26/5.27 | Sequência comum → raro → épico → lendário → mítico em `normal-008` |
| Receber propostas de patrocínio | Lê a vitrine mensal real | Sim no 5.26/5.27. Não no 7C | `sponsors` nos JSONs |
| Aceitar patrocínios | Sim (`signSponsorContract` real), o de maior salário | Sim no 5.26/5.27 | 13 e 19 assinaturas |
| Receber pagamentos | Sim, pelo pipeline real de virada de mês | Sim, onde houve contrato | `sponsor_monthly` no ledger |
| Renovar contratos de patrocínio | **Não.** Quando o contrato expira, assina de novo pela vitrine | Não | Nenhuma chamada a `renewContract` nos harnesses |
| Avaliar metas de patrocínio | **Não** (`evaluateSponsorContracts` nunca é chamado) | Não | idem |
| Contratar treinador | Sim no 5.26 (com upgrade). Não no 7C | Sim no 5.26/5.27 | `coaches` nos JSONs |
| Usar fisioterapia | Contrata o fisioterapeuta como staff (prioridade 1 no perfil `normal`). Não usa tratamentos do Centro Médico | Staff sim; tratamentos não | `staffPriority`; nenhuma chamada a `MedicalCenterManager` |
| Trocar parceiro | Sim nos dois | Sim | `partners`, `partner-changes.jsonl` |
| Treinar atributos | Sim nos dois (7C: uma única atividade) | Sim | `trainings` |

**Explicitamente:** a LOCAL-8A e o longrun de 2 temporadas da prontidão externa **não compraram nem equiparam nada e não assinaram patrocínio**. A CLOUD-6A comprou e equipou, desde o dia 0.

**O harness atual permite decidir sem mexer no motor?** Sim. O 5.26 já chama as funções de domínio. A compra e o equipar são réplicas porque a lógica vive nos componentes `Shop.jsx` e `Inventory.jsx`. Para um simulador fiel, essa lógica precisa sair para uma função de domínio compartilhada (§12, 9B).

### 7.3 Execução no HEAD (harness 5.26, perfil `normal`, seed 1, 365 dias)

Para confirmar que o harness de decisões funciona com o código atual, ele foi rodado sem alterações sobre `b270e04`. A saída bruta ficou fora do repositório; o resumo está em `head-harness-normal-365d-summary.json`.

- **0 erros**, 36 partidas, 33 torneios. OVR 22 → 47, ranking 1001 → 331, caixa final 7.021 (mínimo mensal de 777).
- **Loja:** 10 compras. Oito comuns ou incomuns até o dia 63, todas equipadas (8 slots). Dois raros nos dias 280 e 287. Nenhum épico no ano 1.
- **Patrocínio:** 8 assinaturas, todas Bronze. Salário mensal somado de ~1,3 a 1,7 mil.
- **Treinador:** 2 contratações (iniciante no dia 126, regional no dia 168). Staff: 0 (orçamento insuficiente pela regra do perfil).
- **Treino:** 584 sessões no ano.

| Ano 1 no HEAD | Valor | Participação |
|---|---:|---:|
| Receita total | 36.054 | |
| Patrocínio (mensal 14.587 + luvas 3.013) | 17.600 | **49%** |
| Conquistas e outros (12.000) | 12.000 | 33% |
| Prêmios | 6.034 | 17% |
| Despesa total | 29.933 | |
| **Treino** | 18.035 | **60%** |
| Equipamento | 5.355 | 18% |
| Treinador (salário + luvas) | 4.188 | 14% |
| Inscrições | 1.315 | 4% |

No código atual, no ano 1, o treino é o maior gasto e o patrocínio Bronze a maior receita. Equipamento é um gasto secundário, que para no raro.

---

## 8. Prova de impacto dos equipamentos

Ferramenta: `tools/equipment-impact.mjs`. Resultado: `equipment-impact.json`, **25/25 verificações**.

Desenho: mesmo atleta, mesmo parceiro, mesmos adversários (atributos planos no nível do fixture), contexto neutro (química 0, energia 100). Mesmas 400 seeds por cenário, comparadas partida a partida (pareado), com intervalo de confiança de 95%. Compra e equipar pelo caminho do jogo.

Kits:
- **B, básicos:** melhor comum de cada categoria (7 itens, +8).
- **C, intermediários:** melhor épico (9 itens, +45).
- **D, melhores do catálogo:** 9 itens, +88.
- **D2, com relíquias:** 9 itens, +155.

### 8.1 Parâmetros que chegam ao motor

Em todos os cenários, o atributo gravado é igual a base + bônus (teto 100), e `normalizePlayer` recebe exatamente esse valor.

| Fixture | A | B | C | D | D2 |
|---|---:|---:|---:|---:|---:|
| OVR, atleta médio (60) | 60 | 61 | 65 | 69 | 75 |
| OVR, atleta de elite (85) | 85 | 86 | 90 | 92 | 94 |

No fixture de elite, o teto de 100 corta parte do bônus.

### 8.2 Resultado em partidas (400 por cenário)

| Fixture | Cenário | Vitórias | Δ vs A (pareado) | IC 95% | Δ pontos |
|---|---|---:|---:|---|---:|
| médio 60 | A | 53,8% | — | — | — |
| | B | 56,0% | +2,3 pp | −1,6 a +6,1 | +0,21 pp |
| | C | 61,3% | +7,5 pp | +1,5 a +13,5 | +1,09 pp |
| | D | 69,0% | **+15,3 pp** | +8,7 a +21,8 | +1,86 pp |
| | D2 | 84,5% | **+30,8 pp** | +24,6 a +36,9 | +4,29 pp |
| elite 85 | A | 49,3% | — | — | — |
| | B | 51,2% | +2,0 pp | −2,5 a +6,5 | +0,37 pp |
| | C | 59,8% | +10,5 pp | +4,3 a +16,7 | +1,38 pp |
| | D | 70,0% | **+20,8 pp** | +14,6 a +26,9 | +2,29 pp |
| | D2 | 79,0% | **+29,8 pp** | +23,5 a +36,0 | +3,71 pp |

**Conclusão.** O motor consome os bônus. O kit básico não tem efeito mensurável. A partir do épico o efeito é real, e o melhor kit decide partidas equilibradas. Isso vale só para o jogador: parceiros e IA nunca recebem equipamento.

### 8.3 Interação com o teto de treino (mesmo atleta, mesma sequência de treinos)

Funções puras reais (`previewTraining` + `applyAttributeGains`). Atleta com atributos 40, potencial 80 (teto 85), kit D (+88, ou +8,8 OVR declarado).

| Sessões de treino | Sem equipamento | Equipado desde o início (efetivo) | Base sob o equipamento | Vantagem efetiva | Base perdida |
|---:|---:|---:|---:|---:|---:|
| 0 | 40,0 | 48,8 | 40,0 | +8,8 | 0 |
| 1.000 | 60,2 | 63,0 | 54,2 | +2,8 | 6,0 |
| 2.000 | 68,5 | 70,2 | 61,4 | +1,7 | 7,1 |
| 3.000 | 73,9 | 75,1 | 66,3 | +1,2 | 7,6 |
| 6.000 | 77,9 | 78,9 | 70,1 | **+1,0** | **7,8** |

Equipando o mesmo kit só depois das 6.000 sessões: 77,9 → 85,1.

Limite do probe: a sequência usa 6 atividades fixas e não treina saque. Ela mede o mecanismo, não uma carreira. Referência de escala: o harness `normal` no HEAD fez 584 sessões no ano 1 (§7.3). Equipar no início equivale, portanto, a perder ~6 OVR de base ao fim da 1ª ou 2ª temporada.

### 8.4 Troca, duplicados e persistência

- **PASS:** troca de raquete épica pela melhor remove o bônus antigo; um item equipado por categoria.
- **PASS:** cópia duplicada no inventário não acumula bônus (2 cópias, 1 equipada).
- **PASS:** save → load preserva atributos efetivos, 9 itens equipados e `applied_bonus`.
- **PASS:** depois de recarregar, desequipar tudo devolve o atributo-base exato.

---

## 9. Problemas encontrados

| ID | Sev. | Problema | Evidência |
|---|---|---|---|
| 9A-01 | **P1** | O bônus de equipamento é gravado no atributo-base e consome a margem do teto de treino e de vitória. Equipar cedo quase não dá vantagem de longo prazo e reduz o desenvolvimento-base | §4.3, §8.3 |
| 9A-02 | **P1** (validação) | Os harnesses de carreira longa usados para a validação recente (CLOUD-7C → LOCAL-8A, prontidão externa) não usam Loja, patrocínio, treinador nem staff. Conclusões de progressão tiradas deles não representam um jogador | §7 |
| 9A-03 | **P1** (validação) | O harness 5.26 compra e equipa desde o dia 0, por bônus total, até 30% do caixa por semana. Por 9A-01, isso mistura o efeito do equipamento com o do treino. Não renova patrocínio nem avalia metas | §7.2 |
| 9A-04 | P2 | Relíquias com bônus brutos (até +43 por item) fora da escala do catálogo (exclusivo ≤ +12). São as melhores do jogo e as mais baratas por ponto no topo | §2.3, §2.4 |
| 9A-05 | P2 | Mercado sem vida: a carreira nova só tem o evento "Semana de lançamento" (dias 1–7). `seedMarket` sai cedo porque esse evento já está ativo, e os 6 eventos iniciais nunca nascem. `processMarketTick` (demanda, oferta e eventos aleatórios) não tem chamador | `market-events-probe.json` |
| 9A-06 | P2 | Metas, satisfação e rescisão de patrocínio só rodam no clique "Avaliar". A meta de postagens lê um campo que ninguém grava e sempre penaliza. As metas sazonais (títulos) nunca são avaliadas | §5.1 |
| 9A-07 | P3 | `renewContract` não revalida elegibilidade nem preserva `sponsor_category` (o slot cai no fallback de catálogo) | `sponsor-eligibility-diagnosis.json` (`uiVsEngine`) |
| 9A-08 | P3 | `buy()` não checa estoque limitado (relíquia com 0 unidades ainda é comprável) nem duplicado (depende só da interface) | `Shop.jsx:208-262` |
| 9A-09 | P3 | Itens sem função (3 do seed local) e incomum dominado pelo comum (mesmo bônus, 2–5× o preço) | §2.4 |
| 9A-10 | P3 | Durabilidade e uso nunca mudam. A conquista "Veterano de Equipamentos" (`long_equipped`) não tem avaliador e é inalcançável | `Shop.jsx:236`, `achievementEngine.js` (`default: return null`) |
| 9A-11 | P3 | Requisitos de marketing (`equipment_usage` etc.) são só exibição: patrocínio de marca não exige nem concede equipamento | §5.1 |
| 9A-12 | P3 | A interface não separa atributo-base de equipamento; o Inventário soma o bônus declarado, não o aplicado | §3 |
| 9A-13 | P3 | `test-sponsor-eligibility-authority-v526c` desatualizado (fixture sem `tournaments_played`) | §5.4 |
| 9A-15 | P3 | As 10 conquistas "Alcance 100 em X" (`max_attribute`, limiar 100) só são alcançáveis com equipamento: o teto individual de desenvolvimento vai até 98 | `achievementsData.js:103-112`, `attributeCeiling.js` |
| 9A-14 | Decisão | Marcas reais nos itens e nos patrocinadores | §2.1 |

Achados preexistentes reconfirmados nesta fase (não são da 9A): baseline byte a byte da CLOUD-7B1 (falha desde `4226055`, documentada na 8G); `test-interview-variety` instável (sorteio sem seed com gate estatístico: 1 falha em 6 execuções, sem relação com a 8G).

## 10. Oportunidades de melhoria

- Separar **atributo-base** de **modificador de equipamento**, aplicado na criação da partida. Resolve 9A-01 e 9A-12 e permite mostrar "base + equipamento".
- Extrair compra e equipar dos componentes para funções de domínio, para que a página e o simulador usem o mesmo código.
- Tirar as relíquias da força esportiva, ou trazê-las para a escala do catálogo.
- Dar sentido ao incomum (multiplicador próprio) e às categorias de suporte (efeito pequeno e distinto, não "+1 em estratégia" em tudo).
- Ligar patrocínio a equipamento: item concedido, desconto, linha exclusiva e exigência de uso.
- Rodar a avaliação de patrocínio no fechamento do mês, com metas que o jogo realmente mede.
- Reativar ou remover o mercado vivo (`processMarketTick` e eventos).
- Simulador com orçamento e decisões que um humano tomaria: reserva, ROI, quando trocar, qual proposta aceitar.

## 11. Riscos

- **Validação da progressão:** qualquer conclusão de balanceamento tirada da LOCAL-8A ou do longrun externo ignora Loja e patrocínio. As do 5.26/5.27 estão contaminadas por 9A-01.
- **Migração:** mudar para "base + modificador" exige converter saves (subtrair `applied_bonus` do atributo gravado). Saves de desenvolvimento podem ser invalidados com versionamento (política do projeto), sem apagar nada automaticamente.
- **Balanceamento cruzado:** sem 9A-01 o equipamento fica mais forte no fim de carreira. O kit mítico (+8,8 OVR) somado ao teto pode tornar a elite fácil demais.
- **Licenciamento:** nomes reais de marcas na versão pública. É uma decisão de produto e jurídica, não técnica.
- **Determinismo:** os eventos de mercado usam `Math.random`. Reativar o tick exige RNG semeado pela carreira.

## 12. Recomendações

1. **Não validar a progressão** antes de corrigir 9A-01 e de existir um simulador de decisões econômicas.
2. **9B:** separar base e modificador, com migração versionada; funções de domínio para comprar, equipar e assinar; corrigir o fixture do teste v526c (9A-13), com autorização.
3. Só depois redesenhar catálogo, marcas e patrocínio (proposta em `docs/PADEL_LEGACY_LIVE_MARKET_DESIGN_PROPOSAL.md`).
4. Decidir licenciamento de marcas antes de criar conteúdo novo de marca.

## Gates desta fase

- Nenhum arquivo de `src/` alterado. `git status`: só `reports/local-9a-equipment-sponsorship-audit/` e este documento novos, mais os 5 falsos positivos de CRLF em `src-tauri` e artefatos antigos de outras fases.
- Diagnósticos isolados em memória, sem IndexedDB e sem saves do usuário.
- Sem commit da 9A.
