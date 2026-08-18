import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
try {
  const { getPendingInterviews } = await server.ssrLoadModule('/src/lib/pressData.js');
  const { COACHES_DATA, canHireCoach } = await server.ssrLoadModule('/src/lib/coaches.js');
  const { getSponsorCategory, validateSponsorSlot, normalizeSponsorshipContract } = await server.ssrLoadModule('/src/lib/sponsors.js');
  const { normalizeCharacterCustomization, applyCharacterCustomizationChange, canSelectCharacterOption } = await server.ssrLoadModule('/src/lib/characterCustomization.js');
  const characterCatalog = await server.ssrLoadModule('/src/lib/characterCatalog.js');
  const { default: CharacterPreview } = await server.ssrLoadModule('/src/components/character/CharacterPreview.jsx');
  const { default: AppearanceEditor } = await server.ssrLoadModule('/src/components/character/AppearanceEditor.jsx');
  const { OptionGrid } = await server.ssrLoadModule('/src/components/character/CharacterShared.jsx');
  const { findMissingMissionCatalog } = await server.ssrLoadModule('/src/lib/missionCatalogLogic.js');
  const { reconcileJournalistCatalog } = await server.ssrLoadModule('/src/lib/pressData.js');
  const { migrateCareer } = await server.ssrLoadModule('/src/careers/CareerMigration.js');
  const { CAREER_SAVE_SCHEMA_VERSION } = await server.ssrLoadModule('/src/careers/careerSchema.js');
  const { CareerEntityRepository } = await server.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');
  const { buildSeasonTournaments } = await server.ssrLoadModule('/src/lib/circuitCatalog.js');
  const { createTournamentEditionId, repairTournamentCollection, validateTournamentIntegrity } = await server.ssrLoadModule('/src/lib/tournamentIntegrity.js');
  const { createKeyedInitializer } = await server.ssrLoadModule('/src/lib/keyedInitialization.js');
  const profile = { id: 'career-a-player', sport_name: 'Teste', career_date: '2026-01-01', coins: 999999, level: 'Lenda', xp: 999999, fan_appeal: 100, tournaments_won: 20 };
  assert(getPendingInterviews(profile, [], {}).length === 0, 'Carreira nova gerou entrevista.');
  const win = { id: 'win-1', profile_id: profile.id, date: '2026-01-02', tournament_id: 'teste-open-2026', tournament_name: 'Teste Open', match_type: 'tournament', status: 'completed', result: 'vitória', team_a: ['Teste', 'Dupla'], team_b: ['Rival A', 'Rival B'], winner: 'A' };
  const loss = { ...win, id: 'loss-1', result: 'derrota', winner: 'B' };
  const profileAfterWin = { ...profile, career_date: '2026-01-02', wins: 1, matches_played: 1 };
  const profileAfterLoss = { ...profile, career_date: '2026-01-02', losses: 1, matches_played: 1 };
  const winInterviews = getPendingInterviews(profileAfterWin, [win], {});
  const lossInterviews = getPendingInterviews(profileAfterLoss, [loss], {});
  assert(winInterviews.length === 1 && winInterviews[0]?.questionCategory === 'post_win', 'Vitória real não gerou entrevista única.');
  assert(lossInterviews.length === 1 && lossInterviews[0]?.questionCategory === 'post_loss', 'Derrota real não gerou entrevista única.');
  assert(getPendingInterviews(profile, [{ ...win, profile_id: 'other-career' }], {}).length === 0, 'Resultado de outra carreira vazou.');
  const coach = COACHES_DATA[0];
  assert(coach.monthly_cost > 0 && coach.sign_on_bonus > 0, 'Treinador sem custo ou salário.');
  assert(canHireCoach(coach, { ...profile, coins: 0 }).allowed === false, 'Treinador contratado sem saldo.');
  const racketSponsor = { id: 'racket-b', industry: 'Equipamentos' };
  const category = getSponsorCategory(racketSponsor);
  assert(category === 'raquete', 'Categoria comercial incorreta.');
  assert(validateSponsorSlot(racketSponsor, [{ sponsor_category: 'raquete', sponsor_name: 'Marca A' }]).ok === false, 'Slot concorrente não foi bloqueado.');
  assert(validateSponsorSlot(undefined, []).ok === false, 'Patrocinador ausente causou validação positiva.');
  assert(validateSponsorSlot({ id: 'broken', category: 'inexistente' }, [null]).ok === false, 'Categoria inválida não foi bloqueada.');
  assert(normalizeSponsorshipContract(null) === null, 'Contrato nulo não foi descartado.');
  const legacyCharacter = normalizeCharacterCustomization({ height_cm: undefined, voice_pitch: '75' }, profile.id);
  assert(legacyCharacter.height_cm === 178 && legacyCharacter.voice_pitch === 75, 'Save antigo do personagem não foi normalizado.');
  const legacyAppearance = normalizeCharacterCustomization({
    hairStyle: 2, hairColor: '#3b2a1f', skinTone: 'inexistente', accessory: 'oculos', celebration: 'fist_pump',
  }, profile.id);
  assert(legacyAppearance.hair_style === 'longo' && legacyAppearance.hair_color === 'castanho', 'Aliases/índices antigos de aparência não foram migrados.');
  assert(legacyAppearance.skin_tone === 'media' && legacyAppearance.accessories[0] === 'oculos' && legacyAppearance.celebration === 'soco_ar', 'Valores inválidos/legados não receberam fallback seguro.');
  const appearanceCategories = ['SKIN_TONES', 'HAIR_STYLES', 'HAIR_COLORS', 'EYE_COLORS', 'FACE_TYPES', 'BUILDS'];
  assert(appearanceCategories.every(key => Array.isArray(characterCatalog[key]) && characterCatalog[key].length > 0), 'Uma categoria básica do catálogo está vazia.');
  assert(new Set(appearanceCategories.flatMap(key => characterCatalog[key].map(item => `${key}:${item.id}`))).size === appearanceCategories.reduce((total, key) => total + characterCatalog[key].length, 0), 'Catálogo contém IDs duplicados na mesma categoria.');
  const withHair = applyCharacterCustomizationChange(legacyCharacter, 'hair_style', 'preso');
  const withShirt = applyCharacterCustomizationChange(withHair, 'shirt_color', '#ef4444');
  const withSkin = applyCharacterCustomizationChange(withShirt, 'skin_tone', 'escura');
  assert(withShirt.hair_style === 'preso' && withSkin.shirt_color === '#ef4444', 'Alterar uma categoria apagou outra escolha.');
  const previewMarkup = renderToStaticMarkup(React.createElement(CharacterPreview, { data: withSkin, profile }));
  assert(previewMarkup.includes('data-hair-style="preso"') && previewMarkup.includes('data-shirt="#ef4444"') && previewMarkup.includes('data-skin-tone="escura"'), 'Preview não recebeu a aparência atualizada.');
  const appearanceMarkup = renderToStaticMarkup(React.createElement(AppearanceEditor, { data: withSkin, update: () => {} }));
  assert(appearanceMarkup.includes('Estilo de Cabelo') && appearanceMarkup.includes('aria-pressed="true"'), 'Opções básicas/equipadas não foram renderizadas.');
  const lockedMarkup = renderToStaticMarkup(React.createElement(OptionGrid, { label: 'Teste', options: [{ id: 'locked', label: 'Bloqueado', unlocked: false }], value: '', onChange: () => {} }));
  assert(!canSelectCharacterOption({ id: 'locked', unlocked: false }) && lockedMarkup.includes('disabled=""'), 'Item bloqueado continua selecionável.');
  const missing = findMissingMissionCatalog([{ title: 'Tutorial A' }, null], [{ title: 'Tutorial A' }, { title: 'Missão B' }]);
  assert(missing.length === 1 && missing[0].title === 'Missão B', 'Catálogo de missões não foi deduplicado.');

  const career = { entities: { PressJournalist: [{ id: 'j1', name: 'Existente', bias_toward_player: 4 }] } };
  const fakeCareerStore = {
    async ensureActiveCareer() { return career; },
    async mutateActiveCareer(mutator) { return { result: await mutator(career), career }; },
  };
  const repository = new CareerEntityRepository(fakeCareerStore);
  assert((await repository.update('PressJournalist', 'j1', { interviews_done: 1 })).interviews_done === 1, 'Jornalista existente não foi atualizado.');
  let missingUpdateRejected = false;
  try { await repository.update('PressJournalist', 'j12', { interviews_done: 1 }); } catch { missingUpdateRejected = true; }
  assert(missingUpdateRejected, 'Update de jornalista inexistente deixou de sinalizar erro.');
  assert((await repository.upsert('PressJournalist', 'j12', { name: 'Anya Petrov' })).id === 'j12', 'Upsert não criou jornalista ausente.');
  assert((await repository.upsert('PressJournalist', 'j12', { interviews_done: 2 })).interviews_done === 2, 'Upsert não atualizou jornalista existente.');

  const legacyCareer = {
    save_schema_version: 4,
    metadata: { pressJournalistId: 'j12', preserved: 'sim' },
    player: {}, world: {}, entities: { PressJournalist: [{ id: 'j1', name: 'Rafael' }], Other: [{ id: 'keep' }] },
  };
  const firstMigration = migrateCareer(legacyCareer);
  const secondMigration = migrateCareer(firstMigration.data);
  assert(firstMigration.data.save_schema_version === CAREER_SAVE_SCHEMA_VERSION && firstMigration.data.metadata.pressJournalistId === 'j12', 'Migration não preservou referência canônica recuperável j12.');
  assert(secondMigration.migrated === false, 'Migration de jornalistas não é idempotente.');
  assert(firstMigration.data.entities.Other[0].id === 'keep' && firstMigration.data.metadata.preserved === 'sim', 'Migration alterou dados não relacionados.');
  assert(reconcileJournalistCatalog(firstMigration.data.entities.PressJournalist, profile.id).missing.some(item => item.id === 'j12'), 'Save parcial não recupera o jornalista j12.');

  const appearanceCareer = {
    save_schema_version: 5, metadata: { preserved: true },
    player: { id: profile.id, appearance: { hairStyle: 'longo', shirtColor: '#ef4444' }, coins: 321 },
    world: {}, entities: { Other: [{ id: 'keep-appearance' }] },
  };
  const appearanceMigration = migrateCareer(appearanceCareer);
  const appearanceMigrationAgain = migrateCareer(appearanceMigration.data);
  const restoredAppearance = appearanceMigration.data.entities.CharacterCustomization[0];
  assert(restoredAppearance.hair_style === 'longo' && restoredAppearance.shirt_color === '#ef4444', 'Migration não restaurou aparência antiga.');
  assert(appearanceMigrationAgain.migrated === false, 'Migration de aparência não é idempotente.');
  assert(appearanceMigration.data.player.coins === 321 && appearanceMigration.data.entities.Other[0].id === 'keep-appearance', 'Migration de aparência alterou dados do jogador.');

  const savedAppearance = await repository.create('CharacterCustomization', { profile_id: profile.id, hair_style: 'curto' });
  await repository.update('CharacterCustomization', savedAppearance.id, { ...withSkin, id: savedAppearance.id });
  const restoredRows = await repository.filter('CharacterCustomization', { id: savedAppearance.id });
  assert(normalizeCharacterCustomization(restoredRows[0], profile.id).hair_style === 'preso', 'Aparência não persistiu após salvar e restaurar.');

  const schedule2027 = buildSeasonTournaments(2027, 'season-2027');
  assert(validateTournamentIntegrity(schedule2027).length === 0, 'Calendário anual gerou torneios inválidos ou IDs duplicados.');
  assert(JSON.stringify(schedule2027.map(item => item.id)) === JSON.stringify(buildSeasonTournaments(2027, 'season-2027').map(item => item.id)), 'IDs de torneio não são determinísticos.');
  assert(
    createTournamentEditionId({ year: 2027, cityCode: 'NAI', tier: 'Silver', week: 2, slot: 1 })
      !== createTournamentEditionId({ year: 2027, cityCode: 'NAI', tier: 'Silver', week: 2, slot: 2 }),
    'Dois eventos legítimos na mesma cidade/semana receberam o mesmo ID.',
  );
  const duplicateTournament = { ...schedule2027[0], champion: 'Dupla Campeã', status: 'finalizado', results: [{ id: 'result-1', winner: 'Dupla Campeã' }] };
  const tournamentRepair = repairTournamentCollection([schedule2027[0], duplicateTournament]);
  assert(tournamentRepair.tournaments.length === 1 && tournamentRepair.mergedCount === 1, 'Duplicata equivalente não foi combinada.');
  assert(tournamentRepair.tournaments[0].champion === 'Dupla Campeã' && tournamentRepair.tournaments[0].results[0].id === 'result-1', 'Reparo apagou resultado concluído.');

  let initializerCalls = 0;
  const initializeOnce = createKeyedInitializer(async value => { initializerCalls += 1; await Promise.resolve(); return value; });
  const concurrentA = initializeOnce('career-a:2027', 'ok');
  const concurrentB = initializeOnce('career-a:2027', 'ok');
  assert(concurrentA === concurrentB && (await concurrentA) === 'ok' && initializerCalls === 1, 'Inicialização concorrente não compartilhou a mesma Promise.');
  let shouldFail = true;
  const recoverableInitializer = createKeyedInitializer(async () => { if (shouldFail) throw new Error('falha esperada'); return 'recuperado'; });
  try { await recoverableInitializer('retry'); } catch { /* falha esperada */ }
  shouldFail = false;
  assert(await recoverableInitializer('retry') === 'recuperado', 'Inicializador não liberou nova tentativa após falha.');

  let transactionCount = 0;
  const bulkCareer = { entities: {} };
  const bulkStore = {
    async ensureActiveCareer() { return bulkCareer; },
    async mutateActiveCareer(mutator) { transactionCount += 1; return { result: await mutator(bulkCareer), career: bulkCareer }; },
  };
  const bulkRepository = new CareerEntityRepository(bulkStore);
  await bulkRepository.bulkCreate('BulkTestEntity', [{ id: 'event-a' }, { id: 'event-b' }, { id: 'event-c' }]);
  await bulkRepository.bulkUpdate('BulkTestEntity', [{ id: 'event-a', title: 'Atualizado' }, { id: 'event-d', title: 'Novo' }]);
  assert(transactionCount === 2 && bulkCareer.entities.BulkTestEntity.length === 4, 'Operações em lote ainda gravam uma transação por item.');

  const tournamentLegacyCareer = {
    save_schema_version: 6, metadata: {}, player: {}, world: {},
    entities: { Tournament: [schedule2027[0], duplicateTournament], Match: [{ id: 'match-keep', tournament_id: schedule2027[0].id, score: '6-4' }] },
  };
  const tournamentMigration = migrateCareer(tournamentLegacyCareer);
  const tournamentMigrationAgain = migrateCareer(tournamentMigration.data);
  assert(tournamentMigration.data.entities.Tournament.length === 1 && tournamentMigration.data.entities.Tournament[0].champion === 'Dupla Campeã', 'Migration não reparou torneios duplicados preservando resultado.');
  assert(tournamentMigration.data.entities.Match[0].score === '6-4' && tournamentMigrationAgain.migrated === false, 'Migration de torneios alterou referências ou não é idempotente.');

  const missionsPage = await server.ssrLoadModule('/src/pages/Missions.jsx');
  // Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md): Missions.jsx passou a
  // exportar `React.memo(Missions)` (evita refazer o render da página a cada
  // re-render do shell global alheio a missões) — isso é um objeto especial
  // do React (`$$typeof: react.memo`, `.type` = a função original), não mais
  // uma function declaration direta, mas continua um componente válido.
  const missionsExport = missionsPage.default;
  const isValidMissionsExport = typeof missionsExport === 'function'
    || (missionsExport && typeof missionsExport === 'object' && typeof missionsExport.type === 'function');
  assert(isValidMissionsExport, 'Página Missions não possui export válido.');
  console.log('CareerSystemsAuditTest: persistência, migration e Missions aprovadas.');
} finally {
  await server.close();
}
