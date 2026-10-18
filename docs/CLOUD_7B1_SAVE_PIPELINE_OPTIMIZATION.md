# CLOUD-7B1 — Otimização do pipeline de persistência

Base: `cloud/phase-7a-performance-audit` @ `9804adc` (ancestral: `integracao/cloud-6o` @ `d264c22`). Branch: `cloud/phase-7b1-save-pipeline-optimization`.
Dados brutos: `reports/cloud-phase-7b1-save-pipeline/`. Todas as medições são de **Node/Linux (4 vCPU)**; o "Tauri" abaixo é o `TauriStorage` real do cliente sobre um `invoke` **simulado em memória** (sem IPC, Rust, disco ou Android).

## 1. Resumo executivo

1. **A hipótese da CLOUD-7A não se confirma para o avanço de dia**: uma gravação lógica já faz exatamente **1 cópia completa do save + 1 serialização completa** (e 8 chamadas de armazenamento no Tauri). Não há cópia duplicada nesse caminho; reduzir o tempo diário sem mudar a arquitetura de persistência (fora do escopo) é limitado.
2. **O carregamento tinha redundância comprovada: 5 cópias completas do save** (4 desnecessárias) + uma codificação UTF-8 completa só para métrica. Agora: 1 cópia (a defensiva devolvida ao chamador) + 1 parse. **Carregamento −69 % a −77 %** em saves de 4 a 52 MB, nos dois backends, com repetições estreitas.
3. **No Tauri, cada gravação codificava o save inteiro em UTF-8 só para um contador do painel de depuração** (calculado mesmo com o painel desligado). Tornado lazy: **avanço de dia −13 % (12 MB), −17 % (31 MB), −28 % (52 MB)** na mediana, p95 −13 %/−14 %/−19 % (Tauri simulado). Nos caminhos memória/IndexedDB essa linha de código não executa: variação medida +4 %/0 %/−11 % = ruído (controle).
4. **Integridade preservada**: o arquivo de save persistido é **byte a byte idêntico** (sha256) ao do código anterior em 45 dias (memória), 15 dias (Tauri simulado) e +10 dias a partir de um save antigo; 37 verificações de equivalência/compatibilidade/isolamento/falhas passam. Nenhum formato, regra, backup ou verificação foi alterado.
5. **Meta de 20 % (desejada, não obrigatória)**: atingida só no caminho Tauri em carreiras avançadas (31–52 MB); **não** atingida em memória/IndexedDB. Não foram feitas mudanças arriscadas para forçar o número.
6. **Descoberta lateral**: duas execuções do **mesmo** código-base, com seed, relógio e UUID fixados, divergem em 365 dias (ver §9). Isso limita as comparações de equivalência à janela determinística de 45 dias.

## 2. Mapa do pipeline (arquivo → função → cópias/serializações)

**Avanço de dia / qualquer unidade lógica**
`dayAdvanceCoordinator.advanceCareerDayOnce` → `ActiveCareerAdapter.withPersistenceTransaction`:
`clone(snapshot)` = **1 structuredClone completo** (o *draft*; isolamento/rollback) → o trabalho do dia muta o draft in loco (`mutateActiveCareer` em transação: só `clone(result)` pequenos; nenhuma cópia do save) → commit: `storageStateEquals(draft, snapshot)` (comparação que sai no 1º campo diferente) → `CareerManager.saveCareer(owned:true)` (`validateCareerData` sem cópia) → `CareerRepository.writeCareer(validated:true)` → `GameStorage.writeJsonUnlocked`: **1 `JSON.stringify` completo** → `writeText(temp)` → `readText(temp)` + comparação (verificação) → `exists` → (backup periódico a cada 5 min) → recuperação de crash: `remove(stale)`, `copy(dest→recovery)`, `remove(dest)` → `rename(temp→dest)` → `remove(recovery)` → `adoptActiveCareer(saved)` (sem cópia).
Gravação fora de transação (`mutateActiveCareer`): 1 clone completo + 1 stringify, igual.
**Carregar** (`getActiveCareer` → `CareerManager.loadCareer`): `readJson` (`readText` + `JSON.parse`) → `migrateCareer` → `validateCareerData` → (`loadCareer`) `migrateCareer` de novo → adaptador `setActiveCareer` → cópia ao chamador.
**Finalização de partida**: 2 gravações lógicas (núcleo + derivados, adiadas de propósito desde a M3.7), cada uma = 1 clone + 1 stringify + o protocolo acima.

## 3. Instrumentação (opt-in; nada disso existe em produção)

`scripts/profile-cloud-7b1-save-pipeline.mjs`: substitui `structuredClone`/`JSON.stringify`/`JSON.parse`/`TextEncoder.encode` **só no processo de teste**, contando chamadas, ms e bytes por local de chamada em `src/` e marcando "FULL_SAVE". `scripts/lib/cloud7b1TauriMock.mjs`: `invoke` simulado + contagem de comandos. Sem overhead no app e sem logs.

Por dia, antes (código-base), save de 12 MB / 52 MB, Tauri simulado: clone completo 1 / 1 (86 ms / 515 ms em memória), stringify completo 1 / 1 (131 / 698 ms), **codificação UTF-8 do save 1 / 1 (≈35 / 355–418 ms)**, comandos: write 1, read 1, exists 2, copy 1, remove 2, rename 1. Clone+stringify = 96 % do dia no save de 52 MB.
Por carregamento, antes → depois (52 MB): cópias completas **5 → 1**, parse 1 → 1, codificação UTF-8 1 → 0; invokes iguais.

## 4. Redundâncias comprovadas e otimizações realizadas

| # | Mudança (arquivo) | Evidência | Por que é seguro |
|---|---|---|---|
| 1 | `migrateCareer(career, {owned})` e uso em `CareerRepository.readCareer` e `CareerManager.loadCareer` | 2 clones completos no `readCareer` + 1 no `loadCareer` (≈0,5 s cada em 52 MB) | O objeto vem de `JSON.parse` recém-feito (`readJson` não tem cache) ou é a saída privada de `readCareer`; sem a opção o comportamento é o antigo. Mesmo padrão `owned` já usado em `validateCareerData` (5.25). |
| 2 | `validateCareerData(migration.data, {owned:true})` em `readCareer` | idem | `migration.data` é privado do método. |
| 3 | `ActiveCareerAdapter.getActiveCareer`: `adoptActiveCareer(career)` em vez de `setActiveCareer` (clone) | 1 clone completo (≈0,5 s) | `CareerManager` não guarda referência ao objeto devolvido; o chamador continua recebendo cópia isolada (`cloneResult`). Teste C cobre. |
| 4 | `TauriStorage.writeText` e `GameStorage.readJson`: métrica de bytes **lazy** | UTF-8 do save inteiro em toda gravação/leitura, mesmo com o probe desligado | Só o valor reportado no painel `?perfdebug=1` é calculado mais tarde; `storageIOProbe` agora também resolve `bytes` lazy no caminho de falha (antes passava a função como número → NaN). |

Total: 8 arquivos de produção, +24/−7 linhas. Reversível por Git.

## 5. Otimizações rejeitadas (documentadas para a 7B2)

- **Reaproveitar o JSON do último commit para criar o draft** (`JSON.parse` é ~2× mais rápido que `structuredClone`): exigiria reter uma string de 52–105 MB na memória do Android e muda a semântica do clone (undefined/NaN/Date). Rejeitada.
- **Remover/encurtar a releitura de verificação do temporário** (1 leitura do save inteiro por gravação — no Tauri é a maior parcela restante de IPC): é verificação crítica; proibido. Candidata: verificar no lado Rust (tamanho + hash), o que muda o contrato.
- **Trocar `copy`+`remove` por `rename` na recuperação de crash**: economiza uma cópia completa de arquivo por gravação, mas altera a janela de falha no Android/Windows e não pôde ser validado aqui. Candidata.
- **Eliminar `clone(result)` duplicado** (`mutateActiveCareer` + `clone(transaction.result)` nos chamadores): ≈2 % do dia; depende de contrato implícito de repositórios injetáveis (os testes usam repositórios falsos). Rejeitada por custo/benefício.
- **Fundir as 2 gravações da finalização de partida**: o adiamento é intencional (M3.7). Mantida.
- **Persistência incremental / estruturas persistentes / compactação de histórico**: mudam formato ou contrato; é o escopo da 7B2.
- **Boot com `cloneResult:false`**: ainda resta 1 cópia completa na abertura (≈0,65 s em 52 MB); exige auditar cada chamador. Candidata.

## 6. Benchmarks antes × depois

Processos separados e alternados (base em `git worktree` de `9804adc`), nada rodando em paralelo. "Base" e "7b1" usam os **mesmos saves** (gerados pelo código anterior), seed e relógio fixos.

**Carregamento** (`getActiveCareer`, mediana de 5 cargas × 3 repetições; ms)

| Save | Memória/IndexedDB* base → 7b1 | Δ | Tauri simulado base → 7b1 | Δ |
|---|---|---|---|---|
| 4,3 MB (40 d) | 184 → 42 | −77 % | 181 → 50 | −72 % |
| 12,3 MB (1 ano) | 583 → 158 | −73 % | 547 → 173 | −69 % |
| 30,9 MB (5 anos) | 1 592 → 405 | −75 % | 1 706 → 417 | −76 % |
| 52,6 MB (10 anos) | 2 785 → 733 | −74 % | 2 846 → 737 | −74 % |

\*backend em memória; o `BrowserStorage` não foi cronometrado em Node (o `fake-indexeddb` não é representativo), mas o código alterado é o mesmo no caminho de leitura. Repetições (base/7b1, 52 MB, memória): 2 890/2 785/2 737 vs 776/689/733.

**Avanço de dia** (somente dias; 15 dias × 3 repetições = 45 amostras/célula; ms)

| Save | Backend | mediana base → 7b1 | Δ | p95 base → 7b1 | Δ |
|---|---|---|---|---|---|
| 12,3 MB | memória (controle) | 257 → 266 | +3,7 % | 495 → 544 | +9,9 % |
| 30,9 MB | memória (controle) | 642 → 643 | +0,2 % | 930 → 953 | +2,4 % |
| 52,6 MB | memória (controle) | 1 215 → 1 082 | −10,9 % | 1 957 → 1 966 | +0,4 % |
| 12,3 MB | Tauri simulado | 303 → 263 | **−13,2 %** | 548 → 477 | −12,9 % |
| 30,9 MB | Tauri simulado | 706 → 588 | **−16,8 %** | 1 038 → 889 | −14,3 % |
| 52,6 MB | Tauri simulado | 1 476 → 1 065 | **−27,9 %** | 2 216 → 1 788 | −19,3 % |

O controle (caminho não alterado) mostra a faixa de ruído: até ±11 % na mediana em saves de 52 MB (medianas por execução da base: 1 332/1 135/1 052). Por isso o ganho do Tauri em 12 MB (−13 %) fica perto do ruído; os de 31–52 MB estão acima e batem com o custo medido da codificação (355–418 ms de ≈1 480–2 070 ms do dia).
Uma primeira rodada (com 5 cargas antes dos dias no mesmo processo) mostrou até −21 % também em memória: é efeito de heap/GC das cópias de carga removidas, não do caminho do dia; por isso a rodada "somente dias" é a referência.

**Uma temporada completa** (365 dias, Tauri simulado, mediana do dia; ms): base 240 / 211 / 218 → 7b1 180 / 181 (≈ −16 %); gravar o save (checkpoint) 1 187/753/701 → 424/412; carregar 338/404/352 → 63/147. **5 e 10 temporadas completas não foram reexecutadas** com o código novo (≈20 e ≈45 min por corrida, e o caminho do dia só muda no Tauri): foram medidas diretamente sobre os saves de 5 temporadas (31 MB) e 10 temporadas (52,6 MB) da tabela acima. Baseline completo de 5 temporadas (Tauri simulado): mediana por temporada 240/439/571/695/820 ms.

| Indicador | Baseline | CLOUD-7B1 |
|---|---|---|
| Cópias completas por dia | 1 | 1 (inalterado) |
| Serializações completas por dia | 1 | 1 (inalterado) |
| Comandos Tauri por dia (gravações físicas: 1 write + 1 read de verificação + 1 copy + 1 rename + 2 remove + 2 exists) | 8 | 8 (inalterado) |
| Cópias completas por carregamento | 5 | 1 |
| Tamanho do save | idêntico (bytes) | idêntico (bytes) |
| Gravação lógica isolada (`Post.create`, 52 MB, mediana) | memória 946 / Tauri 1 600 ms | memória 1 151 / Tauri 834 ms — **ruído alto, sem conclusão** (5 amostras/execução) |

Em memória a gravação isolada oscila ±20 % entre execuções sem mudança de código; só o Tauri (−48 % em 52 MB) tem causa identificada (codificação UTF-8). Efeito esperado na finalização de partida (2 gravações): proporcional, não medido de ponta a ponta.

## 7. Testes

- Novo `npm run test:cloud-7b1-save-pipeline` — 37 verificações: **A** equivalência byte a byte do save (memória dias 15/30/45; Tauri simulado dia 15; save antigo +10 dias; baseline gravado com o código anterior, reproduzível entre processos), **B** save gerado pelo código anterior (fixture `.json.gz`) carrega, avança, grava, recarrega e continua sem duplicar torneios, **C** isolamento (retornos de `getActiveCareer`, `loadCareer`, `readCareer`, `fresh`, `Entity.create/update`, `updatePlayerProfile` e snapshots pré-commit não compartilham referências), **D** falhas (escrita do temporário, temporário divergente, referência circular, dados inválidos, interrupção no meio da transação, escritas concorrentes, dois cliques em "Avançar"): disco e estado ativo intactos e nenhuma transação pendente. As seções C e D também passam no código-base (garantias preexistentes preservadas); A e a rodada B/C/D só comparam o código novo com o baseline.
- Executados e aprovados no código final: `test:cloud-6n-career-flows` (22 gates), `test:browser-career-storage`, `test:mobile-storage-m3-6`, `test:mobile-persistence-m3-7`, `test:achievement-save-migration`, `test:career-persistence-integrity`, `test:world-save-load`, `test:career-legacy-integrity`, `test:match-finalization-performance`, `test:tier-ladder-migration-fase3`, `npm run lint`, `npm run build` (aviso de chunk preexistente), `git diff --check`.
- Não executados: o restante da suíte legada.

## 8. Riscos remanescentes

- A mudança 3 assume que `CareerManager.loadCareer/readCareer` devolvem objeto que ninguém mais referencia (verdade hoje; o teste C pega regressões). Um futuro cache no manager/repositório quebraria a suposição.
- `migrateCareer(owned)` deixa o objeto de entrada parcialmente migrado se lançar erro no meio; os dois chamadores descartam o objeto.
- Ganhos do Tauri medidos com IPC simulado: no Android o custo da string de 12–52 MB no IPC (write + read de verificação) é maior e **não foi medido**; a economia da codificação deve ser pelo menos a medida aqui, mas é inferência.
- Nenhum teste em dispositivo, WebView ou IndexedDB real.

## 9. Descoberta: não determinismo residual

Rodando **o mesmo código-base** (`scripts/benchmark-cloud-7a-career-growth.mjs --fakeClock --seed=7b1 --storage=tauri-mock --days=365`, agora também com `crypto.randomUUID` fixado) em 3 processos, o save do dia 365 difere (12 308 508 vs 12 300 655 bytes; contagens de `TeamRanking` 929 vs 947, `Partnership` 614 vs 606, pontos de ranking diferentes). Há outra fonte de entropia além de `Math.random`/`Date`/UUID (provavelmente tempo real ou ordem assíncrona; a CLOUD-5 já registrava o pareamento de bots como não determinístico). Efeitos: (a) a equivalência byte a byte só vale na janela determinística (45 dias + fixture); (b) vale uma investigação própria, pois "resultados determinísticos" é requisito do projeto. Não alterado aqui.

## 10. Limitações de plataforma

Só Node/Linux; Tauri e IndexedDB reais, Android e Windows não foram medidos. Para repetir no Windows: `reports/cloud-phase-7b1-save-pipeline/README.md`. Tempos de máquinas diferentes não são comparáveis; compare sempre base × 7b1 na mesma máquina.

## 11. Recomendações para a CLOUD-7B2

1. **Medir no Android/Windows reais** (Tauri) o custo de IPC da escrita + leitura de verificação de um save de 12–50 MB; é a maior parcela que sobra no Tauri e só se mexe com contrato novo (verificação no Rust, `rename` em vez de `copy`).
2. **Reduzir o tamanho do save** (poda/compactação de torneios finalizados — 35 % do save —, `WorldEvent`, `AthleteRankingResult`, relatórios anuais): é o único fator que reduz clone **e** stringify **e** I/O de forma proporcional. Planejar com migração versionada e testes de equivalência de leitura (o harness desta fase serve de base).
3. Auditar o boot para usar `cloneResult:false` onde seguro (−1 cópia completa na abertura).
4. Investigar a fonte de entropia residual (§9) antes de qualquer teste de equivalência em janelas longas.
