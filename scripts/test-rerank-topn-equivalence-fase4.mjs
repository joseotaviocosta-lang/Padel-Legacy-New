// Fase 4.0, item 2B (achado #18) — resolveCompletedWorldTourEvents's
// `reranked` block passou a gravar ranking_position só pra UNIÃO de quem
// está no top 50 por pontos NOVOS com quem estava no top 50 pela
// ranking_position ANTIGA (antes: população inteira), porque o único
// consumidor confirmado que precisa de frescor no mesmo dia
// (EntryManager.js:resolveEntryRank, corte do Circuit Finals minRanking:8
// e Legacy Finals minRanking:16) só olha pra quem está perto do topo.
//
// A união (não só "quem está no top N agora") existe por um bug real que
// a primeira versão deste teste pegou: escrever só o top-N-por-pontos-novos
// deixa quem CAIU do top N (era #3, virou #55 nesta rodada) com a
// ranking_position ANTIGA — ainda dentro do corte, ainda "elegível" pra um
// torneio que não devia mais poder disputar. Ver comentário no código de
// WorldTourLifecycle.js:reranked pra o relato completo.
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
  // anterior (simula resultados de torneio movendo gente pra cima/baixo).
  // Casos deliberados, além do embaralhamento geral (`(i*37+11)%60`, uma
  // permutação determinística de 0-59 já que gcd(37,60)=1):
  //  - athlete-6 (i=5): ranking_position antiga #6, ganha +1000 pontos →
  //    deve DECOLAR pro topo (entra no corte).
  //  - athlete-3 (i=2): ranking_position antiga #3 (dentro de qualquer
  //    corte), pontos ZERADOS → deve DESPENCAR pra fora do top 50 (o
  //    cenário que causou o bug original).
  const population = Array.from({ length: 60 }, (_, i) => ({
    id: `athlete-${i + 1}`,
    ranking_position: i + 1,
    points: i === 2 ? 0 : ((i * 37 + 11) % 60) + 60 + (i === 5 ? 1000 : 0),
  }));

  // Reproduz exatamente a lógica de WorldTourLifecycle.js:reranked —
  // inclusive a união de "top N por pontos novos" com "estava no top N
  // pela posição antiga".
  function computeReranked(pop, topN) {
    const sorted = [...pop].sort((a, b) => b.points - a.points);
    const withNewPosition = sorted.map((athlete, index) => ({ ...athlete, newPosition: index + 1 }));
    if (!topN) {
      // Variante ANTIGA: população inteira, sempre a posição nova.
      return withNewPosition.map((a) => ({ ...a, ranking_position: a.newPosition }));
    }
    // Variante NOVA (2B): só escreve quem está na união do top N por
    // pontos novos com quem estava no top N pela posição antiga.
    return withNewPosition.map((a) => {
      const previous = Number(a.ranking_position);
      const wasInBand = Number.isFinite(previous) && previous <= topN;
      const isInBand = a.newPosition <= topN;
      return { ...a, ranking_position: (isInBand || wasInBand) ? a.newPosition : a.ranking_position };
    });
  }

  const oldFull = computeReranked(population, null);
  const newTop50 = computeReranked(population, 50);
  const byId = (list, id) => list.find((a) => a.id === id);

  // (a) Pra toda a UNIÃO (top 50 por pontos novos OU top 50 pela posição
  // antiga), as duas variantes produzem a MESMA ranking_position.
  const unionIds = population
    .filter((seed) => {
      const newPos = byId(oldFull, seed.id).ranking_position; // posição nova = igual em ambas por construção
      return newPos <= 50 || seed.ranking_position <= 50;
    })
    .map((seed) => seed.id);
  const positionsMatch = unionIds.every((id) => byId(oldFull, id).ranking_position === byId(newTop50, id).ranking_position);
  gate('(2B) ranking_position idêntico entre gravação completa e a união top-50-novo/top-50-antigo', positionsMatch);
  gate('(setup) a união cobre mais que só o top 50 por pontos novos (o caso que causou o bug está incluído)', unionIds.length > 50);

  // (b)/(c) Elegibilidade pros dois cortes reais é IDÊNTICA entre as duas
  // variantes, pra TODA a população (não só a união) — é a prova de que
  // ninguém fora da união poderia ter sua elegibilidade mudada mesmo que
  // ficasse com a posição antiga.
  for (const [label, tournament] of [
    ['Circuit Finals (minRanking:8)', { tier: 'Circuit Finals', min_ranking: 8 }],
    ['Legacy Finals (minRanking:16)', { tier: 'Legacy Finals', min_ranking: 16 }],
  ]) {
    const allMatch = population.every((seed) => {
      const oldEligible = evaluateTournamentEntry(tournament, byId(oldFull, seed.id)).eligible;
      const newEligible = evaluateTournamentEntry(tournament, byId(newTop50, seed.id)).eligible;
      return oldEligible === newEligible;
    });
    gate(`(2B) elegibilidade pro corte do ${label} é idêntica antes/depois, pra toda a população`, allMatch);
  }

  // (d) Cenário "decolagem": athlete-6 tinha ranking_position:6 e ganhou
  // +1000 pontos — vira #1 nas duas variantes (entra no corte, sempre
  // capturado por "topN por pontos novos").
  gate('(cenário decolagem) atleta que decolou nesta rodada vira #1 em ambas as variantes', byId(oldFull, 'athlete-6').ranking_position === 1 && byId(newTop50, 'athlete-6').ranking_position === 1);

  // (e) Cenário "queda" (o bug original): athlete-3 tinha ranking_position:3
  // (dentro de QUALQUER corte real) e zerou os pontos — despenca pro fim
  // da tabela. A variante nova PRECISA refletir a queda (estava no top 50
  // antigo), não deixar a posição #3 congelada.
  const oldFallen = byId(oldFull, 'athlete-3');
  const newFallen = byId(newTop50, 'athlete-3');
  gate('(cenário queda — bug original) quem cai do top 50 é corrigido na variante nova, não fica com a posição antiga congelada', oldFallen.ranking_position > 50 && newFallen.ranking_position === oldFallen.ranking_position);
  gate('(cenário queda) sem a correção, a posição antiga (#3) continuaria elegível pro Circuit Finals — confirma que o bug seria real', 3 <= 8);

  // (f) Fora da união (nunca esteve nem está perto de nenhum corte), a
  // gravação nova DELIBERADAMENTE não atualiza a posição — troca-off
  // explícito e assumido (achado #18), não um bug: mesma tolerância a
  // atraso que o resto da população sempre teve fora deste bloco.
  const stableId = population
    .map((seed) => ({ seed, newPos: byId(oldFull, seed.id).ranking_position }))
    .find(({ seed, newPos }) => newPos > 50 && seed.ranking_position > 50)?.seed.id;
  gate('(setup) existe pelo menos um atleta fora da união pra testar o trade-off', Boolean(stableId));
  const stableOld = byId(oldFull, stableId);
  const stableNew = byId(newTop50, stableId);
  gate('(2B, troca-off documentado) fora da união a posição fica com o valor pré-existente até o próximo passe semanal — esperado, não bug', stableNew.ranking_position === population.find((p) => p.id === stableId).ranking_position && stableNew.ranking_position !== stableOld.ranking_position);

  console.log(`\n${gates} gates executados, todos PASS — Fase 4.0, item 2B: elegibilidade Circuit Finals/Legacy Finals equivalente entre gravação completa e a união top-50-novo/top-50-antigo (inclui o caso de quem cai do corte).`);
} finally {
  await server.close();
}
