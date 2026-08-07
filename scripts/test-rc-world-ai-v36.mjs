import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/game-core/aiCareerStrategyLifecycle.js'), 'utf8');
const lifecycle = fs.readFileSync(path.join(root, 'src/game-core/gameStateLifecycle.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.match(source, /deriveAiCareerArchetype/);
assert.match(source, /decideAiCareerStrategy/);
assert.match(source, /processAiCareerStrategyMonth/);
assert.match(source, /last_ai_career_strategy_month/);
assert.match(source, /wantsCoachChange/);
assert.match(source, /ai_calendar_intensity/);
assert.match(source, /ai_commercial_strategy/);
assert.match(source, /ai_partnership_strategy/);
assert.match(lifecycle, /processAiCareerStrategyMonth/);
assert.equal(pkg.scripts['test:rc-world-ai'], 'node scripts/test-rc-world-ai-v36.mjs');

const archetypes = ['showman', 'tactician', 'worker', 'competitor', 'balanced'];
for (const value of archetypes) assert.match(source, new RegExp(`['\"]${value}['\"]`));

console.log('RCWorldAIV36Test: PASS (12/12)');
