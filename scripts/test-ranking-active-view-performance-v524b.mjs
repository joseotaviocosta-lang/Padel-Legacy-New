// Playthrough 5.24-B, Parte I — Ranking calcula só a view ativa.
//
// Antes: a montagem carregava as 4 views (lista mundial de duplas, lista da
// Race de duplas, posição canônica Mundial e Race da dupla) mesmo com só
// Mundial → Individual visível. Agora a base (HUD + Individual) carrega no
// mount e Duplas carrega sob demanda, uma vez por período, com a MESMA
// autoridade (getTeamRankings/getTeamRank, getTeamRaceRankings/getTeamRaceRank).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');

const mountEffect = source.slice(source.indexOf('useEffect(() => {\n    (async () => {'), source.indexOf('// Playthrough 5.24-B, Parte I — dados de Duplas sob demanda'));
assert.ok(mountEffect.length > 100, 'efeito de montagem encontrado');
assert.doesNotMatch(mountEffect, /getTeamRankings|getTeamRaceRankings|getTeamRank\(|getTeamRaceRank\(/, 'montagem não pode calcular Duplas');
assert.match(mountEffect, /buildWorldRankingSnapshot\(profile\)/, 'base: snapshot individual');
assert.match(mountEffect, /ensurePlayerTeamRanking\(profile\)/, 'linha canônica da dupla continua garantida');

const doublesEffect = source.slice(source.indexOf('// Playthrough 5.24-B, Parte I — dados de Duplas sob demanda'), source.indexOf('// URL → estado'));
assert.match(doublesEffect, /type !== 'doubles'/, 'só roda com Duplas ativa');
assert.match(doublesEffect, /doublesRequestedRef\.current\[period\]/, 'uma vez por período (sem loop)');
assert.match(doublesEffect, /getTeamRankings\(600\)/);
assert.match(doublesEffect, /getTeamRank\(playerProfile, \{ id: partnerId \}\)/);
assert.match(doublesEffect, /getTeamRaceRankings\(600, \{ profile: playerProfile \}\)/);
assert.match(doublesEffect, /getTeamRaceRank\(playerProfile, \{ id: partnerId \}\)/);

// Views de Duplas esperam seus dados (sem mostrar "Sem ranking" provisório).
assert.match(source, /scope === 'world' && type === 'doubles' && doublesReady\.world/);
assert.match(source, /scope === 'race' && type === 'doubles' && doublesReady\.race/);
assert.match(source, /type === 'doubles' && !doublesReady\[/, 'skeleton enquanto Duplas carrega');

// Medição real: o Ranking (Mundial → Individual) caiu e não grava mais.
const before = new URL('../reports/perf-524b/before-heavy-360.json', import.meta.url);
const after = new URL('../reports/perf-524b/after-heavy-360.json', import.meta.url);
if (existsSync(before) && existsSync(after)) {
  const b = JSON.parse(readFileSync(before, 'utf8')).pages.ranking;
  const a = JSON.parse(readFileSync(after, 'utf8')).pages.ranking;
  assert.equal(a.writesMedian, 0, 'abrir o Ranking não pode gravar a carreira');
  assert.ok(a.teamRankingReadsMedian < b.teamRankingReadsMedian, `leituras de TeamRanking ${b.teamRankingReadsMedian} → ${a.teamRankingReadsMedian}`);
  assert.ok(a.tUsefulMedian <= b.tUsefulMedian * 0.5, `render útil ${b.tUsefulMedian}ms → ${a.tUsefulMedian}ms`);
  console.log(`   medido (heavy, CPU 4x): ${b.tUsefulMedian}ms → ${a.tUsefulMedian}ms · TR ${b.teamRankingReadsMedian} → ${a.teamRankingReadsMedian} · writes ${b.writesMedian} → ${a.writesMedian}`);
}

console.log('test-ranking-active-view-performance-v524b: PASS');
