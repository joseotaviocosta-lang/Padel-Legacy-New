# Starter Coach Flow + Curated Coach Market

## Contexto

QA real encontrou duas coisas na página de Treinador Principal: (1) uma carreira nova já chegava com um treinador contratado silenciosamente ("João Moreira", Iniciante, "pago pelo clube") antes do jogador nunca ter visitado `/coaches`; (2) mesmo com a melhoria editorial dos cards (Onboarding Flow 3.1), a página ainda mostrava opções demais de uma vez, especialmente no início da carreira. Objetivo: tornar o primeiro treinador uma decisão real e reduzir drasticamente o excesso de opções visíveis, sem apagar nada do catálogo global de 118 treinadores.

## Parte A — O treinador automático

**Causa raiz**: `ensureStarterCoach` (`src/game-core/coachLifecycle.js`) não fazia parte da criação da carreira — era chamado, sem perguntar nada, de 3 efeitos de montagem de página/modal: `Coaches.jsx`, `TournamentModal.jsx`, `SimulationModal.jsx`. Qualquer uma dessas telas, aberta primeiro, escrevia um contrato completo (12 meses, `coach_trust: 55`, `coach_tactical_understanding: 25`, `coach_paid_by_club: true`, `coach_monthly_salary: 0`) no perfil.

**Era tecnicamente necessário? Não.** Auditoria completa de todo leitor de `coach_id`/`getCoachEffects` — Training.jsx, SimulationModal.jsx, TournamentModal.jsx, o motor do Live Coach (`src/engine/live-coach/LiveCoachObserver.js`, já testado com `coach: null`), StaffPanel, fechamento financeiro mensal, história da carreira, relatórios mensais — confirmou que todos já tratam `coach: null`/`coach_id` ausente corretamente (`coach ? x : 0`). O único problema real encontrado foi cosmético: `TeamVoices`/a sugestão tática de rodada em `TournamentModal.jsx` fabricavam uma fala atribuída a um "Treinador principal" inexistente.

**"Pago pelo clube" é uma mecânica real e distinta? Não.** Estruturalmente idêntico a uma contratação normal — mesmo `Coach` do catálogo, mesmo formato de contrato, mesmo prazo de 12 meses. `coach_paid_by_club` só mudava texto de exibição e zerava o salário — nunca alterava mecânica. Não havia regra própria de "treinador provisório" a preservar.

**Decisão**: remover a atribuição automática por completo. `ensureStarterCoach`/`replaceWithStarterCoach` foram removidas; `resolveActiveCoach(profile)` (nova, mais simples) só resolve um treinador já ativo — nunca cria um. Demitir (`Coaches.jsx`) limpa os campos do treinador sem reatribuir nada. Saves existentes (com contratação real ou com o antigo treinador automático) continuam exatamente como estão — nenhuma migração, nenhuma demissão forçada.

## Parte B/G — Primeiro treinador vira decisão real

`coaches-known` era `kind: 'VISIT'`/`confirm_understanding` — concluía só por visitar `/coaches`. Virou `kind: 'DECISION'`/`domain_event` — só conclui contratando de verdade (`hirePrimaryCoach` dispara `incrementMissionProgress`). Id e `objectiveType` (`visit_coaches`) não mudaram de propósito: são a mesma chave já persistida em saves em andamento, evitando qualquer migração (`incrementMissionProgress` exige `objective_type` idêntico ao da missão já gravada, mesmo passando um `missionId` explícito).

Como `visit_coaches` também é usado por `MissionNotificationBridge.jsx` (rastreamento genérico de visita de rota), a exclusão de missões de tutorial desse rastreamento — antes só baseada em `completionType === 'confirm_understanding'` — ganhou um segundo caso (`kind === 'DECISION'`), senão uma simples visita a `/coaches` voltaria a completar a etapa sozinha.

`Coaches.jsx`'s `handleHire` dispara `padel:onboarding-refresh`/`padel:profile-updated` após uma contratação — mesmo padrão do hotfix Single Source of Truth, necessário pela mesma razão (Home/Guia precisam refletir a contratação na hora).

## Parte C-F — Mercado curado

Dados reais medidos contra o catálogo real de 118 treinadores (via o próprio `vite.createServer`+`ssrLoadModule` deste repositório): uma carreira STARTER (16 anos, Iniciante, reputação 0, 325 moedas) já tem **24 disponíveis** de uma vez (todo o tier iniciante — nada os bloqueia), mas só **~7 distintos** chegam a ser marcados `recommended`/`bestValue` pelo algoritmo que já existia. MID_CAREER → 89 disponíveis; ELITE → 114.

`buildCoachMarket(coaches, profile, context)` (`src/lib/coaches.js`) reaproveita `buildCoachDiscovery` inteiro — nenhuma pontuação/elegibilidade nova — e aplica um teto por estágio de carreira, reutilizando `getCareerEconomyStage` (já usado pelo mercado de patrocinadores em `sportsEconomyV26.js`) em vez de inventar um segundo conceito. Tetos: `beginner: 8, regional: 10, professional: 12, international: 14, elite: 16`.

`Coaches.jsx`: a visão padrão (sem filtro/busca tocados) mostra "Recomendados para você" (o conjunto já marcado recommended/bestValue) + "Outras opções disponíveis" (o resto até o teto), com um link "Ver mercado completo" para voltar à lista completa de sempre. Bloqueados continuam fora da lista principal por padrão (filtro `available`, não `all`/`blocked`) — já era assim, só confirmado. Nada do catálogo é apagado — `buildCoachMarket` só recorta o que é apresentado.

## Parte D — Compactação

Os 4 `StatCard`s grandes (Caixa/Receita/Confiança/Afinidade) viraram uma única linha compacta de indicadores. Sem treinador contratado, a linha mostra "—" em vez de fingir confiança/afinidade que não existem, e o bloco "Técnico atual" vira "Técnico principal: Nenhum contratado [Escolha um treinador abaixo]". A barra de confiança (agora redundante com a linha compacta) saiu do bloco do treinador atual; a de entendimento tático ficou. Grade de cards: `sm:grid-cols-2 xl:grid-cols-3` (3 por linha só em telas largas).

## Migração

Nenhuma. `TUTORIAL_VERSION` 10 → 11 (marcador de conteúdo, mesmo padrão de v9→v10): `coaches-known` muda de mecanismo, não de id/rota/objectiveType. `CAREER_SAVE_SCHEMA_VERSION` continua 19.

## O que NÃO foi alterado

Bônus/salários de treinador, matemática de tier (`evaluateCoachForCareer`, `getCoachEffects`, `COACH_TIERS`), Match Engine, fórmulas do Live Coach, economia, ranking, torneios, calendário, notificações, comissão técnica. O catálogo de 118 treinadores nunca é reduzido — só o que é apresentado.

## Testes

Novos: `test:starter-coach-flow` (16 gates — pipeline real: carreira sem contrato fantasma, `resolveActiveCoach` nunca cria, partida treino real com `coach: null` sem sugestão fantasma do Live Coach, contratar avança `coaches-known` no tutorial via `hirePrimaryCoach` real, demitir não reatribui) e `test:coach-market-curation` (29 gates — os 3 perfis reais medidos na pesquisa, teto nunca excedido, `highlighted` é exatamente o que `buildCoachDiscovery` já marcava, nada do catálogo desaparece, variedade real de tier/especialidade, teto cresce com o estágio da carreira). `test:coaches-v28` atualizado (2 checagens invertidas para o novo invariante — mesma propriedade real, comportamento oposto e deliberado). Regressão completa (`test:live-coach*`, `test:coach-selection-clarity`, `test:onboarding-*`, `test:tutorial-*`, `test:training-v2`, `test:match-launch-pipeline`, `test:tournament-registration`, `test:career-systems`, `test:beta-candidate` — 14 pilares) e `lint`/`typecheck`(baseline melhorou, nenhum erro novo)/`build`/`app:build` — todos passando.
