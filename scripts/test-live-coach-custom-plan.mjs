// Editor pré-jogo de plano por fundamento (docs/LIVE-COACH-DYNAMIC-ADAPTATION.md,
// "Próxima fase"). Este teste cobre a camada de motor que o editor usa:
// - getMatchTactic mescla um plano personalizado (shotWeights) sobre uma
//   tática base sem nunca alterar os presets congelados de MATCH_TACTICS;
// - o peso por golpe realmente muda a frequência do golpe escolhido pelo
//   DecisionEngine ao longo de uma partida real (createMatch/playPoint, sem
//   mocks), não só no papel;
// - saves antigos migram para o novo schema (custom_tactic_plan) sem quebrar
//   a migração já existente (CareerMigrationTest).
import { createServer } from 'vite';

function fakePlayer(id, name, extra = {}) {
  return {
    id, name, sport_name: name,
    attributes: { smash: 60, volley: 60, serve: 60, lob: 60, defense: 60, speed: 60, control: 60, tactics: 60 },
    energy: 90, fatigue: 10, partner_chemistry: 60, partner_trust: 60, partner_morale: 60,
    matches_played: 0, ...extra,
  };
}

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { createMatch, playPoint } = await server.ssrLoadModule('/src/engine/match/MatchEngine.js');
  const { MATCH_TACTICS, getMatchTactic } = await server.ssrLoadModule('/src/engine/match/MatchTactics.js');
  const { runCareerMigrationTest } = await server.ssrLoadModule('/src/careers/CareerMigrationTest.js');

  // (b) getMatchTactic mescla sem mutar os presets congelados.
  const before = JSON.stringify(MATCH_TACTICS);
  const merged = getMatchTactic({ id: 'personalizado', baseTacticId: 'equilibrado', shotWeights: { smash: 0.6 } });
  const after = JSON.stringify(MATCH_TACTICS);
  gate('MATCH_TACTICS permanece congelado (mesmo JSON antes/depois da mesclagem)', before === after);
  gate('cada preset continua Object.isFrozen', MATCH_TACTICS.every((tactic) => Object.isFrozen(tactic)));
  gate('o plano mesclado é um objeto novo, não o preset original', merged !== MATCH_TACTICS.find((t) => t.id === 'equilibrado'));
  gate('o plano mesclado herda os pesos de grupo do preset base e aplica o shotWeights', merged.attackWeight === 1 && merged.shotWeights.smash === 0.6);
  merged.attackWeight = 999;
  gate('mutar o plano mesclado não afeta o preset base (equilibrado)', getMatchTactic('equilibrado').attackWeight === 1);

  // (a) o peso por golpe muda a frequência real do golpe ao longo de uma
  // partida jogada de verdade — mede a proporção de smashes da equipe A.
  function playSmashHeavyMatch(seed, initialTacticId) {
    const teamA = [fakePlayer('me', 'Jogador'), fakePlayer('partner', 'Parceiro')];
    const teamB = [fakePlayer('bot1', 'Rival1'), fakePlayer('bot2', 'Rival2')];
    let state = createMatch(teamA, teamB, { initialTacticId, seed });
    let safety = 4000;
    let teamAShots = 0;
    let teamASmashes = 0;
    while (!state.finished && safety-- > 0) {
      state = playPoint(state);
      const lastPoint = state.pointEvents.at(-1);
      for (const entry of lastPoint?.shots || []) {
        if (entry.team !== 'A') continue;
        teamAShots += 1;
        if (entry.shot === 'smash') teamASmashes += 1;
      }
    }
    return { teamAShots, teamASmashes };
  }

  const MATCHES = 25;
  let neutralShots = 0, neutralSmashes = 0, suppressedShots = 0, suppressedSmashes = 0;
  for (let m = 0; m < MATCHES; m += 1) {
    const neutral = playSmashHeavyMatch(`custom-plan-neutral-${m}`, 'equilibrado');
    neutralShots += neutral.teamAShots; neutralSmashes += neutral.teamASmashes;
    const suppressed = playSmashHeavyMatch(`custom-plan-suppressed-${m}`, { id: 'personalizado', baseTacticId: 'equilibrado', shotWeights: { smash: 0.4 } });
    suppressedShots += suppressed.teamAShots; suppressedSmashes += suppressed.teamASmashes;
  }
  const neutralRate = neutralSmashes / neutralShots;
  const suppressedRate = suppressedSmashes / suppressedShots;
  console.log(`\ntaxa de smash (equipe A) — neutro: ${(neutralRate * 100).toFixed(2)}% (${neutralSmashes}/${neutralShots}); shotWeights.smash=0.4: ${(suppressedRate * 100).toFixed(2)}% (${suppressedSmashes}/${suppressedShots})`);
  gate('o smash tem amostra real nos dois cenários', neutralSmashes > 20 && suppressedShots > 0);
  gate('shotWeights.smash=0.4 reduz mensuravelmente a frequência real de smashes da equipe A', suppressedRate < neutralRate * 0.85);

  // (c) migração de save antigo continua íntegra com o novo campo aditivo.
  const migration = await runCareerMigrationTest();
  gate('a migração de carreira (v1 -> schema atual) continua íntegra com custom_tactic_plan adicionado', migration.success === true);
} finally {
  await server.close();
}

console.log(`\ntest:live-coach-custom-plan OK — ${gates} gates (mesclagem imutável do plano, efeito real do peso por golpe, migração íntegra).`);
