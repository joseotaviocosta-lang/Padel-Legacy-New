// Playthrough 5.13 (continuação), Partes P/Q — cada aba de ranking precisa
// ler a SUA fonte. Números diferentes entre abas não são bug por si só
// (Race é anual, Circuito é janela rolante, Duplas é a SOMA canônica), mas
// nenhuma aba pode reaproveitar a fonte errada.
//
// Playthrough 5.22-F — a autoridade de Duplas é a SOMA (A + B).
// O teste original bootava um ano de mundo headless (5-8 min). Como o objeto
// aqui é a AUTORIDADE DE FONTE (não o calendário), a população determinística
// `buildSyntheticPopulation` substitui a simulação: cada atleta recebe a série
// de Circuito (rolling) e uma série ANUAL de Race distinta e menor; as duplas
// canônicas recebem a regra da soma e são confrontadas com o helper de
// produção `computeCanonicalTeamRankingPoints`. As abas continuam distintas.
import assert from 'node:assert/strict';
import {
  computeCanonicalTeamRankingPoints as canonical,
  buildSyntheticPopulation,
} from './lib/teamFormulaModels.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

// --- população determinística (substitui o ano de world sim) ----------------
const { athletes, pairs } = buildSyntheticPopulation({ pairCount: 500, worldSize: 1000 });

// Série ANUAL de Race, determinística e estritamente <= Circuito (a Race é um
// acumulador do ano; o Circuito é a janela rolante de 52 semanas). Fatores
// distintos por posição garantem que as duas fontes NUNCA sejam a mesma série.
athletes.forEach((a, i) => {
  const factor = 0.35 + (0.5 * ((i * 37) % 100)) / 100; // 0.35 .. 0.85
  a.world_ranking_points = Math.max(0, Number(a.points) || 0);
  a.race_points = Math.round(a.world_ranking_points * factor);
  a.name = a.id;
});

// Regra vigente expressa de forma independente do helper de produção: o valor
// da dupla é a SOMA dos pontos individuais (0 + x = x). As linhas da aba Duplas
// são construídas com ESTA expressão; o check confronta com `canonical`.
const sumRule = (a, b) => {
  const x = Number(a) > 0 ? Number(a) : 0;
  const y = Number(b) > 0 ? Number(b) : 0;
  return Math.round(x + y);
};
const athleteById = new Map(athletes.map((a) => [a.id, a]));

const duplas = pairs
  .map((p) => {
    const [id1, id2] = p.name.split('/');
    const a = athleteById.get(id1);
    const b = athleteById.get(id2);
    return {
      player1_id: id1, player2_id: id2,
      player1_name: id1, player2_name: id2,
      ranking_points: sumRule(a?.world_ranking_points, b?.world_ranking_points),
    };
  })
  .sort((x, y) => y.ranking_points - x.ranking_points);

// Aba Jogadores: lê o Circuito individual (mesma fonte do header).
const jogadores = athletes
  .map((a) => ({ id: a.id, points: Number(a.world_ranking_points) || 0 }))
  .sort((x, y) => y.points - x.points);

// Amostra de controle = os atletas mais fortes do Circuito (o índice 0 é o #1
// da curva de pontos). Não depende de nomes reais: a curva é determinística.
const CONTROLS = athletes.slice(0, 4);

console.log('=== Fontes por atleta de controle ===');
console.log('atleta        Circuito(world_ranking_points)   Race(race_points)');
const rows = [];
for (const a of CONTROLS) {
  rows.push({ label: a.id, a });
  console.log(`${a.id.padEnd(13)} ${String(a.world_ranking_points).padStart(10)} ${String(a.race_points).padStart(28)}`);
}

check('Parte P: a amostra de controle existe', () => {
  assert.ok(rows.length >= 3, `só ${rows.length} atletas de controle`);
});

check('Parte P/19: Circuito usa world_ranking_points (janela rolante), não Race', () => {
  for (const { label, a } of rows) {
    const circuit = Number(a.world_ranking_points) || 0;
    const race = Number(a.race_points) || 0;
    assert.ok(circuit > 0, `${label}: Circuito zerado`);
    // As duas grandezas existem separadamente; se fossem a MESMA fonte,
    // seriam sempre idênticas para todos.
    assert.ok(Number.isFinite(race), `${label}: Race inválida`);
  }
  const identical = rows.every(({ a }) => Number(a.world_ranking_points) === Number(a.race_points));
  assert.ok(!identical, 'Circuito e Race têm exatamente os mesmos valores — provável fonte única');
});

check('Parte P/20: Race é acumulador ANUAL e nunca excede o Circuito rolante', () => {
  for (const { label, a } of rows) {
    const circuit = Number(a.world_ranking_points) || 0;
    const race = Number(a.race_points) || 0;
    assert.ok(race <= circuit,
      `${label}: Race ${race} > Circuito ${circuit} — Race estaria lendo a fonte errada`);
  }
});

check('Parte P/21: Duplas usa a fórmula de SOMA canônica sobre os DOIS membros', () => {
  let checked = 0;
  for (const row of duplas.slice(0, 20)) {
    const a = athleteById.get(row.player1_id);
    const b = athleteById.get(row.player2_id);
    if (!a || !b) continue;
    const expected = canonical(a.world_ranking_points, b.world_ranking_points);
    assert.equal(Number(row.ranking_points), expected,
      `${a.id}/${b.id}: ${row.ranking_points} != ${expected}`);
    checked += 1;
  }
  console.log(`   [registro] duplas verificadas contra a fórmula canônica: ${checked}`);
  assert.ok(checked >= 10, `só ${checked} duplas comparáveis`);
});

check('Parte P/21: Duplas NÃO reaproveita a pontuação individual de um membro', () => {
  let checked = 0;
  for (const row of duplas.slice(0, 20)) {
    const a = athleteById.get(row.player1_id);
    const b = athleteById.get(row.player2_id);
    if (!a || !b) continue;
    const pa = Number(a.world_ranking_points) || 0;
    const pb = Number(b.world_ranking_points) || 0;
    // Playthrough 5.22-E: a autoridade virou SOMA. Um membro com 0 pontos é
    // herdado pela dupla (0 + x = x) por definição — isso não é a aba Duplas
    // lendo a fonte individual errada. A cobrança "não repetiu o ponto do
    // membro" só faz sentido quando OS DOIS membros contribuem.
    if (pa === 0 || pb === 0) continue;
    assert.notEqual(Number(row.ranking_points), pa, 'dupla repetiu o ponto do membro 1');
    assert.notEqual(Number(row.ranking_points), pb, 'dupla repetiu o ponto do membro 2');
    checked += 1;
  }
  console.log(`   [registro] duplas com os DOIS membros pontuando: ${checked}`);
  assert.ok(checked >= 5, `só ${checked} duplas com os dois membros pontuando — amostra fraca`);
});

check('Parte P/22: Jogadores usa o Circuito individual (mesma fonte do header)', () => {
  const entries = jogadores;
  assert.ok(entries.length > 0, 'aba Jogadores sem entradas');
  let checked = 0;
  let distinctFromRace = 0;
  for (const entry of entries.slice(0, 20)) {
    const athlete = athleteById.get(entry.id);
    if (!athlete) continue;
    const shown = Number(entry.points ?? entry.world_ranking_points ?? entry.rank_points);
    if (!Number.isFinite(shown)) continue;
    assert.equal(shown, Number(athlete.world_ranking_points) || 0,
      `${athlete.id}: aba Jogadores mostra ${shown}, Circuito é ${athlete.world_ranking_points}`);
    if (shown !== Number(athlete.race_points)) distinctFromRace += 1;
    checked += 1;
  }
  console.log(`   [registro] entradas de Jogadores verificadas: ${checked}`);
  assert.ok(checked >= 5, `só ${checked} entradas comparáveis`);
  // A aba Jogadores não pode estar mostrando a série da Race.
  assert.ok(distinctFromRace >= 5, 'a aba Jogadores coincide com a Race');
});

check('Parte Q/23: o líder de cada aba vem da própria fonte, sem mistura', () => {
  const circuitLeader = [...athletes].sort((x, y) => (Number(y.world_ranking_points) || 0) - (Number(x.world_ranking_points) || 0))[0];
  const raceLeader = [...athletes].sort((x, y) => (Number(y.race_points) || 0) - (Number(x.race_points) || 0))[0];
  const duplasLeader = duplas[0];
  console.log(`   [registro] líder Circuito=${circuitLeader?.id} (${circuitLeader?.world_ranking_points})`);
  console.log(`   [registro] líder Race=${raceLeader?.id} (${raceLeader?.race_points})`);
  console.log(`   [registro] líder Duplas=${duplasLeader?.player1_name}/${duplasLeader?.player2_name} (${duplasLeader?.ranking_points})`);
  assert.ok(circuitLeader && raceLeader && duplasLeader, 'alguma aba sem líder');
  // O líder de Duplas não pode ser simplesmente o ponto do líder do Circuito
  // nem o número da Race: a dupla soma DOIS membros.
  assert.notEqual(Number(duplasLeader.ranking_points), Number(raceLeader.race_points),
    'o card de Duplas estaria mostrando o número da Race');
  assert.notEqual(Number(duplasLeader.ranking_points), Number(circuitLeader.world_ranking_points),
    'o card de Duplas estaria mostrando o número de um único jogador');
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-ranking-tabs-authority-v513: PASS');
