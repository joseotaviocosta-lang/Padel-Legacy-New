// ─── Coach Data Library ─────────────────────────────────────────────────────
// 24 treinadores fictícios com filosofias, métodos, personalidades e históricos únicos.

import { PLAY_STYLES, ATTRIBUTES } from '@/lib/padel';

export const COACH_TIERS = {
  iniciante: { label: 'Iniciante', color: 'text-slate-400', bg: 'bg-slate-500/15', border: 'border-slate-500/30', costMult: 1 },
  regional: { label: 'Regional', color: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30', costMult: 2 },
  profissional: { label: 'Profissional', color: 'text-primary', bg: 'bg-primary/15', border: 'border-primary/30', costMult: 4 },
  elite: { label: 'Elite', color: 'text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/30', costMult: 8 },
  lendario: { label: 'Lendário', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30', costMult: 15 },
};

export const COACHING_STYLES = {
  autocratico: { label: 'Autocrático', desc: 'Decisões centralizadas, disciplina rígida', icon: 'Shield' },
  colaborativo: { label: 'Colaborativo', desc: 'Trabalha junto com o atleta,feedback mútuo', icon: 'Users' },
  analitico: { label: 'Analítico', desc: 'Dados, vídeo e estatísticas guiam tudo', icon: 'Brain' },
  inspirador: { label: 'Inspirador', desc: 'Motivação e conexão emocional', icon: 'Flame' },
  tradicional: { label: 'Tradicional', desc: 'Métodos clássicos comprovados pelo tempo', icon: 'BookOpen' },
  inovador: { label: 'Inovador', desc: 'Tecnologia e métodos de vanguarda', icon: 'Sparkles' },
};

export const TRAINING_METHODS = {
  repeticao_tecnica: { label: 'Repetição Técnica', desc: 'Golpes repetidos até a perfeição', icon: 'RotateCw' },
  video_analise: { label: 'Vídeo Análise', desc: 'Estudo de partidas e adversários', icon: 'Video' },
  simulacao_partida: { label: 'Simulação de Partida', desc: 'Situações reais de jogo', icon: 'Swords' },
  condicionamento_fisico: { label: 'Condicionamento Físico', desc: 'Força, resistência e agilidade', icon: 'Dumbbell' },
  visualizacao: { label: 'Visualização', desc: 'Imaginação guiada de cenários', icon: 'Eye' },
  jogos_mentais: { label: 'Jogos Mentais', desc: 'Resiliência e foco sob pressão', icon: 'Brain' },
  biofeedback: { label: 'Biofeedback', desc: 'Monitoramento de sinais corporais', icon: 'Activity' },
  treino_sombra: { label: 'Treino Sombra', desc: 'Movimentos sem bola', icon: 'User' },
  sparring_dinamico: { label: 'Sparring Dinâmico', desc: 'Prática com parceiros variados', icon: 'Users' },
  analise_dados: { label: 'Análise de Dados', desc: 'Métricas avançadas de performance', icon: 'BarChart3' },
  meditacao: { label: 'Meditação', desc: 'Centramento e controle emocional', icon: 'Heart' },
  periodizacao: { label: 'Periodização', desc: 'Ciclos de carga e recuperação', icon: 'Calendar' },
};



export const COACH_SPECIALTY_INFO = {
  tecnico: {
    label: 'Técnico',
    summary: 'Acelera a evolução técnica e melhora golpes específicos trabalhados nos treinos.',
    benefits: ['mais progresso técnico', 'especialização de golpes', 'melhor aproveitamento dos treinos'],
  },
  motivacional: {
    label: 'Motivador',
    summary: 'Protege a confiança e ajuda o atleta a reagir melhor a derrotas e momentos de pressão.',
    benefits: ['mais confiança', 'moral mais estável', 'melhor resposta sob pressão'],
  },
  estratega: {
    label: 'Estrategista',
    summary: 'Melhora a leitura de jogo, a preparação tática e a qualidade das decisões em quadra.',
    benefits: ['mais estratégia', 'melhores escolhas de golpe', 'análise de adversários'],
  },
  fisico: {
    label: 'Preparação física',
    summary: 'Aumenta a eficiência física, auxilia a recuperação e reduz desgaste e risco de lesão.',
    benefits: ['mais energia', 'menor risco de lesão', 'melhor rendimento físico'],
  },
  mental: {
    label: 'Mental',
    summary: 'Desenvolve foco, controle emocional e desempenho em pontos decisivos.',
    benefits: ['mais foco', 'controle emocional', 'desempenho decisivo'],
  },
};

export function getCoachImpactSummary(coach, profile) {
  if (!coach) return { title: 'Sem especialidade', summary: 'Nenhum efeito disponível.', highlights: [] };
  const info = COACH_SPECIALTY_INFO[coach.specialty] || {
    label: String(coach.specialty || 'Treinador'),
    summary: 'Contribui para o desenvolvimento do atleta conforme suas especializações.',
    benefits: [],
  };
  const effects = getCoachEffects(coach, profile);
  const highlights = [];
  if (effects?.trainingBoost) highlights.push(`${effects.trainingBoost > 0 ? '+' : ''}${effects.trainingBoost}% eficiência geral de treino`);
  if (effects?.energyBonus) highlights.push(`+${effects.energyBonus} recuperação de energia`);
  if (effects?.moraleBonus) highlights.push(`+${effects.moraleBonus} estabilidade de confiança`);
  if (effects?.injuryReduction) highlights.push(`-${effects.injuryReduction}% risco de lesão`);
  if (effects?.strategyBonus) highlights.push(`+${effects.strategyBonus} leitura tática`);
  const specs = (coach.specializations || []).slice(0, 3).map(item => String(item).replaceAll('_', ' '));
  if (specs.length) highlights.push(`Foco: ${specs.join(', ')}`);
  return { title: info.label, summary: info.summary, highlights: highlights.slice(0, 3), benefits: info.benefits };
}

export const COACHES_DATA = [
  {
    name: 'Rafael "Rafa" Mendez',
    nationality: 'Espanha', city: 'Madrid', age: 52,
    specialty: 'tecnico', coaching_style: 'autocratico',
    philosophy: 'A perfeição nasce da repetição obsessiva. Cada golpe é uma escultura.',
    personality: 'Exigente e perfeccionista',
    personality_traits: ['disciplinado', 'perfeccionista', 'lider'],
    training_methods: ['repeticao_tecnica', 'video_analise', 'simulacao_partida', 'periodizacao'],
    specializations: ['volley', 'bandeja', 'serve'],
    preferred_styles: ['Tático', 'Equilibrado'],
    preferred_personalities: ['disciplinado', 'resiliente', 'trabalhador'],
    experience_years: 28, reputation: 92, tier: 'lendario',
    monthly_cost: 5000, sign_on_bonus: 15000, performance_bonus_pct: 5,
    demands: { min_level: 'Avançado', min_reputation: 70, exclusivity: true },
    achievements: [
      { title: 'Treinador do Ano FIP', year: 2024, description: 'Eleito pela Federação Internacional de Padel' },
      { title: '10 Títulos de Grand Slam', year: 2023, description: 'Como treinador de duplas campeãs' },
      { title: 'Hall da Fama', year: 2025, description: 'Induzido como treinador lendário' },
    ],
    career_history: [
      { role: 'Treinador Principal', entity: 'Seleção Espanhola', start_year: 2018, end_year: null, description: 'Comandou a seleção ao hexacampeonato' },
      { role: 'Treinador Pessoal', entity: 'Circuito Profissional', start_year: 2005, end_year: 2018, description: 'Treinou 5 atletas top 10' },
    ],
    track_record: { athletes_coached: 47, titles_won: 23, top_ranking_achieved: 1, grand_slams: 10 },
    training_bonus: { volley: 3, bandeja: 3, serve: 2, strategy: 2 },
    signature_quote: 'Não existe talento sem disciplina. A quadra não mente.',
    bio: 'Considerado o pai do padel moderno, Mendez revolucionou a técnica de voleio e bandeja. Sua academia em Madrid formou mais de 40 atletas profissionais.',
  },
  {
    name: 'Cristina Vega',
    nationality: 'Argentina', city: 'Buenos Aires', age: 44,
    specialty: 'motivacional', coaching_style: 'inspirador',
    philosophy: 'O coração vence onde a técnica falha. Acredite antes de conseguir.',
    personality: 'Carismática e empática',
    personality_traits: ['carismatico', 'empatico', 'optimista', 'lider'],
    training_methods: ['visualizacao', 'jogos_mentais', 'meditacao', 'sparring_dinamico'],
    specializations: ['emotional_control', 'strategy', 'defense'],
    preferred_styles: ['Defensivo', 'Equilibrado'],
    preferred_personalities: ['resiliente', 'otimista', 'disciplinado', 'mercurial'],
    experience_years: 20, reputation: 88, tier: 'elite',
    monthly_cost: 3000, sign_on_bonus: 8000, performance_bonus_pct: 4,
    demands: { min_level: 'Competitivo', min_reputation: 60 },
    achievements: [
      { title: 'Treinadora Revelação', year: 2020, description: 'Levou atleta do zero ao top 50' },
      { title: '3 Medalhas Olímpicas', year: 2024, description: 'Como técnica da seleção argentina' },
    ],
    career_history: [
      { role: 'Treinadora Principal', entity: 'Seleção Argentina', start_year: 2019, end_year: null, description: 'Primeira mulher no comando' },
    ],
    track_record: { athletes_coached: 31, titles_won: 12, top_ranking_achieved: 3, grand_slams: 3 },
    training_bonus: { emotional_control: 3, strategy: 2, defense: 2 },
    signature_quote: 'A mente é a quadra mais importante. Vença lá primeiro.',
    bio: 'Pioneira no coaching feminino do padel, Cristina é conhecida por transformar atletas em crise em campeões através de trabalho mental intensivo.',
  },
  {
    name: 'Marcus "O Professor" Holm',
    nationality: 'Suécia', city: 'Estocolmo', age: 58,
    specialty: 'estratega', coaching_style: 'analitico',
    philosophy: 'Dados não mentem. Cada decisão é uma equação a ser resolvida.',
    personality: 'Metódico e frio',
    personality_traits: ['analitico', 'frio', 'disciplinado', 'estratega'],
    training_methods: ['video_analise', 'analise_dados', 'biofeedback', 'periodizacao'],
    specializations: ['strategy', 'serve', 'agility'],
    preferred_styles: ['Tático', 'Agressivo'],
    preferred_personalities: ['analitico', 'disciplinado', 'frio'],
    experience_years: 30, reputation: 90, tier: 'lendario',
    monthly_cost: 4500, sign_on_bonus: 12000, performance_bonus_pct: 6,
    demands: { min_level: 'Avançado', min_reputation: 65, min_club_level: 3 },
    achievements: [
      { title: 'Inovador do Ano', year: 2023, description: 'Pioneiro em análise de dados no padel' },
      { title: '8 Títulos Major', year: 2024, description: 'Recorde de títulos em uma temporada' },
    ],
    career_history: [
      { role: 'Diretor Técnico', entity: 'Academia Nórdica', start_year: 2010, end_year: null, description: 'Fundou o primeiro laboratório de dados do padel' },
    ],
    track_record: { athletes_coached: 52, titles_won: 19, top_ranking_achieved: 1, grand_slams: 8 },
    training_bonus: { strategy: 3, serve: 2, agility: 2 },
    signature_quote: 'O talento é aleatório. A preparação é matemática.',
    bio: 'Engenheiro de formação, Holm trouxe a análise quantitativa para o padel. Seu laboratório em Estocolmo usa IA para prever padrões de jogo.',
  },
  {
    name: 'Diego Fuentes',
    nationality: 'Chile', city: 'Santiago', age: 41,
    specialty: 'fisico', coaching_style: 'inovador',
    philosophy: 'Corpo forte, mente forte. A condição física é a base de tudo.',
    personality: 'Energético e moderno',
    personality_traits: ['energetico', 'inovador', 'disciplinado', 'ambicioso'],
    training_methods: ['condicionamento_fisico', 'biofeedback', 'periodizacao', 'treino_sombra'],
    specializations: ['agility', 'smash', 'defense'],
    preferred_styles: ['Potência', 'Agressivo'],
    preferred_personalities: ['trabalhador', 'disciplinado', 'ambicioso'],
    experience_years: 15, reputation: 82, tier: 'elite',
    monthly_cost: 2800, sign_on_bonus: 6000, performance_bonus_pct: 3,
    demands: { min_level: 'Competitivo', min_reputation: 55 },
    achievements: [
      { title: 'Preparador Físico do Ano', year: 2022, description: 'Reconhecido pela FIP' },
      { title: 'Recorde de Resistência', year: 2024, description: 'Atleta sob sua tutela quebrou recorde de fôlego' },
    ],
    career_history: [
      { role: 'Preparador Físico', entity: 'Clube Andino', start_year: 2015, end_year: null, description: 'Revolucionou o condicionamento de altitude' },
    ],
    track_record: { athletes_coached: 28, titles_won: 8, top_ranking_achieved: 5, grand_slams: 2 },
    training_bonus: { agility: 3, smash: 2, defense: 2 },
    signature_quote: 'Cansaço é desculpa. Preparação é solução.',
    bio: 'Fisiologista esportivo, Diego uniu ciência do exercício ao padel. Seus atletas são conhecidos por resistência incomparável em partidas longas.',
  },
  {
    name: 'Sofia Castellano',
    nationality: 'Itália', city: 'Roma', age: 47,
    specialty: 'mental', coaching_style: 'colaborativo',
    philosophy: 'Conheça a si mesmo antes de conhecer o adversário.',
    personality: 'Calma e profunda',
    personality_traits: ['calmo', 'empatico', 'sabio', 'introvertido'],
    training_methods: ['meditacao', 'visualizacao', 'jogos_mentais', 'video_analise'],
    specializations: ['emotional_control', 'strategy', 'backhand'],
    preferred_styles: ['Tático', 'Defensivo'],
    preferred_personalities: ['calmo', 'resiliente', 'analitico', 'introvertido'],
    experience_years: 22, reputation: 85, tier: 'elite',
    monthly_cost: 2500, sign_on_bonus: 5000, performance_bonus_pct: 3,
    demands: { min_level: 'Competitivo' },
    achievements: [
      { title: 'Psicóloga Esportiva do Ano', year: 2021, description: 'Premio internacional' },
      { title: '5 Títulos de Mental Toughness', year: 2023, description: 'Atletas seus venceram prêmio de resiliência' },
    ],
    career_history: [
      { role: 'Coach Mental', entity: 'Circuito Profissional', start_year: 2012, end_year: null, description: 'Especialista em atletas em crise' },
    ],
    track_record: { athletes_coached: 39, titles_won: 11, top_ranking_achieved: 2, grand_slams: 4 },
    training_bonus: { emotional_control: 3, strategy: 2, backhand: 1 },
    signature_quote: 'A pressão é um privilégio. Aproveite cada momento.',
    bio: 'Psicóloga clínica que migrou para o esporte, Sofia é a referência em saúde mental no padel. Já resgatou carreiras consideradas perdidas.',
  },
  {
    name: 'Joaquim "Joca" Pereira',
    nationality: 'Brasil', city: 'São Paulo', age: 55,
    specialty: 'tecnico', coaching_style: 'tradicional',
    philosophy: 'O básico bem feito vence qualquer sofisticação.',
    personality: 'Simples e direto',
    personality_traits: ['trabalhador', 'humilde', 'disciplinado', 'sincero'],
    training_methods: ['repeticao_tecnica', 'simulacao_partida', 'sparring_dinamico', 'treino_sombra'],
    specializations: ['forehand', 'serve', 'volley'],
    preferred_styles: ['Agressivo', 'Equilibrado'],
    preferred_personalities: ['trabalhador', 'humilde', 'disciplinado'],
    experience_years: 32, reputation: 80, tier: 'profissional',
    monthly_cost: 1800, sign_on_bonus: 3000, performance_bonus_pct: 2,
    demands: { min_level: 'Amador' },
    achievements: [
      { title: 'Mestre do Padel Brasileiro', year: 2020, description: 'Título honorífico da CBN' },
      { title: '20 Anos de Dedicação', year: 2024, description: 'Reconhecimento por contribuição ao esporte' },
    ],
    career_history: [
      { role: 'Treinador Chefe', entity: 'Clube Paulista', start_year: 1998, end_year: null, description: 'Formou mais de 100 atletas profissionais' },
    ],
    track_record: { athletes_coached: 78, titles_won: 15, top_ranking_achieved: 8, grand_slams: 1 },
    training_bonus: { forehand: 3, serve: 2, volley: 1 },
    signature_quote: 'Treine o simples até o extraordinário.',
    bio: 'Joaquim é o treinador brasileiro mais respeitado da velha guarda. Sua academia em São Paulo é berço de talentos nacionais há três décadas.',
  },
  {
    name: 'Nuria Bosch',
    nationality: 'Espanha', city: 'Barcelona', age: 39,
    specialty: 'estratega', coaching_style: 'inovador',
    philosophy: 'O futuro é agora. Tecnologia é a nova quadra.',
    personality: 'Brilhante e arrojada',
    personality_traits: ['inovador', 'ambicioso', 'genio', 'analitico'],
    training_methods: ['analise_dados', 'video_analise', 'biofeedback', 'simulacao_partida'],
    specializations: ['strategy', 'backhand', 'emotional_control'],
    preferred_styles: ['Tático', 'Equilibrado'],
    preferred_personalities: ['analitico', 'ambicioso', 'inovador'],
    experience_years: 12, reputation: 78, tier: 'profissional',
    monthly_cost: 2000, sign_on_bonus: 4000, performance_bonus_pct: 4,
    demands: { min_level: 'Competitivo', min_reputation: 50 },
    achievements: [
      { title: 'Jovem Treinadora do Ano', year: 2023, description: 'A mais jovem a receber o prêmio' },
      { title: 'App de Análise Premiado', year: 2024, description: 'Criou app de análise tática usado no circuito' },
    ],
    career_history: [
      { role: 'Analista Tática', entity: 'Tech Padel Lab', start_year: 2018, end_year: null, description: 'Fundadora do laboratório' },
    ],
    track_record: { athletes_coached: 19, titles_won: 6, top_ranking_achieved: 4, grand_slams: 1 },
    training_bonus: { strategy: 3, backhand: 2, emotional_control: 1 },
    signature_quote: 'Enquanto eles treinam, eu analiso. Enquanto eles jogam, eu prevejo.',
    bio: 'Engenheira de software virada treinadora, Nuria criou o primeiro app de IA para análise de padel. Sua geração de atletas é a mais "data-driven" do circuito.',
  },
  {
    name: 'Roberto "Beto" Silva',
    nationality: 'Brasil', city: 'Belo Horizonte', age: 48,
    specialty: 'fisico', coaching_style: 'autocratico',
    philosophy: 'Suor não tem preço. Dor é temporária, glória é eterna.',
    personality: 'Durão e exigente',
    personality_traits: ['disciplinado', 'durao', 'ambicioso', 'lider'],
    training_methods: ['condicionamento_fisico', 'treino_sombra', 'periodizacao', 'sparring_dinamico'],
    specializations: ['smash', 'agility', 'defense'],
    preferred_styles: ['Potência', 'Agressivo'],
    preferred_personalities: ['trabalhador', 'disciplinado', 'resiliente'],
    experience_years: 25, reputation: 83, tier: 'elite',
    monthly_cost: 2600, sign_on_bonus: 5500, performance_bonus_pct: 3,
    demands: { min_level: 'Competitivo', min_reputation: 55 },
    achievements: [
      { title: 'Preparador da Seleção', year: 2022, description: 'Convocado para a seleção brasileira' },
      { title: 'Atleta mais Forte do Circuito', year: 2024, description: 'Seu pupilo eleito o mais forte fisicamente' },
    ],
    career_history: [
      { role: 'Preparador Físico', entity: 'Seleção Brasileira', start_year: 2020, end_year: null, description: 'Comandou a preparação física nacional' },
    ],
    track_record: { athletes_coached: 35, titles_won: 9, top_ranking_achieved: 6, grand_slams: 2 },
    training_bonus: { smash: 3, agility: 2, defense: 1 },
    signature_quote: 'Quando você quer parar, eu quero mais três. Esse é o diferencial.',
    bio: 'Ex-militar, Beto trouxe a disciplina de quartel para o padel. Seus treinos são lendários pela intensidade, mas os resultados falam por si.',
  },
  {
    name: 'Elena Ruiz',
    nationality: 'Espanha', city: 'Valência', age: 42,
    specialty: 'motivacional', coaching_style: 'inspirador',
    philosophy: 'Cada atleta é uma história sendo escrita. Eu sou a caneta.',
    personality: 'Acolhedora e visionária',
    personality_traits: ['empatico', 'carismatico', 'optimista', 'visionario'],
    training_methods: ['visualizacao', 'meditacao', 'sparring_dinamico', 'video_analise'],
    specializations: ['emotional_control', 'forehand', 'strategy'],
    preferred_styles: ['Equilibrado', 'Defensivo'],
    preferred_personalities: ['otimista', 'resiliente', 'empatico', 'carismatico'],
    experience_years: 18, reputation: 79, tier: 'profissional',
    monthly_cost: 1900, sign_on_bonus: 3500, performance_bonus_pct: 3,
    demands: { min_level: 'Amador' },
    achievements: [
      { title: 'Coach Humanitário', year: 2023, description: 'Trabalho social com jovens atletas' },
      { title: 'Revelação Feminina', year: 2021, description: 'Primeira treinadora a chegar a final de Major' },
    ],
    career_history: [
      { role: 'Treinadora', entity: 'Academia Valenciana', start_year: 2015, end_year: null, description: 'Focada em desenvolvimento de jovens' },
    ],
    track_record: { athletes_coached: 42, titles_won: 7, top_ranking_achieved: 5, grand_slams: 0 },
    training_bonus: { emotional_control: 2, forehand: 2, strategy: 2 },
    signature_quote: 'Você não treina para vencer jogos. Treina para vencer a si mesmo.',
    bio: 'Elena acredita que o padel transforma vidas. Sua academia gratuita para jovens carentes em Valência formou atletas que hoje estão no circuito profissional.',
  },
  {
    name: 'Tomas Lindgren',
    nationality: 'Suécia', city: 'Gotemburgo', age: 50,
    specialty: 'tecnico', coaching_style: 'analitico',
    philosophy: 'Cada milímetro conta. A técnica é geometria aplicada.',
    personality: 'Preciso e paciente',
    personality_traits: ['analitico', 'paciente', 'disciplinado', 'perfeccionista'],
    training_methods: ['repeticao_tecnica', 'video_analise', 'analise_dados', 'biofeedback'],
    specializations: ['bandeja', 'serve', 'volley'],
    preferred_styles: ['Tático', 'Equilibrado'],
    preferred_personalities: ['analitico', 'disciplinado', 'paciente'],
    experience_years: 27, reputation: 86, tier: 'elite',
    monthly_cost: 2400, sign_on_bonus: 5000, performance_bonus_pct: 3,
    demands: { min_level: 'Competitivo', min_reputation: 55 },
    achievements: [
      { title: 'Técnico do Ano Escandinavo', year: 2023, description: 'Prêmio regional' },
      { title: 'Método Lindgren', year: 2024, description: 'Sistema de ensino patenteado' },
    ],
    career_history: [
      { role: 'Diretor Técnico', entity: 'Academia Nórdica', start_year: 2008, end_year: 2020, description: 'Desenvolveu o método Lindgren' },
    ],
    track_record: { athletes_coached: 44, titles_won: 13, top_ranking_achieved: 3, grand_slams: 4 },
    training_bonus: { bandeja: 3, serve: 2, volley: 1 },
    signature_quote: 'A bola segue leis da física. Domine as leis, domine o jogo.',
    bio: 'Ex-professor de matemática, Tomas enxerga o padel como geometria. Seu método é estudado em academias de toda a Escandinávia.',
  },
  {
    name: 'Pablo "El Toro" González',
    nationality: 'Argentina', city: 'Córdoba', age: 53,
    specialty: 'tecnico', coaching_style: 'autocratico',
    philosophy: 'Ataque sempre. Defesa é para quem tem medo de vencer.',
    personality: 'Explosivo e dominador',
    personality_traits: ['agressivo', 'ambicioso', 'lider', 'intimidador'],
    training_methods: ['simulacao_partida', 'sparring_dinamico', 'condicionamento_fisico', 'repeticao_tecnica'],
    specializations: ['smash', 'forehand', 'serve'],
    preferred_styles: ['Agressivo', 'Potência'],
    preferred_personalities: ['agressivo', 'ambicioso', 'energetico', 'corajoso'],
    experience_years: 29, reputation: 87, tier: 'elite',
    monthly_cost: 2700, sign_on_bonus: 6000, performance_bonus_pct: 4,
    demands: { min_level: 'Avançado', min_reputation: 60 },
    achievements: [
      { title: 'Rei do Ataque', year: 2022, description: 'Seus atletas lideram em smashes vencedores' },
      { title: '5 Títulos Seguidos', year: 2024, description: 'Sequência histórica de vitórias' },
    ],
    career_history: [
      { role: 'Treinador Principal', entity: 'Academia El Toro', start_year: 2005, end_year: null, description: 'Fundou a academia mais agressiva do circuito' },
    ],
    track_record: { athletes_coached: 38, titles_won: 16, top_ranking_achieved: 2, grand_slams: 6 },
    training_bonus: { smash: 3, forehand: 2, serve: 2 },
    signature_quote: 'Defesa é para covardes. Eu treino para destruir.',
    bio: 'O treinador mais temido do circuito, Pablo só aceita atletas com perfil agressivo. Seus pupilos são conhecidos pela pressão ofensiva implacável.',
  },
  {
    name: 'Marta Lopes',
    nationality: 'Portugal', city: 'Lisboa', age: 45,
    specialty: 'mental', coaching_style: 'colaborativo',
    philosophy: 'O fracasso é dado. A resposta é escolha.',
    personality: 'Equilibrada e sábia',
    personality_traits: ['calmo', 'sabio', 'empatico', 'resiliente'],
    training_methods: ['jogos_mentais', 'meditacao', 'visualizacao', 'video_analise'],
    specializations: ['emotional_control', 'strategy', 'defense'],
    preferred_styles: ['Defensivo', 'Tático'],
    preferred_personalities: ['calmo', 'resiliente', 'analitico', 'paciente'],
    experience_years: 20, reputation: 81, tier: 'elite',
    monthly_cost: 2300, sign_on_bonus: 4500, performance_bonus_pct: 3,
    demands: { min_level: 'Competitivo' },
    achievements: [
      { title: 'Coach de Resiliência', year: 2022, description: 'Especialista em comebacks' },
      { title: 'Livro Best-Seller', year: 2023, description: 'A Mente do Atleta - publicado em 8 países' },
    ],
    career_history: [
      { role: 'Coach Mental', entity: 'Centro Lusíada', start_year: 2014, end_year: null, description: 'Referência em Portugal' },
    ],
    track_record: { athletes_coached: 33, titles_won: 9, top_ranking_achieved: 4, grand_slams: 2 },
    training_bonus: { emotional_control: 3, strategy: 2, defense: 1 },
    signature_quote: 'Você caiu? Levante. Isso é tudo que importa.',
    bio: 'Marta escreveu o livro de referência sobre mentalidade esportiva no mundo lusófono. Seus atletas são conhecidos pela frieza sob pressão.',
  },
  {
    name: 'Henrik Olsen',
    nationality: 'Dinamarca', city: 'Copenhague', age: 36,
    specialty: 'fisico', coaching_style: 'inovador',
    philosophy: 'Biometria é o futuro. Seu corpo é o seu maior dado.',
    personality: 'Nerd e vanguardista',
    personality_traits: ['inovador', 'analitico', 'ambicioso', 'curioso'],
    training_methods: ['biofeedback', 'analise_dados', 'condicionamento_fisico', 'periodizacao'],
    specializations: ['agility', 'defense', 'emotional_control'],
    preferred_styles: ['Equilibrado', 'Tático'],
    preferred_personalities: ['analitico', 'disciplinado', 'inovador', 'curioso'],
    experience_years: 10, reputation: 72, tier: 'profissional',
    monthly_cost: 1700, sign_on_bonus: 3000, performance_bonus_pct: 3,
    demands: { min_level: 'Amador' },
    achievements: [
      { title: 'Startup do Ano Esportivo', year: 2024, description: 'Fundou startup de biometria para padel' },
    ],
    career_history: [
      { role: 'Fundador', entity: 'PadelTech', start_year: 2020, end_year: null, description: 'Startup de tecnologia esportiva' },
    ],
    track_record: { athletes_coached: 15, titles_won: 4, top_ranking_achieved: 7, grand_slams: 0 },
    training_bonus: { agility: 2, defense: 2, emotional_control: 1 },
    signature_quote: 'Seu coração dá 72 batidas. Vamos otimizar para 68.',
    bio: 'O jovem gênio da biometria no padel, Henrik veste wearables em seus atletas e ajusta cada treino com base em dados fisiológicos em tempo real.',
  },
  {
    name: 'Carmen Delgado',
    nationality: 'México', city: 'Cidade do México', age: 49,
    specialty: 'motivacional', coaching_style: 'inspirador',
    philosophy: 'O padel é uma dança. Encontre o ritmo do seu jogo.',
    personality: 'Artística e apaixonada',
    personality_traits: ['carismatico', 'apaixonado', 'criativo', 'empatico'],
    training_methods: ['visualizacao', 'sparring_dinamico', 'meditacao', 'simulacao_partida'],
    specializations: ['forehand', 'volley', 'emotional_control'],
    preferred_styles: ['Agressivo', 'Equilibrado'],
    preferred_personalities: ['apaixonado', 'criativo', 'carismatico', 'energetico'],
    experience_years: 24, reputation: 84, tier: 'elite',
    monthly_cost: 2500, sign_on_bonus: 5000, performance_bonus_pct: 3,
    demands: { min_level: 'Competitivo' },
    achievements: [
      { title: 'Treinadora Latina do Ano', year: 2023, description: 'Prêmio da Confederação Latino-americana' },
      { title: 'Método Ritmo', year: 2024, description: 'Sistema de treinamento rítmico aclamado' },
    ],
    career_history: [
      { role: 'Treinadora', entity: 'Academia Azteca', start_year: 2010, end_year: null, description: 'A maior academia do México' },
    ],
    track_record: { athletes_coached: 40, titles_won: 12, top_ranking_achieved: 3, grand_slams: 3 },
    training_bonus: { forehand: 2, volley: 2, emotional_control: 2 },
    signature_quote: 'Sinta a música do jogo. Cada golpe é uma nota.',
    bio: 'Ex-bailarina, Carmen enxerga o padel como arte. Seu método de treinamento rítmico revolucionou a forma como atletas latino-americanos jogam.',
  },
  {
    name: 'Anders Bergström',
    nationality: 'Suécia', city: 'Malmö', age: 60,
    specialty: 'tecnico', coaching_style: 'tradicional',
    philosophy: '40 anos de experiência não podem estar errados.',
    personality: 'Sábio e conservador',
    personality_traits: ['sabio', 'tradicional', 'paciente', 'disciplinado'],
    training_methods: ['repeticao_tecnica', 'treino_sombra', 'simulacao_partida', 'sparring_dinamico'],
    specializations: ['backhand', 'volley', 'strategy'],
    preferred_styles: ['Defensivo', 'Equilibrado'],
    preferred_personalities: ['paciente', 'disciplinado', 'trabalhador', 'humilde'],
    experience_years: 38, reputation: 89, tier: 'lendario',
    monthly_cost: 4000, sign_on_bonus: 10000, performance_bonus_pct: 5,
    demands: { min_level: 'Avançado', min_reputation: 65, min_club_level: 4 },
    achievements: [
      { title: 'Lenda Viva', year: 2025, description: 'Induzido no Hall da Fama como treinador' },
      { title: '40 Anos de Padel', year: 2024, description: 'A carreira mais longeva do circuito' },
    ],
    career_history: [
      { role: 'Treinador', entity: 'Clube Escandinavo', start_year: 1985, end_year: null, description: 'Mais longeva carreira ativa' },
    ],
    track_record: { athletes_coached: 95, titles_won: 28, top_ranking_achieved: 1, grand_slams: 12 },
    training_bonus: { backhand: 3, volley: 2, strategy: 2 },
    signature_quote: 'Já vi tudo. O que não muda é o fundamental.',
    bio: 'O decano dos treinadores, Anders já treinou três gerações de atletas. Sua experiência é considerada uma enciclopédia viva do padel.',
  },
  {
    name: 'Lucia Ferreira',
    nationality: 'Brasil', city: 'Florianópolis', age: 38,
    specialty: 'estratega', coaching_style: 'colaborativo',
    philosophy: 'Juntos somos mais inteligentes que qualquer algoritmo.',
    personality: 'Moderna e acessível',
    personality_traits: ['inovador', 'empatico', 'colaborativo', 'ambicioso'],
    training_methods: ['analise_dados', 'video_analise', 'sparring_dinamico', 'meditacao'],
    specializations: ['strategy', 'emotional_control', 'agility'],
    preferred_styles: ['Tático', 'Equilibrado'],
    preferred_personalities: ['analitico', 'colaborativo', 'inovador', 'ambicioso'],
    experience_years: 14, reputation: 76, tier: 'profissional',
    monthly_cost: 1600, sign_on_bonus: 2500, performance_bonus_pct: 3,
    demands: { min_level: 'Amador' },
    achievements: [
      { title: 'Coach Digital do Ano', year: 2024, description: 'Maior presença digital entre treinadores' },
    ],
    career_history: [
      { role: 'Consultora Tática', entity: 'Seleção Brasileira', start_year: 2021, end_year: null, description: 'Primeira consultora digital da seleção' },
    ],
    track_record: { athletes_coached: 22, titles_won: 5, top_ranking_achieved: 8, grand_slams: 0 },
    training_bonus: { strategy: 2, emotional_control: 2, agility: 1 },
    signature_quote: 'O padel é xadrez em movimento. Eu ajudo você a ver 3 jogadas à frente.',
    bio: 'A treinadora mais conectada do Brasil, Lucia popularizou o padel nas redes sociais e formou a primeira geração de atletas "digitais" do país.',
  },
  {
    name: 'Francisco "Paco" Romero',
    nationality: 'Espanha', city: 'Sevilha', age: 46,
    specialty: 'fisico', coaching_style: 'tradicional',
    philosophy: 'O corpo é uma máquina. Mantenha-a lubrificada.',
    personality: 'Prático e experiente',
    personality_traits: ['pratico', 'disciplinado', 'durao', 'trabalhador'],
    training_methods: ['condicionamento_fisico', 'periodizacao', 'treino_sombra', 'repeticao_tecnica'],
    specializations: ['defense', 'agility', 'smash'],
    preferred_styles: ['Defensivo', 'Potência'],
    preferred_personalities: ['trabalhador', 'disciplinado', 'resiliente', 'pratico'],
    experience_years: 23, reputation: 82, tier: 'elite',
    monthly_cost: 2400, sign_on_bonus: 4800, performance_bonus_pct: 3,
    demands: { min_level: 'Competitivo' },
    achievements: [
      { title: 'Preparador do Ano Andaluz', year: 2022, description: 'Prêmio regional' },
      { title: 'Atleta mais Resistente', year: 2024, description: 'Atleta seu venceu prêmio de resistência' },
    ],
    career_history: [
      { role: 'Preparador Físico', entity: 'Clube Sevilhano', start_year: 2005, end_year: null, description: 'Referência no sul da Espanha' },
    ],
    track_record: { athletes_coached: 36, titles_won: 10, top_ranking_achieved: 5, grand_slams: 2 },
    training_bonus: { defense: 3, agility: 2, smash: 1 },
    signature_quote: 'Máquina boa não quebra. Cuide do motor.',
    bio: 'Paco é o preparador físico mais procurado do sul da Espanha. Seus atletas raramente se lesionam, graças à periodização conservadora.',
  },
  {
    name: 'Yuki Tanaka',
    nationality: 'Japão', city: 'Tóquio', age: 40,
    specialty: 'mental', coaching_style: 'inovador',
    philosophy: 'Zen na quadra. Tempestade fora dela.',
    personality: 'Sereno e filosófico',
    personality_traits: ['calmo', 'sabio', 'disciplinado', 'misterioso'],
    training_methods: ['meditacao', 'visualizacao', 'biofeedback', 'jogos_mentais'],
    specializations: ['emotional_control', 'strategy', 'backhand'],
    preferred_styles: ['Tático', 'Defensivo'],
    preferred_personalities: ['calmo', 'disciplinado', 'analitico', 'introvertido'],
    experience_years: 16, reputation: 80, tier: 'elite',
    monthly_cost: 2200, sign_on_bonus: 4000, performance_bonus_pct: 3,
    demands: { min_level: 'Competitivo' },
    achievements: [
      { title: 'Embaixador do Zen Padel', year: 2023, description: 'Título honorífico' },
      { title: 'Atleta mais Focado', year: 2024, description: 'Atleta seu venceu prêmio de concentração' },
    ],
    career_history: [
      { role: 'Coach Mental', entity: 'Dojo Padel Tóquio', start_year: 2015, end_year: null, description: 'Primeiro dojo de padel do Japão' },
    ],
    track_record: { athletes_coached: 25, titles_won: 8, top_ranking_achieved: 4, grand_slams: 2 },
    training_bonus: { emotional_control: 3, strategy: 2, backhand: 1 },
    signature_quote: 'A mente quieta vence. A mente agitada perde.',
    bio: 'Monge zen e treinador de padel, Yuki uniu filosofia oriental ao esporte ocidental. Seus atletas são conhecidos pela serenidade absoluta em quadra.',
  },
  {
    name: 'Bruno Carvalho',
    nationality: 'Portugal', city: 'Porto', age: 43,
    specialty: 'tecnico', coaching_style: 'colaborativo',
    philosophy: 'O atleta é o autor. Eu sou o editor.',
    personality: 'Comunicador e parceiro',
    personality_traits: ['empatico', 'comunicador', 'colaborativo', 'paciente'],
    training_methods: ['video_analise', 'sparring_dinamico', 'simulacao_partida', 'repeticao_tecnica'],
    specializations: ['volley', 'forehand', 'serve'],
    preferred_styles: ['Agressivo', 'Equilibrado'],
    preferred_personalities: ['comunicador', 'empatico', 'colaborativo', 'trabalhador'],
    experience_years: 19, reputation: 77, tier: 'profissional',
    monthly_cost: 1700, sign_on_bonus: 3000, performance_bonus_pct: 3,
    demands: { min_level: 'Amador' },
    achievements: [
      { title: 'Coach Comunicador', year: 2023, description: 'Prêmio de melhor relação com atletas' },
    ],
    career_history: [
      { role: 'Treinador', entity: 'Clube Portuense', start_year: 2012, end_year: null, description: 'Foco em desenvolvimento técnico' },
    ],
    track_record: { athletes_coached: 30, titles_won: 7, top_ranking_achieved: 6, grand_slams: 1 },
    training_bonus: { volley: 2, forehand: 2, serve: 1 },
    signature_quote: 'Eu não te ensino. Eu te ajudo a aprender.',
    bio: 'Bruno revolucionou o coaching colaborativo em Portugal. Seus atletas têm voz ativa no planejamento dos treinos.',
  },
  {
    name: 'Greta Nilsson',
    nationality: 'Suécia', city: 'Uppsala', age: 35,
    specialty: 'estratega', coaching_style: 'analitico',
    philosophy: 'O adversário é um quebra-cabeça. Eu ensino a montar.',
    personality: 'Brilhante e observadora',
    personality_traits: ['analitico', 'genio', 'observador', 'ambicioso'],
    training_methods: ['analise_dados', 'video_analise', 'simulacao_partida', 'biofeedback'],
    specializations: ['strategy', 'serve', 'emotional_control'],
    preferred_styles: ['Tático', 'Agressivo'],
    preferred_personalities: ['analitico', 'ambicioso', 'disciplinado', 'genio'],
    experience_years: 11, reputation: 74, tier: 'profissional',
    monthly_cost: 1800, sign_on_bonus: 3200, performance_bonus_pct: 4,
    demands: { min_level: 'Competitivo', min_reputation: 50 },
    achievements: [
      { title: 'Prodígio do Scouting', year: 2024, description: 'Mais jovem a ganhar prêmio de análise' },
    ],
    career_history: [
      { role: 'Scout', entity: 'Circuito Profissional', start_year: 2019, end_year: null, description: 'Especialista em análise de adversários' },
    ],
    track_record: { athletes_coached: 18, titles_won: 5, top_ranking_achieved: 5, grand_slams: 1 },
    training_bonus: { strategy: 2, serve: 2, emotional_control: 1 },
    signature_quote: 'Conheça seu inimigo melhor que a si mesmo.',
    bio: 'A mais jovem estrategista do circuito, Greta é obcecada por scouting. Ela conhece cada padrão de jogo dos top 100 atletas do mundo.',
  },
  {
    name: 'Ricardo "Rico" Alves',
    nationality: 'Brasil', city: 'Curitiba', age: 51,
    specialty: 'motivacional', coaching_style: 'tradicional',
    philosophy: 'Família primeiro. O padel vem depois.',
    personality: 'Pai e protetor',
    personality_traits: ['empatico', 'paciente', 'lider', 'humilde'],
    training_methods: ['sparring_dinamico', 'simulacao_partida', 'visualizacao', 'repeticao_tecnica'],
    specializations: ['emotional_control', 'defense', 'strategy'],
    preferred_styles: ['Defensivo', 'Equilibrado'],
    preferred_personalities: ['humilde', 'resiliente', 'paciente', 'trabalhador'],
    experience_years: 28, reputation: 83, tier: 'elite',
    monthly_cost: 2300, sign_on_bonus: 4500, performance_bonus_pct: 3,
    demands: { min_level: 'Amador' },
    achievements: [
      { title: 'Coach Pai do Ano', year: 2022, description: 'Prêmio de melhor relação humana' },
      { title: 'Formador de Gerações', year: 2024, description: 'Treinou pais e filhos na mesma academia' },
    ],
    career_history: [
      { role: 'Treinador', entity: 'Academia Família Padel', start_year: 2000, end_year: null, description: 'Academia focada em valores' },
    ],
    track_record: { athletes_coached: 65, titles_won: 14, top_ranking_achieved: 4, grand_slams: 3 },
    training_bonus: { emotional_control: 2, defense: 2, strategy: 2 },
    signature_quote: 'Antes de ser campeão, seja pessoa. O resto vem.',
    bio: 'Rico é conhecido por tratar atletas como família. Sua academia em Curitiba formou gerações de jogadores que valorizam o caráter acima de tudo.',
  },
  {
    name: 'Ana Beltrán',
    nationality: 'Espanha', city: 'Bilbao', age: 44,
    specialty: 'fisico', coaching_style: 'analitico',
    philosophy: 'Lesão é falha de planejamento. Eu não falho.',
    personality: 'Cuidadosa e metódica',
    personality_traits: ['analitico', 'cuidadoso', 'disciplinado', 'paciente'],
    training_methods: ['biofeedback', 'periodizacao', 'condicionamento_fisico', 'analise_dados'],
    specializations: ['agility', 'defense', 'emotional_control'],
    preferred_styles: ['Defensivo', 'Equilibrado'],
    preferred_personalities: ['disciplinado', 'paciente', 'analitico', 'cuidadoso'],
    experience_years: 21, reputation: 81, tier: 'elite',
    monthly_cost: 2400, sign_on_bonus: 4800, performance_bonus_pct: 3,
    demands: { min_level: 'Competitivo' },
    achievements: [
      { title: 'Zero Lesões', year: 2023, description: 'Atletas seus tiveram 0% de lesão na temporada' },
      { title: 'Fisioterapeuta do Ano', year: 2022, description: 'Prêmio de prevenção' },
    ],
    career_history: [
      { role: 'Fisioterapeuta', entity: 'Clube Basco', start_year: 2008, end_year: null, description: 'Pioneira em prevenção de lesões' },
    ],
    track_record: { athletes_coached: 34, titles_won: 9, top_ranking_achieved: 5, grand_slams: 2 },
    training_bonus: { agility: 2, defense: 2, emotional_control: 1 },
    signature_quote: 'A melhor lesão é a que nunca acontece.',
    bio: 'Fisioterapeuta de formação, Ana é obsessiva por prevenção. Seus atletas têm a menor taxa de lesão do circuito profissional.',
  },
  {
    name: 'Sébastien Moreau',
    nationality: 'França', city: 'Paris', age: 47,
    specialty: 'tecnico', coaching_style: 'inovador',
    philosophy: 'Elegância é eficiência. Cada movimento é poesia.',
    personality: 'Refinado e esteta',
    personality_traits: ['elegante', 'perfeccionista', 'inovador', 'criativo'],
    training_methods: ['video_analise', 'repeticao_tecnica', 'visualizacao', 'biofeedback'],
    specializations: ['bandeja', 'volley', 'backhand'],
    preferred_styles: ['Tático', 'Equilibrado'],
    preferred_personalities: ['elegante', 'criativo', 'perfeccionista', 'analitico'],
    experience_years: 22, reputation: 82, tier: 'elite',
    monthly_cost: 2500, sign_on_bonus: 5000, performance_bonus_pct: 3,
    demands: { min_level: 'Competitivo', min_reputation: 55 },
    achievements: [
      { title: 'Técnico mais Elegante', year: 2023, description: 'Prêmio de estilo e eficiência' },
      { title: 'Método Français', year: 2024, description: 'Sistema de técnica refinada aclamado' },
    ],
    career_history: [
      { role: 'Diretor Técnico', entity: 'Académie Padel Paris', start_year: 2010, end_year: null, description: 'Referência francesa' },
    ],
    track_record: { athletes_coached: 37, titles_won: 11, top_ranking_achieved: 3, grand_slams: 3 },
    training_bonus: { bandeja: 3, volley: 2, backhand: 1 },
    signature_quote: 'A beleza do gesto é a eficiência do resultado.',
    bio: 'Sébastien trouxe o conceito de "belo gesto" do tênis para o padel. Seus atletas são reconhecidos pela elegância técnica incomparável.',
  },
  {
    name: 'Felipe "Lipe" Costa',
    nationality: 'Brasil', city: 'Recife', age: 34,
    specialty: 'motivacional', coaching_style: 'inspirador',
    philosophy: 'O nordeste é berço de guerreiros. Eu provoco a guerra.',
    personality: 'Pasional e guerreiro',
    personality_traits: ['apaixonado', 'energetico', 'lider', 'corajoso'],
    training_methods: ['sparring_dinamico', 'simulacao_partida', 'condicionamento_fisico', 'visualizacao'],
    specializations: ['forehand', 'smash', 'emotional_control'],
    preferred_styles: ['Agressivo', 'Potência'],
    preferred_personalities: ['apaixonado', 'energetico', 'corajoso', 'ambicioso'],
    experience_years: 12, reputation: 73, tier: 'profissional',
    monthly_cost: 1500, sign_on_bonus: 2500, performance_bonus_pct: 4,
    demands: { min_level: 'Amador' },
    achievements: [
      { title: 'Revelação Nordestina', year: 2023, description: 'Mais jovem treinador a formar um top 10' },
    ],
    career_history: [
      { role: 'Treinador', entity: 'Academia Recife Padel', start_year: 2016, end_year: null, description: 'Formou atletas do nordeste brasileiro' },
    ],
    track_record: { athletes_coached: 20, titles_won: 5, top_ranking_achieved: 7, grand_slams: 0 },
    training_bonus: { forehand: 2, smash: 2, emotional_control: 1 },
    signature_quote: 'O calor do nordeste está em cada golpe. Sinta a brasa.',
    bio: 'Lipe é a nova geração de treinadores brasileiros. Formado no calor do nordeste, seus atletas jogam com paixão e intensidade características da região.',
  },
];

// ─── Coach Engine: Affinity & Bonuses ────────────────────────────────────────

export function calculateAffinity(coach, profile, athletePersonality) {
  if (!coach || !profile) return 50;

  let score = 50;

  // Play style match
  const styleMatch = (coach.preferred_styles || []).includes(profile.play_style);
  if (styleMatch) score += 20;
  else if ((coach.preferred_styles || []).length === 0) score += 5;
  else score -= 5;

  // Personality match (if athlete personality known)
  if (athletePersonality && (coach.preferred_personalities || []).includes(athletePersonality)) {
    score += 15;
  }

  // Player level vs coach demands
  const playerLevel = profile.level || 'Iniciante';
  const levels = ['Iniciante', 'Amador', 'Competitivo', 'Avançado', 'Elite', 'Lenda'];
  const playerLevelIdx = levels.indexOf(playerLevel);
  const minLevelIdx = levels.indexOf(coach.demands?.min_level || 'Iniciante');
  if (playerLevelIdx >= minLevelIdx) {
    score += 10;
  } else {
    score -= 20; // Coach demands higher level
  }

  // Reputation match
  const playerRep = (profile.xp || 0) / 500; // approximate reputation
  const minRep = coach.demands?.min_reputation || 0;
  if (playerRep >= minRep) score += 5;
  else score -= 10;

  return Math.max(0, Math.min(100, score));
}

export function getAffinityLabel(score) {
  if (score >= 80) return { label: 'Excelente', color: 'text-green-400', bg: 'bg-green-500/15' };
  if (score >= 65) return { label: 'Boa', color: 'text-primary', bg: 'bg-primary/15' };
  if (score >= 50) return { label: 'Razoável', color: 'text-amber-400', bg: 'bg-amber-500/15' };
  if (score >= 35) return { label: 'Baixa', color: 'text-orange-400', bg: 'bg-orange-500/15' };
  return { label: 'Péssima', color: 'text-red-400', bg: 'bg-red-500/15' };
}

export function getTrainingBonusForAttribute(coach, attributeKey) {
  if (!coach || !coach.training_bonus) return 0;
  return coach.training_bonus[attributeKey] || 0;
}

export function getCoachSpecializationMatch(coach, profile) {
  if (!coach || !profile) return 0;
  const specs = coach.specializations || [];
  if (specs.length === 0) return 0;
  // Count how many of the coach's specializations are the player's top attributes
  const topAttrs = ATTRIBUTES
    .map(a => ({ key: a.key, value: profile[a.key] || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)
    .map(a => a.key);
  const matches = specs.filter(s => topAttrs.includes(s)).length;
  return matches;
}

export function canHireCoach(coach, profile) {
  if (!coach || !profile) return { allowed: false, reason: 'Dados insuficientes' };

  const levels = ['Iniciante', 'Amador', 'Competitivo', 'Avançado', 'Elite', 'Lenda'];
  const playerLevelIdx = levels.indexOf(profile.level || 'Iniciante');
  const minLevelIdx = levels.indexOf(coach.demands?.min_level || 'Iniciante');

  if (playerLevelIdx < minLevelIdx) {
    return { allowed: false, reason: `Exige nível ${coach.demands.min_level}` };
  }

  const coins = profile.coins || 0;
  const totalCost = (coach.monthly_cost || 0) + (coach.sign_on_bonus || 0);
  if (coins < totalCost) {
    return { allowed: false, reason: `Precisa de ${totalCost} moedas (mensal + bônus)` };
  }

  return { allowed: true };
}

export function getCoachEffects(coach, profile) {
  if (!coach) return null;

  const affinity = calculateAffinity(coach, profile);
  const affinityLabel = getAffinityLabel(affinity);
  const specMatch = getCoachSpecializationMatch(coach, profile);

  // Training gain boost based on affinity
  const trainingBoost = Math.round((affinity - 50) / 10); // -5 to +5
  // Energy recovery bonus from physical coaches
  const energyBonus = coach.specialty === 'fisico' ? Math.round(affinity / 20) : 0;
  // Morale bonus from motivational coaches
  const moraleBonus = coach.specialty === 'motivacional' ? Math.round(affinity / 15) : 0;
  // Injury reduction from physical coaches with high affinity
  const injuryReduction = coach.specialty === 'fisico' && affinity > 60 ? Math.round((affinity - 60) / 10) : 0;
  // Strategy bonus
  const strategyBonus = coach.specialty === 'estratega' ? Math.round(affinity / 25) : 0;

  return {
    affinity,
    affinityLabel,
    specMatch,
    trainingBoost,
    energyBonus,
    moraleBonus,
    injuryReduction,
    strategyBonus,
    totalBonus: trainingBoost + energyBonus + moraleBonus + strategyBonus,
  };
}