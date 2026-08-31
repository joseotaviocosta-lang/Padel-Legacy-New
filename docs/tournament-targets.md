# Metas do sistema de torneios — atletas reais vs. bots

Este arquivo define os alvos que o sistema de torneios **ainda não atinge**. Servem
de régua para as próximas fases de correção (Fase 1 em diante) — **não são a
baseline atual**, que está congelada em `docs/baseline-pre-refactor.json` e
resumida em `reports/real-athletes-audit/season-tier-table.md`.

Toda métrica aqui é medida pelo harness permanente
(`scripts/audit-real-athletes-simulation.mjs`, `npm run audit:real-athletes-simulation`),
sempre por temporada — nunca só em agregado de várias temporadas, porque o
agregado esconde exatamente o efeito de "partida fria" que motivou esta
auditoria (ver `reports/real-athletes-audit/AUDITORIA-ATLETAS-REAIS-VS-BOTS.md`).

## Metas por tier — quem deveria vencer

| Tier | Meta de títulos 100% reais | Janela |
|---|---|---|
| Major / P1 (equivalente a Elite/Crown no catálogo atual) | ≥ 70% | Temporadas 1-3 |
| P2 (equivalente a Masters) | 40-60% | Todas |
| Gold / Platinum | < 15% | Todas |
| Bronze / Silver | ~0% (não deveriam nem ter atletas reais na chave) | Todas |

**Nota de mapeamento de nomenclatura:** os tiers do calendário atual
(`src/lib/circuitCatalog.js`, `TOURNAMENT_TIER_CONFIG`) são
Silver/Gold/Platinum/Masters/Elite/Crown. As metas acima usam a nomenclatura do
pedido original (Major/P1, P2, Gold/Platinum, Bronze/Silver); a correspondência
mais direta por posição na hierarquia é Crown↔Major/P1, Elite↔P1 "menor", ou
Masters↔P2 — a fase de implementação que fizer a correção real da elegibilidade
por tier (achado #16 da auditoria, `rank` vs. `ranking` em
`WorldTourLifecycle.js`) deve fixar esse mapeamento explicitamente antes de
medir contra estas metas.

## Metas de participação

- **Todo atleta real disputa ≥ 12 eventos por temporada, já na temporada 1** —
  medido por `perSeason[].tournamentsPlayedThisSeason.real` (mean/median) E
  verificado individualmente (nenhum real com contagem abaixo de 12, não só a
  média acima de 12).
- **Duplas históricas pareadas em ≥ 90% dos eventos que disputam** — medido por
  `perSeason[].historicalDuplasThisSeason[].pairedRatePct`, para as 12 duplas
  de `worldSeed2025.json`, por temporada.

## Metas de acesso do jogador

- **Um jogador ranqueado #1000 tem ≥ 15 eventos elegíveis no ano 1, com
  intervalo máximo de ≤ 21 dias entre eles** — medido por
  `perSeason[].player1000Eligibility` (`eligibleCount`, `maxGapDays`), usando a
  função de elegibilidade real do jogo (`evaluateTournamentEntry` +
  `buildAthleteEntryContext`, `src/gameplay/worldTour/EntryManager.js` — a
  mesma que `tournamentRegistration.js` usa de verdade, não o caminho interno
  quebrado do World Tour).

## Meta de integridade de chave

- **Zero chaves incompletas** — medido por `perSeason[].tournaments.incomplete`
  (comparando `simulated_entrants` contra `tournament.main_draw_size`, a
  capacidade real configurada por tier — não o fallback hardcoded de 32 que
  `resolveCompletedWorldTourEvents` usa hoje por engano, achado #16b da
  auditoria).

## Como comparar contra a baseline

```bash
npm run audit:real-athletes-simulation -- --seasons=5 --seed=baseline-v1
diff docs/baseline-pre-refactor.json reports/real-athletes-audit/summary.json
```

Qualquer mudança de lógica de jogo deve ser seguida de uma nova rodada do
harness com a MESMA seed; qualquer diferença no resultado é atribuível à
mudança de lógica, nunca a ruído de simulação (harness determinístico —
ver `determinism` no JSON de saída).
