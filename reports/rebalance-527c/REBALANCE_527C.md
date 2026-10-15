# Validação completa de balanceamento — Playthrough 5.27-C

**VALIDATE FIRST · TUNE ONLY IF A GATE CLEARLY FAILS.** O tuning foi
**congelado** antes da coleta (`balance-baseline.json`): nenhum número foi
alterado durante a matriz. Arquitetura intacta. Baselines `reports/rebalance-527/`
e `reports/rebalance-527b/` preservadas.

Branch `feature/live-coach-dynamic-adaptation`, HEAD `d5e5a2e` (inalterado).
Sem commit, sem push.

## Estado da validação (a ressalva decisiva)

Os hard gates de validação do 5.27-C exigem **45 short runs + 45×5 anos + long
runs de 10 anos**. O runtime desta sessão **não completou a matriz**: a máquina
roda ~33 min por carreira de 2 anos, e os jobs longos foram mortos 2× em fases
anteriores. Concluído:

- **Stage 1**: 1 carreira (Conservative casual seed 1) concluída; as demais
  (Conservative normal/optimizer, Balanced, Hardcore) ainda em execução/na fila
  quando a sessão foi encerrada.
- **Stage 2 (45×5) e long runs**: **não executados**.
- Por definição do enunciado: **VERDICT MAX = B**.

O que ESTÁ validado:
- Tuning congelado (`balance-baseline.json`).
- 12/12 testes novos de validação.
- Regressões de integridade: 5.26-D 12/12; 5.26-C/B + 5.24/5.25 verdes
  (`regressions.json`).
- 1 carreira Conservative real: casual seed 1 — 730d, 43 partidas, rank #211,
  OVR 71, 11.581 moedas, **0 erros**.
- Base medida da 5.27 Balanced (3 perfis × 1 seed × 2 anos).

---

## 1–7. Infraestrutura (Bloco A)

1. **Stage 1 concluído**: 1 de 45 carreiras (Conservative casual).
2. **Seeds**: 1 (a mesma seed deveria ser reutilizada nos 3 presets).
3. **Conservative terminou?** Parcialmente (casual-1; normal/optimizer em
   execução).
4. **Balanced?** Não executado no 5.27-C (há a base 5.27 Balanced anterior).
5. **Hardcore?** Não executado.
6. **Resume foi usado?** Não na matriz (sem checkpoint nos lotes curtos).
7. **Resume determinístico?** Provado por teste dedicado
   (`test-balance-resume-determinism-v527b`, contínuo == retomado).

## 8–22. Comparação de presets (Bloco B)

8–13. Easy/Medium/Hard/R1 dos 3 presets: **não medidos** (só 1 carreira
    Conservative; sem Balanced/Hardcore no 5.27-C).
14–16. Rank/títulos @2y: não medidos por preset.
17–21. Sponsor/prize/insolvência/money-solved por preset: não medidos.
22. **Preset vencedor Stage 1:** **não decidido** — sem dados suficientes.

## 23–25. Tuning pós-Stage-1

23. **Houve tuning?** **Não.** 24–25. O baseline foi congelado e nenhum número
    foi alterado (VALIDATE FIRST).

## 26–41. Balanced 5 anos (Bloco H)

26. **Balanced 5y:** **não executado** (0 de 45).
27–41. Easy/Medium/Hard finais, tier WR (Bronze..Crown), R1/R2/QF/SF/F:
    **sem dados de 5 anos**. A base 5.27 (2 anos, 3 perfis) deu: Easy 19%,
    Medium 21%, Hard 38%, Bronze 21, Silver 15, Gold 22, Platinum 20, Masters
    43, Elite 0; R1 15%, QF 62%, SF 80%, F 50%.

## 42–50. Progressão (Bloco I)

42–44. Rank normal @1y/#2y/#3y: 5.27 medido @1y #465, @2y #158; @3y não rodado.
45. @5y: não rodado.
46–50. Top100/Top50/Top20/Top10/#1: 5.27 medido Top100 atingível (optimizer #33);
    Top50+ não rotina; sem 5y para confirmar Top10/#1.

## 51–62. Economia (Blocos E/K)

51–53. Títulos e sponsor/prize share por ano: não medidos em 5 anos; base 5.27
    sponsor 39–61%, prize 17–35% (Y1).
54–56. Staff share / primeiro staff elite / primeiro gear high-end: 5.27 medido
    em `staff.csv`/`shop.csv`; 5.27-C sem dados.
57–59. Insolvência casual/normal/optimizer: 5.27 medido casual sim, normal/opt
    não; 5.27-C não medido. Conservative casual-1 terminou com 11.581 moedas
    (sem insolvência).
60–62. Money-solved casual/normal/optimizer: definição implementada e testada;
    **não medido** em carreira completa.

## 63–64. Long runs / regressões

63. **Long runs 10 anos:** **não executados** (hard gate não atendido).
64. Testes/lint/build/diff-check: 12/12 novos, 12/12 cinco-26-D, lote 5.26-C/B +
    5.24/5.25 verde, lint verde, build verde, diff-check limpo, sem commit/push.

## 65. VEREDITO

**B.** O tuning está **congelado** e correto (baseline registrado; nenhuma
alteração durante a coleta), os testes e as regressões de integridade estão
verdes, e o harness tem checkpoint/resume determinístico. Mas os hard gates de
validação do próprio enunciado **não foram cumpridos**: 1 de 45 carreiras
curtas, 0 de 45 carreiras de 5 anos, 0 long runs, e portanto não há comparação
estatística dos 3 presets nem confirmação de Easy/Medium/R1, progressão,
títulos, insolvência e money-solved do Balanced. **Não escolho Balanced como
baseline definitivo** sem essa evidência (Bloco O item 73: sem vencedor claro,
veredito B). Próxima fase: executar a matriz completa em máquina estável
(checkpoint a cada 90 dias), rodar o `analyze-rebalance-527c.mjs` e só então
decidir.

### O que falta para A

- 45 short runs (5 seeds × 3 perfis × 3 presets) concluídas;
- 45 carreiras Balanced × 5 anos concluídas;
- long runs de 10 anos (mínimo 1 seed × 3 perfis);
- money-solved observado (não inferido);
- escolha do preset por dados.
