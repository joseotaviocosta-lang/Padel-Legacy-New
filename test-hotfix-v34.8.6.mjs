import fs from 'node:fs';
import assert from 'node:assert/strict';

const bell = fs.readFileSync('src/components/communications/CommunicationBell.jsx', 'utf8');
const rally = fs.readFileSync('src/engine/match/RallyEngine.js', 'utf8');
const calendar = fs.readFileSync('src/pages/CalendarPage.jsx', 'utf8');

assert.match(bell, /ensureContextualCareerCommunications/);
assert.match(bell, /padel:profile-updated/);
assert.match(bell, /setInterval\(safeLoad, 15000\)/);
assert.match(calendar, /padel:communications-refresh/);
assert.match(rally, /doubleFaultChance/);
assert.match(rally, /shot === 'serve' && rallyLength === 1/);
assert.match(rally, /continue;/);
console.log('HotfixV34_8_6Test: PASS');
