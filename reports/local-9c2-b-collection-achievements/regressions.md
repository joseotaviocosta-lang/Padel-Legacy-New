# LOCAL-9C.2-B — regressões

Working tree × HEAD `0fbd969` (worktree temporária destacada, removida).
Execução sequencial, `TZ=UTC`. Evidências versionadas regravadas por testes
(`local-9b…/r1-validation.json`, `local-9e1…/tests.json`) restauradas; saídas
temporárias descartadas. Liberação de coleção no padrão (desligada), salvo nos
casos da suíte 9C.2-B que a ligam explicitamente.

| Suíte | Working tree | HEAD | Observação |
|---|---|---|---|
| LOCAL-9C.2-B (`test-local-9c2b-collection-achievements`) | 32/32 | — | nova |
| UI Chrome (`tools/ui-achievements.mjs`) | 7/7 | — | nova |
| LOCAL-9C.2-A | **46/47** | 47/47 | I40 afirmava que a compra NÃO conta ("fica para a 9C.2-B"); agora conta (totalOwned 1 → 2), sem registrar/pagar (achievementRows 0 → 0). Mudança intencional desta fase; teste não alterado — decisão pendente |
| LOCAL-9C.2-A-R1 | 18/18 | 18/18 | |
| LOCAL-9E.1 (`test-local-9e1-decision-simulator`) | 48/48 | — | |
| LOCAL-9E.1-H1 | 31/31 | — | |
| LOCAL-9E.1-H1-R1 | 19/19 | — | |
| LOCAL-9B / 9B-R1 | 71/71 · 25/25 | — | |
| LOCAL-8E shop / market | 52/52 · 41/41 | — | |
| `shop-tier-unlock` · `character-equipment-overrides` · `equipment-bonus-integrity` · `shop-phase1` | 5/5 · 19/19 · 12/12 · 27/27 | — | |
| `career-persistence-integrity` | 53/53 | — | |
| `cloud-7b2a-determinism` | 10/10 | — | |
| `achievement-reward-atomicity-v524e` | **FAIL** (checagem estática) | 7/7 | linha 13 exige o texto `localGame.batch(operations`; o lote agora recebe planejador `localGame.batch((view) => …)`. Cópia temporária com só essa linha aceitando o planejador: **7/7** (1 escrita, nenhuma versão com conquista paga sem saldo, restart sem repagar). Teste não alterado — decisão pendente |
| `achievement-engine-v2` · `existing-save-safety` · `final-match-reward` · `multi-unlock-batch` · `progress-display` · `relevance-ranking` · `reward-idempotency` · `reward-restart` · `rewards-balance` · `save-migration` · `write-failure-recovery` · `achievements-audit` · `page-density` · `missions-unification` · `official-match` · `preseason-isolation` · `walkover-isolation` | todas ok | todas ok | mesmas contagens do HEAD |
| `achievement-career-progression` | FAIL (3) | FAIL (3) | preexistente, mesmas mensagens ("Primeiro Lucro") |
| `achievements-ui-v2` | FAIL (3) | FAIL (3) | preexistente, mesmas mensagens (flag de reconciliação da aba) |
| `sports-economy-v26` | FAIL | FAIL | preexistente (Clubs.jsx) |
| lint · build · arquitetura · `git diff --check` | ok | — | aviso de chunk > 500 kB preexistente |
