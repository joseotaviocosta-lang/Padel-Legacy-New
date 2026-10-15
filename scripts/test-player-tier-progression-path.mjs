// Playthrough 5.3, TESTE 9/Parte I/S — progressão típica do jogador:
// 1000+ → 700 → 500 → 350 → 200 → Top100. Confirma que a escada de
// acesso é gradual (Bronze/Silver → Gold → Platinum → Masters), nunca um
// salto direto de Bronze pra Gold pulando Silver, e nunca uma regressão
// de acesso conforme o rank melhora.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { evaluateTournamentEntry } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');

  const PROGRESSION = [
    { label: '1000+ (novato)', rank: 1000 },
    { label: '700', rank: 700 },
    { label: '500', rank: 500 },
    { label: '350', rank: 350 },
    { label: '200', rank: 200 },
    { label: 'Top100', rank: 80 },
  ];
  const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters'];

  console.log('=== progressão de acesso por tier ===');
  const accessTimeline = PROGRESSION.map(({ label, rank }) => {
    const access = Object.fromEntries(TIERS.map((tier) => [tier, evaluateTournamentEntry({ tier }, { rank, teamRank: rank }).eligible]));
    console.log(`${label.padEnd(16)}` + TIERS.map((t) => `${t}=${access[t] ? 'sim' : 'não'}`).join(' '));
    return { label, rank, access };
  });

  check('rank 1000+ tem acesso a Bronze/Silver (base) mas não a Gold/Platinum/Masters', () => {
    const step = accessTimeline[0];
    assert.ok(step.access.Bronze && step.access.Silver);
    assert.ok(!step.access.Gold && !step.access.Platinum && !step.access.Masters);
  });

  check('a progressão nunca pula Silver — todo passo com acesso a Gold já teve acesso a Silver num passo anterior ou no mesmo', () => {
    let everHadSilver = false;
    for (const step of accessTimeline) {
      if (step.access.Silver) everHadSilver = true;
      if (step.access.Gold) assert.ok(everHadSilver, `${step.label} tem acesso a Gold sem nunca ter tido acesso a Silver antes`);
    }
  });

  check('acesso a cada tier PAGO (Gold/Platinum/Masters) só aparece e nunca desaparece conforme o rank melhora (progressão monotônica)', () => {
    // Bronze/Silver ficam de fora de propósito: acesso ali é uma JANELA,
    // não só um piso — EntryManager.js barra quem já ficou bom demais
    // ("overqualified", rank<=OPEN_TIER_CEILING=150, Fase 5.1) pra
    // empurrá-lo pros tiers acima, não uma regressão real de progressão.
    for (const tier of ['Gold', 'Platinum', 'Masters']) {
      let unlocked = false;
      for (const step of accessTimeline) {
        if (step.access[tier]) unlocked = true;
        else if (unlocked) throw new Error(`${tier}: acesso apareceu e depois desapareceu em "${step.label}" — regressão de progressão`);
      }
    }
  });

  check('Bronze/Silver seguem a janela esperada — perdidos só quando o rank fica bom demais (overqualified, rank<=150), nunca antes disso', () => {
    for (const step of accessTimeline) {
      if (step.rank > 150) assert.ok(step.access.Bronze && step.access.Silver, `${step.label} (rank ${step.rank}, ainda abaixo do teto de acesso livre) deveria continuar com acesso a Bronze/Silver`);
      else assert.ok(!step.access.Bronze && !step.access.Silver, `${step.label} (rank ${step.rank}, já overqualified) não deveria mais ter acesso a Bronze/Silver`);
    }
  });

  check('Top100 tem acesso a Gold/Platinum/Masters (o topo da progressão testada chega à elite competitiva)', () => {
    const top = accessTimeline[accessTimeline.length - 1];
    assert.ok(top.access.Gold && top.access.Platinum && top.access.Masters);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-player-tier-progression-path: PASS');
} finally {
  await vite.close();
}
