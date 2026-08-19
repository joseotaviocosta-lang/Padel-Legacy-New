// Onboarding 2.0 (docs/ONBOARDING_V3_COMMUNICATIONS.md): a versão 8 tinha 57
// etapas — visitava praticamente toda página do jogo ("confirm_understanding"
// para cada hub/aba) antes de liberar a carreira livre. QA real: tutorial
// longo, fragmentado, e ainda ensinava hubs legados (`/development`,
// `/team-hub`, `/competitions`, `/world`, `/management` — mantidos vivos só
// para o tutorial, ver comentário em navigationConfig.js) que a navegação em
// grupos (Fase 3) já substituiu. V9 reduz para o essencial de criar o
// atleta, formar a dupla, conhecer o treinador, treinar, entender o
// calendário e disputar a primeira partida — o resto (equipamentos, loja,
// comissão completa, imprensa, comunidade, mercado, ranking, mundo vivo,
// estatísticas, temporada, economia, relacionamentos, história/legado,
// administração) passa a ser aprendido sob demanda pelo Guia flutuante
// contextual (`OnboardingGuide.jsx`), que já cobre essas rotas via
// `pageIntroductions.js` — não duplicado aqui.
//
// Migração: NENHUMA lógica nova foi necessária. `reconcileTutorialProgress`
// (tutorialState.js) já calcula a etapa atual escaneando `TUTORIAL_STEPS`
// (a lista viva, agora menor) em busca do primeiro id ausente de
// `completedStepIds` — ids de etapas removidas na carreira salva ficam só
// como entradas inertes no array (nunca mais procuradas), e etapas
// reordenadas continuam resolvendo corretamente porque a busca é por
// conteúdo da lista atual, não por posição/índice salvo. Uma carreira em
// andamento nunca fica presa num id que não existe mais.
//
// v10 (Onboarding Flow 3.1): adiciona só o campo `kind` a cada etapa —
// classifica VISIT/ACTION/DECISION/EVENT/FINISH (auditoria completa em
// docs/ONBOARDING_FLOW_3_1.md). Nenhum id, rota ou requisito mudou; muda
// apenas o MECANISMO de conclusão das 6 etapas `kind: 'VISIT'`
// (confirm_understanding por clique em "Entendi" → auto-complete ao
// visitar a rota, ver OnboardingGuide.jsx). `completedStepIds` continua
// sendo só uma lista de ids — o mecanismo de conclusão nunca foi
// persistido, sempre lido ao vivo deste array — então, pelo mesmo
// raciocínio do comentário de v9 acima, nenhuma migração de save é
// necessária.
//
// v11 (Starter Coach Flow, docs/STARTER_COACH_FLOW.md): coaches-known
// muda de VISIT/confirm_understanding para DECISION/domain_event — só
// conclui contratando um treinador de verdade (uma carreira nova deixou
// de receber um treinador contratado silenciosamente). Id e objectiveType
// não mudaram, mesmo raciocínio de v10: nenhuma migração necessária.
export const TUTORIAL_VERSION = 11;

const step = (id, objectiveType, title, route, chapter, completionType = 'open_and_interact', extra = {}) => ({
  id,
  objectiveType,
  title,
  explanation: extra.explanation || `Conheça ${title.toLowerCase()} e veja como este recurso participa da sua carreira.`,
  whyItMatters: extra.whyItMatters || 'Entender este recurso ajuda você a tomar decisões melhores e evoluir com mais segurança.',
  route,
  actionLabel: extra.actionLabel || 'Conhecer recurso',
  chapter,
  phase: chapter,
  completionType,
  // Onboarding Flow 3.1: classificação editorial (VISIT/ACTION/DECISION/
  // EVENT/FINISH) — só VISIT muda comportamento (auto-complete ao visitar
  // a rota, em vez de exigir clique em "Entendi"). As outras 4 categorias
  // documentam um mecanismo que já era correto e não muda.
  kind: extra.kind || null,
  targetTab: extra.targetTab || null,
  targetElement: extra.targetElement || null,
  requirements: extra.requirements || [],
  reward: extra.reward || { xp: 20, coins: 35 },
});

// Onboarding principal (obrigatório) — só o essencial para começar a
// jogar de verdade: criar o atleta, formar a dupla, conhecer o treinador,
// treinar, entender o calendário e disputar a primeira partida. Tudo que
// era "visite esta página" para sistemas avançados (equipamentos, loja,
// comissão completa, imprensa, comunidade, mercado, ranking, mundo vivo,
// estatísticas, temporada, economia, relacionamentos, história/legado,
// administração, hubs legados) saiu daqui — vira Guia opcional/contextual,
// nunca bloqueia a conclusão do onboarding principal.
export const TUTORIAL_STEPS = [
  // ── Fase A — Criar o atleta ──────────────────────────────────────────
  step('career-created', 'visit_career', 'Conheça o painel da carreira', '/game', 'Identidade e carreira', 'confirm_understanding', {
    actionLabel: 'Começar tutorial',
    explanation: 'O painel reúne a data, sua condição atual, compromissos e as ações mais importantes do momento.',
    whyItMatters: 'Ele será seu ponto de partida para decidir o que fazer a cada dia.',
    reward: { xp: 20, coins: 50 },
    kind: 'VISIT',
  }),
  step('athlete-named', 'set_player_name', 'Dê um nome ao atleta', '/game/missions', 'Identidade e carreira', 'perform_action', {
    actionLabel: 'Definir nome',
    explanation: 'Escolha o nome que aparecerá nas partidas, notícias, rankings e registros da carreira.',
    whyItMatters: 'O nome identifica seu atleta no mundo do jogo sem alterar o nome do arquivo de save.',
    kind: 'ACTION',
  }),
  step('side-selected', 'choose_court_side', 'Escolha mão dominante e lado', '/game/missions', 'Identidade e carreira', 'perform_action', {
    actionLabel: 'Escolher mão e lado',
    explanation: 'Defina se o atleta é destro ou canhoto e em qual lado da quadra prefere atuar.',
    whyItMatters: 'Essas escolhas influenciam posicionamento e combinações de dupla, mas não bloqueiam estilos.',
    kind: 'ACTION',
  }),
  step('difficulty-selected', 'choose_career_difficulty', 'Escolha a dificuldade da carreira', '/game/missions', 'Identidade e carreira', 'perform_action', {
    actionLabel: 'Escolher dificuldade',
    explanation: 'A dificuldade muda o ritmo da evolução — mais rápido no Fácil, tradicional no Difícil — sem alterar o teto final de atributos nem o equilíbrio das partidas.',
    whyItMatters: 'Você pode jogar no seu ritmo preferido; a dificuldade pode ser trocada depois no perfil.',
    kind: 'ACTION',
  }),
  step('style-selected', 'choose_play_style', 'Escolha o estilo de jogo', '/game/missions', 'Identidade e carreira', 'perform_action', {
    actionLabel: 'Escolher estilo',
    explanation: 'Selecione o perfil tático e confira os pontos fortes, fraquezas e atributos iniciais. Seu estilo define os atributos de partida — eles evoluem depois com treino e partidas, sem distribuição manual de pontos.',
    whyItMatters: 'O estilo define seu ponto de partida e orienta treinos e parceiros recomendados.',
    kind: 'ACTION',
  }),
  step('appearance-known', 'visit_character', 'Personalize a aparência', '/character', 'Identidade e carreira', 'confirm_understanding', {
    explanation: 'Altere a identidade visual do atleta e confira a prévia antes de salvar.',
    whyItMatters: 'A aparência diferencia seu personagem sem substituir evolução técnica e esportiva.',
    kind: 'VISIT',
  }),
  step('profile-reviewed', 'review_profile', 'Confirme seu atleta', '/profile', 'Identidade e carreira', 'confirm_understanding', {
    explanation: 'Confira lado, mão dominante, estilo, atributos, nível, energia e progresso geral antes de seguir em frente.',
    whyItMatters: 'O perfil mostra de forma centralizada como o atleta está evoluindo e onde precisa melhorar.',
    actionLabel: 'Confirmar atleta',
    kind: 'VISIT',
  }),

  // ── Fase B — Formar a dupla ──────────────────────────────────────────
  step('offers-reviewed', 'review_partner_offer', 'Analise propostas de parceria', '/partners?view=offers&source=tutorial', 'Dupla e relações', 'confirm_understanding', {
    explanation: 'Abra as propostas recebidas e compare lado, nível, estilo e compatibilidade — um lado complementar ao seu costuma valer mais que o maior overall.',
    whyItMatters: 'A primeira opção nem sempre é a melhor; compatibilidade pode valer mais que o maior nível.',
    actionLabel: 'Analisar propostas',
    kind: 'VISIT',
  }),
  step('partner-selected', 'select_partner', 'Escolha sua primeira dupla', '/partners?view=offers&source=tutorial', 'Dupla e relações', 'domain_event', {
    explanation: 'Aceite uma proposta ou escolha um atleta disponível e confirme a formação.',
    whyItMatters: 'Você precisa de uma dupla válida para disputar a maioria dos torneios.',
    actionLabel: 'Escolher parceiro',
    reward: { xp: 60, coins: 100 },
    kind: 'DECISION',
  }),

  // ── Fase C — Treinador ───────────────────────────────────────────────
  // Hotfix "Starter Coach Flow" (docs/STARTER_COACH_FLOW.md, Parte B/G):
  // era VISIT/confirm_understanding — o jogador só precisava abrir /coaches
  // para concluir, e uma carreira nova já chegava com um treinador
  // contratado silenciosamente por trás. Agora é DECISION/domain_event: só
  // conclui numa contratação real (hirePrimaryCoach dispara o
  // incrementMissionProgress). objectiveType continua 'visit_coaches' de
  // propósito — é a mesma chave já persistida em saves existentes; ver
  // MissionNotificationBridge.jsx para o ajuste que impede a rota sozinha
  // de completar isto de novo.
  step('coaches-known', 'visit_coaches', 'Escolha seu primeiro treinador', '/coaches', 'Desenvolvimento do atleta', 'domain_event', {
    actionLabel: 'Ver treinadores',
    explanation: 'Compare treinadores por tier, especialidade, custo e benefícios reais, e contrate quem combina com sua carreira agora.',
    whyItMatters: 'O treinador melhora treinos e orienta partidas ao vivo — a escolha é sua, não um padrão automático.',
    kind: 'DECISION',
  }),

  // ── Fase D — Primeiro treino ─────────────────────────────────────────
  step('first-training', 'complete_training', 'Faça o primeiro treino', '/game/training', 'Desenvolvimento do atleta', 'domain_event', {
    actionLabel: 'Escolher treino',
    explanation: 'Compare grupos, intensidade, ganho previsto, energia e fadiga, e conclua uma sessão. Dias sem treino ou partida recuperam energia e reduzem fadiga automaticamente ao avançar o calendário.',
    whyItMatters: 'Treinos são a principal forma de desenvolver seu atleta ao longo da carreira; um atleta cansado treina pior e pode chegar sem condições para competir.',
    reward: { xp: 50, coins: 75 },
    kind: 'EVENT',
  }),

  // ── Fase E — Calendário ──────────────────────────────────────────────
  step('calendar-known', 'visit_calendar', 'Planeje pelo calendário e avance um dia', '/game/calendar', 'Competições', 'confirm_understanding', {
    explanation: 'Confira treinos, recuperações, inscrições, partidas e eventos futuros, e avance um dia para ver o ciclo em ação.',
    whyItMatters: 'O calendário evita conflitos e ajuda a chegar com energia aos compromissos importantes.',
    kind: 'VISIT',
  }),

  // ── Fase F — Primeiro torneio (pode acontecer dias depois; nunca
  // trava o resto do jogo — o Guia flutuante mostra a etapa pendente sem
  // bloquear nenhuma outra tela enquanto o torneio não chega) ──────────
  step('tournament-registered', 'join_tournament', 'Inscreva-se em um torneio', '/tournaments', 'Competições', 'domain_event', {
    requirements: ['has-partner'],
    explanation: 'Escolha um evento com inscrições abertas e confirme a vaga da dupla.',
    whyItMatters: 'Somente inscrições confirmadas permitem jogar; torneios com datas sobrepostas geram conflito.',
    actionLabel: 'Escolher torneio',
    reward: { xp: 100, coins: 150 },
    kind: 'EVENT',
  }),
  step('first-match', 'play_matches', 'Jogue sua primeira partida de torneio', '/matches', 'Competições', 'domain_event', {
    explanation: 'No dia do torneio, jogue a partida — o técnico ao vivo orienta táticas durante o jogo. Depois do resultado, responda a entrevista pós-jogo se ela for gerada, e siga para a próxima rodada.',
    whyItMatters: 'O resultado mostra como treino, parceiro e tática funcionaram juntos.',
    reward: { xp: 100, coins: 150 },
    kind: 'EVENT',
  }),

  step('autonomy', 'finish_tutorial', 'Comece a carreira livre', '/game', 'Gestão, história e legado', 'confirm_understanding', {
    actionLabel: 'Concluir tutorial',
    explanation: 'Volte ao painel, veja suas recomendações e confirme que está pronto para seguir no seu ritmo. Loja, comissão completa, imprensa, mercado, ranking, mundo vivo e o resto ficam disponíveis a qualquer momento pelo Guia flutuante.',
    whyItMatters: 'Você já conhece o essencial e poderá consultar o Guia sempre que precisar.',
    reward: { xp: 100, coins: 200 },
    // Único confirm_understanding que NÃO auto-completa por visita: fecha o
    // onboarding principal de propósito, compartilha rota (/game) com
    // career-created, e já tem fluxo dedicado próprio (botão "Começar
    // carreira livre" em CareerHub.jsx) — nunca foi, e continua não sendo,
    // um passo de visita passiva.
    kind: 'FINISH',
  }),
];

export const TUTORIAL_MISSION_CATALOG = TUTORIAL_STEPS.map((tutorialStep, index) => ({
  id: `tutorial-${tutorialStep.id}`,
  catalog_key: `tutorial-${tutorialStep.id}`,
  title: tutorialStep.title,
  description: tutorialStep.explanation,
  why_it_matters: tutorialStep.whyItMatters,
  action_label: tutorialStep.actionLabel,
  mission_type: 'tutorial',
  objective_type: tutorialStep.objectiveType,
  target_count: 1,
  xp_reward: Number(tutorialStep.reward?.xp || 0),
  coins_reward: Number(tutorialStep.reward?.coins || 0),
  tutorial_order: index + 1,
  tutorial_chapter: tutorialStep.chapter,
  tutorial_route: tutorialStep.route,
  target_tab: tutorialStep.targetTab,
  target_element: tutorialStep.targetElement,
  completion_type: tutorialStep.completionType,
  requirements: tutorialStep.requirements,
}));

export const CORE_GAME_LOOP = ['Planejar', 'Treinar', 'Recuperar', 'Formar dupla', 'Inscrever-se', 'Competir', 'Analisar resultados', 'Evoluir'];

export const GLOSSARY = {
  Atributo: 'Habilidade técnica, física, tática ou mental do atleta.',
  Energia: 'Recurso consumido por treinos e partidas e recuperado automaticamente em dias livres.',
  Fadiga: 'Desgaste acumulado. Dias livres e a equipe técnica ajudam a controlá-lo.',
  Confiança: 'Momento mental que influencia decisões e execução sob pressão.',
  Entrosamento: 'Coordenação construída por uma dupla ao jogar e treinar junta.',
  Reputação: 'Reconhecimento público e esportivo conquistado ao longo da carreira.',
  Ranking: 'Classificação competitiva usada para comparar atletas e liberar eventos.',
  Experiência: 'Progresso acumulado que contribui para evolução e nível.',
  Potencial: 'Margem esperada de desenvolvimento de um atleta.',
  Estilo: 'Tendência tática que orienta escolhas de golpes e posicionamento.',
  Lado: 'Posição preferencial do atleta na direita, esquerda ou de forma versátil.',
  Calendário: 'Agenda de treinos, descansos, inscrições, partidas e eventos.',
  Temporada: 'Ciclo competitivo anual da carreira.',
  Circuito: 'Conjunto de atletas, rankings, clubes e torneios do mundo do jogo.',
  Inscrição: 'Confirmação que garante a presença da dupla em um torneio.',
  Premiação: 'Recompensa esportiva e financeira recebida por resultados.',
  Patrocinador: 'Parceiro comercial que pode oferecer renda e objetivos.',
  Legado: 'Impacto duradouro construído por títulos, recordes e conquistas.',
  'Comissão técnica': 'Especialistas de apoio (físico, fisioterapia, nutrição, psicologia, análise, olheiro, empresário, contador) que atuam sob a liderança do treinador principal.',
  'Treinador principal': 'Único responsável por treinos e orientação ao vivo em partidas; é obrigatório e não ocupa nenhuma vaga da comissão técnica.',
};
