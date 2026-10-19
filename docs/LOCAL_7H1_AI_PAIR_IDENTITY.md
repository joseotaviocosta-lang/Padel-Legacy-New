# LOCAL-7H.1 — Identidade das duplas de IA no settlement, independente da ordem dos nomes

Branch `integracao/cloud-6o`, a partir de `53024a6` (LOCAL-7H). Compactação incremental e histórica desligadas e não tocadas.

## 1. Causa exata

> A hipótese registrada na LOCAL-7H (§8: inversão por troca semanal de posição em `buildCanonicalPairs`) **não se
> confirmou** como causa dos 8 casos medidos. No settlement, `buildCanonicalPairs` monta exatamente o nome do sorteio
> para as 8 duplas. A reprodução desta fase achou a causa real.

1. Uma dupla real semeada sem `Partnership` é sorteada (D-3) com o id `profile-pair:<idA>:<idB>` (ids ordenados) e o
   rótulo do sorteio na ordem da lista de atletas, por exemplo "Marc Quílez & Federico Mouriño".
2. Entre o sorteio e o settlement, o mercado de IA cria a `Partnership` desses mesmos dois atletas
   (`partnership-real_federico_mourino-…`, com início retroativo).
3. No settlement, `buildCanonicalPairs` passa a usar a `Partnership`, e o id `profile-pair:` do sorteio sai de
   `pairsById`.
4. `resolveDrawnPair` reconstrói a dupla pelo próprio id `profile-pair:`, com os membros na **ordem dos ids**, e o nome
   vira "Federico Mouriño & Marc Quílez".
5. A colocação era buscada por esse nome. Sem correspondência, ela caía no fallback `index + 1`, que é a posição da dupla
   na **ordem de força** (`pairScore`) e não o resultado. Isso deixava pontos, Race, ledger e, quando a dupla era
   finalista, os ids de campeão ou vice gravados errados.

A mesma família de falha ocorre quando, sem `Partnership` nova, os dois membros trocam de posição no ranking entre o
sorteio e o settlement e o nome reconstruído se inverte. Esse mecanismo é provocado e coberto no teste 2d.

## 2. Correção

`src/gameplay/worldTour/WorldTourLifecycle.js` (settlement AI-only): num torneio já sorteado, a colocação de cada dupla
resolve pelo **rótulo gravado no sorteio** para o mesmo `pair_id` (`draw_ranking_snapshot`, ou `participants` alinhado a
`draw_pair_ids`), que é exatamente o nome que a chave usa. A identidade continua sendo o id estável do sorteio, e os
atletas pontuados continuam sendo os membros desse id. O nome reconstruído não decide mais a colocação. Com a chave
carregando `pair_id` (homônimas, LOCAL-7E), a resolução por id já tinha precedência e segue igual.

Sem mudança em sorteio, estrutura de chave, fórmulas de pontos, política de aposentadoria (LOCAL-7G.1), ledger (LOCAL-7H)
e torneios com o jogador.

## 3. Duplas afetadas (reprodução, seed `repro-7h-ai`, 32 dias)

| Torneio | Dupla | Colocação real | Pontos antes | Pontos depois |
|---|---|---|---|---|
| Gold | Marc Quílez & Federico Mouriño | 1 (campeã) | 60 | **100** |
| Gold | Mariano Agustín González San Martín & Flavio Abbate | 22 (estreia) | 36 | **5** |
| Gold | Marc Sintes Villalonga & Enrique Goenaga | 3 (semifinal) | 18 | **36** |
| Gold | Francisco Cabeza Teres & Alonso Rodríguez Martínez | 13 | 5 | **9** |
| Gold | José Antonio Diestro & Ignacio Piotto Albornoz | 10 | 5 | **9** |
| Masters | Gonzalo Alfonso & Álex Chozas | 10 | 23 | **45** |
| Masters | Juanlu Esbrí & Alejandro Ruiz | 6 | 45 | **90** |
| Masters | Juan Tello & Javier Garrido | 20 | 45 | **23** |

Depois da correção, as 88 duplas dos 4 torneios pontuam pela colocação real (0 divergências). A Race e o ledger dessas
duplas acompanham.

## 4. Compatibilidade com saves

- Torneios concluídos não são reprocessados: a pontuação errada já gravada em torneios liquidados antes desta fase
  **permanece** (não há recálculo retroativo).
- Torneios sorteados e ainda pendentes num save antigo são liquidados corretamente. Saves de antes de 5.17, sem
  `draw_ranking_snapshot`, usam `participants` alinhado a `draw_pair_ids`. Sem nenhum dos dois, o comportamento é o anterior.
- Sem migração e sem mudança de formato.

## 5. Baselines da CLOUD-7B1

Cadeia de baselines, nenhum elo regravado (sha256 conferido antes e depois):

1. `equivalence-baseline.json`: histórico, anterior à CLOUD-7B1.
2. `equivalence-baseline-post-local-7g1.json`: pós-LOCAL-7G.1.
3. `equivalence-baseline-post-local-7h1.json` (**novo**): pós-LOCAL-7H.1, com `expected_divergence_from_previous`.

- **Primeira divergência em relação ao pós-7G.1: dia 29** da carreira `7b1-eq`. Nesse dia liquidam o Madri Gold
  (`tournament-2026-mad-gol-w05-2`) e o Doha Masters (`tournament-2026-doh-mas-w05-4`). Seis duplas do Madri e três do
  Doha passam a receber a colocação real. No Madri, Marc Quílez & Federico Mouriño foram vice: 36 → 60 pontos, e os ids
  do **vice gravado** passam a ser os deles (antes apontavam para outra dupla). Campeões inalterados.
- Chaves afetadas: `memoria-dia-30` e `memoria-dia-45`. As outras 4 continuam iguais ao histórico e ao pós-7G.1.
- O teste valida a cadeia:
  1. cada elo continua válido para as chaves que nenhum elo posterior declarou divergentes;
  2. cada divergência declarada é real;
  3. qualquer diferença em relação ao elo mais recente falha (regressão real).

  Resultado: 50 verificações. As gravações (`--record`, `--record-post-local-7g1` e `--record-post-local-7h1`)
  recusam sobrescrever um elo existente.

## 6. Testes

`npm run test:local-7h1-ai-pair-identity`: **15 verificações**.

- **Execução 1** (cenário exato da reprodução): todo o campo dos 4 torneios pela colocação real; as 8 duplas com os pontos
  da tabela acima; campeão e vice gravados = finalistas; Race das 8 = soma dos resultados reais do ano; ledger = partidas
  reais.
- **Execução 2** (ordem provocada num torneio sorteado): `Partnership` nova com membros na ordem inversa (2c); troca de
  posição no ranking (2d); aposentadoria de um integrante (2e, LOCAL-7G.1); homônimas (2f, LOCAL-7E); save/load antes do
  settlement (2b); um resultado por atleta (2h); idempotência e persistência (2i).
- **Determinismo**: duas execuções com a mesma seed, colocações e pontos idênticos.

No código anterior falham 1a, 1b, 1c, 1e e 2f. A 1d (Race) passa nele, porque a Race soma de forma coerente os mesmos
pontos errados. A 2c e a 2d também passam: no torneio sintético da execução 2, o fallback por ordem de força coincidiu
com a colocação real das duplas manipuladas. A 2f, sobre o campo inteiro de todos os torneios, pega o defeito nessa
mesma execução.

Ajuste em teste de fase anterior: `test-local-7h-pair-match-ledger` A1 passa a incluir as duplas `profile-pair`, que antes
ficavam de fora por causa deste defeito.

## 7. Desempenho

A correção monta um `Map` com o snapshot do sorteio (≤ 32 entradas) por torneio liquidado. Não há leitura extra nem
trabalho por tick. Medição intercalada, 3 rodadas, avanço de 10 dias:

| Cenário | Original (ms) | Corrigido (ms) |
|---|---|---|
| carreira nova | 1295, 1816, 1278 | 1444, 1274, 1071 |
| save CLOUD-7C com settlements acumulados | 2866, 3314, 3547 | 2950, 3364, 3319 |

Sem diferença mensurável.

## 8. Riscos restantes

- Pontos, Race e ledger errados em torneios **já liquidados** antes desta fase não são corrigidos.
- `resolveDrawnPair` continua reconstruindo o nome pela ordem dos ids. O nome só não decide mais a colocação: a notícia
  e o diagnóstico continuam usando o nome da chave (via campeão/vice resolvidos).
- O fallback `index + 1` continua existindo para um torneio sem rótulo de sorteio, o que só acontece em saves muito
  antigos (anteriores ao sorteio D-3).

## 9. Resultados

**66 de 66** execuções aprovadas:

- LOCAL-7H.1 (15/15), LOCAL-7H (23/23, agora incluindo `profile-pair`), LOCAL-7G.1, LOCAL-7G, LOCAL-7F, LOCAL-7E,
  LOCAL-7D, CLOUD-7D1 e CLOUD-6N;
- CLOUD-7B1 com `TZ=UTC` (50/50, cadeia de baselines), CLOUD-7B2A (determinismo), 7B2B e 7B2C;
- ranking (v522e/f/g, v523, v524, race, rolling window); settlement (`settlement-uses-persisted-draw-roster`,
  `parallel-tournament-settlement-v59`, `draw-recovery-field-parity-v517`, `draw-ranking-snapshot-v517`,
  `historical-draw-pair-snapshot-v526d`, walkover, bracket/historical); aposentadoria (`world-retirement`,
  `former-partner-reintegration-v518`, `extreme-elite-inactivity-v518`); persistência, world-save-load,
  world-idempotency e calendário;
- `npm run lint`, `npm run build`, `npm run validate:architecture` e `git diff --check`: limpos.

As falhas preexistentes conhecidas (`phase15-6-*`, `former-partner-world-continuity-v518` e as `team-ranking-*` antigas)
não foram reexecutadas nesta bateria: o comportamento delas é o documentado na LOCAL-7H.
