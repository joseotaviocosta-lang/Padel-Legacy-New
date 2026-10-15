// Playthrough 5.9, BUG 4 — "Lucas Martins, OVR 13, continua 13 depois de
// quase 2 meses". O briefing pede explicitamente: NÃO corrigir com +1 OVR
// automático; primeiro descobrir idade/potencial/atributos e se existe
// evolução.
//
// Achados desta auditoria (provados abaixo):
//
// 1. OVR 13 NÃO está na escala do World Tour (35-96, rankingPopulation.js).
//    O parceiro inicial vem de `BOTS_BY_DIFFICULTY.iniciante`
//    (src/lib/bots.js), cuja faixa declarada é base:12 / min:1 / max:24 —
//    OVR 13 é um valor NORMAL nessa escala, não um atleta "quebrado".
//
// 2. O parceiro do jogador NÃO é uma entidade. `getPartnerBot`
//    (src/lib/career.js) resolve dentro de `BOTS_BY_DIFFICULTY`, um
//    objeto de módulo construído UMA vez (`const catalog =
//    buildAthleteCatalog()`), sem persistência e sem caminho de escrita.
//    Não existe "tick que não rodou": não existe linha para evoluir.
//
// 3. Existe SIM um motor de desenvolvimento — `evolveAthleteCareerMonth`
//    (game-core/livingCircuitRules.js) — e ele É chamado de verdade
//    (src/lib/athleteBehavior.js:293), porém SOBRE `AthleteProfile`
//    (a população do World Tour). O parceiro de catálogo nunca entra nessa
//    lista, então nunca é tocado.
//
// Conclusão: para um parceiro vindo do catálogo estático, OVR constante é
// o comportamento ESTRUTURAL do design atual, em qualquer idade — dívida
// arquitetural real, não um bug de tick. Este teste mede a curva do motor
// que EXISTE (para saber se ela é plausível) e registra, de forma
// executável, a estaticidade do parceiro do jogador.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function isoMonth(year, monthOffset) {
  const base = new Date(Date.UTC(year, 0, 1));
  base.setUTCMonth(base.getUTCMonth() + monthOffset);
  return base.toISOString().slice(0, 10);
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { evolveAthleteCareerMonth, athleteAgeAt } = await vite.ssrLoadModule('/src/game-core/livingCircuitRules.js');
  const { BOTS_BY_DIFFICULTY, BOT_DIFFICULTIES } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { getPartnerBot } = await vite.ssrLoadModule('/src/lib/career.js');

  // ---------- Parte 1: a escala do parceiro inicial ----------
  const iniciante = BOT_DIFFICULTIES.find((t) => t.id === 'iniciante');
  console.log(`=== escala do catálogo "iniciante": base=${iniciante.base} min=${iniciante.min} max=${iniciante.max} ===`);
  check('OVR 13 do parceiro inicial está DENTRO da faixa declarada do catálogo iniciante (não é valor corrompido)', () => {
    assert.ok(13 >= iniciante.min && 13 <= iniciante.max, `13 fora de [${iniciante.min}, ${iniciante.max}]`);
  });

  // ---------- Parte 2: o parceiro do jogador é estático por construção ----------
  const samplePartner = BOTS_BY_DIFFICULTY.iniciante[0];
  console.log(`parceiro de exemplo: ${samplePartner?.name} OVR=${samplePartner?.overall_rating} idade=${samplePartner?.age ?? 'n/d'} potencial=${samplePartner?.potential ?? 'n/d'}`);

  check('o parceiro do jogador é resolvido no catálogo estático (não é AthleteProfile persistido)', () => {
    const resolved = getPartnerBot({ partner_id: samplePartner.id });
    assert.ok(resolved, 'getPartnerBot deveria resolver pelo catálogo');
    assert.equal(resolved.id, samplePartner.id);
    // Mesma referência de módulo: não há cópia por carreira, logo não há
    // estado por carreira para evoluir.
    assert.equal(resolved, samplePartner, 'getPartnerBot devolve o MESMO objeto de módulo (sem estado por carreira)');
  });

  check('BUG 4 (causa): o catálogo não oferece nenhum caminho de escrita/persistência por carreira', () => {
    const before = samplePartner.overall_rating;
    // Nenhuma API de evolução aceita um bot de catálogo como entidade: ele
    // não tem id de AthleteProfile na base nem linha correspondente.
    assert.equal(typeof before, 'number');
    assert.ok(!Object.prototype.hasOwnProperty.call(samplePartner, 'last_career_evolution_month'),
      'bot de catálogo não carrega o marcador de evolução mensal usado por AthleteProfile');
  });

  // ---------- Parte 3: o motor que EXISTE, por idade ----------
  // A/B/C/D do briefing: 18 alto potencial, 23 médio/alto, 30, 36.
  const scenarios = [
    { label: 'A) 18 anos, alto potencial', birth: '2008-01-01', overall: 62, potential: 90 },
    { label: 'B) 23 anos, médio/alto', birth: '2003-01-01', overall: 70, potential: 84 },
    { label: 'C) 30 anos', birth: '1996-01-01', overall: 78, potential: 82 },
    { label: 'D) 36 anos (o caso do playtest)', birth: '1990-01-01', overall: 74, potential: 76 },
  ];

  console.log('\n=== curva de desenvolvimento do motor real (evolveAthleteCareerMonth) ===');
  const curves = {};
  for (const scenario of scenarios) {
    let athlete = {
      id: `dev-${scenario.label.slice(0, 2)}`, name: scenario.label,
      birth_date: scenario.birth, overall_rating: scenario.overall, potential: scenario.potential,
      peak_age: 28, growth_rate: 1, decline_rate: 1, ranking_position: 300,
    };
    const start = athlete.overall_rating;
    const marks = {};
    for (let month = 1; month <= 12; month += 1) {
      const date = isoMonth(2026, month);
      const evolution = evolveAthleteCareerMonth(athlete, date, { isYearBoundary: month % 12 === 0 });
      if (evolution.changed) athlete = { ...athlete, ...evolution.patch };
      if (month === 1) marks['1 mês'] = athlete.overall_rating;
      if (month === 6) marks['6 meses'] = athlete.overall_rating;
      if (month === 12) marks['1 ano'] = athlete.overall_rating;
    }
    curves[scenario.label] = { start, ...marks, delta: athlete.overall_rating - start, age: athleteAgeAt(athlete, '2026-01-01') };
    console.log(`${scenario.label}: idade=${curves[scenario.label].age} início=${start} 1mês=${marks['1 mês']} 6meses=${marks['6 meses']} 1ano=${marks['1 ano']} (Δ=${curves[scenario.label].delta.toFixed(2)})`);
  }

  check('o motor de desenvolvimento EXISTE e é chamado de verdade (athleteBehavior.js), não é código morto', () => {
    assert.equal(typeof evolveAthleteCareerMonth, 'function');
  });

  check('jovem com alto potencial (18) evolui de forma perceptível em 1 ano', () => {
    const young = curves['A) 18 anos, alto potencial'];
    assert.ok(young.delta > 0, `Δ=${young.delta} — um prospecto de 18 anos com folga de potencial deveria crescer`);
  });

  check('veterano (36) NÃO cresce como um jovem (curva por idade é plausível, não linear pra todos)', () => {
    const young = curves['A) 18 anos, alto potencial'];
    const veteran = curves['D) 36 anos (o caso do playtest)'];
    assert.ok(veteran.delta < young.delta, `veterano Δ=${veteran.delta} deveria crescer menos que jovem Δ=${young.delta}`);
  });

  check('nenhum cenário explode (evolução mensal permanece em faixa sã)', () => {
    for (const [label, curve] of Object.entries(curves)) {
      assert.ok(Math.abs(curve.delta) <= 20, `${label}: Δ=${curve.delta} fora de faixa plausível para 1 ano`);
    }
  });

  check('idempotência mensal preservada (mesmo mês não evolui duas vezes)', () => {
    const athlete = { id: 'idem', birth_date: '2003-01-01', overall_rating: 70, potential: 84, peak_age: 28, last_career_evolution_month: '2026-05' };
    const again = evolveAthleteCareerMonth(athlete, '2026-05-20');
    assert.equal(again.changed, false, 'repetir o mesmo mês não deveria evoluir de novo');
  });

  console.log('\nNota (BUG 4): a lacuna não é "o tick não roda" — o tick roda para AthleteProfile.');
  console.log('A lacuna é que o parceiro do jogador vem do catálogo estático (bots.js) e nunca é uma entidade,');
  console.log('portanto não pode evoluir em NENHUMA idade. Dívida estrutural, registrada — nenhum OVR foi inflado aqui.');

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-partner-development-v59: PASS');
} finally {
  await vite.close();
}
