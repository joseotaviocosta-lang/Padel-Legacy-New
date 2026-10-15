// Playthrough 5.14 (continuação), Partes H/I/L — o relatório da comissão
// precisa mostrar o CTA e permitir agir dali, pelo fluxo canônico.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installShims, bootstrap, makeRunner } from './lib/competitiveReviewGates.mjs';

installShims('/test-staff-report-registration-cta-v514');
const { check, finish } = makeRunner();
const ctx = await bootstrap('ReportCta');
try {
  const { mod, localGame, profile, profileId, partner, rank, careerDate } = ctx;
  const { ensureWeeklyCompetitiveStaffReview } = await mod('/src/game-core/competitiveStaffReview.js');
  const { registerTournament } = await mod('/src/lib/tournamentRegistration.js');

  const review = await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
  const message = review.message;

  const highlightSource = readFileSync(new URL('../src/components/staff/StaffReportHighlight.jsx', import.meta.url), 'utf8');
  const pageSource = readFileSync(new URL('../src/pages/Staff.jsx', import.meta.url), 'utf8');

  await check('Parte H/12: o relatório traz os dados de CTA', () => {
    assert.ok(message.metadata.cta_id, 'sem cta_id');
    assert.ok(message.metadata.cta_label, 'sem cta_label');
    assert.equal(message.metadata.cta_id, 'register');
    console.log(`   [registro] CTA no relatório: ${message.metadata.cta_label}`);
  });

  await check('Parte H: StaffReportHighlight RENDERIZA o botão', () => {
    assert.match(highlightSource, /<Button/, 'o componente não tem botão');
    assert.match(highlightSource, /ctaLabel/, 'o botão não usa o rótulo do relatório');
    assert.ok(/onAction\?\./.test(highlightSource), 'o botão não delega a ação');
  });

  await check('Parte H: o relatório também lista as alternativas', () => {
    assert.match(highlightSource, /Alternativas/, 'alternativas não são exibidas');
  });

  await check('Parte I/14: a página usa o modal canônico de inscrição', () => {
    assert.match(pageSource, /TournamentRegistrationModal/, 'não usa o modal canônico');
    assert.match(pageSource, /onRegistered=/, 'não trata a confirmação');
  });

  await check('Parte I: nem o componente nem a página criam inscrição direta', () => {
    for (const [name, source] of [['StaffReportHighlight', highlightSource], ['Staff.jsx', pageSource]]) {
      assert.ok(!/TournamentRegistration\.create/.test(source), `${name} cria inscrição por conta própria`);
      assert.ok(!/registerTournament\(/.test(source), `${name} chama registerTournament diretamente`);
    }
  });

  await check('Parte K/17: "Ver chave" usa o deep link com releitura fresca (5.13)', () => {
    assert.match(pageSource, /openBracket=true/, 'sem deep link de chave');
  });

  await check('Parte L/13: a inscrição pelo fluxo canônico funciona de fato', async () => {
    const tournament = await localGame.entities.Tournament.get(message.metadata.recommended_tournament_id);
    const registered = await registerTournament({ player: profile, partner, tournament, teamRank: rank });
    assert.ok(registered?.success, `falhou: ${JSON.stringify(registered?.reasons)}`);
    const rows = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId });
    assert.ok((rows || []).some((r) => r.tournament_id === tournament.id), 'inscrição não persistida');
  });

  finish('test-staff-report-registration-cta-v514');
} finally {
  await ctx.vite.close();
}
