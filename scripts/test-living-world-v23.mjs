import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const engine = read('src/lib/livingWorldEngine.js');
const gameState = read('src/game-core/gameStateLifecycle.js');
const app = read('src/App.jsx');
const routes = read('src/lib/routeModules.js');
const worldHub = read('src/pages/WorldHub.jsx');
const home = read('src/pages/CareerHub.jsx');

assert(engine.includes('processLivingWorldDay'), 'Motor diário do Universo Vivo ausente.');
assert(engine.includes('createWeeklyWorldBulletin'), 'Boletim semanal ausente.');
assert(engine.includes('weekly-bulletin-${profile.id}-${weekKey}'), 'Boletim não possui chave idempotente por carreira e semana.');
assert(engine.includes("parseDate(date).getUTCDay() === 1"), 'Atualização semanal de ranking não está ancorada na segunda-feira.');
assert(engine.includes('buildTournamentEvent'), 'Eventos contextuais de torneio ausentes.');
assert(engine.includes('buildRankEvent'), 'Eventos contextuais de ranking ausentes.');
assert(engine.includes('buildTeamEvent'), 'Eventos contextuais de duplas ausentes.');
// A partir da auditoria de performance, o Universo Vivo passou a rodar
// dentro de processGameStateDay (junto dos demais sistemas adiados), em vez
// de uma chamada direta em advanceDay que nenhum chamador real acionava
// (todo caller de advanceCareerDay/advanceDay passava deferGlobalProcessing:
// true, então a chamada antiga nunca executava). Isso corrige o "Universo
// Vivo" para rodar de fato tanto no avanço de 1 dia quanto no catch-up de
// avanços em lote (finalizeCareerAdvanceRange), que já reutiliza
// processGameStateDay.
assert(gameState.includes("processLivingWorldDay(updatedProfile, currentDate)"), 'Avanço diário não chama o Universo Vivo.');
assert(app.includes('<Route path="/world" element={<WorldHub />} />'), 'Nova Central do Mundo não está roteada.');
assert(routes.includes("'/world': 'WorldHub'"), 'Pré-carregamento da Central do Mundo ausente.');
assert(worldHub.includes("label: 'Hoje'"), 'Aba Hoje ausente.');
assert(worldHub.includes("label: 'Circuito'"), 'Aba Circuito ausente.');
assert(worldHub.includes("label: 'Mercado'"), 'Aba Mercado ausente.');
assert(worldHub.includes("label: 'História'"), 'Aba História ausente.');
assert(home.includes('<WorldPulse snapshot={worldSnapshot} />'), 'Painel inicial não mostra pulso do mundo.');

console.log('LivingWorldV23Test: PASS');
console.log('✓ Motor diário centralizado');
console.log('✓ Notícias contextuais e idempotentes');
console.log('✓ Boletim semanal por carreira');
console.log('✓ Linha do tempo mundial');
console.log('✓ Central Mundo com 4 abas');
console.log('✓ Dashboard integrado');
