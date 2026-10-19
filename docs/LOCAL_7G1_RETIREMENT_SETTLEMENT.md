# LOCAL-7G.1 — Pontuação preservada após aposentadoria do parceiro

Branch `integracao/cloud-6o`, a partir de `eede8fd` (LOCAL-7G). Compactação incremental e histórica desligadas e não tocadas.

## 1. Causa exata

No settlement dos torneios só de IA (`WorldTourLifecycle.resolveCompletedWorldTourEvents`), o campo de um torneio já
sorteado vem de `draw_pair_ids`. Cada id é resolvido por `resolveDrawnPair`. Quando a parceria já foi encerrada (por
exemplo, por aposentadoria de um membro entre o sorteio D-3 e o settlement), os membros são resolvidos pelo índice
`athleteById`, que só continha atletas **ativos**. Com um membro aposentado, a resolução falhava e a dupla **saía do
campo**:

- nenhum dos membros pontuava, nem o parceiro ainda ativo, embora a chave registrasse a colocação da dupla;
- `simulated_entrants` ficava menor que o campo sorteado;
- se a dupla fosse campeã ou vice, a busca por identidade não a encontrava e o fallback `ordered[0]`/`ordered[1]`
  atribuía o título e os ids de campeão a **outra** dupla;
- as demais duplas cuja colocação dependia do fallback por índice também podiam ser deslocadas (caso 1b falha no
  código anterior).

## 2. Correção

Uma alteração em `resolveCompletedWorldTourEvents`. `athleteById` passa a indexar **todos** os atletas, e os ativos
continuam usando a **mesma instância** de `athletes`, que é onde o settlement escreve (`currentRegion`, `head_to_head`).
Usar cópias perderia essas escritas do parceiro ativo.

```js
const athleteById = new Map(rawAthletes.filter((a) => a?.id).map((a) => [a.id, normalizeAthlete(a)]));
for (const athlete of athletes) athleteById.set(athlete.id, athlete);
```

`athleteById` só é usado para resolver duplas **sorteadas**. A formação de duplas, a elegibilidade e o sorteio continuam
usando apenas atletas ativos (`buildCanonicalPairs(partnerships, athletes)`).

## 3. Política aplicada ao atleta aposentado

- **Não recebe gravação:** sem `AthleteRankingResult`, sem Race, sem contadores de carreira e sem mudança de status. A
  gravação de atletas (`athleteUpdates`) continua restrita aos ativos, como antes.
- Continua aposentado e não volta a sorteios, já que a elegibilidade não mudou (caso 5).
- Aparece como membro da dupla nos registros históricos do torneio (`champion_athlete_ids`, notícia, `head_to_head`
  dos adversários ativos), porque de fato disputou o torneio.
- Se se aposentar **depois** do torneio, o resultado já gravado permanece (caso 7).

## 4. Comportamento do parceiro ativo

Recebe os pontos da colocação da dupla na chave, pela tabela oficial (`resolveFinish`), com resultado datado,
recálculo rolling, Race, contadores e ledger da dupla, uma única vez.

## 5. Testes

`npm run test:local-7g1-retirement-settlement`: **18 verificações** com o pipeline diário real e carreira em memória. Num
torneio de IA sorteado, o teste aposenta, com os mesmos campos da produção (`livingCircuitRules`), o 1º membro de uma
dupla, o 2º de outra e os dois de uma terceira, e mantém uma dupla intacta.

| Caso | Verificação |
|---|---|
| 1 — nenhum aposentado | a dupla pontua pela colocação; todas as outras duplas também (1b) |
| 2 / 3 — 1º / 2º membro aposentado | o parceiro ativo pontua pela colocação; o aposentado sem gravação |
| 4 — ambos aposentados | ninguém grava, mas a dupla continua no campo, com posição registrada |
| 5 — antes do sorteio | o aposentado não aparece em nenhum sorteio posterior |
| 6 — depois do sorteio | campo do settlement = campo sorteado; campeão gravado = dupla campeã da chave |
| 7 — depois do torneio | o resultado permanece; o torneio não é reprocessado |
| 8 — save/load | antes e depois do settlement |
| 9 — idempotência | settlement repetido e novos dias não mudam nada |
| 10 — ranking e Race | Race do parceiro ativo recebe os pontos; ranking = janela rolling; um resultado por atleta |
| P — política do aposentado | status, pontos, Race e contadores intactos |

No código anterior falham 2, 3, 6 e 1b, e o teste interrompe em 10a (parceiro ativo sem resultado).

Testes de fases anteriores ajustados (comportamento intencional):

- `test-local-7g-world-points-integrity` E1: volta a exigir o crédito também da dupla desfeita por aposentadoria
  (antes registrava a lacuna como INFO).
- `test-local-7d-team-world-ranking` B6: "campeão e vice recebem pontos" vale para os membros **ativos**, porque uma
  dupla com membro aposentado pode agora ser campeã ou vice.

## 6. Compatibilidade com saves

- Torneios concluídos não são reprocessados (casos 7 e 9). Pontos que faltaram em torneios já liquidados não são recriados.
- Torneios sorteados e ainda não liquidados num save antigo são liquidados com a dupla no campo.
- Sem migração e sem mudança de formato.

## 7. Baseline histórico da CLOUD-7B1

`test:cloud-7b1-save-pipeline` A compara o save de três carreiras de referência com
`reports/cloud-phase-7b1-save-pipeline/data/equivalence-baseline.json`, gerado pelo código **anterior à CLOUD-7B1**.

- O arquivo histórico e o fixture `career-day30-pre7b1.json.gz` **não foram alterados** (sha256 conferido antes e depois).
- **Primeiro ponto de divergência: dia 28** da carreira `7b1-eq` (memória). Nesse dia é liquidado o Londres Challenge
  (`tournament-2026-lon-bro-w05-1`, Bronze). A dupla com membro aposentado após o sorteio passa a continuar no campo:
  `simulated_entrants` 15 → 16, o parceiro ativo ganha o resultado da 1ª rodada (1 ponto), e o perfil dele, o ledger da
  dupla e dois perfis vizinhos por posição mudam. O campeão não muda.
- Chaves afetadas: `memoria-dia-30` e `memoria-dia-45`. Inalteradas: `memoria-dia-15`, `tauri-mock-dia-15`, `fixture-sha`
  e `fixture-mais-10-dias`.
- **Novo baseline**, identificado como posterior à LOCAL-7G.1:
  `reports/cloud-phase-7b1-save-pipeline/data/equivalence-baseline-post-local-7g1.json`. Ele contém os hashes novos e a
  lista declarada das chaves divergentes, com a causa e o primeiro dia.
- O teste agora separa três situações:
  1. **histórico preservado**: toda chave não declarada continua byte a byte igual ao código anterior à CLOUD-7B1;
  2. **divergência esperada**: só as chaves declaradas diferem do histórico, e exatamente para os hashes pós-7G.1;
  3. **regressão real**: qualquer diferença em relação ao baseline pós-7G.1 falha.
- `--record` passa a se **recusar** a sobrescrever o baseline ou o fixture históricos. O baseline novo é gravado só por
  `--record-post-local-7g1`, que nunca toca no histórico.
- Resultado: 43 verificações (antes 37), todas aprovadas.

## 8. Desempenho

A mudança acrescenta a construção de um `Map` com todos os atletas (cerca de 1 000 entradas), e só quando há torneio
de IA pendente de settlement: a linha fica depois do retorno antecipado `if (!pending.length) return`. Não há leitura
extra, porque `rawAthletes` já é lido nessa chamada, nem trabalho nos demais ticks.

Medição intercalada (carreira nova, avanço de 10 dias, 6 execuções de cada lado): original 1290, 1547, 1139, 1682, 1065,
1526 ms; corrigido 1714, 1625, 1676, 1758, 1241, 1376 ms. As faixas se sobrepõem (≈600 ms de dispersão em cada grupo
contra ≈240 ms entre medianas), e nesse intervalo não há torneio de IA pendente, então a linha alterada não executa: a
diferença é ruído do ambiente.

## 9. Riscos restantes

- O aposentado não recebe o resultado do torneio que disputou. É a política de gravação existente, só para ativos; o
  registro histórico do torneio mantém a participação dele.
- Se os dois membros se aposentam antes do settlement, a dupla ocupa a colocação sem pontuar ninguém, o que é correto.
- Torneios concluídos antes desta fase com duplas descartadas não são corrigidos.

## 10. Resultados da regressão

**64 de 65** execuções aprovadas, entre elas:

- LOCAL-7G.1 (18/18), LOCAL-7G (24/24), LOCAL-7F, LOCAL-7E, LOCAL-7D, CLOUD-7D1 e CLOUD-6N;
- CLOUD-7B1 com `TZ=UTC` (43/43, com a validação histórica e a pós-7G.1), 7B2A (determinismo), 7B2B e 7B2C;
- aposentadoria e continuidade de mundo: `world-retirement`, `world-career-stages`, `world-partnership-dynamics`,
  `world-generation`, `former-partner-reintegration-v518` e `extreme-elite-inactivity-v518`;
- settlement: `settlement-uses-persisted-draw-roster`, `parallel-tournament-settlement-v59`, `walkover-*`,
  `race-early-elimination-champion-credit` e `historical-*`/`bracket-*`;
- ranking (v522e/f/g, v523, v524, race, rolling window), `world-save-load`, `world-idempotency`, persistência e calendário;
- `npm run lint`, `npm run build`, `npm run validate:architecture` e `git diff --check`: limpos.

Falha preexistente (igual em `eede8fd`, verificado): `test-former-partner-world-continuity-v518`, Parte I
("pareado mas nunca competiu em 6 meses").
