// Auditoria do Core Gameplay (Fase 5 — Treinos, Calendário, Torneios,
// Ranking e Partidas). Agrupado num único script (em vez de 5 separados)
// para reduzir manutenção, mas cada bloco identifica a área que protege —
// ver docs/CORE_GAMEPLAY_UI.md.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');
const exists = (relPath) => fs.existsSync(path.join(root, relPath));

const failures = [];
let checks = 0;
function check(area, label, condition) {
  checks += 1;
  if (!condition) failures.push(`[${area}] ${label}`);
}

// ─── 5.1 Treinos ───────────────────────────────────────────────────────
{
  const training = read('src/pages/Training.jsx');
  check('Treinos', 'Training.jsx ainda importa da biblioteca-sombra padel/ui', !training.includes("from '@/components/padel/ui'"));
  check('Treinos', 'Training.jsx ainda importa da biblioteca-sombra padel/GameShared', !training.includes("from '@/components/padel/GameShared'"));
  check('Treinos', 'Categorias de treino não usam Tabs oficial', training.includes('activeTab={activeCategory}'));
  check('Treinos', 'Recomendação não reaproveita getRecommendedTrainings existente (nenhum algoritmo novo permitido)', training.includes('getRecommendedTrainings'));
  const activityCard = read('src/components/training/TrainingActivityCard.jsx');
  check('Treinos', 'Card de treino não mostra fadiga de forma compacta', activityCard.includes('Fadiga'));
  check('Treinos', 'Card de treino não mostra duração de forma compacta', activityCard.includes('Duração'));
  check('Treinos', 'Card de treino sem badge de recomendado', activityCard.includes('recommended'));
  const conditionPanel = read('src/components/training/ConditionPanel.jsx');
  check('Treinos', 'ConditionPanel ainda duplica Energia/Fadiga já mostrados na faixa de status do topo', !/label="Energia"|label="Fadiga"/.test(conditionPanel));
}

// ─── 5.2 Calendário ────────────────────────────────────────────────────
{
  const calendar = read('src/pages/CalendarPage.jsx');
  check('Calendário', 'CalendarPage.jsx ainda importa da biblioteca-sombra padel/ui', !calendar.includes("from '@/components/padel/ui'"));
  check('Calendário', 'Data grande (getCareerDatePresentation) ausente — seção 9', calendar.includes('getCareerDatePresentation'));
  check('Calendário', 'Botão principal "+1 dia" ausente ou sem hierarquia clara', calendar.includes("'+1 dia'") || calendar.includes('+1 dia'));
  check('Calendário', 'Alternância Semana/Mês não usa Tabs oficial', calendar.includes('activeTab={viewMode}'));
  const weekView = read('src/components/calendar/CalendarWeekView.jsx');
  check('Calendário', 'CalendarWeekView ainda duplica o botão "Avançar 1 Dia" (competiria com o CTA principal da página)', !weekView.includes('Avançar 1 Dia'));
  check('Calendário', 'CalendarWeekView não usa Surface oficial', weekView.includes("from '@/components/design-system'"));
}

// ─── 5.3 Torneios ──────────────────────────────────────────────────────
{
  for (const file of [
    'src/components/tournaments/TournamentStats.jsx',
    'src/components/tournaments/CircuitEvolution.jsx',
    'src/components/tournaments/TournamentNews.jsx',
  ]) {
    const source = read(file);
    check('Torneios', `${file} ainda importa da biblioteca-sombra padel/ui`, !source.includes("from '@/components/padel/ui'"));
    check('Torneios', `${file} não usa EmptyState/Surface oficiais`, source.includes("from '@/components/design-system'"));
  }
  const bracket = read('src/components/tournaments/TournamentBracket.jsx');
  check('Torneios', 'TournamentBracket não usa Tabs oficial para as rodadas', bracket.includes('<Tabs'));
  const detailsModal = read('src/components/tournaments/TournamentDetailsModal.jsx');
  check('Torneios', 'TournamentDetailsModal ainda usa <button> cru no rodapé em vez de Button', detailsModal.includes('<Button'));
  const registrationModal = read('src/components/calendar/TournamentRegistrationModal.jsx');
  check('Torneios', 'TournamentRegistrationModal ainda usa <button> cru no rodapé em vez de Button', registrationModal.includes('<Button'));
  check('Torneios', 'Bloco duplicado de "Caminho de entrada" não foi consolidado', (registrationModal.match(/Caminho de entrada/g) || []).length <= 1);
}

// ─── 5.4 Ranking ───────────────────────────────────────────────────────
{
  const ranking = read('src/pages/Ranking.jsx');
  check('Ranking', 'Ranking.jsx ainda importa da biblioteca-sombra padel/ui', !ranking.includes("from '@/components/padel/ui'"));
  check('Ranking', 'Ranking.jsx não usa CountryFlag oficial (seção 21)', ranking.includes('CountryFlag'));
  check('Ranking', 'Ranking.jsx não usa RankingPosition oficial (posição + variação)', ranking.includes('RankingPosition'));
  check('Ranking', 'Ranking.jsx não usa PlayerAvatar oficial', ranking.includes('PlayerAvatar'));
  check('Ranking', 'Ranking.jsx perdeu a paginação em lotes (LIST_PAGE_SIZE) — regressão de performance', ranking.includes('LIST_PAGE_SIZE'));
  check('Ranking', 'Ranking.jsx renderiza a lista sem slice/limite (renderizaria milhares de linhas)', ranking.includes('.slice(0, visibleCount)'));
  check('Ranking', 'Linha do jogador sem destaque discreto (seção 20)', ranking.includes('is_player_profile'));
}

// ─── 5.5 Partidas ──────────────────────────────────────────────────────
{
  const matchesPage = read('src/pages/Matches.jsx');
  check('Partidas', 'Matches.jsx ainda importa da biblioteca-sombra padel/ui', !matchesPage.includes("from '@/components/padel/ui'"));
  check('Partidas', 'Matches.jsx ainda menciona replay visual (decisão do projeto: sem 2D/replay)', matchesPage.includes('Replays não estão mais disponíveis'));

  const liveMatch = read('src/components/matches/LiveMatch.jsx');
  check('Partidas', 'Narração perdeu o limite de eventos renderizados (slice(-120)) — cresceria sem limite', liveMatch.includes('.slice(-120)'));
  check('Partidas', 'Narração perdeu o scroll controlado (overflow-y-auto)', liveMatch.includes('overflow-y-auto'));
  check('Partidas', 'Velocidades de playback mudaram (deveriam continuar 1x/2x/5x/10x)', liveMatch.includes('[1, 2, 5, 10]'));
  check('Partidas', 'Destaques de break/set/match point foram removidos', liveMatch.includes('getImportantMoment'));
  check('Partidas', 'Momentum deixou de ser exibido', liveMatch.includes('momentum'));
  check('Partidas', 'Painel do técnico (tactics/coach) foi removido', liveMatch.includes('CoachPanel') && liveMatch.includes('TacticsPanel'));
  check('Partidas', 'Nenhum canvas/renderização 2D deveria existir (decisão do projeto)', !/<canvas|CourtRenderer|MatchCanvas/.test(liveMatch));

  const recap = read('src/components/matches/MatchRecapPremium.jsx');
  check('Partidas', 'MatchRecapPremium não usa mais buildMatchRecap (lógica de recap alterada)', recap.includes('buildMatchRecap'));
}

// ─── Transversal: nenhum polling novo, nenhum import legado novo introduzido nesta fase ───
{
  const touchedFiles = [
    'src/pages/Training.jsx', 'src/components/training/TrainingActivityCard.jsx', 'src/components/training/ConditionPanel.jsx',
    'src/pages/CalendarPage.jsx', 'src/components/calendar/CalendarWeekView.jsx', 'src/components/calendar/CalendarMonthView.jsx',
    'src/components/tournaments/TournamentStats.jsx', 'src/components/tournaments/CircuitEvolution.jsx', 'src/components/tournaments/TournamentNews.jsx',
    'src/components/tournaments/TournamentBracket.jsx', 'src/components/tournaments/TournamentDetailsModal.jsx', 'src/components/calendar/TournamentRegistrationModal.jsx',
    'src/pages/Ranking.jsx', 'src/pages/Matches.jsx', 'src/components/matches/LiveMatch.jsx', 'src/components/matches/MatchRecapPremium.jsx',
  ];
  for (const file of touchedFiles) {
    check('Transversal', `${file} não existe`, exists(file));
    const source = read(file);
    check('Transversal', `${file} introduziu setInterval novo (polling)`, !source.includes('setInterval('));
  }
}

if (failures.length) {
  console.error(`CoreGameplayUiTest: FALHA (${failures.length}/${checks})`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('CoreGameplayUiTest: PASS');
console.log(`✓ ${checks} verificações — Treinos, Calendário, Torneios, Ranking, Partidas e checagens transversais`);
