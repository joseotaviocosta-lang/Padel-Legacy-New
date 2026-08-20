# Conquistas 2.0 + Progressão de Carreira — Fase 12

Ver também `docs/ACHIEVEMENTS_AUDIT_V2.md` (auditoria completa das 175 entradas do catálogo, por conquista).

## O que mudou, em uma frase

Conquistas deixa de ser um catálogo decorativo (31/175 com trigger funcional, o resto travado para sempre) e passa a ser a fonte real de progressão de carreira de longo prazo: 90 conquistas funcionais hoje, 61 documentadas como "precisa de um evento novo" (não implementadas às cegas), 15 placeholders vazios arquivados, 5 dependentes de mecânica inexistente (aposentadoria/gerações/completude) marcadas `future_system` — nunca mais escondidas atrás de um "???" impossível.

## ANTES / DEPOIS

| | Antes (Tutorial 4.0) | Depois (Fase 12) |
|---|---|---|
| Total no catálogo | 175 | 175 (nada removido do histórico) |
| Presentável ao jogador | 175 (parede de cards) | 155 (175 − 15 arquivadas − 5 future_system) |
| Com trigger funcional | 31 | 90 |
| "Secretas" | 16 nominais, 15 eram placeholders vazios | 15 arquivadas (nunca mais "???" impossível); nenhuma secreta legítima nova criada nesta fase — não fabricada sem evento real |
| Documentadas como C (precisa evento novo) | — | 61 |
| Partida oficial × treino | `profile.matches_played`/`wins` (só treino) | `Match.competition_type:'tournament' && is_official:true` (real) |
| Ganhos de carreira | não avaliado | soma de `FinancialTransaction type:'income'` (nunca `profile.coins`) |
| Ranking | já usava fonte canônica | inalterado (fora de escopo) |
| UI | não existia avaliação real em runtime | página com progresso real, "Próximas conquistas", escadas, secretas discretas |
| Reconciliação de save antigo | não existia | existe, sem recompensa retroativa |

## Arquitetura do motor (`src/lib/achievementEngine.js`)

Uma única camada continua sendo a fonte de verdade — não foi reescrita do zero, foi estendida:

- **`EVALUABLE_TRIGGER_TYPES`** (30 tipos): vocabulário fechado — só os triggers com dado real por trás entram aqui. Nenhum trigger é adicionado "para não deixar vazio"; os 61 documentados como C ficam de fora deliberadamente.
- **`rawMetricValue(achievement, profile, context)`**: um `switch` por `trigger_type`. Metade lê direto do `profile` (síncrono — `tournaments_won`, `trainings_completed`, atributos, `coach_id`...); a outra metade lê de um `context` pré-buscado (`context.officialMatches`, `context.careerEarnings`, `context.inventory`, etc.).
- **`getAchievementProgress`**: primeiro descarta `future_system`/`is_active:false` (nunca avaliados, nunca aparecem como bloqueados normais), depois checa `EVALUABLE_TRIGGER_TYPES`, só então calcula valor/percentual. `reach_rank` é o único "quanto menor, melhor" — tratado à parte no cálculo de percentual.
- **`presentableAchievements()`**: filtra `future_system`/arquivadas. Esta é a única função que a UI e as contagens usam — nunca o catálogo bruto.
- **`findNextLockedAchievement(profile, context, {category, triggerType})`**: já existia desde o Tutorial 4.0; usada tanto pela aba Conquistas ("Próximas") quanto pelo card de ranking da Home (`seasonCareerPlan.js`) — mesma fonte, nunca uma segunda escada paralela.
- **`syncPlayerAchievements(profile, context, {localGame, reconciliation})`**: concede o que está desbloqueado e ainda não registrado. Idempotência vem de uma única guarda (`existingIds.has(achievement.id)`) — nunca reavalia nem duplica uma conquista já registrada, mesmo chamada de novo com o mesmo estado.

### Onde o sync roda (nunca dentro de motores de gameplay)

- **`TournamentModal.jsx`**, depois de CADA partida oficial finalizada (não só no fim da campanha) — mesmo nível de abstração de `incrementMissionProgress`, ao lado dele, nunca dentro do motor de torneio.
- **`AchievementsPanel.jsx`**, ao montar a aba Conquistas — reconciliação de save antigo acontece aqui, uma vez por perfil.
- Nunca em `CareerHub.jsx`/`AppLayout.jsx`/render de página comum (Parte S) — ver seção de performance abaixo.

## Fonte de dados por trigger (nenhum contador novo sem necessidade)

| Trigger | Fonte real | Novo campo? |
|---|---|---|
| `play_official_match` / `win_official_match` | `Match.filter({competition_type:'tournament', is_official:true})`, `result` | Não — computado sob demanda |
| `beat_top10` / `beat_rank1` | mesma consulta, cruzada com `Match.opponent_rank` | Sim — `opponent_rank` (escrito ao lado do `Match` na finalização) |
| `reach_coins` | soma de `FinancialTransaction` com `type:'income'` | Não |
| `reach_rank` | `getWorldRank`/`buildWorldRankingSnapshot` (fonte canônica da Fase 11, intocada) | Não |
| `win_streak` | `profile.current_win_streak` | Sim — incrementado/zerado ao lado da escrita de `Match.result` em `TournamentModal.jsx` |
| `recover_injury` | `profile.injury_recoveries` | Sim — incrementado na transição `injury_status:'apto'` em `injuryRecoveryLifecycle.js` |
| `max_attribute` / `all_max_attributes` | `profile[attribute_key]` | Não — `attribute_key` derivado da descrição de cada conquista, uma vez, em `achievementsData.js` |
| `hire_coach` / `long_coach` / `max_coach_affinity` | `profile.coach_id`, datas do perfil, `calculateAffinity()` (já existente em `coaches.js`) | Não |
| `buy_property` / `make_investment` / `sign_sponsor` / `multi_sponsor` | `PlayerProperty` / `PlayerInvestment` / `PlayerContract` | Não |
| `own_items` / `own_legendary` / `own_mythic` / `own_exclusive` / `all_categories` | `PlayerInventory` cruzado com `ShopItem` | Não |
| `upgrade_facility` | `TrainingCenter` | Não |

**Confirmação explícita do Part 6/7 do briefing: uma partida de treino NUNCA avança conquista de partida oficial.** `fetchOfficialMatchStats` filtra estritamente por `competition_type:'tournament' && is_official:true` — uma partida de treino não aparece nessa consulta, ponto. Coberto por `test:official-match-achievements` (17 gates).

## Reconciliação de save antigo (Parte 33-36)

Um perfil que nunca passou pela Fase 12 (`!profile.achievements_v2_reconciled`) recebe, na primeira abertura da aba Conquistas, um `syncPlayerAchievements(profile, context, {reconciliation:true})`. Política deliberada, documentada, não assumida:

- **Toda conquista provável pelo estado/histórico já existente é registrada como desbloqueada** (ex.: `tournaments_won:8` já registrado → "Bicampeão" reconciliado).
- **Nenhuma recompensa é concedida nessa passagem** (XP/coins ficam intocados) — decisão de segurança: não há como provar que a recompensa nunca foi recebida por outro caminho no save antigo, então o padrão seguro é registrar sem pagar, não pagar por precaução.
- A linha criada fica marcada `reconciled:true, is_new:false` — não dispara notificação (nem toast, nem sino).
- `achievements_v2_reconciled:true` é gravado no perfil depois — a reconciliação roda exatamente uma vez por perfil; toda visita seguinte é um sync ao vivo normal, com recompensa normal.
- Nunca revoga, nunca duplica, nunca reseta progresso — a mesma guarda de idempotência (`existingIds.has`) que já protegia unlocks ao vivo também protege a reconciliação.
- Um save real pré-Fase-12 pode ter uma linha de `PlayerAchievement` semeada por `localSeed.js` que nem tem o campo `reconciled` (mais antiga que o próprio conceito) — o motor convive com ela sem quebrar e sem duplicar, coberto explicitamente por `test:achievement-save-migration`.

Coberto por `test:achievement-save-migration` (15 gates, incluindo um cenário de save com títulos/ranking/treinador pré-existentes) e pela seção de reconciliação de `test:achievement-engine-v2`.

## Recompensas e economia (Parte 37-40)

- 90 conquistas funcionais somam 461.900 XP / 817.600 moedas se **todas** fossem desbloqueadas de uma vez (número puramente informativo — não acontece em uma sessão real).
- Conquistas `facil`/`medio` (início/meio de carreira) pagam no máximo 4.000 moedas cada — menos de 4 meses de um treinador caro de referência (2.000/mês). Não financiam sozinhas o início da carreira.
- 9 conquistas `lendario`/`extremo` pagam ≥ 30.000 moedas (até 100.000 — "Número 1 do Mundo", "Perfeição Absoluta") — proporcional ao esforço de fim de carreira, medido e documentado, não recalibrado sem evidência de problema real.
- Simulação de um perfil avançado cruzando 14 marcos de uma vez (cenário realista de reconciliação/sessão intensa): se fossem AO VIVO, pagariam 13.200 moedas — cerca de 4,4 meses de receita típica (3.000/mês). Abaixo do teto de 12 meses usado como critério de "não domina a economia".
- Reconciliação, no mesmo cenário, paga **zero** — confirmado por teste.

Medido por `test:achievement-rewards-balance` (4 gates).

## UI da aba Conquistas (`AchievementsPanel.jsx`, dentro de Objetivos → Conquistas)

- Header compacto: `X/Y desbloqueadas` + pontos, via `CompactStats` — nunca uma parede de 175/155 cards.
- **"Próximas conquistas"**: as 5 mais perto de desbloquear (por percentual real, não por id), cruzando todas as categorias — não uma por categoria forçada.
- Busca por texto + um único filtro de categoria (chips/select) — sem 3 sistemas de navegação simultâneos.
- **Escadas** (mesmo `trigger_type`, ex.: partidas oficiais 1/10/50/100/250/500/1000): só o próximo degrau ainda bloqueado aparece por padrão; os demais ficam atrás de "ver mais N nível(is)".
- Progresso real: `47/100 vitórias`, `#184 → Top 100` — nunca um percentual fabricado sem métrica linear.
- Secretas aparecem só como `"???"` + "Conquista secreta", numa lista discreta, separada dos cards normais — nome/descrição real só depois de desbloqueada.
- Concluídas ficam numa lista compacta e colapsada por padrão, com data quando disponível.
- Reconciliação de save antigo roda no mount, uma vez por perfil (flag `achievements_v2_reconciled`).

Coberto por `test:achievements-ui-v2` (24 gates, estrutural + funcional).

## Notificações (Parte 52-54, `MissionNotificationBridge.jsx`)

- Conquista comum → toast local, sem tocar a Central de Notificações.
- **"Grande marco"** (`reach_rank≤500`, primeiro título, ou raridade `lendário`/`mitico`/`exclusivo`) → além do toast, gera uma mensagem na Central de Notificações (`CareerMessage`, `message_type:'achievement_milestone'`) — reaproveita o sino já existente, não cria um segundo feed.
- Múltiplos unlocks no mesmo evento (ex.: reconciliação, ou uma partida que bate 2 marcos de uma vez): **um** toast agrupado ("N conquistas desbloqueadas") e, se houver marcos grandes entre eles, **uma** mensagem agrupada no sino — nunca N notificações separadas. Cada conquista continua individualmente registrada na página.

## Performance (Parte 55-57) — medido, não assumido

Benchmark real (N=30 execuções, perfil com 20 partidas oficiais persistidas):

- `buildAchievementContext` (8 buscas em paralelo — partidas, patrimônio, inventário, treinador, etc.): média 0,83 ms, máx 9,78 ms.
- `evaluateAchievements` (155 conquistas presentáveis, síncrono): média 0,43 ms, máx 3,56 ms.
- `syncPlayerAchievements` completo (context + avaliação + idempotência): média 8,97 ms, máx 262 ms (o pico isolado corresponde a uma execução com I/O de disco frio no storage local de teste, não ao cálculo em si).

Custos desprezíveis frente ao ciclo de uma partida oficial (segundos) ou à montagem de uma página. O motor roda exatamente nos dois pontos documentados acima (fim de partida oficial, mount da aba Conquistas) — nunca em render de `CareerHub`/`AppLayout`, nunca por visita de rota comum.

## "Próximo objetivo" da Home — decisão explícita, não wiring silencioso

`getNextCareerObjective(profile, context)` foi criado em `seasonCareerPlan.js`, lendo da mesma fonte (`findNextLockedAchievement`, sem filtro de categoria) que a aba Conquistas usa. **Não foi conectado à Home (`CareerHub.jsx`) nesta fase** — decisão deliberada, não esquecimento:

- O slot de ranking da Home (`rankingGoal()`, dentro do grid "Metas da temporada") já lê de conquistas (`category:'carreira', triggerType:'reach_rank'`) usando só `context.worldRank`, que a Home já busca por outro motivo — sem custo adicional. Isso já satisfaz "mesma fonte, nunca uma terceira" para esse card específico.
- Um card **geral** de "próximo objetivo" cruzando todas as categorias precisaria do `context` completo (`buildAchievementContext` — partidas oficiais, patrimônio, inventário, etc.), porque vários triggers fora de `reach_rank` dependem dele para não reportar progresso incorreto (ex.: mostrar 0% em "partidas oficiais" só porque o contexto não foi buscado, quando na verdade já há progresso real). Buscar esse contexto completo a cada carregamento da Home entraria em conflito direto com a Parte S do briefing, que proíbe explicitamente avaliar conquistas a cada render de `CareerHub`.
- Restringir esse card geral só aos triggers "baratos" (que leem direto do `profile`, sem busca assíncrona) evitaria o custo, mas excluiria arbitrariamente exatamente as conquistas mais centrais desta fase — partida oficial e ganhos de carreira — tornando o card menos útil do que o slot de ranking que já existe.

`getNextCareerObjective` fica pronto, testado indiretamente (mesma função que a aba Conquistas usa), e disponível para uma fase futura que decida investir numa estratégia de cache/prefetch adequada (ex.: computado uma vez por avanço de dia e guardado no perfil, em vez de por render). Reportado aqui explicitamente para não passar como esquecimento silencioso.

## Testes novos (7 arquivos, `scripts/`)

| Teste | Gates | Cobre |
|---|---|---|
| `test:achievements-audit` | 174 | Estrutura do catálogo: ids únicos, triggers válidos, categorias válidas, contagens de arquivadas/future_system/presentáveis, `attribute_key` de todas as `max_attribute`, ausência de duplicata não documentada |
| `test:achievement-engine-v2` | 14 | Unlock real, idempotência, reconciliação (registra sem pagar), reconciliar duas vezes não duplica, `evaluateAchievements` sem exceção com context vazio |
| `test:official-match-achievements` | 17 | Treino nunca conta como oficial; vitória/derrota oficiais corretas; `beat_top10`/`beat_rank1` via `opponent_rank`; partida antiga sem `opponent_rank` não quebra |
| `test:achievement-career-progression` | 12 | Progressão real cruzando treino, torneio, ranking, treinador, economia e atributos, através do pipeline real (`buildAchievementContext` + `syncPlayerAchievements`) |
| `test:achievement-rewards-balance` | 4 | Impacto econômico medido (não pressuposto) — teto para fácil/médio, relatório para lendário/extremo, simulação de reconciliação vs. ao vivo |
| `test:achievement-save-migration` | 15 | Save antigo com títulos/ranking/treinador pré-existentes, reconciliação, zero recompensa retroativa, idempotência, progresso normal depois |
| `test:achievements-ui-v2` | 24 | Estrutura real do componente (header, "Próximas", filtro único, escadas, secretas discretas, concluídas colapsáveis) + laddering funcional real |

Total: 260 gates novos, todos PASS.

## Achado e corrigido durante a implementação (fora da lista original de arquivos)

Dois problemas de infraestrutura pré-existentes, expostos (não causados por acaso — ambos foram efeitos colaterais reais de `achievementsData.js` passar a importar de `padel.js`) e corrigidos na raiz, não contornados:

1. **`CareerEntityRepository` (`src/gameplay/repositories/CareerEntityRepository.js`)**: o construtor capturava o `gameRepository` de `runtime.js` uma única vez, num campo comum (`this.repository = gameRepository`). Se a instância única de `EntityAdapter.js` (`new CareerEntityRepository()`, sem argumento) fosse criada no meio de um grafo de import circular — antes de `runtime.js` terminar de atribuir seu `gameRepository` —, esse campo ficava `undefined` para sempre, mesmo depois do módulo terminar de carregar. Quebrava 9 suítes de regressão pré-existentes (nenhuma delas em achievements) quando corriam sozinhas. **Fix**: `this.repository` virou um getter que relê o binding vivo do import a cada acesso, então não importa mais a ordem de avaliação dos módulos — corrigido na raiz, não contornado por reordenação de teste.
2. **Ciclo de import real**: `achievementsData.js` importava `ATTRIBUTES` de `padel.js`, que por sua vez importa `localGameClient.js` → `localSeed.js` → `achievementsData.js` — um ciclo genuíno, fechado por essa importação. Quebrava especificamente os 3 testes de Live Coach (`beta-candidate`). **Fix**: `ATTRIBUTES`/`ATTRIBUTE_KEYS` foram extraídos para uma folha nova sem dependências (`src/lib/attributes.js`); `padel.js` re-exporta os dois nomes (os ~20 outros consumidores continuam importando de `padel.js` sem mudança nenhuma); `achievementsData.js` passou a importar direto da folha, nunca de `padel.js`.

Ambos confirmados corrigidos rodando a suíte completa de regressão (18 testes nomeados no Part U + `test:beta-candidate` com seus 14 pilares) duas vezes — antes do fix (9 quebras) e depois (0 quebras).
