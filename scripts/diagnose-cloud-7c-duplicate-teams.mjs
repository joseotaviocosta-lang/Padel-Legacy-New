// CLOUD-7C (somente diagnóstico) — torneios cujo sorteio contém duas duplas DISTINTAS com o mesmo nome de exibição
// (a chave/colocações do motor identificam equipes por NOME). Acha o primeiro momento da duplicação e a origem do nome.
// Uso: node scripts/diagnose-cloud-7c-duplicate-teams.mjs <save.json> [--output=<json>]
import fs from 'node:fs';
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const outFile = process.argv.find((a) => a.startsWith('--output='))?.slice(9);
const save = JSON.parse(fs.readFileSync(file, 'utf8'));
const E = save.entities;
const athletes = new Map(E.AthleteProfile.map((a) => [a.id, a]));
const partnerships = new Map(E.Partnership.map((p) => [p.id, p]));
const affected = [];
for (const t of E.Tournament) {
  const snap = t.draw_ranking_snapshot; if (!Array.isArray(snap)) continue;
  const byName = new Map();
  for (const e of snap) byName.set(e.name, [...(byName.get(e.name) || []), e.pair_id]);
  const collisions = [...byName.entries()].filter(([, ids]) => ids.length > 1);
  if (!collisions.length) continue;
  const names = (t.participants || []);
  const placements = t.placements || [];
  affected.push({
    tournament: t.id, tier: t.tier, status: t.status, drawDate: t.draw_date, start: t.start_date, resolvedAt: t.resolved_at || null,
    drawPairIds: (t.draw_pair_ids || []).length, participantsNames: names.length, uniqueParticipantNames: new Set(names).size,
    placementsRows: placements.length, uniquePlacementTeams: new Set(placements.map((x) => x.team)).size,
    manifestation: placements.length && new Set(placements.map((x) => x.team)).size !== placements.length ? 'colocacoes_com_equipe_duplicada' : (names.length < (t.draw_pair_ids || []).length ? 'dupla_fundida_silenciosamente_na_chave' : 'sem_efeito_visivel'),
    collisions: collisions.map(([name, ids]) => ({
      name, pairs: ids.map((id) => {
        const p = partnerships.get(id);
        const members = p ? [p.athlete_a_id || p.player1_id, p.athlete_b_id || p.player2_id].map((aid) => { const a = athletes.get(aid); return { id: aid, name: a?.name || a?.sport_name, country: a?.country, birth_date: a?.birth_date }; }) : null;
        return { pairId: id, status: p?.status || null, formedOn: id.match(/(\d{4}-\d{2}-\d{2})$/)?.[1] || null, members };
      }),
      appearancesInBracket: t.bracket_history.flatMap((r, ri) => r.matches.map((m, mi) => ({ r: ri, m: mi, side: m.team_a === name ? 'A' : m.team_b === name ? 'B' : null })).filter((x) => x.side)).length,
    })),
  });
}
affected.sort((a, b) => String(a.drawDate).localeCompare(String(b.drawDate)));
const result = { file, tournamentsWithDrawSnapshot: E.Tournament.filter((t) => Array.isArray(t.draw_ranking_snapshot)).length, affectedTournaments: affected.length, firstOccurrence: affected[0] ? { tournament: affected[0].tournament, drawDate: affected[0].drawDate, resolvedAt: affected[0].resolvedAt } : null, affected };
if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, affected: result.affected.map((a) => ({ tournament: a.tournament, drawDate: a.drawDate, resolvedAt: a.resolvedAt, manifestation: a.manifestation, drawPairIds: a.drawPairIds, participants: a.participantsNames, collisions: a.collisions.map((c) => ({ name: c.name, pairs: c.pairs.map((p) => `${p.pairId.slice(-24)} formada ${p.formedOn} (${p.members?.map((m) => `${m.name}/${m.country}`).join(' + ')})`) })) })) }, null, 1));
