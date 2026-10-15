// Playthrough 5.16, Partes F/G/H/I — TESTE DE SILÊNCIO.
//
// Playtest: depois de inscrito em Londres, "Compromisso confirmado — Londres
// Challenge" reaparecia em cada nova semana, sem nada ter mudado. A 5.14 já
// havia matado a repetição DIÁRIA (assinatura de decisão dentro da mesma
// semana), mas a identidade da mensagem é `staff-competitive-review:<semana>`
// — quando a semana virava, a chave mudava e nascia uma mensagem NOVA com
// assinatura idêntica.
//
// Regra da Parte G: depois de inscrito, virar segunda-feira não é fato
// competitivo. Só mudança substantiva volta a falar.
import assert from 'node:assert/strict';
import { bootstrap, installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/staff');
const ctx = await bootstrap('SilencioV516', { rank: 300, careerDate: '2026-01-19' });
const { vite, mod, localGame, profileId, partner } = ctx;
let { profile } = ctx;

const { ensureWeeklyCompetitiveStaffReview, competitiveWeekKey } = await mod('/src/game-core/competitiveStaffReview.js');
const { registerTournament } = await mod('/src/lib/tournamentRegistration.js');

const reviews = async () => {
  const all = await localGame.entities.CareerMessage.filter({ profile_id: profileId }).catch(() => []);
  return (all || []).filter((m) => m.message_type === 'staff_competitive_review');
};

const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// --- 1. A comissão recomenda, o jogador se inscreve. ------------------------
const first = await ensureWeeklyCompetitiveStaffReview(profile, '2026-01-19');
const recommendedId = first.message?.metadata?.recommended_tournament_id;
assert.ok(recommendedId, 'pré-condição: a comissão não recomendou nada');
const tournament = await localGame.entities.Tournament.get(recommendedId);
const registered = await registerTournament({ player: profile, partner, tournament, teamRank: ctx.rank });
assert.ok(registered?.success, `pré-condição: inscrição falhou ${JSON.stringify(registered?.reasons)}`);
profile = await localGame.entities.PlayerProfile.get(profileId);

// A reunião que ANUNCIA o compromisso (transição RECOMENDADO -> INSCRITO).
await ensureWeeklyCompetitiveStaffReview(profile, '2026-01-20');
const afterCommitment = await reviews();
const baselineCount = afterCommitment.length;
const committedMsg = afterCommitment.find((m) => m.metadata?.decision_state === 'committed');

await check('Parte J: a INSCRIÇÃO é uma transição substantiva e gera aviso', () => {
  assert.ok(committedMsg, 'nenhuma mensagem de compromisso foi criada');
  assert.match(committedMsg.subject, /Compromisso confirmado/);
});

// --- 2. Sete dias passam, atravessando a virada de semana ISO. --------------
const weeksSeen = new Set();
for (let i = 1; i <= 7; i += 1) {
  const date = addDays('2026-01-20', i);
  weeksSeen.add(competitiveWeekKey(date));
  await ensureWeeklyCompetitiveStaffReview(
    { ...profile, career_date: date }, date,
  );
}

const afterWeek = await reviews();

await check('pré-condição: os 7 dias REALMENTE atravessaram mais de uma semana ISO', () => {
  console.log(`   [registro] semanas percorridas: ${[...weeksSeen].join(', ')}`);
  assert.ok(weeksSeen.size >= 2, 'o cenário não cruzou virada de semana — não testaria nada');
});

await check('Parte I: 7 dias sem mudança de estado = 0 notificações novas', () => {
  const novas = afterWeek.length - baselineCount;
  console.log(`   [registro] reuniões antes=${baselineCount} depois=${afterWeek.length} (novas=${novas})`);
  assert.equal(novas, 0, `${novas} reuniões novas sem nenhuma mudança de estado`);
});

await check('Parte G: a mensagem do compromisso não foi ressinalizada como nova', () => {
  const current = afterWeek.find((m) => m.id === committedMsg.id);
  assert.ok(current, 'a mensagem original desapareceu');
  assert.equal(current.career_date, committedMsg.career_date, 'a data foi reescrita');
});

await check('Parte F: nenhuma DUPLICATA de "Compromisso confirmado" foi criada', () => {
  const committed = afterWeek.filter((m) => m.metadata?.decision_state === 'committed');
  const subjects = committed.map((m) => m.subject);
  console.log(`   [registro] mensagens de compromisso: ${subjects.length}`);
  assert.equal(new Set(subjects).size, subjects.length, `assunto repetido: ${subjects.join(' | ')}`);
  assert.equal(committed.length, 1, `${committed.length} mensagens para o mesmo compromisso`);
});

// --- 3. Mudança substantiva: o sorteio acontece. ----------------------------
await localGame.entities.Tournament.update(tournament.id, {
  bracket_schema_version: 2,
  bracket_history: [{ round: 'Oitavas', matches: [{ team_a: 'A/B', team_b: 'C/D' }] }],
  draw_date: addDays('2026-01-20', 7),
  status: 'chaveamento',
});

const drawDate = addDays('2026-01-20', 8);
await ensureWeeklyCompetitiveStaffReview({ ...profile, career_date: drawDate }, drawDate);
const afterDraw = await reviews();

await check('Parte J: o SORTEIO é substantivo e volta a falar', () => {
  const novas = afterDraw.length - afterWeek.length;
  const drawn = afterDraw.filter((m) => m.metadata?.decision_signature?.includes('|drawn'));
  console.log(`   [registro] novas após o sorteio=${novas} | com assinatura 'drawn'=${drawn.length}`);
  assert.ok(novas > 0 || drawn.length > 0,
    'o sorteio não produziu nenhum sinal — a transição substantiva ficou muda');
});

await vite.close();
finish('test-staff-commitment-no-weekly-renotify-v516');
