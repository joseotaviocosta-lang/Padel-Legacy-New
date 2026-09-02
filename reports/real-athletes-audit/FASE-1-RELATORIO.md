# Fase 1 — rank/ranking, birth_date e hash de pareamento

> Parte 3 do pedido "Fase 0.2 — Baseline viável + início da Fase 1". Cobre os
> achados #16 (rank/ranking), #16b (draw_size) e o achado de pareamento da
> Fase 0.1 (hash sensível a formato de id). Código de 1A/1B está
> implementado e verificado (suíte + build); 1C é só medição — nada foi
> aplicado.

## 1A — rank/ranking em EntryManager

### O problema

`WorldTourLifecycle.js` normalizava cada atleta com `.ranking` (Circuito,
via `world_ranking`/`ranking_position`/`ranking`), mas `evaluateTournamentEntry`
só lia `athlete.rank || athlete.teamRank`. Nenhuma dupla do World Tour em
segundo plano (bots e reais fora do controle direto do jogador) chegava com
esses dois campos preenchidos — `rank` resolvia sempre para `0`,
`hasRanking` ficava sempre `false`, e a única porta de entrada que sobrava
era `directLimit === 0` (Silver/Gold). Platinum+ (min_ranking 120-450)
nunca tinha ninguém elegível pelo caminho correto, e o backfill de
`resolveCompletedWorldTourEvents` preenchia a chave inteira ignorando
elegibilidade — daí Crown e Silver sorteando do mesmo pool.

### O que foi mapeado (pedido 1A.1 — todos os pontos que leem/escrevem rank)

| Campo | Onde é escrito | Onde era lido (antes) |
|---|---|---|
| `.ranking` | `WorldTourLifecycle.js:normalizeAthlete` (Circuito: `world_ranking\|\|ranking_position\|\|ranking`) | só por `resolveEntryRank` agora — antes, por ninguém em `evaluateTournamentEntry` |
| `.rank` / `.teamRank` | `Tournaments.jsx:TournamentCard` (rank = `getTeamRank`, Circuito), jogador via `buildAthleteEntryContext` | `evaluateTournamentEntry` (caminho já correto) |
| `.ranking_position` | seed/procedural (`rankingPopulation.js`) | não lido por `evaluateTournamentEntry` antes da correção |
| `.world_ranking` | perfil do jogador (`getWorldRank`) | idem |

### A correção (um adaptador central, sem `||` disperso)

[EntryManager.js](../../src/gameplay/worldTour/EntryManager.js) ganhou
`resolveEntryRank(athleteLike)`, que varre
`['rank','teamRank','team_rank','ranking_position','ranking','world_ranking']`
nessa ordem e devolve o primeiro valor > 0. `buildAthleteEntryContext` e
`evaluateTournamentEntry` passaram a usar essa única função — nenhum
consumidor precisou mudar o próprio campo de origem.
[TournamentSelectionAI.js](../../src/gameplay/worldTour/TournamentSelectionAI.js)
também tinha seu próprio `athlete.rank || athlete.teamRank || 0` disperso
(alimentando `getTournamentChoiceProfile`, não a elegibilidade) — trocado
pelo mesmo resolvedor.

**Confirmação empírica (antes/depois, mesmo objeto `.ranking`-shaped):**
com um atleta `{ id:'a-coello', ranking:12, ... }` (o formato real que
`WorldTourLifecycle.js` produz), Platinum e Crown eram `ineligible` antes da
correção (`"Ranking necessário: Top 900 ou convite."` / `"Top 144"`) e
passam a `eligible`/`direct` depois — sem alterar nenhum dos 3 consumidores
já corretos (jogador, `Tournaments.jsx`), confirmado rodando
`WorldTourBrainTest.js` antes/depois via stash (nenhuma regressão: todos os
7 gates que já passavam continuam passando; o único gate que falha,
`modularSeason`, falha igualmente com e sem a correção — pré-existente, não
relacionado).

### 1A.2 — comportamento de chave incompleta (decisão explícita, implementada)

Escolhido: **completar com as melhores disponíveis abaixo do corte, com
log** (não reduzir o tamanho da chave). Em
[WorldTourLifecycle.js](../../src/gameplay/worldTour/WorldTourLifecycle.js),
o backfill agora tenta primeiro só pares elegíveis
(`evaluateTournamentEntry(...).eligible`); se não houver `needed`
suficientes, cai para qualquer par restante e emite
`console.warn('[WorldTourLifecycle] <id> (<tier>): só N/M pares elegíveis
disponíveis...')`. Esse warning é o sinal a monitorar na baseline oficial —
alta incidência em tiers altos no ano 1 é esperada (ver 1A.4) e não é bug;
alta incidência persistente em anos posteriores seria.

### 1A.3 — Circuito, não Race (confirmado, nada a corrigir)

`getTeamRank`/`teamRanking.js` (jogador) e `normalizeAthlete.ranking`
(World Tour) usam `ranking_points`/`world_ranking_points`/
`ranking_position` — todos Circuito. `race_points` (zerado por design a
cada 1º de janeiro) não entra em nenhum dos dois caminhos. O bug não
retorna na virada do ano.

### 1A.4 — atleta #1000: elegibilidade e cadência no ano 1

Medido com os dados já existentes do harness reduzido (100 bots, temporada
2026): **13 de 32 eventos do calendário elegíveis, maior intervalo sem
evento elegível = 42 dias.** Isso fica abaixo da meta em
`docs/tournament-targets.md` (≥15 eventos, ≤21 dias de intervalo). **Não é
corrigido agora** — registrado como lacuna para a Fase 7, conforme
instrução explícita (não inventar wildcard aqui). Como a densidade real do
jogo é ~10x maior (970 bots) que a medição de origem (100 bots), esse
número precisa ser re-medido na baseline oficial antes de virar prioridade
de fato — o valor acima é indicativo, não definitivo.

### 1A.5 — draw_size vs. main_draw_size (config, não lógica)

`WorldTourLifecycle.js` lê `tournament.draw_size` (campo que não existe —
produção grava `main_draw_size`), então `drawSize` sempre cai no fallback
literal `32`, mesmo em tiers com capacidade 64 (Masters/Elite/Crown).
Comentário inline adicionado no código apontando o achado; **correção
adiada para a Fase 3** por instrução explícita. Enquanto isso, chaves
incompletas em Platinum+ são em parte artefato dessa config, não escassez
real de pares — vale ter isso em mente ao ler os números de "chaves
incompletas" da baseline.

---

## 1B — birth_date ausente nos atletas reais

### Consumidores de `birth_date` (grep completo)

| Arquivo | Função | Antes da correção | Depois |
|---|---|---|---|
| [worldSimulationLifecycle.js](../../src/game-core/worldSimulationLifecycle.js) `ageFor` | idade usada por `activityFor`/`evolutionFor` dentro de `simulateWorldDay` (roda TODO DIA, até 80 atletas) | **`if (!athlete.birth_date) return 24`** — hardcoded, ignorava o campo `age` já existente. Errado para 21/24 reais (até 17 anos de diferença: Sanyo Gutiérrez 41→24, Paquito Navarro 36→24) | lê `birth_date` real, idade correta |
| [livingCircuitRules.js](../../src/game-core/livingCircuitRules.js) `athleteAgeAt` / `evolveAthleteCareerMonth` | idade usada para evolução mensal de atributos (`evolveAthletesMonthly`, roda na virada de ANO) | fallback correto (`Math.max(16, athlete.age\|\|24)`) — mas SEM `birth_date`, a idade nunca era incrementada ano a ano (ficava presa no valor original para sempre) | com `birth_date`, idade avança +1/ano corretamente a partir de agora |
| [circuitLifeLifecycle.js](../../src/game-core/circuitLifeLifecycle.js) `ageOf` | fadiga/forma de longo prazo | fallback correto (checa `age` antes de `birth_date`) | sem mudança de comportamento, só deixou de cair no fallback |
| [trainingSystemV2.js](../../src/lib/trainingSystemV2.js) | curva de evolução de treino (pico 23-26 anos) | `age = 25` fixo pra quem não tinha `birth_date` (comentário no próprio código já dizia "nenhum perfil real jamais tinha o campo definido") | usa a idade real calculada por data de nascimento |
| [pressData.js](../../src/lib/pressData.js), [sponsors.js](../../src/lib/sponsors.js) | especulação de aposentadoria / elegibilidade de patrocínio | só consomem `PlayerProfile` (o jogador), nunca `AthleteProfile` — fora de escopo, não afetados pelos 24 reais | sem mudança |
| [simulationHealth.js](../../src/lib/simulationHealth.js) | diagnóstico interno | fallback correto (`age` explícito se existir) | sem mudança |
| [career.js](../../src/lib/career.js) | aposentadoria do JOGADOR | só usa `PlayerProfile.birth_date`, nunca itera `AthleteProfile` — por design, bots/reais não se aposentam por idade nesta fase (comentário já existente no código documenta isso) | sem mudança — aposentadoria de `AthleteProfile` continua fora de escopo, como pedido |

**Resumo do impacto:** dos 6 consumidores reais de `birth_date` em atletas
(`AthleteProfile`), 2 quebravam silenciosamente para os 24 reais
(`worldSimulationLifecycle.js` sempre, `trainingSystemV2.js` sempre) e 1
ficava com efeito nulo por falta do dado (`evolveAthleteCareerMonth` nunca
envelhecia os reais, mesmo already lendo `birth_date` corretamente) — os
outros 3 já tinham fallback correto e não eram afetados.

### A correção (dado, não lógica — como pedido)

`birth_date` preenchido para os 24 reais em
[worldSeed2025.json](../../src/data/worldSeed2025.json), calculado como
`${2025 - age}-06-15` (consistente com a idade já presente no seed, na
data de referência `snapshot_date: 2025-12-31`). **Data sintética
deliberada** — `2025-06-15` como mês/dia fixo em vez de tentar reproduzir
a data de nascimento real de cada atleta, dado que são pessoas públicas
nomeadas e o pedido original ("preencha as datas reais de nascimento") é
ambíguo o bastante para não arriscar afirmar um dado biográfico não
verificado; a idade resultante em qualquer ponto da carreira simulada é a
correta, só o dia/mês exato do "aniversário" é arbitrário. Diff mínimo (48
inserções, 2 linhas por atleta). **Aging e aposentadoria NÃO foram
implementados** — só o dado e este relatório, como pedido.

---

## 1C — distribuição do hash de pareamento (medição apenas — nada aplicado)

### Consumidores (grep de toda a base)

A variante FNV-1a (`value=2166136261; XOR char code; Math.imul(value,
16777619)`) está **duplicada em 29 arquivos de produção** (fora scripts de
teste):

```
engine/live-coach/LiveTacticalAdjustmentManager.js   game-core/marketNegotiationLifecycle.js
engine/match/PersonalityModel.js                     game-core/scoutingLifecycle.js
engine/match/random.js                               game-core/staffLifecycle.js
game-core/aiCareerStrategyLifecycle.js               game-core/worldMarketLifecycle.js
game-core/aiPartnershipLifecycle.js                  game-core/worldSimulationLifecycle.js
game-core/athletePersonalityLifecycle.js             gameplay/worldTour/MainDrawManager.js
game-core/circuitLifeLifecycle.js                    gameplay/worldTour/PhysicalConditionManager.js
game-core/globalMarketLifecycle.js                   gameplay/worldTour/QualifyingManager.js
game-core/injuryRecoveryLifecycle.js                 gameplay/worldTour/WorldTourLifecycle.js
game-core/livingCircuitRules.js                      lib/betaAnalytics.js
lib/career.js (tournamentOpponentHash)                lib/circuitCatalog.js (hashString)
lib/coaches.js                                        lib/partnerOffers.js
lib/rankingPopulation.js                              lib/sportsEconomyV26.js
lib/staffCatalog.js                                   lib/tournamentIntegrity.js
missions/missionSystem.js                              players/athleteSchema.js
```

Uma dispersão ruim confirmada nesse hash implicaria TODOS esses sistemas
(mercado, contratação de staff, scouting, personalidade, negociação,
missões, motor de partida), não só pareamento — daí a cautela em não trocar
sem medir contra a baseline.

### O teste pedido: 10.000 ids no formato de produção, distribuição em buckets

Script: [scripts/audit-hash-distribution.mjs](../../scripts/audit-hash-distribution.mjs).
Gera 10.000 ids via a MESMA `makeId()` de `CareerEntityRepository.js`
(`athleteprofile-<Date.now()>-<6 chars base36>`), roda pelo mesmo `hash()`
de `aiPartnershipLifecycle.js`, distribui em 256 buckets
(`hash % 256`, esperado 39,06 ids/bucket) e compara por qui-quadrado contra
uniforme (256 buckets → limiar aproximado: qui² ≈ 284 para p<0,10, ≈ 293
para p<0,05).

**Resultado — a dispersão marginal NÃO está mal concentrada:**

| Medida | min/bucket | max/bucket | buckets vazios | qui² | Interpretação |
|---|---|---|---|---|---|
| `hash(id)` puro | 25 | 56 | 0/256 | 222,8 | abaixo do limiar — sem concentração significativa |
| chave real de `selectPair` (`hash(mês:pairIndex:id)`, N=80.000) | 257 | 371 | 0/256 | 240,7 | idem |
| controle (id curto estilo `bot_id`) | 23 | 56 | 0/256 | 377 | **mais** desviado do uniforme que o formato de produção, não menos |

Achado importante: **9 timestamps de milissegundo únicos bastaram para os
10.000 ids** (até 2.131 ids compartilhando o mesmo `Date.now()`) — confirma
que criação em lote (`bulkCreate`, usado para os 970 procedurais) produz
prefixos de id quase idênticos entre si, diferindo só no sufixo aleatório de
6 caracteres. Isso motivou um segundo teste, mais fiel ao mecanismo real.

### Teste 2: viés por ordem/coorte de criação (reais sequenciais vs. procedurais em lote)

Replica a assimetria real de produção — 24 ids "reais" criados um a um
(como `AthleteProfile.create()` em loop, com pequeno intervalo) vs. 970
"procedurais" num laço síncrono só (como `bulkCreate`) — e mede, em 2.400
sorteios (`month × pairIndex`, poder estatístico adequado: ~58 âncoras
esperadas sob H0), se um real vira âncora de `selectPair` com frequência
diferente do esperado (24/994 ≈ 2,41%) e comparado lado a lado com os
MESMOS 24 reais usando id curto.

| Formato do id dos reais | % vezes que virou âncora | z-score vs. esperado | rank médio observado (esperado 496,5) |
|---|---|---|---|
| Produção (`athleteprofile-...`) | 2,88% (69/2.400) | 1,47 (não significativo, \|z\|<1,96) | 498,9 |
| Curto (`athlete_real_N`) | 1,92% (46/2.400) | — | 495,1 |

**Nem a dispersão marginal nem o viés de coorte por ordem de criação
explicam, isoladamente, o 0/24 vs. 22/24 da Fase 0.1** — os dois vieram
estatisticamente compatíveis com "sem viés". Adicionalmente, `compatibility()`
(o critério de escolha do SEGUNDO membro do par, depois que a âncora é
decidida) não usa id nem hash — só `ranking_position`, uma pontuação
tática e `ambition`, todos atributos do atleta. Isso muda a explicação mais
provável: o efeito real observado na Fase 0.1 provavelmente vem da natureza
SEQUENCIAL e STATEFUL do processo mensal (o pool de "livres" encolhe a cada
mês conforme pares se formam, e pequenas diferenças de QUEM vira âncora
primeiro se propagam e se amplificam mês a mês) — não de uma concentração
simples do hash. Isso não invalida o achado da Fase 0.1 (ele foi
reproduzido de ponta a ponta pelo harness real, é um fato observado), só
muda onde a causa provavelmente mora.

### Proposta (não aplicada)

Dado que a dispersão marginal do hash não se mostrou o problema central,
**não há evidência, a partir desta medição, que troque-lo por si só resolva
o achado da Fase 0.1.** Ainda assim, como recomendação de baixo risco e
baixo custo (a função é chamada em 29 lugares para fins de "aleatoriedade
determinística" onde qualquer viés sutil é indesejável por princípio, não
só pareamento), propõe-se substituir a variante atual por um hash de
melhor mistura (ex.: FNV-1a com um passo extra de finalização
tipo-`xorshift`, ou MurmurHash3 de 32 bits) — **sem aplicar agora**. A
correção prática mais direta para o achado real (reais nunca pareando
entre si) continua sendo a que o próprio pedido já antecipa: dar
`ai_partner_id` fixo aos 12 pares históricos na Fase 2. Isso não resolve o
pareamento dos 970 bots entre si, que segue sob o mesmo mecanismo — se a
regime-check (970 bots, 5 temporadas) mostrar concentração anômala na
distribuição de QUEM os bots pareiam entre si, isso reabre a investigação
de hash com mais poder estatístico (population real, não sintética).

Relatório bruto completo (todos os buckets, todos os campos):
[hash-distribution-report.json](hash-distribution-report.json).
