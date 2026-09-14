# f83-baseline-clean — saída bruta da instrumentação `[DIAG_FIELD_OVR]`

Rodada de 1 temporada, fórmula de produção sem alteração (sem
`DIAG_WIDE_POTENTIAL`), seed `official-900-100-s1`, usada como evidência
primária da tabela do §1.2 de `FASE-8.3-RELATORIO.md`. Preservada aqui
porque `run.log` é ignorado pelo git (`*.log`) e essa distribuição de OVR
por campo/tier não é persistida em `summary.json`.

```
Seed: "official-900-100-s1" (hash 3750998915) — Math.random e relógio determinísticos a partir daqui.
Elenco: 100 atletas reais + 894 bots procedurais (amostra de 894 gerados pela fórmula de produção) = 1000 atletas.
Duplas: 50 reais + 448 bots = 500 duplas.
Temporada 2026: Top 20 tem 20/20 reais · #1000 elegível para 40/80 torneios (maior intervalo: 14 dias) · 1/79 chaves incompletas · 0/100 reais não jogaram NESTA temporada.
[DIAG_FIELD_OVR] temporada 2026 · Bronze · reais={"n":1,"min":82,"max":82,"mean":82} · bots={"n":767,"min":36,"max":89,"mean":60.4}
[DIAG_FIELD_OVR] temporada 2026 · Elite · reais={"n":303,"min":78,"max":97,"mean":86.2} · bots={"n":97,"min":52,"max":90,"mean":76.9}
[DIAG_FIELD_OVR] temporada 2026 · Silver · reais={"n":2,"min":78,"max":82,"mean":80} · bots={"n":510,"min":36,"max":90,"mean":61.5}
[DIAG_FIELD_OVR] temporada 2026 · Gold · reais={"n":218,"min":78,"max":97,"mean":84.5} · bots={"n":166,"min":38,"max":90,"mean":60}
[DIAG_FIELD_OVR] temporada 2026 · Masters · reais={"n":344,"min":78,"max":97,"mean":85.4} · bots={"n":136,"min":45,"max":89,"mean":72.3}
[DIAG_FIELD_OVR] temporada 2026 · Platinum · reais={"n":242,"min":78,"max":97,"mean":84.1} · bots={"n":142,"min":45,"max":90,"mean":67.9}
[DIAG_FIELD_OVR] temporada 2026 · Crown · reais={"n":138,"min":78,"max":97,"mean":86.1} · bots={"n":22,"min":50,"max":85,"mean":75.8}
[DIAG_FIELD_OVR] temporada 2026 · Legacy Finals · reais={"n":14,"min":85,"max":97,"mean":90.7} · bots={"n":0}
[checkpoint] temporada 2026 gravada em disco — 1/1 temporadas · 79 torneios resolvidos até aqui · 0/100 reais nunca jogaram até aqui.

=== RESUMO CUMULATIVO ===
Torneios resolvidos (mundo, sem o jogador): 79
Classificação dos campeões: { '100%_bots': 42, '100%_reais': 37 }
Torneios disputados — reais: média 12.62 / mediana 9 · bots: média 1.89 / mediana 0
Atletas reais que NUNCA apareceram em nenhuma chave: 0/100
```
