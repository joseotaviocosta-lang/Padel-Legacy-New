import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const lifecycle = read('./src/game-core/calendarLifecycle.js');
const career = read('./src/lib/career.js');
const calendar = read('./src/pages/CalendarPage.jsx');
const missions = read('./src/missions/periodicMissionCatalog.js');

assert.match(career, /advanceDay\(profile, \{ deferGlobalProcessing = false \}/);
assert.match(lifecycle, /deferGameState: true, deferGlobalProcessing: true/);
assert.match(lifecycle, /finalizeCareerAdvanceRange/);
assert.match(calendar, /finalizeCareerAdvanceRange\(updated, result\.rangeStartDate/);
assert.match(calendar, /schedule_calendar_activity/);
assert.match(missions, /objective_type:'schedule_calendar_activity'/);
assert.doesNotMatch(missions, /daily-calendar[^\n]+objective_type:'visit_calendar'/);
console.log('HotfixV34_8_5Test: PASS');
