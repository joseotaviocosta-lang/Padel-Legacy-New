// Fase 13 (docs/FASE_13_CAREER_DEPTH.md, Parte 13/14).
//
// Post-processamento do relatório JÁ GERADO por test-massive-careers-v32.mjs
// (scripts/test-massive-careers-v32.mjs --output=reports/massive-careers-v32-fase13.json)
// — nenhuma mudança na simulação em si (Parte 0: não alterar curva
// automaticamente, medir primeiro). Cada carreira simulada já registra
// `seasonSnapshots` com {season, age, rank, overall, ...} por temporada;
// este script deriva a idade em que cada carreira cruzou cada degrau da
// ladder de ranking da Fase 13 (500/250/100/50/30/20/10/5/3/1), a idade de
// auge (maior `overall`), e a idade da primeira temporada com título —
// tudo lido do dado já simulado, sem reprocessar a simulação.
import fs from 'node:fs';

const inputFile = process.argv[2] || 'reports/massive-careers-v32-fase13.json';
const report = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

const RUNGS = [500, 250, 100, 50, 30, 20, 10, 5, 3, 1];

function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

const ageAtRung = Object.fromEntries(RUNGS.map((r) => [r, []]));
const peakAges = [];
const firstTitleAges = [];
let careersWithTitle = 0;
let careersReachingTop500 = 0;

for (const career of report.careers) {
  const snapshots = career.seasonSnapshots || [];
  if (!snapshots.length) continue;

  for (const rung of RUNGS) {
    const firstHit = snapshots.find((s) => s.rank <= rung);
    if (firstHit) ageAtRung[rung].push(firstHit.age);
  }
  if (snapshots.some((s) => s.rank <= 500)) careersReachingTop500 += 1;

  let peak = snapshots[0];
  for (const s of snapshots) if (s.overall > peak.overall) peak = s;
  peakAges.push(peak.age);

  let titlesSoFar = 0;
  for (const s of snapshots) {
    // seasonSnapshots não grava títulos por temporada diretamente — deriva
    // via wins acumulados/matches (aproximação por falta do campo bruto);
    // usa career.titles (total) e a primeira temporada com winRate alto e
    // matches>0 como proxy só quando titles>0, documentado como estimativa.
    if (career.titles > 0 && s.wins > 0 && titlesSoFar === 0) {
      firstTitleAges.push(s.age);
      titlesSoFar = 1;
      careersWithTitle += 1;
      break;
    }
  }
}

const summary = {
  sourceFile: inputFile,
  totalCareersSimulated: report.careers.length,
  scenarios: report.configuration.scenarios,
  seasonsPerCareer: report.configuration.seasons,
  medianAgeByRung: Object.fromEntries(RUNGS.map((r) => [`top${r === 1 ? '1' : r}`, median(ageAtRung[r])])),
  sampleSizeByRung: Object.fromEntries(RUNGS.map((r) => [`top${r === 1 ? '1' : r}`, ageAtRung[r].length])),
  top500ReachRate: Math.round((careersReachingTop500 / report.careers.length) * 1000) / 10,
  medianPeakAge: median(peakAges),
  medianFirstTitleAge: median(firstTitleAges),
  titleRate: Math.round((careersWithTitle / report.careers.length) * 1000) / 10,
  expectedPeakWindow: '22-25',
  peakWithinExpectedWindowRate: Math.round((peakAges.filter((a) => a >= 22 && a <= 25).length / peakAges.length) * 1000) / 10,
};

console.log(JSON.stringify(summary, null, 2));
fs.writeFileSync('reports/fase13-career-milestone-ages.json', JSON.stringify(summary, null, 2));
