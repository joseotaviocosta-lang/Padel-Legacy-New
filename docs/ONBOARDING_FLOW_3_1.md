# Onboarding Flow 3.1 + Coach/Staff/Sponsorship Clarity

## Contexto

QA real de uma carreira nova encontrou quatro problemas: (A) etapas de tutorial que só exigiam "visitar uma página" ainda pediam abrir o Guia e clicar "Entendi" — lento e artificial; (B) a Home (`CareerHub.jsx`) e o tutorial davam ordens concorrentes durante o onboarding; (C) o tutorial (corretamente reduzido de 57 para 15 etapas numa fase anterior) ficou raso demais em comissão técnica, patrocínios e outras formas de renda; (D) a página de treinadores escondia benefícios reais atrás de "Ver detalhes". Esta fase corrige exatamente os quatro, sem mudança de balanceamento, sem mecânica inventada e sem voltar a um tutorial de 57 passos.

## Parte 1 — Auditoria das 15 etapas do tutorial

| Etapa | Kind | Rota | Ação real | Auto-complete? | Evento/objectiveType | Bloqueante? |
|---|---|---|---|---|---|---|
| career-created | VISIT | /game | Visitar o painel | Sim (novo) | visit_career | Não |
| athlete-named | ACTION | /game/missions | Salvar nome | Não (ação real) | set_player_name | Não |
| side-selected | ACTION | /game/missions | Salvar mão/lado | Não (ação real) | choose_court_side | Não |
| difficulty-selected | ACTION | /game/missions | Salvar dificuldade | Não (ação real) | choose_career_difficulty | Não |
| style-selected | ACTION | /game/missions | Salvar estilo | Não (ação real) | choose_play_style | Não |
| appearance-known | VISIT | /character | Visitar a página | Sim (novo) | visit_character | Não |
| profile-reviewed | VISIT | /profile | Visitar a página | Sim (novo) | review_profile | Não |
| offers-reviewed | VISIT | /partners?view=offers | Visitar a página | Sim (novo) | review_partner_offer | Não |
| partner-selected | DECISION | /partners?view=offers | Confirmar parceiro | Não (evento real) | select_partner | Não |
| coaches-known | VISIT | /coaches | Visitar a página | Sim (novo) | visit_coaches | Não |
| first-training | EVENT | /game/training | Concluir treino | Não (evento real) | complete_training | Não |
| calendar-known | VISIT | /game/calendar | Visitar a página | Sim (novo) | visit_calendar | Não |
| tournament-registered | EVENT | /tournaments | Inscrever-se | Não (evento real) | join_tournament | Sim — exige dupla (`requirements: ['has-partner']`), nunca trava outras telas |
| first-match | EVENT | /matches | Jogar a partida | Não (evento real) | play_matches | Não |
| autonomy | FINISH | /game | Confirmar fim do tutorial | Não — exceção deliberada (ver abaixo) | finish_tutorial | Não |

**6 etapas VISIT passaram a auto-completar**; as outras 9 (4 ACTION + 1 DECISION + 3 EVENT + 1 FINISH) já completavam corretamente por ação/evento real e não mudaram de mecanismo.

### Por que `autonomy` fica de fora do auto-complete

`autonomy` tem `completionType: 'confirm_understanding'` como as 6 VISIT, mas **não** é classificada como VISIT: compartilha a rota `/game` com `career-created` (a primeira etapa do tutorial todo), e é o momento deliberado de encerrar o onboarding guiado — não uma visita passiva. Já tinha (e continua tendo) um fluxo dedicado próprio: o botão "Começar carreira livre" em `CareerHub.jsx`. Isto também respeita um guard histórico real: um mecanismo parecido (`visit_career_after_intro`, um objectiveType separado também mapeado para `/game`) existiu numa versão anterior de 57 etapas e foi removido no commit `573fed7` (v20) exatamente quando o botão dedicado atual foi criado — `scripts/test-tutorial-chronology.mjs` guarda contra reintroduzir esse nome/mecanismo especificamente, não contra qualquer auto-complete de `/game`.

## Parte 2 — CTA único da Home durante o onboarding

Antes: o CTA principal da Home (`CareerHub.jsx`) vinha de `getNextStep()`, uma cópia local e desatualizada da lógica do componente morto `NextStepCard.jsx` (removido nesta fase — não era importado em lugar nenhum), sem nenhuma consciência do tutorial. Ao mesmo tempo, o Centro de Decisões (`careerDecisionCenter.js`) podia sugerir "escolher parceiro" de forma independente — CTAs concorrentes.

Agora: `getOnboardingNextAction(profile)` (`src/onboarding/onboardingNextAction.js`, novo) é a fonte única enquanto `tutorial_onboarding.status === 'in_progress'` e a etapa atual não é `FINISH`. A Home usa `heroStep = getOnboardingNextAction(profile) || getNextStep(profile, upcomingTournaments)` — o motor antigo continua existindo como fallback para depois do onboarding, tutorial pulado, ou carreira sem onboarding. As listas secundárias (`buildPriorityActions`, `attentionItems`) ganharam um dedup por `basePath()` (ignora query string) contra a rota do hero, corrigindo um bug real onde a etapa de tutorial `/partners?view=offers&source=tutorial` não batia com a rota base `/partners` usada pelo Centro de Decisões.

`partnerAction` no retorno de `getOnboardingNextAction` é sempre `false` de propósito: um atalho por modal (sem navegar) nunca dispararia o auto-complete por visita da etapa `offers-reviewed`, travando o tutorial nela para sempre.

Um efeito colateral necessário: nem o clique manual em "Entendi" nem o novo auto-complete por visita disparavam `padel:profile-updated` (só `padel:onboarding-refresh`, que a Home não escuta) — sem isso, o CTA da Home ficaria desatualizado até a próxima navegação. Os três pontos de conclusão agora disparam os dois eventos.

## Parte 3 — Guias contextuais novos (opcionais, sem inchar o tutorial obrigatório)

Usa o sistema já existente (`pageIntroductions.js`, renderizado dentro do Guia flutuante por rota visitada):

- **`/coaches`**: entry nova — treinador principal, comparação por tier/especialidade/custo, e que não ocupa vaga da comissão.
- **`/staff`**: entry existente enriquecida com as 8 funções reais (preparador físico, fisioterapeuta, nutricionista, psicólogo, analista de desempenho, olheiro, empresário, contador — `staffCatalog.js`, nenhuma inventada).
- **Patrocínios**: `getPageIntroduction(pathname, search)` ganhou um segundo parâmetro opcional para resolver uma chave composta `/game/economy?view=sponsors` antes de cair na entry genérica de `/game/economy` — retrocompatível, chamadas com um argumento continuam funcionando. Mecânica descrita é 100% real: catálogo mensal, compatibilidade por estilo/nível/lado/idade/apelo de torcida, bônus de assinatura + salário mensal + ajustes por meta, nunca itens físicos.
- **Glossário**: duas entradas novas ("Comissão técnica", "Treinador principal") usando a mesma distinção já documentada em `Staff.jsx`/`economy.js`.

Nenhuma dessas é uma nova `TUTORIAL_STEPS` obrigatória — aparecem contextualmente ao visitar a rota, exatamente como o sistema já funcionava para `/staff`/`/game/economy` antes desta fase.

## Parte 4 — Treinadores: benefícios reais visíveis no card

`CoachCard.jsx` agora renderiza `COACH_SPECIALTY_INFO[especialidade].benefits` (3 strings reais por especialidade, já existentes em `coaches.js`, já usadas em `getCoachImpactSummary` — nenhum bônus inventado) direto no card, sem precisar abrir "Ver detalhes". A comparação "atual vs. novo" (`CoachComparison`) já existia dentro do modal de detalhes e não mudou — é aprofundamento, não decisão inicial.

`Coaches.jsx` ganhou paginação client-side (`visibleCount`, 12 por vez, "Mostrar mais") porque o filtro padrão para uma carreira nova (`available`) podia listar dezenas de treinadores de uma vez sem limite nenhum. `buildCoachDiscovery`/`filterCoachDiscovery`/`sortCoachDiscovery` e os badges "Recomendado"/"Melhor custo-benefício" não foram tocados — nenhum critério de recomendação novo foi criado.

`COACH_TIERS.costMult` foi confirmado como um campo definido mas nunca lido em lugar nenhum — documentado aqui como dívida técnica pré-existente, não corrigido (fora de escopo: mudança de balanceamento).

## Migração de save — decisão: nenhuma

`TUTORIAL_VERSION` avançou 9 → 10 (marcador de conteúdo, mesmo padrão do avanço 8 → 9 quando o tutorial foi cortado de 57 para 15 etapas). `CAREER_SAVE_SCHEMA_VERSION` permanece 19 — nenhuma entrada nova em `CareerMigration.js`.

Por quê: `tutorial_onboarding.completedStepIds` é só uma lista de ids. O mecanismo de conclusão de cada etapa (`completionType`, e agora `kind`) é sempre lido ao vivo de `TUTORIAL_STEPS` por id — nunca foi persistido no save. Nenhum id de etapa foi adicionado, removido ou renomeado nesta fase; só o *mecanismo* de conclusão de 6 etapas mudou (clique em "Entendi" → visita automática). Uma carreira salva com uma dessas etapas já completada continua completada (membership não muda retroativamente); uma carreira salva ainda não chegou nela usa o novo mecanismo automaticamente na próxima vez. Comprovado por `test-tutorial-auto-completion.mjs` (motor real via `completeTutorialStep`) e pelo pipeline completo, inalterado, de `test-onboarding-v3.mjs`.

## O que NÃO foi alterado

Match Engine, Live Coach (motor de sugestões em partida), Tournament lifecycle/guided flow, Ranking, Notifications editorial, Calendar core, Economy/Sponsors (fórmulas e gates), Training formulas, Branding, `coaches.js` (matemática/gates de contratação), save schema (`CAREER_SAVE_SCHEMA_VERSION` continua 19). Todo texto novo de guia/glossário foi extraído de código real já existente, nunca inventado.

## Testes

Novos: `test:tutorial-auto-completion` (31 gates), `test:onboarding-priority` (58 gates), `test:coach-selection-clarity` (38 gates). Atualizados (mudança de forma, mesma propriedade real, não enfraquecidos): `test:onboarding-v3` (pin de versão exato → comparação viva `TUTORIAL_VERSION > BEFORE.version`), `test:tutorial-floating-guide` (literal `getPageIntroduction(pathname)` → `getPageIntroduction(pathname, search)`), `test:tutorial-chronology` (mesmo ajuste de literal). Regressão completa (`test:missions`, `test:career-systems`, `test:training-v2`, `test:coaches-v28`, `test:staff-architecture`, `test:partnerships-v29`, `test:ui-redesign`, `test:home-redesign`, `test:beta-candidate` — 14 pilares) e `lint`/`typecheck` (baseline inalterado, 2263 erros pré-existentes)/`build` — todos passando.
