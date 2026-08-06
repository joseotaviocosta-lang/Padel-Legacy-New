import fs from 'node:fs';
import assert from 'node:assert/strict';

const bell = fs.readFileSync('src/components/communications/CommunicationBell.jsx', 'utf8');
const assistant = fs.readFileSync('src/components/career/CareerAssistant.jsx', 'utf8');
const communications = fs.readFileSync('src/pages/Communications.jsx', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');

assert.match(bell, /item\.status === 'nao_lida'/);
assert.doesNotMatch(bell, /item\.status === 'nao_lida' \|\| item\.status === 'decisao_pendente'/);
assert.match(bell, /markAllCommunicationsRead/);
assert.match(bell, /99\+/);
assert.match(assistant, /career-assistant-fab/);
assert.match(css, /\.career-assistant-fab/);
assert.match(css, /width: 3rem !important/);
assert.match(communications, /padel:communications-refresh/);
console.log('HotfixV34_8_1Test: PASS');
