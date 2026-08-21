# Fase 14 — Career Identity & Dynamic Career Experience

Objetivo: conectar sistemas já existentes (timeline, conquistas, parceria,
treinador, relações, ranking, imprensa, notificações) para que a carreira
pareça uma história própria — não reimplementar nenhum deles do zero.

## Parte 1 — Auditoria (antes de qualquer código)

Sistemas históricos já existentes, mapeados por leitura direta do código
(não suposição):

- **`src/lib/careerStory.js`** (criado numa Fase 13 anterior) — módulo
  puro, sem storage: `buildCareerTimeline`/`buildSeasonRetrospectives`,
  derivados de `Match` + `profile` a cada chamada. Já usava a escada
  unificada de ranking (500/250/100/50/30/20/10/5/3/1). Base escolhida
  para esta fase — extendida, não substituída.
- **`src/lib/careerMoments.js`** (Home/`CareerHub.jsx`) — "momento da
  carreira", já existia com fila de prioridade (lesão > título > ranking >
  torneio próximo > sequência > parceria). **Bug real**: checava campos
  que a `Match` real nunca escreve (`winner_id`/`player_won`/`is_winner`;
  o real é `result:'vitória'|'derrota'`) e não exigia partida oficial —
  uma partida de treino podia virar "título"/"grande fase" na Home.
  Corrigido reaproveitando `isOfficialMatch`/`playerWonMatch` de
  careerStory.js (agora exportado), em vez de manter uma 3ª implementação
  divergente do mesmo conceito.
- **`Achievement Engine` (Fase 12/12.1/13, já em produção)** — 175
  conquistas, 100 funcionais, `achievementContext.js` prefetch único,
  `syncPlayerAchievements` idempotente, evento
  `padel:achievement-unlocked`. Não tocado nesta fase além de reaproveitar
  o mesmo `achievementContext` já construído em `TournamentModal.jsx`
  (zero consulta nova).
- **`Partnership`** (`src/lib/partnershipSystem.js`) — histórico real já
  existia (start/end date, partidas, vitórias, títulos por parceria,
  `getPartnershipHistory`). **Bug real**: `endPartnership` sempre gravava
  `ended_career_date = started_career_date` (nenhum dos 4 call sites
  passava uma data real) — toda parceria encerrada mostrava "período
  junto" = 0 dias. Corrigido (4º parâmetro `endedCareerDate`, todos os
  call sites atualizados).
- **Treinador** — **lacuna real, sem equivalente a Partnership**: trocar
  de treinador sempre sobrescrevia `coach_id`/`coach_name` sem nenhum
  rastro do anterior. Nova entidade `CoachTenure` (Parte 7).
- **`Relationship`** (`src/lib/relationships.js`) — 2 lacunas reais: (1)
  só o parceiro acumulava `shared_wins`/`shared_losses`; adversário só
  tinha `shared_matches` (H2H real impossível); (2) `processMatchRelationships`
  só era chamado em partida de TREINO — partida oficial de torneio nunca
  alimentava rivalidade nenhuma. Ambas corrigidas.
- **`Match.press_importance`** (Fase 12, `getRoundPressImportance`) — já
  uma pontuação real e não-arbitrária (tier + rodada + upset + vitória)
  persistida em cada partida oficial. Reaproveitada integralmente como
  definição de "momento marcante" (Parte 4) — nenhuma heurística nova.
- **Ranking** — `rankingMilestoneCrossed` (`gameStateLifecycle.js`) já era
  um detector de transição real (não um "está <= threshold" estático),
  mas com só 4 degraus (1/10/100/500) — desalinhado da escada de 10
  degraus já usada por conquistas e pela timeline. Estendido.
- **Living World / Imprensa / Entrevistas** — 3 sistemas paralelos e
  independentes, cada um decidindo o que é notícia com sua própria lógica
  (`publishMatchNews`, finalização de torneio grava `PressArticle`+
  `Post`+`HistoryEntry`, `getPendingInterviews`). Nenhum ponto único de
  disparo. Tournament finalizado JÁ gera imprensa; marco de RANKING não
  gerava — lacuna real coberta (Parte 11).
- **`HistoryEntry`** — achado colateral: `tournamentLifecycle.js` e
  `gameStateLifecycle.js` já escrevem linhas de `HistoryEntry` com
  `profile_id` (categoria `'carreira'`, fora do enum documentado da
  entidade), mas `History.jsx` (página "História do Padel") lê de um
  array estático (`historyData.js`), nunca da entidade — essas linhas são
  **órfãs** (persistidas, nunca lidas). Não corrigido nesta fase
  (consumi-las duplicaria a Timeline já mais rica; um novo consumidor
  seria escopo à parte) — disclosed.
- **Notificações** — dedupe canônico já existe:
  `buildStableMessageId(profileId, contextKey)` +
  `upsertCareerMessage(profileId, contextKey, payload)`
  (`careerCommunications.js`), chave `<domínio>:<id>`. Reaproveitado
  integralmente — nenhum mecanismo novo.

## Parte 2 — "Career Story Engine"

Não foi criado um motor novo. `src/lib/careerStory.js` (puro) foi
estendido com `getNotableMatches`, `getTopRivalry`/`getRivalries`,
`describePartnershipHistory`, e `buildCareerTimeline` ganhou os novos
tipos de evento + importância. Como a arquitetura pura de careerStory.js
não deveria passar a escrever notificações, um arquivo pequeno e separado
— `src/lib/careerStoryEvents.js` — cuida só do disparo deduplicado
(`evaluateCareerMatchMilestones`), reaproveitando `upsertCareerMessage`.

## Parte 3 — Escada de ranking unificada

`RANKING_MILESTONES` (`gameStateLifecycle.js`): `[1,10,100,500]` →
`[1,3,5,10,20,30,50,100,250,500]` — mesma escada de `achievementsData.js`
(`reach_rank`) e `careerStory.js` (timeline). Zero mudança na lógica de
`rankingMilestoneCrossed` (já era um detector de transição correto).

## Parte 4 — Momentos marcantes

`getNotableMatches` reaproveita `Match.press_importance` (`'high'`/`'global'`)
— já calculado no momento da partida a partir de tier do torneio + rodada
+ upset + vitória. Partida de treino nunca tem esse campo, então nunca
entra. `'simple'`/`'medium'` nunca viram momento.

## Parte 5 — Rivalidades emergentes

`getTopRivalry`/`getRivalries`: limiar de 3 confrontos, dados reais de
`Relationship` (`shared_matches`/`wins`/`losses`/`finals`, corrigidos na
Parte 1). Nenhuma pontuação sintética exposta. Limitação real e assumida:
adversário identificado por NOME (Match/Relationship não guardam
athlete_id de oponente) — documentado, não escondido.

## Parte 6 — História das duplas

`describePartnershipHistory` formata (não recalcula) `Partnership` já
buscado pela página: melhor parceria por títulos, mais partidas, mais
longa (agora com duração real, pós-correção do bug de `endPartnership`).

## Parte 7 — História dos treinadores

Nova entidade `CoachTenure` (`base44/entities/CoachTenure.jsonc`).
`hirePrimaryCoach` fecha o período ativo (OVR de fim real) e abre um novo
(OVR de início real) a cada contratação. `getCoachTenureHistory` computa
títulos-durante-o-período sob demanda via `Match` reais (nenhum contador
novo, nenhuma causalidade inventada — formato "OVR 64 → 72, 2 títulos").
Saves antigos (treinador ativo sem `CoachTenure` prévia): reconstrói o
período com `coach_hired_date` real na próxima troca, `ovr_start: null`
(nunca inventado), marcado `end_reason:'backfill'`.

## Parte 8 — Timeline com importância

3 níveis (`major`/`important`/`normal`) por tipo de evento.
`CareerTimeline.jsx` mostra major+important por padrão; `normal` (hoje só
"experiência de carreira") fica atrás de "ver mais"
(`CollapsibleSection`).

## Parte 9 — Home

`careerMoments.js` já implementava exatamente o pedido ("no máximo 1
destaque narrativo", nunca compete com CTA operacional — `CareerHub.jsx`
já suprime torneio/lesão quando duplicam outro painel). Só o bug de
detecção (Parte 1) foi corrigido; nenhum painel novo adicionado.

## Parte 10 — Notificações

Marcos de partida (1ª oficial/vitória/título, vitória sobre Top10/#1) via
`evaluateCareerMatchMilestones`, chamado ao lado de `syncPlayerAchievements`
em `TournamentModal.jsx` (mesmo `achievementContext`, zero consulta
extra). Chave `career-milestone:<id>` (1ª vez: estática; beat-top10/rank1:
por partida, já que podem se repetir — evita reabrir como não-lida uma
notificação antiga). Marcos de ranking: chave `ranking-milestone:<n>` já
existente, escada estendida (Parte 3).

## Parte 11 — Imprensa / Living World

Torneio finalizado já gera `PressArticle`+`Post`+`HistoryEntry` (não
tocado). Lacuna real coberta: marco de ranking agora também gera
`PressArticle`+`Post` (mesmo evento, mesmo `createOptional` best-effort já
usado no arquivo). Nenhum `CareerNewsEngine2` criado.

## Parte 12 — Conquistas

Nenhuma sobreposição de lógica nova: `evaluateCareerMatchMilestones` só
lê `achievementContext` (já calculado pelo motor de conquistas) e nunca
concede XP/moedas — a única fonte de recompensa continua sendo
`syncPlayerAchievements`.

## Parte 13/14 — Save/load, idempotência, saves antigos

Todo disparo novo reaproveita `upsertCareerMessage` (dedupe já
comprovado). `endPartnership`/`hirePrimaryCoach` são seguros a
reinvocação (update/idempotente por construção). Saves antigos: ver Parte
7 (backfill honesto, nunca inventado).

## Parte 15 — Performance

`buildCareerTimeline`/`getNotableMatches`/`getTopRivalry` com 1000
partidas: <10ms (medido, `test:career-story-performance`), escala
sub-quadrática.

## Não alterado

Match/Rally Engine, Live Coach, ranking algorithm, curva de OVR,
`potential` (Fase 13.1), dificuldade, tutorial, economia, torneios novos,
bracket, checkpoint/resume, calendário, notificação de conquista
(tiering pré-existente reaproveitado, não alterado).

## Testes novos

`test:career-story-engine`, `test:career-milestones`,
`test:career-rivalries`, `test:career-partnership-history`,
`test:career-coach-history`, `test:career-story-idempotency`,
`test:career-story-performance` (73 gates no total). `test:career-legacy-integrity`
(pré-existente) atualizado — 1 fixture usava campos que a Match real nunca
escreve (mesma classe de bug corrigida em `buildSeasonRetrospectives`).

## Typecheck

Baseline 2036 (pós-M4.2.2) → 2046 (+10). Toda a diferença é da MESMA
categoria sistêmica já documentada em fases anteriores (`entities`
tipado como `{}`; props opcionais sem valor default inferidas como
obrigatórias sob `checkJs`) — aplicada a código genuinamente novo (a
entidade `CoachTenure` e o componente `CareerIdentitySummary.jsx`), não
uma categoria nova de erro. Nenhum é real (roda corretamente).
