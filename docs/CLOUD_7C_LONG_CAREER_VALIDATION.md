# CLOUD-7C — Validação de carreira longa (jogador ativo), integridade, determinismo e desempenho

Fase exclusivamente de testes e diagnóstico. **Nenhum arquivo de produção foi alterado** (`git diff d60c83f -- src package.json` vazio); a compactação continua desligada (`INCREMENTAL_COMPACTION_ENABLED=false`, `HISTORICAL_COMPACTION_WRITE_ENABLED=false`).

## 1. Resumo executivo

1. **Carreira de 10 temporadas com jogador ativo concluída nas duas estratégias** (base e incremental): 3 650 dias, 138 torneios disputados, 149 partidas de torneio, 387 treinos-partida, 1 460 treinos, 9 trocas de parceiro, 862 inscrições recusadas pela elegibilidade real. O jogador evoluiu de nível 'Competitivo' (ovr 39, rank 384, 17 anos) a 'Lenda' (ovr 49, rank 216, 26 anos); não venceu torneios (11 vitórias, 138 derrotas).
2. **A compactação incremental não causa nenhuma divergência lógica**: base × incremental idênticos em 521 checkpoints semanais e em saves das temporadas 1, 5 e 10 (34 coleções), exceto telemetria de tempo real persistida (`AnnualCareerReport.generation.durationMs`).
3. **A compactação incremental NÃO traz benefício líquido com jogador ativo**: dia mediano +32 % a +44 % mais lento nas temporadas 5–10 (execução paralela A/B) e +9 % a +16 % em benchmark sequencial; save só −3 % a −7,5 %; heap −0,5 % a −4 %. Causa comprovada: 2 788 047 tentativas de empacotamento repetidas (§6), 2 292 s de CPU (23 % do tempo de parede), por uma falha do protótipo da 7B2C com os ~129 torneios (temporada 10) em que o jogador participou. Corrigi nada (fase de diagnóstico); a recomendação da 7B2C ("−12/−15 %") **não se confirma** neste cenário.
4. **Save/load**: recarregar o save preserva integralmente o estado lógico (0 diferenças no estado em memória após cada reload; ano inteiro com 6 recargas idêntico ao sem recarga). Os reloads das temporadas 7 e 10 **não foram concluídos** (dois reinícios do contêiner interromperam as execuções); estão cobertos os reloads das temporadas 1, 3 e 5 nas duas estratégias.
5. **Determinismo**: causa do "divergência entre execuções" isolada (§8): leituras de relógio da camada de persistência/telemetria consomem o relógio falso compartilhado que alimenta os ids (que alimentam o `selectPair`). Não é contaminação de dados.
6. **Defeitos preexistentes do jogo encontrados** (§§7, 9): torneios com eliminação do jogador no qualifying nunca encerram (9/9); duas duplas distintas com o mesmo nome fundem/duplicam a chave (3 torneios na temporada 10); telemetria de tempo real gravada no estado.

## 2. Base Git e ambiente

Branch `cloud/phase-7c-long-career-validation`, derivada exatamente de `d60c83f` (ancestrais `ad71978`, `86f7307`, `7795e8e`, `9804adc`, `d264c22` verificados; working tree limpo; flags desligadas por padrão). Ambiente: Node 22, Linux 4 vCPU, memória (`GameStorage` real sobre backend em memória), sem Tauri/Android. **Interrupções**: o contêiner foi reiniciado 3 vezes durante a fase; execuções interrompidas foram refeitas ou documentadas (§5).

## 3. Metodologia, scripts, seeds e fixtures

- `scripts/cloud-7c-long-career.mjs` — carreira determinística com jogador ativo pelo pipeline real (CareerManager/GameStorage reais, botão "Avançar" real `advanceCareerDayOnce`, `registerTournament`, partida de torneio com `createMatch/playPoint`, `recordTournamentMatchResult`, `buildMatchRewardsPatch`, aplicação na chave canônica (`applyPlayerMatchToCanonicalBracket`), `prepareTournamentFinalization` com chave/run, conquistas por partida, `finalizePracticeMatch`, `executeTraining`, `releasePartner`/`formPartnerContract`). Seed `7c` (RNG do mundo, decisões, relógio e UUID controlados). Integridade a cada fim de temporada; checkpoint semanal (hash por coleção). Opções de diagnóstico: `--careers`, `--reseedAlways`, `--resetSingletons`, `--clockIgnoresPersistence`, `--reloadSeasons`, `--reloadEveryDays`, `--reloadIsolatesStreams`, `--canonicalHash`, `--hashMemory`, `--dumpDay*`, `--traceDateDay`.
- Comparação: `compare-cloud-7c-runs.mjs` (primeiro checkpoint/entidade divergente), `compare-cloud-7c-saves.mjs` (comparação lógica de saves, com normalização de telemetria), `summarize-cloud-7c-perf.mjs`.
- Diagnósticos: `diagnose-cloud-7c-roundtrip.mjs`, `diagnose-cloud-7c-pack-retries.mjs`, `diagnose-cloud-7c-duplicate-teams.mjs`, `diagnose-cloud-7c-qualifying-pending.mjs`.
- **Simplificações do adaptador (documentadas, sem tocar produção)**: sem UI/checkpoint de partida nem mídia/entrevistas; o jogador joga todo torneio em que se inscreve (decisão de inscrição a cada 3 dias); a troca de parceiro altera o estado real (9/9 `formPartnerContract` bem-sucedidos) mas o adaptador continuou usando o bot inicial como parceiro nas partidas simuladas. Resultado do jogador é um jogador fraco (poucas vitórias): o objetivo foi exercitar o ciclo completo, não otimizar o jogador.
- Fixtures/evidências versionadas em `reports/cloud-phase-7c-long-career-validation/` (`fixtures/active-player-save-season1-baseline.json.gz`, `data/`). Saves de 12/36/64 MB não são versionados (regeneráveis com o script).

## 4. Resultados por temporada (A/B, 10 temporadas)

Base (compactação desligada) → incremental, mesma seed/estado inicial/roteiro. Tempos obtidos com os dois processos rodando em paralelo (condições simétricas, mas com ruído), por isso a referência sequencial está em §10.

| Temp. | Idade | Rank | Torneios jog. | Partidas torneio/treino | V/D torneio | Moedas | Linhas de entidades | Save base → incr. (MB) | Dia mediano base → incr. (ms) | p95 base → incr. | Carga base → incr. (ms) | Gravação base → incr. (ms) | Heap base → incr. (MB) | Integridade |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 17 | 384 | 39 | 48/38 | 9/39 | 10318 | 12623 | 12.0 → 11.6 | 315 → 353 | 642 → 841 | 94 → 72 | 229 → 222 | 262 → 254 | ok / ok |
| 2 | 18 | 315 | 11 | 11/47 | 0/11 | 14189 | 15604 | 18.9 → 18.0 | 594 → 730 | 1024 → 1469 | 154 → 109 | 444 → 446 | 351 → 335 | ok / ok |
| 3 | 19 | 322 | 11 | 13/29 | 2/11 | 17436 | 18560 | 24.5 → 23.2 | 769 → 997 | 1259 → 1851 | 216 → 144 | 581 → 520 | 421 → 395 | ok / ok |
| 4 | 20 | 293 | 11 | 11/39 | 0/11 | 16589 | 21541 | 30.4 → 28.6 | 944 → 1236 | 1480 → 2160 | 236 → 194 | 818 → 594 | 497 → 463 | ok / ok |
| 5 | 21 | 290 | 11 | 11/31 | 0/11 | 15697 | 24372 | 36.2 → 33.9 | 1162 → 1538 | 1835 → 2747 | 269 → 221 | 837 → 991 | 569 → 526 | ok / ok |
| 6 | 22 | 265 | 11 | 11/44 | 0/11 | 31949 | 27271 | 42.1 → 39.3 | 1337 → 1849 | 2068 → 3182 | 304 → 315 | 995 → 1020 | 643 → 591 | ok / ok |
| 7 | 23 | 258 | 11 | 11/37 | 0/11 | 60840 | 30285 | 48.1 → 44.8 | 1470 → 1988 | 2268 → 3246 | 335 → 305 | 1083 → 969 | 773 → 703 | ok / ok |
| 8 | 24 | 244 | 11 | 11/34 | 0/11 | 60147 | 33027 | 53.4 → 49.6 | 1613 → 2289 | 2392 → 3611 | 380 → 302 | 1397 → 1044 | 785 → 715 | ok / ok |
| 9 | 25 | 234 | 11 | 11/46 | 0/11 | 60338 | 35969 | 58.5 → 54.3 | 1767 → 2539 | 2542 → 4292 | 454 → 403 | 1412 → 1283 | 850 → 772 | ok / ok |
| 10 | 26 | 216 | 11 | 11/42 | 0/11 | 59676 | 38880 | 63.6 → 58.9 | 1957 → 2693 | 2904 → 4084 | 625 → 411 | 1703 → 1472 | 913 → 825 | 2 falhas / 2 falhas |

Totais (base): 137,4 min; incremental: 163,7 min. Contadores finais idênticos nas duas estratégias.

## 5. Save/load (Teste D)

| Teste | Resultado |
|---|---|
| Reload após as temporadas 1, 3 e 5 (execuções longas, ambas as estratégias) | Executados e idênticos **entre estratégias** em 318 checkpoints (compactação não afeta o reload). Reloads das temporadas 7 e 10: **não concluídos** (contêiner reiniciado duas vezes a ~6 temporadas; execução não é retomável de forma comparável, ver §8). |
| Estado em memória logo após o reload × sem reload | **0 diferenças** (dia 63, estratégia incremental, todas as coleções + jogador). |
| Reload × sem reload, execução longa | Diverge no dia seguinte ao reload nas duas estratégias (dia 371): causa isolada = `loadCareer` lê o relógio falso 3 vezes e avança 1 tick (1 s), deslocando ids; não consome RNG. |
| Reload a cada 63 dias (6 recargas, 378 dias), compactação ligada, fluxos isolados, hash independente da ordem de chaves | **Idêntico em 54 checkpoints**, estado final e contadores iguais. Resíduo em modo estrito: ordem de inserção das chaves em 37 linhas de `AthleteProfile` (mesmos valores). |

## 6. Falha de round-trip em torneios com jogador ativo (item 1) e custo das retentativas (item 2)

**Causa exata** (`diag-roundtrip-season{1,5,10}.json`): no torneio em que o jogador participa, a chave é construída com um formato de partida diferente do que o codec assume:
1. A partida do jogador na **rodada 0** não tem a chave `source_match_ids` (o codec, ao não achar a chave, reinventa `source_match_ids: []`, gerando uma chave que o original não possuía).
2. Nas **rodadas seguintes**, `source_match_ids` vem **depois** de `player_match` (o codec restaura essa chave na 2ª posição).

Exemplo mínimo (torneio `tournament-2026-lon-bro-w05-1`):
```
original  rodada 0: {"match_id":"…:player:r0","date":…,"status":"completed","team_a":…,"team_b":…,"winner":…,"score":…,"player_match":true}
restaurado:        {…,"score":…,"player_match":true,"source_match_ids":[]}            // chave a mais
original  rodada 1: {"match_id":"…:player:r1","date":…,…,"score":…,"player_match":true,"source_match_ids":[…]}
restaurado:        {"match_id":"…:player:r1","source_match_ids":[…],"date":…,…,"player_match":true}   // ordem diferente
```
Como `JSON.stringify` é o critério de igualdade, o torneio é corretamente **recusado** (nunca há perda de dados). Experimento de causa: só reordenar → 0 de 32/74/129 passam; só injetar a chave ausente → 0; **as duas correções → 32/74/129 (100 %)**; sem a ordem os dados são semanticamente idênticos. Todos os torneios que falham têm partida do jogador (74/74 na temporada 5; nenhum torneio sem jogador falha).

**Retentativas** (`diag-pack-retries.json`): como a varredura refaz a tentativa em toda escrita e não existe cache negativo, os torneios com jogador são retentados continuamente: **2 788 047 tentativas falhas** contra 1 102 empacotamentos bem-sucedidos (**2 531 tentativas por empacotamento**), 37 824 varreduras, **2 292 s de CPU = 23,3 % dos 163,7 min da execução**, de 109 ms/dia (temporada 1) a 1 159 ms/dia (temporada 10); cada tentativa ≈ 0,65–0,91 ms. A diferença de dia mediano incremental − base (70 → 796 ms/dia) é menor que o custo das retentativas (109 → 1 159 ms/dia): sem elas a estratégia seria mais rápida que a base. Expansões históricas: 0; `writeExpansions`: 0; 11,5 milhões de visões preguiçosas criadas.

## 7. Equipes duplicadas nas colocações (item 3) — preexistente, não causado pela compactação

`diag-duplicate-teams-season10.json`. Três torneios Gold da temporada 10 (sorteio contém duas duplas **distintas** com o mesmo nome "Hugo López & Rafael López"):
- `tournament-2035-riy-gol-w26-2`, `…-bkk-gol-w28-3`: o nome aparece duas vezes nas colocações; 24 duplas sorteadas, 23 nomes;
- `tournament-2035-tor-gol-w31-2`: duas duplas fundidas silenciosamente em uma só (23 colocações para 24 duplas sorteadas; o vice "Hugo López & Rafael López" é ambíguo) — o pior caso, porque a verificação de duplicidade nem dispara.

**Origem**: o gerador de atletas produziu 4 atletas distintos com os mesmos nomes (dois "Hugo López" e dois "Rafael López", países diferentes); duas parcerias formadas em 2034-03-01 e 2034-04-01 passaram a ter nome de exibição idêntico, e chave/colocações identificam equipes por **nome**. **Primeiro momento**: o sorteio de `tournament-2035-riy-gol-w26-2` em **2035-06-25** (colocações gravadas na liquidação de 2035-07-03). Idêntico nas execuções base e incremental. Em 1 240 torneios com snapshot de sorteio, 3 tinham colisão de nomes (0 até a temporada 5).

## 8. Determinismo (Teste E; item 5)

| Experimento | Resultado |
|---|---|
| Duas carreiras idênticas em **processos independentes** | Idênticas (52 checkpoints; só `AnnualCareerReport.generation.durationMs` difere). |
| Base × incremental (mesmo ambiente) | **Idênticas em 521 checkpoints e nos saves das temporadas 1/5/10** (34 coleções), mesmo ignorando só a telemetria acima. |
| Duas carreiras **sequenciais no mesmo processo** (sem mitigação) | A 2ª diverge no **dia 1**: a carreira 0 consome **7 leituras de relógio a mais** (persistência `GameStorage.formatTimestamp` e telemetria `betaDiagnostics.pushRuntimeError`, relacionadas a backup/log) → deslocamento de 10 s no relógio falso → ids de atletas/duplas diferentes (894 de 1 000) → `selectPair` (hash FNV dos ids) diverge. Primeira entidade: `AthleteProfile.updated_date` (10 s). |
| Mesmas duas carreiras com leituras de relógio da infraestrutura **isoladas** (`--clockIgnoresPersistence --reseedAlways`) | **Idênticas em todos os 52 checkpoints** (temporada completa); causa isolada. |
| Braço `--resetSingletons` | Não é controle neutro: já difere no dia 0 (a função de reset altera a sequência de ids). |
| Sensibilidade do harness | Qualquer alteração que mude o nº de leituras de relógio (ex.: um `import` extra) mudou o mundo inteiro (rank 384 → 387). Os ids baseados no relógio são o amplificador. |

Conclusão: a "divergência" observada na 7B2A/7B1 é compatível com o acoplamento relógio-persistência-ids; não é perda nem corrupção de dados, e **não depende da compactação**. Não foi corrigido (fora de escopo). Tempo real persistido (`AnnualCareerReport.generation.durationMs`) torna dois saves logicamente iguais não idênticos byte a byte.

## 9. Torneios de qualifying que nunca encerram (item 4)

`diag-qualifying-pending-season{5,10}.json`. Em 10 temporadas o jogador foi eliminado no qualifying **9 vezes** (7 Gold, 2 Platinum). **Nas 9** o torneio ficou `em_andamento / não resolvido` para sempre (idade até 3 531 dias): sem campeão, sem vice, **sem `WorldEvent` de resultado**, e (8/9) sem pontos de ranking, enquanto numa amostra de 200 torneios resolvidos 163 têm pontos e 200 têm `WorldEvent`. Mecanismo: a derrota no qualifying (`stage==='qualifying'`) não altera a chave canônica (`TournamentModal` só aplica o resultado quando `stage==='main'`); o slot do jogador permanece `scheduled` sem times e `deriveTournamentFactsFromFullBracket` devolve `null`, então a liquidação nunca fecha.

| Situação | Classificação |
|---|---|
| Torneio ainda dentro do período (em andamento/futuro): 150 | Legítimo |
| Encerrado há ≤ 14 dias, aguardando liquidação | Legítimo (janela) |
| Torneio cancelado por falta de inscritos | Legítimo |
| Jogador eliminado no qualifying (9/9) | **Defeito** (não há caso em que se resolva) |
| Demais torneios vencidos e não finalizados | Nenhum (0) |

Ressalva: simulado pelo adaptador headless, que reproduz o fluxo do `TournamentModal` (mesma condição `stage==='main'`); não foi exercitado pela UI React.

## 10. Desempenho (Teste F)

Benchmark sequencial, sem processos concorrentes, rodadas alternadas (2 × 5 dias + 1 de aquecimento, caminho passivo de avanço diário) sobre os saves de jogador ativo das temporadas 1/5/10 (`perf-active-saves-summary.json`); incremental × base:

| Save | Dia mediano | Dia p95 | Carga | Gravação | Heap | Save após 5 dias | 1º dia (compactação inicial) |
|---|---|---|---|---|---|---|---|
| 1 temp. (12 MB) | +15,6 % | +12,4 % | +1,6 % | +6,5 % | −0,5 % | −3,3 % | 404 → 470 ms |
| 5 temp. (36 MB) | +9,5 % | −0,7 % | −10,5 % | −1,9 % | −3,1 % | −6,6 % | 1 465 → 2 098 ms |
| 10 temp. (64 MB) | +8,9 % | +2,3 % | +11 % | +4,3 % | −4,2 % | −7,5 % | 1 387 → 2 380 ms |

Ruído: a mediana do mesmo estado varia até ±30 % entre rodadas (ex.: base 5 temp. 1 240/845 ms). Direção consistente com o A/B longo (incremental não é mais rápido). Não medido: clonagem isolada, Tauri, Android (sem teste físico).

## 11. Regressão

Chave **desligada (padrão)**: aprovados `cloud-6n-career-flows`, `cloud-7b1-save-pipeline`, `cloud-7b2a-determinism`, `cloud-7b2b-historical-compaction`, `cloud-7b2c-incremental-compaction`, `browser-career-storage`, `mobile-storage-m3-6`, `mobile-persistence-m3-7`, `career-persistence-integrity`, `world-save-load`, `achievement-save-migration`. Chave **incremental ligada** (preload): aprovados todos exceto, **por desenho**, `cloud-7b1-save-pipeline` (compara bytes com baseline pré-7B2B) e `cloud-7b2b-historical-compaction` (supõe carga sempre expandida) — expectativas antigas, não regressões funcionais; `7b2a` não foi reexecutado com a chave ligada. `npm run lint`, `npm run build` e `git diff --check` limpos.

## 12. Problemas causados pela compactação × problemas preexistentes

**Causados/expostos pelo protótipo de compactação (7B2B/7B2C)**
1. Retentativa infinita sem cache negativo (2,79 milhões de tentativas; 23 % do tempo de parede) — anula o ganho.
2. Codec não cobre o formato de chave do torneio com jogador (chave `source_match_ids` ausente/ordem): ~12 % dos torneios finalizados nunca são compactados.
3. Downgrade de app impossível; sem backup pré-conversão; leitores novos que expandam tudo anulariam o ganho.
4. Nenhuma perda de dados, corrupção ou divergência lógica foi causada pela compactação.

**Preexistentes (independentes da compactação)**
1. Eliminação do jogador no qualifying nunca encerra o torneio (9/9).
2. Nomes de dupla idênticos para duplas distintas fundem/duplicam equipes na chave (3 torneios, temporada 10; um deles sem sinal visível).
3. Telemetria de tempo real (`generation.durationMs`) persistida no `AnnualCareerReport`.
4. Ids baseados no relógio alimentam o `selectPair`; leituras de relógio de infraestrutura mudam o mundo (determinismo de testes).
5. `loadCareer` lê o relógio (3 leituras) — relevante só para reprodutibilidade.

## 13. Limitações e riscos

Adaptador headless (não é a UI); jogador fraco; reloads das temporadas 7/10 e vários benchmarks reduzidos por reinícios do contêiner; ruído de medição alto; só Node/memória; Android não testado; 10 temporadas medidas em uma única seed.

## 14. Recomendação e correções necessárias antes da integração local

**Compactação incremental: continuar investigando, não ativar.** Resultados desta fase: integridade e save/load seguros, mas desempenho pior com jogador ativo. Correções realmente necessárias antes de qualquer integração local:
1. **Obrigatórias na compactação**: (a) cache negativo (tentar uma vez por torneio/versão do conteúdo; nunca por escrita); (b) codec que preserve o formato de partida do jogador (marcar chave ausente e ordem), com round-trip validado em 100 % dos torneios com jogador; (c) teste que falha se `failedAttempts/torneios > 1` por dia; (d) repetir o A/B de dez temporadas após (a)–(b) e só então reavaliar o ganho; (e) bloqueio de downgrade e backup pré-conversão; (f) teste físico em Android.
2. **Corrigir no jogo (independente da compactação)**: encerrar/cancelar corretamente torneios quando o jogador é eliminado no qualifying; identificar equipes por id (ou garantir nomes únicos) na chave/colocações; não persistir tempo real no estado.
3. **Ferramentas de teste**: manter `--clockIgnoresPersistence` e hash canônico nos comparativos futuros.

Nenhuma nova fase foi iniciada.
