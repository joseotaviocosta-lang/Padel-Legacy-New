# Centro da Carreira (Fase 4 — Redesign da Home)

Data: 2026-08-12

## Princípio da fase

> Ao abrir o jogo, o jogador deve entender em poucos segundos onde está,
> qual é o próximo objetivo, o que precisa fazer agora, o que aconteceu
> recentemente, o que merece atenção e como está evoluindo.

`src/pages/CareerHub.jsx` foi reescrita para responder a essas seis
perguntas com **7 regiões principais** em vez de ~20 painéis empilhados
sequencialmente. Nenhuma chamada de rede nova foi introduzida: o mesmo
`useEffect` com um único `Promise.all` (inalterado) segue alimentando tudo.

## De ~20 painéis para 7 regiões

| Antes (painéis sequenciais) | Depois (região) | O que aconteceu |
|---|---|---|
| `CareerCommandHeader` + `MyJourneyPanel` (identidade) | **Identidade + contexto** | Fundidos em um único `PageHeader` — nome, país, idade, lado, estilo, ranking, OVR, XP |
| `SeasonCareerPlan` (só a meta de ranking) | **Próximo objetivo** | Extrai só `seasonPlan.goals[0]` (já computado) — os outros 3 goals (desenvolvimento/dupla/estrutura) viraram chips na região Evolução |
| `MyJourneyPanel` (mini "próximo evento") + `ActiveTournamentBanner` | **Próximo evento** | Nova função pura `buildNextEvent()` — sem fetch novo, só prioriza lesão > torneio ativo > próximo torneio > agenda livre sobre dados já carregados |
| `NextStepCard` (mantido) + `DailyCareerBriefing` + parte de `CareerDecisionCenter` + `CareerCalendar` | **O que fazer agora** | CTA principal = `getNextStep()` (motor determinístico já existente, reaproveitado de `NextStepCard.jsx`); lista secundária = `buildPriorityActions()`, que mescla `dailyBriefing.priorities` + entrevista disponível + decisões críticas, sem duplicar o que já é o CTA |
| `CareerFeed` + `RecentActivity` + "aconteceu recentemente" de `MyJourneyPanel` | **Sua jornada** | Timeline única agrupada por dia (Hoje/Ontem/N dias atrás) via `buildJourneyTimeline()`, mesma fonte de eventos que o antigo `CareerFeed` já mesclava |
| `WeeklyCareerReview` (componente completo) | **Evolução** (metade) | Só `weeklyReview.metrics` (4 números já computados) — o card cheio não é mais renderizado |
| `CareerDecisionCenter` (componente completo) + `InboxControl` | **Atenção e oportunidades** (metade) | Lista de decisões que **não** apareceram em "O que fazer agora" (deduplicado por rota) + atalho de propostas de dupla |
| `TournamentAndNews` (torneios) + `WorldPulse` | *(removido)* | Redundante com "Próximo evento", que já cobre torneios |
| `TournamentAndNews` (notícias) | **Mundo** | Reduzido a 1–3 destaques + link "Ver mundo" |
| — | **Ações rápidas** | Nova barra pequena e secundária: Calendário/Torneios/Ranking/Missões |
| `PremiumQuickStats` (5 stat cards) | *(removido)* | 100% redundante: Energia/Fadiga já no header (`CareerHud`), Ranking individual já em "Próximo objetivo", Ranking dupla já na identidade, "Próximo marco" já em "Próximo evento" |
| `StatusStrip` | *(removido, parcial)* | Energia/Dinheiro redundantes com o header; Moral/Seguidores (dados únicos) não foram migrados — ver dívida técnica |
| `CareerSnapshot` | *(removido)* | Totais de carreira (partidas/vitórias/aproveitamento) já têm página dedicada (`/game/stats`), agora linkada a partir de "Evolução" |
| `ActiveMissionPanel` | *(removido, parcial)* | Contagem de missões ativas virou um badge em "Ações rápidas"; a lista detalhada de progresso continua em `/game/missions` |
| `MedicalCenterPanel`, `StrategicCareerPanel` | **Ferramentas de gestão** (recolhido) | **Nenhuma funcionalidade removida** — contratar equipe médica, aplicar tratamento e aceitar plano semanal continuam 100% operantes, só ficam atrás de um `<button aria-expanded>` fechado por padrão em vez de sempre expandidos competindo com o essencial |
| `MedicalStatusPanel` | Condicional | Só renderiza quando o jogador está realmente lesionado (antes mostrava um card "Condição médica: apto" mesmo saudável, ocupando espaço à toa) |
| `CareerMomentBanner` | Mantido, reposicionado | Ainda condicional (retorna `null` na maioria das vezes); movido para logo abaixo dos banners de relatório, antes da identidade |
| `CareerCalendar`, `CareerStatusBar`, `PartnerSelection`, banners de tutorial/relatório/torneio ativo | Mantidos, inalterados | Nenhuma mudança de lógica — só reposicionados na nova hierarquia |

## As 7 regiões (ordem de leitura)

1. **Identidade + contexto** — `PageHeader` único: nome, país · idade · lado · estilo (`profile.court_side`/`profile.play_style`/`profile.archetype_label`), badges de Ranking/OVR/XP (XP com `TooltipHint`, seção 25), pendências.
2. **Próximo objetivo + Próximo evento** (grid `xl:col-span-7`/`xl:col-span-5`) — meta de ranking com `#atual → #alvo` e barra de progresso; evento mais urgente com prioridade lesão > torneio ativo > próximo torneio > "agenda livre".
3. **O que fazer agora** (`xl:col-span-7`) + `CareerCalendar` (`xl:col-span-5`) — CTA contextual único + até 5 itens secundários; `CareerCalendar` traz o "Avançar dia" com todo o contexto diário (treinos/jogos restantes, energia, química, decisão obrigatória bloqueando).
4. **Sua jornada** — timeline compacta, sem grade de cards.
5. **Evolução + Atenção** (`xl:col-span-7`/`xl:col-span-5`) — métricas semanais + metas da temporada em chips | decisões pendentes não duplicadas.
6. **Mundo + Ações rápidas** (`xl:col-span-8`/`xl:col-span-4`) — 1–3 notícias | atalhos secundários.
7. **Ferramentas de gestão** — recolhido por padrão, expande para Centro Médico + Leitura Estratégica.

## Regra do CTA contextual

`getNextStep(profile, upcomingTournaments)` — reaproveitada de
`src/components/career/NextStepCard.jsx` (mesma função, mesma ordem de
decisão), não duplicada: aposentado → sem lado escolhido → pontos de
atributo não distribuídos → sem parceiro (abre o modal `PartnerSelection`
direto, sem sair da Home) → lesionado → torneio jogável este mês → energia
baixa → treinar. Determinístico, sem pontuação nem IA nova.

## Regra de "O que fazer agora" (seção 8)

`buildPriorityActions()` — mescla, nesta ordem, só dados já computados:

1. Entrevista disponível (detectada em `messages` via
   `related_entity_type === 'PressInterview'`, a mesma mensagem que já
   chegava pela Central de Comunicações — nenhuma consulta nova).
2. Decisões `critical`/`high` de `buildCareerDecisionCenter()` (já existia).
3. Prioridades de `buildDailyCareerBriefing()` (já existia).

Item deduplicado por rota contra o CTA principal — nunca mostra a mesma
ação duas vezes.

## Desktop

Grid `xl:grid-cols-12` com proporções assimétricas (7/5, 7/5, 8/4) — nunca
duas colunas de mesma largura lado a lado (seção 16). Em 1366×768, a
primeira tela mostra identidade + objetivo/evento + o topo de "O que fazer
agora" sem rolagem excessiva (seção 18). Em 1920×1080, `Page size="wide"`
já limitava a largura máxima antes desta fase — mantido.

## Mobile

Sem grid próprio: todas as regiões usam `grid-cols-1` por padrão e só
ganham colunas a partir de `xl:` (1280px) — no mobile tudo empilha na
ordem do DOM, que já segue a prioridade pedida (identidade → objetivo →
evento → o que fazer agora → jornada → evolução → mundo). Única diferença
deliberada do pedido original: Objetivo e Evento ficam **juntos antes** de
"O que fazer agora" nas duas plataformas (não só objetivo antes e evento
depois) — mantém contexto (meta + urgência) visível antes de qualquer ação,
e evita duas ordens de DOM diferentes por breakpoint (mais simples, menos
frágil que reordenar via CSS `order-*`).

## Loading e estados vazios

- Carregamento inicial: `PageSkeleton variant="dashboard"` (esqueleto
  estruturado, não bloqueia com um spinner cru).
- Cada região usa `EmptyState compact` quando não há dado (jornada sem
  eventos, atenção sem pendências, mundo sem notícias, objetivo
  indisponível) — nunca ocupa mais que um card pequeno (seção 21).
- Nenhuma seção teve loading próprio: como antes, tudo carrega de um único
  `Promise.all`; não há "loading por região" real porque não há fetch por
  região — a seção 20 do pedido é satisfeita pelo skeleton único cobrir bem
  o tempo de carregamento (curto, save local, sem rede).

## Decisões de performance

- **Zero fetches novos.** Mesmo `useEffect`, mesmos 14 `Promise.all`,
  inalterados.
- **`useMemo` em toda derivação nova** (`heroStep`, `nextEvent`,
  `priorityActions`, `attentionItems`, `journeyGroups`) e nas 6 chamadas de
  builder já existentes (`careerMoment`, `dailyBriefing`, `decisionCenter`,
  `weeklyReview`, `seasonPlan`, `strategicState`) — antes eram recalculadas
  a cada render sem memoização; agora só recalculam quando as dependências
  mudam.
- **Sem `JSON.stringify`, sem ordenação de listas grandes**: todas as
  funções puras novas operam sobre arrays já limitados a ≤8 itens
  (`recentMatches`, `recentTrainings`, `messages`, `posts`,
  `partnerOffers` — os mesmos limites de antes).
- **Sem polling novo** — confirmado por `scripts/test-home-redesign.mjs`
  (nenhum `setInterval` em `CareerHub.jsx`).
- **Bundle da Home caiu**: chunk `CareerHub-*.js` foi de 94,91 kB para
  68,87 kB (-27%) — menos componentes de painel completo (
  `WeeklyCareerReview.jsx`, `CareerDecisionCenter.jsx`,
  `DailyCareerBriefing.jsx` como blocos de UI) são importados; as funções
  de dados equivalentes (`.js`, sem JSX) são bem mais leves.

## O que NÃO foi feito nesta fase (dívida técnica)

- **Moral e Seguidores** (antes em `StatusStrip.jsx`, via
  `computeMoral`/`computeFollowers` de `src/lib/simulatedData.js`) não
  foram migrados para nenhuma região nova — eram os únicos dois pontos de
  dado não-redundantes desse componente. Podem entrar na região Evolução
  numa passada futura; omitidos agora para não alongar mais o escopo desta
  fase.
- **Variação de ranking** (`#842 ↑12`) continua sem dado histórico
  disponível — mesma lacuna identificada na Fase 3 (header).
- `WeeklyCareerReview.jsx`, `CareerDecisionCenter.jsx`,
  `DailyCareerBriefing.jsx`, `CareerFeed`/`MyJourneyPanel`/
  `PremiumQuickStats`/`CareerSnapshot`/`ActiveMissionPanel`/`InboxControl`/
  `EvolutionPanel`/`TournamentAndNews`/`RecentActivity`/`WorldPulse`
  (as funções locais antigas do próprio `CareerHub.jsx`) foram removidas
  do arquivo. Os **componentes de arquivo próprio** (`WeeklyCareerReview.jsx`,
  `CareerDecisionCenter.jsx`, `DailyCareerBriefing.jsx`,
  `CareerMomentBanner.jsx`, `SmartAgenda.jsx`, `NextStepCard.jsx`,
  `home/StatusStrip.jsx`) continuam existindo em disco — só deixaram de ser
  importados pela Home (`NextStepCard`/`SmartAgenda`/`CareerMomentBanner`
  tiveram sua *lógica* reaproveitada via import de função ou reescrita
  local; os componentes React em si não são mais montados na Home). Nenhum
  arquivo foi apagado — ficam candidatos a limpeza numa auditoria futura,
  como já aconteceu antes com `FeedPanel`/`RankingCards`/`UpcomingPanel` em
  `docs/PROJECT-CLEANUP-AUDIT-RC.md`.
- `src/components/career/CareerHeaderContext.jsx` (pill de contexto no
  header desktop) não foi tocado nem duplicado na Home — continua sendo a
  fonte de "o que está acontecendo agora" no header global.
