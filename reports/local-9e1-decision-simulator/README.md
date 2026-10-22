# LOCAL-9E.1 — evidências

Ver `docs/LOCAL_9E1_DECISION_SIMULATOR_BASELINE.md`.

| Arquivo | Conteúdo | Gerado por |
|---|---|---|
| `summary.md` | Tabelas por perfil × horizonte (30, 365, 730 dias) | `scripts/analyze-local-9e1-decisions.mjs --raw=<dir>` |
| `summary.json` | Métricas de cada uma das 24 carreiras + agregados | idem |
| `tests.json` | 48 verificações + sonda de renovação de patrocínio | `scripts/test-local-9e1-decision-simulator.mjs` |

As carreiras brutas (`<perfil>-d<dias>-s<seed>.json`, 50–100 KB cada) não são versionadas. Para reproduzir:

```
TZ=UTC node --max-old-space-size=3072 scripts/sim-local-9e1-decisions.mjs --profile=equilibrado --seeds=1-3 --days=365 --out=<dir>
```

Cada carreira registra `resultHash`; a mesma seed e o mesmo perfil reproduzem o mesmo hash.
