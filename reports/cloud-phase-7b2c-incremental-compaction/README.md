# CLOUD-7B2C — dados e reprodução

- `data/ab-v2/`, `data/summary-v2.json` — A/B das 3 estratégias (sem compactação, repetida 7B2B, incremental) **após** a reordenação do filtro diário; `data/ab/`, `data/summary.json` — rodada anterior (base antiga, 465 expansões/dia).
- `data/equivalence-*.json` — hash do save final expandido por estratégia (1 temp./10 dias; 5 temp./5 dias) e a repetição `off` que divergiu (divergência 7B2A, só fora de `Tournament`).
- Saves de 12/31 MB não versionados: `node scripts/benchmark-cloud-7a-career-growth.mjs --days=1825 --sample=365 --fakeClock --dumpAt=365,1825 --dumpDir=<dir>`.
- Reproduzir: `npm run test:cloud-7b2c-incremental-compaction`;
  `node --expose-gc scripts/benchmark-cloud-7b1-ab.mjs --save=<save.json> --storage=memory|tauri-mock --loads=3 --warmDays=1 --days=8 --writes=3 --strategy=off|repeated|incremental --output=<json>`;
  `node scripts/summarize-cloud-7b2c-ab.mjs <dir>`; `node scripts/verify-cloud-7b2c-engine-equivalence.mjs --save=<save.json> --days=10 --strategy=...`.
- Suíte com a chave ligada: `NODE_OPTIONS="--import ./scripts/lib/cloud7b2cIncrementalPreload.mjs" npm run test:<suíte>`.
