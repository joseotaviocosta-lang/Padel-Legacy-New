# Fase 3 — Escada de tiers e calendário

> Pré-requisito: Fase 2.9 entregue (achado #20 corrigido e validado,
> política de acumulação de `Partnership`/`TeamRanking` definida e
> implementada — achado #21). Ver
> [FASE-2.9-RELATORIO.md](FASE-2.9-RELATORIO.md).
>
> Toca `src/` de produção extensivamente (`circuitCatalog.js`,
> `WorldTourLifecycle.js`, calendário/onboarding) — validação completa
> de build/Tauri incluída na Seção 6, não pulada.

## 1 — 3A: escada de 9 tiers, tabelas geradas em config

`src/lib/circuitCatalog.js` reescrito. `buildTier(definition)` recebe
`rankPoints` (pontos do campeão) como único parâmetro-fonte e deriva
`prize`/`xp` via multiplicadores (`PRIZE_COINS_PER_RANK_POINT=15`,
`XP_PER_RANK_POINT=1.4`) e a tabela `roundPoints`/`roundCoins`/
`roundXp` via `buildRoundTable(championValue, roundCount)` aplicando
`ROUND_DECAY_RATIOS = [1, 0.6, 0.36, 0.18, 0.09, 0.045]` — nada
hardcoded por tier; a tabela nasce da config, como pedido ("em config,
não em código"). Conferido contra o exemplo trabalhado do próprio
pedido (Crown: 2000/1200/720/360/180/90) — bate exato.

9 tiers: Bronze, Silver, Gold, Platinum, Circuit Finals, Masters,
Elite, Crown, Legacy Finals — substituindo os 6 antigos. Mais um tier
oculto (`Exibição`, `order:-1`, sem `rankPoints`, `championPrize`/
`championXp` explícitos) usado só pelo evento pré-temporada do item
3C, deliberadamente fora de `TIER_EVENTS_PER_YEAR`/`WEEK_PROGRAM` pra
nunca recorrer.

`roundCountForDrawSize`/`DISPLAY_ROUNDS_BY_DRAW_SIZE` dão rótulos de
rodada corretos por tamanho real de chave (R24 vs. R32 etc.), com
fallback genérico + aviso no console se um tamanho de chave futuro não
estiver coberto — evita um rótulo errado silencioso se alguém
adicionar um tier com chave atípica depois.

`WEEK_PROGRAM`: `TIER_EVENTS_PER_YEAR` totaliza 80 eventos/ano (78
regulares distribuídos ao longo das 47 semanas de temporada regular via
`distributeTierWeeks`, mais Circuit Finals e Legacy Finals nas semanas
49/52 — `SEASON_FINALE_WEEKS`, depois da temporada regular).

## 2 — 3B: chaves incompletas — dois bugs independentes, zerado

Investigado como um problema só, encontrados DOIS bugs com o mesmo
sintoma e causas diferentes — ambos corrigidos, ambos agora
rastreáveis na tabela de achados (não só um dos dois, como estava antes
desta sessão):

- **Achado #16b** (config): `resolveCompletedWorldTourEvents` lia
  `tournament.draw_size` — campo que não existe no schema de
  `Tournament` — sempre caindo no fallback fixo de 32. Corrigido pra
  ler `tournament.main_draw_size`.
- **Achado #22** (causa raiz real): o preenchimento de reserva só
  disparava com `entrants.length < 2` — garantia o mínimo pra existir
  uma partida, nunca tentava completar a chave até `drawSize`.
  Corrigido pra `entrants.length < drawSize`.

**Rastreabilidade do diagnóstico errado que o achado #22 corrige**: a
Fase 2.6 atacou o mesmo sintoma com a hipótese "faltam duplas no pool"
e triplicou as duplas ativas (115→379) — o pool nunca era consultado,
então o resultado real mede o tamanho do erro: 46,9% incompletas antes
→ 40,6% depois de triplicar duplas (hipótese errada, quase nada mudou)
→ **0% depois de corrigir o gatilho real** (achado #22).

| Métrica | Antes da Fase 3 (baseline `official-900-100-s1`) | Depois da Fase 3 |
|---|---|---|
| Chaves incompletas | 13/32 (40,6%) | **0/80 (0%)** |
| Jogador #1000: eventos elegíveis | 13/32, maior intervalo 42 dias | **40/80, maior intervalo 14 dias** |

O segundo número é bônus direto do mesmo fix (mais duplas elegíveis
completando chave = mais eventos realmente disputáveis) e já resolve a
meta do item 3C.1 abaixo com folga.

## 3 — 3C: calendário

- **3C.1 (intervalo pro jogador em #1000)**: meta era ≥15 eventos
  elegíveis/ano com intervalo máximo ≤21 dias. Medido: **40 eventos,
  intervalo máximo 14 dias** — superado em quase 3× no número de
  eventos, folga de 7 dias no pior intervalo.
- **3C.2/3C.3 (evento de exibição pré-temporada + reordenação do
  tutorial)**: `buildPreSeasonExhibition` usa o tier oculto
  `Exibição`; tutorial reordenado e `Match` do `world_tour_event`
  denormalizado, com teste dedicado incluindo um caso negativo (gate
  não deixa passar tutorial fora de ordem).

## 4 — 3D: economia de prêmios — aprovada com ressalva de calibração

Confirmada como aplicada: os valores de `TOURNAMENT_TIER_CONFIG`
(moedas = pontos de ranking do campeão × 15, XP × 1,4) já estão ativos
em produção desde a Seção 1. A curva de decaimento por rodada
(`ROUND_DECAY_RATIOS`) foi aprovada e está em uso.

**Ressalva registrada como achado #25, não corrigida agora**: a escala
ABSOLUTA não foi validada contra uma carreira completa. Um título de
Crown a 30.000 moedas paga mais de dez anos de salário de um parceiro
iniciante (30.000 ÷ ~200-250/mês ≈ 10-12,5 anos) — risco de a economia
ficar MENOS interessante justamente na faixa de elite, onde deveria
ficar mais. Não é bug (a curva está certa; a escala pode não estar) e
não é urgente — fica pendente de reavaliação quando existir uma
carreira completa pra medir contra.

## 5 — 3E: migração de tiers antigos e referência órfã do `Partnership`

- **3E.1/3E.2**: confirmado que o mecanismo de reconciliação já
  existente absorve a migração de saves na escada de 6 tiers sem
  quebrar — validado por
  [scripts/test-tier-ladder-migration-fase3.mjs](../../scripts/test-tier-ladder-migration-fase3.mjs)
  (13 gates, todos PASS).
- **3E.3**: `Tournament.champion_partnership_id`/`runner_up_partnership_id`
  dependiam de uma `Partnership` que pode ser podada depois de 24 meses
  (achado #21, Fase 2.9). Resolvido de forma permanente, não só pela
  carência: `champion_athlete_ids`/`champion_athlete_names`/
  `runner_up_athlete_ids`/`runner_up_athlete_names` denormalizados
  direto no `Tournament`, junto com os campos de partnership (agora
  best-effort). `scripts/audit-real-athletes-simulation.mjs` migrado
  pra ler os ids denormalizados em vez de depender do join.

## 6 — 3F: perfilamento de custo — achados #23/#24, enquadramento corrigido

Baseline de temporada cheia (mesma seed do resto da fase,
`official-900-100-s1`, 900 procedurais + 100 reais): **38min16s de
tempo real** (medido por timestamp de arquivo, Birth vs. Modify — não
pelo relógio determinístico do harness, que não mede tempo de parede
nenhum), muito acima da projeção de "+2-3min" feita antes de medir
(achado #23).

Perfilado por fase (instrumentação temporária em produção, medida e
**totalmente revertida** depois — confirmado por grep sem nenhuma
referência remanescente), amostra de 3 meses, mesma seed/config:

| Fase | Tempo | % do total medido |
|---|---|---|
| Seleção de torneio pela IA (`chooseTournament`, por semana) | 0,06s | 0,3% |
| Montagem de campo (backstop de elegibilidade do achado #22) | 0,03s | 0,2% |
| **Persistência** (4 transações de escrita de `resolveCompletedWorldTourEvents`) | **18,18s** | **99,5%** |

**Correção de enquadramento, feita antes de fechar a fase**: 99,5% NÃO
é "o preço da feature" — as duas fases de computação de torneio, juntas,
custam 0,5%; a Fase 3 poderia ter 300 eventos e a computação
continuaria irrelevante. O que custa é reescrever ~1.000 linhas de
`AthleteProfile` por chamada (13.920 linhas reescritas em 14 chamadas
na amostra, ~994/chamada — praticamente a população inteira), e o
gatilho é ORTOGONAL ao volume de torneios: dispararia igual com 32
eventos, só menos vezes. Isso torna o achado #18 (clone do save inteiro
a cada transação) o próximo passo natural — não pelo volume de eventos,
mas porque o reranking por resolução é uma instância nova e concreta do
mesmo padrão já catalogado nesse achado.

## 7 — Investigação do achado #18, aberta ao fechar a fase (diagnóstico, sem implementação)

Por pedido explícito ("Fechar a Fase 3, depois abrir o #18"), com três
perguntas respondidas antes de qualquer mudança de código:

- **3.1 — o reranking imediato é redundante com o passe semanal de
  `circuitLifecycle`?** Não é redundante — `ranking_position` alimenta
  cortes de elegibilidade (Circuit Finals top-8, Legacy Finals top-16)
  que não podem esperar a granularidade semanal — mas está
  superdimensionado: reescreve a população inteira numa chamada isolada
  pra servir um propósito estreito, e nem sequer é consumido dentro da
  própria chamada que o produz. `world_ranking` confirmado morto (dead
  code) em todos os consumidores.
- **3.2 — que fração do custo da temporada é essa função?** Medido:
  **174,33s de `processWorldTourDay` em 365 chamadas, contra 2299,51s
  (38min19,5s) de tempo real da temporada inteira — 7,58%.** Pequena:
  o achado #18 tem alvos maiores em outro lugar (92,42% do custo da
  temporada está fora desta função), então batizar só as 4 escritas de
  `resolveCompletedWorldTourEvents` não seria o alvo certo pra atacar
  primeiro.
- **3.3 — proposta arquitetural**: `mutateActiveCareer` clona o save
  inteiro porque é o único mecanismo de atomicidade que existe (leituras
  usam referência viva ao estado quente por performance). Quatro
  opções avaliadas (risco/esforço registrados no achado #18): (A)
  aplicar o mesmo padrão de batching já usado 6 vezes às 4 chamadas
  deste sistema — baixo risco, mas resolve só a fatia de ~7,5%; (B)
  ampliar a fronteira da transação pro tick diário/semanal inteiro,
  reusando o mecanismo de junção automática já existente
  (`activePersistenceTransaction` é estado do adapter, não precisa ser
  passado por cada chamador) — ataca o padrão sistemicamente, é a
  recomendação de próximo passo; (C) cópia estrutural (copy-on-write) —
  resolve o crescimento intratemporada de 7,5×, mais esforço/risco,
  complementar a B; (D) escrita direta com rollback — descartada, não
  resolve isolamento de leitor. `ranking_history` confirmado como
  write-only (só duas referências em todo `src/`, ambas em
  `circuitLifecycle.js`) — candidato limpo pra sair do documento
  quente.

Detalhamento completo em `AUDITORIA-ATLETAS-REAIS-VS-BOTS.md`, achado
#18. **Nenhuma mudança na camada de persistência foi implementada nesta
etapa**, conforme pedido.

## 8 — Suíte, lint, build, Tauri

Executado DEPOIS de reverter a instrumentação de medição usada em 3.2
(`DIAG_STAGE_TIMING`/`__worldTourDayTimingMs`, temporária, em
`WorldTourLifecycle.js` e `scripts/audit-real-athletes-simulation.mjs`)
— confirmado por grep sem nenhuma referência remanescente.

- `npm run lint` — limpo, sem avisos.
- `npm run build` — OK, 32,06s.
- Contrato de storage vs. Tauri real: nenhum arquivo de `src-tauri/`
  tocado nesta fase — `npm run test:dev-server-config` confirma "porta
  sincronizada, diagnóstico, cleanup seguro e isolamento de produção
  aprovados".
- Suíte de regressão completa (14 scripts): `test:tournament-registration`,
  `test:ranking-consistency`, `test:tournament-flow-rc`,
  `test:partnerships-v29`, `test:living-partnership-market-phase15`,
  `test:world-partnership-dynamics`, `test:players`, `test:missions`,
  `test:ranking-race-season`, `test:simulation-population-cap-invariant`,
  `test:onboarding-tournament-gate`, `test:onboarding-v3`,
  `test:tutorial-chronology`, `test:tier-ladder-migration-fase3` —
  **todos EXIT 0, todos com texto de PASS genuíno conferido** (não só
  exit code). `test:tier-ladder-migration-fase3` é o teste desta fase
  (13/13 PASS); `test:onboarding-v3`/`test:tutorial-chronology`
  exercitam a reordenação do item 3C.2/3C.3.

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | 3A — escada de 9 tiers, tabelas de rodada geradas em config | ✅ conferido exato contra o exemplo do Crown do próprio pedido |
| 2 | 3B — chaves incompletas a zero | ✅ 13/32 (40,6%) → 0/80 (0%); dois bugs independentes (#16b, #22), ambos corrigidos e rastreáveis |
| 3 | 3C — calendário (exibição, tutorial, intervalo do #1000) | ✅ meta ≥15 eventos/≤21 dias superada: 40 eventos/14 dias |
| 4 | 3D — economia de prêmios | ✅ aplicada; ressalva de calibração de escala registrada como achado #25 |
| 5 | 3E — migração de tiers + referência órfã do `Partnership` | ✅ migração validada (13 gates); orphan-reference resolvido por denormalização (não só carência) |
| 6 | 3F — custo medido e localizado | ✅ 38min16s medido; 99,5% do custo é persistência (achado #24); achado #18 reaberto com enquadramento correto |
| 7 | Regra de método registrada | ✅ ver `AUDITORIA-ATLETAS-REAIS-VS-BOTS.md`, seção "Regra de método" |
| 8 | #22 promovido a achado próprio, #16b rastreável | ✅ ambos com linha própria na tabela de achados |
| 9 | Investigação do #18 (3.1/3.2/3.3) | ✅ 3.1: não redundante, superdimensionado; 3.2: 7,58% da temporada — alvos maiores em outro lugar; 3.3: proposta arquitetural entregue (opção B recomendada), sem implementação |
| 10 | Suíte, lint, build, Tauri (pós-revert de instrumentação) | ✅ lint limpo, build 32,06s, 14/14 scripts PASS genuíno, Tauri (`test:dev-server-config`) aprovado |

**Resumo executivo**: a Fase 3 corrigiu dois bugs de causa raiz que se
escondiam atrás de um sintoma comum (chaves incompletas), com uma
lição de método explícita: a Fase 2.6 já tinha "corrigido" o mesmo
sintoma sob uma hipótese errada, e só a medição da Fase 3 revelou que
aquele esforço não tinha tocado a causa real. A mesma disciplina se
repetiu no item 3F — a hipótese inicial (achado #23, "montagem de campo
provavelmente coautora do estouro") foi testada e refutada por
perfilamento antes de virar achado #24, que por sua vez teve seu
PRÓPRIO enquadramento inicial corrigido em sessão ("mais eventos custam
mais" → "o gatilho é ortogonal ao volume"). Essa disciplina agora está
registrada como regra permanente da auditoria, não só como algo que
aconteceu desta vez.
