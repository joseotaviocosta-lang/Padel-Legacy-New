// Playthrough 5.14 (continuação), Parte E — histórico semanal preservado:
// cada semana tem a SUA reunião, mas nunca 7 na mesma semana.
import assert from 'node:assert/strict';
import { installShims, bootstrap, makeRunner } from './lib/competitiveReviewGates.mjs';

installShims('/test-staff-weekly-review-next-week-v514');
const { check, finish } = makeRunner();
const ctx = await bootstrap('NextWeek');
try {
  const { mod, localGame, profile, profileId } = ctx;
  const { ensureWeeklyCompetitiveStaffReview, competitiveWeekKey } = await mod('/src/game-core/competitiveStaffReview.js');

  const reviews = async () => {
    const all = await localGame.entities.CareerMessage.filter({ profile_id: profileId }).catch(() => []);
    return (all || []).filter((m) => m.message_type === 'staff_competitive_review');
  };

  // Semana A: segunda a domingo.
  const weekA = ['2026-01-19', '2026-01-21', '2026-01-25'];
  for (const day of weekA) await ensureWeeklyCompetitiveStaffReview({ ...profile, career_date: day }, day);
  const afterA = await reviews();

  await check('Parte E: a semana A inteira gera 1 mensagem', () => {
    console.log(`   [registro] semana A (${competitiveWeekKey('2026-01-19')}): ${afterA.length} mensagem(ns)`);
    assert.equal(afterA.length, 1, `${afterA.length} mensagens na semana A`);
  });

  await check('Parte B: segunda e domingo caem na MESMA semana ISO', () => {
    assert.equal(competitiveWeekKey('2026-01-19'), competitiveWeekKey('2026-01-25'),
      'a fronteira ISO está partindo a semana no meio');
  });

  // Semana B.
  const weekB = ['2026-01-26', '2026-01-28', '2026-02-01'];
  for (const day of weekB) await ensureWeeklyCompetitiveStaffReview({ ...profile, career_date: day }, day);
  const afterB = await reviews();

  await check('Parte E/9: a semana B acrescenta exatamente mais uma', () => {
    console.log(`   [registro] total após duas semanas: ${afterB.length}`);
    assert.equal(afterB.length, 2, `${afterB.length} mensagens após duas semanas`);
  });

  await check('Parte E: as duas mensagens têm chaves semanais distintas', () => {
    const keys = new Set(afterB.map((m) => m.metadata?.context_key));
    assert.equal(keys.size, 2, `chaves: ${[...keys].join(' | ')}`);
  });

  await check('Parte E: o histórico da semana anterior é preservado', () => {
    const original = afterB.find((m) => m.id === afterA[0].id);
    assert.ok(original, 'a reunião da semana A desapareceu');
    assert.equal(original.subject, afterA[0].subject, 'a reunião antiga foi reescrita');
  });

  await check('Parte B: a virada de ano não parte a semana', () => {
    // 2026-12-28 (segunda) a 2027-01-03 (domingo) é a MESMA semana ISO.
    assert.equal(competitiveWeekKey('2026-12-28'), competitiveWeekKey('2027-01-03'),
      'a semana da virada gera duas chaves');
  });

  finish('test-staff-weekly-review-next-week-v514');
} finally {
  await ctx.vite.close();
}
