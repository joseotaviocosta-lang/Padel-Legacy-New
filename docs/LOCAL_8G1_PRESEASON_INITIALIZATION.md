# LOCAL-8G.1 — Pré-Temporada na inicialização da carreira

Hotfix da regressão introduzida em `b270e04` (LOCAL-8G).

## Causa raiz

A Pré-Temporada (exibição única da 1ª temporada; em 2026, sorteada como **Roma**, 12–14/01) não faz parte da temporada inicial semeada por `localSeed` — só é criada por `ensureFutureTournaments` (`src/lib/career.js`). Até `ea79766` ela nascia porque a tela **Torneios** chamava essa função ao abrir. A LOCAL-8G (8G-01) tornou a tela somente leitura, com a premissa de que "o calendário inicial vem de `localSeed`" — verdadeira para a temporada regular, falsa para a exibição.

Efeito em `b270e04`: numa carreira nova, a Pré-Temporada não existia em janeiro e só era criada na virada de mês (01/02), com datas passadas, presa em `inscricoes` e nunca resolvida (a exibição não é `world_tour_event`) — um torneio fantasma.

## Correção

| Arquivo | Mudança |
|---|---|
| `src/lib/career.js` | `preSeasonExhibitionYear(tournaments, careerDate)` — regra única de criação. `ensurePreSeasonExhibition(careerDate)` — cria só a exibição (não estende o horizonte do calendário regular), idempotente, com inicializador por chave (mesmo padrão de `ensureFutureTournaments`). `ensureFutureTournamentsInternal` passa a usar a mesma regra. |
| `src/game-core/careerSystemsInitialization.js` | Nova etapa `preSeason` na ativação da carreira (LOCAL-8F). |
| `scripts/test-local-8g1-preseason-initialization.mjs` | Teste de regressão e cenários 1–12. |

Regra de criação (todas precisam valer):

1. não existe nenhuma exibição no save (única por carreira — histórica ou não);
2. a carreira está na 1ª temporada (nenhum torneio de ano anterior ao da data da carreira);
3. a data da carreira não passou do encerramento da exibição (`end_date`, 14/01) — sem criação retroativa.

Payload, cidade, datas, id, janela de inscrição e configuração continuam vindo de `buildPreSeasonExhibition` sem alteração. Nada é excluído, modificado ou reaberto: a regra só decide se cria.

`Tournaments.jsx` não foi alterado — continua somente leitura.

## Antes / depois

| Cenário | `b270e04` | LOCAL-8G.1 |
|---|---|---|
| Carreira nova em 02/01/2026, só ativada | sem Pré-Temporada; 1º torneio em 29/01 | Roma Pré-Temporada 12–14/01, `inscricoes`, inscrição 01/01→08/01 |
| Mesma carreira em 02/02 | exibição criada vencida, presa em `inscricoes` | exibição jogada e `finalizado` |
| Carreira ativada após 14/01 | exibição fantasma em 01/02 | nenhuma |
| Carreira criada na janela do bug, ainda em 01/01 | sem exibição | recebe na próxima ativação |
| Carreira com Pré-Temporada histórica | preservada | preservada byte a byte |

## Testes

`node scripts/test-local-8g1-preseason-initialization.mjs` — **24 PASS / 0 FAIL** (`reports/local-8g1-preseason-initialization/after-fix.json`). O mesmo script contra `b270e04` falha no cenário R (`before-fix-b270e04.txt`).

Cobertura: (R) regressão; (1) criação na ativação com payload idêntico ao do catálogo; (2) janela de inscrição; (3) inscrição com dupla válida; (4) 3 reativações — 0 registros, 0 gravações; (5) abrir Torneios 2x — 0 registros, 0 gravações, sem `ensureFutureTournaments` na página; (6) save/load + ativação — 0 alterações; (7) avanço até 16/01 com partida entre 12–14/01, campanha e torneio concluídos; (8) ativação em 20/01 e 15/01 não cria, em 14/01 cria; (9) sem fantasma na virada de mês, em carreira antiga de fevereiro e na 2ª temporada; (10) exibição histórica intacta; (11) calendário regular inalterado (antes/depois da ativação e contra carreira gêmea, comparando ids, datas, tiers, nomes, janelas); (12) duas carreiras novas → mesma exibição, calendário e ids.

Também executados: `test-local-8f-lifecycle` (60/0), `test-local-8g-navigation-stability` (31/0), testes existentes da Pré-Temporada (draw notification real flow, achievement isolation, draw notification policy, ranking zero points, header next-event ×4, first-season ranking, onboarding v3, playthrough 4.5 temporal circuit) — todos PASS; `npm run lint`, `npm run validate:architecture`, `npm run build`, `git diff --check` — OK.

## Persistência e determinismo

- Carreira nova: a ativação grava a exibição uma vez (1 `bulkUpdate` + aviso `padel:tournaments-changed` para o header). Ativações seguintes: só leitura.
- Carreira existente com exibição ou fora da janela: só leitura (1 `Tournament.list`).
- Payload determinístico (`createTournamentEditionId` + cidade semeada pelo ano); não consome RNG nem relógio.
- Observação (pré-existente, fora do escopo): o `season_id` de temporadas futuras ainda não semeadas (ex.: 2027) é aleatório; por isso a comparação do calendário regular ignora esse campo. O campeão da exibição varia entre execuções pela simulação do mundo, como em qualquer torneio.
