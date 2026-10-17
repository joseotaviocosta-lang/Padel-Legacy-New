# CLOUD-6H — Tournament Selection Consistency & Prediction Reliability

| Item | Valor |
|---|---|
| Origem | `cloud/phase-6g-tournament-selection-audit` @ `c02c713` (worktree limpo na partida) |
| Branch | `cloud/phase-6h-tournament-consistency` (local, **sem push, sem PR**) |
| Estado inicial | HEAD `c02c713`, nenhum arquivo modificado; `npm ci` rodado (node_modules ignorado) |

Não houve alteração de regras de elegibilidade, limites de ranking, composição de campos, balanceamento, treino, economia, fadiga, schema de saves, versão ou contratos de IA. Nenhuma carreira completa nem lote de partidas foi executado.

## 1. Causas identificadas

1. **Seleção do simulador (D1/D2 da 6G).** `scripts/sim-progression-economy-v526.mjs` filtrava `minRanking` pelo rank **individual** (`getWorldRank`) e só aceitava entrada direta (`rank ≤ minRanking`). O jogo (tela e `registerTournament`) usa o rank da **dupla** via `evaluateTournamentEntry(buildAthleteEntryContext(perfil, teamRank, torneio))`, que também admite qualifying (Gold 451–900 etc.). A política de encaixe `best-fit` também usava o rank individual em `isRankInTierDiagnosticCore`.
2. **Chance de título (D3).** `getTournamentChoiceProfile(torneio, teamRank)` calcula `titleChance = clamp(2, 78, fit_do_rank·0,55 + (100−prestígio)·0,18)`; o `fit` é um trapézio sobre o **rank**. Não recebe OVR da dupla, OVR dos adversários nem o campo sorteado; `semifinalChance` é `titleChance·1,5+8`. É um índice heurístico, não uma probabilidade.
3. **Seeding (D6).** `buildPlayerTournamentField` usa `effectivePlayerRank = min(playerRank, bracketSize)`; ver §7.

## 2. Arquivos de produção modificados

| Arquivo | Mudança |
|---|---|
| `src/pages/Tournaments.jsx` | A "Análise do treinador" usa `buildCoachAnalysisRows` e exibe a nota de projeção aproximada |
| `src/lib/tournamentProjectionDisplay.js` (novo) | Linhas e nota da análise (função pura) |

Ferramental (não é código do jogo): `scripts/lib/v526Actions.mjs`, `scripts/sim-progression-economy-v526.mjs`, `scripts/test-tournament-consistency-6h.mjs` (novo).

## 3. Correções

- **Simulador:** novas `resolveGameTeamRank`, `gameEntryFor`, `selectionRankFilter` (em `v526Actions.mjs`). O filtro "perfis atentos" passa a ser `evaluateTournamentEntry(...).eligible` com o rank da dupla (mesma fonte do jogo, inclusive Gold/Platinum/Masters por qualifying e o recuo ao rank individual quando a dupla não tem ranking). `best-fit` usa o mesmo rank do jogo. `tryRegister` reutiliza `resolveGameTeamRank` (comportamento idêntico). Nenhum critério novo.
- **Histórico explícito:** `PL526_LEGACY_INDIVIDUAL_RANK_SELECTION=1` restaura o filtro antigo (rank individual, só entrada direta) para reproduzir relatórios 6D/6G. Padrão = comportamento correto.
- **Chance de título:** a UI deixa de mostrar "Chance de título X%" e "Chance de semifinal Y%" (agora "Não estimada") e acrescenta: *"Projeção aproximada pelo ranking da dupla. Não considera a força dos adversários nem o campo sorteado."* Lucro e pontos esperados (derivados do mesmo índice) ficam rotulados "(aprox.)". Nenhum percentual novo foi inventado e nenhuma simulação de calibração foi feita.

## 4. Comportamento anterior × posterior

| Caso | Antes | Depois |
|---|---|---|
| Simulador, individual 600 / dupla 600 | Gold escondido | Gold (qualifying) oferecido, como no jogo |
| Simulador, individual 437 / dupla 462 | Gold tratado como entrada direta visível | Gold por qualifying (dupla 462) |
| Simulador, dupla 300 / individual 700 | Nada acima de Bronze/Silver visível | Gold direto, como no jogo |
| Card, Gold com rank 443 | "Chance de título 40%" (motor: ~0% na 1ª rodada) | "Não estimada" + nota de projeção por ranking |
| Jogo real (elegibilidade, inscrição, sorteio, resultados) | — | **inalterado** |

## 5. Testes executados

| Teste | Resultado |
|---|---|
| `scripts/test-tournament-consistency-6h.mjs` (novo, determinístico) | 12/12 PASS |
| `test-tournament-selection-divergence-6g.mjs` | 9/9 PASS (continua fixando o comportamento do **jogo**; o filtro legado é local ao teste) |
| `test-tier-transition-boundary-6f.mjs` | 17/17 PASS |
| `test:admission-matrix-v522f` | 11/11 PASS |
| `test-tournament-teamrank-resolution-v526d.mjs` | 4/4 PASS |
| `test-tournament-registration-v2.mjs` | exit 0 |
| `test:tier-ladder-migration-fase3` | 13 gates PASS |
| `test:career-persistence-integrity` | 53 gates PASS |
| `eslint --quiet` nos 5 arquivos tocados | sem erros |
| `npm run build` | OK |

Falhas preexistentes: nenhuma observada. Regressões novas: nenhuma. O aviso `TAURI_UNSUPPORTED` do backup nativo no kit de testes é ruído conhecido do ambiente sem Tauri. Não há teste de renderização da interface (a UI é coberta pela função pura e pelo build).

## 6. Auditoria da chance de título

- **Informação usada:** só `teamRank` e a config do tier (prestígio, prêmio, taxa). **Não** usa OVR, nem adversários, nem campo; **não** é atualizada após inscrição/sorteio (a assinatura não recebe o sorteio).
- **O que o percentual mede:** um índice de adequação do rank ao tier, não P(título). Não há estimativa probabilística validada no código.
- **Cenários 6E/6G:** Gold com rank 443 = 40% (fixado em teste B1) contra ~0% de vitória na 1ª rodada no motor; Silver 69%, Bronze 47%; rank 462 (qualifying) = 65%.
- **Decisão:** não substituir por outro percentual. A exibição passou a ser qualitativa/explicativa. `getTournamentChoiceProfile` ficou intacto porque alimenta `TournamentSelectionAI` (pesos da IA), `weeklyCareerReview` (recomendação, "força do campo" em `getTournamentPlanningFieldStrength`) e `careerCommunications` (tom do treinador). Esses consumidores ainda mostram rótulos derivados do mesmo índice (ex.: "Fraco/Forte"); ver recomendações.

## 7. Auditoria do seeding (sem alteração)

1. **Por quê nº 1:** o campo é de 31 duplas reais com rank real (mundo semeado: todas com rank > 32, rank 462 no pior). O jogador entra com `seedRank = min(rankDaDupla, bracketSize) = 32`; `buildSeededDrawSlots` ordena por `seedRank` crescente, então 32 < 248+ ⇒ cabeça de chave nº 1.
2. **Quando:** em todo torneio do jogador em que o rank da dupla é pior que o tamanho da chave (8/16/32) e os demais têm rank real maior que isso — na prática, qualquer carreira fora do top 32. Dupla sem ranking (`playerRank 0` → posição 0,75·tamanho ≈ 24) também vira nº 1. Teste C2/C3: ranks 443, 9999 e 0 geram exatamente a mesma chave.
3. **Intencional?** Provavelmente herdado: `computeSeededOpponentRanksForMainDraw` (`tournamentDraw.js`) usa o mesmo `min(rank, size)` numa prévia **sintética** em que os ranks são 1..N, onde o clamp faz sentido. O campo real (5.26-D) reaproveitou a ideia sem trocar o domínio de ranks. Não há comentário que declare "jogador = melhor seed" como regra. **[HIPÓTESE]** quanto à intenção; o comportamento é **[CÓDIGO+TESTE]**.
4. **Ranking real usado?** Para os NPCs sim (`pairSeedRank`); para o jogador só até o teto `bracketSize`, ou seja, na prática não.
5. **Diferença jogador × NPC:** NPCs são seedados pelo rank real; o jogador pelo rank truncado. O adversário de cada rodada é o melhor seed do bloco-espelho.
6. **Efeito de mudar:** no mundo do teste (Gold, dupla 443) a 1ª rodada hoje é contra o rank 462 (pior seed do campo); com seeding honesto seria contra o rank 271 (melhor seed) — 1ª rodada mais difícil, caminho inteiro diferente. Mudar também altera pontos, histórico de campeões e o equilíbrio medido (5.5/6E). Teste C4 fixa a diferença.

Não foi alterado nesta fase. Teste de caracterização: `scripts/test-tournament-consistency-6h.mjs` (C1–C4).

## 8. Riscos de regressão

- Simulador: relatórios futuros mudam por construção (mais Gold por qualifying); comparar com 6D/6G só com a variável de ambiente legada.
- UI: some o percentual de título/semifinal; textos/strings do card mudam. Nenhum teste existente referenciava esses textos.
- Os consumidores de `titleChance` fora do card (planejamento semanal, tom do treinador, IA) continuam enviesados pelo rank.

## 9. Compatibilidade com saves

Sem mudança de schema, de entidades, de `Tournament`/`TournamentRegistration`/`CalendarEvent` ou de versão. Teste de migração de escada e de persistência passaram.

## 10. Limitações

- Não foi feita carreira completa nem novo lote de partidas (restrição de custo); o efeito do simulador corrigido nas métricas de progressão não foi remedido.
- O seeding foi caracterizado em um único mundo semeado (dia ~8), um torneio Gold.
- Sem teste de interface renderizada.
- O filtro "atento" agora admite qualifying; perfis `respectMinRanking=false` seguem sem filtro e dependem de `registerTournament`, como antes.

## 11. Recomendações para CLOUD-6I

1. Decisão humana sobre D6: manter "jogador = nº 1" (intencional) ou usar o rank real; se mudar, medir o impacto em poucas sementes e ajustar expectativas de dificuldade.
2. Rotular ou substituir os demais consumidores rank-only (`getTournamentPlanningFieldStrength`, tom do treinador) por indicador de risco que use OVR da dupla e do campo, só após existir uma estimativa validada.
3. Reexecutar **um** perfil por política com o simulador corrigido para refazer a pergunta "existe degrau Silver→Gold?".
4. Tratar D5 (par sem ranking recai no individual) e D7 (brechas de prioridade/wildcard) se a decisão de design for agir.

## 12. Commit final

Ver `git log -1` em `cloud/phase-6h-tournament-consistency` (commit local, **não publicado**).
