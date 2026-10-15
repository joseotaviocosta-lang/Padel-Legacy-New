# Saída da parceria e autoridade de compromisso — Playthrough 5.27-J

Branch `feature/live-coach-dynamic-adaptation`, HEAD `d5e5a2e` (inalterado). Sem
commit, sem push. Relatórios `rebalance-527`…`527i` preservados.

**Veredito: B. Stage 2: NÃO.**

O lifecycle está corrigido e provado:
- 0 inscrição nova depois da saída;
- 0 compromisso antigo cancelado;
- separação no tick seguinte ao último compromisso legítimo;
- contínuo == recarregado.

Mas a correção **mudou o equilíbrio do Balanced-E** além do limite do smoke:
- Easy +12,5 pp;
- Hard 32,6 → **54,7%**, acima do hard gate ≤ 50.

A causa foi investigada (§7) e é legítima: o bug escondia carreiras presas por
~300 dias a um primeiro parceiro de OVR 13–20. Mas os números validados na
5.27-I deixam de valer. O Stage 2 não deve rodar sobre eles: antes, um novo
Stage 1 com o lifecycle corrigido.

## 1. O bug — eram três falhas no mesmo lifecycle

| # | Falha | Efeito |
|---|---|---|
| 1 | `canRegisterNewTournamentWithPartnership` (5.17) **não tinha chamador** e não cobria `encerra_apos_compromisso` | a dupla com saída decidida se inscrevia normalmente |
| 2 | Na rotina diária, `encerra_apos_compromisso` caía em **`vencido`** no dia seguinte (o bloco "contrato vencido" só tratava `encerrar_ao_final`/`nao_renovara` como planejado) | 7 dias de carência com renovação disponível; o fim agendado deixava de disparar; ao fim da carência a separação era **recalculada com os torneios novos**: o laço que empurrava o fim |
| 3 | Moral < 15 gravava `insatisfeito` **por cima** de `nao_renovara` / `encerrar_ao_final` | a decisão de saída sumia; no vencimento caía em `vencido` (mesmo laço) |

A falha 2 só apareceu num teste do caminho "recusa → `encerra_apos_compromisso`";
a falha 3, nas carreiras reais. Ambas reapareceram depois da primeira correção e
foram tratadas na mesma fase, porque são a mesma autoridade.

### Reprodução determinística (`authority-before.json` → `authority-after.json`)

Mundo real, `registerTournament` e `processPartnerDay` reais.

| Cenário | Decisão | Último compromisso legítimo | Separação antes → depois | Inscrição pós-saída |
|---|---|---|---|---|
| A — lifecycle (vence, carência, `encerra_apos_compromisso`) | 13/02 | 15/02 | 09/03 → **16/02** | aceita → **`PARTNERSHIP_EXIT_PENDING`** |
| B — jogador agenda a saída | 21/01 | 15/02 | 23/02 → **16/02** | a que estenderia: aceita → **recusada** |
| C — recusa + moral 10 | 21/01 | 15/02 | 13/02 (sem compromisso; `insatisfeito`→`vencido`) → **16/02** | **recusada** |

A recusa acontece **antes de qualquer escrita**: nenhuma linha de inscrição,
nenhuma moeda cobrada.

## 2. Caminhos de inscrição (`registration-paths.md`)

| Caminho | Passa pela autoridade? |
|---|---|
| Manual (modal → `registerForTournament` → `registerTournament`) | ✓ |
| Legado de calendário (`legacyCalendarRegistration`, sem chamadores) | ✓ (checagem explícita antes do `CalendarEvent`) |
| Headless/harness (`tryRegister` → `registerTournament`) | ✓ |
| Helpers de teste | ✓ |
| Lembretes, planejamento semanal, comissão, sugestão do CareerHub (prévias) | ✓ (agora recebem a parceria: mesma resposta da inscrição) |
| IA | não se inscreve; entra pela admissão do mundo, só com parcerias ativas |
| Reparo/migração de save | não cria compromisso (só deduplica) |

Não existe inscrição automática nem season planner.
`test-headless-registration-authority` falha se surgir um escritor novo de
`TournamentRegistration` fora do caminho mapeado.

## 3. Autoridade canônica

`committedRoster.evaluatePartnershipRegistrationAuthority(partnership, { careerDate, tournament })`
→ `{ allowed, code: PARTNERSHIP_EXIT_PENDING | PARTNERSHIP_INACTIVE }`.

Chamada de `evaluateTournamentRegistration`, a regra pura que toda inscrição e
toda prévia usam.

| Caso | Estado | Inscrição nova |
|---|---|---|
| A | ativa sem decisão, inclusive `vencido` em carência (renovação disponível) | permitida |
| B | `nao_renovara` / `encerrar_ao_final` (antes da data nominal) | só se o torneio terminar até a data nominal (contrato 5.17: "a parceria seguirá normalmente até…"); nada que a estenda |
| C | `encerra_apos_compromisso` | nenhuma |
| D | parceria encerrada | nenhuma (`PARTNERSHIP_INACTIVE`) |

**Desvio do texto do prompt (decisão de design a confirmar):** o Caso B pedia
"nenhuma inscrição" após a decisão. Mas o comportamento validado da 5.17
(`test-…-v517`, regressão verde) e a mensagem do próprio jogo garantem que a
dupla segue normal até a data nominal. Mantive isso. O que a dupla não pode é
criar compromisso que **estenda** a parceria. Nas carreiras reais isso deu
**0 inscrições dentro do contrato após a decisão** nos 5 seeds (a recusa do
harness vem a ≤ 14 dias do fim). Se quiser o bloqueio total, é uma linha.

**Corte temporal:** `exit_decided_at` é gravado na primeira vez em que a saída
é decidida (recusa do parceiro, agendamento do jogador, entrada em
`encerra_apos_compromisso`) e limpo numa renovação. O estado atual nunca
reclassifica um torneio antigo: compromisso é a inscrição existente (roster da
inscrição, 5.17).

## 4. Compromissos, draw, settlement, histórico

- Compromisso pendente na decisão: **mantido** (`confirmed`, mesmo `partner_id`).
  Nenhum cancelado pela saída. Um W.O. na seed 3 também ocorre sem o fix, na
  mesma trajetória.
- Partidas do limbo: com o **parceiro da dupla que saiu**; campo real, 0 fallback
  sintético.
- Draw comprometido: não reescrito (5.26-D).
- Settlement: todo torneio do limbo liquidado.
- Roster da inscrição resolve o parceiro original depois da separação (5.17).
- Nova dupla: nunca duas ativas (`startPartnership` encerra a anterior). O
  compromisso antigo segue com o parceiro original. A nova dupla só joga depois
  da última partida do limbo. O ex-parceiro segue no mundo.

## 5. Save/reload (`save-reload-results.json`)

| Carreira | Reloads | Contínuo == recarregado |
|---|---|---|
| seed 3, 2 anos, reload a cada 7 dias | 105 | ✓ (inscrições, saídas, parceiros, partidas, renovações, torneios) |
| seed 3, 110 dias, reload **diário** (limbo 49–66) | 110 | ✓ |
| seed 4, 100 dias, reload **diário** (limbo 77–95, torneio de 4 partidas) | ~100 | ✓ |

Reload antes do sorteio, depois do sorteio e **entre partidas** de um
compromisso do limbo. O reload não reabriu inscrição, não perdeu o estado de
saída nem mudou o conjunto de compromissos ou a data de separação.

## 6. Limbo antes/depois (`commitment-lifecycle.csv`)

| | Antes (5.27-I, 5 seeds) | Depois (smoke, 5 seeds) |
|---|---|---|
| Saídas | 5 | 15 |
| Compromissos novos após a decisão | 26 | **0** |
| Limbo (mediana · máx) | 50 · 151 dias | **22 · 32 dias** |
| Extensão ilegítima (mediana · máx) | 29 · 137 dias | **0 · 0** |
| Separação agendada empurrada | sim | **0 vezes** |
| Inscrições com saída decidida (qualquer estado de saída) | — | **0** (211 tentativas recusadas com `PARTNERSHIP_EXIT_PENDING`) |

### Seed 3 histórica (config da 5.27-H: Silver 25%, política v3; `seed3-before-after.json`)

| | Antes | Depois |
|---|---|---|
| Recusa do parceiro (decisão) | dia 49 | dia 49 |
| Compromissos pendentes no dia 49 | 3 | 3 |
| Último compromisso legítimo | dia 63 | dia 66 |
| Compromissos novos após a decisão | **26** | **0** |
| Troca efetiva | dia **323** | dia **67** |
| Limbo | 274 dias (14 legítimos, **260 ilegítimos**) | 18 dias (17 legítimos, **0**) |

Otimizador v4: não alterado. Ele já não se inscrevia com o parceiro que estava
deixando; o fix do jogo torna essa regra do harness redundante, sem mudar o
resultado dele.

## 7. Smoke competitivo e econômico (5 seeds × Normal × Balanced-E × 2 anos)

| | 5.27-I | 5.27-J | Δ |
|---|---|---|---|
| Easy | 52,9 | **65,4** | +12,5 ⚑ |
| Medium | 43,8 | 45,3 | +1,5 |
| Hard | 32,6 (84) | **54,7 (99)** | +22,1 ⚑ (gate ≤ 50 ✗) |
| R1 | 46,7 | 48,6 | +1,9 |
| Bronze / Silver / Gold (main) | 57,5 / 45,3 / 48,2 | 66,3 / 64,0 / 42,7 | |
| Parceiro @1a / @2a | 79 / 80 | 80 / 82 | |
| Rank @1a / @2a | 275 / 38 | 244 / 23 | |
| Títulos Y1 / Y2 acum. (mediana) | 1 / 2 | **5 / 5** ⚑ | |
| Sponsor Y1 / Prize Y1 | 48,7 / 16,8 | 39,5 / 17,0 | |
| Dívida Normal / custo de rescisão | 0% / 0 | 0% / 0 | |

### Investigação (o Δ > 10 pp exigia)

| Seed | 1ª troca 5.27-I → J | Easy I → J | Hard I → J |
|---|---|---|---|
| 1 | 309 → 298 | 51,7 → 54,8 | 42,1 (19) → 0 (7) |
| 2 | 309 → 302 (depois 333, 379) | 51,7 → 54,8 | 33,3 (15) → **70,0 (30)** |
| 3 | **326 → 67** | 48,2 → **81,5** | 14,3 (14) → 0 (5) |
| 4 | **309 → 58** | 53,1 → **80,4** | 41,7 (24) → **65,8 (38)** |
| 5 | 309 → 302 | 59,6 → 59,6 | 25,0 (12) → 42,1 (19) |

- **Easy.** Nas seeds 3 e 4 o parceiro inicial (OVR 13–20) recusou a renovação
  nos dias 49–58. Com o bug, a dupla ficou presa ~300 dias até 309/326. Com o
  fix, a separação vem logo e o substituto (OVR 31–34) leva o Easy a ~80%. O
  número antigo estava **mascarado pelo bug**.
- **Hard.** Vem de duas trajetórias que divergiram (seeds 2 e 4, n = 30 e 38).
  Amostra pequena e alta variância, mas acima do gate.
- **Títulos Y1.** Sobem pelo mesmo motivo do Easy.

Conclusão: não é regressão do lifecycle; é o equilíbrio real com o lifecycle
correto. Mas ele não é mais o validado na 5.27-I. Economia sem regressão.

## 8. Testes, regressões, lint, build (`regressions.json`)

| Grupo | Resultado |
|---|---|
| **Novos 5.27-J** | **11/12**; o vermelho é `test-balanced-e-smoke-after-lifecycle` (§7: Easy Δ > 10 pp e Hard > 50; sinal correto, não afrouxado) |
| 5.27-I (Otimizador v4, Silver 15%, presets antigos 25%) | 4/4 |
| 5.27-H (paridade do motor) | 1/1 |
| 5.27-G (Normal v3, autoridade de OVR, neutralidade tática) | 6/6 |
| 5.27-F (paridade, side swap, energia, monotonicidade, fontes de pontos) | 9/9 |
| 5.26-D (pares reais, draw comprometido, TeamRanking, settlement) | 12/12 |
| Motor de partida | 3/3 |
| Ranking (TeamRanking, virada de ano, Race) | 3/3 |
| Parceria (ofertas, renovação, re-sign, ex-parceiro, mercado IA, **expiração com compromisso 5.17**) | **10/10** |
| Persistência (recompensas, save/reload, storage Android) | 5/5 |

| | |
|---|---|
| `npm run lint` | verde (1 aviso preexistente em `CareerHub.jsx`: `progress` não usado) |
| `npm run build` | verde |
| `git diff --check` | limpo |
| commit / push | nenhum |

Ajustes de teste feitos depois de ver dados, todos de lógica do próprio teste e
registrados aqui:
1. **Compromisso preservado:** passou a considerar só o que estava pendente na
   decisão. Um W.O. só falha se o mesmo compromisso foi jogado sem o fix.
2. **Draw no limbo:** a referência passou a ser o parceiro da dupla que saiu,
   não a última partida anterior (que era de outra parceria).
3. **Save/reload:** acrescentei reload diário nas janelas de limbo das seeds 3
   e 4. O semanal não caía entre partidas de um compromisso do limbo.
4. **Fora da lista de regressões:** `test-no-gold-change-v527i`, porque compara
   o hash do lifecycle de parceria, que esta fase muda de propósito. Gold+,
   Silver, balance, Normal v3, Otimizador, táticas e ranking seguem cobertos
   pelo teste de smoke (hash por bloco, todos iguais).

## 9. Arquivos de código alterados

| Arquivo | Mudança |
|---|---|
| `src/lib/committedRoster.js` | autoridade `evaluatePartnershipRegistrationAuthority` (+ atalho 5.17 preservado) |
| `src/lib/tournamentRegistration.js` | a validação recebe a parceria; `registerTournament` passa a parceria ativa |
| `src/lib/calendarSystem.js` | caminho legado checa a autoridade |
| `src/lib/careerCommunications.js`, `src/lib/weeklyCareerReview.js`, `src/game-core/competitiveStaffReview.js`, `src/pages/CareerHub.jsx` | prévias e sugestões com a parceria (paridade) |
| `src/game-core/partnerLifecycle.js` | `exit_decided_at` (grava/limpa); `encerra_apos_compromisso` não cai em `vencido`; moral baixa não apaga saída decidida |
| Harness (`scripts/sim-progression-economy-v526.mjs`) | só telemetria: estado da parceria por inscrição e episódios de saída |

## 10. Respostas (50)

1. `canRegisterNewTournamentWithPartnership` existia em `src/lib/committedRoster.js` (5.17).
2. Quem chamava antes: **ninguém** (só um comentário em `partnerLifecycle.js` e um teste unitário).
3. Paths que bypassavam: **todos** (manual, legado, headless, helpers, prévias).
4. Por que bypassavam: a validação de inscrição nunca recebia a parceria; sem a
   linha de `Partnership` não havia como saber da saída. A regra também não
   cobria `encerra_apos_compromisso`.
5. Autoridade canônica: `evaluatePartnershipRegistrationAuthority` (`committedRoster.js`), chamada por `evaluateTournamentRegistration`.
6. Estados verificados: status da parceria; `contract_status` (`nao_renovara`,
   `encerrar_ao_final`, `encerra_apos_compromisso`); data nominal; data da
   carreira; fim do torneio. `exit_decided_at` é o corte temporal registrado.
7. Contrato expirado sozinho bloqueia? **Não** (`vencido` em carência permite renovar e inscrever).
8. Exit decision bloqueia? **Sim**: qualquer compromisso que estenda a dupla.
   Depois da data nominal / em `encerra_apos_compromisso`, tudo.
9. Existing commitment continua? **Sim**.
10. New commitment é bloqueado? **Sim** (0 nas carreiras reais; 211 tentativas recusadas).
11. Manual registration passa pela autoridade? **Sim**.
12. Auto registration? Não existe inscrição automática; as prévias passam pela autoridade.
13. Headless? **Sim** (mesma `registerTournament`).
14. AI? Não se inscreve; a admissão usa só parcerias ativas; a dissolução da IA é imediata (sem o bug).
15. Fallback? O legado de calendário também checa.
16. Draw depois da saída mantém a dupla antiga? **Sim**.
17. Match mantém? **Sim**.
18. Settlement mantém? **Sim**.
19. Histórico mantém? **Sim** (roster da inscrição).
20. Novo parceiro pode sobrescrever torneio antigo? **Não**.
21. Quando a separação efetiva ocorre: no tick seguinte ao fim do último compromisso legítimo.
22. Mesmo dia do último compromisso? Não: no dia seguinte (o compromisso termina primeiro).
23. Próximo tick? **Sim**.
24. Houve atraso extra? **Não** (extensão máxima 0; agendamento nunca empurrado).
25. Seed 3, antes: **274 dias** de limbo (dia 49 → 323).
26. Legítimos: **14**.
27. Extensão ilegítima: **260** (26 compromissos novos).
28. Seed 3, depois: **18 dias** (17 legítimos, 0 ilegítimos; troca no dia 67).
29. Outras seeds: limbo mediano 50 → **22** dias; extensão ilegítima mediana 29 → **0**.
30. Save antes do draw funciona? **Sim**.
31. Reload antes do draw? **Sim**.
32. Reload após o draw? **Sim**.
33. Reload entre partidas? **Sim** (seed 4, torneio de 4 partidas no limbo).
34. Continuous == reload? **Sim** (semanal 2 anos e diário nas duas janelas).
35. AI partnerships tinham o bug? **Não**.
36. Foram corrigidas? Não precisaram.
37. Algum commitment antigo foi cancelado? **Não**.
38. Algum roster histórico mudou? **Não**.
39. Algum settlement mudou? **Não**.
40. Houve dupla ativa sobreposta? **Não**.
41. Otimizador v4 foi alterado? **Não**.
42. Normal v3 foi alterado? **Não**.
43. Balanced-E foi alterado? **Não** (hash dos blocos igual ao da 5.27-I).
44. Smoke competitivo: Easy **65,4** · Medium **45,3** · Hard **54,7** · R1 **48,6**.
45. Silver / Gold smoke: **64,0 / 42,7** (Silver + 5 ≥ Gold ✓).
46. Rank @1a / @2a smoke: **244 / 23**.
47. Economia smoke: Sponsor Y1 39,5 · Prize Y1 17,0 · dívida Normal 0% · rescisão 0. Sem regressão.
48. Testes / regressões: novos **11/12** (o vermelho é o smoke de equilíbrio, §7) · regressões **53/53**.
49. Lint ✓ · build ✓ · diff-check ✓ · commit ✗ · push ✗.
50. **VEREDITO: B. STAGE 2 LIBERADO: NÃO.**
    - Critérios de lifecycle (1–27) e de integridade: atendidos.
    - Não atendidos: 28 (smoke competitivo com Hard acima do gate e Easy
      Δ > 10 pp) e 30 (um teste novo vermelho, o próprio sinal de equilíbrio).

### Próximo passo recomendado

Rodar de novo o **Stage 1 (45 carreiras)** com o lifecycle corrigido, sem tocar
no balanceamento, para medir o equilíbrio real com 5 seeds × 3 perfis × 3
presets. Se Hard > 50 e títulos/ranking rápidos se confirmarem, abrir uma fase
de balanceamento de Hard (Masters/Elite) e progressão antes do Stage 2.
