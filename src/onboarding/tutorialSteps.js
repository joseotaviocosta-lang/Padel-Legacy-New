export const TUTORIAL_VERSION = 2;

export const TUTORIAL_STEPS = [
  { id: 'career-created', title: 'Carreira criada', explanation: 'Seu save está pronto. Agora vamos definir como seu atleta joga.', route: '/game/missions', actionLabel: 'Começar', phase: 'Identidade' },
  { id: 'athlete-named', title: 'Dê um nome ao atleta', explanation: 'O nome do atleta aparece em partidas, notícias e registros; ele não altera o nome do save.', route: '/game/missions', actionLabel: 'Definir nome', phase: 'Identidade' },
  { id: 'side-selected', title: 'Escolha seu lado', explanation: 'O lado define sua função mais frequente na dupla. Direita constrói; esquerda finaliza.', route: '/game/missions', actionLabel: 'Escolher lado', phase: 'Identidade' },
  { id: 'style-selected', title: 'Defina seu estilo', explanation: 'O estilo determina seus pontos fortes iniciais e orienta os primeiros treinos.', route: '/game/missions', actionLabel: 'Escolher estilo', phase: 'Identidade' },
  { id: 'first-training', title: 'Faça um treino adequado', explanation: 'Melhore um atributo importante para seu estilo e confira o custo de energia antes de confirmar.', route: '/game/training', actionLabel: 'Ir para Treinos', phase: 'Preparação' },
  { id: 'energy-understood', title: 'Observe sua energia', explanation: 'Energia baixa reduz seu desempenho e aumenta riscos. Recupere antes de competir cansado.', route: '/game/training', actionLabel: 'Ver energia e recuperação', phase: 'Preparação' },
  { id: 'partner-selected', title: 'Forme sua dupla', explanation: 'Procure um parceiro do lado complementar e com qualidades que cubram seus pontos fracos.', route: '/partners', actionLabel: 'Escolher parceiro', phase: 'Dupla' },
  { id: 'tournament-registered', title: 'Inscreva-se no primeiro torneio', explanation: 'Escolha uma competição compatível com seu nível, saldo, parceiro e energia.', route: '/tournaments', actionLabel: 'Ver torneios', phase: 'Competição' },
  { id: 'first-match', title: 'Dispute sua primeira partida', explanation: 'O resultado gera experiência e mostra como treino, energia e dupla afetam seu desempenho.', route: '/matches', actionLabel: 'Jogar', phase: 'Competição' },
  { id: 'autonomy', title: 'Continue seu ciclo de carreira', explanation: 'Planeje, treine, recupere, compita, avalie o resultado e ajuste seu próximo objetivo.', route: '/game', actionLabel: 'Ver painel', phase: 'Autonomia' },
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
