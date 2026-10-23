# LOCAL-9C.2-B-R1 — regressões (liberação LIGADA no padrão)

Working tree com `COLLECTION_REWARDS_RELEASED = true` × HEAD `0fbd969`.
Execução sequencial, `TZ=UTC`. Evidências versionadas regravadas por testes
(`local-9b…/r1-validation.json`, `local-9e1…/tests.json`) restauradas; saídas
temporárias descartadas.

| Suíte | Working tree (R1) | HEAD `0fbd969` |
|---|---|---|
| LOCAL-9C.2-A (I40 atualizado) | **47/47** | 47/47 (I40 antigo) |
| LOCAL-9C.2-A-R1 | 18/18 | 18/18 |
| LOCAL-9C.2-B | 32/32 | — (nova) |
| LOCAL-9C.2-B-R1 (`test-local-9c2b-r1-release`) | 12/12 (pré-validação forçada também 12/12) | — (nova) |
| Chrome `ui-r1-release` / `ui-achievements` | 9/9 · 7/7 | — |
| `achievement-reward-atomicity-v524e` (checagem estrutural) | **7/7** | 7/7 (checagem textual antiga) |
| recompensas: `reward-idempotency` 5/5 · `reward-restart` 4/4 · `multi-unlock-batch` 3/3 · `write-failure-recovery` 3/3 · `existing-save-safety` 6/6 · `final-match-reward` 8/8 · `rewards-balance` 4/4 | ok | ok |
| migração: `achievement-save-migration` | 27/27 | 27/27 |
| demais conquistas: `engine-v2` 14 · `progress-display` 29 · `relevance-ranking` 19 · `achievements-audit` 180 · `page-density` 6 · `missions-unification` 29 · `official-match` 17 · `preseason-isolation` · `walkover-isolation` | ok | ok |
| persistência: `career-persistence-integrity` | 53/53 | 53/53 |
| concorrência: 9C.2-A-R1 C1–C7, 9C.2-B C6, R1 L1 | ok | — |
| LOCAL-9E.1 (`test-local-9e1-decision-simulator`) | 48/48 | 48/48 |
| LOCAL-9E.1-H1 · H1-R1 | 31/31 · 19/19 | 31/31 · 19/19 |
| LOCAL-9B · 9B-R1 | 71/71 · 25/25 | 71/71 · 25/25 |
| LOCAL-8E shop · market | 52/52 · 41/41 | idem |
| Loja/inventário: `shop-tier-unlock` 5 · `character-equipment-overrides` 19 · `equipment-bonus-integrity` 12 · `shop-phase1` 27 | ok | ok |
| `cloud-7b2a-determinism` | 10/10 | 10/10 |
| `achievement-career-progression` | FAIL (3) | FAIL (3) — mesmas mensagens |
| `achievements-ui-v2` | FAIL (3) | FAIL (3) — mesmas mensagens |
| `sports-economy-v26` | FAIL | FAIL — Clubs.jsx |
| lint · build · arquitetura · `git diff --check` | ok | — |

Regressões novas: nenhuma. Falhas: só as 3 preexistentes.
