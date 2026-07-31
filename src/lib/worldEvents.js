import { base44 } from '@/api/base44Client';

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Macro Event Types Metadata ────────────────────────────────────────────

export const MACRO_EVENT_META = {
  regra: {
    icon: 'Scale',
    label: 'Mudança de Regra',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    glow: 'bg-amber-500/10',
  },
  crise_economica: {
    icon: 'TrendingDown',
    label: 'Crise Econômica',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    glow: 'bg-red-500/10',
  },
  tecnologia: {
    icon: 'Cpu',
    label: 'Nova Tecnologia',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    glow: 'bg-cyan-500/10',
  },
  novo_patrocinador: {
    icon: 'Star',
    label: 'Novo Patrocinador',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    glow: 'bg-green-500/10',
  },
  expansao: {
    icon: 'Globe',
    label: 'Expansão do Esporte',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    glow: 'bg-blue-500/10',
  },
  beneficente: {
    icon: 'HeartHandshake',
    label: 'Evento Beneficente',
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/30',
    glow: 'bg-pink-500/10',
  },
  temporada_especial: {
    icon: 'Sparkles',
    label: 'Temporada Especial',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    glow: 'bg-purple-500/10',
  },
  celebracao_historica: {
    icon: 'Crown',
    label: 'Celebração Histórica',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    glow: 'bg-yellow-500/10',
  },
};

export const MACRO_EVENT_TYPES = Object.keys(MACRO_EVENT_META);

export const IMPACT_META = {
  baixo: { label: 'Impacto Baixo', color: 'text-green-400', bg: 'bg-green-500/15' },
  medio: { label: 'Impacto Médio', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  alto: { label: 'Impacto Alto', color: 'text-orange-400', bg: 'bg-orange-500/15' },
  extremo: { label: 'Impacto Extremo', color: 'text-red-400', bg: 'bg-red-500/15' },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function chance(pct) { return Math.random() < pct; }

// ── Macro Event Templates ─────────────────────────────────────────────────

const TEMPLATES = {
  regra: () => {
    const rules = [
      {
        title: 'FIP aprova novo formato de tie-break decisivo',
        content: 'A Federação Internacional de Padel aprovou hoje o novo formato de tie-break decisivo em sets emparrados. O "Super Tie-Break" será jogado até 10 pontos no terceiro set de todas as partidas oficiais. A mudança visa tornar o esporte mais dinâmico e atrativo para o público.',
        effects: { match_reward_modifier: 1.1 },
        duration: 30,
      },
      {
        title: 'Tempo de saque reduzido para 15 segundos',
        content: 'A diretoria do circuito reduziu o tempo permitido para saque de 20 para 15 segundos. A regra entra em vigor imediatamente em todos os torneios sancionados. Jogadores precisarão adaptar suas rotinas de saque rapidamente.',
        effects: { energy_cost_modifier: 0.95 },
        duration: 45,
      },
      {
        title: 'Substituição de bola permitida a cada 9 games',
        content: 'Nova regra permite a troca de bolas a cada 9 games em vez dos 11 atuais. A mudança busca garantir condições mais consistentes de jogo e reduzir quebras de ritmo por bolas gastas.',
        effects: { match_reward_modifier: 1.05 },
        duration: 60,
      },
      {
        title: 'Uso de comunicação por gestos é restrito',
        content: 'A FIP restringiu a comunicação por gestos entre duplas durante o ponto. Agora, apenas sinais verbais são permitidos entre os rallies. A medida busca eliminar vantagens injustas e melhorar a percepção tática do público.',
        effects: { training_bonus: 2 },
        duration: 30,
      },
      {
        title: 'Regra do "Golden Point" é aprovada em empates de 40-40',
        content: 'O "Golden Point" — ponto decisivo no 40-40 — foi aprovado para todas as partidas do circuito. Em vez de vantagem, o próximo ponto decide o game. A mudança promete partidas mais rápidas e emocionantes.',
        effects: { match_reward_modifier: 1.08, energy_cost_modifier: 0.9 },
        duration: 45,
      },
    ];
    const r = pick(rules);
    return {
      ...r,
      impact: pick(['medio', 'alto', 'medio', 'alto']),
      tier: 'breaking',
      affected: ['partidas'],
    };
  },

  crise_economica: () => {
    const crises = [
      {
        title: 'Crise econômica global afeta patrocinadores do padel',
        content: 'A desaceleração econômica global levou vários patrocinadores a reduzirem seus investimentos no padel. Contratos estão sendo renegociados e valores de premiação podem sofrer cortes temporários. O circuito busca novas fontes de receita para manter a estabilidade.',
        effects: { coin_modifier: 0.85, sponsor_appeal_bonus: -10, match_reward_modifier: 0.9 },
        duration: 60,
        impact: 'alto',
      },
      {
        title: 'Inflação elevada aumenta custos de equipamentos',
        content: 'A inflação elevada nos últimos meses provocou um aumento generalizado nos preços de raquetes, bolas e acessórios. Fabricantes precisaram repassar os custos aos consumidores. Analistas preveem que a pressão nos preços pode durar várias semanas.',
        effects: { market_modifier: 1.2, coin_modifier: 0.9 },
        duration: 45,
        impact: 'medio',
      },
      {
        title: 'Recessão atinge mercado de patrocínios esportivos',
        content: 'O mercado de patrocínios esportivos entrou em recessão técnica. Marcas estão cortando orçamentos de marketing e renegociando contratos. Atletas do circuito precisarão demonstrar mais valor para manter seus acordos comerciais.',
        effects: { sponsor_appeal_bonus: -15, coin_modifier: 0.88 },
        duration: 50,
        impact: 'alto',
      },
      {
        title: 'Desvalorização cambial impacta premiações internacionais',
        content: 'A desvalorização de moedas emergenciais frente ao dólar está afetando as premiações em torneios internacionais. Jogadores que recebem em moeda local veem seus ganhos reduzidos. O circuito estuda medidas compensatórias.',
        effects: { coin_modifier: 0.8, match_reward_modifier: 0.85 },
        duration: 40,
        impact: 'medio',
      },
    ];
    const c = pick(crises);
    return {
      ...c,
      tier: 'breaking',
      affected: ['economia', 'mercado', 'patrocinadores'],
    };
  },

  tecnologia: () => {
    const techs = [
      {
        title: 'Sensores em raquetes revolucionam análise de desempenho',
        content: 'Uma nova geração de sensores embarcados em raquetes permite análise em tempo real de velocidade, spin e ponto de impacto. A tecnologia foi aprovada para uso em treinos e promete transformar a forma como os atletas avaliam seu jogo. Fabricantes já anunciaram modelos compatíveis.',
        effects: { training_bonus: 5, xp_modifier: 1.1 },
        duration: 50,
        impact: 'medio',
      },
      {
        title: 'IA tática é aprovada para análise de treinos',
        content: 'A Federação Internacional aprovou o uso de inteligência artificial para análise tática durante treinos. A tecnologia identifica padrões de jogo dos adversários e sugere estratégias. O custo de acesso ainda é alto, mas os primeiros clubes já implementaram o sistema.',
        effects: { training_bonus: 3, xp_modifier: 1.15 },
        duration: 45,
        impact: 'medio',
      },
      {
        title: 'Novas raquetes de fibra de carbono chegam ao mercado',
        content: 'Fabricantes lançaram uma nova linha de raquetes com fibra de carbono de última geração, prometendo maior potência e controle. Os modelos estarão disponíveis em lojas especializadas nas próximas semanas. A expectativa é que o mercado reaja positivamente à inovação.',
        effects: { market_modifier: 0.95, training_bonus: 2 },
        duration: 30,
        impact: 'baixo',
      },
      {
        title: 'Tecnologia de realidade virtual chega aos treinos',
        content: 'Sistemas de realidade virtual foram introduzidos em centros de treino de elite. A tecnologia permite simular adversários e cenários de jogo sem desgaste físico. Atletas relatam ganhos significativos em preparação mental e tática.',
        effects: { training_bonus: 4, energy_cost_modifier: 0.9, xp_modifier: 1.1 },
        duration: 40,
        impact: 'alto',
      },
      {
        title: 'Wearable de biometria é liberado em competições',
        content: 'Dispositivos vestíveis de biometria — que medem frequência cardíaca, oxigenação e fadiga — foram liberados para uso em competições oficiais. A tecnologia permite que atletas e equipes técnicas monitorem o estado físico em tempo real, prevenindo lesões.',
        effects: { injury_risk_modifier: -10, energy_cost_modifier: 0.95 },
        duration: 55,
        impact: 'alto',
      },
    ];
    const t = pick(techs);
    return {
      ...t,
      tier: pick(['destaque', 'breaking']),
      affected: ['treino', 'tecnologia'],
    };
  },

  novo_patrocinador: () => {
    const sponsors = [
      {
        title: 'TechCorp entra no padel com contrato milionário',
        content: 'A gigante de tecnologia TechCorp anunciou hoje sua entrada oficial no mundo do padel com um contrato de patrocínio de 3 anos. O acordo cobre torneios, atletas de elite e programas de desenvolvimento. A marca vê o padel como um dos esportes de maior crescimento global.',
        effects: { sponsor_appeal_bonus: 15, coin_modifier: 1.1 },
        duration: 60,
        impact: 'alto',
      },
      {
        title: 'Banco internacional se torna patrocinador oficial do circuito',
        content: 'O GlobalBank foi anunciado como patrocinador oficial do circuito de padel por 5 anos. O acordo inclui branding em quadras, premiações e programas de incentivo a jovens talentos. É considerado o maior contrato comercial da história do esporte.',
        effects: { sponsor_appeal_bonus: 20, coin_modifier: 1.12, match_reward_modifier: 1.1 },
        duration: 90,
        impact: 'extremo',
      },
      {
        title: 'Marca de bebidas energéticas investe no padel feminino',
        content: 'A EnergyDrink Co. anunciou um investimento recorde no padel feminino, patrocinando torneios e atletas. A marca aposta no crescimento explosivo do esporte entre mulheres e promete campanhas de marketing agressivas.',
        effects: { sponsor_appeal_bonus: 12, fan_appeal_bonus: 8 },
        duration: 50,
        impact: 'medio',
      },
      {
        title: 'Fabricante automotivo se junta ao circuito',
        content: 'A AutoMotive Group entrou como patrocinadora oficial de uma série de torneios. A parceria inclui ativações em eventos, test drives e prêmios em veículos para campeões de torneios Major.',
        effects: { sponsor_appeal_bonus: 10, coin_modifier: 1.05 },
        duration: 45,
        impact: 'medio',
      },
    ];
    const s = pick(sponsors);
    return {
      ...s,
      tier: pick(['destaque', 'breaking']),
      affected: ['patrocinadores', 'economia'],
    };
  },

  expansao: () => {
    const expansions = [
      {
        title: 'Padel chega a 3 novos países: Índia, Arábia e Canadá',
        content: 'A Federação Internacional anunciou a expansão oficial do padel para três novos mercados: Índia, Arábia Saudita e Canadá. Novos torneios e academias serão inaugurados nos próximos meses. O esporte continua sua trajetória de crescimento global acelerado.',
        effects: { fan_appeal_bonus: 10, sponsor_appeal_bonus: 8, coin_modifier: 1.05 },
        duration: 60,
        impact: 'alto',
      },
      {
        title: 'Circuito anuncia torneios em 5 novos mercados',
        content: 'O circuito profissional revelou a adição de 5 novos torneios em mercados emergentes: México, Polônia, Emirados, Chile e Japão. A expansão traz mais oportunidades para atletas e aumenta a exposição global do esporte.',
        effects: { match_reward_modifier: 1.08, fan_appeal_bonus: 12 },
        duration: 50,
        impact: 'medio',
      },
      {
        title: 'China abre primeiro complexo de padel em Xangai',
        content: 'O primeiro complexo de padel na China foi inaugurado em Xangai, com 12 quadras oficiais e centro de treinamento. A entrada no mercado chinês é vista como um marco histórico para o esporte. Investidores locais planejam expansão para Pequim e Guangzhou.',
        effects: { fan_appeal_bonus: 15, sponsor_appeal_bonus: 12, coin_modifier: 1.08 },
        duration: 70,
        impact: 'extremo',
      },
      {
        title: 'EUA investem em padel universitário',
        content: 'Universidades americanas começaram a incluir o padel como esporte oficial em seus programas atléticos. A iniciativa busca popularizar o esporte no país. Mais de 50 universidades já aderiram ao programa piloto.',
        effects: { fan_appeal_bonus: 8, sponsor_appeal_bonus: 10 },
        duration: 45,
        impact: 'medio',
      },
    ];
    const e = pick(expansions);
    return {
      ...e,
      tier: pick(['destaque', 'breaking']),
      affected: ['mercado', 'torneios'],
    };
  },

  beneficente: () => {
    const charities = [
      {
        title: 'Torneio beneficente arrecada 2 milhões para crianças carentes',
        content: 'Um torneio beneficente organizado pelas estrelas do padel arrecadou mais de 2 milhões para programas sociais. O evento reuniu atletas de elite e celebridades. "O padel tem o poder de transformar vidas", afirmou um dos organizadores.',
        effects: { fan_appeal_bonus: 15, xp_modifier: 1.1 },
        duration: 20,
        impact: 'medio',
      },
      {
        title: 'Stars do padel participam de leilão beneficente',
        content: 'Os maiores nomes do padel doaram equipamentos e experiências para um leilão beneficente. O evento arrecadou valores significativos para instituições de caridade. A iniciativa reforça o compromisso social do circuito.',
        effects: { fan_appeal_bonus: 12, sponsor_appeal_bonus: 8 },
        duration: 15,
        impact: 'baixo',
      },
      {
        title: 'Circuito lança fundação para jovens talentos',
        content: 'O circuito oficial lançou uma fundação para apoiar jovens talentos de comunidades carentes. O programa oferece bolsas, equipamentos e acesso a centros de treinamento. A iniciativa visa democratizar o acesso ao padel de alto rendimento.',
        effects: { fan_appeal_bonus: 18, xp_modifier: 1.05, sponsor_appeal_bonus: 10 },
        duration: 40,
        impact: 'alto',
      },
      {
        title: 'Exibição de padel em hospital pediatrico emociona pacientes',
        content: 'Atletas do circuito visitaram um hospital pediátrico e realizaram uma exibição de padel adaptado. O evento emocionou pacientes e funcionários. "Ver o sorriso dessas crianças é a maior vitória", disse um dos participantes.',
        effects: { fan_appeal_bonus: 10 },
        duration: 10,
        impact: 'baixo',
      },
    ];
    const c = pick(charities);
    return {
      ...c,
      tier: 'destaque',
      affected: ['social', 'torcida'],
    };
  },

  temporada_especial: () => {
    const seasons = [
      {
        title: 'Temporada de Padel de Praia começa oficialmente',
        content: 'A aguardada Temporada de Padel de Praida foi lançada oficialmente! Torneios especiais em areia serão realizados em praias icônicas do mundo. A modalidade traz regras adaptadas e premiações exclusivas. Participe dos eventos especiais disponíveis no calendário!',
        effects: { xp_modifier: 1.2, fan_appeal_bonus: 10, match_reward_modifier: 1.15 },
        duration: 30,
        impact: 'alto',
      },
      {
        title: 'Mês do Padel Amador: descontos especiais em todo o circuito',
        content: 'Durante todo o mês, o circuito celebra o padel amador com descontos especiais em equipamentos, treinos gratuitos e eventos abertos ao público. É a oportunidade perfeita para evoluir seu jogo com custos reduzidos!',
        effects: { market_modifier: 0.8, training_bonus: 3, coin_modifier: 1.1 },
        duration: 30,
        impact: 'medio',
      },
      {
        title: 'Temporada de Festivais de Padel começa',
        content: 'Uma série de festivais de padel foi anunciada para os próximos meses, combinando torneios, música e entretenimento. Os eventos prometem atrair multidões e gerar grande exposição para o esporte. Premiações especiais estarão disponíveis!',
        effects: { fan_appeal_bonus: 12, xp_modifier: 1.15, match_reward_modifier: 1.1 },
        duration: 45,
        impact: 'alto',
      },
      {
        title: 'Semana do Padel Noturno: jogos sob luzes especiais',
        content: 'A Semana do Padel Noturno foi lançada! Todos os torneios da semana serão disputados sob iluminação especial, com atmosfera única. Os atletas relatam maior foco e intensidade. Recompensas extras estão disponíveis!',
        effects: { xp_modifier: 1.1, energy_cost_modifier: 0.95, match_reward_modifier: 1.12 },
        duration: 7,
        impact: 'medio',
      },
      {
        title: 'Temporada de Padel Indoor chega ao circuito',
        content: 'A Temporada de Padel Indoor foi oficialmente lançada! Quadras cobertas com clima controlado oferecem condições perfeitas de jogo. A modalidade traz novos desafios táticos e recompensas exclusivas.',
        effects: { training_bonus: 4, xp_modifier: 1.1, injury_risk_modifier: -5 },
        duration: 35,
        impact: 'medio',
      },
    ];
    const s = pick(seasons);
    return {
      ...s,
      tier: 'breaking',
      affected: ['torneios', 'treino', 'economia'],
    };
  },

  celebracao_historica: () => {
    const celebrations = [
      {
        title: '50 anos do padel: FIP prepara celebração global',
        content: 'A Federação Internacional de Padel iniciou as celebrações dos 50 anos do esporte. Eventos especiais, exposições e torneios comemorativos serão realizados durante todo o período. Atletas e fãs são convidados a participar das festividades com recompensas especiais!',
        effects: { xp_modifier: 1.25, fan_appeal_bonus: 15, coin_modifier: 1.1 },
        duration: 30,
        impact: 'extremo',
      },
      {
        title: 'Aniversário de 100 anos do primeiro clube de padel',
        content: 'O clube que abrigou a primeira quadra de padel do mundo completa 100 anos. Uma série de eventos comemorativos estão planejados, incluindo torneios históricos e exposições de equipamentos de época. Uma celebração imperdível para todos os amantes do esporte!',
        effects: { xp_modifier: 1.15, fan_appeal_bonus: 10 },
        duration: 20,
        impact: 'alto',
      },
      {
        title: 'Década de Ouro do Padel é celebrada no circuito',
        content: 'O circuito celebra a "Década de Ouro" do padel, marcada por crescimento recorde, profissionalização e expansão global. Eventos especiais e premiações extras estão disponíveis para todos os atletas durante o período comemorativo.',
        effects: { xp_modifier: 1.2, coin_modifier: 1.1, match_reward_modifier: 1.1 },
        duration: 25,
        impact: 'alto',
      },
      {
        title: 'Hall da Fama do Padel recebe novos imortais',
        content: 'Uma nova classe de lendas foi induzida ao Hall da Fama do Padel em cerimônia emocionante. Os homenageados representam décadas de contribuição ao esporte. O evento gera grande comoção entre fãs e atletas do circuito.',
        effects: { fan_appeal_bonus: 12, xp_modifier: 1.1 },
        duration: 15,
        impact: 'medio',
      },
      {
        title: 'Ano Novo do Circuito: temporada começa com festa global',
        content: 'O início da nova temporada do circuito é celebrado com festas em todo o mundo. Atletas, clubes e fãs se reúnem para dar boas-vindas a mais um ano de padel. Recompensas especiais de abertura estão disponíveis!',
        effects: { xp_modifier: 1.15, coin_modifier: 1.08, fan_appeal_bonus: 8 },
        duration: 14,
        impact: 'medio',
      },
    ];
    const c = pick(celebrations);
    return {
      ...c,
      tier: 'breaking',
      affected: ['torcida', 'torneios', 'economia'],
    };
  },
};

// ── Generation ─────────────────────────────────────────────────────────────

const MACRO_KEYS = Object.keys(TEMPLATES);

export function generateMacroEventObject(date) {
  const type = pick(MACRO_KEYS);
  const tpl = TEMPLATES[type]();
  const startDate = date;
  const endDate = tpl.duration > 0 ? addDays(date, tpl.duration) : date;
  return {
    event_type: type,
    title: tpl.title,
    content: tpl.content,
    author_name: 'Redação Mundo do Padel',
    related_players: [],
    tier: tpl.tier || 'destaque',
    event_date: date,
    likes: randInt(500, 15000),
    tags: [type, 'macro'],
    is_macro: true,
    impact_level: tpl.impact || 'medio',
    effects: tpl.effects || {},
    start_date: startDate,
    end_date: endDate,
    is_active: true,
    duration_days: tpl.duration || 0,
    affected_categories: tpl.affected || [],
    icon: MACRO_EVENT_META[type].icon,
  };
}

export async function generateMacroEvents(date, count = 1) {
  const events = [];
  for (let i = 0; i < count; i++) {
    events.push(generateMacroEventObject(date));
  }
  if (events.length === 0) return [];
  return await base44.entities.WorldEvent.bulkCreate(events);
}

// Expire macro events whose end_date has passed
export async function expireMacroEvents(date) {
  try {
    const active = await base44.entities.WorldEvent.filter({ is_macro: true, is_active: true }, '-created_date', 200);
    const toExpire = (active || []).filter(e => e.end_date && e.end_date < date);
    if (toExpire.length === 0) return 0;
    await base44.entities.WorldEvent.bulkUpdate(
      toExpire.map(e => ({ id: e.id, is_active: false }))
    );
    return toExpire.length;
  } catch (e) {
    console.error('expireMacroEvents', e);
    return 0;
  }
}

// Get all currently active macro events and their combined effects
export async function getActiveMacroEvents(date) {
  try {
    const events = await base44.entities.WorldEvent.filter({ is_macro: true, is_active: true }, '-created_date', 50);
    return (events || []).filter(e => {
      if (!e.start_date || !e.end_date) return true;
      return e.start_date <= date && e.end_date >= date;
    });
  } catch (e) {
    console.error('getActiveMacroEvents', e);
    return [];
  }
}

// Compute combined effects from all active macro events
export function computeCombinedEffects(macroEvents) {
  const combined = {
    training_bonus: 0,
    coin_modifier: 1,
    xp_modifier: 1,
    market_modifier: 1,
    injury_risk_modifier: 0,
    fan_appeal_bonus: 0,
    sponsor_appeal_bonus: 0,
    energy_cost_modifier: 1,
    match_reward_modifier: 1,
  };
  for (const ev of macroEvents) {
    const e = ev.effects || {};
    if (e.training_bonus) combined.training_bonus += e.training_bonus;
    if (e.coin_modifier) combined.coin_modifier *= e.coin_modifier;
    if (e.xp_modifier) combined.xp_modifier *= e.xp_modifier;
    if (e.market_modifier) combined.market_modifier *= e.market_modifier;
    if (e.injury_risk_modifier) combined.injury_risk_modifier += e.injury_risk_modifier;
    if (e.fan_appeal_bonus) combined.fan_appeal_bonus += e.fan_appeal_bonus;
    if (e.sponsor_appeal_bonus) combined.sponsor_appeal_bonus += e.sponsor_appeal_bonus;
    if (e.energy_cost_modifier) combined.energy_cost_modifier *= e.energy_cost_modifier;
    if (e.match_reward_modifier) combined.match_reward_modifier *= e.match_reward_modifier;
  }
  return combined;
}

// Maybe generate a macro event (called on day advance)
// Chance increases on certain milestones
export async function maybeGenerateMacroEvent(date) {
  // ~12% chance per day for a macro event
  if (!chance(0.12)) return null;
  const event = await generateMacroEvents(date, 1);
  return event?.[0] || null;
}

// Ensure minimum macro events exist for a given date
export async function ensureMacroEvents(date, minActive = 2) {
  try {
    await expireMacroEvents(date);
    const active = await getActiveMacroEvents(date);
    if (active.length >= minActive) return active;
    const needed = minActive - active.length;
    await generateMacroEvents(date, needed);
    return await getActiveMacroEvents(date);
  } catch (e) {
    console.error('ensureMacroEvents', e);
    return [];
  }
}