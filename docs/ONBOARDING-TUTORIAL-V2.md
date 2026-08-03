# Onboarding e Tutorial v2

## Diagnóstico anterior

O fluxo já criava o save com nome próprio e enviava a nova carreira para Missões. Lado e estilo eram escolhidos apenas no tutorial, evitando a duplicidade antiga. Entretanto:

- o tutorial tinha 18 etapas e apresentava loja, imprensa e economia antes de consolidar o ciclo principal;
- várias etapas eram concluídas apenas ao abrir páginas;
- `onboarding_completed` passava a `true` logo após escolher o estilo, embora treino, parceiro e torneio ainda não tivessem sido ensinados;
- o próximo passo existia apenas no painel e seguia regras separadas das missões;
- não havia estado versionado com IDs estáveis, introduções reabríveis, checklist global, ajuda ou glossário;
- saves antigos dependiam de flags e progresso de missões fragmentados.

## Novo fluxo

Nova carreira → Missões/boas-vindas → nome do atleta → lado → estilo → primeiro treino → parceiro → calendário → inscrição em torneio → primeira partida → ranking → autonomia.

O ciclo sempre disponível no Guia é:

Planejar → Treinar → Administrar energia → Escolher parceiro → Competir → Receber resultados → Evoluir → Subir no ranking.

O guia não bloqueia navegação. Pode ser minimizado, pulado e reaberto. Mesmo quando pulado, a recomendação contextual e as introduções permanecem disponíveis.

## Arquitetura

- `tutorialSteps.js`: etapas estáveis, ciclo principal e glossário.
- `tutorialState.js`: normalização, checklist e inferência a partir do save.
- `careerRecommendations.js`: única fonte de recomendações por prioridade.
- `pageIntroductions.js`: textos reutilizados por rota.
- `OnboardingGuide.jsx`: orientação global, introdução recolhível e Central de Ajuda.
- Missões continuam responsáveis pelas recompensas e só recebem eventos de ações concluídas.

## Estado persistido

O perfil e a raiz da carreira passam a aceitar:

```js
{
  version: 2,
  status: 'in_progress',
  currentStepId: 'first-training',
  completedSteps: ['career-created', 'side-selected', 'style-selected'],
  dismissedHints: [],
  pageIntroductionsSeen: [],
  collapsedIntroductions: [],
  tutorialSkipped: false,
  minimized: false,
  welcomeSeen: true
}
```

As etapas usam IDs semânticos, não índices. O checklist é inferido de lado, estilo, sessões de treino, parceiro, inscrições e partidas persistidas.

## Migration v8

A migration é idempotente e:

- preserva todo o save existente;
- converte tutorial ausente ou antigo para o modelo v2;
- marca lado/estilo quando já definidos;
- reconhece sessões de treino, parceiro, evento de torneio e partidas;
- não força jogadores antigos a repetir ações;
- mantém progresso e recompensas das missões antigas, apenas desativando etapas introdutórias removidas do catálogo ativo.

## Missões iniciais

O catálogo foi reduzido de 18 para 11 etapas orientadas ao ciclo principal. Cada missão canônica contém descrição, motivo, ação, rota, recompensa e critério de domínio.

- Lado e estilo: concluídos somente após persistir a escolha.
- Treino: `complete_training` após execução real.
- Parceiro: `select_partner` após formar a parceria.
- Torneio: `join_tournament` após criar a inscrição.
- Resultado: `play_matches` após concluir partida.
- Abertura de página permanece apenas nas etapas cujo objetivo é conhecer painel, calendário ou ranking.

## Introduções e progressive disclosure

Há textos específicos para painel, missões, treinos, parceiros, torneios, calendário, ranking, mercado, jornal, histórico, finanças, loja/equipamentos, inventário, aparência, imprensa e legado. Outras rotas recebem uma introdução curta genérica.

As introduções podem ser recolhidas e expandidas, e a preferência é salva por rota. Sistemas avançados são sinalizados em texto, mas continuam acessíveis.

## Recomendações

Prioridade centralizada:

1. identidade incompleta;
2. energia baixa;
3. ausência de parceiro;
4. ausência de torneio inscrito;
5. saldo baixo;
6. planejamento semanal.

Cada recomendação informa importância, motivo, rota e ação.

## Ajuda e glossário

O botão de ajuda permanece visível no layout e abre:

- ciclo principal;
- checklist completo;
- explicação de todas as etapas;
- reinício das explicações;
- glossário de atributos, energia, fadiga, confiança, entrosamento, reputação, ranking, experiência, potencial, estilo, lado, calendário, temporada, circuito, inscrição, premiação, seed, patrocinador e legado.

## Verificação

- ESLint: aprovado.
- Validação de arquitetura: aprovada.
- `TutorialSideFlowTest`: 7 cenários aprovados.
- `OnboardingV2Test`: estado, migration, recomendações e introduções aprovados.
- `CareerSystemsAuditTest`: persistência, migration e missões aprovadas.
- Build Vite: aprovado, 3.754 módulos transformados.

## Riscos e pendências

- A validação automatizada cobre o fluxo de estado, mas a execução visual completa até o primeiro torneio exige uma sessão Tauri interativa e um save real.
- Tooltips específicos dentro de cada controle complexo continuam dependendo dos componentes de cada módulo; os conceitos essenciais estão no texto de página e no glossário, sem depender exclusivamente de tooltip.
- O typecheck global já possuía erros amplos de tipagem dinâmica de entidades/props e não é atualmente um gate confiável; lint, testes focados e build foram usados como gates.
