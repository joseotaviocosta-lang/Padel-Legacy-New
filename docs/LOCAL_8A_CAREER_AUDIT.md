# LOCAL-8A — Auditoria integrada de 10 temporadas

Somente diagnóstico. Nenhum código de produção, regra, balanceamento ou baseline foi alterado.

## 1. Resumo executivo

Uma carreira nova e isolada percorreu **10 temporadas completas** (3 650 dias, de 2026-01-05 a 2036-01-03) pelo
pipeline real do jogo em **80,0 min**, sem falha.

| Área | Resultado |
|---|---|
| Torneios das temporadas 1–10 | **1 241 programados, 1 241 concluídos**, 0 travados, 0 cancelados |
| Integridade por temporada (simulador) | ok nas 10 |
| Pontos contra a tabela oficial | **0 erros** (≈5 500 conferências por checkpoint, nos dois fluxos) |
| Janela rolling | 0 erros (≈960 atletas por checkpoint) |
| Ledger das duplas | 0 erros (310 → 612 duplas conferidas) |
| Ranking de duplas | 0 linhas duplicadas; soma canônica sem erro |
| Persistência | save de 64 MB: 34 coleções idênticas após save → load → resave → reload; recargas nas temporadas 1/3/5/10 sem falha |
| Determinismo | 3 execuções independentes, checkpoints semanais idênticos (35 dias) |
| Desempenho | dia mediano 212 ms (T1) → 1 161 ms (T10); p95 531 → 2 252 ms; pior dia 5,2 s |

**P0: 0. P1: 0. P2: 1 (desempenho que cresce com o save). P3: 2.** Mais uma limitação importante do harness (§8): a
progressão do jogador desta execução **não** é representativa de um jogador real.

## 2. Configuração

| Item | Valor |
|---|---|
| Commit | `071d42d` (LOCAL-7H.1), branch `integracao/cloud-6o` |
| Simulador | `scripts/cloud-7c-long-career.mjs` (CLOUD-7C; pipeline real: `advanceCareerDayOnce`, `registerTournament`, `createMatch/playPoint`, `recordTournamentMatchResult`, chave canônica, `prepareTournamentFinalization`, `executeTraining`, `finalizePracticeMatch`, `releasePartner/formPartnerContract`) |
| Comando | `TZ=UTC node --expose-gc --max-old-space-size=6144 scripts/cloud-7c-long-career.mjs --strategy=off --seed=8a --seasons=10 --reloadSeasons=1,3,5,10 --dumpSeasons=1,3,5,10 --hashEvery=7 --out=reports/local-8a-career-audit/run10` |
| Seed | `8a` (RNG do mundo, decisões, relógio e UUID controlados) |
| Compactação | desligada (`--strategy=off`) |
| Início | 2026-01-05; jogador "Atleta 7C", nascido em 2009-06-15 (16 anos), nível Iniciante, dificuldade normal, estilo equilibrado, lado direito, 5 000 moedas, energia 100, moral 70, forma 55, confiança 60 (OVR 38 ao fim da T1) |
| Parceiro inicial | catálogo `player-fictional-7i55ge` (iniciante) |
| Estratégia (automática) | inscrição a cada 3 dias no 1º torneio com janela aberta; joga todo torneio inscrito e 95% das decisões; treino moderado com 40% de chance por dia; partida de treino com 10%; troca de parceiro 1×/temporada |
| Armazenamento | backend em memória, isolado; nenhum save real nem IndexedDB tocado |
| Auditoria de dados | `scripts/audit-local-8a-career.mjs` (`npm run test:local-8a-career-audit -- --run=<pasta>`), usando as funções reais (`getRoundOutcomeTable`, `getTournamentRewards`, `computeRollingPoints`, `deriveTournamentFactsFromFullBracket`, `computeCanonicalTeamRankingPoints`) |

**Ajuste no adaptador de teste** (não é código de produção): `cloud-7c-long-career.mjs` foi alinhado ao
`TournamentModal` atual em dois pontos.

1. A saída no qualifying passa os adversários restantes (LOCAL-7F). Antes, o harness entregava a vaga direto a quem
   eliminava o jogador.
2. A checagem de colocações duplicadas usa `pair_id` quando presente (LOCAL-7E). Antes, homônimas distintas eram
   acusadas por nome.

## 3. Checkpoints

| # | Escopo | Resultado |
|---|---|---|
| Etapa A | suítes rápidas | LOCAL-7H.1, 7H, 7G.1, 7G, 7F, 7E e 7D, CLOUD-7D1, CLOUD-7B1 (50/50), `lint`, `build`, `validate:architecture`, `diff --check`: ok. CLOUD-7B2A interrompida sem mensagem aos 91 s, junto com a queda do servidor de dev (§10, P3); reexecutada isolada, **10/10** |
| 1 | 35 dias | inicialização, calendário, inscrições, 1º torneio, ranking e persistência ok; 0 erros de pontos, rolling, Race e ledger; determinismo A = B |
| 2 | temporada 1 | 125/125 torneios; 0 erros de pontos (5 347), rolling (959) e ledger (310); recarga ok |
| 3 | temporada 3 | 0 erros (pontos 5 554, rolling 971, ledger 444); recarga ok |
| 4 | temporada 5 | 0 erros (pontos 5 553, rolling 971, ledger 541); recarga ok |
| 5 | temporada 10 | 0 erros (pontos 5 626, rolling 945, ledger 612); recarga ok; save → load → reload íntegro |

## 4. Tabela por temporada

| T | Idade | Rank | OVR | Nível | Torneios | V/D torneio | Recusadas | Títulos (total) | Save MB | Dia mediano | p95 | Máx | Carga | Gravação | Heap MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 17 | 454 | 38 | Competitivo | 38 | 3/38 | 25 | 0 | 12,4 | 212 | 531 | 1 683 | 131 | 253 | 269 |
| 2 | 18 | 330 | 43 | Avançado | 14 | 5/13 | 82 | 1 | 19,0 | 329 | 625 | 1 070 | 86 | 176 | 371 |
| 3 | 19 | 366 | 45 | Avançado | 11 | 1/11 | 90 | 1 | 25,0 | 526 | 924 | 1 699 | 119 | 479 | 446 |
| 4 | 20 | 310 | 45 | Avançado | 11 | 1/11 | 94 | 1 | 31,0 | 674 | 1 223 | 2 286 | 171 | 484 | 538 |
| 5 | 21 | 303 | 46 | Elite | 11 | 0/11 | 96 | 1 | 36,8 | 660 | 1 155 | 1 699 | 123 | 426 | 610 |
| 6 | 22 | 312 | 46 | Elite | 11 | 0/11 | 90 | 1 | 42,8 | 707 | 1 259 | 4 343 | 117 | 432 | 699 |
| 7 | 23 | 276 | 47 | Lenda | 11 | 0/11 | 92 | 1 | 48,4 | 744 | 1 268 | 2 059 | 172 | 550 | 770 |
| 8 | 24 | 263 | 48 | Lenda | 11 | 1/11 | 91 | 1 | 53,7 | 958 | 1 508 | 2 770 | 263 | 799 | 705 |
| 9 | 25 | 257 | 48 | Lenda | 11 | 0/11 | 93 | 1 | 58,9 | 1 146 | 1 729 | 3 583 | 290 | 1 041 | 850 |
| 10 | 26 | 246 | 49 | Lenda | 11 | 0/11 | 96 | 1 | 64,0 | 1 161 | 2 252 | 5 230 | 279 | 801 | 911 |

Tempos em ms. Arquivo: `reports/local-8a-career-audit/seasons-summary.csv`.

## 5. Integridade dos torneios

- Temporadas 1–10: **1 241/1 241 concluídos**, 0 cancelados e 0 travados. Temporadas 11–12 são o calendário futuro (150
  torneios), ainda não iniciado.
- Em todos os checkpoints: 0 sem campeão; 0 campeão/vice divergentes da final da chave; 0 colocações duplicadas (com
  `pair_id`); 0 vencedores inválidos; 0 `canonical_settlement_id` ausentes ou repetidos; 0 torneios de identidade
  ambígua.
- 85 torneios com o jogador até a T5 e 535 só de IA, com as mesmas verificações.
- A "Roma Pré-Temporada" (exibição, fora do circuito) fica em `inscricoes` depois da data quando o jogador não a
  disputa (checkpoint de 35 dias). Nesta carreira foi disputada e fechou (§10, P3).

## 6. Ranking e Race

- **Individual**: 0 resultados duplicados (atleta + torneio). Total = janela rolling (22 melhores em 364 dias) para todos os
  atletas sem resultado após a última passada semanal. Os resultados com mais de 364 dias são podados de propósito: 1 116
  torneios só não têm mais os pontos conferíveis no save final.
- **Pontos por torneio**: 0 divergências contra a tabela oficial, AI-only por colocação e torneio do jogador por rodada (LOCAL-7G).
- **Duplas**: 951 → 1 616+ linhas, 0 duplicadas; soma canônica dos membros sem erro para as duplas ativas assentadas.
- **Race**: conferida no checkpoint de 35 dias (0 erros em 203 atletas). Nos dumps de fim de temporada ela não é
  conferível, porque o dump é gravado logo depois da virada do ano, quando a Race é zerada (limitação, §12).

## 7. Histórico esportivo

- Ledger das duplas = partidas reais da chave (torneio do jogador) e partidas + BYE como rodada avançada (AI-only, regra
  existente): **0 divergências** em 310/444/541/612 duplas conferidas. Também 0 linhas com `partidas ≠ V + D`.
- Diferenças de política conhecidas, que não são defeitos: BYE conta como vitória no ledger AI-only, mas não no torneio do
  jogador (sem BYE); W.O. não conta como vitória no ledger, mas conta como rodada avançada nas estatísticas individuais;
  a dupla do jogador conta por torneio (regra da 5.0).

## 8. Progressão do jogador — limitação do harness

| Marco | Temporada |
|---|---|
| Top 500 | T1 (#454) |
| Top 200 / 100 / 50 / 20 / 10 / 1 | **não alcançado** |
| Primeiro título | T2 |
| Melhor ranking (fim de temporada) | #246 (T10) |

**Esta progressão não representa um jogador real.** O roteiro automático troca de parceiro 1×/temporada
(`formPartnerContract`) e **nunca renova** o contrato: ele termina como "Contrato não renovado" em 38–73 dias, e o
jogador passa cerca de 10 meses/ano **sem parceiro**. Sem parceiro, o jogo recusa a inscrição (regra correta): 82–96
recusas/ano e só 11 torneios/ano a partir da T2, com 0–1 vitória por temporada. Além disso, o harness inscreve o jogador no
**primeiro** torneio com janela aberta, sem escolher categoria compatível. O mesmo padrão aparece na CLOUD-7C. O OVR cresceu
de 38 para 49 em 10 anos, com treino moderado.

Conclusão: **não é possível avaliar o balanceamento da progressão com esta execução**. Ela não indica defeito do jogo (as
regras de contrato e inscrição funcionaram como projetadas). Também não prova que o topo seja alcançável. Ver §14.

## 9. Persistência e determinismo

- Recargas do disco ao fim das temporadas 1, 3, 5 e 10, com a simulação continuando íntegra.
- Save final de 64,0 MB pelo `CareerManager` real: save 756 ms, load 303 ms, resave 693 ms; **34 coleções idênticas** (hash
  canônico por coleção) entre original, carregado e recarregado; contagens e identidade do jogador iguais.
- Determinismo: duas execuções de 35 dias e a execução longa produziram os **mesmos 5 checkpoints semanais** (hash por
  coleção). A carreira de 10 temporadas não foi repetida inteira, por custo (80 min). A CLOUD-7B2A cobre 365 dias e recarga
  no meio da carreira (10/10).

## 10. Desempenho

- Dia mediano 212 → 1 161 ms (×5,5), p95 531 → 2 252 ms e máximo 5,2 s (T10); média geral de 762 ms/dia; carga 131 → 279 ms;
  gravação 253 → 801 ms; heap 269 → 911 MB; save +~5,8 MB/temporada (12,4 → 64,0 MB).
- O custo por dia cresce com o tamanho do save e do histórico (a mesma tendência da CLOUD-7C, onde a T10 tinha 1 957 ms
  medianos; aqui é 1 161 ms). A execução total foi 42% mais rápida que a CLOUD-7C base (80,0 contra 137,4 min).

## 11. Achados

| ID | Classe | Tipo | Descrição | Evidência | Correção sugerida (não implementada) |
|---|---|---|---|---|---|
| A1 | **P2** | limitação conhecida | Custo por dia, gravação, heap e save crescem com a carreira (dia mediano ×5,5 e save 64 MB na T10). Aceitável no desktop; risco real em Android (CPU mais lenta, memória limitada, armazenamento do WebView/Tauri) | tabela §4 | antes do Android, medir em aparelho físico um save de T5 e T10 (gerável com o script); se necessário, retomar a compactação histórica (7B2B) e a poda de entidades antigas numa fase própria |
| A2 | P3 | defeito menor | Exibição "Roma Pré-Temporada" fica com status `inscricoes` depois da data quando o jogador não a disputa | checkpoint de 35 dias (`tournament-2026-rom-exh-2026`) | encerrar a exibição como "não disputada" no tick diário |
| A3 | P3 | ambiente | A suíte CLOUD-7B2A foi interrompida sem mensagem durante a queda do servidor de dev (supervisor de porta); isolada, 10/10 | logs da Etapa A | rodar baterias com o servidor de dev desligado |
| L1 | — | limitação do harness | Roteiro automático não renova contrato de parceria nem escolhe categoria: a progressão medida não representa um jogador real | §8, `partner-changes.jsonl` | dar ao harness renovação/recontratação e escolha de categoria antes de qualquer análise de balanceamento |

Não foram encontrados: save corrompido, carreira impossível de continuar, perda de dados, torneio permanentemente
travado, campeão incorreto, pontuação duplicada, ranking incorreto ou divergência de determinismo.

## 12. Limitações

- Uma seed; estratégia automática não representativa (§8).
- Race conferida só no checkpoint de 35 dias (dumps de fim de temporada caem logo depois do reset anual).
- Pontos de torneios com mais de 364 dias não são conferíveis no save (podados pela janela rolling, por desenho).
- Determinismo comparado nos primeiros 35 dias; a carreira inteira não foi repetida.
- Desempenho medido em Windows/Node (headless), não em Android, Tauri ou navegador.
- Torneios homônimos: nenhuma chave de IA teve colisão de nomes nesta seed (os grupos de nomes repetidos entre atletas
  chegaram a 111 na T5), então o caminho com `pair_id` foi exercido só pelos testes de fase (LOCAL-7E/7H.1).

## 13. Evidências

`reports/local-8a-career-audit/`:

- `seasons-summary.csv`: tabela por temporada, com o resumo da auditoria;
- `run10/seasons.jsonl`, `summary.json`, `reloads.jsonl`, `partner-changes.jsonl`, `run-meta.txt`: execução longa;
- `run10/audit-season-{1,3,5,10}.json`: auditoria profunda de cada checkpoint;
- `cp1-a/`, `cp1-b/`: checkpoint de 35 dias (determinismo) e auditoria.

Saves de 12–67 MB e `hashes.jsonl` (657 kB) ficam fora do Git (`.gitignore` local) e podem ser regenerados com o comando
da §2.

## 14. Recomendações para a próxima fase

1. **Android (validação em aparelho):** não há bloqueador funcional. O ponto de atenção é o desempenho (A1). Sugestão:
   testar uma carreira nova e um save avançado (T5 e T10 gerados pelo script), medindo avanço de dia, gravação e memória.
2. Antes de concluir algo sobre o balanceamento da progressão, corrigir a estratégia do harness (L1) e repetir com
   algumas seeds.
3. Corrigir A2 (exibição) quando for conveniente; é cosmético.
