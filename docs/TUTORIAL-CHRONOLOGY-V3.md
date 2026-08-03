# Cronologia do tutorial v3

## Diagnóstico anterior

O fluxo mantinha duas decisões concorrentes: `MissionProgress` escolhia a missão exibida em Missões e `tutorial_onboarding` escolhia o guia global. A primeira missão mandava visitar o painel, embora uma carreira nova abrisse em Missões; o CTA podia navegar para a mesma rota e parecer inerte. Na mesma tela apareciam o guia global, o bloco de boas-vindas, o cartão de próximo passo e a linha da missão.

Eventos futuros eram descartados por `tutorialUnlocked`. Assim, um parceiro escolhido antecipadamente não criava progresso e a missão posterior não tinha reconciliação para descobrir o parceiro persistido. Apenas o lado da quadra possuía reparo específico. Além disso, escolher o estilo gravava `onboarding_completed: true` antes de treino, parceiro, torneio e partida.

## Fonte de verdade e ordem oficial

`tutorial_onboarding` v3 é a fonte de verdade. `MissionProgress` é somente projeção para recompensa e histórico. Os seletores e a reconciliação estão em `src/onboarding/tutorialState.js`.

1. carreira criada (automático);
2. nome do atleta;
3. lado da quadra;
4. estilo de jogo;
5. primeiro treino;
6. entender energia (reconhecido após o treino);
7. parceiro;
8. inscrição em torneio;
9. primeira partida;
10. retorno ao painel e autonomia.

Cada etapa possui ID textual estável, objetivo de domínio e rota. A conclusão usa nome, lado, estilo, sessões de treino, `partner_id`, inscrição e partidas persistidas. Abrir uma aba não conclui ações de domínio.

## Reconciliação

`reconcileTutorialProgress` é pura e idempotente. Ela une o progresso anterior aos fatos atuais sem apagar conclusões. `reconcilePersistedTutorial` sincroniza o estado, espelha-o no save e projeta recompensas cronologicamente. É executada ao carregar, trocar rota e receber eventos relevantes.

Ações antecipadas permanecem concluídas, mas não pulam pré-requisitos ainda ausentes. A página informa quais ações futuras foram reconhecidas. Ao alcançar essa posição, o tutorial segue automaticamente.

## Interface

Missões é a central do tutorial. Nessa rota, o guia global, a introdução de página e recomendações concorrentes não são exibidos. Etapas de identidade mostram somente o formulário/seleção principal; etapas externas mostram somente um CTA destacado. A linha correspondente no histórico não repete esse CTA.

Fora de Missões, o guia é contextual e compacto. Minimizar, pular e retomar continuam persistidos. Salvar nome, lado ou estilo bloqueia clique duplo e apresenta estados de carregamento, sucesso e erro.

## Compatibilidade

A migração de save v10 infere o tutorial de carreiras antigas e sincroniza `career.tutorial`, `player.tutorial_onboarding`, `onboarding_stage` e `onboarding_completed`. Nome, parceiro, lado, estilo, treino e partidas existentes não são apagados nem exigidos novamente.
