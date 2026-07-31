// ── Personality Traits System ──────────────────────────────────────────────
// Each athlete gets 3-4 traits that influence: coach relationships, sponsor
// appeal, fan appeal, interview style, career growth, morale volatility,
// injury risk, and decision-making.

export const PERSONALITY_TRAITS = [
  // ─── Work Ethic ────────────────────────────────────────────────────────
  { id: 'disciplinado', label: 'Disciplinado', desc: 'Treina com método e constância, nunca falta aos compromissos', icon: 'Target', color: 'cyan',
    coachModifier: 0.25, sponsorModifier: 0.15, fanModifier: 0.05, growthModifier: 1.25, moraleVolatility: 0.6, injuryModifier: 0.85,
    interviewStyle: 'Metódico e focado, fala de processo e trabalho duro.',
    quotes: { win: ['O trabalho duro sempre compensa. Estamos no caminho certo.', 'Cada treino me deixa mais perto do objetivo.'], lose: ['Preciso treinar mais. Voltarei mais forte.', 'O processo não para por uma derrota.'], neutral: ['Foco no próximo treino, no próximo jogo.'] } },

  { id: 'trabalhador', label: 'Trabalhador', desc: 'Não tem medo de suor, compensa talento com esforço', icon: 'Dumbbell', color: 'amber',
    coachModifier: 0.30, sponsorModifier: 0.10, fanModifier: 0.10, growthModifier: 1.30, moraleVolatility: 0.7, injuryModifier: 1.0,
    interviewStyle: 'Simples e direto, valoriza esforço acima de tudo.',
    quotes: { win: ['Ganhei porque trabalhei mais que o adversário.', 'Suor não nega.'], lose: ['Não trabalhei o suficiente. Vou corrigir.'], neutral: ['Enquanto outros descansam, eu treino.'] } },

  { id: 'preguicoso', label: 'Preguiçoso', desc: 'Tem talento mas evita treinos extras, vive no limite', icon: 'Moon', color: 'slate',
    coachModifier: -0.25, sponsorModifier: -0.10, fanModifier: -0.05, growthModifier: 0.70, moraleVolatility: 0.8, injuryModifier: 1.15,
    interviewStyle: 'Descontraído e às vezes desmotivado, minimiza treinos.',
    quotes: { win: ['Ganhei jogando o mínimo necessário.', 'Para que treinar tanto se funciona?'], lose: ['Não estava com vontade hoje.', 'Treinar é cansativo demais.'], neutral: ['Hoje deu preguiça, mas amanhã vou... talvez.'] } },

  { id: 'perfeccionista', label: 'Perfeccionista', desc: 'Cobra excelência de si e dos outros, insatisfeito com o bom', icon: 'Crosshair', color: 'purple',
    coachModifier: 0.10, sponsorModifier: 0.10, fanModifier: 0.0, growthModifier: 1.20, moraleVolatility: 1.4, injuryModifier: 0.95,
    interviewStyle: 'Crítico e detalhista, nunca totalmente satisfeito.',
    quotes: { win: ['Ganhamos, mas erramos demais. Preciso melhorar.', 'Não foi perfeito, longe disso.'], lose: ['Eu falhei. Cada detalhe importa.', 'A perfeição me escapa novamente.'], neutral: ['Ajustando detalhes. Sempre há o que melhorar.'] } },

  // ─── Emotional ──────────────────────────────────────────────────────────
  { id: 'explosivo', label: 'Explosivo', desc: 'Reage com intensidade, pode brilhar ou implodir', icon: 'Flame', color: 'red',
    coachModifier: -0.10, sponsorModifier: 0.05, fanModifier: 0.20, growthModifier: 1.10, moraleVolatility: 1.8, injuryModifier: 1.20,
    interviewStyle: 'Passional e intenso, fala com o coração na mão.',
    quotes: { win: ['ISSO! Ninguém me para hoje!', 'Peguem fogo! Esta é a minha hora!'], lose: ['Não acredito! Que vergonha!', 'Estou furioso comigo mesmo.'], neutral: ['Sinto o sangue ferver. Vamos com tudo.'] } },

  { id: 'emocional', label: 'Emocional', desc: 'Deixa sentimentos guiarem decisões dentro e fora da quadra', icon: 'Heart', color: 'pink',
    coachModifier: 0.0, sponsorModifier: 0.05, fanModifier: 0.15, growthModifier: 1.0, moraleVolatility: 1.6, injuryModifier: 1.0,
    interviewStyle: 'Vulnerável e sincero, chora, ri, sente tudo à flor da pele.',
    quotes: { win: ['Não consigo segurar a emoção. Este é o melhor dia da minha vida.', 'Meus olhos se enchem de lágrimas de alegria.'], lose: ['Dói muito. Mais do que imaginava.', 'Meu coração está em pedaços.'], neutral: ['Sinto muito. É difícil explicar.'] } },

  { id: 'frio', label: 'Frio', desc: 'Mantém controle absoluto sob pressão, nunca se abala', icon: 'Snowflake', color: 'cyan',
    coachModifier: 0.10, sponsorModifier: 0.05, fanModifier: -0.10, growthModifier: 1.05, moraleVolatility: 0.3, injuryModifier: 0.90,
    interviewStyle: 'Calmo e lacônico, respostas curtas e controladas.',
    quotes: { win: ['Era o esperado. Próximo desafio.', 'Trabalho feito. Nada mais.'], lose: ['Analisarei os erros. Nada de pânico.', 'Uma derrota não define nada.'], neutral: ['Mantenho o foco. Sem drama.'] } },

  { id: 'mercurial', label: 'Mercurial', desc: 'Imprevisível, muda de humor sem aviso, gênio ou desastre', icon: 'Cloud', color: 'slate',
    coachModifier: -0.15, sponsorModifier: 0.0, fanModifier: 0.10, growthModifier: 1.15, moraleVolatility: 2.0, injuryModifier: 1.10,
    interviewStyle: 'Imprevisível, pode ser genial ou incompreensível.',
    quotes: { win: ['Hoje fui Deus. Amanhã? Quem sabe.', 'Não sei explicar. Simplesmente aconteceu.'], lose: ['Não sei o que deu errado. Nada.', 'Hoje não era meu dia. Ou era. Não sei.'], neutral: ['Talvez sim, talvez não. Veremos.'] } },

  // ─── Social & Leadership ────────────────────────────────────────────────
  { id: 'lider', label: 'Líder', desc: 'Assume comando, organiza jogadas, motiva a equipa', icon: 'Crown', color: 'amber',
    coachModifier: 0.15, sponsorModifier: 0.20, fanModifier: 0.25, growthModifier: 1.10, moraleVolatility: 0.7, injuryModifier: 0.95,
    interviewStyle: 'Autoritário e motivacional, fala como capitão.',
    quotes: { win: ['A equipa foi perfeita. Lideramos até o fim.', 'Todos seguiram o plano. É assim que se faz.'], lose: ['Assumo a culpa. Como líder, falhei.', 'Preciso conduzir melhor a equipa.'], neutral: ['Vou reunir a equipa. Conversamos e seguimos.'] } },

  { id: 'carismatico', label: 'Carismático', desc: 'Magnetismo natural, fascina torcidas e mídia', icon: 'Star', color: 'amber',
    coachModifier: 0.10, sponsorModifier: 0.30, fanModifier: 0.35, growthModifier: 1.05, moraleVolatility: 0.8, injuryModifier: 1.0,
    interviewStyle: 'Charmoso e envolvente, vence a imprensa com sorriso.',
    quotes: { win: ['Para vocês, torcida! Vocês são incríveis!', 'Que noite mágica! Amo vocês!'], lose: ['Não foi nossa noite, mas a torcida esteve incrível.', 'Vamos voltar. Vocês merecem mais.'], neutral: ['Obrigado pelo carinho. Vocês são tudo.'] } },

  { id: 'introvertido', label: 'Introvertido', desc: 'Fala pouco, evita holofotes, foca internamente', icon: 'EyeOff', color: 'slate',
    coachModifier: 0.05, sponsorModifier: -0.15, fanModifier: -0.20, growthModifier: 1.10, moraleVolatility: 0.5, injuryModifier: 0.90,
    interviewStyle: 'Tímido e curto, responde o mínimo necessário.',
    quotes: { win: ['Boa partida. Obrigado.'], lose: ['Não foi bom. Melhorar.'], neutral: ['Sem comentários por enquanto.'] } },

  { id: 'provocador', label: 'Provocador', desc: 'Provoca adversários, gera polêmica, divide opiniões', icon: 'MessageCircleWarning', color: 'red',
    coachModifier: -0.10, sponsorModifier: 0.10, fanModifier: 0.15, growthModifier: 1.05, moraleVolatility: 1.2, injuryModifier: 1.05,
    interviewStyle: 'Provocativo e polêmico, não teme gerar controvérsia.',
    quotes: { win: ['Mandei ele chorar para a mãe. Cadeirinha.', 'Ele se achava. Agora tá calado.'], lose: ['Teve sorte. Na próxima, pago com juros.', 'Isso não fica assim.'], neutral: ['Tem uns caras que falam demais. Vou responder em quadra.'] } },

  { id: 'humilde', label: 'Humilde', desc: 'Reconhece limites, valoriza adversários, sem ego inflado', icon: 'HeartHandshake', color: 'green',
    coachModifier: 0.20, sponsorModifier: 0.10, fanModifier: 0.20, growthModifier: 1.10, moraleVolatility: 0.6, injuryModifier: 0.90,
    interviewStyle: 'Modesto e respeitoso, elogia adversários e equipa.',
    quotes: { win: ['Meus adversários foram incríveis. Tive sorte.', 'Sem minha equipa, nada disso seria possível.'], lose: ['Ele foi melhor. Parabéns a ele.', 'Aprendi muito hoje. Vou crescer.'], neutral: ['Sigo aprendendo. Sou grato por tudo.'] } },

  { id: 'arrogante', label: 'Arrogante', desc: 'Se acha superior, desdenha adversários, gera atritos', icon: 'Crown', color: 'purple',
    coachModifier: -0.20, sponsorModifier: 0.05, fanModifier: -0.10, growthModifier: 1.0, moraleVolatility: 1.3, injuryModifier: 1.0,
    interviewStyle: 'Presunçoso e superior, minimiza adversários.',
    quotes: { win: ['Era o esperado. Nível inferior.', 'Surpresa? Não deveria. Sempre fui melhor.'], lose: ['Teve sorte. Sorte acaba.', 'Não perdi, o juiz roubou.'], neutral: ['Por que ainda perguntam? Sou o melhor.'] } },

  // ─── Competitive ────────────────────────────────────────────────────────
  { id: 'competitivo', label: 'Competitivo', desc: 'Não aceita perder nem em treino, pressiona a cada ponto', icon: 'Swords', color: 'red',
    coachModifier: 0.05, sponsorModifier: 0.10, fanModifier: 0.15, growthModifier: 1.15, moraleVolatility: 1.1, injuryModifier: 1.15,
    interviewStyle: 'Intenso e focado, trata cada jogo como guerra.',
    quotes: { win: ['Ninguém me derrota. Ninguém.', 'Competir é viver. Venci novamente.'], lose: ['Não aceito. Nunca aceito.', 'Vou estudar cada ponto. Vou voltar.'], neutral: ['Cada treino é uma guerra. Eu ganho sempre.'] } },

  { id: 'impulsivo', label: 'Impulsivo', desc: 'Age sem pensar, decide no calor, arrisca tudo', icon: 'Zap', color: 'orange',
    coachModifier: -0.10, sponsorModifier: 0.0, fanModifier: 0.15, growthModifier: 1.05, moraleVolatility: 1.5, injuryModifier: 1.30,
    interviewStyle: 'Espontâneo e direto, fala o que pensa na hora.',
    quotes: { win: ['Fui no tudo e deu certo! Instinto!', 'Não pensei, joguei. Funcionou!'], lose: ['Deveria ter pensado. Droga.', 'Fui imprudente. Paguei caro.'], neutral: ['Vou com tudo. Seja o que for.'] } },

  { id: 'ambicioso', label: 'Ambicioso', desc: 'Quer ser o melhor do mundo, nunca satisfeito com o bom', icon: 'TrendingUp', color: 'primary',
    coachModifier: -0.05, sponsorModifier: 0.20, fanModifier: 0.10, growthModifier: 1.20, moraleVolatility: 1.0, injuryModifier: 1.05,
    interviewStyle: 'Determinado e focado no topo, fala de objetivos maiores.',
    quotes: { win: ['Mais um passo. O topo está perto.', 'Não me contento com pouco. Quero tudo.'], lose: ['Atrasa o plano, mas não para.', 'Cada derrota é um atraso no meu destino.'], neutral: ['Meu objetivo é ser o #1. Sempre foi.'] } },

  // ─── Mental ─────────────────────────────────────────────────────────────
  { id: 'estrategista', label: 'Estrategista', desc: 'Pensa o jogo xadrez à frente, estuda adversários', icon: 'Brain', color: 'purple',
    coachModifier: 0.15, sponsorModifier: 0.05, fanModifier: 0.0, growthModifier: 1.15, moraleVolatility: 0.5, injuryModifier: 0.85,
    interviewStyle: 'Analítico e tático, explica jogadas como um professor.',
    quotes: { win: ['O plano funcionou perfeitamente. Como previ.', 'Estudei cada movimento dele. Resultado previsto.'], lose: ['A estratégia falhou. Preciso recalibrar.', 'Ele leu meu plano. Erro meu.'], neutral: ['Cada adversário é um enigma a resolver.'] } },

  { id: 'resiliente', label: 'Resiliente', desc: 'Cai e levanta sempre, transforma adversidade em força', icon: 'Shield', color: 'green',
    coachModifier: 0.20, sponsorModifier: 0.15, fanModifier: 0.20, growthModifier: 1.10, moraleVolatility: 0.4, injuryModifier: 0.75,
    interviewStyle: 'Inspirador e perseverante, fala de superação.',
    quotes: { win: ['Cai tantas vezes. Hoje me levantei campeão.', 'A dor de ontem virou a força de hoje.'], lose: ['Caiu? Levanta. Sempre levanta.', 'Já superei pior. Vou superar isto.'], neutral: ['A vida me derrubou muitas vezes. Continuo de pé.'] } },

  { id: 'calmado', label: 'Calmado', desc: 'Paz interior em qualquer situação, neutraliza pressão', icon: 'Waves', color: 'cyan',
    coachModifier: 0.15, sponsorModifier: 0.10, fanModifier: 0.05, growthModifier: 1.05, moraleVolatility: 0.4, injuryModifier: 0.85,
    interviewStyle: 'Sereno e pacífico, transmite tranquilidade.',
    quotes: { win: ['A calma venceu. Como sempre.', 'Sem pressa, sem pânico. Resultado natural.'], lose: ['Tudo passa. Esta derrota também.', 'Mantenho a paz interior. O resto é ciclo.'], neutral: ['Respiro. Existo. Jogo. Simples.'] } },

  { id: 'sabio', label: 'Sábio', desc: 'Joga com inteligência de quem viu tudo, lê o jogo', icon: 'BookOpen', color: 'amber',
    coachModifier: 0.20, sponsorModifier: 0.10, fanModifier: 0.15, growthModifier: 1.05, moraleVolatility: 0.5, injuryModifier: 0.80,
    interviewStyle: 'Reflexivo e profundo, fala como um mentor.',
    quotes: { win: ['A experiência ensina. Hoje apliquei.', 'Cada ano me ensina mais que o anterior.'], lose: ['Toda derrota traz uma lição.', 'O sábio aprende até com a queda.'], neutral: ['Observo, aprendo, evoluo. Sempre.'] } },

  // ─── Style & Show ───────────────────────────────────────────────────────
  { id: 'showman', label: 'Showman', desc: 'Joga para a galera, faz jogadas espetaculares, ama holofote', icon: 'Sparkles', color: 'amber',
    coachModifier: -0.05, sponsorModifier: 0.25, fanModifier: 0.35, growthModifier: 1.0, moraleVolatility: 1.2, injuryModifier: 1.10,
    interviewStyle: 'Teatral e divertido, transforma entrevista em show.',
    quotes: { win: ['VIRAM ISSO?! Para vocês, meus fãs!', 'O show não para! Próxima cidade, gente!'], lose: ['Mesmo perdendo, dei show. Sempre.', 'A torcida merecia vitória. Devo mais.'], neutral: ['Peguem pipoca. O show vai começar.'] } },

  { id: 'elegante', label: 'Elegante', desc: 'Joga com classe e finesse, estilo impecável', icon: 'Gem', color: 'cyan',
    coachModifier: 0.10, sponsorModifier: 0.25, fanModifier: 0.15, growthModifier: 1.05, moraleVolatility: 0.6, injuryModifier: 0.85,
    interviewStyle: 'Refinado e polido, fala com classe e vocabulário rico.',
    quotes: { win: ['A elegância prevaleceu. Como deve ser.', 'Vencer com classe é a única forma.'], lose: ['Derrotas podem ser elegantes também.', 'Mesmo na queda, mantive a postura.'], neutral: ['Estilo é tudo. Dentro e fora da quadra.'] } },

  { id: 'brutal', label: 'Brutal', desc: 'Joga com potência extrema, sem cuidado estético', icon: 'Hammer', color: 'red',
    coachModifier: -0.05, sponsorModifier: 0.05, fanModifier: 0.10, growthModifier: 1.10, moraleVolatility: 1.3, injuryModifier: 1.40,
    interviewStyle: 'Direto e agressivo, fala baixo e com intensidade.',
    quotes: { win: ['ESMAGUEI. Simples assim.', 'Potência pura. Ele não teve chance.'], lose: ['Bati forte, mas não foi suficiente.', 'Faltou mais força. Sempre falta.'], neutral: ['Treino para destruir. Literalmente.'] } },

  // ─── Relational ─────────────────────────────────────────────────────────
  { id: 'leal', label: 'Leal', desc: 'Fiel a parceiros e treinadores, mantém laços longos', icon: 'Handshake', color: 'green',
    coachModifier: 0.25, sponsorModifier: 0.10, fanModifier: 0.10, growthModifier: 1.05, moraleVolatility: 0.6, injuryModifier: 0.90,
    interviewStyle: 'Grato e fiel, valoriza parcerias de longa data.',
    quotes: { win: ['Meu parceiro é meu irmão. Sempre.', 'Juntos há anos. Nada nos separa.'], lose: ['Meu parceiro contou comigo. Falhei.', 'Vamos superar juntos, como sempre.'], neutral: ['Lealdade é tudo. Parceiro é família.'] } },

  { id: 'solitario', label: 'Solitário', desc: 'Prefere treinar sozinho, evita vínculos, independente', icon: 'User', color: 'slate',
    coachModifier: -0.10, sponsorModifier: -0.05, fanModifier: -0.10, growthModifier: 1.0, moraleVolatility: 0.8, injuryModifier: 0.95,
    interviewStyle: 'Reservado e independente, evita falar de equipa.',
    quotes: { win: ['Ganhei sozinho. Como sempre.', 'Não preciso de ninguém para vencer.'], lose: ['Cuido dos meus erros. Sozinho.', 'Não esperem que eu culpe alguém.'], neutral: ['Prefiro treinar sozinho. Sempre.'] } },

  { id: 'motivador', label: 'Motivador', desc: 'Energiza a equipa, contagious positive energy', icon: 'Megaphone', color: 'primary',
    coachModifier: 0.20, sponsorModifier: 0.15, fanModifier: 0.25, growthModifier: 1.05, moraleVolatility: 0.7, injuryModifier: 0.90,
    interviewStyle: 'Energético e positivo, contagia otimismo.',
    quotes: { win: ['EQUIPA! Vocês são incríveis!', 'Juntos somos imbatíveis! Acreditem!'], lose: ['A cabeça erguida! Voltaremos!', 'Não desanimem! O próximo é nosso!'], neutral: ['Força, gente! Vamos com tudo!'] } },

  { id: 'teimoso', label: 'Teimoso', desc: 'Não aceita conselhos, faz do seu jeito, gera atrito', icon: 'Anchor', color: 'orange',
    coachModifier: -0.25, sponsorModifier: -0.05, fanModifier: -0.05, growthModifier: 0.95, moraleVolatility: 1.1, injuryModifier: 1.05,
    interviewStyle: 'Relutante e defensivo, resiste a críticas.',
    quotes: { win: ['Do meu jeito. Como sempre.', 'Eu disse que funcionava. Ninguém acreditou.'], lose: ['Não vou mudar. Meu jeito é certo.', 'O problema não sou eu.'], neutral: ['Faço do meu jeito. Sempre.'] } },

  { id: 'criativo', label: 'Criativo', desc: 'Inventa jogadas impossíveis, imprevisível e genial', icon: 'Lightbulb', color: 'purple',
    coachModifier: 0.0, sponsorModifier: 0.15, fanModifier: 0.25, growthModifier: 1.10, moraleVolatility: 1.0, injuryModifier: 1.0,
    interviewStyle: 'Imaginativo e original, fala de ideias e possibilidades.',
    quotes: { win: ['Ninguém viu aquela jogada vindo. Genial.', 'Criei algo novo hoje. Pura magia.'], lose: ['A ideia era boa, execução falhou.', 'Às vezes a criatividade trai.'], neutral: ['Tenho ideias novas a cada dia. Vou testar.'] } },

  // ─── Physical & Recovery ───────────────────────────────────────────────
  { id: 'durao', label: 'Durão', desc: 'Corpo de ferro, aguenta pancada, joga machucado', icon: 'Shield', color: 'slate',
    coachModifier: 0.05, sponsorModifier: 0.0, fanModifier: 0.05, growthModifier: 1.0, moraleVolatility: 0.7, injuryModifier: 0.60,
    interviewStyle: 'Simplório e direto, fala de resistência.',
    quotes: { win: ['Levei pancada, não cai. Ganhei.', 'Corpo de ferro. Mente de pedra.'], lose: ['Ele bateu forte. Mas eu voltarei.', 'Dói, mas passa. Sempre passa.'], neutral: ['Dor é temporária. O jogo continua.'] } },

  { id: 'talentoso', label: 'Talentoso', desc: 'Dom natural, aprende rápido, mas pode relaxar', icon: 'Sparkle', color: 'amber',
    coachModifier: 0.05, sponsorModifier: 0.15, fanModifier: 0.20, growthModifier: 1.15, moraleVolatility: 0.9, injuryModifier: 0.95,
    interviewStyle: 'Descontraído e confiante, fala de dom natural.',
    quotes: { win: ['Nasci para isso. Natural.', 'O talento falou mais alto. Novamente.'], lose: ['Até talento precisa de treino.', 'Subestimei. Não acontece de novo.'], neutral: ['Algumas coisas vêm fáceis para mim.'] } },

  { id: 'guerreiro', label: 'Guerreiro', desc: 'Luta cada ponto como se fosse o último, nunca desiste', icon: 'Swords', color: 'red',
    coachModifier: 0.15, sponsorModifier: 0.15, fanModifier: 0.25, growthModifier: 1.10, moraleVolatility: 0.8, injuryModifier: 0.85,
    interviewStyle: 'Bélico e determinado, fala de batalha e guerra.',
    quotes: { win: ['Guerra vencida. Batalha após batalha.', 'Lutei até o fim. Sempre luto.'], lose: ['Perdi a batalha, não a guerra.', 'Cairo mil vezes, levanto mil e uma.'], neutral: ['Cada jogo é uma guerra. Estou pronto.'] } },

  { id: 'novato_mentalidade', label: 'Mentalidade de Novato', desc: 'Age como estreante, ávido por aprender, instável', icon: 'Sprout', color: 'green',
    coachModifier: 0.10, sponsorModifier: 0.0, fanModifier: 0.05, growthModifier: 1.25, moraleVolatility: 1.3, injuryModifier: 1.0,
    interviewStyle: 'Animado e inexperiente, fala com empolgação de quem descobre.',
    quotes: { win: ['Mal posso acreditar! Meu primeiro grande resultado!', 'Estou aprendendo tanto! Que sonho!'], lose: ['Tanto a aprender ainda.', 'Cada jogo me ensina algo novo.'], neutral: ['Estou absorvendo tudo. Que experiência!'] } },

  { id: 'veterano_mentalidade', label: 'Mentalidade de Veterano', desc: 'Sagacidade de quem viveu tudo, mentor natural', icon: 'Award', color: 'amber',
    coachModifier: 0.20, sponsorModifier: 0.10, fanModifier: 0.15, growthModifier: 0.95, moraleVolatility: 0.4, injuryModifier: 0.85,
    interviewStyle: 'Experiente e reflexivo, fala com autoridade de quem viveu.',
    quotes: { win: ['Já venci muito. Mas cada vitória tem sabor.', 'A experiência me guia. Sempre guiou.'], lose: ['Já perdi muito mais. Faz parte.', 'Os anos me ensinaram a perder com classe.'], neutral: ['Vivi demais neste esporte. Tenho histórias.'] } },

  // ─── Rare / Special ────────────────────────────────────────────────────
  { id: 'lenda_mentalidade', label: 'Mentalidade de Lenda', desc: 'Raríssimo. Mentalidade de campeão histórico', icon: 'Crown', color: 'amber',
    coachModifier: 0.25, sponsorModifier: 0.25, fanModifier: 0.30, growthModifier: 1.20, moraleVolatility: 0.5, injuryModifier: 0.80,
    interviewStyle: 'Majestoso e inspirador, fala como quem já é imortal.',
    quotes: { win: ['O legado continua. Sempre.', 'Campeões não nascem. Se constroem. Eu me construí.'], lose: ['Até lendes caem. Mas se levantam.', 'A história não termina aqui.'], neutral: ['Meu nome já está na história. O resto é bônus.'] } },

  { id: 'dark_horse', label: 'Cavalo Negro', desc: 'Imprevisível, pode explodir ou desaparecer, subestimado', icon: 'Eye', color: 'slate',
    coachModifier: 0.0, sponsorModifier: 0.05, fanModifier: 0.10, growthModifier: 1.10, moraleVolatility: 1.5, injuryModifier: 1.0,
    interviewStyle: 'Enigmático e reservado, surpreende a cada entrevista.',
    quotes: { win: ['Ninguém esperava. Eu sim.', 'Subestimem-me. Sempre.'], lose: ['Hoje não era meu dia. Ou era?', 'Imprevisível, eu mesmo me surpreendo.'], neutral: ['Não me subestime. Ou subestime. Veremos.'] } },

  { id: 'metodico', label: 'Metódico', desc: 'Analisa cada detalhe, segue rotina rígida, perfeccionista', icon: 'ListChecks', color: 'cyan',
    coachModifier: 0.20, sponsorModifier: 0.10, fanModifier: -0.05, growthModifier: 1.15, moraleVolatility: 0.5, injuryModifier: 0.85,
    interviewStyle: 'Sistemático e detalhado, explica processos passo a passo.',
    quotes: { win: ['Seguimos o protocolo. Resultado esperado.', 'Cada etapa foi executada com precisão.'], lose: ['Erro no processo. Vou revisar cada etapa.', 'A metodologia precisa de ajuste.'], neutral: ['Cada detalhe importa. Eu controlo todos.'] } },

  { id: 'passional', label: 'Passional', desc: 'Vive e joga com paixão extrema, entrega alma à quadra', icon: 'Flame', color: 'red',
    coachModifier: 0.05, sponsorModifier: 0.15, fanModifier: 0.30, growthModifier: 1.10, moraleVolatility: 1.4, injuryModifier: 1.10,
    interviewStyle: 'Emocional e vibrante, fala de amor ao esporte.',
    quotes: { win: ['AMO este jogo! Amo cada segundo!', 'Minha alma está na quadra. Sempre esteve.'], lose: ['Dói na alma. Mais que no corpo.', 'A paixão às vezes me consome.'], neutral: ['Respiro padel. Vivo padel. Tudo é padel.'] } },

  { id: 'calculista', label: 'Calculista', desc: 'Frio e calculista, usa cada situação a seu favor', icon: 'Scale', color: 'purple',
    coachModifier: 0.0, sponsorModifier: 0.10, fanModifier: -0.05, growthModifier: 1.10, moraleVolatility: 0.5, injuryModifier: 0.85,
    interviewStyle: 'Estratégico e frio, fala como um enxadrista.',
    quotes: { win: ['Cada movimento foi calculado. Xeque-mate.', 'A vitória era matemática. Resultado óbvio.'], lose: ['Meu cálculo falhou. Reajustando.', 'A equação não fechou. Vou revisar.'], neutral: ['Tudo é estratégia. Tudo é cálculo.'] } },

  { id: 'misterioso', label: 'Misterioso', desc: 'Pouco se sabe sobre ele, guardado, enigmático', icon: 'EyeOff', color: 'slate',
    coachModifier: -0.05, sponsorModifier: 0.10, fanModifier: 0.15, growthModifier: 1.0, moraleVolatility: 0.7, injuryModifier: 0.95,
    interviewStyle: 'Enigmático e vago, responde sem revelar nada.',
    quotes: { win: ['... Vitória.', 'O que aconteceu, aconteceu.'], lose: ['...', 'Não há nada a dizer.'], neutral: ['Talvez. Ou talvez não. Quem sabe?'] } },
];

// ─── Trait Map & Helpers ───────────────────────────────────────────────────

export const TRAIT_MAP = PERSONALITY_TRAITS.reduce((acc, t) => { acc[t.id] = t; return acc; }, {});

export function getTraitMeta(id) {
  return TRAIT_MAP[id] || PERSONALITY_TRAITS[0];
}

export function getTraitsMeta(ids = []) {
  return (ids || []).map(id => TRAIT_MAP[id]).filter(Boolean);
}

// ─── Aggregate trait effects for an athlete ───────────────────────────────

export function computeTraitEffects(traitIds = []) {
  const traits = getTraitsMeta(traitIds);
  if (traits.length === 0) {
    return {
      coachModifier: 0, sponsorModifier: 0, fanModifier: 0,
      growthModifier: 1.0, moraleVolatility: 1.0, injuryModifier: 1.0,
    };
  }
  const sum = traits.reduce((acc, t) => ({
    coachModifier: acc.coachModifier + (t.coachModifier || 0),
    sponsorModifier: acc.sponsorModifier + (t.sponsorModifier || 0),
    fanModifier: acc.fanModifier + (t.fanModifier || 0),
    growthModifier: acc.growthModifier * (t.growthModifier || 1),
    moraleVolatility: acc.moraleVolatility * (t.moraleVolatility || 1),
    injuryModifier: acc.injuryModifier * (t.injuryModifier || 1),
  }), { coachModifier: 0, sponsorModifier: 0, fanModifier: 0, growthModifier: 1, moraleVolatility: 1, injuryModifier: 1 });

  // Average the additive modifiers
  return {
    coachModifier: sum.coachModifier / traits.length,
    sponsorModifier: sum.sponsorModifier / traits.length,
    fanModifier: sum.fanModifier / traits.length,
    growthModifier: sum.growthModifier, // multiplicative
    moraleVolatility: sum.moraleVolatility, // multiplicative
    injuryModifier: sum.injuryModifier, // multiplicative
  };
}

// ─── Interview generation ─────────────────────────────────────────────────

export function generateInterviewQuote(traitIds = [], context = 'neutral') {
  const traits = getTraitsMeta(traitIds);
  if (traits.length === 0) return 'Sem comentários.';

  // Pick a random trait for the quote
  const trait = traits[Math.floor(Math.random() * traits.length)];
  const quotes = trait.quotes?.[context] || trait.quotes?.neutral || ['Sem comentários.'];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

export function getInterviewStyle(traitIds = []) {
  const traits = getTraitsMeta(traitIds);
  if (traits.length === 0) return 'Sem estilo definido.';
  // Combine first 2 traits' interview styles
  return traits.slice(0, 2).map(t => t.interviewStyle).join(' ');
}

// ─── Trait assignment ─────────────────────────────────────────────────────

// Assign 3-4 traits to an athlete based on their name hash for determinism.
// Ensures no conflicting traits (e.g., 'humilde' + 'arrogante').
const CONFLICTS = {
  humilde: ['arrogante', 'provocador'],
  arrogante: ['humilde', 'leal'],
  lider: ['solitario', 'introvertido'],
  solitario: ['lider', 'motivador', 'carismatico'],
  frio: ['explosivo', 'emocional', 'passional', 'mercurial'],
  explosivo: ['frio', 'calmado'],
  preguicoso: ['trabalhador', 'disciplinado', 'perfeccionista'],
  trabalhador: ['preguicoso'],
};

export function assignTraits(name, existingPersonalityId) {
  if (!name) return [];
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h) + name.charCodeAt(i);
    h = h & h;
  }
  h = Math.abs(h);

  const numTraits = 3 + (h % 2); // 3 or 4 traits
  const assigned = [];
  const used = new Set();
  const traitPool = [...PERSONALITY_TRAITS];

  // If personality ID exists, try to include a matching trait first
  const personalityTraitMatch = PERSONALITY_TRAITS.find(t => t.id === existingPersonalityId);
  if (personalityTraitMatch) {
    assigned.push(personalityTraitMatch);
    used.add(personalityTraitMatch.id);
  }

  // Shuffle pool deterministically
  for (let i = traitPool.length - 1; i > 0; i--) {
    const j = (h >> (i % 16)) % (i + 1);
    [traitPool[i], traitPool[j]] = [traitPool[j], traitPool[i]];
  }

  for (const trait of traitPool) {
    if (assigned.length >= numTraits) break;
    if (used.has(trait.id)) continue;

    // Check conflicts
    const conflicts = CONFLICTS[trait.id] || [];
    const hasConflict = assigned.some(a => conflicts.includes(a.id) || (CONFLICTS[a.id] || []).includes(trait.id));
    if (hasConflict) continue;

    assigned.push(trait);
    used.add(trait.id);
  }

  return assigned.map(t => t.id);
}