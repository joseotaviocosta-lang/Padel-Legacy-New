import { CAREER_SAVE_SCHEMA_VERSION } from '@/careers/careerSchema.js';

function asArray(value) { return Array.isArray(value) ? value : []; }
function safeNumber(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function addIssue(list, id, severity, area, title, detail, count = 1) { list.push({ id, severity, area, title, detail, count }); }
function entityList(career, name) { return asArray(career?.entities?.[name]); }

function duplicateCount(records) {
  const ids = records.map(item => item?.id).filter(Boolean);
  return Math.max(0, ids.length - new Set(ids).size);
}

function dateIsValid(value) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }

export function inspectCareerSave(career) {
  const issues = [];
  if (!career || typeof career !== 'object') {
    return { score: 0, status: 'Crítico', issues: [{ id: 'missing-career', severity: 'blocker', area: 'Save', title: 'Save indisponível', detail: 'Nenhuma carreira pôde ser lida.', count: 1 }], counts: {}, generatedAt: new Date().toISOString() };
  }

  if (career.save_schema_version !== CAREER_SAVE_SCHEMA_VERSION) addIssue(issues, 'schema-version', 'blocker', 'Save', 'Versão de schema inesperada', `Esperado ${CAREER_SAVE_SCHEMA_VERSION}, encontrado ${career.save_schema_version ?? 'ausente'}.`);
  if (!career.career_id) addIssue(issues, 'career-id', 'blocker', 'Save', 'career_id ausente', 'O arquivo não possui identificador seguro de carreira.');
  if (!dateIsValid(career.metadata?.career_date)) addIssue(issues, 'career-date', 'high', 'Calendário', 'Data da carreira inválida', 'metadata.career_date precisa ser uma data válida.');

  const entities = career.entities || {};
  const entityNames = Object.keys(entities).filter(name => Array.isArray(entities[name]));
  let duplicateIdsTotal = 0;
  entityNames.forEach(name => {
    const duplicates = duplicateCount(entities[name]);
    duplicateIdsTotal += duplicates;
    if (duplicates) addIssue(issues, `duplicate-${name}`, 'high', name, `IDs duplicados em ${name}`, 'Registros com o mesmo ID podem produzir comportamento imprevisível.', duplicates);
  });

  const profiles = entityList(career, 'PlayerProfile');
  const athletes = entityList(career, 'AthleteProfile');
  const allAthletes = [...profiles, ...athletes];
  const missingCountry = allAthletes.filter(item => !String(item.country || item.country_code || item.nationality || '').trim()).length;
  if (missingCountry) addIssue(issues, 'missing-country', 'medium', 'Ranking', 'Atletas sem país', 'A nacionalidade ausente impede ranking de países e filtros completos.', missingCountry);

  const partnerships = entityList(career, 'Partnership');
  const invalidPartnerships = partnerships.filter(item => {
    const a = item.player1_id || item.athlete1_id || item.player_a_id;
    const b = item.player2_id || item.athlete2_id || item.player_b_id;
    return item.active !== false && (!a || !b || a === b);
  }).length;
  if (invalidPartnerships) addIssue(issues, 'invalid-partnerships', 'high', 'Duplas', 'Duplas ativas inválidas', 'Há dupla ativa sem dois atletas distintos.', invalidPartnerships);

  const athleteActiveTeams = new Map();
  partnerships.filter(item => item.active !== false).forEach(item => {
    [item.player1_id || item.athlete1_id || item.player_a_id, item.player2_id || item.athlete2_id || item.player_b_id].filter(Boolean).forEach(id => athleteActiveTeams.set(id, (athleteActiveTeams.get(id) || 0) + 1));
  });
  const athletesInMultipleTeams = [...athleteActiveTeams.values()].filter(count => count > 1).length;
  if (athletesInMultipleTeams) addIssue(issues, 'athlete-multiple-teams', 'high', 'Duplas', 'Atletas em mais de uma dupla ativa', 'Um atleta não deve pertencer simultaneamente a múltiplas duplas ativas.', athletesInMultipleTeams);

  const messages = entityList(career, 'CareerMessage');
  const messageKeys = messages.map(item => item.context_key || `${item.profile_id || ''}|${item.created_date || item.created_at || ''}|${item.subject || item.title || ''}`).filter(Boolean);
  const duplicateMessages = Math.max(0, messageKeys.length - new Set(messageKeys).size);
  if (duplicateMessages) addIssue(issues, 'duplicate-messages', 'medium', 'Comunicações', 'Comunicações duplicadas', 'Mensagens com a mesma chave contextual devem existir apenas uma vez.', duplicateMessages);

  const missions = entityList(career, 'Mission');
  const missionById = new Map(missions.map(item => [item.id, item]));
  const progress = entityList(career, 'MissionProgress');
  const orphanProgress = progress.filter(item => item.mission_id && !missionById.has(item.mission_id)).length;
  if (orphanProgress) addIssue(issues, 'orphan-mission-progress', 'medium', 'Missões', 'Progresso de missão órfão', 'Há progresso associado a uma missão que não existe mais.', orphanProgress);
  const completedNotRewarded = progress.filter(item => (item.completed || item.status === 'completed') && !item.claimed && !item.reward_delivered && missionById.get(item.mission_id)?.mission_type === 'tutorial').length;
  if (completedNotRewarded) addIssue(issues, 'tutorial-reward-pending', 'high', 'Tutorial', 'Tutorial concluído sem recompensa/avanço', 'Missões de tutorial concluídas devem ter estado final consistente.', completedNotRewarded);

  const tournaments = entityList(career, 'Tournament');
  const tournamentById = new Map(tournaments.map(item => [item.id, item]));
  const registrations = entityList(career, 'TournamentRegistration').filter(item => item.status !== 'cancelled' && item.cancelled !== true);
  const registrationKeys = registrations.map(item => `${item.profile_id || item.player_id || ''}|${item.tournament_id || ''}`);
  const duplicateRegistrations = Math.max(0, registrationKeys.length - new Set(registrationKeys).size);
  if (duplicateRegistrations) addIssue(issues, 'duplicate-registrations', 'high', 'Torneios', 'Inscrições duplicadas', 'A mesma carreira não deve ter mais de uma inscrição ativa no mesmo torneio.', duplicateRegistrations);
  const orphanRegistrations = registrations.filter(item => item.tournament_id && !tournamentById.has(item.tournament_id)).length;
  if (orphanRegistrations) addIssue(issues, 'orphan-registrations', 'medium', 'Torneios', 'Inscrições sem torneio', 'Há inscrições apontando para torneios inexistentes.', orphanRegistrations);

  const contracts = entityList(career, 'PlayerContract');
  const referenceDate = career.metadata?.career_date || '2026-01-01';
  const expiredActive = contracts.filter(item => item.active !== false && (item.end_date || item.contract_end) && String(item.end_date || item.contract_end) < referenceDate).length;
  if (expiredActive) addIssue(issues, 'expired-contracts', 'medium', 'Contratos', 'Contratos vencidos ainda ativos', 'O status do contrato não acompanha a data atual da carreira.', expiredActive);

  const rankingRecords = [...allAthletes, ...entityList(career, 'TeamRanking')];
  const negativePoints = rankingRecords.filter(item => safeNumber(item.ranking_points ?? item.points, 0) < 0).length;
  if (negativePoints) addIssue(issues, 'negative-ranking-points', 'high', 'Ranking', 'Pontos negativos', 'Pontuação competitiva deve ser zero ou positiva.', negativePoints);

  const severityWeight = { blocker: 35, high: 14, medium: 5, low: 1 };
  const penalty = issues.reduce((sum, item) => sum + (severityWeight[item.severity] || 0) * Math.min(3, Math.max(1, item.count)), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return {
    generatedAt: new Date().toISOString(),
    careerId: career.career_id,
    schemaVersion: career.save_schema_version,
    referenceDate,
    score,
    status: score >= 95 ? 'Excelente' : score >= 85 ? 'Saudável' : score >= 70 ? 'Atenção' : score >= 50 ? 'Instável' : 'Crítico',
    counts: {
      entityTypes: entityNames.length,
      records: entityNames.reduce((sum, name) => sum + entities[name].length, 0),
      athletes: allAthletes.length,
      partnerships: partnerships.length,
      messages: messages.length,
      missions: missions.length,
      missionProgress: progress.length,
      tournaments: tournaments.length,
      registrations: registrations.length,
      contracts: contracts.length,
      duplicateIds: duplicateIdsTotal,
    },
    issues: issues.sort((a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0)),
  };
}

export function buildSaveInspectorExport(report) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    privacy: 'Diagnóstico estrutural. Não inclui nome do atleta, mensagens completas ou conteúdo integral do save.',
    summary: {
      score: report?.score ?? 0,
      status: report?.status || 'indisponível',
      schemaVersion: report?.schemaVersion ?? null,
      referenceDate: report?.referenceDate ?? null,
      counts: report?.counts || {},
    },
    issues: (report?.issues || []).map(item => ({ id: item.id, severity: item.severity, area: item.area, title: item.title, detail: item.detail, count: item.count })),
  };
}
