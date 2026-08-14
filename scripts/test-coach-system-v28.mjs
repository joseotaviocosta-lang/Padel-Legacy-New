import fs from 'node:fs';

const coaches = fs.readFileSync('src/lib/coaches.js','utf8');
const lifecycle = fs.readFileSync('src/game-core/coachLifecycle.js','utf8');
const page = fs.readFileSync('src/pages/Coaches.jsx','utf8');
const staff = fs.readFileSync('src/components/economy/StaffPanel.jsx','utf8');
const match = fs.readFileSync('src/components/matches/SimulationModal.jsx','utf8');
// A regressão histórica era "treinador ignorado em torneios": o bônus só
// era aplicado em partida treino. Checar também TournamentModal.jsx garante
// que essa lacuna não volte silenciosamente (Fase 10 / beta readiness).
const tournamentMatch = fs.readFileSync('src/components/tournaments/TournamentModal.jsx','utf8');

const checks = [
  ['catálogo ampliado', coaches.includes("['iniciante', 24]") && coaches.includes("['regional', 28]")],
  ['competências sem bônus negativos', coaches.includes('getCoachCompetencies') && coaches.includes('Math.max(1, Math.round')],
  ['treinador inicial obrigatório', lifecycle.includes('ensureStarterCoach') && lifecycle.includes('coach_paid_by_club: true')],
  ['contrato e salário mensal', lifecycle.includes('coach_contract_end_date') && lifecycle.includes('coach_monthly_salary')],
  ['demissão mantém treinador', lifecycle.includes('replaceWithStarterCoach')],
  ['integração com comissão', staff.includes('Gerenciar treinador principal') && staff.includes('Líder da comissão')],
  ['mercado completo', page.includes("list('-reputation', 500)")],
  ['impacto real em partida treino', match.includes('_coachMatchBonus') && match.includes('getCoachEffects')],
  ['impacto real em partida de torneio', tournamentMatch.includes('_coachMatchBonus') && tournamentMatch.includes('getCoachEffects')],
];
const failed = checks.filter(([,ok]) => !ok);
for (const [name,ok] of checks) console.log(`${ok?'✓':'✗'} ${name}`);
if (failed.length) { console.error(`CoachSystemV28Test: FAIL (${failed.length})`); process.exit(1); }
console.log('CoachSystemV28Test: PASS');
