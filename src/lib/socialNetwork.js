import { localGame } from '@/api/localGameClient.js';

// ─── Author Types ────────────────────────────────────────────────────────────

export const AUTHOR_TYPES = {
  jogador: { label: 'Você', emoji: '⭐', color: 'text-primary', bg: 'bg-primary/15' },
  atleta: { label: 'Atleta', emoji: '🎾', color: 'text-cyan-400', bg: 'bg-cyan-500/15' },
  clube: { label: 'Clube', emoji: '🏟️', color: 'text-blue-400', bg: 'bg-blue-500/15' },
  patrocinador: { label: 'Patrocinador', emoji: '💰', color: 'text-yellow-400', bg: 'bg-yellow-500/15' },
  treinador: { label: 'Treinador', emoji: '🎓', color: 'text-purple-400', bg: 'bg-purple-500/15' },
  torcedor: { label: 'Torcedor', emoji: '📣', color: 'text-orange-400', bg: 'bg-orange-500/15' },
};

// ─── Bot Authors ─────────────────────────────────────────────────────────────
// Named entities that auto-post in the social network.

export const BOT_AUTHORS = {
  atleta: [
    { name: 'Ale Galán', handle: 'alegalan', verified: true },
    { name: 'Juan Lebrón', handle: 'juanlebron', verified: true },
    { name: 'Paquito Navarro', handle: 'paquito', verified: true },
    { name: 'Fernando Belasteguín', handle: 'belasteguín', verified: true },
    { name: 'Arturo Coello', handle: 'arturocoello', verified: true },
    { name: 'Agustín Tapia', handle: 'agustintapia', verified: true },
    { name: 'Gemma Triay', handle: 'gemma_triay', verified: true },
    { name: 'Ariana Sánchez', handle: 'arianasanchez', verified: true },
    { name: 'Bea González', handle: 'beagonzalez', verified: true },
    { name: 'Marta Ortega', handle: 'martortega', verified: true },
  ],
  clube: [
    { name: 'Real Padel Club', handle: 'realpadelclub', verified: true },
    { name: 'Club de Padel Madrid', handle: 'cpmadrid', verified: true },
    { name: 'Padel Center BCN', handle: 'padelbcn', verified: true },
    { name: 'Las Rozas Padel', handle: 'lasrozaspadel', verified: false },
    { name: 'Centro Padel Lisboa', handle: 'cpmlisboa', verified: false },
  ],
  patrocinador: [
    { name: 'Bullpadel', handle: 'bullpadel', verified: true },
    { name: 'Head Padel', handle: 'headpadel', verified: true },
    { name: 'Nox Padel', handle: 'noxpadel', verified: true },
    { name: 'Babolat', handle: 'babolatpadel', verified: true },
    { name: 'Adidas Padel', handle: 'adidaspadel', verified: true },
    { name: 'Siux', handle: 'siuxpadel', verified: false },
  ],
  treinador: [
    { name: 'Mariano Amat', handle: 'marianoamat', verified: true },
    { name: 'Nito Brea', handle: 'nitobrea', verified: true },
    { name: 'Mauri Andrini', handle: 'mauriandrini', verified: true },
    { name: 'Gustavo Pratto', handle: 'gustavopratto', verified: false },
  ],
  torcedor: [
    { name: 'PadelFan_BR', handle: 'padelfanbr', verified: false },
    { name: 'ToroPadel', handle: 'toropadel', verified: false },
    { name: 'QuadraVibes', handle: 'quadravibes', verified: false },
    { name: 'Sofia_Padel', handle: 'sofiapadel', verified: false },
    { name: 'ElJuezPadel', handle: 'eljuez', verified: false },
    { name: 'MariaSmash', handle: 'mariasmash', verified: false },
    { name: 'Vibora_King', handle: 'viboraking', verified: false },
    { name: 'PadelLover_PT', handle: 'padelloverpt', verified: false },
    { name: 'ChiquiBola', handle: 'chiquibola', verified: false },
    { name: 'GolpePerfecto', handle: 'golpeperfecto', verified: false },
  ],
};

// ─── Post Templates ─────────────────────────────────────────────────────────

export const POST_TEMPLATES = {
  atleta: [
    { content: 'Treino intenso hoje! Preparando para os próximos desafios. 💪 #PadelLife', type: 'geral', trend: '#PadelLife' },
    { content: 'Que partida incrível! Obrigado a todos pelo apoio. Vamos seguir! 🎾🔥', type: 'resultado', trend: null },
    { content: 'Trabalho duro sempre recompensa. Não existe atalho para o sucesso. 🎯', type: 'motivacional', trend: '#Mentalidade' },
    { content: 'Adoro jogar neste clube! A energia da torcida é sensacional. 🏟️', type: 'geral', trend: null },
    { content: 'Derrota de hoje dói, mas vamos aprender e voltar mais fortes. 📈', type: 'geral', trend: null },
    { content: 'Nova raquete, mesma paixão. Pronto para a temporada! 🎾', type: 'geral', trend: '#Gear' },
    { content: 'Obrigado ao meu parceiro pela parceria de quadra. Juntos somos mais fortes! 🤝', type: 'elogio', trend: null },
    { content: 'Não consigo dormir pensando na partida de amanhã. Vai ser épico! 🔥', type: 'geral', trend: null },
    { content: 'Hoje foi dia de descanso ativo. Recuperar é tão importante quanto treinar. 🧘', type: 'geral', trend: '#Recovery' },
    { content: 'Vitória é consequência de processo. Confiamos no que fazemos. ⭐', type: 'conquista', trend: null },
  ],
  clube: [
    { content: '🎉 Inscrições abertas para o torneio mensal! Vagas limitadas. Venha participar!', type: 'torneio', trend: '#Tournament' },
    { content: 'Nossas quadras estão com visual impecável hoje. Venham treinar! 🏟️🎾', type: 'geral', trend: null },
    { content: 'Orgulho dos nossos atletas que representam o clube nos circuitos! 💪', type: 'elogio', trend: null },
    { content: '📢 Promoção: mensalidade com 20% de desconto para novos associados este mês!', type: 'geral', trend: '#Promo' },
    { content: 'Clínica técnica neste sábado com nosso head coach. Não percam! 🎓', type: 'geral', trend: null },
    { content: 'Nosso bar está com promoção especial após as partidas. Venham comemorar! 🍻', type: 'geral', trend: null },
    { content: 'Inauguração da nova quadra coberta no próximo fim de semana! 🏗️🎾', type: 'geral', trend: '#Inauguração' },
    { content: 'Parabéns aos campeões do torneio interno deste mês! 🏆', type: 'conquista', trend: null },
  ],
  patrocinador: [
    { content: 'Apresentando a nova linha de raquetes 2026! Tecnologia de ponta para seu melhor jogo. 🎾', type: 'geral', trend: '#Gear' },
    { content: 'Orgulho em patrocinar os melhores atletas do circuito. Juntos somos mais fortes! 💪', type: 'elogio', trend: null },
    { content: '🔥 Promoção relâmpago: 30% OFF em toda a linha profissional por 48h! Não perca!', type: 'geral', trend: '#Promo' },
    { content: 'A revolução do padel começa aqui. Em breve novidades que vão mudar o jogo. ⚡', type: 'geral', trend: '#Innovation' },
    { content: 'Parceria de sucesso! Estamos com vocês em cada partida. 🤝🎾', type: 'geral', trend: null },
    { content: 'Concurso cultural: poste sua melhor jogada com #MeuPadel e concorra a prêmios! 🎁', type: 'geral', trend: '#MeuPadel' },
  ],
  treinador: [
    { content: 'A diferença entre bom e excelente está nos detalhes. Foque no básico. 🎯', type: 'motivacional', trend: '#Mentalidade' },
    { content: 'Hoje trabalhamos a bandeja e vibora. Fundamental para subir de nível. 🎾', type: 'geral', trend: '#Training' },
    { content: 'Não existe talento sem disciplina. O trabalho duro supera o talento que não trabalha. 💪', type: 'motivacional', trend: '#Mentalidade' },
    { content: 'Análise de vídeo da partida de hoje: os erros não forçados custaram caro. 📊', type: 'geral', trend: null },
    { content: 'A mentalidade vencedora se constrói nos treinos, não apenas nas partidas. 🧠', type: 'motivacional', trend: '#Mentalidade' },
    { content: 'Parabéns ao meu atleta pela vitória! O processo está funcionando. 🏆', type: 'elogio', trend: null },
  ],
  torcedor: [
    { content: 'Alguém viu aquela jogada?! INACREDITÁVEL! 🔥🔥🔥 #PadelInsano', type: 'geral', trend: '#PadelInsano' },
    { content: 'Esse jogador tá jogando muito! Que生活水平 de padel 🎾👏', type: 'elogio', trend: null },
    { content: 'Não entendo a estratégia de hoje... tá faltando agressividade na rede 🤔', type: 'critica', trend: null },
    { content: 'QUE PARTIDA! Padel está em outro nível hoje 🔥🔥 #EpicMatch', type: 'geral', trend: '#EpicMatch' },
    { content: 'Essa dupla tem tudo pra ser campeã esse ano! Apoio total! 💪🏆', type: 'elogio', trend: null },
    { content: 'Exageraram nas comemorações hoje... humildade sempre é melhor 🙄', type: 'critica', trend: null },
    { content: 'Que racha esse torneio tá! Nível altíssimo em todas as partidas 🎾🔥', type: 'geral', trend: null },
    { content: 'Vi essa jogada e fiquei de boca aberta. PADEL É ARTE! 🎨🎾', type: 'elogio', trend: '#PadelArt' },
    { content: 'Rumor: ouvi que tem troca de dupla vindo aí... aguardem 👀', type: 'rumor', trend: '#Rumor' },
    { content: 'Previsão: esse cara vai longe. Talento puro! ⭐', type: 'geral', trend: null },
    { content: 'Tá jogando bem demais! Já virei fã 🙌🎾', type: 'elogio', trend: null },
    { content: 'Esse smash foi absurdo! Relembrem aquele ponto 🔥', type: 'geral', trend: '#PadelInsano' },
    { content: 'Acho que tá na hora de trocar de parceiro... rendeu abaixo do esperado 📉', type: 'critica', trend: null },
    { content: 'MELHOR PARTIDA DO ANO! Que espetáculo! 👏👏👏 #EpicMatch', type: 'geral', trend: '#EpicMatch' },
  ],
};

// ─── Trends ──────────────────────────────────────────────────────────────────

export const TRENDING_TOPICS = [
  { tag: '#PadelMania', posts: 1240, category: 'Geral' },
  { tag: '#EpicMatch', posts: 856, category: 'Partidas' },
  { tag: '#PadelInsano', posts: 742, category: 'Jogadas' },
  { tag: '#TrioDeOuro', posts: 631, category: 'Duplas' },
  { tag: '#PadelLife', posts: 523, category: 'Lifestyle' },
  { tag: '#Mentalidade', posts: 412, category: 'Motivacional' },
  { tag: '#Gear', posts: 389, category: 'Equipamentos' },
  { tag: '#Tournament', posts: 345, category: 'Torneios' },
  { tag: '#Rumor', posts: 298, category: 'Fofocas' },
  { tag: '#PadelArt', posts: 267, category: 'Jogadas' },
  { tag: '#Recovery', posts: 198, category: 'Saúde' },
  { tag: '#Promo', posts: 156, category: 'Ofertas' },
];

// ─── Viral Mechanics ─────────────────────────────────────────────────────────

export const VIRAL_THRESHOLD = 50;
export const MEGA_VIRAL_THRESHOLD = 150;

export function getViralStatus(post) {
  const likes = post.likes || 0;
  if (likes >= MEGA_VIRAL_THRESHOLD) return 'mega';
  if (likes >= VIRAL_THRESHOLD) return 'viral';
  return null;
}

export function calculateFollowerGain(post, profile) {
  const viral = getViralStatus(post);
  if (!viral) return 0;
  const base = viral === 'mega' ? 50 : 15;
  const fanMultiplier = (profile?.fan_appeal || 50) / 50;
  return Math.round(base * fanMultiplier);
}

// ─── Auto-Post Generation ────────────────────────────────────────────────────

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateAutoPost(profile) {
  const types = Object.keys(BOT_AUTHORS);
  const authorType = pickRandom(types);
  const author = pickRandom(BOT_AUTHORS[authorType]);
  const template = pickRandom(POST_TEMPLATES[authorType]);
  const baseLikes = Math.floor(Math.random() * 80) + 5;

  return {
    author_name: author.name,
    author_handle: author.handle,
    author_verified: author.verified,
    author_type: authorType,
    content: template.content,
    post_type: template.type,
    trend_tag: template.trend || null,
    likes: baseLikes,
    liked_by: [],
    shares: Math.floor(baseLikes / 3),
    comments: [],
    is_viral: baseLikes >= VIRAL_THRESHOLD,
    follower_gain: 0,
    career_date: profile?.career_date || '2026-01-01',
  };
}

export function generateBatchAutoPosts(profile, count = 8) {
  return Array.from({ length: count }, () => generateAutoPost(profile));
}

// ─── Comment Templates ───────────────────────────────────────────────────────

export const COMMENT_TEMPLATES = {
  positivo: [
    'Concordo totalmente! 🔥',
    'Que jogador incrível!',
    'Apoiando sempre! 💪',
    'Isso aí! continue assim',
    'Que nível de jogo! 👏',
    'Você é inspiração!',
    'Merecido! 🎾',
  ],
  neutro: [
    'Vamos ver nos próximos jogos...',
    'Interessante essa análise',
    'Pode ser...',
    'Acompanhando de perto',
    'Boa observação',
  ],
  critico: [
    'Acho que exagerou aí...',
    'Faltou humildade hoje',
    'Não concordo com essa postura',
    'Esperava mais, sinceramente',
    'Precisa melhorar muito ainda',
    'Muita gabação pra pouco resultado',
  ],
};

export function generateAutoComment(profile) {
  const tone = pickRandom(['positivo', 'positivo', 'positivo', 'neutro', 'critico']);
  const templates = COMMENT_TEMPLATES[tone];
  const authors = BOT_AUTHORS.torcedor;
  const author = pickRandom(authors);
  return {
    author_name: author.name,
    author_handle: author.handle,
    author_type: 'torcedor',
    content: pickRandom(templates),
    created_date: new Date().toISOString(),
    likes: Math.floor(Math.random() * 15),
  };
}