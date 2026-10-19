# LOCAL-7G — Pontuação mundial de todas as duplas

Branch `integracao/cloud-6o`, a partir de `b7c1288` (LOCAL-7F). Compactação incremental e histórica desligadas e não tocadas.

## 1. Modelo de pontuação (auditoria)

- **Tabela oficial**: `circuitCatalog` → `config.roundPoints` por categoria e rodada. `getTournamentRewards(tier, rodadasVencidas)`
  (caminho do jogador) e `getRoundOutcomeTable(tier, campo)` (AI-only) leem a mesma tabela; com o campo cheio, os
  valores são idênticos por rodada (verificado em E2 para Gold, Platinum, Silver e Masters).
- **Unidade do ranking**: um `AthleteRankingResult` por atleta e torneio (`id = atleta:torneio`). O ranking individual
  é **recalculado** como os 22 melhores resultados dentro de 364 dias (`computeRollingPoints`); nada é somado direto. A
  passada semanal (`processWorldCircuit`) recalcula todos e poda os expirados.
- **Race**: acumulador simples do ano civil (`race_points += pontos do torneio`), zerado na virada do ano.
- **Duplas**: `TeamRanking.ranking_points` = soma dos pontos individuais atuais (LOCAL-7D), reprojetada semanalmente.
- **Writers**:
  - AI-only: `resolveCompletedWorldTourEvents` (WorldTourLifecycle) → colocação de cada dupla sorteada →
    `resolveFinish` → resultados, rolling, Race e ledger de dupla;
  - torneio com jogador: `prepareTournamentFinalization` (jogador, parceiro e adversários) e o day-tick
    `resolvePendingPlayerCanonicalTournaments`, via `applyPairPlacementCredits` (resultados, rolling e Race).
    Torneios com jogador **nunca** passam pelo settlement AI-only (`isWorldTourResolutionPending`).

## 2. Diagnóstico (reprodução com o pipeline real, antes da correção)

**Defeito 1 — torneios com o jogador.** Só pontuavam o jogador, o parceiro, os adversários do **caminho** do jogador e,
quando ele caía antes da final, o campeão, e apenas se ele fosse o adversário pré-sorteado da final. Gold de 32 duplas reais:

| Cenário | Duplas creditadas | Sem pontos |
|---|---|---|
| jogador campeão | 5 de 31 (só os adversários dele) | 26 |
| jogador vice | 5 de 31 | 26 |
| jogador cai na 1ª rodada | 1 de 31 | 30, incluindo campeão, vice e semifinalistas |
| jogador cai no qualifying | 0 de 32 | 32 |

Além disso, o adversário que eliminou o jogador recebia um **piso** ("caiu na rodada seguinte"), mesmo quando ia
mais longe. Medido: 18 pontos para uma dupla que foi campeã (200). A Race era afetada da mesma forma.

Causa: a pontuação dessas duplas vinha do `tournament_run` do jogador (`placementRoundsWonForOpponent`), que só conhece
quem ele enfrentou. A chave canônica completa (desde a 4.2) nunca foi usada para pontuar o campo.

**Defeito 2 — torneios só de IA (confirmado, NÃO corrigido neste commit; ver §7).** Uma dupla sorteada em que um membro
se aposentou entre o sorteio (D-3) e o settlement sai do campo: `resolveDrawnPair` resolve membros só entre atletas
**ativos**, e ninguém da dupla pontua, nem o parceiro ativo, embora a chave registre a colocação dela. Medido: Bronze com
32 atletas sorteados e 30 creditados (`tournament-2026-lon-bro-w05-1`). Raro: exige aposentadoria nos ~4 dias entre
sorteio e settlement.

Sem risco de dupla contagem nos dois fluxos: cada um liquida o seu torneio uma vez, e a CLOUD-7D1 já garante a separação.

## 3. Correção

`src/game-core/tournamentLifecycle.js`:

- `buildCanonicalFieldCreditOperations`: no **settlement canônico** de um torneio com jogador, toda dupla real da chave
  principal pontua pela rodada em que caiu (campeão = todas), pela mesma regra
  `getTournamentRewards(tier, rodadas)` e pelo mesmo writer `applyPairPlacementCredits` (resultado datado, rolling e Race).
  - Os nomes da chave resolvem para os ids dos membros pelo `draw_ranking_snapshot` do sorteio, ou pelos adversários
    do run. O nome é único na chave do jogador desde a LOCAL-7E; nome ambíguo ou desconhecido não pontua.
  - Ficam de fora o jogador e o parceiro (creditados na finalização), as duplas eliminadas no qualifying (não pontuam)
    e os adversários sintéticos de fallback (sem `AthleteProfile`).
- `prepareTournamentFinalization`: com a chave canônica completa, os adversários do caminho do jogador deixam de ser
  creditados na eliminação e passam a ser creditados uma única vez no settlement, pela rodada real. Chave legada (só o
  caminho do jogador): comportamento anterior.
- `resolvePendingPlayerCanonicalTournaments` (day-tick): com a chave completa, credita o campo. A antiga regra
  "só o campeão" fica para chaves legadas.
- `applyPairPlacementCredits`: guarda de idempotência. Um atleta que já tem resultado deste torneio não é creditado de
  novo, porque Race e contadores de carreira são acumulados.
- `isFullCanonicalBracket`: chave completa = toda rodada *r* de *R* tem 2^(R−1−r) confrontos decididos. Chaves parciais
  ou legadas seguem a regra antiga (ex.: `test-race-early-elimination-champion-credit`).

Testes de fases anteriores ajustados à regra nova (mudança de comportamento intencional, invariante preservado):

- `test-cloud-7d1-world-tournament-continuity` B9: antes "as linhas novas do tick só creditam o campeão"; agora "as linhas
  novas creditam o campo pela rodada real de cada dupla (nenhum crédito fabricado)".
- `test-local-7f-qualifying-continuity` E2: o crédito do adversário da chave principal passa a ser conferido depois do
  settlement (nova I5), e não no dia da eliminação. O "qualifying não pontua" continua conferido em E2.

Não mudou: tabelas e fórmulas de pontos, estrutura das chaves e dos torneios, qualifying (LOCAL-7F), identidade
(LOCAL-7E), passada semanal, janela rolling, Race e premiação em moedas.

## 4. Compatibilidade

- Torneios concluídos não são reprocessados (O1, H2).
- Torneio do jogador ainda pendente num save anterior: liquida com o campo pontuado. Quem já tinha crédito (ex.:
  adversário do caminho) mantém o crédito antigo e não é creditado de novo (O2: 7 torneios do save da CLOUD-7C).
- Sem migração e sem mudança de formato: as linhas são `AthleteRankingResult` comuns.
- Pontos que faltaram em torneios já concluídos **não** são recriados (seria reprocessar premiações).

## 5. Testes

`npm run test:local-7g-world-points-integrity`: **24 verificações** com carreira em memória, sorteio real, o caminho do
`TournamentModal` sem React, W.O. real, tick diário real e o save da CLOUD-7C.

| Cenário | O que se verifica |
|---|---|
| A — jogador campeão | todas as duplas reais da chave pontuadas pela tabela; jogador e parceiro uma vez, pontos de campeão |
| B — jogador vice | idem; o campeão (IA) recebe pontos de campeão |
| C — eliminado na 1ª rodada (Platinum) | idem; campeão, vice e semifinalistas pontuam, em ordem decrescente |
| D — eliminado no qualifying | idem; o classificado pelo caminho do qualifying pontua pela chave principal; qualifying não pontua |
| E — sem jogador | toda dupla sorteada com membros ativos pontua; a dupla desfeita por aposentadoria (defeito 2) é registrada como INFO; mesma tabela nos dois fluxos |
| F — W.O. na 2ª rodada | idem A |
| G — homônimas | cada dupla pontua pelos seus ids |
| H — save/load | sem dupla contagem antes da final; settlement repetido, reload e novos dias idempotentes |
| R — Race / ranking | Race recebe os pontos; ranking individual = janela rolling (sem soma direta) |
| K / O | determinismo; save antigo (§4) |

No código anterior, falham A1, B1, C1, D1, F1, C3, D3, R1, G1 e O2.

## 6. Desempenho

Comparação intercalada (original/corrigido, duas rodadas), avanço de 10 dias. O ambiente estava ruidoso, então vale
mais a diferença dentro de cada rodada do que o valor absoluto:

| Cenário | Original (ms) | Corrigido (ms) |
|---|---|---|
| carreira nova, sem torneios do jogador para liquidar | 3412, 4563 | 3509, 3815 |
| save CLOUD-7C com 7 torneios do jogador acumulados | 9664, 8835 | 10406, 9512 |

Nenhum custo por tick. O custo extra está só no settlement de cada torneio do jogador (cerca de 100 ms: 3 consultas e
cerca de 60 resultados numa única transação), uma vez por torneio.

## 7. Riscos restantes

### Defeito 2 — decisão pendente

A correção do defeito 2 é uma linha em `resolveCompletedWorldTourEvents`: resolver os membros das duplas **sorteadas**
entre todos os atletas, mantendo a gravação só para os ativos.

```diff
-  const athleteById = new Map(athletes.map((athlete) => [athlete.id, athlete]));
+  const athleteById = new Map((rawAthletes || []).filter((athlete) => athlete?.id).map(normalizeAthlete).map((athlete) => [athlete.id, athlete]));
```

Ela foi implementada e testada (o parceiro ativo passa a pontuar pela colocação registrada na chave), mas **não entrou
neste commit**. O motivo é que muda o resultado desses torneios a partir do dia 27 de uma carreira nova, e isso quebra o
`test:cloud-7b1-save-pipeline` A ("equivalência byte a byte", dia 30). Esse teste compara com um baseline e um fixture
gravados pelo código **anterior à CLOUD-7B1**, como prova de que a otimização do pipeline de save não mudou o jogo.
Aplicar o defeito 2 exige regravar esse baseline (modo `--record`), o que substitui a evidência histórica: decisão do
usuário. Com o defeito 1 apenas, a 7B1 passa (37/37).

- O ledger de vitórias e derrotas da dupla (`TeamRanking.wins/losses`) continua sendo gravado só pelo AI-only; duplas de
  IA num torneio do jogador pontuam, mas não somam V/D nesse torneio.
- Os adversários do caminho do jogador agora pontuam no settlement (data da final), não mais no dia da eliminação. O
  valor fica correto (rodada real), mas chega alguns dias depois.
- Os rótulos de colocação da chave do jogador ("participant", "quarterfinal") seguem a nomenclatura antiga da
  derivação; os pontos usam a rodada real, não o rótulo.
- Torneios já concluídos com pontos faltando não são corrigidos.

## 8. Validação manual

1. `http://127.0.0.1:5174/` → F5 → carreira de teste.
2. Inscrever-se num torneio e ser eliminado cedo, ou nem se inscrever.
3. Avançar até a final e mais uma semana (passada do ranking).
4. Ranking → Mundial → Individual: campeão, vice e semifinalistas desse torneio devem ter subido em pontos e na Race.
5. Ranking → Duplas: as duplas desse torneio refletem a soma dos novos pontos.
6. F5 e conferir que nada mudou nem duplicou.

## 9. Resultados da regressão

Bateria completa (129 execuções), seguida de reexecução das suítes afetadas no estado final do commit (sem o defeito 2).

Aprovados no estado final:

- LOCAL-7G (24/24), LOCAL-7F (37/37), LOCAL-7E (38/38), LOCAL-7D (33/33) e CLOUD-7D1 (38/38);
- CLOUD-7B1 com `TZ=UTC` (37/37, equivalência byte a byte), 7B2A, 7B2B e 7B2C;
- ranking (v522e/f/g, v523, v524, race), tournament-result-authority, world-save-load e world-idempotency;
- race-early-elimination-champion-credit, partner-athlete-ranking-credit/teamranking-v512,
  walkover-player-tournament-settlement e parallel-tournament-settlement-v59;
- os ~60 scripts de chave, sorteio, walkover e qualifying, calendário e persistência;
- `npm run lint`, `npm run build`, `npm run validate:architecture` e `git diff --check`: limpos.

Falhas preexistentes (iguais em `b7c1288`): `phase15-6-1`, `phase15-6-2`, `test-medium-main-draw-v527h`,
`test-progression-smoke-world-pairs-v526d`, `test-qualifying-vs-main-v527h`, `test-rescue-does-not-displace-qualified-v515`
e `test-tier-qualifying-heldout`.

A medição de desempenho (§6) foi feita com os dois defeitos corrigidos. O defeito 2 não acrescenta trabalho por tick
(muda só a resolução de membros num `Map` já existente), então o número vale para o commit.
