# Central de Notificações — polish editorial

## Contexto

A auditoria anterior (`docs/ONBOARDING_V3_COMMUNICATIONS.md`) eliminou duplicatas técnicas. Mesmo sem duplicatas, QA continuava vendo a Central como um log de sistema: títulos burocráticos ("Relatório semanal da comissão", "Relatório mensal · 2026-03"), corpo que começa com metadata em vez de contar o que aconteceu, todo card com o mesmo peso visual, e um botão genérico "Abrir recurso" em toda notificação acionável. Esta passagem é editorial: reescreve copy, aperta o que realmente vira notificação, e adiciona hierarquia visual leve — sem tocar na arquitetura de dedup/consolidação já corrigida.

## Achado estrutural: dois resumos semanais

A auditoria de produtores encontrou algo que a passagem técnica anterior não pegou: **duas mensagens semanais "resumo da sua semana" distintas**, de sistemas diferentes:
- `gameStateLifecycle.js`: "Resumo semanal do universo" (cruza índice de semana da carreira).
- `livingWorldEngine.js`: **literalmente titulada "Resumo da semana · &lt;semana&gt;"** (dispara em segundas-feiras reais), despejando até 4 manchetes de `WorldEvent` sem nenhum filtro de relevância para o jogador.

Cada uma tinha sua própria chave de dedup — nenhuma duplicava tecnicamente — mas o jogador podia continuar recebendo dois "resumos da semana" na mesma semana. Consolidado: `livingWorldEngine.js` parou de criar sua própria `CareerMessage` (o `WorldEvent` do boletim continua existindo, alimentando a página Mundo/Notícias normalmente); `gameStateLifecycle.js`'s "A semana no circuito" agora cita os destaques relevantes da semana (`getWeeklyRelevantHighlights`, filtrado por `tier === 'destaque'` — o mesmo sinal de relevância que o próprio motor do mundo já usa para si) como uma segunda frase curta, em vez de existir como notificação separada.

## Nova funcionalidade: marco de ranking

Nenhum produtor de "sua posição no ranking mudou" existia antes. Adicionado em `gameStateLifecycle.js`, na mesma cadência semanal do resumo: dispara só ao cruzar Top 500 / Top 100 / Top 10 / #1 (nunca em variações pequenas como 920→918), lendo `profile.ranking_position` (o mesmo campo que os relatórios mensal/anual já usam) e guardando o último marco notificado em `profile.last_ranking_milestone_position` para nunca repetir o mesmo marco. Um salto grande (ex.: #600 → #5) relata só a conquista mais exclusiva (Top 10), não uma notificação por faixa cruzada.

## Inventário e classificação (Parte A do brief)

| Tipo | Produtor | Classificação | Ação |
|---|---|---|---|
| `weekly_summary` | gameStateLifecycle.js | Relatório | Reescrito + absorve destaques do mundo |
| `world_bulletin` | livingWorldEngine.js | (era Relatório) | **Removido como CareerMessage** — fundido acima |
| `ranking_milestone` | gameStateLifecycle.js | Atualização | **Novo** |
| `staff_report` | staffLifecycle.js | Relatório | Reescrito (título dinâmico + corpo compacto) |
| `staff_event` | staffLifecycle.js | Atualização | Título padrão reescrito |
| `staff_monthly_report` | staffLifecycle.js | Relatório | Título sem sufixo de período |
| `sponsor` | sponsorLifecycle.js | Relatório | Reescrito (título dinâmico) |
| `fans` | fanLifecycle.js | Relatório | Reescrito (título dinâmico) |
| `monthly_career_report` | monthlyCareerReportLifecycle.js | Relatório | Título reescrito |
| `annual_career_report` | annualCareerReportLifecycle.js | Relatório | Título reescrito |
| `season_report` | seasonLifecycle.js | Relatório | Título reescrito |
| `partner_warning` | partnerLifecycle.js | Ação necessária | Priority corrigida (estava sem valor) |
| `proposta_parceria` | partnerOffers.js | Ação necessária | Corpo alinhado à voz de partnershipSystem.js |
| `injury_report` (treino agudo) | trainingLifecycle.js | Importante | Título alinhado à voz médica |
| `tournament_upcoming`, `tournament_resume`, `partner_longevity`, `coach_contract_expiring`, `press_interview_available` | careerCommunications.js | Ação/Importante | Já no tom-alvo — sem alteração |
| `partner_contract`, `partner_offer` (aceita/recusada), `training_feedback`, `medical_clearance`, `injury_report` (roll semanal) | vários | Ação/Importante/Atualização | Já no tom-alvo — sem alteração |

Nenhum produtor identificado se classificou como "Ruído" puro — a auditoria não encontrou uma notificação que devesse deixar de existir, só copy/tom a corrigir.

## Copy: antes → depois

| Tipo | Título antes | Título depois | Motivo |
|---|---|---|---|
| `weekly_summary` | "Resumo semanal do universo" | "A semana no circuito" | Tom menos burocrático; corpo agora conta o que aconteceu antes das estatísticas |
| `staff_report` | "Relatório semanal da comissão" (fixo) | "Sua equipe está em ordem" ou o problema específico (ex. "Reduza a carga física") | "Toda semana é a mesma coisa" — título muda conforme houver algo notável |
| `staff_event` (padrão) | "Bastidores da comissão" | "&lt;nome&gt; tem uma novidade" | Mais específico que um rótulo genérico |
| `staff_monthly_report` | "Evolução da comissão · &lt;mês&gt;" | "Evolução da comissão" | Sem sufixo burocrático de período |
| `sponsor` | "Avaliação mensal dos patrocinadores" (fixo) | "Contrato de patrocínio encerrado" ou "Patrocínios em dia" | Título reflete o que realmente aconteceu |
| `fans` | "Relatório mensal da torcida" (fixo) | "Sua torcida está crescendo" / "diminuiu" / "este mês" | Idem |
| `monthly_career_report` | "Relatório mensal · &lt;período&gt;" | "Seu mês em números" | Sem sufixo de período |
| `annual_career_report` | "Relatório Anual &lt;ano&gt; disponível" | "Resumo da temporada &lt;ano&gt;" | Sem "disponível" burocrático |
| `season_report` | "Relatório final de &lt;ano&gt;" | "Fim da temporada &lt;ano&gt;" | Idem |
| `injury_report` (treino) | "Relatório de lesão" | "Lesão no treino" | Alinhado com a voz das outras mensagens médicas ("Lesão: &lt;tipo&gt;") |

Corpo: em todos os itens acima, a primeira frase agora conta o que aconteceu; números/metadata vêm depois, em formato compacto (`X · Y · Z`), nunca como a abertura da mensagem. `staff_report` também parou de despejar recomendações completas + notas de reunião inteiras no corpo — o resumo fica curto; o detalhe completo continua disponível na página `/staff` (que já renderiza `buildStaffMeeting` de verdade).

## CTAs

`resolveNotificationDestination` (`notificationDestinations.js`) agora retorna um `label` por tipo de destino (reaproveitando o mesmo `switch` que já resolve a rota — não é um sistema novo): "Jogar partida", "Dar entrevista", "Ver proposta", "Ver torneio", "Ver treinador", "Ver comissão", "Revisar contrato", "Ver missão", "Ver recuperação", "Ver treino", "Ver patrocínio", "Ver ranking", "Ver calendário", "Ver notícia", "Ver relatório". `Communications.jsx` usa esse rótulo em vez do "Abrir recurso" genérico fixo que existia antes para toda notificação acionável.

## Hierarquia visual (`CommunicationBell.jsx`)

Sem redesenho — os três grupos que já existiam (`groupNotificationsByPriority`: Ação necessária / Atualizações / Relatórios) continuam na mesma ordem. Só as linhas do grupo "Relatórios" ficaram mais discretas: ícone menor e neutro (em vez do ícone destacado em `bg-primary/10`), prévia de 1 linha em vez de 2, sem a linha de categoria/nível de atenção. Ação e Atualizações continuam com o tratamento de antes.

## Badge

Sem alteração de código, por instrução explícita do brief (Parte G) — contar todas as não lidas continua sendo a política, e a redução de volume medida pelo novo teste é o dado necessário para uma decisão futura informada (ver métricas abaixo).

## Métricas (medidas pelo novo teste, não travadas arbitrariamente)

`npm run test:notification-editorial-quality`, 30 dias simulados:
- Cenário normal: 8 notificações em 30 dias (~1,9/semana), todas na categoria Relatório (nenhuma ação/atualização/importante nesse cenário sintético sem eventos além do ciclo semanal) — dentro da faixa-alvo do brief (~1-3 relatórios passivos/semana).
- Cenário de alta atividade: 3 ações, 0 importantes, 5 atualizações, 8 relatórios — itens acionáveis (partida interrompida, entrevista, proposta) presentes e sempre ordenados antes dos relatórios via `groupNotificationsByPriority`.
- Nenhum título repetido domina o feed de 30 dias (máximo observado: 4× "a semana no circuito", dentro do esperado para um resumo semanal ao longo de um mês).

## Testes

- `npm run test:notification-editorial-quality` (novo): distribuição por categoria em 30 dias normais e de alta atividade, detector de repetição de título, CTA específico para toda ação necessária, ordenação de prioridade com relatório+proposta+partida+entrevista simultâneos, e smoke tests confirmando a fusão do resumo semanal (nenhum `world_bulletin` residual) e a não-duplicação do marco de ranking.
- Regressão: `test:communication-deduplication`, `test:notification-center-consolidation`, `test:notification-100day-simulation`, `test:living-world`, `test:career-systems`, `test:post-match-interviews`, `test:tournament-guided-flow`, `test:tournament-resume-recovery`, `test:beta-candidate` — todos passam sem alteração de comportamento esperado.
