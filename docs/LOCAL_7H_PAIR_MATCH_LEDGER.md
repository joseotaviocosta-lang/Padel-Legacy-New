# LOCAL-7H — Ledger de partidas das duplas da IA

Branch `integracao/cloud-6o`, a partir de `8479a46` (LOCAL-7G.1). Compactação incremental e histórica desligadas e não tocadas.

## 1. Estruturas e escritores (auditoria)

| Estatística | Estrutura canônica | Escritores |
|---|---|---|
| **Dupla de IA** (V/D/partidas/títulos/eventos) | `TeamRanking.wins/losses/matches_played/ledger_titles/ledger_events` com `stats_source: 'ledger'` | settlement AI-only (`resolveCompletedWorldTourEvents`). A passada semanal (`updateTeamRankings`) só **preserva** esses campos |
| **Individual** (atleta, todas as parcerias) | `AthleteProfile.career_wins/career_losses/career_titles/tournaments_played` | settlement AI-only e `applyPairPlacementCredits` (torneio com jogador) |
| **Dupla do jogador** | `TeamRanking` (por torneio, na finalização) e `Partnership.shared_*` (por partida) | `prepareTournamentFinalization` e `buildPartnershipMatchPatch` |
| **Ranking** | `AthleteRankingResult` (janela rolling) e `race_points` | os mesmos settlements, independentes do ledger |
| **Histórico do torneio** | `bracket_history`, `placements`, `champion`/`runner_up` | sorteio e settlement |

As parcerias de IA não têm contadores próprios em `Partnership`: o ledger da dupla de IA é só o `TeamRanking`,
identificado pelos ids dos dois atletas (ordenados).

## 2. Diagnóstico (reprodução com o pipeline real)

**Defeito — torneio com o jogador.** Nenhuma dupla de IA da chave principal recebia registro no ledger: 0 de 31 duplas
por torneio, em Platinum com jogador campeão, eliminado na 1ª rodada ou na semifinal, e 0 de 32 com jogador
eliminado no qualifying. Todas tinham linha em `TeamRanking`. O único escritor do ledger era o settlement AI-only, e
torneios com jogador nunca passam por ele (`isWorldTourResolutionPending`). Pontos, Race e estatísticas individuais
estavam corretos (LOCAL-7G). A chave canônica completa contém todas as partidas necessárias.

**Torneio só de IA** — achados (não alterados nesta fase):

1. **BYE conta como vitória.** O ledger AI-only deriva V da colocação (`resolveFinish`: rodadas avançadas), e o BYE
   conta como rodada avançada. É uma regra existente e consistente com `career_wins` do AI-only. Medido: 21 de 87 duplas
   com um evento.
2. **Inversão de nome de `profile-pair` → colocação, pontos e ledger errados (defeito, decisão pendente).**
   `buildCanonicalPairs` monta o nome das duplas sem `Partnership` como `[atleta, parceiro]` na ordem da lista de
   atletas, que segue o ranking e muda toda semana. Se os membros trocam de posição entre o sorteio e o settlement, o
   nome se inverte, a busca por colocação falha e o settlement usa o fallback `index + 1` (ordem de força). Medido:
   **8 de 88 duplas** com pontos errados em 4 torneios. Exemplos: o campeão Marc Quílez & Federico Mouriño com 60 pontos
   (de vice) em vez de 100; uma dupla eliminada na estreia com 36 (de semifinal) em vez de 5. Afeta pontos, Race,
   ledger e estatísticas individuais. Ver §8.
3. **Dupla sem linha em `TeamRanking` no momento do settlement perde o evento** (1 caso medido: dupla formada após a
   última passada semanal). Os dois fluxos usam a mesma regra ("só linhas existentes"), e nada é criado.

## 3. Correção

- `src/lib/teamRanking.js`: `buildPairLedgerPatch(row, entry)` e `indexTeamRankingRowsByMembers(rows)`, o writer do
  ledger **extraído sem mudança** do AI-only. A saída do AI-only é byte a byte a mesma: CLOUD-7B1 43/43 com os
  baselines histórico e pós-7G.1.
- `src/gameplay/worldTour/WorldTourLifecycle.js`: o AI-only passa a usar o writer compartilhado.
- `src/game-core/tournamentLifecycle.js`: `buildCanonicalPairLedgerOperations` roda no settlement canônico do torneio
  com o jogador (no mesmo lote de `buildCanonicalFieldCreditOperations`, LOCAL-7G):
  - fonte: as **partidas reais** da chave, não a colocação. Cada confronto disputado dá V ao vencedor e D ao perdedor;
    o campeão ganha 1 título; cada dupla, 1 evento;
  - identidade: nome da chave → ids dos membros pelo `draw_ranking_snapshot` ou pelos adversários do run (único por
    construção desde a LOCAL-7E; nome ambíguo é ignorado). O ledger usa a linha `TeamRanking` daqueles dois atletas;
  - só linhas existentes (mesma regra do AI-only); a dupla do jogador fica de fora.

## 4. Política de W.O., BYE, abandono e qualifying

| Situação | Ledger da dupla de IA |
|---|---|
| Partida disputada (inclusive contra o jogador) | V para o vencedor, D para o perdedor |
| W.O. ou abandono do jogador (partida do jogador sem placar) | **não conta**: o adversário avança sem vitória registrada, porque a partida não foi disputada |
| BYE | não existe na chave do jogador; no AI-only segue a regra existente (rodada avançada) |
| Qualifying (inclusive o caminho simulado da LOCAL-7F) | não entra no ledger nem pontua, como no AI-only |

Diferença conhecida: as estatísticas **individuais** do adversário que avança por W.O. contam a rodada avançada
(`applyPairPlacementCredits`, regra existente da 5.0). O ledger da dupla conta só partidas disputadas.

## 5. Idempotência

O ledger é gravado no **mesmo lote atômico** do settlement canônico, que marca o torneio como resolvido
(`world_tour_resolved`). `prepareTournamentFinalization` só grava com um settlement não idempotente, e
`resolvePendingPlayerCanonicalTournaments` só processa torneios não resolvidos. Por isso uma repetição de settlement,
um reload, o reparo de continuidade, um abandono ou um W.O. não reprocessam. Nenhum campo novo persistido.

## 6. Compatibilidade com saves

- Torneios concluídos não são reprocessados, e o ledger já gravado não muda.
- Torneios do jogador ainda pendentes num save antigo (save da CLOUD-7C: 7 torneios) registram o ledger uma vez ao
  liquidar.
- Sem migração e sem mudança de formato. O ledger que faltou em torneios já concluídos não é recriado.

## 7. Testes

`npm run test:local-7h-pair-match-ledger`: **23 verificações**, com pipeline real, carreira em memória e o save da
CLOUD-7C. As duplas que jogaram outro torneio na mesma janela ficam fora da conferência do torneio auditado.

| Cenário | Verificação |
|---|---|
| A — só IA | ledger = partidas reais + BYE como rodada avançada (regra existente), por id de parceria |
| B / F — jogador campeão | todas as duplas com o registro exato; cada adversário vencido pelo jogador com exatamente 1 derrota; a dupla do jogador não vira ledger de IA |
| C — eliminado na 1ª rodada | registro exato de todo o campo |
| D — eliminado na semifinal | idem (antes e depois da saída do jogador, sem duplicação) |
| E — eliminado no qualifying | idem; duplas do qualifying sem registro; o classificado registra só a chave principal |
| G — W.O. | idem; a partida não disputada não vira vitória |
| H — homônimas | registros independentes por ids |
| I — aposentadoria após o sorteio | a dupla mantém o registro das partidas disputadas |
| J — save/load | antes e depois do settlement |
| K — repetição do settlement | sem duplicação; determinismo |
| L — mudança de parceiro | a linha anterior mantém o histórico; a dupla nova não herda |
| R — integridade | ranking e Race intactos; campeão e vice; partidas = V + D; individual = partidas reais |
| O — save antigo | pendentes registram uma vez, sem eventos excedentes |

No código anterior falham 12 verificações (B1, C1, D1, E1, G1, F1, E3, G2, I1, R3, H1 e K2).

## 8. Decisão pendente — inversão de nome de `profile-pair` no AI-only

Correção proposta (pequena): no settlement de um torneio já sorteado, resolver a colocação de cada dupla pelo **nome do
sorteio** (`draw_ranking_snapshot[pair_id].name`, ou `participants` alinhado a `draw_pair_ids`) em vez do nome
reconstruído agora. Alternativa equivalente: tornar estável a ordem dos membros de `profile-pair:` em
`buildCanonicalPairs` (ids ordenados).

Não aplicada nesta fase porque corrige **pontos de ranking**, Race e estatísticas já calculados de forma errada no
AI-only. Isso muda o resultado da carreira de referência da CLOUD-7B1 e exige mais uma divergência documentada e um
baseline versionado (o padrão criado na LOCAL-7G.1). Também toca a resolução de identidade da LOCAL-7E. Requer
autorização.

## 9. Baselines

Nenhum alterado. A carreira de referência da CLOUD-7B1 não liquida torneios com o jogador, e o writer do AI-only foi
extraído sem mudança de saída: 43/43 contra o histórico (chaves inalteradas) e contra o pós-7G.1.

## 10. Desempenho

Uma leitura de `TeamRanking` a mais por settlement de torneio do jogador (a mesma que o AI-only já faz), nada por tick.
Medição intercalada, 3 rodadas, avanço de 10 dias:

| Cenário | Original (ms) | Corrigido (ms) |
|---|---|---|
| carreira nova | 1752, 1564, 881 | 808, 1554, 1396 |
| save CLOUD-7C com 7 settlements acumulados | 3856, 2899, 2276 | 2147, 2994, 2831 |

Sem diferença mensurável (faixas sobrepostas).

## 11. Riscos restantes

- Inversão de nome de `profile-pair` no AI-only (§8): pontos e ledger errados para cerca de 9% das duplas.
- BYE como vitória no ledger AI-only (regra existente) versus partidas reais no torneio com jogador. Na chave do
  jogador não há BYE, então os números são comparáveis, mas as regras não são idênticas.
- W.O.: ledger (partidas disputadas) e individual (rodadas avançadas) divergem em 1 vitória para o adversário que avança.
- Dupla sem linha em `TeamRanking` no momento do settlement não registra o evento (nos dois fluxos).
- A dupla do jogador continua contando por torneio no `TeamRanking` (regra da 5.0), não por partida.

## 12. Validação manual

1. `http://127.0.0.1:5174/` → F5.
2. Jogar um torneio e ser eliminado (ou vencer).
3. Avançar até a final.
4. Ranking → Mundial → Duplas: as duplas de IA desse torneio mostram "xV · yD · títulos" coerentes com a chave.
   O campeão tem +1 título e o vice tem 1 derrota.
5. F5 e conferir que nada duplicou.

## 13. Resultados da regressão

**105 de 116** execuções aprovadas, entre elas:

- LOCAL-7H (23/23), LOCAL-7G.1 (18/18), LOCAL-7G (24/24), LOCAL-7F, LOCAL-7E, LOCAL-7D, CLOUD-7D1 e CLOUD-6N;
- CLOUD-7B1 com `TZ=UTC` (43/43, histórico e pós-7G.1) e CLOUD-7B2A (determinismo), 7B2B e 7B2C;
- ranking (v522e/f/g, v523, v524, race, rolling window), torneios, settlement, walkover, calendário, persistência,
  world-save-load, world-idempotency, world-retirement e world-partnership-dynamics;
- `npm run lint`, `npm run build`, `npm run validate:architecture` e `git diff --check`: limpos.

**Falhas, todas preexistentes** (falham igual em `8479a46`, verificado):

- `phase15-6-1`, `phase15-6-2`, `former-partner-world-continuity-v518` e
  `player-team-ranking-reprojection-idempotency-v512`;
- incluídas pela primeira vez nesta bateria e também falhando em `8479a46`: `team-ranking-authority-live-v59`,
  `team-ranking-partnership-change-v510`, `team-ranking-player-ai-parity-v510`, `team-ranking-unified-authority-v510`,
  `team-ranking-unranked-member-v511`, `team-ranking-visible-stats-v513` e `team-ranking-reload-idempotency-v510`
  (estoura o tempo limite de 900 s nos dois códigos). Tratam da regra de pontos e da exibição da dupla, de fases
  anteriores à 5.22-E (soma), e não do ledger.
