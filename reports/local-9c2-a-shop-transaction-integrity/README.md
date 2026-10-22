# LOCAL-9C.2-A — evidências

Ver `docs/LOCAL_9C2_A_SHOP_TRANSACTION_INTEGRITY.md`.

Tudo roda sobre os módulos reais do jogo (Vite SSR) em carreiras de memória
(`scripts/lib/v526bTestKit.mjs`). Nenhum save real é lido ou gravado.

| Arquivo | Conteúdo | Gerado por |
|---|---|---|
| `repro-head-173562e.json` | C2A-01..04 reproduzidos com o código do HEAD `173562e` (antes de qualquer mudança em `src/`) | `tools/repro-c2a-defects.mjs --out=…` |
| `repro-defects.json` | Os mesmos 4 cenários: `legacy` (réplica de `Shop.jsx buy()`/`Inventory.jsx sellItem()` do HEAD) × `canonical` (`shopTransactions.js`) | `tools/repro-c2a-defects.mjs` |
| `tests.json` | Suíte direcionada (compra, venda, persistência, integração, extras) | `scripts/test-local-9c2a-shop-transaction-integrity.mjs` |
| `regressions.md` | Regressões no working tree × HEAD `173562e` | execução manual (comandos no documento) |
| `ui-flow.json`, `ui/*.png` | R1 — 14 fluxos da Loja/Inventário no Chrome real (puppeteer-core, perfil temporário, shim de storage), cliques reais | `tools/ui-shop-flow.mjs` (precisa de um Vite local) |
| `r1-batch-concurrency.json` | R1 — compatibilidade do `localGame.batch`, recusa sem gravação, concorrência financeira, sonda do risco externo | `scripts/test-local-9c2a-r1-batch-concurrency.mjs` |
| `regressions-r1.md` | R1 — regressões sequenciais | execução manual |
| `simulator-30d.json` | Simulador LOCAL-9E.1, 30 dias, 3 perfis × 3 seeds, HEAD × working tree | comparação dos JSON brutos (não versionados) |

Reproduzir:

```
TZ=UTC node reports/local-9c2-a-shop-transaction-integrity/tools/repro-c2a-defects.mjs
TZ=UTC node scripts/test-local-9c2a-shop-transaction-integrity.mjs
```
