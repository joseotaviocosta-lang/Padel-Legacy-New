# Onboarding Single Source of Truth / Zero Conflict Flow

## Contexto

QA real sobre o Onboarding Flow 3.1 já em produção encontrou a interface ainda dando instruções contraditórias: o Guia da Carreira mostrava corretamente "Dê um nome ao atleta", enquanto a Home mostrava, ao mesmo tempo, "[Começar tutorial]" e "ESCOLHA SEU PARCEIRO". Este hotfix não redesenha o tutorial, não adiciona etapas e não altera balanceamento — corrige exclusivamente a camada de orquestração de UX que decide "o que fazer agora".

## Causas raiz confirmadas (leitura direta do código, não suposição)

**Bug A — decisão `choose-partner` escapava do dedup.** `src/lib/careerDecisionCenter.js:57-66` produz uma decisão `priority: 'critical'` sempre que `!profile.partner_id` — verdade durante praticamente todo o início de jogo, independente da etapa do tutorial. O dedup do Onboarding Flow 3.1 só removia itens cuja rota batia exatamente com a do CTA principal (`/game/missions` durante "definir nome"), nunca "qualquer coisa à frente da etapa atual" — então a decisão de parceiro (`/partners`) continuava aparecendo na lista secundária.

**Bug B — CTA morto na própria página.** `career-created` tem `actionLabel: 'Começar tutorial'` e rota `/game` — que é a própria Home. Enquanto o auto-complete por visita (efeito em `OnboardingGuide.jsx`, montado globalmente) ainda não resolveu, a Home renderizava `<Link to="/game">` estando já em `/game`: o React Router não navega para a rota atual, então o botão "não abria", exatamente como relatado no QA.

**Bug C — 4 das etapas mais comuns nunca notificavam Home/Guia.** `Missions.jsx`'s `saveAthleteName`, `chooseSide`, `chooseDifficulty`, `chooseStyle` — as etapas ACTION, ou seja, as primeiras coisas que qualquer jogador novo faz — salvavam o perfil e recarregavam a própria página, mas nunca disparavam `padel:profile-updated`/`padel:onboarding-refresh`. Só o caminho VISIT/FINISH (`confirmUnderstanding`) tinha esses disparos desde o Onboarding Flow 3.1. Resultado: depois de nomear o atleta, Home e Guia ficavam desatualizados até o jogador navegar para outra página e voltar.

Investigado e confirmado **não ser bug** (evitando trabalho desnecessário):
- `ActiveMatchRecoveryBanner`/banner de torneio bloqueante (`CareerHub.jsx`) já renderizam como região própria, nunca dentro do painel "O que fazer agora" — os tiers 1/2 da pilha de prioridade do hotfix já estão isolados, e estruturalmente não podem ocorrer antes de `first-match`/`tournament-registered` existirem (nenhuma partida/torneio existe ainda). Nenhuma função `getCareerPrimaryAction()` nova foi criada — duplicaria uma separação que já é correta.
- `NextObjectiveCard` (meta de ranking) e o CTA de torneio dentro de `NextEventCard` já são passivos — um link de texto pequeno no rodapé de um card informativo, não um botão primário. Não tocados.
- Etapas de evento de domínio (`first-training`, `partner-selected`, `tournament-registered`, `first-match`) completam via `trainingSystemV2.js`/`partnershipSystem.js`/subsistemas de torneio/partida, que também não disparam `padel:profile-updated` — mesma classe de bug que C, mas fora de escopo aqui (tocaria sistemas de Treino/Torneio/Partida, adjacentes à lista "não alterar"). Diferença prática: o jogador necessariamente navega para outra página para disparar esses eventos, então Home/Guia já re-reconciliam ao montar/mudar de rota — a desatualização é transitória, não a bug persistente que C causava.

## Correções

- **Fix A**: `CareerHub.jsx` força `priorityActions`/`attentionItems` para `[]` sempre que `getOnboardingNextAction()` está ativo, em vez de tentar rankear decisões arbitrárias contra a posição na sequência do tutorial. `PriorityActionsPanel` já mostra "Nenhuma outra pendência agora" quando a lista vem vazia — nenhuma mudança de UI necessária.
- **Fix B**: `CareerHub.jsx` ganhou `useLocation()` e `heroIsCurrentPage` (compara `basePath(heroStep.to)` com a rota atual). `PriorityActionsPanel` recebe `isCurrentPage` e, quando verdadeiro, mostra um estado neutro ("Você já está aqui — concluindo automaticamente") em vez de um link morto — mesmo padrão de texto que `OnboardingGuide.jsx` já usa ("Você está no lugar certo").
- **Fix C**: `Missions.jsx`'s `load()` passou a devolver o perfil já reconciliado; os 4 handlers ACTION agora disparam `padel:onboarding-refresh` + `padel:profile-updated` através de um `notifyProfileUpdated()` compartilhado, mesmo padrão que `confirmUnderstanding` já usava.
- **Fix D**: `getOnboardingNextAction()` ganhou `destination`/`actionLabel`/`actionType` como aliases aditivos de `to`/`cta` (mantidos intactos para não forçar rename em cascata em `PriorityActionsPanel`/`getNextStep`). `actionType` é sempre `'navigate'` — não existe hoje uma segunda forma de agir que justifique uma taxonomia maior.

## Testes

Novos: `test:onboarding-single-source-of-truth` (123 gates — Home e Guia concordam em stepId/destination/actionLabel nas 15 etapas; a fonte do Bug A continua existindo na camada de dados, só suprimida na UI; supressão e guarda de mesma-página confirmadas no código-fonte) e `test:onboarding-home-cta` (32 gates — toda rota de destino das 15 etapas é uma rota real registrada em `App.jsx`; pipeline real, não análise estática: o mesmo `PlayerProfile.update` + `incrementMissionProgress` que cada handler de Missions.jsx executa avança de fato o tutorial; os 4 handlers disparam os eventos de notificação; sequência completa das 15 etapas fechada de ponta a ponta).

Regressão completa (`test:tutorial-auto-completion`, `test:onboarding-priority`, `test:onboarding-v3`, `test:tutorial-chronology`, `test:tutorial-engine`, `test:tutorial-floating-guide`, `test:home-redesign`, `test:missions`, `test:career-systems`, `test:beta-candidate` — 14 pilares) e `lint`/`typecheck`/`build`/`app:build` — todos passando, nenhuma alteração necessária além das já feitas.

## Validação pendente

Este ambiente não tem navegador/jsdom — a prova é estrutural (código-fonte) e de pipeline real (motor/engine chamado diretamente), mesma convenção usada em toda a sessão. A confirmação visual final (abrir uma carreira nova, ver a Home e o Guia concordando na tela) é do QA humano.
