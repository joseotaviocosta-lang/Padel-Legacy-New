# Validação completa do Stage 1 (Balanced-E) — Playthrough 5.27-H

Branch `feature/live-coach-dynamic-adaptation`, HEAD `d5e5a2e` (inalterado). Sem
commit, sem push. Relatórios `rebalance-527`…`527g` preservados.

**Veredito: B. Stage 2: NÃO liberado.**

A matriz oficial rodou limpa e completa: 45/45 carreiras, 0 falhas, 0 divergência
de determinismo, 0 mudança de configuração. Mas o **Balanced-E reprova um hard
gate: R1 do Normal = 39,4% (< 40%)**. Pela regra pré-registrada ele fica
**REJECT**. O único preset que passa todos os hard gates é o **Hardcore-E**
(PREFERRED). Pela regra 48 a fase **para aqui e reporta**; o default do jogo não
foi trocado.

Leitura honesta: as diferenças entre presets estão dentro do ruído das 5 seeds.
O R1 do Balanced-E vale 39,4% contra 41,5% do Hardcore-E (erro-padrão ≈ 2,7 pp
com ~340 partidas cada). Uma seed (3) derruba os três presets. Por isso a decisão
"trocar para Hardcore-E" não é sustentada por estes dados (ver §9).

## 1. Freeze e operação

| | |
|---|---|
| Config congelada | `frozen-config.json` · semanticHash `c35b0cbf…` (balance, política de parceiro, táticas, ranking, população) + hashes por bloco e por arquivo |
| Verificações durante a matriz | 406 (antes de cada segmento de 90 dias), **0 diferenças**, um só hash |
| Código | codeHash `87b17c6d…` igual em todos os 45 resultados |
| Carreiras | 45 rodadas · 45 DONE · 0 FAILED |
| Resume | 360 retomadas de checkpoint (8 por carreira, processo novo a cada 90 dias) · 0 retentativas por crash |
| Determinismo | 0 divergências no manifest · recheck contínuo × segmentado: ver §12 |
| Tempo | 19,9 h de CPU (≈ 10 h de relógio, 2 em paralelo) |

Pipeline da 5.27-D reaproveitado sem reescrita (manifest, checkpoint, resume,
heartbeat, watchdog, RNG isolado, hash, stale RUNNING). Mudanças **só de
harness, todas antes do `--init`**:
- `v527dJobs.mjs`: presets/estágios por ambiente e IDs `-e`;
- orquestrador: gate de freeze 5.27-H e `policy`/`semanticHash` no envelope;
- simulador: grava toda decisão de renovação (inclusive recusa), a qualidade do parceiro nos 7 marcos e as táticas da partida.

A neutralidade foi provada antes do freeze (`instrumentation-neutrality.json`).
Com a sonda ligada e desligada, o outcomeHash foi idêntico. As primeiras 44
partidas também foram idênticas às da 5.27-G (balanced-e v3, seed 1).

## 2. Competição — Normal (perfil dos gates), 2 anos, WR agregado

| | Conservative-E | **Balanced-E** | Hardcore-E | Gate |
|---|---|---|---|---|
| Easy | 46,2 (273) | **47,3** (258) | 51,6 (281) | ≥ 45 |
| Medium | 47,2 (269) | **40,0** (250) | 37,1 (240) | ≥ 30 |
| Hard | 47,5 (80) | **48,1** (81) | 33,9 (59) | ≤ 50 |
| R1 | 43,8 (347) | **39,4 (343) ✗** | 41,5 (340) | ≥ 40 |
| R2 · QF · SF · F | 50 · 49 · 54 · 52 | 51 · 51 · 44 · 68 | 34 · 53 · 51 · 56 | |

Por carreira (Balanced-E Normal, R1): média 39,2 · mediana 45,3 · P25 31,8 · P75 50 · min 18,8 · máx 50 · dp 12,2.

Por seed (Normal):

| R1 / Easy por seed | s1 | s2 | s3 | s4 | s5 | R1 sem s3 |
|---|---|---|---|---|---|---|
| Conservative-E | 24,6 / 40,4 | 59,7 / 45,8 | 37,1 / 33,3 | 59,7 / 50 | 37,7 / 58,1 | 45,5 |
| **Balanced-E** | 31,8 / 34 | 50 / 50,8 | **18,8 / 27,9** | 45,3 / 56,9 | 50 / 60,3 | 44,5 |
| Hardcore-E | 39,7 / 54 | 61,4 / 55 | 21,7 / 37 | 47,7 / 55,6 | 36,8 / 53,4 | 46,5 |

A tabela "sem seed 3" é só diagnóstico. O gate oficial usa as 5 seeds.

Ano a ano (Balanced-E Normal): o Normal joga Easy só no Y1 e Medium só no Y2.

| | Easy | Medium | R1 |
|---|---|---|---|
| Y1 | 47,3 (258) | 0 (5) | 39,0 (154) |
| Y2 | — (0) | 40,8 (245) | 39,7 (189) |

### Tiers (Balanced-E Normal)

| Tier | WR total | Qualifying | Main |
|---|---|---|---|
| Bronze | 59,0 (178) | — | 59,0 |
| **Silver** | **21,3 (80)** | — | 21,3 |
| Gold | 31,9 (94) | — (0) | 31,9 (94) |
| Platinum | 44,9 (156) | 0 (1) | 45,2 (155) |
| Masters | 44,0 (50) | — | 44,0 |
| Elite | 62,5 (24) | — | 62,5 |
| Crown | 0 (2) | — | 0 |

Todos os perfis do Balanced-E: Gold qualifying 7,1% (28), main 18,5% (205);
Platinum qualifying 32,1% (81), main 32,9% (225).

O Medium do Normal vem 100% da chave principal (o ganho da 5.27-G se manteve).

**Silver incoerente:** o Silver rende 21% contra 32% do Gold e 59% do Bronze, nos
três presets (Conservative-E 27,3 · Hardcore-E 20). O campo Silver é 7 OVR mais
forte que a dupla (46,7 × 39,5), enquanto no Bronze a dupla é 2,4 mais forte.
Isso é estrutura de população e banda Silver (bloco O, congelado), não o limbo.
Fica como candidato da próxima fase.

## 3. Estado da parceria (Bloco D) e commitment

Partidas do 1º ano por estado (Normal):

| | Estado | n | Easy | Medium | R1 | Total | jogador/parceiro/dupla/adversário |
|---|---|---|---|---|---|---|---|
| Balanced-E | A | 190 | 50,0 | — | 44,3 | 50,0 | 42,7 / 33,1 / 37,9 / 38,8 |
| | B | 73 | 39,7 | 0 (5) | 27,1 | 37,0 | 52,3 / 30,4 / 41,3 / 43,2 |
| | C | 0 | — | — | — | — | — |
| Conservative-E | A / B | 142 / 133 | 41,5 / 51,1 | — | 41,2 / 48,6 | 41,5 / 50,4 | |
| Hardcore-E | A / B | 182 / 102 | 46,7 / 60,6 | — | 43,1 / 47,1 | 46,7 / 58,8 | |

C fica vazio no 1º ano porque a troca efetiva acontece entre os dias 309 e 323
e o calendário termina antes de mais partidas. Complemento fora do escopo
estrito: nos 90 dias após a troca (Gold/Platinum), o WR foi 46,2% (13) no
Balanced-E, 50% (18) no Conservative-E e 40% (15) no Hardcore-E.

Limbo (renovação recusada até a troca efetiva):

| | |
|---|---|
| Balanced-E Normal | 5 recusas (1 por carreira); mediana **60 dias** (36–260) |
| Todas as carreiras | 27 recusas; mediana 64 dias |

**Commitment comprovado como problema? NÃO.**

| Condição pré-registrada | Resultado |
|---|---|
| Renovação recusada | ✓ |
| Atraso material (≥ 30 dias) | ✓ |
| WR no limbo materialmente pior que A **e** C | ✗ |
| Repete em ≥ 3 seeds | ✗ (0/5) |

O WR no limbo cai 13 pp só no Balanced-E. No Conservative-E e no Hardcore-E o
limbo foi *melhor* que A. A dupla B não é materialmente mais fraca que o campo
(−1,9 contra −0,9 em A). **Recomendação: do not touch commitment lifecycle.**

Achado registrado: na **seed 3** o parceiro recusou renovar no dia 49 e o
contrato venceu no dia 60. A dupla só trocou no dia 323 (260 dias de limbo, com
parceiro de 24–26 e jogador indo de 31 a 52). O harness só busca parceiro quando
não há parceria `ativa`; os torneios inscritos mantiveram a dupla ativa
(compromissos encadeados). É o caso que derruba Easy/R1 da seed 3 nos três
presets. O critério de 4 condições não o classifica como problema sistêmico, mas
é o candidato concreto se uma fase de lifecycle for aberta.

## 4. Qualidade do parceiro (Bloco E) — Balanced-E, medianas

| Marco | jogador | parceiro | melhor alcançável | gap | compat. | dupla |
|---|---|---|---|---|---|---|
| início | 22 | 33 | 16 | −17 | 82 | 27,5 |
| 3m | 36 | 33 | 34 | 1 | 79 | 34,5 |
| 6m | 47 | 34 | 82 | 48 | 73 | 40,5 |
| 9m | 55 | 35 | 91 | 56 | 68 | 45 |
| **1a** | 68 | **78** | **85** | 7 | 69 | 73 |
| 18m | 76 | 79 | 85 | 6 | 74 | 77 |
| 2a | 79 | 79 | 91 | 13 | 75 | 80 |

O mercado só oferece parceiros fortes a partir de ~6 meses. O parceiro forte
chega por volta do dia 320.

Normal ≠ Otimizador:
- 0/5 sequências iguais em cada preset;
- parceiro em 1 ano: Normal 78 × Otimizador 33.

Padrão "Normal escolhe parceiro obsoleto com alternativa forte": **0 casos de
escolha**. Os 3 casos de marco obsoleto (seed 3, um por preset) caem inteiros no
limbo da §3. A separação "escolha × limbo" foi introduzida **depois de ver os
dados**; o detector original marcava esses 3 casos.

**Defeito de harness achado (não do jogo):** o Otimizador mantém um parceiro de
~33 até 18 meses (jogador 57–62). A política dele renova só pela razão de OVR
(≥ 0,6), que a 5.27-G corrigiu apenas no Normal. Resultado: o Otimizador colapsa
no Y2 (Medium 9–13%, R1 Y2 0–7%, rank 2a ≈ 300). Os números competitivos do
Otimizador e do Casual (parceiro 24–26 até 2 anos) não medem o jogo. Nenhum gate
usa esses perfis para competição.

## 5. Táticas (Bloco F) e motor (Bloco G)

Táticas na matriz: 100% `equilibrado × equilibrado` (4.097 partidas, WR 37,5%).
Adaptação da IA: 0 partidas (OFF). Nenhuma tática mudou.

Motor antes da matriz (`engine-before/`): times idênticos 21/21, side swap 16/16,
energia 9/9 + aplicação única 5/5, neutralidade tática 13/13, side swap tático
4/4. Depois: dentro de `test-engine-parity-regression-v527h` (§11).

## 6. Ranking (Bloco H) e títulos (Bloco I) — Normal

| | Conservative-E | Balanced-E | Hardcore-E | Referência |
|---|---|---|---|---|
| Rank 6m | 648 | 669 | 675 | |
| Rank 1a | 310 | **279** | 286 | ~500–700 ⚑ |
| Rank 18m | 177 | 104 | 213 | |
| Rank 2a | 37 | **20** | 69 | ~150–300 ⚑ |
| Títulos Y1 (mediana) | 1 | **2** | 3 | 0–1 ⚑ |
| Títulos Y2 acumulado | 3 | 3 | 3 | 1–3 |
| Finais · semis (mediana) | 7 · 11 | 4 · 11 | 5 · 11 | |

Sinalizado, não reprovado: o Normal sobe mais rápido que a referência.

Fontes de pontos (Balanced-E Normal, média por carreira em 2 anos):

| Participação | Vitórias/avanço | Títulos | Outros (expiração) | Total |
|---|---|---|---|---|
| 147 | 1.015 | 436 | −134 | 1.463 |

Correção Gold+ da 5.27-F ativa: a derrota na R1 vale 1% do título
(`ranking-points-by-tier.csv`). Nenhum torneio Gold+ com 0 vitórias rendeu mais
que isso.

## 7. Economia (Bloco J) — Y1

| | Conservative-E | Balanced-E | Hardcore-E | Gate (Balanced-E) |
|---|---|---|---|---|
| Sponsor Y1 (mediana Normal) | 70,5 ✗ | **46,5** | 39,8 | ≤ 60 |
| Prize Y1 (mediana Normal) | 7,9 ✗ | **14,3** | 11,4 | ≥ 10 |
| Dívida Casual | 0% | **0%** | 0% | ≤ 20 |
| Dívida Normal | 0% | **0%** | 0% | ≤ 10 |
| Dívida Otimizador | 0% | 20% (1/5) | 40% (2/5) | — |

Eventos de dívida:
- Balanced-E Otimizador seed 3: pico 539, 28 dias, rescisão de técnico;
- Hardcore-E Otimizador seeds 2 e 3: picos 440 e 205, abertos no dia 730, despesa de técnico.

Todas as distribuições (média/mediana/P25/P75/min/máx/dp) estão em `stage1.json`
e `difficulty-per-career-dist.csv`.

## 8. Classificação dos presets (Bloco L)

| Preset | Classe | Hard gates que falharam |
|---|---|---|
| Conservative-E | **REJECT** | Sponsor Y1 70,5 > 60; Prize Y1 7,9 < 10 |
| Balanced-E | **REJECT** | R1 39,4 < 40 |
| Hardcore-E | **PREFERRED** (único VIABLE) | — |

## 9. Decisão

Pela regra pré-registrada:
- Balanced-E não é VIABLE, então o **Stage 2 não é liberado**;
- outro preset venceu, então a fase **para e reporta**;
- o default não foi trocado.

Para o usuário decidir, sem tuning nesta fase:
1. **Hardcore-E não é claramente melhor.** R1 +2 pp e Easy +4 pp estão dentro do
   ruído (dp por carreira 12–14 pp). O Hardcore-E tem Medium menor (37,1), Y2
   sem títulos e dívida do Otimizador em 40%. Trocar o default com base nesta
   matriz seria decidir pelo acaso das 5 seeds.
2. **O que separa o Balanced-E do gate é estrutural:**
   - limbo de 260 dias na seed 3 (lifecycle de compromisso + harness);
   - Silver mais difícil que Gold (população/banda Silver).

   Os dois blocos estavam congelados aqui e são os candidatos naturais da
   próxima fase.
3. **Antes de qualquer nova matriz,** corrigir a política do Otimizador no
   harness (renovação por mercado como o Normal v3). Senão Otimizador e Casual
   continuam medindo o harness.

## 10. Testes novos

Os 12 testes do Bloco R estão em `scripts/*-v527h.mjs`, rodados por
`scripts/run-tests-rebalance-527h.mjs`. Resultado: **11/12 verdes**.

O vermelho é `test-balanced-e-competition-gates-v527h`, com 4/5. É o **hard gate
de R1 (39,4% < 40%)** acusado de propósito: o teste recomputa os WR direto dos
runs e bate com o analisador. Não foi afrouxado.

Dois testes foram corrigidos depois da matriz. Os dois eram defeitos do próprio
teste, não do jogo:
- `test-stage1-…-completeness`: lia o total de `countStatuses` (é por estágio) → lê o estágio "1".
- `test-ranking-regression`: comparava os pontos pagos com a tabela crua do
  catálogo. Os pontos pagos ao jogador saem ~1,35× a tabela em todas as rodadas
  (título Gold 135, R1 1; Masters 675/7), e a regra da 5.27-F é de proporção.
  Agora compara com o título efetivamente pago. Nos 1.190 torneios Gold+ sem
  vitória, nenhum passa de ~1%. A saída no qualifying paga o mesmo que a derrota
  na R1 (sem incentivo invertido).

Evidência:
- `regressions.json` é a rodada completa (57/59; o 2º vermelho é a versão antiga
  do teste de ranking);
- `regressions-Novos_5_27_H.json` é a rodada final do grupo novo (11/12).

E uma separação do teste de qualidade do parceiro, também posterior aos dados: o
padrão de parceiro obsoleto foi dividido em "escolha" e "limbo" (§4).

## 11. Regressões, lint, build, diff-check

| Grupo | Resultado |
|---|---|
| 5.27-G (partner score, piso, Normal × Otimizador, compatibilidade, neutralidade, side swap tático) | 6/6 |
| 5.27-F (paridade, side swap, energia, aplicação única, força, monotonicidade, presets antigos, fontes de pontos, 0 vitórias) | 9/9 |
| 5.26-D (pares reais, elegibilidade, TeamRanking, draw imutável, sem fallback) | 12/12 |
| Motor de partida | 3/3 |
| Ranking (TeamRanking, virada de ano, Race) | 3/3 |
| Parceria (commitment, re-sign, ex-parceiro, ofertas) | 9/9 |
| Persistência (recompensas, save/load, storage Android) | 5/5 |
| **Total de regressões** | **47/47** |

Motor depois da matriz: idênticos 21/21, side swap 16/16, energia 9/9 + 5/5,
táticas 13/13 + 4/4. Igual ao "antes", sem regressão.

| | |
|---|---|
| `npm run lint` | verde |
| `npm run build` | verde |
| `git diff --check` | limpo (arquivos novos sem espaço no fim) |
| commit / push | nenhum |

Fallback sintético, mutação de draw comprometido, perda de recompensa e laço de
re-sign: 0 (regressões 5.26-D / Parceria / Persistência verdes; `resignLoopEvents`
= 0 nos 45 runs).

## 12. Recheck de determinismo

`balanced-e-casual-seed003-2y` foi rerodado **contínuo** (sem checkpoint) e
comparado com o resultado da matriz (8 retomadas). O outcomeHash é idêntico
(`0a501f1f…`). Arquivo: `determinism-recheck.json`.

## 13. Respostas (55)

1. Config congelada? **Sim**. semanticHash `c35b0cbf…`, 406 verificações, 0 diferenças.
2. Tuning durante o Stage 1? **Não**.
3. Carreiras rodadas: **45**.
4. Terminadas: **45**.
5. Falhas: **0**.
6. Resume? **Sim**: 360 retomadas de checkpoint (8 por carreira), 0 retentativas por crash.
7. Determinism mismatch? **Não**. 0 no manifest; contínuo = segmentado no recheck.
8. Conservative-E Easy: **46,2%** (Normal; todos os perfis 47,7%).
9. Balanced-E Easy: **47,3%**.
10. Hardcore-E Easy: **51,6%**.
11. Balanced-E Medium: **40,0%**.
12. Balanced-E Hard: **48,1%** (81 partidas).
13. Balanced-E R1: **39,4% ✗** (< 40%).
14. Bronze WR: **59,0%**.
15. Silver WR: **21,3%** (incoerente: abaixo do Gold).
16. Gold WR: **31,9%**.
17. Platinum WR: **44,9%**.
18. Gold qualifying: Normal **0 partidas**; todos os perfis 7,1% (28).
19. Gold main: **31,9%** (94).
20. Platinum qualifying: Normal 0% (1); todos os perfis 32,1% (81).
21. Platinum main: **45,2%** (155).
22. Easy Y1: **47,3%**.
23. Medium Y1: **0% (5 partidas)** — o Normal quase não joga Medium no Y1.
24. R1 Y1: **39,0%**.
25. Easy Y2: **sem partidas** (o Normal só joga Gold+ no Y2).
26. Medium Y2: **40,8%**.
27. R1 Y2: **39,7%**.
28. Parceiro OVR @3m: **33**.
29. @6m: **34**.
30. @9m: **35**.
31. @1a: **78**.
32. Melhor alcançável @1a: **85**.
33. Normal ainda difere do Otimizador? **Sim**: 0/5 sequências iguais; parceiro em 1 ano 78 × 33.
34. Renovações recusadas: **5** no Balanced-E Normal (1 por carreira); 27 em todas as carreiras.
35. Duração mediana do limbo: **60 dias** (36–260).
36. WR antes do limbo (A): **50,0%**.
37. Durante (B): **37,0%**.
38. Depois (C): 0 partidas no 1º ano; nos 90 dias após a troca, **46,2%** (13).
39. Commitment comprovado como problema? **Não**. A queda só aparece no
    Balanced-E; a dupla não é materialmente mais fraca que o campo; 0/5 seeds
    com sinal. Caso isolado: seed 3, limbo de 260 dias.
40. Rank Normal @6m: **669**.
41. @1a: **279** (⚑ à frente da referência de 500–700).
42. @18m: **104**.
43. @2a: **20** (⚑ à frente da referência de 150–300).
44. Títulos Y1: mediana **2** (⚑ referência 0–1).
45. Títulos Y2 acumulado: mediana **3**.
46. Sponsor share Y1: **46,5%** (mediana Normal).
47. Prize share Y1: **14,3%**.
48. Dívida Casual: **0%**.
49. Dívida Normal: **0%**.
50. Dívida Otimizador: **20%** (1/5; pico 539, 28 dias, rescisão de técnico).
51. REJECT: **Conservative-E** (sponsor 70,5%, prize 7,9%) e **Balanced-E** (R1 39,4%).
52. VIABLE: **Hardcore-E** (único).
53. PREFERRED: **Hardcore-E**. Pela regra 48: parar e reportar; default não
    trocado. A vantagem está dentro do ruído (§9).
54. Testes novos **11/12** (o vermelho é o hard gate de R1) · regressões
    **47/47** · lint ✓ · build ✓ · diff-check ✓ · commit ✗ · push ✗.
55. **VEREDITO: B. LIBERAR STAGE 2: NÃO.**

Critérios de A não atendidos:
- 7 (R1 ≥ 40%);
- 8 (Bronze/Silver/Gold coerentes: Silver 21% < Gold 32%);
- 28 só é atendido por um preset que não é o Balanced-E;
- 29 (um teste novo vermelho: o próprio gate de R1).

Todos os demais critérios (1–6, 9–27, 30–35) foram atendidos.

## Arquivos

`reports/rebalance-527h/`:
- relatório e dados: `REBALANCE_527H.md`, `frozen-config.json`, `jobs-manifest.json`, `stage1.json`, `preset-comparison.json`;
- CSVs: `difficulty.csv`, `difficulty-per-career-dist.csv`, `tiers.csv`, `rounds.csv`, `medium-breakdown.csv`, `qualifying-vs-main.csv`, `partnership-state.csv`, `commitment-limbo.csv`, `partner-quality.csv`, `ranking.csv`, `ranking-points.csv`, `ranking-points-by-tier.csv`, `titles.csv`, `economy.csv`, `sponsors.csv`, `prizes.csv`, `debt.csv`;
- evidências: `regressions.json`, `instrumentation-neutrality.json`, `determinism-recheck.json`, `engine-before/`;
- execução: `runs/` (45 envelopes com hash), `logs/`.
