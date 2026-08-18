export const PAGE_INTRODUCTIONS = {
  '/game': { title: 'Painel da carreira', description: 'Resumo da sua situação, energia, compromissos e evolução.', purpose: 'Use as recomendações para decidir a melhor ação de agora.', tip: 'Comece pelo cartão Próximo passo.' },
  '/game/missions': { title: 'Missões', description: 'Objetivos que ensinam sistemas e acompanham sua evolução.', purpose: 'Cada missão explica a ação, o motivo e a recompensa.', tip: 'Abrir uma aba só conclui missões de apresentação.' },
  '/game/training': { title: 'Treinos', description: 'Desenvolva atributos com atividades e intensidades diferentes.', purpose: 'Treinos fortes evoluem mais, mas gastam mais energia e aumentam a fadiga.', tip: 'Priorize atributos ligados ao seu estilo.' },
  '/partners': { title: 'Parceiros', description: 'Forme e administre sua dupla.', purpose: 'Compatibilidade de lado, estilo e entrosamento pode valer mais que o maior overall.', tip: 'Direita e esquerda normalmente se complementam.' },
  '/tournaments': { title: 'Torneios', description: 'Competições disponíveis para sua dupla.', purpose: 'Torneios geram experiência, dinheiro, reputação e ranking.', tip: 'Confira requisitos, energia e taxa antes de se inscrever.' },
  '/game/calendar': { title: 'Calendário', description: 'Planeje treinos, descansos, torneios e eventos.', purpose: 'Um bom plano evita conflitos e cansaço antes das competições.', tip: 'Reserve recuperação antes de torneios importantes.' },
  '/ranking': { title: 'Ranking', description: 'Posição de atletas, duplas, clubes e países.', purpose: 'Mostra sua evolução competitiva e o caminho para eventos maiores.', tip: 'Consistência vale mais que buscar torneios avançados cedo demais.' },
  '/world-market': { title: 'Mercado mundial', description: 'Atletas, valores, oportunidades e movimentos do circuito.', purpose: 'Ajuda a planejar futuras duplas e acompanhar rivais.', tip: 'Sistema avançado: explore depois de dominar seu ciclo básico.' },
  '/journal': { title: 'Jornal', description: 'Resultados e acontecimentos do circuito.', purpose: 'Mostra mudanças que podem afetar sua carreira.', tip: 'Use como contexto; não exige ação diária.' },
  '/clubs': { title: 'Clubes', description: 'Explore clubes, instalações e eventos locais do circuito.', purpose: 'Use para encontrar estruturas e oportunidades de treino ou competição.', tip: 'Verifique a reputação, localização e recursos do clube antes de aceitar.' },
  '/history': { title: 'Histórico', description: 'Registro da trajetória e da história do esporte.', purpose: 'Permite rever marcos, partidas e conquistas.', tip: 'Consulte quando quiser avaliar seu progresso.' },
  '/game/economy': { title: 'Gestão financeira', description: 'Receitas, despesas, patrocínios, investimentos e patrimônio.', purpose: 'Aqui você mantém a carreira financeiramente sustentável e acompanha o custo total da equipe.', tip: 'A comissão técnica agora é gerenciada separadamente na área Dupla e relações.' },
  // Onboarding Flow 3.1 (docs/ONBOARDING_FLOW_3_1.md, Parte 3): sub-guia
  // específico da aba Patrocínios — /game/economy é uma aba (?view=sponsors),
  // não uma rota própria, então este entry só é encontrado por
  // getPageIntroduction quando a query bate (ver função abaixo); fora dessa
  // aba, a introdução genérica de /game/economy acima continua valendo.
  '/game/economy?view=sponsors': { title: 'Patrocínios', description: 'Catálogo mensal de marcas compatíveis com o seu perfil, com bônus de assinatura e salário mensal recorrente.', purpose: 'Sua compatibilidade considera estilo, nível, lado, idade e apelo de torcida — quanto maior, melhor a proposta.', tip: 'Metas comerciais do contrato ajustam pagamentos mês a mês; nenhum contrato entrega itens físicos.' },
  '/staff': { title: 'Comissão técnica', description: 'Profissionais de apoio que trabalham sob a liderança do treinador principal.', purpose: 'Monte uma equipe equilibrada para melhorar preparação física, recuperação, confiança, análise e gestão.', tip: 'O treinador principal é obrigatório e não ocupa nenhuma das vagas da comissão técnica. As 8 funções reais são: preparador físico, fisioterapeuta, nutricionista, psicólogo, analista de desempenho, olheiro, empresário e contador.' },
  '/coaches': { title: 'Treinador principal', description: 'Compare treinadores por especialidade, tier e benefícios reais.', purpose: 'O treinador principal melhora treinos e orienta partidas ao vivo; é obrigatório e não ocupa vaga da comissão técnica.', tip: 'Compare tier, custo e os 2-3 benefícios da especialidade direto no card, antes de abrir "Ver detalhes".' },
  '/game/shop': { title: 'Equipamentos', description: 'Compre itens disponíveis para o atleta.', purpose: 'Confira claramente efeitos e custos antes de comprar.', tip: 'No começo, preserve dinheiro para inscrições e recuperação.' },
  '/game/inventory': { title: 'Inventário', description: 'Consulte e equipe os itens que você possui.', purpose: 'Aqui você controla o equipamento ativo do atleta.', tip: 'Leia o efeito antes de substituir um item.' },
  '/character': { title: 'Aparência', description: 'Personalização visual e identidade do atleta.', purpose: 'Essas escolhas representam seu personagem sem substituir treino e evolução.', tip: 'Você pode voltar e ajustar depois.' },
  '/press': { title: 'Imprensa', description: 'Entrevistas, jornalistas e repercussão pública.', purpose: 'Suas respostas influenciam narrativa, reputação e relações.', tip: 'Sistema avançado: considere o contexto antes de responder.' },
  '/game/legacy': { title: 'Legado', description: 'Impacto acumulado da sua trajetória.', purpose: 'Reúne conquistas que definem como a carreira será lembrada.', tip: 'O legado cresce com resultados consistentes ao longo das temporadas.' },
};

// Onboarding Flow 3.1 (docs/ONBOARDING_FLOW_3_1.md, Parte 3): `search`
// opcional habilita um sub-guia por aba (ex.: /game/economy?view=sponsors)
// sem transformar o registro inteiro em algo query-aware — só tenta a chave
// composta quando ela existe, senão cai no comportamento antigo por
// pathname. Retrocompatível: chamadas com um único argumento continuam
// funcionando exatamente como antes.
export function getPageIntroduction(pathname, search = '') {
  if (pathname?.startsWith('/clubs/')) return PAGE_INTRODUCTIONS['/clubs'];
  if (search && String(search).includes('view=sponsors')) {
    const composite = PAGE_INTRODUCTIONS[`${pathname}?view=sponsors`];
    if (composite) return composite;
  }
  return PAGE_INTRODUCTIONS[pathname] || { title: 'Explore esta área', description: 'Este módulo amplia as opções da sua carreira.', purpose: 'Use quando fizer sentido para seu objetivo atual.', tip: 'Você pode voltar ao Guia para rever o ciclo principal.' };
}
