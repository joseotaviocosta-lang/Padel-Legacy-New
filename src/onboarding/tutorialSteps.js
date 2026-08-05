export const TUTORIAL_VERSION = 6;

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
  targetTab: extra.targetTab || null,
  targetElement: extra.targetElement || null,
  requirements: extra.requirements || [],
  reward: extra.reward || { xp: 20, coins: 35 },
});

export const TUTORIAL_CHAPTERS = Object.freeze([
  { id: 'identity', title: 'Identidade e carreira', unlockAfter: null },
  { id: 'development', title: 'Desenvolvimento do atleta', unlockAfter: 'profile-reviewed' },
  { id: 'team', title: 'Dupla e relações', unlockAfter: 'first-training' },
  { id: 'competition', title: 'Competições', unlockAfter: 'partner-selected' },
  { id: 'world', title: 'Mundo do padel', unlockAfter: 'first-match' },
  { id: 'management', title: 'Gestão, história e legado', unlockAfter: 'world-hub-known' },
]);

export const TUTORIAL_STEPS = [
  step('career-created', 'visit_career', 'Conheça o painel da carreira', '/game', 'Identidade e carreira', 'confirm_understanding', {
    actionLabel: 'Começar tutorial',
    explanation: 'O painel reúne a data, sua condição atual, compromissos e as ações mais importantes do momento.',
    whyItMatters: 'Ele será seu ponto de partida para decidir o que fazer a cada dia.',
    reward: { xp: 20, coins: 50 },
  }),
  step('athlete-named', 'set_player_name', 'Dê um nome ao atleta', '/game/missions', 'Identidade e carreira', 'perform_action', {
    actionLabel: 'Definir nome',
    explanation: 'Escolha o nome que aparecerá nas partidas, notícias, rankings e registros da carreira.',
    whyItMatters: 'O nome identifica seu atleta no mundo do jogo sem alterar o nome do arquivo de save.',
  }),
  step('side-selected', 'choose_court_side', 'Escolha mão dominante e lado', '/game/missions', 'Identidade e carreira', 'perform_action', {
    actionLabel: 'Escolher mão e lado',
    explanation: 'Defina se o atleta é destro ou canhoto e em qual lado da quadra prefere atuar.',
    whyItMatters: 'Essas escolhas influenciam posicionamento e combinações de dupla, mas não bloqueiam estilos.',
  }),
  step('style-selected', 'choose_play_style', 'Escolha o estilo de jogo', '/game/missions', 'Identidade e carreira', 'perform_action', {
    actionLabel: 'Escolher estilo',
    explanation: 'Selecione o perfil tático e confira os pontos fortes, fraquezas e atributos iniciais.',
    whyItMatters: 'O estilo define seu ponto de partida e orienta treinos e parceiros recomendados.',
  }),
  step('profile-reviewed', 'review_profile', 'Revise o perfil do atleta', '/profile', 'Identidade e carreira', 'confirm_understanding', {
    explanation: 'Confira lado, mão dominante, estilo, atributos, nível, energia e progresso geral.',
    whyItMatters: 'O perfil mostra de forma centralizada como o atleta está evoluindo e onde precisa melhorar.',
    actionLabel: 'Revisar perfil',
  }),
  step('missions-known', 'visit_missions', 'Entenda objetivos e missões', '/game/missions', 'Identidade e carreira', 'confirm_understanding', {
    explanation: 'Veja o tutorial, as missões diárias, semanais, mensais e sazonais e acompanhe cada recompensa.',
    whyItMatters: 'Missões orientam o início, dão metas de curto e longo prazo e recompensam ações reais.',
  }),
  step('appearance-known', 'visit_character', 'Personalize a aparência', '/character', 'Identidade e carreira', 'confirm_understanding', {
    explanation: 'Altere a identidade visual do atleta e confira a prévia antes de salvar.',
    whyItMatters: 'A aparência diferencia seu personagem sem substituir evolução técnica e esportiva.',
  }),
  step('achievements-known', 'visit_achievements', 'Conheça as conquistas', '/achievements', 'Identidade e carreira', 'confirm_understanding', {
    explanation: 'Consulte desafios permanentes, marcos raros e recompensas especiais da trajetória.',
    whyItMatters: 'Conquistas registram feitos que vão além das missões periódicas.',
  }),
  step('stats-known', 'visit_career_stats', 'Acompanhe as estatísticas', '/game/stats', 'Identidade e carreira', 'confirm_understanding', {
    explanation: 'Analise partidas, vitórias, evolução, desempenho e tendências da carreira.',
    whyItMatters: 'Os números ajudam a identificar o que funciona e onde ajustar sua preparação.',
  }),

  step('development-hub', 'visit_development', 'Abra o centro de Desenvolvimento', '/development', 'Desenvolvimento do atleta', 'confirm_understanding', {
    explanation: 'Este hub reúne treinos, equipe técnica, instalações e equipamentos.',
    whyItMatters: 'É aqui que você transforma planejamento em evolução do atleta.',
  }),
  step('training-groups', 'review_training_groups', 'Entenda os grupos de treino', '/game/training', 'Desenvolvimento do atleta', 'confirm_understanding', {
    explanation: 'Compare grupos, focos, intensidades, atributos trabalhados e custo de energia.',
    whyItMatters: 'Treinar bem exige equilibrar evolução, fadiga e calendário competitivo.',
  }),
  step('first-training', 'complete_training', 'Faça o primeiro treino', '/game/training', 'Desenvolvimento do atleta', 'domain_event', {
    actionLabel: 'Escolher treino',
    explanation: 'Conclua uma sessão e observe como o progresso é distribuído entre atributos relacionados.',
    whyItMatters: 'Treinos são a principal forma de desenvolver seu atleta ao longo da carreira.',
    reward: { xp: 50, coins: 75 },
  }),
  step('energy-understood', 'understand_energy', 'Entenda energia e fadiga', '/game/training', 'Desenvolvimento do atleta', 'confirm_understanding', {
    explanation: 'Confira a energia antes e depois das atividades e veja como intensidade e repetição geram desgaste.',
    whyItMatters: 'Um atleta cansado treina pior e pode chegar sem condições para competir.',
  }),
  step('first-recovery', 'visit_recovery', 'Entenda a recuperação automática', '/game/training', 'Desenvolvimento do atleta', 'confirm_understanding', {
    explanation: 'Dias sem treino ou partida recuperam energia e reduzem fadiga automaticamente ao avançar o calendário.',
    whyItMatters: 'Recuperação faz parte do planejamento; descansar no momento certo também melhora resultados.',
  }),
  step('training-center-known', 'visit_training_center', 'Conheça o centro de treinamento', '/training-center', 'Desenvolvimento do atleta', 'confirm_understanding', {
    explanation: 'Veja instalações, melhorias e estruturas disponíveis para a preparação.',
    whyItMatters: 'Uma estrutura melhor pode aumentar a eficiência dos treinos e da recuperação.',
  }),
  step('coaches-known', 'visit_coaches', 'Conheça os treinadores', '/coaches', 'Desenvolvimento do atleta', 'confirm_understanding', {
    explanation: 'Compare profissionais, especialidades e benefícios oferecidos por cada treinador.',
    whyItMatters: 'A equipe técnica direciona a evolução e ajuda a corrigir fraquezas específicas.',
  }),
  step('inventory-known', 'visit_inventory', 'Conheça seus equipamentos', '/game/inventory', 'Desenvolvimento do atleta', 'confirm_understanding', {
    explanation: 'Consulte os itens que possui, seus efeitos e qual está equipado.',
    whyItMatters: 'O inventário evita compras duplicadas e permite ajustar seu equipamento ativo.',
  }),
  step('shop-known', 'visit_shop', 'Conheça a loja', '/game/shop', 'Desenvolvimento do atleta', 'confirm_understanding', {
    explanation: 'Compare preços, efeitos e requisitos antes de comprar um equipamento.',
    whyItMatters: 'Gastar com cuidado preserva recursos para inscrições, recuperação e oportunidades futuras.',
  }),
  step('item-equipped', 'equip_item', 'Equipe um item', '/game/inventory', 'Desenvolvimento do atleta', 'domain_event', {
    explanation: 'Selecione um item disponível e confirme que ele ficou ativo.',
    whyItMatters: 'Somente itens equipados aplicam seus efeitos quando essa regra existir.',
  }),

  step('team-hub', 'visit_team_hub', 'Abra Dupla e relações', '/team-hub', 'Dupla e relações', 'confirm_understanding', {
    explanation: 'Este hub reúne parceiros, propostas, relações públicas e torcida.',
    whyItMatters: 'Sua carreira depende tanto do desempenho individual quanto das pessoas ao seu redor.',
  }),
  step('offers-reviewed', 'review_partner_offer', 'Analise propostas de parceria', '/partners?view=offers&source=tutorial', 'Dupla e relações', 'confirm_understanding', {
    explanation: 'Abra as propostas recebidas e compare lado, nível, estilo, interesse e condições.',
    whyItMatters: 'A primeira opção nem sempre é a melhor; compatibilidade pode valer mais que o maior nível.',
    actionLabel: 'Analisar propostas',
  }),
  step('compatibility-known', 'review_compatibility', 'Entenda a compatibilidade da dupla', '/partners?view=offers&source=tutorial', 'Dupla e relações', 'confirm_understanding', {
    explanation: 'Confira lados da quadra, funções táticas, pontos fortes e possíveis penalidades de adaptação.',
    whyItMatters: 'Uma dupla complementar tende a tomar decisões melhores e cobrir mais situações em quadra.',
  }),
  step('partner-selected', 'select_partner', 'Escolha sua primeira dupla', '/partners?view=offers&source=tutorial', 'Dupla e relações', 'domain_event', {
    explanation: 'Aceite uma proposta ou escolha um atleta disponível e confirme a formação.',
    whyItMatters: 'Você precisa de uma dupla válida para disputar a maioria dos torneios.',
    actionLabel: 'Escolher parceiro',
    reward: { xp: 60, coins: 100 },
  }),
  step('chemistry-known', 'review_chemistry', 'Entenda o entrosamento', '/partners', 'Dupla e relações', 'confirm_understanding', {
    explanation: 'Veja como partidas e treinos em conjunto desenvolvem a coordenação da dupla.',
    whyItMatters: 'Entrosamento melhora com continuidade e pode cair com trocas frequentes.',
  }),
  step('relationships-known', 'visit_relationships', 'Conheça os relacionamentos', '/relationships', 'Dupla e relações', 'confirm_understanding', {
    explanation: 'Acompanhe relações com atletas, profissionais e personagens importantes da carreira.',
    whyItMatters: 'Boas relações podem abrir oportunidades e reduzir conflitos.',
  }),
  step('press-known', 'visit_press', 'Conheça a imprensa', '/press', 'Dupla e relações', 'confirm_understanding', {
    explanation: 'Veja entrevistas, perguntas e repercussões das suas respostas.',
    whyItMatters: 'A comunicação pública influencia reputação, narrativa e relacionamentos.',
  }),
  step('fans-known', 'visit_fans', 'Conheça fãs e torcidas', '/fans', 'Dupla e relações', 'confirm_understanding', {
    explanation: 'Acompanhe apoio, popularidade e reações do público.',
    whyItMatters: 'A torcida ajuda a medir o alcance da carreira além do ranking esportivo.',
  }),

  step('competitions-hub', 'visit_competitions', 'Abra Competições', '/competitions', 'Competições', 'confirm_understanding', {
    explanation: 'Este hub reúne torneios, calendário, partidas, ranking e temporada.',
    whyItMatters: 'Aqui você transforma preparação em resultados oficiais.',
  }),
  step('tournaments-known', 'visit_tournaments', 'Entenda os torneios', '/tournaments', 'Competições', 'confirm_understanding', {
    explanation: 'Compare nível, datas, prazo de inscrição, requisitos, custos e premiações.',
    whyItMatters: 'Escolher eventos adequados evita gastos ruins e confrontos muito acima do seu nível.',
  }),
  step('calendar-known', 'visit_calendar', 'Planeje pelo calendário', '/game/calendar', 'Competições', 'confirm_understanding', {
    explanation: 'Confira treinos, recuperações, inscrições, partidas e eventos futuros.',
    whyItMatters: 'O calendário evita conflitos e ajuda a chegar com energia aos compromissos importantes.',
  }),
  step('tournament-registered', 'join_tournament', 'Inscreva-se em um torneio', '/tournaments', 'Competições', 'domain_event', {
    requirements: ['has-partner'],
    explanation: 'Escolha um evento com inscrições abertas e confirme a vaga da dupla.',
    whyItMatters: 'Somente inscrições confirmadas permitem jogar; torneios com datas sobrepostas geram conflito.',
    actionLabel: 'Escolher torneio',
    reward: { xp: 100, coins: 150 },
  }),
  step('matches-known', 'visit_matches', 'Conheça a central de partidas', '/matches', 'Competições', 'confirm_understanding', {
    explanation: 'Veja partidas disponíveis, resultados e a experiência narrada de jogo.',
    whyItMatters: 'A central organiza tudo que acontece em quadra sem depender de imagens ou replay.',
  }),
  step('match-narration', 'review_match_modes', 'Entenda os modos de narração', '/matches', 'Competições', 'confirm_understanding', {
    explanation: 'Compare narração detalhada, pontos-chave e acompanhamento rápido.',
    whyItMatters: 'Todos os modos preservam o mesmo resultado; muda apenas o nível de detalhe e a velocidade.',
  }),
  step('match-tactics', 'change_match_tactic', 'Altere a tática durante a partida', '/matches', 'Competições', 'confirm_understanding', {
    explanation: 'Teste uma mudança tática e observe como ela altera decisões, risco, golpes e energia.',
    whyItMatters: 'Táticas ajudam a reagir ao placar e ao estilo dos adversários, mas não garantem vitória sozinhas.',
  }),
  step('match-speed', 'change_match_speed', 'Use os controles da partida', '/matches', 'Competições', 'confirm_understanding', {
    explanation: 'Altere a velocidade ou avance até o fim de um ponto, game, set ou partida.',
    whyItMatters: 'Você controla o ritmo da experiência sem alterar o resultado calculado pelo motor.',
  }),
  step('first-match', 'play_matches', 'Conclua sua primeira partida', '/matches', 'Competições', 'domain_event', {
    explanation: 'Jogue ou simule uma partida válida e confira placar, estatísticas, energia e recompensas.',
    whyItMatters: 'O resultado mostra como treino, parceiro e tática funcionaram juntos.',
    reward: { xp: 100, coins: 150 },
  }),
  step('ranking-known', 'visit_ranking', 'Consulte o ranking', '/ranking', 'Competições', 'confirm_understanding', {
    explanation: 'Veja posições de atletas, duplas e outras classificações disponíveis.',
    whyItMatters: 'O ranking mede sua evolução competitiva e libera acesso a eventos mais importantes.',
  }),
  step('season-known', 'visit_season', 'Acompanhe a temporada', '/game/season', 'Competições', 'confirm_understanding', {
    explanation: 'Consulte objetivos, desempenho acumulado e andamento do calendário anual.',
    whyItMatters: 'A visão da temporada ajuda a avaliar progresso de médio prazo, não apenas o último resultado.',
  }),
  step('live-circuit-known', 'visit_live_circuit', 'Acompanhe o circuito ao vivo', '/world-tour/live', 'Competições', 'confirm_understanding', {
    explanation: 'Observe partidas e resultados do mundo do jogo sem interferir na sua carreira.',
    whyItMatters: 'Acompanhar rivais e estrelas deixa o circuito mais vivo e ajuda a entender o cenário competitivo.',
  }),

  step('world-hub-known', 'visit_world_hub', 'Abra o Mundo do padel', '/world', 'Mundo do padel', 'confirm_understanding', {
    explanation: 'Este hub reúne notícias, mercado, atletas, clubes, clima, comunidade e história.',
    whyItMatters: 'O mundo continua evoluindo ao redor do seu atleta e cria oportunidades e desafios.',
  }),
  step('news-known', 'visit_journal', 'Leia as notícias', '/journal', 'Mundo do padel', 'confirm_understanding', {
    explanation: 'Acompanhe resultados, mudanças de dupla, rivalidades e acontecimentos do circuito.',
    whyItMatters: 'Notícias dão contexto ao mundo e ajudam a perceber mudanças relevantes.',
  }),
  step('events-known', 'visit_world_events', 'Conheça os eventos mundiais', '/world-events', 'Mundo do padel', 'confirm_understanding', {
    explanation: 'Veja acontecimentos que alteram o estado do circuito e das carreiras dos bots.',
    whyItMatters: 'Eventos mundiais explicam por que atletas, rankings e oportunidades mudam com o tempo.',
  }),
  step('market-known', 'visit_world_market', 'Explore o mercado mundial', '/world-market', 'Mundo do padel', 'confirm_understanding', {
    explanation: 'Consulte movimentações, valores, oportunidades e situação dos atletas.',
    whyItMatters: 'O mercado ajuda a planejar futuras parcerias e acompanhar a evolução dos rivais.',
  }),
  step('weather-known', 'visit_weather', 'Entenda o clima', '/weather', 'Mundo do padel', 'confirm_understanding', {
    explanation: 'Veja as condições climáticas e os efeitos previstos para os eventos que usam este sistema.',
    whyItMatters: 'Quando ativo, o clima pode mudar preparação, condições e estratégia de competição.',
  }),
  step('athletes-known', 'visit_athletes', 'Conheça os atletas do circuito', '/athletes', 'Mundo do padel', 'confirm_understanding', {
    explanation: 'Pesquise atletas reais e fictícios, lados, estilos, ranking, parceiros e disponibilidade.',
    whyItMatters: 'Conhecer o elenco mundial ajuda a encontrar parceiros, rivais e referências para evoluir.',
  }),
  step('clubs-known', 'visit_clubs', 'Conheça os clubes', '/clubs', 'Mundo do padel', 'confirm_understanding', {
    explanation: 'Compare clubes, estruturas, reputação e oportunidades oferecidas.',
    whyItMatters: 'Clubes podem influenciar treinamento, eventos e conexões da carreira.',
  }),
  step('community-known', 'visit_community', 'Conheça a comunidade', '/community', 'Mundo do padel', 'confirm_understanding', {
    explanation: 'Veja atividades, interações e conteúdos compartilhados pela comunidade do jogo.',
    whyItMatters: 'A comunidade reúne experiências e amplia a sensação de um universo vivo.',
  }),
  step('social-known', 'visit_social', 'Conheça a rede social', '/social', 'Mundo do padel', 'confirm_understanding', {
    explanation: 'Acompanhe publicações, repercussão e presença digital do atleta.',
    whyItMatters: 'A exposição pública pode influenciar fãs, reputação e oportunidades comerciais.',
  }),
  step('encyclopedia-known', 'visit_encyclopedia', 'Consulte a enciclopédia', '/encyclopedia', 'Mundo do padel', 'confirm_understanding', {
    explanation: 'Encontre explicações de regras, conceitos, sistemas e termos do universo do jogo.',
    whyItMatters: 'A enciclopédia permite rever informações sem reiniciar o tutorial.',
  }),

  step('management-hub-known', 'visit_management', 'Abra Gestão', '/management', 'Gestão, história e legado', 'confirm_understanding', {
    explanation: 'Este hub reúne finanças e ferramentas administrativas avançadas.',
    whyItMatters: 'Gestão garante que decisões esportivas sejam sustentáveis ao longo da carreira.',
  }),
  step('finances-known', 'visit_economy', 'Entenda a economia', '/game/economy', 'Gestão, história e legado', 'confirm_understanding', {
    explanation: 'Acompanhe saldo, receitas, despesas, premiações e compromissos financeiros.',
    whyItMatters: 'Uma reserva saudável evita ficar sem recursos para inscrições e evolução.',
  }),
  step('history-known', 'visit_history', 'Conheça a história do padel', '/history', 'Gestão, história e legado', 'confirm_understanding', {
    explanation: 'Consulte registros históricos, temporadas e acontecimentos importantes do esporte.',
    whyItMatters: 'A história contextualiza sua trajetória dentro de um universo maior.',
  }),
  step('hall-of-fame-known', 'visit_hall_of_fame', 'Conheça o Hall da Fama', '/hall-of-fame', 'Gestão, história e legado', 'confirm_understanding', {
    explanation: 'Veja atletas e carreiras que alcançaram feitos históricos.',
    whyItMatters: 'O Hall da Fama representa objetivos máximos para uma trajetória longa.',
  }),
  step('legacy-known', 'visit_legacy', 'Conheça seu legado', '/game/legacy', 'Gestão, história e legado', 'confirm_understanding', {
    explanation: 'Acompanhe marcos, títulos e o impacto acumulado da sua carreira.',
    whyItMatters: 'O legado mostra como o atleta será lembrado além de uma única temporada.',
  }),
  step('admin-known', 'visit_admin', 'Conheça a administração', '/admin', 'Gestão, história e legado', 'confirm_understanding', {
    explanation: 'Veja ferramentas administrativas disponíveis para gerenciamento e diagnóstico do jogo.',
    whyItMatters: 'É uma área avançada; use apenas quando precisar revisar ou ajustar sistemas.',
  }),
  step('database-known', 'visit_database', 'Conheça o banco de dados', '/database', 'Gestão, história e legado', 'confirm_understanding', {
    explanation: 'Consulte entidades e dados internos disponibilizados pelo jogo.',
    whyItMatters: 'Esta área avançada ajuda a diagnosticar conteúdo e integridade dos dados.',
  }),
  step('autonomy', 'finish_tutorial', 'Comece a carreira livre', '/game', 'Gestão, história e legado', 'confirm_understanding', {
    actionLabel: 'Concluir tutorial',
    explanation: 'Volte ao painel, veja suas recomendações e confirme que está pronto para seguir no seu ritmo.',
    whyItMatters: 'Você já conhece as principais áreas e poderá consultar o Guia sempre que precisar.',
    reward: { xp: 100, coins: 200 },
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
};
