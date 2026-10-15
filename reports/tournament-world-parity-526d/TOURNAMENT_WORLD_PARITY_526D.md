# Paridade de campo com o mundo real — Playthrough 5.26-D

**ALIGN COMPETITION POPULATION · DO NOT TUNE DIFFICULTY YET.** Nenhum valor de
balanceamento foi alterado (thresholds Fácil/Médio/Difícil, prize money,
patrocínio, loja, salários, investimentos, XP, pontos de torneio, fórmulas de
ranking). As baselines `reports/progression-economy-526/`,
`reports/progression-integrity-526b/` e `reports/progression-clean-526c/`
seguem intactas.

Branch `feature/live-coach-dynamic-adaptation`, HEAD
`d5e5a2ed12107e3c16f9fb944e8fefe88e1c492f` (inalterado). Sem commit, sem push,
working tree preservado.

## Resumo

Até a 5.26-C os adversários dos torneios do jogador vinham do catálogo
**sintético** `BOTS_BY_DIFFICULTY` (`career.js:generateTournamentOpponent`),
nunca inscritas no circuito: 5 de 21.332 partidas tinham TeamRanking canônica,
1 tentativa de zebra e 0 zebras. A detecção funcionava; faltava população real.

A 5.26-D troca a FONTE (duplas reais ativas do mundo), não a lógica: o main
draw passa a ser montado pelo MESMO pool canônico do `ensureWorldTourDraws`
(`buildCanonicalPairs`), a MESMA elegibilidade (`evaluateTournamentEntry` com
`aiFieldContext`) e a MESMA pontuação de corte
(`blendedCutScore = pairScore · (0.35 + 0.65·tierFit/100)`), com a MESMA
exclusividade de agenda (`committedPairIdsForWindow`). Identidade canônica,
TeamRanking real, OVR canônico, roster comprometido e histórico imutável. O
qualifying também passou a usar duplas reais (as mais fracas elegíveis).

| Métrica (smoke 15×2) | 5.26-C | 5.26-D |
|---|---|---|
| Cobertura de rank do adversário | ~0% | **90,2%** (922 team-ranking / 100 unranked reais / 0 missing-roster) |
| Fallback sintético no campo | n/a (100% sintético) | **0 pares** em 1.022 duplas reais (0 sintéticas) |
| Tentativas de zebra | 0 | **373** |
| Zebras vencidas | 0 | **4** |
| Paridade OVR adversário (card = motor) | — | **0 mismatch** |
| Erros / soft-lock / shim / freezes | 0 | 0 / 0 / 0 / 0 |

**Impacto competitivo (agenda obrigatória da 5.27, fora do escopo desta
fase):** a população real é muito mais forte que os bots calibrados. O win rate
e a progressão caem em todos os tiers (ver §11). Isso é o resultado esperado
de alinhar a população — a distorção que a fase queria expor —, não um bug;
nenhum valor foi tunado.

---

## 1. De onde vinham os adversários antes?

`src/lib/tournamentDraw.js:createDrawnRun` chamava
`career.js:generateTournamentOpponent`, que sorteava 2 bots de
`BOTS_BY_DIFFICULTY` por rodada (dificuldade por `TIER_DIFFICULTY_PATHS` +
`teamRank`), e `buildFillerFactory` preenchia o resto da chave com o mesmo
gerador. A identidade persistida era o **id de template** (`player-real-*` /
`player-fictional-*`), sem linha no circuito.

## 2. Por que eram sintéticos?

O torneio do jogador é **excluído** do sorteio de IA
(`ensureWorldTourDraws` filtra `playerTournamentIds` por inscrição). A trilha do
jogador tinha um gerador próprio, nunca ligado ao universo canônico de duplas
(`buildCanonicalPairs`) — daí "quase nenhum adversário com rank".

## 3. Quantas duplas reais existem no mundo?

`buildCanonicalPairs` (Partnership ativa npc/world + vínculo `ai_partner_id`)
produz ~450–500 duplas num mundo recém-semeado, crescendo ao longo da carreira
(163 torneios do jogador no smoke; `candidatePool` mediano > 400).

## 4. Quantas estão ativas?

Todas as que passam `status:'ativa'` + membros não aposentados. O pool exclui
aposentados (`retired`/`career_status:'aposentado'`).

## 5. Quantas têm TeamRanking?

A semeadura cria ~500 linhas; `processWorldCircuit:updateTeamRankings`
materializa/reprojeta as linhas das duplas canônicas na primeira passada
semanal. No smoke: 922 adversários resolveram `team-ranking` e 100 eram duplas
reais legitimamente `unranked` (0–0 pontos).

## 6. Quantas ficam elegíveis por torneio?

`eligiblePool` mediano 300–400 por torneio (elegibilidade por tier via
`evaluateTournamentEntry` com `aiFieldContext`), das quais o campo usa o
tamanho do bracket (até 31) + qualifying.

## 7. Qual authority de admission foi preservada?

`blendedCutScore = pairScore · (0.35 + 0.65·getTierRankingFit(tier, pairEntryRank)/100)`
(exatamente a da 5.18/`ensureWorldTourDraws`), mais o resgate por adequação
(`rankCandidatesByTierFit`) quando o pool elegível não cobre o quadro. Nunca
"top TeamRanking puro". **Nuance documentada:** o `chooseTournament` da
atribuição semanal da IA (quem *escolhe* o tier) não é reexecutado para o
torneio do jogador; a entrada usa elegibilidade + `blendedCutScore` sobre o
pool real. Isso pode admitir duplas que a IA distribuiria em outro tier da
mesma semana — item para a 5.27.

## 8. Como o player pair entra no field?

A dupla do jogador é o roster comprometido (`resolveCommittedPartnerAthlete`).
Ela ocupa a posição de seed do jogador no campo real
(`buildSeededDrawSlots`), e o adversário de cada rodada é o melhor seed do
bloco-espelho (`buildPlayerTournamentField`), a mesma matemática usada antes
com ranks sintéticos.

## 9. Como evita atleta duplicado?

`buildCanonicalPairs` já deduplica atletas num par (set `seen`); o campo real
exclui o parceiro comprometido e o id do jogador; a projeção nunca repete a
mesma dupla em duas rodadas do caminho. Hard gate: 0.

## 10. Como evita torneio paralelo?

O sorteio persiste `draw_pair_ids`; `committedPairIdsForWindow` as marca como
comprometidas para qualquer torneio de IA com janela sobreposta, e o torneio do
jogador é excluído de `ensureWorldTourDraws`/`resolveCompletedWorldTourEvents`
pela autoridade da inscrição. Hard gate: 0.

## 11. Pair identity é qual?

`buildCanonicalPairs.id` (id da `Partnership` ou `profile-pair:<ids>`), com
`member_ids` ordenados. Nada de `catalog-pair-1`/`synthetic-opponent-17`.

## 12. O que fica persistido no draw?

`Tournament.draw_pair_ids` (duplas reais efetivamente usadas) e
`draw_ranking_snapshot` (`pair_id`, `name`, `rank`, `points`, `member_ids` do
instante do sorteio), além de `draw_field_origin_version`,
`draw_real_pair_count`, `draw_fallback_pair_count`, `draw_participant_count`. O
`tournament_run` guarda, por partida, `opponentPairId` e `opponentSource`; o
roster adversário é **identidade mínima** (id, nome, OVR, lado, mão, estilo),
nunca o AthleteProfile inteiro (Bloco P).

## 13. TeamRank é snapshot ou live?

**Snapshot no draw** (`draw_ranking_snapshot`) e **snapshot no registro da
partida** (`opponent_rank`, `team_rank_at_match`). A resolução viva
(`getCanonicalTeamWorldRank`) é usada só no instante do confronto; mudanças
posteriores não reescrevem nada.

## 14. OVR é snapshot ou live?

Atributos/identidade do adversário são **snapshot** do sorteio (identidade
mínima persistida); o OVR que o motor usa é o campo `overall_rating` canônico
desse snapshot — mesma autoridade do card (`baseOverallRating`), paridade exata
(0 mismatch no smoke, main draw e qualifying).

## 15. Quantos adversários tinham rank antes?

5 de 21.332 partidas (5.26-C).

## 16. Quantos têm agora?

Smoke: 922 adversários `team-ranking` + 100 unranked reais; 0 `missing-roster`.

## 17. Ranked coverage total?

**90,2%** (contra ~0%).

## 18. Por tier?

`difficulty.json:fieldImpact`: Bronze 71,3% · Silver 99,6% · Gold 100% ·
Platinum 99,1% · Masters 100% · Elite 100% (main draw).

## 19. Quantos unranked reais?

100 partidas contra duplas reais legitimamente sem ranking (0–0 pontos) — "Sem
ranking", nunca proxy.

## 20. Quantos synthetic fallback?

**0 pares** no smoke (1.022 duplas reais, 0 sintéticas).

## 21. Em quais tiers?

Nenhum. O fallback só apareceria se o pool real não cobrisse o bracket.

## 22. Upset detection funciona com esses ranks?

Sim: 373 oportunidades reais, 4 zebras, regra inalterada
(`teamRanking.isUpsetResult`).

## 23. Quantas oportunidades de zebra?

373.

## 24. Quantas zebras vencidas?

4.

## 25. Draw muda depois de partnership change?

Não (idempotência + `draw_pair_ids`). Teste dedicado.

## 26. Draw muda depois de retirement?

Não. Teste dedicado (aposentar um atleta adversário não reescreve).

## 27. Save/reload preserva?

Sim. Carreiras seed 5 recarregaram o runtime a cada 180 dias (4 reloads cada);
`draw_pair_ids`/snapshot/run idênticos; testes de idempotência.

## 28. Same seed reproduz?

Sim — `buildPlayerTournamentField` 2× idêntico (adversários, campo, ranks),
sem `Math.random`.

## 29. Admission mudou?

A fórmula de corte não. Mudou só a fonte do pool (catálogo → mundo).

## 30. Match formula mudou?

Não.

## 31. Difficulty thresholds mudaram?

Não.

## 32–34. Easy/Medium/Hard WR antes/depois

| Classe | 5.26-C (smoke) | 5.26-D (smoke) |
|---|---|---|
| Fácil (Bronze/Silver) | 44,9% (n=677) | 7,9% (n=572) |
| Médio (Gold/Platinum) | 73,1% (n=1138) | 22,2% (n=418) |
| Difícil (Masters+) | 53,8% (n=301) | 15,6% (n=32) |

## 35. Win rate por tier

| Tier | 5.26-C | 5.26-D |
|---|---|---|
| Bronze | 46,2 | 10,2 |
| Silver | 42,9 | 4,3 |
| Gold | 74,3 | 21,5 |
| Platinum | 72,0 | 23,5 |
| Masters | 56,7 | 11,5 |
| Elite | 56,0 | 33,3 (n=6) |
| Crown | 29,4 | — (sem amostra) |
| Circuit Finals | 50,0 | — |
| Legacy Finals | 33,3 | — |

## 36. R1/SF/F

| Rodada | 5.26-C | 5.26-D |
|---|---|---|
| Q | 51,2% | 23,4% |
| R1 | 70,7% | 10,8% |
| R2 | 67,0% | 22,4% |
| QF | 58,7% | 31,8% |
| SF | 42,6% | 16,7% |
| F | 26,8% | 0% (n=2) |

## 37. Rank mediano @1y

casual #425 · normal #465 · otimizador #475 (5.26-C smoke: 342/343/420).

## 38. @2y

casual #145 · normal #154 · otimizador #270 (5.26-C smoke: 52/9/4).

## 39. Títulos @2y

Mediana 0 em todos os perfis (5.26-C: 1). Top500 100%; Top50 0–20%; Top10/#1
0%. Delta de força mediano −12,4 OVR (5.26-C: +29,4).

## 40. Progressão ficou mais realista?

Não no sentido competitivo: ficou **mais difícil e real**, mas o jogador deixa
de conseguir progredir (colapsa em ~#145–270). É o achado central da fase e a
agenda da 5.27 (rebalancear a progressão/economia à população real).

## 41. Performance do draw

`buildPlayerTournamentField` ~40–50 ms no harness (Vite SSR, leitura única de
atletas/parcerias/torneios + 1 resolução de rank); nenhuma tarefa > 1 s;
sorteio completo < 4 s em teste.

## 42. Save cresceu?

A entry guarda identidade mínima (10 campos), não o AthleteProfile inteiro;
`draw_pair_ids`/snapshot são pequenos. Delta desprezível (Bloco P).

## 43. Testes/regressões

12 testes novos (`scripts/test-*-v526d.mjs`): **12/12**. Regressões de torneio
relevantes (`test-tournament-draw-reload-idempotency`,
`test-settlement-uses-persisted-draw-roster`,
`test-historical-opponent-pair-rank-v526c`, `test-opponent-rank-real-source`,
`test-player-registration-real-flow`): verdes.

## 44. lint/build/diff-check/commit/push

lint verde · build verde · `git diff --check` limpo · sem commit · sem push.

## 45. VEREDITO

**A** — a arquitetura/paridade está completa e provada: todos os hard gates e
os 34 critérios de A foram atendidos (cobertura de rank 0→90,2%, fallback
sintético 0, 0 mismatch de OVR, zebras reais medidas, determinismo, histórico
imutável, nenhum valor de balanceamento alterado).

**Ressalvas obrigatórias (não bloqueiam o A desta fase, definem a 5.27):**
1. **Colapso de dificuldade/progressão.** A população real é muito mais forte
   que os bots calibrados (R1 10,8%; Silver 4,3%; rank@2y ~#145–270; 0 títulos).
   Nenhum tier continua realista — exatamente o que a fase mandou medir e
   *não* tunar. A 5.27 deve rebalancear.
2. **Fila de admissão.** O `chooseTournament` da atribuição semanal da IA não é
   reexecutado para o torneio do jogador; o campo usa elegibilidade +
   `blendedCutScore` sobre o pool real, podendo admitir duplas que a IA
   distribuiria em outro tier. Item de paridade fina para a 5.27.
