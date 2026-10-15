// Playthrough 5.27-J — cenário determinístico de saída da parceria, usado pela
// reprodução (antes/depois) e pelos testes *-v527j. Mundo real (bootstrap da
// 5.17), parceria real, inscrição real (registerTournament — a mesma do jogador
// e do headless) e ciclo real (processPartnerDay dia a dia).
import { bootstrap, installShims } from './competitiveReviewGates.mjs';

export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const endOf = (t) => String(t.end_date || t.start_date).slice(0, 10);
const EXIT = ['nao_renovara', 'encerrar_ao_final', 'encerra_apos_compromisso'];

/**
 * exit: 'lifecycle' (contrato vence → carência → encerra_apos_compromisso) ou
 *       'player-scheduled' (schedulePartnerSeparation antes da data nominal).
 * newPartnerDuringLimbo: tenta formar outra dupla no limbo (sobreposição).
 */
export async function runExitScenario(label, { exit = 'lifecycle', newPartnerDuringLimbo = false } = {}) {
  installShims('/tournaments');
  const ctx = await bootstrap(label, { rank: 950, careerDate: '2026-01-19' });
  const { vite, mod, localGame, profileId, partner } = ctx;
  try {
    const { registerTournament, evaluateTournamentRegistration } = await mod('/src/lib/tournamentRegistration.js');
    const { getActivePartnership, startPartnership } = await mod('/src/lib/partnershipSystem.js');
    const { resolveCommittedPartnerId } = await mod('/src/lib/committedRoster.js');
    const { BOTS_BY_DIFFICULTY } = await mod('/src/lib/bots.js');
    const lifecycle = await mod('/src/game-core/partnerLifecycle.js');
    const setDate = async (date) => localGame.entities.PlayerProfile.update(profileId, { career_date: date });
    const all = await localGame.entities.Tournament.list('start_date', 3000);
    const nominalEnd = '2026-02-05';
    const ps0 = await getActivePartnership(profileId);
    await localGame.entities.Partnership.update(ps0.id, { contract_end_date: nominalEnd, scheduled_end_date: nominalEnd });
    const openAt = async (date, filter) => {
      const profile = await setDate(date);
      const regs = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId });
      return all.filter((t) => filter(t) && evaluateTournamentRegistration({ player: profile, partner, tournament: t, currentDate: date, registrations: regs, tournaments: all, teamRank: 950 }).allowed);
    };
    const out = { label, exit, nominalEnd, partnerId: partner.id, preexisting: [], attempts: [], exitDecisionDate: null, statusTimeline: [], overlap: null };

    // 1) compromisso pré-existente que termina DEPOIS da data nominal.
    const pre = (await openAt('2026-01-19', (t) => t.start_date > nominalEnd && t.tier === 'Bronze'))[0];
    const r0 = await registerTournament({ player: await setDate('2026-01-19'), partner, tournament: pre, teamRank: 950 });
    out.preexisting.push({ tournamentId: pre.id, start: pre.start_date, end: endOf(pre), registeredAt: '2026-01-19', ok: Boolean(r0?.success) });

    if (exit === 'refused-low-morale') {
      // Parceiro recusou a renovação (estado gravado por renewPartnerContract) e a moral despenca.
      await setDate('2026-01-21');
      await localGame.entities.Partnership.update(ps0.id, { contract_status: 'nao_renovara', renewal_available: false, exit_decided_at: '2026-01-21', partner_morale: 10 });
      out.exitDecisionDate = '2026-01-21';
    }
    if (exit === 'player-scheduled') {
      await setDate('2026-01-21');
      await lifecycle.schedulePartnerSeparation(await localGame.entities.PlayerProfile.get(profileId), 'teste 5.27-J');
      out.exitDecisionDate = '2026-01-21';
      const within = (await openAt('2026-01-22', (t) => t.id !== pre.id && endOf(t) < nominalEnd && t.start_date > '2026-01-22'))[0];
      const beyond = (await openAt('2026-01-22', (t) => t.id !== pre.id && endOf(t) > nominalEnd && t.start_date > endOf(pre)))[0];
      for (const [kind, t] of [['within-contract', within], ['extends-beyond-end', beyond]]) {
        if (!t) { out.attempts.push({ kind, tournamentId: null, note: 'nenhum torneio aberto nesse recorte' }); continue; }
        const coinsBefore = (await localGame.entities.PlayerProfile.get(profileId)).coins;
        const r = await registerTournament({ player: await setDate('2026-01-22'), partner, tournament: t, teamRank: 950 });
        const rows = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId, tournament_id: t.id });
        out.attempts.push({ kind, date: '2026-01-22', tournamentId: t.id, end: endOf(t), ok: Boolean(r?.success), reasons: (r?.reasons || []).map((x) => x.code || x), rowWritten: rows.length > 0, coinsChanged: (await localGame.entities.PlayerProfile.get(profileId)).coins !== coinsBefore });
        if (r?.success) out.preexisting.push({ tournamentId: t.id, start: t.start_date, end: endOf(t), registeredAt: '2026-01-22', ok: true, withinContract: true });
      }
    }

    // 2) ciclo de parceria dia a dia até a separação efetiva.
    let date = '2026-01-19';
    let tried = 0;
    for (let i = 0; i < 400; i += 1) {
      const next = addDays(date, 1);
      const profile = await setDate(next);
      await lifecycle.processPartnerDay(profile, date, next);
      date = next;
      const ps = await getActivePartnership(profileId);
      const st = ps ? `${ps.contract_status}${ps.separation_scheduled_date ? `@${ps.separation_scheduled_date}` : ''}` : 'ended';
      if (out.statusTimeline.at(-1)?.status !== st) out.statusTimeline.push({ date, status: st, exitDecidedAt: ps?.exit_decided_at || null });
      if (!ps) { out.effectiveSeparationDate = date; break; }
      if (!out.exitDecisionDate && EXIT.includes(ps.contract_status)) { out.exitDecisionDate = date; out.exitDecidedAtField = ps.exit_decided_at || null; }
      if (['lifecycle', 'refused-low-morale'].includes(exit) && out.exitDecisionDate && tried < 2 && date >= nominalEnd) {
        const regs = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId });
        const taken = new Set(regs.map((r) => r.tournament_id));
        const cand = all.find((t) => !taken.has(t.id) && t.start_date > addDays(date, 10) && t.tier === 'Bronze');
        if (cand) {
          const coinsBefore = profile.coins;
          const r = await registerTournament({ player: profile, partner, tournament: cand, teamRank: 950 });
          const rows = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId, tournament_id: cand.id });
          out.attempts.push({ kind: 'after-exit', date, tournamentId: cand.id, end: endOf(cand), ok: Boolean(r?.success), reasons: (r?.reasons || []).map((x) => x.code || x), rowWritten: rows.length > 0, coinsChanged: (await localGame.entities.PlayerProfile.get(profileId)).coins !== coinsBefore });
          tried += 1;
        }
      }
      // Sobreposição: tentar outra dupla no limbo (o jogo encerra a anterior; nunca duas ativas).
      if (newPartnerDuringLimbo && out.exitDecisionDate && !out.overlap) {
        const other = (BOTS_BY_DIFFICULTY.amador || BOTS_BY_DIFFICULTY.iniciante || []).find((b) => b.id !== partner.id);
        await startPartnership(profile, other, 60, 50).catch((e) => ({ error: e.message }));
        const actives = await localGame.entities.Partnership.filter({ profile_id: profileId, status: 'ativa' });
        out.overlap = { date, activeCount: actives.length, activePartnerIds: actives.map((a) => a.partner_bot_id) };
        break;
      }
    }
    const regs = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId });
    out.commitments = regs.map((r) => ({ tournamentId: r.tournament_id, partnerId: r.partner_id, registeredAt: r.registered_at, status: r.status, end: r.effective_end_date }));
    out.newRegistrationsAfterExit = out.attempts.filter((a) => a.ok && a.kind !== 'within-contract').length;
    out.withinContractRegistrationsAfterExit = out.attempts.filter((a) => a.ok && a.kind === 'within-contract').length;
    out.lastLegitimateCommitmentEnd = out.preexisting.map((p) => p.end).sort().at(-1);
    out.preexistingKept = out.preexisting.every((p) => regs.some((r) => r.tournament_id === p.tournamentId && r.status === 'confirmed' && r.partner_id === partner.id));
    // Roster comprometido resolvido DEPOIS da separação (5.17: identidade da inscrição, não da parceria atual).
    out.committedPartnerAfter = out.preexisting.map((p) => ({ tournamentId: p.tournamentId, partnerId: resolveCommittedPartnerId(p.tournamentId, { registrations: regs, calendarEvents: [] }) }));
    return out;
  } finally {
    await vite.close();
  }
}
