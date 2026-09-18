import fs from 'node:fs';
import assert from 'node:assert/strict';

const padel = fs.readFileSync(new URL('../src/lib/padel.js', import.meta.url), 'utf8');
const circuit = fs.readFileSync(new URL('../src/lib/circuitCatalog.js', import.meta.url), 'utf8');
const training = fs.readFileSync(new URL('../src/lib/trainingSystemV2.js', import.meta.url), 'utf8');
const calendar = fs.readFileSync(new URL('../src/lib/calendarSystem.js', import.meta.url), 'utf8');

const maxXp = Number(padel.match(/CAREER_EXPERIENCE_MAX_XP\s*=\s*(\d+)/)?.[1]);
const curve = Number(padel.match(/CAREER_EXPERIENCE_CURVE\s*=\s*([\d.]+)/)?.[1]);
assert.equal(maxXp, 100000);
assert.equal(curve, 1.85);
const xpForLevel = (level) => Math.round(maxXp * Math.pow((level - 1) / 49, curve));
assert(xpForLevel(20) < 35000);
assert(xpForLevel(40) < 70000);
assert.equal(xpForLevel(50), 100000);

const programBlock = circuit.match(/const WEEK_PROGRAM = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
const weeks = [...programBlock.matchAll(/\[(\d+),\[([^\]]+)\]\]/g)];
const configuredTiers = circuit.match(/const TIER_EVENTS_PER_YEAR = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1] || '';
const configuredEventCount = [...configuredTiers.matchAll(/:\s*(\d+)/g)].reduce((sum, match) => sum + Number(match[1]), 0);
const eventCount = weeks.length
  ? weeks.reduce((sum, match) => sum + (match[2].match(/'/g)?.length || 0) / 2, 0)
  : configuredEventCount;
// O calendário atual é montado por buildWeekProgram(), não por um literal
// WEEK_PROGRAM. Valida a fonte declarativa e o volume configurado sem acoplar
// o teste à representação interna da distribuição.
assert(circuit.includes('function buildWeekProgram'));
assert(eventCount >= 24);
assert(training.includes('getAttributeDevelopmentCeiling'));
assert(training.includes('development.multiplier'));
assert(calendar.includes('executeWeeklyTrainingPlan'));
assert(calendar.includes('weekly_training_enabled'));

console.log(JSON.stringify({
  status: 'ok',
  maxCareerXp: maxXp,
  level20Xp: xpForLevel(20),
  level40Xp: xpForLevel(40),
  tournamentsPerYear: eventCount,
  tournamentWeeks: weeks.length || 'generated-by-buildWeekProgram',
  automaticTraining: true,
  potentialCeilings: true,
}, null, 2));
