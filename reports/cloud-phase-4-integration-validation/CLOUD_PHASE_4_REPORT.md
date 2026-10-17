# CLOUD-4 — Integration Validation & Release Readiness

Branch: `cloud/phase-4-integration-validation` (origem `cloud/phase-3b-partner-search-side-recovery` @ `0c28fae`, confirmado). Sem push/merge/PR.

## Veredito
Nenhuma regressão encontrada na integração CLOUD-2 + 3A + 3B. **Nenhum código de produção ou de teste foi alterado.**
As 2 falhas v518 que a CLOUD-2 deixou "não confirmadas" foram reexecutadas e **passam**.

## 1. Baseline
| Item | Resultado |
|---|---|
| `npm ci --ignore-scripts` | OK |
| `npm run lint` (`eslint . --quiet`) | OK, 0 erros |
| `npm run build` (vite) | OK (15 s); aviso pré-existente de chunk > 500 kB |
| `npm run typecheck` | 2.201 diagnósticos, igual ao da CLOUD-2 (sem diagnóstico novo) |

## 2. Testes executados (todos PASS, exit 0)
CLOUD-2/3A/3B: partner-search-undefined-side-3b, partner-day1-gate, career-opportunity-progression, partner-market-ui-contract-v518, player-partner-offer-flow-v518, partner-offers-v2, partner-market-cards-v531, career-persistence-integrity, entity-id-collision-cloud2, tournament-draw-observability-cloud2, ranking-rolling-window-fase4, achievement-save-migration, player-post-separation-market-v518 (8/8, 210 s), long-career-partner-ecology-v518 (7/7, 545 s).

Validação funcional (fluxos da Etapa 2):
| Fluxo | Testes |
|---|---|
| Carreira e lado em quadra | TutorialSideFlowTest, partner-search-undefined-side-3b |
| Busca com lado definido/indefinido; convites e ofertas | partner-search-undefined-side-3b, partner-offer-persistence-v512, partner-offers-v2, player-partner-offer-flow-v518 |
| Separação e retorno ao mercado | partner-athlete-separation-v512, partnership-scheduled-separation-v517, post-separation-partner-market-v517, final-commitment-triggers-separation-v527j, save-reload-pending-separation-v527j, player-post-separation-market-v518 |
| Persistência/carregamento | career-persistence-integrity, achievement-save-migration, save-reload-pending-separation-v527j |
| Torneios e chaves | draw-ui-independent-persistence, tournament-draw-reload-idempotency, seeded-tournament-draw, settlement-uses-persisted-draw-roster, tournament-draw-name-collision, draw-notification-no-ui-side-effect, tournament-draw-observability-cloud2 |
| Ranking e pontos | ranking-points-by-source-v527f, player-team-ranking-points-reprojection-v522g, ranking-rolling-window-fase4 |

## 3. Classificação de falhas
- **Novas:** nenhuma.
- **Confirmadas/descartadas:** as 2 falhas v518 "novas, não confirmadas" da CLOUD-2 passam (a 3A já tornou o teste de mercado determinístico).
- **Históricas (não reexecutadas; herdadas do relatório CLOUD-2, 32 testes):** 11 dependem de artefatos `rebalance-527*` do Windows; 3 de Chrome com caminho Windows; `career-pace-production` (simulação > 40 min); 5 candidatos a remoção (home-redesign, premium-home-v33-2, premium-interfaces-v33, premium-relations-v33-8, living-career-v34-4); `mobile-m3-2-android-ux` (mantido falhando de propósito); e phase15-6-1/6-2/6/7, phase15-3, masters-draw-size, former-partner-world-continuity, partner-athlete-ovr-scale, partner-engine-ovr-authority, notification-system-audit, micro-gate-post-partner-tactics.
- **Limitações do ambiente:** ruído de stderr "backup nativo / Tauri indisponível" (inofensivo); Windows/Android indisponíveis.

## 4. Correções
Nenhuma (nenhuma regressão comprovada). Schema de saves, versões, ranking, balanceamento e contratos de IA intactos.

## 5. Riscos pendentes
- `getRealPartnerCandidates` com `allowUndefinedSide` só tem o padrão coberto; o caminho assíncrono com `AthleteProfile` real não foi exercitado.
- Os 32 testes históricos não foram reexecutados nesta fase (sem alteração de código que os afete).
- Suíte completa não rodada (orçamento); apenas a seleção relacionada.

## 6. Exige Windows ou Android físico
- Carreira nova sem lado: aviso âmbar e ausência do botão "Convidar" (Redmi 12, 360 px); escolher lado e ver o botão aparecer.
- Campo "Nome do atleta" do tutorial com teclado aberto (Redmi 12).
- Smoke físico do 9007 (checklist `reports/ui-hotfix-531b-final/`).
- Testes 527* e Chrome Windows; build Windows/Android; simulação longa `career-pace-production`.

## 7. Arquivos modificados e commits
Apenas este relatório. Commit: ver `git log -1` na branch `cloud/phase-4-integration-validation`.
