# Tutorial 4.0 — Unificação de Missões e Conquistas

## O problema (QA real)

A última etapa do tutorial ("jogue sua primeira partida") inscreve o jogador
num torneio real — que só começa 7-8 dias depois. O CTA, porém, mandava o
jogador para Partidas/Treino, e concluir uma partida de treino marcava a
etapa como feita indevidamente. Além disso, o jogo acumulou cinco sistemas
de "coisas para fazer" que se sobrepõem: tutorial, missões diárias/semanais/
mensais/sazonais e conquistas — com objetivos de longo prazo duplicados
entre missões e conquistas.

**Resultado desta fase:** dois conceitos claros — **Tutorial** (ensina a
jogar, uma vez) e **Conquistas** (acompanha a evolução da carreira, longo
prazo) — numa única página, "Objetivos".

## Causa raiz do bug (e correção)

1. **Falso positivo de conclusão.** `deriveTutorialFacts` (`tutorialState.js`)
   calculava `matchCompleted` a partir de `player.matches_played > 0` — um
   contador incrementado tanto por partidas de treino quanto oficiais. As
   linhas de `Match` já carregam os campos reais que distinguem os dois
   casos (`competition_type`, `is_official`, `is_tournament`, gravados desde
   sempre pela finalização de treino e de torneio). Corrigido para exigir
   `matches.some(m => m.competition_type === 'tournament' && m.is_official === true)`.

2. **CTA errado.** A etapa `first-match` apontava estaticamente para
   `/matches` (Partidas de treino), replicado de forma independente em três
   lugares (Home, Guia flutuante, página de Missões). Corrigido com um novo
   helper único, `src/onboarding/firstMatchDestination.js`
   (`resolveFirstMatchAction`), que delega para as funções de estado de
   torneio já existentes (`getTournamentNextAction`, `buildTournamentPlayRoute`,
   recovery de checkpoint) e cobre as 4 situações reais: não inscrito,
   inscrito com estreia futura, dia da partida, partida interrompida.

## Sistemas removidos

As 14 missões diárias/semanais/mensais/sazonais (`EXTRA_MISSIONS` em
`Missions.jsx`, espelhadas em `src/missions/periodicMissionCatalog.js`)
foram classificadas e removidas como sistema:

- **11 são checklist repetitivo** (treine 3x na semana, leia notícias, etc.)
  — não agregavam nada que a progressão normal já não incentivasse.
- **3 duplicavam conquistas já existentes no catálogo**: `season-wins`
  (vença 25 partidas) ≈ "Vencedor Iniciante"; `season-tour` (participe de 12
  torneios) ≈ escada de participação em torneios; `season-titles` (vença 3
  torneios) ≈ "Tricampeão". Nenhuma migração de conteúdo foi necessária — o
  equivalente já existia.

`src/missions/periodicMissionCatalog.js` foi deletado.

## Conquistas: de sistema inerte a fonte canônica

A auditoria revelou que o catálogo de conquistas (~175 entradas em
`achievementsData.js`) nunca era realmente usado: a entidade `Achievement`
era semeada a partir de um array de 4 itens com campos que não batiam com o
schema (`title`/`is_hidden` em vez de `name`/`visibility`), e nada no jogo
jamais criava uma linha `PlayerAchievement`. Isso inverte a premissa da
Parte 10 do briefing ("se Conquistas já tem a melhor infraestrutura, use
Conquistas") — na prática, Missões tinha o pipeline funcional; Conquistas,
nenhum.

**Decisão:** ativar Conquistas como fonte única de progressão de longo
prazo (satisfazendo a intenção de UI do briefing), mas com um motor de
avaliação novo e deliberadamente estreito — `src/lib/achievementEngine.js`
— que só avalia os `trigger_type`s com um dado seguro e já existente:
`join_tournament`, `win_tournament`, `complete_training`, `advance_day`,
`reach_age`, `reach_rank`. As demais ~150 entradas do catálogo continuam
visíveis (bloqueadas), exatamente como antes — nunca pioram, e agora pelo
menos renderizam corretamente.

**Exclusão deliberada:** `play_match`/`win_match` ficaram de fora da lista
segura. `profile.matches_played`/`wins` são contadores só de partida de
treino (confirmado lendo `tournamentLifecycle.js` vs `progression.js`) —
usá-los teria reintroduzido a mesma classe de bug do tutorial dentro do
motor de conquistas.

## Página única: "Objetivos"

`/game/missions` agora tem duas abas apenas — **Tutorial** e **Conquistas**
(`AchievementsPanel.jsx`, novo componente reaproveitável). A antiga rota
`/achievements` virou um redirect para `/game/missions?tab=achievements`
(sem quebrar links salvos). O nome no menu mudou de "Missões e objetivos"
para "Objetivos"; a entrada de navegação separada "Conquistas" foi removida.

A Home (`seasonCareerPlan.js`) também parou de ter sua própria escada de
metas de ranking — passa a ler a próxima conquista de ranking bloqueada
(`findNextLockedAchievement`) da mesma fonte que a aba Conquistas usa.

## Saves antigos

Nenhum dado é apagado. Linhas de `Mission` com `mission_type` periódico
(`diaria`/`semanal`/`mensal`/`sazonal`) que ainda existirem num save antigo
são arquivadas (`is_active:false, retired_reason:'periodic_missions_removed_v40'`)
na próxima sincronização do catálogo — nunca deletadas. As linhas de
`MissionProgress` associadas (incluindo recompensas já reivindicadas) não
são tocadas: nada é re-concedido, nada é revogado. O padrão espelha o que
`ensureTutorialMissionCatalog` já fazia para catálogo de tutorial obsoleto.

## O que não mudou

Motor de partidas, balanceamento, ranking, bracket, calendário, Live Coach,
treinador/mercado de treinador, economia (sem evidência), checkpoint/resume,
entrevistas, Living World — nenhum desses sistemas foi alterado. As novas
avaliações de conquista são chamadas ao lado de chamadas já existentes de
`incrementMissionProgress` (ex.: `TournamentModal.jsx` pós-partida), nunca
dentro da lógica interna desses sistemas.

## Resultado em uma frase

Faça o tutorial para aprender a jogar e acompanhe suas conquistas para ver a
evolução da carreira.

## Testes

- `test:tutorial-first-official-match` — partida de treino não conclui a
  etapa `first-match`; partida oficial conclui; os 4 estados de CTA
  (futura/hoje/recovery/não-inscrito).
- `test:tutorial-complete-flow` — pipeline completo, identidade → dupla →
  treinador → treino → inscrição → torneio → partida oficial → tutorial
  concluído; assertiva explícita de que uma partida de treino no meio do
  caminho não conclui nada.
- `test:missions-achievements-unification` — sistemas periódicos removidos
  do código e da UI, sem objetivo de longo prazo duplicado, migração de
  saves antigos idempotente e não-destrutiva, página única com 2 abas.
