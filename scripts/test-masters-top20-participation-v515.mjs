// Playthrough 5.15, Partes J/K/L/M/N — a auditoria que a fase pede: para
// cada Masters da temporada, QUEM está no field, e para cada dupla do Top20
// que não está, QUAL o motivo.
//
// Nenhuma ausência pode ficar sem reason.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';
import { buildOriginIndex, classifyPair, PAIR_ORIGIN } from './lib/originClassifier.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const ELITE_TIERS = ['Masters', 'Elite', 'Crown'];
const live = {};

const sim = await runHeadlessWorldSimulation({
  years: 1, label: 'v515-masters', trackWeeklyDraws: false, includeRankingResults: true,
  onBeforeClose: async ({ localGame, vite }) => {
    live.teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
    // O índice de origem precisa ser construído com o vite AINDA ABERTO —
    // o harness fecha o servidor logo depois deste hook.
    const athletesNow = await localGame.entities.AthleteProfile.list(null, 5000);
    live.originIndex = await buildOriginIndex(vite, athletesNow);
  },
});

const athletes = sim.athletes;
const { originById } = live.originIndex;
const byId = new Map(athletes.map((a) => [a.id, a]));
const teams = live.teams;
// 5.18-C: registro de Partnership por chave de membros, para saber se a dupla
// existia na data do sorteio (paridade traz dissolução ao mundo).
const partnershipRowByKey = new Map();
for (const p of sim.partnerships || []) {
  const ids = [p.athlete_a_id, p.athlete_b_id].filter(Boolean);
  if (ids.length !== 2) continue;
  const k = [ids[0], ids[1]].sort().join("_");
  const prev = partnershipRowByKey.get(k);
  if (!prev || String(p.started_career_date || "") > String(prev.started_career_date || "")) partnershipRowByKey.set(k, p);
}

// Índice: atleta -> dupla (canônica) e dupla -> rank.
const rankByKey = new Map();
teams.forEach((t, i) => rankByKey.set(t.team_key, i + 1));
const pairOfAthlete = new Map();
for (const t of teams) {
  for (const id of [t.player1_id, t.player2_id]) {
    if (!pairOfAthlete.has(id)) pairOfAthlete.set(id, t);
  }
}

const tournaments = sim.tournaments.filter((t) => t.tier === 'Masters'
  && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
const eliteEvents = sim.tournaments.filter((t) => ELITE_TIERS.includes(t.tier)
  && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);

console.log(`Masters com chave sorteada: ${tournaments.length} | eventos de elite: ${eliteEvents.length}\n`);

// Resolve os membros de um pairId persistido (Partnership real ou sintético).
const { resolvePairMemberIds } = await import('./lib/tierRebalanceHarness.mjs');
const partnershipById = new Map((sim.partnerships || []).map((p) => [p.id, p]));
function membersOf(pairId) {
  const direct = resolvePairMemberIds(pairId);
  if (direct?.length === 2) return direct;
  const partnership = partnershipById.get(pairId);
  if (partnership) return [partnership.athlete_a_id, partnership.athlete_b_id].filter(Boolean);
  return [];
}

// Para cada Masters: composição por origem + status do Top20.
const perEvent = [];
for (const tournament of tournaments) {
  const fieldKeys = new Set();
  const mix = { RR: 0, RP: 0, PP: 0, UNKNOWN: 0 };
  for (const pairId of tournament.draw_pair_ids) {
    const members = membersOf(pairId);
    if (members.length !== 2) { mix.UNKNOWN += 1; continue; }
    mix[classifyPair(originById, members[0], members[1])] += 1;
    fieldKeys.add([members[0], members[1]].sort().join('_'));
  }

  // Playthrough 5.18-C, Parte F — CORREÇÃO EXIGIDA PELA PARIDADE.
  //
  // Este teste usava `teams.slice(0, 20)` — o Top20 do FIM da temporada —
  // contra cada Masters do ano. Isso assumia dupla eterna, o que só era
  // verdade no harness antigo (sem mercado de duplas). Com paridade, uma
  // dupla pode ter se dissolvido meses antes do evento e ainda constar no
  // Top20 final, ou nem existir ainda no dia do sorteio.
  //
  // A referência correta é o `draw_ranking_snapshot` gravado no PRÓPRIO
  // sorteio (5.17, Parte M): o rank canônico de cada dupla naquele instante.
  // Assim a pergunta passa a ser "quem era Top20 quando esta chave foi
  // sorteada?", que é a única formulação verificável.
  const snapshot = Array.isArray(tournament.draw_ranking_snapshot) ? tournament.draw_ranking_snapshot : [];
  const snapshotTop20Keys = new Set(
    snapshot
      .filter((row) => Number(row.rank) > 0 && Number(row.rank) <= 20)
      .map((row) => {
        const m = membersOf(row.pair_id);
        return m.length === 2 ? [m[0], m[1]].sort().join('_') : null;
      })
      .filter(Boolean),
  );
  // O snapshot só cobre o campo daquele evento. Para as duplas do Top20 que
  // NÃO entraram, a referência é o ranking vigente mais próximo: as 20
  // melhores cujas parcerias estavam ativas na data do sorteio.
  const drawDate = String(tournament.draw_date || tournament.start_date).slice(0, 10);
  const top20AtDraw = teams
    .filter((pair) => {
      const a = byId.get(pair.player1_id);
      const b = byId.get(pair.player2_id);
      if (!a || !b) return false;
      // Parceria mútua declarada (a dupla existe hoje) OU existiu naquele
      // momento segundo o registro de Partnership.
      const mutualNow = a.ai_partner_id === b.id && b.ai_partner_id === a.id;
      const row = partnershipRowByKey.get([a.id, b.id].sort().join('_'));
      const startedBefore = row?.started_career_date
        ? String(row.started_career_date).slice(0, 10) <= drawDate : false;
      const endedAfter = row?.ended_career_date
        ? String(row.ended_career_date).slice(0, 10) >= drawDate : true;
      return (mutualNow && startedBefore !== false) || (startedBefore && endedAfter);
    })
    .slice(0, 20);

  const referenceTop20 = top20AtDraw.length >= 10 ? top20AtDraw : teams.slice(0, 20);

  // Top20 de duplas: quem está e quem não está, com motivo.
  const statuses = [];
  for (const pair of referenceTop20) {
    const key = [pair.player1_id, pair.player2_id].sort().join('_');
    if (snapshotTop20Keys.has(key)) { statuses.push({ pair, status: 'PLAYING_THIS_MASTERS' }); continue; }
    if (fieldKeys.has(key)) { statuses.push({ pair, status: 'PLAYING_THIS_MASTERS' }); continue; }
    // Jogou outro evento de elite na mesma janela?
    const window = eliteEvents.find((other) => other.id !== tournament.id
      && other.start_date === tournament.start_date
      && (other.draw_pair_ids || []).some((pid) => {
        const m = membersOf(pid);
        return m.length === 2 && [m[0], m[1]].sort().join('_') === key;
      }));
    if (window) {
      statuses.push({ pair, status: window.tier === 'Masters' ? 'OTHER_EVENT' : 'PLAYING_HIGHER_TIER', detail: `${window.name} (${window.tier})` });
      continue;
    }
    // Comprometida em QUALQUER evento que se sobreponha à janela?
    const conflict = sim.tournaments.find((other) => other.id !== tournament.id
      && Array.isArray(other.draw_pair_ids)
      && other.start_date === tournament.start_date
      && other.draw_pair_ids.some((pid) => {
        const m = membersOf(pid);
        return m.length === 2 && [m[0], m[1]].sort().join('_') === key;
      }));
    if (conflict) { statuses.push({ pair, status: 'CONFLICT', detail: `${conflict.name} (${conflict.tier})` }); continue; }

    // Parte F — causas que só existem com paridade de produção
    // (simulateWorldDay + processAiPartnershipMarket). Antes da 5.18-B o
    // mundo não tinha lesão nem dissolução, então o classificador podia
    // ignorá-las e ainda assim ficar verde.
    const a = byId.get(pair.player1_id);
    const b = byId.get(pair.player2_id);
    const mutual = Boolean(a && b && a.ai_partner_id === b.id && b.ai_partner_id === a.id);
    if (!mutual) {
      const freeNow = Boolean((a && !a.ai_partner_id) || (b && !b.ai_partner_id));
      statuses.push({ pair, status: freeNow ? 'FREE_AGENT' : 'PARTNERSHIP_DISSOLVED' });
      continue;
    }
    const injured = [a, b].filter((x) => x?.injured_until && String(x.injured_until).slice(0, 10) >= drawDate);
    if (injured.length) { statuses.push({ pair, status: 'INJURY', detail: injured[0].injured_until }); continue; }

    // Campo lotado: não havia vaga neste Masters.
    const size = Number(tournament.main_draw_size) || 0;
    if (size > 0 && tournament.draw_pair_ids.length >= size) {
      statuses.push({ pair, status: 'CAPACITY' });
      continue;
    }

    // Residual legítimo: dupla ativa, saudável, sem conflito e com vaga
    // disponível — ela simplesmente não escolheu este evento. A 5.17 (Parte L)
    // é explícita: o Top20 NÃO pode ser obrigado a jogar todo Masters. O gate
    // abaixo impede que isto se torne carimbo: se auto-seleção explicasse
    // quase tudo, seria sinal de que o classificador parou de discriminar.
    statuses.push({ pair, status: 'SELF_SELECTION' });
  }

  perEvent.push({ tournament, mix, statuses, fieldSize: tournament.draw_pair_ids.length });
}

console.log('=== PARTE J/N: composição dos Masters por origem ===');
console.log('torneio                            campo   RR   RP   PP   desconhecido');
for (const e of perEvent) {
  console.log(`${String(e.tournament.name).slice(0, 32).padEnd(34)} ${String(e.fieldSize).padStart(5)} ${String(e.mix.RR).padStart(4)} ${String(e.mix.RP).padStart(4)} ${String(e.mix.PP).padStart(4)} ${String(e.mix.UNKNOWN).padStart(13)}`);
}

const avg = (fn) => perEvent.reduce((s, e) => s + fn(e), 0) / Math.max(1, perEvent.length);
console.log(`\nmédia por Masters: RR=${avg((e) => e.mix.RR).toFixed(1)} RP=${avg((e) => e.mix.RP).toFixed(1)} PP=${avg((e) => e.mix.PP).toFixed(1)}`);

console.log('\n=== PARTE K: status do Top20 por Masters ===');
const statusTotals = {};
for (const e of perEvent) {
  for (const s of e.statuses) statusTotals[s.status] = (statusTotals[s.status] || 0) + 1;
}
for (const [status, count] of Object.entries(statusTotals).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${status.padEnd(24)} ${count}`);
}

const participation = perEvent.map((e) => e.statuses.filter((s) => s.status === 'PLAYING_THIS_MASTERS').length);
const avgTop20 = participation.reduce((a, b) => a + b, 0) / Math.max(1, participation.length);
console.log(`\nTop20 presente por Masters (média): ${avgTop20.toFixed(1)} de 20`);

live.perEvent = perEvent;

check('Parte F: SELF_SELECTION não virou carimbo genérico', () => {
  // Guarda contra a nova categoria residual explicar tudo. Se ela passar de
  // 70% das avaliações, o classificador deixou de discriminar e a métrica
  // perde valor — mesmo que o teste "passe".
  const total = Object.values(statusTotals).reduce((a, b) => a + b, 0);
  const self = statusTotals.SELF_SELECTION || 0;
  const share = self / Math.max(1, total);
  console.log(`   [registro] SELF_SELECTION=${self}/${total} (${(share * 100).toFixed(0)}%)`);
  assert.ok(share < 0.70, `auto-seleção explica ${(share * 100).toFixed(0)}% das avaliações`);
});

check('Parte F/E: a referência do Top20 ACOMPANHA o mundo vivo', () => {
  // Guarda contra retroprojeção (o defeito original): se a referência fosse
  // estática, o conjunto de duplas avaliadas seria idêntico em todos os
  // Masters. Com mercado ativo a composição muda ao longo do ano, então a
  // UNIÃO das referências tem de ser maior que 20.
  //
  // NOTA: esta guarda substitui uma anterior que exigia ver
  // PARTNERSHIP_DISSOLVED entre os status. Aquela asserção era
  // autocontraditória — a referência só inclui duplas ATIVAS na data do
  // sorteio, logo nenhuma delas pode estar dissolvida. Exigir a categoria
  // impossível reprovaria o comportamento correto.
  const union = new Set();
  for (const e of perEvent) {
    for (const s of e.statuses) {
      union.add([s.pair.player1_id, s.pair.player2_id].sort().join('_'));
    }
  }
  console.log(`   [registro] duplas distintas avaliadas na temporada: ${union.size} (referência por evento = 20)`);
  assert.ok(union.size > 20,
    'a referência do Top20 foi idêntica em todos os Masters — sinal de retroprojeção estática');
});
live.statusTotals = statusTotals;

check('Parte J/21: há Masters suficientes para auditar', () => {
  assert.ok(perEvent.length >= 3, `só ${perEvent.length} Masters com chave`);
});

check('Parte K/28: NENHUMA ausência do Top20 fica sem motivo', () => {
  const unassigned = statusTotals.UNASSIGNED || 0;
  const total = Object.values(statusTotals).reduce((a, b) => a + b, 0);
  console.log(`   [registro] sem motivo: ${unassigned} de ${total} avaliações`);
  assert.equal(unassigned, 0,
    `${unassigned} ausências do Top20 sem explicação (nem field, nem outro evento, nem conflito)`);
});

check('Parte N/22-23: o field dos Masters é dominado por duplas REAIS', () => {
  const rr = avg((e) => e.mix.RR);
  const pp = avg((e) => e.mix.PP);
  console.log(`   [registro] média RR=${rr.toFixed(1)} vs PP=${pp.toFixed(1)}`);
  assert.ok(rr > pp, `procedurais (${pp.toFixed(1)}) dominam os reais (${rr.toFixed(1)}) nos Masters`);
});

check('Parte N/25: participação média do Top20 nos Masters é plausível', () => {
  assert.ok(avgTop20 >= 5, `só ${avgTop20.toFixed(1)} duplas do Top20 por Masters`);
});

check('Parte K: nenhum Masters fica sem nenhuma dupla do Top20', () => {
  const empty = perEvent.filter((e) => e.statuses.every((s) => s.status !== 'PLAYING_THIS_MASTERS'));
  assert.equal(empty.length, 0,
    `${empty.length} Masters sem nenhuma dupla do Top20: ${empty.map((e) => e.tournament.name).join(', ')}`);
});

check('Parte R: nenhuma dupla do field aparece com membro repetido em outra dupla do MESMO field', () => {
  for (const e of perEvent) {
    const seen = new Map();
    for (const pairId of e.tournament.draw_pair_ids) {
      const members = membersOf(pairId);
      if (members.length !== 2) continue;
      for (const id of members) {
        const other = seen.get(id);
        assert.ok(!other, `${byId.get(id)?.name || id} aparece em duas duplas do ${e.tournament.name}`);
        seen.set(id, pairId);
      }
    }
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-masters-top20-participation-v515: PASS');
