# LOCAL-9C.2-A-R1 — regressões

Working tree com a R1 (pré-avaliação do planejador no `localGame.batch`).
Execução **sequencial**, sem outra carga concorrente, `TZ=UTC`. Evidências
versionadas que alguns testes regravam (`local-9b…/r1-validation.json`,
`local-9e1…/tests.json`) foram restauradas; saídas temporárias, descartadas.

| Suíte | Resultado |
|---|---|
| LOCAL-9C.2-A (`test-local-9c2a-shop-transaction-integrity`) | 47/47 |
| LOCAL-9C.2-A-R1 (`test-local-9c2a-r1-batch-concurrency`) | 18/18 |
| LOCAL-9C.2-A-R1 UI no Chrome real (`tools/ui-shop-flow.mjs`) | 20/20 (duas execuções: antes e depois da pré-avaliação) |
| LOCAL-9E.1 (`test-local-9e1-decision-simulator`) | 48/48 |
| LOCAL-9E.1-H1 | 31/31 |
| LOCAL-9E.1-H1-R1 | 19/19 (inclui T12) |
| LOCAL-9B | 71/71 |
| LOCAL-9B-R1 | 25/25 |
| LOCAL-8E shop integrity | 52/52 |
| LOCAL-8E market readonly | 41/41 |
| `shop-tier-unlock-v526b` | 5/5 |
| `character-equipment-overrides` | 19/19 |
| `equipment-bonus-integrity` | 12/12 |
| `shop-phase1` | 27/27 |
| `career-persistence-integrity` | 53/53 |
| `cloud-7b2a-determinism` | 10/10 |
| `npm run lint` | ok |
| `npm run build` | ok (aviso de chunk > 500 kB preexistente) |
| `validate:architecture` | ok |
| `git diff --check` | ok |

Comparação com o HEAD `173562e`: nenhuma suíte desta lista falha. As três
falhas preexistentes registradas em `regressions.md` (`cloud-7b1-save-pipeline`,
`tier-ladder-migration-fase3`, `sports-economy-v26`) não tocam Loja,
inventário nem `batch` e não foram reexecutadas na R1.
