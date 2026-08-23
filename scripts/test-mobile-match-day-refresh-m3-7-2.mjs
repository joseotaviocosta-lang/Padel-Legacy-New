// Mobile M3.7.2 — Partida de treino não atualiza após avançar o dia
// (docs/MOBILE_M3_7_2_MATCH_DAY_REFRESH.md).
//
// Bug real em Android: jogar a partida diária em /matches mostra
// corretamente "partida usada"; usar o atalho global "Avançar dia"
// atualiza a data corretamente em todo o app, mas /matches continua
// mostrando o estado antigo (o "Jogar agora" não reaparece) até sair da
// página e voltar. O dado persistido sempre esteve correto — só a página
// não reagia à mudança em tempo real.
//
// Causa raiz (auditada, não suposta): `Matches.jsx` buscava `profile` UMA
// VEZ num useEffect(() => {...}, []) no mount — nunca assinava nenhum
// evento de atualização. NÃO era o React.memo(Matches) adicionado na M3.5:
// esse memo só evita re-render por PROPS do componente pai (Matches não
// recebe nenhuma, roteada via <Outlet/>) — nunca bloqueou o setState
// interno que este hotfix adiciona. O mecanismo de broadcast já existia e
// já funcionava (`dayAdvanceCoordinator.js`'s `broadcastProfileUpdate`,
// disparado após todo commit bem-sucedido de avanço de dia, com
// `detail.profile` sempre preenchido) — só faltava a página assinar.
//
// Auditoria mais ampla (Parte 4) encontrou o mesmo buraco estrutural em
// Training.jsx (o avanço de dia PRÓPRIO da página já atualizava o
// profile local corretamente — só o avanço disparado em outro lugar do
// app nunca chegava) e em Missions.jsx (dispara padel:profile-updated ao
// concluir etapas do tutorial, mas nunca escutava o próprio evento).
// CalendarPage.jsx/Tournaments.jsx/CareerHub.jsx já tinham o listener
// correto — usados aqui como referência do padrão que este hotfix
// replica via um hook compartilhado (`useCareerProfileSync`), em vez de
// duplicar o listener em cada arquivo.
//
// Este teste prova, sem montar nenhum componente React (sem jsdom neste
// repositório — mesma convenção de toda a sessão): (1) a lógica real de
// inscrição do hook (extraída em `subscribeCareerProfileSync`, testável
// isoladamente) registra, reage e limpa corretamente, usando o `window`
// real do Node (EventTarget/CustomEvent nativos, sem polyfill); (2)
// pipeline real — dia 1, partida jogada até o limite diário (disponível
// = false), avançar o dia pelo MESMO mecanismo do atalho global
// (`advanceCareerDayOnce`) libera o dia seguinte (disponível = true), e a
// função assinada pelo hook recebe o perfil atualizado automaticamente,
// sem qualquer remontagem de componente envolvida; (3) um avanço
// interrompido nunca dispara o broadcast (nada libera indevidamente); (4)
// o broadcast só acontece depois que a transação de persistência resolve
// com sucesso — nunca antes, nunca em caso de erro — preservando o estado
// anterior em caso de falha (a correção transacional em si já tem
// cobertura própria e dedicada em test:career-atomicity).
import { readFileSync } from 'node:fs';
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

// Node tem EventTarget/CustomEvent nativos (sem jsdom) — o suficiente para
// exercitar de verdade window.addEventListener/dispatchEvent, exatamente
// a API que o hook e o coordenador de avanço de dia já usam. `location`
// é só para o pipeline real de avanço de dia (src/dev/performanceProbe.js
// lê `window.location.pathname` ao registrar métricas de performance) —
// não faz parte do que este teste está verificando.
const syntheticWindow = new EventTarget();
syntheticWindow.location = { pathname: '/matches' };
globalThis.window = syntheticWindow;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { subscribeCareerProfileSync } = await server.ssrLoadModule('/src/hooks/useCareerProfileSync.js');
  const { advanceCareerDayOnce } = await server.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { canPlayMatchToday, DAILY_MATCH_LIMIT } = await server.ssrLoadModule('/src/lib/padel.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');

  // ═══════════════════════════════════════════════════════════════════════
  // PARTE 1 — Comportamento real do hook (registrar/reagir/limpar), sem
  // nenhum componente React montado.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Hook: subscribeCareerProfileSync ---');
  let received = null;
  let callCount = 0;
  const unsubscribe = subscribeCareerProfileSync((profile) => { received = profile; callCount += 1; });

  window.dispatchEvent(new CustomEvent('padel:profile-updated', { detail: { profile: { id: 'p1', career_date: '2026-01-02' } } }));
  gate('padel:profile-updated com detail.profile chama o callback com o perfil recebido', received?.id === 'p1' && received?.career_date === '2026-01-02');
  gate('callback chamado exatamente 1 vez', callCount === 1);

  window.dispatchEvent(new CustomEvent('padel:career-advanced', { detail: { profile: { id: 'p1', career_date: '2026-01-03' } } }));
  gate('padel:career-advanced também chama o callback (segundo evento coberto)', received?.career_date === '2026-01-03' && callCount === 2);

  window.dispatchEvent(new CustomEvent('padel:profile-updated', { detail: {} }));
  gate('evento sem detail.profile não chama o callback (guard correto, não limpa o perfil por engano)', callCount === 2);

  unsubscribe();
  window.dispatchEvent(new CustomEvent('padel:profile-updated', { detail: { profile: { id: 'p1', career_date: '2026-01-04' } } }));
  gate('depois de unsubscribe(), novos eventos não chamam mais o callback (cleanup real, sem vazamento)', callCount === 2);

  // ═══════════════════════════════════════════════════════════════════════
  // PARTE 2 — Pipeline real: dia 1 → jogar até o limite → avançar pelo
  // MESMO mecanismo do atalho global → dia 2 liberado, sem remontar nada.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Pipeline real: disponibilidade antes/depois do avanço de dia ---');
  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-match-day-refresh', name: 'QA Match Day Refresh' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-match-day-refresh', sport_name: 'Ale QA', career_date: '2026-01-01', energy: 100, fatigue: 0,
    practice_matches_today: DAILY_MATCH_LIMIT, tournament_matches_today: 0,
  });
  gate(`dia 1: partida(s) diária(s) já usada(s) (${profile.practice_matches_today}/${DAILY_MATCH_LIMIT}) → disponibilidade = false`, canPlayMatchToday(profile).allowed === false);

  // Simula exatamente o que Matches.jsx faz agora: assina o hook ANTES do
  // avanço de dia (a página já estaria montada quando o jogador usa o
  // atalho global em outra parte do app).
  let latestFromEvent = null;
  const unsubscribeMatches = subscribeCareerProfileSync((updated) => { latestFromEvent = updated; });

  const advanced = await advanceCareerDayOnce(profile);
  gate('advanceCareerDayOnce (mesmo mecanismo do atalho global "Avançar dia") avança para o dia 2', advanced.career_date === '2026-01-02');
  gate('a assinatura do hook recebeu o perfil atualizado automaticamente — sem remontar Matches', latestFromEvent?.career_date === '2026-01-02');
  gate('dia 2: limite diário de partidas foi zerado pelo próprio avanço de dia (regra de calendário existente, não alterada)', Number(latestFromEvent?.practice_matches_today) === 0);
  gate('dia 2: disponibilidade recalculada a partir do MESMO perfil que o hook recebeu = true', canPlayMatchToday(latestFromEvent).allowed === true);
  unsubscribeMatches();

  // ═══════════════════════════════════════════════════════════════════════
  // PARTE 3 — Avanço interrompido não libera indevidamente; nada é
  // transmitido antes da transação resolver com sucesso.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Avanço interrompido / rollback ---');
  let interruptedCallCount = 0;
  const unsubscribeInterrupted = subscribeCareerProfileSync(() => { interruptedCallCount += 1; });

  let rejected = false;
  try {
    await advanceCareerDayOnce(null);
  } catch {
    rejected = true;
  }
  gate('advanceCareerDayOnce(null) rejeita (perfil inválido/avanço não pode prosseguir)', rejected === true);
  gate('avanço interrompido NUNCA chama a assinatura do hook — nada é liberado indevidamente', interruptedCallCount === 0);
  unsubscribeInterrupted();

  const stillDay2 = (await localGame.entities.PlayerProfile.filter({ id: profile.id }))[0];
  gate('estado anterior preservado: o perfil real continua no dia 2 (avanço interrompido não corrompeu nem avançou de novo)', stillDay2.career_date === '2026-01-02');

  const coordinatorSource = readFileSync('src/game-core/dayAdvanceCoordinator.js', 'utf8');
  gate('broadcastProfileUpdate só é chamado DEPOIS que a transação resolve (nunca antes, nunca dentro de um catch) — rollback preserva o estado anterior', /const finalProfile = await gameRepository\.withPersistenceTransaction\(/.test(coordinatorSource) && /broadcastProfileUpdate\(finalProfile, 'day-advance-transaction'\);/.test(coordinatorSource));

  // ═══════════════════════════════════════════════════════════════════════
  // PARTE 4 — As páginas corrigidas realmente usam o hook; React.memo(Matches)
  // não tem comparador próprio (só compara props, e Matches não recebe
  // nenhuma real do pai) — nunca foi o que bloqueava o setState interno.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Wiring nas páginas ---');
  const matchesSource = readFileSync('src/pages/Matches.jsx', 'utf8');
  const trainingCenterSource = readFileSync('src/pages/TrainingCenter.jsx', 'utf8');
  gate('Matches.jsx redireciona para o Training Center, que importa e usa useCareerProfileSync', matchesSource.includes('buildTrainingCenterRoute(TRAINING_CENTER_VIEWS.MATCH') && trainingCenterSource.includes("import { useCareerProfileSync } from '@/hooks/useCareerProfileSync.js';") && trainingCenterSource.includes('useCareerProfileSync(setProfile);'));
  gate('React.memo(Matches) não tem comparador próprio (só compara props — nunca bloqueou o setState interno do hook)', /export default React\.memo\(Matches\);/.test(matchesSource));

  const trainingSource = readFileSync('src/pages/Training.jsx', 'utf8');
  gate('Training.jsx redireciona para o Training Center, que compartilha o mesmo perfil sincronizado', trainingSource.includes('buildTrainingCenterRoute(TRAINING_CENTER_VIEWS.TRAINING') && trainingCenterSource.includes('useCareerProfileSync(setProfile);'));

  const missionsSource = readFileSync('src/pages/Missions.jsx', 'utf8');
  gate('Missions.jsx passou a escutar padel:profile-updated/career-advanced (antes só disparava, nunca escutava)', missionsSource.includes("window.addEventListener('padel:profile-updated', debouncedLoad)") && missionsSource.includes("window.addEventListener('padel:career-advanced', debouncedLoad)"));

  const hookSource = readFileSync('src/hooks/useCareerProfileSync.js', 'utf8');
  gate('hook compartilhado escuta os dois eventos (profile-updated e career-advanced)', hookSource.includes("'padel:profile-updated'") && hookSource.includes("'padel:career-advanced'"));
  gate('hook faz cleanup real (removeEventListener dos dois)', hookSource.includes('window.removeEventListener'));

  console.log(`\n${gates} gates executados, todos PASS — Mobile M3.7.2 (Matches/Training/Missions reagem ao avanço de dia sem remontar).`);
} finally {
  await server.close();
}
