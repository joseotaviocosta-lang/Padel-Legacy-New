// Bug real (QA): "Ranking Race com pontos indevidos no início da carreira".
//
// Ao criar uma carreira em 01/01/2026, a aba Race (temporada ATUAL) já
// mostrava pontuação (Arturo Coello 9.000, Agustín Tapia 8.650 etc.) e o chip
// do cabeçalho da Ranking exibia "Arturo Coello · 9000pts race" — no dia 1
// ninguém pontuou ainda, só o Circuito (histórico acumulado) deveria ter
// pontos.
//
// Causa raiz confirmada em DOIS lugares:
//  1) src/data/worldSeed2025.json hardcodava race_points > 0 para os
//     atletas/duplas "elite" (ex.: Arturo Coello: race_points 9000) — fonte
//     literal do valor visto no bug report.
//  2) src/lib/rankingPopulation.js (buildSupplementalRankingPopulation)
//     gerava race_points como uma FRAÇÃO de ranking_points para toda a
//     população suplementar (atletas e duplas).
//
// Correção: race_points nasce sempre 0 nas duas fontes — ranking_points/
// world_ranking_points (Circuito) continuam com o histórico normalmente.
// race_points só cresce quando um torneio REAL é disputado (jogador em
// tournamentLifecycle.js, bots em WorldTourLifecycle.js — ambos reaproveitam
// o mesmo ganho de pontos já calculado para o Circuito, nunca uma fórmula
// paralela) e é zerado sozinho na virada do ano civil
// (resetRaceSeasonPoints, annualCareerReportLifecycle.js), sem tocar no
// Circuito.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import worldSeed from '../src/data/worldSeed2025.json' with { type: 'json' };

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
  console.log(`PASS — ${label}`);
}

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async ensureDirectory(p) { this.directories.add(p); return true; }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { return this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); return d; }
  async copy(s, d) { this.files.set(d, this.files.get(s)); return d; }
  async list(dir = '.') { return [...this.files.keys()]; }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { buildSupplementalRankingPopulation } = await vite.ssrLoadModule('/src/lib/rankingPopulation.js');
  const { finalizeTournamentRun } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
  const { resetRaceSeasonPoints } = await vite.ssrLoadModule('/src/game-core/annualCareerReportLifecycle.js');

  async function freshCareer(id, extraPlayerFields = {}) {
    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    const { career } = await manager.createCareer({ playerName: id });
    activeCareerAdapter.setActiveCareer(career);
    await activeCareerAdapter.createPlayerProfile({
      id: `${id}-player`, sport_name: id, career_date: '2026-01-02', birth_date: '2001-01-01',
      level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
      tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
      energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
      ...extraPlayerFields,
    });
    return localGame.entities.PlayerProfile.get(`${id}-player`);
  }

  // ═══════════════ (a) Carreira nova → soma de racePoints == 0 ═══════════════
  {
    // (a-1) O jogador em si: nenhum campo de criação de carreira seta
    // race_points — deve ler como 0 via o mesmo fallback usado em produção
    // (padel.js: Math.max(0, Number(profile.race_points) || 0)).
    const profile = await freshCareer('p3-fresh');
    gate('(a-1) PlayerProfile recém-criado tem race_points == 0 (sem valor herdado do Circuito)', (Number(profile.race_points) || 0) === 0);

    // (a-2) A fonte estática (worldSeed2025.json): todo atleta/dupla "elite"
    // nasce com race_points 0 — só ranking/world_ranking_points guardam o
    // histórico acumulado (Circuito).
    gate('(a-2) worldSeed2025.json: todos os athletes têm race_points == 0', worldSeed.athletes.every((a) => a.race_points === 0));
    gate('(a-2) worldSeed2025.json: todas as teams têm race_points == 0', worldSeed.teams.every((t) => t.race_points === 0));
    gate('(a-2) worldSeed2025.json preserva o histórico do Circuito (ranking_points/world_ranking_points > 0)', worldSeed.athletes.every((a) => a.world_ranking_points > 0) && worldSeed.teams.every((t) => t.ranking_points > 0));

    // (a-3) A população suplementar procedural (buildSupplementalRankingPopulation):
    // mesma garantia, para o resto do universo competitivo (fora da elite nomeada).
    const supplemental = buildSupplementalRankingPopulation([{ bot_id: 'x', name: 'Seed Athlete', world_ranking_points: 5000, ranking_points: 5000 }], []);
    gate('(a-3) Atletas procedurais gerados têm race_points == 0 (não é mais fração de ranking_points)', supplemental.athletes.length > 0 && supplemental.athletes.every((a) => a.race_points === 0));
    gate('(a-3) Atletas procedurais preservam ranking_points/world_ranking_points > 0 (Circuito intacto)', supplemental.athletes.every((a) => a.ranking_points > 0 && a.world_ranking_points > 0));
    const supplementalTeams = buildSupplementalRankingPopulation(supplemental.athletes, []);
    gate('(a-3) Duplas procedurais geradas têm race_points == 0', supplementalTeams.teams.length > 0 && supplementalTeams.teams.every((t) => t.race_points === 0));
    gate('(a-3) Duplas procedurais preservam ranking_points > 0 (Circuito intacto)', supplementalTeams.teams.every((t) => t.ranking_points > 0));
  }

  // ═══════════════ (b) Simular um torneio → racePoints do participante > 0 e Circuito atualizado ═══════════════
  {
    const profile = await freshCareer('p3-tournament', { race_points: 0, rank_points: 1000 });
    gate('(b) Pré-condição: race_points começa em 0', (Number(profile.race_points) || 0) === 0);
    gate('(b) Pré-condição: rank_points (Circuito) começa em 1000', Number(profile.rank_points) === 1000);

    const partner = await localGame.entities.AthleteProfile.create({ id: 'p3-tournament-partner', bot_id: 'p3-tournament-partner', name: 'Parceiro Teste', world_ranking_points: 4000, ranking_points: 4000, race_points: 0 });
    const tournament = await localGame.entities.Tournament.create({ id: 'p3-tournament-cup', name: 'Copa Teste', tier: 'Silver', start_date: '2026-02-10', status: 'em_andamento' });

    const result = await finalizeTournamentRun({ profile, tournament, partner, roundsWon: 2, totalRounds: 3 });
    gate('(b) finalizeTournamentRun concede rankPoints > 0 (pré-condição do teste)', result.rewards.rankPoints > 0);
    gate('(b) race_points do jogador fica > 0 após o torneio real', (Number(result.updatedProfile.race_points) || 0) > 0);
    gate('(b) race_points cresceu exatamente o mesmo ganho do Circuito (mesma fonte de pontos, dois contadores separados)', Number(result.updatedProfile.race_points) === result.rewards.rankPoints);
    gate('(b) Circuito (rank_points) também foi atualizado, e não foi resetado por causa do Race', Number(result.updatedProfile.rank_points) === 1000 + result.rewards.rankPoints);

    const persisted = await localGame.entities.PlayerProfile.get(profile.id);
    gate('(b) O ganho de race_points foi PERSISTIDO (não é só um valor em memória)', Number(persisted.race_points) === result.rewards.rankPoints);
    gate('(b) O ganho de rank_points (Circuito) foi PERSISTIDO', Number(persisted.rank_points) === 1000 + result.rewards.rankPoints);
  }

  // ═══════════════ (b-bots) Auditoria estática: bots do World Tour também acumulam Race a partir do mesmo ganho já calculado para o Circuito ═══════════════
  {
    const src = read('src/gameplay/worldTour/WorldTourLifecycle.js');
    gate('WorldTourLifecycle reaproveita o ganho já calculado (athletePoints) para crescer race_points, em vez de uma fórmula nova', src.includes('const racePoints = Math.max(0, Number(athlete.race_points) || 0) + athletePoints.get(athlete.id);'));
    gate('WorldTourLifecycle grava race_points junto com ranking_points/world_ranking_points no mesmo bulkUpdate (nenhum sistema paralelo)', src.includes('race_points: racePoints,'));
  }

  // ═══════════════ (c) Virada do ano civil → Race zera, Circuito preserva ═══════════════
  {
    const profile = await freshCareer('p3-turnover', { race_points: 6500, rank_points: 9200 });
    const athleteA = await localGame.entities.AthleteProfile.create({ id: 'p3-turnover-a', bot_id: 'p3-turnover-a', name: 'Atleta Turnover A', world_ranking_points: 11000, ranking_points: 11000, race_points: 4200 });
    const athleteB = await localGame.entities.AthleteProfile.create({ id: 'p3-turnover-b', bot_id: 'p3-turnover-b', name: 'Atleta Turnover B', world_ranking_points: 7000, ranking_points: 7000, race_points: 0 });

    const previousProfile = { id: profile.id, career_date: '2026-12-30' };
    const currentProfile = { id: profile.id, career_date: '2027-01-02', race_points: profile.race_points, rank_points: profile.rank_points };
    const { profile: afterReset, athletesReset, reset } = await resetRaceSeasonPoints(previousProfile, currentProfile);

    gate('(c) resetRaceSeasonPoints detecta a virada de ano e executa (reset === true)', reset === true);
    gate('(c) Pelo menos os 2 atletas de teste com race_points > 0 foram resetados', athletesReset >= 1);
    gate('(c) race_points do jogador volta a 0 após a virada do ano', Number(afterReset.race_points) === 0);

    const persistedProfile = await localGame.entities.PlayerProfile.get(profile.id);
    gate('(c) O reset do jogador foi PERSISTIDO', Number(persistedProfile.race_points) === 0);
    gate('(c) O Circuito do jogador (rank_points) NÃO foi tocado pela virada de ano', Number(persistedProfile.rank_points) === 9200);

    const persistedA = await localGame.entities.AthleteProfile.get('p3-turnover-a');
    const persistedB = await localGame.entities.AthleteProfile.get('p3-turnover-b');
    gate('(c) race_points do atleta A (tinha 4200) volta a 0', Number(persistedA.race_points) === 0);
    gate('(c) race_points do atleta B (já era 0) continua 0', Number(persistedB.race_points) === 0);
    gate('(c) Circuito do atleta A (ranking_points/world_ranking_points) NÃO foi tocado', Number(persistedA.ranking_points) === 11000 && Number(persistedA.world_ranking_points) === 11000);
    gate('(c) Circuito do atleta B (ranking_points/world_ranking_points) NÃO foi tocado', Number(persistedB.ranking_points) === 7000 && Number(persistedB.world_ranking_points) === 7000);

    // (c-2) Sem virada de ano (mesmo ano civil), nada é tocado — a guarda é a
    // MESMA já usada por finalizeClosedCareerYear (didCareerYearChange).
    const sameYearPrevious = { id: profile.id, career_date: '2027-01-02' };
    const sameYearCurrent = { id: profile.id, career_date: '2027-06-15', race_points: 0 };
    const noop = await resetRaceSeasonPoints(sameYearPrevious, sameYearCurrent);
    gate('(c-2) Sem virada de ano civil, resetRaceSeasonPoints não faz nada (reset === false)', noop.reset === false);
  }

  console.log(`\n${gates} gates executados, todos PASS — Ranking Race Season (pontos indevidos no início da carreira).`);
} finally {
  await vite.close();
}
