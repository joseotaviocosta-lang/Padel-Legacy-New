import { APP_ROUTES } from '../navigation/routes.js';

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
//
// v12 (Tutorial 4.1, docs/TUTORIAL_4_1_EXPANDED_ONBOARDING_AND_COACH_CLARITY.md,
// Partes A-E): a primeira partida oficial ensinava só o loop básico
// (criar atleta, dupla, treinador, treino, calendário, competir) e
// terminava o tutorial ali — sistemas inteiros (comissão técnica,
// economia, patrocínios, loja, equipamentos, atletas do circuito,
// ranking, mundo do padel, notícias, imprensa, central de notificações)
// nunca eram apresentados. 12 novas etapas VISIT (auto-completam ao
// visitar a rota real, mesmo mecanismo de v10 — ver OnboardingGuide.jsx)
// são inseridas entre first-match e autonomy. Nenhuma etapa existente
// mudou de id/objectiveType/mecanismo — só houve inserção, então uma
// carreira em andamento continua resolvendo corretamente pelo mesmo
// raciocínio de v9 (busca por conteúdo da lista atual, não por posição).
// Saves que já tinham completado autonomy sob a definição de 15 etapas
// reabrem automaticamente (decisão deliberada — ver Parte 1 do plano):
// completedStepIds não inclui os 12 ids novos, então
// reconcileTutorialProgress recalcula status='in_progress' ao vivo, sem
// revogar nenhuma recompensa nem apagar o completedAt histórico.
// v13 (Correção UI/cronologia): reordena a trilha para nunca deixar o
// jogador esperando o calendário no meio do onboarding. `calendar-known`
// (só "avance 1 dia") saiu de "Competições" para "Desenvolvimento do
// atleta" (sempre cumprível). `tournament-registered`/`first-match`
// (Competições de verdade) foram movidas para o fim da trilha, logo antes
// de `autonomy` — depois de todos os grupos cumpríveis no dia 1. Nenhum id,
// objectiveType ou mecanismo de conclusão mudou, só a ORDEM — mesmo
// raciocínio de v9: reconcileTutorialProgress escaneia por conteúdo da
// lista atual, nunca por posição salva, então uma carreira em andamento
// continua resolvendo corretamente.
// Fase 3, item 3C.3: bump manual — "Competições" (tournament-registered/
// first-match) mudou de POSIÇÃO no catálogo (voltou pra logo após o
// calendário). Carreiras com tutorial em andamento precisam reconciliar
// de novo pra "etapa atual" refletir a nova ordem, não a posição antiga.
export const TUTORIAL_VERSION = 14;

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
  step('first-training', 'complete_training', 'Faça o primeiro treino', APP_ROUTES.TRAINING, 'Desenvolvimento do atleta', 'domain_event', {
    actionLabel: 'Escolher treino',
    explanation: 'Compare grupos, intensidade, ganho previsto, energia e fadiga, e conclua uma sessão. Dias sem treino ou partida recuperam energia e reduzem fadiga automaticamente ao avançar o calendário.',
    whyItMatters: 'Treinos são a principal forma de desenvolver seu atleta ao longo da carreira; um atleta cansado treina pior e pode chegar sem condições para competir.',
    reward: { xp: 50, coins: 75 },
    kind: 'EVENT',
  }),

  // ── Fase E — Calendário (Correção UI/cronologia: mudou de chapter
  // "Competições" para "Desenvolvimento do atleta" — "avance 1 dia" nunca
  // dependeu de torneio nenhum, sempre foi cumprível no dia 1. Só o
  // registro/disputa de torneio de verdade precisa esperar o calendário
  // chegar numa inscrição aberta — por isso ficou sozinho, mais adiante). ──
  step('calendar-known', 'visit_calendar', 'Planeje pelo calendário e avance um dia', '/game/calendar', 'Desenvolvimento do atleta', 'confirm_understanding', {
    explanation: 'Confira treinos, recuperações, inscrições, partidas e eventos futuros, e avance um dia para ver o ciclo em ação.',
    whyItMatters: 'O calendário evita conflitos e ajuda a chegar com energia aos compromissos importantes.',
    kind: 'VISIT',
  }),

  // ── Fase F — Competições (Fase 3, item 3C.3: volta pra cá, logo após o
  // calendário — posição original de antes da Fase 15.7. O motivo de ter
  // sido movida pro fim (1º torneio real só abria ~5 dias e só ocorria
  // ~35 dias após o início da carreira) não existe mais: a Fase 3 criou
  // um evento de Exibição/Pré-Temporada com inscrição livre desde o dia 1
  // e chave de 8 (circuitCatalog.js:buildPreSeasonExhibition) — "Inscreva-se
  // em um torneio" volta a ser cumprível cedo de verdade, não só na
  // teoria. O que precisa continuar exigindo um evento do CIRCUITO
  // MUNDIAL (não a Exibição) é a etapa seguinte, "first-match" — ver
  // tutorialState.js:deriveTutorialFacts (`world_tour_event !== false`). ──
  step('tournament-registered', 'join_tournament', 'Inscreva-se em um torneio', '/tournaments', 'Competições', 'domain_event', {
    requirements: ['has-partner'],
    explanation: 'Escolha um evento com inscrições abertas (a Exibição de pré-temporada já vale, sem esperar o calendário do circuito) e confirme a vaga da dupla.',
    whyItMatters: 'Somente inscrições confirmadas permitem jogar; torneios com datas sobrepostas geram conflito.',
    actionLabel: 'Escolher torneio',
    reward: { xp: 100, coins: 150 },
    kind: 'EVENT',
  }),
  // Primeiro torneio DO CIRCUITO MUNDIAL (a Exibição não conta pra esta
  // etapa — matchCompleted em tutorialState.js exige world_tour_event
  // !== false). Pode acontecer dias depois; nunca trava o resto do jogo —
  // o Guia flutuante mostra a etapa pendente sem bloquear nenhuma outra
  // tela enquanto o torneio não chega.
  step('first-match', 'play_matches', 'Jogue sua primeira partida do circuito mundial', APP_ROUTES.TOURNAMENTS, 'Competições', 'domain_event', {
    explanation: 'A Exibição de pré-temporada é um bom aquecimento, mas esta etapa pede uma partida de um evento do Circuito Mundial de verdade. No dia do torneio, jogue a partida — o técnico ao vivo orienta táticas durante o jogo. Depois do resultado, responda a entrevista pós-jogo se ela for gerada, e siga para a próxima rodada.',
    whyItMatters: 'O resultado mostra como treino, parceiro e tática funcionaram juntos.',
    reward: { xp: 100, coins: 150 },
    kind: 'EVENT',
  }),

  // ── Fase G — Construa sua equipe (Tutorial 4.1, Parte D: comissão
  // técnica + auxiliares numa página só — /staff não tem sub-view que
  // distinga um do outro, então uma visita ensina os dois) ─────────────
  step('staff-known', 'visit_staff', 'Conheça a Comissão Técnica', '/staff', 'Comissão técnica', 'confirm_understanding', {
    actionLabel: 'Ver comissão',
    explanation: 'A comissão reúne especialistas de apoio (físico, fisioterapia, nutrição, psicologia, análise) que trabalham sob a liderança do treinador principal, cada um com custo mensal próprio.',
    whyItMatters: 'Contratar a comissão certa acelera a evolução do atleta — mas nada aqui é obrigatório agora.',
    kind: 'VISIT',
  }),

  // ── Fase H — Aprenda a ganhar e gastar dinheiro ──────────────────────
  step('economy-known', 'visit_economy', 'Conheça sua economia', '/game/economy?view=dashboard', 'Economia e patrimônio', 'confirm_understanding', {
    actionLabel: 'Ver economia',
    explanation: 'Veja saldo, receitas, despesas e salários da carreira num só painel.',
    whyItMatters: 'Entender para onde o dinheiro vai ajuda a planejar contratações e investimentos.',
    kind: 'VISIT',
  }),
  step('sponsors-known', 'visit_sponsors', 'Conheça os patrocínios', '/game/economy?view=sponsors', 'Economia e patrimônio', 'confirm_understanding', {
    actionLabel: 'Ver patrocínios',
    explanation: 'Patrocínios são uma das principais formas de financiar sua carreira — marcas oferecem contratos conforme sua evolução, exposição e resultados.',
    whyItMatters: 'Nem sempre existe um contrato adequado agora; a etapa é só conhecer onde eles aparecem.',
    kind: 'VISIT',
  }),
  step('opportunities-known', 'visit_opportunities', 'Conheça outras oportunidades', '/game/economy?view=opportunities', 'Economia e patrimônio', 'confirm_understanding', {
    actionLabel: 'Ver oportunidades',
    explanation: 'Além de premiação de torneio e patrocínios, oportunidades pontuais também podem aparecer aqui.',
    whyItMatters: 'Conhecer todas as fontes de receita reais evita depender só das partidas.',
    kind: 'VISIT',
  }),
  step('shop-known', 'visit_shop', 'Conheça a loja', '/game/shop', 'Economia e patrimônio', 'confirm_understanding', {
    actionLabel: 'Ver loja',
    explanation: 'A loja vende itens e equipamentos para o atleta — nada aqui precisa ser comprado agora.',
    whyItMatters: 'Saber onde comprar evita procurar às pressas antes de um torneio importante.',
    kind: 'VISIT',
  }),
  step('equipment-known', 'visit_equipment', 'Entenda equipamentos e bônus', '/game/inventory', 'Economia e patrimônio', 'confirm_understanding', {
    actionLabel: 'Ver equipamentos',
    explanation: 'Equipamentos não são só cosméticos — itens equipados podem dar bônus reais de atributo.',
    whyItMatters: 'Equipar o item certo pode valer tanto quanto um treino bem escolhido.',
    kind: 'VISIT',
  }),

  // ── Fase I — Conheça o circuito ───────────────────────────────────────
  step('athletes-known', 'visit_athletes', 'Conheça os atletas do circuito', '/athletes', 'Conheça o circuito', 'confirm_understanding', {
    actionLabel: 'Ver atletas',
    explanation: 'Consulte quem está no circuito, ranking, estilo, características e evolução dos outros atletas.',
    whyItMatters: 'Conhecer o circuito ajuda a entender contra quem (e por quê) você está competindo.',
    kind: 'VISIT',
  }),
  step('ranking-known', 'visit_ranking_page', 'Conheça o ranking', '/ranking', 'Conheça o circuito', 'confirm_understanding', {
    actionLabel: 'Ver ranking',
    explanation: 'Veja sua posição atual, pontos e evolução — e o que falta para subir no circuito.',
    whyItMatters: 'O ranking é o objetivo competitivo de longo prazo da carreira.',
    kind: 'VISIT',
  }),
  step('world-known', 'visit_world', 'Conheça o mundo do padel', '/world', 'Conheça o circuito', 'confirm_understanding', {
    actionLabel: 'Ver circuito',
    explanation: 'O mundo do padel continua em movimento — bulletins, rivalidades e o pulso geral do circuito aparecem aqui.',
    whyItMatters: 'O circuito evolui mesmo quando você não está jogando.',
    kind: 'VISIT',
  }),
  step('news-known', 'visit_news', 'Conheça as notícias', '/journal', 'Conheça o circuito', 'confirm_understanding', {
    actionLabel: 'Ver notícias',
    explanation: 'O jornal do circuito mostra manchetes, campeões recentes, rivalidades e resultados relevantes.',
    whyItMatters: 'O universo do jogo continua evoluindo independentemente de você.',
    kind: 'VISIT',
  }),
  step('press-known', 'visit_press_room', 'Conheça a imprensa', '/press', 'Conheça o circuito', 'confirm_understanding', {
    actionLabel: 'Ver imprensa',
    explanation: 'Entrevistas e repercussão na mídia acompanham sua evolução e resultados no circuito.',
    whyItMatters: 'Sua relação com a imprensa é parte da sua carreira, não só um extra.',
    kind: 'VISIT',
  }),
  step('notifications-known', 'visit_notifications', 'Conheça a central de notificações', '/communications', 'Conheça o circuito', 'confirm_understanding', {
    actionLabel: 'Ver notificações',
    explanation: 'O sino é a central operacional da carreira: decisões importantes, propostas, partidas e relatórios aparecem ali.',
    whyItMatters: 'Vale conferir o sino regularmente — sem precisar abrir cada notificação agora.',
    kind: 'VISIT',
  }),

  step('autonomy', 'finish_tutorial', 'Comece a carreira livre', '/game', 'Gestão, história e legado', 'confirm_understanding', {
    actionLabel: 'Começar carreira livre',
    explanation: 'Você já conhece os principais sistemas do Padel Legacy. A partir daqui, as decisões são suas: treine, monte sua equipe, encontre parceiros, conquiste patrocinadores e suba no circuito. O Guia flutuante continua disponível para ajuda contextual.',
    whyItMatters: 'Você já conheceu o essencial e o avançado — a partir daqui, suas Conquistas acompanham a evolução da carreira.',
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
