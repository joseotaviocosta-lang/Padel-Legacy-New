# CLOUD-7A — Auditoria de desempenho e estabilidade de carreira

Base: `integracao/cloud-6o` @ `d264c22` (0.9.0-rc.1.9). Branch: `cloud/phase-7a-performance-audit`. **Nenhum arquivo de produção foi alterado**; só scripts, dados e este relatório.

## 1. Resumo executivo

1. **O custo do avanço de um dia cresce linearmente com o tamanho do save, e o save cresce sem limite.** Em 10 temporadas (3 650 dias, Node, armazenamento em memória) a mediana de um dia comum foi de **186 ms (temporada 1) a 1 210 ms (temporada 10), 6,5×**; p95 de 380 ms a 1 739 ms. O save foi de 0,23 MB (dia 0) a 12,2 MB (1 ano) e **52,6 MB (10 anos)**, ~4,5 MB/temporada.
2. **O tempo é dominado pela cópia e serialização do save inteiro, não por regras de jogo.** No perfil de CPU (400 dias): `structuredClone` 37 %, `JSON.stringify` do save 18 %, GC 10 %, escrita do repositório 10 %. Nenhuma função de regra de jogo passa de ~1 %. Há 1 gravação física por dia (já otimizado na CLOUD-5), mas cada gravação reescreve o save inteiro.
3. **A maior parte do crescimento é histórico que o jogo nunca poda**: torneios finalizados guardam `bracket_history`, `draw_ranking_snapshot`, `draw_pair_ids` e `placements` (≈18 MB de 52,6 MB, 35 %); `WorldEvent` (12 691 linhas, 7,4 MB), `AthleteRankingResult` (9 035), `CareerMessage` (1 875), `AnnualCareerReport` (6,1 MB, 306 KB por ano).
4. **Integridade: nenhum problema encontrado** nos cenários medidos: 3 650/3 650 dias avançados sem bloqueio, 0 ids duplicados de torneio/evento em todos os checkpoints, salvar/recarregar em 1, 5 e 10 temporadas funcionou. Execuções com mesma seed divergem sem relógio fixo (comportamento pré-existente, ver §5).
5. **Motor de partida não é gargalo em Node** (≈19 ms por partida de ~140 pontos, 0,12 ms/ponto).
6. **Android não foi medido.** Todos os números são de Node/Linux; o que se diz sobre Android é inferência marcada como tal.

## 2. Metodologia, ambiente e limitações

- Ambiente: Linux, 4 vCPU, Node v22.22.0, Vite SSR carregando o código real; armazenamento Tauri **substituído por memória instrumentada** (sem disco, sem IPC, sem WebView). IndexedDB via `fake-indexeddb` (mais lento que o do Chrome; só proporções/contagem de operações).
- Carreira criada pelo `CareerManager`, avanço pelo caminho de produção do botão (`advanceCareerDayOnce`, transação única), `Math.random` com seed fixa. O jogador **não se inscreve em torneios e não joga partidas** (`Match = 0`, `CalendarEvent = 2`): saves reais de quem joga são **maiores** e o custo real tende a ser maior que o medido aqui.
- Uma execução de 3 650 dias (amostras: 365 por temporada) — não há repetição da corrida longa; a execução do dia 0–365 foi repetida (primeira corrida interrompida: 12,27 MB/844 ms vs 12,22 MB/811 ms), concordância dentro de ~4 %. Durante as temporadas 5–6 rodei lint/build/testes em paralelo (4 vCPU), podendo ter adicionado algum ruído.
- Não executados: `benchmark-time-advance-rc` e demais testes legados de desempenho (cenário sintético já coberto pela CLOUD-5), Android físico, renderização React/WebView, backend Tauri real. Medições de UI (item E) **não foram feitas**; só leitura estática.
- Comparações com a CLOUD-5: só qualitativas (a CLOUD-5 mediu dia comum ≈ 92–98 ms em save semeado recente; aqui o dia 1 comum é 186 ms numa carreira criada do zero com o mundo completo — metodologias diferentes, não comparar números).

## 3. Benchmarks

Dados brutos: `reports/cloud-phase-7a-performance-audit/data/`.

### 3.1 Avanço de calendário por temporada (`growth-10seasons.json`, 365 dias/linha, 1 gravação/dia em todos)

| Temporada | Mediana dia (ms) | p95 (ms) | Máx (ms) | Dia de virada de mês (mediana) | Bytes gravados/dia (mediana) |
|---|---|---|---|---|---|
| 1 | 186 | 380 | 1 865 | 197 | 8,0 MB |
| 2 | 351 | 607 | 1 751 | 376 | 14,5 MB |
| 3 | 453 | 719 | 1 359 | 456 | 19,5 MB |
| 4 | 542 | 885 | 1 365 | 517 | 23,9 MB |
| 5 | 678 | 1 018 | 1 365 | 706 | 28,5 MB |
| 6 | 698 | 1 140 | 1 638 | 718 | 33,0 MB |
| 7 | 872 | 1 312 | 1 816 | 868 | 37,5 MB |
| 8 | 1 026 | 1 546 | 2 254 | 952 | 41,8 MB |
| 9 | 1 147 | 1 563 | 2 206 | 1 152 | 46,2 MB |
| 10 | 1 210 | 1 739 | 2 196 | 1 102 | 50,4 MB |

Total: 2 748 s de parede para 3 650 dias. Os 10 dias mais lentos são viradas de mês/ano (~2,0–2,25 s). Virada de mês ≈ dia comum (a otimização da CLOUD-5 se manteve). O crescimento é gradual, sem degrau.

Observação: "bytes gravados/dia" conta só `writeText`; o protocolo de gravação também faz leitura de verificação, cópia de backup e rename (ver 3.3).

### 3.2 Tamanho e save/load por checkpoint (memória instrumentada)

| Dia | Save | `saveCareer` | `loadCareer` | Atletas | Duplas | Torneios | WorldEvent | CareerMessage |
|---|---|---|---|---|---|---|---|---|
| 0 | 0,23 MB | 12 ms | — | 6 | 2 | 124 | 1 | 1 |
| 365 | 12,2 MB | 811 ms | 382 ms | 1 072 | 957 | 275 | 1 645 | 188 |
| 730 | 17,3 MB | 1 146 ms | — | 1 144 | 1 102 | 399 | 2 865 | 375 |
| 1 095 | 21,8 MB | 1 427 ms | — | 1 130 | 1 263 | 523 | 4 058 | 562 |
| 1 460 | 26,3 MB | 2 015 ms | — | 1 122 | 1 428 | 647 | 5 286 | 751 |
| 1 825 | 31,0 MB | 2 365 ms | 1 043 ms | 1 124 | 1 599 | 773 | 6 502 | 937 |
| 2 190 | 35,4 MB | 2 370 ms | — | 1 124 | 1 793 | 895 | 7 750 | 1 124 |
| 2 555 | 39,9 MB | 2 477 ms | — | 1 115 | 1 994 | 1 019 | 8 965 | 1 312 |
| 2 920 | 44,2 MB | 3 562 ms | — | 1 127 | 2 198 | 1 143 | 10 237 | 1 499 |
| 3 285 | 48,6 MB | 3 841 ms | — | 1 142 | 2 404 | 1 267 | 11 482 | 1 687 |
| 3 650 | 52,6 MB | 3 252 ms | 2 047 ms | 1 129 | 2 592 | 1 391 | 12 691 | 1 875 |

Nota: o salto 0,23 MB → 12 MB no primeiro ano vem da semeadura do mundo (atletas, duplas, calendário do circuito) e dos resultados do circuito; a população de atletas é estável (~1 130, o que é bom). Tempos de `saveCareer`/`loadCareer` têm variância (uma única medição por checkpoint).

### 3.3 Armazenamento (`storage-4MB.json`, `storage-52MB.json`)

Uma gravação completa de save pelo `GameStorage.writeJson`, em regime (com destino já existente): **1 `writeText` temporário + 1 `readText` de verificação + 1 `copy` (backup) + 1 `remove` + 1 `rename`** (IndexedDB: 2 `remove`) → o save inteiro é escrito 2× (temp e backup) e lido 1× por gravação, em qualquer backend.

| Save | `JSON.stringify` | `JSON.parse` | `structuredClone` | `writeJson` memória | `writeJson` IndexedDB (fake) | `readJson` memória / IDB (fake) |
|---|---|---|---|---|---|---|
| 4,3 MB | 26 ms | 12 ms | — | 46 ms | 127 ms | — |
| 52,6 MB | 291 ms | 208 ms | 408 ms | 599 ms | 5 665 ms | 359 ms / 684 ms |

O IndexedDB fake é muito mais lento que o real; use-o só para a proporção e a contagem de operações. **O caminho Tauri não pôde ser medido** (IPC + disco); o que ele recebe por gravação são os mesmos bytes (write temp de N bytes → IPC de N bytes para o Rust, depois o Rust relê N bytes via `storage_read_text` para a verificação → N bytes de volta pelo IPC). Isso é inferência por leitura de `TauriStorage.js`/`GameStorage.js`; **requer validação em dispositivo**.

### 3.4 Partida (`match.json`, `match-finalization.txt`)

60 partidas, seeds fixas: 140 pontos/partida (mediana), `createMatch` 0,14 ms, partida completa 19 ms (p95 35 ms), 0,117 ms/ponto (p95 0,25 ms); custo por ponto sobe levemente ao longo da partida (decil 1: 0,097 ms → decil 10: 0,146 ms; estatísticas incrementais), sem impacto prático. Estado final ≈451 KB em JSON (só em memória; o registro persistido é compacto, ≈6 KB). Mesma seed ⇒ mesmo resultado em 10/10 repetições.
`benchmark-match-finalization-rc.mjs` (100 partidas): 2 gravações/partida, 0 duplicadas, retry idempotente. **Ressalva importante**: esse benchmark usa um save falso minúsculo, então o custo de persistência (12 ms) **não representa** uma gravação de save de 12–50 MB. Como a finalização faz 2 gravações do save inteiro, em carreiras avançadas o pós-partida deve custar ≈2× o custo de gravação da §3.2/3.3 (inferência, não medida diretamente).

### 3.5 Perfil de CPU (`cpu-profile-400days.txt`)

structuredClone 37,0 %, JSON.stringify do save 18,0 %, GC 10,1 %, `withCareer` (escrita) 9,9 %, comparador de `sortRows` 3,7 %; regras do jogo <1 % cada. O perfil não separa quantas das cópias vêm da transação do dia versus validação/leituras; isso deve ser medido por contagem de chamadas na CLOUD-7B antes de mudar algo.

## 4. Matriz de gargalos

| # | Achado | Sev. | Impacto no jogador | Plataforma | Evidência | Causa provável | Correção | Risco regressão |
|---|---|---|---|---|---|---|---|---|
| 1 | Custo de cada gravação/dia cresce com o save inteiro (186→1 210 ms/dia) | **P1** | "Avançar" cada vez mais lento; x5/x10 multiplicam; pior no Android | Todas; Android pior (inferência) | §3.1, §3.5 | Save inteiro é clonado + serializado + verificado a cada dia | Média/alta: reduzir clones por dia ou escrever incrementalmente | Alto (persistência) |
| 2 | Torneios finalizados guardam brackets/snapshots completos (≈18 MB de 52,6 MB) | **P1** | Save e tempo de dia/load crescem; 10 anos = 52 MB | Todas | análise do save final (§3.2); `finalizado` = 1 241 torneios, 15–16 KB cada | Dados de histórico nunca arquivados/compactados | Média: compactar/arquivar após a temporada | Médio-alto (consumidores do histórico/UI) |
| 3 | Entidades de histórico ilimitadas: WorldEvent 12 691, AthleteRankingResult 9 035, CareerMessage 1 875, AnnualCareerReport 306 KB/ano + cópia em `player.annual_report_state` (299 KB) | **P2** | Crescimento contínuo do save | Todas | análise do save final | Sem política de retenção/poda | Baixa/média: janela de retenção por entidade | Médio |
| 4 | Load de carreira avançada: 1,0 s (31 MB) a 2,0 s (52,6 MB) em memória; no Android deve ser maior | **P2** | Tela de carregar lenta em carreiras longas | Todas; Android a validar | §3.2 | JSON.parse + validação do save inteiro | Acompanha #2/#3 | Baixo |
| 5 | Gravação = 2 escritas + 1 leitura do save inteiro (temp, verificação, backup) | **P2** | IPC/disco pesado por dia em saves grandes | Tauri (IPC), IndexedDB | §3.3 (contagem de ops); IPC é inferência | Protocolo de gravação atômica com verificação | Média: p.ex. verificar por tamanho/hash em vez de reler; exige cuidado | Alto (integridade do save) |
| 6 | Dias de virada de mês/ano ≈ 2× dia comum no fim (≈2,2 s) | P3 | Picos ocasionais | Todas | §3.1 `slowest` | Processamento mensal/anual sobre saves grandes | Acompanha #1 | Baixo |
| 7 | Divergência entre execuções com mesma seed sem relógio fixo | P3 | Nenhum para o jogador; atrapalha testes | Todas | 2 execuções, 60 dias: 943 vs 939 duplas, 594 vs 597 WorldEvent; com `--fakeClock`: digest idêntico | Ids com `Date.now()` alimentam hash FNV de `selectPair` (já documentado na CLOUD-5) | Usar relógio fixo em testes (já suportado) | — |
| 8 | Motor de partida | — (sem gargalo em Node) | — | Node | §3.4 | — | Não mexer | — |
| 9 | Renderizações React, memória, IPC real, Android | **Sem evidência** | — | Android | Não medido | — | Medir em dispositivo com `?perfdebug=1` | — |

## 5. Riscos de integridade

Verificado nos cenários medidos (sem inscrição em torneios do jogador): sem ids duplicados de torneio/evento em 11 checkpoints; 3 650 dias avançados sem bloqueio; salvar→carregar→continuar em 1, 5 e 10 temporadas; população estável (~1 130 atletas); `test:cloud-6n-career-flows` 22/22 e `test:browser-career-storage` passam. **Não verificado**: resultados aplicados 2×, rankings do jogador, parceiros do jogador e progressão (o jogador não competiu); cobertura de integridade do fluxo com partidas depende dos testes da CLOUD-6N (curtos) e de `benchmark-match-finalization` (idempotência confirmada).

## 6. Recomendações e plano CLOUD-7B

**Medir antes de mexer.** Primeiro passo da 7B: contar, por dia, quantas cópias/serializações do save inteiro ocorrem (instrumentação, sem lógica nova). Sem isso, a correção #1 é estimativa.

1. **Comprovadamente necessário** (evidência no §3)
   - (a) Compactar/arquivar torneios finalizados (#2): maior fatia do save, histórico, baixo valor de runtime. Pré-requisito: mapear quem lê `bracket_history`/`draw_*`/`placements` (UI de histórico, ranking, auditorias).
   - (b) Política de retenção para WorldEvent/AthleteRankingResult/CareerMessage e dedupe de `annual_report_state` vs `AnnualCareerReport` (#3).
   - (c) Reduzir cópias completas do save por dia (#1), após a contagem acima.
2. **Otimizações recomendadas** (evidência parcial)
   - Rever o protocolo temp/verificação/backup do `writeJson` por backend (#5) — só após validar o custo real do IPC no Android.
   - Dias de virada (#6) — provavelmente resolvidos por (a)–(c).
3. **Opcionais / sem evidência suficiente**: otimizações do motor de partida (#8), memoização React e custo de IPC (#9) — medir primeiro no Android; não implementar.

Meta de aceitação sugerida: mesma carreira de 10 temporadas ≤ ~20 MB de save e mediana/dia da temporada 10 próxima da da temporada 3–4 (≈450–550 ms em Node), com digests de resultado idênticos (`--fakeClock`) antes/depois. Sem mudar formato de save sem migração versionada.

## 7. Reprodução (Windows)

```
npm ci
:: 1) crescimento em 10 temporadas (≈45 min; use --days=730 para um teste de ~5 min)
node scripts/benchmark-cloud-7a-career-growth.mjs --days=3650 --sample=365 --reloadAt=365,1825,3650 --dumpSave=%TEMP%\save-final.json --output=reports/cloud-phase-7a-performance-audit/data/growth-10seasons.json
:: 2) partidas
node scripts/benchmark-cloud-7a-match.mjs --matches=60
:: 3) armazenamento (usa o save gerado em 1)
node scripts/benchmark-cloud-7a-storage.mjs --save=%TEMP%\save-final.json --runs=5
:: 4) determinismo: repita com --fakeClock e compare determinismDigest
node scripts/benchmark-cloud-7a-career-growth.mjs --days=60 --sample=60 --fakeClock --output=det1.json
:: 5) validações
npm run test:cloud-6n-career-flows
npm run test:browser-career-storage
npm run lint && npm run build
```
Tempos de Windows não serão comparáveis com os de Linux deste relatório; compare sempre dentro da mesma máquina.

## 8. Validação desta fase

| Comando | Resultado |
|---|---|
| `npm run test:cloud-6n-career-flows` | PASS (22 gates) |
| `npm run test:browser-career-storage` | PASS |
| `npm run lint` | PASS (exit 0) |
| `npm run build` | PASS (aviso de chunk pré-existente) |
| Demais testes legados | **não executados** nesta fase |
