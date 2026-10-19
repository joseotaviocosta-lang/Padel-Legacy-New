# CLOUD-7D1 — dados e reprodução

- `data/qualifying-cases-before-after.json` — os 7 torneios travados do save da CLOUD-7C (fixture) antes e depois de UM tick diário de produção.
- `data/diag-qualifying-pending-season1-before-fix.json` — diagnóstico da CLOUD-7C aplicado à temporada 1 reexecutada SEM a correção (6 torneios travados).
- `data/season-runs/` — temporada completa: antes da correção (`*-baseline`), com a correção e jogador ativo (`*-fixed`) e sem jogador (`*-noplayer`); `world-continuity-counts.json` resume os contadores.
- `data/diag-duplicate-team-names-repro.json` — reprodução, com funções reais de produção, do mecanismo de nomes de dupla duplicados.
- `data/regression/` — resultado das suítes de regressão e os logs das duas falhas que já existem no commit base.
- Reproduzir: `npm run test:cloud-7d1-world-continuity`; temporada: `node --expose-gc scripts/cloud-7c-long-career.mjs --strategy=off --seasons=1 --seed=7c [--noPlayerRegistration | --legacyQualifyingFlow] --out=<dir> --dumpSeasons=1` e `node scripts/analyze-cloud-7d1-world-continuity.mjs <dir>/save-season-1.json`. (`--legacyQualifyingFlow` reproduz o fluxo anterior à correção; não rode duas execuções do Vite em menos de 10 s.)
