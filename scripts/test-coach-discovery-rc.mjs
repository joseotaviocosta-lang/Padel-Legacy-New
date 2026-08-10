import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const {
    buildCoachDiscovery,
    canHireCoach,
    COACHES_DATA,
    filterCoachDiscovery,
    getCoachAvailability,
    getDefaultCoachDiscoveryFilter,
    sortCoachDiscovery,
  } = await server.ssrLoadModule('/src/lib/coaches.js');

  const starter = {
    id: 'player-new', level: 'Iniciante', reputation: 0, xp: 0, coins: 5000,
    ranking_position: 1200, coach_id: 'club-coach', coach_paid_by_club: true,
    play_style: 'Equilibrado', region: 'Brasil', club_level: 0,
  };
  const catalog = COACHES_DATA.map((coach, index) => ({ ...coach, id: coach.catalog_key || `coach-${index}` }));
  const discovery = buildCoachDiscovery(catalog, starter, { monthlyIncome: 2500 });
  const available = discovery.filter((item) => item.availability.available);
  assert.ok(available.length >= 5, `nova carreira deveria ter ao menos 5 opções, recebeu ${available.length}`);
  assert.ok(available.filter((item) => item.coach.tier === 'iniciante').length >= 5, 'faltam técnicos iniciantes acessíveis');

  const sorted = sortCoachDiscovery(discovery, 'recommendation');
  assert.equal(sorted[0].availability.available, true, 'relevância deve priorizar quem pode ser contratado');
  assert.equal(sorted[0].recommended, true, 'primeiro resultado deve ser recomendado');
  assert.ok(discovery.some((item) => !item.availability.available && item.availability.reasons.length), 'bloqueados precisam permanecer visíveis com motivos');

  assert.ok(filterCoachDiscovery(discovery, { status: 'available' }).every((item) => item.availability.available));
  assert.ok(filterCoachDiscovery(discovery, { status: 'blocked' }).every((item) => !item.availability.available));
  assert.ok(filterCoachDiscovery(discovery, { status: 'recommended' }).every((item) => item.recommended));
  assert.ok(filterCoachDiscovery(discovery, { status: 'budget' }).every((item) => item.availability.affordability.withinBudget));

  const technical = filterCoachDiscovery(discovery, { specialty: 'tecnico' });
  assert.ok(technical.length > 0 && technical.every((item) => item.coach.specialty === 'tecnico'));
  const named = discovery[0];
  assert.ok(filterCoachDiscovery(discovery, { search: named.coach.name }).some((item) => item.coach.id === named.coach.id));

  const salaryRisk = { ...catalog.find((coach) => coach.tier === 'iniciante'), id: 'salary-risk', monthly_cost: 2400, sign_on_bonus: 0, market_available: true };
  const salaryEvaluation = getCoachAvailability(salaryRisk, starter, { monthlyIncome: 3000 });
  assert.equal(salaryEvaluation.available, true, 'salário alto deve alertar, não bloquear');
  assert.equal(salaryEvaluation.affordability.risk, 'high');

  const signingBlock = getCoachAvailability({ ...salaryRisk, sign_on_bonus: 6000 }, starter);
  assert.equal(signingBlock.available, false);
  assert.match(signingBlock.reason, /bônus de assinatura/i);

  const careerBlock = { ...salaryRisk, demands: { min_level: 'Competitivo', min_reputation: 25, min_club_level: 2 } };
  const blocked = getCoachAvailability(careerBlock, starter);
  assert.equal(blocked.available, false);
  assert.ok(blocked.reasons.some((reason) => reason.includes('Competitivo')));
  assert.ok(blocked.reasons.some((reason) => reason.includes('reputação')));
  assert.ok(blocked.reasons.some((reason) => reason.includes('clube nível 2')));

  const marketBlock = getCoachAvailability({ ...salaryRisk, market_available: false }, starter);
  assert.equal(marketBlock.available, false);
  assert.match(marketBlock.reason, /mercado/i);
  assert.deepEqual(canHireCoach(careerBlock, starter).allowed, getCoachAvailability(careerBlock, starter).available, 'UI e contratação devem compartilhar a regra');
  assert.equal(getDefaultCoachDiscoveryFilter(starter), 'available');
  assert.equal(getDefaultCoachDiscoveryFilter({ ...starter, coach_paid_by_club: false }), 'recommended');

  const page = fs.readFileSync('src/pages/Coaches.jsx', 'utf8');
  const card = fs.readFileSync('src/components/coaches/CoachCard.jsx', 'utf8');
  const detail = fs.readFileSync('src/components/coaches/CoachDetail.jsx', 'utf8');
  const lifecycle = fs.readFileSync('src/game-core/coachLifecycle.js', 'utf8');
  assert.ok(page.includes('Técnico atual') && page.includes('coach.id !== hiredCoach?.id'), 'técnico atual deve ficar separado do mercado');
  assert.ok(page.includes('useMemo') && page.includes('buildCoachDiscovery'), 'descoberta deve ser memoizada');
  assert.ok(card.includes('Disponível para contratar agora') && card.includes('Ver requisitos'));
  assert.ok(detail.includes('<ModalShell') && !detail.includes('fixed inset-0'), 'detalhes devem usar o portal global');
  assert.ok(detail.includes('CoachComparison') && detail.includes('salaryShare'));
  assert.ok(lifecycle.includes('canHireCoach(coach, profile)'), 'confirmação deve revalidar elegibilidade');

  console.log(`✓ ${available.length} técnicos disponíveis para a carreira inicial`);
  console.log('✓ elegibilidade, filtros, ordenação, risco financeiro e comparação validados');
  console.log('CoachDiscoveryRCTest: PASS');
} finally {
  await server.close();
}
