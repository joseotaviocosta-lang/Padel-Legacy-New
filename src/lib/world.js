import { localGame } from '@/api/localGameClient.js';

// ── Name pools ────────────────────────────────────────────────────────────

const PRO_NAMES = [
  'Arturo Coello', 'Agustín Tapia', 'Alejandro Galán', 'Juan Lebrón',
  'Franco Stupaczuk', 'Martín Di Nenno', 'Federico Chingotto', 'Paquito Navarro',
  'Pablo Cardona', 'Álex Arroyo', 'Javi Garrido', 'Javi Ruiz',
  'Momo González', 'Juan Tello', 'Álex Ruiz', 'Coki Nieto',
  'Mike Yanguas', 'Tino Libaak', 'Lucho Capra', 'Gonzalo Rubio',
  'Fernando Belasteguín', 'Sanyo Gutiérrez', 'Juani Mieres', 'Pablo Lima',
];

const COACH_NAMES = [
  'Mauricio Andrada', 'Nito Drovetti', 'Javier Mañé', 'Sebastián Nerone',
  'Godo Díaz', 'Ramiro Choya', 'Maxi Sánchez', 'Capel',
];

const YOUNG_NAMES = [
  'Diego Vázquez', 'Mateo Romero', 'Lucas Fariña', 'Bruno Soto', 'Rafael Ferraz',
  'Nicolás Bravo', 'Thiago Mendes', 'Pablo Crespo', 'Joaquín Vega', 'Tomás Reyes',
];

const TOURNAMENT_NAMES = [
  'Premier Pádel Major', 'WPT Open', 'Cervezas Victoria Open', 'Ski Open',
  'Argentina Open', 'Sweden Padel Open', 'Paris Major', 'Doha Major',
  'Miami Open', 'Brasil Open', 'Italian Open', 'Vienna Open',
  'Acapulco Open', 'Copenhagen Open', 'Rotterdam Open', 'Reus Open',
];

const LOCATIONS = [
  'Madrid', 'Barcelona', 'Buenos Aires', 'Estocolmo', 'Roma', 'Paris',
  'Doha', 'Miami', 'São Paulo', 'Lisboa', 'Dubai', 'Cancún',
];

const INJURIES = [
  'lesão no cotovelo', 'fisura no pulso', 'estiramento na panturrilha',
  'inflamação no ombro', 'torção no tornozelo', 'tendinite no braço',
  'lesão abdominal', 'fratura por estresse no pé',
];

const SCANDALS = [
  'discussão acalorada com o árbitro durante partida ao vivo',
  'crítica pública ao regulamento do circuito em entrevista polêmica',
  'vazamento de mensagens polêmicas em grupo de jogadores',
  'ausência não justificada em evento obrigatório de patrocinador',
  'confronto verbal com rival nas redes sociais após derrota',
  'uso de equipamento não homologado em partida oficial',
];

const QUOTES = [
  'Estou no melhor momento da minha carreira, me sinto imbatível',
  'Vamos com tudo pelo título, não importa o adversário',
  'A preparação foi perfeita e a sintonia com meu parceiro é total',
  'Cada partida é uma nova batalha, respeito todos os adversários',
  'O público foi incrível hoje, me empurrou a dar o máximo',
  'Venho treinando há meses para este momento específico',
  'A derrota na última partida me fortaleceu, volto mais focado',
  'O circuito está cada vez mais competitivo, é preciso evoluir sempre',
];

// ── Helpers ────────────────────────────────────────────────────────────────

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickTwo(arr) {
  const i = Math.floor(Math.random() * arr.length);
  let j = Math.floor(Math.random() * arr.length);
  while (j === i) j = Math.floor(Math.random() * arr.length);
  return [arr[i], arr[j]];
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ── Event type metadata ──────────────────────────────────────────────────

export const EVENT_TYPE_META = {
  noticia:       { icon: 'Newspaper',     label: 'Notícia',         color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
  entrevista:    { icon: 'Mic',           label: 'Entrevista',      color: 'text-purple-400', bg: 'bg-purple-500/10' },
  rivalidade:    { icon: 'Swords',        label: 'Rivalidade',      color: 'text-red-400',    bg: 'bg-red-500/10' },
  social:        { icon: 'Share2',        label: 'Redes Sociais',   color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  rumor:         { icon: 'HelpCircle',    label: 'Rumor',           color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  transferencia: { icon: 'ArrowRightLeft',label: 'Transferência',   color: 'text-green-400',  bg: 'bg-green-500/10' },
  aposentadoria: { icon: 'Clock',         label: 'Aposentadoria',   color: 'text-slate-400',  bg: 'bg-slate-500/10' },
  promessa:      { icon: 'Sparkles',      label: 'Jovem Promessa',  color: 'text-green-400',  bg: 'bg-green-500/10' },
  lesao:         { icon: 'Activity',      label: 'Lesão',           color: 'text-red-400',    bg: 'bg-red-500/10' },
  escandalo:     { icon: 'AlertTriangle', label: 'Escândalo',      color: 'text-orange-400', bg: 'bg-orange-500/10' },
  ranking:       { icon: 'TrendingUp',    label: 'Ranking',         color: 'text-primary',    bg: 'bg-primary/10' },
  historico:     { icon: 'BookOpen',      label: 'Histórico',       color: 'text-amber-400',  bg: 'bg-amber-500/10' },
};

export const EVENT_TYPES = Object.keys(EVENT_TYPE_META);

// ── Templates ──────────────────────────────────────────────────────────────

function buildTemplate() {
  return {
    noticia: () => {
      const p = pick(PRO_NAMES);
      const t = pick(TOURNAMENT_NAMES);
      const loc = pick(LOCATIONS);
      return {
        title: `${p} ${pick(['domina a quadra e avança no', 'surpreende e elimina favorito no', 'garante vaga nas semifinais do', 'arrasa na estreia do'])} ${t}`,
        content: `Em exibição impecável em ${loc}, ${p} mostrou um nível impressionante de padel. Com golpes precisos e movimentação perfeita, o jogador demonstrou estar em grande forma. O público presente lotou as arquibancadas e aplaudiu cada ponto conquistado.`,
        tier: pick(['destaque', 'normal']),
        players: [p],
      };
    },
    entrevista: () => {
      const p = pick(PRO_NAMES);
      const q = pick(QUOTES);
      return {
        title: `Entrevista exclusiva com ${p}`,
        content: `"${q}" — declarou o jogador em entrevista concedida após o treino. ${p} também falou sobre os próximos desafios no circuito e agradeceu o apoio dos fãs: "A torcida é minha motivação maior, quero retribuir com vitórias."`,
        tier: 'normal',
        players: [p],
      };
    },
    rivalidade: () => {
      const [a, b] = pickTwo(PRO_NAMES);
      const score = `${randInt(2, 6)}-${randInt(2, 6)}`;
      return {
        title: `Rivalidade acirrada: ${a} vs ${b}`,
        content: `A rivalidade entre ${a} e ${b} está cada vez mais intensa. Os dois já se enfrentaram ${randInt(8, 25)} vezes na carreira, com confrontos sempre equilibrados. Na última partida, o placar de ${score} manteve a tradição de jogos disputados ponto a ponto até o fim.`,
        tier: 'destaque',
        players: [a, b],
      };
    },
    social: () => {
      const p = pick(PRO_NAMES);
      const platforms = ['Instagram', 'X (Twitter)', 'TikTok'];
      const likes = randInt(50, 800);
      return {
        title: `${p} viraliza nas redes sociais`,
        content: `${p} publicou um vídeo de treino no ${pick(platforms)} e atingiu ${likes} mil curtidas em poucas horas. Os fãs lotaram os comentários elogiando a técnica e a dedicação do jogador. "Inspirador!", escreveu um seguidor.`,
        tier: 'normal',
        players: [p],
      };
    },
    rumor: () => {
      const [a, b] = pickTwo(PRO_NAMES);
      return {
        title: `Rumor: ${a} pode formar dupla com ${b}`,
        content: `Segundo fontes próximas ao circuito, ${a} estaria negociando uma possível parceria com ${b} para a próxima temporada. Nenhum dos dois comentou oficialmente, mas a especulação gerou grande repercussão entre os fãs e analistas do padel mundial.`,
        tier: 'destaque',
        players: [a, b],
      };
    },
    transferencia: () => {
      const c = pick(COACH_NAMES);
      const p = pick(PRO_NAMES);
      return {
        title: `Treinador ${c} acerta com ${p}`,
        content: `O renomado treinador ${c} foi confirmado como novo membro da equipe técnica de ${p}. A contratação visa levar o jogador ao próximo nível, com foco em ajustes técnicos finos e preparação mental para os grandes torneios do calendário.`,
        tier: 'destaque',
        players: [p],
      };
    },
    aposentadoria: () => {
      const p = pick(PRO_NAMES);
      const age = randInt(36, 42);
      return {
        title: `${p} anuncia aposentadoria do padel profissional`,
        content: `Aos ${age} anos, o lendário ${p} anunciou oficialmente sua aposentadoria do circuito profissional. Com uma carreira repleta de títulos e momentos inesquecíveis, o jogador deixa um legado duradouro no esporte. "Foi uma jornada incrível, agradeço a todos que fizeram parte", afirmou em coletiva emocionada.`,
        tier: 'breaking',
        players: [p],
      };
    },
    promessa: () => {
      const p = pick(YOUNG_NAMES);
      const age = randInt(15, 17);
      return {
        title: `Jovem promessa: ${p}, ${age} anos, impressiona no circuito juvenil`,
        content: `O juvenil ${p}, de apenas ${age} anos, tem chamado a atenção de olheiros e especialistas. Com técnica apurada e maturidade além da idade, o jovem é considerado a maior promessa do padel mundial nos próximos anos. Vários clubes já disputam sua contratação.`,
        tier: 'normal',
        players: [p],
      };
    },
    lesao: () => {
      const p = pick(PRO_NAMES);
      const injury = pick(INJURIES);
      const weeks = randInt(2, 8);
      return {
        title: `${p} sofre ${injury} e fica afastado`,
        content: `O jogador ${p} foi diagnosticado com ${injury} após exames realizados nesta semana. Segundo a equipe médica, o tempo estimado de recuperação é de ${weeks} semanas. O afastamento deve fazê-lo perder os próximos torneios do calendário.`,
        tier: 'breaking',
        players: [p],
      };
    },
    escandalo: () => {
      const p = pick(PRO_NAMES);
      const scandal = pick(SCANDALS);
      return {
        title: `Escândalo envolve ${p} no circuito`,
        content: `${p} está no centro de uma polêmica após ${scandal}. A diretoria do circuito informou que está analisando o caso e que medidas poderão ser tomadas. O jogador ainda não se pronunciou oficialmente sobre o incidente.`,
        tier: 'breaking',
        players: [p],
      };
    },
    ranking: () => {
      const p = pick(PRO_NAMES);
      const points = randInt(8000, 18000);
      const change = pick(['assume a liderança', 'sobe para o Top 3', 'alcança o melhor ranking da carreira', 'recupera a ponta']);
      return {
        title: `${p} ${change} do ranking mundial`,
        content: `Com ${points.toLocaleString('pt-BR')} pontos, ${p} ${change === 'assume a liderança' ? 'é o novo número 1 do mundo' : 'consolida sua posição entre os melhores'}. A conquista reflete o excelente momento do jogador, que acumula resultados consistentes ao longo da temporada.`,
        tier: 'breaking',
        players: [p],
      };
    },
    historico: () => {
      const p = pick(PRO_NAMES);
      const years = randInt(5, 20);
      const t = pick(TOURNAMENT_NAMES);
      return {
        title: `Há ${years} anos, ${p} fazia história no ${t}`,
        content: `Neste dia, há ${years} anos, ${p} conquistava um dos títulos mais memoráveis de sua carreira no ${t}. A partida é lembrada até hoje como uma das maiores exibições individuais já vistas em uma quadra de padel, com jogadas que entraram para a história do esporte.`,
        tier: 'normal',
        players: [p],
      };
    },
  };
}

const TEMPLATES = buildTemplate();

// ── Generation ──────────────────────────────────────────────────────────────

const AMBIENT_WORLD_EVENTS = [
  {
    event_type: 'noticia',
    title: 'Circuito divulga a programação da semana',
    content: 'Organizadores confirmaram a agenda dos próximos eventos. Atletas e equipes já ajustam viagens, treinos e períodos de recuperação.',
    tier: 'normal',
  },
  {
    event_type: 'social',
    title: 'Comunidade do padel debate os próximos torneios',
    content: 'Torcedores analisam as chaves e os possíveis confrontos da semana. A expectativa cresce à medida que as inscrições são confirmadas.',
    tier: 'normal',
  },
  {
    event_type: 'noticia',
    title: 'Academias intensificam a preparação para a temporada',
    content: 'Centros de treinamento aumentaram a carga técnica e física de seus atletas, com atenção especial à recuperação entre torneios.',
    tier: 'normal',
  },
];

export function generateEventObject(date) {
  // Eventos aleatórios servem apenas como ambientação. Lesões, resultados,
  // aposentadorias, transferências e mudanças de ranking devem ser publicadas
  // exclusivamente pelos sistemas que realmente processaram esses fatos.
  const template = pick(AMBIENT_WORLD_EVENTS);
  return {
    ...template,
    author_name: 'Redação Mundo do Padel',
    related_players: [],
    event_date: date,
    likes: randInt(25, 450),
    tags: [template.event_type, 'ambientacao'],
    source_event_id: `ambient:${date}:${Math.random().toString(36).slice(2, 8)}`,
  };
}

export async function generateWorldEvents(date, count = 3) {
  const events = [];
  for (let i = 0; i < count; i++) {
    events.push(generateEventObject(date));
  }
  if (events.length === 0) return [];
  return await localGame.entities.WorldEvent.bulkCreate(events);
}

export async function ensureWorldEvents(date, minCount = 15) {
  try {
    const existing = await localGame.entities.WorldEvent.filter({ event_date: date }, '-likes', 50);
    if (existing && existing.length >= minCount) return existing;

    const toGenerate = Math.max(1, minCount - (existing?.length || 0));
    await generateWorldEvents(date, toGenerate);
    return await localGame.entities.WorldEvent.filter({ event_date: date }, '-likes', 50);
  } catch (e) {
    console.error('ensureWorldEvents', e);
    return [];
  }
}

export async function getRecentWorldEvents(limit = 30) {
  try {
    return await localGame.entities.WorldEvent.list('-created_date', limit);
  } catch (e) {
    console.error('getRecentWorldEvents', e);
    return [];
  }
}