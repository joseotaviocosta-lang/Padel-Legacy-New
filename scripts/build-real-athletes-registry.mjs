// Fase 2, itens 2A/2B — gera o registro canônico único dos atletas reais
// (src/data/realAthletesRegistry.json) a partir do snapshot FIP
// (src/data/fip-top100-2026-08-31.json) + precedência dos 24 originais
// calibrados à mão (src/data/worldSeed2025.json, versão pré-Fase-2).
//
// Reexecutável: um novo snapshot FIP substitui o arquivo de entrada e este
// script regenera o registro. Não editar o JSON de saída à mão.
//
// Uso: node scripts/build-real-athletes-registry.mjs
//   [--fip=src/data/fip-top100-2026-08-31.json] [--legacy=src/data/worldSeed2025.json.bak]
//   [--out=src/data/realAthletesRegistry.json]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const FIP_PATH = args.fip || 'src/data/fip-top100-2026-08-31.json';
const LEGACY_PATH = args.legacy || 'src/data/worldSeed2025.json';
const OUT_PATH = args.out || 'src/data/realAthletesRegistry.json';

// FNV-1a — mesma função usada em toda a base (src/lib/hashUtils.js), copiada
// aqui porque este script roda em Node puro, sem o alias `@/` do Vite.
function fnv1aHash(str) {
  let value = 2166136261;
  for (let i = 0; i < str.length; i += 1) { value ^= str.charCodeAt(i); value = Math.imul(value, 16777619); }
  return value >>> 0;
}
function hash01(seed) { return fnv1aHash(String(seed)) / 4294967295; }
// PRNG seedado (mulberry32, mesmo padrão usado nos harnesses desta base) —
// usado só para a idade sintética abaixo. FNV-1a em duas strings quase
// idênticas (`id:age:u1` vs `id:age:u2`) pode correlacionar (achado da Fase
// 1C desta mesma auditoria); avançar o ESTADO de um PRNG entre duas
// chamadas evita essa correlação.
function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// pointsForRank — reimplementação idêntica a src/lib/rankingPopulation.js
// (mesma curva, mesmas âncoras). Fase 2B.3: fip_points usa a escala oficial
// FIP (Coello = 20.909), incompatível com a escala interna do motor
// (world_ranking_points, Coello = 13.000, calibrada nos 24 originais).
// Em vez de reescalar fip_points linearmente (arriscado — a forma da curva
// FIP não é necessariamente a mesma), usamos fip_rank através da MESMA
// curva rank->pontos já calibrada e em uso — pointsForRank(rank, total=1000)
// tratando os 100 reais como as 100 posições absolutas do topo de um mundo
// de 1000. Verificado: pointsForRank(1)=13000 e pointsForRank(24)=3110
// reproduzem exatamente os valores hardcoded dos 24 originais — a curva já
// era, na prática, "rank absoluto de um mundo de 1000", não "rank relativo
// aos 24 reais". fip_points/fip_rank ficam preservados só como proveniência.
const WORLD_RANKING_TARGET = 1000;
const RANKING_POINT_ANCHORS = Object.freeze([
  [1, 13000], [10, 9130], [24, 3110], [50, 2050], [100, 1200],
  [200, 650], [350, 340], [500, 200], [750, 65], [1000, 1],
]);
function pointsForRank(rank, total = WORLD_RANKING_TARGET) {
  const safeRank = Math.max(1, Math.min(total, Math.round(Number(rank) || total)));
  const scaledRank = total === WORLD_RANKING_TARGET ? safeRank
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

const COUNTRY_NAME_BY_CODE = Object.freeze({
  ESP: 'Espanha', ARG: 'Argentina', BRA: 'Brasil', ITA: 'Itália', PAR: 'Paraguai',
  MEX: 'México', BEL: 'Bélgica', POR: 'Portugal', FRA: 'França', CHI: 'Chile',
  UAE: 'Emirados Árabes Unidos',
});

function normName(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Fase 2B.1: os 24 originais já tinham overall_rating/potential/play_style/
// position calibrados à mão em worldSeed2025.json — a curva automática
// (suggested_ovr) só se aplica onde não há calibração manual prévia.
// 12 dos 24 batem por nome exato no snapshot novo; os outros 12 mudaram de
// forma curta pra formal entre um snapshot e outro (ex.: "Mike Yanguas" no
// jogo, "Miguel Yanguas" no FIP) — resolvidos abaixo por correspondência de
// sobrenome + proximidade de fip_rank + país, um a um, com o rank antigo
// entre parênteses para auditoria. "Pablo Cardona" (antigo rank 18) não
// aparece nos 100 do novo snapshot — saiu do top 100, sem substituto forçado.
const NICKNAME_TO_FORMAL_NAME = Object.freeze({
  'mike yanguas': 'miguel yanguas',       // antigo rank 7  -> novo rank 8
  'coki nieto': 'jorge nieto',            // antigo rank 8  -> novo rank 10
  'paquito navarro': 'francisco navarro', // antigo rank 9  -> novo rank 9
  'leo augsburger': 'leandro augsburger', // antigo rank 12 -> novo rank 6
  'javi leal': 'javier leal',             // antigo rank 14 -> novo rank 15
  'momo gonzalez': 'jeronimo gonzalez',   // antigo rank 15 -> novo rank 14
  'fran guerrero': 'francisco guerrero',  // antigo rank 16 -> novo rank 13
  'javi garrido': 'javier garrido',       // antigo rank 17 -> novo rank 20
  'edu alonso': 'eduardo alonso',         // antigo rank 19 -> novo rank 17
  'alex arroyo': 'alejandro arroyo',      // antigo rank 21 -> novo rank 27
  'sanyo gutierrez': 'carlos daniel gutierrez', // antigo rank 23 -> novo rank 24
});

// Fase 2B.2: idade sintética, centrada em 26-28, SEM correlação com rank
// (idade não é correlacionada a ranking no padel real). Box-Muller sobre
// hashes determinísticos do id -> normal(27, 5), recortada em [18, 41].
// Desvio de 5 anos deixa a massa da gaussiana quase inteira dentro do
// recorte (±2.6 desvios), evitando o empilhamento artificial na borda que
// uma soma de uniformes truncada produzia.
function syntheticAge(id) {
  const rand = mulberry32(fnv1aHash(`age:${id}`));
  const u1 = Math.min(0.999999, Math.max(1e-6, rand()));
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const age = Math.round(27 + z * 5);
  return Math.max(18, Math.min(41, age));
}
function birthDateForAge(age, snapshotDate, id) {
  const [y] = snapshotDate.split('-').map(Number);
  const birthYear = y - age;
  // Mês/dia sintéticos mas determinísticos (evita todo mundo "nascer" no
  // mesmo dia, o que quebraria a distinção de idade dentro do próprio ano).
  const month = 1 + (fnv1aHash(`${id}:month`) % 12);
  const day = 1 + (fnv1aHash(`${id}:day`) % 28);
  return `${birthYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const PLAY_STYLES = ['Potência', 'Agressivo', 'Tático', 'Defensivo', 'Equilibrado'];
function deterministicStyle(id) { return PLAY_STYLES[fnv1aHash(`${id}:style`) % PLAY_STYLES.length]; }
function deterministicPosition(id) { return fnv1aHash(`${id}:side`) % 2 === 0 ? 'esquerda' : 'direita'; }

function suggestedOvrCurve(rank) {
  return Math.max(78, Math.round(97 - 19 * Math.log(rank) / Math.log(100)));
}

function main() {
  const fip = JSON.parse(readFileSync(FIP_PATH, 'utf8'));
  const legacyExists = existsSync(LEGACY_PATH);
  const legacy = legacyExists ? JSON.parse(readFileSync(LEGACY_PATH, 'utf8')) : { athletes: [] };
  const legacyByNorm = new Map(legacy.athletes.map((a) => [normName(a.name), a]));

  const players = fip.players;
  const idByNormName = new Map(players.map((p) => [normName(p.name), p.id]));

  // Mapa reverso: nome FORMAL (novo snapshot) -> nome de APELIDO (registro
  // antigo), pra descobrir se esta entrada do novo snapshot é, na verdade,
  // um dos 24 originais sob um nome diferente.
  const formalToNickname = new Map(Object.entries(NICKNAME_TO_FORMAL_NAME).map(([nick, formal]) => [formal, nick]));

  let ovrPrecedenceCount = 0;
  const registry = players.map((p) => {
    const norm = normName(p.name);
    const nicknameNorm = formalToNickname.get(norm) || null;
    const legacyMatch = legacyByNorm.get(norm) || (nicknameNorm ? legacyByNorm.get(nicknameNorm) : null) || null;

    const curveOvr = Number.isFinite(p.suggested_ovr) ? p.suggested_ovr : suggestedOvrCurve(p.fip_rank);
    const overall_rating = legacyMatch ? legacyMatch.overall_rating : curveOvr;
    const potential = legacyMatch ? legacyMatch.potential : Math.min(100, curveOvr + 2);
    if (legacyMatch) ovrPrecedenceCount += 1;

    const age = syntheticAge(p.id);
    const birth_date = birthDateForAge(age, fip.snapshot_date, p.id);
    const world_ranking_points = pointsForRank(p.fip_rank);
    const countryName = COUNTRY_NAME_BY_CODE[p.country] || p.country;

    const partnerId = p.partner_confidence ? (idByNormName.get(normName(p.partner_snapshot)) || null) : null;

    return {
      id: p.id,
      bot_id: p.id,
      is_real: true,
      name: p.name,
      country: countryName,
      country_code: p.country,
      age,
      birth_date,
      position: legacyMatch ? legacyMatch.position : deterministicPosition(p.id),
      play_style: legacyMatch ? legacyMatch.play_style : deterministicStyle(p.id),
      overall_rating,
      potential,
      world_ranking_points,
      race_points: 0,
      career_phase: legacyMatch ? legacyMatch.career_phase : 'Auge',
      morale: legacyMatch ? legacyMatch.morale : 70,
      fatigue: legacyMatch ? legacyMatch.fatigue : 5,
      fan_appeal: legacyMatch ? legacyMatch.fan_appeal : Math.max(60, 100 - p.fip_rank),
      sponsor_appeal: legacyMatch ? legacyMatch.sponsor_appeal : Math.max(55, 98 - p.fip_rank),
      active: true,
      retired: false,
      seed_source: 'fip_2026_08_31',
      seed_rank: p.fip_rank,
      fip_rank: p.fip_rank,
      fip_points: p.fip_points,
      partner_confidence: p.partner_confidence || null,
      partner_snapshot: p.partner_snapshot || null,
      partner_id: partnerId,
      ovr_precedence: Boolean(legacyMatch),
    };
  });

  // integridade básica no próprio build: nenhum id duplicado, todo partner_id resolvido
  const ids = new Set();
  const dupes = [];
  for (const r of registry) { if (ids.has(r.id)) dupes.push(r.id); ids.add(r.id); }
  const unresolvedPartners = registry.filter((r) => r.partner_confidence && !r.partner_id);
  if (dupes.length) throw new Error(`ids duplicados no registro: ${dupes.join(', ')}`);
  if (unresolvedPartners.length) {
    throw new Error(`partner_snapshot não resolvido para: ${unresolvedPartners.map((r) => `${r.name} -> "${r.partner_snapshot}"`).join('; ')}`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: FIP_PATH,
    snapshot_date: fip.snapshot_date,
    count: registry.length,
    athletes: registry,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));

  const matchedLegacyNames = new Set();
  for (const r of registry) {
    if (!r.ovr_precedence) continue;
    const norm = normName(r.name);
    const nicknameNorm = formalToNickname.get(norm);
    matchedLegacyNames.add(legacyByNorm.has(norm) ? norm : nicknameNorm);
  }
  const droppedFromOld24 = legacy.athletes.filter((a) => !matchedLegacyNames.has(normName(a.name)));

  console.log(`Registro gerado: ${registry.length} atletas reais.`);
  console.log(`Precedência do legado aplicada (overall/potential/play_style/position mantidos): ${ovrPrecedenceCount}/${legacy.athletes.length}.`);
  if (droppedFromOld24.length) {
    console.log(`Dos 24 originais, saíram do novo top 100 (sem precedência aplicada): ${droppedFromOld24.map((a) => a.name).join(', ')}.`);
  }
  console.log(`Salvo em ${OUT_PATH}.`);
}

main();
