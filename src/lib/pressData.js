import { base44 } from '@/api/base44Client';

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

// ─── Question Banks ──────────────────────────────────────────────────────────
// Each question has 3-4 answer choices with different effects.
// Effects: fan_appeal, sponsor_appeal, morale, reputation, journalist_bias

export const QUESTION_BANKS = {
  pre_match: [
    {
      id: 'pre_1',
      category: 'pre_match',
      text: 'Você enfrenta {opponent} amanhã. Como você avalia o adversário?',
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

export function getPendingInterviews(profile, recentMatches) {
  const pending = [];
  const careerDate = profile?.career_date || '2026-01-01';

  // Post-match interviews
  if (recentMatches && recentMatches.length > 0) {
    const lastMatch = recentMatches[0];
    const won = lastMatch.winner && lastMatch.team_a && lastMatch.team_a[0] === profile?.sport_name
      ? lastMatch.winner === profile.sport_name
      : false;

    const existingType = won ? 'post_win' : 'post_loss';
    pending.push({
      id: `interview_match_${lastMatch.id}`,
      type: 'interview',
      title: won ? 'Entrevista Pós-Vitória' : 'Entrevista Pós-Derrota',
      description: `Imprensa quer saber sobre sua última partida contra ${lastMatch.team_b?.[0] || 'o adversário'}.`,
      questionCategory: won ? 'post_win' : 'post_loss',
      opponent: lastMatch.team_b?.[0] || 'o adversário',
      relatedEvent: lastMatch.tournament_name || 'Partida Oficial',
      careerDate,
    });
  }

  // Pre-tournament press conference
  pending.push({
    id: 'press_conf_pre',
    type: 'press_conference',
    title: 'Coletiva de Imprensa',
    description: 'Jornalistas reunidos para a coletiva pré-torneio.',
    questionCategory: 'pre_match',
    opponent: 'o próximo adversário',
    relatedEvent: 'Coletiva Oficial',
    careerDate,
  });

  // Rumor interview (periodic)
  pending.push({
    id: 'interview_rumor',
    type: 'interview',
    title: 'Rumor do Dia',
    description: 'Um jornalista quer comentar os rumores sobre você.',
    questionCategory: 'rumor',
    opponent: 'a imprensa',
    relatedEvent: 'Rumores',
    careerDate,
  });

  // Speculation (if player is older or high level)
  const age = profile?.birth_date ? calculateAgeFromBirth(profile.birth_date, careerDate) : 20;
  if (age >= 30 || (profile?.xp || 0) > 5000) {
    pending.push({
      id: 'interview_speculation',
      type: 'interview',
      title: 'Especulação',
      description: 'Jornalistas especulam sobre seu futuro no padel.',
      questionCategory: 'speculation',
      opponent: 'o futuro',
      relatedEvent: 'Especulação',
      careerDate,
    });
  }

  // Prediction (before tournaments)
  pending.push({
    id: 'interview_prediction',
    type: 'interview',
    title: 'Previsões da Imprensa',
    description: 'Jornalistas querem saber suas previsões para o circuito.',
    questionCategory: 'prediction',
    opponent: 'o circuito',
    relatedEvent: 'Previsões',
    careerDate,
  });

  return pending;
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

export function pickJournalist(bias = 'any') {
  if (bias === 'any') return pickRandom(JOURNALISTS);
  if (bias === 'critical') return JOURNALISTS.filter(j => j.personality === 'critico' || j.personality === 'provocador')[0] || pickRandom(JOURNALISTS);
  if (bias === 'positive') return JOURNALISTS.filter(j => j.personality === 'passional' || j.personality === 'neutro')[0] || pickRandom(JOURNALISTS);
  return pickRandom(JOURNALISTS);
}

// ─── Reputação helpers ───────────────────────────────────────────────────────

export function applyReputationEffects(profile, effects) {
  const updates = {};
  if (effects.fan_appeal) updates.fan_appeal = Math.max(0, Math.min(100, (profile.fan_appeal || 50) + effects.fan_appeal));
  if (effects.sponsor_appeal) updates.sponsor_appeal = Math.max(0, Math.min(100, (profile.sponsor_appeal || 50) + effects.sponsor_appeal));
  if (effects.morale) updates.morale = Math.max(0, Math.min(100, (profile.morale || 70) + effects.morale));
  return updates;
}