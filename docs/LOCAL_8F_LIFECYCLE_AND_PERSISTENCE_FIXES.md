# LOCAL-8F — Ciclo de vida, inicializações e persistência

Branch `integracao/cloud-6o` · base `b59bc07` (LOCAL-8E) · **sem commit** (aguardando validação).

Regra central: **abrir uma tela não é o mecanismo que faz o mundo existir ou evoluir.** Cada operação foi classificada em:

- **inicialização:** uma vez, na ativação da carreira;
- **atualização temporal:** no avanço do dia;
- **ação explícita:** depois de uma decisão do jogador;
- **consulta:** somente leitura.

Escopo: os P2 da LOCAL-8D (8D-05 a 8D-09) e as duas pendências da LOCAL-8E (treinadores e relíquias). Nada fora disso foi alterado, salvo os dois ajustes indispensáveis registrados no §9.

Política de saves (nova diretriz de produto): carreiras antigas de desenvolvimento não são mais uma restrição absoluta. Nesta fase **não foi necessário invalidar nenhum save**: todas as correções são aditivas e idempotentes, e saves antigos são inicializados na próxima ativação (§10).

## 1. Auditoria de ciclo de vida (antes → depois)

| Sistema | Fonte canônica | Antes (quem inicializava/alterava) | Depois |
|---|---|---|---|
| Propostas de dupla | `PartnerOffer` | **1ª abertura de Duplas** gerava o lote; recusar todas e reabrir gerava outro lote na hora; duas aberturas simultâneas davam erro de id duplicado | **Inicialização:** ao completar a identidade (lado + estilo, `Missions.jsx`) e, de forma idempotente, na ativação. **Temporal:** depois de esgotado o lote inicial, novas levas no tick diário, no mesmo ritmo do mercado pós-separação (3 dias, depois a cada 7). **Consulta:** Duplas só lista |
| Missões | `Mission` (catálogo canônico `TUTORIAL_MISSIONS`) + `MissionProgress` | Migração **na tela** de Objetivos (`syncExtendedMissionCatalog`): aliases convertiam as 3 missões de demonstração em "semanal" na 1ª visita e as arquivavam na 2ª | **Inicialização:** `ensureTutorialMissionCatalog` na ativação, que arquiva as missões de demonstração de forma determinística. **Temporal/eventos:** inalterados. **Consulta:** a tela só confirma o catálogo |
| Conquistas | `PlayerAchievement` (+ `FinancialTransaction` "conquista") | Fim de partida de torneio **e abertura da aba** (desbloqueio + moedas). Reconciliação de save antigo também na aba | **Temporal:** etapa `achievements` no fechamento de cada dia (mesmo motor e mesmos ids determinísticos). Fim de partida inalterado. **Consulta:** a aba só avalia em memória |
| Notícias do circuito | `WorldEvent` | Abertura de Notícias/Circuito completava 15 notícias de "ambientação" por dia (`Math.random`) e 2 macroeventos | **Temporal:** avanço diário (notícias contextuais, editorial e macroevento), agora **semeado pela data**. **Ação explícita:** botão "gerar" inalterado. **Consulta:** abrir só lista |
| Clubes | `Club` (`buildWorldClubCatalog`, determinístico) | 1ª abertura de Clubes: **um `Club.create` por clube** (71 gravações do save) | **Inicialização:** na ativação, em **uma** gravação (`bulkCreate`, id = `world_club_key`). **Consulta:** Clubes só lista |
| Treinadores | catálogo `COACHES_DATA` → `Coach`; termos do mês: `src/lib/coachMarket.js` | Mercado Mundial exibia a projeção mensal; Treinadores e a contratação liam `market_*` **persistidos** (gravados só por "Processar mês"); catálogo criado na 1ª abertura de Treinadores; identidade por nome | **Inicialização:** catálogo na ativação, identidade por `catalog_key`. **Fonte única:** projeção mensal pura usada por Mercado, Treinadores e contratação (recalculada na confirmação). **Consulta:** as duas telas |
| Relíquias da Loja | `HISTORICAL_RARE_ITEMS` (10) + estoque `MarketPriceHistory` | Nunca criadas: `seedMarket` saía antes (há um `MarketEvent` ativo de `localSeed`), e a guarda contava colecionáveis do catálogo como relíquias | **Inicialização:** na ativação, independentes do evento, com ids estáveis e estoque determinístico. **Consulta:** a Loja só lista |

Efeito sobre o RNG: notícias diárias e macroeventos deixam de usar `Math.random` no avanço (passam a usar um gerador semeado pela data). As demais operações já eram determinísticas ou passaram a ser só leitura.

Ponto de inicialização único: `src/game-core/careerSystemsInitialization.js` (`ensureCareerSystemsInitialized`), chamado por `SaveFoundationBootstrap` a cada ativação de carreira, depois do reparo da fundação. Etapas, cada uma idempotente e isolada (a falha de uma não bloqueia as outras):

1. missões (catálogo canônico);
2. clubes (lote único);
3. treinadores (catálogo por `catalog_key`);
4. Loja: semente do mercado, relíquias e catálogo ampliado (reparos agora num único `bulkUpdate`);
5. lote inicial de propostas, se a identidade estiver completa.

Numa carreira já inicializada, a ativação não grava nada (testado: save → load → ativação = 0 registros).

## 2. Causas raízes e correções

### 8F-01 — Propostas de parceiros (8D-05)

- **Causa:** `PartnerHub.jsx` chamava `ensureInitialPartnerOffers` na montagem. A função só se recusava a gerar quando havia proposta pendente/aceita, então, com todas recusadas, a reabertura gerava um lote novo no mesmo dia (candidatos em *cooldown* de 14 dias ficavam fora, mas o *pool* é grande). Sem trava, duas montagens simultâneas criavam o mesmo id e a segunda lançava `PartnerOffer já existe`. A ordem exibida mudava porque a 1ª abertura devolvia o array criado e as seguintes, a consulta `-created_date`.
- **Correção** (`partnerOffers.js`, `PartnerHub.jsx`, `Missions.jsx`, `postSeparationMarket.js`):
  - O lote inicial existe **uma vez por carreira** (se já houve lote inicial, nunca regenera).
  - Trava por perfil, gravação por `upsert` de id determinístico, e retorno sempre pela mesma consulta (ordem estável).
  - Nasce quando a identidade fica completa (escolha de estilo, depois do lado) e, por segurança, na ativação.
  - Duplas só consulta (`loadPartnerHubOffers`).
  - A renovação depois de recusar/expirar todas passa ao **calendário**. O tick diário sem dupla (`ensurePostSeparationPartnerMarket`) ganhou a âncora "lote inicial esgotado", com as **mesmas** janelas do mercado pós-separação (3 dias, depois a cada 7) e sem repetir candidato. Nenhum intervalo novo foi inventado. Para o estreante, a nova leva usa o mesmo *pool* e a mesma seleção do lote inicial: o *pool* do pós-separação (atletas do mundo por proximidade de ranking) devolvia `no-viable-offer` para quem nunca jogou.
  - A busca manual continua disponível. A negociação antecipada **não** foi implementada.

### 8F-02 — Missões (8D-06)

- **Causa:** `Missions.jsx` rodava `syncExtendedMissionCatalog` a cada abertura, uma migração legada por título com aliases de recompensa. As 3 missões de demonstração de `localSeed.js` (sem `mission_type`) viravam "semanal" **ativas** na 1ª visita e eram arquivadas na 2ª. Entre as duas visitas podiam ser sorteadas como missão periódica e pagar recompensa, então a economia dependia da navegação.
- **Correção:** a migração da tela foi **removida** (legado exclusivo de saves experimentais, autorizado pela nova diretriz). A rotina canônica `ensureTutorialMissionCatalog` (`padel.js`), executada na ativação e nos eventos de missão, passou a arquivar essas 3 missões de forma determinística (`retired_reason: legacy_demo_mission_removed_8f`). `MissionProgress` não é tocado: nada é revogado nem pago de novo. A tela só confirma o catálogo.

### 8F-03 — Conquistas (8D-07)

- **Causa:** `AchievementsPanel.jsx` chamava `syncPlayerAchievements` ao abrir, desbloqueando e **creditando moedas**. Fora o fim de partida de torneio, era o único avaliador: conquistas de treino, economia, loja etc. só eram pagas a quem abria a aba. `unlocked_date` usava a data do computador.
- **Correção:**
  - Nova etapa `achievements` no fechamento do dia (`achievementLifecycle.js`, chamada por `processGameStateDay`), com o mesmo motor e o mesmo contexto. A idempotência continua sendo a do motor: id `pa-<conquista>-<perfil>` gravado no mesmo lote das moedas e do lançamento financeiro.
  - A reconciliação única de saves antigos (sem recompensa retroativa) migrou da aba para essa etapa.
  - A aba só avalia em memória.
  - `unlocked_date` passa a ser a data da carreira.
  - Os valores das recompensas não mudaram.

### 8F-04 — Notícias (8D-08)

- **Causa:** `WorldEvents.jsx` e `WorldFeed.jsx` chamavam `ensureWorldEvents(data, 15)`, que completava 15 notícias de ambientação por dia com `Math.random`, e `ensureMacroEvents(data, 2)` ao abrir. O avanço diário já publicava notícias contextuais, a editorial e o macroevento, mas também com `Math.random`.
- **Correção:** as telas só consultam (`getRecentWorldEvents`, `getActiveMacroEvents`). O macroevento diário (12%) e a notícia editorial passam a ser **semeados pela data** (`seededRandom` em `hashUtils.js`): o mesmo dia produz o mesmo resultado. O botão explícito "gerar" foi mantido. A correção da LOCAL-8E no Jornal foi preservada. Nada foi redesenhado.

### 8F-05 — Clubes (8D-09)

- **Causa:** `Clubs.jsx` chamava `ensureWorldClubCatalog(72)`, que fazia **um `Club.create` por clube**: 71 serializações do save inteiro na 1ª abertura. Os clubes criados entravam no processamento mensal (`processAllClubsMonthly`), então a navegação alterava o futuro.
- **Correção:** um único `bulkCreate` com id estável = `world_club_key`, executado na ativação. Clubes só consulta. Nenhum sistema novo foi criado.

### 8F-06 — Treinadores (pendência da LOCAL-8E)

- **Causa:** duas fontes. O Mercado Mundial exibia a projeção mensal (`normalizeCoachMarket` + `guaranteeCoachAvailability`), enquanto Treinadores, `getCoachAvailability` e `hirePrimaryCoach` liam `market_*` **persistidos**, gravados só por "Processar mês" (e, até a 8E, por abrir o Mercado). A semente do sorteio usava o id do registro, aleatório em versões antigas. O catálogo identificava treinadores por **nome**, e há um nome repetido legítimo (duas "Elena Ruiz"): a segunda não era criada se a primeira existisse, e a ficha da segunda era aplicada às duas.
- **Correção:**
  - `src/lib/coachMarket.js` é a **fonte única**, uma função pura de (catálogo, mês), com a mesma regra que já existia (chances por *tier*, oscilação de 0,92 a 1,09, mínimos por *tier*). A semente agora é o `catalog_key`.
  - Mercado, Treinadores (`listCoachMarketForDate`) e a contratação usam essa projeção. `hirePrimaryCoach` **recalcula na data da confirmação**: se o mês vira entre a consulta e a confirmação, vale o mês vigente.
  - "Processar mês" não grava mais `market_*` em treinadores.
  - Contratos assinados guardam o salário da assinatura. A renovação continua sobre o salário do contrato.
  - O salário-base vem só do `monthly_cost` do catálogo. Linhas fora do catálogo seguem exatamente a regra da Tutorial 4.1 (`monthly_salary` legado ou recusa, nunca valor inventado).
  - Identidade do catálogo por `catalog_key`, em `coachLifecycle` e no Mercado.
  - Os valores e as regras de balanceamento não mudaram.

### 8F-07 — Relíquias da Loja (pendência da LOCAL-8E)

- **Causa:** a intenção original de `seedMarket` era liberar as 10 relíquias (`HISTORICAL_RARE_ITEMS`) com estoque limitado junto da semente do mercado. Mas (a) a criação ficava **depois** do retorno antecipado "já semeado", e toda carreira nasce com um `MarketEvent` ativo de `localSeed.js`; (b) a guarda `existingHistorical.length === 0` contava os colecionáveis "Padel Heritage" do catálogo como relíquias; (c) o estoque também era criado para esses colecionáveis; (d) estoque e datas usavam `Math.random` e o relógio real.
- **Correção:** `ensureHistoricalRelics` roda antes do retorno antecipado e reconhece só relíquias verdadeiras (sem `catalog_order`, raridade `exclusivo`). Cria as que faltam com **id estável** (`historical-relic-<ano>-<categoria>`), preço, raridade, bônus e coleção do modelo, e estoque limitado (1 a 5 unidades, determinístico) **só** para elas. As datas vêm da carreira. Disponibilidade e desbloqueio seguem as regras existentes da Loja (`exclusivo`: nível 45, top 10, reputação 85, rotação mensal). Nenhuma relíquia ou equipamento novo foi criado. Os eventos iniciais do mercado continuam como estavam (fora do escopo).

## 3. Testes antes/depois

`scripts/test-local-8f-lifecycle.mjs` roda nos dois modos, com saves em memória. No modo HEAD, a "abertura" reproduz o que cada página fazia em `b59bc07`; no modo corrigido, usa as funções reais de leitura.

| Execução | Resultado |
|---|---|
| Código do HEAD (`lifecycle-before-fix.json`) | **33 PASS e 27 FAIL** |
| Código corrigido (`lifecycle-after-fix.json`) | **60 PASS e 0 FAIL** |

Carreira nova, cada tela aberta 2× (registros e gravações do save na 1ª abertura → na 2ª):

| Tela | Antes | Depois |
|---|---|---|
| Duplas (propostas) | 4 propostas criadas, 4 gravações | **0 → 0** |
| Conquistas | +1 conquista, +1 lançamento, moedas creditadas | **0 → 0** |
| Notícias / Circuito | +2 notícias (+15 no t5) | **0 → 0** |
| Clubes | +71 clubes, **71 gravações** | **0 → 0** |
| Treinadores | +118 treinadores | **0 → 0** |
| Loja | +111 itens, 4 reparos | **0 → 0** |
| Objetivos (t5, missões de demonstração ativas) | 3 missões alteradas na 1ª **e** na 2ª abertura | **0 → 0** |

Na versão corrigida, tudo isso nasce uma única vez na ativação (carreira nova: 10 gravações, 246 ms).

Por item:

- **Propostas:**
  - Aberturas simultâneas: antes, `erro: PartnerOffer já existe`; depois, sem erro.
  - Ordem idêntica entre aberturas.
  - Recusar todas e reabrir: antes +4 propostas no mesmo dia; depois 0.
  - Janela do calendário em +3 dias: antes 0 (`never-separated`); depois 4 propostas, sem duplicar na mesma janela e sem repetir candidato.
  - A aceitação forma a dupla, e as propostas trazem idade e país.
  - Save → load → Duplas → save é idêntico.
- **Missões:** as de demonstração nunca viram "semanal" ativa; recompensas do catálogo e `MissionProgress` intactos.
- **Conquistas:**
  - A aba não credita.
  - O avanço de 1 dia desbloqueia a conquista merecida ("Nascido para Vencer") e paga uma vez, com lançamento no extrato.
  - Reabrir a aba e avançar outro dia não paga de novo.
  - `unlocked_date` é a data da carreira.
- **Notícias:** geração diária em 40 dias, duas execuções independentes: antes 0/40 dias idênticos, depois **40/40**.
- **Clubes:** inicialização do catálogo no t5: antes **71 gravações, 49,3 s**; depois **1 gravação, 0,5 s**. Ids estáveis, sem duplicatas.
- **Treinadores:**
  - Treinadores × Mercado: antes **117 de 118** divergentes; depois **0**.
  - O salário contratado é igual ao exibido.
  - As luvas debitadas são iguais às exibidas (antes 217 cobradas contra 200 exibidas).
  - Quando o mês vira entre a consulta e a confirmação, antes se contratava por 286 (valor obsoleto) e agora pelo valor do mês vigente (300).
- **Relíquias:**
  - Antes 0; depois **10**, com preço, raridade e coleção do modelo.
  - Estoque limitado só para elas (10).
  - Colecionáveis comuns intactos.
  - 10 ativações + aberturas da Loja: 0 registros alterados.
  - Inventário e saldo intactos.
- **Carreira nova de ponta a ponta, sem visitar telas:**
  - 4 propostas após escolher o estilo;
  - primeira dupla confirmada;
  - catálogos prontos (74 clubes, 118 treinadores, 125 itens, 27 missões ativas);
  - 3 dias avançados sem erro;
  - save → load → ativação = 0 registros.

### Teste integrado no navegador (revalidação para o commit)

`reports/local-8f-lifecycle-persistence/tools/integrated-new-career.mjs` roda no Chrome real, com perfil temporário isolado, contra um dev server reiniciado. Resultado: **9/9** (`integrated-new-career.json`).

| Etapa | Resultado |
|---|---|
| Carreira criada pela interface | catálogos prontos na ativação |
| Lado + estilo | 4 propostas |
| Aceite pela interface ("Analisar proposta" → "Aceitar proposta") | dupla ativa |
| Navegação pelas 9 telas | só a recompensa única da etapa 1 do tutorial, ao entrar na Home (8D-13, anterior à 8F, verificada pelo conteúdo) |
| Avançar 3 dias pela interface | OK |
| Recarregar | mesma data, 0 registros alterados |
| Nova navegação | 0 registros alterados, 0 erros de JS |

## 4. Determinismo

Ferramenta: `reports/local-8f-lifecycle-persistence/tools/determinism.mjs`, no Chrome real.

- **A:** carregar e avançar 1 dia.
- **A':** repetir A.
- **B:** carregar, abrir as 9 rotas dos 7 sistemas e avançar 1 dia.

As rotas abertas em B: `/partners?view=offers`, `/game/missions`, `/game/missions?tab=achievements`, `/world/circuit`, `/world/circuit?tab=circuit`, `/world/directory?tab=clubs`, `/career/team`, `/career/training?tab=shop` e `/world-market`.

| Cenário | Ruído A×A' | Diferença atribuível à navegação | Campos de atletas / treinadores / partidas / missões / itens |
|---|---|---|---|
| t5-com-dupla | nenhum | **nenhuma** | 0 / 0 / 0 / 0 / 0 |
| temporada 1 | `MissionProgress` (também em A×A', ruído do próprio avanço) | **nenhuma** | 0 / 0 / 0 / 0 / 0 |

Na LOCAL-8E restava como única diferença a inicialização da Loja na 1ª visita; agora ela acontece na ativação, igual em A e B. Nenhuma alteração foi feita no motor para forçar igualdade.

Auditoria por rota (`tools/route-audit.mjs`, carreira nova, t5-com-dupla e temporada 10): nas 9 rotas, **0 registros** alterados na 1ª abertura e **0 gravações** na 2ª. Na 1ª visita a algumas telas há 1 gravação de onboarding (introdução de página), legítima e já documentada na LOCAL-8D.

Observação sobre o ambiente: a primeira execução do determinismo esgotou o tempo no avanço do dia. A causa era o dev server em 5174, degradado pelas trocas de arquivos HEAD ↔ corrigido. A mesma sonda (`tools/advance-probe.mjs`) também travava com o código do HEAD nesse servidor e funcionava em cerca de 5 s num servidor novo (5199), onde as medições foram refeitas.

## 5. Persistência e desempenho

| Save | Tela | Aberturas 1ª/2ª (ms) antes → depois | Gravações antes → depois | Variação do save antes → depois |
|---|---|---|---|---|
| t1 (12,4 MB) | Duplas | 8/2 → 1/0 | 0/0 → 0/0 | +0 KB → 0 KB |
| t1 (12,4 MB) | Objetivos | 217/120 → 1/0 | 2/1 → 0/0 | +21 KB → 0 KB |
| t1 (12,4 MB) | Conquistas | 244/144 → 231/8 | 2/1 → 0/0 | +1 KB → 0 KB |
| t1 (12,4 MB) | Notícias | 120/0 → 2/0 | 1/0 → 0/0 | +8 KB → 0 KB |
| t1 (12,4 MB) | Clubes | 10419/1 → 0/0 | 71/0 → 0/0 | +43 KB → 0 KB |
| t1 (12,4 MB) | Treinadores | 427/1 → 3/1 | 2/0 → 0/0 | +159 KB → 0 KB |
| t1 (12,4 MB) | Loja | 615/2 → 0/0 | 5/0 → 0/0 | +88 KB → 0 KB |
| t5 (36,8 MB) | Duplas | 7/4 → 83/0 | 0/0 → 0/0 | +0 KB → 0 KB |
| t5 (36,8 MB) | Objetivos | 923/411 → 0/0 | 2/1 → 0/0 | +21 KB → 0 KB |
| t5 (36,8 MB) | Conquistas | 1148/604 → 1940/99 | 2/1 → 0/0 | +0 KB → 0 KB |
| t5 (36,8 MB) | Notícias | 629/0 → 12/0 | 1/0 → 0/0 | +9 KB → 0 KB |
| t5 (36,8 MB) | Clubes | 40230/2 → 0/0 | 71/0 → 0/0 | +43 KB → 0 KB |
| t5 (36,8 MB) | Treinadores | 879/1 → 2/1 | 2/0 → 0/0 | +159 KB → 0 KB |
| t5 (36,8 MB) | Loja | 3543/4 → 0/0 | 5/0 → 0/0 | +88 KB → 0 KB |
| t10 (64 MB) | Duplas | 870/41 → 622/0 | 0/0 → 0/0 | +0 KB → 0 KB |
| t10 (64 MB) | Objetivos | 1912/1452 → 0/0 | 2/1 → 0/0 | +21 KB → 0 KB |
| t10 (64 MB) | Conquistas | 2676/1657 → 4442/1130 | 2/1 → 0/0 | +1 KB → 0 KB |
| t10 (64 MB) | Notícias | 2690/0 → 179/0 | 1/0 → 0/0 | +8 KB → 0 KB |
| t10 (64 MB) | Clubes | 77318/4 → 0/0 | 71/0 → 0/0 | +43 KB → 0 KB |
| t10 (64 MB) | Treinadores | 2176/1 → 2/1 | 2/0 → 0/0 | +159 KB → 0 KB |
| t10 (64 MB) | Loja | 8762/16 → 1/0 | 5/0 → 0/0 | +88 KB → 0 KB |

Antes, o custo de inicializar cada sistema caía na 1ª visita à tela e se repetia em parte nas reaberturas (Objetivos e Conquistas regravavam também na 2ª). Depois, **todas as aberturas, em todos os saves, fazem 0 gravações e 0 bytes**. O custo foi para a ativação, que acontece uma única vez por carreira (ou uma vez num save antigo sem catálogos):

| Save | Gravações na ativação | Tempo | Variação | Serialização do save exportado |
|---|---|---|---|---|
| t1 | 8 | 2 s | +324 KB | 130 ms |
| t5 | 6 | 4,1 s | +303 KB | 370 ms |
| t10 | 6 | 17,9 s | +303 KB | 521 ms |

Numa carreira nova (cerca de 2 MB), a ativação completa leva cerca de 0,25 s. O pior caso da temporada 10 (6 serializações de 64 MB, cerca de 18 s) ocorre só na primeira ativação de um save de desenvolvimento antigo; antes, abrir só Clubes custava 71 serializações (77 s). Os reparos da Loja passaram de um `update` por item para um único `bulkUpdate`, o que reduziu a ativação da temporada 10 de 19 para 6 gravações.

O avanço do dia ganhou a etapa de conquistas: cerca de 1,7 s no t5, medido isoladamente na primeira execução, que inclui a reconciliação única; nos dias seguintes, menos.

## 6. Regressões

75 testes: 70 SSR e 5 no navegador, estes num dev server novo.

| Grupo | Resultado |
|---|---|
| LOCAL-8C (save-integrity 22, directory-readonly no navegador 35) | PASS |
| LOCAL-8D (sondas de propostas e Loja) | PASS. A sonda de propostas caiu de 4 para 2 achados: reabrir com todas recusadas agora gera **0** propostas novas |
| LOCAL-8E (Jornal 22, Mercado 41, Loja 52) | PASS |
| LOCAL-8F (ciclo de vida 60) | PASS |
| 5.32-A/A.1 (ranking 64 + 18 + 164) · 5.32-B (69 + 162) · 5.32-C/C.1 (58 + 160 + 51) | PASS |
| LOCAL-7D / 7E / 7F / 7G / 7G.1 / 7H / 7H.1 · CLOUD-7D1 · CLOUD-6N (fluxos críticos da carreira) | PASS |
| Propostas e primeira dupla (offers-v2, notificações, persistência, fluxo do jogador, pós-separação ×2, primeira dupla ×5) | PASS |
| Missões e tutorial (mission-system-v2, reward-regression, unificação, hotfix-rc1, career-systems, tutorial completo, engine, onboarding-v3, idempotência) | PASS |
| Conquistas (engine-v2, idempotência, atomicidade, saves antigos, migração, recompensa de partida final, auditoria de 180) | PASS |
| Treinadores (curadoria, descoberta, clareza, sistema v28, histórico, consistência de salário 34) | PASS |
| Loja, equipamentos, finanças, partidas históricas, torneios (registration-v2), patrocínios (scaling, reachable) | PASS |
| `sponsor-eligibility-authority-v526c` (3/7) e `premium-market-v33-4` (versão fixa) | **FAIL preexistentes**, idênticos aos da LOCAL-8E (comprovados no HEAD) |

Gates: `npm run lint` OK, `npm run build` OK, `npm run validate:architecture` OK, `git diff --check` OK.

**Testes antigos atualizados**, todos por mudança de arquitetura exigida pela fase e nunca para mascarar falha:

1. `test-coach-salary-consistency.mjs`: "salário de mercado" passa a ser o da projeção mensal que a tela Treinadores exibe (antes, o card cru do catálogo, que não é mais o que a tela mostra). As 34 asserções de igualdade (mercado = contratação = contrato = folha), a linha legada de 500 e a recusa do treinador fantasma ficaram intactas.
2. `test-global-market-v25.mjs`: a regra "mercado garante iniciantes" foi procurada no arquivo para onde foi movida (`coachMarket.js`).
3. `test-local-8e-market-readonly.mjs`: "Processar mês" continua evoluindo os atletas, mas não grava mais `market_*` em treinadores.
4. `test-partner-choice-age-v532c1.mjs`: a carreira criada pela interface completa lado e estilo (o caminho de `Missions.jsx`) antes de abrir Duplas, porque o lote não nasce mais na abertura. As asserções de idade e país foram mantidas.

Achado no caminho: o catálogo de treinadores identificava por nome e o catálogo tem nome repetido legítimo ("Elena Ruiz" ×2). Isso foi corrigido em `coachLifecycle` e no Mercado; sem a correção, o critério "não criar treinadores duplicados / perder treinadores" não podia ser garantido.

Os relatórios versionados regenerados pelos testes foram restaurados com `git checkout`:

- `local-8c .../save-integrity.json`
- `local-8d .../partner-offers-probe.json`
- `local-8d .../shop-catalog-probe.json`
- `progression-clean-526c/sponsors-reachability.json`

As saídas novas das sondas da 8D foram copiadas como evidência da 8F.

## 7. Compatibilidade e versionamento dos saves

- **Nenhuma incompatibilidade intencional**: o formato do save **não mudou** e `save_schema_version` continua em 21. Todas as correções são aditivas e idempotentes; não foi necessário invalidar nenhum save.
- **Saves antigos** (testados nas temporadas 1, 5 e 10): na próxima ativação recebem os catálogos que faltam, as relíquias e, se aplicável, o lote inicial de propostas. É uma escrita única: na temporada 10, 19 gravações em cerca de 33 s, uma vez. As 3 missões de demonstração são arquivadas. Na primeira etapa `achievements` do avanço, a reconciliação única é feita sem pagar retroativamente. Os `market_*` persistidos em treinadores do catálogo são ignorados.
- **Dados já alterados por versões anteriores** (cópias renomeadas da Loja, partidas reordenadas, missões convertidas em "semanal") **não** são limpos. Pela nova diretriz, uma carreira nova é o caminho recomendado para testes, e nenhuma migração complexa foi criada para preservá-los.
- **Requisito de pré-lançamento** (registrado): quando houver jogadores externos, a política se inverte. Saves reais exigirão versionamento, detecção de incompatibilidade com mensagem clara, migração testada, *backup* e reversão.

## 8. Pendências e riscos residuais

1. **Duplas antes da identidade completa:** quem abre Duplas antes de escolher lado e estilo vê "Nenhuma proposta pendente". A tela agora orienta: *"As primeiras propostas chegam quando você define lado e estilo de jogo em Objetivos."* A busca manual continua disponível. É mudança de comportamento intencional; antes, o lote era calculado com o perfil incompleto.
2. **Ritmo da renovação de propostas:** reaproveita as janelas do pós-separação (3 dias, depois a cada 7). Se o produto quiser um ritmo próprio para estreantes, isso é decisão de *game design*.
3. **Mercado de treinadores mais vivo na tela Treinadores:** antes, quem nunca processava o mês via todos os treinadores disponíveis pelo preço de catálogo. Agora vê a rotação mensal do mercado, já desenhada e já exibida no Mercado Mundial: mínimos garantidos por *tier* e salário com oscilação de 0,92 a 1,09. As regras e os valores são os de antes; muda quem passa a obedecê-los.
4. **Conquistas pagas no fim do dia:** uma conquista merecida durante o dia (compra, treino) é registrada e paga no próximo avanço, e não mais na hora em que se abre a aba. O fim de partida de torneio continua pagando na hora.
5. **Notícias de ambientação:** sem a cota de 15 por dia aberta pela tela, o feed passa a ter as notícias do avanço diário (contextuais, editorial a cada N dias, macroeventos de 12%) e as do botão "gerar". O volume ficou menor e mais coerente com os fatos.
6. **Eventos iniciais da Loja** continuam bloqueados pelo `MarketEvent` de `localSeed` (fora do escopo; ver §10).
7. **Ativação de saves antigos grandes:** 6 gravações (cerca de 18 s na temporada 10), uma única vez. Carreira nova: cerca de 0,25 s.
8. **Ambiente:** o dev server em `127.0.0.1:5174` ficou com o grafo de módulos degradado pelas trocas HEAD ↔ corrigido usadas nas medições; até com o código do HEAD, o avanço de dia não conclui nele. Recomendo reiniciá-lo. As medições foram refeitas num servidor novo (5199), iniciado e encerrado por esta fase.

## 9. Arquivos

**Produção (novos):**

- `src/game-core/careerSystemsInitialization.js`
- `src/game-core/achievementLifecycle.js`
- `src/lib/coachMarket.js`

**Produção (alterados):**

| Item | Arquivos |
|---|---|
| Ativação | `src/components/system/SaveFoundationBootstrap.jsx` |
| Propostas | `src/lib/partnerOffers.js`, `src/pages/PartnerHub.jsx`, `src/pages/Missions.jsx`, `src/game-core/postSeparationMarket.js` |
| Missões | `src/pages/Missions.jsx`, `src/lib/padel.js` |
| Conquistas | `src/components/achievements/AchievementsPanel.jsx`, `src/game-core/gameStateLifecycle.js`, `src/lib/achievementEngine.js` |
| Notícias | `src/pages/WorldEvents.jsx`, `src/components/world/WorldFeed.jsx`, `src/lib/world.js`, `src/lib/worldEvents.js`, `src/lib/livingWorldEngine.js`, `src/lib/hashUtils.js` |
| Clubes | `src/pages/Clubs.jsx`, `src/lib/sportsEconomyV26.js` |
| Treinadores | `src/game-core/coachLifecycle.js`, `src/game-core/globalMarketLifecycle.js`, `src/pages/Coaches.jsx` |
| Relíquias e Loja | `src/lib/marketEngine.js`, `src/lib/storeCatalog.js` (reparos em lote), `src/pages/Shop.jsx` |

**Testes:**

- Novo: `scripts/test-local-8f-lifecycle.mjs` (60 verificações; modos HEAD e corrigido).
- Atualizados por mudança intencional de arquitetura (§6): `scripts/test-coach-salary-consistency.mjs`, `scripts/test-global-market-v25.mjs`, `scripts/test-local-8e-market-readonly.mjs`.

**Ferramentas e evidências:** `reports/local-8f-lifecycle-persistence/`

- `tools/`: `determinism.mjs`, `route-audit.mjs`, `save-cost.mjs`, `advance-probe.mjs`
- `determinism/`, `dynamic/`, `lifecycle-*.json`, `save-cost-*.json`
- saídas das sondas da LOCAL-8D depois da correção

## 10. Próximas fases recomendadas

1. **LOCAL-8G (sugestão):** P3 restantes da LOCAL-8D:
   - jornalistas da Imprensa e Enciclopédia criados na 1ª abertura (8D-11 e 8D-12, que podem entrar no inicializador da ativação);
   - `ensureFutureTournaments` antecipado por Torneios (8D-04);
   - `updated_date` de entrevistas tocado a cada abertura (8D-13).
2. **Eventos iniciais do mercado da Loja:** o retorno antecipado de `seedMarket` ainda impede os 5 eventos iniciais (incluindo "Relíquias Históricas Liberadas"). Isso é decisão de produto.
3. **Carreira nova de ponta a ponta no navegador** (criação → tutorial → primeira partida oficial) sobre o código consolidado, antes de abrir para testadores externos.
4. **Pré-lançamento:** política de versionamento e migração de saves reais (§7).
