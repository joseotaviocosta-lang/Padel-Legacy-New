# Caminhos de inscrição — Playthrough 5.27-J

Levantamento por busca de toda escrita em `TournamentRegistration` (e da única
escrita de `CalendarEvent` de torneio fora dela) em `src/` e `scripts/`.

## A autoridade

`src/lib/committedRoster.js`:

| Função | Papel |
|---|---|
| `evaluatePartnershipRegistrationAuthority(partnership, { careerDate, tournament })` | decisão única, com código `PARTNERSHIP_EXIT_PENDING` / `PARTNERSHIP_INACTIVE` |
| `canRegisterNewTournamentWithPartnership(partnership, careerDate, tournament?)` | atalho booleano; assinatura da 5.17 preservada |

### Antes desta fase

- A função existia desde a 5.17, mas **não tinha nenhum chamador**: o único
  "uso" era um comentário em `partnerLifecycle.js` e um teste unitário (`test-…-v517`).
- Só olhava `encerrar_ao_final` e `nao_renovara`. Não cobria
  `encerra_apos_compromisso`, justamente o estado em que a dupla só deveria
  cumprir compromissos.

### Por que os caminhos não a usavam

A 5.17 acrescentou a regra junto com o agendamento da separação. Mas a
validação de inscrição (`evaluateTournamentRegistration`) nunca recebeu a
parceria. Ela valida datas, janela, conflito de agenda, elegibilidade esportiva,
moedas e vagas, e lê o parceiro só pelo perfil (`player.partner_id`). Sem a
linha de `Partnership`, não havia como saber da saída decidida.

## Escritas (criam compromisso)

| # | Caminho | Arquivo | Passa pela autoridade? |
|---|---|---|---|
| 1 | Jogador manual (card / modal "Inscrever") | `TournamentRegistrationModal.jsx` → `calendarSystem.registerForTournament` → `tournamentRegistration.registerTournament` | **Sim** (`registerTournament` busca a parceria ativa e passa a `evaluateTournamentRegistration`) |
| 2 | Caminho legado de calendário (`legacyCalendarRegistration`) | `calendarSystem.registerForTournament` (ramo legado: escreve `CalendarEvent` direto) | **Sim** (checagem explícita antes da escrita; hoje sem chamadores) |
| 3 | Headless / harness de carreira | `scripts/lib/v526Actions.tryRegister` → `registerTournament` | **Sim** (mesma função do jogador) |
| 4 | Helpers de teste | `scripts/lib/competitiveReviewGates.mjs` → `registerTournament` | **Sim** |
| 5 | Mensagens / central de comunicações ("Inscrever" de um lembrete) | `careerCommunications` → mesmo modal/`registerTournament` | **Sim** (via 1) |

Não existe inscrição automática nem "season planner" que escreva
`TournamentRegistration`. `weeklyCareerReview` diz explicitamente que a
inscrição "continua pertencendo a `registerTournament()`".

## Sugestões / prévias (não escrevem; precisam dar o mesmo resultado)

| Caminho | Arquivo | Recebe a parceria? |
|---|---|---|
| Lembretes de inscrição | `careerCommunications.ensureTournamentRegistrationReminders` | **Sim** (agora busca a parceria ativa) |
| Planejamento semanal | `weeklyCareerReview.buildUpcomingTournamentPlanning` (`context.partnership`) | **Sim** |
| Decisão competitiva semanal (comissão) | `competitiveStaffReview` → `buildCompetitiveWeeklyDecision` | **Sim** (já carregava a parceria; agora repassa) |
| Sugestão do CareerHub | `CareerHub.jsx` (`suggestableTournament`, `weeklyReview`) | **Sim** (estado `activePartnership`) |
| Pré-requisitos do card | `checkTournamentRequirements` (`TournamentDetailsModal`, modal) | Não precisa: só elegibilidade esportiva; a inscrição real passa pela 1 |

## Outras escritas em `TournamentRegistration` (não criam compromisso novo)

| Caminho | Arquivo | Efeito |
|---|---|---|
| Atualização de status no avanço do calendário | `calendarLifecycle.js:155–161` | muda status de inscrição existente |
| Cancelamento | `tournamentRegistration.cancelTournamentRegistration`, `calendarSystem.cancelRegistration` | cancela (o jogador pode cancelar, como antes) |
| Migração / reparo de save | `CareerMigration.js:248–278` | deduplica inscrições existentes; não cria |

## IA

As duplas da IA **não usam `TournamentRegistration`**. Elas entram nas chaves
pela admissão do mundo (`WorldTourLifecycle.ensureWorldTourDraws` /
`buildPlayerTournamentField`), a partir das parcerias ativas
(`buildCanonicalPairs`).

A dissolução da IA (`aiPartnershipLifecycle`) é **imediata**: no mês em que o
contrato vence sem renovação (ou há rompimento), a parceria vira
`encerrada_parceiro` e os atletas ficam `livre`. Não existe estado
"separação pendente" na IA; a identidade de dupla já sorteada fica no
`draw_pair_ids`/snapshot do torneio (imutável, 5.26-D).

Portanto a IA **não tinha** o bug (não há janela entre decisão e fim em que ela
possa se inscrever). Prova: `test-ai-partnership-exit-registration-v527j`.
