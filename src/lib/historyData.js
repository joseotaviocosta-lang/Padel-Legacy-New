export const HISTORY_ENTRIES = [
  // ─── FUNDAÇÃO (1960s) ──────────────────────────────────────────
  {
    title: 'Nascimento do Padel',
    description: 'Enrique Corcuera adapta uma quadra de tênis em sua casa em Acapulco, México, criando o que seria o primeiro campo de padel. As paredes laterais eram usadas para rebater a bola, dando origem a um esporte completamente novo que misturava tênis e squash.',
    category: 'fundacao', year: 1962, decade: 1960, icon: 'Sparkles', importance: 'lendario',
    tags: ['mexico', 'acapulco', 'origem'], related_entries: ['Expansão para a Espanha', 'Primeira Quadra Oficial'],
  },
  {
    title: 'Primeira Quadra Oficial',
    description: 'Corcuera formaliza as dimensões da quadra de padel (20m x 10m) e estabelece as primeiras regras básicas do esporte. A estrutura de vidro e arame seria refinada nas décadas seguintes.',
    category: 'fundacao', year: 1965, decade: 1960, icon: 'LayoutGrid', importance: 'epico',
    tags: ['regras', 'quadra', 'mexico'], related_entries: ['Nascimento do Padel'],
  },
  {
    title: 'Expansão para a Espanha',
    description: 'Alfonso de Hohenlohe traz o padel da Espanha após visitar Acapulco. Ele constrói as duas primeiras quadras no Marbella Club, iniciando a expansão europeia do esporte que o tornaria global.',
    category: 'fundacao', year: 1968, decade: 1960, icon: 'Plane', importance: 'lendario',
    tags: ['espanha', 'marbella', 'expansao'], related_entries: ['Nascimento do Padel', 'Clube de Puerta de Hierro'],
  },

  // ─── DÉCADA DE 1970 ─────────────────────────────────────────────
  {
    title: 'Clube de Puerta de Hierro',
    description: 'O Real Club de Puerta de Hierro em Madrid se torna o primeiro clube a adotar o padel formalmente na Europa. O clube seria o berço dos primeiros campeões espanhóis e palco das primeiras competições.',
    category: 'clube_lendario', year: 1970, decade: 1970, icon: 'Building2', importance: 'lendario',
    tags: ['madrid', 'espanha', 'clube'], related_entries: ['Expansão para a Espanha', 'Primeiro Torneio Oficial'],
  },
  {
    title: 'Primeiro Torneio Oficial',
    description: 'O primeiro torneio de padel é realizado em Madri, com apenas 8 duplas participantes. O formato eliminatório simples se tornaria o padrão do esporte por décadas.',
    category: 'torneio_historico', year: 1974, decade: 1970, icon: 'Trophy', importance: 'epico',
    tags: ['torneio', 'madrid', 'primeiro'], related_entries: ['Clube de Puerta de Hierro'],
  },
  {
    title: 'Chegada à Argentina',
    description: 'O padel cruza o Atlântico e chega à Argentina, onde encontraria seu segundo grande lar. O esporte se espalha rapidamente pelos clubes de Buenos Aires e Córdoba.',
    category: 'decada', year: 1975, decade: 1970, icon: 'Plane', importance: 'destaque',
    tags: ['argentina', 'buenos-aires', 'expansao'], related_entries: ['Expansão para a Espanha', 'Boom Argentino'],
  },

  // ─── DÉCADA DE 1980 ─────────────────────────────────────────────
  {
    title: 'Boom Argentino',
    description: 'O padel explode na Argentina, tornando-se o esporte de crescimento mais rápido do país. Mais de 500 quadras são construídas em Buenos Aires em apenas três anos. O esporte passa a ser parte da cultura argentina.',
    category: 'decada', year: 1982, decade: 1980, icon: 'TrendingUp', importance: 'lendario',
    tags: ['argentina', 'boom', 'crescimento'], related_entries: ['Chegada à Argentina', 'Primeira Federação Argentina'],
  },
  {
    title: 'Primeira Federação Argentina',
    description: 'É fundada a Federação Argentina de Padel (FAP), a primeira entidade oficial do esporte. A FAP organizaria os primeiros campeonatos nacionais e estabeleceria o ranking competitivo.',
    category: 'fundacao', year: 1984, decade: 1980, icon: 'FileText', importance: 'epico',
    tags: ['argentina', 'federação', 'oficial'], related_entries: ['Boom Argentino', 'Primeiro Circuito Profissional'],
  },
  {
    title: 'Primeiro Circuito Profissional',
    description: 'Argentina cria o primeiro circuito profissional de padel do mundo, com torneios mensais em Buenos Aires, Córdoba e Rosario. Os jogadores começam a competir por prêmios em dinheiro.',
    category: 'decada', year: 1987, decade: 1980, icon: 'Swords', importance: 'epico',
    tags: ['circuito', 'profissional', 'argentina'], related_entries: ['Primeira Federação Argentina'],
  },

  // ─── DÉCADA DE 1990 ─────────────────────────────────────────────
  {
    title: 'Federação Internacional de Padel',
    description: 'É fundada a Federação Internacional de Padel (FIP) em Madrid, com representantes de Espanha, Argentina, Uruguai e Brasil. A FIP unificaria as regras e organizaria o primeiro mundial.',
    category: 'fundacao', year: 1991, decade: 1990, icon: 'Globe', importance: 'lendario',
    tags: ['fip', 'internacional', 'unificação'], related_entries: ['Primeiro Mundial de Padel'],
  },
  {
    title: 'Primeiro Mundial de Padel',
    description: 'Madrid sedia o primeiro Campeonato Mundial de Padel. Argentina conquista o título histórico, iniciando uma hegemonia que duraria duas décadas no padel internacional.',
    category: 'torneio_historico', year: 1992, decade: 1990, icon: 'Crown', importance: 'lendario',
    tags: ['mundial', 'madrid', 'argentina'], related_entries: ['Federação Internacional de Padel', 'Hegemonia Argentina'],
  },
  {
    title: 'Hegemonia Argentina',
    description: 'Argentina estabelece sua dominância no padel mundial, conquistando todos os campeonatos sul-americanos e mundiais da década. Jogadores como Alejandro Lasaigues se tornam ídolos nacionais.',
    category: 'campeao', year: 1993, decade: 1990, icon: 'Crown', importance: 'lendario',
    tags: ['argentina', 'hegemonia', 'dominância'], related_entries: ['Primeiro Mundial de Padel', 'Alejandro Lasaigues'],
  },
  {
    title: 'Alejandro Lasaigues',
    description: 'Lasaigues se torna o primeiro grande ídolo mundial do padel, conquistando múltiplos campeonatos e elevando o nível técnico do esporte. Seu estilo agressivo definiria uma geração.',
    category: 'campeao', year: 1995, decade: 1990, icon: 'Star', importance: 'lendario',
    tags: ['lasaigues', 'argentina', 'ídolo', 'campeão'], related_entries: ['Hegemonia Argentina'],
  },
  {
    title: 'Expansão Brasileira',
    description: 'O padel começa a ganhar força no Brasil, especialmente em São Paulo e Rio de Janeiro. Os primeiros clubes brasileiros são fundados, embora o esporte ainda fosse pouco conhecido fora das colônias espanhola e argentina.',
    category: 'decada', year: 1997, decade: 1990, icon: 'TrendingUp', importance: 'destaque',
    tags: ['brasil', 'são-paulo', 'expansao'], related_entries: ['Boom do Padel Brasileiro'],
  },

  // ─── DÉCADA DE 2000 ─────────────────────────────────────────────
  {
    title: 'Virada Espanhola',
    description: 'A Espanha quebra a hegemonia argentina no padel mundial, conquistando o Mundial e iniciando sua própria era de dominância. A estrutura de clubes espanhóis e o investimento em formação de jovens atletas foram decisivos.',
    category: 'decada', year: 2000, decade: 2000, icon: 'Swords', importance: 'lendario',
    tags: ['espanha', 'virada', 'dominância'], related_entries: ['Hegemonia Argentina', 'Geração de Ouro Espanhola'],
  },
  {
    title: 'Criação do Padel Pro Tour',
    description: 'É criado o Padel Pro Tour (PPT), o primeiro circuito profissional internacional com torneios em múltiplos países. O PPT estabelece prêmios em dinheiro consistentes e ranking mundial oficial.',
    category: 'fundacao', year: 2005, decade: 2000, icon: 'Trophy', importance: 'lendario',
    tags: ['ppt', 'circuito', 'profissional', 'internacional'], related_entries: ['Virada Espanhola', 'Era do PPT'],
  },
  {
    title: 'Geração de Ouro Espanhola',
    description: 'Jogadores como Fernando Belasteguín, Juan Martín Díaz e Paquito Navarro emergem como a geração de ouro espanhola. Belasteguín iniciaria seu reinado de 16 anos como número 1 do mundo.',
    category: 'campeao', year: 2006, decade: 2000, icon: 'Crown', importance: 'lendario',
    tags: ['espanha', 'belasteguín', 'díaz', 'geração-ouro'], related_entries: ['Virada Espanhola', 'Reinado de Belasteguín'],
  },
  {
    title: 'Reinado de Belasteguín',
    description: 'Fernando Belasteguín se torna o número 1 do ranking mundial, posição que ocuparia por 16 anos consecutivos — o reinado mais longo da história do padel. Sua parceria com Juan Martín Díaz dominou o circuito por mais de uma década.',
    category: 'campeao', year: 2007, decade: 2000, icon: 'Crown', importance: 'lendario',
    tags: ['belasteguín', 'número-1', 'recorde', 'reinado'], related_entries: ['Geração de Ouro Espanhola', 'Dupla Bela-Díaz'],
  },
  {
    title: 'Dupla Bela-Díaz',
    description: 'A parceria entre Belasteguín e Juan Martín Díaz se torna a mais dominante da história do padel, conquistando mais de 200 títulos juntos. Sua química na quadra redefiniu o jogo de duplas.',
    category: 'rivalidade', year: 2008, decade: 2000, icon: 'Handshake', importance: 'lendario',
    tags: ['belasteguín', 'díaz', 'dupla', 'parceria'], related_entries: ['Reinado de Belasteguín', 'Geração de Ouro Espanhola'],
  },

  // ─── DÉCADA DE 2010 ─────────────────────────────────────────────
  {
    title: 'Regra do Ponto de Ouro',
    description: 'A FIP introduz a regra do "ponto de ouro" em situações de empate, eliminando o sistema de vantagem e tornando o jogo mais dinâmico e televisionável. A mudança foi controversa mas revolucionária.',
    category: 'regra', year: 2010, decade: 2010, icon: 'Circle', importance: 'epico',
    tags: ['regra', 'ponto-de-ouro', 'inovação'], related_entries: ['Federação Internacional de Padel'],
  },
  {
    title: 'World Padel Tour',
    description: 'O Padel Pro Tour é substituído pelo World Padel Tour (WPT), com maior investimento, mais torneios e cobertura televisiva global. O WPT transformou o padel em um esporte midia de massa.',
    category: 'fundacao', year: 2013, decade: 2010, icon: 'Trophy', importance: 'lendario',
    tags: ['wpt', 'circuito', 'midia', 'profissional'], related_entries: ['Criação do Padel Pro Tour', 'Era do WPT'],
  },
  {
    title: 'Era do WPT',
    description: 'O World Padel Tour estabelece o padel como esporte profissional de alto nível, com prêmios milionários e torneios em Espanha, Argentina, Brasil, Suécia e Portugal. A audiência cresce exponencialmente.',
    category: 'decada', year: 2014, decade: 2010, icon: 'TrendingUp', importance: 'lendario',
    tags: ['wpt', 'expansão', 'profissional'], related_entries: ['World Padel Tour'],
  },
  {
    title: 'Rivalidade Bela vs Galán',
    description: 'A nova geração representada por Alejandro Galán desafia o reinado de Belasteguín, criando a maior rivalidade do padel moderno. Os confrontos entre as duplas Bela-Tapia e Galán-Lebrón batem recordes de audiência.',
    category: 'rivalidade', year: 2016, decade: 2010, icon: 'Swords', importance: 'lendario',
    tags: ['belasteguín', 'galán', 'rivalidade', 'rivalidade'], related_entries: ['Reinado de Belasteguín', 'Ascensão de Galán'],
  },
  {
    title: 'Ascensão de Galán',
    description: 'Alejandro Galán se consolida como o novo número 1 do mundo, liderando a transição geracional do padel. Seu estilo de jogo completo e potência redefiniram o padrão técnico do esporte.',
    category: 'campeao', year: 2018, decade: 2010, icon: 'Star', importance: 'lendario',
    tags: ['galán', 'número-1', 'transição'], related_entries: ['Rivalidade Bela vs Galán', 'Reinado de Belasteguín'],
  },
  {
    title: 'Boom Escandinavo',
    description: 'O padel explode na Suécia, tornando-se o esporte de maior crescimento do país. Mais de 3000 quadras são construídas em apenas dois anos. O fenômeno se espalha para Noruega, Dinamarca e Finlândia.',
    category: 'decada', year: 2019, decade: 2010, icon: 'TrendingUp', importance: 'lendario',
    tags: ['suécia', 'escandinávia', 'boom', 'crescimento'], related_entries: ['Era do WPT'],
  },

  // ─── DÉCADA DE 2020 ─────────────────────────────────────────────
  {
    title: 'Pandemia e Padel',
    description: 'Durante a pandemia de COVID-19, o padel se mostra um dos esportes mais resilientes, sendo praticado em bolhas seguras. A prática ao ar livre e em espaços reduzidos contribuiu para um novo boom global.',
    category: 'momento', year: 2020, decade: 2020, icon: 'Heart', importance: 'destaque',
    tags: ['pandemia', 'covid', 'resiliência'], related_entries: ['Boom Escandinavo', 'Explosão Global'],
  },
  {
    title: 'Premier Padel',
    description: 'O grupo Qatar Sports Investments cria o Premier Padel, um novo circuito concorrente ao WPT, com torneios em Doha, Roma, Paris e Acapulco. A disputa entre circuitos eleva os prêmios e a visibilidade do esporte.',
    category: 'fundacao', year: 2022, decade: 2020, icon: 'Trophy', importance: 'lendario',
    tags: ['premier-padel', 'qatar', 'circuito'], related_entries: ['World Padel Tour', 'Unificação do Circuito'],
  },
  {
    title: 'Explosão Global',
    description: 'O padel ultrapassa 25 milhões de praticantes no mundo, com presença em mais de 90 países. Espanha, Argentina, Suécia, Itália e Portugal lideram, mas o crescimento acelera em EUA, Brasil e França.',
    category: 'decada', year: 2023, decade: 2020, icon: 'Globe', importance: 'lendario',
    tags: ['global', 'crescimento', 'expansão'], related_entries: ['Premier Padel', 'Pandemia e Padel'],
  },
  {
    title: 'Era Coello-Tapia',
    description: 'Arturo Coello e Agustín Tapia formam a dupla mais dominante da nova geração, conquistando múltiplos Majors e estabelecendo um novo padrão de excelência. Coello se torna o número 1 mais jovem da história.',
    category: 'campeao', year: 2024, decade: 2020, icon: 'Crown', importance: 'lendario',
    tags: ['coello', 'tapia', 'dupla', 'número-1'], related_entries: ['Ascensão de Galán', 'Explosão Global'],
  },
  {
    title: 'Unificação do Circuito',
    description: 'Após anos de disputa, WPT e Premier Padel se unificam sob o circuito FIP Tour, criando uma estrutura única com torneios P2, P1 e Major. A unificação traz estabilidade e clareza ao calendário profissional.',
    category: 'fundacao', year: 2025, decade: 2020, icon: 'Globe', importance: 'lendario',
    tags: ['unificação', 'fip', 'circuito'], related_entries: ['Premier Padel', 'World Padel Tour'],
  },
  {
    title: 'Recordes de Audiência',
    description: 'A final do Premier Padel de Roma atrai mais de 50.000 espectadores presenciais e milhões de telespectadores globais, batendo todos os recordes de audiência da história do padel.',
    category: 'recorde', year: 2026, decade: 2020, icon: 'Users', importance: 'epico',
    tags: ['recorde', 'audiência', 'roma'], related_entries: ['Unificação do Circuito', 'Explosão Global'],
  },

  // ─── CLUBES LENDÁRIOS ───────────────────────────────────────────
  {
    title: 'Club de Puerta de Hierro',
    description: 'Fundado em 1970 em Madrid, foi o primeiro clube europeu de padel. Já revelou dezenas de campeões mundiais e é considerado o templo histórico do esporte. Suas quadras são patrimônio do padel mundial.',
    category: 'clube_lendario', year: 1970, decade: 1970, icon: 'Building2', importance: 'lendario',
    tags: ['madrid', 'espanha', 'clube', 'histórico'], related_entries: ['Expansão para a Espanha', 'Primeiro Torneio Oficial'],
  },
  {
    title: 'Club Padel Las Encinas',
    description: 'Um dos clubes mais tradicionais de Córdoba, Argentina, formou gerações de campeões sul-americanos. Suas quadras de saibro originais foram preservadas como patrimônio histórico.',
    category: 'clube_lendario', year: 1985, decade: 1980, icon: 'Building2', importance: 'destaque',
    tags: ['córdoba', 'argentina', 'clube'], related_entries: ['Boom Argentino'],
  },
  {
    title: 'Centro de Alto Rendimiento',
    description: 'O Centro de Alto Rendimiento de Barcelona revolucionou a formação de atletas, introduzindo ciência esportiva, análise de dados e nutrição profissional ao padel. Modelo copiado mundialmente.',
    category: 'clube_lendario', year: 2008, decade: 2000, icon: 'Building2', importance: 'epico',
    tags: ['barcelona', 'espanha', 'ciência', 'formação'], related_entries: ['Geração de Ouro Espanhola'],
  },

  // ─── TECNOLOGIA ─────────────────────────────────────────────────
  {
    title: 'Evolução das Raquetes',
    description: 'As raquetes de padel evoluem de madeira para fibra de carbono e kevlar. O design em formato de lágrima, diamante e redondo se estabelece, cada um otimizado para diferentes estilos de jogo.',
    category: 'tecnologia', year: 1995, decade: 1990, icon: 'Disc', importance: 'destaque',
    tags: ['raquete', 'tecnologia', 'carbono'], related_entries: [],
  },
  {
    title: 'Análise de Dados',
    description: 'A introdução de câmeras de tracking e análise estatística avançada transforma a preparação tática dos atletas. Equipas começam a usar dados de saques, retornos e posicionamento para otimizar estratégias.',
    category: 'tecnologia', year: 2018, decade: 2010, icon: 'BarChart3', importance: 'destaque',
    tags: ['dados', 'tecnologia', 'análise', 'tática'], related_entries: ['Centro de Alto Rendimiento'],
  },
  {
    title: 'Streaming Global',
    description: 'O padel entra na era do streaming com transmissões ao vivo em HD para todo o mundo. Plataformas dedicadas ao esporte surgem, tornando cada torneio acessível a milhões de fãs globalmente.',
    category: 'tecnologia', year: 2020, decade: 2020, icon: 'Video', importance: 'epico',
    tags: ['streaming', 'midia', 'global'], related_entries: ['Explosão Global'],
  },

  // ─── RECORDES ───────────────────────────────────────────────────
  {
    title: '16 Anos como Número 1',
    description: 'Fernando Belasteguín estabelece o recorde mais impressionante do padel: 16 anos consecutivos como número 1 do ranking mundial. Um feito que dificilmente será igualado.',
    category: 'recorde', year: 2018, decade: 2010, icon: 'Crown', importance: 'lendario',
    tags: ['belasteguín', 'recorde', 'número-1'], related_entries: ['Reinado de Belasteguín', 'Dupla Bela-Díaz'],
  },
  {
    title: '200 Títulos em Dupla',
    description: 'A dupla Belasteguín-Díaz conquista 200 títulos profissionais juntos, o recorde de títulos em parceria na história do padel. A marca foi atingida após mais de uma década de domínio absoluto.',
    category: 'recorde', year: 2015, decade: 2010, icon: 'Trophy', importance: 'lendario',
    tags: ['belasteguín', 'díaz', 'recorde', 'títulos'], related_entries: ['Dupla Bela-Díaz'],
  },
  {
    title: 'Maior Público da História',
    description: 'A final do Premier Padel de Roma 2026 atrai 50.000+ espectadores no estádio e milhões online, o maior público da história do padel. O recorde supera o anterior em mais de 40%.',
    category: 'recorde', year: 2026, decade: 2020, icon: 'Users', importance: 'epico',
    tags: ['recorde', 'audiência', 'roma'], related_entries: ['Recordes de Audiência', 'Premier Padel'],
  },
];

export const CATEGORY_CONFIG = {
  fundacao: { label: 'Fundação', icon: 'Sparkles', color: 'primary' },
  decada: { label: 'Décadas', icon: 'Calendar', color: 'cyan' },
  campeao: { label: 'Campeões', icon: 'Crown', color: 'amber' },
  clube_lendario: { label: 'Clubes Lendários', icon: 'Building2', color: 'green' },
  torneio_historico: { label: 'Torneios Históricos', icon: 'Trophy', color: 'purple' },
  recorde: { label: 'Recordes', icon: 'Award', color: 'rose' },
  rivalidade: { label: 'Rivalidades', icon: 'Swords', color: 'cyan' },
  regra: { label: 'Mudanças de Regras', icon: 'FileText', color: 'amber' },
  momento: { label: 'Grandes Momentos', icon: 'Star', color: 'primary' },
  tecnologia: { label: 'Tecnologia', icon: 'Cpu', color: 'green' },
};

export const IMPORTANCE_CONFIG = {
  lendario: { label: 'Lendário', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  epico: { label: 'Épico', color: 'text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/30' },
  destaque: { label: 'Destaque', color: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30' },
  normal: { label: 'Normal', color: 'text-muted-foreground', bg: 'bg-secondary/50', border: 'border-border/60' },
};

export const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020];