# Fase 0.3, item 1 — Baseline oficial congelada

Rodada aprovada disparada e concluída: 970 bots procedurais, 486 duplas
procedurais, **1 temporada**, seed fixa `official-970-s1`, via
`node scripts/audit-real-athletes-simulation.mjs --seasons=1
--proceduralAthletes=970 --proceduralTeams=486 --seed=official-970-s1`.

- **Tempo real: ~35 minutos** (14:55 → ~15:30), sem instrumentação de
  profiler — bate com a estimativa de 34,95 min do perfilamento (Fase 0.2
  Parte 1), dentro da meta de 1h sem precisar cortar nada.
- Congelada em [docs/baseline-pre-refactor.json](../../docs/baseline-pre-refactor.json)
  e [docs/baseline-pre-refactor-season-tier.md](../../docs/baseline-pre-refactor-season-tier.md)
  (sobrescrevendo o conteúdo obsoleto da v1, pré-Fase-0.1). Cópia arquivada
  com nome específico em
  [official-baseline-970bots-1season.json](official-baseline-970bots-1season.json) /
  [-tournaments.csv](official-baseline-970bots-1season-tournaments.csv) /
  [-season-tier.md](official-baseline-970bots-1season-season-tier.md).

## O cold-start aparece em cheio, como previsto

Com densidade de produção real (970:24, ~40:1) e SEM o efeito-máscara do
agregado de 5 temporadas, o ano 1 mostra exatamente o sintoma que motivou
toda a auditoria:

- **17 dos 24 atletas reais nunca disputaram um único torneio na
  temporada.** (`summary.json:perSeason[0].realAthletesNeverPlayedSoFar`)
- **Só 9 dos 24 reais aparecem no top 20 do ranking mundial ao fim do
  ano.** (`realInTop20: 9`, de um `top20` com 20 posições)
- **20 dos 32 torneios do calendário (62,5%) fecharam com chave
  incompleta.** (`tournaments.incomplete: 20` de `tournaments.total: 32`)
- Por tier: Masters fechou o ano com **0 títulos 100%-real** (5 de 5 foram
  100%-bots); Silver teve 1 título 100%-real contra 6 100%-bots; ver
  [docs/baseline-pre-refactor-season-tier.md](../../docs/baseline-pre-refactor-season-tier.md)
  para a tabela completa por tier.
- Duplas históricas: das 12, só 2 estiveram pareadas entre si em algum
  momento do ano (Coello&Tapia 33,3% do ano, Stupaczuk&Lebrón 41,7%) — as
  outras 10 nunca chegaram a parear, 0% o ano inteiro.

Esses números são o novo ponto de comparação para toda fase seguinte —
cada fase de correção (1A/1B/1C incluídos, já aplicados nesta mesma
entrega) deve ser reavaliada contra esta baseline, não contra a
sensibilidade-à-densidade de 100 bots (relabeled) nem contra as versões v1
descartadas na Fase 0.1.

## Check de regime (5 temporadas) — segurado, como pedido

Não disparado nesta entrega. Motivo: a Fase 2 vai dar `ai_partner_id` fixo
aos 12 pares históricos, alterando diretamente o sistema mais caro da
simulação (achado do perfilamento: `aiPartnerships` = 32,3% do custo e o
que mais cresce ao longo da temporada). Rodar 5 temporadas agora mediria
um comportamento que a próxima fase já vai mudar. Rodar depois da Fase 2,
como já era o plano original (marcos: fim da Fase 2, Fase 5, Fase 8).
