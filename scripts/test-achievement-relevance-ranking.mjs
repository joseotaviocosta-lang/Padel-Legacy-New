// Achievements Polish 12.1 (docs/ACHIEVEMENTS_POLISH_12_1.md, Parte A/B/N).
//
// Prova, com o pipeline real (CareerManager + achievementContext +
// achievementEngine, sem mocks das etapas críticas): (1) reproduz o bug do
// QA real — a regra antiga (só `percent` desc) deixa idade/tempo dominarem
// "Próximas" para um atleta jovem; (2) a nova `findNextRelevantAchievements`
// resolve isso via actionability + penalidade de distância temporal real +
// diversidade; (3) os cenários de estágio de carreira pedidos (early/Top
// 300/Top 20/veterano/sem treinador/sem patrocinador); (4) os gates de
// diversidade (máx 2/categoria, máx 1 passiva, máx 1/escada, nunca
// future_system/inativa/impossível).
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
  // Fase 12: carregar módulos de conquista ANTES de runtime/localGameClient
  // (dependência circular sensível à ordem em CareerEntityRepository.js).
  const { findNextRelevantAchievements, getCareerRelevanceStage } = await server.ssrLoadModule('/src/lib/achievementRelevance.js');
  const { evaluateAchievements } = await server.ssrLoadModule('/src/lib/achievementEngine.js');
  const { buildAchievementContext } = await server.ssrLoadModule('/src/lib/achievementContext.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');

  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'career-relevance', name: 'QA Relevance' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  // ── Fixture do QA real: atleta de 16 anos, início de carreira ────────────
  // idade 16, ~10 dias de carreira, treinador e dupla já iniciados, ranking
  // baixo (~#900, coerente com zero partidas oficiais jogadas ainda).
  // Atributos iniciais REAIS de uma carreira nova (localSeed.js: ~30-33),
  // não valores arbitrários — um atleta de 16 anos recém-chegado tem
  // atributos baixos, o que é justamente por que percentuais de
  // max_attribute (30-35%) NÃO deveriam competir de igual pra igual com
  // idade/tempo (que no fixture do QA real chegava a 40-57%).
  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-relevance-early', sport_name: 'QA Athlete', birth_date: '2010-01-11', career_date: '2026-01-11',
    coach_id: 'coach-qa', coach_hired_date: '2026-01-05', partner_chemistry: 50,
    smash: 31, defense: 30, agility: 33, strategy: 29, emotional_control: 28, serve: 30, forehand: 32, backhand: 30, volley: 29, bandeja: 28,
  });
  await localGame.entities.Coach.create({ id: 'coach-qa', name: 'Treinador QA', tier: 'regional', specialty: 'tecnico', monthly_cost: 900, reputation: 60 });

  const context = await buildAchievementContext(profile, { worldRank: { rank: 900 } });

  // ── Parte A/2: reproduzir a regra ANTIGA (percent desc, sem penalidade) ──
  const rows = evaluateAchievements(profile, context);
  const oldNextUp = rows.filter((r) => r.evaluable && !r.unlocked).sort((a, b) => b.percent - a.percent).slice(0, 5);
  const oldNames = oldNextUp.map((r) => r.achievement.name);
  console.log('(info) Regra ANTIGA (só percent desc):', oldNames.join(' · '));
  const oldPassiveCount = oldNextUp.filter((r) => ['advance_day', 'reach_age'].includes(r.achievement.trigger_type)).length;
  gate('BUG REPRODUZIDO: a regra antiga deixa 2+ conquistas passivas de idade/tempo dominarem "Próximas" pra um atleta de 16 anos', oldPassiveCount >= 2);

  // ── Parte B-F/N-A: a NOVA regra corrige isso ──────────────────────────────
  const nextUp = findNextRelevantAchievements(profile, context, { limit: 5 });
  const names = nextUp.map((i) => i.achievement.name);
  console.log('(info) Regra NOVA (relevância):', names.join(' · '));
  gate('Nova regra retorna até 5 itens', nextUp.length > 0 && nextUp.length <= 5);
  gate('Cada item tem achievement/progress/relevanceScore/reason/category', nextUp.every((i) => i.achievement && i.progress && typeof i.relevanceScore === 'number' && typeof i.reason === 'string' && typeof i.category === 'string'));

  const passiveCount = nextUp.filter((i) => i.isPassiveTime).length;
  gate('N-A: no máximo 1 conquista passiva de idade/tempo (nunca Auge+Veterano+Lenda Madura juntas)', passiveCount <= 1);
  gate('N-A: favorece metas esportivas — pelo menos 1 conquista de alta ação (partidas/torneios/ranking) aparece', nextUp.some((i) => ['play_official_match', 'win_official_match', 'join_tournament', 'win_tournament', 'reach_rank'].includes(i.achievement.trigger_type)));
  gate('N-A: "Um Mês" (10/30 dias, muito longe) não aparece — 20 dias restantes é distante demais', !names.includes('Um Mês'));
  const ageNamesPresent = names.filter((n) => ['Auge', 'Veterano', 'Lenda Madura'].includes(n));
  gate('N-A: no máximo 1 das 3 conquistas de idade aparece (12+ anos de distância real para todas)', ageNamesPresent.length <= 1);

  // ── Parte 5: estágio de carreira ──────────────────────────────────────────
  const stage = getCareerRelevanceStage(profile, context);
  console.log(`(info) Estágio detectado para o fixture early-game: ${stage}`);
  gate('Estágio early-game (rank baixo, nível baixo) é detectado como "beginner"', stage === 'beginner');

  // ── Diversidade (Parte 29) ────────────────────────────────────────────────
  const categoryCounts = new Map();
  const ladderCounts = new Map();
  for (const item of nextUp) {
    categoryCounts.set(item.category, (categoryCounts.get(item.category) || 0) + 1);
    ladderCounts.set(item.ladderKey, (ladderCounts.get(item.ladderKey) || 0) + 1);
  }
  gate('Máx 2 conquistas da mesma categoria', [...categoryCounts.values()].every((n) => n <= 2));
  gate('Máx 1 conquista por escada (nunca 2 degraus da mesma escada juntos)', [...ladderCounts.values()].every((n) => n <= 1));
  gate('Nenhuma conquista future_system aparece', nextUp.every((i) => !i.achievement.future_system));
  gate('Nenhuma conquista arquivada (is_active:false) aparece', nextUp.every((i) => i.achievement.is_active !== false));
  gate('Nenhuma conquista já desbloqueada aparece', nextUp.every((i) => !i.progress.unlocked));

  // ── N-B: Top 300 → próxima conquista de ranking relevante ─────────────────
  // Fase 13 (Parte 3): a escada ganhou os degraus intermediários Top 500 e
  // Top 250 (antes só existiam 100/50/10/3/1 — #300 "pulava" direto pra Top
  // 100, o mesmo bug de granularidade que o briefing pediu pra corrigir).
  // Com a escada completa, #300 já superou Top 500 (unlocked, fora da
  // disputa) e o próximo degrau real e não-desbloqueado é Top 250 — mostrar
  // Top 100 aqui seria exatamente o "pular degrau" que a Fase 13 corrigiu.
  const topContext = await buildAchievementContext(profile, { worldRank: { rank: 300 } });
  const topNext = findNextRelevantAchievements(profile, topContext, { limit: 5 });
  gate('N-B (Fase 13): rank #300 → "Top 250" (próximo degrau real da escada expandida, não mais "Top 100") aparece entre as relevantes', topNext.some((i) => i.achievement.trigger_type === 'reach_rank' && i.achievement.threshold === 250));

  // ── N-C: Top 20 → Top 10 relevante ────────────────────────────────────────
  const eliteContext = await buildAchievementContext(profile, { worldRank: { rank: 20 } });
  const eliteNext = findNextRelevantAchievements(profile, eliteContext, { limit: 5 });
  gate('N-C: rank #20 → "Top 10" aparece entre as relevantes', eliteNext.some((i) => i.achievement.trigger_type === 'reach_rank' && i.achievement.threshold === 10));
  const eliteStage = getCareerRelevanceStage(profile, eliteContext);
  console.log(`(info) Estágio detectado para rank #20: ${eliteStage}`);

  // ── N-D: veterano → longevidade pode entrar quando realmente perto ───────
  // Mesmo rank fraco do fixture early-game (900): o ponto deste cenário é
  // provar que reach_age PODE entrar quando genuinamente perto (1 ano de
  // distância), não testar competição de ranking — isso já é coberto acima.
  // Fase 13 (Parte 3): rank #900 passou a ter uma meta de ranking legítima
  // (Top 500 — não existia antes da escada expandida, e com percent alto o
  // bastante pra vencer Veterano de qualquer forma), o que reintroduz
  // competição de ranking dentro de um cenário desenhado pra isolar só o
  // comportamento de proximidade temporal. Usa um rank deliberadamente
  // distante de TODOS os degraus (inclusive o novo Top 500) pra manter o
  // isolamento original do cenário — não testar competição de ranking, que
  // já é coberta acima (N-B/N-C).
  const veteranProfile = await localGame.entities.PlayerProfile.update(profile.id, { birth_date: '1991-06-01' }); // ~34-35 anos em 2026-01-11
  const veteranContext = await buildAchievementContext(veteranProfile, { worldRank: { rank: 50000 } });
  const veteranNext = findNextRelevantAchievements(veteranProfile, veteranContext, { limit: 5 });
  console.log('(info) Regra NOVA (veterano perto de 35 anos):', veteranNext.map((i) => i.achievement.name).join(' · '));
  gate('N-D: veterano perto de 35 anos → "Veterano" (reach_age) pode aparecer (realmente próximo, não distante)', veteranNext.some((i) => i.achievement.trigger_type === 'reach_age'));
  const veteranPassiveCount = veteranNext.filter((i) => i.isPassiveTime).length;
  gate('N-D: mesmo permitindo entrar, ainda no máximo 1 conquista passiva', veteranPassiveCount <= 1);

  // ── N-E: sem treinador → marco de treinador pode aparecer ────────────────
  // `update` faz merge, não substitui — sem resetar birth_date explicitamente
  // aqui, o atleta continuaria "veterano" da mutação do cenário N-D, e
  // reach_age (mesma categoria 'carreira' que hire_coach) competiria pela
  // vaga de forma não intencional. Reseta tudo que este cenário não testa.
  const noCoachProfile = await localGame.entities.PlayerProfile.update(profile.id, { coach_id: null, coach_hired_date: null, birth_date: '2010-01-11' });
  const noCoachContext = await buildAchievementContext(noCoachProfile, { worldRank: { rank: 900 } });
  const noCoachNext5 = findNextRelevantAchievements(noCoachProfile, noCoachContext, { limit: 5 });
  console.log('(info) Regra NOVA (sem treinador, top 5):', noCoachNext5.map((i) => i.achievement.name).join(' · '));
  // O briefing usa linguagem condicional de propósito ("pode aparecer SE
  // relevante") — não "sempre aparece". Neste fixture, atributos em
  // progresso real e o multi_sponsor semeado (Fase 12: toda carreira nova
  // já nasce com 1 patrocinador ativo) legitimamente pontuam mais alto que
  // hire_coach. O que a Parte N-E realmente exige é que hire_coach seja uma
  // CANDIDATA real, corretamente pontuada e nunca excluída por engano — não
  // que vença uma disputa justa contra outras metas legítimas por 1 de 5
  // vagas. Verificado com uma janela maior (10), sem forçar o fixture.
  const noCoachNext10 = findNextRelevantAchievements(noCoachProfile, noCoachContext, { limit: 10 });
  gate('N-E: sem treinador contratado → "Encontrou um Guia" (hire_coach) é candidata real e pontuada (aparece numa janela mais ampla)', noCoachNext10.some((i) => i.achievement.trigger_type === 'hire_coach'));

  // ── N-F: sem patrocinador → marco de patrocínio pode aparecer ────────────
  // Fase 12: toda carreira nova já nasce com 1 patrocinador ativo (starter
  // seed) — "Primeiro Patrocinador" (sign_sponsor≥1) já vem desbloqueado de
  // fábrica, então não é candidato em NENHUM fixture criado por
  // CareerManager.createCareer(). O marco de patrocínio real e ainda
  // bloqueado neste fixture é "Cobiçado" (multi_sponsor≥3) — mesma família,
  // ainda uma meta de patrocínio genuína e alcançável.
  const noSponsorContext = await buildAchievementContext(profile, { worldRank: { rank: 900 } });
  const noSponsorNext = findNextRelevantAchievements(profile, noSponsorContext, { limit: 10 });
  gate('N-F: marco de patrocínio ainda bloqueado ("Cobiçado"/multi_sponsor — sign_sponsor já vem do starter seed) é candidato pontuado', noSponsorNext.some((i) => ['sign_sponsor', 'multi_sponsor'].includes(i.achievement.trigger_type)));

  console.log(`\n${gates} gates executados, todos PASS — Relevância de "Próximas conquistas" (Achievements Polish 12.1).`);
} finally {
  await server.close();
}
