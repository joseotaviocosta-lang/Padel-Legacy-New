# Paridade do motor de partida e auditoria de ranking por participação — Playthrough 5.27-F

Branch `feature/live-coach-dynamic-adaptation`, HEAD `d5e5a2e` (inalterado). Sem
commit, sem push. Relatórios `rebalance-527`…`527e` preservados (só lidos).

**Veredito: B.** O motor foi corrigido e aprovado (times idênticos ~50/50,
side-swap simétrico, curva de energia gradual) e o ranking foi auditado,
decomposto e ajustado de forma mínima. O micro-gate passa em **Easy (42,9%)** e
**R1 (37,5%)**, mas **falha em Medium (18,2% com 137 partidas; ~2–5% na chave
principal de Gold/Platinum)**. Pela regra da fase, o Stage 1 continua bloqueado.

## 1. Motor de partida

### Assimetria reproduzida (harness puro, times idênticos, energia 100)

| OVR | Lado do jogador (A) |
|---|---|
| 35 | 42,6% |
| 50 | 40,3% |
| 75 | 87,8% |

`scripts/engine-parity-v527f.mjs`: só `createMatch/playPoint` reais, atributos
uniformes, ids e personalidades novos a cada partida nos dois lados.

### Causa raiz (provada por eliminação)

Com táticas iguais e **estáticas** dos dois lados, e sem o `_energyPenalty`
exclusivo do jogador, os times idênticos dão **49–51% em todos os OVRs e
energias**. O núcleo do rally (inclusive quem saca primeiro) é simétrico. As
assimetrias vinham de três pontos fora dele:

1. **IA tática só no lado B, com táticas não neutras.** Medido estático contra
   `equilibrado`, OVR 50: defensivo 88,5% · tático 67,1% · agressivo 18,3% ·
   potência 8,1%. O bot começa em `tatico` quando o smash médio é < 67 (lado B
   +8 pp em OVR 35–50) e em `potencia` quando é ≥ 67 (lado B −38 pp em OVR 75),
   e vai a `defensivo` quando está na frente.
2. **Energia aplicada duas vezes, só para o jogador.** O modal monta
   `_energyPenalty` (−2/−5/−10 no OVR), e o `RallyEngine` aplica de novo
   `(100−e)×0,12` por golpe.
3. **Escala da energia e da confiança sem a inclinação calibrada.** A
   habilidade é comprimida (`50 + (atributo−50)×0,2`), mas energia e confiança
   não eram: 10 pontos de energia valiam 6 de OVR (E90×E100 com times iguais =
   24%; E60 = 0,2%).

### Correções mínimas aplicadas

| Arquivo | Mudança |
|---|---|
| `src/engine/match/playerModel.js` | `_energyPenalty` não altera mais o OVR (a energia continua entrando por golpe). |
| `src/engine/match/RallyEngine.js` | Energia e confiança na mesma inclinação da habilidade (`CONDITION_SLOPE = 0.2`). |
| `src/engine/match/MatchEngine.js` | Troca automática de tática do adversário desligada por padrão (`opponentAdaptive`, só `true` explícito liga; partidas salvas sem o campo também ficam em paridade). |

Sem bônus ao jogador, sem nerf global de bots, sem mudar bracket, sorteio ou
pontos de rally. Os globais `__PL527F_*` existem só para o harness comparar com
a fórmula antiga.

### Aceitação (10.000 partidas por célula, IC95 ±1 pp)

- **Times idênticos** (6 OVRs × 4 energias iguais): **47,9–50,4%**
  (`engine-identical-teams.csv`).
- **Side-swap**: somas p(A>B) + p(B>A) entre **96,7% e 100,4%** (desvio máximo
  de 3,3 pp, em OVR 20); OVR 45×50 = 28,4/71,1 (`engine-side-swap.csv`).
- **Curva de energia** (lado com menos energia × 100; `energy-curve.csv`):

| OVR | E90 | E80 | E70 | E60 | E50 | E40 |
|---|---|---|---|---|---|---|
| 20 | 44,5 | 41,1 | 38,1 | 36,3 | 33,8 | 30,6 |
| 50 | 44,7 | 39,8 | 34,1 | 29,9 | 26,4 | 23,0 |
| 85 | 41,2 | 33,8 | 26,9 | 21,7 | 18,3 | 15,4 |

Monotônica e gradual (máx. ~7 pp por −10 de energia). A energia continua
importante e pesa mais em nível alto.

### Dívidas de design registradas (não corrigidas nesta fase)

- **Táticas não neutras**: há uma tática dominante (Defensivo ~88% contra
  Equilibrado com times iguais). O jogador pode explorar isso; a adaptação da
  IA só deve voltar quando as táticas forem neutras.
- **Estado do adversário**: o snapshot da chave não leva energia, moral nem
  atributos, então os bots jogam com energia 100 e confiança 70. Os atletas do
  mundo têm `energy`/`morale` no perfil (mediana de energia 75), mas isso não
  chega à partida. O jogador leva estado real (moral 100 vale +4 de OVR na nova
  escala).

## 2. Ranking por participação

### Pontos por origem (tabela real do catálogo)

| Tier | Derrota R1 | 1ª vitória | Título |
|---|---|---|---|
| Bronze | 1 | 2 | 10 |
| Silver | 2 | 5 | 25 |
| Gold | 5 | 9 | 100 |
| Platinum | 9 | 18 | 200 |
| Masters | 23 | 45 | 500 |
| Elite | 45 | 90 | 1.000 |
| Crown | 90 | 180 | 2.000 |

Derrota no qualifying vale 0 ponto.

### Carreira de 0 vitórias (1 ano, calendário real, política v2)

Vitórias fixadas pelo harness com `PL527F_FORCED_WR`; o motor real joga.
Resultado: 31 torneios, 46 pontos, **#1001 → #464**.

| Contrafactual | Rank | Posições ganhas |
|---|---|---|
| Só os pontos do jogador (mundo congelado no dia 1) | #823 | 178 |
| Só o movimento do mundo (jogador com 0 ponto) | #658 | 343 |
| Real | #464 (recalculado #493) | 508 |

**A maior parte vem do mundo**: atletas com pontos caem de 1.000 para 657 em um
ano e a mediana de pontos de 199 para 51 (os pontos semeados expiram e a base
da IA não os repõe). A participação do jogador nos tiers de entrada é modesta.
Causa documentada; a curva de população fica fora do escopo (item 58).

### Inflação comprovada nos tiers altos

Na micro de 2 anos pós-motor, o jogador subia sem vencer por derrotas cada vez
mais caras: Masters R1 = 23 pontos, quase um título de Silver. Ia de
#317–405 (1 ano) a **#52–142 (2 anos)** com 0–1 vitória em ~37 partidas Gold+,
com time de 52–66 contra campos de 75–81.

**Ajuste aplicado** (autorizado; item 42), só nos presets -E, simétrico para IA
e jogador: a derrota na 1ª rodada dos tiers com corte (Gold+) passa a valer 1%
do título. Gold 5→1, Platinum 9→2, Masters 23→5, Elite 45→10, Crown 90→20.
Vitórias, rodadas finais, títulos, Bronze/Silver, moedas e XP ficam intactos
(`circuitCatalog.buildRankPointsTable`, `ENTRY_COMPETITION_527E.gatedFirstRoundLossPointsRatio`).

### Monotonicidade (mesma carreira, 1 ano, vitórias fixadas)

| WR alvo (real) | Antes | Depois | Títulos (depois) |
|---|---|---|---|
| 0% (0%) | #464 | #411 | 0 |
| 25% (25,6%) | #407 | #359 | 0 |
| 50% (42%) | #313 | #267 | 2 |
| 75% (70,8%) | #163 | **#55** | 8 |

Sem inversões, e o mérito agora separa mais. Na micro de 2 anos pós-ajuste o
rank para de disparar: #214–309 em vez de #52–142.

## 3. Micro-gate pós-motor (Normal, seeds 1–3, política v2)

| | Easy | Medium | R1 | Bronze | Silver | Gold | Rank @1y | Sponsor Y1 | Prize Y1 |
|---|---|---|---|---|---|---|---|---|---|
| 5.27-E (ref.) | 30,1 | — | 32,6 | 41 | 15 | — | #395 | 58,7 | 10,9 |
| pós-motor, 1 ano | 40,6 | — | 38,5 | 47,5 | 27,8 | — | #327 | 51,5 | 13,6 |
| **pós-ajuste, 1 ano** | **42,9** | — | **37,5** | 52,4 | 23,5 | — | #311 | 50,4 | 12,8 |
| pós-ajuste, 2 anos | 47,0 | **18,2** | 22,0 | 55,8 | 29,1 | 4,7 | — | — | — |

Outros presets -E (pós-ajuste, 1 ano): conservative-e Easy 43,6 / R1 43,8
(sponsor 70,6%, prize 7,3%); hardcore-e 44,7 / 44,2 (sponsor 45%, prize 11,4%).
Nenhuma dívida em 9 carreiras.

**Medium falha.** Os 18,2% vêm quase todos do qualifying de Platinum (24,5% no
geral × **1,9% na chave principal**); na chave principal de Gold o jogador vence
4,7%. Causa medida: time de 54–65 contra campos de ~76. Nas seeds 1–2 o Normal
segue com parceiro de OVR ~37–40, porque na **busca** (após a 1ª dupla) a
política v2 escolhe por compatibilidade, enquanto o mercado oferece parceiros de
87–91 (que o Optimizer pega). Na seed 3, com parceiro 66, foram 18 vitórias em
56 partidas Gold+. Mudar a política está fora desta fase (item 51).

Hard: 4 partidas em 2 anos (amostra insuficiente).

## 4. Testes, regressões e checagens

- **Testes novos (12)** — 11 verdes; `test-micro-gate-post-engine-v527f` 7/8
  (falha o Medium, pelo motivo acima).
  - Motor: times idênticos 21/21 · side-swap 16/16 · sensibilidade de energia
    9/9 · aplicação única 5/5 · paridade de pipeline 7/7 · premissa de energia
    dos bots 3/3.
  - Ranking: 0 vitória 4/4 · pontos por origem 9/9 · decomposição 9/9 ·
    monotonicidade 4/4.
  - Balanço: congelamento semântico dos presets antigos 6/6.
- **Regressões** (`regressions.json`): torneio 5.26-D 12/12; motor (integridade,
  live coach, autoridade de resultado); ranking (rollover, reset da Race, soma do
  TeamRanking, troca de dupla, snapshots históricos, janela de expiração);
  parceria (primeira dupla, re-sign, integridade de ofertas); persistência
  (atomicidade, restart, missões, boot sem escrita, storage); presets 5.27-B.
  Todas verdes.
- **`test-no-balance-mutation-v527d` substituído** por
  `test-old-presets-semantic-freeze-v527f`: o hash de arquivo quebrava com
  qualquer acréscimo (os presets -E); o novo compara valores. Os presets antigos
  e o `balanceHash` estruturado continuam idênticos aos da 5.27-D.
- Lint verde, build verde, diff-check limpo, sem commit, sem push.

---

## 50 itens

1. **Assimetria reproduzida?** Sim.
2. **WR com times idênticos, OVR 35:** 42,6%.
3. **OVR 50:** 40,3%.
4. **OVR 75:** 87,8%.
5. **Lado favorecido:** o adversário (B) em OVR baixo/médio; o jogador (A) em
   OVR alto.
6. **Por quê?** Tática adaptativa só no lado B, com táticas não neutras
   (`tatico` < 67 de smash, `potencia` ≥ 67, `defensivo` quando à frente), mais
   o `_energyPenalty` só do jogador.
7. **Energia aplicada quantas vezes?** Duas na força (OVR do jogador + por
   golpe), e a por golpe sem a inclinação calibrada.
8. **Intencionais?** O conceito sim (energia reduz desempenho); a duplicação e a
   escala não (a compressão foi aplicada à habilidade e esquecida em
   energia/confiança).
9. **O que foi corrigido?** `_energyPenalty` fora do OVR; energia/confiança ×0,2;
   adaptação tática da IA desligada por padrão.
10. **Fórmula da partida mudou em quê?** Coeficiente de energia/confiança na
    execução (×0,2), OVR do jogador sem `_energyPenalty`, sem troca automática
    de tática do adversário.
11. **Times idênticos final:** 47,9–50,4%.
12. **Side-swap final:** soma 96,7–100,4%.
13. **E100 × E100:** 49,6% (OVR 50).
14. **E80 × E100:** 39,8% (OVR 50; 33,8–41,1% conforme o OVR).
15. **E60 × E100:** 29,9% (21,7–36,3%).
16. **E40 × E100:** 23,0% (15,4–30,6%).
17. **Energia continua importante?** Sim.
18. **O penhasco sumiu?** Sim (antes: E90 = 24%, E60 = 0,2%).
19. **Bots usam energia cheia?** Sim (100, confiança 70; o snapshot não leva
    estado).
20. **Isso foi alterado?** Não; registrado como dívida de design.
21. **Rank da carreira de 0 vitórias:** #1001 → #464 (1 ano).
22. **Pontos sem vitória:** 46.
23. **Componentes:** só derrotas na 1ª rodada (Bronze 19 torneios / 19 pts;
    Silver 12 / 36 — média 3, porque chaves com menos inscritos usam a tabela
    de menos rodadas); 0 de qualifying, 0 de vitória/título.
24. **Subida vinda do jogador:** 178 posições (#1001 → #823, mundo congelado).
25. **Subida vinda do mundo:** 343 posições (#1001 → #658 com 0 ponto).
26. **Tier que mais inflava participação:** Masters (R1 = 23 pts ≈ título de
    Silver), seguido de Platinum/Elite/Crown na mesma proporção.
27. **Qualifying inflava?** Não nos pontos (derrota = 0); sim nas estatísticas de
    WR (Gold e Platinum agregados).
28. **Participation points mudaram?** Sim, só derrota na R1 dos tiers com corte,
    só nos presets -E.
29. **Em quais tiers?** Gold 5→1, Platinum 9→2, Masters 23→5, Elite 45→10,
    Crown 90→20.
30. **Pontos de título/vitória mudaram?** Não.
31. **Race mudou?** Fórmula e reset não; o valor da derrota na R1 em Gold+ (que
    também alimenta a Race) caiu nos presets -E. Regressões de reset e rollover
    verdes.
32. **World mudou?** Fórmula/janela não; idem item 31 para o valor da derrota
    na R1 em Gold+.
33. **TeamRanking mudou?** Não (soma de pontos individuais; testes verdes).
34. **Rank de 0 vitórias após a correção:** #411 (1 ano).
35. **25% WR:** #359.
36. **50% WR:** #267.
37. **75% WR:** #55.
38. **Progressão monotônica?** Sim (antes e depois).
39. **Presets antigos mantiveram valores?** Sim (congelamento semântico 6/6;
    `balanceHash` idêntico).
40. **Por que o teste de hash foi substituído?** O hash de arquivo quebrava com
    qualquer acréscimo (os presets -E); o novo teste compara os valores.
41. **Easy micro final:** 42,9% (1 ano; 47% em 2 anos).
42. **Medium:** 18,2% (2 anos, 137 partidas; chave principal Gold 4,7% /
    Platinum 1,9%); N/A em 1 ano.
43. **Hard:** amostra insuficiente (4 partidas em 2 anos).
44. **R1:** 37,5% (1 ano).
45. **Bronze/Silver/Gold:** 52,4 / 23,5 / — (1 ano); 55,8 / 29,1 / 4,7 (2 anos,
    chave).
46. **Rank @1y micro:** #311.
47. **Prize/sponsor micro:** 12,8% / 50,4% (balanced-e).
48. **Testes/regressões:** 11/12 novos (falha o micro-gate no Medium);
    regressões verdes.
49. **Lint/build/diff-check/commit/push:** verde / verde / limpo / sem / sem.
50. **VEREDITO: B.**

## Próxima fase sugerida

- Força do time do Normal nos tiers médios: a busca de parceiro da política v2
  pesar força além de compatibilidade (o mercado oferece 87–91).
- Neutralidade das táticas (só então reativar a adaptação da IA).
- Estado real do adversário (energia/moral do perfil) — decisão de design.
- Curva de população 700–1000 (esvaziamento da base do World).
