# Paridade na escolha de parceiro e neutralidade tática — Playthrough 5.27-G

Branch `feature/live-coach-dynamic-adaptation`, HEAD `d5e5a2e` (inalterado). Sem
commit, sem push. Relatórios `rebalance-527`…`527f` preservados.

**Veredito: B.** Escolha de parceiro corrigida (Normal agora escolhe parceiros de
~78–82 em vez de ~38, sem virar Otimizador) e táticas neutralizadas (médias
43–55%, nenhum confronto fora de 30–70%). O **Medium passou: 36% (2 anos, 150
partidas, quase tudo de chave principal)**. Mas na matriz oficial de 3 seeds o
**Easy (38,9%) e o R1 (33,3%) do 1º ano ficaram abaixo do gate**. Com 3 seeds
extras (4–6, rodadas depois), o conjunto de 6 seeds dá Easy 48,7% e R1 40,5%. A
leitura de 6 seeds não substitui o gate definido; a decisão de liberar o Stage 1
fica com o usuário.

## 1. Escolha de parceiro

### Como o Normal escolhia

| Momento | Regra (política do harness) |
|---|---|
| 1ª dupla (vitrine) | aceita a oferta recomendada pelo jogo |
| Busca (todas as trocas) | **só compatibilidade** — força, ranking e custo com peso 0 |
| Renovação | renova se `OVR parceiro / OVR jogador ≥ 0,6` |

O pool da Busca só contém quem tem `interest.available` (regra do jogo de quem
aceita formar dupla); salário = OVR²/18 (≈ 450/mês para OVR 90, ~6–9% do caixa).
Os parceiros de 87–91 eram **alcançáveis e acessíveis**.

### Por que escolhia ~37–40

1. **Compatibilidade alta para parceiros fracos.** Lado, estilo e mão (75% da
   compatibilidade) favorecem parceiros fictícios de catálogo; nos 25 mercados, o
   mais compatível tinha mediana **OVR 39** (o que a tela e o motor mostram) com
   88–91 disponíveis. Ex. reais (dia 323): "Thiago Santos" e "Davi Ferreira",
   compatibilidade 84–87, jogando como 38, com um 91 de compatibilidade 68 no
   mesmo mercado.
2. **Bug de autoridade de OVR na compatibilidade.** O componente "nível" usava o
   `overall_rating` declarado do catálogo (65) em vez da média de atributos (38),
   que é a autoridade da UI e do motor (5.26-B). 61% dos candidatos fictícios têm
   o declarado ≥ 10 acima da força real (média +17). Corrigido em
   `src/players/teamCompatibility.js` (`ratingOf` → `baseOverallRating`). Sozinho
   muda pouco (o nível pesa 25%), mas fecha a divergência; mercado da IA e
   testes de parceria verdes.
3. **Renovação por razão de OVR.** Com parceiro ~33–35 e jogador crescendo 47→54,
   a razão continuou ≥ 0,6 e o Normal renovou duas vezes (dias 147 e 259): aos
   12 meses a diferença jogador−parceiro chegava a 25–34 pontos, com 79–84 no
   mercado.

### Política adotada (v3 = v2 + estes dois pontos, `PL527E_POLICY=v3`)

- **Busca**: `0,5 × compatibilidade + 0,4 × nível + 0,1 × custo`, onde "nível"
  penaliza 4 pontos por OVR abaixo do jogador e **não dá extra acima do nível**
  (quem decide entre parceiros do nível é a compatibilidade/custo), e "custo" =
  meses de salário que o caixa cobre (6 = 100) menos a divisão de prêmio acima de
  50% (`scripts/lib/v527gPartnerScore.mjs`).
- **Renovação**: só renova se o parceiro atual, na mesma pontuação, estiver a até
  10% do melhor candidato da Busca.
- Casual e Otimizador inalterados; vitrine inicial inalterada.

Candidatas testadas em 25 mercados (OVR da tela):

| Fórmula | OVR escolhido | Melhor | Razão | Perda de compat. | = Otimizador |
|---|---|---|---|---|---|
| Atual (só compatibilidade) | 39 | 89 | 0,45 | 0 | 0% |
| A 50/30/10/10 | 85 | 89 | 0,98 | 12 | 72% |
| B 40/40/10/10 | 85 | 89 | 0,98 | 12 | 76% |
| C 35/45/10/10 | 85 | 89 | 0,98 | 12 | 76% |
| **D (adotada)** | **82** | 89 | **0,94** | **8** | **9%** |

A–C usam força absoluta e ranking: viram o Otimizador. D mantém o Normal
diferente.

### Diferença jogador − parceiro (micro final, seeds 1–3)

| | 3m | 6m | 9m | 12m |
|---|---|---|---|---|
| gap | 4 / 6 / 12 | 13 / 15 / 21 | 20 / 24 / 26 | −16 / −13 / −20 |

A troca acontece por volta do dia 320: a renovação é recusada no dia 259, mas os
torneios comprometidos mantêm a dupla até ~2 meses depois (regra de compromisso
**não alterada**; possível 5.27-H).

## 2. Neutralidade tática

### Matriz antes (times idênticos, energia 100, lados estáticos, 10.000/célula)

Ordem de dominância estrita, crescente com o OVR: Defensivo > Tático >
Equilibrado > Agressivo > Potência. OVR 50 contra Equilibrado: defensivo 81,9 ·
tático 64,1 · agressivo 24,0 · potência 15,9. Extremos 0,5% / 99,4%.

### Causa: o mesmo traço aplicado várias vezes

- `RallyEngine`: `riskModifier` multiplica o risco da execução — mas a tática já
  muda o risco ao escolher golpes mais seguros/arriscados (risco-base por golpe:
  lob 6, smash 10).
- `DecisionEngine`: `+12` no peso dos golpes por **id** da tática, além dos
  multiplicadores `attackWeight`/`safeWeight` para os mesmos golpes.

Calibração (OVR 50): sem o risco da tática as médias caem para 43,6–55,6%; sem
risco e sem o +12 por id, 44,9–53,9%. Escalas parciais (risco a 25% ou 40%)
ainda deixavam confrontos em 19–25% / 75–83%.

### Correção mínima

- `RallyEngine`: `TACTIC_RISK_SCALE = 0` (o `riskModifier` deixa de multiplicar
  a execução).
- `DecisionEngine`: bônus de +12 por id removido (padrão 0).
- Pesos de golpe, consumo de energia e definições das táticas intactos; ganchos
  `__PL527F_TACTIC_RISK_SCALE`/`__PL527G_*` só para o harness reproduzir a antiga.

### Matriz depois (10.000/célula)

- Média por tática (OVR 35–80): **43,4–55,4%**; Equilibrado 50,0–51,0.
- OVR 50 contra Equilibrado: defensivo 53,1 · tático 50,3 · agressivo 47,4 ·
  potência 44,3. Extremos **38,5% / 61,6%**.
- Side-swap: |p(X>Y) + p(Y>X) − 100| ≤ 3 em todos os pares.
- Arquétipos (mesma média de atributos, só a forma muda): Defensivo rende 56–58%
  no perfil de defesa e 50% no de potência; Potência rende 47% no perfil de
  potência e 42–44% no de defesa; nenhum caso fora de 30–70%.

### Adaptação da IA

Medida com táticas neutras (A estático × B adaptativo, 4.000/célula): lado A
49,2 · 49,7 · 49,3 · **55,4%** (OVR 35/50/65/80). Em OVR 80 o efeito passa de
5 pp, e o jogador não tem autoridade equivalente (só ajuste manual ou sugestões do
live coach). **Permanece desligada por padrão.** Sem informação futura: usa só
placar, energia e smash do próprio time; não lê nem consome RNG.

### Energia dos bots (só documentado)

Os bots jogam com energia 100. Pela curva simétrica da 5.27-F, se jogassem a 90
o jogador com 100 venceria ~55% em OVR 50; a 80, ~60%.

## 3. Micro pós-5.27-G (Normal, política v3, seeds 1–3)

| | Easy | Medium | R1 | Bronze | Silver | Rank @1y | Sponsor Y1 | Prize Y1 |
|---|---|---|---|---|---|---|---|---|
| 5.27-F (ref.) | 42,9 | — | 37,5 | 52,4 | 23,5 | #311 | 50,4 | 12,8 |
| **balanced-e-v3, 1 ano** | **38,9** | — | **33,3** | 49,5 | 15,2 | #334 | 54,8 | 11,2 |
| conservative-e-v3 | 40,3 | — | 41,7 | 47,7 | 25,0 | #317 | 70,6 | 7,3 |
| hardcore-e-v3 | 49,7 | — | 42,1 | 61,9 | 14,0 | #285 | 42,2 | 11,8 |
| **balanced-e-v3, 2 anos** | 38,9 | **36,0** | 33,8 | 49,5 | 15,2 | — | — | — |

- **Medium 2 anos (chave principal domina)**: Gold qualifying 0 partida · Gold
  chave 28,6% (63) · Platinum qualifying 0% (1) · Platinum chave 41,9% (86).
  Parceiro mediano no 2º ano 79, time 76,5, campo 79.
- **Easy/R1 do 1º ano**: até o dia 259 as partidas são idênticas às da 5.27-F; a
  diferença está nas ~26–33 partidas Easy depois da recusa de renovação (54,5% →
  34,6%, mesmo parceiro ~35, adversários 40,5 → 45). Seeds 4–6 (extras): Easy
  57,4%, R1 48,3%; 6 seeds juntas: **Easy 48,7% (318 partidas), R1 40,5% (185)**.
- Ranking monitorado: rank @1y #285–334; 2 anos #239–309.

## 4. Testes e checagens

- **Testes novos**: 11/12 verdes; `test-micro-gate-post-partner-tactics-v527g`
  3/5 (Easy e R1 com 3 seeds).
- **Regressões** (`regressions.json`, 50/51 com o micro-gate): 5.27-F 7/7
  (paridade, side-swap, energia, aplicação única, pipeline, monotonicidade de
  ranking, congelamento de presets); torneio 5.26-D 12/12; motor 3/3; ranking
  3/3; parceria 9/9 (vitrine, compromisso, re-sign, ex-parceiro, save/reload,
  mercado da IA); persistência 5/5.
- Lint verde, build verde, diff-check limpo, sem commit, sem push.

---

## 55 itens

1. **Como o Normal escolhia?** Vitrine: recomendada; Busca: só compatibilidade;
   renovação: razão de OVR ≥ 0,6.
2. **Maior peso:** compatibilidade (100% na Busca).
3. **Por que OVR 37–40?** Compatibilidade alta (lado/estilo/mão) para fictícios
   que jogam como ~38, componente "nível" inflado pelo `overall_rating` declarado,
   e renovações que mantinham o parceiro inicial.
4. **87–91 eram alcançáveis?** Sim (pool só com `interest.available`; salário
   ~6–9% do caixa).
5. **Score adotado:** 0,5 compatibilidade + 0,4 nível relativo ao jogador
   (satura no nível dele) + 0,1 custo; renovação ≥ 90% do melhor da Busca.
6. **Compatibilidade:** 0,5.
7. **Força:** 0,4 (relativa ao nível do jogador).
8. **Ranking:** 0 (testado em A–C; levava ao comportamento do Otimizador).
9. **Custo:** 0,1.
10. **Normal = Otimizador?** Não (coincide em 9% dos mercados; A–C em 72–76%).
11. **OVR escolhido mediano antes:** 39.
12. **Depois:** 82 (offline); 78–82 nas buscas reais da micro.
13. **Melhor alcançável mediano:** 89.
14. **Gap antes/depois:** 50 → 7.
15. **Compatibilidade mediana antes/depois:** 87 → 79 (perda de 8).
16. **Diferença jogador−parceiro aos 3m:** 4 / 6 / 12.
17. **6m:** 13 / 15 / 21.
18. **9m:** 20 / 24 / 26 (aos 12m: −16 / −13 / −20, parceiro já mais forte).
19. **O compromisso ainda estende a relação?** Sim: contrato de 60 dias, renovação
    recusada no dia 259, troca efetiva ~dia 320.
20. **Ainda é problema?** Menor (atraso de ~2 meses); sinalizado para 5.27-H,
    sem alteração.
21. **Matriz tática antes:** dominância estrita Defensivo > Tático > Equilibrado >
    Agressivo > Potência, extremos 0,5–99,4%.
22. **Defensivo × Equilibrado:** 81,9% → 53,1% (OVR 50).
23. **Tático:** 64,1% → 50,3%.
24. **Agressivo:** 24,0% → 47,4%.
25. **Potência:** 15,9% → 44,3%.
26. **Maior média:** Defensivo (78,9% antes; 53,6% depois, OVR 50).
27. **Menor:** Potência (23,0% antes; 45,0% depois).
28. **Todas 40–60% em média?** Sim (43,4–55,4% em OVR 35–80).
29. **Algum confronto > 70%?** Não (máx. 61,6%).
30. **Algum < 30%?** Não (mín. 38,5%).
31. **Multiplicador duplicado?** Sim: risco por escolha de golpe × `riskModifier`,
    e +12 por id × multiplicadores de peso.
32. **Modificadores mudados:** `riskModifier` fora da execução; +12 por id
    removido. Pesos de golpe e energia intactos.
33. **Side-swap simétrico?** Sim (≤ 3 pp).
34. **Arquétipos respondem diferente?** Sim, de forma moderada (ver seção 2).
35. **Adaptação da IA reativada?** Não.
36. **—** (não reativada).
37. **Por quê?** Efeito de 5,4 pp em OVR 80 e jogador sem autoridade equivalente.
38. **IA usa informação futura?** Não.
39. **Energia dos bots continua 100?** Sim.
40. **Foi alterada?** Não (sensibilidade documentada).
41. **Gold qualifying WR:** sem partidas (0).
42. **Gold chave:** 28,6% (63 partidas).
43. **Platinum qualifying:** 0% (1 partida).
44. **Platinum chave:** 41,9% (86 partidas).
45. **Easy micro final:** 38,9% (3 seeds oficiais); 48,7% com 6 seeds.
46. **Medium:** 36,0% (2 anos).
47. **Hard:** 46,2% em 2 anos (amostra pequena).
48. **R1:** 33,3% (3 seeds oficiais); 40,5% com 6 seeds.
49. **OVR do parceiro na micro:** mediana 79 no 2º ano (≈35 no 1º, dupla inicial).
50. **Rank @1y:** #334 (balanced-e-v3).
51. **Sponsor/prize:** 54,8% / 11,2% (balanced-e-v3, 1º ano).
52. **População 700–1000 alterada?** Não.
53. **Testes/regressões:** novos 11/12; regressões verdes (50/51 com o micro-gate).
54. **Lint/build/diff-check/commit/push:** verde / verde / limpo / sem / sem.
55. **VEREDITO: B.**

## Arquivos

`partner-score-baseline.csv`, `partner-score-candidates.csv`,
`partner-score-compatfix.csv`, `partner-selection-results.csv`,
`partner-gap-over-time.csv`, `tactic-matrix-before.csv`, `tactic-matrix-after.csv`,
`tactic-archetypes.csv`, `tactic-side-swap.csv`, `ai-adaptation.json`,
`medium-breakdown.csv`, `micro-post-527g.json`, `regressions.json`.
Scripts: `analyze-partner-markets-v527g.mjs`, `sample-partner-markets-v527g.mjs`,
`run-tests-rebalance-527g.mjs`, `lib/v527gPartnerScore.mjs`.
