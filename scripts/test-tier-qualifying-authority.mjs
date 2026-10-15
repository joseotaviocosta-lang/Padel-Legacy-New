// Playthrough 5.3, TESTE 1/Parte A/W — valida que EntryManager (fonte
// única), tournamentRegistration.js (inscrição), a escolha de campo da
// IA (TournamentSelectionAI.js/WorldTourLifecycle.js) e os helpers de UI
// (Tournaments.jsx, weeklyCareerReview.js) concordam. Todos chamam
// evaluateTournamentEntry — nunca reimplementam a regra. Este teste
// confirma isso por inspeção de import e por comportamento direto (as
// chamadas do jogador nunca usam aiFieldContext, então têm que bater
// exatamente com a chamada "crua" sem a flag).
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

// Parte A — auditoria de consumidores (estática, por leitura de arquivo —
// confirma que ninguém reimplementou a regra em paralelo).
const CONSUMERS = [
  'src/lib/tournamentRegistration.js',
  'src/lib/calendarSystem.js',
  'src/pages/Tournaments.jsx',
  'src/gameplay/worldTour/TournamentSelectionAI.js',
];
for (const path of CONSUMERS) {
  await check(`${path} importa evaluateTournamentEntry de EntryManager.js (nunca reimplementa elegibilidade)`, () => {
    const content = readFileSync(path, 'utf-8');
    assert.ok(/import\s*\{[^}]*evaluateTournamentEntry[^}]*\}\s*from\s*['"].*EntryManager\.js['"]/.test(content), `${path} não importa evaluateTournamentEntry de EntryManager.js`);
  });
}
await check('weeklyCareerReview.js (recomendação do treinador) usa evaluateTournamentRegistration/evaluateTournamentChoice — nunca uma checagem de elegibilidade própria', () => {
  const content = readFileSync('src/lib/weeklyCareerReview.js', 'utf-8');
  assert.ok(/evaluateTournamentChoice/.test(content) && /evaluateTournamentRegistration/.test(content));
});

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { evaluateTournamentEntry, buildAthleteEntryContext } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const { evaluateTournamentRegistration } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');

  // Cenário real: um profile+torneio, checado pelos dois caminhos que o
  // jogo usa de verdade (registro direto via EntryManager, e a validação
  // completa de inscrição via tournamentRegistration.js) — os dois
  // precisam concordar sobre elegibilidade esportiva. Assinatura real de
  // evaluateTournamentRegistration é um objeto nomeado {player, partner,
  // tournament, currentDate, teamRank, ...} — janela de inscrição aberta
  // e parceiro presente pra isolar SÓ a checagem esportiva (SPORTING_INELIGIBLE),
  // não outros motivos de rejeição (data/parceiro/etc.).
  const tournament = { id: 't-authority', tier: 'Gold', entry_fee: 0, start_date: '2026-06-10', registration_deadline: '2026-06-05' };
  const partner = { id: 'partner-1', status: 'ativo' };
  const profileEligible = { id: 'p1', sport_name: 'Teste', coins: 1000, world_ranking: 300, career_date: '2026-05-15', partner_id: partner.id };
  const profileIneligible = { id: 'p2', sport_name: 'Teste2', coins: 1000, world_ranking: 950, career_date: '2026-05-15', partner_id: partner.id };

  for (const [label, profile] of [['elegível (rank 300)', profileEligible], ['inelegível (rank 950)', profileIneligible]]) {
    await check(`${label}: EntryManager e tournamentRegistration.js concordam sobre elegibilidade esportiva`, async () => {
      const direct = evaluateTournamentEntry(tournament, buildAthleteEntryContext(profile, profile.world_ranking, tournament));
      const registrationCheck = evaluateTournamentRegistration({ player: profile, partner, tournament, currentDate: profile.career_date, teamRank: profile.world_ranking });
      const registrationSportingRejected = (registrationCheck.reasons || []).some((r) => r.code === 'SPORTING_INELIGIBLE');
      assert.equal(!direct.eligible, registrationSportingRejected, `EntryManager.eligible=${direct.eligible} mas tournamentRegistration ${registrationSportingRejected ? 'rejeitou' : 'não rejeitou'} por motivo esportivo (motivos: ${JSON.stringify(registrationCheck.reasons)})`);
    });
  }

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-tier-qualifying-authority: PASS');
} finally {
  await vite.close();
}
