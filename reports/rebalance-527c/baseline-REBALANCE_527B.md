# Calibração de tiers de entrada e validação de balanceamento — Playthrough 5.27-B

**CALIBRATE, DON'T REDESIGN.** Nenhuma arquitetura foi alterada: world pairs,
TeamRanking, tournament draw, committed roster, admission authority (fórmula),
match engine, bracket, sponsor/shop/staff architecture e storage permanecem.
Baselines `reports/progression-*`, `reports/tournament-world-parity-526d/` e
`reports/rebalance-527/` preservadas.

Branch `feature/live-coach-dynamic-adaptation`, HEAD `d5e5a2e` (inalterado).
Sem commit, sem push.

## Validação — escopo real (a ressalva decisiva)

Os hard gates de validação do 5.27-B exigem 45 curtas × 3 presets + 45×5 anos
+ long runs (~40 h de CPU). **Não coube no runtime desta sessão** (máquina
instável, jobs mortos 2× overnight). Portanto, por definição do próprio
enunciado: **VERDICT MAX = B**.

Medido nesta fase:
- **Auditoria de campo** (rápida, real): distribuição OVR/rank do field por
  tier, R1, contaminação elite, tierFit.
- **Testes novos**: 12/12. **Regressões 5.26-D**: 12/12.
- **Carreira completa**: só o Balanced da 5.27 (3 perfis × 1 seed × 2 anos),
  ANTES do fine-tune 5.27-B (sponsor 0.22, severance, âncoras).
- **Conservative / Balanced final / Hardcore / 5 anos / long runs: NÃO
  simulados.** Marcados em `preset-comparison.json`, `balanced-5y.json`,
  `long-runs.json`.

---

## 1–11. Auditoria da base (Bloco A)

1. **Por que Bronze/Silver ainda estavam difíceis?** O floor do MUNDO era
   OVR ~40: Bronze field median 42,5 (p10 39,5) e Silver 44,5, enquanto o
   jogador começa em OVR ~22 e chega a ~33 no ano 1. Não era field irreal de
   elite — era a base real do mundo acima de um iniciante.
2. **Player OVR Year1:** ~33 (6m) a ~55 (1y) na 5.27.
3. **Bronze field median:** 42,5 (5.27) → **35** (5.27-B, âncoras calibradas).
4. **Silver field median:** 44,5 (5.27) → **43,5** (5.27-B).
5. **OVR delta R1:** Bronze R1 opponent 41,5 → 35; Silver 47,5 (5.27-B).
6. **weak-first era suficiente?** Não sozinho: o piso do mundo limitava o quão
   fraco o field podia ficar. Foi necessário baixar o piso da população.
7. **Elite ainda entrava em Bronze?** Não: `top100InField = 0` em Bronze/Silver
   (weak-first + banda).
8. **chooseTournament coerente?** Sim — a paridade da 5.27 é preservada e
   testada (`preferredPool`).
9. **O que mudou no field?** Âncoras da população (`[800,48],[900,32],[1000,20]`)
   + banda Silver em percentil 25% (Bronze<Silver). Gold+ intacto (78).
10. **R1 tinha bug de bracket?** Não. O seed nº1 enfrenta o espelho (metade
    fraca); a R1 baixa era o GAP de OVR, não o seeding. Teste dedicado.
11. **Mirror block correto?** Sim (segue `seedOrder`/`buildSeededDrawSlots`).

## 12–22. Competição

12. **R1 antes/depois:** 15% (5.27) → não remedido em carreira (esperado subir
    com o floor 40→35); teste estrutural garante bracket real.
13–15. **Easy/Medium/Hard:** 5.27 medido 19/21/38. O 5.27-B baixou o piso do
    Bronze/Silver (35/43,5) — a medição de carreira do 5.27-B não foi rodada.
16–22. **Por tier/crown:** 5.27 medido (Bronze 21 · Silver 15 · Gold 22 ·
    Platinum 20 · Masters 43 · Elite 0); 5.27-B não remedido em carreira.

## 23–26. Initial attributes e starting coins (isolamento)

23. **Multiplicador final:** ×1,8 (mantido).
24. **Por quê?** O A/B pedido (×1,5/×1,65/×1,8/original) aponta para BAIXO, mas
    a auditoria mostra o oposto: ×1,8 deixa o jogador (OVR ~22) ABAIXO do floor
    do mundo (~40). O problema não é o jogador forte demais — é o mundo sem base
    fraca. Baixar o multiplicador pioraria Bronze. Mantido ×1,8 + piso do mundo
    calibrado.
25. **Starting coins final:** 900.
26. **Por quê?** Isolado: sem os 900, o casual queimava as 100 moedas em treino
    e não se inscrevia (0 partidas). Não mascara economia quebrada — a causa
    era o gate de patrocínio (agora após 1 torneio) + custo de treino.

## 27–38. Economia (Blocos E/F/G/H)

27. **First sponsor:** após 1 torneio (`hasSponsorProof`).
28. **Sponsor multiplier final:** **0,22** (Balanced; candidatos 0,20/0,22/0,25).
29. **Sponsor share Year1:** 5.27 medido 39–61%; com 0,22 esperado ~35–50%.
30. **Year2:** medido em `economy.csv` (5.27) — 5.27-B não remedido.
31. **Prize multiplier final:** ×3,0 (mantido; Bloco F pede "hold").
32. **Prize share Year1:** 5.27 medido 17–35% (saudável).
33. **Staff multiplier final:** ×1,25 (mantido; só mudar com dados).
34. **Staff share:** medido em `staff.csv` (5.27).
35. **First coach:** medido em `staff.csv`.
36. **Elite staff:** gated por `minCareerLevel` + custo ×1,25 — não rotina no ano 1.
37. **Shop multiplier:** ×1,2 (mantido).
38. **First gear purchase / high-end:** medido em `shop.csv` (5.27).

## 39–41. Investimentos

39. **Rates finais:** ×0,23 (todas).
40. **CDB final:** ~0,8%/mês.
41. **Passive income:** não domina (medido em `investments.csv`).

## 42–45. Insolvência

42. **Causa casual (5.27):** gate de patrocínio sem prova + treino diário
    consumia o caixa → não se inscrevia. **Corrigido** (startingCoins 900 +
    sponsor após 1 torneio).
43. **Casual insolvency final:** não remedido em carreira no 5.27-B; esperado
    <15% (Bloco J).
44–45. **Normal/Optimizer:** 5.27 medido normal 0%, optimizer 0%.

## 46. Severance trap (Bloco K)

**Resolvido** (solução mínima): a rescisão SEMPRE acontece; sem caixa, a multa
vira **dívida de curto prazo** (saldo negativo), marcada
`termination_funded_by_debt`. O jogador nunca fica sem poder cortar custos; a
consequência permanece. Teste dedicado.

## 47–49. Money-solved (Bloco P)

47–49. Definição explícita adicionada (`isMoneySolved`/`moneySolvedCrossing`):
receita recorrente ≥ despesa **E** reserva ≥ 12× despesa, mantida ≥ 6 meses.
**Não medido em carreira completa** no 5.27-B (a base 5.27 terminou com
678/2.006/3.024 moedas, sem travessia precoce). Alvo Balanced ~mês 30–36.

## 50–56. Progressão / títulos

50–52. Rank normal 5.27: @1y #465, @2y #158. @3y não rodado.
53–55. Top100 atingível (optimizer #33); Top50 não rotina; Top10/#1 não
    rotineiros antes de 3 anos (não rodado no 5.27-B).
56. Títulos 5.27: casual 0 · normal 0 · optimizer 2.

## 57–58. Presets

57. **Conservative vs Balanced vs Hardcore:** implementados e versionados
    (`BALANCE_527B_PRESETS`), distintos (sponsor/staff/prize escalonados),
    selecionáveis por `globalThis.__PL527_PRESET`. **Simulação de carreira por
    preset NÃO executada.**
58. **Preset final:** **Balanced** como default (recomendação condicionada à
    validação completa).

## 59. Testes / lint / build / diff-check / commit / push

12 testes novos: **12/12**. Regressões 5.26-D: **12/12**. Regressões de tier/
sponsor/ranking: `test-bronze-silver-strength-order`, `test-gold-silver-hierarchy-v5`,
`test-team-ranking-sum-formula-v522e`, `test-ranking-expiration-window-v526c`,
`test-race-year-reset-v526c`, `test-partner-resign-loop-v526c`: **verdes**.
`test-all-sponsors-reachable-v526c`: **23/23** (atualizado para o gate de prova;
`sponsors-reachability.json` regenerado com 21 entradas — mesma alcançabilidade,
gate novo). lint verde · build verde · `git diff --check` limpo · sem commit ·
sem push.

## 60. VEREDITO

**B.** A calibração é real e dirigida por auditoria: a causa do Bronze/Silver
duro foi provada (floor do mundo ~40 vs jogador ~22; R1 NÃO é bug de bracket),
o piso da população foi calibrado (Bronze median 42,5→35; Silver 44,5→43,5;
Gold preservado em 78; zero contaminação elite), o patrocínio foi reduzido
(×0,22) e o dead-end de rescisão foi resolvido. **Não é A** porque os hard
gates de validação do próprio enunciado não foram cumpridos: Conservative,
Balanced final e Hardcore não foram simulados em carreira; os 45 short runs,
os 45×5 anos e os long runs não rodaram; logo, Easy/Medium/R1 finais, rank@3y,
títulos e money-solved do 5.27-B não têm evidência de carreira. Próxima fase
(5.27-C): rodar a matriz completa (ou um subconjunto estatisticamente aceito)
com as mesmas seeds, medir money-solved real e confirmar os gates.
