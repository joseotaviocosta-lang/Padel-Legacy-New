# Validação distribuída/resumível de balanceamento — Playthrough 5.27-D

**DO NOT TUNE · DO NOT REDESIGN · FINISH THE EVIDENCE.** Nenhum número de
balanceamento mudou (`frozen-balance.json`, balance diff = 0; tuning idêntico
ao baseline congelado da 5.27-C). Nenhum arquivo de `src/` foi alterado nesta
fase. Branch `feature/live-coach-dynamic-adaptation`, HEAD `d5e5a2e`
(inalterado). Sem commit, sem push. Relatórios `rebalance-527/527b/527c`
preservados.

## Resumo

- Pipeline job-based implementado: manifest de 99 jobs, checkpoint a cada 90
  dias com sha256 + `.prev`, resume determinístico, recuperação de RUNNING
  obsoleto, watchdog/heartbeat, resultado atômico com hashes, export de bundle e
  import entre máquinas validado.
- **Stage 1 concluído: 45/45**, 0 falhas, 0 divergência de determinismo.
- **Decisão do Stage 1 (critérios pré-registrados antes do 1º resultado):
  os 3 presets ficaram REJECT.** Pela regra (itens 32/33), o Stage 2 **não**
  roda e o default **não** muda. Stage 2 = 0/45, long runs = 0/3.
- **Veredito: B** (os hard gates de validação para A exigem Stage 2 45/45 e long
  runs ≥ 3/3).

## Dois bugs de determinismo do HARNESS achados e corrigidos

A primeira rodada do Stage 1 foi descartada (arquivada em
`superseded-run1-vite-rng/`) porque uma carreira divergia logo após o checkpoint
do dia 90. Rastreamento por dia (estado do RNG do jogo, do relógio determinístico
e do RNG da política) achou duas causas, nenhuma no jogo:

1. **RNG do Vite misturado ao do jogo.** O `nanoid` do module runner do Vite
   (ids de RPC, ~21 chamadas por módulo carregado pela 1ª vez no processo) usava
   o `Math.random` determinístico do harness. Num processo retomado os módulos
   carregam em outros momentos, deslocando o fluxo do jogo. Medido: o jogo faz
   ~50 chamadas/dia; o Vite fazia ~12 mil em 60 dias. Correção
   (`scripts/lib/v526CareerSim.mjs`, opt-in `PL527D_ISOLATE_VITE_RNG=1`):
   chamador imediato em `node_modules/vite` recebe um fluxo próprio.
2. **Temporizadores do adapter zerando no reboot.** `lastRoutineBackupAt` /
   `lastIndexSyncAt` do `ActiveCareerAdapter` só vivem em memória; após o reboot
   o 1º commit sempre fazia backup e lia o relógio determinístico uma vez a mais
   (+1 s), deslocando ids/timestamps. Correção: os dois valores entram no
   checkpoint e são restaurados.

Prova: **contínuo (um processo, sem checkpoint) == segmentado (checkpoint a cada
90 dias)** com `outcomeHash` completo idêntico em 3 carreiras de 365 dias
(4 fronteiras), e no `test-job-determinism-v527d` (200 dias, kill no dia 135,
semente, duplicata). Consequência: o resultado da 5.27-C (`casual-001`, que
consumia RNG do Vite no fluxo do jogo) **não é reproduzível** bit a bit — é outra
realização igualmente válida; por isso foi rerodado (item 15, ver
`legacy-import-527c.json`).

## Otimização do harness (Bloco Q) — sem mudar o jogo

Profiling: ~48% do tempo em `structuredClone` (o adapter clona o estado inteiro
da carreira a cada mutação) e ~27% em `JSON.stringify` do save (código do jogo,
não alterado). Clone equivalente para dados JSON (`scripts/lib/v527dFastClone.mjs`,
preserva aliasing, `undefined`, `Date`, delega o resto ao nativo): 60 dias
65,6 s → 41,7 s, RSS 1078 → 664 MB, resultado idêntico. Segmentos de 90 dias
(processo novo a cada checkpoint) também evitam o acúmulo de heap/backups.
**~33 min/carreira (5.27-C) → mediana 29 min com 2 jobs em paralelo** (12–14 min
para casual sem contenção).

## Stage 1 — resultados (45/45, 5 seeds × 3 perfis × 3 presets × 2 anos)

| Preset | Easy | Medium | Hard | R1 | Rank @1y | Rank @2y | Títulos @2y | Sponsor Y1 (Normal) | Prize Y1 (Normal) | Insolv. Casual | Insolv. Normal | Caixa final |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Conservative | 29,4% | 27,6% | 11,5% | 19,1% | #451 | #111 | 1 | 77% | 5,0% | 20% | 0% | 7.148 |
| Balanced | 26,8% | 24,2% | 26,3% | 16,2% | #452 | #143 | 1 | 62% | 9,0% | 40% | 0% | 3.619 |
| Hardcore | 26,6% | 27,1% | 20,9% | 18,7% | #467 | #130 | 0 | 56% | 7,8% | 80% | 0% | 1.407 |

(Medianas sobre os 15 jobs do preset salvo onde indicado; distribuições completas
em `analysis/stage1.json`.)

Classificação (critérios em `scripts/analyze-rebalance-527d.mjs`, `CRITERIA`):
- **Conservative — REJECT**: sponsor Y1 Normal 77% > 60%; prize Y1 5% < 10%.
- **Balanced — REJECT**: sponsor Y1 Normal 62% > 60%; prize Y1 9% < 10%;
  insolvência Casual 40% > 20%.
- **Hardcore — REJECT**: prize Y1 7,8% < 10%; insolvência Casual 80% > 20%.

Comparação pareada (mesmas seeds): Balanced termina com menos caixa que
Conservative em 11/15 pares (mediana −4.476) e mais que Hardcore em 10/15
(mediana +1.830); rank @2y sem diferença consistente (Balanced melhor que
Conservative em 5/15, Hardcore melhor que Balanced em 6/15).

### Achados que nenhum preset resolve

- **Competição muito abaixo dos gates em todos os presets**: Easy ~27% (gate
  ≥ 45%), Medium ~26% (≥ 30%), R1 ~16–19% (≥ 40%). Os presets só mexem em
  economia; a competição é igual entre eles.
- **Inversão de tier**: Silver ~13–17% de vitórias contra Gold ~29–32%, nos 3
  presets. Silver está mais difícil que Gold.
- **Progressão mais rápida que o alvo, apesar das derrotas**: rank @1y ~#450
  (alvo #500–700) e @2y #111–143 (alvo #150–300).
- **Prize share Y1 abaixo de 10% em todos**: o prêmio quase não conta na receita
  do 1º ano; a renda vem de patrocínio/conquistas.
- **Money-solved: 0/45 em 2 anos** (definição canônica; não inferido).

## Itens que exigem decisão (não tomadas automaticamente)

O pipeline parou onde a regra manda. Caminhos possíveis, a decidir:
1. Rodar o Stage 2 do Balanced mesmo assim, como diagnóstico
   (`--stage=2 --ignore-stage-gate`, ~25–30 h nesta máquina), sabendo que ele
   não vira default por esta fase.
2. Abrir uma fase de tuning/design focada em competição (WR, inversão
   Silver/Gold) e em prize share/insolvência Casual, e depois revalidar com este
   mesmo pipeline.

---

## Relatório — 60 itens

1. **Jobs no manifest:** 99.
2. **Stage 1:** 45.
3. **Stage 2:** 45.
4. **Long:** 9 (3 obrigatórios + 6 preferenciais).
5. **Intervalo de checkpoint:** 90 dias (sha256 + `.prev` + sidecar).
6. **Resume funciona?** Sim (testes de checkpoint 9/9, stale 11/11).
7. **Contínuo == retomado?** Sim, após as 2 correções de harness: `outcomeHash`
   idêntico em 3 carreiras de 365 dias e em 200 dias com kill no dia 135.
8. **Processos que morreram:** 1 na matriz oficial (watcher do Vite, `EBUSY`
   num `.tmp` em `reports/`, dia 720+ de `hardcore-casual-seed002-2y`) + a
   rodada 1 inteira, parada de propósito (código invalidado).
9. **Jobs retomados:** 1 retomada por falha (do checkpoint 720); 360 retomadas de
   segmento normais.
10. **Resultado perdido?** Não.
11. **Determinism mismatch?** 0 na matriz oficial (`determinismFailures: 0`); os
    2 mismatches de harness foram achados antes e corrigidos.
12. **Paralelismo:** 2 (com checagem de CPU/RAM antes de cada início).
13. **Runtime médio por job:** mediana 29 min, média 30,4 min (P10 13,7 · P90
    51,9); mediana 870 s por ano simulado.
14. **Otimização do harness?** Sim: clone equivalente + segmentos; ~33 → 29 min
    com 2 em paralelo (12–14 min sem contenção para casual).
15. **Alterou gameplay?** Não (0 arquivos de `src/`; codeHash/balanceHash
    congelados).
16. **Stage 1 45/45?** Sim.
17. **Conservative E/M/H:** 29,4 / 27,6 / 11,5%.
18. **Balanced E/M/H:** 26,8 / 24,2 / 26,3%.
19. **Hardcore E/M/H:** 26,6 / 27,1 / 20,9%.
20. **R1:** Conservative 19,1% · Balanced 16,2% · Hardcore 18,7%.
21. **Rank @1y:** #451 · #452 · #467.
22. **Rank @2y:** #111 · #143 · #130.
23. **Títulos @2y (mediana):** 1 · 1 · 0 (médias 1,1 · 0,8 · 0,5).
24. **Sponsor Y1 (Normal):** 77% · 62% · 56%.
25. **Prize Y1 (Normal):** 5,0% · 9,0% · 7,8%.
26. **Insolvência Casual:** 20% · 40% · 80%.
27. **Insolvência Normal:** 0% · 0% · 0%.
28. **Money-solved:** não observado em nenhuma das 45 carreiras de 2 anos.
29. **Vencedor:** nenhum — os 3 presets REJECT.
30. **Tuning depois do Stage 1?** Não.
31. **Stage 2 45/45?** Não — 0/45, bloqueado pela decisão do Stage 1.
32–35. **Easy/Medium/Hard/R1 final:** não medidos (sem Stage 2).
36–39. **Rank Normal @1y/@2y/@3y/@5y:** só 2 anos: Balanced Normal @1y #452,
    @2y #119; @3y e @5y não medidos.
40–44. **Top100/Top50/Top20/Top10/#1:** não medidos em 5 anos.
45. **Títulos Y1/Y2/Y3/Y5:** Balanced Normal Y1 mediana 0, cumulativo Y2
    mediana 1; Y3/Y5 não medidos.
46. **Sponsor Y1/Y2/Y3/Y5:** Y1 medido (acima); demais não medidos.
47. **Prize Y1/Y2/Y3/Y5:** Y1 medido (acima); demais não medidos.
48. **Staff share:** medido por job em `analysis/staff-gear.csv` (2 anos);
    sem a leitura de 5 anos.
49. **Staff elite quando?** Não medido em 5 anos.
50. **Gear high-end quando?** Não medido em 5 anos.
51. **Insolvência Casual:** Balanced 40% (2 anos).
52. **Insolvência Normal:** Balanced 0% (2 anos).
53. **Insolvência Optimizer:** Balanced 0% (2 anos).
54–56. **Money-solved casual/normal/optimizer:** não observado em 2 anos (nulo,
    não estimado).
57. **Long runs:** 0/3.
58. **Save size:** Y1 mediana 12,2 MB (11,8–12,4), Y2 19,0 MB; Y5/Y10 não
    medidos.
59. **Testes/regressões/lint/build/diff-check/commit/push:** ver
    `regressions.json` e `regressions-Novos_5_27-D.json`: 12/12 testes novos
    (rodada com a máquina livre; no lote com contenção o de determinismo
    estourou o timeout de 45 min, depois elevado para 90);
    5.26-D 12/12; 5.26-B 7/7; 5.24/5.25 9/9; 5.27-B 1/1; 5.26-C 7/8 — falha
    pré-existente em `test-sponsor-eligibility-authority-v526c` (fixture com 0
    torneios barrada pela regra de prova de carreira da 5.27-B; nada em `src/`
    mudou). Lint verde, build verde, diff-check limpo, sem commit, sem push.
60. **VEREDITO: B.**

## Arquivos

- `scripts/run-balance-validation-v527d.mjs` — orquestrador.
- `scripts/analyze-rebalance-527d.mjs` — analisador incremental.
- `scripts/lib/v527dJobs.mjs`, `v527dFastClone.mjs`, `v527dTestKit.mjs`.
- `scripts/test-*-v527d.mjs` (12), `scripts/run-tests-rebalance-527d.mjs`.
- `scripts/sim-progression-economy-v526.mjs` e `scripts/lib/v526CareerSim.mjs`:
  checksum de checkpoint, heartbeat/watchdog, resultado atômico, isolamento do
  RNG do Vite, temporizadores do adapter.
- `reports/rebalance-527d/`: `jobs-manifest.json`, `frozen-balance.json`,
  `stage1-decision.json`, `runs/` (45), `analysis/`, `logs/`,
  `seed-checkpoints/`, `superseded-run1-vite-rng/`.
