# Auditoria — Atletas reais vs. bots no ecossistema do jogo

**Escopo:** auditoria apenas. Nenhuma lógica de jogo foi alterada nesta rodada — apenas leitura de código, execução do harness permanente (`scripts/audit-real-athletes-simulation.mjs`) e geração deste relatório.

**Achado-guia (leia isto primeiro):** não existe *um* sistema "atletas reais" no jogo — existem **três universos de dados desconectados** que nunca se comunicam entre si, mais uma lacuna estrutural específica que impede os 24 atletas reais do pool de ranking de formarem dupla (e portanto de competirem) na simulação de fundo do World Tour **logo no início de uma carreira**. O sintoma relatado ("torneios vencidos por duplas de bots anônimos enquanto Coello/Tapia estão só 'no ranking'") foi **reproduzido e quantificado** pelo harness da Fase 2, em escala de produção:

- **Ano 1 de uma carreira nova (o momento em que o jogador forma sua primeira impressão): 20 dos 24 atletas reais não entram em nenhuma chave, e 29 de 30 torneios são vencidos por duplas 100% bots.**
- **Ao longo de 5 anos simulados, o quadro melhora sozinho (por acidente, não por design)** — o sorteio aleatório de parcerias eventualmente pareia todos os 24 reais pelo menos uma vez, e a habilidade deles produz até uma vantagem desproporcional (47,5% dos títulos com 2,4% da população). Isso não é uma correção do jogo — é só o efeito estatístico de esperar tempo suficiente pelo mesmo sorteio aleatório que falha no começo.
- **Bug independente, confirmado na mesma bateria:** um erro de nome de campo (`rank` vs. `ranking`) faz a hierarquia de tiers do calendário (Silver→Crown) não filtrar nada na simulação de fundo — um Crown (o evento "máximo" do jogo) sorteia do mesmo pool indiferenciado que um Silver de entrada.

---

## Os três universos desconectados

| Universo | Onde vive | Quantos | Usado para |
|---|---|---|---|
| **Pool de ranking mundial** | `src/data/worldSeed2025.json` → entidade `AthleteProfile` | 24 atletas, 12 duplas | Página Ranking (Circuito/Race/Duplas), simulação de fundo do World Tour (`WorldTourLifecycle.js`), notícias de resultado |
| **Catálogo de adversários do jogador** | `src/players/realAthletes.js` (10 nomes) + `src/players/athleteGenerator.js` (240 fictícios) → `src/lib/bots.js` (`BOTS_BY_DIFFICULTY`) | 10 "reais" + 240 fictícios = 250 | Adversários do jogador em treino/torneio (`generateTournamentOpponent`, `career.js`), mercado de parceiros do jogador (`getAvailablePartners`) |
| **Camada de nomes (relações/comissão técnica)** | `src/lib/relationships.js` (rivalidades, por string de nome) + `src/lib/coaches.js` (nomes gerados à parte) | N/A | Rivalidades, imprensa das partidas do jogador, comissão técnica |

Esses três universos usam **ids completamente diferentes** para a mesma pessoa real. Exemplo — Arturo Coello:

- Pool de ranking: `athlete_arturo_coello`, `overall_rating: 96`, `world_ranking_points: 13000` (congelado desde a criação da carreira).
- Catálogo de adversários: `fip-2026:arturo-coello`, `overall: 97`, sem nenhum estado persistente de carreira (é um template estático, recriado do zero a cada consulta).

Vencer o "Coello" do catálogo (numa partida do jogador) não move um único ponto do "Coello" do ranking. Os dois nunca se encontram no código.

---

## FASE 0 — Inventário do elenco

### 0.1 — Onde vivem os atletas reais e quantos são

- **`src/data/worldSeed2025.json`** — JSON estático, `schema_version: "3.4.4"`, `snapshot_date: "2025-12-31"`. Contém **24 atletas** (`athletes[]`) e **12 duplas** (`teams[]`), todos com `seed_source: "final_2025"`. Consumido por **`src/lib/saveFoundation.js`** (`ensureWorldSeed2025`), que faz `upsertBy('AthleteProfile', ..., athlete.bot_id, athlete)` para cada um — ou seja, entram no jogo como entidades `AthleteProfile`/`TeamRanking` comuns, indistinguíveis estruturalmente de qualquer bot.
- **`src/players/realAthletes.js`** — um **segundo** conjunto, **10 atletas** (não 24), com nomes/ids/overalls ligeiramente diferentes do primeiro (ex.: "Leo Augsburger" no seed vs. "Leandro Augsburger" aqui; "Mike Yanguas" vs. "Miguel Yanguas"; overall de Coello é 96 no seed e 97 aqui). Anotado como fonte `"FIP ranking, 20 July 2026"` — uma data de referência **posterior** e inconsistente com o snapshot do primeiro arquivo (`2025-12-31`). Consumido por **`src/players/athleteCatalog.js`** (`buildAthleteCatalog`), que o mistura com 240 atletas fictícios (`generateFictionalAthletes`) para formar o catálogo de adversários/parceiros do jogador (`src/lib/bots.js`).

**Nenhum dos dois arquivos referencia o outro.** Não há função de sincronização entre eles.

### 0.2 — Existe uma flag que distinga real de gerado?

**Não há uma flag funcional.** O único indício é `seed_source: "final_2025"` (presente nos 24 atletas + 12 duplas do `worldSeed2025.json`) e o padrão de `bot_id` (`athlete_arturo_coello` para reais vs. `ranking-bot-0025` para procedurais, gerado em `src/lib/rankingPopulation.js:52`). **Confirmado por grep em todo `src/`: `seed_source`/`final_2025` nunca é lido por nenhum consumidor** — só é escrito no JSON e nunca verificado por nenhuma função de elegibilidade, seleção de chave, ou UI. É um campo morto. **Isso já é o achado pedido no item 2: não existe, na prática, nenhuma distinção operacional entre real e bot no pool de ranking.**

### 0.3 — Distribuição de OVR: reais vs. os ~1000 bots

**Reais (`worldSeed2025.json`, 24 atletas):** OVR de **83 a 96** (Coello e Tapia empatados no topo com 96; Gonzalo Alfonso na base com 83). Mediana ≈ 86.

**Bots procedurais (`src/lib/rankingPopulation.js`, `buildSupplementalRankingPopulation`):** gerados para completar até `WORLD_RANKING_TARGET = 1000` atletas, a partir do rank 25 (logo depois dos 24 reais). A fórmula (linha ~63) é:

```js
overall = Math.max(35, Math.min(96, Math.round(96 - Math.pow(absoluteRank / 1000, 0.72) * 57)))
```

Isso é **totalmente desacoplado** da fórmula de pontos (`pointsForRank`, calibrada para não ultrapassar os reais). Calculando a fórmula de OVR para os 976 bots procedurais (ranks 25–1000):

| Faixa de OVR | Nº de bots procedurais |
|---|---|
| OVR ≥ 90 | **25** |
| OVR ≥ 85 | **84** |
| OVR ≥ 80 | **154** |

Ou seja: o **bot ranqueado #25** (imediatamente atrás do 24º e último atleta real) nasce com **OVR 92** — acima de Stupaczuk (91) e Lebrón (91), dois dos 24 reais, e comparável a Galán (94)/Chingotto (93). Isso confirma exatamente a suspeita do item 3: **há bots com OVR competitivo com o topo dos reais**, porque a curva de habilidade (OVR) e a curva de prestígio (pontos) são independentes uma da outra — só a segunda foi calibrada para nunca deixar um bot "ultrapassar" um real.

`circuit_category` (linha ~73 do mesmo arquivo) classifica `absoluteRank <= 100` como `'Premier'` — ou seja, o **tier "Premier" do ranking tem 24 reais + 76 bots = 100 entradas**, com sobreposição real de habilidade entre eles.

### 0.4 — Como os bots são gerados; risco de sorteio de atributos

Dois geradores procedurais totalmente separados, ambos determinísticos (hash de seed, não `Math.random()` — reprodutíveis, mas arbitrários):

- **Pool de ranking** (`rankingPopulation.js`): nome/país/idade/estilo sorteados por hash a partir do rank; ver 0.3 para OVR.
- **Catálogo de adversários do jogador** (`src/players/athleteGenerator.js`, `generateFictionalAthletes`): 240 atletas, 6 "tiers" de 40 cada, OVR de `10+tier*14` a `23+tier*14` — o tier mais alto (últimos 40) vai de **OVR 80 a 93**, quase empatando com Coello/Tapia (96/97).

**Sim, existe risco real de um bot "empatar" ou superar tecnicamente um real** — não por sorte pontual de uma partida, mas porque a **distribuição de origem** dos dois grupos se sobrepõe deliberadamente na faixa alta (isso é necessário para o jogo ter graduação de dificuldade, mas ninguém protege explicitamente o topo para os reais).

### 0.5 — Duplas fixas históricas ou pareamento aleatório?

**Nem uma coisa nem outra, hoje: soltos, sem nunca serem pareados.** O `worldSeed2025.json` registra as 12 duplas históricas (`team_coello_tapia_2025`, etc.) apenas como linhas estáticas da entidade `TeamRanking` — **não** escreve nada no campo que o resto do jogo usa para saber quem está de dupla com quem (`AthleteProfile.ai_partner_id`). Esse campo é usado por:

- `src/game-core/aiPartnershipLifecycle.js` (`aiPartnerId()`, `availableAthletes()`, `ensureCanonicalPartnerships()`) — decide quem é "livre" para ser pareado no mercado de duplas dos bots.
- `src/game-core/circuitLifecycle.js` (`updateTeamRankings`, linha 74) — decide quais duplas aparecem/atualizam no ranking de Duplas.
- `src/gameplay/worldTour/WorldTourLifecycle.js` (`buildCanonicalPairs`) — decide quem entra como par nos torneios simulados de fundo.

Como nenhum atleta real nasce com `ai_partner_id` preenchido, **todos os 24 são tratados como "livres" desde o dia 1**, exatamente como qualquer um dos ~1000 bots — e só podem ser pareados pelo mesmo sorteio mensal aleatório (`formNewPartnerships`, até 8 pares novos por mês, escolhidos por hash entre TODOS os agentes livres). Ver Fase 2 para o efeito quantificado disso.

**Achado extra, fora do escopo perguntado mas descoberto no caminho:** mesmo quando dois reais **acabam** sendo pareados por esse sorteio (acontece, ver Fase 2), o par gerado ganha uma `team_key` **diferente** da linha histórica do seed. `updateTeamRankings` monta a chave como `[athlete.id, partnerId].sort().join('_')` → para Coello/Tapia isso dá `athlete_agustin_tapia_athlete_arturo_coello`, **nunca** `team_coello_tapia_2025` (a chave do seed). Resultado: a linha histórica fica **congelada para sempre** (ninguém nunca mais escreve nela) enquanto uma segunda linha "Coello & Tapia" com pontos zerados nasce e cresce separadamente — duas entradas para a mesma dupla, uma delas eternamente morta.

---

## FASE 1 — Auditoria de elegibilidade e inscrição em torneios

### 1.1 — Quem entra na chave? Duas pipelines totalmente diferentes

**(A) A chave do PRÓPRIO jogador** (torneio que ele disputa): `src/lib/tournamentDraw.js` (`createDrawnRun`) chama `generateTournamentOpponent(tournament, profile, roundIdx, usedIds, teamRank, stage)` — **em `src/lib/career.js:375`** — que sorteia 2 membros do catálogo **`BOTS_BY_DIFFICULTY[diffId]`** (o catálogo do item 0.1-B: 10 reais + 240 fictícios, filtrado por faixa de dificuldade), via hash determinístico por `(torneio, jogador, rodada, tier)`. **Não consulta a entidade `AthleteProfile` em nenhum momento.**

**(B) A chave dos torneios que o jogador NÃO disputa** (simulação de fundo): `src/gameplay/worldTour/WorldTourLifecycle.js` (`resolveCompletedWorldTourEvents`) monta os pares a partir de **`Partnership`** ativas (`buildCanonicalPairs`), cada par "escolhe" entrar num torneio da semana via `chooseTournament` (`src/gameplay/worldTour/TournamentSelectionAI.js`, pontuação real por valor esperado/prestígio/fadiga — não é sorteio puro), e o campo final é os `drawSize` pares com melhor `pairScore` (habilidade + entrosamento + ruído determinístico).

### 1.2 — Existe um filtro que EXCLUA atletas reais?

**Não existe um filtro explícito** ("se for real, pule"). O que existe é uma **omissão estrutural**: a pipeline (B) só considera atletas com `Partnership` ativa, e nada no bootstrap do save popula essa relação para os 24 reais (ver 0.5). O efeito prático é indistinguível de uma exclusão, mas a causa é uma lacuna de inicialização, não uma regra.

### 1.3 — Atletas reais têm calendário/agenda própria?

Não, e a pergunta não se aplica à pipeline (B) do jeito que foi formulada: a decisão de "jogar ou descansar" é por **par** (`chooseTournament`), não por atleta individual — mas como os reais nunca formam par, nunca chegam a essa decisão. Não existe um conceito de "agenda pessoal" separado disso.

### 1.4 — Torneios que o jogador não disputa: simulados de fato ou sorteados?

**Simulados de fato**, com uma pontuação real (`pairScore` = habilidade média do par × 1.8 + forma × 0.25 + energia × 0.12 + entrosamento × 0.08 + ruído hash) — não é um `Math.random()` bruto. O campeão é o par com maior `pairScore` entre os `drawSize` (até 32) pares que entraram naquela semana. **Isso está correto e funcionando como projetado** — o problema não está na simulação em si, está em quem chega a participar dela.

### 1.5 — Gating por tier: bug ou design?

**Existe, e é design correto — mas só na pipeline (A)** (torneio do próprio jogador): `TIER_DIFFICULTY_PATHS` em `src/lib/career.js:331` mapeia cada tier de torneio a um caminho de dificuldade por rodada; só os tiers **Elite** e **Crown** (os dois de topo) alcançam a dificuldade `'lenda'` (onde os 10 "reais" do catálogo vivem), e só nas rodadas finais (semis/final). **Legacy Silver realmente nunca coloca Coello na chave do jogador — isso é o design pretendido, confirmado em `src/gameplay/worldTour/EntryManager.js:56` (`"Legacy Silver aberto a atletas sem ranking"`).**

Existe também um campo `is_development_tournament` (`circuitCatalog.js:235`, `true` para Silver/Gold/Platinum) que parece capturar a mesma intenção de design — mas **nunca é lido em lugar nenhum do código**. É um marcador morto, redundante com a lógica que já funciona em `EntryManager.js`.

**Classificação:** o gating por tier na pipeline do jogador é **funcionando como pretendido**. A ausência completa de reais na pipeline de fundo (B) é **bug** (lacuna de inicialização), não uma consequência do gating por tier.

---

## FASE 2 — Harness de simulação (evidência quantitativa)

**Harness permanente:** `scripts/audit-real-athletes-simulation.mjs` (novo, reexecutável a qualquer momento — `npm run audit:real-athletes-simulation`). Roda a pipeline de PRODUÇÃO real (mesmo `resolveCompletedWorldTourEvents`, `processAiPartnershipMarket`, `buildSeasonTournaments` usados pelo jogo), sem reimplementar nenhuma regra, por N temporadas, sem nenhuma ação de jogador.

### Nota de metodologia (leia antes dos números)

A camada de persistência da carreira (`ActiveCareerAdapter.mutateActiveCareer`) clona e regrava o save inteiro a cada escrita de entidade — em produção isso é imperceptível (uma escrita por ação do jogador), mas comprimir 5 anos de simulação de mundo numa única execução expõe esse custo: **uma temporada em escala de produção (1000 atletas, 500 duplas) leva vários minutos**. Para viabilizar 5 temporadas em tempo hábil, testei em **duas escalas**, e a diferença entre elas acabou sendo, ela própria, um achado:

| Rodada | População procedural | Duração simulada | Onde está salva |
|---|---|---|---|
| **A — escala reduzida** | 220 bots (mesma fórmula de produção, só um corte menor da mesma curva por rank) | 5 temporadas | `summary.reduced-sample-5-seasons.json` |
| **B — escala de produção, 1 temporada** | 970 bots (igual ao jogo real) | 1 temporada | `summary.full-scale-1-season.json` |
| **C — escala de produção, 5 temporadas** | 970 bots (igual ao jogo real) | 5 temporadas | `summary.json` |

### Resultado B — escala de produção (970 bots), 1 temporada — **reproduz o sintoma relatado**

```
Torneios resolvidos (mundo, sem o jogador): 30
Classificação dos campeões: 100%_bots: 29 · 100%_reais: 1   (96,7% dos títulos para bots)
Média de torneios disputados — reais: 0.58 · bots: 20.15
Atletas reais que NUNCA apareceram em nenhuma chave: 20/24
Coello/Tapia juntos: 0% das amostras mensais (11 amostras)
Galán/Chingotto juntos: 0% das amostras mensais
```

**Isto é a reprodução direta e quantificada do bug relatado.** Em população de produção, um atleta real tem, por mês, ~8 vagas de par novo disputadas entre ~994 agentes livres — a chance de qualquer real específico ser sorteado em um ano inteiro é da ordem de **9%**, e a chance de DOIS reais específicos (ex. Coello e Tapia) serem sorteados no mesmo mês E escolherem um ao outro como melhor compatibilidade é próxima de zero. Por isso 20 de 24 nunca jogam, e por isso Coello/Tapia nunca formam a dupla histórica.

### Resultado A — escala reduzida (220 bots), 5 temporadas — mostra o que acontece quando um real É pareado

```
Torneios resolvidos: 158 · Classificação: 100%_reais: 105 (66%) · 100%_bots: 53 (34%)
Média de torneios disputados — reais: 37.54 · bots: 34.57
Atletas reais que NUNCA apareceram em nenhuma chave: 0/24
Coello/Tapia juntos: 80% das amostras mensais (55 amostras)
Galán/Chingotto juntos: 80% das amostras mensais
```

Isolando só o ano 1 (antes da persistência de dupla "acumular vantagem"): **20 bots / 11 reais campeões (35% reais)** — já mais parecido com o resultado B, e convergindo para o cenário B conforme a população cresce.

**Por que os dois resultados parecem contraditórios (e não são):** com menos bots concorrendo pelas mesmas ~8 vagas mensais, um real tem uma chance MUITO maior de ser sorteado logo cedo — e, uma vez pareado, a habilidade real (Coello/Tapia somam 192 de OVR combinado, acima de qualquer par de bots possível nessa amostra) faz o par dominar e se manter estável (o sistema só dissolve pares após ≥120 dias e mediante `chemistry`/resultados ruins — um par forte tende a persistir). Em escala de produção, a mesma mecânica de sorteio existe, mas a proporção de ~40 bots para cada 1 real dilui a chance de um real sequer ENTRAR no sorteio a ponto de praticamente zerá-la. **Ou seja: a habilidade dos reais nunca foi o problema — o acesso deles ao sorteio de parceria é que desaba com a escala.** Isso é consistente e reforça o mesmo diagnóstico (lacuna em `ai_partner_id`), só que visto de dois pontos da curva.

### Resultado C — escala de produção (970 bots), 5 temporadas — o quadro completo

```
Torneios resolvidos: 158 · Classificação: 100%_bots: 82 (51,9%) · 100%_reais: 75 (47,5%) · mista: 1
Média de torneios disputados — reais: 31.5 · bots: 23.1
Atletas reais que NUNCA apareceram em nenhuma chave: 0/24
Coello/Tapia juntos: 16,4% das amostras mensais (55 amostras)
Galán/Chingotto juntos: 92,7% das amostras mensais
Top 20 por temporada — reais: 14/2026, 14/2027, 14/2028, 12/2029, 12/2030
```

**Este resultado, lido ao lado do resultado B (1 temporada), revela o achado mais importante da Fase 2: o bug é de "partida fria" (cold start), não de exclusão permanente.** No primeiro ano de uma carreira nova — exatamente quando um jogador forma sua primeira impressão do jogo — o sorteio mensal de parcerias (Fase 0.5) ainda não teve tempo de ciclar pelos ~994 agentes livres o suficiente para incluir os 24 reais: **20 de 24 nunca jogam no ano 1**. Ao longo de 5 anos (60 meses de sorteio), o mesmo mecanismo aleatório eventualmente pareia todos os 24 pelo menos uma vez — e, uma vez pareados, a habilidade real deles produz um desempenho até desproporcional (47,5% dos títulos com apenas 2,4% da população). **O sintoma relatado é mais grave exatamente no início de uma carreira — que é quando o jogador mais presta atenção ao ranking — e se dilui (sem nunca ser corrigido de propósito) conforme o tempo de jogo passa.**

Um detalhe adicional: Galán/Chingotto ficaram pareados em **92,7%** das amostras (a dupla mais estável do teste, uma vez formada), enquanto Coello/Tapia só em **16,4%** — a diferença não vem de nenhuma regra sobre "quem é mais lendário", só do resultado do algoritmo de compatibilidade (`compatibility()`, baseado em gap de ranking + estilo tático + ambição) aplicado ao sorteio hash daquele mês. **Não há nada no código que reconheça essas duplas como historicamente/narrativamente especiais — o que se vê de "fidelidade" de uma dupla é acidente estatístico, não intenção.**

### Achado adicional confirmado na Fase 2: a hierarquia de tiers não filtra nada na simulação de fundo

A quebra por tier do resultado C mostra uma mistura de reais/bots **quase idêntica em todos os 6 tiers** — inclusive Crown, o tier "máximo" do jogo:

| Tier | 100% bots | 100% reais | mista |
|---|---|---|---|
| Silver (entrada) | 19 | 16 | — |
| Gold | 15 | 15 | — |
| Platinum | 15 | 14 | — |
| Masters | 12 | 12 | 1 |
| Elite | 10 | 10 | — |
| **Crown** (o mais prestigiado) | **11** | **8** | — |

Isso não deveria acontecer: `src/gameplay/worldTour/EntryManager.js` (`evaluateTournamentEntry`) já implementa um sistema de elegibilidade por ranking mínimo bem desenhado (`min_ranking` por tier: Platinum 450, Masters 220, Elite 120, Crown 64 — ver Fase 0). **A causa raiz é um erro de nome de campo:** `WorldTourLifecycle.js:77` (`normalizeAthlete`) grava a posição do atleta no campo `ranking`, mas `EntryManager.js:44` lê `athlete.rank || athlete.teamRank || 0` — **um campo que nunca existe** nesse objeto. Resultado: `rank` é sempre `0` para toda dupla avaliada por `chooseTournament`, `hasRanking` é sempre `false`, e a checagem de elegibilidade (`EntryManager.js:57`) só aprova tiers com `minRanking === 0` (Silver e Gold) — **toda dupla é automaticamente INELEGÍVEL para Platinum, Masters, Elite e Crown**, não importa o quão bem ranqueada realmente seja.

Como `assignments` (o resultado de `chooseTournament`) fica sempre vazio para esses 4 tiers, `resolveCompletedWorldTourEvents` cai sempre no caminho de preenchimento de reserva (`entrants.length < 2`, linha ~172), que **ignora elegibilidade por completo** e simplesmente pega as 2 duplas livres com melhor `pairScore` daquela semana — daí a mistura idêntica entre Crown e Silver. **A hierarquia de prestígio do calendário (`TOURNAMENT_TIER_CONFIG`) é, na prática, decorativa para os torneios que o jogador não disputa.**

### Amostragem do catálogo de adversários do JOGADOR (pool separado, não depende de `ai_partner_id`)

Composição real dos 6 níveis de dificuldade (`BOTS_BY_DIFFICULTY`, `src/lib/bots.js`):

| Dificuldade | Total | Reais | Fictícios |
|---|---|---|---|
| Iniciante | 46 | 0 | 46 |
| Amador | 39 | 0 | 39 |
| Competitivo | 42 | 0 | 42 |
| Avançado | 46 | 0 | 46 |
| Elite | 38 | 0 | 38 |
| **Lenda** | **39** | **10** | **29** |

Só na dificuldade **Lenda** (reservada às rodadas finais de Elite/Crown, ver 1.5) um real pode aparecer — e mesmo lá, é só **25,6%** do pool. Amostragem empírica de 500 sorteios reais de `generateTournamentOpponent` na final de um torneio Crown: **232/500 (46,4%) tiveram pelo menos 1 nome real entre os 2 adversários** (valor teórico calculado independentemente: 45,2% — a proximidade valida a implementação). Ou seja: mesmo na final do maior torneio do jogo, **mais da metade das vezes o jogador enfrenta dois adversários totalmente fictícios**, e a chance de enfrentar DOIS reais ao mesmo tempo é bem menor ainda.

---

## FASE 3 — Auditoria dos sistemas de relação com atletas reais

### 3.1 — Mercado de parceiros / propostas de dupla

**Funciona, mas usa o catálogo errado.** `src/pages/PartnerHub.jsx` chama `getAvailablePartners(profile)` (`src/lib/career.js:308`), que empilha `BOTS_BY_DIFFICULTY` até o tier desbloqueado pelo nível do jogador — o **mesmo catálogo de 10 "reais" + 240 fictícios** usado nos adversários de partida, não o pool de ranking. **Sim, o jogador pode receber proposta de "Coello" ou propor a ele** (uma vez alto nível o suficiente para desbloquear a dificuldade Lenda) — mas esse "Coello" é o do catálogo (`fip-2026:arturo-coello`), sem histórico de carreira persistente, e formar dupla com ele **não afeta em nada** o "Coello" do ranking mundial. Não há barreira explícita de ranking/reputação além do desbloqueio por nível de dificuldade.

### 3.2 — Rivalidades

`src/lib/relationships.js` (`processMatchRelationships`) cria/atualiza rivalidade **por string de nome do adversário**, sem checar origem — qualquer nome que aparece como oponente do jogador (incluindo um dos 10 "reais" do catálogo) pode virar rival mecanicamente do mesmo jeito que um bot fictício. **Não há tratamento especial nem exclusão** — mas, de novo, essa rivalidade vive numa camada (registro por nome) desconectada do pool de ranking; render uma rivalidade contra "Coello" aqui não interage com o "Coello" do ranking.

### 3.3 — Notícias/comunidade

Duas fontes, comportamento diferente:
- Resultados do **catálogo do jogador** (torneio/treino pessoal): sim, aparecem na imprensa (`PressArticle`, `Post`) via `src/game-core/tournamentLifecycle.js`, citando nomes reais do catálogo quando aplicável.
- Resultados do **pool de ranking** (simulação de fundo): `resolveCompletedWorldTourEvents` cria `WorldEvent` de resultado citando o campeão real (`champion.name`) — **funcionaria corretamente para reais SE eles algum dia vencessem** algo, mas como a Fase 2 mostrou que isso é raríssimo em escala de produção, a notícia praticamente nunca menciona um real.
- Marcos de ranking (`circuitLifecycle.js`, "Fulano é o novo número 1") dependem de `ranking_position` mudar — como a posição dos reais está congelada (ver 3.5), esse gatilho nunca dispara para eles.

### 3.4 — Contratos e comissão técnica

**Lacuna confirmada: nenhum real (de nenhum dos dois universos) pode virar treinador.** `src/lib/coaches.js` gera nomes de treinadores com seu próprio gerador (`GENERATED_FIRST_NAMES`/`GENERATED_LAST_NAMES`), totalmente desconectado de `AthleteProfile` ou do catálogo de atletas. Não há nenhuma ponte de "atleta aposentado vira comissão técnica".

### 3.5 — Aposentadoria/progressão etária

**Achado mais severo que a hipótese original do usuário.** A pergunta presumia "os reais envelhecem e saem, substituídos por bots" — a realidade é **pior**: os 24 reais **nunca envelhecem, nunca se aposentam, e ficam ali para sempre**. `athleteAgeAt` (`src/game-core/livingCircuitRules.js:34`) só calcula idade dinamicamente se o atleta tiver `birth_date`/`date_of_birth` — **nenhum atleta do pool de ranking (real ou bot procedural) tem esse campo**; o fallback é `Math.max(16, Math.round(Number(athlete.age) || 24))`, ou seja, a idade **estática do seed, para sempre**. Nenhum código em todo `src/` incrementa `AthleteProfile.age`. `isAthleteRetired` só olha `retired`/`career_status`/`market_status` — todos setados como "ativo" no seed e nunca reavaliados para essas entidades. **Uma carreira de qualquer duração termina inteiramente entre bots não porque os reais se aposentaram, mas porque eles nunca chegaram a competir para começo de conversa — e, se algum dia chegassem, ficariam competindo eternamente aos 23 anos.**

---

## Classificação consolidada

| # | Achado | Classificação |
|---|---|---|
| 1 | 3 universos de "atletas reais" desconectados (ranking / catálogo do jogador / nomes de relações) | **Lacuna de design** (arquitetural, provavelmente não intencional na forma atual) |
| 2 | `seed_source`/`bot_id` nunca usados como flag real-vs-bot | **Lacuna de design** |
| 3 | Bots procedurais com OVR sobreposto ao topo dos reais (25 bots ≥ OVR 90) | **Lacuna de design** (curva de OVR desacoplada da curva de pontos) |
| 4 | Reais nunca recebem `ai_partner_id` do seed → nunca entram em `Partnership` → nunca entram na simulação de fundo do World Tour | **Bug** (causa raiz confirmada e quantificada) |
| 5 | Duplas históricas do seed (`team_coello_tapia_2025`) ficam congeladas mesmo se a dupla se formar de novo por sorteio, sob uma `team_key` diferente | **Bug** |
| 6 | Torneios de fundo (jogador não participa) são simulados por pontuação real, não sorteio puro | **Funcionando como pretendido** |
| 7 | Gating por tier no torneio do JOGADOR (reais só em Elite/Crown, rodadas finais) | **Funcionando como pretendido** |
| 8 | `is_development_tournament` nunca lido | **Lacuna de design** (código morto, redundante) |
| 9 | Catálogo de adversários do jogador dilui os 10 reais entre 240 fictícios mesmo na dificuldade máxima (25,6% do pool "Lenda") | **Lacuna de design** |
| 10 | Mercado de parceiros do jogador alcança os "reais" do catálogo (sem barreira além do nível) | **Funcionando como pretendido** (mas usa o universo errado — não conecta ao ranking) |
| 11 | Rivalidades funcionam por nome, sem discriminar origem | **Funcionando como pretendido** (mas mesma desconexão do item 10) |
| 12 | Nenhum real pode virar comissão técnica | **Lacuna de design** |
| 13 | Reais nunca envelhecem/aposentam (idade e status congelados no seed) | **Bug** |
| 14 | Ranking/posição dos reais nunca se move fora da simulação de fundo (que eles não alcançam) | **Consequência direta do #4** |
| 15 | O #4 é pior no ano 1 (20/24 reais nunca jogam) e se dilui sozinho ao longo de anos, por acidente estatístico do sorteio, não por design | **Bug** (agrava o #4: o dano é maior justamente na primeira impressão do jogador) |
| 16 | `normalizeAthlete` (WorldTourLifecycle.js) grava a posição em `ranking`, mas `EntryManager.js` lê `rank`/`teamRank` — toda dupla fica sempre "sem ranking" e inelegível para Platinum/Masters/Elite/Crown na simulação de fundo, que cai sempre no preenchimento de reserva sem checar elegibilidade | **Bug** (a hierarquia de tiers dos torneios que o jogador não disputa é decorativa) |

---

## Lista priorizada de correções propostas (não implementadas — só avaliação de risco/impacto)

1. **[Alto impacto / Baixo risco] Popular `ai_partner_id` para os 24 reais a partir das 12 duplas do seed**, no bootstrap (`saveFoundation.js`), espelhando a intenção já registrada em `worldSeed2025.json.teams`. Resolve o #4 e o #14 na raiz, sem tocar em nenhuma fórmula de simulação — só inicialização de dado. Precisa decidir uma política de dissolução consistente com `aiPartnershipLifecycle.js` (duplas históricas deveriam ter contrato "mais estável" que pares aleatórios, ou usar a mesma regra?).
2. **[Alto impacto / Baixo risco] Corrigir a chave de `TeamRanking` para duplas com `ai_partner_id`** apontando para a linha canônica do seed em vez de criar uma chave derivada de ids ordenados — resolve o #5 sem mudar a lógica de pontuação.
3. **[Médio impacto / Baixo risco] Proteger a dupla histórica de dissolução automática** por um tempo maior, ou dar prioridade a ela no sorteio mensal quando ambos os membros estiverem livres — trata a causa da diluição por escala vista na Fase 2 (resultado B vs. A), sem impedir dissolução narrativa legítima no longo prazo.
4. **[Médio impacto / Médio risco] Dar aos reais um `birth_date` real (derivável da `age` do seed + `career_start_date`) e ligar `AthleteProfile` ao mesmo ciclo de envelhecimento/aposentadoria já usado em outros sistemas** — resolve o #13, mas precisa de um plano de substituição narrativa quando um real se aposentar (a pirâmide não pode ficar sem topo).
5. **[Médio impacto / Médio risco] Unificar (ou ao menos cross-referenciar por um id comum) o pool de ranking e o catálogo de adversários do jogador** — maior mudança arquitetural da lista; resolve a fragmentação de identidade (#1) mas toca em `career.js`, `bots.js`, `athleteCatalog.js` e todo consumidor de `BOTS_BY_DIFFICULTY`. Recomendo tratar como projeto à parte, não como hotfix.
6. **[Baixo impacto / Baixo risco] Remover ou efetivamente usar os campos mortos** (`seed_source` como flag real, `is_development_tournament`) — não muda comportamento, só reduz a distância entre o que os dados "dizem" e o que o código faz.
7. **[Baixo impacto / Baixo risco] Aumentar a proporção de reais no pool "Lenda" do catálogo do jogador**, ou dar peso extra a nomes reais no sorteio de `generateTournamentOpponent` nas rodadas decisivas de Elite/Crown — reforça o objetivo de design "enfrentar um real na final de um Major deveria ser a norma, não a exceção" sem exigir a unificação completa do item 5.
8. **[Alto impacto / Baixo risco] Corrigir o nome do campo em `normalizeAthlete` (`WorldTourLifecycle.js:77`) de `ranking` para `rank`** (ou ajustar `EntryManager.js` para aceitar `ranking` como alias, no mesmo espírito de tolerância a nomes legados já usado em `padel.js`) — reativa a elegibilidade por tier já implementada e correta em `EntryManager.js`, sem tocar em nenhuma regra de negócio nova. É a correção de menor risco/maior impacto desta lista inteira: uma mudança de 1 linha faz a hierarquia Silver→Crown voltar a significar algo na simulação de fundo.
9. **[Médio impacto / Baixo risco] Reduzir a severidade do "cold start" do item 15** — por exemplo, garantir que cada atleta real receba pelo menos uma chance de entrar no sorteio de parceria nos primeiros 1-2 meses de uma carreira nova, em vez de competir em pé de igualdade estatística com ~970 bots por uma vaga entre 8. Isso ataca diretamente o momento em que o jogador mais nota o problema (ano 1), complementando a correção estrutural do item 1.

**Ordem recomendada:** **8** (a correção de menor risco e maior alavancagem — 1 linha, reativa um sistema inteiro já pronto) → **1** → **2** → **9** → **3** → **6**. Deixando os itens 4 e 5 para discussão de escopo à parte dado o tamanho do impacto narrativo/arquitetural.
