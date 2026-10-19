// CLOUD-7D1 (somente diagnóstico) — duplas DISTINTAS com o mesmo nome de exibição: como a chave canônica (que identifica
// equipes por NOME) se comporta e onde o resto do pipeline (por ID) diverge. Usa as funções reais de produção.
// Uso: node scripts/diagnose-cloud-7d1-duplicate-team-names.mjs [--output=<json>]
import fs from 'node:fs';
import { createServer } from 'vite';
const outFile = process.argv.find((a) => a.startsWith('--output='))?.slice(9);
const v = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const s = await v.ssrLoadModule('/src/gameplay/worldTour/tournamentSettlement.js');
  const w = await v.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const athlete = (id, name) => ({ id, name, country: 'X', world_ranking_points: 100 });
  // Caso real da CLOUD-7C: quatro atletas distintos, dois "Hugo López" e dois "Rafael López".
  const athletes = [athlete('h1', 'Hugo López'), athlete('r1', 'Rafael López'), athlete('h2', 'Hugo López'), athlete('r2', 'Rafael López'),
    ...Array.from({ length: 12 }, (_, i) => athlete(`o${i}`, `Outro${i} A`))];
  const partnerships = [
    { id: 'p-A', status: 'ativa', athlete_a_id: 'h1', athlete_b_id: 'r1', scope: 'world' }, { id: 'p-B', status: 'ativa', athlete_a_id: 'h2', athlete_b_id: 'r2', scope: 'world' },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `p-o${i}`, status: 'ativa', athlete_a_id: `o${2 * i}`, athlete_b_id: `o${2 * i + 1}`, scope: 'world' })),
  ];
  const pairs = w.buildCanonicalPairs(partnerships, athletes);
  const sameName = pairs.filter((p) => p.name === 'Hugo López & Rafael López');
  const out = { pairsBuilt: pairs.length, distinctPairIdsWithSameName: sameName.map((p) => p.id), identityByName: new Set(pairs.map((p) => p.name)).size, identityById: new Set(pairs.map((p) => p.id)).size };
  const participants = pairs.map((p) => ({ name: p.name, strength: 50 + (p.id.length % 7), seedRank: 1 }));
  const bracket = s.buildCanonicalTournamentBracket({ tournamentId: 'dup-names-demo', participants, date: '2035-07-01' });
  const facts = s.deriveTournamentFactsFromFullBracket(bracket.bracket_history);
  const appearances = bracket.bracket_history.flatMap((r) => r.matches).flatMap((m) => [m.team_a, m.team_b]).filter((n) => n === 'Hugo López & Rafael López').length;
  out.bracket = { drawnPairs: pairs.length, participantsInBracket: bracket.participants?.length ?? null, placements: facts?.placements?.length ?? null, uniquePlacementTeams: new Set((facts?.placements || []).map((p) => p.team)).size, nameAppearancesInBracket: appearances };
  const placementByTeam = new Map((facts?.placements || []).map((p) => [p.team, p.position]));
  out.settlementLookupByName = pairs.map((p) => ({ pairId: p.id, resolvedPosition: placementByTeam.get(p.name) ?? null }));
  out.conclusion = 'A chave e as colocações identificam equipes por NOME; duas duplas distintas com o mesmo nome compartilham a mesma posição/entrada (Map por nome) e a contagem de colocações fica menor que a de duplas sorteadas. Pontuação e histórico por ID divergem do que a chave mostra.';
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
} finally { await v.close(); }
