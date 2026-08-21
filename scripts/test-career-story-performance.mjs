// Fase 14 (docs/FASE_14_CAREER_IDENTITY.md, Parte 15/17).
//
// buildCareerTimeline/getNotableMatches/getTopRivalry não podem escanear
// milhares de partidas a cada render da Home/Legado. Mede com 100/500/1000
// partidas — objetivo: consulta de resumo da carreira praticamente
// instantânea (nenhum processamento pesado, tudo O(n) simples sobre dados
// já buscados uma única vez pela página).
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function buildMatches(n) {
  const matches = [];
  for (let i = 0; i < n; i += 1) {
    const isFinal = i % 37 === 0;
    matches.push({
      id: `m-${i}`, profile_id: 'p-perf', date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      competition_type: 'tournament', is_official: true, result: i % 3 === 0 ? 'derrota' : 'vitória',
      tournament_name: `Torneio ${i % 20}`, tournament_round: isFinal ? 'Final' : 'R16', opponent_rank: (i % 300) + 1,
      press_importance: isFinal ? 'global' : i % 11 === 0 ? 'high' : 'simple',
      tournament_outcome: isFinal && i % 3 !== 0 ? 'champion' : 'advanced',
    });
  }
  return matches;
}

function buildRelationships(n) {
  const rels = [];
  for (let i = 0; i < Math.min(n, 60); i += 1) {
    rels.push({ target_name: `Bot ${i}`, shared_matches: (i % 10) + 1, shared_wins: i % 6, shared_losses: i % 4, shared_finals: i % 3 });
  }
  return rels;
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildCareerTimeline, getNotableMatches, getTopRivalry } = await server.ssrLoadModule('/src/lib/careerStory.js');
  const profile = { id: 'p-perf', sport_name: 'QA Perf', career_date: '2026-06-01', career_started_at: '2025-01-01', xp: 40000, ranking_position: 4, tournaments_won: 12 };

  const BUDGET_MS = 200; // "praticamente instantâneo" numa faixa generosa (CI pode ser mais lento que um dispositivo real)
  for (const n of [100, 500, 1000]) {
    const matches = buildMatches(n);
    const relationships = buildRelationships(n);
    const start = performance.now();
    const timeline = buildCareerTimeline(profile, matches, { relationships });
    const notable = getNotableMatches(matches, profile);
    const rivalry = getTopRivalry(relationships);
    const elapsed = performance.now() - start;
    gate(`${n} partidas: buildCareerTimeline+getNotableMatches+getTopRivalry roda em <${BUDGET_MS}ms (medido: ${elapsed.toFixed(1)}ms)`, elapsed < BUDGET_MS);
    gate(`${n} partidas: resultado continua correto (timeline não-vazia, rivalidade encontrada)`, timeline.length > 0 && Boolean(rivalry));
    void notable;
  }

  // Escala aproximadamente linear (não quadrática) — 1000 não deve ser
  // ordens de magnitude mais lento que 100 proporcionalmente ao tamanho.
  const t100 = (() => { const m = buildMatches(100); const s = performance.now(); buildCareerTimeline(profile, m); return performance.now() - s; })();
  const t1000 = (() => { const m = buildMatches(1000); const s = performance.now(); buildCareerTimeline(profile, m); return performance.now() - s; })();
  gate(`Escala sub-quadrática: 1000 partidas não é >20x mais lento que 100 (100=${t100.toFixed(2)}ms, 1000=${t1000.toFixed(2)}ms)`, t1000 < Math.max(20 * t100, 5));

  console.log(`\n${gates} gates executados, todos PASS — Performance do Career Story (Fase 14): 100/500/1000 partidas, sem processamento pesado.`);
} finally {
  await server.close();
}
