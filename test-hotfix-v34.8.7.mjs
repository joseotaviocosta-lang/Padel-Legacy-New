import fs from 'node:fs';

const file = fs.readFileSync('src/components/tournaments/TournamentModal.jsx', 'utf8');
const checks = [
  ["carrega treinador principal", file.includes("ensureStarterCoach(profile)")],
  ["passa treinador ao motor ao vivo", file.includes("coach={coach}")],
  ["passa configurações do técnico", file.includes("liveCoachSettings={liveCoachSettings}")],
  ["aplica bônus real do treinador", file.includes("_coachMatchBonus: coachMatchBonus")],
  ["modal de torneio limita altura", file.includes("md:h-[min(46rem,92dvh)]")],
  ["partida usa área flexível limitada", file.includes('className="min-h-0 flex-1 overflow-hidden"')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);
if (failed.length) process.exit(1);
console.log(`HotfixV34_8_7Test: PASS (${checks.length}/${checks.length})`);
