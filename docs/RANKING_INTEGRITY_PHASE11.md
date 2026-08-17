# Fase 11 — Ranking unificado + integridade pré-beta

Continuação da Fase 10 (`docs/BETA_READINESS_PHASE10.md` §6), que documentou
mas não corrigiu duas fontes de ranking divergentes e dois riscos de escrita
não-atômica. Esta fase resolve o ranking e investiga/trata a atomicidade —
sem tocar em Match Engine, Live Coach, Tournament Lifecycle, branding ou
curva de progressão.

## 1. Ranking individual — fonte antiga vs. nova

**Antes**: duas implementações independentes.

| | Header/Home/Season | Página `/ranking` |
|---|---|---|
| Função | `getWorldRank(profile)` (`src/lib/padel.js`) | lógica própria dentro de `Ranking.jsx` |
| População | `AthleteProfile` ativos + o jogador | `AthleteProfile` (ordenado por `ranking_position`, um campo que só é atualizado para os ~160 atletas processados por semana) + **todos** os `PlayerProfile` (até 100) + um pseudo-atleta por membro de `TeamRanking` |
| Posição | contagem de quem tem mais pontos, +1 (empate = mesma posição) | índice do array (`i + 1`) após um `Array.sort` cuja ordem de entrada dependia da ordem de leitura do storage |
| Desempate | nenhum | nenhum (dependia de ordem de inserção) |

Isso permitia exatamente o cenário descrito no enunciado: número diferente
no header e ao rolar até si mesmo em `/ranking`.

**Depois**: uma função canônica, `buildWorldRankingSnapshot(profile)`
(`src/lib/padel.js`), usada por **todos** os consumidores de ranking
individual — `getWorldRank` agora é um wrapper fino em cima dela, mantendo a
assinatura antiga (`{ rank, total, points, unranked, displayRank }`) para não
quebrar quem já a chama.

```js
{
  entries,        // lista completa, ordenada, com `raw` (objeto original) preservado
  playerEntry,    // a entrada do jogador dentro de `entries`
  playerRank,     // posição do jogador
  playerPoints,
  total,
  unranked,
  generatedAt,
}
```

## 2. Quem usa a fonte canônica agora

`getWorldRank`/`buildWorldRankingSnapshot`, todos importados de
`@/lib/padel`:

- `src/components/AppLayout.jsx` (Header) — já calculava uma vez e reusava
  (`SeasonPanel` recebe `suppliedWorldRank`); preservado.
- `src/pages/CareerHub.jsx` (Home)
- `src/pages/Season.jsx`
- `src/components/home/SeasonPanel.jsx`
- `src/pages/Ranking.jsx` — abas **Circuito**, **Jogadores** e **Race** agora
  renderizam diretamente `snapshot.entries` (Race é uma reordenação de
  apresentação da mesma população, por `race_points`, com o mesmo desempate).

`test:ranking-consistency` verifica por leitura estática de código que os
cinco arquivos importam a fonte de `@/lib/padel` (não uma reimplementação
local), e por execução real que `getWorldRank` e `buildWorldRankingSnapshot`
concordam na posição e no total do jogador.

## 3. Ranking de dupla continua separado

`getTeamRank`/`TeamRanking` (`src/lib/teamRanking.js`) não foi tocado.
`buildWorldRankingSnapshot` nunca inclui um pseudo-atleta derivado de
`TeamRanking` — a aba **Duplas** de `/ranking` continua lendo `TeamRanking`
diretamente, sem passar pela função canônica. `test:ranking-consistency`
prova isso duas vezes: (a) nenhuma entrada do ranking individual carrega
`source_team`/`team_key`; (b) `getTeamRank` continua funcionando de forma
independente com os mesmos dados.

## 4. Universo de participantes e dedup

`AthleteProfile` ativos (`!retired && career_phase !== 'Aposentado'`) + o
`PlayerProfile` ativo recebido como argumento — nunca "todos os
`PlayerProfile`" (esse `.list('-xp', 100)` da versão antiga da página de
ranking parece ter sido pensado para trazer o jogador, mas na prática também
trazia perfis de outras carreiras já criadas no mesmo dispositivo,
tratando-as como concorrentes reais). Dedup por nome normalizado, mantendo a
entrada de maior pontuação — mesmo critério já usado antes desta fase.

## 5. Player vs. bots — pontos comparáveis

Ambos alimentam o mesmo campo conceitual (`rank_points`/`ranking_points`/
`world_ranking_points`, ver §6) e entram na mesma lista ordenada pelo mesmo
critério. Nenhuma rebalanceamento de escala foi feito nesta fase — os
números observados em simulação (`test:ranking-consistency`, cenário de
população grande) não mostraram nenhuma distorção óbvia entre a faixa de
pontos do jogador recém-criado e a dos bots, mas uma auditoria estatística
dedicada de "quantos pontos um jogador mediano acumula por temporada vs. a
distribuição real de bots" fica fora do escopo desta fase (seria uma
pergunta de calibração de progressão, explicitamente fora de escopo aqui).

## 6. Desempate determinístico (item 9 do enunciado)

`compareRankingEntries` (`src/lib/padel.js`): **pontos desc → Overall desc
(critério secundário estável já usado no jogo para medir força) → id asc
(fallback final)**. A posição final é sequencial (`index + 1`), não mais
"quantos têm mais pontos, +1" — dois atletas empatados em pontos **e**
Overall recebem posições adjacentes determinadas só pelo id, nunca pela
ordem de leitura do storage.

Mudança de comportamento assumida conscientemente: `getWorldRank` antes
dava a mesma posição a todos os empatados ("ranking de competição", tipo
1-2-2-4); agora cada entrada tem uma posição própria e única. Nenhum teste
existente dependia do formato antigo (`grep` confirmado antes da mudança).
`test:ranking-consistency` prova que a mesma população produz sempre a
mesma ordem, mesmo em execuções repetidas.

## 7. Bots — dois sistemas de pontuação não coordenados (item 14)

Achado da Fase 10, auditado em profundidade nesta fase, **não unificado**
(risco de correção às pressas maior que o benefício, conforme instrução):

| | `processWorldCircuit` (`src/game-core/circuitLifecycle.js`) | `resolveCompletedWorldTourEvents` (`src/gameplay/worldTour/WorldTourLifecycle.js`) |
|---|---|---|
| Gatilho | uma vez por semana de calendário (`last_circuit_week`) | sempre que existem `Tournament` com `end_date` passado e `world_tour_resolved` ausente |
| Amostra | os 160 `AthleteProfile` com maior Overall | todos os atletas que "escolheram" jogar cada torneio pendente (`chooseTournament`) |
| Escreve | `world_ranking_points`, `ranking_points`, `ranking_position`, `race_points`, histórico, também atualiza `TeamRanking` | `world_ranking_points` (soma sobre o valor atual), `world_ranking` (reranking 1..N) |

**Respostas às perguntas do enunciado:**

- **São complementares ou duplicados?** Representam conceitos diferentes
  (resultado sintético semanal vs. resultado de um `Tournament` simulado de
  verdade), mas **não são coordenados entre si** — nenhum dos dois checa se
  o outro já processou aquele atleta naquela janela de tempo.
- **Escrevem o mesmo campo?** Sim — `world_ranking_points` é escrito por
  ambos. As posições vão para campos DIFERENTES (`ranking_position` vs.
  `world_ranking`), o que por si só já é uma segunda divergência de fonte
  (não corrigida agora — nenhum consumidor do jogo real lê `world_ranking`
  hoje; só o próprio `resolveCompletedWorldTourEvents` escreve nele).
- **Existe double-award?** É estruturalmente possível: um bot que está entre
  os 160 de maior Overall E que jogou um `Tournament` do World Tour na mesma
  janela recebe pontos dos dois mecanismos para atividade competitiva que
  pode se sobrepor temporalmente. Não foi *medido* com que frequência isso
  acontece em uma carreira real (exigiria instrumentação nova nos dois
  sistemas só para contar sobreposição, o que já seria começar a mexer
  neles) — fica documentado como um achado real, não quantificado.
- **Algum deveria se aposentar?** Não há evidência suficiente para decidir
  isso com segurança nesta fase — os dois alimentam painéis diferentes do
  Universo Vivo (notícias de circuito vs. resultados de torneio) e uma
  fusão exigiria desenho dedicado de qual conceito de "competição" o jogo
  quer manter.
- **Impacto real, hoje**: nenhum dos dois afeta a posição do JOGADOR
  diretamente (ele não passa por nenhum dos dois) — o impacto é somente na
  competitividade relativa dos bots entre si, que já é sintética. Por isso
  não foi tratado como bloqueante.

## 8. Campos duplicados (item 15)

`rank_points` / `ranking_points` / `world_ranking_points` (jogador e
atletas) e `ranking_position` / `world_ranking` (posição de atleta) — todos
tolerados via alias (`??`) em `buildWorldRankingSnapshot`, sem exigir
migração. Nenhum campo foi renomeado; nenhum foi removido. Não há uma
recomendação clara de qual declarar "legacy" sem resolver o achado do §7
primeiro (já que os dois campos de posição pertencem a sistemas diferentes
que ainda coexistem).

## 9. Saves antigos

`buildWorldRankingSnapshot` não assume nenhum campo específico presente —
todo acesso a ponto/posição usa os aliases do §8, e um `AthleteProfile`/
`PlayerProfile` sem nenhum desses campos simplesmente entra com `points: 0`
(vai para o fim da lista, comportamento correto). Nenhuma migração de schema
foi necessária.

## 10. Performance

`buildWorldRankingSnapshot` com ~1000 `AthleteProfile` + o jogador calculou
em **5ms** no teste real (`test:ranking-consistency`, cenário de
performance) — uma leitura (`AthleteProfile.list`), um loop de dedup e um
`sort`. Sem cache/memoização adicional: não foi necessário para esse volume,
e os consumidores já evitavam recalcular (Header calcula uma vez e Home
reaproveita via `suppliedWorldRank`).

## 11. Integridade de escrita — os dois riscos da Fase 10

### 11.1 `advanceDay()` — dia "meio aplicado" (risco A)

**Reproduzido?** Sim, via fault injection real (`test:career-atomicity`):
força-se `TrainingSession.create` a lançar exatamente no estágio de treino
de `advanceDay`, depois que `career_date`/energia/calendário já haviam sido
persistidos pelo estágio `recovery`.

**Estava corrigido?** Sim — já existe um mecanismo de rollback em
`advanceCareerDay` (`src/game-core/calendarLifecycle.js` +
`src/game-core/careerAdvanceTransaction.js`): um snapshot completo da
carreira ativa é capturado **antes** de qualquer escrita do dia; se
qualquer estágio lançar, `restoreCareerSnapshotOnFailure` regrava esse
snapshot inteiro (`gameRepository.saveActiveCareer`), desfazendo inclusive
as escritas de estágios anteriores que já tinham sido persistidas com
sucesso. O teste prova isso na prática: depois da falha injetada,
`career_date`, `energy` e `trainings_today` voltam exatamente ao valor de
antes do advance, e o `CalendarEvent` planejado volta a `'scheduled'` (não
fica "consumido" por um dia que não completou). Um retry limpo em seguida
avança o dia normalmente e aplica o treino exatamente uma vez.

**Correção aplicada nesta fase**: nenhuma no mecanismo de rollback em si —
ele já existia e funciona. O trabalho desta fase foi provar isso com um
teste de fault injection real contra o pipeline de produção (não existia
antes) e deixar essa garantia documentada e protegida por regressão.

### 11.2 `executeTraining()` — sessão órfã sem os ganhos aplicados (risco B)

**Reproduzido?** Sim. Antes da correção: `TrainingSession.create` rodava
**antes** de `PlayerProfile.update`; uma falha exatamente entre as duas
deixava uma sessão persistida (que por si só já impede reaplicar o treino
daquele dia — `calendarSystem.js`: `sessions.some(s => s.date === date)`)
sem que energia/atributos/XP tivessem sido realmente aplicados: perda
silenciosa e permanente.

**Como foi corrigido?** Inversão de ordem (`src/lib/trainingSystemV2.js`,
`executeTraining`): `PlayerProfile.update` — a escrita que define se o
treino realmente aconteceu — agora vem **primeiro**. `TrainingSession.create`
— só o registro histórico/auditoria — vem depois. Nenhum outro código
depende da sessão existir antes do perfil ser atualizado (confirmado por
leitura de todos os usos de `TrainingSession`). Não foi criado nenhum campo
novo de status/reconciliação (item 27 do enunciado) porque a inversão de
ordem já fecha o risco sem precisar de infraestrutura nova: com a ordem
nova, "PlayerProfile foi atualizado" **é** a fonte de verdade de "o treino
aconteceu" — perder a sessão de auditoria é uma degradação mínima aceitável,
não uma perda de progresso.

**Prova via fault injection** (`test:career-atomicity`, Risco B):
- B1 (falha em `PlayerProfile.update`, agora a 1ª escrita): nenhuma
  `TrainingSession` órfã é criada, `trainings_today` não muda — falha limpa,
  sem efeito colateral.
- B2 (falha em `TrainingSession.create`, agora a 2ª escrita, só auditoria):
  os ganhos **já** foram aplicados ao perfil antes da falha — degradação
  mínima, não perda de progresso.
- B3 (caminho feliz): sem regressão — as duas escritas continuam
  acontecendo normalmente.

### 11.3 Estratégia escolhida (item 25)

Snapshot/restore no nível do dia inteiro (já existente, só agora coberto
por teste) para o risco A; reordenação de escrita (mais simples que um novo
mecanismo de estado) para o risco B. Nenhuma transação gigante nova foi
criada — ambas as soluções são localizadas, consistentes com o storage
já baseado em temp-file + rename por mutação (`GameStorage`, Fase 10 §2).

## 12. Arquivos modificados

- `src/lib/padel.js` — `buildWorldRankingSnapshot` (nova fonte canônica),
  `getWorldRank` refatorado para usá-la.
- `src/pages/Ranking.jsx` — abas Circuito/Jogadores/Race consomem a fonte
  canônica; nenhum pseudo-atleta de dupla entra mais no array individual.
- `src/lib/trainingSystemV2.js` — `executeTraining`: `PlayerProfile.update`
  antes de `TrainingSession.create`.
- `package.json` — `test:ranking-consistency`, `test:career-atomicity`,
  `test:beta-candidate`.

Nenhum arquivo de Match Engine, Live Coach, Tournament Lifecycle, branding
ou calibração de progressão foi alterado.

## 13. Testes criados

- **`test:ranking-consistency`** (`scripts/test-ranking-consistency.mjs`) —
  fonte única (checagem estática dos 5 consumidores), consistência numérica
  entre `getWorldRank`/`buildWorldRankingSnapshot`, dupla continua separada,
  desempate determinístico, save/load, aliases de campos legados,
  performance com ~1000 atletas.
- **`test:career-atomicity`** (`scripts/test-career-atomicity.mjs`) — fault
  injection real para os dois riscos P1 da Fase 10.
- **`test:beta-candidate`** (`scripts/test-beta-candidate.mjs`) — orquestra
  14 pilares (save, integridade de escrita, calendário, treino, ranking,
  carryover, torneio × 2, partidas × 2, técnico × 3, entrevistas),
  reaproveitando os testes existentes.

## 14. Riscos restantes (documentados, não bloqueantes)

- §7 — dois sistemas de pontuação de bots não coordenados (double-award
  estruturalmente possível entre bots; não afeta o jogador nem corrompe
  save).
- §8 — dois pares de campos "quase duplicados" (`ranking_position` vs.
  `world_ranking`; os três aliases de pontos) continuam coexistindo — uma
  fonte única desses campos exigiria resolver o §7 primeiro.
- Achados da Fase 10 não relacionados a ranking/atomicidade (deriva de
  parceiro na finalização de torneio, ausência de piso em
  `processMonthlyFinances`, etc.) permanecem como estavam — fora do escopo
  desta fase.
