// Mobile M3.1 — LiveMatch Device Hotfix (docs/MOBILE_M3_1_DEVICE_HOTFIX.md).
//
// M3 passou 44/44 nos testes automatizados mas o teste em Android físico
// revelou 3 problemas reais: (A) narração crescendo sem limite visual e
// engolindo os controles, (B) a partida saindo sozinha do LiveMatch, (C)
// recovery abrindo a rota inexistente "game/matches" (404). Este script
// cobre especificamente essas 3 classes de bug, incluindo a checagem que
// faltava em M3 e que teria pego o 404 sozinha: comparar as rotas REAIS
// usadas pelo recovery contra a tabela de rotas REAL do router (App.jsx),
// não contra uma string qualquer.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createMatch, playPoint } from '../src/engine/match/index.js';
import { MatchCheckpointRepository, isValidCheckpointShape, createCheckpointMatchId } from '../src/careers/MatchCheckpointRepository.js';

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

let checks = 0;
function check(label, condition) {
  checks += 1;
  if (!condition) throw new Error(`FALHA: ${label}`);
}
async function checkAsync(label, fn) {
  checks += 1;
  const ok = await fn();
  if (!ok) throw new Error(`FALHA: ${label}`);
}

const liveMatch = read('src/components/matches/LiveMatch.jsx');
const simulationModal = read('src/components/matches/SimulationModal.jsx');
const tournamentModal = read('src/components/tournaments/TournamentModal.jsx');
const modalShell = read('src/components/design-system/ModalShell.jsx');
const recoveryBanner = read('src/components/career/ActiveMatchRecoveryBanner.jsx');
const matchesPage = read('src/pages/Matches.jsx');
const tournamentsPage = read('src/pages/Tournaments.jsx');
const appSource = read('src/App.jsx');
const pkg = JSON.parse(read('package.json'));

// ═══════════════════════════════════════════════════════════════════════════
// PROBLEMA A — bounds/scroll da narração (Partes 1-3 do enunciado)
// ═══════════════════════════════════════════════════════════════════════════

// 1. LiveMatch possui cadeia de altura delimitada
check('LiveMatch perdeu a raiz com altura delimitada (h-full min-h-0 max-h-full)', /data-live-match className="flex h-full min-h-0 max-h-full flex-col/.test(liveMatch));
// 2. ancestrais flex necessários possuem min-h-0
check('área de conteúdo dos painéis perdeu min-h-0 (ancestral direto da narração)', liveMatch.includes('min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/50'));
check('MatchFeed perdeu min-h-0 na própria raiz', /function MatchFeed\([\s\S]{0,900}className="flex h-full min-h-0 flex-col overflow-hidden"/.test(liveMatch));
// 3. narration feed possui overflow próprio
check('lista de narração perdeu overflow-y-auto próprio', /ref=\{narrationRef\}[^>]*overflow-y-auto/.test(liveMatch));
// 4. narration feed não controla scroll da página inteira — a raiz do LiveMatch
// precisa ser overflow-hidden (não overflow-auto), senão o próprio LiveMatch
// vira um segundo container competindo por scroll com ModalShell.
check('raiz do LiveMatch deixou de ser overflow-hidden (viraria um 2º scroll concorrente)', /data-live-match className="flex h-full min-h-0 max-h-full flex-col gap-2 overflow-hidden"/.test(liveMatch));
// 5/6/7. scoreboard, tabs e controles ficam fora (shrink-0) da região que rola
check('scoreboard deixou de ficar em contêiner shrink-0 fora da área de scroll', /shrink-0"><CompactScoreboard/.test(liveMatch));
check('tabs de painel deixaram de ficar em grid shrink-0 fora da área de scroll', /grid shrink-0 grid-cols-4/.test(liveMatch));
check('playback controls deixaram de ficar em contêiner shrink-0 fora da área de scroll', /shrink-0">\s*<PlaybackControls/.test(liveMatch));
// 8. 120 eventos não alteram altura estrutural externa (cap é um slice de
// RENDER, a lista de dados pode crescer livremente — ver teste comportamental)
check('feed da narração perdeu o limite de 120 eventos renderizados', liveMatch.includes('.slice(-120)'));

// A causa raiz real de M3.1/Parte A: ModalShell.pl-modal-content é
// min-h-0 flex-1 overflow-y-auto — um container de scroll próprio. Para o
// LiveMatch (h-full) resolver sua altura corretamente dentro dele, o PAINEL
// do modal (pl-modal-panel) precisa de uma altura DEFINIDA (`h-*`), não só
// `max-h-*` (auto, limitado pelo teto) — max-height sozinho não propaga uma
// altura definida para percentuais de descendentes em todos os engines,
// e é exatamente o caso do WebView Android testado fisicamente. TournamentModal
// já usava `h-[calc(100dvh-1rem)]` (sem prefixo de breakpoint, ou seja, JÁ
// valia no mobile) — SimulationModal só tinha `md:h-[...]`, deixando o mobile
// (o cenário report bugado) cair no max-height "solto" padrão do ModalShell.
check('ModalShell.pl-modal-panel deixou de depender de max-height (mudança arquitetural fora do escopo deste hotfix)', modalShell.includes('max-h-[calc(100dvh-1rem)]'));
check('SimulationModal (fase ao vivo) ainda não define altura EXPLÍCITA no mobile — raiz do bug real de narração sem limite', /phase === 'live' \? 'h-\[calc\(100dvh-1rem\)\] md:h-\[min\(46rem,92dvh\)\]' : ''/.test(simulationModal));
check('TournamentModal (fase da partida) perdeu a altura explícita no mobile', /phase === 'match' \? 'h-\[calc\(100dvh-1rem\)\] sm:h-\[min\(48rem,calc\(100dvh-2rem\)\)\]' : ''/.test(tournamentModal));

// 9. recovery CTA permanece acessível (touch target >= 44px = min-h-11/12)
check('CTA "Continuar partida" (treino) perdeu touch target >= 44px', /resumeMatch\}[^>]*className="flex min-h-12/.test(simulationModal));
check('CTA "Continuar partida" (torneio) perdeu touch target >= 44px', /resumeMatchCheckpoint\}[^>]*className="flex min-h-12/.test(tournamentModal));
check('CTA "Continuar partida" (banner global) perdeu touch target >= 44px', /navigate\(destination\)\}[\s\S]{0,60}min-h-11/.test(recoveryBanner));

// 16/26. auto-scroll atua somente na área do feed, nunca na página inteira
// (scrollTop/scrollHeight diretos no ref — nunca scrollIntoView, que desloca
// ancestrais externos se algum deles também for scrollável).
check('auto-scroll da narração deixou de usar narrationRef.scrollTop/scrollHeight (controle direto e local)', /narrationRef\.current\.scrollTop = narrationRef\.current\.scrollHeight/.test(liveMatch));
check('LiveMatch introduziu scrollIntoView (pode deslocar o ModalShell inteiro, não só o feed)', !liveMatch.includes('scrollIntoView'));
check('SimulationModal/TournamentModal introduziram scrollIntoView', !simulationModal.includes('scrollIntoView') && !tournamentModal.includes('scrollIntoView'));

// ═══════════════════════════════════════════════════════════════════════════
// PROBLEMA B — saída espontânea do LiveMatch (Partes 5-7 do enunciado)
// ═══════════════════════════════════════════════════════════════════════════

// 11/12/13. hidden não fecha nem navega; foreground não fecha nem navega.
check('handler de visibilitychange chama onClose/navigate ao ir para background (deveria só pausar+checkpoint)', !/document\.hidden[\s\S]{0,200}(onClose|navigate)\(/.test(liveMatch));
check('handler de visibilitychange do LiveMatch continua limitado a pausar + checkpoint (nenhuma outra ação)', /function handleVisibilityChange\(\) \{\s*if \(document\.hidden\) \{\s*setAutoPlay\(false\);\s*setState/.test(liveMatch));
check('SimulationModal registrou um listener de visibilitychange próprio que poderia fechar/navegar', !/addEventListener\('visibilitychange'/.test(simulationModal));
check('TournamentModal registrou um listener de visibilitychange próprio que poderia fechar/navegar', !/addEventListener\('visibilitychange'/.test(tournamentModal));
// 14. pause não equivale a finished — autoPlay e state.finished são estados
// independentes; nada no reducer de fim de partida depende de autoPlay.
check('autoPlay passou a ser derivado de state.finished (pause virando sinal de fim de partida)', /const \[autoPlay, setAutoPlay\] = useState\(!initialState\);/.test(liveMatch));
check('efeito de fim de partida (onFinished) passou a disparar por causa de autoPlay em vez de state.finished', /if \(state\.finished && !finishedRef\.current\)/.test(liveMatch));
// 15. checkpoint não equivale a finished — isValidCheckpointShape já rejeita
// engine_state.finished === true (checkpoint de partida concluída não é
// "em andamento"), e onCheckpoint no LiveMatch já é guardado por
// `!state.finished`.
check('checkpoint deixou de ser suprimido quando a partida já terminou (onCheckpoint dispararia depois de finished)', /if \(!onCheckpoint \|\| state\.finished\) return;/.test(liveMatch));
check('isValidCheckpointShape aceita um checkpoint cujo engine_state.finished é true', read('src/careers/MatchCheckpointRepository.js').includes("if (engineState.finished === true) return false"));
// Regressão real corrigida nesta fase: pendingResume podia ficar "true por
// baixo" durante uma partida RECÉM-INICIADA (nunca resumida), porque
// resumeDecided só virava true dentro de resumeMatch()/discardResume() — o
// próprio checkpoint que a partida em andamento grava periodicamente
// (saveCheckpoint) reabastecia `checkpoint` via
// padel:match-checkpoint-changed, e resumeDecided nunca acompanhava.
check(
  'startMatch() (partida treino nova) não marca resumeDecided como decidido — pendingResume pode ficar true por baixo durante toda a partida',
  (simulationModal.match(/setResumeDecided\(true\)/g) || []).length >= 2,
);

// ═══════════════════════════════════════════════════════════════════════════
// PROBLEMA C — rota "game/matches" (Partes 8-14 do enunciado)
// ═══════════════════════════════════════════════════════════════════════════

// Extrai a tabela REAL de rotas do App.jsx — a checagem que faltava em M3.
const routeMatches = [...appSource.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
const validRoutes = new Set(routeMatches);
check('não foi possível extrair nenhuma rota de App.jsx (regex desatualizado?)', validRoutes.size > 10);
check('/matches deixou de ser uma rota real', validRoutes.has('/matches'));
check('/tournaments deixou de ser uma rota real', validRoutes.has('/tournaments'));
check('/game/matches passou a existir como rota real (não deveria)', !validRoutes.has('/game/matches'));
check('/game/tournaments passou a existir como rota real (não deveria)', !validRoutes.has('/game/tournaments'));

// A string literal "game/matches" (a causa raiz do 404 físico) não pode
// sobreviver em nenhum arquivo executável do app.
for (const [label, source] of [
  ['ActiveMatchRecoveryBanner.jsx', recoveryBanner],
  ['SimulationModal.jsx', simulationModal],
  ['TournamentModal.jsx', tournamentModal],
  ['Matches.jsx', matchesPage],
  ['Tournaments.jsx', tournamentsPage],
]) {
  check(`${label} ainda referencia a rota inexistente game/matches ou game/tournaments`, !/game\/(matches|tournaments)/.test(source));
}

// 18. recovery de treino resolve para uma rota real do router.
const bannerDestinations = [...recoveryBanner.matchAll(/destination = isTournament \? '([^']+)' : '([^']+)'/g)][0];
check('não foi possível extrair os destinos do ActiveMatchRecoveryBanner (formato mudou?)', Boolean(bannerDestinations));
if (bannerDestinations) {
  const [, tournamentDestination, practiceDestination] = bannerDestinations;
  check(`destino de recovery de treino ("${practiceDestination}") não é uma rota real do router`, validRoutes.has(practiceDestination));
  check(`destino de recovery de torneio ("${tournamentDestination}") não é uma rota real do router`, validRoutes.has(tournamentDestination));
}

// 19. recovery de torneio resolve para o torneio/rodada corretos — a rota de
// retorno construída por buildTournamentReturnRoute precisa apontar para a
// MESMA base de rota validada acima, carregando tournament_id via query.
const tournamentMatchLifecycle = read('src/game-core/tournamentMatchLifecycle.js');
check('buildTournamentReturnRoute perdeu a construção da rota de retorno do torneio', tournamentMatchLifecycle.includes('export function buildTournamentReturnRoute'));
check('buildTournamentReturnRoute deixou de apontar para /tournaments (rota real)', /return `\/tournaments\?/.test(tournamentMatchLifecycle));
check('buildTournamentReturnRoute perdeu o tournament_id na query (perderia qual torneio retomar)', tournamentMatchLifecycle.includes("query = new URLSearchParams({ tournament: String(tournamentId), mode: 'run' })"));
check('Tournaments.jsx perdeu a leitura do deep-link ?tournament=&mode=run para reabrir a campanha certa', tournamentsPage.includes("searchParams.get('tournament')") && tournamentsPage.includes("searchParams.get('mode')"));

// 20/21. checkpoint não é apagado antes do restore realmente acontecer, e
// falha de navegação/restauração não apaga o checkpoint.
check('resumeMatch() (treino) limpa o checkpoint antes de abrir o LiveMatch restaurado', !/function resumeMatch\(\) \{[\s\S]{0,200}clearCheckpoint/.test(simulationModal));
check('resumeMatchCheckpoint() (torneio) limpa o checkpoint antes de abrir o LiveMatch restaurado', !/function resumeMatchCheckpoint\(\) \{[\s\S]{0,150}clear/.test(tournamentModal));
check('inspectTournamentMatchCheckpoint (validação de checkpoint de torneio) foi removido', tournamentMatchLifecycle.includes('export function inspectTournamentMatchCheckpoint'));
check('TournamentModal parou de validar o checkpoint (issues/diagnostic) antes de oferecer retomada', tournamentModal.includes('inspectTournamentMatchCheckpoint(checkpoint'));
check('checkpoint de torneio inválido/incompatível apaga o save principal da carreira em vez de só descartar o checkpoint', !/inspection\.valid[\s\S]{0,400}(deleteCareerFile|writeCareer)/.test(tournamentModal));

// 22. finish continua limpando o checkpoint (idempotência preservada).
check('SimulationModal parou de limpar o checkpoint ao finalizar a partida treino', simulationModal.includes('getMatchCheckpointRepository().clear(careerId)'));
check('TournamentModal parou de limpar (clearIfMatch) o checkpoint ao finalizar a rodada', tournamentModal.includes('getMatchCheckpointRepository().clearIfMatch(careerId, freshMatch.id)'));
check('clearIfMatch deixou de existir no MatchCheckpointRepository (remoção seletiva por match_id)', read('src/careers/MatchCheckpointRepository.js').includes('async clearIfMatch(careerId, matchId)'));

// 23. idempotência de recompensa preservada (mecanismo pré-existente).
check('TournamentModal perdeu a checagem de rodada já concluída antes de reprocessar (freshMatch?.status === \'completed\')', tournamentModal.includes("freshMatch?.status === 'completed'"));
check('finalização de rodada de torneio parou de usar idempotencyKey', tournamentModal.includes("idempotencyKey: `tournament:${freshMatch.id}`"));

check('script test:mobile-m3-device-hotfix não está registrado em package.json', pkg.scripts?.['test:mobile-m3-device-hotfix'] === 'node scripts/test-mobile-m3-1-device-hotfix.mjs');

// ═══════════════════════════════════════════════════════════════════════════
// COMPORTAMENTAL — engine real (Parte 22 do enunciado)
// ═══════════════════════════════════════════════════════════════════════════

function fakePlayer(id, name) {
  return { id, name, attributes: { smash: 60, volley: 60, serve: 60, lob: 60, defense: 60, speed: 60, control: 60, tactics: 60 }, energy: 90, fatigue: 10 };
}
class FakeStorage {
  constructor() { this.files = new Map(); }
  async initialize() {}
  async ensureDirectory() {}
  async exists(p) { return this.files.has(p); }
  async readJsonIfExists(p, defaultValue) { return this.files.has(p) ? JSON.parse(this.files.get(p)) : defaultValue; }
  async writeJson(p, data) { this.files.set(p, JSON.stringify(data)); return data; }
  async remove(p) { return this.files.delete(p); }
}

// start → gerar MUITOS eventos (bem mais que 120) → checkpoint → unmount →
// restore → confirmar state → continuar → finish. Prova que o limite de
// renderização (120) é puramente visual — os dados da partida (e portanto o
// checkpoint) continuam íntegros e completos, mesmo com uma narração longa.
await checkAsync('narração longa (>120 eventos) corrompe o checkpoint ou o restore', async () => {
  const teamA = [fakePlayer('p1', 'Jogador'), fakePlayer('p2', 'Parceiro')];
  const teamB = [fakePlayer('p3', 'Rival 1'), fakePlayer('p4', 'Rival 2')];
  let state = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', seed: 'm3-1-long-narration' });
  let safety = 4000;
  while (state.narration.length <= 130 && !state.finished && safety-- > 0) state = playPoint(state);
  if (state.narration.length <= 120) return false; // seed não gerou narração longa o suficiente — falha visível, não falso-positivo

  const repo = new MatchCheckpointRepository(new FakeStorage());
  const matchId = createCheckpointMatchId();
  await repo.save('career-1', { match_id: matchId, type: 'practice', tournament_id: null, started_at: new Date().toISOString(), engine_state: state });

  // "unmount"/"kill": só o que está em disco sobrevive.
  const restored = await repo.read('career-1');
  if (!restored || restored.engine_state.narration.length !== state.narration.length) return false;

  // "continue": segue jogando a partir do estado restaurado.
  let resumed = restored.engine_state;
  let continueSafety = 4000;
  while (!resumed.finished && continueSafety-- > 0) resumed = playPoint(resumed);
  await repo.clear('career-1');
  const afterFinish = await repo.read('career-1');
  return resumed.finished === true && afterFinish === null;
});

// start → pause/background (mesmo efeito que visibilitychange dispara) →
// nenhum onClose → restore/foreground → continua a MESMA partida (match_id
// estável, nenhuma duplicata).
await checkAsync('pausar e "voltar do background" perde a identidade da partida (match_id muda) ou finaliza sozinha', async () => {
  const teamA = [fakePlayer('p1', 'Jogador'), fakePlayer('p2', 'Parceiro')];
  const teamB = [fakePlayer('p3', 'Rival 1'), fakePlayer('p4', 'Rival 2')];
  let state = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', seed: 'm3-1-background-test' });
  for (let i = 0; i < 6 && !state.finished; i += 1) state = playPoint(state);

  const repo = new MatchCheckpointRepository(new FakeStorage());
  const matchId = createCheckpointMatchId();
  // Simula exatamente o que handleVisibilityChange faz: salva o checkpoint
  // SEM marcar como finalizado, autoPlay pausado (não modelado aqui, é
  // estado de UI puro — o que importa é que o engine_state não muda).
  await repo.save('career-1', { match_id: matchId, type: 'practice', tournament_id: null, started_at: new Date().toISOString(), engine_state: state });
  check('checkpoint salvo em background não pode representar uma partida finalizada', isValidCheckpointShape({ checkpoint_schema_version: 1, career_id: 'career-1', match_id: matchId, type: 'practice', engine_state: state }, 'career-1'));

  // "foreground": relê o checkpoint (equivalente a reabrir o modal).
  const foreground = await repo.read('career-1');
  return foreground?.match_id === matchId && foreground.engine_state.finished === false;
});

console.log(`test:mobile-m3-device-hotfix OK — ${checks} verificações (bounds/scroll + saída espontânea + rotas reais + engine real).`);
