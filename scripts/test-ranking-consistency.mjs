// Fase 11 — Ranking unificado (docs/RANKING_INTEGRITY_PHASE11.md).
//
// Header/Home/Season usavam getWorldRank(profile); a página /ranking usava um
// algoritmo próprio diferente (índice de array, incluía pseudo-atletas
// derivados de TeamRanking, população vinda de uma query ordenada por um
// campo possivelmente desatualizado). Este teste prova, contra o motor real
// (GameStorage -> CareerRepository -> CareerManager reais, mesmo padrão de
// scripts/test-career-beta-readiness.mjs), que agora existe UMA fonte
// canônica (buildWorldRankingSnapshot, src/lib/padel.js) usada por todos os
// consumidores, com desempate determinístico e sem misturar ranking de dupla.
import { createServer } from 'vite';
import fs from 'node:fs';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(relativePath, content) { files.set(relativePath, String(content)); },
    async readText(relativePath) {
      if (!files.has(relativePath)) {
        const error = new Error('O arquivo não existe no armazenamento local.');
        error.code = 'FILE_NOT_FOUND';
        throw error;
      }
      return files.get(relativePath);
    },
    async exists(relativePath) { return files.has(relativePath); },
    async remove(relativePath) { return files.delete(relativePath); },
    async copy(sourcePath, destinationPath) { files.set(destinationPath, files.get(sourcePath)); return destinationPath; },
    async rename(sourcePath, destinationPath) { files.set(destinationPath, files.get(sourcePath)); files.delete(sourcePath); return destinationPath; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
    _files: files,
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { buildWorldRankingSnapshot, getWorldRank } = await server.ssrLoadModule('/src/lib/padel.js');
  const { getTeamRank } = await server.ssrLoadModule('/src/lib/teamRanking.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  activeCareerAdapter.careerManager = careerManager;

  async function freshCareerWithPlayer(playerOverrides = {}) {
    const { career } = await careerManager.createCareer({ career_name: 'Ranking Phase11' });
    activeCareerAdapter.setActiveCareer(career);
    const id = `${career.career_id}-player`;
    await activeCareerAdapter.createPlayerProfile({
      id, sport_name: 'Jogador Teste', career_date: '2026-01-05', birth_date: '2000-01-01',
      energy: 100, fatigue: 0, coins: 1000, xp: 0, matches_played: 12, tournaments_played: 2,
      rank_points: 500, race_points: 120, country: 'Brasil',
      serve: 60, forehand: 60, backhand: 60, volley: 60, bandeja: 60, smash: 60, defense: 60, agility: 60, strategy: 60, emotional_control: 60,
      ...playerOverrides,
    });
    const profile = await localGame.entities.PlayerProfile.get(id);
    return { career, careerId: career.career_id, profile };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 1 — Header/Home/Season/Ranking usam a MESMA fonte canônica.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 1: fonte única (import estático) ---');
  const consumers = [
    ['src/components/AppLayout.jsx', 'Header'],
    ['src/pages/CareerHub.jsx', 'Home'],
    ['src/pages/Season.jsx', 'Season'],
    ['src/components/home/SeasonPanel.jsx', 'SeasonPanel (Home)'],
    ['src/pages/Ranking.jsx', 'Ranking (Circuito/Jogadores/Race)'],
  ];
  for (const [file, label] of consumers) {
    const source = fs.readFileSync(file, 'utf8');
    const usesCanonical = /getWorldRank|buildWorldRankingSnapshot/.test(source) && /from ['"]@\/lib\/padel['"]/.test(source);
    gate(`${label} (${file}) importa a fonte canônica de @/lib/padel`, usesCanonical);
  }
  const rankingSource = fs.readFileSync('src/pages/Ranking.jsx', 'utf8');
  gate('Ranking.jsx não reimplementa merge de TeamRanking dentro do array individual', !/teamAthleteMap|source_team/.test(rankingSource));

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 2 — Consistência numérica: getWorldRank e buildWorldRankingSnapshot
  // concordam, população não inclui pseudo-atletas de dupla.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 2: consistência entre consumidores ---');
  const { careerId, profile } = await freshCareerWithPlayer();
  // A criação de carreira já semeia um punhado de AthleteProfile padrão
  // (bots iniciais) — a asserção de população usa essa contagem como
  // baseline em vez de um número fixo, para não depender de quantos bots o
  // onboarding decide semear.
  const baselineSnapshot = await buildWorldRankingSnapshot(await localGame.entities.PlayerProfile.get(profile.id));
  const baselineTotal = baselineSnapshot.total;
  const athletes = Array.from({ length: 24 }, (_, index) => ({
    id: `athlete-${index}`,
    name: `Atleta ${index}`,
    world_ranking_points: 1000 - index * 30,
    overall_rating: 70 + (index % 5),
    career_phase: 'Ascensão',
    country: index % 2 === 0 ? 'Brasil' : 'Espanha',
  }));
  await localGame.entities.AthleteProfile.bulkCreate(athletes);
  // Dupla cujos dois membros são atletas já listados acima — não pode virar
  // uma TERCEIRA entrada pseudo-atleta no ranking individual.
  await localGame.entities.TeamRanking.create({
    team_key: 'athlete-0_athlete-1', player1_id: 'athlete-0', player1_name: 'Atleta 0',
    player2_id: 'athlete-1', player2_name: 'Atleta 1', ranking_points: 5000, matches_played: 10, wins: 8, losses: 2, titles: [],
  });

  const freshProfile = await localGame.entities.PlayerProfile.get(profile.id);
  const rankResult = await getWorldRank(freshProfile);
  const snapshot = await buildWorldRankingSnapshot(freshProfile);
  gate('getWorldRank e buildWorldRankingSnapshot concordam na posição do jogador', rankResult.rank === snapshot.playerRank);
  gate('getWorldRank e buildWorldRankingSnapshot concordam no total', rankResult.total === snapshot.total);
  gate('população cresceu exatamente pelos 24 atletas adicionados (nenhum pseudo-atleta de dupla extra)', snapshot.total === baselineTotal + 24);
  gate('nenhuma entrada do ranking individual veio de TeamRanking', snapshot.entries.every((entry) => !entry.raw?.source_team && !entry.raw?.team_key));

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 3 — Ranking de dupla continua funcionando e separado.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 3: ranking de dupla não foi quebrado ---');
  await activeCareerAdapter.updatePlayerProfile(freshProfile.id, { partner_id: 'athlete-2' });
  const withPartner = await localGame.entities.PlayerProfile.get(freshProfile.id);
  await localGame.entities.TeamRanking.create({
    team_key: [withPartner.id, 'athlete-2'].sort().join('_'), player1_id: withPartner.id, player1_name: withPartner.sport_name,
    player2_id: 'athlete-2', player2_name: 'Atleta 2', ranking_points: 300, matches_played: 4, wins: 3, losses: 1, titles: [],
  });
  const teamRank = await getTeamRank(withPartner, { id: 'athlete-2' });
  gate('getTeamRank continua funcionando de forma independente do ranking individual', teamRank.points === 300 && teamRank.unranked === false);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 4 — Desempate determinístico (pontos -> Overall -> id).
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 4: desempate determinístico ---');
  const { profile: tieProfile } = await freshCareerWithPlayer({ rank_points: 800 });
  const tiedAthletes = [
    { id: 'tie-z', name: 'Zeta', world_ranking_points: 800, overall_rating: 75, career_phase: 'Ascensão' },
    { id: 'tie-a', name: 'Alfa', world_ranking_points: 800, overall_rating: 75, career_phase: 'Ascensão' },
    { id: 'tie-m', name: 'Meio', world_ranking_points: 800, overall_rating: 90, career_phase: 'Ascensão' },
  ];
  await localGame.entities.AthleteProfile.bulkCreate(tiedAthletes);
  const freshTieProfile = await localGame.entities.PlayerProfile.get(tieProfile.id);
  const runs = [];
  for (let i = 0; i < 5; i += 1) {
    const snap = await buildWorldRankingSnapshot(freshTieProfile);
    runs.push(snap.entries.slice(0, 4).map((e) => e.id).join(','));
  }
  gate('a mesma lista produz sempre a mesma ordem em execuções repetidas', new Set(runs).size === 1);
  const tieSnapshot = await buildWorldRankingSnapshot(freshTieProfile);
  const topFour = tieSnapshot.entries.slice(0, 4);
  gate('maior Overall desempata pontos iguais (tie-m antes de tie-a/tie-z)', topFour[0].id === 'tie-m');
  gate('id ordena alfabeticamente quando pontos E overall empatam (tie-a antes de tie-z)', topFour.findIndex((e) => e.id === 'tie-a') < topFour.findIndex((e) => e.id === 'tie-z'));
  gate('nenhuma posição repetida (ranking sequencial, sem "empate compartilhado")', new Set(tieSnapshot.entries.map((e) => e.rank)).size === tieSnapshot.entries.length);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 5 — Save/load: a posição sobrevive a um reload real.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 5: save/load mantém a posição ---');
  // Cenário isolado (carreira própria): cenários anteriores trocaram a
  // carreira ativa em memória (freshCareerWithPlayer chama setActiveCareer),
  // então reativar explicitamente antes de medir evita contaminação entre
  // carreiras do harness — não é um risco do produto, é higiene do teste.
  activeCareerAdapter.setActiveCareer(await careerManager.readCareer(careerId));
  const preReloadProfile = await localGame.entities.PlayerProfile.get(profile.id);
  const beforeReload = await buildWorldRankingSnapshot(preReloadProfile);
  const reloadedCareer = await careerManager.readCareer(careerId);
  activeCareerAdapter.setActiveCareer(reloadedCareer);
  const reloadedProfile = await localGame.entities.PlayerProfile.get(profile.id);
  const afterReload = await buildWorldRankingSnapshot(reloadedProfile);
  gate('posição do jogador é a mesma antes e depois do reload', beforeReload.playerRank === afterReload.playerRank);
  gate('total de entradas é o mesmo antes e depois do reload', beforeReload.total === afterReload.total);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 6 — Compatibilidade com saves antigos (aliases de campo).
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 6: aliases de campos legados ---');
  const { profile: legacyProfile } = await freshCareerWithPlayer({ rank_points: undefined, ranking_points: 640 });
  const legacySnapshot = await buildWorldRankingSnapshot(await localGame.entities.PlayerProfile.get(legacyProfile.id));
  gate('perfil sem rank_points usa o alias ranking_points sem quebrar', legacySnapshot.playerPoints === 640);
  await localGame.entities.AthleteProfile.create({ id: 'legacy-athlete', name: 'Legado', ranking_points: 300, career_phase: 'Ascensão' });
  const legacySnapshot2 = await buildWorldRankingSnapshot(await localGame.entities.PlayerProfile.get(legacyProfile.id));
  gate('atleta sem world_ranking_points usa o alias ranking_points sem quebrar', legacySnapshot2.entries.some((e) => e.id === 'legacy-athlete' && e.points === 300));

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 7 — Performance com população grande (~1000 atletas).
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 7: performance com ~1000 atletas ---');
  const { profile: perfProfile } = await freshCareerWithPlayer();
  const perfBaseline = (await buildWorldRankingSnapshot(await localGame.entities.PlayerProfile.get(perfProfile.id))).total;
  const bigBatch = Array.from({ length: 1000 }, (_, index) => ({
    id: `perf-athlete-${index}`, name: `Perf Atleta ${index}`,
    world_ranking_points: Math.round(Math.random() * 5000), overall_rating: 50 + Math.round(Math.random() * 49),
    career_phase: 'Ascensão',
  }));
  await localGame.entities.AthleteProfile.bulkCreate(bigBatch);
  const started = Date.now();
  const perfSnapshot = await buildWorldRankingSnapshot(await localGame.entities.PlayerProfile.get(perfProfile.id));
  const elapsed = Date.now() - started;
  console.log(`buildWorldRankingSnapshot com ${perfSnapshot.total} entradas: ${elapsed}ms`);
  gate('ranking com ~1000 atletas calcula em menos de 1500ms', elapsed < 1500);
  gate('todas as 1000 novas entradas presentes, além da baseline', perfSnapshot.total === perfBaseline + 1000);
} finally {
  await server.close();
}

console.log(`\ntest:ranking-consistency OK — ${gates} gates (fonte única, desempate determinístico, save/load, dupla separada, legado, performance).`);
