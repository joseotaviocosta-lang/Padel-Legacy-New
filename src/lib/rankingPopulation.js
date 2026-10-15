import { fnv1aHash } from './hashUtils.js';
import { computeCanonicalTeamRankingPoints } from './teamRankingFormula.js';

export const WORLD_RANKING_TARGET = 1000;
export const TEAM_RANKING_TARGET = 500;

const FIRST_NAMES = ['Lucas','Mateo','Thiago','Martín','Nicolás','Javier','Bruno','Tomás','Diego','Rafael','Enzo','Pablo','Santiago','Álvaro','Gonzalo','Miguel','Felipe','João','Pedro','André','Hugo','Marco','Daniel','Carlos','Emiliano','Franco','Ignacio','Samuel','Adrián','Rubén'];
const LAST_NAMES = ['Silva','García','López','Martínez','Sánchez','Fernández','Pereira','Costa','Romero','Navarro','Torres','Molina','Castro','Ramos','Vega','Ortiz','Medina','Herrera','Suárez','Cabrera','Alonso','Méndez','Ferrer','Giménez','Acosta','Miranda','Rojas','Campos','Santos','Iglesias'];
const STYLES = ['Equilibrado','Controle','Defensivo','Agressivo','Potência','Tático'];

function hash(value = '') {
  return Math.abs(fnv1aHash(String(value)));
}

function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fase 2C — nacionalidade: espelha o top 100 real do topo da base (101-400)
// e diversifica progressivamente até a posição 1000. "Diversifica" não é
// arbitrário: o FIP Tour roda 200+ eventos em cinco continentes, então a
// base do circuito tem representação bem mais ampla que o topo dominado
// por ESP/ARG. Garante presença brasileira relevante na base (pedido
// explícito), sem apagar o peso de ESP/ARG (que continuam maioria, só não
// mais ~82%).
const TOP_COUNTRY_WEIGHTS = Object.freeze({
  Espanha: 58, Argentina: 24, Itália: 7, Brasil: 2, Paraguai: 2, Portugal: 2,
  México: 1, Bélgica: 1, França: 1, Chile: 1, 'Emirados Árabes Unidos': 1,
});
const BASE_COUNTRY_WEIGHTS = Object.freeze({
  Espanha: 35, Argentina: 15, Brasil: 10, Itália: 7, França: 5, Portugal: 4,
  México: 4, Bélgica: 3, Chile: 3, Paraguai: 3, 'Estados Unidos': 3,
  'Emirados Árabes Unidos': 2, Catar: 2, Suécia: 2, Marrocos: 1, Egito: 1,
});
const ALL_WEIGHTED_COUNTRIES = [...new Set([...Object.keys(TOP_COUNTRY_WEIGHTS), ...Object.keys(BASE_COUNTRY_WEIGHTS)])];

function blendedCountryWeights(absoluteRank) {
  if (absoluteRank <= 400) return TOP_COUNTRY_WEIGHTS;
  const t = Math.min(1, (absoluteRank - 400) / (WORLD_RANKING_TARGET - 400));
  const blended = {};
  for (const country of ALL_WEIGHTED_COUNTRIES) {
    const top = TOP_COUNTRY_WEIGHTS[country] || 0;
    const base = BASE_COUNTRY_WEIGHTS[country] || 0;
    blended[country] = top * (1 - t) + base * t;
  }
  return blended;
}

function weightedCountryFor(absoluteRank, seed) {
  const weights = blendedCountryWeights(absoluteRank);
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = (hash(seed) % 1000000) / 1000000 * total;
  for (const [country, weight] of entries) {
    if (roll < weight) return country;
    roll -= weight;
  }
  return entries[entries.length - 1][0];
}

// Fase 2C — pirâmide etária: sem ela, geração uniforme produz onda de
// aposentadoria (todo mundo sai junto, circuito colapsa num ano — achado
// do pedido). Faixas e fatias pedidas, aplicadas sobre a POPULAÇÃO TOTAL
// (1000, reais incluídos) — a função abaixo desconta quantos reais já
// caem em cada faixa e sorteia só a diferença entre os bots, embaralhada
// (sem correlação com rank/posição, mesmo princípio usado na idade
// sintética dos reais).
const AGE_PYRAMID = Object.freeze([
  { key: '17-20', min: 17, max: 20, share: 0.15 },
  { key: '21-24', min: 21, max: 24, share: 0.22 },
  { key: '25-28', min: 25, max: 28, share: 0.24 },
  { key: '29-32', min: 29, max: 32, share: 0.21 },
  { key: '33-36', min: 33, max: 36, share: 0.13 },
  { key: '37-42', min: 37, max: 42, share: 0.05 },
]);

function bucketFor(age) {
  return AGE_PYRAMID.find((b) => age >= b.min && age <= b.max) || AGE_PYRAMID[AGE_PYRAMID.length - 1];
}

function buildAgeAssignments(missingCount, existingAthletes, seedLabel) {
  if (missingCount <= 0) return [];
  const existingCounts = Object.fromEntries(AGE_PYRAMID.map((b) => [b.key, 0]));
  for (const athlete of existingAthletes) {
    const age = Math.max(16, Math.round(Number(athlete.age) || 27));
    existingCounts[bucketFor(age).key] += 1;
  }
  const totalPopulation = existingAthletes.length + missingCount;
  const targets = AGE_PYRAMID.map((b) => Math.max(0, Math.round(b.share * totalPopulation) - existingCounts[b.key]));
  let diff = missingCount - targets.reduce((sum, v) => sum + v, 0);
  const order = [...AGE_PYRAMID.keys()];
  let guard = 0;
  while (diff !== 0 && guard < missingCount * 4 + 64) {
    const i = order[guard % order.length];
    if (diff > 0) { targets[i] += 1; diff -= 1; }
    else if (targets[i] > 0) { targets[i] -= 1; diff += 1; }
    guard += 1;
  }
  const pool = [];
  AGE_PYRAMID.forEach((bucket, index) => { for (let k = 0; k < targets[index]; k += 1) pool.push(bucket); });
  const rand = mulberry32(hash(seedLabel));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

const RANKING_POINT_ANCHORS = Object.freeze([
  [1, 13000], [10, 9130], [24, 3110], [50, 2050], [100, 1200],
  [200, 650], [350, 340], [500, 200], [750, 65], [1000, 1],
]);

// Playthrough 5.5, Parte D/E — a curva antiga (`96 - (rank/1000)^0.72*57`,
// removida) era uma função de potência PURA de `absoluteRank`, sem
// nenhuma variância por atleta, e `ranking_position` nasce como o MESMO
// `absoluteRank` usado pra calcular `overall` — ou seja, rank e OVR eram
// um espelho perfeito um do outro no nascimento (correlação de Spearman
// implícita = 1,0), sem nenhuma sobreposição natural entre atletas de
// rank vizinho (medido: P90 da faixa 201-300 e P10 da 301-450 mal se
// tocavam). Isso não mudava numa temporada inteira de jogo real (medido
// na 5.4/5.5: gap Silver-Gold de 8,9 pontos tanto na curva de nascimento
// quanto no estado final pós-temporada) — a maior parte da população joga
// poucos torneios/ano, insuficiente pra perturbar uma correlação tão
// forte quanto essa.
//
// Duas mudanças, mesmo padrão de âncoras+interpolação linear que
// `pointsForRank` já usa acima (não uma família de curva nova):
// (1) ACHATA especificamente a faixa 100-600 (onde Silver/Gold/Platinum
// vivem) — os extremos (1-50 e 800-1000) continuam com queda íngreme,
// preservando Crown/Masters claramente fortes e Bronze/base claramente
// fraca (Parte L, itens 4-6). Reduz o gap bruto Silver-Gold de ~8,9 pra
// ~4 pontos (calculado pelas âncoras) — não elimina (matematicamente
// impossível achatar uma função monotônica o bastante pra inverter a
// ordem de dois trechos, um deles estritamente mais fundo que o outro —
// ver `plateauTilt` em circuitCatalog.js pro resto do fix). (2) Adiciona
// um JITTER determinístico por atleta (`mulberry32`, já usado nesta
// função pra idade — mesma fonte de aleatoriedade seedada, nunca
// `Math.random()`) — cria a "sobreposição natural" que a Parte E pede
// (um atleta de rank 310 pode legitimamente ter OVR mais alto que um de
// rank 280), sem mudar a MÉDIA de nenhuma faixa (ruído simétrico).
const OVERALL_RANK_ANCHORS = Object.freeze([
  [1, 96], [10, 93], [25, 90], [50, 87], [100, 83], [150, 80],
  [250, 77], [350, 77], [450, 76], [600, 70], [800, 48], [900, 32], [1000, 20],
]);
const OVERALL_JITTER_SPREAD = 7; // ± pontos, uniforme, em torno da curva.

export function overallForRank(rank) {
  const safeRank = Math.max(1, Math.min(WORLD_RANKING_TARGET, Math.round(Number(rank) || WORLD_RANKING_TARGET)));
  let trend = OVERALL_RANK_ANCHORS[OVERALL_RANK_ANCHORS.length - 1][1];
  for (let index = 0; index < OVERALL_RANK_ANCHORS.length - 1; index += 1) {
    const [rankA, ovrA] = OVERALL_RANK_ANCHORS[index];
    const [rankB, ovrB] = OVERALL_RANK_ANCHORS[index + 1];
    if (safeRank < rankA || safeRank > rankB) continue;
    const ratio = (safeRank - rankA) / Math.max(1, rankB - rankA);
    trend = ovrA + (ovrB - ovrA) * ratio;
    break;
  }
  const jitterRoll = mulberry32(hash(`ranking-athlete-${safeRank}-overall-jitter`))();
  const jitter = (jitterRoll * 2 - 1) * OVERALL_JITTER_SPREAD;
  return Math.max(35, Math.min(96, Math.round(trend + jitter)));
}

export function pointsForRank(rank, total = WORLD_RANKING_TARGET) {
  const safeRank = Math.max(1, Math.min(total, Math.round(Number(rank) || total)));
  const scaledRank = total === WORLD_RANKING_TARGET
    ? safeRank
    : 1 + ((safeRank - 1) / Math.max(1, total - 1)) * (WORLD_RANKING_TARGET - 1);
  for (let index = 0; index < RANKING_POINT_ANCHORS.length - 1; index += 1) {
    const [rankA, pointsA] = RANKING_POINT_ANCHORS[index];
    const [rankB, pointsB] = RANKING_POINT_ANCHORS[index + 1];
    if (scaledRank < rankA || scaledRank > rankB) continue;
    const ratio = (scaledRank - rankA) / Math.max(1, rankB - rankA);
    return Math.max(1, Math.round(pointsA + (pointsB - pointsA) * ratio));
  }
  return 1;
}

export function buildSupplementalRankingPopulation(existingAthletes = [], existingTeams = [], seasonStartDate = '2026-01-01') {
  const athletes = [];
  const usedNames = new Set((existingAthletes || []).map(a => String(a.name || a.sport_name || '').trim().toLowerCase()));
  const missingAthletes = Math.max(0, WORLD_RANKING_TARGET - (existingAthletes || []).length);
  const ageAssignments = buildAgeAssignments(missingAthletes, existingAthletes || [], 'ranking-population-age-shuffle');

  for (let i = 0; i < missingAthletes; i += 1) {
    const absoluteRank = (existingAthletes || []).length + i + 1;
    const seed = hash(`ranking-athlete-${absoluteRank}`);
    let name = `${FIRST_NAMES[seed % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(seed / 31) % LAST_NAMES.length]}`;
    if (usedNames.has(name.toLowerCase())) name = `${name} ${absoluteRank}`;
    usedNames.add(name.toLowerCase());
    const points = pointsForRank(absoluteRank);
    const overall = overallForRank(absoluteRank);
    const country = weightedCountryFor(absoluteRank, `ranking-athlete-${absoluteRank}-country`);
    const ageBucket = ageAssignments[i] || bucketFor(27);
    const age = ageBucket.min + (hash(`ranking-athlete-${absoluteRank}-age`) % (ageBucket.max - ageBucket.min + 1));
    athletes.push({
      bot_id: `ranking-bot-${String(absoluteRank).padStart(4, '0')}`,
      name,
      sport_name: name,
      country,
      nationality: country,
      age,
      dominant_hand: seed % 5 === 0 ? 'Canhoto' : 'Destro',
      court_side: seed % 2 === 0 ? 'Direita' : 'Esquerda',
      play_style: STYLES[seed % STYLES.length],
      overall_rating: overall,
      potential: Math.min(99, overall + 2 + (seed % 10)),
      world_ranking_points: points,
      ranking_points: points,
      // Correção UI/cronologia — Fase 3: race_points é o placar da temporada
      // (Race) EM ANDAMENTO, nunca deve nascer com valor > 0 — só cresce
      // conforme torneios reais são disputados na carreira do jogador.
      // ranking_points/world_ranking_points seguem representando o Circuito
      // (histórico acumulado), que continua populado normalmente.
      race_points: 0,
      // Fase 4.0, item 2A (achado #18): world_ranking removido — nascia
      // idêntico a ranking_position (mesmo absoluteRank), e todo consumidor
      // já lia ranking_position primeiro. Campo morto desde a origem.
      ranking_position: absoluteRank,
      // Fase 5.1 (verificação pedida sobre o achado #32) — este valor
      // NUNCA foi "torneios disputados" no sentido que todo consumidor de
      // `tournaments_played` espera (WorldTourLifecycle.js incrementa o
      // MESMO campo, pra QUALQUER atleta, a cada torneio realmente
      // resolvido na simulação — real ou bot). Escrever aqui, na criação
      // do bot, fazia história de fundo e contagem de simulação
      // compartilharem um único contador: todo bot procedural nascia já
      // "tendo jogado" 6-33 torneios (média ≈19,5) que nunca aconteceram,
      // inflando permanentemente qualquer comparação real-vs-bot que lesse
      // `tournaments_played` (a auditoria original, Fase 2, "reais: 0,58 ·
      // bots: 20,15" — bem perto da média deste seed sozinho). Campo
      // renomeado para não ser lido por engano como contagem de simulação;
      // valor e fórmula preservados (só flavor de "carreira antes de
      // existir nesta partida", nunca exibido em nenhuma tela — confirmado
      // por grep, zero ocorrências de `tournaments_played` em `src/**/*.jsx`).
      backstory_tournaments_played: Math.max(1, 6 + (seed % 28)),
      matches_played: Math.max(2, 12 + (seed % 95)),
      wins: Math.max(1, Math.round((12 + (seed % 95)) * (0.35 + (overall - 35) / 130))),
      retired: false,
      career_phase: overall >= 83 ? 'Elite' : overall >= 68 ? 'Profissional' : 'Desenvolvimento',
      circuit_category: absoluteRank <= 100 ? 'Premier' : absoluteRank <= 350 ? 'Challenger' : 'Future',
      ranking_seed_version: 1,
      // Fase 2.6, item 3: marca quando este atleta passou a existir NESTA
      // carreira (não uma biografia pré-jogo inventada — "Parte 41: nunca
      // inventar passado") — usado só pra "anos ativos" na linha-resumo de
      // aposentadoria (AthleteCareerLegacy).
      circuit_entry_date: seasonStartDate,
    });
  }

  const allAthletes = [...(existingAthletes || []), ...athletes];
  const teams = buildSupplementalTeamRows(allAthletes, existingTeams);
  return { athletes, teams };
}

// Playthrough 5.10, Parte K — extraído de buildSupplementalRankingPopulation
// para poder rodar DEPOIS do bulkCreate dos atletas.
//
// Achado da 5.9/Parte E: este laço pareava com `a.id || a.bot_id`, e os
// atletas recém-gerados ainda NÃO têm `id` (só `bot_id`) porque o id é
// atribuído no bulkCreate, que acontece depois. Resultado: ~395 linhas de
// TeamRanking gravadas com membros `ranking-bot-NNNN`, irresolvíveis contra
// AthleteProfile e invisíveis para a UI.
//
// A correção é de ORDEM, não de identidade inventada: saveFoundation.js
// persiste os atletas primeiro e chama esta função com os registros já
// portando `id` canônico. Continua aceitando atletas sem `id` (o fallback
// para `bot_id` permanece) para não quebrar chamadores que só querem
// dimensionar a população.
export function buildSupplementalTeamRows(allAthletes = [], existingTeams = []) {
  const teams = [];
  // Playthrough 5.5, Parte I — achado: este laço pareava por ÍNDICE puro,
  // sem checar `ai_partner_id` nem `existingTeams` — para os pares reais
  // seedados (Coello/Tapia etc., escritos ANTES desta chamada,
  // saveFoundation.js), que ficam ADJACENTES em `existingAthletes`
  // (ordenado por world_ranking_points, parceiros têm pontos quase
  // idênticos), o par `(i*2, i*2+1)` frequentemente recriava a MESMA
  // dupla que já tinha uma linha de TeamRanking — gravada por
  // `bulkCreate` (nunca upsert) logo abaixo, criando uma segunda linha
  // duplicada pro mesmo `team_key`. Corrigido descartando qualquer par
  // gerado cujo `team_key` já exista em `existingTeams` (o mesmo dado que
  // esta função já recebe, nenhuma leitura nova).
  const existingTeamKeys = new Set((existingTeams || []).map((t) => t.team_key).filter(Boolean));

  // Playthrough 5.15, Partes F/Q/R — achado central da fase.
  //
  // Este laço pareava por ÍNDICE sobre `allAthletes`, que inclui os ~100
  // atletas REAIS já semeados e JÁ PAREADOS entre si (Coello/Tapia,
  // Galán/Chingotto, ...). O guard de `existingTeamKeys` só evitava
  // recriar a MESMA chave — não impedia formar uma combinação NOVA entre
  // dois reais que já tinham parceiro.
  //
  // Resultado medido num mundo recém-semeado: 50 duplas curadas + **25
  // duplas RR fantasma** (ex.: "Francisco Navarro / Jorge Nieto" com 9343
  // pts, "Martín Di Nenno / Jon Sanz" com 8482 pts), e **50 atletas reais
  // aparecendo em DUAS duplas ao mesmo tempo**. Di Nenno existia tanto em
  // Nieto/Di Nenno (#6, a dupla real) quanto numa dupla fantasma — as duas
  // elegíveis, as duas disputando as mesmas vagas de Masters.
  //
  // É a explicação estrutural de "a elite real some do Masters": a vaga
  // podia ser ocupada por uma dupla que não existe de verdade, montada com
  // um membro da dupla real.
  //
  // Atleta com `ai_partner_id` está COMPROMETIDO: não pode ser matéria-prima
  // da população suplementar. Só entram os genuinamente livres.
  const availableAthletes = (allAthletes || []).filter((athlete) => athlete && !athlete.ai_partner_id);
  const missingTeams = Math.max(0, TEAM_RANKING_TARGET - (existingTeams || []).length);
  for (let i = 0; i < missingTeams; i += 1) {
    if (availableAthletes.length < 2) break;
    const teamRank = (existingTeams || []).length + i + 1;
    const a = availableAthletes[(i * 2) % availableAthletes.length];
    const b = availableAthletes[(i * 2 + 1) % availableAthletes.length];
    if (!a || !b || a === b) break;
    const p1Id = a.id || a.bot_id;
    const p2Id = b.id || b.bot_id;
    const key = [p1Id, p2Id].sort().join('_');
    if (existingTeamKeys.has(key)) continue;
    // Playthrough 5.10, critério 3 — a semeadura usava uma ESCALA PARALELA
    // (`pointsForRank(teamRank * 2) * 0.72`), derivada da posição inventada
    // da dupla em vez dos pontos reais dos seus dois membros. Como estas
    // linhas nunca são recalculadas por circuitLifecycle:updateTeamRankings
    // (que só percorre parcerias reais, via ai_partner_id), o valor ficava
    // CONGELADO para sempre: medido 423 de 921 linhas (45,9%) fora da
    // fórmula canônica depois de uma temporada inteira.
    //
    // Agora nasce já na unidade única da tabela — média dos rolling dos dois
    // membros, exatamente o que updateTeamRankings e finalizeTournamentRun
    // gravam. O `Math.max(1, ...)` preserva a garantia de ranking_points > 0
    // que o resto da semeadura assume.
    // Playthrough 5.22-E, Partes M/N/Y — a semeadura nasce já na fórmula
    // canônica única (SOMA dos pontos atuais dos dois membros), a mesma que
    // circuitLifecycle/tournamentLifecycle/seasonLifecycle gravam. O antigo
    // piso `Math.max(1, ...)` saiu: com a regra da soma, 0 + 0 = 0 é o
    // estado legítimo de "sem ranking" (Parte Y), e os bots da semeadura
    // têm pontos >= 1, então qualquer par real continua positivo.
    const points = computeCanonicalTeamRankingPoints(
      Number(a.world_ranking_points ?? a.ranking_points) || 0,
      Number(b.world_ranking_points ?? b.ranking_points) || 0);
    teams.push({
      team_key: key,
      player1_id: p1Id,
      player1_name: a.name || a.sport_name,
      player1_country: a.country || a.nationality,
      player2_id: p2Id,
      player2_name: b.name || b.sport_name,
      player2_country: b.country || b.nationality,
      ranking_points: points,
      // Ver comentário equivalente acima (Fase 3): Race começa zerada.
      race_points: 0,
      // Playthrough 5.17, Parte J — V · D · títulos deixaram de ser semeados.
      //
      // A 5.13 já havia tornado o histórico semeado internamente coerente
      // (partidas = V + D), mas ele continuava sendo um número derivado de
      // HASH exibido ao jogador como se fosse resultado. A regra da Parte J
      // é explícita: não derivar V/D de hash, e preferir "histórico
      // indisponível" a inventar passado que nunca foi jogado.
      //
      // A dupla nasce sem contadores e só passa a tê-los quando disputa
      // eventos de verdade (ledger gravado no settlement do World Tour).
      matches_played: 0,
      wins: 0,
      losses: 0,
      stats_source: 'unavailable',
      titles: [],
      circuit_category: teamRank <= 50 ? 'Premier' : teamRank <= 180 ? 'Challenger' : 'Future',
      ranking_seed_version: 1,
    });
  }
  return teams;
}

export function formatRankingPosition(rank, { unranked = false, threshold = 1000 } = {}) {
  const value = Number(rank) || 0;
  if (unranked && value > threshold) return `${threshold}+`;
  return value > 0 ? String(value) : '—';
}
