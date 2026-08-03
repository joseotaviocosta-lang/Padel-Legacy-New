export const TUTORIAL_VERSION = 3;

export const TUTORIAL_STEPS = [
  { id: 'career-created', objectiveType: 'visit_career', title: 'Carreira criada', explanation: 'Seu save está pronto. Agora vamos definir a identidade do atleta.', route: '/game/missions', actionLabel: 'Começar', phase: 'Identidade' },
  { id: 'athlete-named', objectiveType: 'set_player_name', title: 'Dê um nome ao atleta', explanation: 'O nome aparece em partidas e notícias; ele não altera o nome do save.', route: '/game/missions', actionLabel: 'Definir nome', phase: 'Identidade' },
  { id: 'side-selected', objectiveType: 'choose_court_side', title: 'Escolha seu lado', explanation: 'Direita prioriza construção; esquerda, finalização.', route: '/game/missions', actionLabel: 'Escolher lado', phase: 'Identidade' },
  { id: 'style-selected', objectiveType: 'choose_play_style', title: 'Defina seu estilo', explanation: 'O estilo determina seus pontos fortes iniciais.', route: '/game/missions', actionLabel: 'Escolher estilo', phase: 'Identidade' },
  { id: 'first-training', objectiveType: 'complete_training', title: 'Faça seu primeiro treino', explanation: 'Melhore um atributo e confira o custo antes de confirmar.', route: '/game/training', actionLabel: 'Ir para Treinos', phase: 'Preparação' },
  { id: 'energy-understood', objectiveType: 'understand_energy', title: 'Entenda sua energia', explanation: 'O treino consumiu energia; recupere antes de competir cansado.', route: '/game/training', actionLabel: 'Ver energia', phase: 'Preparação' },
  { id: 'partner-selected', objectiveType: 'select_partner', title: 'Forme sua dupla', explanation: 'Escolha por compatibilidade; ações antecipadas também serão reconhecidas.', route: '/partners', actionLabel: 'Escolher parceiro', phase: 'Dupla' },
  { id: 'tournament-registered', objectiveType: 'join_tournament', title: 'Inscreva-se no primeiro torneio', explanation: 'Escolha uma competição compatível com sua dupla e energia.', route: '/tournaments', actionLabel: 'Ver torneios', phase: 'Competição' },
  { id: 'first-match', objectiveType: 'play_matches', title: 'Dispute sua primeira partida', explanation: 'A conclusão persistida da partida avança o tutorial.', route: '/matches', actionLabel: 'Jogar', phase: 'Competição' },
  { id: 'autonomy', objectiveType: 'visit_career_after_intro', title: 'Continue seu ciclo de carreira', explanation: 'Avalie o resultado e escolha seu próximo objetivo.', route: '/game', actionLabel: 'Ver painel', phase: 'Autonomia' },
];

export const CORE_GAME_LOOP = ['Planejar', 'Treinar', 'Administrar energia', 'Escolher parceiro', 'Competir', 'Receber resultados', 'Evoluir', 'Subir no ranking'];

export const GLOSSARY = {
  Atributo: 'Uma habilidade do atleta, como controle, defesa, saque ou smash.',
  Energia: 'Recurso gasto em treinos e partidas. Energia baixa prejudica o desempenho.',
  Fadiga: 'Cansaço acumulado. Excesso de atividade aumenta o risco físico.',
  Confiança: 'Momento mental do atleta, influenciado principalmente pelos resultados.',
  Entrosamento: 'Quanto a dupla está acostumada a jogar junta. Mais entrosamento melhora a coordenação.',
  Reputação: 'Reconhecimento conquistado por desempenho, resultados e exposição.',
  Ranking: 'Posição competitiva usada para acompanhar evolução e liberar torneios mais fortes.',
  Experiência: 'Progresso recebido por atividades e resultados, usado para avançar de nível.',
  Potencial: 'Estimativa de quanto um atleta ainda pode evoluir.',
  Estilo: 'Perfil tático que define pontos fortes e orienta seu desenvolvimento.',
  Lado: 'Posição preferencial na dupla: direita para construção ou esquerda para definição.',
  Calendário: 'Planejamento de treinos, descansos, viagens, torneios e eventos.',
  Temporada: 'Período competitivo que reúne calendário, metas e resultados anuais.',
  Circuito: 'Conjunto de torneios, atletas e rankings do mundo do jogo.',
  Inscrição: 'Confirmação da dupla em um torneio, sujeita a requisitos e custos.',
  Premiação: 'Recompensas de um torneio, como moedas, experiência e pontos de ranking.',
  Seed: 'Posição inicial de uma dupla na chave, geralmente baseada no ranking.',
  Patrocinador: 'Contrato comercial que paga benefícios e pode exigir metas.',
  Legado: 'Resumo duradouro das conquistas e do impacto da sua carreira.',
};
