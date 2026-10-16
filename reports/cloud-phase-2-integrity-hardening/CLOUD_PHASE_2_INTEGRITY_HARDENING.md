# CLOUD-2 — Correção de testes, robustez e integridade operacional

**Branch:** `cloud/phase-2-integrity-hardening`, criada a partir de `b8db071` (CLOUD-1). Local, **sem push**.
**Último commit de código:** `bdf9391`.
**Data:** 16/10/2026.
**Encerramento controlado por orçamento:** uma única rodada de validação completa; nenhuma repetição em série nem simulação longa extra.

## Veredito: **CLOUD-2 READY FOR HUMAN REVIEW**, com validação parcial

As correções planejadas estão feitas, testadas individualmente e commitadas.

A rodada completa tem **2 falhas novas em relação à CLOUD-0** que **não foram confirmadas nem descartadas**, porque o orçamento não permitiu repetir os testes. Detalhes na seção "Pendências".

## 1. Causas e correções

| # | Item | Causa | Correção | Commit |
|---|---|---|---|---|
| A | `test-career-persistence-integrity` | A fixture inscrevia `teamRank 200` num Silver; o teto de base (`OPEN_TIER_CEILING = 400`) recusa a inscrição e o teste não conferia `success` | Dupla elegível (rank 600) e gate explícito na inscrição. A 1ª rodada passa a ser gravada pelo mesmo caminho do jogo e verificada após o reload: run, chave, resultado, `Match`, extrato e idempotência. Mais um teste **negativo**: inscrição inelegível não cria evento nem run fantasma. **Regra de elegibilidade intacta.** | `ad68e81` |
| B | Ids de entidade (`WorldEvent` e outros) | `makeId = <prefixo>-<ms>-<6 base36 do random>`: dois ids **gerados** no mesmo ms com o mesmo random colidiam e desfaziam a transação do dia | `makeUniqueId` em `create`, `bulkCreate` e `batch`: <ul><li>1ª tentativa idêntica ao `makeId` anterior (mesmo formato, mesma quantidade de chamadas a `Math.random`);</li><li>na colisão, sufixo por FNV-1a do id + contador sequencial do processo, sem `Math.random`;</li><li>limite de 64 tentativas por chamada;</li><li>id explícito ou persistido nunca é reescrito, e duplicata explícita continua sendo erro.</li></ul> | `b5fb10a` |
| C | `test-ranking-rolling-window-fase4` | O teste esperava a âncora a valor cheio até a semana 52, regra revogada pela 5.26-C | Teste alinhado ao decaimento linear, com o valor esperado calculado de forma independente. Cobre bordas 52/53/54, virada de ano, ativo × inativo e tier descendente. **Fórmula intacta.** | `d189923` |
| 4 | Sorteio silencioso (`calendarSystem.js`) | `ensureTournamentDraw(...).catch(() => null)` e a notificação descartavam erros sem rastro | `reportTournamentDrawFailure`: diagnóstico beta `TOURNAMENT_DRAW_FAILED` / `…_NOTIFICATION_FAILED` com ids técnicos, tier e data (sem nome do atleta), mais `console.warn [TournamentDraw]`. **Fluxo do dia igual:** nada aparece ao jogador; nova tentativa no dia seguinte; dentro da transação, o dia continua sendo desfeito por inteiro. | `77500df`, `bdf9391` |
| 5 | `test-achievement-save-migration` | Dependia de uma conquista de demonstração do seed, removida no build 9002 | Fixture explícita de save pré-Fase-12, com gates de linha intacta, não re-desbloqueada, não duplicada e preservada após save/reload. **Schema intacto.** | `3129cc8` |
| 6 | Testes antigos | Expectativas literais sobre layouts e regras que mudaram de propósito | 22 atualizados, 3 substituídos e 2 achados extras corrigidos (detalhes abaixo). Nenhum código de produção alterado para satisfazer teste. | `e2371b6`, `561bab8`, `62abf29` |

## 2. Arquivos modificados

**Produção (2 arquivos, +80/−5):**
- `src/gameplay/repositories/CareerEntityRepository.js`: `makeUniqueId`;
- `src/lib/calendarSystem.js`: `reportTournamentDrawFailure`.

**Testes:**
- novos: `scripts/test-entity-id-collision-cloud2.mjs` (16 gates) e `scripts/test-tournament-draw-observability-cloud2.mjs` (22 gates);
- atualizados: os demais `scripts/test-*.mjs` citados nos commits.

**Evidência:** `reports/cloud-phase-2-integrity-hardening/`.

## 3. Testes adicionados ou atualizados (resultado individual)

| Teste | Gates |
|---|---|
| career-persistence-integrity | 53/53 |
| entity-id-collision-cloud2 (novo) | 16/16 |
| phase15-5-1-critical-training-center | 210/210 (+2 da proteção B) |
| ranking-rolling-window-fase4 | 86/86 |
| tournament-draw-observability-cloud2 (novo) | 22/22 |
| achievement-save-migration | 27/27 |

**Obsoletos atualizados:**
- global-header-calendar-rc: 18
- tournament-guided-flow: 25
- phase15-5-1-tournament-interview-consistency: 79
- mobile-persistence-m3-7: 29
- global-overlays-audit: 85
- living-career-v34-5/7/8: OK

**Achados extras do CLOUD-1:**
- onboarding-home-cta: 57
- interview-overlay-transition: 10

**Interface antiga atualizados:**
- redesign-polish2: 46
- onboarding-priority: 94
- mobile-game-flow-m4-3: 30
- ui-redesign: 183
- page-hierarchy: 31
- mobile-compact-ux-m4: 79
- mobile-filters-postmatch-m4-2-2: 24
- phase15-5-4-critical-mobile-qa: 122
- mobile-m3-1-device-hotfix: 58
- staff-architecture-v29-1: OK
- training-center-unification-phase15-5: 144
- ranking-ui-authority-v56: OK
- living-career-v34-9: 8/8

**Substituídos (gates obsoletos trocados pelo equivalente 5.29/5.30):**
- redesign-polish21: 39
- mobile-game-app-experience-m4-2: 35 (inclui a correção de um gate que passava vazio)
- phase15-4-mobile-flow-polish: 132

**Mantido falhando de propósito:** `mobile-m3-2-android-ux`. O campo "Nome do atleta" do tutorial (`Missions.jsx:465`) não tem `scrollIntoView` no foco, e isso precisa ser validado no Redmi 12.

**Propostos para remoção (NÃO removidos; aguardam aprovação):**

| Teste | O que verifica | Cobertura equivalente atual |
|---|---|---|
| test-home-redesign | NextObjectiveCard, NextEventCard, getNextStep, PriorityActionsPanel e JourneyTimeline na Home pré-5.30 | 8 testes `*-v530` (home-primary-hierarchy, home-priorities, home-next-commitment, home-actions etc.) + `next-event-authority-consistency-v530b` |
| test-premium-home-v33-2 | PremiumQuickStats, CareerHud com "Ranking" e CSS v33.2 | `*-v530`, `header-ranking-v524` (ranking no header) |
| test-premium-interfaces-v33 | Strings v33 em CareerHub, Coaches, Staff e Ranking | `*-v531` (staff/coach), `*-v530`, `ranking-*-v523/v524` |
| test-premium-relations-v33-8 | Indicadores e propostas do PartnerHub antigo; "Versão beta.12" | `partner-screen-hierarchy-v531`, `partner-market-cards-v531` |
| test-living-career-v34-4 | CareerAssistant (removido) e SmartAgenda | Home 5.30 (HomeAgenda: `test-home-*-v530`) |

## 4. Comparação com a CLOUD-0 (mesma seleção + 4 testes)

| | CLOUD-0 (`4fac81d`) | CLOUD-2 (`bdf9391`) |
|---|---|---|
| Testes únicos | 368 | 372 (+4: 2 novos + 2 achados extras) |
| Aprovados | 308 | **338** |
| Falhos | 60 | 34 |
| Corrigidos (falhavam e passam) | — | **28** |
| Novos na seleção | — | 4, todos aprovados |
| **Falhas novas (passavam na CLOUD-0)** | — | **2, não confirmadas** (abaixo) |
| Lint / build | ✅ / ✅ | ✅ / ✅ |
| Typecheck | 2.201 | **2.201** (sem diagnóstico novo) |

As 32 que continuam falhando são as mesmas classificadas na CLOUD-0 e CLOUD-1:
- **11** dependem de artefatos que só existem no Windows (`rebalance-527*`);
- **3** dependem do Chrome com caminho Windows;
- **1** é a simulação de 4 anos (`career-pace-production`);
- **5** são candidatas a remoção;
- **1** é `mobile-m3-2`, mantido de propósito;
- as demais já falhavam antes e não entraram no escopo da fase: `phase15-6-1/6-2/6/7`, `phase15-3`, `masters-draw-size`, `former-partner-world-continuity`, `partner-athlete-ovr-scale`, `partner-engine-ovr-authority`, `notification-system-audit` e `micro-gate-post-partner-tactics`.

**A redução de falhas não é, por si, a prova de sucesso.** A prova está nos testes individuais da seção 3 e no determinismo da seção 6.

## 5. Compatibilidade de saves

- **Schema inalterado** (v21). Nenhuma migração nova.
- Ids já persistidos **nunca** são reescritos: `makeUniqueId` só age em ids gerados, e só quando há colisão. O formato `<prefixo>-<ms>-<6 base36>` é o mesmo.
- A observabilidade do sorteio não grava nada no save; o diagnóstico fica só em memória (`betaDiagnostics`).
- Os testes de conquistas legadas e de persistência de torneio passaram com save/reload real (storage em memória).

## 6. Impacto sobre determinismo

Harness oficial `audit-real-athletes-simulation` (seed `cloud2-determinism`, 1 temporada, amostra reduzida): as saídas são **byte a byte idênticas** entre antes (`ad68e81`), um controle (`ad68e81` de novo) e depois da correção B. Os hashes estão em `evidence/determinism-b.txt`.

O teste unitário prova ainda:
- 1 chamada a `Math.random` por id, com ou sem colisão;
- a mesma sequência de operações com o mesmo relógio gera os mesmos ids;
- com fonte aleatória e relógio fixos, 500 ids únicos sem laço infinito.

## 7. Riscos residuais

1. **Duas falhas novas não confirmadas**, ambas simulações longas sem semente fixa:
   - `test-long-career-partner-ecology-v518` ("churn Top10 de 60%");
   - `test-player-post-separation-market-v518` ("Rank500: nenhuma oferta nova entre D+3 e D+30").

   As duas **falhavam no Windows** nas fases 5.30-B e 5.31 e passaram na CLOUD-0. É compatível com instabilidade, mas **não comprovado**. A única mudança de produção que poderia tocá-las é B, que só age em colisão e preservou o determinismo do harness. Ainda assim, isso só se fecha repetindo o teste.
2. O contador de colisão de B é **por processo**: depois de um reload, a sequência recomeça. Isso é inofensivo, porque os ids existentes ficam no save e são verificados.
3. O gatilho do `FilterPills` com `py-1.5` no celular fica abaixo do alvo de toque de 40-44 px. É decisão da 5.28, apenas registrada aqui.
4. A observabilidade registra até 4 diagnósticos por evento (uma tentativa por dia em D-3..D-0). O buffer é limitado a 25 entradas.

## 8. Pendências de validação

| Pendência | Onde | Como |
|---|---|---|
| Confirmar ou descartar as 2 falhas novas v518 | cloud ou local | `node scripts/test-long-career-partner-ecology-v518.mjs` e `node scripts/test-player-post-separation-market-v518.mjs`, em série, em `4fac81d` e em `bdf9391`, 2× cada |
| Campo "Nome do atleta" do tutorial com teclado aberto | Redmi 12 | Abrir o tutorial em carreira nova, tocar no campo e ver se o teclado o cobre |
| Smoke físico do 9007 (pendente desde a CLOUD-0) | Redmi 12 | checklist `reports/ui-hotfix-531b-final/` |
| Testes que dependem de artefatos 527* ou do Chrome Windows | Windows | Rodar localmente ou versionar uma amostra dos artefatos |
| Simulação longa `career-pace-production` | local | rodada dedicada (> 40 min) |
| Build Windows/Android desta branch | local | não executados por regra da fase |
| Decisão sobre os 5 testes propostos para remoção | humano | tabela da seção 3 |

## 9. Arquivos desta pasta

- `CLOUD_PHASE_2_INTEGRITY_HARDENING.md`: este relatório.
- `results.json`: resultado por teste da rodada única (372 testes únicos) e comparação com a CLOUD-0 (`fixed`, `newFailures`, `stillFailing`, `added`).
- `evidence/determinism-b.txt`: hashes do harness, antes, controle e depois.
- `tools/selection.json`: seleção usada (397 entradas, 372 únicas), executada com `reports/cloud-phase-0-baseline/tools/run-baseline.mjs`.
