// Fase 4 — ranking rolling de 52 semanas. Verificação DIRETA (não por
// inferência) dos efeitos de jogo listados no item 4C, rodando o passe
// semanal real (circuitLifecycle.js:processWorldCircuit) várias semanas
// seguidas contra fixtures controladas — muito mais rápido que esperar o
// regime-check de 5 temporadas pra ver o mesmo mecanismo, e permite isolar
// exatamente o cenário que cada item pede.
//
// 4C.1 (crítico, "pare se estranho"): um real do top 10 que para de jogar
// deve cair do ranking em até 52 semanas — não antes (sem reset visível no
// dia da migração, decisão do item 3) e não nunca (sem ranking fantasma).
// 4C.3 (crítico, "pare se estranho"): elegibilidade de tier é móvel nos
// dois sentidos — sobe quando pontua, desce quando os resultados expiram.
// 4C.4: o dado de "quanto falta pra um resultado expirar" existe e é
// consultável (sem UI ainda, por instrução explícita).
// Item 3 (migração): a âncora sintética não causa nenhuma mudança visível
// no primeiro toque de uma carreira salva antes desta fase.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; }, async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; }, async stat() { return { size: 0 }; }, getDataDirectoryDescription: () => 'memory',
  };
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { processWorldCircuit } = await server.ssrLoadModule('/src/game-core/circuitLifecycle.js');
  const { RANKING_RESULT_ENTITY, isResultExpired } = await server.ssrLoadModule('/src/game-core/rankingWindow.js');

  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'career-rolling-window-fase4', name: 'QA Rolling Window Fase 4' });
  activeCareerAdapter.careerManager = careerManager;
  const career = await activeCareerAdapter.getActiveCareer();

  // ── Fixtures ────────────────────────────────────────────────────────────
  // (a) 4C.1: um real do top 10, carreira salva ANTES da Fase 4 (sem
  // nenhuma linha em AthleteRankingResult) — vai receber a âncora sintética
  // no primeiro toque e nunca mais jogar.
  await localGame.entities.AthleteProfile.create({
    id: 'top10-inactive', sport_name: 'Top 10 Inativo', overall_rating: 50,
    world_ranking_points: 6000, ranking_points: 6000, ranking_position: 5, retired: false,
  });
  // (b) 25 atletas "de fundo" que continuam jogando toda semana (~100 pts/
  // semana cada) — dão à população um ponto de comparação estável em vez
  // de todo mundo compartilhar a mesma data de migração.
  const FILLER_COUNT = 25;
  for (let i = 0; i < FILLER_COUNT; i += 1) {
    await localGame.entities.AthleteProfile.create({
      id: `filler-${i}`, sport_name: `Filler ${i}`, overall_rating: 50,
      world_ranking_points: 0, ranking_points: 0, ranking_position: 100 + i, retired: false,
    });
  }
  // (c) 4C.3, sentido ASCENDENTE: Platinum hoje (2000 pts), vai ganhar
  // resultados novos e cruzar pra Masters (>=2500).
  await localGame.entities.AthleteProfile.create({
    id: 'rising-tier', sport_name: 'Ascendente', overall_rating: 50,
    world_ranking_points: 2000, ranking_points: 2000, ranking_position: 40, retired: false,
  });
  // (d) 4C.3, sentido DESCENDENTE: Masters hoje (2600 pts, salva antes da
  // Fase 4), nunca mais joga — deve sair do Masters quando a âncora expirar.
  await localGame.entities.AthleteProfile.create({
    id: 'falling-tier', sport_name: 'Descendente', overall_rating: 50,
    world_ranking_points: 2600, ranking_points: 2600, ranking_position: 25, retired: false,
  });

  const before = await localGame.entities.AthleteProfile.get('top10-inactive');
  gate('(setup) top10-inactive começa em Elite (6000 pts, sem tocar categoria ainda)', before.circuit_category === undefined);

  let playerProfile = { id: career.player.id, last_circuit_week: null, rank_points: 0 };
  let previousDate = '2025-12-22';
  let currentDate = '2025-12-29';
  const TOTAL_WEEKS = 60; // > 52 semanas, pra ver a âncora expirar de verdade
  let week10Snapshot = null;
  let week11Snapshot = null;
  let week52Snapshot = null;
  let week1SeedRow = null;

  for (let week = 1; week <= TOTAL_WEEKS; week += 1) {
    // Injeta resultado semanal pros fillers (mantém o "chão" da população
    // ativo — top22/52-semanas converge pra ~2200 depois de 22+ semanas).
    const fillerOps = [];
    for (let i = 0; i < FILLER_COUNT; i += 1) {
      fillerOps.push({
        type: 'upsert', entityName: RANKING_RESULT_ENTITY, id: `filler-${i}:week-${week}`,
        data: { id: `filler-${i}:week-${week}`, athlete_id: `filler-${i}`, tournament_id: `t-${week}`, tournament_name: 'Torneio semanal QA', tier: 'Silver', date: currentDate, points: 100, finish: 'r16' },
      });
    }
    // Semana 10: injeta 3 resultados grandes pro atleta ascendente —
    // suficiente pra cruzar de Platinum (2000) pra Masters (>=2500).
    if (week === 10) {
      ['a', 'b', 'c'].forEach((suffix, idx) => fillerOps.push({
        type: 'upsert', entityName: RANKING_RESULT_ENTITY, id: `rising-tier:promo-${suffix}`,
        data: { id: `rising-tier:promo-${suffix}`, athlete_id: 'rising-tier', tournament_id: `promo-${idx}`, tournament_name: 'Torneio de ascensão QA', tier: 'Masters', date: currentDate, points: 300, finish: 'semifinal' },
      }));
    }
    if (fillerOps.length) await localGame.batch(fillerOps);

    const result = await processWorldCircuit(playerProfile, previousDate, currentDate);
    playerProfile = result.profile;
    gate(`(semana ${week}) processWorldCircuit não pulou o passe`, !result.skipped);

    // Semana 1: captura a âncora sintética ENQUANTO ela ainda existe — ela
    // expira e é podada de propósito na semana 54 (364 dias), então tem que
    // ser lida aqui, não depois do laço inteiro (essa foi a causa real do
    // primeiro FAIL desta suíte: `.get()` depois da semana 60 lançava
    // "não encontrado" porque a âncora já tinha expirado e sido podada
    // corretamente — confirma que a poda funciona, não que a migração
    // falhou).
    if (week === 1) {
      const rows = (await localGame.entities.AthleteRankingResult.filter({ athlete_id: 'top10-inactive' })) || [];
      week1SeedRow = rows[0] || null;
    }
    // Snapshot da semana 9 — a última ANTES da injeção dos resultados de
    // promoção (que só acontece no início da iteração da semana 10, depois
    // deste ponto do laço já ter rodado pra semana 9).
    if (week === 9) {
      const rising = await localGame.entities.AthleteProfile.get('rising-tier');
      week10Snapshot = rising;
    }
    // Semana 11: logo DEPOIS da promoção (semana 10) ser contabilizada, e
    // MUITO antes da âncora de rising-tier expirar (semana 54) — isola o
    // efeito da promoção do efeito da expiração, que senão se sobrepõem (o
    // total final, lá na semana 60, já não tem mais a âncora nem pra
    // rising-tier nem pra top10-inactive — os dois expiram juntos, criados
    // na mesma semana 1).
    if (week === 11) {
      const rising = await localGame.entities.AthleteProfile.get('rising-tier');
      week11Snapshot = rising;
    }
    if (week === 52) {
      week52Snapshot = {
        top10: await localGame.entities.AthleteProfile.get('top10-inactive'),
        falling: await localGame.entities.AthleteProfile.get('falling-tier'),
      };
    }

    previousDate = currentDate;
    currentDate = addDays(currentDate, 7);
  }

  // ── 4D (migração): zero reset visível no primeiro toque ────────────────
  // A âncora sintética vale o total CHEIO — ninguém muda de posição/pontos
  // no instante em que a carreira é tocada pela primeira vez após a Fase 4.
  gate('(migração) âncora sintética gravada pro atleta legado, valendo o total cheio', week1SeedRow?.points === 6000);
  gate('(migração) âncora é distinguível como não-torneio (tournament_id null)', week1SeedRow?.tournament_id === null);
  gate('(migração) âncora tem a flag explícita is_legacy_seed', week1SeedRow?.is_legacy_seed === true);

  // ── 4C.1 (crítico): top 10 inativo NÃO perde posição antes da janela
  // fechar (semana 52, 364 dias — a âncora ainda não expirou) ─────────────
  gate('(4C.1) na semana 52, o total do inativo ainda é o valor cheio da âncora (sem decaimento antecipado)', week52Snapshot.top10.world_ranking_points === 6000);
  gate('(4C.1) na semana 52, o inativo ainda está no top 20 (ninguém ultrapassou 6000 ainda)', week52Snapshot.top10.ranking_position <= 20);

  const afterWindow = await localGame.entities.AthleteProfile.get('top10-inactive');
  const fillerSample = await localGame.entities.AthleteProfile.get('filler-0');
  console.log(`\n[4C.1] depois de ${TOTAL_WEEKS} semanas: top10-inactive.world_ranking_points=${afterWindow.world_ranking_points}, ranking_position=${afterWindow.ranking_position} · filler-0.world_ranking_points=${fillerSample.world_ranking_points}`);
  gate('(4C.1 — CRÍTICO) depois de 60 semanas (>52), o total do inativo caiu a zero (âncora expirou, nenhum resultado novo)', afterWindow.world_ranking_points === 0);
  gate('(4C.1 — CRÍTICO) depois de 60 semanas, o inativo SAIU do top 20 (fillers ativos ultrapassaram)', afterWindow.ranking_position > 20);
  gate('(4C.1) fillers ativos convergem pra ~2200 (22 melhores de 100 pts/semana) — não é o inativo que caiu, é ele especificamente', fillerSample.world_ranking_points >= 2000 && fillerSample.world_ranking_points <= 2200);
  const seedRowAfterExpiry = (await localGame.entities.AthleteRankingResult.filter({ athlete_id: 'top10-inactive' })) || [];
  gate('(4B.3 — poda) a âncora expirada foi PODADA de AthleteRankingResult (apagar, não agregar — decisão aprovada do item 2)', seedRowAfterExpiry.length === 0);

  // ── 4C.3 (crítico): elegibilidade de tier é móvel nos dois sentidos ────
  gate('(4C.3 — antes) rising-tier começa em Platinum (2000 pts, abaixo do corte de Masters)', week10Snapshot?.circuit_category === 'Platinum');
  console.log(`[4C.3 ascendente] semana 11: rising-tier.world_ranking_points=${week11Snapshot?.world_ranking_points}, circuit_category=${week11Snapshot?.circuit_category}`);
  // Lido na semana 11 (logo depois da promoção, MUITO antes da âncora de
  // rising-tier expirar na semana 54) — isolado do efeito de expiração, que
  // por si só já derrubaria o total de volta pra baixo do corte de Masters
  // mais tarde no mesmo teste (âncora e promoção são efeitos independentes,
  // cada um move a categoria por um motivo diferente).
  gate('(4C.3 — CRÍTICO, sentido ASCENDENTE) rising-tier cruzou pra Masters depois de pontuar (elegibilidade sobe)', week11Snapshot?.circuit_category === 'Masters');

  gate('(4C.3 — antes) falling-tier ainda em Masters na semana 52 (âncora de 2600 não expirou)', week52Snapshot.falling.circuit_category === 'Masters');
  const fallingFinal = await localGame.entities.AthleteProfile.get('falling-tier');
  console.log(`[4C.3 descendente] falling-tier.world_ranking_points=${fallingFinal.world_ranking_points}, circuit_category=${fallingFinal.circuit_category}`);
  gate('(4C.3 — CRÍTICO, sentido DESCENDENTE) falling-tier SAIU do Masters depois da âncora expirar (elegibilidade desce, sem ranking fantasma)', fallingFinal.circuit_category !== 'Masters' && fallingFinal.world_ranking_points === 0);

  // ── 4C.4: dado de "defesa de pontos" existe e é consultável ────────────
  const risingRows = (await localGame.entities.AthleteRankingResult.filter({ athlete_id: 'rising-tier' })) || [];
  gate('(4C.4) resultados datados do atleta são consultáveis via filter({athlete_id})', risingRows.length > 0);
  const withExpiry = risingRows.map((row) => ({ ...row, expired: isResultExpired(row, currentDate) }));
  gate('(4C.4) cada resultado tem uma data e é possível calcular se/quando expira (isResultExpired é uma função pura, consultável a qualquer momento)', withExpiry.every((row) => typeof row.date === 'string' && typeof row.expired === 'boolean'));
  console.log('[4C.4 — item de UI pra depois, não implementado agora] dado já existe: cada linha de AthleteRankingResult tem `date`; "semanas até expirar" = 52 - Math.floor(careerDaysBetween(row.date, hoje)/7). Suficiente pra uma tela futura de "resultados a defender".');

  console.log(`\n${gates} gates executados, todos PASS — Fase 4, item 4C: topo não é mais vitalício (4C.1), elegibilidade de tier é móvel nos dois sentidos (4C.3), dado de defesa de pontos existe (4C.4), migração sem reset visível (item 3).`);
} finally {
  await server.close();
}
