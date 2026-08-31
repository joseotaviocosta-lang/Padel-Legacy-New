// Correção UI/cronologia — Fase 4: "Unificar a interface de partida (treino
// × torneio)".
//
// Achado real na investigação: a partida AO VIVO (LiveMatch.jsx) já era
// compartilhada entre treino (SimulationModal.jsx) e torneio
// (TournamentModal.jsx) desde o Hotfix 14.1 (mesma fórmula de altura de
// modal nos dois hosts, mesmo componente de placar/abas/narração). A
// divergência real estava na PREPARAÇÃO: só o treino tinha o bloco
// "Treinador ao vivo" (com o toggle "Permitir somente ajustes automáticos
// leves") e o seletor "Modo da partida" (Completa/Resumida/Momentos) — a
// preparação do torneio não tinha nenhum dos dois, e o "Modo da partida" do
// torneio, embora renderizado dentro do próprio LiveMatch.jsx compartilhado,
// era conectado a um `onDisplayModeChange={() => {}}` (no-op): clicar em
// "Resumida"/"Momentos" durante uma partida de torneio não tinha nenhum
// efeito.
//
// Correção: extraído MatchPreparationControls.jsx como o ÚNICO lugar onde
// esse bloco é escrito — usado por SimulationModal.jsx (preparação do
// treino) e TournamentModal.jsx (fase "playable" da preparação do torneio),
// nunca duplicado. TournamentModal.jsx ganhou um displayMode/setDisplayMode
// real (antes inexistente) e passou a repassar isso para o LiveMatch
// compartilhado, no lugar do no-op.
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
  console.log(`PASS — ${label}`);
}

const shared = read('src/components/matches/MatchPreparationControls.jsx');
const practice = read('src/components/matches/SimulationModal.jsx');
const tournament = read('src/components/tournaments/TournamentModal.jsx');
const liveMatch = read('src/components/matches/LiveMatch.jsx');

// ═══════════════ Fonte única da preparação compartilhada ═══════════════
{
  gate('MatchPreparationControls.jsx existe e contém o bloco "Treinador ao vivo"', shared.includes('Treinador ao vivo'));
  gate('MatchPreparationControls.jsx contém o toggle "Permitir somente ajustes automáticos leves"', shared.includes('Permitir somente ajustes automáticos leves'));
  gate('MatchPreparationControls.jsx contém o seletor "Modo da partida" (Completa/Resumida/Momentos)', shared.includes('Modo da partida') && shared.includes("'text', 'Completa'") && shared.includes("'summary', 'Resumida'") && shared.includes("'important', 'Momentos'"));

  // Nenhuma cópia duplicada: a string do toggle só pode existir no arquivo
  // compartilhado — se aparecer de novo em SimulationModal.jsx ou
  // TournamentModal.jsx, a extração falhou e o JSX foi apenas copiado.
  gate('SimulationModal.jsx NÃO duplica o JSX do toggle (usa o componente compartilhado)', !practice.includes('Permitir somente ajustes automáticos leves'));
  gate('TournamentModal.jsx NÃO duplica o JSX do toggle (usa o componente compartilhado)', !tournament.includes('Permitir somente ajustes automáticos leves'));
}

// ═══════════════ Treino: continua usando o componente compartilhado ═══════════════
{
  gate('SimulationModal.jsx importa MatchPreparationControls', practice.includes("import MatchPreparationControls from '@/components/matches/MatchPreparationControls.jsx';"));
  gate('SimulationModal.jsx renderiza <MatchPreparationControls', practice.includes('<MatchPreparationControls'));
  gate('SimulationModal.jsx repassa liveCoachSettings/displayMode reais (não hardcoded) para o componente compartilhado', practice.includes('liveCoachSettings={liveCoachSettings}') && practice.includes('displayMode={displayMode}'));
}

// ═══════════════ Torneio: ganhou o bloco que faltava, via o MESMO componente ═══════════════
{
  gate('TournamentModal.jsx importa MatchPreparationControls', tournament.includes("import MatchPreparationControls from '@/components/matches/MatchPreparationControls.jsx';"));
  gate('TournamentModal.jsx renderiza <MatchPreparationControls na fase "playable" (preparação imediatamente antes de jogar)', tournament.includes('<MatchPreparationControls'));
  gate('TournamentModal.jsx agora tem displayMode/setDisplayMode reais (antes não existia)', /const \[displayMode, setDisplayMode\] = useState\('text'\)/.test(tournament));
  gate('TournamentModal.jsx agora tem changeLiveCoachSettings real (antes só existia o estado, sem forma de alterá-lo)', tournament.includes('const changeLiveCoachSettings = useCallback'));
  gate('TournamentModal.jsx persiste live_coach_settings (mesmo padrão do treino, mesmo campo do PlayerProfile)', tournament.includes("live_coach_settings: next"));
}

// ═══════════════ O <LiveMatch> do torneio deixou de ser um no-op ═══════════════
{
  gate('TournamentModal.jsx NÃO passa mais onDisplayModeChange={() => {}} (no-op) para o LiveMatch', !tournament.includes('onDisplayModeChange={() => {}}'));
  gate('TournamentModal.jsx passa displayMode real para o LiveMatch compartilhado', /<LiveMatch[^>]*displayMode=\{displayMode\}/.test(tournament));
  gate('TournamentModal.jsx passa onDisplayModeChange={setDisplayMode} real para o LiveMatch compartilhado', /<LiveMatch[^>]*onDisplayModeChange=\{setDisplayMode\}/.test(tournament));
}

// ═══════════════ A partida AO VIVO em si já era (e continua sendo) um único componente ═══════════════
{
  gate('SimulationModal.jsx (treino) monta o LiveMatch compartilhado', practice.includes("import LiveMatch from '@/components/matches/LiveMatch';") && practice.includes('<LiveMatch'));
  gate('TournamentModal.jsx (torneio) monta o MESMO LiveMatch compartilhado', tournament.includes("import LiveMatch from '@/components/matches/LiveMatch';") && tournament.includes('<LiveMatch'));
  // Nenhum outro arquivo de partida ao vivo por trás — não deve existir uma
  // segunda implementação paralela do placar/abas/playback.
  gate('Não existe um LiveMatch alternativo importado por engano em nenhum dos dois hosts', !practice.includes('LiveMatchTournament') && !tournament.includes('LiveMatchPractice'));

  // Mesma fórmula de altura do modal nos dois hosts na fase de partida ao
  // vivo (Hotfix 14.1) — regressão vigiada: se um dos dois divergir de novo,
  // volta o corte de tela em telas maiores (1366×768/1440×900/1920×1080).
  const heightFormula = 'h-[calc(100dvh-1rem)] sm:h-[calc(100dvh-2rem)]';
  gate('SimulationModal.jsx usa a fórmula de altura unificada na fase ao vivo', practice.includes(heightFormula));
  gate('TournamentModal.jsx usa a MESMA fórmula de altura unificada na fase ao vivo', tournament.includes(heightFormula));
}

// ═══════════════ LiveMatch.jsx: cabeçalho/abas fixos, só o conteúdo rola, rodapé fixo ═══════════════
{
  gate('Raiz do LiveMatch usa coluna flexível com altura contida (nunca cresce além do modal)', liveMatch.includes("flex h-full min-h-0 max-h-full flex-col") && liveMatch.includes('overflow-hidden'));
  gate('Placar (CompactScoreboard) fica fixo no topo (shrink-0)', /<div className="shrink-0"><CompactScoreboard/.test(liveMatch));
  gate('Barra de abas (Jogo/Tática/Técnico/Ao vivo) fica fixa (shrink-0)', /grid shrink-0 grid-cols-4/.test(liveMatch));
  gate('Só a área de conteúdo (painel ativo) rola — min-h-0 flex-1 overflow-hidden', /min-h-0 flex-1 overflow-hidden rounded-2xl border/.test(liveMatch));
  gate('Controles de playback ficam fixos no rodapé (shrink-0)', /<div className="shrink-0">\s*<PlaybackControls/.test(liveMatch));
  gate('A narração (MatchFeed) rola internamente com overflow-y-auto, nunca a página inteira', liveMatch.includes('overflow-y-auto overscroll-contain'));
  gate('As 4 abas existem e são as mesmas nos dois contextos: Jogo/Tática/Técnico/Ao vivo', liveMatch.includes("label: 'Jogo'") && liveMatch.includes("label: 'Tática'") && liveMatch.includes("label: 'Técnico'") && liveMatch.includes("label: 'Ao vivo'"));
}

// ═══════════════ Toque móvel: alvos de ação com pelo menos 44px (min-h-11) ═══════════════
{
  gate('Botão principal de play/pause usa min-h-10 (piso de toque) dentro de PlaybackControls', liveMatch.includes('min-h-10 flex-1 rounded-xl'));
  gate('Ações do técnico (Aplicar/Manter plano/Parcial/Ouvir dupla) usam min-h-11 (44px, piso de toque)', liveMatch.includes('min-h-11 rounded-lg px-2 py-2'));
  gate('Botão "Iniciar Partida" do treino usa min-h-12 (48px)', practice.includes('min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary'));
  gate('Botão "Jogar" do torneio usa altura de toque equivalente (py-3, mesma família de padding do resto da preparação)', /onClick=\{startMatch\}[^>]*className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3/.test(tournament));
}

console.log(`\n${gates} gates executados, todos PASS — Match UI Unification (Fase 4: treino × torneio).`);
