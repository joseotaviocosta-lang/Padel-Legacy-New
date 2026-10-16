import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
// CLOUD-2: os módulos de src/ usam o alias '@/', que o node puro não resolve
// (ERR_MODULE_NOT_FOUND). Carregados via Vite SSR, como os kits v52x.
import { createServer } from 'vite';
const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });

const root = process.cwd();
const momentsPath = path.join(root, 'src/lib/careerMoments.js');
const bannerPath = path.join(root, 'src/components/career/CareerMomentBanner.jsx');
const hubPath = path.join(root, 'src/pages/CareerHub.jsx');

for (const file of [momentsPath, bannerPath, hubPath]) assert.ok(fs.existsSync(file), `Arquivo ausente: ${file}`);
const { deriveCareerMoment } = await vite.ssrLoadModule('/src/lib/careerMoments.js');
await vite.close();

const base = { id: 'player-1', career_date: '2028-03-10', partner_id: 'p2' };
assert.equal(deriveCareerMoment({ ...base, is_injured: true, injury_days_remaining: 4 }, {}).type, 'injury');
assert.equal(deriveCareerMoment(base, { worldRank: { rank: 8 } }).type, 'ranking');
assert.equal(deriveCareerMoment(base, { nextTournament: { id: 't1', name: 'Premier Madrid', start_date: '2028-03-12' } }).type, 'tournament');
// CLOUD-2: desde a Fase 13 o momento só conta partidas OFICIAIS de torneio
// (careerStory.isOfficialMatch); a fixture marca as partidas como oficiais.
const officialWin = (id, date) => ({ id, status: 'completed', player_won: true, match_date: date, competition_type: 'tournament', is_official: true });
const streak = [officialWin('m1', '2028-03-09'), officialWin('m2', '2028-03-08'), officialWin('m3', '2028-03-07'), officialWin('m4', '2028-03-06')];
assert.equal(deriveCareerMoment(base, { matches: streak }).type, 'form');
// Negativo: a mesma sequência em amistosos não vira "grande fase".
assert.equal(deriveCareerMoment(base, { matches: streak.map((m) => ({ ...m, competition_type: 'friendly', is_official: false })) }), null);
assert.equal(deriveCareerMoment(base, {}), null);

const hub = fs.readFileSync(hubPath, 'utf8');
// CLOUD-2: na Home da 5.30 o banner virou a faixa de momento (CareerMomentStrip).
assert.match(hub, /CareerMomentStrip moment=\{careerMoment\}/);
assert.match(hub, /deriveCareerMoment/);
console.log('LivingCareerV34_5Test: PASS (atmosfera contextual e momentos da carreira)');
