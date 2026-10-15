import { createTournamentEditionId } from './tournamentIntegrity.js';
import { fnv1aHash } from './hashUtils.js';
import { getBalance527 } from './balance527.js';

export const WORLD_TOUR_VERSION = '0.5.0-alpha.1';
export const WORLD_PLAYER_CAPACITY = 5000;

// Fase 3, item 3A.1 — "cada rodada anterior vale ~60% da seguinte, padrão
// do circuito real". Worked example dado pelo usuário para Crown:
// 2000/1200/720/360/180/90 — os passos reais são [0.6, 0.6, 0.5, 0.5, 0.5]
// (não um 60% uniforme; a decolagem do topo é mais suave, o fundo decai
// mais rápido — confirmado batendo os números exatos). Esta MESMA
// sequência de razões é aplicada a TODOS os tiers, truncada ao número de
// rodadas que o tamanho da chave produz — gera a tabela em config, a
// partir de UM único parâmetro por tier (pontos do campeão), em vez de
// cada tier carregar sua própria lista de números mágicos desalinhados.
const ROUND_DECAY_RATIOS = Object.freeze([1, 0.6, 0.36, 0.18, 0.09, 0.045]);

// Rótulos de rodada por número de rodadas da chave principal (da entrada
// ao campeão) — 4 chaves possíveis nesta escada: 8 (3 rodadas), 16 (4),
// 24 (5, primeira rodada comprimida com byes) e 32 (5). "entrada" nomeia a
// primeira rodada de forma genérica porque o tamanho real dela varia (8
// perdedores numa chave de 24 com bye, 16 numa chave de 32) — a simulação
// de fundo (WorldTourLifecycle.js) não modela byes individualmente, só
// classifica por posição no ranking do dia, então o rótulo genérico evita
// alegar uma rodada que o motor não desenha de fato.
const ROUND_LABELS_BY_COUNT = Object.freeze({
  3: Object.freeze(['quarterfinal', 'semifinal', 'final', 'champion']),
  4: Object.freeze(['r16', 'quarterfinal', 'semifinal', 'final', 'champion']),
  5: Object.freeze(['entry', 'r16', 'quarterfinal', 'semifinal', 'final', 'champion']),
});

// Rótulos de exibição das rodadas (campanha do jogador, MainDrawManager/
// tournamentSchedule.js) — quantas rodadas o CAMPEÃO precisa vencer,
// não inclui o próprio "champion" (esse é o resultado, não uma rodada).
// Diferente de ROUND_LABELS_BY_COUNT (pontuação, genérico por CONTAGEM de
// rodadas — 24 e 32 dividem o mesmo formato), aqui a 1ª rodada é
// rotulada pelo TAMANHO real da chave (R24/R32) — é uma tela pro
// jogador, então vale nomear com precisão o que ele está vendo, mesmo
// quando a simulação de fundo não desenha byes rodada a rodada.
const DISPLAY_ROUNDS_BY_DRAW_SIZE = Object.freeze({
  8: Object.freeze([{ label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' }]),
  16: Object.freeze([{ label: 'Oitavas de Final', short: 'R16' }, { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' }]),
  // Fase 5.6 — chave de 20 (Elite/Crown, escada recalibrada). Mesma
  // contagem de rodadas (5) e formato da de 24: a 1ª rodada é comprimida
  // com byes (a simulação de fundo não os desenha, só classifica por
  // posição), então o rótulo genérico "Primeira Rodada" evita alegar
  // uma rodada de tamanho fixo que a chave não tem.
  20: Object.freeze([{ label: 'Primeira Rodada', short: 'R20' }, { label: 'Oitavas de Final', short: 'R16' }, { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' }]),
  24: Object.freeze([{ label: 'Primeira Rodada', short: 'R24' }, { label: 'Oitavas de Final', short: 'R16' }, { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' }]),
  32: Object.freeze([{ label: 'Rodada de 32', short: 'R32' }, { label: 'Oitavas de Final', short: 'R16' }, { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' }]),
});

// roundCount = quantas rodadas o campeão vence (3 → chave de 8; 4 → chave
// de 16; 5 → chave de 24 OU 32, mesmo número de rodadas em ambas — a de
// 24 só comprime a 1ª rodada com byes, não adiciona uma rodada a mais).
function roundCountForDrawSize(drawSize) {
  if (drawSize <= 8) return 3;
  if (drawSize <= 16) return 4;
  return 5;
}

// Fase 3, item 3D (proposta, pendente de confirmação — ver relatório):
// moedas calibradas contra a economia existente (salário de parceiro
// ~80-200/mês via defaultSalary em partnerLifecycle.js, saldo inicial de
// 100 moedas em padel.js) — multiplicador único (15×) sobre os pontos de
// ranking do campeão de cada tier, escolhido para que Bronze (150 moedas)
// cubra ~1 mês de salário de um parceiro iniciante e Crown (30.000)
// equivalha a 300× o saldo inicial do jogador. Reaproveita a MESMA
// sequência de decaimento por rodada que os pontos de ranking usam —
// nenhuma tabela paralela de números escolhidos a dedo.
const PRIZE_COINS_PER_RANK_POINT = 15;
// XP não foi pedido para calibração contra a economia (só moedas) —
// mantém a MESMA forma de crescimento da tabela antiga (Silver→Crown
// ~16,4×), estendida para os 9 tiers, escalada pelos pontos de ranking de
// cada tier (não pelas moedas, que crescem numa razão diferente).
const XP_PER_RANK_POINT = 1.4;

function buildRoundTable(championValue, roundCount) {
  const ratios = ROUND_DECAY_RATIOS.slice(0, roundCount + 1);
  return Object.freeze(ratios.map((ratio) => Math.round(championValue * ratio)).reverse());
}

// Playthrough 5.27-F (só presets -E, IA e jogador iguais) — PONTOS DE RANKING
// da derrota na 1ª rodada nos tiers com corte (Gold+). Medido: sem vencer, um
// jogador subia por derrotas cada vez mais caras (Masters R1 = 23 pts ≈ título
// de Silver), abrindo Platinum/Masters e chegando ao top-150 com ~0% de
// vitórias. Só o 1º degrau muda; vitórias, rodadas finais e título intactos;
// Bronze/Silver (entrada) e moedas/XP inalterados.
function buildRankPointsTable(definition, roundCount) {
  const table = buildRoundTable(definition.rankPoints, roundCount);
  const ratio = Number(getBalance527().competition?.gatedFirstRoundLossPointsRatio);
  if (!(definition.minRanking > 0) || !Number.isFinite(ratio)) return table;
  const firstLoss = Math.max(1, Math.round(definition.rankPoints * ratio));
  return Object.freeze([Math.min(table[0], firstLoss), ...table.slice(1)]);
}

function buildTier(definition) {
  const roundCount = roundCountForDrawSize(definition.mainDrawSize);
  // `championPrize`/`championXp` explícitos (usado só pela Exibição,
  // abaixo — precisa de moeda real com ZERO ponto de ranking, e prize/xp
  // não podem ser derivados de rankPoints=0 nesse caso) vencem o cálculo
  // padrão de qualquer tier real da escada de 9.
  const prize = Math.round(Number.isFinite(definition.championPrize) ? definition.championPrize : definition.rankPoints * PRIZE_COINS_PER_RANK_POINT * getBalance527().prizeMultiplier);
  const xp = Math.round(Number.isFinite(definition.championXp) ? definition.championXp : definition.rankPoints * XP_PER_RANK_POINT);
  // Salvaguarda: se um tamanho de chave futuro não tiver rótulos de
  // exibição dedicados em DISPLAY_ROUNDS_BY_DRAW_SIZE, avisa alto (em vez
  // de deixar `displayRounds` undefined, quebrando MainDrawManager/
  // tournamentSchedule.js silenciosamente) e cai pros rótulos genéricos
  // por CONTAGEM de rodada.
  let displayRounds = DISPLAY_ROUNDS_BY_DRAW_SIZE[definition.mainDrawSize];
  if (!displayRounds) {
    console.warn(`[circuitCatalog] tier "${definition.shortLabel}": sem rótulos de rodada dedicados para mainDrawSize=${definition.mainDrawSize} — usando rótulos genéricos.`);
    displayRounds = ROUND_LABELS_BY_COUNT[roundCount].slice(0, -1).map((key) => ({ label: key, short: key.toUpperCase().slice(0, 3) }));
  }
  return Object.freeze({
    ...definition,
    prize,
    xp,
    qualifyingSize: definition.qualifyingSize || 0,
    roundCount,
    // Do "entrada" (1ª rodada perdida) ao campeão — mesmo comprimento de
    // roundLabels, índice a índice.
    roundPoints: buildRankPointsTable(definition, roundCount),
    roundCoins: buildRoundTable(prize, roundCount),
    roundXp: buildRoundTable(xp, roundCount),
    roundLabels: ROUND_LABELS_BY_COUNT[roundCount],
    displayRounds,
  });
}

// Fase 3, item 3A — escada de 9 tiers (era 6). `order` segue a ordem da
// tabela pedida (não é só "força crescente": Circuit Finals, um
// convidativo de fim de mini-temporada só para o Top 8, vale menos pontos
// que Platinum de propósito — mesmo padrão de "Finals" do circuito real,
// mérito de acesso ≠ valor de pontos). `minRanking` é a ÚNICA declaração
// de corte de acesso por tier — EntryManager.js já lê `config.minRanking`
// (nenhuma regra paralela hardcoded por nome de tier a corrigir aqui;
// achado #16 da auditoria original já garantia isso desde a Fase 1A).
//
// Fase 5.6 — escada recalibrada (Candidato B, FASE-5.5-RELATORIO §3.4).
// A Fase 5.4/5.5 mediu a demanda/capacidade de regime por tier em
// Gold 9,6× → Platinum 4,7× → Masters 3,7× → Elite 1,3× → Crown 1,4× —
// os cortes da Fase 3 (800/500/300/150/80) foram calibrados pra uma
// pergunta diferente, e a capacidade estava invertida (Elite tinha a
// MAIOR chave, 32, e o menor pool). Cortes apertados pra
// 450/320/230/140/75 (a razão segue `≈ k · pool / drawSize`, medido);
// chaves de Elite e Crown de 32 → 20 (a demanda deles nunca encheu 32).
// O Gold fica em ~5× de propósito — a primeira porta acima da base é
// onde mais gente empurra, como no circuito real; forçá-lo a ~3× ou
// devolve transbordo à base (corte a ~350) ou não move a razão (mais
// eventos — medido). Característica, não defeito.
export const TOURNAMENT_TIER_CONFIG = Object.freeze({
  Bronze: buildTier({
    label: 'Legacy Bronze', shortLabel: 'Bronze', order: 0,
    description: 'Primeiro degrau do circuito mundial, aberto a qualquer atleta — o lugar onde toda carreira profissional começa.',
    entryFee: 10, rankPoints: 10, difficultyModifier: -3,
    mainDrawSize: 16, minLevel: 'Iniciante', minRanking: 0,
    prestige: 14, exposure: 10, tradition: 15, durationDays: 4,
  }),
  Silver: buildTier({
    label: 'Legacy Silver', shortLabel: 'Silver', order: 1,
    description: 'Porta de entrada consolidada do circuito mundial, com campos amplos e oportunidades constantes de pontuar.',
    entryFee: 20, rankPoints: 25, difficultyModifier: -2,
    mainDrawSize: 16, minLevel: 'Iniciante', minRanking: 0,
    prestige: 22, exposure: 18, tradition: 25, durationDays: 4,
  }),
  Gold: buildTier({
    label: 'Legacy Gold', shortLabel: 'Gold', order: 2,
    description: 'Evento internacional de desenvolvimento, com boa relação entre risco, pontos e custos.',
    entryFee: 45, rankPoints: 100, difficultyModifier: -1,
    // Fase 8.1, item 2 — `qualifyingSize` habilita o caminho de qualifying
    // do JOGADOR (EntryManager.js) neste tier; antes só Crown tinha. Mesmo
    // valor de Crown (16 → 3 rodadas, getTournamentQualifyingRoundCount).
    // Playthrough 5.3, Parte F/G — 24→16 (-33%) testado EM CONJUNTO com a
    // elegibilidade AI já estreitada (getAiQualifyingLimit, Parte J/K/L,
    // 900→645) e MEDIDO COM RESULTADO NEGATIVO: Gold avgOVR caiu (70.1→
    // 68.5) e o gap contra Silver AUMENTOU, não diminuiu — confirma, com a
    // elegibilidade já corrigida, o mesmo achado da 5.2 (draw size menor
    // não ajuda) — revertido. diag-tier-qualifying-buckets.mjs (scripts/)
    // mostrou a causa real: mesmo dentro da faixa de rank correta
    // (451-600, já elegível tanto antes quanto depois do novo limite),
    // essa banda tem avgOVR real de só 58,5 — rank e OVR são fracamente
    // acoplados neste mundo (rank reflete resultado ACUMULADO, não
    // talento puro), e Gold precisa de tanto VOLUME (818
    // participações/ano) que não existe profundidade de talento
    // suficiente dentro da própria faixa de rank correta pra preencher
    // sem diluir — reduzir vagas ainda mais só piora a seleção disponível
    // por semana, não melhora.
    mainDrawSize: 24, qualifyingSize: 16, minLevel: 'Iniciante', minRanking: 450, // Fase 5.6: 800 → 450
    prestige: 38, exposure: 32, tradition: 40, durationDays: 5,
  }),
  Platinum: buildTier({
    label: 'Legacy Platinum', shortLabel: 'Platinum', order: 3,
    description: 'Principal nível do circuito de acesso, capaz de transformar uma temporada com um grande resultado.',
    entryFee: 90, rankPoints: 200, difficultyModifier: 0,
    mainDrawSize: 32, qualifyingSize: 16, minLevel: 'Amador', minRanking: 320, // Fase 5.6: 500 → 320
    prestige: 56, exposure: 52, tradition: 58, durationDays: 6,
  }),
  'Circuit Finals': buildTier({
    label: 'Legacy Circuit Finals', shortLabel: 'Circuit Finals', order: 4,
    description: 'Fechamento do circuito base da temporada — só os 8 melhores do ranking entram, sem inscrição por convite ou wildcard.',
    entryFee: 0, rankPoints: 150, difficultyModifier: 2,
    mainDrawSize: 8, minLevel: 'Avançado', minRanking: 8,
    prestige: 68, exposure: 58, tradition: 50, durationDays: 3,
  }),
  Masters: buildTier({
    label: 'Legacy Masters', shortLabel: 'Masters', order: 5,
    description: 'Primeiro nível da elite mundial, com chaves competitivas e presença frequente de atletas de ponta.',
    entryFee: 180, rankPoints: 500, difficultyModifier: 1,
    mainDrawSize: 24, qualifyingSize: 16, minLevel: 'Competitivo', minRanking: 230, // Fase 5.6: 300 → 230
    prestige: 72, exposure: 70, tradition: 68, durationDays: 5,
  }),
  Elite: buildTier({
    label: 'Legacy Elite', shortLabel: 'Elite', order: 6,
    description: 'Grandes eventos da temporada, reservados às melhores duplas ou a convidados de alto prestígio.',
    entryFee: 320, rankPoints: 1000, difficultyModifier: 2,
    mainDrawSize: 20, qualifyingSize: 16, minLevel: 'Avançado', minRanking: 140, // Fase 5.6: draw 32 → 20, corte 150 → 140
    prestige: 88, exposure: 88, tradition: 82, durationDays: 6,
  }),
  Crown: buildTier({
    label: 'Legacy Crown', shortLabel: 'Crown', order: 7,
    description: 'Os eventos máximos do Padel Legacy World Tour, onde história, pressão e legado se encontram.',
    entryFee: 500, rankPoints: 2000, difficultyModifier: 3,
    mainDrawSize: 20, qualifyingSize: 16, minLevel: 'Avançado', minRanking: 75, // Fase 5.6: draw 32 → 20, corte 80 → 75
    prestige: 100, exposure: 100, tradition: 96, durationDays: 8,
  }),
  'Legacy Finals': buildTier({
    label: 'Legacy Finals', shortLabel: 'Legacy Finals', order: 8,
    description: 'O evento máximo de duplas do ano — só as 16 melhores parcerias do ranking de duplas disputam, por convite direto.',
    entryFee: 0, rankPoints: 1500, difficultyModifier: 3,
    // A chave tem as mesmas 16 duplas que o convite declara. A autoridade
    // desse convite é TeamRanking (WorldTourLifecycle), não uma aproximação
    // pela média de ranking individual nem um corte posterior por OVR.
    mainDrawSize: 16, minLevel: 'Avançado', minRanking: 16,
    prestige: 98, exposure: 95, tradition: 40, durationDays: 3,
  }),
  // Fase 3, item 3C.2 — Pré-Temporada/Exibição: NÃO faz parte da escada
  // competitiva (fora de TIER_EVENTS_PER_YEAR/WEEK_PROGRAM de propósito —
  // um evento ÚNICO por carreira, criado por buildPreSeasonExhibition,
  // nunca repetido todo ano). Mora aqui mesmo assim (não num objeto
  // separado) porque TUDO que lê "config de um tier por nome"
  // (getTournamentTierConfig — EntryManager indiretamente via
  // buildAthleteEntryContext, career.js:getTournamentRewards/
  // getTournamentDifficulty, tournamentSchedule.js) precisa resolver
  // "Exibição" corretamente, não cair no fallback de Silver (que tem
  // rankPoints > 0 — premiaria pontos de ranking por um evento que não
  // pode dar nenhum). `rankPoints:0` propaga sozinho pra
  // roundPoints=[0,0,0,0] via buildRoundTable; `championPrize`/
  // `championXp` (não derivados de rankPoints, que aqui é zero de
  // propósito) dão a "premiação pequena mas real" pedida.
  Exibição: buildTier({
    label: 'Pré-Temporada', shortLabel: 'Exibição', order: -1,
    description: 'Torneio de pré-temporada, sem pontos de ranking — o primeiro contato do circuito com a nova safra de duplas.',
    entryFee: 0, rankPoints: 0, championPrize: 60, championXp: 80, difficultyModifier: -3,
    mainDrawSize: 8, minLevel: 'Iniciante', minRanking: 0,
    prestige: 8, exposure: 6, tradition: 2, durationDays: 3,
  }),
});

export const WORLD_TOUR_CITIES = Object.freeze([
  { code:'LIS', city:'Lisboa', country:'Portugal', region:'Europa', surface:'indoor' },
  { code:'MAD', city:'Madri', country:'Espanha', region:'Europa', surface:'vidro' },
  { code:'BCN', city:'Barcelona', country:'Espanha', region:'Europa', surface:'vidro' },
  { code:'PAR', city:'Paris', country:'França', region:'Europa', surface:'indoor' },
  { code:'ROM', city:'Roma', country:'Itália', region:'Europa', surface:'cimento' },
  { code:'MIL', city:'Milão', country:'Itália', region:'Europa', surface:'indoor' },
  { code:'AMS', city:'Amsterdã', country:'Países Baixos', region:'Europa', surface:'indoor' },
  { code:'STO', city:'Estocolmo', country:'Suécia', region:'Europa', surface:'indoor' },
  { code:'CPH', city:'Copenhague', country:'Dinamarca', region:'Europa', surface:'indoor' },
  { code:'BER', city:'Berlim', country:'Alemanha', region:'Europa', surface:'indoor' },
  { code:'VIE', city:'Viena', country:'Áustria', region:'Europa', surface:'indoor' },
  { code:'PRA', city:'Praga', country:'Tchéquia', region:'Europa', surface:'indoor' },
  { code:'ATH', city:'Atenas', country:'Grécia', region:'Europa', surface:'outdoor' },
  { code:'IST', city:'Istambul', country:'Turquia', region:'Europa/Ásia', surface:'indoor' },
  { code:'LON', city:'Londres', country:'Reino Unido', region:'Europa', surface:'indoor' },
  { code:'DUB', city:'Dubai', country:'Emirados Árabes Unidos', region:'Oriente Médio', surface:'indoor' },
  { code:'DOH', city:'Doha', country:'Catar', region:'Oriente Médio', surface:'indoor' },
  { code:'RIY', city:'Riad', country:'Arábia Saudita', region:'Oriente Médio', surface:'indoor' },
  { code:'CAI', city:'Cairo', country:'Egito', region:'África', surface:'outdoor' },
  { code:'CAS', city:'Casablanca', country:'Marrocos', region:'África', surface:'outdoor' },
  { code:'CPT', city:'Cidade do Cabo', country:'África do Sul', region:'África', surface:'outdoor' },
  { code:'NAI', city:'Nairóbi', country:'Quênia', region:'África', surface:'outdoor' },
  { code:'TOK', city:'Tóquio', country:'Japão', region:'Ásia', surface:'indoor' },
  { code:'OSA', city:'Osaka', country:'Japão', region:'Ásia', surface:'indoor' },
  { code:'SEO', city:'Seul', country:'Coreia do Sul', region:'Ásia', surface:'indoor' },
  { code:'SHA', city:'Xangai', country:'China', region:'Ásia', surface:'indoor' },
  { code:'SIN', city:'Singapura', country:'Singapura', region:'Ásia', surface:'indoor' },
  { code:'BKK', city:'Bangkok', country:'Tailândia', region:'Ásia', surface:'indoor' },
  { code:'MUM', city:'Mumbai', country:'Índia', region:'Ásia', surface:'indoor' },
  { code:'SYD', city:'Sydney', country:'Austrália', region:'Oceania', surface:'outdoor' },
  { code:'MEL', city:'Melbourne', country:'Austrália', region:'Oceania', surface:'indoor' },
  { code:'AKL', city:'Auckland', country:'Nova Zelândia', region:'Oceania', surface:'outdoor' },
  { code:'MIA', city:'Miami', country:'Estados Unidos', region:'América do Norte', surface:'outdoor' },
  { code:'NYC', city:'Nova York', country:'Estados Unidos', region:'América do Norte', surface:'indoor' },
  { code:'LAX', city:'Los Angeles', country:'Estados Unidos', region:'América do Norte', surface:'outdoor' },
  { code:'TOR', city:'Toronto', country:'Canadá', region:'América do Norte', surface:'indoor' },
  { code:'MEX', city:'Cidade do México', country:'México', region:'América do Norte', surface:'outdoor' },
  { code:'CUN', city:'Cancún', country:'México', region:'América do Norte', surface:'outdoor' },
  { code:'SAO', city:'São Paulo', country:'Brasil', region:'América do Sul', surface:'indoor' },
  { code:'RIO', city:'Rio de Janeiro', country:'Brasil', region:'América do Sul', surface:'outdoor' },
  { code:'BUE', city:'Buenos Aires', country:'Argentina', region:'América do Sul', surface:'vidro' },
  { code:'COR', city:'Córdoba', country:'Argentina', region:'América do Sul', surface:'indoor' },
  { code:'MON', city:'Montevidéu', country:'Uruguai', region:'América do Sul', surface:'outdoor' },
  { code:'SAN', city:'Santiago', country:'Chile', region:'América do Sul', surface:'outdoor' },
  { code:'LIM', city:'Lima', country:'Peru', region:'América do Sul', surface:'outdoor' },
  { code:'BOG', city:'Bogotá', country:'Colômbia', region:'América do Sul', surface:'indoor' },
]);

// Playthrough 4.4 — calendário anual distribuído por config em
// vez de uma lista de 80 tuplas escritas à mão. `Bronze`+`Silver` (os
// únicos tiers com `minRanking:0`, item 3C.1) somam 40 eventos/ano — a
// densidade que sustenta a meta de intervalo do jogador em #1000 (medida
// em scripts/diag-tier-ladder-calendar-fase3.mjs, relatório da Fase 3).
// Circuit Finals/Legacy Finals são de propósito eventos ÚNICOS de fim de
// temporada (não entram na distribuição regular) — só fazem sentido depois
// que a maior parte do "circuito base" do ano já aconteceu, pra que
// "top 8"/"top 16" already reflita uma temporada real, não um sorteio de
// janeiro.
// Playthrough 4.4 — calendário de elite rebalanceado: Masters=12, Elite=6,
// Crown=2 (antes 44/10/4, o "topo-120" da Fase 8.7). Validado empiricamente
// (regime-check da espiral de exclusão, reincidência 0% igual ao baseline
// anterior; top-10 convergindo para os grandes eventos; 0% de cancelamento
// em todos os tiers) contra os invariantes das Fases 7-8. Cada tier
// top-tier tem no máximo 1 evento simultâneo — Masters/Elite/Crown nunca
// competem entre si na mesma semana, evitando fragmentar a elite.
// Playthrough 5.2, Parte F/G — Gold PERMANECE em 35 eventos/ano, 24
// vagas/evento (valores originais). diag-tier-capacity-economy.mjs
// (scripts/) provou o desequilíbrio de capacidade com números reais:
// apenas 18.8% do campo real de Gold, numa temporada inteira, tinha rank
// DENTRO do próprio platô ideal de Gold (rankingFit=100) — contra 53.9%
// em Silver e 86.5% em Bronze; "capacityPressure" (vagas anuais ÷
// população natural × repetição de referência) saiu 5-11x acima do
// equilíbrio pra Gold. MAS duas correções incrementais e isoladas foram
// testadas com essa evidência em mãos e MEDIDAS COM RESULTADO NEGATIVO
// (Parte F/G, diag-tier-choice-rebalance.mjs):
//   - só frequência (35→26, -25.7%): Gold vs Silver não mudou de forma
//     relevante (avgOVR Gold=70.3 vs Silver=77.0, gap igual ou pior que
//     o baseline 70.0/76.1).
//   - só tamanho de chave (24→20, -16.7%, frequência revertida a 35):
//     mesmo resultado nulo (Gold=69.5 vs Silver=76.5).
// Conclusão: o gargalo não é capacidade/vagas — é a LARGURA do pool
// ELEGÍVEL que compete por essas vagas (qualifyingLimit em
// EntryManager.js, que escala multiplicativamente com minRanking e por
// isso fica proporcionalmente mais larga pra Gold, o tier pago com o
// maior minRanking). Reduzir vagas não muda QUEM disputa cada vaga
// restante — o mesmo pool amplo de candidatos "elegíveis mas não
// ideais" continua vencendo a disputa. Estreitar qualifyingLimit
// resolveria, mas essa fórmula é COMPARTILHADA com a elegibilidade de
// INSCRIÇÃO do jogador (tournamentRegistration.js) — fora do escopo
// autorizado desta fase (Parte Z: "não reescrever... inscrições").
// Documentado como pendência explícita pra uma fase futura com escopo
// pra tocar elegibilidade/inscrição — não uma correção às cegas, uma
// negativa comprovada com evidência preservada pra quem continuar.
export const TIER_EVENTS_PER_YEAR = Object.freeze({
  Bronze: 24, Silver: 16, Gold: 35, Platinum: 27, Masters: 12, Elite: 6, Crown: 2,
});
const REGULAR_SEASON_LAST_WEEK = 47;
const SEASON_FINALE_WEEKS = Object.freeze({ 'Circuit Finals': 49, 'Legacy Finals': 52 });
// Deslocamento (em semanas) de cada tier dentro da distribuição regular —
// existe só pra os tiers não caírem todos na mesma semana quando as
// cadências batem (ex.: Bronze a cada ~1,9 semana e Silver a cada ~2,9
// nunca coincidem por causa do deslocamento relativo de 1 semana).
const TIER_WEEK_OFFSET = Object.freeze({ Bronze: 0, Silver: 1, Gold: -1, Platinum: 2, Masters: -2, Elite: 1, Crown: 0 });

// Semana em que a temporada regular ABRE. As semanas 1-4 ficam livres de
// propósito: a carreira começa em 01/01 e, com eventos já na semana 1, o
// jogador era jogado no circuito antes de conhecer treino, comissão técnica,
// loja e mercado de parceria. Com 5, a primeira onda oficial cai em 29/01
// (quinta) e vai até 01/02 — o último fim de semana de janeiro — deixando a
// pré-temporada (12/01) sozinha na abertura, com janela livre dos dois lados.
// O VOLUME não muda: `TIER_EVENTS_PER_YEAR` continua igual, só a distribuição
// se concentra em 43 semanas em vez de 47.
const REGULAR_SEASON_FIRST_WEEK = 5;

function distributeTierWeeks(count, offset) {
  const weeks = [];
  const span = REGULAR_SEASON_LAST_WEEK - REGULAR_SEASON_FIRST_WEEK + 1;
  for (let index = 0; index < count; index += 1) {
    const target = REGULAR_SEASON_FIRST_WEEK - 1 + Math.round(((index + 0.5) * span) / count) + offset;
    weeks.push(Math.max(REGULAR_SEASON_FIRST_WEEK, Math.min(REGULAR_SEASON_LAST_WEEK, target)));
  }
  return weeks;
}

function buildWeekProgram() {
  const byWeek = new Map();
  const addToWeek = (week, tier) => {
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week).push(tier);
  };
  Object.entries(TIER_EVENTS_PER_YEAR).forEach(([tier, count]) => {
    distributeTierWeeks(count, TIER_WEEK_OFFSET[tier] || 0).forEach((week) => addToWeek(week, tier));
  });
  Object.entries(SEASON_FINALE_WEEKS).forEach(([tier, week]) => addToWeek(week, tier));
  return Object.freeze(
    [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, tiers]) => Object.freeze([week, Object.freeze(tiers)])),
  );
}

const WEEK_PROGRAM = buildWeekProgram();
// Playthrough 5.1, Parte H — exportado só pra leitura/auditoria (o próprio
// diagnóstico/teste de sobreposição de calendário desta fase); nenhum
// comportamento muda, `WEEK_PROGRAM` continua a mesma constante congelada
// já usada internamente.
export function getWeekProgram() { return WEEK_PROGRAM; }

const EVENT_BRANDS = Object.freeze({
  Bronze: ['Rising Cup','Open','Challenge','Tour Stop'],
  Silver: ['Open','International','Challenge','Cup'],
  Gold: ['Gold Series','World Gold','Championship','Classic'],
  Platinum: ['Platinum Open','World Platinum','Grand Prix','Championship'],
  'Circuit Finals': ['Circuit Finals','Season Finals'],
  Masters: ['World Masters','Masters Open','Champions Masters'],
  Elite: ['World Elite','Elite Open','Champions Trophy'],
  Crown: ['Crown Championship','World Crown','Legacy Crown'],
  'Legacy Finals': ['Legacy Finals','World Tour Finals'],
});

function hashString(value) {
  return fnv1aHash(String(value || ''));
}

function seededIndex(seed, length) { return length ? hashString(seed) % length : 0; }
function pad(value) { return String(value).padStart(2, '0'); }

function dateFromIsoWeek(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + ((week - 1) * 7));
  monday.setUTCDate(monday.getUTCDate() + 3); // quinta-feira
  return monday.toISOString().slice(0, 10);
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function getTournamentTierConfig(tier) {
  return TOURNAMENT_TIER_CONFIG[tier] || TOURNAMENT_TIER_CONFIG.Silver;
}

// Playthrough 4.6B, itens 4/5 — fonte única para "este torneio conta pra
// conquistas/estatísticas oficiais". A Pré-Temporada/Exibição sempre foi
// `is_official:true` no Match (TournamentModal.jsx — decisão antiga,
// necessária pro tutorial reconhecer "jogou uma partida"), mas isso nunca
// deveria significar "ranqueado o suficiente pra render 'venceu o #1 do
// mundo'/'primeira vitória oficial'". `world_tour_event`/`is_exhibition`/
// `tier` já existem desde a criação do torneio (circuitCatalog.js, acima)
// especificamente para distinguir os dois — nenhum campo novo, só um lugar
// único pra ler os três em vez de cada consumidor reinventar o check.
// `world_tour_event` ausente (save antigo) conta como oficial por padrão —
// só os sinais explícitos de exibição desqualificam.
export function isOfficialRankedTournament(tournament) {
  if (!tournament) return false;
  if (tournament.is_exhibition) return false;
  if (tournament.tier === 'Exibição') return false;
  if (tournament.world_tour_event === false) return false;
  return true;
}

// Fase 5.3, item 2 — tabela de resultado por rodada para um campo REAL
// menor que o `mainDrawSize` do tier. A simulação de fundo
// (WorldTourLifecycle.js) deixou de forçar o preenchimento da chave até
// `mainDrawSize` (item 1); quando os inscritos não enchem a chave, ela
// roda menor — e uma chave menor tem MENOS rodadas, com os pontos
// definidos por rodada. Resolução: pontos do CAMPEÃO fixos no valor
// canônico do tier (`rankPoints` — `buildRoundTable` sempre mapeia a
// razão 1.0 pro valor do campeão, seja qual for `roundCount`), rodadas
// intermediárias recalculadas pro número de rodadas que o campo real
// produz (`roundCountForDrawSize`). Um Bronze de 9 duplas paga o mesmo
// título que um de 16; quem perde na estreia recebe pontos de estreia,
// não de uma quartas que nunca existiu. A tabela só encolhe abaixo de 9
// entrantes (≤8 → 3 rodadas); 9-16 mantêm as 4 rodadas da chave de 16
// (ceil(log2(12))=4), 17+ mantêm 5. `entrantCount` ausente ou ≥
// `mainDrawSize` devolve a tabela cheia do tier, byte a byte.
export function getRoundOutcomeTable(tier, entrantCount) {
  const config = getTournamentTierConfig(tier);
  if (!Number.isFinite(entrantCount) || entrantCount >= config.mainDrawSize) {
    return { roundCount: config.roundCount, roundLabels: config.roundLabels, roundPoints: config.roundPoints };
  }
  const roundCount = Math.max(1, Math.min(config.roundCount, roundCountForDrawSize(entrantCount)));
  return {
    roundCount,
    roundLabels: ROUND_LABELS_BY_COUNT[roundCount] || config.roundLabels,
    roundPoints: buildRankPointsTable(config, roundCount),
  };
}

export function buildSeasonTournaments(year, seasonId = null) {
  const usedCities = new Map();
  const events = [];
  let order = 0;

  WEEK_PROGRAM.forEach(([week, tiers]) => {
    const startDate = dateFromIsoWeek(year, week);
    tiers.forEach((tier, slot) => {
      const config = getTournamentTierConfig(tier);
      const cityIndex = seededIndex(`${year}:${week}:${slot}:${tier}`, WORLD_TOUR_CITIES.length);
      let city = WORLD_TOUR_CITIES[cityIndex];
      for (let offset = 0; offset < WORLD_TOUR_CITIES.length; offset += 1) {
        const candidate = WORLD_TOUR_CITIES[(cityIndex + offset) % WORLD_TOUR_CITIES.length];
        const lastWeek = usedCities.get(candidate.code) || -99;
        if (week - lastWeek >= 5) { city = candidate; break; }
      }
      usedCities.set(city.code, week);
      const brands = EVENT_BRANDS[tier];
      const brand = brands[seededIndex(`${year}:${city.code}:${tier}`, brands.length)];
      const code = `${city.code}-${tier.slice(0,3).toUpperCase()}-W${pad(week)}-${slot + 1}`;
      const conflictGroup = `${year}-W${pad(week)}`;
      const prestigeVariance = (seededIndex(`${code}:prestige`, 9) - 4);
      const traditionVariance = (seededIndex(`${code}:tradition`, 13) - 6);
      const exposureVariance = (seededIndex(`${code}:exposure`, 11) - 5);
      const estimatedField = config.mainDrawSize + config.qualifyingSize;

      events.push({
        id: createTournamentEditionId({ year, circuitCode: code }),
        circuit_code: code,
        name: `${city.city} ${brand}`,
        description: `${config.description} Evento global realizado em ${city.city}, ${city.country}.`,
        tier,
        tier_label: config.label,
        circuit_level: config.order,
        circuit_name: 'Padel Legacy World Tour',
        format: 'eliminacao_simples',
        status: 'inscricoes',
        start_date: startDate,
        end_date: addDays(startDate, config.durationDays - 1),
        // O prazo de inscrição NÃO é fixado aqui de propósito. Gravar
        // `registration_deadline` explícito sobrepõe a regra global
        // (TOURNAMENT_REGISTRATION_RULES.defaultCloseDaysBeforeStart, hoje
        // D-3) porque getTournamentRegistrationWindow prefere o campo do
        // torneio — era por isso que o D-3 não tinha efeito nenhum no
        // calendário real, mesmo depois de a regra ser alterada: todo evento
        // nascia com D-1 embutido. Sem o campo, a regra global vale, e o
        // prazo passa a coincidir com a antecedência do sorteio da chave
        // (TOURNAMENT_DRAW_LEAD_DAYS), que é o que dá tempo à entrevista
        // pré-torneio e ao sorteio acontecerem.
        registration_open_date: addDays(startDate, -30),
        week,
        month: Number(startDate.slice(5, 7)),
        year,
        conflict_group: conflictGroup,
        concurrent_events: tiers.length,
        strategic_choice_required: tiers.length > 1,
        bot_difficulty_modifier: config.difficultyModifier,
        max_participants: config.mainDrawSize,
        main_draw_size: config.mainDrawSize,
        qualifying_size: config.qualifyingSize,
        estimated_field_size: estimatedField,
        expected_world_player_pool: WORLD_PLAYER_CAPACITY,
        participant_generation_mode: 'lazy',
        simulation_batch_size: Math.min(128, estimatedField),
        prize_coins: config.prize,
        xp_reward: config.xp,
        rank_points: config.rankPoints,
        season_id: seasonId,
        surface: city.surface,
        entry_fee: config.entryFee,
        min_ranking: config.minRanking,
        min_level: config.minLevel,
        current_phase: 'inscricoes',
        location: `${city.city}, ${city.country}`,
        city: city.city,
        country: city.country,
        world_region: city.region,
        prestige: Math.max(1, Math.min(100, config.prestige + prestigeVariance)),
        tradition: Math.max(1, Math.min(100, config.tradition + traditionVariance)),
        exposure: Math.max(1, Math.min(100, config.exposure + exposureVariance)),
        participants: [],
        calendar_order: order++,
        // Achado #8 da auditoria original: campo nunca lido em produção
        // (código morto). Generalizado por `config.order` (não mais uma
        // lista fixa de nomes de tier) só pra continuar coerente com a
        // nova escada — não vale esforço de remover um campo morto nesta
        // fase.
        is_development_tournament: config.order <= TOURNAMENT_TIER_CONFIG.Platinum.order,
        world_tour_event: true,
      });
    });
  });

  return events.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.circuit_level - b.circuit_level);
}

// Fase 3, item 3C.2 — a carreira começava em 01/01 e o primeiro torneio só
// abria (e só ocorria ~35 dias depois), travando "Inscreva-se em um
// torneio" no tutorial por semanas. Evento de Exibição/Pré-Temporada,
// único por carreira — chamado à parte de buildSeasonTournaments (nunca
// entra em WEEK_PROGRAM, então nunca se repete ano a ano). Config
// completa (pontos zerados, prêmio pequeno mas real, rótulos de rodada)
// vem de TOURNAMENT_TIER_CONFIG.Exibição, acima — mesma fonte que
// qualquer tier real, então nenhum consumidor (EntryManager,
// getTournamentRewards, getTournamentDifficulty, MainDrawManager) precisa
// de um caminho especial pra reconhecer este torneio.
export function buildPreSeasonExhibition(year, seasonId = null) {
  const config = getTournamentTierConfig('Exibição');
  // Abertura da carreira (decisão de design, playthrough 4): a temporada
  // regular agora só abre na semana 5 (29/01, o último fim de semana de
  // janeiro — ver REGULAR_SEASON_FIRST_WEEK). A pré-temporada fica sozinha
  // em 12→14/01: depois de 10/01, dando ao jogador os primeiros 11 dias para
  // conhecer treino, comissão técnica, loja e mercado de parceria antes de
  // competir, e ainda 15 dias de folga até a primeira onda oficial — bem
  // acima do piso de descanso de 7 dias, sem sobrepor nada.
  const startDate = `${year}-01-12`;
  const city = WORLD_TOUR_CITIES[seededIndex(`${year}:exhibition`, WORLD_TOUR_CITIES.length)];
  const code = `${city.code}-EXH-${year}`;
  return {
    id: createTournamentEditionId({ year, circuitCode: code }),
    circuit_code: code,
    name: `${city.city} Pré-Temporada`,
    description: config.description,
    tier: 'Exibição',
    tier_label: config.label,
    circuit_level: config.order,
    circuit_name: 'Padel Legacy World Tour',
    format: 'eliminacao_simples',
    status: 'inscricoes',
    start_date: startDate,
    end_date: addDays(startDate, config.durationDays - 1),
    // Mesmo motivo do gerador regular: sem `registration_deadline` explícito,
    // a exibição passa a respeitar o D-3 global como qualquer outro torneio.
    // A isenção concedida à pré-temporada foi só do PISO DE DESCANSO — nunca
    // do prazo de inscrição nem do sorteio de chave, que ela continua tendo.
    // Item 3C.2: "inscrição livre desde o dia 1" — explícito, não incidental
    // (a abertura da janela continua no dia 1; só o fechamento passa a ser
    // o D-3 padrão).
    registration_open_date: `${year}-01-01`,
    week: 2,
    month: 1,
    year,
    conflict_group: `${year}-EXH`,
    concurrent_events: 1,
    strategic_choice_required: false,
    bot_difficulty_modifier: config.difficultyModifier,
    max_participants: config.mainDrawSize,
    main_draw_size: config.mainDrawSize,
    qualifying_size: config.qualifyingSize,
    estimated_field_size: config.mainDrawSize,
    expected_world_player_pool: WORLD_PLAYER_CAPACITY,
    participant_generation_mode: 'lazy',
    simulation_batch_size: config.mainDrawSize,
    prize_coins: config.prize,
    xp_reward: config.xp,
    rank_points: config.rankPoints,
    season_id: seasonId,
    surface: city.surface,
    entry_fee: config.entryFee,
    min_ranking: config.minRanking,
    min_level: config.minLevel,
    current_phase: 'inscricoes',
    location: `${city.city}, ${city.country}`,
    city: city.city,
    country: city.country,
    world_region: city.region,
    prestige: config.prestige,
    tradition: config.tradition,
    exposure: config.exposure,
    participants: [],
    calendar_order: -1,
    is_development_tournament: true,
    // `world_tour_event:false` de propósito: (a) a simulação de fundo
    // (WorldTourLifecycle.resolveCompletedWorldTourEvents) só resolve
    // torneios com essa flag — bots não disputam a exibição, é só pro
    // jogador; (b) a poda de "torneios obsoletos" em
    // ensureFutureTournamentsInternal (career.js) só remove torneios COM
    // essa flag — sem ela, a exibição seria varrida como "não faz mais
    // parte da temporada desejada" assim que o horizonte rolasse adiante.
    world_tour_event: false,
    is_exhibition: true,
  };
}

export function groupTournamentConflicts(tournaments = []) {
  const groups = new Map();
  tournaments.forEach((tournament) => {
    const key = tournament.conflict_group || tournament.start_date;
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tournament);
  });
  return [...groups.entries()]
    .map(([conflictGroup, events]) => ({ conflictGroup, events: events.sort((a,b) => b.circuit_level - a.circuit_level) }))
    .filter((group) => group.events.length > 1);
}

// Playthrough 5.1, Parte C/D — o `rankingFit` da Fase 3 (comentário
// original preservado no histórico do arquivo, ver diff) tinha um PLATÔ
// sem decaimento: qualquer dupla com rank melhor que `minRanking-40`
// recebia fit=100 pra sempre, não importa o quão mais forte fosse.
// Resultado medido na Playthrough 5.0 (test-tier-strength-distribution.mjs,
// simulação real de 1 ano): Gold (minRanking mais alto entre os tiers
// pagos, ou seja, a rede mais LARGA) fica em fit=100 pra qualquer dupla
// de rank 1 a ~410 — inclusive duplas claramente de nível Platinum/
// Masters/Elite/Crown — e ganha empate técnico contra o tier "certo"
// dessas duplas toda vez que os dois coincidem na mesma semana
// (TIER_WEEK_OFFSET), porque o bônus de prestígio baixo de Gold
// ((100-prestígio)*0.18) ainda desempata a favor dele. Achado: Silver
// mais fraco que Bronze, Masters mais fraco que Gold, ambos por este
// mesmo mecanismo.
//
// Correção: cada tier GATED (minRanking>0) passa a ter uma ZONA ideal
// própria — não um platô que só sobe — derivada da própria escada de
// minRanking já calibrada empiricamente na Fase 5.6 (450/320/230/140/75,
// ver comentário em TOURNAMENT_TIER_CONFIG), nunca um número novo
// inventado aqui: o teto da zona ideal de um tier é o PISO do tier
// imediatamente mais forte (ex.: Gold vai de 320 — onde Platinum começa —
// até 450, seu próprio corte); fora dessa zona, o fit decai linearmente
// até 0 numa distância igual à largura da própria zona (lado forte) ou
// até o corte de qualifying do tier vizinho mais fraco (lado fraco — pro
// tier mais barato da rede paga, Gold, reaproveita a MESMA fórmula de
// `qualifyingLimit` que EntryManager.js já usa pra elegibilidade,
// max(corte×2, corte+80), então o fit chega a 0 exatamente onde a
// elegibilidade também acaba). O tier mais alto (Crown) não decai no
// lado forte — não existe "forte demais" pro topo da escada.
//
// Bronze/Silver (minRanking=0, sem corte de entrada) não têm essa escada
// — usam a mesma ideia com uma fronteira já existente e empiricamente
// calibrada (OPEN_TIER_CEILING, EntryManager.js, Fase 5.4/5.5): a faixa
// entre o teto e seu dobro — o mesmo padrão de derivação que
// `qualifyingLimit` usa — é onde Silver passa a ter fit melhor que
// Bronze; abaixo do teto nenhum dos dois é sequer elegível (EntryManager
// já barra antes de chegar aqui), então o valor ali é irrelevante.
function trapezoidFit(rank, { peakHigh, peakLow, spreadHigh, spreadLow, floor = 0, plateauTilt = 0 }) {
  if (rank >= peakHigh && rank <= peakLow) {
    // Playthrough 5.5, Parte D/E — achado: Gold=71.0 vs Silver=77.7 (medido
    // em 3 seeds, test-tier-capacity-hierarchy-v3) sobrevive mesmo depois
    // de corrigir crediting/medição (5.4) porque é uma consequência
    // MATEMÁTICA, não um bug de implementação — o platô ideal do Gold
    // (peakHigh=320, peakLow=450, derivado do minRanking do Platinum)
    // sempre vai cair numa faixa de rank NUMERICAMENTE MAIS FUNDA que o
    // platô do Silver (150-300), e overall_rating é monotonicamente
    // decrescente em rank (rankingPopulation.js) — nenhum achatamento de
    // curva de geração consegue INVERTER essa ordem, só reduzir o gap
    // (matematicamente: um trecho mais fundo de uma função monotônica
    // nunca supera a média de um trecho mais raso). `plateauTilt` ataca o
    // outro lado do problema: dentro do próprio platô "ideal" (que antes
    // era um piso plano, fit=100 em TODA a faixa 320-450, sem diferenciar
    // rank 325 de rank 448), agora prefere GRADUALMENTE a ponta mais forte
    // do próprio platô — sem mudar peakHigh/peakLow (getAiQualifyingLimit
    // continua usando a MESMA largura de sempre, Parte J/K/L da 5.3), sem
    // mudar minRanking/elegibilidade de inscrição (EntryManager.js:
    // eligibleForTier nunca lê este valor — comentário da Parte I da 5.2,
    // "as duas nunca se misturam"), só reordena QUEM VENCE a disputa por
    // vaga quando o campo está superinscrito (Gold sempre está, medido
    // desde a 5.2: ~818 participações/ano pra um campo de 24). 0 por
    // padrão pra todo tier — só Gold recebe um valor não-zero (ver
    // TIER_FIT_BANDS abaixo), pra não reabrir a calibração já validada de
    // Platinum/Masters/Elite/Crown/Silver/Bronze.
    if (plateauTilt <= 0) return 100;
    const span = Math.max(1, peakLow - peakHigh);
    const ratio = (rank - peakHigh) / span;
    return Math.round(100 - ratio * plateauTilt);
  }
  if (rank < peakHigh) {
    const ratio = spreadHigh > 0 ? Math.min(1, (peakHigh - rank) / spreadHigh) : 1;
    // Lado forte: côncavo (raiz quadrada), não linear. Medido empiricamente
    // nesta fase (diag-tier-choice-rebalance.mjs) — um decaimento LINEAR
    // com alcance até rank 1 (pra nunca clampar dois ranks bem diferentes
    // no mesmo piso, ver comentário de TIER_FIT_BANDS) ficava fraco demais
    // logo depois da própria fronteira: a rank 280 (dentro do platô de
    // Platinum), Gold ainda saía com fit=88 — quase empatado com o
    // platô=100 de Platinum, disputando a população NATURAL de Platinum
    // em pé de igualdade e arrastando o avgOVR de Platinum pra baixo do de
    // Gold (medido, não hipotético). `sqrt(ratio)` cai rápido logo na
    // fronteira (a rank 280, fit=65 — diferença real contra o platô) e
    // achata gradualmente depois, então uma dupla MUITO mais forte que o
    // tier (rank 10) ainda se diferencia de uma moderadamente mais forte
    // (rank 100) em vez de as duas caírem no mesmo piso.
    const shaped = Math.sqrt(ratio);
    return Math.round(100 - shaped * (100 - floor));
  }
  const ratio = spreadLow > 0 ? Math.min(1, (rank - peakLow) / spreadLow) : 1;
  return Math.round(100 - ratio * (100 - floor));
}

function qualifyingStyleLimit(minRanking) {
  return Math.max(minRanking * 2, minRanking + 80);
}

// Duplicado de EntryManager.js:OPEN_TIER_CEILING (não importado de lá de
// propósito — EntryManager.js já importa `getTournamentTierConfig` DESTE
// arquivo; importar de volta criaria um ciclo ES module cuja ordem de
// avaliação não é garantida, arriscando um `const` em TDZ dependendo de
// qual dos dois arquivos carrega primeiro). Mesmo valor, mesma origem
// (Fase 5.4/5.5) — mudar um exige mudar o outro, e ambos citam a razão.
// Playthrough 5.5 — espelha o valor final 400 de
// EntryManager.js:OPEN_TIER_CEILING (comentário completo lá).
const OPEN_TIER_CEILING_MIRROR = 400;

// Escada dos tiers PAGOS (minRanking>0), do corte mais alto (rede mais
// larga) pro mais baixo (rede mais estreita) — a mesma ordem que
// EntryManager.js já trata como "elegibilidade cai por baixo de um corte
// numérico", só ordenada aqui pra derivar vizinhança. Circuit/Legacy
// Finals ficam de fora de propósito: `minRanking` ali é um corte de
// MÉRITO de acesso por convite (top 8/top 16), não uma rede de
// preferência de escolha — não fazem parte desta escada de "onde uma
// dupla prefere jogar".
const GATED_FIT_LADDER = Object.entries(TOURNAMENT_TIER_CONFIG)
  .filter(([name, cfg]) => cfg.minRanking > 0 && name !== 'Circuit Finals' && name !== 'Legacy Finals')
  .sort((a, b) => b[1].minRanking - a[1].minRanking);

const TIER_FIT_BANDS = Object.freeze(Object.fromEntries(GATED_FIT_LADDER.map(([name, cfg], index) => {
  const stronger = GATED_FIT_LADDER[index + 1]; // próximo tier mais forte (corte menor), se existir.
  const weaker = GATED_FIT_LADDER[index - 1]; // próximo tier mais fraco (corte maior), se existir.
  const peakLow = cfg.minRanking;
  const peakHigh = stronger ? stronger[1].minRanking : 1; // Crown: platô vai até o topo absoluto, sem decair.
  // Lado forte: o decaimento precisa cobrir TODO o caminho até rank 1, não
  // só a largura do próprio platô — a primeira versão usava
  // `peakLow-peakHigh` (a largura do platô) como distância de queda, o
  // que fazia o fit "grudar" no piso pra QUALQUER rank bem melhor que
  // `peakHigh` (ex.: rank 10 e rank 100 ficavam ambos no piso pra Gold E
  // pra Masters, indistinguíveis) — o termo de prestígio de
  // getTournamentChoiceProfile então decidia sozinho, reabrindo o viés
  // pró-Gold (prestígio baixo = bônus) por outra porta. `peakHigh-1`
  // garante que o fit sempre diferencia por distância real até rank 1,
  // nunca empata dois tiers diferentes no mesmo piso.
  const spreadHigh = stronger ? Math.max(1, peakHigh - 1) : 0; // Crown: sem decaimento no lado forte.
  const spreadLow = weaker ? weaker[1].minRanking - peakLow : qualifyingStyleLimit(peakLow) - peakLow;
  // Playthrough 5.5, Parte D/E — só Gold recebe um plateauTilt não-zero
  // (ver comentário completo em trapezoidFit). Os outros tiers gated
  // (Platinum/Masters/Elite/Crown) mantêm o platô plano de sempre — a
  // distorção medida foi especificamente Gold vs Silver, nenhum outro par
  // de tiers vizinhos mostrou o mesmo problema (Platinum>Gold, Masters>
  // Platinum, Crown mais forte seguem corretos nos regressões da 5.4),
  // então não há motivo pra tocar a calibração já validada dos demais.
  const plateauTilt = name === 'Gold' ? 50 : 0;
  return [name, { peakHigh, peakLow, spreadHigh, spreadLow, floor: 0, plateauTilt }];
})));

const OPEN_TIER_SILVER_BAND = Object.freeze({ peakHigh: OPEN_TIER_CEILING_MIRROR, peakLow: OPEN_TIER_CEILING_MIRROR * 2, spreadHigh: 0, spreadLow: OPEN_TIER_CEILING_MIRROR * 2, floor: 55 });
// Playthrough 5.27-E — nos presets -E o pico de preferência do Silver desce até
// `competition.silverPeakLow` (duplas da faixa 800+ também encaixam no Silver),
// aproximando o campo de um time real do 1º ano. Teto de elegibilidade (400),
// Bronze e tiers com corte (Gold+) inalterados. Sem `competition`: banda de sempre.
function openTierSilverBand() {
  const peakLow = Number(getBalance527().competition?.silverPeakLow);
  if (!(peakLow > OPEN_TIER_SILVER_BAND.peakLow)) return OPEN_TIER_SILVER_BAND;
  return { ...OPEN_TIER_SILVER_BAND, peakLow, spreadLow: Math.max(OPEN_TIER_SILVER_BAND.spreadLow, peakLow) };
}
const OPEN_TIER_BRONZE_BAND = Object.freeze({ peakHigh: OPEN_TIER_CEILING_MIRROR * 2, peakLow: Number.MAX_SAFE_INTEGER, spreadHigh: OPEN_TIER_CEILING_MIRROR, spreadLow: 0, floor: 55 });

// Playthrough 5.6 — faixa factual usada SOMENTE por diagnósticos de
// composição de campo. CORE significa "o rank pertence à faixa natural do
// tier", não "a curva de preferência devolveu exatamente 100". Essa
// distinção importa para Gold: seu plateauTilt ordena candidatos dentro da
// própria faixa 320–450 e, por isso, quase todos têm fit < 100 mesmo
// continuando factualmente no CORE. Esta função não participa de
// elegibilidade, escolha, qualifying, rescue, seeding ou montagem de chave.
export function getTierDiagnosticCoreBand(tierName) {
  const band = TIER_FIT_BANDS[tierName]
    || (tierName === 'Silver' ? openTierSilverBand() : null)
    || (tierName === 'Bronze' ? OPEN_TIER_BRONZE_BAND : null);
  return band ? { minRank: band.peakHigh, maxRank: band.peakLow } : null;
}

export function isRankInTierDiagnosticCore(rank, tierName) {
  const numericRank = Number(rank);
  const band = getTierDiagnosticCoreBand(tierName);
  return Boolean(band && numericRank > 0 && numericRank >= band.minRank && numericRank <= band.maxRank);
}

// Playthrough 5.3, Parte J/K/L — largura de qualifying derivada da
// população, não um multiplicador universal (a causa raiz que a 5.2
// isolou e deixou em aberto porque mexer nela também mudava a
// elegibilidade de INSCRIÇÃO do jogador). A largura do próprio platô
// ideal de cada tier (peakLow-peakHigh, TIER_FIT_BANDS — a MESMA medida
// de densidade populacional que já deriva a curva de preferência,
// nenhuma fonte nova) substitui `directLimit×2`: cada tier ganha uma
// rede de qualifying proporcional à sua PRÓPRIA banda, não ao seu
// próprio corte direto (que é o que fazia Gold, o tier pago com o maior
// minRanking, ganhar a rede absoluta mais larga de todas, mesmo tendo
// população natural comparável a Masters/Platinum — medido na 5.2:
// Gold só 18-20% do campo real vinha da própria banda ideal).
// Multiplicador 1.5× (não 1×) de propósito: overlap saudável entre
// vizinhos precisa continuar existindo (Parte F, "não quero tiers
// rígidos como castas") — 1× deixaria zero margem de zebra/ascensão.
const AI_QUALIFYING_WIDTH_MULTIPLIER = 1.5;
export function getAiQualifyingLimit(tierName, directLimit) {
  if (!(directLimit > 0)) return 800; // tiers abertos não usam qualifying — mantém o comportamento antigo.
  const band = TIER_FIT_BANDS[tierName];
  if (!band) return Math.max(directLimit * 2, directLimit + 80); // sem banda própria (Circuit/Legacy Finals, mérito) — mantém a fórmula antiga.
  const width = Math.max(1, band.peakLow - band.peakHigh);
  return Math.round(directLimit + width * AI_QUALIFYING_WIDTH_MULTIPLIER);
}

function computeRankingFit(tierName, config, teamRank) {
  if (config.minRanking > 0) {
    if (teamRank <= 0) return 45; // sem ranking — mantém o valor conservador de sempre (EntryManager já barra a maioria dos casos práticos).
    const band = TIER_FIT_BANDS[tierName];
    if (!band) return 45;
    return trapezoidFit(teamRank, band);
  }
  // Aberto (Bronze/Silver). Sem ranking -> Bronze é a porta natural de
  // toda dupla nova (fit máximo); Silver continua um segundo caminho
  // real (EntryManager.js já permite entrada direta sem ranking em
  // Silver de propósito), não descartado, só não o preferido por padrão.
  if (teamRank <= 0) return tierName === 'Bronze' ? 100 : 70;
  const band = tierName === 'Silver' ? openTierSilverBand() : OPEN_TIER_BRONZE_BAND;
  return trapezoidFit(teamRank, band);
}

// Exportada separadamente (Playthrough 5.1, Parte I) — o resgate de campo
// (WorldTourLifecycle.js) precisa saber "o quão adequada é esta dupla
// ociosa pra ESTE tier" sem reconstruir a fórmula inteira de escolha de
// torneio (que também mistura prestígio/prêmio, irrelevantes pra
// prioridade de resgate). Mesma fonte que getTournamentChoiceProfile usa
// por baixo — nunca uma segunda fórmula de "adequação" divergente.
export function getTierRankingFit(tierName, teamRank = 0) {
  return computeRankingFit(tierName, getTournamentTierConfig(tierName), teamRank);
}

// Playthrough 5.2, Parte I — nome formal pedido pelo prompt pro lado
// "preferência" da separação (o outro lado é EntryManager.js:
// eligibleForTier). Alias direto de getTierRankingFit — mesma fonte,
// nunca uma segunda curva de adequação. Decide "o quão ideal", nunca
// "pode tentar" (isso é eligibleForTier).
export function tierPreferenceFit(rank, tierName) {
  return getTierRankingFit(tierName, rank);
}

export function getTournamentChoiceProfile(tournament, teamRank = 0) {
  const config = getTournamentTierConfig(tournament?.tier);
  const rankingFit = computeRankingFit(tournament?.tier, config, teamRank);
  const titleChance = Math.round(Math.max(2, Math.min(78, rankingFit * 0.55 + (100 - config.prestige) * 0.18)));
  const expectedPoints = Math.round(config.rankPoints * (0.12 + titleChance / 170));
  const expectedNet = Math.round(config.prize * (0.08 + titleChance / 140) - config.entryFee);
  return {
    titleChance,
    expectedPoints,
    expectedNet,
    prestige: tournament?.prestige ?? config.prestige,
    exposure: tournament?.exposure ?? config.exposure,
    risk: Math.max(1, Math.min(100, 100 - titleChance + config.order * 5)),
  };
}

// Fase 3: generalizado pros 9 tiers — era uma lista fixa dos 6 antigos,
// que silenciosamente NUNCA contaria Bronze/Circuit Finals/Legacy Finals
// (ficariam de fora de `summary` inteiro, não só das somas). "development"
// e "premier" agora agrupam por `config.order` (mesmo corte de
// is_development_tournament, acima) em vez de nomear cada tier; Circuit
// Finals/Legacy Finals formam uma terceira categoria própria — não são
// "desenvolvimento" nem um degrau comum do "premier", são os únicos dois
// eventos de acesso por mérito (top 8/16), sem inscrição aberta nem corte
// de ranking direto.
export function getSeasonCircuitSummary(tournaments = []) {
  const summary = { total: tournaments.length };
  Object.keys(TOURNAMENT_TIER_CONFIG).forEach((tier) => { summary[tier] = 0; });
  tournaments.forEach((tournament) => {
    if (Object.prototype.hasOwnProperty.call(summary, tournament?.tier)) summary[tournament.tier] += 1;
  });
  const platinumOrder = TOURNAMENT_TIER_CONFIG.Platinum.order;
  const finalsOrders = new Set([TOURNAMENT_TIER_CONFIG['Circuit Finals'].order, TOURNAMENT_TIER_CONFIG['Legacy Finals'].order]);
  summary.development = 0;
  summary.premier = 0;
  summary.finals = 0;
  Object.entries(TOURNAMENT_TIER_CONFIG).forEach(([tier, config]) => {
    if (finalsOrders.has(config.order)) summary.finals += summary[tier];
    else if (config.order <= platinumOrder) summary.development += summary[tier];
    else summary.premier += summary[tier];
  });
  summary.conflictWeeks = groupTournamentConflicts(tournaments).length;
  summary.countries = new Set(tournaments.map((t) => t.country).filter(Boolean)).size;
  summary.regions = new Set(tournaments.map((t) => t.world_region).filter(Boolean)).size;
  return summary;
}
