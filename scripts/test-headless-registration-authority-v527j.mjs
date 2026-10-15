// Playthrough 5.27-J, Blocos D/S (itens 17/51/52) — PROIBIR BYPASS: todo
// caminho que escreve compromisso de torneio (TournamentRegistration ou o
// CalendarEvent legado) passa pela autoridade canônica antes da escrita; o
// headless usa a mesma função do jogador; previsões/sugestões recebem a parceria.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { runExitScenario } from './lib/v527jScenario.mjs';

const { check, finish } = makeSuite('test-headless-registration-authority-v527j');
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.(js|jsx|mjs)$/.test(f) ? [p.replace(/\\/g, '/')] : []; });
const src = (f) => readFileSync(f, 'utf8');
try {
  await check('inventário: os únicos escritores de compromisso novo são os conhecidos', () => {
    const writers = walk('src').filter((f) => /TournamentRegistration\.(upsert|create|bulkCreate)\(/.test(src(f)));
    assert.deepEqual(writers.sort(), ['src/lib/tournamentRegistration.js'], `escritor novo de TournamentRegistration: ${writers.join(', ')}`);
    const legacyEvent = walk('src').filter((f) => /event_type: 'tournament'/.test(src(f)) && /CalendarEvent\.(create|upsert)\(/.test(src(f)));
    for (const f of legacyEvent) assert.ok(['src/lib/tournamentRegistration.js', 'src/lib/calendarSystem.js', 'src/local/localSeed.js'].includes(f), `CalendarEvent de torneio criado fora dos caminhos mapeados: ${f}`);
  });
  await check('registerTournament passa a parceria ativa à validação (antes de upsert)', () => {
    const s = src('src/lib/tournamentRegistration.js');
    const body = s.slice(s.indexOf('export async function registerTournament'));
    assert.match(body, /evaluateTournamentRegistration\(\{[^)]*partnership: activePartnership/);
    assert.ok(body.indexOf('validation.allowed') < body.indexOf('TournamentRegistration.upsert'), 'a escrita vem antes da checagem');
    assert.match(s, /const exitAuthority = evaluatePartnershipRegistrationAuthority\(partnership/);
  });
  await check('caminho legado de calendário checa a autoridade antes de criar o CalendarEvent', () => {
    const s = src('src/lib/calendarSystem.js');
    const body = s.slice(s.indexOf('export async function registerForTournament'));
    assert.ok(body.indexOf('evaluatePartnershipRegistrationAuthority') > 0 && body.indexOf('evaluatePartnershipRegistrationAuthority') < body.indexOf('CalendarEvent.create'));
  });
  await check('headless (harness) usa registerTournament — a mesma função do jogador', () => {
    assert.match(src('scripts/lib/v526Actions.mjs'), /A\.registration\.registerTournament\(\{ player: profile/);
  });
  await check('previsões/sugestões passam a parceria (paridade com a inscrição)', () => {
    assert.match(src('src/lib/careerCommunications.js'), /evaluateTournamentRegistration\(\{[^}]*partnership \}\)/);
    assert.match(src('src/lib/weeklyCareerReview.js'), /partnership: context\.partnership \|\| null/);
    assert.match(src('src/pages/CareerHub.jsx'), /partnership: activePartnership/);
    assert.match(src('src/game-core/competitiveStaffReview.js'), /partner,\s*\n\s*partnership,/);
  });
  const s = await runExitScenario('HeadlessJ', { exit: 'lifecycle' });
  await check('ciclo real: pelo caminho do headless/jogador a inscrição pós-saída é recusada com o mesmo código', () => {
    const a = s.attempts.filter((x) => x.kind === 'after-exit');
    assert.ok(a.length && a.every((x) => !x.ok && x.reasons.includes('PARTNERSHIP_EXIT_PENDING')));
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
