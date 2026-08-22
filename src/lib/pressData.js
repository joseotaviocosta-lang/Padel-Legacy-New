import { localGame } from '@/api/localGameClient.js';
import {
  isOfficialPlayerTournamentResult,
  postMatchInterviewIdentity,
  resolveOfficialPlayerOutcome,
} from '@/lib/postMatchInterview.js';

// ─── Journalists ─────────────────────────────────────────────────────────────
// 12 journalists with distinct personalities and specialties.

export const JOURNALISTS = [
  { id: 'j1', name: 'Rafael "Rafa" Cortez', outlet: 'TV Esporte Total', nationality: 'Espanha', personality: 'provocador', specialty: 'polemico', avatar_emoji: '🎙️', signature_style: 'Perguntas desconfortáveis que viralizam' },
  { id: 'j2', name: 'Marina Volkov', outlet: 'Diário Esportivo', nationality: 'Rússia', personality: 'critico', specialty: 'tatico', avatar_emoji: '📝', signature_style: 'Análise fria e precisa, sem emoção' },
  { id: 'j3', name: 'Pablo Herrera', outlet: 'Rádio Padel FM', nationality: 'Argentina', personality: 'sensacionalista', specialty: 'social', avatar_emoji: '📻', signature_style: 'Manchetes explosivas e dramáticas' },
  { id: 'j4', name: 'Sofia Lindberg', outlet: 'Global Sports Network', nationality: 'Suécia', personality: 'neutro', specialty: 'estatistico', avatar_emoji: '📊', signature_style: 'Dados e estatísticas acima de tudo' },
  { id: 'j5', name: 'Diego "El Toro" Ramos', outlet: 'Tribuna do Esporte', nationality: 'Uruguai', personality: 'passional', specialty: 'investigativo', avatar_emoji: '🔥', signature_style: 'Reportagens profundas com emoção' },
  { id: 'j6', name: 'Yuki Tanaka', outlet: 'Asia Sports Network', nationality: 'Japão', personality: 'tecnico', specialty: 'tatico', avatar_emoji: '🎯', signature_style: 'Foco em detalhes técnicos e biomecânica' },
  { id: 'j7', name: 'Carla Nogueira', outlet: 'Revista Match', nationality: 'Portugal', personality: 'critico', specialty: 'social', avatar_emoji: '📰', signature_style: 'Críticas sociais e comportamentais' },
  { id: 'j8', name: 'Hassan Al-Farouk', outlet: 'World Padel Media', nationality: 'Egito', personality: 'neutro', specialty: 'investigativo', avatar_emoji: '🔍', signature_style: 'Investigação séria e bem fundamentada' },
  { id: 'j9', name: 'Marco Ferrari', outlet: 'Gazzetta dello Sport', nationality: 'Itália', personality: 'passional', specialty: 'tatico', avatar_emoji: '🏁', signature_style: 'Narração épica e emocional' },
  { id: 'j10', name: 'Emma Richards', outlet: 'The Sports Tribune', nationality: 'Inglaterra', personality: 'critico', specialty: 'estatistico', avatar_emoji: '📈', signature_style: 'Números não mentem — e ela prova isso' },
  { id: 'j11', name: 'Lucas "Leco" Oliveira', outlet: 'PadelTV', nationality: 'Brasil', personality: 'provocador', specialty: 'polemico', avatar_emoji: '📺', signature_style: 'Provocações que geram cliques' },
  { id: 'j12', name: 'Anya Petrov', outlet: 'Eastern European Sports', nationality: 'Sérvia', personality: 'sensacionalista', specialty: 'social', avatar_emoji: '⚡', signature_style: 'Rumores e fofocas que pegam fogo' },
];

export function reconcileJournalistCatalog(existing, profileId) {
  const saved = (Array.isArray(existing) ? existing : []).filter(item => item?.id && item?.name);
  const records = [];
  const missing = [];

  for (const template of JOURNALISTS) {
    const persisted = saved.find(item => item.id === template.id)
      || saved.find(item => item.name === template.name);
    if (persisted) {
      records.push({ ...template, ...persisted, profile_id: profileId });
    } else {
      const record = {
        ...template,
        profile_id: profileId,
        bias_toward_player: 0,
        interviews_done: 0,
      };
      records.push(record);
      missing.push(record);
    }
  }

  return { records, missing };
}

// ─── Question Banks ──────────────────────────────────────────────────────────
// Each question has 3-4 answer choices with different effects.
// Effects: fan_appeal, sponsor_appeal, morale, reputation, journalist_bias

// Hotfix 14.1 (docs/HOTFIX_14_1_MATCH_UX_INTERVIEWS.md, Parte 9/15): as 11
// perguntas originais têm efeito por resposta escrito à mão (mantido
// intocado, nenhuma mudança de balanceamento retroativa). Todo o conteúdo
// NOVO desta fase usa uma tabela canônica por (grupo de contexto, postura)
// — a mesma postura no mesmo grupo SEMPRE recebe o efeito idêntico, por
// construção (não por convenção a ser lembrada) — exatamente o que a Parte
// 15 pede pra garantir estruturalmente. 3 grupos, não um por categoria: o
// que importa mecanicamente é se o contexto é positivo (vitória/marco/
// conquista), negativo (derrota/má fase) ou neutro (pré-jogo/especulação/
// rumor/previsão) — a granularidade que os dados originais já sugeriam.
export const TONE_EFFECT_PRESETS = {
  positive: {
    humilde: { fan_appeal: 4, sponsor_appeal: 3, morale: 3, reputation: 4, journalist_bias: 6 },
    confiante: { fan_appeal: 5, sponsor_appeal: 5, morale: 3, reputation: 3, journalist_bias: 3 },
    neutro: { fan_appeal: 1, sponsor_appeal: 2, morale: 1, reputation: 1, journalist_bias: 0 },
    arrogante: { fan_appeal: 6, sponsor_appeal: 4, morale: 2, reputation: -3, journalist_bias: -4 },
    provocativo: { fan_appeal: 4, sponsor_appeal: 3, morale: 2, reputation: -1, journalist_bias: -2 },
  },
  negative: {
    humilde: { fan_appeal: 4, sponsor_appeal: 3, morale: 2, reputation: 3, journalist_bias: 6 },
    confiante: { fan_appeal: 5, sponsor_appeal: 4, morale: 3, reputation: 2, journalist_bias: 4 },
    neutro: { fan_appeal: 1, sponsor_appeal: 1, morale: -1, reputation: 0, journalist_bias: -2 },
    fechado: { fan_appeal: -1, sponsor_appeal: -1, morale: -2, reputation: -1, journalist_bias: -4 },
    controverso: { fan_appeal: -2, sponsor_appeal: -3, morale: -2, reputation: -4, journalist_bias: -8 },
  },
  neutral: {
    humilde: { fan_appeal: 3, sponsor_appeal: 2, morale: 2, reputation: 3, journalist_bias: 4 },
    confiante: { fan_appeal: 5, sponsor_appeal: 4, morale: 3, reputation: 2, journalist_bias: 3 },
    neutro: { fan_appeal: 1, sponsor_appeal: 2, morale: 0, reputation: 1, journalist_bias: 1 },
    fechado: { fan_appeal: -1, sponsor_appeal: 0, morale: 0, reputation: -1, journalist_bias: -5 },
    provocativo: { fan_appeal: 3, sponsor_appeal: 2, morale: 1, reputation: -1, journalist_bias: -3 },
  },
};

// Cópia nova a cada chamada — nunca devolve a mesma referência do preset
// (evita mutação acidental do objeto canônico por quem consome o efeito).
export function presetEffects(group, tone) {
  const preset = TONE_EFFECT_PRESETS[group]?.[tone];
  return preset ? { ...preset } : { fan_appeal: 0, sponsor_appeal: 0, morale: 0, reputation: 0, journalist_bias: 0 };
}

export const QUESTION_BANKS = {
  pre_match: [
    {
      id: 'pre_1',
      category: 'pre_match',
      text: 'Você enfrenta {opponent} {daysPhrase}. Como você avalia o adversário?',
      answers: [
        { text: 'É um grande jogador, mas estou preparado para o desafio.', effects: { fan_appeal: +3, sponsor_appeal: +2, morale: +2, reputation: +3, journalist_bias: +5 }, tone: 'humilde' },
        { text: 'Respeito todos, mas na quadra não existe favorito. Vou vencer.', effects: { fan_appeal: +5, sponsor_appeal: +4, morale: +3, reputation: +2, journalist_bias: +3 }, tone: 'confiante' },
        { text: 'Prefiro não comentar. Falo dentro de quadra.', effects: { fan_appeal: -2, sponsor_appeal: +1, morale: +1, reputation: -1, journalist_bias: -5 }, tone: 'fechado' },
        { text: 'Todos sabem quem é o favorito aqui. Não é novidade.', effects: { fan_appeal: +2, sponsor_appeal: +3, morale: +2, reputation: -2, journalist_bias: -3 }, tone: 'arrogante' },
      ],
    },
    {
      id: 'pre_2',
      category: 'pre_match',
      text: 'Qual é a sua estratégia tática para esta partida?',
      answers: [
        { text: 'Vou focar na consistência, reduzir erros não forçados e construir o jogo.', effects: { fan_appeal: +2, sponsor_appeal: +3, morale: +2, reputation: +3, journalist_bias: +4 }, tone: 'humilde' },
        { text: 'Pressão total desde o início. Vou ditar o ritmo e sufocar o adversário.', effects: { fan_appeal: +4, sponsor_appeal: +3, morale: +3, reputation: +1, journalist_bias: +2 }, tone: 'confiante' },
        { text: 'Isso é com o meu técnico. Eu apenas executo o plano.', effects: { fan_appeal: -1, sponsor_appeal: +1, morale: 0, reputation: 0, journalist_bias: -3 }, tone: 'fechado' },
        { text: 'Vocês vão ver na quadra. Não vou revelar nada agora.', effects: { fan_appeal: +1, sponsor_appeal: +1, morale: +1, reputation: -1, journalist_bias: -4 }, tone: 'provocativo' },
      ],
    },
  ],
  post_win: [
    {
      id: 'win_1',
      category: 'post_win',
      text: 'Vitória expressiva hoje! O que fez a diferença?',
      answers: [
        { text: 'O mérito é da equipe. Treinamos duro e o resultado veio.', effects: { fan_appeal: +4, sponsor_appeal: +3, morale: +3, reputation: +4, journalist_bias: +6 }, tone: 'humilde' },
        { text: 'Sabia que jogaria bem. Meu nível estava alto do início ao fim.', effects: { fan_appeal: +5, sponsor_appeal: +5, morale: +3, reputation: +3, journalist_bias: +3 }, tone: 'confiante' },
        { text: 'Foi apenas mais uma vitória. O importante é o próximo jogo.', effects: { fan_appeal: +1, sponsor_appeal: +2, morale: +1, reputation: +1, journalist_bias: 0 }, tone: 'neutro' },
        { text: 'Eu avisei que ia ganhar. Quem duvidou, pode pedir desculpas.', effects: { fan_appeal: +6, sponsor_appeal: +4, morale: +2, reputation: -3, journalist_bias: -4 }, tone: 'arrogante' },
      ],
    },
    {
      id: 'win_2',
      category: 'post_win',
      text: 'Você está cada vez mais perto do título. Como lida com a pressão?',
      answers: [
        { text: 'Pressão é privilégio. Significa que estamos fazendo história.', effects: { fan_appeal: +5, sponsor_appeal: +4, morale: +3, reputation: +3, journalist_bias: +5 }, tone: 'confiante' },
        { text: 'Vamos jogo a jogo. Não olho para o título ainda.', effects: { fan_appeal: +3, sponsor_appeal: +3, morale: +2, reputation: +3, journalist_bias: +4 }, tone: 'humilde' },
        { text: 'Pressão? Não sinto pressão. Estou no controle.', effects: { fan_appeal: +4, sponsor_appeal: +4, morale: +2, reputation: -1, journalist_bias: 0 }, tone: 'arrogante' },
      ],
    },
    // Hotfix 14.1 (Parte 10/11/12): daqui em diante, todo conteúdo novo usa
    // presetEffects(grupo, postura) em vez de números soltos — a mesma
    // postura no mesmo grupo (positive/negative/neutral) sempre recebe o
    // efeito idêntico, garantido por construção. `when` é opcional: só
    // entra no pool quando o contexto real da partida (calculado em
    // getPendingInterviews a partir de dados já existentes — nunca
    // inventado) bate com a condição.
    {
      id: 'win_3',
      category: 'post_win',
      text: 'Como você descreveria a atuação da dupla hoje?',
      answers: [
        { text: 'Cada um fez sua parte. É assim que se constrói uma vitória de verdade.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Jogamos exatamente como planejamos. Não teve segredo.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Cumprimos o combinado. Passamos de fase, é o que importa.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
        { text: 'Fizemos parecer fácil porque somos melhores. Simples assim.', effects: presetEffects('positive', 'arrogante'), tone: 'arrogante' },
      ],
    },
    {
      id: 'win_4',
      category: 'post_win',
      text: 'O que você diria para quem acompanhou o jogo hoje?',
      answers: [
        { text: 'Obrigado pelo apoio. Essa vitória também é de quem estava na arquibancada.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Que continuem acompanhando, porque o nível só vai subir.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Foi uma partida normal de torneio. Sigamos para a próxima.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'win_close_1',
      category: 'post_win',
      when: (ctx) => ctx.matchMargin === 'close',
      text: 'Você precisou salvar momentos importantes hoje. O que manteve a dupla no jogo?',
      answers: [
        { text: 'Confiança um no outro. Nos momentos difíceis, a gente se olhou e seguiu.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Sabíamos que tínhamos mais para dar. Só precisávamos de paciência.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Ponto a ponto. Não tem outro jeito de vencer um jogo assim.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'win_close_2',
      category: 'post_win',
      when: (ctx) => ctx.matchMargin === 'close',
      text: 'Como foi lidar com a pressão dos pontos decisivos contra {opponent}?',
      answers: [
        { text: 'Foi duro. Mas treinamos exatamente essas situações, então confiamos no processo.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Gosto desses momentos. É onde eu mostro por que estou aqui.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Nervosismo existe, mas não deixamos ele decidir o jogo.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'win_dominant_1',
      category: 'post_win',
      when: (ctx) => ctx.matchMargin === 'dominant',
      text: 'Vitória tranquila hoje. O nível apresentado surpreendeu até você?',
      answers: [
        { text: 'Treinamos muito para chegar nesse nível. Feliz que apareceu em quadra.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Não me surpreende. É o nível que venho buscando toda semana.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Foi um bom dia. Amanhã a gente volta ao trabalho normal.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
        { text: 'Surpreende quem não estava acompanhando. Eu sabia que seria assim.', effects: presetEffects('positive', 'arrogante'), tone: 'arrogante' },
      ],
    },
    {
      id: 'win_dominant_2',
      category: 'post_win',
      when: (ctx) => ctx.matchMargin === 'dominant',
      text: 'Com esse resultado, você já pensa nos próximos adversários do torneio?',
      answers: [
        { text: 'Um jogo de cada vez. Vou aproveitar essa vitória e já pensar na recuperação.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Quem vier, vai encontrar a mesma dupla que jogou hoje.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Vou ver o chaveamento com calma. Ainda é cedo para isso.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'win_upset_1',
      category: 'post_win',
      when: (ctx) => ctx.isUpset,
      text: 'Poucos esperavam esse resultado contra {opponent}. Você acreditava que poderia vencer?',
      answers: [
        { text: 'Sempre acreditamos, mas sabíamos que precisaríamos do nosso melhor jogo.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Eu não entro em quadra para perder. Não importa quem está do outro lado.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Ranking é papel. Quadra é outra história — e hoje provamos isso.', effects: presetEffects('positive', 'provocativo'), tone: 'provocativo' },
      ],
    },
    {
      id: 'win_upset_2',
      category: 'post_win',
      when: (ctx) => ctx.isUpset,
      text: 'Vencer um adversário tão bem ranqueado muda como você se enxerga no circuito?',
      answers: [
        { text: 'Mostra que estamos no caminho certo. Agora é continuar trabalhando.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Muda, sim. Esse tipo de vitória é a confirmação de que posso competir com qualquer um.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Foi só uma partida. Prefiro esperar mais resultados para tirar conclusões.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'win_title_1',
      category: 'post_win',
      when: (ctx) => ctx.isTitle,
      text: 'Título conquistado! O que esse troféu representa para a temporada?',
      answers: [
        { text: 'Representa o trabalho de toda a equipe. Esse título é de todo mundo que ajudou a chegar aqui.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'É a prova de que estamos entre os melhores. E é só o começo.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Um título é um título. Já penso no próximo torneio da temporada.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'win_title_2',
      category: 'post_win',
      when: (ctx) => ctx.isTitle,
      text: 'Qual foi o papel do seu parceiro nessa campanha até o título?',
      answers: [
        { text: 'Fundamental. Não teria esse título sem o nível que ele sustentou o torneio inteiro.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Formamos uma dupla muito forte agora. O resultado fala por si.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Cada um fez sua parte dentro de quadra. Foi um trabalho de equipe normal.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'win_semifinal_1',
      category: 'post_win',
      when: (ctx) => ctx.isSemifinalWin,
      text: 'Agora você está entre as quatro melhores duplas do torneio. O objetivo mudou?',
      answers: [
        { text: 'O objetivo continua o mesmo: uma partida de cada vez, sem pular etapas.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Mudou, sim. Agora estamos jogando pelo título, e vamos atrás dele.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Chegar até aqui já é um resultado importante. Vamos ver a semifinal com calma.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'win_debut_1',
      category: 'post_win',
      when: (ctx) => ctx.isDebut,
      text: 'Sua estreia oficial terminou em vitória. Como foi essa sensação?',
      answers: [
        { text: 'Indescritível. Trabalhei muito tempo para chegar a este momento.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Senti que era exatamente onde eu deveria estar. Vieram mais vitórias.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Foi só a primeira de muitas partidas que ainda vou jogar.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'win_streak_1',
      category: 'post_win',
      when: (ctx) => ctx.winStreak >= 3,
      text: 'Essa é mais uma vitória de uma sequência recente. O que explica esse momento?',
      answers: [
        { text: 'Estamos treinando bem e a confiança vem crescendo partida após partida.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Estou em um momento em que tudo o que tento em quadra funciona.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Prefiro não falar em sequência. Cada jogo é um jogo novo.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'win_rank_milestone_1',
      category: 'post_win',
      when: (ctx) => Boolean(ctx.rankMilestone),
      text: 'Essa vitória confirma sua posição entre os melhores do ranking mundial. O que isso significa?',
      answers: [
        { text: 'Significa que o trabalho de anos está dando resultado. Ainda quero subir mais.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Significa que estou exatamente onde deveria estar — e não vou parar aqui.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'É um número. Prefiro focar no meu jogo do que no ranking.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'win_rivalry_1',
      category: 'post_win',
      when: (ctx) => ctx.isRivalryMatch,
      text: 'Mais um capítulo dessa rivalidade histórica. Como foi vencer {opponent} dessa vez?',
      answers: [
        { text: 'É sempre um jogo especial. Tenho muito respeito pelo nível que eles jogam.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Esses confrontos me deixam ainda mais ligado. Adoro esse tipo de desafio.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'É mais um confronto no nosso histórico. O placar entre nós fala por si.', effects: presetEffects('positive', 'provocativo'), tone: 'provocativo' },
      ],
    },
    {
      id: 'win_pressure_1',
      category: 'post_win',
      when: (ctx) => ['high', 'global'].includes(ctx.pressImportance),
      text: 'Uma vitória de grande repercussão, com muita atenção da imprensa em cima da dupla. Como vocês lidaram com isso?',
      answers: [
        { text: 'Tentamos manter a rotina normal. É a única forma de não deixar a pressão atrapalhar.', effects: presetEffects('positive', 'humilde'), tone: 'humilde' },
        { text: 'Gosto de jogos grandes. Quanto maior o palco, melhor eu jogo.', effects: presetEffects('positive', 'confiante'), tone: 'confiante' },
        { text: 'Não penso em repercussão durante o jogo. Isso é trabalho de vocês, não meu.', effects: presetEffects('positive', 'neutro'), tone: 'neutro' },
      ],
    },
  ],
  post_loss: [
    {
      id: 'loss_1',
      category: 'post_loss',
      text: 'Derrota dura hoje. O que aconteceu?',
      answers: [
        { text: 'Não fui bom o suficiente. Preciso treinar mais e voltar mais forte.', effects: { fan_appeal: +4, sponsor_appeal: +3, morale: +2, reputation: +3, journalist_bias: +6 }, tone: 'humilde' },
        { text: 'O adversário jogou muito bem. Parabéns a ele, foi merecido.', effects: { fan_appeal: +5, sponsor_appeal: +4, morale: +2, reputation: +4, journalist_bias: +7 }, tone: 'humilde' },
        { text: 'Condições não estavam ideais, mas não é desculpa. Próxima.', effects: { fan_appeal: +1, sponsor_appeal: +1, morale: -1, reputation: 0, journalist_bias: -2 }, tone: 'neutro' },
        { text: 'O árbitro decidiu o jogo. Todos viram o que aconteceu.', effects: { fan_appeal: -2, sponsor_appeal: -3, morale: -2, reputation: -4, journalist_bias: -8 }, tone: 'controverso' },
      ],
    },
    {
      id: 'loss_2',
      category: 'post_loss',
      text: 'Alguns dizem que seu melhor momento já passou. O que responde?',
      answers: [
        { text: 'Respeito as opiniões, mas vou responder dentro de quadra.', effects: { fan_appeal: +4, sponsor_appeal: +3, morale: +2, reputation: +3, journalist_bias: +5 }, tone: 'humilde' },
        { text: 'Meu melhor momento ainda está por vir. Aguardem.', effects: { fan_appeal: +5, sponsor_appeal: +4, morale: +3, reputation: +2, journalist_bias: +4 }, tone: 'confiante' },
        { text: 'Isso é falta de respeito. Quem diz isso não entende nada de padel.', effects: { fan_appeal: +2, sponsor_appeal: -1, morale: -1, reputation: -3, journalist_bias: -6 }, tone: 'controverso' },
        { text: 'Sem comentários.', effects: { fan_appeal: -1, sponsor_appeal: -1, morale: -2, reputation: -1, journalist_bias: -4 }, tone: 'fechado' },
      ],
    },
    {
      id: 'loss_3',
      category: 'post_loss',
      text: 'O que você tira de aprendizado dessa partida?',
      answers: [
        { text: 'Muita coisa. Vamos assistir ao jogo com calma e corrigir o que for preciso.', effects: presetEffects('negative', 'humilde'), tone: 'humilde' },
        { text: 'Aprendo rápido com derrotas. Na próxima, o resultado vai ser diferente.', effects: presetEffects('negative', 'confiante'), tone: 'confiante' },
        { text: 'Faz parte do esporte. Nem sempre se vence.', effects: presetEffects('negative', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'loss_4',
      category: 'post_loss',
      text: 'Como fica a moral da dupla depois de um resultado como esse?',
      answers: [
        { text: 'Abalada, mas não quebrada. Vamos conversar e seguir trabalhando juntos.', effects: presetEffects('negative', 'humilde'), tone: 'humilde' },
        { text: 'Continua alta. Uma derrota não muda o que viemos construindo.', effects: presetEffects('negative', 'confiante'), tone: 'confiante' },
        { text: 'Normal, como depois de qualquer derrota. Já estamos pensando na próxima.', effects: presetEffects('negative', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'loss_close_1',
      category: 'post_loss',
      when: (ctx) => ctx.matchMargin === 'close',
      text: 'Uma derrota tão apertada dói mais por causa das oportunidades perdidas?',
      answers: [
        { text: 'Dói, sim. Mas prefiro lembrar que estivemos no nível para vencer esse jogo.', effects: presetEffects('negative', 'humilde'), tone: 'humilde' },
        { text: 'Tivemos nossas chances. Da próxima vez, vamos converter.', effects: presetEffects('negative', 'confiante'), tone: 'confiante' },
        { text: 'Jogos apertados assim se decidem em detalhes. Hoje não foram a nosso favor.', effects: presetEffects('negative', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'loss_close_2',
      category: 'post_loss',
      when: (ctx) => ctx.matchMargin === 'close',
      text: 'Como foi a reação da dupla nos pontos decisivos contra {opponent}?',
      answers: [
        { text: 'Lutamos até o final. Só não tivemos a pontaria certa nos momentos-chave.', effects: presetEffects('negative', 'humilde'), tone: 'humilde' },
        { text: 'O mérito é do adversário, que foi mais preciso quando importava.', effects: presetEffects('negative', 'humilde'), tone: 'humilde' },
        { text: 'Fizemos o que pudemos. Esses detalhes fazem parte do jogo de alto nível.', effects: presetEffects('negative', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'loss_bad_1',
      category: 'post_loss',
      when: (ctx) => ctx.matchMargin === 'dominant_loss',
      text: 'O resultado foi claro hoje. O que faltou para a dupla em quadra?',
      answers: [
        { text: 'Faltou muita coisa. A responsabilidade é minha, preciso melhorar bastante.', effects: presetEffects('negative', 'humilde'), tone: 'humilde' },
        { text: 'Foi um dia ruim. Isso acontece, e amanhã volto a trabalhar para corrigir.', effects: presetEffects('negative', 'neutro'), tone: 'neutro' },
        { text: 'O adversário simplesmente esteve em outro nível hoje. Reconheço isso.', effects: presetEffects('negative', 'humilde'), tone: 'humilde' },
      ],
    },
    {
      id: 'loss_final_1',
      category: 'post_loss',
      when: (ctx) => ctx.isFinalRound,
      text: 'Perder uma final sempre pesa mais. Como você processa esse resultado?',
      answers: [
        { text: 'Chegar à final já é motivo de orgulho. Vamos usar essa dor para voltar mais fortes.', effects: presetEffects('negative', 'humilde'), tone: 'humilde' },
        { text: 'Dói agora, mas isso só aumenta a vontade de voltar a disputar um título.', effects: presetEffects('negative', 'confiante'), tone: 'confiante' },
        { text: 'Final é assim: só um sai campeão. Hoje não fomos nós.', effects: presetEffects('negative', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'loss_poor_form_1',
      category: 'post_loss',
      when: (ctx) => ctx.lossStreak >= 3,
      text: 'Já são algumas derrotas seguidas. Como explicar essa fase?',
      answers: [
        { text: 'É um momento difícil, mas confio no trabalho que estamos fazendo para sair dele.', effects: presetEffects('negative', 'humilde'), tone: 'humilde' },
        { text: 'Fases assim acontecem. Sei que vou voltar ao meu nível em breve.', effects: presetEffects('negative', 'confiante'), tone: 'confiante' },
        { text: 'Estamos analisando o que precisa mudar. Não existe uma resposta simples.', effects: presetEffects('negative', 'neutro'), tone: 'neutro' },
      ],
    },
  ],
  rumor: [
    {
      id: 'rumor_1',
      category: 'rumor',
      text: 'Há rumores de que você pode trocar de parceiro. É verdade?',
      answers: [
        { text: 'Meu parceiro e eu estamos bem. Não penso em mudar.', effects: { fan_appeal: +3, sponsor_appeal: +2, morale: +2, reputation: +2, journalist_bias: +4 }, tone: 'humilde' },
        { text: 'O mercado se move. Avalio todas as opções sempre.', effects: { fan_appeal: +1, sponsor_appeal: +3, morale: 0, reputation: 0, journalist_bias: +2 }, tone: 'neutro' },
        { text: 'Não comento rumores. Isso é falta de profissionalismo perguntar.', effects: { fan_appeal: -1, sponsor_appeal: -1, morale: -1, reputation: -1, journalist_bias: -6 }, tone: 'fechado' },
        { text: 'Tenho recebido propostas interessantes. Veremos no futuro.', effects: { fan_appeal: +4, sponsor_appeal: +4, morale: +1, reputation: -1, journalist_bias: +3 }, tone: 'provocativo' },
      ],
    },
    {
      id: 'rumor_2',
      category: 'rumor',
      text: 'Fontes dizem que um patrocinador grande está interessado em você.',
      answers: [
        { text: 'Fico lisonjeado, mas meu foco é o padel. Patrocínios são consequência.', effects: { fan_appeal: +3, sponsor_appeal: +3, morale: +2, reputation: +3, journalist_bias: +5 }, tone: 'humilde' },
        { text: 'Sim, estamos em conversas avançadas. É um passo importante.', effects: { fan_appeal: +2, sponsor_appeal: +5, morale: +2, reputation: +1, journalist_bias: +3 }, tone: 'confiante' },
        { text: 'Não confirmo nem nego. Negociações são privadas.', effects: { fan_appeal: 0, sponsor_appeal: +2, morale: 0, reputation: 0, journalist_bias: -2 }, tone: 'neutro' },
      ],
    },
    {
      id: 'rumor_3',
      category: 'rumor',
      text: 'A imprensa tem questionado se a parceria ainda faz sentido. Como você responde?',
      answers: [
        { text: 'Toda parceria passa por momentos difíceis. Estamos trabalhando para melhorar.', effects: presetEffects('neutral', 'humilde'), tone: 'humilde' },
        { text: 'Faz sentido, sim. Só precisamos de tempo para reencontrar nosso melhor nível.', effects: presetEffects('neutral', 'confiante'), tone: 'confiante' },
        { text: 'Isso é assunto interno da dupla. Não vou discutir aqui.', effects: presetEffects('neutral', 'fechado'), tone: 'fechado' },
      ],
    },
  ],
  speculation: [
    {
      id: 'spec_1',
      category: 'speculation',
      text: 'Você pensa em se aposentar? Qual o plano de longo prazo?',
      answers: [
        { text: 'Ainda tenho muito a dar. Não penso em aposentadoria agora.', effects: { fan_appeal: +3, sponsor_appeal: +3, morale: +2, reputation: +2, journalist_bias: +4 }, tone: 'confiante' },
        { text: 'O padel me deu tudo. Quando sentir que é hora, vou embora com dignidade.', effects: { fan_appeal: +5, sponsor_appeal: +3, morale: +3, reputation: +4, journalist_bias: +6 }, tone: 'humilde' },
        { text: 'Quem sabe virar treinador? Tenho muito conhecimento para passar.', effects: { fan_appeal: +2, sponsor_appeal: +2, morale: +1, reputation: +2, journalist_bias: +3 }, tone: 'neutro' },
      ],
    },
    {
      id: 'spec_2',
      category: 'speculation',
      text: 'Alguns apontam você como futuro número 1 do mundo. Como encara isso?',
      answers: [
        { text: 'É um sonho, mas o caminho é longo. Vou trabalhar duro todos os dias.', effects: { fan_appeal: +4, sponsor_appeal: +3, morale: +3, reputation: +3, journalist_bias: +5 }, tone: 'humilde' },
        { text: 'Não é sonho, é meta. E metas são feitas para serem atingidas.', effects: { fan_appeal: +5, sponsor_appeal: +4, morale: +3, reputation: +2, journalist_bias: +3 }, tone: 'confiante' },
        { text: 'Número 1 é apenas consequência de bons resultados.', effects: { fan_appeal: +3, sponsor_appeal: +3, morale: +2, reputation: +2, journalist_bias: +4 }, tone: 'neutro' },
      ],
    },
    {
      id: 'spec_3',
      category: 'speculation',
      text: 'Com essa trajetória, alguns já falam em legado. Você pensa nisso?',
      answers: [
        { text: 'Prefiro deixar que outros falem em legado. Eu só quero continuar evoluindo.', effects: presetEffects('neutral', 'humilde'), tone: 'humilde' },
        { text: 'Penso, sim. Quero ser lembrado como alguém que marcou esse esporte.', effects: presetEffects('neutral', 'confiante'), tone: 'confiante' },
        { text: 'É cedo para isso. Legado se constrói com o tempo, não com discurso.', effects: presetEffects('neutral', 'neutro'), tone: 'neutro' },
      ],
    },
  ],
  // Hotfix 14.1 (Parte 11): categorias novas com dado real de sustentação —
  // só entram no pool de getPendingInterviews quando o profile realmente
  // mostra o sinal (química alta/confiança alta com o treinador), nunca
  // como pergunta genérica solta.
  partner_positive: [
    {
      id: 'partner_pos_1',
      category: 'partner_positive',
      text: 'A parceria com {opponent} parece cada vez mais sólida. O que explica essa química?',
      answers: [
        { text: 'Conversamos muito, dentro e fora de quadra. Isso constrói confiança de verdade.', effects: presetEffects('neutral', 'humilde'), tone: 'humilde' },
        { text: 'Encontramos um entrosamento raro. Sinto que podemos chegar longe juntos.', effects: presetEffects('neutral', 'confiante'), tone: 'confiante' },
        { text: 'É trabalho diário. Química não aparece sozinha, ela se constrói.', effects: presetEffects('neutral', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'partner_pos_2',
      category: 'partner_positive',
      text: 'Vocês já são vistos como uma das duplas mais estáveis do circuito. Pensam em continuar juntos por muito tempo?',
      answers: [
        { text: 'Espero que sim. Encontrei um parceiro que entende meu jogo como poucos.', effects: presetEffects('neutral', 'humilde'), tone: 'humilde' },
        { text: 'Enquanto os resultados vierem assim, não vejo motivo para mudar nada.', effects: presetEffects('neutral', 'confiante'), tone: 'confiante' },
        { text: 'Vamos deixar o tempo responder isso. Por ora, focamos no próximo torneio.', effects: presetEffects('neutral', 'neutro'), tone: 'neutro' },
      ],
    },
  ],
  coach_positive: [
    {
      id: 'coach_pos_1',
      category: 'coach_positive',
      text: 'Sua relação com a comissão técnica parece estar em um ótimo momento. Como ela tem ajudado sua evolução?',
      answers: [
        { text: 'Muito. Confio no trabalho da comissão e isso aparece nos resultados.', effects: presetEffects('neutral', 'humilde'), tone: 'humilde' },
        { text: 'Tenho o suporte técnico que sempre quis. Isso muda tudo no meu jogo.', effects: presetEffects('neutral', 'confiante'), tone: 'confiante' },
        { text: 'É um trabalho de equipe, como qualquer outro na minha carreira.', effects: presetEffects('neutral', 'neutro'), tone: 'neutro' },
      ],
    },
    {
      id: 'coach_pos_2',
      category: 'coach_positive',
      text: 'O que mudou no seu jogo desde que passou a trabalhar com a comissão técnica atual?',
      answers: [
        { text: 'Muita coisa tática. Aprendi a ler melhor os jogos e confiar mais no plano.', effects: presetEffects('neutral', 'humilde'), tone: 'humilde' },
        { text: 'Meu jogo deu um salto. Sinto que estou jogando no meu melhor nível.', effects: presetEffects('neutral', 'confiante'), tone: 'confiante' },
        { text: 'Ajustes pontuais, nada revolucionário. Prefiro deixar o trabalho falar.', effects: presetEffects('neutral', 'neutro'), tone: 'neutro' },
      ],
    },
  ],
  prediction: [
    {
      id: 'pred_1',
      category: 'prediction',
      text: 'Quem são os favoritos para o próximo torneio?',
      answers: [
        { text: 'Todos os favoritos merecem respeito. O padel está muito nivelado.', effects: { fan_appeal: +2, sponsor_appeal: +2, morale: +1, reputation: +2, journalist_bias: +4 }, tone: 'humilde' },
        { text: 'Eu sou o favorito. Se jogar meu padel, venço.', effects: { fan_appeal: +4, sponsor_appeal: +4, morale: +3, reputation: -1, journalist_bias: 0 }, tone: 'confiante' },
        { text: 'Favoritos? O favorito vence na quadra, não em entrevista.', effects: { fan_appeal: +1, sponsor_appeal: +1, morale: +1, reputation: 0, journalist_bias: -1 }, tone: 'fechado' },
      ],
    },
  ],
};

// ─── Headline Generators ─────────────────────────────────────────────────────

export const HEADLINE_TEMPLATES = {
  win_convincing: [
    '{player} Destrói {opponent} e Avança com Autoridade',
    'Domínio Total: {player} Não Dá Chances a {opponent}',
    '{player} Faz Exibição Impecável e Elimina {opponent}',
  ],
  win_close: [
    '{player} Sobrevive a {opponent} em Jogo Eletrizante',
    'Drama na Quadra: {player} Vence no Fim contra {opponent}',
    '{player} Mostra Garra e Supera {opponent} de Virada',
  ],
  loss_bad: [
    '{player} Desaba Diante de {opponent} e é Eliminado',
    'Noite para Esquecer: {player} É Surpreendido por {opponent}',
    'Resultado Chocante: {opponent} Elimina {player} com Facilidade',
  ],
  loss_close: [
    '{player} Cai Diante de {opponent} em Batalha Épica',
    'Quase! {player} É Eliminado por {opponent} em Jogo Decidido nos Detalhes',
    '{opponent} Elimina {player} em Partida que Ficará na História',
  ],
  rumor_partner: [
    'EXCLUSIVO: {player} Pode Trocar de Parceiro a Qualquer Momento',
    'Mercado Ferve: Rumores Envolvem {player} e Nova Dupla',
    'Por Que {player} e Seu Parceiro Podem se Separar em Breve',
  ],
  rumor_sponsor: [
    'Patrocinador Gigante Está de Olho em {player}',
    'Negócio Milionário? {player} em Conversas Avançadas',
  ],
  critique: [
    '{player} Precisa Despertar: Atributos em Queda Preocupam',
    'Crítica: {player} Tem Repassado por Maus Resultados',
    'Análise: O Que Está Errado com {player}?',
  ],
  praise: [
    '{player} Está em Forma Espetacular: Favorito ao Título',
    'Elogio: Especialistas Destacam Evolução de {player}',
    '{player} Prova por Que É um dos Melhores do Mundo',
  ],
  prediction: [
    '{player} É Apontado como Favorito ao Título',
    'Previsão: Especialistas Veem {player} Dominando a Temporada',
  ],
  speculation: [
    'Futuro Incerto: {player} Deixará o Padel Profissional?',
    'Especulação: {player} Pode Virar Treinador em Breve',
  ],
};

// ─── Article Generation ──────────────────────────────────────────────────────

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || key);
}

// Fase 15.2 (Bug 4/C1): fonte canônica para linguagem temporal relativa —
// nunca hardcodar "amanhã" num texto de entrevista. `daysUntil` já deve vir
// calculado a partir de uma data real (careerDate vs. a data do compromisso),
// nunca adivinhado aqui.
export function formatDaysUntilPhrase(daysUntil) {
  const value = Number(daysUntil);
  if (!Number.isFinite(value) || value <= 0) return 'hoje';
  if (value === 1) return 'amanhã';
  return `em ${value} dias`;
}

export function generateHeadline(type, vars) {
  const templates = HEADLINE_TEMPLATES[type];
  if (!templates || templates.length === 0) return 'Notícia do Dia';
  return fillTemplate(pickRandom(templates), vars);
}

export function generateArticleContent(type, tone, journalist, vars) {
  const playerName = vars.player || 'O jogador';
  const opponent = vars.opponent || 'o adversário';
  const contents = {
    win_convincing: `${journalist.name}, do ${journalist.outlet}, destaca a vitória dominante de ${playerName} sobre ${opponent}. "${playerName} demonstrou um nível técnico superior e não deixou brechas para o adversário", escreveu.`,
    win_close: `Em reportagem emocionante, ${journalist.name} narra a vitória de ${playerName} sobre ${opponent}. "Foi um espetáculo do começo ao fim. ${playerName} mostrou muita fibra para sair com a vitória."`,
    loss_bad: `${journalist.name} não poupa críticas: "${playerName} esteve abaixo do esperado. A performance foi decepcionante e levanta questões sobre seu momento atual."`,
    loss_close: `"Foi uma das partidas mais emocionantes do ano", escreve ${journalist.name}. "${playerName} lutou até o fim, mas ${opponent} foi mais preciso nos momentos decisivos."`,
    rumor_partner: `${journalist.name} relata que fontes próximas indicam uma possível separação. "A química não está a mesma e as conversas sobre uma mudança são reais."`,
    rumor_sponsor: `Segundo ${journalist.name}, um grande patrocinador estaria disposto a investir pesado em ${playerName}. "As conversas estão avançadas e o valor seria significativo."`,
    critique: `Em sua coluna, ${journalist.name} faz uma análise afiada: "${playerName} precisa encontrar seu melhor jogo rapidamente. Os números não mentem — há uma queda de performance evidente."`,
    praise: `${journalist.name} não economiza elogios: "${playerName} está jogando em um nível que poucos alcançam. É um prazer assistir."`,
    prediction: `Em sua previsão, ${journalist.name} aposta firme: "Se continuar neste ritmo, ${playerName} é o grande favorito ao título."`,
    speculation: `${journalist.name} levanta uma questão interessante: "O futuro de ${playerName} é incerto. Poderia seguir carreira como treinador, dada sua visão tática."`,
  };
  return contents[type] || `${journalist.name} traz mais uma reportagem sobre ${playerName}.`;
}

export function toneFromEffects(effects) {
  const total = (effects.reputation || 0) + (effects.fan_appeal || 0);
  if (total >= 4) return 'positivo';
  if (total <= -4) return 'negativo';
  if (effects.journalist_bias < -3) return 'controverso';
  return 'neutro';
}

export function toneEmoji(tone) {
  return { positivo: '😊', neutro: '📰', negativo: '⚠️', controverso: '🔥' }[tone] || '📰';
}

// ─── Pending Interview Generation ────────────────────────────────────────────
// Based on profile state, generates available interviews/press conferences.

export function getPendingInterviews(profile, recentMatches = [], context = {}) {
  if (!profile?.id) return [];

  const pending = [];
  const careerDate = profile.career_date || new Date().toISOString().slice(0, 10);
  const playerNames = new Set([
    profile.sport_name,
    profile.name,
    profile.full_name,
  ].filter(Boolean).map(normalizeName));

  const recordedMatchCount = Math.max(
    0,
    Number(profile.matches_played || 0),
    Number(profile.wins || 0) + Number(profile.losses || 0)
  );

  const ownMatches = (recordedMatchCount > 0
    ? (recentMatches || []).filter(match => isEligibleOfficialMatch(match, profile, careerDate))
    : []
  ).sort((a, b) => String(
    b.played_date || b.match_date || b.date || b.completed_at || b.created_date || ''
  ).localeCompare(String(
    a.played_date || a.match_date || a.date || a.completed_at || a.created_date || ''
  )));

  // Entrevistas pós-jogo só existem quando uma partida real do jogador foi registrada.
  const lastMatch = ownMatches[0];
  if (lastMatch) {
    const outcome = resolveOfficialPlayerOutcome(lastMatch);
    const matchDate = lastMatch.date || lastMatch.played_date || lastMatch.match_date || lastMatch.created_date;
    if ((outcome === 'win' || outcome === 'loss') && matchDate) {
      const opponent = resolveOpponentName(lastMatch, playerNames);
      if (opponent && opponent !== 'o adversário') {
        const identity = postMatchInterviewIdentity(lastMatch.id);
        const championInterview = lastMatch.tournament_outcome === 'champion';
        const roundLabel = lastMatch.tournament_round || String(lastMatch.notes || '').split('|')[0]?.trim();
        const importance = lastMatch.press_importance || 'simple';
        pending.push({
        ...identity,
        matchId: lastMatch.id,
        type: 'interview',
        title: championInterview ? 'Entrevista Especial de Campeão' : outcome === 'win' ? 'Entrevista Pós-Vitória' : 'Entrevista Pós-Derrota',
        description: `A imprensa quer repercutir ${roundLabel || 'sua partida'} contra ${opponent}${['global', 'high'].includes(importance) ? ' em uma entrevista de grande repercussão' : ''}.`,
        questionCategory: outcome === 'win' ? 'post_win' : 'post_loss',
        opponent,
        eventLabel: lastMatch.tournament_name || 'Partida Oficial',
        roundLabel,
        importance,
        careerDate,
        // Hotfix 14.1 (Parte 12): contexto real da partida, calculado só a
        // partir de dados já persistidos no Match/profile — nunca
        // inventado. Consumido por selectInterviewQuestions/`when` das
        // perguntas contextuais. Ver buildInterviewMatchContext.
        matchContext: buildInterviewMatchContext({ lastMatch, ownMatches, outcome, roundLabel, importance, profile, context }),
        });
      }
    }
  }

  // Coletiva pré-torneio apenas quando há um torneio realmente agendado e próximo.
  const nextTournament = findNextTournament(
    context.calendarEvents || [],
    context.registrations || [],
    profile.id,
    careerDate
  );
  if (nextTournament) {
    const eventKey = nextTournament.id || `${nextTournament.start_date || nextTournament.event_date}-${nextTournament.title || nextTournament.name}`;
    // Fase 15.2 (Bug 4/C1): dias reais até o compromisso, a partir das MESMAS
    // duas datas já usadas por findNextTournament (careerDate vs. a data do
    // torneio) — nunca um texto estático. Consumido por InterviewModal.jsx
    // via formatDaysUntilPhrase, nunca um "amanhã" hardcoded.
    const nextTournamentDate = String(nextTournament.start_date || nextTournament.event_date || nextTournament.date || '').slice(0, 10);
    const daysUntilTournament = nextTournamentDate
      ? Math.max(0, Math.round((new Date(`${nextTournamentDate}T00:00:00`).getTime() - new Date(`${careerDate}T00:00:00`).getTime()) / 86400000))
      : null;
    pending.push({
      id: `press_conf_pre_${eventKey}`,
      sourceId: `calendar:${eventKey}`,
      type: 'press_conference',
      title: 'Coletiva Pré-Torneio',
      description: `Jornalistas aguardam sua avaliação antes de ${nextTournament.title || nextTournament.name || 'seu próximo torneio'}.`,
      questionCategory: 'pre_match',
      opponent: nextTournament.opponent_name || 'o próximo adversário',
      relatedEvent: `Torneio:${eventKey}`,
      eventLabel: nextTournament.title || nextTournament.name || 'Próximo torneio',
      careerDate,
      daysUntil: daysUntilTournament,
    });
  }

  // Rumores só aparecem quando existe um fato de relacionamento que os sustente.
  const partnership = context.partnership;
  const chemistry = Number(partnership?.chemistry ?? profile.partner_chemistry ?? 100);
  const partnershipAtRisk = partnership && (
    chemistry <= 35 ||
    ['ending', 'at_risk', 'negotiating_exit'].includes(partnership.status) ||
    Number(partnership.consecutive_losses || 0) >= 4
  );
  if (partnershipAtRisk) {
    const partnershipKey = partnership.id || profile.partner_id || 'active';
    pending.push({
      id: `interview_rumor_partner_${partnershipKey}`,
      sourceId: `partnership:${partnershipKey}:${careerDate}`,
      type: 'interview',
      title: 'Rumores sobre a Dupla',
      description: 'O momento recente da parceria levantou dúvidas na imprensa.',
      questionCategory: 'rumor',
      opponent: partnership.partner_name || profile.partner_name || 'seu parceiro',
      relatedEvent: `RumorDupla:${partnershipKey}:${careerDate}`,
      eventLabel: 'Situação da parceria',
      careerDate,
    });
  }

  // Hotfix 14.1 (Parte 11): contraparte positiva do rumor acima — a
  // imprensa também acompanha quando a parceria vai BEM (química alta),
  // não só quando está em risco. Mesmo dado real (partner_chemistry),
  // limiar invertido.
  if (partnership && chemistry >= 80) {
    const partnershipKey = partnership.id || profile.partner_id || 'active';
    pending.push({
      id: `interview_partner_positive_${partnershipKey}`,
      sourceId: `partnership-positive:${partnershipKey}:${careerDate}`,
      type: 'interview',
      title: 'Parceria em Alta',
      description: 'A imprensa quer entender o momento positivo da dupla.',
      questionCategory: 'partner_positive',
      opponent: partnership.partner_name || profile.partner_name || 'seu parceiro',
      relatedEvent: `ParceriaPositiva:${partnershipKey}:${careerDate}`,
      eventLabel: 'Parceria em alta',
      careerDate,
    });
  }

  // Hotfix 14.1 (Parte 11): relação sólida com a comissão técnica —
  // coach_trust é um campo real já existente (game-core/coachLifecycle.js).
  if (profile.coach_id && Number(profile.coach_trust || 0) >= 75) {
    pending.push({
      id: `interview_coach_positive_${profile.coach_id}`,
      sourceId: `coach-positive:${profile.coach_id}:${careerDate}`,
      type: 'interview',
      title: 'Trabalho com a Comissão Técnica',
      description: 'A imprensa quer saber mais sobre o momento com a comissão técnica.',
      questionCategory: 'coach_positive',
      opponent: profile.coach_name || 'o técnico',
      relatedEvent: `TreinadorPositivo:${profile.coach_id}:${careerDate}`,
      eventLabel: 'Relação com a comissão técnica',
      careerDate,
    });
  }

  // Especulações de futuro exigem uma carreira já estabelecida.
  const totalMatches = Number(profile.wins || 0) + Number(profile.losses || 0);
  const age = profile.birth_date ? calculateAgeFromBirth(profile.birth_date, careerDate) : 20;
  if (totalMatches >= 30 && (age >= 32 || Number(profile.xp || 0) >= 5000)) {
    const season = String(careerDate).slice(0, 4);
    pending.push({
      id: `interview_speculation_${season}`,
      sourceId: `career-future:${season}`,
      type: 'interview',
      title: 'Futuro da Carreira',
      description: 'Sua trajetória já permite perguntas sobre os próximos passos da carreira.',
      questionCategory: 'speculation',
      opponent: 'o futuro',
      relatedEvent: `FuturoCarreira:${season}`,
      eventLabel: 'Futuro da carreira',
      careerDate,
    });
  }

  return pending;
}

// Hotfix 14.1 (Parte 12): todo sinal aqui vem de um campo já persistido no
// Match/profile real — nenhum é inventado ou aproximado sem justificativa.
// matchMargin: derivado de score_a/score_b (sets) — diferença de 2 sets
// (2-0) é "dominant[_loss]", diferença de 1 (2-1) é "close". isUpset reusa
// o mesmo limiar de opponent_rank<=10 já usado por
// achievementContext.js/beatTop10 (Fase 12). winStreak/lossStreak contam
// vitórias/derrotas consecutivas mais recentes a partir de `ownMatches`
// (já buscado e ordenado por data por getPendingInterviews — nenhuma
// consulta nova). rankMilestone reusa a MESMA escada unificada de
// careerStory.js/achievementsData.js (Fase 14).
const RANK_LADDER = [1, 3, 5, 10, 20, 30, 50, 100, 250, 500];

function buildInterviewMatchContext({ lastMatch, ownMatches, outcome, roundLabel, importance, profile, context }) {
  const scoreA = Number(lastMatch.score_a);
  const scoreB = Number(lastMatch.score_b);
  const setDiff = Number.isFinite(scoreA) && Number.isFinite(scoreB) ? Math.abs(scoreA - scoreB) : null;
  const matchMargin = setDiff == null ? null : setDiff >= 2 ? (outcome === 'win' ? 'dominant' : 'dominant_loss') : 'close';

  const round = String(roundLabel || '').toLowerCase();
  const isFinalRound = round.includes('final') && !round.includes('semi');
  const isSemifinalWin = outcome === 'win' && round.includes('semi');

  const opponentRank = Number(lastMatch.opponent_rank) || null;
  const isUpset = outcome === 'win' && opponentRank != null && opponentRank > 0 && opponentRank <= 10;

  let streakCount = 0;
  for (const match of ownMatches) {
    const matchOutcome = resolveOfficialPlayerOutcome(match);
    if (matchOutcome !== outcome) break;
    if (matchOutcome !== 'win' && matchOutcome !== 'loss') break;
    streakCount += 1;
  }

  const rank = Number(profile.ranking_position || profile.world_ranking || 0);
  const rankMilestone = outcome === 'win' && rank > 0 ? RANK_LADDER.find((tier) => rank <= tier) || null : null;

  const rivalry = context.rivalry;
  const isRivalryMatch = Boolean(rivalry?.name) && normalizeName(rivalry.name) === normalizeName(resolveOpponentName(lastMatch, new Set([profile.sport_name, profile.name, profile.full_name].filter(Boolean).map(normalizeName))));

  return {
    matchMargin,
    isTitle: lastMatch.tournament_outcome === 'champion',
    isFinalRound,
    isSemifinalWin,
    opponentRank,
    isUpset,
    isDebut: ownMatches.length <= 1,
    winStreak: outcome === 'win' ? streakCount : 0,
    lossStreak: outcome === 'loss' ? streakCount : 0,
    rankMilestone,
    isRivalryMatch,
    pressImportance: importance,
  };
}

function normalizeName(value) {
  return String(value || '').trim().toLocaleLowerCase('pt-BR');
}

function asTeamNames(team) {
  if (Array.isArray(team)) return team.map(item => typeof item === 'string' ? item : item?.name).filter(Boolean);
  if (typeof team === 'string') return team.split(/\s*(?:&|,|\/| e )\s*/i).filter(Boolean);
  return [];
}

function isEligibleOfficialMatch(match, profile, careerDate) {
  if (!isOfficialPlayerTournamentResult(match, profile)) return false;
  const dateValue = match.played_date || match.match_date || match.date || match.completed_at || match.created_date;
  if (!dateValue) return false;
  const matchDate = String(dateValue).slice(0, 10);
  if (matchDate > String(careerDate).slice(0, 10)) return false;
  return true;
}

function resolveOpponentName(match, playerNames) {
  const teamA = asTeamNames(match.team_a);
  const teamB = asTeamNames(match.team_b);
  const playerInA = teamA.some(name => playerNames.has(normalizeName(name)));
  const opponents = playerInA ? teamB : teamA;
  return opponents.filter(name => !playerNames.has(normalizeName(name))).join(' & ') ||
    match.opponent_name || match.winner_name || match.loser_name || 'o adversário';
}

function findNextTournament(events, registrations, profileId, careerDate) {
  const today = new Date(`${careerDate}T00:00:00`);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 7);

  const confirmedRegistrations = new Map(
    (registrations || [])
      .filter(item => item?.profile_id === profileId && item.status === 'confirmed')
      .map(item => [item.tournament_id, item])
  );

  return (events || [])
    .filter(event => {
      const type = normalizeName(event.event_type || event.type);
      const status = normalizeName(event.status);
      const dateValue = event.start_date || event.event_date || event.date;
      if (!dateValue || (!type.includes('tournament') && !type.includes('torneio'))) return false;
      if (['completed', 'concluido', 'concluído', 'cancelled', 'cancelado'].includes(status)) return false;

      const tournamentId = event.tournament_id || event.related_id;
      const registrationId = event.metadata?.registration_id;
      const explicitlyRegistered = Boolean(
        event.is_mandatory === true &&
        (registrationId || confirmedRegistrations.has(tournamentId))
      );
      if (!explicitlyRegistered) return false;

      const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
      return date >= today && date <= limit;
    })
    .sort((a, b) => String(a.start_date || a.event_date || '').localeCompare(String(b.start_date || b.event_date || '')))[0] || null;
}

function calculateAgeFromBirth(birthDate, currentDate) {
  const b = new Date(birthDate + 'T00:00:00');
  const c = new Date(currentDate + 'T00:00:00');
  let age = c.getFullYear() - b.getFullYear();
  const m = c.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && c.getDate() < b.getDate())) age--;
  return age;
}

// ─── Journalist Selection ────────────────────────────────────────────────────

// Hotfix 14.1 (Parte 9/10): bug real de repetição encontrado na auditoria —
// `[0]` sempre pegava o PRIMEIRO jornalista da lista que batesse com o
// viés, então toda entrevista pós-derrota/rumor caía sempre no mesmo
// jornalista (Rafael Cortez). Corrigido para sortear entre os candidatos
// elegíveis, não pegar sempre o primeiro.
export function pickJournalist(bias = 'any') {
  if (bias === 'any') return pickRandom(JOURNALISTS);
  if (bias === 'critical') {
    const candidates = JOURNALISTS.filter(j => j.personality === 'critico' || j.personality === 'provocador');
    return candidates.length ? pickRandom(candidates) : pickRandom(JOURNALISTS);
  }
  if (bias === 'positive') {
    const candidates = JOURNALISTS.filter(j => j.personality === 'passional' || j.personality === 'neutro');
    return candidates.length ? pickRandom(candidates) : pickRandom(JOURNALISTS);
  }
  return pickRandom(JOURNALISTS);
}

// ─── Seleção de perguntas com anti-repetição (Parte 13) ─────────────────────
// Hotfix 14.1 (Parte 9/10/13): antes, InterviewModal.jsx caminhava
// QUESTION_BANKS[categoria] sequencialmente do índice 0 — com 2 perguntas
// por categoria, toda entrevista do mesmo tipo mostrava as MESMAS 2
// perguntas, na MESMA ordem, sempre. Esta função escolhe um subconjunto
// aleatório do pool real elegível (perguntas sem `when`, ou cujo `when`
// bate com o contexto real da partida — nunca inventado), excluindo IDs
// usados recentemente quando existir alternativa válida, e só permite
// repetição quando o pool sem-recentes se esgota.
export function selectInterviewQuestions(category, matchContext = {}, recentQuestionIds = [], count = 2) {
  const pool = (QUESTION_BANKS[category] || []).filter((q) => !q.when || q.when(matchContext));
  if (pool.length === 0) return [];
  const recentSet = new Set(recentQuestionIds);
  const fresh = pool.filter((q) => !recentSet.has(q.id));
  const shuffled = (arr) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const ordered = fresh.length >= Math.min(count, pool.length) ? shuffled(fresh) : shuffled([...fresh, ...shuffled(pool.filter((q) => recentSet.has(q.id)))]);
  return ordered.slice(0, Math.min(count, pool.length));
}

// ─── Reputação helpers ───────────────────────────────────────────────────────

export function applyReputationEffects(profile, effects) {
  const updates = {};
  if (effects.fan_appeal) updates.fan_appeal = Math.max(0, Math.min(100, (profile.fan_appeal || 50) + effects.fan_appeal));
  if (effects.sponsor_appeal) updates.sponsor_appeal = Math.max(0, Math.min(100, (profile.sponsor_appeal || 50) + effects.sponsor_appeal));
  if (effects.morale) updates.morale = Math.max(0, Math.min(100, (profile.morale || 70) + effects.morale));
  return updates;
}
