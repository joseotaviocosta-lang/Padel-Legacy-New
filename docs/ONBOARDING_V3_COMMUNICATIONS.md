# Onboarding 2.0 (v9) + Central de Notificações — dedup de relatórios

## Estado anterior

QA no Beta Candidate reportou dois problemas:

1. O tutorial estava longo, fragmentado e ainda ensinava hubs legados (`/development`, `/team-hub`, `/competitions`, `/world`, `/management`) que a navegação em grupos (Fase 3) já tinha substituído. A versão 8 tinha 57 etapas obrigatórias.
2. O sino acumulava mensagens repetidas — "Resumo semanal do universo" e "Relatório semanal da comissão" apareciam várias vezes em sequência, badge chegando a 9+.

Este documento foi escrito ao concluir o trabalho: parte dele (a redução do tutorial para 15 etapas, o dedupe por chave estável do resumo semanal/relatório da comissão, e o agrupamento por prioridade do sino) já tinha sido implementada numa sessão anterior nesta mesma branch, mas nunca documentada — os comentários no código já citavam este arquivo antes de ele existir. As seções abaixo cobrem o que já existia e o que foi adicionado agora para fechar as lacunas.

## Onboarding — de 57 para 15 etapas (v8 → v9)

### O que saiu

Tudo que era "visite esta página e confirme que entendeu" para sistemas avançados: equipamentos, loja, comissão técnica completa, imprensa, comunidade, mercado, ranking, mundo vivo, estatísticas, temporada, economia, relacionamentos, história/legado, administração, e os hubs legados (`/development`, `/team-hub`, `/competitions`, `/world`, `/management`). Distribuição manual de atributos (25 pontos) também não existe mais — os atributos iniciais vêm do estilo escolhido.

### Nova sequência (obrigatória, `src/onboarding/tutorialSteps.js`)

| # | Fase | Etapa (`id`) | Rota | Tipo de conclusão |
|---|---|---|---|---|
| 1 | A — Criar o atleta | `career-created` | `/game` | confirm_understanding |
| 2 | A | `athlete-named` | `/game/missions` | perform_action |
| 3 | A | `side-selected` | `/game/missions` | perform_action |
| 4 | A | `difficulty-selected` | `/game/missions` | perform_action |
| 5 | A | `style-selected` | `/game/missions` | perform_action |
| 6 | A | `appearance-known` | `/character` | confirm_understanding |
| 7 | A | `profile-reviewed` | `/profile` | confirm_understanding |
| 8 | B — Formar a dupla | `offers-reviewed` | `/partners` | confirm_understanding |
| 9 | B | `partner-selected` | `/partners` | domain_event |
| 10 | C — Treinador | `coaches-known` | `/coaches` | confirm_understanding |
| 11 | D — Primeiro treino | `first-training` | `/game/training` | domain_event |
| 12 | E — Calendário | `calendar-known` | `/game/calendar` | confirm_understanding |
| 13 | F — Primeiro torneio | `tournament-registered` | `/tournaments` | domain_event |
| 14 | F | `first-match` | `/matches` | domain_event |
| 15 | — | `autonomy` | `/game` | confirm_understanding |

`domain_event`/`perform_action` completam sozinhas quando o jogador faz a ação real (nome preenchido, parceiro escolhido, treino concluído, inscrição confirmada, partida jogada) — sem clique extra. `confirm_understanding` exige o clique explícito no painel do Guia flutuante (`OnboardingGuide.jsx`), para não confundir "só passou pela página" com "de fato leu".

**Decisão deliberada, não alterada nesta correção**: `calendar-known` completa por confirmação, não por exigir um avanço de dia real. Forçar um avanço de dia durante o onboarding teria efeitos colaterais (energia, fadiga, missões) antes do jogador estar pronto para isso; o objetivo da etapa (mostrar onde estão os compromissos e como o calendário funciona) não depende de consumir um dia de verdade.

Fase F (torneio) nunca bloqueia o resto do jogo: se não há torneio disponível ainda, o jogador continua jogando normalmente e o Guia mostra a etapa pendente sem prender nenhuma tela. Essa etapa pode ser concluída dias depois do resto do onboarding.

### Obrigatório vs. opcional

Tudo que saiu do onboarding principal virou **Guia contextual opcional** (`src/onboarding/pageIntroductions.js`, 18 rotas), acessível a qualquer momento pelo botão flutuante verde (`OnboardingGuide.jsx`). Nunca bloqueia a conclusão do onboarding principal.

### Migração de saves antigos

Nenhuma migração de schema foi necessária. `reconcileTutorialProgress` (`tutorialState.js`) escaneia `TUTORIAL_STEPS` (a lista viva) em busca do primeiro id ausente de `completedStepIds`: ids de etapas removidas ficam como entradas inertes (nunca mais procuradas), e a etapa reordenada continua resolvendo pelo conteúdo, não pela posição salva. Um save com uma mistura de etapas válidas e removidas retoma exatamente na primeira etapa viva ainda não concluída; um save só com etapas 100% removidas recomeça do início real (`career-created`) sem crash e sem perder o resto do progresso da carreira. Coberto ponta a ponta por `npm run test:onboarding-v3`.

`TUTORIAL_VERSION` foi de 8 para 9 (`src/onboarding/tutorialSteps.js`) — é só um marcador de revisão de conteúdo, não dispara nenhuma migração própria.

### Bug real encontrado ao validar o pipeline completo

Ao rodar `test:onboarding-v3` ponta a ponta pela primeira vez de verdade (o arquivo já existia mas nunca tinha sido registrado em `package.json`, então nunca rodou em CI), ele revelou um bug genuíno e não relacionado à contagem de etapas: `completeTutorialStep` (`tutorialEngine.js`) busca `Match`/`TrainingSession` para inferir progresso, e essas coleções — nunca inicializadas explicitamente para uma carreira nova — caíam no fallback de conteúdo de demonstração (`LOCAL_SEED`, `src/local/localSeed.js`) via `ensureCollection` (`CareerEntityRepository.js`), remapeado para o `profile_id` real. Isso marcava "primeiro treino" e "primeira partida" como concluídos (com recompensa) na primeira etapa que o jogador confirmasse — antes de treinar ou jogar qualquer coisa. Corrigido em `src/gameplay/services/CareerInitialDataService.js`: `Match`, `TrainingSession` e `MissionProgress` (histórico/progresso pessoal do jogador) nunca herdam conteúdo de demonstração, só identidade (`User`/`PlayerProfile`, já excluídos antes).

### Limpeza de código morto

- `TUTORIAL_CHAPTERS` (export sem nenhum consumidor real no código, com um `unlockAfter: 'world-hub-known'` apontando para uma etapa removida) foi removido de `tutorialSteps.js`.
- Comentário desatualizado em `src/navigation/navigationConfig.js` (afirmava que `/development`/`/team-hub` "são usadas pelo tutorial" — não são mais desde a v9) foi corrigido.

### Testes

- `npm run test:onboarding-v3` — suíte completa da v9: métricas antes/depois, etapas obsoletas removidas, nenhuma distribuição manual reintroduzida, sequência exata das Fases A-F, pipeline real (`GameStorage`/`CareerManager`) do início ao fim (100% concluído), migração de save antigo (mix de válidas/removidas e só-removidas), fallback seguro de rota. 127 gates.
- `npm run test:tutorial-chronology` — corrigido: não trava mais em "≥40 etapas" (o oposto do que a v9 resolveu); agora verifica que o tutorial permanece curto (10-20 etapas), mantendo os testes de ação antecipada, idempotência, retomada e supressão do guia na central de missões.
- `npm run test:tutorial-engine` — corrigido: não referencia mais o id removido `ranking-known`; usa a primeira etapa viva.
- `npm run test:tutorial-floating-guide` — corrigido: não trava mais em `TUTORIAL_VERSION === 8`; verifica só que a versão é um inteiro positivo válido.

## Comunicações — dedup de relatórios recorrentes

### Produtores (tabela completa)

| Origem | `message_type` | Chave estável | Frequência |
|---|---|---|---|
| `gameStateLifecycle.js` | `weekly_summary` | `weekly-summary:<índice-de-semana-da-carreira>` | 1×/semana de carreira |
| `staffLifecycle.js` (`processStaffDay`) | `staff_report` | `staff-weekly-report:<semana-do-ano>` | 1×/semana, só se há comissão |
| `staffLifecycle.js` (`processStaffMonthlyEvent`) | `staff_event` | `staff-event:<mês>` **(nova nesta correção)** | 1×/mês, evento aleatório |
| `staffLifecycle.js` (`processStaffMonth`) | `staff_monthly_report` | `staff-monthly-report:<mês>` **(nova nesta correção)** | 1×/mês, se houve evolução/expiração |
| `livingWorldEngine.js` | `world_bulletin` | id determinístico `weekly-bulletin-<profile>-<semana>` | 1×/semana (segundas) |
| `monthlyCareerReportLifecycle.js` | `monthly_career_report` | id determinístico por período | 1×/mês |
| `annualCareerReportLifecycle.js` | `annual_career_report` | id determinístico por ano | 1×/ano |
| `seasonLifecycle.js` | `season_report` | guarda em `SeasonResult` antes de escrever | 1×/temporada, clique do jogador |
| `sponsorLifecycle.js` | `sponsor` | `sponsor-evaluation:<mês>` **(nova nesta correção)** | 1×/mês, clique do jogador |
| `fanLifecycle.js` | `fans` | `fan-evaluation:<mês>` **(nova nesta correção)** | 1×/mês, clique do jogador |

Todas usam (ou passaram a usar) `upsertCareerMessage(profileId, contextKey, payload)` (`src/lib/careerCommunications.js`) — o mesmo mecanismo de upsert idempotente por id estável, então a mesma `contextKey` nunca produz uma segunda linha, mesmo chamada de novo após reload ou reprocessamento.

### Por que duplicava

O avanço de calendário tem **dois pontos de entrada independentes** para `processGameStateDay` (`gameStateLifecycle.js`), sem lock compartilhado entre eles:

1. Avanço de 1 dia — `dayAdvanceCoordinator.js` → `advanceCareerDay` (fase rápida) + `processGameStateDay` (fase secundária, via `queueMicrotask`).
2. Avanço de vários dias ("pular N dias") — `advanceCareerDays` (loop com `deferGameState:true`) + `finalizeCareerAdvanceRange`, chamado separadamente por `CalendarPage.jsx`.

O resumo semanal e o relatório semanal da comissão já foram protegidos contra isso (chave estável). Os produtores mensais mais recentes (`staff_event`, `staff_monthly_report`) e os disparados por clique (`sponsor`, `fans` — vulneráveis a duplo clique antes da primeira escrita de guarda chegar) ainda usavam `create`/`safeCreate` puro, guardado só por um campo em memória (`last_evaluated_month`/similar) — sem proteção real contra dois caminhos ou dois cliques colidindo. Corrigido nesta passagem, migrando os quatro para o mesmo padrão de upsert por chave estável.

### "Reunião semanal da comissão" → mesclada no relatório

Já estava mesclada antes desta correção (`staffLifecycle.js:257-262`, `livingStaff.js:43-53`): a reunião era antes disparada a cada visita a `Staff.jsx` (nunca deveria gerar notificação num mount de UI) e cobria informação passiva quase idêntica ao relatório semanal. `Staff.jsx` hoje só usa `buildStaffMeeting()` para um painel local — sem escrever mensagem.

### Priorização visual (sino)

`CommunicationBell.jsx` já agrupa por prioridade (não por data): **Ação necessária** (entrevista, proposta, partida, torneio, decisão pendente) → **Atualizações** → **Relatórios** (`groupNotificationsByPriority`, `notificationCenter.js`). Não esconde nada, só reordena — nenhuma notificação vira invisível sem decisão explícita do jogador.

Nesta correção, `sponsor`, `fans`, `staff_event` e `staff_monthly_report` foram adicionados à lista fechada `PASSIVE_REPORT_TYPES` (`notificationCenter.js`) — antes só caíam no balde "Relatórios" quando tinham `notification_type` preenchido; agora a classificação é robusta pelo `message_type` diretamente.

### Badge

Continua contando todas as não lidas relevantes (opção deliberada — "não esconder informação sem decisão explícita", por isso não escondida do badge, só reordenada na lista). Não foi alterado.

### Limpeza retroativa de saves com duplicatas já acumuladas

Saves criados antes desta correção podem ter duplicatas reais (mesma semana/mês, mesmo tipo, mesmo assunto) geradas antes da chave estável existir. `CareerMigration.js` versão 19 (`CAREER_SAVE_SCHEMA_VERSION` 18→19) agrupa `CareerMessage` por `message_type` + período calculado (semana/mês/ano, conforme o tipo) + assunto, e — só quando há 2+ mensagens no mesmo grupo — marca todas menos a mais recente como lidas. **Nunca apaga**: o histórico continua visível em "Todas", só para de inflar o badge de não lidas. Mensagens fora da lista fechada de tipos passivos (ex.: propostas, entrevistas) nunca são tocadas.

### Testes

- `npm run test:communication-deduplication` (novo) — 21 dias reais de calendário pelos dois caminhos de entrada, reconciliação repetida (abrir/fechar tela várias vezes) intercalada, reload simulado, e um replay deliberado da mesma janela de dias (simulando os dois caminhos colidindo). Prova que resumo semanal e relatório da comissão não explodem e são idempotentes sob replay, e que os quatro produtores corrigidos (`staff_event`, `staff_monthly_report`, avaliação de patrocínio, avaliação de torcida — os dois últimos via chamadas verdadeiramente concorrentes com `Promise.all`, simulando duplo clique) nunca duplicam dentro do mesmo período.
- Suíte de regressão existente (`test:notification-center-consolidation`, `test:notification-100day-simulation`) continua passando sem alteração de comportamento esperado.
