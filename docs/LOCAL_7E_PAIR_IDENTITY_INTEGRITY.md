# LOCAL-7E — Integridade da identidade das duplas nas chaves, resultados e rankings

Branch `integracao/cloud-6o`, a partir de `a699b2b` (LOCAL-7D). Compactação incremental desligada e não tocada.

## 1. Causa exata

O gerador de atletas não garante nomes únicos (CLOUD-7C: dois "Hugo López" e dois "Rafael López"), então duas
duplas **distintas** podem ter o mesmo nome de exibição. O pipeline tinha duas identidades:

| Camada | Identidade |
|---|---|
| Atletas, `Partnership`, `draw_pair_ids`, `draw_ranking_snapshot`, `TeamRanking`, `AthleteRankingResult`, ledger de dupla | **id** (correto) |
| Chave canônica (`team_a`/`team_b`/`winner`), `placements[].team`, `champion`/`runner_up`, settlement do World Tour, validador da chave, destaque do vencedor na UI | **nome** |

Pontos exatos em que o nome funcionava como identidade:

1. `buildCanonicalTournamentBracket` e `deriveTournamentFactsFromFullBracket` (`tournamentSettlement.js`) tiravam o
   vice da lista de eliminados com `entry.team !== runnerUp`: a homônima eliminada antes sumia junto
   (**colocação fundida**, 7 colocações para 8 duplas, o caso silencioso `tournament-2035-tor-gol-w31-2`).
2. `participants` deduplicado por nome (`new Set` de nomes).
3. Settlement (`WorldTourLifecycle.resolveCompletedWorldTourEvents`): `new Map(placements → team)` e
   `ordered.find(pair => pair.name === champion/runner_up)`. As homônimas recebiam a **mesma** posição, e
   campeão/vice eram "a primeira com aquele nome". Medido: na final entre homônimas, as duas ficavam com a posição 2
   e ninguém ficava com o título; no caso fundido, as duas recebiam os pontos de vice.
4. `validateCanonicalBracketGraph` acusava `"X" aparece mais de uma vez na rodada` para homônimas legítimas, e a
   propagação de vencedor era conferida por nome.
5. Sorteio do jogador (`tournamentDraw.createDrawnRun`): a regra contra nomes repetidos cobria só o catálogo
   sintético. Duplas **reais** do campo (adversários e preenchimento) entravam sem checagem, então a chave do jogador,
   que propaga vencedores por nome, podia conter duas equipes indistinguíveis. Medido no código anterior: Platinum
   com 32 equipes e 25 nomes únicos.
6. `TournamentBracket.jsx` (`MatchCard`): o vencedor era destacado por nome, e numa final "X vs X" os dois lados
   apareciam como vencedores.

Não eram problemas de identidade: créditos dos adversários em torneios do jogador (`placementRoundsWonForOpponent`,
por `run.matches[].opponent[].id`), `TeamRanking` e o ledger de dupla (chave = ids dos atletas ordenados).

## 2. Modelo de identidade

- **Atleta**: `AthleteProfile.id`.
- **Dupla/parceria**: `pair.id` de `buildCanonicalPairs`, ou seja, o id da `Partnership` ou
  `profile-pair:<idA>:<idB>` (ids ordenados). É a identidade que já existia em `draw_pair_ids`. **Nenhum sistema novo**.
- **Inscrição no torneio**: `draw_pair_ids` / `draw_ranking_snapshot[].pair_id` (sorteio).
- **Nome exibido**: só rótulo (`team_a`, `team_b`, `winner`, `placements[].team`, `champion`, `runner_up`). Nenhum
  atleta é renomeado.

### Chave do World Tour (IA)

Quando o sorteio tem nomes **repetidos** e todo entrante tem `pair_id`, a chave grava, ao lado de cada nome:
`team_a_pair_id`, `team_b_pair_id`, `winner_pair_id`, `bye_pair_ids` (alinhado com `byes`) e `placements[].pair_id`.
O torneio também passa a gravar `champion_pair_id` e `runner_up_pair_id`. Internamente, a eliminação é rastreada pela
entrada da equipe, não pelo nome.

**Sem colisão a saída é byte a byte a mesma de antes** (verificado: A1/A9). A escolha é deliberada:

- saves, determinismo e os baselines de equivalência (7B1/7B2) ficam inalterados nos ~99,8% dos torneios sem colisão
  (CLOUD-7C: 3 em 1 240);
- o tamanho do save não cresce (gravar o id em toda partida custaria ~3 ids × 31 partidas × ~1 240 torneios em 10
  temporadas);
- todo consumidor trata os dois formatos: sem id, os nomes são únicos por construção no sorteio novo.

### Chave do jogador

A propagação da chave do jogador (`applyPlayerMatchToCanonicalBracket`, cascata, saída no qualifying) é por nome e
ligada ao `tournament_run`. Carregar ids ali seria uma reescrita ampla. A correção estende a política que o sorteio
do jogador já tinha (hotfix `tournament-draw-name-collision`): **dentro de uma mesma chave do jogador, nenhuma equipe
repete o nome de outra**, incluindo a do jogador e as da qualificatória. A homônima de quem já entrou fica de fora do
preenchimento, ou cede a vaga de adversário ao fallback existente. A escolha dos adversários do qualifying não mudou;
os nomes deles só entram como "já usados". Assim, a identidade por nome é inequívoca por construção.

## 3. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/gameplay/worldTour/tournamentSettlement.js` | `hasDuplicateTeamNames`; ids na chave quando há colisão; vice/colocações por entrada (não por nome); validador e derivação cientes de id; `finalizeTournamentFromBracket` grava `champion_pair_id`/`runner_up_pair_id`; `resolvePairPlacements` (resolvedor puro, com regra conservadora) |
| `src/gameplay/worldTour/WorldTourLifecycle.js` | sorteio D-3 e recuperação passam `pair_id`; settlement usa `resolvePairPlacements`; campeão/vice ambíguos não são escolhidos; sinalização `pair_identity_ambiguous` |
| `src/lib/tournamentDraw.js` | `usedTeamNames`: nenhuma equipe repetida na chave do jogador |
| `src/components/tournaments/TournamentBracket.jsx` | destaque do vencedor por `winner_pair_id` quando presente |
| `scripts/test-local-7e-pair-identity.mjs`, `package.json` | teste `test:local-7e-pair-identity` |

## 4. Compatibilidade com saves

Sem migração e sem gravação retroativa.

- **Save antigo sem colisão**: lido e liquidado exatamente como antes (mesma colocação da busca por nome; A15).
- **Torneio em andamento**: a chave sorteada é usada como está; save/load no meio do torneio preserva a chave e a
  identidade (B3).
- **Torneio concluído**: nunca é reprocessado (`finalizeTournamentFromBracket` idempotente, A16; B13). Campeão,
  colocações, histórico e premiações já gravados ficam intactos.
- **Torneio sorteado antes da correção, com homônimas, ainda não liquidado**: a chave não tem ids, e não é possível
  saber qual homônima ficou onde. Nesse caso (`resolvePairPlacements`):
  - nenhum id é inventado e nenhuma homônima é escolhida;
  - cada homônima recebe a **pior** posição que o nome pode representar: a pior das listadas, ou a última do torneio
    quando a chave antiga já tinha fundido as duas (A11, A14, B11). O crédito nunca fica acima do que a chave prova;
  - campeão/vice cujo nome é ambíguo **não** são atribuídos (`champion_athlete_ids: []`, sem head-to-head). O nome
    continua exibido;
  - as demais duplas recebem a colocação verdadeira;
  - o torneio é marcado com `pair_identity_ambiguous: true` e `pair_identity_ambiguous_names`, e o caso fica visível
    também no diagnóstico do settlement;
  - um resultado por atleta, sem duplicação (B12).

  Custo aceito: neste caso raro, uma homônima pode receber menos pontos do que mereceu. É a única opção que não
  cria pontos indevidos nem troca vencedores.
- Torneios já liquidados com colisão (ex.: os da temporada 10 da CLOUD-7C) **não** são corrigidos: corrigi-los exigiria
  reprocessar premiações, o que é proibido.

## 5. Testes

`npm run test:local-7e-pair-identity`: **38 verificações**, dividido em três partes.

- **A. Funções puras**: sem colisão a saída não muda; determinismo; final entre homônimas; caso fundido; validador
  (aceita homônimas e ainda acusa a mesma dupla duplicada); derivação após round-trip JSON; resolvedor por id, por nome
  único e no legado ambíguo/fundido; idempotência; identidade em `buildCanonicalPairs` (atletas homônimos, ordem dos
  membros, parceria encerrada, `profile-pair:`).
- **B. Mundo só de IA** (carreira em memória, pipeline diário real; 1/3 das duplas procedurais renomeadas para
  "Hugo López"/"Rafael López"): sorteio D-3 grava ids; save/load com torneio em andamento; uma colocação por dupla;
  campeão/vice = pares da final com os atletas desses pares; pontos e ledger por atleta; homônimas avançando de forma
  independente; `TeamRanking` sem fusão; torneio "sorteado antes da correção" (ids removidos) liquidado de forma
  conservadora; idempotência; persistência.
- **C. Sorteio do jogador** (`ensureTournamentDraw` real, Silver/Gold/Bronze/Platinum, com e sem qualifying):
  nenhuma equipe repetida na chave nem nos adversários da campanha. No código anterior, C2–C4 falham (ex.: Platinum
  com 32 equipes e 25 nomes).

Resultados da regressão: ver §7.

## 6. Limitações e riscos restantes

- Torneios já liquidados com colisão antes desta fase continuam com as colocações antigas (não reprocessados).
- Na chave do jogador, a identidade continua sendo o nome (únicos por construção a partir desta fase). Uma chave do
  jogador sorteada **antes** desta fase com homônimas reais continua como estava; os créditos dos adversários já eram
  por id. A guarda de título da CLOUD-7D1 (`champion.includes(member.name)`) só é segura com nomes únicos na chave.
- O gerador de atletas continua produzindo nomes repetidos (fora do escopo; nenhum atleta foi renomeado).
- `bracketFactsFromHistory` (formato legado de chave só com o caminho do jogador) não foi alterado.

## 7. Resultados da regressão

**101 de 106** execuções aprovadas (exit 0), entre elas:

- LOCAL-7E (38/38), LOCAL-7D (33/33), CLOUD-7D1, CLOUD-6N;
- CLOUD-7B1 com `TZ=UTC`: a equivalência **byte a byte** de saves passa, o que confirma que sorteios sem colisão não mudaram;
- 7B2A (determinismo), 7B2B e 7B2C;
- suítes de ranking: v522e/f/g, v523, v524, race;
- torneios: canonical-results, result-authority, flow-rc, draw-name-collision, match-lifecycle, resume-recovery,
  round-availability, guided-flow, date-continuity;
- calendário, living-world, world-save-load, world-idempotency e world-generation;
- persistência: career-persistence-integrity, mobile-persistence-m3-7, browser-career-storage;
- cerca de 60 scripts de chave, sorteio, walkover e settlement: graph integrity, winner propagation, historical bracket,
  v526d field parity/determinism, seeded draw, non-power-of-two, parallel settlement, legacy-save continuity, entre outros;
- `npm run lint`, `npm run build`, `npm run validate:architecture` e `git diff --check`: limpos.

**Falhas, todas preexistentes** (falham igual no código anterior a esta fase, verificado contra `a699b2b`):

- `test:phase15-6-1-tournament-draw-consistency` e `test:phase15-6-2-tournament-canonical-state` (já documentadas na CLOUD-7D1);
- `test-masters-draw-size-comparison-v517` ("Parte L: 2 duplas do Top20 sem partida");
- `test-medium-main-draw-v527h` e `test-progression-smoke-world-pairs-v526d`: dependem de artefatos de medição que
  não estão no repositório.

Não executados: suítes de UI/onboarding, Tauri/Android e simulações de dez temporadas.
