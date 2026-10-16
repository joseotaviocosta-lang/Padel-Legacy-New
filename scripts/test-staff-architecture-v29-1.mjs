import fs from 'node:fs';
import assert from 'node:assert/strict';

const economy = fs.readFileSync('src/lib/economy.js', 'utf8');
const staffPanel = fs.readFileSync('src/components/economy/StaffPanel.jsx', 'utf8');
const app = fs.readFileSync('src/App.jsx', 'utf8');
const nav = fs.readFileSync('src/navigation/navigationConfig.js', 'utf8');
const economyPage = fs.readFileSync('src/pages/Economy.jsx', 'utf8');

assert(!economy.includes('normalized.length + principalCoachCount'), 'Treinador principal ainda ocupa vaga no hireStaff.');
assert(economy.includes('if (normalized.length >= slots)'), 'Validação de vagas da comissão não foi corrigida.');
assert(staffPanel.includes('const occupiedSlots = activeStaff.length'), 'Contador visual deve considerar apenas profissionais de apoio.');
assert(app.includes('path="/staff"'), 'Rota exclusiva da comissão técnica ausente.');
// CLOUD-2: a navegação foi reorganizada em hubs — a Comissão vive em
// Carreira → Equipe (TeamHub, aba "Comissão"), e /staff é alias dessa seção.
const teamHub = fs.readFileSync('src/pages/hubs/TeamHub.jsx', 'utf8');
assert(nav.includes("to: APP_ROUTES.CAREER_TEAM") && nav.includes("label: 'Equipe'") && /aliases: \[[^\]]*'\/staff'/.test(nav), 'Comissão técnica sem entrada de navegação (Carreira → Equipe, alias /staff).');
assert(/key: 'staff', label: 'Comissão'/.test(teamHub), 'Hub Equipe sem a aba Comissão.');
assert(!economyPage.includes("id: 'staff'"), 'Economia ainda exibe a comissão como aba operacional.');

console.log('StaffArchitectureV29_1Test: PASS');
console.log('✓ treinador principal não ocupa vaga');
console.log('✓ contador usa somente profissionais de apoio');
console.log('✓ comissão possui rota própria');
console.log('✓ navegação: Carreira → Equipe → Comissão (alias /staff)');
console.log('✓ economia mantém apenas gestão financeira');
