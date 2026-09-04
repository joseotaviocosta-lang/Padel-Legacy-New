// Fase 4.0, item 2B (achado #18) — resolveCompletedWorldTourEvents's
// `reranked` block passou a gravar ranking_position só pro top 50 (antes:
// população inteira), porque o único consumidor confirmado que precisa de
// frescor no mesmo dia (EntryManager.js:resolveEntryRank, corte do Circuit
// Finals minRanking:8 e Legacy Finals minRanking:16) só olha pra quem está
// perto do topo. Este teste prova a equivalência: o resultado de
// elegibilidade pros dois cortes é IDÊNTICO entre a gravação antiga (toda a
// população) e a nova (só o top 50), pra qualquer atleta dentro da margem
// de segurança.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { evaluateTournamentEntry } = await server.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');

  // População de 60 atletas com pontos deste "ciclo" embaralhando a ordem
  // anterior (simula resultados de torneio movendo gente pra cima/baixo,
  // inclusive cruzando os cortes de 8 e 16).
  const population = Array.from({ length: 60 }, (_, i) => ({
    id: `athlete-${i + 1}`,
    // ranking_position ANTES desta rodada (posição da semana passada).
    ranking_position: i + 1,
    // points DEPOIS desta rodada — embaralha por um hash simples,
    // determinístico, sem depender de Math.random.
    points: ((i * 37 + 11) % 60) + (i === 5 ? 1000 : 0) + (i === 45 ? 999 : 0),
  }));

  // Reproduz exatamente a lógica de WorldTourLifecycle.js:reranked.
  function computeReranked(pop, topN) {
    const sorted = [...pop].sort((a, b) => b.points - a.points);
    const writable = topN ? sorted.slice(0, topN) : sorted;
    const writes = new Map(writable.map((athlete, index) => [athlete.id, index + 1]));
    // Aplica: quem foi escrito pega a posição nova; quem não foi mantém a
    // ranking_position antiga (exatamente o que bulkUpdate faz — merge,
    // não substituição).
    return pop.map((athlete) => ({
      ...athlete,
      ranking_position: writes.has(athlete.id) ? writes.get(athlete.id) : athlete.ranking_position,
    }));
  }

  const oldFull = computeReranked(population, null);
  const newTop50 = computeReranked(population, 50);

  // (a) Dentro do top 50 (a margem de segurança, 3x o maior corte usado
  // hoje — 16), as duas gravações produzem a MESMA ranking_position pra
  // cada atleta.
  const top50Ids = [...population].sort((a, b) => b.points - a.points).slice(0, 50).map((a) => a.id);
  const positionsMatch = top50Ids.every((id) => {
    const oldPos = oldFull.find((a) => a.id === id).ranking_position;
    const newPos = newTop50.find((a) => a.id === id).ranking_position;
    return oldPos === newPos;
  });
  gate('(2B) ranking_position idêntico entre gravação completa e top-50 pra todo mundo dentro do top 50', positionsMatch);

  // (b) Elegibilidade pro corte do Circuit Finals (minRanking:8) é
  // IDÊNTICA entre as duas variantes, pra toda a população.
  const circuitFinalsTournament = { tier: 'Circuit Finals', min_ranking: 8 };
  const circuitFinalsMatch = population.every((seed) => {
    const oldAthlete = oldFull.find((a) => a.id === seed.id);
    const newAthlete = newTop50.find((a) => a.id === seed.id);
    const oldEligible = evaluateTournamentEntry(circuitFinalsTournament, oldAthlete).eligible;
    const newEligible = evaluateTournamentEntry(circuitFinalsTournament, newAthlete).eligible;
    return oldEligible === newEligible;
  });
  gate('(2B) elegibilidade pro corte do Circuit Finals (minRanking:8) é idêntica antes/depois', circuitFinalsMatch);

  // (c) Mesma verificação pro Legacy Finals (minRanking:16).
  const legacyFinalsTournament = { tier: 'Legacy Finals', min_ranking: 16 };
  const legacyFinalsMatch = population.every((seed) => {
    const oldAthlete = oldFull.find((a) => a.id === seed.id);
    const newAthlete = newTop50.find((a) => a.id === seed.id);
    const oldEligible = evaluateTournamentEntry(legacyFinalsTournament, oldAthlete).eligible;
    const newEligible = evaluateTournamentEntry(legacyFinalsTournament, newAthlete).eligible;
    return oldEligible === newEligible;
  });
  gate('(2B) elegibilidade pro corte do Legacy Finals (minRanking:16) é idêntica antes/depois', legacyFinalsMatch);

  // (d) Confirma que o cenário de teste é real, não trivial: pelo menos um
  // atleta REALMENTE cruzou pra dentro do top 8/16 nesta rodada (o índice 5
  // tinha ranking_position:6 e ganhou +1000 pontos — deve virar #1).
  const climber = newTop50.find((a) => a.id === 'athlete-6');
  gate('(setup) cenário de teste não é trivial — o atleta que "decolou" nesta rodada virou #1 em ambas as variantes', oldFull.find((a) => a.id === 'athlete-6').ranking_position === 1 && climber.ranking_position === 1);

  // (e) Fora da margem de segurança (top 50), a gravação nova
  // DELIBERADAMENTE não atualiza a posição — troca-off explícito e
  // esperado (documentado no código e no achado #18), não um bug: quem
  // não está perto de nenhum corte fica com a posição da semana passada
  // até o próximo passe semanal, exatamente como o resto da população
  // sempre tolerou antes deste achado existir.
  const outsideTop50 = newTop50.find((a) => a.id === 'athlete-55');
  const oldOutsideTop50 = oldFull.find((a) => a.id === 'athlete-55');
  gate('(2B, troca-off documentado) fora do top 50 a posição pode ficar defasada até o próximo passe semanal — comportamento esperado, não bug', outsideTop50.ranking_position === 55 && oldOutsideTop50.ranking_position !== 55);

  console.log(`\n${gates} gates executados, todos PASS — Fase 4.0, item 2B: elegibilidade Circuit Finals/Legacy Finals equivalente entre gravação completa e top-50.`);
} finally {
  await server.close();
}
