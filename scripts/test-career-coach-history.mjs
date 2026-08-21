// Fase 14 (docs/FASE_14_CAREER_IDENTITY.md, Parte 7/17).
//
// Prova a lacuna real encontrada na auditoria: trocar de treinador sempre
// sobrescrevia coach_id/coach_name direto no perfil, sem NENHUM rastro do
// treinador anterior (diferente de Partnership, que já preservava
// histórico). Nova entidade CoachTenure fecha o período ativo e abre um
// novo a cada contratação real (hirePrimaryCoach), com títulos-durante-o-
// período computados sob demanda a partir de Match reais (nenhum contador
// novo, nenhuma causalidade inventada tipo "treinador foi responsável por
// +23% da evolução").
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { hirePrimaryCoach, getCoachTenureHistory } = await server.ssrLoadModule('/src/game-core/coachLifecycle.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
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
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'career-coach', name: 'QA Coach' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-coach', sport_name: 'QA Coach', career_date: '2026-01-01', coins: 100000,
    serve: 60, forehand: 60, backhand: 60, volley: 60, bandeja: 60, smash: 60, defense: 60, agility: 60, strategy: 60, emotional_control: 60,
  });
  const coach1 = { id: 'coach-qa-1', name: 'Treinador QA 1', market_signing_bonus: 0, market_salary: 500 };
  const coach2 = { id: 'coach-qa-2', name: 'Treinador QA 2', market_signing_bonus: 0, market_salary: 500 };

  // ── Sem histórico ainda: contratação inicial abre um período ativo ──────
  profile = await hirePrimaryCoach(profile, coach1, 12);
  const historyAfterFirst = await getCoachTenureHistory(profile);
  gate('Contratar o 1º treinador abre um período ativo (CoachTenure) com OVR de início real', historyAfterFirst.current?.coachName === 'Treinador QA 1' && typeof historyAfterFirst.current.ovrStart === 'number');
  gate('Nenhum período encerrado ainda (é a 1ª contratação da carreira)', historyAfterFirst.past.length === 0);

  // ── 16: troca de treinador fecha o período anterior com rastro real ─────
  profile.career_date = '2026-08-01'; // avança a carreira antes da 2ª contratação
  profile = await hirePrimaryCoach(profile, coach2, 12);
  const historyAfterSwitch = await getCoachTenureHistory(profile);
  gate('16. Trocar de treinador abre um novo período ativo para o novo treinador', historyAfterSwitch.current?.coachName === 'Treinador QA 2');
  gate('BUG BLOQUEADO: o treinador ANTERIOR agora deixa um rastro real (CoachTenure encerrado) — antes desta fase, nenhum rastro existia', historyAfterSwitch.past.length === 1 && historyAfterSwitch.past[0].coachName === 'Treinador QA 1');
  gate('Período encerrado tem data de início E de fim reais (não inventadas)', historyAfterSwitch.past[0].startedDate === '2026-01-01' && historyAfterSwitch.past[0].endedDate === '2026-08-01');
  gate('Período encerrado tem OVR de início e de fim (formato do briefing: "OVR 64 -> 72")', typeof historyAfterSwitch.past[0].ovrStart === 'number' && typeof historyAfterSwitch.past[0].ovrEnd === 'number');
  gate('Nenhuma métrica causal inventada (nenhum campo tipo "responsável por X% da evolução")', !('impact_percent' in historyAfterSwitch.past[0]) && !('caused_growth' in historyAfterSwitch.past[0]));

  // ── 14 (saves antigos): perfil com treinador ativo mas SEM CoachTenure prévia ──
  // simula um save de antes desta fase — coach_id setado direto no perfil,
  // nunca passou por hirePrimaryCoach sob o novo código. Memória da sessão:
  // o harness local só suporta 1 PlayerProfile por carreira (mesmo dentro
  // de um novo CareerManager/storage no mesmo processo) — criar um 2º
  // perfil silenciosamente reaproveita "o" perfil já existente. Em vez de
  // um 2º create, reseta o MESMO perfil (.update) para um coach_id NUNCA
  // usado com hirePrimaryCoach (portanto sem CoachTenure ativo prévio) —
  // simula exatamente o estado de um save antigo.
  const legacyProfile = await localGame.entities.PlayerProfile.update(profile.id, {
    coach_id: 'coach-qa-legacy', coach_name: 'Treinador Pré-Fase-14', coach_hired_date: '2026-02-01', career_date: '2026-09-01',
  });
  const coach3 = { id: 'coach-qa-3', name: 'Treinador QA 3', market_signing_bonus: 0, market_salary: 500 };
  const legacyAfterSwitch = await hirePrimaryCoach(legacyProfile, coach3, 12);
  const legacyHistory = await getCoachTenureHistory(legacyAfterSwitch);
  gate('14. Save antigo (treinador ativo sem CoachTenure prévia): troca reconstrói o período com a data real conhecida (coach_hired_date), sem inventar OVR de início', legacyHistory.past.some((t) => t.coachName === 'Treinador Pré-Fase-14' && t.startedDate === '2026-02-01' && t.ovrStart === null && t.backfilled === true));

  console.log(`\n${gates} gates executados, todos PASS — Histórico de treinadores (Fase 14): período real preservado na troca, sem dado inventado, saves antigos reconstruídos honestamente.`);
} finally {
  await server.close();
}
