# LOCAL-9E.1-H1 / H1-R1 — evidências

Ver `docs/LOCAL_9E1_H1_SPONSORSHIP_RENEWAL_INTEGRITY.md` (§1–14 H1, §15 R1).

| Arquivo | Conteúdo | Gerado por |
|---|---|---|
| `tests.json` | H1: casos P, A–I e X com o código final (31/31) | `TZ=UTC node --max-old-space-size=6144 scripts/test-local-9e1-h1-sponsorship-renewal.mjs` |
| `repro-head-633298b.json` | Teste da H1 contra uma cópia isolada do HEAD `633298b` (5/23: E1-01 reproduzido) | idem, numa worktree temporária do HEAD com `--out=<dir>` |
| `r1-tests.json` | R1: T1–T12 com o código final (19/19) | `TZ=UTC node --max-old-space-size=6144 scripts/test-local-9e1-h1-r1-sponsorship-signing.mjs` |
| `r1-repro-head-633298b.json` | Teste da R1 contra o HEAD `633298b` (6/18: E1-01b, assinatura duplicada e perda de crédito reproduzidos) | idem, numa worktree temporária do HEAD com `--out=<dir>` |
| `economy-before-after.json` | H1: sonda da 9E.1 antes/depois, hashes de 30 dias, auditoria das renovações e comparação por carreira em 365 dias | `scripts/sim-local-9e1-decisions.mjs --profile=<p> --seeds=1-3 --days=<30\|365>` + `reports/local-9e1-decision-simulator/summary.json` |
| `r1-simulator-check.json` | R1: teste da 9E.1 (48/48, sonda `[0,0,0]`), hashes de 30 dias e experimento que isola a causa da mudança de hash (RNG do Vite no harness) | idem |

As carreiras brutas do simulador (50–100 KB cada) não são versionadas. Todos os testes usam carreiras em memória: nenhum save real é tocado.
