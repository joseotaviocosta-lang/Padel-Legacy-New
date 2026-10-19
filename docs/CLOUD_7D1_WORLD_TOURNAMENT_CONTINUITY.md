# CLOUD-7D1 — Continuidade independente dos torneios mundiais

Branch `cloud/phase-7d1-world-tournament-continuity`, criada de `edde2b0` (confirmado: commit existente, é o HEAD de `cloud/phase-7c-long-career-validation`, working tree limpo). `main`, branches anteriores e saves reais não foram tocados; compactação incremental continua desligada e não foi modificada.

## 1. Veredito

| Pergunta | Resposta |
|---|---|
| O defeito existe no jogo? | **Sim. É defeito de produção, não limitação do adaptador.** |
| Causa | A eliminação (ou W.O.) do jogador **no qualifying** nunca fecha a vaga dele na chave canônica do torneio. |
| Correção | Mínima: a dupla que eliminou o jogador herda a vaga na rodada 0 e o restante da chave usa o mesmo motor determinístico do AI-only. Reparo automático de torneios já travados em saves existentes. |
| Resultado | Temporada 1, jogador ativo: **0 torneios vencidos sem campeão** (antes: 6). Sem jogador: 125/125 iniciados concluídos. |

## 2. Fluxo real × adaptador (Etapa B)

A UI React não foi montada (limitação da fase). A comparação é por leitura de código e por execução das **mesmas funções de produção**:

| Passo | Produção (`TournamentModal.jsx`, antes da correção) | Adaptador `cloud-7c-long-career.mjs` |
|---|---|---|
| Registrar resultado no run | `recordTournamentMatchResult` | idem |
| Aplicar na chave canônica | `applyPlayerMatchToCanonicalBracket` **somente se `completedMatch.stage === 'main'`**; senão mantém `baseTournament.bracket_history` | idem, mesma condição |
| Abandono (`abandonTournament`) | só `abandonedMatch.stage === 'main'` altera a chave | não modelado |
| W.O. automático (`resolveUnavailablePlayerMatch`, usado por `calendarSystem`/`calendarLifecycle`) | só `currentMatch.stage === 'main'` | não modelado |
| Finalização | `prepareTournamentFinalization` | idem |
| Omitido pelo adaptador | mídia/entrevistas, estado físico, `Partnership`, `TeamRanking` do modal, checkpoint de partida, `persistRun` | — nenhum toca `bracket_history` nem o fechamento do torneio |

Os três caminhos de produção que terminam a campanha do jogador tratavam apenas a chave principal. Logo, o adaptador reproduzia fielmente o fluxo e o defeito é do jogo. (O cabeçalho do adaptador dizia que ele não passava por `applyPlayerMatchToCanonicalBracket`; está desatualizado — passa, para `stage==='main'`.)

## 3. Reprodução (Etapa B)

- **Temporada 1 reexecutada sem a correção** (seed `7c`, adaptador): 275 torneios programados, 125 iniciados, 119 concluídos, **6 vencidos sem campeão** (todos eliminações do jogador no qualifying; `diag-qualifying-pending-season1-before-fix.json`). Os 3 casos restantes dos 9 da 7C ocorrem nas temporadas 2–10; não foram reexecutados (orçamento), o mecanismo é o mesmo.
- **Fixture da 7C** (`active-player-save-season1-baseline.json.gz`, 2027-01-05): **7 torneios travados**, todos Gold, eliminação em "Quartas do qualifying" (placares 0-6/1-6/2-6…), com 57 a 246 dias de atraso. Estado antes: `em_andamento`, sem campeão/vice, sem `WorldEvent` de resultado, `world_tour_resolved` ausente. Detalhe por torneio (id, data, rodada, placar, antes/depois) em `data/qualifying-cases-before-after.json`.
- Estado do torneio logo após a eliminação: 15/16 partidas da rodada 0, 7/8, 3/4, 1/2 decididas pelo sorteio (a chave do mundo é pré-resolvida); só a cadeia do jogador (rodada 0 `player_match`, `scheduled`, sem vencedor) permanecia aberta, e a Final sem vencedor. Após o fim previsto e após vários dias: idêntico, indefinidamente.

## 4. Causa exata

1. O sorteio grava a vaga do jogador na rodada 0 da chave canônica (`player_match: true`, `team_a` = dupla do jogador), mesmo quando ele ainda precisa passar pelo qualifying.
2. Torneio com jogador + chave v2 é **excluído** da fila AI-only (`isWorldTourResolutionPending`, `WorldTourLifecycle.js`) para evitar duas autoridades; a única autoridade passa a ser `tournamentLifecycle.js` (`prepareTournamentFinalization` e o tick diário `resolvePendingPlayerCanonicalTournaments`).
3. Ambos decidem o campeão com `deriveTournamentFactsFromFullBracket`, que devolve `null` se **qualquer** partida estiver sem vencedor.
4. Eliminado no qualifying, nenhum código preenchia a vaga (derrota na chave principal dispara a cascata AI-only; no qualifying não existia equivalente). O torneio ficava fora das duas filas para sempre.

Dependência da UI (Etapa D): o mundo **não** depende de tela aberta, clique ou confirmação para avançar; torneios sem jogador e torneios com jogador na chave principal fecham no tick diário. A única etapa dependente da UI era registrar a saída do jogador na chave quando ele era eliminado no qualifying — e ela simplesmente não existia. Agora também há reparo no tick diário (sem UI).

## 5. Correção (Etapa E)

| Arquivo | Mudança |
|---|---|
| `src/gameplay/worldTour/tournamentSettlement.js` | Nova `applyQualifyingExitToCanonicalBracket` e `opponentTeamNameOfRunMatch`. A cascata AI-only foi extraída para `cascadeAiOnlyRounds`/`refreshRoundStatuses` **sem mudar comportamento** (24 combinações chave × rodada × resultado comparadas com a versão anterior: 0 diferenças). |
| `src/components/tournaments/TournamentModal.jsx` | Derrota no qualifying e abandono durante o qualifying chamam a nova função. |
| `src/game-core/tournamentLifecycle.js` | (a) W.O. automático durante o qualifying; (b) `resolvePendingPlayerCanonicalTournaments` repara a vaga aberta quando o run mostra saída no qualifying (cura saves existentes); (c) o crédito ao adversário da final usa a última partida **principal** do run (antes usava o índice da chave, deslocado pelas rodadas de qualifying) e só credita se esse adversário é de fato o campeão. |
| `scripts/cloud-7c-long-career.mjs` | Adaptador espelha o modal; opções `--noPlayerRegistration` e `--legacyQualifyingFlow`. |

Regra adotada: a vaga vira a da dupla que **eliminou** o jogador; a partida da rodada 0 e as seguintes são decididas pelo motor determinístico já usado para toda partida da IA (`chooseWinner`/`fillerTeamStrength`). Não há W.O. atribuído, campeão inventado, partida já disputada alterada, fórmula de simulação/ranking/evolução alterada, nem torneio marcado como concluído sem chave resolvida. Idempotente (chave já decidida é devolvida intacta); a premiação do jogador continua protegida por `processed_tournament_runs`.

## 6. Cenários (Etapa C) e testes (`npm run test:cloud-7d1-world-continuity`, 38 verificações)

| Cenário | Cobertura | Resultado |
|---|---|---|
| A. Jogador não inscrito | Teste D (110 dias, carreira nova, sem inscrição) e temporada `--noPlayerRegistration` | Todo torneio vencido há >14 dias tem campeão, WorldEvent e ranking, sem duplicidade; 125/125 concluídos na temporada |
| B. Eliminado no qualifying | Testes A0–A11 (chave pura), B (fixture, 7 torneios), temporada | Antes: 0/7 fecham; depois: 7/7 em 1 tick, chave completa, 32 colocações, campeão ≠ jogador |
| — eliminação na 1ª e na última rodada do qualifying | A1 e A11 (mesma função; na fixture todas as saídas foram na 1ª rodada) | OK |
| C/D. Eliminado na 1ª rodada principal / semifinal | A12 (todas as rodadas, 0–4) + 24 comparações com o código anterior | Chave sempre chega à final com campeão; comportamento inalterado |
| E. Jogador campeão | A13 | Chave fecha com o jogador campeão |
| F. Jogador sem torneios na temporada | Temporada `--noPlayerRegistration` | 125/125 concluídos, 0 pendentes vencidos |
| G. Avanço rápido | Testes B/C/D avançam dia a dia sem nenhuma tela | OK |
| H. Save/load durante a competição | C1–C5 (recarga após o reparo + 14 dias) | Campeões, chaves, WorldEvents e ranking idênticos; sem duplicidade |
| Torneios simultâneos em locais diferentes | D2 | Ambos concluem |
| Premiação sem duplicidade / ranking | B5–B7, B9, C3, C5, D3, D4 | Sem WorldEvent/id de ranking duplicado; linhas, moedas e runs processadas do jogador inalteradas; torneios já finalizados byte a byte iguais (B4) |
| Jogador não volta ao mesmo torneio | B8 | Run continua `eliminated`, partidas inalteradas |

**Não coberto por teste dedicado** (só pelo mesmo helper compartilhado): abandono manual e W.O. automático *durante o qualifying*, via `resolveUnavailablePlayerMatch`/modal; UI React não montada.

## 7. Temporada completa (jogador ativo, jogador ausente)

| | Programados | Iniciados | Concluídos (campeão) | Pendentes iniciados | Futuros | WorldEvents | Saídas no qualifying | Torneios na chave principal |
|---|---|---|---|---|---|---|---|---|
| Antes, jogador ativo | 275 | 125 | 119 | **6** | 150 | 118 | 6 | 32 |
| Depois, jogador ativo | 275 | 125 | **125** | **0** | 150 | 124 | 7 | 32 |
| Depois, sem jogador | 275 | 125 | **125** | **0** | 150 | 124 | 0 | 0 |

Os 150 futuros são legítimos (calendário de 15 meses). Rankings: nenhum id de resultado duplicado. Um torneio concluído sem WorldEvent/ranking em todos os cenários (`tournament-2026-rom-exh-2026`) é uma exibição pré-definida fora do circuito (comportamento preexistente). Os mundos "antes" e "depois" divergem a partir da primeira cura (a chave mudou), então só a comparação por fixture é estado-idêntico. Apenas 1 temporada por cenário; não foram feitas dez temporadas.

## 8. Duplas com o mesmo nome (auditoria separada; **sem alteração de código**)

- **Evidência 7C** (temporada 10): 4 atletas distintos ("Hugo López" ×2, "Rafael López" ×2) formaram duas parcerias (2034-03-01 e 2034-04-01) com o mesmo nome de exibição "Hugo López & Rafael López". 3 torneios Gold afetados; **primeiro: sorteio de `tournament-2035-riy-gol-w26-2` em 2035-06-25** (liquidado em 2035-07-03). Dois mostram a equipe duplicada nas colocações (24 duplas, 23 nomes); `tournament-2035-tor-gol-w31-2` funde as duas numa só (23 colocações para 24 duplas) — caso silencioso. Esses dados não foram regenerados (exigem a carreira de 10 temporadas, fora do orçamento).
- **Reprodução do mecanismo** com funções reais (`diagnose-cloud-7d1-duplicate-team-names.mjs`): 8 duplas por ID, 7 por nome; ambas as duplas homônimas recebem a mesma posição (6) na busca por nome; 8 colocações, 7 equipes únicas.
- **Camadas**: identidade por **ID** correta em atletas, `Partnership`/`draw_pair_ids`, `TeamRanking` e `AthleteRankingResult`; identidade por **nome** em `buildCanonicalTournamentBracket`, colocações, `placementByTeam` do liquidador, vencedor/campeão e histórico exibido. Origem: o gerador de atletas não garante nomes únicos.
- **Riscos**: pontos/premiação da dupla errada (`ordered.find(pair => pair.name === champion)` escolhe a primeira homônima), colocação duplicada, dupla "fundida" quando as homônimas se enfrentam. Ocorrência medida: 3 em 1 240 torneios (0 até a temporada 5), crescente com a população.
- **Proposta (para fase própria, não implementada)**: (1) identificar equipes na chave/colocações por `pair.id` e mostrar o nome só como rótulo; ou (2) a mais barata, garantir nome de exibição único por dupla ativa no momento da formação. Exige migração de chaves históricas e cobre vários pontos; não é indispensável à continuidade dos torneios.

## 9. Regressão

Aprovadas (exit 0): `cloud-7d1`, `cloud-6n-career-flows`, `cloud-7b1-save-pipeline`, `cloud-7b2a-determinism`, `cloud-7b2b-historical-compaction`, `cloud-7b2c-incremental-compaction`, `career-persistence-integrity`, `mobile-persistence-m3-7`, `browser-career-storage`, `tournament-canonical-results`, `tournament-result-authority`, `tournament-flow-rc`, `tournament-draw-name-collision`, `tournament-match-lifecycle`, `tournament-resume-recovery`, `tournament-round-availability`, `phase15-5-2-tournament-continuity`, `living-world`, `calendar-advance`, `ranking-consistency`, `ranking-rolling-window-fase4`, `world-save-load`, `world-idempotency`, e os scripts walkover, bracket-winner-propagation, historical-bracket-integrity, no-current-partnership-bracket-rebuild, playthrough-4-3/4-5, parallel-tournament-settlement-v59, legacy-save-tournament-continuity-v517, player-missed-registration-real-flow, race-early-elimination-champion-credit (esta falhou com a primeira versão do guarda de crédito — que exigia nome idêntico — e passou após ajustá-lo). `npm run lint`, `npm run build`, `npm run validate:architecture` e `git diff --check`: limpos.

**Falham também no commit base `edde2b0` (confirmado com `git stash`, não causadas por esta fase):** `test:phase15-6-1-tournament-draw-consistency` ("D-7: nenhuma chave existe ainda") e `test:phase15-6-2-tournament-canonical-state` ("inscrição real deve suceder mesmo com a linha seed já presente"). Logs em `reports/.../data/regression/`.

**Não executados:** suítes de UI/navegação, `test:onboarding*`, `test:ui-*`, Tauri/Android, dez temporadas, compactação ligada.

## 10. Riscos e limitações

1. A dupla que herda a vaga é a que eliminou o jogador; quando a saída ocorre antes da última rodada do qualifying, ela pode não ser a classificada "real" (o qualifying das demais duplas não é simulado — ele é sintético). Na fixture todas as saídas foram na 1ª rodada.
2. Por desenho preexistente, em torneio com jogador só a dupla da final do run recebe crédito de ranking individual; a dupla que herda a vaga não recebe pontos como finalista/campeã. O guarda de crédito evita creditar quem não é campeão, mas não resolve essa limitação.
3. Torneios já finalizados antes desta fase não são reprocessados (nenhum resultado disputado é alterado); só os travados são curados no próximo tick, com a data de resolução do dia do reparo.
4. UI React não exercitada; abandono/W.O. no qualifying sem teste dedicado.
5. Uma temporada por cenário, uma seed.
6. A chave do torneio agora pode não conter a dupla do jogador na rodada 0 (nome substituído); consumidores da chave que procurem o jogador por `player_match` continuam funcionando, mas a UI de chave não foi inspecionada visualmente.

## 11. Recomendações

1. Fase própria para identidade de dupla por ID (ou nome único) na chave/colocações/liquidação (§8).
2. Teste de UI (Playwright) do `TournamentModal` cobrindo derrota e abandono no qualifying.
3. Simular o qualifying das demais duplas para que a classificada real ocupe a vaga e receba ranking.
4. Repetir a validação longa (10 temporadas) uma única vez após integrar esta correção.
5. Investigar as duas falhas preexistentes `phase15-6-1`/`phase15-6-2`.
