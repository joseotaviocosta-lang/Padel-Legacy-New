# CLOUD-7B2C — Compactação histórica incremental (prova de conceito)

## 1. Resumo executivo

- **Resultado: promissor, mas NÃO ativado.** A compactação incremental (cada torneio liquidado é empacotado uma única vez e permanece empacotado em memória, no clone transacional e no arquivo) reduz o avanço diário mediano em **−12 % (memória) / −15 % (Tauri simulado)** em 5 temporadas (31 MB) e só **−5,5 %** em 1 temporada (12 MB), com o save **−8,9 %** (5 temp.) / **−4,5 %** (1 temp.). A compactação repetida da 7B2B fica **+28 % a +50 % mais lenta** no avanço diário e confirma-se inviável.
- Integridade: equivalência de ponta a ponta comprovada (save final idêntico ao baseline, 10 dias em 1 temporada e 5 dias em 5 temporadas, 620 torneios empacotados); 53 verificações próprias aprovadas; suítes de regressão aprovadas com a chave desligada (padrão) e, com ela ligada, exceto duas comparações que dependem do formato (§9).
- Achado colateral que explica o ganho: **um filtro diário lia `bracket_history` de todos os torneios**. Reordenar predicados puros (resultado idêntico) tirou ~465 expansões/dia (de ~1 s de custo acumulado) e acelera também a base.
- Custos: compactação inicial de saves antigos (+~650 ms no 1º dia em 5 temporadas, uma vez), carga ≈ +5 % (5 temp., ruído da ordem de ±10 %), e **downgrade não suportado**.
- Mantida desligada (`INCREMENTAL_COMPACTION_ENABLED=false`). Android **não medido**.

## 2. Base Git

Branch `cloud/phase-7b2c-incremental-compaction`, derivada exatamente de `ad71978` (ancestrais `86f7307`, `7795e8e`, `9804adc`, `d264c22` verificados; working tree limpo). `main` e branches anteriores intocadas.

## 3. Mapa da implementação atual (7B2B)

| Ponto | Comportamento 7B2B |
|---|---|
| Empacotar | `CareerRepository.writeCareer` → `packCareerForStorage`: **todo** torneio liquidado a **cada** gravação (~0,5–0,7 ms cada + prova de round-trip). Torneio processado N vezes (N = nº de gravações). |
| Desempacotar | `CareerRepository.readCareer` e `restoreCareerBackup`: todos de uma vez na carga. |
| Estado em memória | Sempre expandido (clone transacional e stringify pagam o tamanho total). |
| Clones completos | 1 por gravação lógica (draft) + 1 por carga (7B1); inalterados. |
| Quem precisa do histórico completo | Telas de chave/detalhe, mídia, `tournamentLifecycle`, `WorldTourLifecycle` (liquidação), migração < v13. |

## 4. Matriz de leitores históricos

Todos os leitores de entidades passam por `CareerEntityRepository` (`list/filter/get`, que entrega cópias rasas); só migração e `calendarLifecycle` leem `career.entities.Tournament` direto.

| Leitor | Campos | Frequência de acesso | Estratégia compatível | Risco |
|---|---|---|---|---|
| `tournamentLifecycle.resolvePendingPlayerCanonicalTournaments` | `bracket_history` | **Diária, em todos os torneios** (antes) | Predicados reordenados: resolvidos nunca leem a chave | Baixo (puro) |
| `WorldTourLifecycle` (liquidação, `committedPairIdsForWindow`) | `bracket_history`, `draw_pair_ids` | Só torneios não resolvidos | Linhas ainda expandidas; sem custo | Nenhum |
| `TournamentBracket`, `tournamentBracketView`, `TournamentModal`, `TournamentDetailsModal` | `bracket_history`, `participants`, `placements` | Por interação (tela de torneio) | Getter preguiçoso por cópia | Baixo |
| `careerCommunications`, `journal`, relatórios anuais | `bracket_history` (final), `champion`, `runner_up` | Por evento/tela | Getter preguiçoso (ou só escalares) | Baixo |
| `career.js` (checagem de "torneio jogado") | `participants` | Raro | Getter preguiçoso | Baixo |
| `calendarLifecycle` | só escalares | Recuperação de partida | Linha crua | Nenhum |
| `CareerMigration` (<v13) | tabela de torneios | Só saves pré-v13 | **Expandir antes de migrar** (implementado) | Médio (saves muito antigos) |
| `BetaTools`/export | save inteiro | Manual | `exportCareer` devolve expandido; `readCareer` cru devolve empacotado | Baixo (diagnóstico) |

Não foram modificados componentes React.

## 5. Arquitetura incremental proposta

1. **Empacotar uma vez**: ao fim de cada transação de escrita de entidades, `compactSettledRows` varre `Tournament` (2 leituras de campo por linha) e empacota, com prova de round-trip, as linhas liquidadas ainda abertas. Linha empacotada nunca é processada de novo.
2. **Permanece empacotada** em memória, draft, snapshot e arquivo. O corpo do pacote é **um único string JSON** (`history_pack.blob`): `structuredClone`/stringify o tratam como um valor, não como milhares de objetos (medido: clone −55 %, stringify −29 %, parse −23 %, heap −20 % num save de 31 MB). O objeto inline da 7B2B só dava clone −32 %.
3. **Camada de compatibilidade única**: `CareerEntityRepository` entrega cópias cujos campos pesados são getters enumeráveis e graváveis, que expandem só quando lidos e **não guardam estado expandido em cache** (memo só dentro da própria cópia; nenhuma estrutura global mutável além de contadores explícitos e resetáveis).
4. **Escritas**: patch escalar mantém a linha empacotada; patch em campo pesado expande a linha antes de mesclar e a próxima varredura a reempacota (contado). `update/upsert/bulkUpdate/batch` devolvem a cópia preguiçosa (o clone final entrega o torneio completo).
5. **Persistência**: o arquivo já contém o formato em memória (sem etapa de empacotar na gravação). Com a chave ligada a leitura mantém empacotado; saves com `save_schema_version` abaixo do atual são expandidos antes de migrar. Sem decisão por tempo real: elegibilidade = estado liquidado inequívoco (a data não conta).

## 6. Protótipo implementado

Produção (todos inertes com a chave desligada): `src/careers/incrementalHistory.js` (novo), `src/careers/tournamentHistoryCodec.js` (forma `blob`, `expandHistoryFields`), `src/gameplay/repositories/CareerEntityRepository.js` (+18/−12: visões preguiçosas, `writableRow`, varredura), `src/careers/CareerRepository.js` (manter empacotado quando a chave está ligada), `src/careers/CareerManager.js` (export expandido), `src/game-core/tournamentLifecycle.js` (**única mudança ativa mesmo com a chave desligada**: reordenação de predicados puros, mesmo resultado). Experimentais: scripts de teste/benchmark/verificação e preload em `scripts/` e `scripts/lib/`. Chave: `INCREMENTAL_COMPACTION_ENABLED=false`; `globalThis.__PADEL_INCREMENTAL_COMPACTION__` liga nos testes/benchmarks.

## 7. Estratégia de compatibilidade

- Saves antigos (expandidos) carregam sem migração; com a chave ligada, a **primeira escrita** empacota os liquidados (compactação inicial, uma vez) e regrava o arquivo; nada é convertido sem escrita do jogador.
- Saves 7B2B (objeto inline) leem normalmente (a leitura aceita `dict/fields` inline e `blob`).
- **Downgrade: versões anteriores do aplicativo não leem saves com `history_pack`** (sem o torneio completo a chave some). Não há escrita compacta por padrão, nenhuma conversão automática de carreiras reais, e nenhuma expectativa de retrocompatibilidade: antes de qualquer ativação é preciso um mecanismo de bloqueio de downgrade (ex.: `save_schema_version`) e backup pré-conversão.
- Exportar sempre produz formato expandido.

## 8. Testes de equivalência

`npm run test:cloud-7b2c-incremental-compaction` (53 verificações, fixture de 125 torneios finalizados reais): empacotamento uma única vez e idempotente (varreduras repetidas não trocam nenhum objeto), visão idêntica ao original (chaves, ordem, valores; spread/JSON), leitura só de escalares não expande, campeões/vices/colocações/chaves/premiações idênticos pela camada de leitura, escritas escalares e pesadas, retorno completo de `update`, persistência/recarga/export, 40 dias de carreira real com compactação e continuação após recarregar.
**Motor ponta a ponta** (`scripts/verify-cloud-7b2c-engine-equivalence.mjs`, relógio/RNG/UUID fixos, hash do save final expandido): 1 temporada, 10 dias — `incremental`, `repeated` e uma das duas execuções `off` idênticos; 5 temporadas, 5 dias — `off` e `incremental` idênticos (620 torneios empacotados); a tabela de torneios é idêntica em **todas** as execuções.
**Achado (não investigado, fora de escopo)**: duas execuções `off` do mesmo save/seed/relógio divergiram em `AthleteProfile`, `TeamRanking`, `WorldEvent`, `AthleteRankingHistory`, `CareerMessage`, `Relationship` e `player` (1 de 2), sem diferença em `Tournament`. É a divergência entre processos da 7B2A, agora reproduzida em save real de 1 temporada (evidências em `data/equivalence-1season-*.json`); independe da compactação.
Cenário de jogador ativo: o 6n (fluxos críticos com jogador) passa com a chave ligada e os campos extras de partida do jogador são cobertos pelo teste da 7B2B; **não há simulação de temporadas completas com jogador ativo participando de torneios** com a chave ligada.

## 9. Testes de falhas

Cobertos (chave ligada): falha de escrita e de verificação do temporário preservam arquivo e estado; interrupção no meio da transação (rollback); blob corrompido falha fechado ao ler o campo e não afeta outros torneios; duas atualizações concorrentes sobre torneio empacotado não corrompem o histórico; patch pesado expande e reempacota; torneios não liquidados, com partida pendente, sem settlement, sem campeão ou sem chave nunca são empacotados; inconsistência só empacota se o round-trip provar igualdade exata.
Regressão (`reports/.../README.md`): chave **desligada** — todas as suítes passam (6n, 7b1, 7b2a, 7b2b, 7b2c, browser storage, mobile 3.6/3.7, integridade, world save/load, achievements). Chave **ligada** — passam 6n, browser, mobile 3.6/3.7, integridade, world save/load, achievements, 7b2c; falham, **por desenho**, a comparação byte a byte da 7b1 com o baseline pré-7B2B e uma asserção da 7b2b que supõe carga sempre expandida. `lint`, `build` e `git diff --check` limpos. O 7b2a só foi executado com a chave desligada.

## 10. Benchmarks das três estratégias

Node 22/Linux, CPU sem outra carga, saves reais gerados por `86f7307`, 3 rodadas alternadas × (1 dia de aquecimento + 8 dias) = 24 amostras de dia por célula (16 no Tauri simulado, 2 rodadas). Dados: `data/ab-v2/`, `data/summary-v2.json` (rodada anterior à reordenação: `data/ab/`, `data/summary.json`). "Tauri" = `TauriStorage` real sobre `invoke` simulado.

| Save / backend | Indicador | Sem compactação | Repetida (7B2B) | Incremental |
|---|---|---|---|---|
| 5 temp. (31 MB) memória | Tamanho do save | 31,0 MB | 27,2 MB | **28,2 MB** |
| | Avanço diário mediano / p95 (ms) | 908 / 1 314 | 1 230 / 1 673 | **797 / 1 250** |
| | Carga mediana (ms) | 618 | 757 | 649 |
| | Gravação mediana (ms) | 632 | 1 076 | **507** |
| | Heap após aquecimento (MB) | 310 | 297 | 297 |
| | 1º dia (inclui compactação inicial) | 1 307 | 1 833 | 1 958 |
| 5 temp. Tauri simulado | Avanço diário mediano / p95 | 920 / 1 474 | 1 383 / 1 629 | **782 / 1 320** |
| | Carga / gravação | 633 / 698 | 687 / 1 119 | 634 / 616 |
| 1 temp. (12 MB) memória | Tamanho do save | 12,29 MB | 11,53 MB | 11,74 MB |
| | Avanço diário mediano / p95 | 402 / 658 | 513 / 856 | 380 / 651 |
| | Carga / gravação | 225 / 228 | 295 / 322 | 255 / 217 |
| | 1º dia | 401 | 504 | 536 |

Variação incremental × sem compactação: 5 temp. memória **−12,2 %** mediana / −4,9 % p95; 5 temp. Tauri **−15,0 %** / −10,4 %; 1 temp. **−5,5 %** / −1,1 %; gravação −20 % / −12 % / −5 %; carga +5 % / 0 % / +13 % (3 rodadas; ruído da ordem de ±10 %); heap −4 %.
Custos de operação (contadores): empacotar 1 torneio ≈ 0,7–0,8 ms (620 torneios = 444 ms; 124 = 102 ms), **1 empacotamento por torneio** (repetida: 1 por gravação); depois da reordenação **0 expansões** durante o avanço diário (antes: ~465/dia ≈ 80–100 ms/dia); 22 320 visões criadas em ~12 operações a 5 temporadas (custo de `copyRows`, incluído nas medidas acima). Impacto na finalização do torneio: o torneio é empacotado no fim da escrita que o finaliza (≈0,8 ms). Não medido: custo isolado de leitura histórica de UI, 10 temporadas (sem fixture de 52 MB gerada), Android.
Efeito isolado da reordenação (rodada com a base antiga, `data/summary.json`: base 1 007 ms/929 ms Tauri; mesma base com a reordenação 908/920): indicativo de **−10 % (memória) / −1 % (Tauri)**, dentro do ruído no Tauri; é uma melhoria da base independente da compactação. Mesmo com ela, a compactação adiciona −12 % a −15 % sobre a base já reordenada.

## 11. Ganhos e regressões

Ganhos: avanço diário −12/−15 % em carreiras longas, gravação −12/−20 %, save −9 %, heap −4 %, sem recompactação. Regressões: compactação inicial única (+0,1–0,65 s no 1º dia), carga +0–13 % (dentro do ruído), p95 de 1 temporada ≈ igual, downgrade impossível.

## 12. Riscos remanescentes

- Qualquer leitor novo (ou futuro) que percorra todos os torneios lendo campos pesados anula o ganho e cria expansões em massa; é preciso um teste/contador de expansões por dia (já exposto em `getIncrementalStats`).
- Leitores diretos de `career.entities.Tournament` fora da camada de entidades veem `history_pack` (hoje só migração e `calendarLifecycle`, tratados); `readCareer` cru/BetaTools também.
- Linha empacotada tocada por escrita pesada é expandida e reempacotada (custo por toque); nenhuma rotina atual faz isso em torneios finalizados nos cenários testados.
- Migração < v13 depende da expansão prévia (implementada, não exercitada com um save real tão antigo).
- Divergência entre processos do baseline (7B2A) segue sem explicação e dificulta provar equivalência byte a byte; usei Tournament idêntico + 3 execuções coincidentes.

## 13. Limitações

Somente Node (memória e Tauri simulado), 24 amostras/célula, ruído de ±10 % nas medianas; 10 temporadas não medidas; jogador ativo em temporadas completas não testado; nenhum teste em Android/Tauri reais; o ganho depende do número de torneios finalizados (1 temporada: pequeno).

## 14. Recomendação

**Continuar investigando; não ativar.** O ganho em carreiras longas (−12 a −15 %) está perto da meta de 15 % sem comprometer a integridade, mas (a) falta medir 10 temporadas e Android, (b) falta bloqueio de downgrade e backup pré-conversão, (c) falta teste com jogador ativo ao longo de temporadas, e (d) o ganho é frágil a leitores que expandem tudo. Se as medições em aparelho confirmarem ≥15 %, ativar por flag em build de teste, nunca convertendo carreiras reais automaticamente.

## 15. Próximos passos para Android

1. Build com a chave ligada só para saves de teste; gerar/medir save de 52 MB (10 temporadas) e carreira com jogador ativo.
2. Medir avanço diário (mediana/p95), carga, gravação, heap e GC no aparelho, mesma ordem alternada, `getIncrementalStats()` por dia (expansões ≈ 0).
3. Implementar bloqueio de downgrade e backup antes da primeira escrita compacta.
4. Rodar o `test:cloud-6n-career-flows` e o fluxo de jogador ativo nesse build.
