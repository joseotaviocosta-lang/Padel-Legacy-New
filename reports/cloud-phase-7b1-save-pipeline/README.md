# CLOUD-7B1 — dados e reprodução

- `data/ab/` — A/B (carga, dia, gravação) base × 7b1, 4 saves × 2 backends × 3 repetições. `data/ab-days-only/` — só avanço diário (sem carga prévia), 3 saves × 2 backends × 3 repetições × 15 dias.
- `data/pipeline-ops-baseline-*.json`, `baseline-tauri-mock-*-profile.json`, `after-tauri-mock-52MB-profile.json` — contagem de cópias/serializações/IPC (instrumentação opt-in).
- `data/growth-1season-*.json`, `baseline-growth-5seasons-tauri-mock.json` — séries diárias completas (Tauri simulado).
- `data/equivalence-baseline.json` + `fixtures/career-day30-pre7b1.json.gz` — baseline de bytes e save gerado pelo código ANTERIOR.
- Saves grandes usados nos A/B **não** são versionados (4–52 MB): gere-os com `scripts/benchmark-cloud-7a-career-growth.mjs --dumpAt=... --dumpDir=...` no commit-base `9804adc`.

Reproduzir (Windows, a partir da raiz): `npm run test:cloud-7b1-save-pipeline`; `node scripts/profile-cloud-7b1-save-pipeline.mjs --storage=tauri-mock --loadSave=<save.json> --warm=0 --days=5 --fakeClock`;
`node scripts/benchmark-cloud-7b1-ab.mjs --save=<save.json> --storage=tauri-mock --loads=0 --days=15 --writes=3 --label=7b1` (rode igual em um checkout de `9804adc` e alterne as execuções).
