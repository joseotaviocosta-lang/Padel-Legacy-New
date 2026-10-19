# LOCAL-7F — Qualifying completo, classificação correta e continuidade independente do jogador

Branch `integracao/cloud-6o`, a partir de `205f971` (LOCAL-7E). Compactação incremental e histórica desligadas e não tocadas.

## 1. Como o qualifying funciona (auditoria)

**Torneios só de IA (World Tour).** O qualifying é **abstrato**. Na seleção do campo
(`WorldTourLifecycle.applyEntryPriority`), as vagas reservadas são divididas entre entrada direta e qualifying
(`QUALIFYING_SHARE`). `resolveQualifyingBracket(pool, slots)` decide os vencedores, que entram na chave principal como
qualquer dupla. Nenhuma partida de qualifying é persistida, e o qualifying não dá pontos. A chave canônica só contém a
chave principal. Isso não foi alterado.

**Torneios com o jogador.** Quando a inscrição exige qualifying (`metadata.qualifying_required`):

- `getQualifyingRoundCount(qualifying_size)` define o número de rodadas: 16 → 3 (Quartas, Semifinal, Rodada decisiva);
- o sorteio do jogador (`tournamentDraw.createDrawnRun`) escolhe **um adversário real por rodada**
  (`qualifyingOpponentIds`). É o **caminho do jogador** dentro do qualifying, a linha que alimenta a vaga reservada;
- o `tournament_run` guarda essas rodadas (`stage: 'qualifying'`) seguidas das rodadas da chave principal
  (`stage: 'main'`);
- a chave canônica contém só a chave principal, com **uma** vaga reservada (`player_match`) na rodada 0. As demais
  partidas da chave principal já são decididas no sorteio pelo motor determinístico;
- as partidas do jogador são jogadas no `TournamentModal`. As da IA no caminho dele e as rodadas após a saída do
  jogador são decididas pelo motor determinístico (`chooseWinner` + `fillerTeamStrength`, o mesmo da cascata).

Respostas às perguntas da auditoria:

| Situação | Antes desta fase | Depois |
|---|---|---|
| Jogador não inscrito | qualifying abstrato + chave completa no sorteio; torneio liquidado pelo World Tour | inalterado |
| Perde na 1ª rodada do qualifying (de 3) | quem o eliminou **herda a vaga direto** (pula Q2/Q3) | quem o eliminou disputa Q2 e Q3; só o vencedor da Q3 ocupa a vaga |
| Perde na última rodada | quem o eliminou ocupa a vaga | igual (byte a byte) |
| Abandona (`withdrawTournamentRun`) | adversário herda a vaga direto | adversário completa o caminho restante |
| W.O. automático (`resolveUnavailablePlayerMatch`) | idem | idem, sem ação do jogador |
| Vaga aberta após saída (save antigo / nenhuma tela aberta) | `repairOpenQualifyingSeat` no tick diário: herança direta | tick diário completa o caminho restante |
| Vence todo o qualifying | entra na rodada 0 da chave principal | inalterado |

## 2. Defeitos confirmados (reprodução com o pipeline real, antes da correção)

Gold com qualifying de 16 (3 rodadas), W.O. na Q1 via `resolveUnavailablePlayerMatch`:

1. **Classificação antecipada.** A vaga principal foi para o adversário da Q1, que nunca disputou a Q2 e a Q3.
   Causa: os quatro pontos de chamada de `applyQualifyingExitToCanonicalBracket` passavam só a dupla que eliminou
   o jogador (`opponentTeamNameOfRunMatch(exitMatch)`).
2. **Pontos de ranking indevidos.** Os dois atletas do adversário da Q1 receberam **9 pontos** de "rodada da chave
   principal". Causa: `placementRoundsWonForOpponent` indexava `run.matches`, que começa pelo qualifying, com contagens
   da chave principal (`roundsWon`/`totalRounds`). Com saída no qualifying (`roundsWon = 0`), creditava
   `run.matches[0]`, o adversário da Q1. Com o jogador classificado, creditava as vitórias da chave principal aos
   adversários do qualifying.

## 3. Correção

- `tournamentSettlement.js`:
  - `remainingQualifyingOpponentNames(run, exitMatch)`: adversários já sorteados das rodadas de qualifying posteriores
    à saída;
  - `applyQualifyingExitToCanonicalBracket` aceita `remainingOpponents`. A dupla que eliminou o jogador joga o caminho
    restante contra esses adversários, com o **mesmo motor da cascata**, e só o vencedor ocupa e disputa a vaga. As
    partidas simuladas ficam gravadas na vaga (`qualifying_path`, campo aditivo, presente só nesse caso). Sem
    adversários restantes, a saída é idêntica à anterior. Run incompleto: o caminho é jogado só até o último
    adversário identificável, sem inventar dupla.
- `tournamentLifecycle.js`: `repairOpenQualifyingSeat` (tick diário) e `resolveUnavailablePlayerMatch` (W.O.) passam o
  caminho restante. `placementRoundsWonForOpponent` indexa só as partidas da chave principal e não credita ninguém
  quando a campanha terminou no qualifying (o qualifying não pontua, como no AI-only).
- `TournamentModal.jsx`: derrota e abandono no qualifying passam o caminho restante. É só uma linha de dados; a
  simulação continua no motor, que roda headless.
- `scripts/test-local-7f-qualifying-continuity.mjs` e `package.json` (`test:local-7f-qualifying-continuity`).

Não mudou: estrutura e tamanho das chaves, sorteios, número de vagas, prazos, o qualifying abstrato do AI-only, a
simulação das partidas (mesmo motor), fórmulas de pontos e prêmios, a identidade das duplas (LOCAL-7E) e a
continuidade da CLOUD-7D1.

## 4. Regras de classificação (depois)

1. A vaga reservada é de quem **vencer o caminho completo** do qualifying.
2. Se o jogador vence todas as rodadas, ele ocupa a vaga e a disputa.
3. Se sai na rodada *k*, a dupla que o venceu disputa as rodadas *k+1…última* contra os adversários já sorteados.
4. Nenhuma partida já disputada é alterada; nenhuma é simulada duas vezes (idempotente: vaga já decidida não é refeita).
5. Pontos: o qualifying não pontua; os créditos dos adversários em torneio do jogador vêm só da chave principal.

## 5. Compatibilidade com saves

- **Anterior à CLOUD-7D1** (fixture CLOUD-7C com 6 torneios travados após saída no qualifying): o tick diário fecha
  todos com campeão. A vaga vai para quem vence o caminho restante, e torneios concluídos ficam intactos (O1–O3).
- **Posterior à CLOUD-7D1** (vaga já ocupada pelo algoz direto): nada é refeito (idempotente, O4). O resultado
  confirmado é preservado, mesmo que tenha sido uma classificação antecipada.
- **Posterior à LOCAL-7E**: homônimas continuam distintas (J1–J2).
- Torneio não sorteado ou sorteado sem saída: comportamento inalterado. Qualifying em andamento atravessa save/load
  sem diferença (H1). Torneio concluído não é reprocessado (I4, O3).
- Créditos de pontos já gravados por saves anteriores (inclusive os indevidos do defeito 2) **não** são removidos:
  isso exigiria reprocessar premiações. A correção vale para as finalizações a partir desta fase.

## 6. Testes

`npm run test:local-7f-qualifying-continuity`: **36 verificações**, com carreira em memória, sorteio real, o caminho do
`TournamentModal` sem React, W.O. real e tick diário real.

| Cenário | Verificações |
|---|---|
| A — sem jogador | todo torneio vencido (incluindo os com qualifying) termina com campeão; nenhuma vaga extra |
| B — perde na Q1 | vencedor segue para Q2/Q3; vaga = vencedor da Q3; eliminação registrada; sem pontos para o qualifying; estrutura da chave intacta |
| C — perde na Q3 | vencedor da Q3 classificado; byte a byte igual à CLOUD-7D1; progresso preservado |
| D — vence Q1, perde Q2 | Q2 joga a Q3; Q1 preservada, não re-simulada |
| E — vence o qualifying | entra na chave principal; crédito só para o adversário da chave principal |
| F — abandono | adversário completa o caminho; W.O. registrado sem resultado inventado; sem pontos indevidos |
| G — W.O. automático | caminho completado sem ação do jogador |
| H — save/load | run e chave idênticos após reload; reaplicação idempotente, sem duplicar resultados |
| I — avanço acelerado | todos os torneios do jogador terminam com campeão/vice; colocações coerentes; sem duplicação; concluídos não reprocessados |
| J — homônimas | caminho e chave sem nomes repetidos; classificado em exatamente uma vaga |
| K — determinismo | mesma entrada, mesma chave; entrada imutável; run incompleto sem dupla inventada |
| O — save antigo | ver §5 |

No código anterior, B1 falha. A reprodução da §2 mostra os dois defeitos.

## 7. Desempenho

Avanço de 10 dias no save da CLOUD-7C (torneios ativos e vagas de qualifying a reparar), 3 execuções:

| Código | ms (3 execuções) | mediana |
|---|---|---|
| anterior (`205f971`) | 2228, 2213, 2558 | 2228 |
| LOCAL-7F | 2376, 2360, 2224 | 2360 |

As faixas se sobrepõem, então a diferença está dentro do ruído. A correção acrescenta no máximo `rodadas restantes`
decisões determinísticas (≤ 3), uma única vez por torneio, na saída do jogador. Nenhuma leitura ou gravação a mais por tick.

## 8. Riscos restantes

- O qualifying do AI-only continua abstrato: não há partidas persistidas das outras linhas do qualifying, e as duplas
  do caminho do jogador são as únicas com partidas registradas (`qualifying_path`).
- As partidas simuladas no caminho usam o motor determinístico da cascata (força derivada do nome), não a força real
  das duplas — o mesmo critério já usado para todas as rodadas após a saída do jogador desde a CLOUD-7D1.
- Saves que já tiveram a vaga entregue ao algoz direto (CLOUD-7D1) ou créditos de qualifying indevidos mantêm esses
  resultados (não reprocessados).
- Outras duplas da chave principal de um torneio do jogador continuam sem crédito de ranking, exceto o campeão
  (limitação existente desde a 5.0).

## 9. Validação manual

1. Abrir `http://127.0.0.1:5174/` e pressionar F5.
2. Abrir a carreira de teste e inscrever-se num torneio com qualifying (Gold, Platinum, Masters ou Elite com
   ranking abaixo do corte direto).
3. Disputar a primeira partida do qualifying.
4. Ser eliminado, se possível, de preferência antes da rodada decisiva.
5. Avançar o calendário.
6. O torneio deve chegar à final com campeão e vice.
7. Na chave principal, a vaga do qualifying deve aparecer com a dupla que venceu as rodadas restantes, que pode não
   ser a que eliminou você.
8. Conferir campeão, resultados e ranking.
9. Pressionar F5 e confirmar a persistência.

## 10. Resultados da regressão

**105 de 114** execuções aprovadas (exit 0), entre elas:

- LOCAL-7F (36/36), LOCAL-7E (38/38), LOCAL-7D (33/33), CLOUD-7D1, CLOUD-6N;
- CLOUD-7B1 com `TZ=UTC` (equivalência byte a byte de saves), 7B2A, 7B2B e 7B2C;
- todas as suítes de ranking (v522e/f/g, v523, v524, race);
- torneios, sorteios e settlement: canonical-results, result-authority, flow-rc, draw-name-collision,
  match-lifecycle, resume-recovery, round-availability, guided-flow, date-continuity e ~60 scripts de
  chave/sorteio/walkover/qualifying;
- calendário, living-world, world-save-load, world-idempotency, world-generation e persistência;
- `npm run lint`, `npm run build`, `npm run validate:architecture` e `git diff --check`: limpos.

**Falhas, todas preexistentes** (falham igual em `205f971`, verificado):

- `phase15-6-1-tournament-draw-consistency` e `phase15-6-2-tournament-canonical-state`;
- `test-medium-main-draw-v527h`, `test-progression-smoke-world-pairs-v526d` e `test-qualifying-vs-main-v527h`
  (dependem de CSVs/artefatos de medição ausentes);
- `test-rescue-does-not-displace-qualified-v515` (asserção de texto: "corte do field não está ordenado por score");
- `test-tier-qualifying-heldout`;
- `src/gameplay/tests/WorldTourQualifyingTest.js` e `WorldTourEntryFlowTest.js` (o alias `@/lib` não resolve
  quando executados direto no Node).
