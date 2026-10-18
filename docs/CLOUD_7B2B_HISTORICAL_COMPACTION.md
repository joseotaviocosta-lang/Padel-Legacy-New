# CLOUD-7B2B — Compactação histórica de torneios finalizados

## 1. Resumo executivo

- **Resultado: protótipo validado, compactação NÃO ativa em produção.** O codec reduz o save com preservação comprovada do histórico, mas custa mais CPU por gravação do que economiza em bytes. Ativá-lo pioraria o avanço diário, então a gravação compacta fica atrás de uma chave desligada.
- Redução medida (Node, mesmos saves, 9 repetições alternadas): **−6,2 % (12,3 MB, 1 temporada)** e **−12,1 % (31 MB, 5 temporadas)**. Torneios finalizados encolhem **−34,6 % / −34,3 %**. A meta de 20–30 % **não foi atingida** sem tocar na forma de `bracket_history`, o que exigiria adaptar ≥7 leitores.
- Custo medido: gravação **+88 % (1 temp.) / +187 % (5 temp.)**, carga **+34 % / +48 %** (mediana). Sem cache do empacotamento, o ganho em bytes não paga o custo.
- Integridade: 49 verificações próprias aprovadas (equivalência, sem compactação prematura, compatibilidade, falhas, continuidade); suítes de regressão aprovadas com a chave desligada, e com ela ligada exceto a que compara bytes com o baseline pré-7B2B (esperado, §9).
- Nenhuma regra de jogo, RNG, `selectPair`, ids, premiações ou `WorldEvent`/`CareerMessage`/`AthleteRankingResult`/`AnnualCareerReport` foram alterados.

## 2. Base Git

Branch `cloud/phase-7b2b-historical-compaction`, derivada exatamente de `86f7307` (ancestrais verificados: `7795e8e`, `9804adc`, `d264c22`; working tree limpo). `main` e branches anteriores intocadas.

## 3. Mapa de dependências

Medido num save real de 1 temporada (gerado pelo código anterior): Tournament = 2,4 MB de 12,3 MB (19,5 %); em 5 temporadas = 35,9 % do save. Bytes por campo nos 125 torneios finalizados do dia 365: `bracket_history` 897 KB, `draw_ranking_snapshot` 441 KB, `draw_pair_ids` 253 KB, `placements` 232 KB, `participants` 105 KB; o restante (~4,7 KB/torneio) são ~70 campos escalares/chaves.

| Estrutura | Escritores | Leitores | Necessária após encerramento? | Compactável? | Risco |
|---|---|---|---|---|---|
| `bracket_history` | `tournamentDraw`, `WorldTourLifecycle` (sorteio/liquidação), `tournamentSettlement`, `TournamentModal`, `tournamentLifecycle` | `TournamentBracket`, `tournamentBracketView`, `careerCommunications`, `TournamentModal`, `calendarLifecycle`, `tournamentLifecycle`, `WorldTourLifecycle` | Sim (tela de chave, mídia, histórico) | Só na fronteira do arquivo (codec); não em memória | Alto em memória (≥7 leitores); baixo no codec |
| `placements` | `tournamentSettlement.finalizeTournamentFromBracket` | Nenhum em `src/` fora da liquidação (só scripts de teste) | Dado histórico (Categoria A) | Sim, por dicionário | Baixo |
| `draw_ranking_snapshot` | `WorldTourLifecycle`, `tournamentDraw` | Nenhum em `src/` (registro de auditoria, documentado como "nunca ler como ranking") | Preservar (A) | Sim, por dicionário | Baixo |
| `draw_pair_ids` | idem | Só enquanto não resolvido (`committedPairIdsForWindow`, `resolveDrawnPair`, `tournamentRegistrationState`); vários testes | Preservar (referências a duplas) | Sim, por dicionário | Baixo |
| `participants` | liquidação | `career.js` (checagem de "torneio jogado"), UI | Sim | Sim, por dicionário | Baixo |
| `champion`, `runner_up`, `*_partnership_id`, `*_athlete_ids/names`, `prize_*`, `rank_points` | liquidação | Relatórios anuais, diário, ranking, conquistas | Sim | **Não tocados** | — |
| `WorldEvent`, `CareerMessage`, `AthleteRankingResult`, `AnnualCareerReport` | vários | vários | Sim | **Fora de escopo** | — |

Calendário, perfil, histórico de partidas, estatísticas, rankings, conquistas, premiações, notificações, relatórios, entrevistas, tela de torneios, retomada e migração/validação foram verificados por busca de leitores; nenhum depende de cópias independentes dos campos empacotados, e como o estado em memória continua expandido nenhum leitor foi alterado.

## 4. Classificação dos dados

- **A (permanente):** campeão, vice, `placements`, resultados das partidas, `participants`, `draw_pair_ids`, `draw_ranking_snapshot`, premiações, pontos.
- **B (reconstruível):** `match_id` e `source_match_ids` quando seguem `${id}:r{r}:m{m}` / filhos `2m, 2m+1` (≈80 % das partidas); reconstruídos por regra determinística e **verificados por round-trip** por torneio.
- **C (redundante):** `pair_id` do snapshot repete `draw_pair_ids`; nomes de duplas repetidos em chave/colocações/participantes/snapshot (dicionário por torneio).
- **D (temporário):** nenhuma estrutura provada descartável; nada foi removido.

Nada é reconstruído a partir do estado atual de atletas/duplas/rankings.

## 5. Estruturas compactáveis

`bracket_history`, `draw_ranking_snapshot`, `draw_pair_ids`, `placements`, `participants` de torneios **liquidados**: `status==='finalizado'`, `world_tour_resolved===true`, `canonical_settlement_id`, campeão e vice, chave não vazia, todas as partidas com vencedor e `completed`. A data nunca é critério. Torneios sem liquidação canônica (ex.: exibições legadas), ativos, com inscrição aberta, chaveados ou com partida pendente ficam intactos (testado).

## 6. Estruturas preservadas

Todo o resto do save e dos torneios, incluindo todos os campos escalares de cada torneio e todas as entidades não-torneio (compartilhadas por referência, sem cópia).

## 7. Estratégia de compatibilidade

- Formato: o torneio troca os 5 campos pesados por `history_pack = { v, dict, fields, at }` (`at` guarda a posição original de cada chave, para devolver a mesma ordem).
- **Leitura sempre ativa** (`CareerRepository.readCareer`, `CareerManager.restoreCareerBackup`): saves sem `history_pack` passam intactos (sem migração, sem mudança de `save_schema_version`). Pacote ilegível ou versão desconhecida **falha fechado** (erro, nunca torneio sem histórico).
- **Gravação compacta desligada** (`HISTORICAL_COMPACTION_WRITE_ENABLED=false`); a opção `compactHistory` do repositório ou `globalThis.__PADEL_HISTORICAL_COMPACTION__` (testes) a liga. Desligar de novo regrava o formato expandido sem perda.
- Nenhuma migração destrutiva: o arquivo antigo é lido e continua válido; o empacotamento é por gravação, determinístico e idempotente (repack gera os mesmos bytes).
- Limitação: um app **anterior** à 7B2B não lê saves com `history_pack` (downgrade não suportado). Por isso a chave deve ficar desligada até haver validação em aparelho.

## 8. Implementação realizada

Produção (3 arquivos): `src/careers/tournamentHistoryCodec.js` (novo), `src/careers/CareerRepository.js` (+9/−3), `src/careers/CareerManager.js` (+2/−1). Cada torneio só é empacotado depois que `unpack(pack(t))` serializa **idêntico** ao original (chaves, ordem, valores); qualquer dúvida (string colidindo com o marcador, ordem inusitada que não fecha) deixa o objeto intacto. A entrada nunca é mutada (cópia rasa só dos torneios finalizados). O arquivo é validado antes de empacotar, e a verificação do temporário (`TEMP_WRITE_MISMATCH`), backups e `crashRecovery` do `GameStorage` seguem iguais.

## 9. Testes de equivalência

`npm run test:cloud-7b2b-historical-compaction` (49 verificações; fixture de 125 torneios finalizados reais em `reports/.../fixtures/`): round-trip byte a byte; campeões, vices, colocações, participantes, snapshots, `pair_ids`, chaves, ids/resultados de partidas, premiações/pontos/referências a duplas; repack idempotente; campos extras de partida do jogador (`player_match`, `set_scores`) preservados; mutação da entrada; pacote corrompido/versão desconhecida/colisão de marcador.
Regressão com a chave **ligada** (via `--import scripts/lib/cloud7b2bCompactionPreload.mjs`): 6n, browser storage, mobile 3.6/3.7, integridade, world save/load, achievements e 7B2B passam. **`test:cloud-7b1-save-pipeline` falha ligada** só na comparação byte a byte com o baseline pré-7B2B (`memoria-dia-30`): é esperado, pois o formato em disco muda deliberadamente. Com a chave desligada passa integralmente.

## 10. Testes de continuidade

A) carreira nova/real: fixture 7B1 + 40 dias com gravação compacta, 18 de 19 torneios finalizados empacotados (o 19º é exibição sem liquidação), recarrega, continua; B) save antigo carrega igual com chave desligada/ligada, regrava e recarrega sem crescimento; C) nenhum torneio não liquidado empacotado (inclui "data passada não é critério"); E) falha de escrita e de verificação do temporário preservam o último save válido, recuperação por backup/rollback com formato compacto, restauração de backup manual compacto, duas gravações seguidas. **Cenário D (10 temporadas) e F (jogador ativo em torneios reais) não foram executados com a chave ligada num fluxo de ponta a ponta**: o 6n (fluxos críticos com jogador) passou com a chave ligada, e o campo extra de partida do jogador foi coberto por teste unitário, mas não há simulação de 10 temporadas com jogador ativo.

## 11. Benchmarks antes/depois

Node 22 / Linux, backend em memória, CPU sem outra carga, 9 repetições alternadas após aquecimento. Saves gerados pelo código `86f7307` (`--fakeClock`). Dados em `reports/cloud-phase-7b2b-historical-compaction/data/ab-day{365,1825}.json`; script `scripts/benchmark-cloud-7b2b-compaction.mjs`.

| Indicador | 1 temp. base | 1 temp. compactado | Δ | 5 temp. base | 5 temp. compactado | Δ |
|---|---|---|---|---|---|---|
| Tamanho do save | 12,29 MB | 11,53 MB | **−6,2 %** | 30,99 MB | 27,24 MB | **−12,1 %** |
| Torneios finalizados | 2,19 MB | 1,43 MB | −34,6 % | 10,93 MB | 7,18 MB | −34,3 % |
| Gravação (mediana ms) | 112 | 211 | **+88 %** | 232 | 668 | **+187 %** |
| Gravação (p95 ms) | 226 | 409 | +81 % | 339 | 1 458 | +330 % |
| Carga (mediana ms) | 113 | 152 | +34 % | 259 | 382 | +48 % |
| Clone em memória (mediana ms) | 131 | 132 | ≈0 | 375 | 390 | +4 % (ruído) |
| Integridade após carga | equivalente | equivalente | = | equivalente | equivalente | = |
| Avanço diário (mediana/p95) | **não medido** | | | | | |

Não medi o avanço diário ponta a ponta nem 10 temporadas. O avanço diário faz 1 gravação lógica por dia (CLOUD-7B1), então a diferença de gravação acima é um indicador direto, mas não o valor medido. Ganho em Tauri/Android: **não medido** (sem IPC, disco ou aparelho). Extrapolação (não medida): 10 temporadas (~35 % em torneios) ≈ −12 % de bytes.

## 12. Economia de armazenamento

−6 % a −12 % do arquivo (cada gravação mantém ainda um backup e uma cópia de rollback, então o ganho em disco é multiplicado por essas cópias). Quase todo o resto do crescimento está fora do escopo desta fase (`WorldEvent`, `AthleteRankingResult`, `AnnualCareerReport`, atletas).

## 13. Impacto na performance

Negativo no estado atual: o empacotamento é refeito para **todos** os torneios finalizados a cada gravação (~0,5 ms cada com JIT aquecido; 88 ms/371 ms medidos para 124/620 torneios), mais a prova de round-trip. A economia de bytes (~3,7 MB menos no 5 temp.) não compensa. Por isso **não ativei**. A leitura (+~0,14 ms/torneio) é barata, mas sem a gravação compacta não há o que ler.

## 14. Riscos remanescentes

- Se ligar sem cache: piora o avanço diário.
- Cache por fingerprint seria arriscado: um torneio finalizado alterado depois por rotina de reparo poderia ser regravado com o pacote velho (perda silenciosa).
- Downgrade do app não lê saves compactados.
- `last_played_at` é carimbado a cada `loadCareer` (pré-existente), então saves não são byte-idênticos entre cargas.
- Falta: simulação de 10 temporadas com jogador ativo e a chave ligada; teste em Tauri/Android.

## 15. Limitações de plataforma

Todas as medidas são Node. Android/Tauri reais podem ter custos de CPU e IPC diferentes (o custo por gravação pode pesar mais em aparelhos lentos).

## 16. Recomendações

1. Manter a chave desligada. Esta fase entrega codec, leitura compatível e testes.
2. Próxima fase (7B3): empacotar **uma vez**, na liquidação, e manter o torneio compacto em memória e no arquivo (sem repack por gravação), com adaptador de leitura único para os ≥7 leitores de `bracket_history`/`participants`. Isso também reduz clone, stringify e GC, que o codec de fronteira não alcança.
3. Antes de qualquer ativação: benchmark de avanço diário ponta a ponta (12/31/52 MB) e teste físico em Android; considerar `schema_version` para bloquear downgrade.
4. Para chegar aos 20–30 %, atacar também os ~70 campos escalares por torneio e as demais coleções (`WorldEvent`, `AthleteRankingResult`), com decisão de produto.
