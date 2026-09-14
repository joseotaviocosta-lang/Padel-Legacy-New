// Correção de layout — partida ao vivo (torneio): a faixa de tier e o
// RoundTimeline (~79px) eram renderizados incondicionalmente, inclusive
// durante phase==='match', competindo com a área de conteúdo de
// LiveMatch.jsx (narração/técnico/tática) que o hotfix 14.1 já havia
// liberado pro resto do modal. Achado durante um rediagnóstico desta mesma
// sessão — o bug original (modal ~665px, sobreposição do card pelo botão
// Aplicar) já estava corrigido; este é um achado menor e diferente,
// específico do host de torneio (SimulationModal/treino nunca teve esse
// chrome). Estrutural (regex sobre a fonte real), mesmo estilo de
// test-desktop-live-match-layout.mjs — sem browser disponível neste
// ambiente para medição visual ao vivo.
import { readFileSync } from 'node:fs';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const read = (path) => readFileSync(path, 'utf8');
const tournamentModal = read('src/components/tournaments/TournamentModal.jsx');

// ── Chrome escondido durante a partida (o próprio ganho de ~79px) ───────
gate('Faixa de tier só renderiza fora de phase===\'match\' (some durante o jogo)',
  /\{phase !== 'match' && \(\s*<div className="mb-3 flex shrink-0 items-center gap-2 text-xs font-black text-primary">/.test(tournamentModal));
gate('RoundTimeline só renderiza fora de phase===\'match\' (some durante o jogo)',
  /\{phase !== 'match' && run && <RoundTimeline run=\{run\} \/>\}/.test(tournamentModal));

// ── Informação preservada: tier + rodada migram pro cabeçalho do modal ──
// (custo de altura zero — o cabeçalho já tinha uma linha de descrição
// estática, "Campanha de torneio"; só o CONTEÚDO passa a ser contextual
// durante a partida, nenhum elemento novo é adicionado.)
gate('description do ModalShell é dinâmica: mostra rodada + tier durante phase===\'match\'',
  /description=\{phase === 'match' && currentMatch/.test(tournamentModal) &&
  /`\$\{currentMatch\.round\} · \$\{TIER_STYLES\[tournament\.tier\] \? tournament\.tier : 'Torneio oficial'\}`/.test(tournamentModal));
gate('Fora da partida, a descrição estática original "Campanha de torneio" continua o fallback (nenhuma fase perde a informação de contexto)',
  /: 'Campanha de torneio'\}/.test(tournamentModal));

// ── Fora da fase de match, nada mudou (preparação, entre rodadas, etc.) ──
gate('A condição usa phase !== \'match\' (não uma lista de fases específicas) — qualquer fase futura fora de match continua mostrando tier/RoundTimeline por padrão, sem precisar ser listada manualmente',
  (tournamentModal.match(/phase !== 'match'/g) || []).length >= 2);

// ── Nada da lógica de simulação/torneio foi tocado (fora do escopo pedido) ──
gate('Nenhuma referência a WorldTourLifecycle/circuitLifecycle/EntryManager foi adicionada a este arquivo (mudança é só de apresentação)',
  !/WorldTourLifecycle|circuitLifecycle|EntryManager/.test(tournamentModal));

// ── SimulationModal (treino) não tem — e não precisa ter — esse chrome ──
const simulationModal = read('src/components/matches/SimulationModal.jsx');
gate('SimulationModal (treino) nunca teve faixa de tier/RoundTimeline — a correção é só do host de torneio, onde o problema existia',
  !/RoundTimeline|TIER_STYLES/.test(simulationModal));

console.log(`\n${gates} gates executados, todos PASS — Chrome de tier/RoundTimeline escondido durante a partida (torneio), informação preservada no cabeçalho.`);
