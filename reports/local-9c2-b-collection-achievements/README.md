# LOCAL-9C.2-B — evidências

Ver `docs/LOCAL_9C2_B_COLLECTION_ACHIEVEMENTS_INTEGRITY.md`. Módulos reais do
jogo (Vite SSR) em carreiras de memória; nenhum save real.

| Arquivo | Conteúdo | Gerado por |
|---|---|---|
| `repro-head-0fbd969.json` | auditoria das 14 conquistas + defeito reproduzido no HEAD (antes de mudar `src/`) | `tools/audit-repro.mjs --out=…` |
| `repro-after-fix.json` | mesmo cenário com a correção, gerado na 9C.2-B (liberação ainda desligada) | idem |
| `tests.json` | suíte direcionada A/B/C/D/G | `scripts/test-local-9c2b-collection-achievements.mjs` |
| `economic-impact.json` | conjunto mais barato por conquista, revenda, exploit, estágio; baseline 9E.1; propostas (não aplicadas) para as 3 metas inalcançáveis | `tools/economic-impact.mjs` |
| `simulator-365d.json` | simulador 9E.1, 365 dias, 3 perfis, liberação on × off | `tools/sim-collection-wrapper.mjs` (carreiras brutas não versionadas) |
| `ui-achievements.json`, `ui/*.png` | aba Conquistas no Chrome real | `tools/ui-achievements.mjs` (precisa de um Vite local) |
| `regressions.md` | regressões × HEAD (9C.2-B, liberação desligada) | execução manual |
| `r1-release-prevalidation.json` | R1 — validação da liberação ANTES de ligar (forçada) | `PL9C2B_FORCE_RELEASE=1 node scripts/test-local-9c2b-r1-release.mjs` |
| `r1-release.json` | R1 — mesma suíte com a liberação ligada no padrão | `scripts/test-local-9c2b-r1-release.mjs` |
| `ui-r1-release.json`, `ui/r1-*.png` | R1 — 7 fluxos no Chrome real (compra/venda pela UI) | `tools/ui-r1-release.mjs` (precisa de um Vite local) |
| `regressions-r1.md` | R1 — regressões com a liberação ligada × HEAD | execução manual |

```
TZ=UTC node reports/local-9c2-b-collection-achievements/tools/audit-repro.mjs
TZ=UTC node scripts/test-local-9c2b-collection-achievements.mjs
TZ=UTC node reports/local-9c2-b-collection-achievements/tools/economic-impact.mjs
```
