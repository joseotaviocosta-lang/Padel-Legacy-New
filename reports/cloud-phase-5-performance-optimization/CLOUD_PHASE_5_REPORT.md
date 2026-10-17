# CLOUD-5 — Performance Profiling & Targeted Optimization

Branch: `cloud/phase-5-performance-optimization` (origem `cloud/phase-4-integration-validation`, `df8902b`). Sem push, PR, merge ou rebase.

## 1. Ambiente e metodologia
Linux, 4 vCPU, Node v22.22.0, Vite SSR com armazenamento Tauri **em memória** (sem I/O de disco real, sem WebView, sem Android). Os números são de **CPU/contagem de gravações em Node**, não tempos do Redmi 12; só servem para comparar antes/depois. Amostras: 3 execuções por cenário, mediana de cada uma e mediana das medianas. Dados brutos em `data/`.

Ferramentas novas (reproduzíveis): `npm run benchmark:phase5-steady-state`, `npm run benchmark:phase5-micro`, `npm run test:phase5-perf-equivalence`.

## 2. Gargalos investigados e evidências

| # | Fluxo | Achado | Status |
|---|---|---|---|
| 1 | Abertura de carreira (semeadura do mundo, `ensureWorldSeed2025`) | **156 gravações físicas completas do save** (100 `AthleteProfile.create` + 50 `TeamRanking.create` + lotes), ~2,16 s em Node | **Demonstrado → otimizado** |
| 2 | Virada de mês / mercado de parcerias de IA | CPU profile: `normalizeAthlete` chamado 4×/par em `assignmentPenalty` = 11,2 % do CPU self-time; dia de virada ≈ 2,08 s | **Demonstrado → otimizado** |
| 3 | Avanço de 1 dia (caminho de produção `advanceCareerDayOnce`) | 1 gravação física, ~92 ms mediana; 7 dias = 7 gravações. Já otimizado em fases anteriores (transação única) | Sem gargalo atual |
| 4 | Finalização de partida | `test:match-finalization-performance`: 2 gravações/partida, 0 duplicadas | Sem gargalo atual |
| 5 | `Tournament.update` ×N + `WorldEvent.create` ×N em `ensureWorldTourDraws` (cancelamento de eventos passados) | 119+122 gravações individuais, ~9,6 s — **só** no 1º dia do benchmark, que inicia a carreira no meio do calendário sem sorteios prévios | **Hipótese** (artefato provável do cenário; não demonstrado em fluxo real) — não alterado |
| 6 | Clone completo do save (`structuredClone`) por transação/mutação | 23–41 % do CPU nos perfis, mas já reduzido na 5.25; no caminho de produção é 1 clone/dia | Documentado, não alterado |
| 7 | Renderizações React / navegação entre telas | Não medidas (exigem WebView/dispositivo). Há testes estáticos prévios (`test:ui-performance`, `mobile-performance-*`) | **Hipótese**, fora do alcance da nuvem |

Observação: `benchmark-time-advance-rc.mjs` (pré-existente) mede o 1º dia de uma carreira nova **sem transação e com a semeadura embutida** (secundário 4,5–21 s). Isso não representa o caminho de produção; por isso criei o benchmark de estado estável (semeadura fora da medição; caminho `advanceCareerDayOnce`/`advanceCareerDays`).

## 3. Otimizações implementadas (2 de no máx. 3)
1. **Semeadura em lote** (`src/lib/saveFoundation.js`): `upsertManyBy` cria atletas reais e duplas semeadas ausentes com um `bulkCreate` por entidade. Linhas já existentes seguem o mesmo caminho de patch. Chaves repetidas ou falha do lote caem no `upsertBy` sequencial original.
2. **Resolução de lados** (`src/players/athleteSchema.js`, `teamCompatibility.js`): `normalizeSideProfile` (extraído de `normalizeAthlete`, mesma fonte única) é calculado 1× por jogador, em vez de `normalizeAthlete` completo 4× por par.

Terceira otimização não aplicada por falta de evidência segura (item 5/6).

## 4. Comparação antes/depois (mediana de 3 execuções)

| Cenário | Antes | Depois | Observação |
|---|---|---|---|
| Semeadura do mundo – tempo | 2 164 ms | 258 ms | −88 % |
| Semeadura do mundo – gravações físicas | 156 | 8 | |
| Dia de virada de mês (`advanceCareerDayOnce`) | 2 084 ms | 810 ms | −61 % |
| `evaluatePartnerCompatibility` ×60 000 (micro) | 413,7 ms | 199,4 ms | −52 % |
| Dia comum (mediana de 10 dias) | 91,6 ms | 97,6 ms | **sem ganho**; diferença dentro do ruído (execuções de 87–102 ms), a otimização não atua nesse caminho |
| +7 dias | ~562 ms / 7 gravações | ~640 ms / 7 gravações | idem (ruído; sem ganho) |

## 5. Equivalência funcional
- Micro: SHA-256 da saída de 60 000 pares idêntico antes/depois (`30d43f59…5524`).
- `test:phase5-perf-equivalence`: 20 000 pares aleatórios (inclui valores inválidos/ausentes) idênticos ao oráculo da implementação anterior.
- Mundo semeado: digest canônico (atletas reais + duplas `seed-*`, ids trocados por chaves estáveis) idêntico antes/depois (`4c47c747…bbae758`); totais 1000 atletas / 500 duplas inalterados. A formação de duplas dos bots procedurais já é não determinística entre execuções **na base** (pré-existente, ~98 linhas variam) e ficou fora do digest.
- Schema de saves, balanceamento, contratos de IA e versão do app: intocados.

## 6. Testes executados
PASS (exit 0): `phase5-perf-equivalence`, `player-system`, `partner-offers-v2`, `partner-day1-gate`, `partner-search-undefined-side-3b`, `career-systems`, `athlete-repair-idempotency-v526b`, `coello-tapia-two-tournament-race`, `real-pair-draw-performance-v526d`, `partner-offer-persistence-v512`, `player-partner-offer-flow-v518`, `partner-athlete-separation-v512`, `partnership-scheduled-separation-v517`, `post-separation-partner-market-v517`, `career-persistence-integrity`, `tournament-draw-reload-idempotency`, `seeded-tournament-draw`, `settlement-uses-persisted-draw-roster`, `ranking-points-by-source-v527f`, `ranking-rolling-window-fase4`, `partner-market-ui-contract-v518`, `career-opportunity-progression`, `match-finalization-performance`. `npm run lint` OK; `npm run build` OK (aviso de chunk pré-existente).

Falha pré-existente (idêntica na base sem minhas mudanças): `test-partner-quality-over-time-v527h` (4/5; "315 !== 0"). Não relacionada.

Incidente durante a fase: a primeira versão da otimização 2 removeu um import ainda usado por `applySideAdaptation`; `test-player-system` pegou o erro e foi corrigido antes do commit (lint não acusou). Os números finais foram re-medidos após a correção.

## 7. Riscos e limitações
- Medições em Node com disco em memória; ganhos reais no Android dependem do custo de I/O (cada gravação evitada economiza escrita temp + releitura + cópia de backup, então a tendência é maior ganho, mas **não medido**).
- Otimização 1: se `bulkCreate` falhar, o fallback sequencial mantém o comportamento antigo. IDs continuam gerados por `makeUniqueId`; a ordem de criação no lote difere (todos os atletas antes das duplas, como já era).
- Otimização 2 só acelera chamadas de compatibilidade/resolução de lados (mercado de IA, ofertas); não altera o dia comum.
- Benchmarks de dia comum têm ruído de ±10 %.

## 8. Validações pendentes (Windows e Redmi 12)
- Redmi 12: tempo de criação da 1ª carreira e do avanço no dia de virada de mês (antes/depois); percepção de travamento.
- Windows: criação de carreira e virada de mês no instalador Tauri; confirmar que não há regressão de salvamento (`careers/*.json`) após semeadura em lote.
- Medir renderizações React/navegação com `?perfdebug=1` no aparelho (hipótese não verificada na nuvem).

## 9. Arquivos modificados
`src/lib/saveFoundation.js`, `src/players/athleteSchema.js`, `src/players/teamCompatibility.js`, `package.json` (3 scripts npm), `scripts/benchmark-phase5-steady-state.mjs`, `scripts/benchmark-phase5-micro.mjs`, `scripts/test-phase5-perf-equivalence.mjs`, `reports/cloud-phase-5-performance-optimization/` (relatório + `data/*.json`).

## 10. Commits
Commit único da CLOUD-5 (ver `git log`).

## 11. Recomendações futuras
1. Investigar no dispositivo o item 5 (cancelamentos individuais em `ensureWorldTourDraws`): se ocorrer em carreiras reais, agrupar `Tournament.update`/`WorldEvent.create` em `bulkUpdate`/`bulkCreate`.
2. Reduzir o custo por gravação física (temp write + releitura + comparação + backup) — maior alavanca no Android, mas toca integridade de saves; exige fase própria.
3. Perfilar renderizações React com o overlay de performance no Redmi 12 antes de qualquer `memo`.
4. Tornar a formação de duplas dos bots procedurais determinística (facilita testes de equivalência).
