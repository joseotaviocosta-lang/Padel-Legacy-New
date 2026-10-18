# CLOUD-7B2B — dados e reprodução

- `data/ab-day365.json`, `data/ab-day1825.json` — A/B tamanho/gravação/carga/clone, base × compactado (Node, 9 repetições).
- `fixtures/tournaments-day365-pre7b2b.json.gz` — 275 torneios (125 finalizados) gerados pelo código `86f7307`, usados pela suíte de equivalência.
- Saves grandes (12/31 MB) não são versionados: `node scripts/benchmark-cloud-7a-career-growth.mjs --days=1825 --sample=365 --fakeClock --dumpAt=365,1825 --dumpDir=<dir>` (note: o dump só ocorre em dias múltiplos de `--sample`).
- Reproduzir: `npm run test:cloud-7b2b-historical-compaction`; `node scripts/benchmark-cloud-7b2b-compaction.mjs --save=<save.json> --runs=9`.
- Suítes com a gravação compacta ligada: `NODE_OPTIONS="--import ./scripts/lib/cloud7b2bCompactionPreload.mjs" npm run test:<suíte>`.
