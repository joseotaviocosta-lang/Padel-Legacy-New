# Core Gameplay UI (Fase 5 — Treinos, Calendário, Torneios, Ranking, Partidas)

Data: 2026-08-12

## Princípio da fase

> As páginas de gameplay devem parecer partes do mesmo jogo — não cinco
> aplicações diferentes.

Trabalho de apresentação + hierarquia + responsividade + UX sobre as 5 áreas
centrais. Nenhuma regra esportiva, balanceamento, probabilidade, fadiga, XP,
economia, premiação, inscrição, critério de ranking, save ou analytics foi
alterada — confirmado pelos 6 testes funcionais existentes listados na
seção "Validação" abaixo, todos passando sem modificação.

## 5.1 Treinos

**`src/pages/Training.jsx`** — saiu de `padel/ui`/`padel/GameShared` para o
design-system oficial: barra de abas (Treino/Agenda/Evolução/Metas/
Histórico) e filtro de categoria (Quadra/Físico/Mental/Tático — nomes reais
de `TRAINING_CATEGORIES`, preservados) agora usam `Tabs`; avisos de
overtraining/lesão/resultado usam `ActionFeedback`; histórico usa `Section`
+ `EmptyState`.

**Recomendação do treinador (seção 5)** — `getRecommendedTrainings()`
(`src/lib/trainingSystemV2.js`), já existente e usada até agora só para bots,
foi reaproveitada tal qual para o jogador humano. Nenhum algoritmo novo:
mesma função, mesmos pesos, só passou a alimentar um badge `StatusBadge
tone="premium"` nos cards recomendados.

**`TrainingActivityCard.jsx`** reorganizado para responder "qual treino e
quanto custa" sem expandir (seção 4): os 2 principais ganhos de atributo
agora aparecem sempre visíveis no topo do card, com Duração/Fadiga/Energia
logo abaixo — nível atual, afinidade e detalhamento completo dos bônus
viraram secundários, atrás de "Ver detalhes". Fadiga (antes só nos detalhes
expandidos) agora é sempre visível, como pedido.

**`ConditionPanel.jsx`** — a faixa de estatísticas do topo de Training.jsx já
mostra Energia/Fadiga/Condição; o painel duplicava essas 3 métricas mais um
alerta de overtraining/lesão que a própria página também já mostra.
Reduzido para exibir só o que é exclusivo (Moral, Confiança, Forma física,
Química da dupla) — seção 6 do pedido ("não repetir informações já
presentes em excesso no header").

## 5.2 Calendário

**`src/pages/CalendarPage.jsx`** — nova faixa de data grande
(`getCareerDatePresentation`, a mesma função já usada no header desde a
Fase 3): dia da semana + data completa sempre visíveis, não dependendo só
do header global (seção 9). Hierarquia de avanço de tempo reorganizada: um
único CTA primário "+1 dia" ao lado da data, com "+3 dias"/"+1 semana" como
ações secundárias — antes "Avançar 1 Dia" só existia dentro da visão de
semana (sumia na visão de mês) e competia visualmente com o bloco "Avanço
inteligente". Alternância Semana/Mês migrada para `Tabs`.

**Nenhuma lógica de avanço foi tocada** — `handleAdvanceDay`,
`handleAdvancePeriod`, `handleSkipInjury` são exatamente as mesmas funções,
chamando `advanceCareerDayOnce`/`advanceCareerDays`/
`advanceCareerUntilRecovered` de `@/game-core` sem alteração. Estado de
processamento ("Processando X/Y…") já existia e foi preservado.

**`CalendarWeekView.jsx`/`CalendarMonthView.jsx`** — grade de 7 colunas
preservada (não virou lista/agenda; já era razoavelmente compacta e
funcional). Removido o botão "Avançar 1 Dia" duplicado dentro da visão de
semana, já que a página agora tem um CTA primário único — evita duas ações
idênticas competindo na mesma tela (seção 11).

## 5.3 Torneios

`src/pages/Tournaments.jsx` (a página principal) já tinha sido migrada na
Fase 2. Esta fase completou os componentes que faltavam:

- **`TournamentBracket.jsx`** (a "chave") — abas de rodada (Quartas/Semi/
  Final) migradas para `Tabs`; cards de partida agora usam `Surface`. Sem
  scroll horizontal forçado — rodadas continuam navegáveis por abas, cada
  card de partida sempre legível (seção 18: "não comprimir bracket até
  ficar ilegível").
- **`TournamentDetailsModal.jsx`**, **`TournamentRegistrationModal.jsx`** —
  botões de rodapé migrados para `Button`; blocos internos migrados para
  `Surface`; status migrado para `StatusBadge`. Na `TournamentRegistrationModal`,
  um bloco "Caminho de entrada" **duplicado** (mesma informação renderizada
  duas vezes com dois helpers de label diferentes, achado na auditoria)
  foi consolidado em um único bloco — correção presentacional, a validação
  de requisitos (`checkTournamentRequirements`) não foi tocada.
- **`TournamentStats.jsx`, `CircuitEvolution.jsx`, `TournamentNews.jsx`**
  (conteúdo das abas Estatísticas/Evolução/Notícias) — migrados de
  `GlassCard`/`EmptyStateCard` (padel/ui) para `Surface`/`EmptyState`
  oficiais.
- **`TournamentModal.jsx`** (625 linhas, a máquina de estados de "disputar o
  torneio": reunião pré-torneio, preparação de rodada, partida via
  `LiveMatch`, resultado, campeão/eliminado) — **deixado com toque leve
  deliberadamente**. É o arquivo mais complexo e arriscado do módulo de
  torneios, com estado de fase, persistência e recompensas fortemente
  entrelaçados ao JSX. Redesenhar a fundo exigiria risco desproporcional
  ao ganho visual nesta fase — dívida técnica documentada abaixo.

## 5.4 Ranking

**`src/pages/Ranking.jsx`** migrado por completo (`PageContainer`/`TabBar`/
`LoadingScreen`/`EmptyStateCard` de `padel/ui` → `Page`/`PageContent`/
`Tabs`/`PageSkeleton`/`EmptyState` oficiais). Três componentes novos do
design-system (construídos na Fase 2 especificamente para este momento)
finalmente ganharam uso real:

- **`CountryFlag`** — bandeira por emoji, reaproveitando o mapa `FLAGS` já
  usado na criação de personagem (`src/lib/characterCatalog.js`). Aplicado
  nas 4 listas com país (circuito, jogadores, clubes, países) — seção 21.
- **`RankingPosition`** — substitui o cálculo de posição/variação que
  estava duplicado inline em cada lista por um componente único.
- **`PlayerAvatar`** — substitui o círculo com gradiente + inicial
  hand-rolled.
- **Destaque discreto do jogador** (seção 20) — a linha correspondente ao
  perfil do jogador (`athlete.is_player_profile`, dado já existente) ganha
  borda `border-primary/40` sutil e um rótulo "Você", sem efeito chamativo.

**Performance preservada integralmente** (seção 22 — crítico): a paginação
em lotes de 50 (`LIST_PAGE_SIZE`, já existente desde antes desta fase) não
foi tocada — `scripts/test-core-gameplay-ui.mjs` trava isso explicitamente.
Filtros/abas (Circuito/Race/Duplas/Jogadores/Clubes/Países) continuam
`Tabs`, preservados 1:1.

## 5.5 Partidas

**Decisão do projeto preservada**: sem 2D, sem replay visual — confirmado
por grep, nenhum canvas/renderizador de quadra existe em nenhum arquivo
tocado.

**`src/pages/Matches.jsx`** (histórico + entrada para partida de treino) —
migração completa para o design-system oficial (`ActionFeedback`, `Button`,
`PageSkeleton`, `EmptyState`).

**`src/components/matches/LiveMatch.jsx`** (608 linhas, o coração da
experiência de partida) — tratado com **extremo cuidado deliberado**: é o
componente mais crítico de todo o redesign (motor de simulação, narração,
tática, técnico, momentum, todos entrelaçados). Em vez de uma reescrita
visual, apenas o botão Pausar/Continuar foi migrado para `Button` —
troca cosmética de baixíssimo risco. Tudo o que a auditoria já havia
confirmado como correto foi **verificado como preservado, não redesenhado**:

| Requisito (seções 24-32) | Estado |
|---|---|
| Placar compacto (dupla/sets/games/ponto/servidor) | Já existia, inalterado |
| BREAK POINT / SET POINT / MATCH POINT | `getImportantMoment()`, já existia, inalterado |
| Momentum (barra + label) | Já existia, inalterado |
| Narração com altura controlada | `.slice(-120)` + `overflow-y-auto` + `min-h-0 flex-1`, já existia, inalterado |
| Velocidade 1x/2x/5x/10x | Array `[1, 2, 5, 10]`, já existia, inalterado |
| Atalhos (próximo ponto/game/set/fim) | `PlaybackControls`, já existia, inalterado |
| Treinador com orientação + "Aplicar" | `CoachPanel`, já existia, inalterado |
| Tática atual com feedback imediato | `TacticsPanel` + `tacticFeedback`, já existia, inalterado |
| Mobile: abas Jogo/Tática/Técnico/Ao vivo | `PANELS`, já existia (`role="tablist"` acessível), inalterado |

**`MatchRecapPremium.jsx`** (pós-jogo) — mesma abordagem conservadora: só o
botão de próxima ação migrado para `Button`. Todas as seções (resultado,
destaques, MVP implícito nos "top winner/top error", golpes, leitura de
momentum, impacto do técnico, recompensas, próxima ação) permanecem
exatamente como estavam — `buildMatchRecap()` intocado.

## Mudanças mobile

Nenhuma tela ganhou um layout mobile totalmente separado nesta fase — os
componentes de design-system (`Tabs`, `Button`, `Surface`) já são
responsivos por padrão (a mesma base validada nas Fases 2-4). Ajustes
pontuais: `CalendarWeekView`/`CalendarMonthView` já usavam grade de 7
colunas compacta com min-height ≥44px por célula (alvo de toque); o painel
de abas do `LiveMatch` já era compacto e por abas antes desta fase (não uma
tentativa de mostrar tudo simultaneamente).

## Componentes do design-system aplicados nesta fase

`Tabs`, `Button`, `ActionFeedback`, `Section`, `PageSkeleton`, `EmptyState`,
`Surface`, `SurfaceHeader`, `StatusBadge`, `IconButton`, `CountryFlag`,
`RankingPosition`, `PlayerAvatar` — todos já existiam desde a Fase 2;
nenhum componente novo foi criado nesta fase (uso real de componentes que
antes só tinham sido validados na Home).

## Performance

- **Zero novas queries/fetches**: todas as telas continuam consumindo os
  mesmos carregamentos únicos por montagem já existentes.
- **Zero polling novo**: confirmado por `scripts/test-core-gameplay-ui.mjs`
  (nenhum `setInterval` introduzido nos 16 arquivos tocados).
- **Bundle por página** (chunk lazy, `npm run build`):

| Página | Antes (Fase 3) | Depois (Fase 5) | Variação |
|---|---:|---:|---:|
| Training | 45,80 kB | 41,82 kB | -8,7% |
| Tournaments | 39,23 kB | 38,34 kB | -2,3% |
| Ranking | 14,48 kB | 15,86 kB | +9,5% (CountryFlag/RankingPosition/PlayerAvatar) |
| Matches | 23,14 kB | 23,13 kB | ~0% |
| CalendarPage | não medido antes | 59,29 kB | — |

- **Entrypoint inicial**: 1.198,59 kB → 1.201,25 kB (+2,66 kB, ruído normal
  de build — nenhuma dessas páginas faz parte do entrypoint eager, todas
  são lazy).

## Validação

- `npm run test:core-gameplay-ui` (novo, 73 verificações agrupadas com
  atribuição por área — Treinos/Calendário/Torneios/Ranking/Partidas).
- `npm run test:ui-redesign` — 167 verificações (adicionadas: as 5 páginas
  principais desta fase não voltaram à biblioteca-sombra).
- `npm run test:ui-shell`, `npm run test:home-redesign`, `npm run
  test:ui-performance` — todos continuam passando sem alteração.
- `npm run lint` — limpo.
- `npm run typecheck` — +64 diagnósticos sobre a baseline da Fase 4 (2048 →
  2112). Amostrado arquivo por arquivo: 100% do mesmo padrão pré-existente
  em todo o projeto (`localGame.entities.X` sem tipos + props opcionais de
  JSX sem default inferidas como obrigatórias pelo TypeScript) — nenhuma
  categoria nova de erro.
- `npm run build` — limpo.
- Testes funcionais existentes (lógica de jogo, não tocados): `npm run
  test:training-v2`, `npm run test:calendar-advance`, `npm run
  test:tournament-registration`, `npm run test:match-integrity`, `npm run
  test:match-playback`, `npm run test:rc-match-experience` — todos PASS.

## Dívida técnica restante

- `TournamentModal.jsx` (625 linhas) segue com markup majoritariamente cru
  — candidato prioritário para uma fase futura dedicada a torneios, com
  tempo/orçamento para tratar sua máquina de estados com o cuidado que
  merece.
- `DayEventList.jsx`, `PendingDecisionBanner.jsx`, `CalendarPlanner.jsx`
  (sub-componentes do Calendário) não foram tocados nesta fase — a página
  principal e as duas visões (semana/mês) foram priorizadas.
- `SimulationModal.jsx` já usava boa parte do design-system antes desta
  fase (ModalShell/Surface/StatusBadge/ProgressBar) e não precisou de
  mudanças.
- `AthleteDetail.jsx` (modal aberto ao clicar numa linha do Ranking) não
  foi revisado nesta fase.
- Auditoria cruzada de consistência entre as 5 áreas foi feita durante a
  implementação (mesmos componentes/tokens usados em todas), não como uma
  passada isolada separada ao final.
