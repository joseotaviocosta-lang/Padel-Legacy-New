import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const worldTour = fs.readFileSync('src/gameplay/worldTour/WorldTourLifecycle.js', 'utf8');
const tournamentLifecycle = fs.readFileSync('src/game-core/tournamentLifecycle.js', 'utf8');
const communications = fs.readFileSync('src/lib/careerCommunications.js', 'utf8');
const press = fs.readFileSync('src/pages/Press.jsx', 'utf8');
const catalog = fs.readFileSync('src/lib/circuitCatalog.js', 'utf8');

assert(worldTour.includes('ensureWorldTourDraws'), 'World Tour deve ter lifecycle de draw D-3');
assert(worldTour.includes('ai_partner_id'), 'pares canônicos devem aceitar a identidade persistida do save foundation');
assert(worldTour.includes('playerTournamentIds'), 'draw AI-only deve excluir inscrições ativas do jogador');
assert(worldTour.includes("status: 'chaveamento'"), 'draw D-3 deve congelar inscrições');
assert(worldTour.includes("status: 'em_andamento'"), 'torneio desenhado deve entrar em andamento no D0');
assert(tournamentLifecycle.includes('partnerResultRow'), 'settlement deve criar resultado para o parceiro');
assert(tournamentLifecycle.includes("entityName: 'AthleteProfile'"), 'settlement deve atualizar o AthleteProfile canônico do parceiro');
assert(communications.includes("entityName: 'PressInterview'"), 'entrevista deve ser persistida como entidade');
assert(press.includes('PressInterview'), 'resposta deve atualizar a entrevista persistida');
assert(catalog.includes('Masters: 12') && catalog.includes('Elite: 6') && catalog.includes('Crown: 2'), 'calendário elite deve seguir a política 4.4');

const result = spawnSync(process.execPath, ['scripts/diag-playthrough-4-4-audit.mjs'], {
  encoding: 'utf8',
  maxBuffer: 30 * 1024 * 1024,
});
assert.equal(result.status, 0, result.stderr || result.stdout.slice(-5000));
assert(result.stdout.includes('CALENDAR_BEFORE'), 'auditoria deve medir o calendário');
assert(result.stdout.includes('CHECKPOINT_ROW 2026-01-28'), 'auditoria deve observar D-3');
assert(/CHECKPOINT_ROW 2026-01-28[^\n]*schema=2/.test(result.stdout), 'ao menos um AI-only deve ter chave v2 no D-3');
assert(result.stdout.includes('RACE_ROWS'), 'auditoria deve medir as projeções de Race');

const playerPoints = spawnSync(process.execPath, ['scripts/test-playthrough-4-4-player-points.mjs'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
assert.equal(playerPoints.status, 0, playerPoints.stderr || playerPoints.stdout);
assert(playerPoints.stdout.includes('player_points=10 partner_points=10'), 'player e parceiro devem pontuar igualmente');

console.log('test-playthrough-4-4: PASS');
