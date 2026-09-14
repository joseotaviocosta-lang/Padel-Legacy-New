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
| P2 (equivalente a Masters) | referência: até ~6% de títulos de bot observados (teto observado — ver nota abaixo, não é meta ativa de correção) | Todas |
| Gold / Platinum | referência: até ~23% em Platinum, ~13% em Gold (teto observado — ver nota abaixo, não é meta ativa de correção) | Todas |
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

**Nota sobre a meta de Gold/Platinum (revisada na Fase 8.6):** a meta
original desta linha ("< 15%" de títulos reais, ou seja, bots deveriam
vencer ≥ 85% ali) se mostrou **estruturalmente inatingível** e foi
substituída por uma referência de teto realista, não uma meta ativa de
correção. Quatro configurações estruturalmente diferentes foram medidas
(produção sem alteração; `potential` de bot aberto para toda a
população, Fase 8.3; `potential` aberto só numa faixa de rank, Fase 8.4;
teto de OVR travado no tier de destino, Fase 8.5) — a melhor delas
chegou a 23,3% de títulos de bot em Platinum e 12,5% em Gold (nenhuma
configuração testada passou disso em nenhum dos dois tiers), ainda 62-73
pontos percentuais abaixo do alvo original de 85%, e qualquer tentativa
de fechar essa distância vazou força para Elite/Crown/Masters (ameaçando
a meta de Major/P1 ≥ 70%, mais crítica) ou não fechou gap nenhum. A
causa é estrutural, não uma questão de calibração: os 100 atletas reais
foram inseridos como o topo do elenco por desenho (Fase 2,
`absoluteRank = existingAthletes.length + i + 1` —
`src/lib/rankingPopulation.js`), e qualquer geração de bot forte o
bastante para dominar Gold/Platinum precisa de um teto de OVR ou de
crescimento alto o bastante que a mesma população, ao evoluir ao longo
de uma carreira simulada, não tem como saber "pare neste tier" — ela
continua subindo até onde o teto permitir. Ver
`reports/real-athletes-audit/FECHAMENTO-DOMINANCIA-TIER-8.2-8.5.md` para
o histórico completo da investigação e a decisão de não perseguir
correção adicional por esta via.

**Nota sobre a meta de P2/Masters (revisada na Fase 8.7):** verificada
por analogia, não por nova rodada de 4 medições — a mesma causa
estrutural de Gold/Platinum se confirma em Masters: o campo de bots
segue a mesma curva de geração (teto de OVR na origem, dependente só de
`absoluteRank`) e a mesma margem de crescimento estreita, medida nas
mesmas 4 configurações já rodadas (produção, Fase 8.3, 8.4, 8.5), sem
precisar repetir as rodadas. Diferença notada, não uma causa diferente:
o corte de ranking mais alto de Masters (`minRanking: 230`, contra 450 de
Gold) filtra um subconjunto de bots individualmente mais forte (OVR
médio de campo 72-75, contra 60-65 em Gold) mas ainda muito abaixo dos
reais (85-90) — e a dominância real observada em Masters (94-100%
conforme configuração) é, na prática, ainda MAIS extrema que em Gold/
Platinum, não menos, porque o número de reais que circula por Masters ao
longo de uma carreira é maior e o corte mais alto reduz ainda mais o
número de bots elegíveis a disputar ali. Melhor resultado observado nas
4 configurações: 6% de títulos de bot (Fase 8.3) — ainda muito distante
do meio da faixa original de 40-60%. **Referência revisada**: até ~6% de
títulos de bot observados, mesma disciplina e mesma decisão de não
perseguir correção adicional da nota de Gold/Platinum acima.

## Metas de participação

- **Todo atleta real disputa ≥ 12 eventos por temporada, já na temporada 1** —
  medido por `perSeason[].tournamentsPlayedThisSeason.real` (mean/median) E
  verificado individualmente (nenhum real com contagem abaixo de 12, não só a
  média acima de 12).
- **Duplas históricas pareadas em ≥ 90% dos eventos que disputam** — medido por
  `perSeason[].historicalDuplasThisSeason[].pairedRatePct`, para as 12 duplas
  de `worldSeed2025.json`, por temporada. **Confirmada atingida na Fase 8.7**
  para as 6 duplas confirmadas (`partner_confidence: "confirmado"`):
  `pairedRatePct` MEDIDO SÓ NAS TEMPORADAS EM QUE A DUPLA ESTAVA ATIVA (antes
  de qualquer um dos dois se aposentar) fica em 97-100% nas 6 — inclusive nas
  3 que a Fase 8 sinalizou como "colapsando" (58,3-78,3% no agregado cru de 5
  temporadas). A métrica `historicalDuplasOverall` cumulativa do harness soma
  TODAS as 5 temporadas sem descontar aposentadoria, então uma dupla que se
  aposenta na T4 aparece com 2 temporadas de "0% pareada" que na verdade são
  "não jogou mais, por design" (Fase 2D) — não falha de pareamento. Ao medir
  só o período ativo (a forma correta de interpretar esta meta), as 6/6
  duplas confirmadas atingem a meta. Ver `reports/real-athletes-audit/FASE-8.1-RELATORIO.md`
  §1 para a correspondência exata entre data de aposentadoria e queda no
  pareamento, e `reports/real-athletes-audit/FASE-8.7-RELATORIO.md` §3 para o
  recálculo por temporada ativa.

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
