import { localGame } from '@/api/localGameClient.js';

// Playthrough 5.12 — MATERIALIZAÇÃO DO PARCEIRO DO JOGADOR.
//
// Problema que isto resolve: o parceiro do jogador nascia como uma projeção
// estática de `BOTS_BY_DIFFICULTY` (src/lib/bots.js), que por sua vez é uma
// vista de `buildAthleteCatalog()`. Esse objeto vive num módulo, nunca no
// save: não tem linha própria, não entra no pipeline mensal
// (`evolveAthleteCareerMonth`), não envelhece, não evolui e não existe no
// mundo depois que a parceria acaba.
//
// Aqui o parceiro vira um AthleteProfile de verdade, e o mundo vivo faz o
// resto. NÃO existe um segundo motor de evolução: o atleta materializado
// carrega exatamente os campos que `evolveAthleteCareerMonth` já consome
// (`id`, `overall_rating`, `potential`, `age`, `growth_rate`,
// `decline_rate`, `last_career_evolution_month`).
//
// ---------------------------------------------------------------------
// Achados de auditoria que definem o desenho (Partes A/G/U/V):
//
// 1. ESCALA — `overall_rating` de bot e de atleta do mundo estão na MESMA
//    escala 1–100. As faixas de `BOT_DIFFICULTIES` cobrem 1–100 de forma
//    contínua (iniciante 1–24 ... lenda 85–100) e o mundo ocupa 35–96
//    dentro dela. OVR 13 é um "Iniciante" legítimo, não outra unidade —
//    então a materialização COPIA o valor, sem normalizar e sem inflar
//    (Parte T).
//
// 2. OVR NÃO É DERIVADO PARA ATLETAS — `overallRating()` (padel.js) é a
//    média de ATTRIBUTE_KEYS e serve ao PlayerProfile. Nenhum AthleteProfile
//    do mundo tem esses atributos: todos guardam `overall_rating` como
//    escalar, e `overallRating()` devolveria 1 para qualquer um deles. A
//    autoridade de OVR do atleta é, portanto, o campo persistido — é ele
//    que copiamos e é ele que o motor mensal atualiza.
//
// 3. VOCABULÁRIOS DE ATRIBUTO DIFERENTES — os bots fictícios trazem
//    `serve/forehand/.../lob/speed/stamina/strength/reflexes/tactics/
//    positioning/concentration/resilience`, que só coincidem em 6 das 10
//    chaves de ATTRIBUTE_KEYS; os bots "reais" não trazem atributo nenhum.
//    Como nenhum AthleteProfile do mundo usa atributos, NÃO inventamos
//    mapeamento nem preenchemos com zero (Parte V): preservamos o bloco
//    original em `source_attributes` para uma fase futura e deixamos o
//    atleta operando no nível de `overall_rating`, igual ao resto do mundo.
//
// 4. IDENTIDADE — os ids do catálogo (`player-fictional-*`,
//    `player-real-*`) nunca colidem com os do mundo (`athlete-NNN`):
//    medido 0 de 340. Materializar um bot "real" sem cuidado criaria um
//    SEGUNDO Arturo Coello. Por isso a resolução tenta, nesta ordem:
//    (a) id do template já persistido, (b) `bot_id`, (c) nome exato já
//    existente no mundo — e só então cria. Nome é usado apenas como último
//    recurso de RECONCILIAÇÃO com alguém que já existe, nunca como
//    identidade primária.

const ATTRIBUTE_CARRY_KEYS = [
  'serve', 'forehand', 'backhand', 'volley', 'lob', 'smash', 'bandeja',
  'speed', 'stamina', 'strength', 'reflexes', 'tactics', 'positioning',
  'concentration', 'resilience', 'defense', 'agility', 'strategy', 'emotional_control',
];

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const normalizeName = (value) => String(value || '').trim().toLocaleLowerCase('pt-BR');

// Um template de atleta REAL (licenciado/editorial) é o único caso em que
// reconciliar por nome é seguro — ver comentário em
// findMaterializedPartnerAthlete.
function isRealAthleteTemplate(template = {}) {
  if (String(template.source_type || '').toLowerCase() === 'real') return true;
  const id = String(template.id || template.template_id || '');
  return id.startsWith('player-real-') || id.startsWith('real_');
}

// Parte H — potencial determinístico e coerente com idade/OVR quando o
// template não traz um. Sem Math.random: a mesma origem sempre gera o mesmo
// potencial, para o save ser reproduzível.
function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    hash ^= String(value).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function derivePartnerPotential(template = {}) {
  const overall = clamp(template.overall_rating ?? template.overall, 1, 99, 50);
  const declared = Number(template.potential ?? template.potential_rating);
  if (Number.isFinite(declared) && declared >= overall) return Math.min(99, Math.round(declared));
  const age = clamp(template.age, 15, 45, 26);
  // Quanto mais novo, maior a margem de crescimento; veterano fica perto do
  // que já é. Faixa determinística por origem, nunca aleatória.
  const room = age <= 20 ? 18 : age <= 24 ? 12 : age <= 28 ? 7 : age <= 32 ? 3 : 1;
  const jitter = hashString(`${template.id || template.bot_id || template.name}:potential`) % 4;
  return Math.min(99, Math.round(overall + room + jitter));
}

export function partnerAthleteOriginId(template = {}) {
  return template?.id || template?.template_id || template?.bot_id || null;
}

// Parte C/E — resolve um AthleteProfile já existente para este template.
// Idempotente por construção: a mesma origem devolve sempre a mesma linha.
export async function findMaterializedPartnerAthlete(template = {}) {
  const originId = partnerAthleteOriginId(template);
  if (!originId) return null;
  const byId = await localGame.entities.AthleteProfile.filter({ id: originId }, null, 1).catch(() => []);
  if (byId?.[0]) return byId[0];
  const byBotId = await localGame.entities.AthleteProfile.filter({ bot_id: originId }, null, 1).catch(() => []);
  if (byBotId?.[0]) return byBotId[0];
  // Último recurso, e MUITO restrito: reconciliar por nome.
  //
  // Existe um caso legítimo — os atletas REAIS aparecem duas vezes no
  // projeto: o mundo os semeia (`real_*`/`athlete-NNN`) e o catálogo os
  // expõe como `player-real-*`. Materializar um desses sem reconciliar
  // criaria um segundo Arturo Coello.
  //
  // Mas nome NÃO é identidade, e aqui isso é concreto, não teórico: os
  // nomes fictícios saem dos MESMOS pools de primeiro/último nome usados
  // pela população do mundo, então homônimos são comuns. Um teste pegou o
  // estrago: um parceiro "amador" de OVR 31 foi reconciliado com um atleta
  // do mundo homônimo de OVR 74 — uma promoção silenciosa que viola a
  // Parte T (não inflar OVR).
  //
  // Por isso o fallback só vale para templates de atleta REAL, onde a
  // duplicação é conhecida e o nome é uma identidade editorial de fato.
  // Template fictício sempre materializa o próprio atleta.
  if (!isRealAthleteTemplate(template)) return null;
  const name = normalizeName(template.name || template.sport_name);
  if (!name) return null;
  const all = await localGame.entities.AthleteProfile.list(null, 5000).catch(() => []);
  const matches = (all || []).filter((a) => normalizeName(a.name || a.sport_name) === name
    && !a.materialized_from);
  // Ambiguidade não é adivinhada (mesma regra de buildLegacyTeamRankingRepair).
  return matches.length === 1 ? matches[0] : null;
}

// Parte C — helper canônico. Determinístico, idempotente, testável.
export async function materializePartnerAthlete(template = {}, { careerDate = '2026-01-01' } = {}) {
  const originId = partnerAthleteOriginId(template);
  if (!originId || !template?.name) return null;

  const existing = await findMaterializedPartnerAthlete(template);
  if (existing) return existing;

  const overall = clamp(template.overall_rating ?? template.overall, 1, 99, 50);
  const age = clamp(template.age, 15, 45, 26);
  const birthYear = Number(String(careerDate).slice(0, 4)) - age;

  // Parte V — carrega os atributos de origem sem inventar os que faltam.
  const sourceAttributes = {};
  for (const key of ATTRIBUTE_CARRY_KEYS) {
    const value = Number(template[key] ?? template.attributes?.[key]);
    if (Number.isFinite(value)) sourceAttributes[key] = value;
  }

  const payload = {
    id: originId,
    bot_id: template.bot_id || template.template_id || originId,
    name: template.name,
    sport_name: template.name,
    country: template.country || template.nationality || null,
    nationality_code: template.nationality_code || null,
    position: template.position || template.preferred_side || null,
    preferred_side: template.preferred_side || null,
    handedness: template.handedness || null,
    play_style: template.play_style || null,
    tactical_role: template.tactical_role || null,
    archetype_id: template.archetype_id || null,
    personality: template.personality || null,
    // Parte T — COPIA o OVR atual. Nada de inflar por virar persistente.
    overall: overall,
    overall_rating: overall,
    potential: derivePartnerPotential(template),
    age,
    birth_date: `${birthYear}-01-01`,
    // O motor mensal consome estes; defaults neutros = curva padrão.
    growth_rate: 1,
    decline_rate: 1,
    career_status: template.career_status || 'ativo',
    is_active: true,
    // Entra no mundo sem histórico competitivo inventado (Parte O/P: os
    // pontos vêm dos resultados reais, nunca de uma biografia fictícia).
    ranking_position: 0,
    rank_points: 0,
    world_ranking_points: 0,
    race_points: 0,
    morale: clamp(template.morale, 0, 100, 70),
    form: clamp(template.form, 0, 100, 50),
    source_type: template.source_type || 'partner-materialized',
    materialized_from: originId,
    materialized_career_date: careerDate,
    athlete_schema_version: template.athlete_schema_version ?? null,
    source_attributes: Object.keys(sourceAttributes).length ? sourceAttributes : null,
  };

  try {
    return await localGame.entities.AthleteProfile.create(payload);
  } catch (error) {
    console.warn('[materializePartnerAthlete]', error);
    // Corrida: outro caminho pode ter criado no meio. Releitura resolve.
    return await findMaterializedPartnerAthlete(template);
  }
}

// Parte F — reparo idempotente para carreiras que já existem, em que a
// parceria foi formada antes desta fase e o parceiro nunca virou atleta.
// Não reseta nada: contrato, chemistry, confidence, morale, partidas,
// vitórias e títulos vivem na Partnership e continuam intactos.
export async function repairLegacyPlayerPartnerAthlete(profile, resolveTemplate) {
  const summary = { checked: 0, materialized: 0, alreadyReal: 0, unresolved: 0 };
  try {
    const partnerships = await localGame.entities.Partnership.filter(
      { profile_id: profile?.id, status: 'ativa' }, null, 10,
    ).catch(() => []);
    for (const partnership of partnerships || []) {
      const partnerId = partnership.partner_bot_id || partnership.athlete_b_id;
      if (!partnerId) { summary.unresolved += 1; continue; }
      summary.checked += 1;
      const rows = await localGame.entities.AthleteProfile.filter({ id: partnerId }, null, 1).catch(() => []);
      if (rows?.[0]) { summary.alreadyReal += 1; continue; }
      const template = typeof resolveTemplate === 'function' ? resolveTemplate(partnerId) : null;
      if (!template) { summary.unresolved += 1; continue; }
      const created = await materializePartnerAthlete(template, {
        careerDate: partnership.started_career_date || profile?.career_date,
      });
      if (created) summary.materialized += 1; else summary.unresolved += 1;
    }
  } catch (error) { console.warn('[repairLegacyPlayerPartnerAthlete]', error); }
  return summary;
}

// Playthrough 5.26-C, Bloco D — PARCEIRO APOSENTADO NO CATÁLOGO.
//
// A busca de parceiros (`getAvailablePartners`) lê o catálogo ESTÁTICO de
// bots, que não sabe que o atleta materializado daquele template se
// aposentou. Medido na 5.26 (3 carreiras, mesmo parceiro, mesma data): o
// parceiro se aposenta → `processPartnerDay` encerra a dupla → a busca
// oferece o MESMO template → `materializePartnerAthlete` reaproveita a linha
// aposentada → a dupla é encerrada no dia seguinte → ... até 123 vezes.
// Regra única de "aposentado" (a mesma que `processPartnerDay` já aplicava)
// e o conjunto de origens aposentadas, para quem monta a lista de busca.
export function isRetiredAthlete(athlete) {
  if (!athlete) return false;
  const status = String(athlete.career_status || athlete.status || '').toLowerCase();
  return Boolean(athlete.retired) || ['aposentado', 'retired'].includes(status);
}

export async function listRetiredPartnerOriginIds() {
  const [flagged, byStatus] = await Promise.all([
    localGame.entities.AthleteProfile.filter({ retired: true }).catch(() => []),
    localGame.entities.AthleteProfile.filter({ career_status: 'aposentado' }).catch(() => []),
  ]);
  const ids = new Set();
  for (const row of [...(flagged || []), ...(byStatus || [])]) {
    for (const key of [row?.id, row?.bot_id, row?.materialized_from]) if (key) ids.add(String(key));
  }
  return ids;
}

export function excludeRetiredPartnerTemplates(templates, retiredOriginIds) {
  if (!retiredOriginIds?.size) return templates || [];
  return (templates || []).filter((template) => !retiredOriginIds.has(String(partnerAthleteOriginId(template))));
}
