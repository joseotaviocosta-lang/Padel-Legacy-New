# CLOUD-7C — dados e reprodução

- `data/10seasons-{off,incremental}/` — execução de 10 temporadas com jogador ativo (seed `7c`): `seasons.jsonl` (métricas e integridade por temporada), `hashes.jsonl` (521 checkpoints semanais), `summary.json`, `partner-changes.jsonl`.
- `data/determinism-*.json`, `data/saves-A-vs-B-season{1,5,10}.json` — comparações lógicas (primeiro dia/entidade divergente); `data/short-runs/` — execuções curtas de determinismo e reload (hashes e rastros de relógio).
- `data/reload-{off,incremental}/` — execuções longas com reload nas temporadas 1/3/5 (interrompidas por reinício do contêiner na temporada 6); `data/reload-A-vs-*.json`.
- `data/diag-*.json` — round-trip, retentativas, equipes duplicadas, qualifying pendente.
- `data/perf-active-saves*` — benchmark sequencial; `data/regression/` — resultado das suítes.
- `fixtures/active-player-save-season1-baseline.json.gz` — save de 1 temporada com jogador ativo (entrada dos diagnósticos).
- Reproduzir: `node --expose-gc scripts/cloud-7c-long-career.mjs --strategy=off|incremental --seasons=10 --seed=7c --out=<dir> --hashEvery=7 --dumpSeasons=1,5,10` (inicie duas execuções simultâneas com ≥ 10 s de intervalo: o Vite grava um arquivo temporário com o relógio falso). Diagnósticos: `node scripts/diagnose-cloud-7c-*.mjs <save.json>`; comparação: `node scripts/compare-cloud-7c-runs.mjs <dirA> <dirB> --ignoreEntities=AnnualCareerReport`.
