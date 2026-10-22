# LOCAL-9C.2-A — regressões

Working tree (LOCAL-9C.2-A) × HEAD `173562e` (worktree temporária destacada,
removida ao final). `TZ=UTC`. Evidências versionadas que alguns testes
regravam (`local-9b…/r1-validation.json`, `local-9e1…/tests.json`) foram
restauradas depois da execução; saídas temporárias, descartadas.

| Suíte | Working tree | HEAD | Observação |
|---|---|---|---|
| LOCAL-9C.2-A (`test-local-9c2a-shop-transaction-integrity`) | 47/47 | — | nova |
| LOCAL-9C.1 (`tools/live-market-audit.mjs --skip-engine`, cópia temporária) | 13/13 | 13/13 iguais ao versionado (as outras 2 dependem do motor) | catálogo, preços, bônus e requisitos idênticos; sondas A–F são réplicas do componente antigo e continuam descrevendo o HEAD (corrigido: `repro-defects.json › canonical`) |
| LOCAL-9E.1 (`test-local-9e1-decision-simulator`) | 48/48 | — | driver: mesma seed → mesmo hash; save/load idêntico |
| LOCAL-9E.1-H1 | 31/31 | — | |
| LOCAL-9E.1-H1-R1 | 19/19 (isolado) | 19/19 | 1ª execução, sob carga concorrente de CPU: T12 (determinismo de ids de contrato de patrocínio) falhou; repetida isolada, passa. Não toca a Loja |
| LOCAL-9B | 71/71 | — | |
| LOCAL-9B-R1 | 25/25 | — | |
| LOCAL-8E shop integrity | 52/52 | — | |
| LOCAL-8E market readonly | 41/41 | — | |
| `shop-tier-unlock-v526b` | 5/5 | — | |
| `character-equipment-overrides` | 19/19 | — | |
| `equipment-bonus-integrity` | 12/12 | — | |
| `shop-phase1` | 27/27 | — | |
| `career-persistence-integrity` | 53/53 | — | |
| `achievement-save-migration` | 27/27 | — | |
| `cloud-7b2a-determinism` | 10/10 | — | |
| `cloud-7b1-save-pipeline` | FAIL | FAIL (mesma) | preexistente: "A. equivalência byte a byte com o baseline histórico anterior à CLOUD-7B1" |
| `tier-ladder-migration-fase3` | FAIL | FAIL (mesma) | preexistente: "Exatamente 1 evento de Exibição/Pré-Temporada" |
| `sports-economy-v26` | FAIL | FAIL (mesma) | preexistente: "src/pages/Clubs.jsx não integrado à economia v26" |
| `npm run lint` | ok | — | |
| `npm run build` | ok | — | aviso de chunk > 500 kB preexistente |
| `validate:architecture` | ok | — | |
| `git diff --check` | ok | — | |

Simulador 30 dias (3 perfis × 3 seeds): `simulator-30d.json`.
