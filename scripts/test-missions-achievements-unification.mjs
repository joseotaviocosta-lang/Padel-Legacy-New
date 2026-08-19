// Tutorial 4.0 — unificação de Missões e Conquistas
// (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md, Parte 16).
//
// Prova as garantias centrais da Parte 7-13: (1) daily/weekly/monthly/
// seasonal removidos como sistema (código morto, nenhuma UI referencia);
// (2) os 3 objetivos de longo prazo que duplicavam conquistas (season-wins,
// season-tour, season-titles) têm equivalente real no catálogo — nada foi
// perdido, só parou de aparecer duas vezes; (3) migração de saves antigos é
// idempotente e não-destrutiva: linhas periódicas persistidas são arquivadas
// (is_active:false), nunca deletadas, e MissionProgress/recompensas já
// concedidas permanecem intocadas (nenhum re-grant, nenhuma revogação); (4)
// a página única (Missions.jsx) tem só duas abas — Tutorial e Conquistas —
// e a antiga rota /achievements agora redireciona para lá.
import { readFileSync, existsSync } from 'node:fs';
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
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); },
    async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; },
    async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  // ═══════════════════════════════════════════════════════════════════════
  // 1) Sistemas removidos: código morto de fato removido, não só escondido
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- 1) Daily/weekly/monthly/seasonal removidos como sistema ---');
  gate('src/missions/periodicMissionCatalog.js foi deletado (não existe mais)', !existsSync('src/missions/periodicMissionCatalog.js'));

  const missionsSource = readFileSync('src/pages/Missions.jsx', 'utf8');
  gate('Missions.jsx não referencia mais periodicMissionCatalog.js', !missionsSource.includes('periodicMissionCatalog'));
  gate('Missions.jsx não define mais EXTRA_MISSIONS (removido, não só vazio)', !/const EXTRA_MISSIONS\s*=/.test(missionsSource));
  gate('Missions.jsx: TABS tem exatamente 2 entradas (tutorial, conquistas)', /const TABS = \[\s*\{ key: 'tutorial'.*?\},\s*\{ key: 'conquistas'.*?\},\s*\];/s.test(missionsSource));
  gate('Missions.jsx não tem mais abas diaria/semanal/mensal/sazonal em TABS', !/key: '(diaria|semanal|mensal|sazonal)'/.test(missionsSource));

  const padelSource = readFileSync('src/lib/padel.js', 'utf8');
  gate('padel.js não importa mais PERIODIC_MISSIONS (só resta o comentário histórico da Parte 7)', !/import\s*\{[^}]*PERIODIC_MISSIONS/.test(padelSource));
  gate('ensureTutorialMissionCatalog: fullCatalog é só TUTORIAL_MISSIONS (sem concat periódico)', /const fullCatalog = TUTORIAL_MISSIONS;/.test(padelSource));

  // ═══════════════════════════════════════════════════════════════════════
  // 2) Nenhum objetivo de longo prazo duplicado: os 3 casos "B" da auditoria
  //    (season-wins/season-tour/season-titles) têm conquista equivalente
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- 2) Objetivos de longo prazo: sem duplicidade, equivalentes preservados ---');
  const { ACHIEVEMENT_CATALOG } = await server.ssrLoadModule('/src/lib/achievementsData.js');
  gate('Catálogo de conquistas carrega e não está vazio', Array.isArray(ACHIEVEMENT_CATALOG) && ACHIEVEMENT_CATALOG.length > 50);
  gate('Todo achievement tem id único (nenhuma duplicidade de identidade no catálogo)',
    new Set(ACHIEVEMENT_CATALOG.map(a => a.id)).size === ACHIEVEMENT_CATALOG.length);

  const hasEquivalent = (triggerType, threshold) => ACHIEVEMENT_CATALOG.some(a => a.trigger_type === triggerType && a.threshold === threshold);
  gate('season-wins (vença 25 partidas) tem equivalente: "Vencedor Iniciante" win_match≥25', hasEquivalent('win_match', 25));
  gate('season-tour (participe de 12 torneios) tem equivalente na escada join_tournament (10)', hasEquivalent('join_tournament', 10));
  gate('season-titles (vença 3 torneios) tem equivalente: "Tricampeão" win_tournament≥3', hasEquivalent('win_tournament', 3));

  // ═══════════════════════════════════════════════════════════════════════
  // 3) Migração de saves antigos: idempotente, não-destrutiva
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- 3) Save antigo com missões periódicas: arquiva sem destruir ---');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureTutorialMissionCatalog } = await server.ssrLoadModule('/src/lib/padel.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-missions-unification', name: 'QA Old Save' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  const profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-old-save-player', sport_name: 'Veterano', career_date: '2026-01-01', coins: 900, xp: 1200,
  });

  // Save antigo: 4 linhas de Mission periódicas ainda ativas (shape pré-4.0),
  // uma delas com um MissionProgress já reivindicado (recompensa histórica).
  const oldMissions = await localGame.entities.Mission.bulkCreate([
    { id: 'old-daily-training', mission_type: 'diaria', objective_type: 'complete_training', title: 'Treine 3 vezes esta semana', target_count: 3, xp_reward: 30, coins_reward: 50, is_active: true },
    { id: 'old-weekly-win', mission_type: 'semanal', objective_type: 'win_matches', title: 'Vença 3 partidas na semana', target_count: 3, xp_reward: 60, coins_reward: 100, is_active: true },
    { id: 'old-season-wins', mission_type: 'sazonal', objective_type: 'win_matches', title: 'Vença 25 partidas na temporada', target_count: 25, xp_reward: 400, coins_reward: 800, is_active: true },
    { id: 'old-monthly-tour', mission_type: 'mensal', objective_type: 'join_tournament', title: 'Participe de torneios no mês', target_count: 2, xp_reward: 80, coins_reward: 150, is_active: true },
  ]);
  const claimedProgress = await localGame.entities.MissionProgress.create({
    id: 'old-progress-claimed', profile_id: profile.id, mission_id: 'old-daily-training',
    current_count: 3, claimed: true, reward_delivered: true, period_key: '2025-52',
  });

  const beforeCoins = profile.coins;
  const beforeXp = profile.xp;

  await ensureTutorialMissionCatalog();
  await ensureTutorialMissionCatalog(); // idempotência: rodar 2x não deve mudar nada a mais

  const allMissionsAfterMigration = await localGame.entities.Mission.list('-created_date', 500);
  const archivedMissions = allMissionsAfterMigration.filter(m => oldMissions.some(o => o.id === m.id));
  gate('As 4 linhas antigas de Mission periódica continuam existindo (arquivadas, não deletadas)', archivedMissions.length === 4);
  gate('Todas as 4 foram desativadas (is_active:false)', archivedMissions.every(m => m.is_active === false));
  gate('Todas as 4 carregam o motivo de arquivamento (retired_reason)', archivedMissions.every(m => m.retired_reason === 'periodic_missions_removed_v40'));

  const activePeriodic = await localGame.entities.Mission.filter({ is_active: true }).then(rows => rows.filter(m => ['diaria', 'semanal', 'mensal', 'sazonal'].includes(m.mission_type)));
  gate('Nenhuma missão periódica permanece ativa após a migração', activePeriodic.length === 0);

  const reloadedProgress = await localGame.entities.MissionProgress.filter({ id: 'old-progress-claimed' }).then(rows => rows[0]);
  gate('MissionProgress já reivindicado continua intocado (claimed permanece true)', reloadedProgress?.claimed === true);
  gate('MissionProgress já reivindicado continua com a recompensa histórica marcada (reward_delivered)', reloadedProgress?.reward_delivered === true);
  gate('MissionProgress já reivindicado mantém a contagem original (nada foi resetado)', reloadedProgress?.current_count === 3);

  const reloadedProfile = await localGame.entities.PlayerProfile.filter({ id: profile.id }).then(rows => rows[0]);
  gate('Migração NÃO concede novamente a recompensa (coins do jogador inalterado)', reloadedProfile.coins === beforeCoins);
  gate('Migração NÃO concede novamente a recompensa (xp do jogador inalterado)', reloadedProfile.xp === beforeXp);

  // ═══════════════════════════════════════════════════════════════════════
  // 4) Página única: 2 abas, Conquistas absorvida, /achievements redireciona
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- 4) Página única "Objetivos": duas abas, conquistas absorvidas ---');
  gate('Missions.jsx importa AchievementsPanel (aba Conquistas)', missionsSource.includes("import AchievementsPanel from '@/components/achievements/AchievementsPanel.jsx';"));
  gate('Missions.jsx renderiza AchievementsPanel quando tab === "conquistas"', /tab === 'conquistas'[\s\S]{0,60}<AchievementsPanel profile=\{profile\} \/>/.test(missionsSource));
  gate('Missions.jsx importa summarizeAchievements (resumo "Conquistas X/Y" no cabeçalho)', missionsSource.includes("import { summarizeAchievements } from '@/lib/achievementEngine.js';"));
  gate('src/pages/Achievements.jsx foi removido (conteúdo absorvido no painel único)', !existsSync('src/pages/Achievements.jsx'));

  const appSource = readFileSync('src/App.jsx', 'utf8');
  gate('/achievements agora redireciona para a página unificada (não 404, não duplica rota)', /path="\/achievements"[\s\S]{0,80}Navigate to="\/game\/missions\?tab=achievements"/.test(appSource));

  const navSource = readFileSync('src/navigation/navigationConfig.js', 'utf8');
  gate('Navegação não tem mais uma entrada separada "Conquistas" apontando para /achievements', !/to: '\/achievements'/.test(navSource));
  gate('Navegação renomeou a entrada de missões para "Objetivos"', /to: '\/game\/missions'.*label: 'Objetivos'/.test(navSource));

  const localSeedSource = readFileSync('src/local/localSeed.js', 'utf8');
  gate('localSeed.js semeia Achievement a partir do catálogo real (ACHIEVEMENT_CATALOG), não do array de 4 itens mal-formado antigo', localSeedSource.includes('const achievements = ACHIEVEMENT_CATALOG;'));

  console.log(`\n${gates} gates executados, todos PASS — Unificação de Missões e Conquistas (sistemas periódicos removidos, sem duplicidade de objetivos, saves antigos migram sem perder nem re-conceder recompensa, página única com 2 abas).`);
} finally {
  await server.close();
}
